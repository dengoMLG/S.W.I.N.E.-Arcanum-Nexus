#!/usr/bin/env node
// Мастер-сборщик и аудитор всех 10 новых 3D-моделей S.W.I.N.E. HD (5 Свиней + 5 Кроликов).
// Собирает normal / veteran / elite (.4d + .dxt + .obj + иконки 128×128 + .anif ролики),
// прогоняет swine-4d-orient.js check по всем 30 .4d, проверяет все 30 .dxt (349 584 Б)
// и рендерит проверочные скриншоты «как в игре» через tools/swine-view.js --cull 1.
//
// Запуск:
//   node tools/build-all-units.js              — полная сборка с 200-кадровыми .anif роликами
//   node tools/build-all-units.js --no-anif    — быстрая пересборка и аудит без рендера .anif
//   node tools/build-all-units.js --audit-only — аудит и свежие рендеры swine-view без пересборки
'use strict';
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const DXT = require('./swine-dxt');
const ANIF = require('./swine-anif');

const NO_ANIF = process.argv.includes('--no-anif');
const AUDIT_ONLY = process.argv.includes('--audit-only');
const ROOT = path.resolve(__dirname, '..');

const UNITS = [
  { id: 'd_hryakgrill',    race: 'pig',    title: 'Хряк-Гриль',       teamA: 'blue',   teamB: 'yellow' },
  { id: 'd_svinczar',      race: 'pig',    title: 'Свин-Царь',        teamA: 'yellow', teamB: 'red'    },
  { id: 'd_bombohryak',    race: 'pig',    title: 'Бомбохряк',        teamA: 'red',    teamB: 'blue'   },
  { id: 'd_osadnykaban',   race: 'pig',    title: 'Осадный Кабан',    teamA: 'blue',   teamB: 'green'  },
  { id: 'd_gryazemet',     race: 'pig',    title: 'Гряземёт',         teamA: 'blue',   teamB: 'yellow' },
  { id: 'ny_zayacprizrak', race: 'rabbit', title: 'Заяц-Призрак',     teamA: 'yellow', teamB: 'green'  },
  { id: 'ny_morkovsmerch', race: 'rabbit', title: 'Морковный Смерч',  teamA: 'yellow', teamB: 'red'    },
  { id: 'ny_krotoboy',     race: 'rabbit', title: 'Кротобой',         teamA: 'yellow', teamB: 'blue'   },
  { id: 'ny_pitstop',      race: 'rabbit', title: 'Пит-Стоп',         teamA: 'yellow', teamB: 'red'    },
  { id: 'ny_ushastik',     race: 'rabbit', title: 'Кролик-Ушастик',   teamA: 'yellow', teamB: 'green'  },
];

const env = { ...process.env };
if (NO_ANIF) env.SWINE_NO_ANIF = '1';
else delete env.SWINE_NO_ANIF;

let total4d = 0, bad4d = 0, badDxt = 0, badAnif = 0, badIcon = 0;

for (const u of UNITS) {
  const script = path.join(ROOT, 'tools/models', u.id + '.js');
  if (!AUDIT_ONLY) {
    const t0 = Date.now();
    process.stdout.write(`\n[${u.id}] ${u.title} ... `);
    execFileSync(process.execPath, [script], { env, cwd: ROOT, stdio: 'pipe' });
    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`built in ${sec}s`);
  } else {
    console.log(`\n[${u.id}] ${u.title} (audit)`);
  }

  const baseDir = path.join(ROOT, 'mods-test/units', u.id, 'gamedata/base/units/skinned');
  const menuDir = path.join(ROOT, 'mods-test/units', u.id, 'gamedata/base/menu/units');
  const prevDir = path.join(ROOT, 'mods-test/units', u.id, 'previews');

  let anifInfo = '';
  for (const lvl of ['normal', 'veteran', 'elite']) {
    const f4d = path.join(baseDir, `${u.id}_${lvl}.4d`);
    const fdxt = path.join(baseDir, `${u.id}_${lvl}.dxt`);
    const suffix = lvl === 'normal' ? '' : '_' + lvl;
    const ficon = path.join(menuDir, `${u.id}${suffix}.png`);
    const fanif = path.join(menuDir, `${u.id}${suffix}.anif`);
    total4d++;

    // 1) Проверка .4d: 0 вывернутых граней
    try {
      execFileSync(process.execPath, [path.join(ROOT, 'tools/swine-4d-orient.js'), 'check', f4d], { cwd: ROOT, stdio: 'pipe' });
    } catch (e) {
      bad4d++;
      console.error(`  FAIL orient: ${f4d}`);
    }

    // 2) Проверка .dxt: 512x512 DXT5, 10 mip-уровней, rest=0, 349584 Б
    try {
      const t = DXT.read(fdxt);
      if (t.W !== 512 || t.H !== 512 || t.fourcc !== 'DXT5' || t.levels.length !== 10 || t.rest !== 0 || t.fileSize !== 349584) {
        badDxt++;
        console.error(`  FAIL dxt: ${fdxt} (${t.W}x${t.H} ${t.fourcc} mips=${t.levels.length} rest=${t.rest} size=${t.fileSize})`);
      }
    } catch (e) {
      badDxt++;
      console.error(`  FAIL dxt read: ${fdxt}: ${e.message}`);
    }

    // 3) Проверка иконки 128x128 PNG
    try {
      const pb = fs.readFileSync(ficon);
      const pw = pb.readUInt32BE(16), ph = pb.readUInt32BE(20);
      if (pw !== 128 || ph !== 128) {
        badIcon++;
        console.error(`  FAIL icon: ${ficon} (${pw}x${ph})`);
      }
    } catch (e) {
      badIcon++;
      console.error(`  FAIL icon read: ${ficon}: ${e.message}`);
    }

    // 4) Проверка .anif: ANI2 496x368 x 200 кадров
    try {
      const a = ANIF.read(fanif);
      if (a.w !== 496 || a.h !== 368 || a.frames !== 200) {
        badAnif++;
        console.error(`  FAIL anif: ${fanif} (${a.tag} ${a.w}x${a.h} x${a.frames})`);
      } else if (lvl === 'normal') {
        anifInfo = `${a.tag} ${a.w}x${a.h}x${a.frames} (${(fs.statSync(fanif).size / 1024).toFixed(0)} KB)`;
      }
    } catch (e) {
      badAnif++;
      console.error(`  FAIL anif read: ${fanif}: ${e.message}`);
    }
  }

  // Проверочные рендеры «как в игре» с --cull 1 (Normal в teamA и Elite в teamB!)
  execFileSync(process.execPath, [
    path.join(ROOT, 'tools/swine-view.js'),
    path.join(baseDir, `${u.id}_normal.4d`),
    path.join(prevDir, `gameview_normal_${u.teamA}.png`),
    '--cull', '1', '--team', u.teamA, '--yaw', '2.35', '--pitch', '0.45',
  ], { cwd: ROOT, stdio: 'pipe' });

  execFileSync(process.execPath, [
    path.join(ROOT, 'tools/swine-view.js'),
    path.join(baseDir, `${u.id}_elite.4d`),
    path.join(prevDir, `gameview_elite_${u.teamB}.png`),
    '--cull', '1', '--team', u.teamB, '--yaw', '2.35', '--pitch', '0.45',
  ], { cwd: ROOT, stdio: 'pipe' });

  console.log(`  OK: 3x .4d (0 inverted), 3x .dxt (512x512 DXT5 10 mips), 3x icon (128x128), 3x .anif (${anifInfo})`);
}

console.log(`\n═══════════════════════════════════════════════════════════════════`);
console.log(`AUDIT SUMMARY: ${total4d} variants checked | 4d: ${bad4d} err | dxt: ${badDxt} err | icon: ${badIcon} err | anif: ${badAnif} err`);
console.log(`═══════════════════════════════════════════════════════════════════`);
if (bad4d || badDxt || badIcon || badAnif) process.exit(1);

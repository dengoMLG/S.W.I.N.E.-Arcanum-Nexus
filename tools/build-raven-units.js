#!/usr/bin/env node
// Мастер-сборщик и аудитор всех 14 3D-моделей Корпуса Воронов (Пернатый Авиакорпус — v_*).
// 9 базовых боевых машин (аналоги ванили) + 5 уникальных машин Arcanum = 14 моделей × 3 уровня = 42 варианта!
//
// Запуск:
//   node tools/build-raven-units.js              — полная сборка с 200-кадровыми .anif роликами (4 потока)
//   node tools/build-raven-units.js --no-anif    — быстрая пересборка и аудит без рендера .anif
//   node tools/build-raven-units.js --audit-only — аудит и свежие рендеры swine-view без пересборки
'use strict';
const fs = require('fs'), path = require('path');
const { execFileSync, spawn } = require('child_process');
const DXT = require('./swine-dxt');
const ANIF = require('./swine-anif');

const NO_ANIF = process.argv.includes('--no-anif');
const AUDIT_ONLY = process.argv.includes('--audit-only');
const JOBS = Number(process.env.RAVEN_JOBS || 4);
const ROOT = path.resolve(__dirname, '..');

const UNITS = [
  // 9 основных боевых машин (аналоги ванильной линейки)
  { id: 'v_dzsip',       code: 'V-01', title: 'Стриж (Разведчик)',           teamA: 'blue',   teamB: 'red'    },
  { id: 'v_pancelkocsi', code: 'V-02', title: 'Ястреб-ЗУ (Броневик ПВО)',    teamA: 'blue',   teamB: 'yellow' },
  { id: 'v_tank',        code: 'V-03', title: 'Беркут (Основной танк)',      teamA: 'blue',   teamB: 'red'    },
  { id: 'v_loveg',       code: 'V-04', title: 'Гриф (Авиа-гаубица)',         teamA: 'blue',   teamB: 'green'  },
  { id: 'v_vadasz',      code: 'V-05', title: 'Сокол-ПТ (Истребитель ПТУР)', teamA: 'red',    teamB: 'blue'   },
  { id: 'v_raketas',     code: 'V-06', title: 'Коршун (Авиа-РСЗО)',          teamA: 'blue',   teamB: 'yellow' },
  { id: 'v_mozsar',      code: 'V-07', title: 'Филин (Авиабомбомёт)',        teamA: 'blue',   teamB: 'red'    },
  { id: 'v_aknarako',    code: 'V-08', title: 'Дятел (Авиа-минёр)',          teamA: 'yellow', teamB: 'blue'   },
  { id: 'v_movingforce', code: 'V-09', title: 'Альбатрос (Авианосец)',       teamA: 'blue',   teamB: 'red'    },
  { id: 'v_vontato',     code: 'V-10', title: 'Скворец (Авиабуксир-тягач)',  teamA: 'yellow', teamB: 'blue'   },
  // 5 уникальных машин Arcanum Корпуса Воронов
  { id: 'v_sokolzrk',    code: 'A-1',  title: 'Сапсан-ЗРК (Комплекс ПВО)',   teamA: 'blue',   teamB: 'green'  },
  { id: 'v_ekranoplan',  code: 'A-2',  title: 'Буревестник (Экраноплан)',    teamA: 'red',    teamB: 'blue'   },
  { id: 'v_sova',        code: 'A-3',  title: 'Сова-ДРЛО (Радар AWACS)',     teamA: 'blue',   teamB: 'yellow' },
  { id: 'v_korshunkam',  code: 'A-4',  title: 'Пикировщик (Дрон-брандер)',   teamA: 'red',    teamB: 'yellow' },
  { id: 'v_kondor',      code: 'A-5',  title: 'Кондор (Тяжёлый бомбовоз)',   teamA: 'blue',   teamB: 'red'    },
];

const env = { ...process.env };
if (NO_ANIF) env.SWINE_NO_ANIF = '1';
else delete env.SWINE_NO_ANIF;

function runModel(u) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const script = path.join(ROOT, 'tools/models', u.id + '.js');
    const child = spawn(process.execPath, [script], { env, cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    child.stderr.on('data', d => err += d);
    child.on('close', code => {
      if (code !== 0) return reject(new Error(`${u.id} failed (${code}): ${err}`));
      const sec = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`  built [${u.id}] ${u.code} ${u.title} in ${sec}s`);
      resolve();
    });
  });
}

async function main() {
  if (!AUDIT_ONLY) {
    console.log(`Building ${UNITS.length} Raven units (${NO_ANIF ? 'fast --no-anif' : 'FULL 200-frame ANIF'}, ${JOBS} workers)...`);
    const queue = [...UNITS];
    const workers = Array.from({ length: Math.min(JOBS, UNITS.length) }, async () => {
      while (queue.length) await runModel(queue.shift());
    });
    await Promise.all(workers);
  }

  let total4d = 0, bad4d = 0, badDxt = 0, badAnif = 0, badIcon = 0;
  for (const u of UNITS) {
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

      try { execFileSync(process.execPath, [path.join(ROOT, 'tools/swine-4d-orient.js'), 'check', f4d], { cwd: ROOT, stdio: 'pipe' }); }
      catch { bad4d++; console.error(`  FAIL orient: ${f4d}`); }

      try {
        const t = DXT.read(fdxt);
        if (t.W !== 512 || t.H !== 512 || t.fourcc !== 'DXT5' || t.levels.length !== 10 || t.rest !== 0 || t.fileSize !== 349584) {
          badDxt++; console.error(`  FAIL dxt: ${fdxt}`);
        }
      } catch (e) { badDxt++; console.error(`  FAIL dxt read: ${fdxt}: ${e.message}`); }

      try {
        const pb = fs.readFileSync(ficon);
        if (pb.readUInt32BE(16) !== 128 || pb.readUInt32BE(20) !== 128) { badIcon++; console.error(`  FAIL icon: ${ficon}`); }
      } catch (e) { badIcon++; console.error(`  FAIL icon read: ${ficon}: ${e.message}`); }

      try {
        const a = ANIF.read(fanif);
        if (a.w !== 496 || a.h !== 368 || a.frames !== 200) { badAnif++; console.error(`  FAIL anif: ${fanif}`); }
        else if (lvl === 'normal') anifInfo = `${a.tag} ${a.w}x${a.h}x${a.frames} (${(fs.statSync(fanif).size / 1024).toFixed(0)} KB)`;
      } catch (e) { badAnif++; console.error(`  FAIL anif read: ${fanif}: ${e.message}`); }
    }

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

    console.log(`  OK [${u.id}] ${u.code}: 3x .4d (0 inv), 3x .dxt, 3x icon, 3x .anif (${anifInfo})`);
  }

  console.log(`\n═══════════════════════════════════════════════════════════════════`);
  console.log(`RAVEN AUDIT: ${total4d} variants checked | 4d: ${bad4d} err | dxt: ${badDxt} err | icon: ${badIcon} err | anif: ${badAnif} err`);
  console.log(`═══════════════════════════════════════════════════════════════════`);
  if (bad4d || badDxt || badIcon || badAnif) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });

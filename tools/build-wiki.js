#!/usr/bin/env node
// Збірка вікі мод-паку.
//   node tools/build-wiki.js [--no-launcher]
//
// modpack/wiki/wiki.src.json → modpack/out/wiki.json (викладається на CDN як
// /launcher/games/swine/wiki.json) і копія в лаунчер Assets/swine_wiki.json.
//
// Що робить:
//   - перевіряє вихідник: унікальні id, відомі типи блоків, тексти ru/uk/en у кожному полі;
//   - прибирає групи модів, яких немає в modpack/pack.json (поле group.mod), разом з їхніми сторінками;
//   - ставить version/updated з пака й додає блок pack (версія, моди, розмір завантаження з modpack/out/modpack.json);
//   - розгортає блоки unitDiff у таблиці (type: "table") з units.ini моду проти оригіналу гри.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'modpack/wiki/wiki.src.json');
const PACK = path.join(ROOT, 'modpack/pack.json');
const MANIFEST = path.join(ROOT, 'modpack/out/modpack.json');
const OUT = path.join(ROOT, 'modpack/out/wiki.json');
const LAUNCHER_ASSET = 'A:/Arcanum/Launcher/Arcanum-Launcher/arcanum_vs_launcher/src/ArcanumVSLauncher/Assets/swine_wiki.json';
const VANILLA_INI = path.join(ROOT, '_extracted/base/units.ini');
const LANGS = ['ru', 'uk', 'en'];
const BLOCKS = {
  heading: ['text'], paragraph: ['text'], bullets: ['items'], facts: ['facts'],
  callout: ['text'], unitDiff: ['side', 'mod'], table: ['columns', 'rows'],
};

const errors = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);

function checkText(where, t) {
  if (!t || typeof t !== 'object') return err(where, 'нема тексту');
  for (const l of LANGS) if (typeof t[l] !== 'string' || !t[l].trim()) err(where, `нема мови ${l}`);
}

function parseIni(text) {
  const res = {}; let cur = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split(';')[0].trim();
    if (!line) continue;
    const m = /^\[(.+)\]$/.exec(line);
    if (m) { cur = res[m[1].trim()] = {}; continue; }
    const eq = line.indexOf('=');
    if (cur && eq > 0) cur[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return res;
}

// unitDiff → таблиця: розділи сторони (Diszno/Nyul), що змінені або нові в моді.
function unitDiffTable(block, where) {
  const modIni = path.join(partDir.get(block.mod) || path.join(ROOT, 'modpack/mods', block.mod), 'gamedata/base/units.ini');
  if (!fs.existsSync(modIni)) { err(where, `unitDiff: нема ${path.relative(ROOT, modIni)}`); return null; }
  const mod = parseIni(fs.readFileSync(modIni, 'latin1'));
  const van = fs.existsSync(VANILLA_INI) ? parseIni(fs.readFileSync(VANILLA_INI, 'latin1')) : {};
  const prefix = block.side === 'pig' ? 'Diszno ' : (block.side === 'raven' ? 'Varju ' : 'Nyul ');
  const keys = ['Price', 'HitPoint', 'Damage', 'MaxRange', 'ReloadTime', 'Ammo', 'Armor', 'Speed'];
  const rows = [];
  for (const [sec, kv] of Object.entries(mod)) {
    if (!sec.startsWith(prefix)) continue;
    const v = van[sec];
    const cells = keys.map(k => {
      const now = kv[k] ?? '';
      const was = v ? (v[k] ?? '') : '';
      return v && was !== now ? `${was} → ${now}` : now;
    });
    if (v && keys.every(k => (v[k] ?? '') === (kv[k] ?? ''))) continue;
    rows.push([sec.slice(prefix.length), ...cells]);
  }
  const col = (ru, uk, en) => ({ ru, uk, en });
  return {
    type: 'table',
    columns: [col('Юнит', 'Юніт', 'Unit'), col('Цена', 'Ціна', 'Price'), col('Живучесть', 'Живучість', 'HP'),
      col('Урон', 'Шкода', 'Damage'), col('Дальность', 'Дальність', 'Range'), col('Перезарядка', 'Перезаряджання', 'Reload'),
      col('Боезапас', 'Боєзапас', 'Ammo'), col('Броня', 'Броня', 'Armour'), col('Скорость', 'Швидкість', 'Speed')],
    rows,
  };
}

const src = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const pack = JSON.parse(fs.readFileSync(PACK, 'utf8'));
const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : null;
// Один мод може складатися з кількох тек ("sources", напр. arcanum-nexus = arcanum-units + arcanum-voices).
// Групи й unitDiff можуть посилатися і на мод, і на теку-частину (ім'я теки).
const partDir = new Map();
for (const m of pack.mods) for (const rel of m.sources || (m.source ? [m.source] : [])) {
  const dir = path.resolve(path.dirname(PACK), rel);
  partDir.set(path.basename(dir), dir); if (!partDir.has(m.id)) partDir.set(m.id, dir);
}
const modIds = new Set([...pack.mods.map(m => m.id), ...partDir.keys()]);

checkText('title', src.title);
const groupIds = new Set();
for (const g of src.groups) {
  if (groupIds.has(g.id)) err(`group ${g.id}`, 'повторний id');
  groupIds.add(g.id);
  checkText(`group ${g.id}`, g.title);
}
const dropped = new Set(src.groups.filter(g => g.mod && !modIds.has(g.mod)).map(g => g.id));

const pageIds = new Set();
const pages = [];
for (const p of src.pages) {
  const where = `page ${p.id}`;
  if (pageIds.has(p.id)) err(where, 'повторний id');
  pageIds.add(p.id);
  if (!groupIds.has(p.group)) err(where, `нема групи ${p.group}`);
  checkText(`${where}.title`, p.title);
  checkText(`${where}.summary`, p.summary);
  const blocks = [];
  (p.blocks || []).forEach((b, i) => {
    const bw = `${where}[${i}] ${b.type}`;
    const need = BLOCKS[b.type];
    if (!need) return err(bw, 'невідомий тип блоку');
    for (const k of need) if (b[k] === undefined) err(bw, `нема поля ${k}`);
    if (b.type === 'heading' || b.type === 'paragraph' || b.type === 'callout') checkText(bw, b.text);
    if (b.type === 'callout' && b.title) checkText(`${bw}.title`, b.title);
    if (b.type === 'bullets') (b.items || []).forEach((t, j) => checkText(`${bw}.items[${j}]`, t));
    if (b.type === 'facts') (b.facts || []).forEach((f, j) => {
      if (f.value === undefined || f.value === '') err(`${bw}.facts[${j}]`, 'нема value');
      checkText(`${bw}.facts[${j}].label`, f.label);
    });
    if (b.type === 'unitDiff') {
      if (dropped.has(p.group) || !modIds.has(b.mod)) return;
      const t = unitDiffTable(b, bw);
      if (t) blocks.push(t);
      return;
    }
    const { key, ...rest } = b; // key — службова мітка для генераторів, у лаунчер не йде
    blocks.push(rest);
  });
  if (!dropped.has(p.group)) pages.push({ ...p, blocks });
}

if (errors.length) {
  console.error(`wiki: ${errors.length} помилок у ${path.relative(ROOT, SRC)}`);
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}

const out = {
  schema: 1,
  version: pack.version,
  updated: src.updated,
  title: src.title,
  pack: {
    id: pack.id,
    version: pack.version,
    mods: pack.mods.map(m => ({ id: m.id, name: m.name, version: String(m.version ?? pack.version) })),
    size: manifest ? manifest.mods.reduce((a, m) => a + (m.size || 0), 0) : null,
  },
  groups: src.groups.filter(g => !dropped.has(g.id)).map(({ mod, ...g }) => g),
  pages,
};
// Порожні групи не показуємо.
out.groups = out.groups.filter(g => pages.some(p => p.group === g.id));

const json = JSON.stringify(out, null, 2) + '\n';
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, json);
console.log(`wiki v${out.version}: ${out.groups.length} groups, ${pages.length} pages → ${path.relative(ROOT, OUT)}` +
  (dropped.size ? ` (без груп: ${[...dropped].join(', ')})` : ''));

if (!process.argv.includes('--no-launcher')) {
  if (fs.existsSync(path.dirname(LAUNCHER_ASSET))) {
    fs.writeFileSync(LAUNCHER_ASSET, json);
    console.log(`  → ${LAUNCHER_ASSET}`);
  } else {
    console.log('  лаунчер не знайдено, копію в Assets пропущено');
  }
}

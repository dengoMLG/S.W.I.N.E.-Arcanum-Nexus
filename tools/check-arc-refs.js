#!/usr/bin/env node
// Перевірка мода Arcanum Units: кожен файл, на який посилаються наші units.ini і effects.ini, має бути в моді або
// в base.pak гри. Значення, які вже є в ванільних units.ini/effects.ini, гра й так знаходить — їх не перевіряємо.
//   node tools/check-arc-refs.js [mod-dir]     (типово mods-test/arcunits; код виходу 1, якщо чогось бракує)
// Правила (з того, як гра зберігає ванільні юніти в base.pak):
//   Model  units\skinned\X  → units/skinned/X_{normal,elite,veteran}.{4d,dxt}
//   Model  projectiles\X.4d → projectiles/X.4d
//   Icon   X                → menu/units/X{,_elite,_veteran}.png
//   *Sound a/b.wav          → sounds/a/b.wav
//   effects.ini Texture X.tga → effects/X.dxt; наземний ефект (EffectType 2) — ще й effects/tileset_*/X.dxt:
//     гра вантажить його з папки тайлсету карти (виліт Гряземета 23.11.2026 на «tileset_normal»).
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const MOD = path.resolve(process.argv[2] || path.join(ROOT, 'mods-test/arcunits'), 'gamedata/base');
const PAK = 'A:/SteamLibrary/steamapps/common/SWINE HD Remaster/gamedata/base/base.pak';
const TILESETS = ['desert', 'jungle', 'normal', 'rock', 'snow'];

// Індекс base.pak: імена (нижній регістр) і читання запису (як у make-arc-assets.js).
function pakIndex(pakPath) {
  const fd = fs.openSync(pakPath, 'r'), h = Buffer.alloc(16); fs.readSync(fd, h, 0, 16, 0);
  const isz = h.readUInt32LE(12), ib = Buffer.alloc(isz); fs.readSync(fd, ib, 0, isz, 16);
  let p = 0, prev = ''; const par = {}, ents = new Map();
  while (p < isz) {
    const pre = ib[p], nl = ib[p + 1], src = (p in par) ? par[p] : prev;
    const name = src.slice(0, pre) + ib.toString('latin1', p + 2, p + 2 + nl), q = p + 2 + nl;
    const C = ib.readUInt32LE(q + 9); if (C) par[C] = name;
    ents.set(name.toLowerCase(), { off: 16 + isz + ib.readUInt32LE(q), size: ib.readUInt32LE(q + 4) });
    prev = name; p = q + 13;
  }
  return { has: n => ents.has(n), read: n => { const e = ents.get(n), b = Buffer.alloc(e.size); fs.readSync(fd, b, 0, e.size, e.off); return b; } };
}
const pak = pakIndex(PAK);
const modFiles = new Set();
(function walk(d) { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : modFiles.add(path.relative(MOD, p).split(path.sep).join('/').toLowerCase()); } })(MOD);
const exists = f => modFiles.has(f) || pak.has(f);

const parse = t => { const o = {}; let cur = null;
  for (const l of t.split(/\r?\n/)) { const m = l.match(/^\[([^\]]+)\]/); if (m) { cur = m[1]; o[cur] = o[cur] || {}; continue; }
    const kv = l.match(/^\s*([^=;]+?)\s*=\s*(.*?)\s*$/); if (kv && cur) o[cur][kv[1].trim()] = kv[2]; }
  return o; };
const norm = v => v.toLowerCase().split('\\').join('/').replace(/^\.?\//, '');
const vanillaVals = ini => { const s = new Set(); for (const sec of Object.values(ini)) for (const [k, v] of Object.entries(sec)) s.add(k.toLowerCase() + '=' + norm(v)); return s; };

const missing = []; let checked = 0;
const need = (what, files) => { checked++; const miss = files.filter(f => !exists(f)); if (miss.length) missing.push(`${what}: ${miss.join(', ')}`); };

// units.ini
{
  const van = parse(pak.read('units.ini').toString('latin1')), vv = vanillaVals(van);
  const mod = parse(fs.readFileSync(path.join(MOD, 'units.ini'), 'latin1'));
  for (const [sec, keys] of Object.entries(mod)) for (const [k, raw] of Object.entries(keys)) {
    const key = k.toLowerCase(), v = norm(raw); if (!v || vv.has(key + '=' + v)) continue;
    if (key === 'model' && v.startsWith('units/skinned/'))
      need(`[${sec}] Model ${raw}`, ['normal', 'elite', 'veteran'].flatMap(l => [`${v}_${l}.4d`, `${v}_${l}.dxt`]));
    else if (key === 'model') need(`[${sec}] Model ${raw}`, [v.endsWith('.4d') ? v : v + '.4d']);
    else if (key === 'icon') need(`[${sec}] Icon ${raw}`, ['', '_elite', '_veteran'].map(l => `menu/units/${v}${l}.png`));
    else if (/sound$/.test(key)) need(`[${sec}] ${k} ${raw}`, [`sounds/${v}`]);
  }
}
// effects.ini (наш — оригінал + додані секції)
{
  const van = parse(pak.read('effects.ini').toString('latin1'));
  const mod = parse(fs.readFileSync(path.join(MOD, 'effects.ini'), 'latin1'));
  for (const [sec, keys] of Object.entries(mod)) {
    if (van[sec]) continue;
    const tex = keys.Texture; if (!tex) continue;
    const base = 'effects/' + norm(tex).replace(/\.tga$/, '.dxt');
    const files = [base];
    if (keys.EffectType === '2') for (const t of TILESETS) files.push(base.replace('effects/', `effects/tileset_${t}/`));
    need(`effects.ini [${sec}] Texture ${tex}`, files);
  }
}
// Наші .wav: SWave::LoadWAV (0x481e80) читає RIFF/WAVEfmt, PCM, і одразу після fmt чекає «data» —
// інакше мовчки не вантажить (Хряк-Гриль без звуку, #9). Чанк LIST від ffmpeg перед data ламає звук.
for (const f of modFiles) if (f.endsWith('.wav')) {
  checked++; const b = fs.readFileSync(path.join(MOD, f));
  const ok = b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 16) === 'WAVEfmt ' && b.readUInt16LE(20) === 1 &&
    b.toString('latin1', 20 + b.readUInt32LE(16), 24 + b.readUInt32LE(16)) === 'data';
  if (!ok) missing.push(`${f}: WAV must be PCM with "data" right after "fmt " (no LIST chunk)`);
}
console.log(`check-arc-refs: ${checked} new references checked in ${path.relative(ROOT, MOD) || MOD}`);
if (missing.length) { console.error('MISSING:\n  ' + missing.join('\n  ')); process.exit(1); }
console.log('all present');

#!/usr/bin/env node
// Збирає мод-пак S.W.I.N.E. для лаунчера Arcanum.
//
//   node tools/build-modpack.js [modpack/pack.json] [out-dir]
//
// pack.json:
//   { "id": "arcanum-swine", "name": "...", "version": "2",
//     "baseUrl": "https://arcanum-nexus.com/launcher/games/swine/mods/",
//     "mods": [
//       { "id": "full-rebalance", "name": "...", "version": "1.0", "author": "...",
//         "url": "https://...zip", "sha256": "...", "size": 123 },        // готовий zip на CDN
//       { "id": "my-mod", "name": "...", "version": "1", "author": "...",
//         "source": "mods/my-mod" },                                     // тека з gamedata/...
//       { "id": "arcanum-nexus", "name": "...", "author": "...",          // версія = версія паку
//         "sources": ["mods/a", "mods/b"] }                              // кілька тек → один zip (файли не перетинаються)
//     ] }
//
// Версія (правило: БУДЬ-ЯКА зміна вмісту → нова версія в pack.json, див. CLAUDE.md):
//   modpack/version-lock.json пам'ятає {version, sha256} кожного мода. Якщо zip змінився, а версія та сама —
//   збірка зупиняється. Нова версія → lock оновлюється. Версія з exe_patch.json (рядок у меню гри) має
//   збігатися з версією мода, інакше теж зупинка: спершу перезібрати exe (patchgen бере її з pack.json).
//
// Для модів із "source" пакує теку в детермінований zip (фіксовані дати й порядок —
// однаковий вміст дає однаковий sha256), рахує sha256/розмір і пише
// <out>/mods/<id>-<version>.zip та <out>/modpack.json. Ці файли викладаються на CDN
// у /launcher/games/swine/ (modpack.json) і /launcher/games/swine/mods/ (zip).
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib'), crypto = require('crypto');

const posArgs = process.argv.slice(2).filter(a => !a.startsWith('--'));
const syncLauncher = process.argv.includes('--sync-launcher');
const LAUNCHER_MODPACK_CS = 'A:/Arcanum/Launcher/Arcanum-Launcher/arcanum_vs_launcher/src/ArcanumVSLauncher/Services/SwineModpack.cs';
const packFile = path.resolve(posArgs[0] || path.join(__dirname, '..', 'modpack', 'pack.json'));
const outDir = path.resolve(posArgs[1] || path.join(path.dirname(packFile), 'out'));
const pack = JSON.parse(fs.readFileSync(packFile, 'utf8'));
const ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const LOCK = path.join(path.dirname(packFile), 'version-lock.json');
const lock = fs.existsSync(LOCK) ? JSON.parse(fs.readFileSync(LOCK, 'utf8')) : {};

function fail(msg) { console.error('ERROR: ' + msg); process.exit(1); }

// ── CRC32 + мінімальний zip writer (deflate, дата 1980-01-01) ──
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = b => { let c = 0xFFFFFFFF; for (const x of b) c = CRC[(c ^ x) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };

function zip(files) { // files: [{name, data}]
  const parts = [], central = []; let off = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8'), comp = zlib.deflateRawSync(f.data, { level: 9 }), crc = crc32(f.data);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6);
    h.writeUInt16LE(8, 8); h.writeUInt16LE(0, 10); h.writeUInt16LE(0x21, 12); h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(f.data.length, 22); h.writeUInt16LE(name.length, 26); h.writeUInt16LE(0, 28);
    parts.push(h, name, comp);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8);
    c.writeUInt16LE(8, 10); c.writeUInt16LE(0, 12); c.writeUInt16LE(0x21, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(comp.length, 20);
    c.writeUInt32LE(f.data.length, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(off, 42);
    central.push(c, name); off += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(central), e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10);
  e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, e]);
}

function walk(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p, base) : [path.relative(base, p).split(path.sep).join('/')];
  });
}

// Та сама граматика, що й SwineIniPatch.cs — ловимо помилки до публікації.
function checkPatch(name, text) {
  let inSection = false;
  text.replace(/^﻿/, '').split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/;.*$/, '').trim();
    if (!line) return;
    if (line.startsWith('[')) { if (!/^\[.+\]$/.test(line)) fail(`${name}:${i + 1}: bad section header`); inSection = true; return; }
    if (!inSection) fail(`${name}:${i + 1}: key outside of a section`);
    if (!line.startsWith('-') && !/^[^=]+=/.test(line)) fail(`${name}:${i + 1}: expected 'Key = Value'`);
  });
}

// exe_patch.json (tools/re/patchgen): лаунчер застосовує його до swineHD.exe. Перевіряємо форму, щоб не викласти битий.
function checkExePatch(id, p) {
  const hex = /^[0-9A-F]*$/i, sha = /^[0-9a-f]{64}$/;
  if (p.schema !== 1 || p.file !== 'swineHD.exe' || !sha.test(p.originalSha256) || !sha.test(p.patchedSha256)) fail(`${id}: exe_patch.json: schema/file/sha`);
  for (const e of [...p.header, ...p.edits]) if (!(e.offset >= 0) || !hex.test(e.old) || !hex.test(e.new) || e.old.length !== e.new.length) fail(`${id}: exe_patch.json: bad edit at ${e.offset}`);
  if (!(p.appendAt > 0) || typeof p.append !== 'string' || !(p.patchedSize > p.appendAt)) fail(`${id}: exe_patch.json: append`);
}

if (!ID.test(pack.id || '') || !pack.version || !Array.isArray(pack.mods) || !pack.mods.length) fail('pack.json: id/version/mods required');
fs.mkdirSync(path.join(outDir, 'mods'), { recursive: true });
const seen = new Set(), mods = [];
for (const m of pack.mods) {
  if (m.version == null && (m.sources || m.source)) m.version = pack.version;
  if (!ID.test(m.id || '') || !ID.test(String(m.version || '')) || !m.name) fail(`mod ${m.id}: id/name/version required`);
  if (seen.has(m.id)) fail('duplicate mod id ' + m.id); seen.add(m.id);
  const entry = { id: m.id, name: m.name, version: String(m.version), author: m.author || '' };
  if (m.source || m.sources) {
    const from = new Map();   // ім'я в zip → файл на диску
    for (const rel of m.sources || [m.source]) {
      const src = path.resolve(path.dirname(packFile), rel);
      const own = walk(src).filter(n => !n.endsWith('.md'));
      if (!own.length) fail(`${m.id}: ${src} is empty`);
      for (const n of own) { if (from.has(n)) fail(`${m.id}: ${n} is in two sources`); from.set(n, path.join(src, n)); }
    }
    const names = [...from.keys()].sort();
    for (const n of names) {
      if (n === 'exe_patch.json') {
        const p = JSON.parse(fs.readFileSync(from.get(n), 'utf8')); checkExePatch(m.id, p);
        if (m.sources && p.modVersion !== entry.version) fail(`${m.id}: exe_patch.json is for v${p.modVersion}, mod is v${entry.version} — rebuild the exe (tools/re/bin-patchgen/patchgen.exe …)`);
        continue;
      }
      if (!n.startsWith('gamedata/') || n.includes('..')) fail(`${m.id}: ${n} must be under gamedata/`);
      if (n.endsWith('.arcpatch')) checkPatch(`${m.id}/${n}`, fs.readFileSync(from.get(n), 'latin1'));
    }
    const data = zip(names.map(n => ({ name: n, data: fs.readFileSync(from.get(n)) })));
    const sha = crypto.createHash('sha256').update(data).digest('hex'), was = lock[m.id];
    if (was && was.sha256 !== sha && was.version === entry.version)
      fail(`${m.id}: content changed but version is still ${entry.version} — bump "version" in modpack/pack.json (and rebuild the exe)`);
    lock[m.id] = { version: entry.version, sha256: sha };
    const file = `${m.id}-${entry.version}.zip`;
    fs.writeFileSync(path.join(outDir, 'mods', file), data);
    Object.assign(entry, { url: pack.baseUrl.replace(/\/?$/, '/') + file,
      sha256: sha, size: data.length });
    console.log(`  ${m.id} ${entry.version}: ${names.length} files → mods/${file} (${data.length} B)`);
  } else {
    if (!/^https:\/\//.test(m.url || '') || !/^[0-9a-f]{64}$/.test(m.sha256 || '') || !(m.size > 0)) fail(`${m.id}: url/sha256/size required`);
    Object.assign(entry, { url: m.url, sha256: m.sha256, size: m.size });
    console.log(`  ${m.id} ${entry.version}: external ${m.url}`);
  }
  mods.push(entry);
}
// Схема 2: пак з exe_patch.json — лаунчери до 0.7.23.8 (лише схема 1) його відкидають і лишаються на старому паку.
const manifest = { schema: 2, id: pack.id, name: pack.name || pack.id, version: String(pack.version), mods };
fs.writeFileSync(path.join(outDir, 'modpack.json'), JSON.stringify(manifest, null, 2) + '\n');
for (const id of Object.keys(lock)) if (!seen.has(id)) delete lock[id];
fs.writeFileSync(LOCK, JSON.stringify(lock, null, 2) + '\n');
console.log(`pack ${pack.id} v${pack.version}:${mods.length} mods → ${path.join(outDir, 'modpack.json')}`);

if (syncLauncher) {
  if (!fs.existsSync(LAUNCHER_MODPACK_CS)) {
    console.log('  лаунчер не знайдено, синхронізацію SwineModpack.cs пропущено');
  } else {
    const cs = fs.readFileSync(LAUNCHER_MODPACK_CS, 'utf8');
    const esc = s => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const entries = mods.map(m => [
      '            new ModEntry',
      '            {',
      `                Id = "${esc(m.id)}",`,
      `                Name = "${esc(m.name)}",`,
      `                Version = "${esc(m.version)}",`,
      `                Author = "${esc(m.author)}",`,
      `                Url = "${esc(m.url)}",`,
      `                Sha256 = "${esc(m.sha256)}",`,
      `                Size = ${m.size},`,
      '            },',
    ].join('\n')).join('\n');
    const replacement = [
      '    public static Manifest BuiltIn() => new()',
      '    {',
      `        Id = "${esc(manifest.id)}",`,
      `        Name = "${esc(manifest.name)}",`,
      `        Version = "${esc(manifest.version)}",`,
      '        Mods =',
      '        {',
      entries,
      '        },',
      '    };',
    ].join('\n');
    const rx = /    public static Manifest BuiltIn\(\) => new\(\)\r?\n    \{[\s\S]*?\r?\n    \};/;
    if (!rx.test(cs)) fail('SwineModpack.cs: BuiltIn() block not found');
    const eol = cs.includes('\r\n') ? '\r\n' : '\n';
    const nextCs = cs.replace(rx, replacement.replace(/\n/g, eol));
    fs.writeFileSync(LAUNCHER_MODPACK_CS, nextCs, 'utf8');
    console.log(`  → ${LAUNCHER_MODPACK_CS} (BuiltIn v${manifest.version}, ${mods.length} mods)`);
  }
}

#!/usr/bin/env node
// Ставить зібраний мод Arcanum Units з mods-test/arcunits у теку гри (для перевірки без лаунчера).
//   node tools/install-arcunits.js [--uninstall]
// Копіює gamedata/** і пропатчений swineHD.exe; список файлів — mods-test/arcunits.installed.txt.
// Оригінальний exe лежить у mods-test/backup/swineHD.exe.orig; --uninstall повертає його й прибирає файли зі списку.
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..'), SRC = path.join(ROOT, 'mods-test/arcunits'), LIST = path.join(ROOT, 'mods-test/arcunits.installed.txt');
const GAME = 'A:/SteamLibrary/steamapps/common/SWINE HD Remaster';
const ORIG = path.join(ROOT, 'mods-test/backup/swineHD.exe.orig');
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

const old = fs.existsSync(LIST) ? fs.readFileSync(LIST, 'utf8').split(/\r?\n/).filter(Boolean) : [];
if (process.argv.includes('--uninstall')) {
  for (const rel of old) { const p = path.join(GAME, rel); if (fs.existsSync(p)) fs.rmSync(p); }
  fs.copyFileSync(ORIG, path.join(GAME, 'swineHD.exe')); fs.rmSync(LIST, { force: true });
  console.log(`removed ${old.length} files, original swineHD.exe restored`); process.exit(0);
}
const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : files.push(path.relative(SRC, p).replace(/\\/g, '/')); } })(path.join(SRC, 'gamedata'));
for (const rel of old) if (!files.includes(rel)) { const p = path.join(GAME, rel); if (fs.existsSync(p)) fs.rmSync(p); }   // файли, яких більше нема в моді
for (const rel of files) { const d = path.join(GAME, rel); fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(path.join(SRC, rel), d); }
const patch = JSON.parse(fs.readFileSync(path.join(SRC, 'exe_patch.json'), 'utf8'));
if (sha(path.join(SRC, 'swineHD.exe')) !== patch.patchedSha256) throw new Error('mods-test/arcunits/swineHD.exe does not match exe_patch.json');
fs.copyFileSync(path.join(SRC, 'swineHD.exe'), path.join(GAME, 'swineHD.exe'));
fs.writeFileSync(LIST, files.join('\n') + '\n');
console.log(`installed ${files.length} files + swineHD.exe (${patch.patchedSha256.slice(0, 12)}…) into ${GAME}`);

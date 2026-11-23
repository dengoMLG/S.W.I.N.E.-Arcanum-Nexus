#!/usr/bin/env node
// Ставит собранный мод Arcanum Voices & Screens из modpack/mods/arcanum-voices/ в папку игры поверх Arcanum Units.
//   node tools/install-voices.js [--uninstall]
//
// Копирует reportanim и sounds/speech в gamedata/base/ и применяет units.ini.arcpatch к установленному
// gamedata/base/units.ini (с сохранением копии до патча в mods-test/arcvoices.units.ini.bak).
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'modpack/mods/arcanum-voices');
const GAME = process.env.SWINE_DIR || 'A:/SteamLibrary/steamapps/common/SWINE HD Remaster';
const LIST = path.join(ROOT, 'mods-test/arcvoices.installed.txt');
const BAK = path.join(ROOT, 'mods-test/arcvoices.units.ini.bak');

function applyArcpatch(iniText, patchText) {
  const lines = iniText.split('\r\n');
  let curSec = null;
  const ops = [];
  for (const raw of patchText.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = raw.replace(/;.*$/, '').trim();
    if (!line) continue;
    const m = /^\[(.+)\]$/.exec(line);
    if (m) { curSec = m[1].trim(); continue; }
    const eq = line.indexOf('=');
    if (curSec && eq > 0) {
      ops.push({ sec: curSec, key: line.slice(0, eq).trim(), val: line.slice(eq + 1).trim() });
    }
  }
  const bySec = new Map();
  for (const op of ops) {
    const k = op.sec.toLowerCase();
    if (!bySec.has(k)) bySec.set(k, []);
    bySec.get(k).push(op);
  }
  for (const [, secOps] of bySec) {
    const secName = secOps[0].sec;
    const start = lines.findIndex(l => l.trim().toLowerCase() === `[${secName.toLowerCase()}]`);
    if (start < 0) continue;
    let end = start + 1;
    while (end < lines.length && !lines[end].trim().startsWith('[')) end++;
    for (const op of secOps) {
      const idx = lines.findIndex((l, i) => i > start && i < end && l.trim().toLowerCase().startsWith(op.key.toLowerCase() + ' ') || (i > start && i < end && l.trim().toLowerCase().startsWith(op.key.toLowerCase() + '=')));
      if (idx >= 0) {
        const ind = lines[idx].match(/^\s*/)[0];
        lines[idx] = `${ind}${op.key} = ${op.val}`;
      } else {
        lines.splice(end, 0, ` ${op.key} = ${op.val}`);
        end++;
      }
    }
  }
  return lines.join('\r\n');
}

const old = fs.existsSync(LIST) ? fs.readFileSync(LIST, 'utf8').split(/\r?\n/).filter(Boolean) : [];
const gameUnitsIni = path.join(GAME, 'gamedata/base/units.ini');

if (process.argv.includes('--uninstall')) {
  for (const rel of old) {
    const p = path.join(GAME, rel);
    if (fs.existsSync(p)) fs.rmSync(p);
  }
  if (fs.existsSync(BAK) && fs.existsSync(gameUnitsIni)) {
    fs.copyFileSync(BAK, gameUnitsIni);
    fs.rmSync(BAK, { force: true });
  }
  fs.rmSync(LIST, { force: true });
  console.log(`removed ${old.length} voice/screen files and restored units.ini`);
  process.exit(0);
}

if (!fs.existsSync(path.join(SRC, 'gamedata/base/units.ini.arcpatch'))) {
  throw new Error('Build mod first: node tools/build-voices-mod.js');
}
if (!fs.existsSync(gameUnitsIni)) {
  throw new Error(`Arcanum Units must be installed first (${gameUnitsIni} not found)`);
}

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else {
      const rel = path.relative(SRC, p).replace(/\\/g, '/');
      if (!rel.endsWith('.arcpatch')) files.push(rel);
    }
  }
})(path.join(SRC, 'gamedata'));

for (const rel of old) if (!files.includes(rel)) {
  const p = path.join(GAME, rel);
  if (fs.existsSync(p)) fs.rmSync(p);
}
for (const rel of files) {
  const dst = path.join(GAME, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(path.join(SRC, rel), dst);
}

fs.mkdirSync(path.dirname(BAK), { recursive: true });
if (!fs.existsSync(BAK)) fs.copyFileSync(gameUnitsIni, BAK);
const baseIni = fs.readFileSync(BAK, 'latin1');
const patch = fs.readFileSync(path.join(SRC, 'gamedata/base/units.ini.arcpatch'), 'latin1');
fs.writeFileSync(gameUnitsIni, applyArcpatch(baseIni, patch), 'latin1');
fs.writeFileSync(LIST, files.join('\n') + '\n');
console.log(`installed ${files.length} voice/screen files + patched units.ini into ${GAME}`);

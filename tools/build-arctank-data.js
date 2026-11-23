#!/usr/bin/env node
// Дані нового танка (14-й клас юнітів, потрібен патч exe — tools/re/patchgen):
//   units.ini      — секції [Diszno arctank] і [Nyul arctank] (на основі звичайного/легкого танка);
//   units_text.ini — Nick/Name/Desc для кожної мови гри.
//
//   node tools/build-arctank-data.js <out-dir>
// Пише <out>/gamedata/base/units.ini і <out>/gamedata/<LANG>/units_text.ini (оригінал з .pak + наші секції).
'use strict';
const fs = require('fs'), path = require('path');
const OUT = path.resolve(process.argv[2]);
const GAME = process.env.SWINE_DIR || 'A:/SteamLibrary/steamapps/common/SWINE HD Remaster';
const BS = String.fromCharCode(92);

function readPakEntry(pakPath, want) {
  const fd = fs.openSync(pakPath, 'r'), h = Buffer.alloc(16); fs.readSync(fd, h, 0, 16, 0);
  const isz = h.readUInt32LE(12), ib = Buffer.alloc(isz); fs.readSync(fd, ib, 0, isz, 16);
  let p = 0, prev = ''; const par = {};
  while (p < isz) {
    const pre = ib[p], nl = ib[p + 1], src = (p in par) ? par[p] : prev;
    const name = src.slice(0, pre) + ib.toString('latin1', p + 2, p + 2 + nl), q = p + 2 + nl;
    const C = ib.readUInt32LE(q + 9); if (C) par[C] = name;
    if (name.toLowerCase() === want) { const b = Buffer.alloc(ib.readUInt32LE(q + 4)); fs.readSync(fd, b, 0, b.length, 16 + isz + ib.readUInt32LE(q)); fs.closeSync(fd); return b; }
    prev = name; p = q + 13;
  }
  fs.closeSync(fd); return null;
}

// Секцію-основу копіюємо цілком і міняємо лише потрібні ключі — решта (звуки, спецздібність,
// параметри стрільби) лишається робочою.
function cloneSection(ini, from, to, changes) {
  const lines = ini.split('\r\n');
  const start = lines.findIndex(l => l.trim().toLowerCase() === `[${from}]`.toLowerCase());
  if (start < 0) throw new Error('no section ' + from);
  let end = start + 1; while (end < lines.length && !lines[end].trim().startsWith('[')) end++;
  while (end > start && (lines[end - 1].trim() === '' || lines[end - 1].trim().startsWith(';'))) end--;
  const body = lines.slice(start + 1, end).map(l => {
    const m = l.match(/^(\s*)([^=;\s][^=]*?)\s*=/); if (!m) return l;
    const k = Object.keys(changes).find(x => x.toLowerCase() === m[2].trim().toLowerCase());
    return k === undefined ? l : `${m[1]}${m[2].trim()} = ${changes[k]}`;
  });
  for (const [k, v] of Object.entries(changes)) if (!body.some(l => l.trim().toLowerCase().startsWith(k.toLowerCase() + ' ') || l.trim().toLowerCase().startsWith(k.toLowerCase() + '='))) body.push(`${k} = ${v}`);
  return ['', ';---------------------------------------', '; Arcanum: new tank (14th unit class, needs patched swineHD.exe)', `[${to}]`, ...body].join('\r\n');
}

// Баланс: середній танк між звичайним і важким. Однаковий для обох рас — свої відмінності додамо згодом.
const STATS = { Price: 550, MaxHP: 110, FrontArmor: 3, BackArmor: 2, TopArmor: 3, MaxRange: 8, Damage: 9, ReloadTime: 4.5, Ammo: 80, MoveSpeed: 0.85, SpinSpeed: 50 };
const base = readPakEntry(path.join(GAME, 'gamedata/base/base.pak'), 'units.ini').toString('latin1');
let units = base.replace(/\s*$/, '');
units += cloneSection(base, 'Diszno normal tank', 'Diszno arctank', { Model: `units${BS}skinned${BS}d_arctank`, Icon: 'd_arctank', ...STATS }) + '\r\n';
units += cloneSection(base, 'Nyul light tank', 'Nyul arctank', { Model: `units${BS}skinned${BS}ny_arctank`, Icon: 'ny_arctank', ...STATS }) + '\r\n';
fs.mkdirSync(path.join(OUT, 'gamedata/base'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'gamedata/base/units.ini'), units, 'latin1');

const TEXT = {
  RU: { pig: ['Чародей', 'Средний танк', 'Танк мастерской Арканума: крепче лёгкого танка и дешевле тяжёлого. Держит удар, бьёт метко и не отстаёт от колонны.'],
        rabbit: ['Чародей', 'Средний танк', 'Танк мастерской Арканума: крепче лёгкого танка и дешевле тяжёлого. Держит удар, бьёт метко и не отстаёт от колонны.'] },
  EN: { pig: ['Warlock', 'Medium tank', 'An Arcanum workshop tank: tougher than the light tank and cheaper than the heavy one. Takes a hit, shoots straight and keeps up with the column.'],
        rabbit: ['Warlock', 'Medium tank', 'An Arcanum workshop tank: tougher than the light tank and cheaper than the heavy one. Takes a hit, shoots straight and keeps up with the column.'] },
};
for (const lang of fs.readdirSync(path.join(GAME, 'gamedata'))) {
  const pak = path.join(GAME, 'gamedata', lang, lang.toLowerCase() + '.pak');
  if (!fs.existsSync(pak)) continue;
  const orig = readPakEntry(pak, 'units_text.ini'); if (!orig) continue;
  const t = TEXT[lang] || TEXT.EN;
  const add = [['Diszno arctank', t.pig], ['Nyul arctank', t.rabbit]]
    .map(([s, [nick, name, desc]]) => `\r\n[${s}]\r\n Nick = ${nick}\r\n Name = ${name}\r\n Desc = ${desc}`).join('');
  const isUtf8 = orig[0] === 0xEF && orig[1] === 0xBB;      // RU/ZH з BOM; інші — однобайтові кодування
  const tail = isUtf8 ? Buffer.from(add, 'utf8') : Buffer.from(add.replace(/[^\x00-\x7f]/g, '?'), 'latin1');
  fs.mkdirSync(path.join(OUT, 'gamedata', lang), { recursive: true });
  fs.writeFileSync(path.join(OUT, 'gamedata', lang, 'units_text.ini'), Buffer.concat([orig.slice(0, orig.length - (orig.toString('latin1').match(/\s*$/)[0].length)), tail, Buffer.from('\r\n')]));
  console.log(lang, isUtf8 ? 'utf8' : 'ansi');
}
console.log('units.ini + units_text.ini →', OUT);

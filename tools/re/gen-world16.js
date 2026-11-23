#!/usr/bin/env node
// #2 (16 армій), крок 1: місця imul …,5Ch (індекс гравця → зсув у SGameWorld+F8h) для Caves.cs (world16).
//   tools/re/bin/disasm.exe <exe> docs/swine_symbols.txt fns "." > full.asm
//   node tools/re/gen-world16.js full.asm   → tools/re/world16.json
// Беремо всі imul …,5Ch у коді гри (< 0x530000; вище — RakNet RemoteClient того ж розміру).
// k: якщо індекс перед imul зсунуто (lea r,[i+k]) — компілятор так ховає поле в індекс: (i+k)·5Ch.
// Поріг «гравець ≥ 8» тоді (8+k)·5Ch. Невідоме k (запис у регістр не знайдено поруч) — друкуємо для ручного розбору.
'use strict';
const fs = require('fs'), path = require('path');
const L = fs.readFileSync(process.argv[2], 'utf8').split(/\r?\n/);
const sites = [], unknown = [];
let fn = '';
for (let i = 0; i < L.length; i++) {
  const m0 = L[i].match(/^; =+ (\S+) @/); if (m0) { fn = m0[1]; continue; }
  const m = L[i].match(/^([0-9a-f]{8})\s+imul\s+(e[a-z]{2}),(?:([^,]+),)?5Ch$/); if (!m) continue;
  const va = parseInt(m[1], 16); if (va >= 0x530000) continue;
  const dst = m[2], src = m[3] || dst;
  let k = 0, how = 'reg';
  if (/^e[a-z]{2}$/.test(src)) {
    how = '?';
    for (let j = i - 1; j >= i - 60 && j >= 0; j--) {
      if (/^; =/.test(L[j])) break;
      const p = L[j].match(/^[0-9a-f]{8}\s+(\S+)\s+(.*)$/); if (!p) break;
      if (p[2].startsWith(src + ',') && !/^(cmp|test|push|bt)$/.test(p[1])) {
        const lea = p[1] === 'lea' && p[2].match(/^e[a-z]{2},\[e[a-z]{2}\+(\d+|[0-9A-F]+h)\]$/);
        if (lea) { k = /h$/.test(lea[1]) ? parseInt(lea[1], 16) : +lea[1]; how = 'lea'; } else how = p[1];
        break;
      }
    }
  } else how = 'mem';
  if (k > 8) { unknown.push(`${m[1]} k=${k} ${fn}`); k = 0; }
  sites.push({ va: m[1], k, how, fn: fn.slice(0, 60) });
  if (how === '?') unknown.push(`${m[1]} ${L[i].trim()} ; ${fn}`);
}
fs.writeFileSync(path.join(__dirname, 'world16.json'), JSON.stringify({ note: 'tools/re/gen-world16.js: imul …,5Ch гравців SGameWorld (k — зсув індексу)', sites }, null, 1));
console.log(`world16: ${sites.length} місць, з k: ${sites.filter(s => s.k).length}, без відомого джерела індексу: ${unknown.length}`);
for (const u of unknown) console.log('  ? ' + u);

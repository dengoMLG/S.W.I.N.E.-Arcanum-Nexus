#!/usr/bin/env node
// Розвідка для #2 (16 окремих армій): де exe звертається до гравців SGameWorld.
//   tools/re/bin/disasm.exe <exe> docs/swine_symbols.txt fns "." > full.asm
//   node tools/re/scan-world16.js full.asm [--list]
// Гравці: SGameWorld + F8h + i·5Ch, i < 8 (до +3D8h). Об'єкт 27A0h (operator new у SGameView::LoadGame/LoadMap).
// Шукає:
//   A) imul r,…,5Ch (або imul r,5Ch) і далі в тій самій функції [… + r + disp], disp ∈ [F8h, 3D8h) — поле гравця r;
//   B) [r·4 + X] з X — відомі масиви «по гравцю» (8 dword);
//   C) cmp …,8 / jl|jb|jge… у функціях, що вже мають A чи B — кандидати циклів «до 8».
'use strict';
const fs = require('fs');
const lines = fs.readFileSync(process.argv[2], 'utf8').split(/\r?\n/);
const list = process.argv.includes('--list');
const PLAYER_ARRAYS = [0x0C, 0x10, 0x548, 0x54C, 0x1F40, 0x26EC, 0x270C, 0x272C];
let fn = '', fnStart = 0, imulRegs = new Map();
const A = [], B = [], C = [], fnHits = new Map();
const hex = s => parseInt(s.replace(/h$/i, ''), 16);
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  const m0 = l.match(/^; =+ (\S+) @ ([0-9a-f]+)/);
  if (m0) { fn = m0[1]; fnStart = i; imulRegs = new Map(); continue; }
  const m = l.match(/^([0-9a-f]{8})\s+(\S+)\s*(.*)$/); if (!m) continue;
  const [, va, op, args] = m;
  const im = op === 'imul' && args.match(/^(e[a-z]{2}),(?:[^,]+,)?5Ch$/);
  if (im) { imulRegs.set(im[1], va); continue; }
  // будь-який інший запис у регістр скидає його «гравецьність»
  const dst = args.match(/^(e[a-z]{2}),/); if (dst && !/^(cmp|test|push)$/.test(op) && imulRegs.has(dst[1]) && !/^(add|lea)$/.test(op)) imulRegs.delete(dst[1]);
  for (const mem of args.matchAll(/\[([^\]]+)\]/g)) {
    const parts = mem[1].split('+'); let disp = 0; const regs = [];
    for (const p of parts) { if (/^[0-9A-F]+h$/i.test(p) || /^\d+$/.test(p)) disp += hex(p); else regs.push(p); }
    if (disp >= 0xF8 && disp < 0x3D8 && regs.some(r => imulRegs.has(r))) {
      A.push({ va, fn, ins: `${op} ${args}`, field: ((disp - 0xF8) % 0x5C).toString(16), disp: disp.toString(16), imul: regs.map(r => imulRegs.get(r)).find(Boolean) });
      fnHits.set(fn, (fnHits.get(fn) || 0) + 1);
    }
    if (regs.some(r => /\*4$/.test(r)) && PLAYER_ARRAYS.includes(disp)) {
      B.push({ va, fn, ins: `${op} ${args}`, arr: disp.toString(16) }); fnHits.set(fn, (fnHits.get(fn) || 0) + 1);
    }
  }
}
for (let i = 0, f = ''; i < lines.length; i++) {
  const m0 = lines[i].match(/^; =+ (\S+) @/); if (m0) { f = m0[1]; continue; }
  if (!fnHits.has(f)) continue;
  const m = lines[i].match(/^([0-9a-f]{8})\s+cmp\s+(\S+),(8|10h)$/); if (m) C.push({ va: m[1], fn: f, ins: `cmp ${m[2]},${m[3]}` });
}
const byField = {}; for (const a of A) byField[a.field] = (byField[a.field] || 0) + 1;
const byArr = {}; for (const b of B) byArr[b.arr] = (byArr[b.arr] || 0) + 1;
console.log(`A) поля гравця через imul 5Ch: ${A.length} у ${new Set(A.map(a => a.fn)).size} функціях; за полем (+F8+x):`, byField);
console.log(`B) масиви [r·4+X]: ${B.length}:`, byArr);
console.log(`C) cmp …,8 у цих функціях: ${C.length}`);
console.log(`функцій із доступом до гравців: ${fnHits.size}`);
// --json <файл>: адреси imul, що дають зсув гравця (для Caves.cs, world16) і ті, що не дають
const ji = process.argv.indexOf('--json');
if (ji > 0) {
  const used = [...new Set(A.map(a => a.imul))].sort();
  const all = []; for (const l of lines) { const m = l.match(/^([0-9a-f]{8})\s+imul\s+(e[a-z]{2}),(?:[^,]+,)?5Ch$/); if (m) all.push(m[1]); }
  fs.writeFileSync(process.argv[ji + 1], JSON.stringify({ note: 'tools/re/scan-world16.js: imul …,5Ch, результат яких іде в поля гравця SGameWorld (+F8…+3D7)', player: used, other: all.filter(v => !used.includes(v)) }, null, 1));
  console.log(`json: ${used.length} imul гравців, ${all.length - used.length} інших`);
}
if (list) {
  for (const a of A) console.log(`A ${a.va} +${a.disp} (поле ${a.field}) ${a.ins}  ; ${a.fn}`);
  for (const b of B) console.log(`B ${b.va} [${b.arr}] ${b.ins}  ; ${b.fn}`);
  for (const c of C) console.log(`C ${c.va} ${c.ins}  ; ${c.fn}`);
}

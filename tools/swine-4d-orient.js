#!/usr/bin/env node
// Перевірка й виправлення орієнтації граней у готовій моделі .4d.
//
// Гра малює лише лицьову сторону трикутника (back-face culling). Лицьова — та, де обхід вершин
// узгоджений з нормаллю назовні, як в оригінальних моделях. Якщо деталь побудована «навиворіт»
// (нормалі всередину й обхід під них), гра її відкидає і крізь неї видно сіру внутрішню частину.
//
//   node tools/swine-4d-orient.js check <model.4d>            — звіт: які деталі вивернуті
//   node tools/swine-4d-orient.js fix   <in.4d> [out.4d]       — розвернути їх назовні (за замовчуванням на місці)
//
// Як визначаємо «назовні»: грані вузла ділимо на зв'язні деталі (спільні позиції вершин). Для деталі
// рахуємо знаковий об'єм відносно її центру: < 0 — деталь вивернута. Для пласких деталей (наліпки,
// пластини) об'єм ≈ 0 — тоді порівнюємо нормаль з напрямом від центру вузла.
'use strict';
const fs = require('fs');

function parse(b) {
  const nodes = []; let p = 20;
  while (p < b.length) {
    const tag = b.toString('latin1', p, p + 4), sz = b.readUInt32LE(p + 4); if (tag !== 'MESH') break;
    const end = p + 8 + sz; let q = p + 8;
    const nl = b.readUInt16LE(q), name = b.toString('latin1', q + 2, q + 2 + nl); q += 2 + nl;
    const parent = b.readInt32LE(q), m = []; for (let i = 0; i < 12; i++) m.push(b.readFloatLE(q + 4 + i * 4)); q += 52;
    const n = { name, parent, m, vOff: 0, fOff: 0, v: [], f: [] };
    while (q < end) {
      const t = b.toString('latin1', q, q + 4), s = b.readUInt32LE(q + 4);
      if (t === 'VERT') { const c = b.readUInt32LE(q + 8); n.vOff = q + 16; for (let i = 0; i < c; i++) { const o = n.vOff + i * 32; n.v.push([0, 1, 2, 3, 4, 5].map(k => b.readFloatLE(o + k * 4))); } }
      if (t === 'FACE') { const c = b.readUInt32LE(q + 8); n.fOff = q + 12; for (let i = 0; i < c; i++) n.f.push([0, 1, 2].map(k => b.readUInt16LE(n.fOff + i * 6 + k * 2))); }
      q += 8 + s;
    }
    nodes.push(n); p = end;
  }
  // Світові позиції: точка вузла → батько → … → корінь (p' = p·R + t). Корінь Lanctalp у моделях гри
  // дзеркальний (det = −1), тож «назовні» рахуємо лише у світових координатах.
  const apply = (m, p) => [p[0] * m[0] + p[1] * m[3] + p[2] * m[6] + m[9], p[0] * m[1] + p[1] * m[4] + p[2] * m[7] + m[10], p[0] * m[2] + p[1] * m[5] + p[2] * m[8] + m[11]];
  nodes.forEach((n, i) => { const chain = []; let k = i; while (k >= 0) { chain.push(nodes[k].m); k = nodes[k].parent; } n.w = n.v.map(v => chain.reduce((a, m) => apply(m, a), v.slice(0, 3))); });
  return nodes;
}
const sub = (a, c) => [a[0] - c[0], a[1] - c[1], a[2] - c[2]];
const cross = (a, c) => [a[1] * c[2] - a[2] * c[1], a[2] * c[0] - a[0] * c[2], a[0] * c[1] - a[1] * c[0]];
const dot = (a, c) => a[0] * c[0] + a[1] * c[1] + a[2] * c[2];

// Деталі вузла: union-find по гранях зі спільними (зварними) позиціями вершин.
function shells(n) {
  const key = v => v.slice(0, 3).map(x => Math.round(x * 100)).join(',');
  const par = n.f.map((_, i) => i), find = i => par[i] === i ? i : (par[i] = find(par[i]));
  const owner = {};
  n.f.forEach((f, i) => f.forEach(vi => { const k = key(n.v[vi]); if (k in owner) par[find(i)] = find(owner[k]); else owner[k] = i; }));
  const groups = {}; n.f.forEach((_, i) => (groups[find(i)] ||= []).push(i));
  return Object.values(groups);
}
// Для кожної деталі: (1) узгоджуємо обхід сусідніх граней через спільні ребра (сусід має проходити
// спільне ребро у протилежному напрямі), (2) вибираємо загальний знак за світовим об'ємом — як у
// моделях гри. Повертає грані, які треба перевернути. Деталь з неузгодженими гранями — типова помилка
// генераторів: напр. у призмі боковини назовні, а стрічка навколо — всередину.
function analyse(n) {
  if (n.f.length < 2 || n.name.startsWith('_')) return [];
  const W = n.w, key = i => W[i].map(x => Math.round(x * 100)).join(',');
  const nc = [0, 1, 2].map(k => W.reduce((a, p) => a + p[k], 0) / W.length);
  return shells(n).map(faces => {
    const flip = new Map(faces.map(i => [i, null])), edges = new Map();
    const dirEdges = i => { const v = n.f[i].map(key); return [[v[0], v[1]], [v[1], v[2]], [v[2], v[0]]]; };
    for (const i of faces) for (const [p, q] of dirEdges(i)) { const k = p < q ? p + '|' + q : q + '|' + p; if (!edges.has(k)) edges.set(k, []); edges.get(k).push(i); }
    let mixed = false;
    for (const start of faces) {
      if (flip.get(start) !== null) continue;
      flip.set(start, false); const queue = [start];
      while (queue.length) {
        const i = queue.shift(), fi = flip.get(i);
        for (const [p, q] of dirEdges(i)) {
          const k = p < q ? p + '|' + q : q + '|' + p, list = edges.get(k); if (list.length !== 2) continue;
          const j = list[0] === i ? list[1] : list[0]; if (j === i) continue;
          const sameDir = dirEdges(j).some(([a, b]) => a === p && b === q);   // сусід іде тим самим напрямом → неузгоджено
          const want = sameDir ? !fi : fi;
          if (flip.get(j) === null) { flip.set(j, want); queue.push(j); }
          else if (flip.get(j) !== want) mixed = true;                        // неорієнтовна/неманіфолдна — лишаємо як є
        }
      }
    }
    const vs = [...new Set(faces.flatMap(i => n.f[i]))], c = [0, 1, 2].map(k => vs.reduce((a, i) => a + W[i][k], 0) / vs.length);
    let vol = 0, area = 0, outward = 0;
    for (const i of faces) {
      let [A, B, C] = n.f[i].map(j => W[j]); if (flip.get(i)) [B, C] = [C, B];
      const w = cross(sub(B, A), sub(C, A));
      vol += dot(sub(A, c), cross(sub(B, c), sub(C, c))); area += Math.hypot(...w);
      outward += dot(w, sub([0, 1, 2].map(k => (A[k] + B[k] + C[k]) / 3), nc));
    }
    const flat = Math.abs(vol) < 1e-3 * Math.pow(area, 1.5);
    const all = SIGN * (flat ? outward : vol) < 0;                     // після узгодження вся деталь навиворіт
    const toFlip = faces.filter(i => flip.get(i) !== all);
    return { faces, toFlip, mixed, flat };
  });
}

const [cmd, inp, out] = process.argv.slice(2);
// Правильний знак — як у моделях гри (звірено з d_normaltank/d_hardtank/d_mozsar, див. docs/MODEL_RULES.md).
const SIGN = +(process.env.SWINE_ORIENT_SIGN || -1);
const b = fs.readFileSync(inp), nodes = parse(b);
let total = 0, bad = 0;
for (const n of nodes) {
  const sh = analyse(n); if (!sh.length) continue;
  const inv = sh.filter(s => s.toFlip.length), invFaces = inv.reduce((a, s) => a + s.toFlip.length, 0);
  total += n.f.length; bad += invFaces;
  console.log(`${n.name.padEnd(14)} деталей ${String(sh.length).padStart(3)}, з вивернутими гранями ${String(inv.length).padStart(3)} (${invFaces}/${n.f.length} граней)` +
    (sh.some(s => s.mixed) ? '  ! є неорієнтовні деталі' : ''));
  if (cmd === 'fix') for (const s of inv) {
    const vs = new Set();
    for (const i of s.toFlip) { const f = n.f[i]; [f[1], f[2]] = [f[2], f[1]]; f.forEach(j => vs.add(j)); b.writeUInt16LE(f[1], n.fOff + i * 6 + 2); b.writeUInt16LE(f[2], n.fOff + i * 6 + 4); }
    for (const j of vs) for (let k = 3; k < 6; k++) b.writeFloatLE(-n.v[j][k], n.vOff + j * 32 + k * 4);
  }
}
console.log(`разом: ${bad} з ${total} граней вивернуто`);
if (cmd === 'fix') { fs.writeFileSync(out || inp, b); console.log('виправлено →', out || inp); }
process.exitCode = cmd === 'check' && bad ? 1 : 0;

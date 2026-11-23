#!/usr/bin/env node
// Пробный танк для S.W.I.N.E. HD: своя геометрия + своя текстура в форматах игры (.4d / .dxt).
//
//   node tools/make-test-tank.js <out-dir> [--name arc_tank]
//
// Іерархію вузлів (імена, батьки, матриці) беремо з оригінального d_normaltank_normal.4d —
// рушій анімує танк за іменами вузлів: Lovegtorony = башта (поворот), Cso = ствол (віддача),
// Chain R/L 001 = гусениці (прокрутка текстури lanctalp), _Torkolattuz = спалах пострілу,
// _glow* = фари. Геометрію кожного вузла будуємо заново в його локальних координатах.
//
// Пише: <out>/gamedata/base/units/skinned/<name>_{normal,veteran,elite}.{4d,dxt}
//       <out>/preview_<level>.png (програмний рендер для перевірки) і <name>.obj
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const ANIF = require('./swine-anif.js');

const OUT = path.resolve(process.argv[2] || 'out-tank');
// "d_" в імені обов'язкове для свинячого юніта: SUnit::SetModelColorizeProperties шукає "d_"
// у шляху моделі й тоді бере «Pig default multipliers» для кольору гравця.
// Кролячий юніт — без "d_" (ny_…): «Rabbit default multipliers», тож фарба світліша й насиченіша.
const arg = (k, d) => process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d;
const RACE = arg('--race', 'pig');
const NAME = arg('--name', RACE === 'pig' ? 'd_arctank' : 'ny_arctank');
if ((RACE === 'pig') !== NAME.includes('d_')) throw new Error('pig model names must contain "d_", rabbit ones must not');
// Ікона й ролик магазину беруться за ключем Icon; ролик (.anif) поки копіюємо з цього юніта.
const ANIF_FROM = RACE === 'pig' ? 'd_normaltank' : 'ny_lighttank';
const GAME = process.env.SWINE_DIR || 'A:/SteamLibrary/steamapps/common/SWINE HD Remaster';
const MAGIC = Buffer.from([0x53, 0x72, 0x1A, 0x1B, 0x0D, 0x0A, 0x87, 0x0A]);

// ───────────── pak reader (див. tools/swine-pak.js) ─────────────
function readPakEntry(pakPath, want) {
  const fd = fs.openSync(pakPath, 'r'), h = Buffer.alloc(16); fs.readSync(fd, h, 0, 16, 0);
  const isz = h.readUInt32LE(12), ib = Buffer.alloc(isz); fs.readSync(fd, ib, 0, isz, 16);
  let p = 0, prev = ''; const par = {};
  while (p < isz) {
    const pre = ib[p], nl = ib[p + 1], src = (p in par) ? par[p] : prev;
    const name = src.slice(0, pre) + ib.toString('latin1', p + 2, p + 2 + nl), q = p + 2 + nl;
    const C = ib.readUInt32LE(q + 9); if (C) par[C] = name;
    if (name.toLowerCase() === want) {
      const b = Buffer.alloc(ib.readUInt32LE(q + 4)); fs.readSync(fd, b, 0, b.length, 16 + isz + ib.readUInt32LE(q)); fs.closeSync(fd); return b;
    }
    prev = name; p = q + 13;
  }
  throw new Error('not in pak: ' + want);
}

// ───────────── .4d read: вузли оригіналу ─────────────
function readNodes(b) {
  const nodes = []; let p = 20;
  while (p + 8 <= b.length) {
    const sz = b.readUInt32LE(p + 4), body = p + 8, nl = b.readUInt16LE(body);
    const name = b.toString('latin1', body + 2, body + 2 + nl), q = body + 2 + nl;
    nodes.push({ name, header: b.slice(body, q + 4 + 48), raw: b.slice(p, body + sz) });
    p = body + sz;
  }
  return nodes;
}

// ───────────── геометрія ─────────────
// Меш = трикутники з плоскими нормалями (кожна грань — свої вершини): низькополігональний вигляд.
class Mesh {
  constructor() { this.v = []; this.f = []; }
  tri(a, b, c, uvA, uvB, uvC) {
    const e1 = sub(b, a), e2 = sub(c, a), n = norm(cross(e1, e2));
    const i = this.v.length;
    this.v.push([...a, ...n, ...uvA], [...b, ...n, ...uvB], [...c, ...n, ...uvC]);
    this.f.push([i, i + 1, i + 2]);
  }
  // Опуклий багатокутник (точки по колу, CCW якщо дивитись ззовні), UV — проекція.
  poly(pts, uvf) { for (let k = 1; k + 1 < pts.length; k++) this.tri(pts[0], pts[k], pts[k + 1], uvf(pts[0]), uvf(pts[k]), uvf(pts[k + 1])); }
  // Призма з профілю в площині Y-Z, витягнутого по X від -hx до +hx (профіль CCW, якщо дивитись з +X).
  prismX(profile, hx, uvf) {
    const L = profile.map(([y, z]) => [-hx, y, z]), R = profile.map(([y, z]) => [hx, y, z]);
    this.poly(R, uvf); this.poly([...L].reverse(), uvf);
    for (let k = 0; k < profile.length; k++) {
      const k2 = (k + 1) % profile.length;
      this.poly([L[k], L[k2], R[k2], R[k]], uvf);
    }
  }
  // Зрізана піраміда/призма по Z: нижній і верхній прямокутники (x0..x1, y0..y1) — «башта».
  frustum(lo, hi, z0, z1, uvf) {
    const B = [[lo[0], lo[2], z0], [lo[1], lo[2], z0], [lo[1], lo[3], z0], [lo[0], lo[3], z0]];
    const T = [[hi[0], hi[2], z1], [hi[1], hi[2], z1], [hi[1], hi[3], z1], [hi[0], hi[3], z1]];
    this.poly([...B].reverse(), uvf); this.poly(T, uvf);
    for (let k = 0; k < 4; k++) { const k2 = (k + 1) % 4; this.poly([B[k], B[k2], T[k2], T[k]], uvf); }
  }
  // Циліндр уздовж осі Y (ствол), центр (cx, cz), радіус r, від y0 до y1.
  cylY(cx, cz, r, y0, y1, seg, uvf) {
    const ring = y => Array.from({ length: seg }, (_, i) => { const a = 2 * Math.PI * i / seg; return [cx + r * Math.cos(a), y, cz + r * Math.sin(a)]; });
    const A = ring(y0), B = ring(y1);
    this.poly(B, uvf); this.poly([...A].reverse(), uvf);
    for (let i = 0; i < seg; i++) { const j = (i + 1) % seg; this.poly([A[i], A[j], B[j], B[i]], uvf); }
  }
  cylZ(cx, cy, r, z0, z1, seg, uvf) {
    const ring = z => Array.from({ length: seg }, (_, i) => { const a = 2 * Math.PI * i / seg; return [cx + r * Math.cos(a), cy + r * Math.sin(a), z]; });
    const A = ring(z0), B = ring(z1);
    this.poly(B, uvf); this.poly([...A].reverse(), uvf);
    for (let i = 0; i < seg; i++) { const j = (i + 1) % seg; this.poly([A[i], A[j], B[j], B[i]], uvf); }
  }
  box(x0, x1, y0, y1, z0, z1, uvf) { this.frustum([x0, x1, y0, y1], [x0, x1, y0, y1], z0, z1, uvf); }
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(...a) || 1; return a.map(x => x / l); };

// Текстурний атлас 512×512: ліва половина — камуфляж (корпус/башта), права верхня — темний метал
// (ствол, люк, антена), права нижня — темна гума/сталь (днище).
const camo = s => p => [0.02 + 0.46 * frac((p[0] + 400) / 800 * s), 0.02 + 0.96 * frac((p[1] + 400) / 800 * s)];
const metal = p => [0.55 + 0.4 * frac((p[0] + p[2] + 400) / 300), 0.05 + 0.4 * frac((p[1] + 400) / 600)];
const dark = p => [0.55 + 0.4 * frac((p[0] + 400) / 800), 0.55 + 0.4 * frac((p[1] + 400) / 800)];
const frac = x => x - Math.floor(x);

const BUILDERS = {
  // Нижня частина корпусу: трапеція спереду/ззаду.
  'Lanctalp': m => m.prismX([[-190, -42], [180, -42], [215, 0], [195, 40], [-200, 40], [-220, 0]], 150, dark),
  // Верхня частина: наклонна лобова броня, моторний відсік ззаду.
  'Test': m => {
    m.prismX([[-240, -40], [215, -40], [250, -20], [175, 30], [-200, 30], [-235, 10]], 170, camo(1));
    m.box(-165, 165, -235, -150, 30, 42, metal);           // решітка двигуна
    m.box(-60, -20, 150, 200, 30, 38, metal);              // люк механіка
  },
  // Башта: широка основа + скошений верх + командирська башточка + антена.
  'Lovegtorony': m => {
    m.frustum([-130, 130, -170, 215], [-115, 115, -160, 200], -65, -30, camo(1.3));
    m.frustum([-115, 115, -160, 200], [-80, 80, -125, 150], -30, 25, camo(1.3));
    m.cylZ(-35, -45, 34, 25, 50, 10, metal);               // командирська башточка
    m.box(-40, 40, -190, -160, -55, -20, metal);           // ящик ззаду
    m.box(50, 57, -110, -103, 25, 230, metal);             // антена
  },
  // Ствол: маска, труба, дульне гальмо.
  'Cso': m => {
    m.box(-32, 32, -94, -55, -24, 24, camo(1.3));
    m.cylY(0, 0, 11, -60, 128, 10, metal);
    m.cylY(0, 0, 17, 122, 150, 10, metal);
  },
  // Гусениці: петля-«стадіон» уздовж Y, текстура lanctalp (рушій її прокручує), u — уздовж.
  'Chain R 001': m => track(m), 'Chain L 001': m => track(m),
};

function track(m) {
  const prof = []; const R = 52, cz = 6, yA = -222, yB = 170;
  for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + Math.PI * i / 8; prof.push([yB + R * Math.cos(a), cz + R * Math.sin(a)]); }
  for (let i = 0; i <= 8; i++) { const a = Math.PI / 2 + Math.PI * i / 8; prof.push([yA + R * Math.cos(a), cz + R * Math.sin(a)]); }
  // UV: u ~ довжина по периметру (тайлінг як в оригіналі, ~2.6), v — поперек.
  let acc = [0]; for (let k = 1; k <= prof.length; k++) acc.push(acc[k - 1] + Math.hypot(prof[k % prof.length][0] - prof[k - 1][0], prof[k % prof.length][1] - prof[k - 1][1]));
  const per = acc[prof.length], hx = 36;
  const L = prof.map(([y, z]) => [-hx, y, z]), Rr = prof.map(([y, z]) => [hx, y, z]);
  for (let k = 0; k < prof.length; k++) {
    const k2 = (k + 1) % prof.length, u0 = 2.6 * acc[k] / per, u1 = 2.6 * acc[k + 1] / per;
    m.tri(L[k], L[k2], Rr[k2], [u0, 0], [u1, 0], [u1, 1]);
    m.tri(L[k], Rr[k2], Rr[k], [u0, 0], [u1, 1], [u0, 1]);
  }
  const side = p => [0.1 + 0.3 * frac((p[1] + 300) / 600), 0.1 + 0.3 * frac((p[2] + 100) / 200)];
  m.poly(Rr, side); m.poly([...L].reverse(), side);
}

// ───────────── .4d write ─────────────
function chunk(tag, body) { const h = Buffer.alloc(8); h.write(tag, 0, 'latin1'); h.writeUInt32LE(body.length, 4); return Buffer.concat([h, body]); }
function meshChunk(header, mesh, texName) {
  const P = mesh.v.map(v => v.slice(0, 3)), mn = [0, 1, 2].map(k => Math.min(...P.map(p => p[k]))), mx = [0, 1, 2].map(k => Math.max(...P.map(p => p[k])));
  const bb = Buffer.alloc(96); let o = 0;
  for (const x of [mn[0], mx[0]]) for (const y of [mn[1], mx[1]]) for (const z of [mn[2], mx[2]]) { bb.writeFloatLE(x, o); bb.writeFloatLE(y, o + 4); bb.writeFloatLE(z, o + 8); o += 12; }
  const vb = Buffer.alloc(8 + mesh.v.length * 32); vb.writeUInt32LE(mesh.v.length, 0);
  mesh.v.forEach((v, i) => v.forEach((x, k) => vb.writeFloatLE(x, 8 + i * 32 + k * 4)));
  const fb = Buffer.alloc(4 + mesh.f.length * 6); fb.writeUInt32LE(mesh.f.length, 0);
  mesh.f.forEach((f, i) => f.forEach((x, k) => fb.writeUInt16LE(x, 4 + i * 6 + k * 2)));
  const tn = Buffer.from(texName, 'latin1'), db = Buffer.alloc(2); db.writeUInt16LE(tn.length, 0);
  const mh = Buffer.alloc(12); mh.writeUInt32LE(mesh.f.length, 0); mh.writeUInt32LE(0, 4); mh.writeUInt32LE(mesh.v.length, 8);
  const mate = chunk('MATE', Buffer.concat([mh, chunk('DIFF', Buffer.concat([db, tn]))]));
  const one = Buffer.alloc(4); one.writeUInt32LE(1, 0);
  if (mesh.v.length > 65535) throw new Error('too many vertices');
  return chunk('MESH', Buffer.concat([header, chunk('BBOX', bb), chunk('VERT', vb), chunk('FACE', fb), chunk('MTLS', Buffer.concat([one, mate]))]));
}

// ───────────── текстура: камуфляж + DXT5 ─────────────
// Командний колір (шейдер standard.hlsl, COLORIZE): альфа текстури = маска. Там, де альфа 1,
// відтінок замінюється кольором гравця, а насиченість і яскравість беруться з текстури
// (× множники раси з units_color.ini; «свинячі», якщо в імені моделі є "d_").
// Тож фарба корпусу — синювато-сіра з насиченістю ≈0.5 і яскравістю ≈0.36, як в оригіналі
// d_normaltank; камуфляж — це лише різниця яскравості, тож у грі він стає відтінками кольору гравця.
// Метал (ствол, решітки) і днище — альфа 0, свій колір.
function makeTexture(level) {
  const W = 512, px = new Float32Array(W * W * 4);
  const rnd = mulberry(7);
  // Свині: як d_normaltank (S≈0.5, V≈0.36, множники ×3/×2). Кролі: як ny_lighttank (S≈0.65, V≈0.69, ×1.33/×1).
  const paint = RACE === 'pig' ? v => [v * 0.55, v * 0.85, v] : v => [v, v * 0.8, v * 0.38];
  const shades = RACE === 'pig'
    ? { normal: [0.36, 0.27, 0.45, 0.21], veteran: [0.38, 0.30, 0.47, 0.24], elite: [0.33, 0.24, 0.42, 0.19] }[level]
    : { normal: [0.68, 0.56, 0.80, 0.48], veteran: [0.70, 0.58, 0.82, 0.50], elite: [0.64, 0.52, 0.76, 0.45] }[level];
  const blobs = Array.from({ length: 70 }, () => ({ x: rnd() * 256, y: rnd() * 512, r: 18 + rnd() * 42, c: 1 + Math.floor(rnd() * 3) }));
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    let c, a = 1;
    if (x < 256) {
      let v = shades[0];
      for (const b of blobs) { const d = Math.hypot((x - b.x) * 1.4, y - b.y) + 6 * Math.sin(x * 0.13 + y * 0.09); if (d < b.r) v = shades[b.c]; }
      c = paint(v);
      if (y % 64 < 2 || x % 64 < 2) c = c.map(t => t * 0.65);                         // шви панелей
      if (((x * 7 + y * 13) % 97) === 0) c = c.map(t => Math.min(1, t * 1.4));        // заклепки
      // Ветеран — білі смуги, еліта — золоті канти: альфа 0, тож колір гравця їх не чіпає.
      if (level === 'veteran' && (y % 128) >= 96 && (y % 128) < 104) { c = [0.85, 0.85, 0.8]; a = 0; }
      if (level === 'elite' && (y % 64 < 3 || x % 64 < 3)) { c = [0.85, 0.65, 0.18]; a = 0; }
    } else if (y < 256) {
      const g = 0.26 + 0.05 * Math.sin(y * 0.4) + 0.03 * rnd(); c = [g, g * 1.02, g * 1.06]; a = 0;
    } else { const g = 0.12 + 0.03 * rnd(); c = [g, g, g]; a = 0; }
    px.set([...c, a], (y * W + x) * 4);
  }
  return { W, px };
}
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const to565 = c => ((Math.round(c[0] * 31) & 31) << 11) | ((Math.round(c[1] * 63) & 63) << 5) | (Math.round(c[2] * 31) & 31);
const from565 = v => [((v >> 11) & 31) / 31, ((v >> 5) & 63) / 63, (v & 31) / 31];

function dxt5(img) {
  const parts = []; let { W, px } = img;
  while (true) {
    const bw = Math.max(1, W / 4), out = Buffer.alloc(bw * bw * 16);
    for (let by = 0; by < bw; by++) for (let bx = 0; bx < bw; bx++) {
      const block = [], alpha = [];
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { const x = Math.min(W - 1, bx * 4 + i), y = Math.min(W - 1, by * 4 + j), q = (y * W + x) * 4; block.push([px[q], px[q + 1], px[q + 2]].map(v => Math.max(0, Math.min(1, v)))); alpha.push(px[q + 3]); }
      const lum = c => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
      let lo = block[0], hi = block[0]; for (const c of block) { if (lum(c) < lum(lo)) lo = c; if (lum(c) > lum(hi)) hi = c; }
      let c0 = to565(hi), c1 = to565(lo); if (c0 < c1) [c0, c1] = [c1, c0];
      const p0 = from565(c0), p1 = from565(c1), pal = [p0, p1, p0.map((v, k) => (2 * v + p1[k]) / 3), p0.map((v, k) => (v + 2 * p1[k]) / 3)];
      let idx = 0;
      if (c0 !== c1) block.forEach((c, n) => { let best = 0, bd = 1e9; pal.forEach((q, k) => { const d = (c[0] - q[0]) ** 2 + (c[1] - q[1]) ** 2 + (c[2] - q[2]) ** 2; if (d < bd) { bd = d; best = k; } }); idx |= best << (2 * n); });
      const o = (by * bw + bx) * 16;
      // Альфа DXT5: a0 > a1 → 8 рівнів; індекс 0 = a0, індекс 1 = a1, 2..7 — проміжні.
      const aMax = Math.round(Math.max(...alpha) * 255), aMin = Math.round(Math.min(...alpha) * 255);
      if (aMax === aMin) { out[o] = aMax; out[o + 1] = aMin; }
      else {
        out[o] = aMax; out[o + 1] = aMin;
        const lv = [aMax, aMin, ...[1, 2, 3, 4, 5, 6].map(i => ((7 - i) * aMax + i * aMin) / 7)];
        let bits = 0n;
        alpha.forEach((a, n) => { let best = 0, bd = 1e9; lv.forEach((l, k) => { const d = Math.abs(a * 255 - l); if (d < bd) { bd = d; best = k; } }); bits |= BigInt(best) << BigInt(3 * n); });
        for (let k = 0; k < 6; k++) out[o + 2 + k] = Number((bits >> BigInt(8 * k)) & 255n);
      }
      out.writeUInt16LE(c0, o + 8); out.writeUInt16LE(c1, o + 10); out.writeUInt32LE(idx >>> 0, o + 12);
    }
    parts.push(out);
    if (W === 1) break;
    const W2 = W / 2, p2 = new Float32Array(W2 * W2 * 4);
    for (let y = 0; y < W2; y++) for (let x = 0; x < W2; x++) for (let k = 0; k < 4; k++)
      p2[(y * W2 + x) * 4 + k] = (px[((2 * y) * W + 2 * x) * 4 + k] + px[((2 * y) * W + 2 * x + 1) * 4 + k] + px[((2 * y + 1) * W + 2 * x) * 4 + k] + px[((2 * y + 1) * W + 2 * x + 1) * 4 + k]) / 4;
    W = W2; px = p2;
  }
  const data = Buffer.concat(parts), h = Buffer.alloc(16);
  h.writeUInt32LE(3, 0); h.writeUInt32LE(img.W, 4); h.writeUInt32LE(img.W, 8); h.write('DXT5', 12, 'latin1');
  const body = Buffer.concat([h, data]), th = Buffer.alloc(8); th.write('TEXT', 0, 'latin1'); th.writeUInt32LE(body.length, 4);
  return Buffer.concat([MAGIC, th, body]);
}

// ───────────── прев'ю: програмний рендер у PNG ─────────────
function mat(header) { const m = []; for (let i = 0; i < 12; i++) m.push(header.readFloatLE(header.length - 48 + i * 4)); return m; }
// Точка p у системі вузла → у систему батька: p' = p*R + t (рядки R = m[0..8], t = m[9..11]).
const apply = (m, p) => [p[0] * m[0] + p[1] * m[3] + p[2] * m[6] + m[9], p[0] * m[1] + p[1] * m[4] + p[2] * m[7] + m[10], p[0] * m[2] + p[1] * m[5] + p[2] * m[8] + m[11]];
// Колір гравця: H → чистий колір (як SGroup::SetColorizeProperties), множники = S/100·3, V/100·2 (свині).
function teamColor(h, s, v) {
  const f = (n, k = (n + h / 60) % 6) => 1 - Math.max(0, Math.min(k, 4 - k, 1));
  const m = RACE === 'pig' ? [3, 2] : [1.333, 1];
  return { rgb: [f(5), f(3), f(1)], mul: [s / 100 * m[0], v / 100 * m[1]] };
}
// Програмний рендер (той самий COLORIZE, що й у грі) на сірому тлі магазину з тінню.
// Тло 124,122,124 — як в оригінальних іконках і роликах (menu/units/*.png, *.anif): у магазині воно
// зливається з сірою панеллю. yaw = 0 → танк дивиться ліворуч і трохи на глядача, як оригінали.
const BG = [124, 122, 124];
const YAW0 = Number(arg('--yaw0', '-2.1'));
function render(parts, tex, yaw, team, size = [640, 420], opts = {}) {
  const [W, H] = size, img = Buffer.alloc(W * H * 3), zb = new Float32Array(W * H).fill(-1e9);
  for (let i = 0; i < W * H; i++) img.set(BG, i * 3);
  const tris = [];
  for (const { mesh, chain, track: isTrack } of parts) for (const f of mesh.f) {
    const P = f.map(i => { let p = mesh.v[i].slice(0, 3); for (const m of chain) p = apply(m, p); return p; });
    const n = norm(cross(sub(P[1], P[0]), sub(P[2], P[0])));
    const uv = mesh.v[f[0]].slice(6, 8); tris.push({ P, n, uv, isTrack });
  }
  // Камера: обертання навколо вертикалі (Y у світі гри — «вгору» після кореневої матриці).
  const Y = YAW0 + yaw, cy = Math.cos(Y), sy = Math.sin(Y), pitch = opts.pitch ?? 0.45, cp = Math.cos(pitch), sp = Math.sin(pitch);
  const view = p => { const x = p[0] * cy - p[2] * sy, z = p[0] * sy + p[2] * cy, y = p[1]; return [x, y * cp - z * sp, y * sp + z * cp]; };
  // Масштаб рахуємо по описаній сфері (не по поточному ракурсу) — у ролику танк не «дихає» під час обертання.
  const pts = tris.flatMap(t => t.P), ground = Math.min(...pts.map(p => p[1]));
  const c = [0, 1, 2].map(k => (Math.min(...pts.map(p => p[k])) + Math.max(...pts.map(p => p[k]))) / 2);
  const R = Math.max(...pts.map(p => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2])));
  const vc = view(c), s = Math.min(W, H) / (2 * R) * (opts.zoom ?? 1.0), ox = W / 2 - s * vc[0], oy = H / 2 + s * vc[1] + (opts.drop ?? 0) * H;
  const L = norm([0.4, 0.8, 0.5]);
  const raster = (V, plot) => {
    const x0 = Math.max(0, Math.floor(Math.min(...V.map(v => v[0])))), x1 = Math.min(W - 1, Math.ceil(Math.max(...V.map(v => v[0]))));
    const y0 = Math.max(0, Math.floor(Math.min(...V.map(v => v[1])))), y1 = Math.min(H - 1, Math.ceil(Math.max(...V.map(v => v[1]))));
    const area = (V[1][0] - V[0][0]) * (V[2][1] - V[0][1]) - (V[2][0] - V[0][0]) * (V[1][1] - V[0][1]); if (Math.abs(area) < 1e-6) return;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const w0 = ((V[1][0] - x) * (V[2][1] - y) - (V[2][0] - x) * (V[1][1] - y)) / area, w1 = ((V[2][0] - x) * (V[0][1] - y) - (V[0][0] - x) * (V[2][1] - y)) / area, w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      plot(y * W + x, w0 * V[0][2] + w1 * V[1][2] + w2 * V[2][2]);
    }
  };
  const proj = p => { const v = view(p); return [ox + v[0] * s, oy - v[1] * s, v[2]]; };
  // Тінь: проекція на землю вздовж світла, затемнює тло.
  if (opts.shadow !== false) {
    const sh = new Uint8Array(W * H), Ls = [-0.35, 1, 0.25];
    for (const t of tris) raster(t.P.map(p => { const k = (p[1] - ground) / Ls[1]; return proj([p[0] - Ls[0] * k, ground, p[2] - Ls[2] * k]); }), i => { sh[i] = 1; });
    for (let i = 0; i < W * H; i++) if (sh[i]) for (let k = 0; k < 3; k++) img[i * 3 + k] = BG[k] * 0.62;
  }
  for (const t of tris) {
    const lit = 0.35 + 0.65 * Math.max(0, t.n[0] * L[0] + t.n[1] * L[1] + t.n[2] * L[2]);
    let base;
    if (t.isTrack) base = [0.18, 0.17, 0.16];
    else {
      const tx = Math.min(511, Math.max(0, Math.floor(t.uv[0] * 511))), ty = Math.min(511, Math.max(0, Math.floor(t.uv[1] * 511))), q = (ty * 512 + tx) * 4;
      base = [tex.px[q], tex.px[q + 1], tex.px[q + 2]];
      if (team && tex.px[q + 3] > 0.5) {                                 // те саме, що COLORIZE у standard.hlsl
        const v = Math.max(...base), mn = Math.min(...base); let sat = v > 0 ? (v - mn) / v : 1;
        sat *= team.mul[0]; const val = v * team.mul[1];
        base = team.rgb.map(c => (c * sat + (1 - sat)) * val);
      }
    }
    const col = base.map(c => Math.max(0, Math.min(255, c * lit * 255 * 1.6)));
    raster(t.P.map(proj), (i, z) => { if (z > zb[i]) { zb[i] = z; img[i * 3] = col[0]; img[i * 3 + 1] = col[1]; img[i * 3 + 2] = col[2]; } });
  }
  const badge = opts.badge;
  if (badge) for (let y = 0; y < badge.h; y++) for (let x = 0; x < badge.w; x++) {   // значок ветерана/еліти
    const s = (y * badge.W + x) * 3, d = (y * W + x) * 3;
    if (badge.px[s] + badge.px[s + 1] > 300 || badge.px[s] > 150 && badge.px[s + 2] < 90) { img[d] = badge.px[s]; img[d + 1] = badge.px[s + 1]; img[d + 2] = badge.px[s + 2]; }
  }
  return { W, H, img };
}
function writePng(file, { W, H, img }) {
  const raw = Buffer.alloc((W * 3 + 1) * H); for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; img.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3); }
  const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = b => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const pchunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pchunk('IHDR', ihdr), pchunk('IDAT', zlib.deflateSync(raw)), pchunk('IEND', Buffer.alloc(0))]));
}
// RGB-кадр → RGBA для кодера .anif (усе непрозоре, як фон оригінальних роликів).
const rgba = ({ W, H, img }) => { const o = Buffer.alloc(W * H * 4, 255); for (let i = 0; i < W * H; i++) img.copy(o, i * 4, i * 3, i * 3 + 3); return o; };

// ───────────── main ─────────────
const orig = readPakEntry(path.join(GAME, 'gamedata/base/base.pak'), 'units/skinned/d_normaltank_normal.4d');
const nodes = readNodes(orig);
const LEVELS = ['normal', 'veteran', 'elite'];
// Кольори з units_color.ini для прев'ю.
const TEAMS = { red: teamColor(3, 62, 60), blue: teamColor(203, 33, 50), yellow: teamColor(42, 74, 83) };
const skDir = path.join(OUT, 'gamedata/base/units/skinned'); fs.mkdirSync(skDir, { recursive: true });
const menuDir = path.join(OUT, 'gamedata/base/menu/units');

const parentsOf = {}; nodes.forEach((n, i) => { parentsOf[i] = n.header.readInt32LE(n.header.length - 52); });
const meshes = nodes.map(n => { if (!BUILDERS[n.name]) return null; const m = new Mesh(); BUILDERS[n.name](m); return m; });

for (const level of LEVELS) {
  const tex = `${NAME}_${level}`;
  const out = [];
  nodes.forEach((n, i) => {
    const m = meshes[i];
    if (!m) { out.push(n.raw); return; }                               // фари/спалах — як в оригіналі
    out.push(meshChunk(n.header, m, n.name.startsWith('Chain') ? 'lanctalp.tga' : tex + '.tga'));
  });
  const body = Buffer.concat([Buffer.from('v100', 'latin1'), ...out]);
  const sh = Buffer.alloc(8); sh.write('SCEN', 0, 'latin1'); sh.writeUInt32LE(body.length, 4);
  fs.writeFileSync(path.join(skDir, tex + '.4d'), Buffer.concat([MAGIC, sh, body]));
  // Гра малює лише лицьовий бік граней: розвертаємо вивернуті деталі (напр. циліндр ствола) назовні.
  require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'swine-4d-orient.js'), 'fix', path.join(skDir, tex + '.4d')], { stdio: 'ignore' });
  const img = makeTexture(level);
  fs.writeFileSync(path.join(skDir, tex + '.dxt'), dxt5(img));

  const parts = nodes.map((n, i) => {
    if (!meshes[i]) return null;
    const chain = []; let k = i; while (k >= 0) { chain.push(mat(nodes[k].header)); k = parentsOf[k]; }
    return { mesh: meshes[i], chain, track: n.name.startsWith('Chain') };
  }).filter(Boolean);
  for (const [team, tc] of Object.entries(TEAMS)) writePng(path.join(OUT, `preview_${NAME}_${level}_${team}.png`), render(parts, img, 0, tc, [640, 420], { zoom: 1.25, drop: -0.08 }));

  // Ікона магазину 128×128: як в оригіналі — назва без суфікса для normal, _veteran/_elite.
  const suffix = level === 'normal' ? '' : '_' + level;
  const badge = level === 'normal' ? null : decodePng(readPakEntry(path.join(GAME, 'gamedata/base/base.pak'), `menu/units/${ANIF_FROM}_${level}.png`), 40, 40);
  const iconTeam = RACE === 'pig' ? TEAMS.blue : TEAMS.yellow;
  fs.mkdirSync(menuDir, { recursive: true });
  writePng(path.join(menuDir, `${NAME}${suffix}.png`), render(parts, img, 0, iconTeam, [128, 128], { badge, zoom: 1.45, drop: -0.04 }));
  // Ролик магазину: повний оберт за 200 кадрів, 496×368 (як оригінали), той самий ракурс на кадрі 0.
  if (!process.argv.includes('--no-anif')) {
    const frames = []; for (let f = 0; f < 200; f++) frames.push(rgba(render(parts, img, -2 * Math.PI * f / 200, iconTeam, [496, 368], { zoom: 1.25, drop: -0.04 })));
    ANIF.write(path.join(menuDir, `${NAME}${suffix}.anif`), 496, 368, frames);
  }
  console.log(`${tex}: ${meshes.filter(Boolean).reduce((a, m) => a + m.f.length, 0)} faces`);
}
console.log('done →', OUT);

// Мінімальний PNG-декодер (RGB 8 біт, без інтерлейсу) — лише щоб узяти значок з оригінальної ікони.
function decodePng(buf, w0, h0) {
  let p = 8, W = 0, H = 0; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('latin1', p + 4, p + 8), d = buf.slice(p + 8, p + 8 + len);
    if (type === 'IHDR') { W = d.readUInt32BE(0); H = d.readUInt32BE(4); if (d[8] !== 8 || d[9] !== 2 || d[12]) throw new Error('png: only RGB8'); }
    if (type === 'IDAT') idat.push(d);
    p += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat)), bpp = 3, stride = W * bpp, px = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    const f = raw[y * (stride + 1)], row = raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0, b = y ? px[(y - 1) * stride + x] : 0, c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0;
      const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f];
      px[y * stride + x] = (row[x] + pred) & 255;
    }
  }
  return { W, px, w: w0, h: h0 };
}

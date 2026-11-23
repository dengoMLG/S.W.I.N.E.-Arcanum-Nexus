#!/usr/bin/env node
// Перевірка готової моделі так, як її бачить гра: читає .4d і .dxt з диска (не дані генератора),
// збирає ієрархію вузлів, фарбує шейдером COLORIZE з shaders/standard.hlsl і рендерить у PNG.
//
//   node tools/swine-view.js <model.4d> <out.png> [--team yellow|blue|red|green] [--mip N] [--yaw R] [--pitch R]
//
// --mip N — рендер з N-го mip-рівня (у грі здалеку беруться дрібні рівні). Текстура береться з імені в
// MATE/DIFF (*.tga → *.dxt поруч із .4d або units/skinned/ з base.pak).
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const DXT = require('./swine-dxt.js');
const GAME = process.env.SWINE_DIR || 'A:/SteamLibrary/steamapps/common/SWINE HD Remaster';
const arg = (k, d) => process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d;
const [file, outPng] = process.argv.slice(2);
const CULL = +arg('--cull', 0);   // 0 — малювати обидві сторони, 1/-1 — відкидати грані за напрямом обходу
const MIP = +arg('--mip', 0), YAW = +arg('--yaw', 0.7), PITCH = +arg('--pitch', 0.55);
// units_color.ini (H, S, V); множники рас — Pig/Rabbit default multipliers.
const TEAMS = { yellow: [42, 74, 83], blue: [203, 33, 50], red: [3, 62, 60], green: [118, 48, 52] };
const isPig = /(^|[\\/])d_[^\\/]*$/i.test(file) || path.basename(file).includes('d_');
const [H, S, V] = TEAMS[arg('--team', 'yellow')], mul = isPig ? [3, 2] : [1.333, 1];
const hue = (n, k = (n + H / 60) % 6) => 1 - Math.max(0, Math.min(k, 4 - k, 1));
const team = { rgb: [hue(5), hue(3), hue(1)], mul: [Math.min(S, 100) / 100 * mul[0], Math.min(V, 100) / 100 * mul[1]] };

// ── .4d ──
const b = fs.readFileSync(file);
const nodes = [];
let p = 20;
while (p < b.length) {
  const tag = b.toString('latin1', p, p + 4), sz = b.readUInt32LE(p + 4); if (tag !== 'MESH') break;
  const end = p + 8 + sz; let q = p + 8;
  const nl = b.readUInt16LE(q), name = b.toString('latin1', q + 2, q + 2 + nl); q += 2 + nl;
  const parent = b.readInt32LE(q), m = []; for (let i = 0; i < 12; i++) m.push(b.readFloatLE(q + 4 + i * 4)); q += 52;
  const n = { name, parent, m, v: [], f: [], tex: null };
  while (q < end) {
    const t = b.toString('latin1', q, q + 4), s = b.readUInt32LE(q + 4);
    if (t === 'VERT') { const c = b.readUInt32LE(q + 8); for (let i = 0; i < c; i++) { const o = q + 16 + i * 32; n.v.push([0, 1, 2, 3, 4, 5, 6, 7].map(k => b.readFloatLE(o + k * 4))); } }
    if (t === 'FACE') { const c = b.readUInt32LE(q + 8); for (let i = 0; i < c; i++) n.f.push([0, 1, 2].map(k => b.readUInt16LE(q + 12 + i * 6 + k * 2))); }
    if (t === 'MTLS') { const d = b.toString('latin1', q + 8, q + 8 + s).match(/DIFF..\x00\x00..([\x20-\x7e]+\.tga)/s); if (d) n.tex = d[1]; }
    q += 8 + s;
  }
  nodes.push(n); p = end;
}
// ── текстури ──
const texCache = {};
function loadTex(name) {
  if (name in texCache) return texCache[name];
  const dxtName = name.replace(/\.tga$/i, '.dxt');
  let t = null;
  const local = path.join(path.dirname(file), dxtName);
  if (fs.existsSync(local)) t = DXT.read(local);
  else {
    const tmp = path.join(require('os').tmpdir(), 'swine-view-' + dxtName);
    if (!fs.existsSync(tmp)) {
      const pak = readPakEntry(path.join(GAME, 'gamedata/base/base.pak'), 'units/skinned/' + dxtName.toLowerCase());
      if (pak) fs.writeFileSync(tmp, pak);
    }
    if (fs.existsSync(tmp)) t = DXT.read(tmp);
  }
  if (!t) { console.warn('texture not found:', name); return texCache[name] = null; }
  const L = t.levels[Math.min(MIP, t.levels.length - 1)];
  return texCache[name] = { w: L.w, h: L.h, px: DXT.decodeLevel(t, L) };
}
function readPakEntry(pakPath, want) {
  const fd = fs.openSync(pakPath, 'r'), h = Buffer.alloc(16); fs.readSync(fd, h, 0, 16, 0);
  const isz = h.readUInt32LE(12), ib = Buffer.alloc(isz); fs.readSync(fd, ib, 0, isz, 16);
  let p = 0, prev = ''; const par = {};
  while (p < isz) {
    const pre = ib[p], nl = ib[p + 1], src = (p in par) ? par[p] : prev;
    const name = src.slice(0, pre) + ib.toString('latin1', p + 2, p + 2 + nl), q = p + 2 + nl;
    const C = ib.readUInt32LE(q + 9); if (C) par[C] = name;
    if (name.toLowerCase() === want) { const r = Buffer.alloc(ib.readUInt32LE(q + 4)); fs.readSync(fd, r, 0, r.length, 16 + isz + ib.readUInt32LE(q)); fs.closeSync(fd); return r; }
    prev = name; p = q + 13;
  }
  fs.closeSync(fd); return null;
}
// ── рендер ──
const apply = (m, v) => [v[0] * m[0] + v[1] * m[3] + v[2] * m[6] + m[9], v[0] * m[1] + v[1] * m[4] + v[2] * m[7] + m[10], v[0] * m[2] + v[1] * m[5] + v[2] * m[8] + m[11]];
const rot = (m, v) => [v[0] * m[0] + v[1] * m[3] + v[2] * m[6], v[0] * m[1] + v[1] * m[4] + v[2] * m[7], v[0] * m[2] + v[1] * m[5] + v[2] * m[8]];
const tris = [];
nodes.forEach((n, i) => {
  if (n.name.startsWith('_') || !n.f.length) return;          // спалах, фари, маркери — не малюємо
  if (arg('--only') && !arg('--only').split(',').includes(n.name)) return;
  const chain = []; let k = i; while (k >= 0) { chain.push(nodes[k].m); k = nodes[k].parent; }
  const tex = n.tex ? loadTex(n.tex) : null;
  const P = n.v.map(v => chain.reduce((a, m) => apply(m, a), v.slice(0, 3)));
  const N = n.v.map(v => chain.reduce((a, m) => rot(m, a), v.slice(3, 6)));
  for (const f of n.f) tris.push({ node: n.name, P: f.map(j => P[j]), N: f.map(j => N[j]), UV: f.map(j => n.v[j].slice(6, 8)), tex, colorize: !/lanctalp/i.test(n.tex || '') });
});
const W = 720, Hh = 520, img = Buffer.alloc(W * Hh * 3), zb = new Float32Array(W * Hh).fill(-1e9);
for (let i = 0; i < W * Hh; i++) img.set([124, 122, 124], i * 3);
const cy = Math.cos(YAW), sy = Math.sin(YAW), cp = Math.cos(PITCH), sp = Math.sin(PITCH);
const view = q => { const x = q[0] * cy - q[2] * sy, z = q[0] * sy + q[2] * cy; return [x, q[1] * cp - z * sp, q[1] * sp + z * cp]; };
const all = tris.flatMap(t => t.P.map(view));
const mnx = Math.min(...all.map(a => a[0])), mxx = Math.max(...all.map(a => a[0])), mny = Math.min(...all.map(a => a[1])), mxy = Math.max(...all.map(a => a[1]));
const sc = Math.min(W / (mxx - mnx), Hh / (mxy - mny)) * 0.88, ox = W / 2 - sc * (mnx + mxx) / 2, oy = Hh / 2 + sc * (mny + mxy) / 2;
const L = (() => { const l = [0.4, 0.8, 0.45], n = Math.hypot(...l); return l.map(x => x / n); })();
let culled = 0; const culledBy = {};
for (const t of tris) {
  const Vv = t.P.map(view).map(a => [ox + a[0] * sc, oy - a[1] * sc, a[2]]);
  const area = (Vv[1][0] - Vv[0][0]) * (Vv[2][1] - Vv[0][1]) - (Vv[2][0] - Vv[0][0]) * (Vv[1][1] - Vv[0][1]); if (Math.abs(area) < 1e-6) continue;
  if (CULL && Math.sign(area) !== CULL) { culled++; culledBy[t.node] = (culledBy[t.node] || 0) + 1; continue; }
  const x0 = Math.max(0, Math.floor(Math.min(...Vv.map(a => a[0])))), x1 = Math.min(W - 1, Math.ceil(Math.max(...Vv.map(a => a[0]))));
  const y0 = Math.max(0, Math.floor(Math.min(...Vv.map(a => a[1])))), y1 = Math.min(Hh - 1, Math.ceil(Math.max(...Vv.map(a => a[1]))));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const w0 = ((Vv[1][0] - x) * (Vv[2][1] - y) - (Vv[2][0] - x) * (Vv[1][1] - y)) / area, w1 = ((Vv[2][0] - x) * (Vv[0][1] - y) - (Vv[0][0] - x) * (Vv[2][1] - y)) / area, w2 = 1 - w0 - w1;
    if (w0 < 0 || w1 < 0 || w2 < 0) continue;
    const z = w0 * Vv[0][2] + w1 * Vv[1][2] + w2 * Vv[2][2], zi = y * W + x; if (z <= zb[zi]) continue; zb[zi] = z;
    let r = 0.5, g = 0.5, bl = 0.5, a = 0;
    if (t.tex) {
      let u = w0 * t.UV[0][0] + w1 * t.UV[1][0] + w2 * t.UV[2][0], v = w0 * t.UV[0][1] + w1 * t.UV[1][1] + w2 * t.UV[2][1];
      u -= Math.floor(u); v -= Math.floor(v);
      const q = (Math.min(t.tex.h - 1, Math.floor(v * t.tex.h)) * t.tex.w + Math.min(t.tex.w - 1, Math.floor(u * t.tex.w))) * 4;
      r = t.tex.px[q] / 255; g = t.tex.px[q + 1] / 255; bl = t.tex.px[q + 2] / 255; a = t.tex.px[q + 3] / 255;
    }
    if (t.colorize && a > 0) {                                  // standard.hlsl, #if COLORIZE
      const value = Math.max(r, g, bl), cmin = Math.min(r, g, bl);
      const sat = (value > 0 ? (value - cmin) / value : 1) * team.mul[0], val = value * team.mul[1];
      const col = team.rgb.map(c => (c * sat + (1 - sat)) * val);
      r += (col[0] - r) * a; g += (col[1] - g) * a; bl += (col[2] - bl) * a;
    }
    const nx = w0 * t.N[0][0] + w1 * t.N[1][0] + w2 * t.N[2][0], ny = w0 * t.N[0][1] + w1 * t.N[1][1] + w2 * t.N[2][1], nz = w0 * t.N[0][2] + w1 * t.N[1][2] + w2 * t.N[2][2];
    const lit = 0.45 + 0.75 * Math.max(0, (nx * L[0] + ny * L[1] + nz * L[2]) / (Math.hypot(nx, ny, nz) || 1));
    img[zi * 3] = Math.max(0, Math.min(255, r * lit * 255)); img[zi * 3 + 1] = Math.max(0, Math.min(255, g * lit * 255)); img[zi * 3 + 2] = Math.max(0, Math.min(255, bl * lit * 255));
  }
}
const raw = Buffer.alloc((W * 3 + 1) * Hh); for (let y = 0; y < Hh; y++) img.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3);
const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = d => { let c = -1; for (const x of d) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const ch = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(Hh, 4); ih[8] = 8; ih[9] = 2;
fs.writeFileSync(outPng, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ch('IHDR', ih), ch('IDAT', zlib.deflateSync(raw)), ch('IEND', Buffer.alloc(0))]));
if (CULL && process.argv.includes('--stats')) console.log(Object.entries(culledBy).map(([k, v]) => `${k}: ${v}/${tris.filter(t => t.node === k).length}`).join(', '));
console.log(`${path.basename(file)}: ${nodes.length} nodes, ${tris.length} tris${CULL ? `, culled ${culled}` : ''}, textures: ${[...new Set(nodes.map(n => n.tex).filter(Boolean))].join(', ')} → ${outPng}`);

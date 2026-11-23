#!/usr/bin/env node
// Ролики S.W.I.N.E. (.anif): магазин юнітів (menu/units/<Icon>{,_veteran,_elite}.anif), заставки.
//
// Формат (SAnimation::LoadANI @0x465290):
//   сигнатура 53 72 1A 1B 0D 0A 87 0A, далі чанк "ANI2" (або старий "ANIF" без стиснення) + u32 розмір;
//   u32 ширина, u32 висота, u32 кадрів; решта чанку — zstd(кадри DXT1 підряд).
//   Кадр = N = ((w+3)/4)·((h+3)/4) блоків DXT1, рядками блоків зліва направо, але «площинами»
//   (SAnimation::NextFrame @0x4660a0): спершу N×u32 кінцевих кольорів (c0|c1<<16), потім N×u32 індексів.
//
//   node tools/swine-anif.js info <file.anif>
//   node tools/swine-anif.js frames <file.anif> <out-dir> [кожен N-й кадр]   — кадри у PNG
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const MAGIC = Buffer.from([0x53, 0x72, 0x1A, 0x1B, 0x0D, 0x0A, 0x87, 0x0A]);

function read(file) {
  const b = fs.readFileSync(file);
  if (!b.subarray(0, 8).equals(MAGIC)) throw new Error('not an anif');
  const tag = b.toString('latin1', 8, 12), size = b.readUInt32LE(12);
  const w = b.readUInt32LE(16), h = b.readUInt32LE(20), frames = b.readUInt32LE(24);
  const packed = b.subarray(28, 16 + size);
  const data = tag === 'ANI2' ? zlib.zstdDecompressSync(packed) : packed;
  const bw = (w + 3) >> 2, bh = (h + 3) >> 2, frameBytes = bw * bh * 8;
  if (data.length !== frameBytes * frames) throw new Error(`size mismatch ${data.length} != ${frameBytes * frames}`);
  return { tag, w, h, frames, bw, bh, frameBytes, data };
}

// Пише .anif: frames — масив RGBA-буферів w×h (альфа < 128 → прозорий піксель DXT1).
function write(file, w, h, frames) {
  const bw = (w + 3) >> 2, bh = (h + 3) >> 2, out = Buffer.alloc(bw * bh * 8 * frames.length);
  frames.forEach((px, f) => planar(dxt1(px, w, h)).copy(out, f * bw * bh * 8));
  const packed = zlib.zstdCompressSync(out, { params: { [zlib.constants.ZSTD_c_compressionLevel]: 19 } });
  const hdr = Buffer.alloc(28); MAGIC.copy(hdr); hdr.write('ANI2', 8, 'latin1');
  hdr.writeUInt32LE(12 + packed.length, 12); hdr.writeUInt32LE(w, 16); hdr.writeUInt32LE(h, 20); hdr.writeUInt32LE(frames.length, 24);
  fs.writeFileSync(file, Buffer.concat([hdr, packed]));
}

const to565 = c => ((Math.round(c[0] / 255 * 31) & 31) << 11) | ((Math.round(c[1] / 255 * 63) & 63) << 5) | (Math.round(c[2] / 255 * 31) & 31);
const from565 = v => [((v >> 11) & 31) * 255 / 31, ((v >> 5) & 63) * 255 / 63, (v & 31) * 255 / 31];

// DXT1-кодер: кінці — найдальша пара по головній осі (проста PCA-апроксимація), 1-бітна альфа.
function dxt1(px, w, h) {
  const bw = (w + 3) >> 2, bh = (h + 3) >> 2, out = Buffer.alloc(bw * bh * 8);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    const cols = [], idx = [];
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const X = Math.min(w - 1, bx * 4 + x), Y = Math.min(h - 1, by * 4 + y), q = (Y * w + X) * 4;
      const c = [px[q], px[q + 1], px[q + 2], px[q + 3]]; cols.push(c);
    }
    const opaque = cols.filter(c => c[3] >= 128), hasT = opaque.length < 16, o = (by * bw + bx) * 8;
    if (!opaque.length) { out.writeUInt16LE(0, o); out.writeUInt16LE(0, o + 2); out.writeUInt32LE(0xFFFFFFFF, o + 4); continue; }
    // кінці: найтемніший і найсвітліший уздовж осі з найбільшим розкидом
    const mean = [0, 1, 2].map(k => opaque.reduce((a, c) => a + c[k], 0) / opaque.length);
    let axis = [0, 1, 2].map(k => Math.max(...opaque.map(c => c[k])) - Math.min(...opaque.map(c => c[k])));
    if (!axis.some(Boolean)) axis = [1, 1, 1];
    const proj = c => (c[0] - mean[0]) * axis[0] + (c[1] - mean[1]) * axis[1] + (c[2] - mean[2]) * axis[2];
    let lo = opaque[0], hi = opaque[0]; for (const c of opaque) { if (proj(c) < proj(lo)) lo = c; if (proj(c) > proj(hi)) hi = c; }
    let c0 = to565(hi), c1 = to565(lo);
    // 4-кольоровий режим вимагає c0 > c1, 3-кольоровий + прозорий — c0 <= c1
    if (hasT ? c0 > c1 : c0 < c1) [c0, c1] = [c1, c0];
    if (!hasT && c0 === c1) { if (c1 > 0) c1--; else c0++; }
    const p0 = from565(c0), p1 = from565(c1);
    const pal = hasT ? [p0, p1, p0.map((v, k) => (v + p1[k]) / 2)] : [p0, p1, p0.map((v, k) => (2 * v + p1[k]) / 3), p0.map((v, k) => (v + 2 * p1[k]) / 3)];
    let bits = 0;
    cols.forEach((c, i) => {
      let best = 0;
      if (hasT && c[3] < 128) best = 3;
      else { let bd = 1e9; pal.forEach((p, k) => { const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2; if (d < bd) { bd = d; best = k; } }); }
      bits |= best << (i * 2);
    });
    out.writeUInt16LE(c0, o); out.writeUInt16LE(c1, o + 2); out.writeUInt32LE(bits >>> 0, o + 4);
  }
  return out;
}

// Звичайні блоки DXT1 (8 байт) ↔ площинний кадр ANI2.
function planar(b) { const n = b.length / 8, o = Buffer.alloc(b.length); for (let i = 0; i < n; i++) { b.copy(o, i * 4, i * 8, i * 8 + 4); b.copy(o, (n + i) * 4, i * 8 + 4, i * 8 + 8); } return o; }
function interleaved(p) { const n = p.length / 8, o = Buffer.alloc(p.length); for (let i = 0; i < n; i++) { p.copy(o, i * 8, i * 4, i * 4 + 4); p.copy(o, i * 8 + 4, (n + i) * 4, (n + i) * 4 + 4); } return o; }

function decodeFrame(a, f) {
  const px = Buffer.alloc(a.w * a.h * 4), base = 0, d = a.tag === 'ANI2' ? interleaved(a.data.subarray(f * a.frameBytes, (f + 1) * a.frameBytes)) : a.data.subarray(f * a.frameBytes);
  for (let by = 0; by < a.bh; by++) for (let bx = 0; bx < a.bw; bx++) {
    const o = base + (by * a.bw + bx) * 8, c0 = d.readUInt16LE(o), c1 = d.readUInt16LE(o + 2), bits = d.readUInt32LE(o + 4);
    const p0 = from565(c0), p1 = from565(c1);
    const pal = c0 > c1 ? [p0, p1, p0.map((v, k) => (2 * v + p1[k]) / 3), p0.map((v, k) => (v + 2 * p1[k]) / 3)].map(p => [...p, 255])
                        : [[...p0, 255], [...p1, 255], [...p0.map((v, k) => (v + p1[k]) / 2), 255], [0, 0, 0, 0]];
    for (let i = 0; i < 16; i++) {
      const x = bx * 4 + (i & 3), y = by * 4 + (i >> 2); if (x >= a.w || y >= a.h) continue;
      const c = pal[(bits >>> (i * 2)) & 3], q = (y * a.w + x) * 4; px[q] = c[0]; px[q + 1] = c[1]; px[q + 2] = c[2]; px[q + 3] = c[3];
    }
  }
  return px;
}

function png(file, w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h); for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = b => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const ch = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ch('IHDR', ihdr), ch('IDAT', zlib.deflateSync(raw)), ch('IEND', Buffer.alloc(0))]));
}

module.exports = { read, write, decodeFrame, png, dxt1 };

if (require.main === module) {
  const [cmd, file, out, step = '25'] = process.argv.slice(2);
  const a = read(file);
  if (cmd === 'info') {
    let transparent = 0; const px = decodeFrame(a, 0); for (let i = 3; i < px.length; i += 4) if (!px[i]) transparent++;
    console.log(`${a.tag} ${a.w}x${a.h} frames=${a.frames} frameBytes=${a.frameBytes} transparentPx(frame0)=${transparent}/${a.w * a.h}`);
  } else if (cmd === 'frames') {
    fs.mkdirSync(out, { recursive: true });
    for (let f = 0; f < a.frames; f += +step) png(path.join(out, `f${String(f).padStart(3, '0')}.png`), a.w, a.h, decodeFrame(a, f));
  }
}

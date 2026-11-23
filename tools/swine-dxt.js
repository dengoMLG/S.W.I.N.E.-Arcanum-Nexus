#!/usr/bin/env node
// Текстури моделей S.W.I.N.E. (.dxt): перевірка і перегляд усіх mip-рівнів.
//
// Формат: сигнатура 53 72 1A 1B 0D 0A 87 0A, чанк "TEXT" + u32 розмір; u32 3, u32 W, u32 H, fourcc
// ("DXT1"/"DXT5"), далі всі mip-рівні від W×H до 1×1 підряд (блоки 4×4; рівні 2×2 і 1×1 — по одному блоку).
//
//   node tools/swine-dxt.js info <file.dxt>                 — розміри, кількість рівнів, середній колір/альфа на рівень
//   node tools/swine-dxt.js png  <file.dxt> <out-dir>        — кожен рівень у PNG: RGB | альфа-маска поруч
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');

function read(file) {
  const b = fs.readFileSync(file);
  const tag = b.toString('latin1', 8, 12), size = b.readUInt32LE(12);
  const ver = b.readUInt32LE(16), W = b.readUInt32LE(20), H = b.readUInt32LE(24), fourcc = b.toString('latin1', 28, 32);
  const bpb = fourcc === 'DXT1' ? 8 : 16, levels = [];
  let p = 32, w = W, h = H;
  while (true) {
    const bw = Math.max(1, (w + 3) >> 2), bh = Math.max(1, (h + 3) >> 2), n = bw * bh * bpb;
    if (p + n > b.length) break;
    levels.push({ w, h, data: b.subarray(p, p + n) }); p += n;
    if (w === 1 && h === 1) break;
    w = Math.max(1, w >> 1); h = Math.max(1, h >> 1);
  }
  return { tag, size, ver, W, H, fourcc, bpb, levels, rest: b.length - p, fileSize: b.length };
}
const c565 = v => [((v >> 11) & 31) * 255 / 31, ((v >> 5) & 63) * 255 / 63, (v & 31) * 255 / 31];
function decodeLevel(t, L) {
  const { w, h, data } = L, px = Buffer.alloc(w * h * 4), bw = Math.max(1, (w + 3) >> 2), bh = Math.max(1, (h + 3) >> 2);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    const o = (by * bw + bx) * t.bpb, a = new Array(16).fill(255);
    let co = o;
    if (t.bpb === 16) {
      const a0 = data[o], a1 = data[o + 1];
      const lv = a0 > a1 ? [a0, a1, ...[1, 2, 3, 4, 5, 6].map(i => ((6 - i + 1) * a0 + i * a1) / 7)] : [a0, a1, ...[1, 2, 3, 4].map(i => ((5 - i) * a0 + i * a1) / 5), 0, 255];
      let bits = 0n; for (let k = 0; k < 6; k++) bits |= BigInt(data[o + 2 + k]) << BigInt(8 * k);
      for (let i = 0; i < 16; i++) a[i] = lv[Number((bits >> BigInt(3 * i)) & 7n)];
      co = o + 8;
    }
    const v0 = data.readUInt16LE(co), v1 = data.readUInt16LE(co + 2), idx = data.readUInt32LE(co + 4);
    const p0 = c565(v0), p1 = c565(v1);
    const pal = (v0 > v1 || t.bpb === 16) ? [p0, p1, p0.map((v, k) => (2 * v + p1[k]) / 3), p0.map((v, k) => (v + 2 * p1[k]) / 3)]
                                          : [p0, p1, p0.map((v, k) => (v + p1[k]) / 2), [0, 0, 0]];
    for (let i = 0; i < 16; i++) {
      const x = bx * 4 + (i & 3), y = by * 4 + (i >> 2); if (x >= w || y >= h) continue;
      const c = pal[(idx >>> (2 * i)) & 3], q = (y * w + x) * 4;
      px[q] = c[0]; px[q + 1] = c[1]; px[q + 2] = c[2]; px[q + 3] = a[i];
    }
  }
  return px;
}
function png(file, w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = b => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const ch = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ch('IHDR', ih), ch('IDAT', zlib.deflateSync(raw)), ch('IEND', Buffer.alloc(0))]));
}
module.exports = { read, decodeLevel };

if (require.main === module) {
  const [cmd, file, out] = process.argv.slice(2);
  const t = read(file);
  if (cmd === 'info') {
    console.log(`${t.tag} size=${t.size} ver=${t.ver} ${t.W}x${t.H} ${t.fourcc} levels=${t.levels.length} trailing=${t.rest} file=${t.fileSize}`);
    t.levels.forEach((L, i) => {
      const px = decodeLevel(t, L), n = L.w * L.h, s = [0, 0, 0, 0]; let paint = 0;
      for (let k = 0; k < n; k++) { for (let c = 0; c < 4; c++) s[c] += px[k * 4 + c]; if (px[k * 4 + 3] > 127) paint++; }
      console.log(`  mip ${i} ${L.w}x${L.h}: avg rgb ${s.slice(0, 3).map(v => Math.round(v / n)).join(',')} alpha ${Math.round(s[3] / n)}  alpha>127: ${(100 * paint / n).toFixed(1)}%`);
    });
  } else if (cmd === 'png') {
    fs.mkdirSync(out, { recursive: true });
    t.levels.forEach((L, i) => {
      if (L.w < 8) return;
      const px = decodeLevel(t, L), rgb = Buffer.alloc(L.w * 2 * L.h * 3);
      for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
        const q = (y * L.w + x) * 4, o1 = (y * L.w * 2 + x) * 3, o2 = o1 + L.w * 3;
        rgb[o1] = px[q]; rgb[o1 + 1] = px[q + 1]; rgb[o1 + 2] = px[q + 2]; rgb[o2] = rgb[o2 + 1] = rgb[o2 + 2] = px[q + 3];
      }
      png(path.join(out, `${path.basename(file, '.dxt')}_mip${i}_${L.w}.png`), L.w * 2, L.h, rgb);
    });
  }
}

#!/usr/bin/env node
// Прибирає геометрію вказаних вузлів моделі .4d, залишаючи самі вузли (рушій шукає їх за іменами —
// напр. "Cso" для віддачі ствола, тож видаляти вузол не можна). Замість сітки — один вироджений трикутник.
//
//   node tools/swine-4d-strip.js <in.4d> <out.4d> Cso [ІншийВузол ...]
'use strict';
const fs = require('fs');
const [inp, out, ...names] = process.argv.slice(2);
const b = fs.readFileSync(inp);
const chunk = (tag, body) => { const h = Buffer.alloc(8); h.write(tag, 0, 'latin1'); h.writeUInt32LE(body.length, 4); return Buffer.concat([h, body]); };
const parts = []; let p = 20, stripped = [];
while (p < b.length) {
  const tag = b.toString('latin1', p, p + 4), sz = b.readUInt32LE(p + 4), end = p + 8 + sz;
  if (tag !== 'MESH') { parts.push(b.subarray(p, end)); p = end; continue; }
  let q = p + 8; const nl = b.readUInt16LE(q), name = b.toString('latin1', q + 2, q + 2 + nl); const hdrEnd = q + 2 + nl + 52;
  if (!names.includes(name)) { parts.push(b.subarray(p, end)); p = end; continue; }
  // Підчанки: BBOX, VERT, FACE, MTLS — переписуємо VERT/FACE/MTLS, BBOX — у точку.
  let texName = null; q = hdrEnd;
  while (q < end) { const t = b.toString('latin1', q, q + 4), s = b.readUInt32LE(q + 4); if (t === 'MTLS') { const m = b.toString('latin1', q + 8, q + 8 + s).match(/DIFF..\x00\x00..([\x20-\x7e]+)/s); if (m) texName = m[1]; } q += 8 + s; }
  const vb = Buffer.alloc(8 + 3 * 32); vb.writeUInt32LE(3, 0);
  const fb = Buffer.alloc(4 + 6); fb.writeUInt32LE(1, 0); fb.writeUInt16LE(0, 4); fb.writeUInt16LE(1, 6); fb.writeUInt16LE(2, 8);
  const tn = Buffer.from(texName || 'lanctalp.tga', 'latin1'), db = Buffer.alloc(2); db.writeUInt16LE(tn.length, 0);
  const mh = Buffer.alloc(12); mh.writeUInt32LE(1, 0); mh.writeUInt32LE(0, 4); mh.writeUInt32LE(3, 8);
  const one = Buffer.alloc(4); one.writeUInt32LE(1, 0);
  const body = Buffer.concat([b.subarray(p + 8, hdrEnd), chunk('BBOX', Buffer.alloc(96)), chunk('VERT', vb), chunk('FACE', fb),
    chunk('MTLS', Buffer.concat([one, chunk('MATE', Buffer.concat([mh, chunk('DIFF', Buffer.concat([db, tn]))]))]))]);
  parts.push(chunk('MESH', body)); stripped.push(name); p = end;
}
const scen = Buffer.concat([Buffer.from('v100', 'latin1'), ...parts]);
const head = Buffer.from(b.subarray(0, 8)), sh = Buffer.alloc(8); sh.write('SCEN', 0, 'latin1'); sh.writeUInt32LE(scen.length, 4);
fs.writeFileSync(out, Buffer.concat([head, sh, scen]));
console.log(`${inp}: прибрано геометрію ${stripped.join(', ') || '(нічого)'} → ${out}`);

#!/usr/bin/env node
// Сетевые карты из карт кампании S.W.I.N.E.: gamedata/base/multimaps/(8) Arc <Name>.scene.
//
//   node tools/make-mp-maps.js <out-dir>        (out-dir — теки мода: пишемо <out>/gamedata/base/multimaps)
//
// Формат .scene (розібрано з multimaps гри):
//   "Sr\x1a\x1b\r\n\x87\n" "MAPF" u32 | "v100" | "MIN2" u32 300×300×4 — превʼю мапи в лобі
//                                      | "CMPR" u32 (u32 розмір + кадр zstd) → "INNR" з чанками:
//   TSET HMAP BLNx TILx LITE DOO2 PLAY UNIT SP.3 SPS3 SHDR AMBI LAK3 CAM  LOC2 [TRIG — лише в місіях]
//   LOC2 — області: u32 місткість, i32 голова вільних, u32 кількість; слот = i32 0x7FFFFFFF + x0 z0 x1 z1
//   (клітинки), u16+назва, i32 колір; вільний слот — лише i32 наступний. Мережеві мапи мають "start 1".."start 8"
//   (старт гравця N), одну "CTF" (прапор) і кілька "DOM" (точки захоплення).
//
// Що робимо з місією: прибираємо юніти (UNIT = 0), скрипти (TRIG) і дані ІІ кампанії (SP.3/SPS3 — як у мережевих
// мапах), PLAY беремо з ванільної мапи на 8 гравців. Рельєф, текстури, об'єкти, озера, звук і превʼю — як були.
// Старти ставимо на позиції юнітів кампанії (вони гарантовано на прохідній землі): непарні (1, 3, 5, 7) — на боці
// бази гравця в кампанії ("start 1"), парні — на протилежному. Вставка в exe садить союзників на найближчі вільні
// старти, тож команди опиняються на своїх боках. CTF — посередині між сторонами, DOM — уздовж середньої лінії.
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib'), crypto = require('crypto');
const GAME = 'A:/SteamLibrary/steamapps/common/SWINE HD Remaster';
const OUT = path.join(path.resolve(process.argv[2] || 'mods-test/arcunits'), 'gamedata/base/multimaps');
const PAK = path.join(GAME, 'gamedata/base/base.pak');
const MAGIC = Buffer.from([0x53, 0x72, 0x1A, 0x1B, 0x0D, 0x0A, 0x87, 0x0A]);

function pakEntries(pakPath, rx) {
  const fd = fs.openSync(pakPath, 'r'), h = Buffer.alloc(16); fs.readSync(fd, h, 0, 16, 0);
  const isz = h.readUInt32LE(12), ib = Buffer.alloc(isz); fs.readSync(fd, ib, 0, isz, 16);
  let p = 0, prev = ''; const par = {}, out = [];
  while (p < isz) {
    const pre = ib[p], nl = ib[p + 1], src = (p in par) ? par[p] : prev;
    const name = src.slice(0, pre) + ib.toString('latin1', p + 2, p + 2 + nl), q = p + 2 + nl;
    const C = ib.readUInt32LE(q + 9); if (C) par[C] = name;
    if (rx.test(name)) { const b = Buffer.alloc(ib.readUInt32LE(q + 4)); fs.readSync(fd, b, 0, b.length, 16 + isz + ib.readUInt32LE(q)); out.push([name, b]); }
    prev = name; p = q + 13;
  }
  fs.closeSync(fd); return out;
}
const chunk = (tag, body) => { const h = Buffer.alloc(8); h.write(tag, 0, 'latin1'); h.writeUInt32LE(body.length, 4); return Buffer.concat([h, body]); };

function readScene(b) {
  if (!b.subarray(0, 8).equals(MAGIC) || b.toString('latin1', 8, 12) !== 'MAPF' || b.toString('latin1', 16, 20) !== 'v100') throw new Error('not a MAPF v100 scene');
  let p = 20; const top = {};
  while (p < b.length) { const t = b.toString('latin1', p, p + 4), s = b.readUInt32LE(p + 4); top[t] = b.subarray(p + 8, p + 8 + s); p += 8 + s; }
  const raw = zlib.zstdDecompressSync(top.CMPR.subarray(4));
  if (raw.length !== top.CMPR.readUInt32LE(0) || raw.toString('latin1', 0, 4) !== 'INNR') throw new Error('bad CMPR');
  const inner = []; let o = 8;
  while (o < raw.length) { const t = raw.toString('latin1', o, o + 4), s = raw.readUInt32LE(o + 4); inner.push([t, raw.subarray(o + 8, o + 8 + s)]); o += 8 + s; }
  return { min2: top.MIN2, inner };
}
function writeScene(min2, inner) {
  const innr = chunk('INNR', Buffer.concat(inner.map(([t, b]) => chunk(t, b))));
  const usz = Buffer.alloc(4); usz.writeUInt32LE(innr.length, 0);
  const cmpr = chunk('CMPR', Buffer.concat([usz, zlib.zstdCompressSync(innr, { params: { [zlib.constants.ZSTD_c_compressionLevel]: 19 } })]));
  const body = Buffer.concat([Buffer.from('v100', 'latin1'), chunk('MIN2', min2), cmpr]);
  return Buffer.concat([MAGIC, chunk('MAPF', body).subarray(0, 8), body]);
}
function parseLoc(L) {
  const cap = L.readUInt32LE(0); let o = 12; const areas = [];
  for (let i = 0; i < cap; i++) {
    const m = L.readInt32LE(o); o += 4; if (m !== 0x7FFFFFFF) continue;
    const x0 = L.readInt32LE(o), z0 = L.readInt32LE(o + 4), x1 = L.readInt32LE(o + 8), z1 = L.readInt32LE(o + 12), nl = L.readUInt16LE(o + 16);
    const name = L.toString('latin1', o + 18, o + 18 + nl); o += 18 + nl; const color = L.readInt32LE(o); o += 4;
    areas.push({ x0, z0, x1, z1, name, color });
  }
  return areas;
}
function buildLoc(areas) {
  const parts = [Buffer.alloc(12)]; parts[0].writeUInt32LE(areas.length, 0); parts[0].writeInt32LE(-1, 4); parts[0].writeUInt32LE(areas.length, 8);
  for (const a of areas) {
    const h = Buffer.alloc(24); h.writeInt32LE(0x7FFFFFFF, 0); h.writeInt32LE(a.x0, 4); h.writeInt32LE(a.z0, 8); h.writeInt32LE(a.x1, 12); h.writeInt32LE(a.z1, 16);
    h.writeUInt16LE(a.name.length, 20);
    const c = Buffer.alloc(4); c.writeInt32LE(a.color, 0);
    parts.push(h.subarray(0, 22), Buffer.from(a.name, 'latin1'), c);
  }
  return Buffer.concat(parts);
}
// Позиції юнітів місії: UNIT = u32 кількість + чанки "unit" (u16+назва, підчанки posi: f32 x, z…, plr3: i32 гравець…).
function unitPositions(U) {
  const n = U.readUInt32LE(0), out = []; let o = 4;
  for (let i = 0; i < n && o < U.length; i++) {
    const t = U.toString('latin1', o, o + 4), s = U.readUInt32LE(o + 4); if (t !== 'unit') break;
    const body = U.subarray(o + 8, o + 8 + s), nl = body.readUInt16LE(0), name = body.toString('latin1', 2, 2 + nl);
    let q = 2 + nl, x = null, z = null, player = null;
    while (q + 8 <= body.length) { const ct = body.toString('latin1', q, q + 4), cs = body.readUInt32LE(q + 4);
      if (ct === 'posi') { x = body.readFloatLE(q + 8); z = body.readFloatLE(q + 12); }
      if (ct === 'plr3') player = body.readInt32LE(q + 8);
      q += 8 + cs; }
    if (x !== null) out.push({ name, x, z, player });
    o += 8 + s;
  }
  return out;
}

const NAMES = { stahlstadt: 'Stahlstadt', halalhago: 'Death Pass', banyatelep: 'Mining Camp', jegmezo: 'Ice Field', jungel: 'Jungle Run',
  raboil_area: 'Raboil Area', 'a forras tul messze': 'A Spring Too Far', repafalva: 'Carrot Village', repter: 'Airfield',
  rabbipolis: 'Rabbipolis', gatrobbantok: 'Dam Busters', irontusk_castle: 'Irontusk Castle' };
const nameOf = file => { const stem = path.basename(file, '.scene').replace(/^(d|ny)_\d+_/, ''); return NAMES[stem] || null; };

const vanilla8 = readScene(fs.readFileSync(path.join(GAME, 'gamedata/base/multimaps/(8) the hill.scene')));
const v8 = Object.fromEntries(vanilla8.inner);
fs.mkdirSync(OUT, { recursive: true });
const seen = new Map(), report = [], written = new Set();
for (const f of fs.readdirSync(OUT)) if (f.startsWith('(8) Arc ')) fs.rmSync(path.join(OUT, f));
for (const [file, data] of pakEntries(PAK, /^missions\/(d|ny)_\d+_.*\.scene$/i).sort((a, b) => a[0].localeCompare(b[0]))) {
  const title = nameOf(file); if (!title) continue;
  const scn = readScene(data), ch = Object.fromEntries(scn.inner);
  const hmap = crypto.createHash('md5').update(ch.HMAP).digest('hex');
  if (seen.has(hmap)) { report.push(`${file}: same terrain as ${seen.get(hmap)} — skipped`); continue; }
  seen.set(hmap, file);
  const W = ch.HMAP.readUInt32LE(0), H = ch.HMAP.readUInt32LE(4), B = 48;       // поле гри — [48, розмір − 48]
  const inside = (x, z) => x >= B + 6 && x <= W - B - 6 && z >= B + 6 && z <= H - B - 6;
  const areas = parseLoc(ch.LOC2), units = unitPositions(ch.UNIT);
  const cand = units.filter(u => inside(u.x, u.z)).map(u => ({ x: u.x, z: u.z }));
  for (const a of areas) { const x = (a.x0 + a.x1) / 2, z = (a.z0 + a.z1) / 2; if (inside(x, z) && a.x1 - a.x0 < 20 && a.z1 - a.z0 < 20) cand.push({ x, z }); }
  const s1 = areas.find(a => /^start 1$/i.test(a.name));
  if (!s1 || cand.length < 20) { report.push(`${file}: no start 1 or too few positions — skipped`); continue; }
  // Ось сторін: від бази гравця кампанії до найдальшої позиції.
  const A = { x: (s1.x0 + s1.x1) / 2, z: (s1.z0 + s1.z1) / 2 };
  const far = cand.reduce((m, c) => Math.hypot(c.x - A.x, c.z - A.z) > Math.hypot(m.x - A.x, m.z - A.z) ? c : m, cand[0]);
  const ax = far.x - A.x, az = far.z - A.z, len = Math.hypot(ax, az), ux = ax / len, uz = az / len;
  const t = c => ((c.x - A.x) * ux + (c.z - A.z) * uz) / len;                     // 0 — база гравця, 1 — дальній край
  // 4 старти на боці: найдальші одна від одної точки з краю сторони (жадібно), не ближче 9 клітинок.
  // Старти одного боку — не ближче MinGap клітинок і не далі 45 від якоря; бік поступово ширшає, якщо місця мало.
  function pick(side, n) {
    const anchor = side === 0 ? (inside(A.x, A.z) ? A : null) : far;
    for (const [lim, gap, maxd] of [[0.3, 12, 45], [0.4, 10, 55], [0.5, 9, 70], [0.5, 8, 95]]) {
      const pool = cand.filter(c => side === 0 ? t(c) <= lim : t(c) >= 1 - lim);
      const res = [anchor || pool[0]]; if (!res[0]) continue;
      while (res.length < n) {
        let best = null, bd = -1;
        for (const c of pool) { const d = Math.min(...res.map(r => Math.hypot(r.x - c.x, r.z - c.z)));
          const da = Math.hypot(c.x - res[0].x, c.z - res[0].z); if (d >= gap && da <= maxd && (bd < 0 || d < bd)) { bd = d; best = c; } }
        if (!best) break; res.push(best);                                               // найближча допустима — команда купчиться
      }
      if (res.length === n) return res;
    }
    return [];
  }
  const sideA = pick(0, 4), sideB = pick(1, 4);
  if (sideA.length < 4 || sideB.length < 4) { report.push(`${file}: could not place 8 starts — skipped`); continue; }
  const box = (c, r, name, color) => ({ x0: Math.round(c.x - r), z0: Math.round(c.z - r), x1: Math.round(c.x + r), z1: Math.round(c.z + r), name, color });
  const loc = [];
  for (let i = 0; i < 4; i++) { loc.push(box(sideA[i], 4, `start ${2 * i + 1}`, 4)); loc.push(box(sideB[i], 4, `start ${2 * i + 2}`, 4)); }
  loc.sort((a, b) => +a.name.split(' ')[1] - +b.name.split(' ')[1]);
  // Прапор — на прохідній точці, найближчій до середини між центрами сторін; DOM — уздовж середньої смуги.
  const cA = sideA.reduce((m, c) => ({ x: m.x + c.x / 4, z: m.z + c.z / 4 }), { x: 0, z: 0 }), cB = sideB.reduce((m, c) => ({ x: m.x + c.x / 4, z: m.z + c.z / 4 }), { x: 0, z: 0 });
  const M = { x: (cA.x + cB.x) / 2, z: (cA.z + cB.z) / 2 }, dM = c => Math.hypot(c.x - M.x, c.z - M.z);
  const mid = cand.filter(c => Math.abs(t(c) - 0.5) < 0.15).sort((a, b) => dM(a) - dM(b));
  const ctf = [...cand].sort((a, b) => dM(a) - dM(b))[0];
  loc.push(box(ctf, 1, 'CTF', 5));
  const dom = [ctf];
  for (const c of mid) { if (dom.length >= 5) break; if (dom.every(d => Math.hypot(d.x - c.x, d.z - c.z) >= 14)) dom.push(c); }
  for (const d of dom.slice(1)) loc.push(box(d, 1, 'DOM', 5));
  // Збираємо сцену в порядку ванільних мережевих мап (без TRIG).
  const order = ['TSET', 'HMAP', 'BLNx', 'TILx', 'LITE', 'DOO2', 'PLAY', 'UNIT', 'SP.3', 'SPS3', 'SHDR', 'AMBI', 'LAK3', 'CAM ', 'LOC2'];
  const repl = { PLAY: v8.PLAY, UNIT: Buffer.alloc(4), 'SP.3': v8['SP.3'], SPS3: v8.SPS3, LOC2: buildLoc(loc) };
  const inner = order.map(tag => { const b = repl[tag] || ch[tag]; if (!b) throw new Error(`${file}: no ${tag}`); return [tag, b]; });
  let outName = `(8) Arc ${title}.scene`;
  if (fs.existsSync(path.join(OUT, outName)) && written.has(outName)) outName = `(8) Arc ${title} II.scene`;   // та сама місцевість у другій кампанії, інший рельєф
  written.add(outName);
  const bytes = writeScene(scn.min2, inner);
  readScene(bytes);                                                                   // самоперевірка
  fs.writeFileSync(path.join(OUT, outName), bytes);
  report.push(`${outName} ← ${file}: ${W}×${H}, starts A ${sideA.map(c => `${c.x | 0},${c.z | 0}`).join(' ')} | B ${sideB.map(c => `${c.x | 0},${c.z | 0}`).join(' ')}, CTF ${ctf.x | 0},${ctf.z | 0}, DOM ${dom.length - 1}`);
}
console.log(report.join('\n'));

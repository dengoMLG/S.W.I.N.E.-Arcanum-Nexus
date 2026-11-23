#!/usr/bin/env node
// Собирает живую 3D-сцену фона главного меню (missions/menu_background.scene) для мод-пака Arcanum Nexus:
// 1. Делает статические пред-окрашенные копии всех 10 новых танков в objects/arcanum_menu/
//    (запекает шейдер COLORIZE в RGB и ставит alpha=255, чтобы DOO2-объекты рендерились в ярких цветах фракций).
// 2. Добавляет в DOO2-чанк menu_background.scene оба укреплённых лагеря (Свиньи слева, Кролики справа):
//    все 10 новых танков, бункеры, палатки, гигантские флаги фракций, статую моркови, вертолёты, ежи и бочки.
// 3. Обновляет освещение (LITE) для более атмосферной контрастной картинки.
//
// Запуск:
//   node tools/build-menu-scene.js [out-root]
// По умолчанию out-root = mods-test/arcunits/gamedata/base
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const DXT = require('./swine-dxt');

const ROOT = path.resolve(__dirname, '..');
const GAME = process.env.SWINE_DIR || 'A:/SteamLibrary/steamapps/common/SWINE HD Remaster';
const PAK_PATH = path.join(GAME, 'gamedata/base/base.pak');
const OUT_BASE = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(ROOT, 'mods-test/arcunits/gamedata/base');

const MAGIC = Buffer.from([0x53, 0x72, 0x1a, 0x1b, 0x0d, 0x0a, 0x87, 0x0a]);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const to565 = c =>
  ((Math.round(clamp(c[0], 0, 1) * 31) & 31) << 11) |
  ((Math.round(clamp(c[1], 0, 1) * 63) & 63) << 5) |
  (Math.round(clamp(c[2], 0, 1) * 31) & 31);
const from565 = v => [((v >> 11) & 31) / 31, ((v >> 5) & 63) / 63, (v & 31) / 31];

function readPakEntry(pakPath, want) {
  const wantLow = want.toLowerCase();
  const fd = fs.openSync(pakPath, 'r');
  const h = Buffer.alloc(16);
  fs.readSync(fd, h, 0, 16, 0);
  const isz = h.readUInt32LE(12);
  const ib = Buffer.alloc(isz);
  fs.readSync(fd, ib, 0, isz, 16);
  let p = 0, prev = '';
  const par = {};
  while (p < isz) {
    const pre = ib[p], nl = ib[p + 1], src = (p in par) ? par[p] : prev;
    const name = src.slice(0, pre) + ib.toString('latin1', p + 2, p + 2 + nl);
    const q = p + 2 + nl;
    const C = ib.readUInt32LE(q + 9);
    if (C) par[C] = name;
    if (name.toLowerCase() === wantLow) {
      const r = Buffer.alloc(ib.readUInt32LE(q + 4));
      fs.readSync(fd, r, 0, r.length, 16 + isz + ib.readUInt32LE(q));
      fs.closeSync(fd);
      return r;
    }
    prev = name;
    p = q + 13;
  }
  fs.closeSync(fd);
  return null;
}

// Кодирование 512x512 RGBA Float32Array в S.W.I.N.E. DXT5 с полным набором mip-уровней
function encodeDxt5(W, px) {
  const parts = [];
  let curW = W, curPx = px;
  while (true) {
    const bw = Math.max(1, curW / 4);
    const out = Buffer.alloc(bw * bw * 16);
    for (let by = 0; by < bw; by++) {
      for (let bx = 0; bx < bw; bx++) {
        const block = [];
        for (let j = 0; j < 4; j++) {
          for (let i = 0; i < 4; i++) {
            const x = Math.min(curW - 1, bx * 4 + i);
            const y = Math.min(curW - 1, by * 4 + j);
            const q = (y * curW + x) * 4;
            block.push([clamp(curPx[q], 0, 1), clamp(curPx[q + 1], 0, 1), clamp(curPx[q + 2], 0, 1)]);
          }
        }
        const lum = c => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
        let lo = block[0], hi = block[0];
        for (const c of block) {
          if (lum(c) < lum(lo)) lo = c;
          if (lum(c) > lum(hi)) hi = c;
        }
        let c0 = to565(hi), c1 = to565(lo);
        if (c0 < c1) [c0, c1] = [c1, c0];
        const p0 = from565(c0), p1 = from565(c1);
        const pal = [
          p0,
          p1,
          p0.map((v, k) => (2 * v + p1[k]) / 3),
          p0.map((v, k) => (v + 2 * p1[k]) / 3),
        ];
        let idx = 0;
        if (c0 !== c1) {
          block.forEach((c, n) => {
            let best = 0, bd = 1e9;
            for (let k = 0; k < 4; k++) {
              const d = (c[0] - pal[k][0]) ** 2 + (c[1] - pal[k][1]) ** 2 + (c[2] - pal[k][2]) ** 2;
              if (d < bd) { bd = d; best = k; }
            }
            idx |= best << (2 * n);
          });
        }
        const o = (by * bw + bx) * 16;
        // Полностью непрозрачная альфа (255) для статических DOO2-объектов
        out[o] = 255;
        out[o + 1] = 255;
        out.writeUInt16LE(c0, o + 8);
        out.writeUInt16LE(c1, o + 10);
        out.writeUInt32LE(idx >>> 0, o + 12);
      }
    }
    parts.push(out);
    if (curW === 1) break;
    const W2 = curW / 2;
    const p2 = new Float32Array(W2 * W2 * 4);
    for (let y = 0; y < W2; y++) {
      for (let x = 0; x < W2; x++) {
        for (let k = 0; k < 4; k++) {
          p2[(y * W2 + x) * 4 + k] = (
            curPx[((2 * y) * curW + 2 * x) * 4 + k] +
            curPx[((2 * y) * curW + 2 * x + 1) * 4 + k] +
            curPx[((2 * y + 1) * curW + 2 * x) * 4 + k] +
            curPx[((2 * y + 1) * curW + 2 * x + 1) * 4 + k]
          ) * 0.25;
        }
      }
    }
    curW = W2;
    curPx = p2;
  }
  const data = Buffer.concat(parts);
  const h = Buffer.alloc(16);
  h.writeUInt32LE(3, 0);
  h.writeUInt32LE(W, 4);
  h.writeUInt32LE(W, 8);
  h.write('DXT5', 12, 'latin1');
  const body = Buffer.concat([h, data]);
  const th = Buffer.alloc(8);
  th.write('TEXT', 0, 'latin1');
  th.writeUInt32LE(body.length, 4);
  return Buffer.concat([MAGIC, th, body]);
}

// Запекание командной окраски по формуле standard.hlsl (#if COLORIZE)
const TEAMS = {
  yellow: [42, 74, 83],
  blue:   [203, 33, 50],
  red:    [3, 62, 60],
  green:  [118, 48, 52],
};
function bakeTeamColorDxt(srcDxtPath, dstDxtPath, race, teamName) {
  const t = DXT.read(srcDxtPath);
  const L0 = t.levels[0];
  const raw = DXT.decodeLevel(t, L0);
  const [H, S, V] = TEAMS[teamName];
  const mul = race === 'pig' ? [3, 2] : [1.333, 1];
  const hue = (n, k = (n + H / 60) % 6) => 1 - Math.max(0, Math.min(k, 4 - k, 1));
  const rgb = [hue(5), hue(3), hue(1)];
  const smul = Math.min(S, 100) / 100 * mul[0];
  const vmul = Math.min(V, 100) / 100 * mul[1];

  const px = new Float32Array(L0.w * L0.h * 4);
  for (let i = 0; i < L0.w * L0.h; i++) {
    let r = raw[i * 4] / 255;
    let g = raw[i * 4 + 1] / 255;
    let b = raw[i * 4 + 2] / 255;
    const a = raw[i * 4 + 3] / 255;
    if (a > 0) {
      const value = Math.max(r, g, b);
      const cmin = Math.min(r, g, b);
      const sat = (value > 0 ? (value - cmin) / value : 1) * smul;
      const val = value * vmul;
      const col = rgb.map(c => (c * sat + (1 - sat)) * val);
      r += (col[0] - r) * a;
      g += (col[1] - g) * a;
      b += (col[2] - b) * a;
    }
    px[i * 4] = clamp(r, 0, 1);
    px[i * 4 + 1] = clamp(g, 0, 1);
    px[i * 4 + 2] = clamp(b, 0, 1);
    px[i * 4 + 3] = 1.0;
  }
  fs.writeFileSync(dstDxtPath, encodeDxt5(L0.w, px));
}

// 1. Статические модели всех 10 новых юнитов в objects/arcanum_menu/
const objDir = path.join(OUT_BASE, 'objects/arcanum_menu');
fs.mkdirSync(objDir, { recursive: true });

// Текстуры гусениц рядом со статическими .4d
for (const trk of ['lanctalp.dxt', 'ny_lanctalp.dxt']) {
  const data = readPakEntry(PAK_PATH, 'units/skinned/' + trk);
  if (data) fs.writeFileSync(path.join(objDir, trk), data);
}

const DISPLAY_TANKS = [
  // Свиньи (левый фланг экрана, X = 36..42)
  { id: 'd_svinczar',      lvl: 'elite',  race: 'pig',    team: 'red'    },
  { id: 'd_hryakgrill',    lvl: 'normal', race: 'pig',    team: 'blue'   },
  { id: 'd_osadnykaban',   lvl: 'normal', race: 'pig',    team: 'blue'   },
  { id: 'd_bombohryak',    lvl: 'normal', race: 'pig',    team: 'red'    },
  { id: 'd_gryazemet',     lvl: 'normal', race: 'pig',    team: 'blue'   },
  // Кролики (правый фланг экрана, X = 23..29)
  { id: 'ny_morkovsmerch', lvl: 'normal', race: 'rabbit', team: 'yellow' },
  { id: 'ny_zayacprizrak', lvl: 'elite',  race: 'rabbit', team: 'green'  },
  { id: 'ny_krotoboy',     lvl: 'normal', race: 'rabbit', team: 'yellow' },
  { id: 'ny_pitstop',      lvl: 'normal', race: 'rabbit', team: 'yellow' },
  { id: 'ny_ushastik',     lvl: 'normal', race: 'rabbit', team: 'yellow' },
];

for (const u of DISPLAY_TANKS) {
  const srcDir = path.join(ROOT, 'mods-test/units', u.id, 'gamedata/base/units/skinned');
  const stem = `${u.id}_${u.lvl}`;
  fs.copyFileSync(path.join(srcDir, `${stem}.4d`), path.join(objDir, `${stem}.4d`));
  bakeTeamColorDxt(path.join(srcDir, `${stem}.dxt`), path.join(objDir, `${stem}.dxt`), u.race, u.team);
}
console.log(`Built ${DISPLAY_TANKS.length} pre-colorized display tanks in ${objDir}`);

// 2. Пересборка missions/menu_background.scene
const origScene = readPakEntry(PAK_PATH, 'missions/menu_background.scene');
if (!origScene) throw new Error('missions/menu_background.scene not found in base.pak');
const dec = zlib.zstdDecompressSync(origScene.subarray(32));

// Разбираем субчанки внутри INNR
const chunks = [];
let p = 8;
while (p + 8 <= dec.length) {
  const tag = dec.toString('latin1', p, p + 4);
  const sz = dec.readUInt32LE(p + 4);
  chunks.push({ tag, data: Buffer.from(dec.subarray(p + 8, p + 8 + sz)) });
  p += 8 + sz;
}

// Разбираем DOO2
const dooChunk = chunks.find(c => c.tag === 'DOO2');
const origCount = dooChunk.data.readUInt32LE(0);
const origObjs = [];
let q = 4;
for (let i = 0; i < origCount; i++) {
  const slen = dooChunk.data.readUInt16LE(q); q += 2;
  const name = dooChunk.data.toString('latin1', q, q + slen); q += slen;
  const x = dooChunk.data.readFloatLE(q);
  const y = dooChunk.data.readFloatLE(q + 4);
  const z = dooChunk.data.readFloatLE(q + 8);
  const ry = dooChunk.data.readFloatLE(q + 12);
  const rx = dooChunk.data.readFloatLE(q + 16);
  const rz = dooChunk.data.readFloatLE(q + 20);
  const fl = dooChunk.data.readUInt32LE(q + 24);
  q += 28;
  origObjs.push({ name, x, y, z, ry, rx, rz, fl });
}

// Убираем пару камней из центра арены (X=32..35, Z=36..38), оставляя всё природное окружение
const keptObjs = origObjs.filter(o => {
  if (/kovek/i.test(o.name) && o.x >= 25 && o.x <= 40 && o.z >= 35 && o.z <= 48) return false;
  return true;
});

const addObj = (name, x, z, ry = 0, y = 0) => ({ name, x, y, z, ry, rx: 0, rz: 0, fl: 0 });

// Ориентация камеры: X=32.5, Z=44.5, Direction=-3.1345 (смотрит в -Z):
//   Экран СЛЕВА = большее X (36..43)
//   Экран СПРАВА = меньшее X (21..29)
//   Экран ВВЕРХУ (дальше) = меньшее Z (34..40)
//   Экран ВНИЗУ (ближе) = большее Z (45..50)
// У наших .4d танков нос смотрит в -Z.
// Поворот ry: +1.95 направляет нос к -X и слегка на камеру (+Z) -> Свиньи слева смотрят вправо-на-зрителя!
//             -1.95 направляет нос к +X и слегка на камеру (+Z) -> Кролики справа смотрят влево-на-зрителя!
const ADDED_OBJS = [
  // ── ЛЕВЫЙ ФЛАНГ (Свиньи — все 5 новых танков + укреплённый лагерь) ──
  addObj('objects\\arcanum_menu\\d_svinczar_elite.4d',      38.4, 44.2,  1.95),
  addObj('objects\\arcanum_menu\\d_hryakgrill_normal.4d',   37.6, 47.4,  2.15),
  addObj('objects\\arcanum_menu\\d_osadnykaban_normal.4d',  39.2, 40.4,  1.75),
  addObj('objects\\arcanum_menu\\d_bombohryak_normal.4d',   41.8, 45.8,  2.05),
  addObj('objects\\arcanum_menu\\d_gryazemet_normal.4d',    41.6, 42.0,  1.85),

  // Укрепления и атрибутика Свиней (слева и по гребню слева)
  addObj('objects\\045 zaszlok\\nagy_zaszlo_pig_1.4d',      43.0, 38.6,  0.40),
  addObj('objects\\05 epuletek\\bunker_1.4d',               43.2, 35.8,  1.25),
  addObj('objects\\05 epuletek\\sator diszno.4d',           44.0, 46.8,  1.50),
  addObj('objects\\06 tereptargyak\\d_helikopter_1k.4d',    40.8, 34.4,  2.20),
  addObj('objects\\06 tereptargyak\\tanktuske.4d',          35.4, 42.5,  0.30),
  addObj('objects\\06 tereptargyak\\tanktuske.4d',          35.2, 45.8,  0.80),
  addObj('objects\\06 tereptargyak\\tanktuske2.4d',         35.8, 39.2,  0.50),
  addObj('objects\\06 tereptargyak\\femhordo1.4d',          42.6, 43.4,  0.20),
  addObj('objects\\06 tereptargyak\\femhordo2.4d',          42.9, 43.9,  1.10),
  addObj('objects\\06 tereptargyak\\falada01.4d',           42.4, 47.4,  0.40),
  addObj('objects\\06 tereptargyak\\falada02.4d',           41.6, 38.2, -0.30),

  // ── ПРАВЫЙ ФЛАНГ (Кролики — все 5 новых танков + укреплённый лагерь) ──
  addObj('objects\\arcanum_menu\\ny_morkovsmerch_normal.4d', 26.8, 43.8, -1.95),
  addObj('objects\\arcanum_menu\\ny_zayacprizrak_elite.4d',  27.4, 47.0, -2.15),
  addObj('objects\\arcanum_menu\\ny_krotoboy_normal.4d',     25.8, 40.2, -1.75),
  addObj('objects\\arcanum_menu\\ny_pitstop_normal.4d',      23.6, 45.2, -2.05),
  addObj('objects\\arcanum_menu\\ny_ushastik_normal.4d',     23.8, 41.6, -1.85),

  // Укрепления и атрибутика Кроликов (справа и по гребню справа)
  addObj('objects\\045 zaszlok\\nagy_zaszlo_rabbit_1.4d',    22.0, 38.6, -0.40),
  addObj('objects\\05 epuletek\\bunker_2.4d',                21.8, 35.8, -1.25),
  addObj('objects\\05 epuletek\\sator01 nyul.4d',            21.2, 46.8, -1.50),
  addObj('objects\\06 tereptargyak\\repaszobor.4d',          23.8, 37.6, -0.35),
  addObj('objects\\06 tereptargyak\\ny_helikopter_1k.4d',    24.4, 34.4, -2.20),
  addObj('objects\\06 tereptargyak\\tabla - mine.4d',        28.8, 40.6,  0.00),
  addObj('objects\\06 tereptargyak\\tanktuske.4d',           29.6, 42.4,  0.40),
  addObj('objects\\06 tereptargyak\\tanktuske.4d',           29.8, 45.8,  0.90),
  addObj('objects\\06 tereptargyak\\sarkanyfog.4d',          29.2, 39.0,  0.00),
  addObj('objects\\06 tereptargyak\\falada01.4d',            22.8, 43.2,  0.60),
  addObj('objects\\06 tereptargyak\\falada02.4d',            22.6, 47.0, -0.50),
  addObj('objects\\06 tereptargyak\\femhordo1.4d',           23.4, 39.2,  0.20),

  // ── ДАЛЬНИЙ ГРЕБЕНЬ (верхний центр — виден над плашкой главного меню) ──
  addObj('objects\\06 tereptargyak\\szogesdrot.4d',          32.5, 38.5,  0.00),
  addObj('objects\\06 tereptargyak\\sarkanyfog.4d',          31.2, 37.2,  0.15),
  addObj('objects\\06 tereptargyak\\sarkanyfog.4d',          33.8, 37.2, -0.15),
  addObj('objects\\06 tereptargyak\\tanktuske2.4d',          32.5, 42.2,  0.70),
];

const finalObjs = [...keptObjs, ...ADDED_OBJS];
const dooParts = [Buffer.alloc(4)];
dooParts[0].writeUInt32LE(finalObjs.length, 0);
for (const o of finalObjs) {
  const nb = Buffer.from(o.name, 'latin1');
  const rec = Buffer.alloc(2 + nb.length + 28);
  rec.writeUInt16LE(nb.length, 0);
  nb.copy(rec, 2);
  const off = 2 + nb.length;
  rec.writeFloatLE(o.x, off);
  rec.writeFloatLE(o.y, off + 4);
  rec.writeFloatLE(o.z, off + 8);
  rec.writeFloatLE(o.ry, off + 12);
  rec.writeFloatLE(o.rx, off + 16);
  rec.writeFloatLE(o.rz, off + 20);
  rec.writeUInt32LE(o.fl >>> 0, off + 24);
  dooParts.push(rec);
}
dooChunk.data = Buffer.concat(dooParts);

// Чуть более выразительное атмосферное освещение (взято из ny_12_irontusk_castle — богаче тени и глубина дымки)
const liteChunk = chunks.find(c => c.tag === 'LITE');
if (liteChunk && liteChunk.data.length === 84) {
  const vals = [20, 40, 15, 70, 0, 0, 75, 135, 50, 20, 50, 70, 10, 130, 0, 0, 0, 0, 0, 0, 20];
  vals.forEach((v, i) => liteChunk.data.writeUInt32LE(v, i * 4));
}

// Сборка INNR и MAPF v100CMPR (zstd)
const innerBody = Buffer.concat(
  chunks.map(c => {
    const hdr = Buffer.alloc(8);
    hdr.write(c.tag, 0, 'latin1');
    hdr.writeUInt32LE(c.data.length, 4);
    return Buffer.concat([hdr, c.data]);
  })
);
const innrHdr = Buffer.alloc(8);
innrHdr.write('INNR', 0, 'latin1');
innrHdr.writeUInt32LE(innerBody.length, 4);
const rawScene = Buffer.concat([innrHdr, innerBody]);
const zstdData = zlib.zstdCompressSync(rawScene);

const mapfHdr = Buffer.alloc(32);
MAGIC.copy(mapfHdr, 0);
mapfHdr.write('MAPF', 8, 'latin1');
mapfHdr.writeUInt32LE(16 + zstdData.length, 12);
mapfHdr.write('v100CMPR', 16, 'latin1');
mapfHdr.writeUInt32LE(4 + zstdData.length, 24);
mapfHdr.writeUInt32LE(rawScene.length, 28);

const outScene = path.join(OUT_BASE, 'missions/menu_background.scene');
fs.mkdirSync(path.dirname(outScene), { recursive: true });
fs.writeFileSync(outScene, Buffer.concat([mapfHdr, zstdData]));
console.log(`Wrote ${outScene}: ${finalObjs.length} objects (${keptObjs.length} kept + ${ADDED_OBJS.length} added), ${(mapfHdr.length + zstdData.length)} bytes (raw ${rawScene.length})`);

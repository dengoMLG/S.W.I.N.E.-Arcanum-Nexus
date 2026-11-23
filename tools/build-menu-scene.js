#!/usr/bin/env node
// Собирает живую 3D-сцену фона главного меню (missions/menu_background.scene) на базе свинского города Штадт / Stahlstadt
// (missions/d_01_stahlstadt.scene) с нашей новой техникой Arcanum Nexus + cameras.ini:
// 1. Делает статические пред-окрашенные копии всех 10 новых танков в objects/arcanum_menu/
//    в формате ver=0 DXT1 (как у всех статических DOO2-объектов игры — без чёрного бага COLORIZE!).
// 2. Берёт свинский город из missions/d_01_stahlstadt.scene (убирает юниты/триггеры кампании),
//    наводит камеру на центральный бульвар и площадь с флагами свинов (X=92.0, Z=78.2),
//    расчищает только деревья на самой площади и расставляет всю нашу новую технику по обе стороны меню.
// 3. Обновляет [missions/menu_background.scene] в gamedata/base/cameras.ini.
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

const MENU_CAM = {
  X: 92.0,
  Z: 78.2,
  Direction: -3.141593,
  Elevation: -0.66,
  Zoom: 23.0,
};

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

// Кодирование WxW RGBA Float32Array в S.W.I.N.E. ver=0 DXT1 (непрозрачный формат статических DOO2-объектов)
function encodeDxt1(W, px) {
  const parts = [];
  let curW = W, curPx = px;
  while (true) {
    const bw = Math.max(1, curW / 4);
    const out = Buffer.alloc(bw * bw * 8);
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
        let idx = 0;
        if (c0 > c1) {
          const p0 = from565(c0), p1 = from565(c1);
          const pal = [
            p0,
            p1,
            p0.map((v, k) => (2 * v + p1[k]) / 3),
            p0.map((v, k) => (v + 2 * p1[k]) / 3),
          ];
          block.forEach((c, n) => {
            let best = 0, bd = 1e9;
            for (let k = 0; k < 4; k++) {
              const d = (c[0] - pal[k][0]) ** 2 + (c[1] - pal[k][1]) ** 2 + (c[2] - pal[k][2]) ** 2;
              if (d < bd) { bd = d; best = k; }
            }
            idx |= best << (2 * n);
          });
        } else {
          // c0 === c1: индекс 0 (непрозрачный), никогда не 3 (в DXT1 3 = прозрачный чёрный при c0 <= c1)
          idx = 0;
        }
        const o = (by * bw + bx) * 8;
        out.writeUInt16LE(c0, o);
        out.writeUInt16LE(c1, o + 2);
        out.writeUInt32LE(idx >>> 0, o + 4);
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
  h.writeUInt32LE(0, 0); // ver = 0 (как у sator.dxt / hordok_dobozok.dxt — без COLORIZE!)
  h.writeUInt32LE(W, 4);
  h.writeUInt32LE(W, 8);
  h.write('DXT1', 12, 'latin1');
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
  fs.writeFileSync(dstDxtPath, encodeDxt1(L0.w, px));
}

// 1. Статические модели всех 10 новых юнитов в objects/arcanum_menu/ (ver=0 DXT1)
const objDir = path.join(OUT_BASE, 'objects/arcanum_menu');
fs.mkdirSync(objDir, { recursive: true });

for (const trk of ['lanctalp.dxt', 'ny_lanctalp.dxt']) {
  const data = readPakEntry(PAK_PATH, 'units/skinned/' + trk);
  if (data) fs.writeFileSync(path.join(objDir, trk), data);
}

const DISPLAY_TANKS = [
  // Свиньи (левый бульвар свинского города)
  { id: 'd_svinczar',      lvl: 'elite',  race: 'pig',    team: 'red'    },
  { id: 'd_hryakgrill',    lvl: 'normal', race: 'pig',    team: 'red'    },
  { id: 'd_osadnykaban',   lvl: 'normal', race: 'pig',    team: 'blue'   },
  { id: 'd_bombohryak',    lvl: 'normal', race: 'pig',    team: 'red'    },
  { id: 'd_gryazemet',     lvl: 'normal', race: 'pig',    team: 'blue'   },
  // Кролики (правый фланг — штурмовой рейд в свинский город)
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
console.log(`Built ${DISPLAY_TANKS.length} DXT1 display tanks in ${objDir}`);

// 2. Пересборка missions/menu_background.scene на основе свинского города (missions/d_01_stahlstadt.scene)
const origScene = readPakEntry(PAK_PATH, 'missions/d_01_stahlstadt.scene');
if (!origScene) throw new Error('missions/d_01_stahlstadt.scene not found in base.pak');
const cmprIdx = origScene.indexOf(Buffer.from('CMPR', 'latin1'));
if (cmprIdx < 0) throw new Error('CMPR chunk not found in d_01_stahlstadt.scene');
const cmprSz = origScene.readUInt32LE(cmprIdx + 4);
const dec = zlib.zstdDecompressSync(origScene.subarray(cmprIdx + 12, cmprIdx + 8 + cmprSz));

// Разбираем субчанки внутри INNR, отбрасываем кампанийные TRIG и приводим служебные чанки к формату menu_background.scene
const VANILLA_PLAY = Buffer.from(
  '0000000000000000000000000100000001000000010000000100000002000000' +
  '0200000000000000020000000000000003000000000000000200000000000000' +
  '0400000000000000020000000000000005000000000000000200000000000000' +
  '0600000000000000020000000000000007000000000000000200000000000000',
  'hex'
);
const chunks = [];
let p = 8;
while (p + 8 <= dec.length) {
  const tag = dec.toString('latin1', p, p + 4);
  const sz = dec.readUInt32LE(p + 4);
  const data = Buffer.from(dec.subarray(p + 8, p + 8 + sz));
  if (tag === 'TRIG') {
    // Без триггеров кампании в главном меню
  } else if (tag === 'PLAY') {
    chunks.push({ tag, data: Buffer.from(VANILLA_PLAY) });
  } else if (tag === 'UNIT') {
    chunks.push({ tag, data: Buffer.alloc(4) }); // 0 юнитов
  } else if (tag === 'SP.3') {
    // SGepard::ReadSign обязательно проверяет сигнатуру 123456 (0x0001e240) в начале SP.3!
    const sp3 = Buffer.alloc(8);
    sp3.writeUInt32LE(123456, 0);
    sp3.writeUInt32LE(0, 4);
    chunks.push({ tag, data: sp3 });
  } else if (tag === 'AMBI' || tag === 'LAK3') {
    chunks.push({ tag, data: Buffer.alloc(4) }); // без фоновых звуков/луж кампании
  } else if (tag === 'LOC2') {
    chunks.push({ tag, data: Buffer.from('00000000ffffffff00000000', 'hex') });
  } else if (tag === 'CAM ') {
    const camBuf = Buffer.alloc(20);
    camBuf.writeFloatLE(MENU_CAM.X, 0);
    camBuf.writeFloatLE(MENU_CAM.Z, 4);
    camBuf.writeFloatLE(MENU_CAM.Direction, 8);
    camBuf.writeFloatLE(MENU_CAM.Elevation, 12);
    camBuf.writeFloatLE(MENU_CAM.Zoom, 16);
    chunks.push({ tag, data: camBuf });
  } else {
    chunks.push({ tag, data });
  }
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

// Оставляем все здания, фонари, урны и флаги свинского города; расчищаем только деревья/кусты/проволоку на самой
// площадке расстановки техники (X = 78.5..105.5, Z = 72.5..85.0), чтобы танки стояли чисто на брусчатке/асфальте.
const keptObjs = origObjs.filter(o => {
  if (o.x >= 78.5 && o.x <= 105.5 && o.z >= 72.5 && o.z <= 85.0) {
    if (/(fa\d|nagyfa|normalfa|koparnagyfa|bokor|gaz\d|drotkerites|kicsi\d|fahordo|pad\.4d)/i.test(o.name)) {
      return false;
    }
  }
  return true;
});

const addObj = (name, x, z, ry = 0, y = 0) => ({ name, x, y, z, ry, rx: 0, rz: 0, fl: 0 });

// Камера (X=92.0, Z=78.2, Direction=-π, смотрит в -Z на стену зданий Disznovaros на Z=68.5 и Z=75.0):
//   Экран СЛЕВА от меню = X 96.5..105.0, Z 77.0..84.5  (наши 5 новых Свинов + флаги и вывеска Штадта)
//   Экран СПРАВА от меню = X 79.0..87.5, Z 77.0..84.5  (наши 5 новых Кроликов — контрастный рейд на площади)
//   Поворот ry: +2.05 = нос вправо-на-камеру (Свины слева), -2.05 = нос влево-на-камеру (Кролики справа).
const ADDED_OBJS = [
  // ── ЛЕВЫЙ БУЛЬВАР ШТАДТА (наши 5 новых танков Свинов на переднем плане) ──
  addObj('objects\\arcanum_menu\\d_svinczar_elite.4d',      97.8, 79.6,  2.15),
  addObj('objects\\arcanum_menu\\d_hryakgrill_normal.4d',   97.4, 83.0,  2.35),
  addObj('objects\\arcanum_menu\\d_osadnykaban_normal.4d', 101.2, 78.4,  1.95),
  addObj('objects\\arcanum_menu\\d_bombohryak_normal.4d',  101.6, 82.2,  2.20),
  addObj('objects\\arcanum_menu\\d_gryazemet_normal.4d',   104.2, 80.2,  2.00),

  // Символика свинского города Штадт на бульваре
  addObj('objects\\045 zaszlok\\nagy_zaszlo_pig_1.4d',      97.0, 74.8,  0.30),
  addObj('objects\\045 zaszlok\\nagy_zaszlo_pig_1.4d',     104.6, 76.2, -0.25),
  addObj('objects\\06 tereptargyak\\tabla - welcome to stahlstadt.4d', 98.4, 72.4, 3.14),
  addObj('objects\\06 tereptargyak\\tanktuske.4d',          95.2, 81.2,  0.40),
  addObj('objects\\06 tereptargyak\\femhordo1.4d',         104.5, 83.2,  0.30),
  addObj('objects\\06 tereptargyak\\femhordo2.4d',         104.9, 82.6,  1.20),

  // ── ПРАВЫЙ БУЛЬВАР ШТАДТА (наши 5 новых машин Кроликов) ──
  addObj('objects\\arcanum_menu\\ny_morkovsmerch_normal.4d', 86.2, 79.4, -2.15),
  addObj('objects\\arcanum_menu\\ny_zayacprizrak_elite.4d',  86.8, 82.6, -2.35),
  addObj('objects\\arcanum_menu\\ny_krotoboy_normal.4d',     83.2, 79.6, -1.95),
  addObj('objects\\arcanum_menu\\ny_pitstop_normal.4d',      82.2, 82.8, -2.20),
  addObj('objects\\arcanum_menu\\ny_ushastik_normal.4d',     79.4, 80.8, -2.05),

  // Ещё один свинский флаг справа у зданий, чтобы город ощущался единым Штадтом
  addObj('objects\\045 zaszlok\\nagy_zaszlo_pig_1.4d',      85.5, 74.6, -0.35),
  addObj('objects\\06 tereptargyak\\tanktuske.4d',          88.6, 80.8, -0.30),
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

// 3. Обновляем cameras.ini (секция [missions/menu_background.scene])
const origCamIni = readPakEntry(PAK_PATH, 'cameras.ini').toString('latin1');
const newMenuCamBlock = [
  '[missions/menu_background.scene]',
  `X = ${MENU_CAM.X.toFixed(6)}`,
  `Z = ${MENU_CAM.Z.toFixed(6)}`,
  `Direction = ${MENU_CAM.Direction.toFixed(6)}`,
  `Elevation = ${MENU_CAM.Elevation.toFixed(6)}`,
  `Zoom = ${MENU_CAM.Zoom.toFixed(6)}`,
].join('\r\n');
const patchedCamIni = origCamIni.replace(
  /\[missions\/menu_background\.scene\][\s\S]*?(?=\r?\n\[|\s*$)/i,
  newMenuCamBlock
);
fs.writeFileSync(path.join(OUT_BASE, 'cameras.ini'), patchedCamIni, 'latin1');

console.log(`Wrote ${outScene}: ${finalObjs.length} objects (${keptObjs.length} kept + ${ADDED_OBJS.length} added), ${(mapfHdr.length + zstdData.length)} bytes (raw ${rawScene.length})`);
console.log(`Updated ${path.join(OUT_BASE, 'cameras.ini')} -> Stahlstadt (${MENU_CAM.X}, ${MENU_CAM.Z})`);

#!/usr/bin/env node
// Ассети Arcanum Units поза units.ini (усе — з оригінальних файлів гри + наші додатки):
//   gamedata/base/effects.ini                 — оригінал + [arc_sar_folt]: грязьова пляма Гряземета (≈ 10 с);
//   gamedata/base/effects/arc_sar_folt_a.dxt  — текстура плями (DXT5 256×256), копії в effects/tileset_*/;
//   gamedata/base/sounds/shoot/arc_lang.wav    — постріл вогнемета Хряка-Гриля (тріск вогню гри + шипіння полум'я);
//   gamedata/base/menu/panel/panel_spec.png    — атлас кнопок спецздібностей з іконками типів 12–14 (tools/make-panel-spec.ps1);
//   gamedata/base/missions.ini                 — маски магазину кампанії: нові класи доступні в кожній місії з магазином.
//
//   node tools/make-arc-assets.js <out-dir>     (out-dir — той самий, що для tools/arc-units.js; потрібен його classes.json)
// Потрібні ffmpeg і ImageMagick (magick) у PATH.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const GAME = 'A:/SteamLibrary/steamapps/common/SWINE HD Remaster';
const OUT = path.resolve(process.argv[2] || 'mods-test/arcunits');
const PAK = path.join(GAME, 'gamedata/base/base.pak');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'arcfx-'));
const out = rel => { const p = path.join(OUT, 'gamedata/base', rel); fs.mkdirSync(path.dirname(p), { recursive: true }); return p; };

function readPakEntry(pakPath, want) {
  const fd = fs.openSync(pakPath, 'r'), h = Buffer.alloc(16); fs.readSync(fd, h, 0, 16, 0);
  const isz = h.readUInt32LE(12), ib = Buffer.alloc(isz); fs.readSync(fd, ib, 0, isz, 16);
  let p = 0, prev = ''; const par = {};
  while (p < isz) {
    const pre = ib[p], nl = ib[p + 1], src = (p in par) ? par[p] : prev;
    const name = src.slice(0, pre) + ib.toString('latin1', p + 2, p + 2 + nl), q = p + 2 + nl;
    const C = ib.readUInt32LE(q + 9); if (C) par[C] = name;
    if (name.toLowerCase() === want) { const b = Buffer.alloc(ib.readUInt32LE(q + 4)); fs.readSync(fd, b, 0, b.length, 16 + isz + ib.readUInt32LE(q)); fs.closeSync(fd); return b; }
    prev = name; p = q + 13;
  }
  fs.closeSync(fd); throw new Error('not in pak: ' + want);
}

// ── 1. effects.ini + пляма ──
const MUD = `
;*************************************************************************
; Arcanum Units: грязьова калюжа Гряземета (вставка в exe кладе її там, де впав снаряд; калюжа сповільнює 20 с)
;*************************************************************************
[arc_sar_folt]
EffectType = 2
ManageType = 1
Texture = arc_sar_folt_a.tga
DrawType = 0
Eltunes_Kezdete = 18
Eltunes_Sebesseg = 0.25
Felfutas_sebesseg = 3
`.replace(/\n/g, '\r\n');
const fx = readPakEntry(PAK, 'effects.ini').toString('latin1').replace(/\s*$/, '\r\n');
fs.writeFileSync(out('effects.ini'), fx + MUD, 'latin1');

// Пляма: калюжа рідкої грязі зверху (#8: була квадратом-«мозаїкою» — див. версію заголовка нижче).
// Нерівна краплина (форма з шуму з викривленням), мокрий темний центр, світліший підсохлий обідок, грудки,
// вологі відблиски й бризки навсібіч від місця влучання. Детермінований шум — однаковий файл при кожній збірці.
{
  const W = 256, px = Buffer.alloc(W * W * 4);
  const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) ^ 0x5bd1e995; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const noise = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, s = t => t * t * (3 - 2 * t);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * s(fx) + (c - a) * s(fy) + (a - b - c + d) * s(fx) * s(fy); };
  const fbm = (x, y, o = 5) => { let v = 0, amp = 0.5, f = 1; for (let i = 0; i < o; i++) { v += amp * noise(x * f, y * f); amp *= 0.5; f *= 2; } return v; };
  const sat = t => Math.min(1, Math.max(0, t)), mix = (a, b, t) => a + (b - a) * t;
  // бризки: краплі по променях від центру (кут, відстань, розмір), витягнуті вздовж променя
  const drops = []; for (let k = 0; k < 26; k++) { const ang = hash(k, 7) * Math.PI * 2, d = 0.8 + 0.16 * hash(k, 11); drops.push([Math.cos(ang) * d, Math.sin(ang) * d, 0.012 + 0.07 * hash(k, 13) * (1.0 - d), ang]); }
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const u = (x + 0.5) / W * 2 - 1, v = (y + 0.5) / W * 2 - 1;
    const wu = u + 0.12 * (fbm(u * 2 + 3, v * 2 + 1, 4) - 0.5), wv = v + 0.12 * (fbm(u * 2 + 9, v * 2 + 5, 4) - 0.5);   // викривлення
    const r = Math.hypot(wu, wv), ang = Math.atan2(wv, wu);
    const edge = 0.74 + 0.07 * Math.sin(ang * 3 + 1.3) + 0.04 * Math.sin(ang * 7 + 0.4) + 0.1 * (fbm(Math.cos(ang) * 2 + 5, Math.sin(ang) * 2 + 5) - 0.5);
    let a = sat((edge - r) / 0.018);                                   // сама калюжа (чіткий край рідини)
    let rim = sat(1 - Math.abs(edge - 0.035 - r) / 0.045) * a;         // підсохлий обідок
    let splash = 0;
    for (const [bx, by, br, ba] of drops) {                            // бризки, витягнуті вздовж променя
      const du = u - bx, dv = v - by, along = du * Math.cos(ba) + dv * Math.sin(ba), across = -du * Math.sin(ba) + dv * Math.cos(ba);
      splash = Math.max(splash, sat((br - Math.hypot(along * 0.45, across)) / 0.006));
    }
    a = Math.max(a, splash * 0.9);
    const grain = fbm(u * 14 + 2, v * 14 + 8, 4), clod = sat((fbm(u * 9 + 31, v * 9 + 17, 4) - 0.62) * 6) * sat((edge - 0.1 - r) / 0.1);
    const wet = sat((fbm(u * 5 + 21, v * 5 + 4, 4) - 0.5) * 3) * sat((edge - 0.12 - r) / 0.15);   // мокрі ділянки ближче до центру
    const gloss = Math.pow(sat((fbm(u * 18 + 40, v * 18 + 3, 3) - 0.58) * 5), 2) * wet;            // відблиски на мокрому
    let R = mix(58, 40, wet) + 18 * grain, G = mix(43, 29, wet) + 13 * grain, B = mix(28, 18, wet) + 8 * grain;
    R = mix(R, 104, rim * 0.75); G = mix(G, 83, rim * 0.75); B = mix(B, 58, rim * 0.75);                // світліший край
    R = mix(R, 30, clod); G = mix(G, 22, clod); B = mix(B, 14, clod);                                 // темні грудки
    R += 120 * gloss; G += 110 * gloss; B += 95 * gloss;
    const q = (y * W + x) * 4;
    px[q] = Math.min(255, Math.round(R)); px[q + 1] = Math.min(255, Math.round(G)); px[q + 2] = Math.min(255, Math.round(B));
    px[q + 3] = Math.round(255 * a * (0.88 + 0.1 * grain));
  }
  const raw = path.join(TMP, 'mud.rgba'), dds = path.join(TMP, 'mud.dds');
  fs.writeFileSync(raw, px);
  if (process.env.MUD_PREVIEW) execFileSync('magick', ['-size', `${W}x${W}`, '-depth', '8', `rgba:${raw}`, '-background', '#c8d4e0', '-flatten', process.env.MUD_PREVIEW]);
  execFileSync('magick', ['-size', `${W}x${W}`, '-depth', '8', `rgba:${raw}`, '-define', 'dds:compression=dxt5', '-define', 'dds:mipmaps=8', dds]);
  const d = fs.readFileSync(dds);                    // DDS: 128 Б заголовок, далі всі mip-рівні — як у .dxt гри
  if (d.toString('latin1', 84, 88) !== 'DXT5') throw new Error('magick did not write DXT5');
  // Заголовок TEXT: версія 2 — як у ванільних наземних плям DXT5 (effects/*_a.dxt). Версія 3 (так у скінів юнітів) гра
  // декодує інакше — у грі був квадрат «мозаїкою» без прозорості (#8).
  const h = Buffer.alloc(16); h.writeUInt32LE(2, 0); h.writeUInt32LE(W, 4); h.writeUInt32LE(W, 8); h.write('DXT5', 12, 'latin1');
  const body = Buffer.concat([h, d.subarray(128)]), th = Buffer.alloc(8); th.write('TEXT', 0, 'latin1'); th.writeUInt32LE(body.length, 4);
  const dxt = Buffer.concat([Buffer.from([0x53, 0x72, 0x1A, 0x1B, 0x0D, 0x0A, 0x87, 0x0A]), th, body]);
  // Наземні ефекти (EffectType 2, ManageType 1) гра вантажить і з папки тайлсету карти: на сніговій карті
  // Гряземет падав з «SEffect::Init_ShaderLight: cannot load texture effects/tileset_normal/arc_sar_folt_a.tga»
  // (лист 23.11). Тож — у загальну папку і в усі п'ять тайлсетів, як ванільні сліди під юнітами.
  for (const dir of ['', 'tileset_desert/', 'tileset_jungle/', 'tileset_normal/', 'tileset_rock/', 'tileset_snow/'])
    fs.writeFileSync(out(`effects/${dir}arc_sar_folt_a.dxt`), dxt);
}

// ── 2. Звук вогнемета ──
{
  const fire = path.join(TMP, 'tuz01.mp3'); fs.writeFileSync(fire, readPakEntry(PAK, 'sounds/ambient/tuz01.mp3'));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', fire, '-f', 'lavfi', '-i', 'anoisesrc=d=1.4:c=brown:a=0.7:seed=7',
    '-filter_complex', '[0:a]atrim=0.3:1.7,asetpts=PTS-STARTPTS,volume=2.2[f];[1:a]highpass=f=120,lowpass=f=1400,volume=1.6[n];' +
    '[f][n]amix=inputs=2:normalize=0,afade=t=in:d=0.05,afade=t=out:st=0.9:d=0.5,alimiter=limit=0.9',
    '-ac', '1', '-ar', '44100', '-sample_fmt', 's16',
    // Без чанка LIST: SWave::LoadWAV (0x481e80) після «fmt » одразу чекає «data», інакше мовчки не вантажить —
    // так Хряк-Гриль стріляв без звуку (#9). -map_metadata -1 і bitexact — лише fmt + data.
    '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact', out('sounds/shoot/arc_lang.wav')]);
}

// ── 3. Атлас кнопок спецздібностей ──
{
  const src = path.join(TMP, 'panel_spec.png'); fs.writeFileSync(src, readPakEntry(PAK, 'menu/panel/panel_spec.png'));
  execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'make-panel-spec.ps1'), src, out('menu/panel/panel_spec.png')], { stdio: 'inherit' });
}

// ── 4. Маски магазину кампанії ──
// UnitMask місії: символ i ≠ '-' — клас i у магазині. Нові класи — 13…13+K−1, тож маску доповнюємо до 13 і
// дописуємо K літер. Місії без UnitMask (перша, без магазину) не чіпаємо.
{
  const cls = JSON.parse(fs.readFileSync(path.join(OUT, 'classes.json'), 'utf8')), K = cls.rabbit.length;
  let n = 0;
  const ini = readPakEntry(PAK, 'missions.ini').toString('latin1').replace(/^(\s*UnitMask\s*=\s*)(\S+)(.*)$/gim, (m, a, mask, rest) => {
    n++; return a + mask.padEnd(13, '-').slice(0, 13) + 'X'.repeat(K) + rest; });
  fs.writeFileSync(out('missions.ini'), ini, 'latin1');
  console.log(`missions.ini: ${n} market masks +${K} new classes`);
}
fs.rmSync(TMP, { recursive: true, force: true });
console.log('assets →', path.join(OUT, 'gamedata/base'));

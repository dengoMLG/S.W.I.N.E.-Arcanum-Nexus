#!/usr/bin/env node
// Юнит #4 (Свиньи): «Осадный Кабан» (d_osadnykaban) — Штурмовая мортира (в духе Sturmtiger).
//
// Силуэт: тяжёлое гусеничное шасси с 5 катками, мощный лобовой бронеклин с клыками и отвалом,
// массивная закрытая скошенная бронерубка-бункер (Sturmtiger) с номером «38», кормовой кран-балкой
// для заряжания гигантских снарядов, и КОРОТКОЙ СВЕРХТОЛСТОЙ 380-мм РАКЕТНОЙ МОРТИРОЙ (Cso) с
// перфорированным дульным кольцом в массивной литой шаровой маске!
//
// Совместимость Gepard: Lanctalp, Test, Lovegtorony (малый ход наводки), Cso (отдача), _Torkolattuz, _kereso, _glow0..3, Chain R/L 001.
'use strict';
const path = require('path');
const {
  clamp, uvRect, fbm,
  Mesh, buildTrackLoop, Canvas, loadGameAssets, buildUnitPackage,
} = require('../lib/swine-model-kit');

const OUT = path.resolve(process.argv[2] || 'mods-test/units/d_osadnykaban');

const UV = {
  hullTop:    [0.01, 0.01, 0.45, 0.27],
  hullFront:  [0.01, 0.29, 0.31, 0.46],
  hullSkirt:  [0.01, 0.48, 0.47, 0.64],
  hullRear:   [0.01, 0.66, 0.31, 0.81],
  hazard:     [0.01, 0.83, 0.47, 0.99],
  wheels:     [0.50, 0.01, 0.99, 0.14], // 5 катков тяжёлого танка
  bunkerSide: [0.50, 0.16, 0.99, 0.36], // Борт рубки-бункера + номер «38»
  bunkerTop:  [0.50, 0.38, 0.79, 0.61], // Крыша рубки + логотип Свиней + люк
  bunkerRear: [0.81, 0.38, 0.99, 0.61], // Жалюзи МТО
  mortar:     [0.50, 0.63, 0.99, 0.76], // 380-мм сверхтолстый ствол мортиры + полосы Vet/Elite + газоотводные отверстия!
  mantlet:    [0.33, 0.29, 0.47, 0.46], // Литая шаровая бронемаска
  fenderTop:  [0.33, 0.66, 0.47, 0.81], // Рифлёные полки
  metal:      [0.50, 0.78, 0.73, 0.98],
  chrome:     [0.75, 0.78, 0.99, 0.89],
  lights:     [0.75, 0.91, 0.87, 0.99],
  taillight:  [0.89, 0.91, 0.99, 0.99],
};

function drawDigit38(cv, x0, y0, Wp, Hp) {
  // Рисуем чёткий «38» в стиле «47»/«23» (alpha = 0!)
  const fg = [0.92, 0.93, 0.94], out = [0.05, 0.05, 0.06];
  const segs3 = [[0.14,0.12,0.84,0.12],[0.84,0.12,0.88,0.44],[0.88,0.44,0.34,0.48],[0.88,0.52,0.88,0.88],[0.88,0.88,0.14,0.88]];
  const segs8 = [[0.18,0.12,0.82,0.12],[0.82,0.12,0.88,0.44],[0.88,0.44,0.12,0.48],[0.12,0.48,0.18,0.12],[0.12,0.52,0.88,0.52],[0.88,0.52,0.82,0.88],[0.82,0.88,0.18,0.88],[0.18,0.88,0.12,0.52]];
  const drawS = (S, cx, cy, h) => {
    const w = h * 0.58, bx = cx - w / 2, by = cy - h / 2, th = Math.max(4, h * 0.16);
    for (const s of S) cv.drawLine(bx + s[0] * w, by + s[1] * h, bx + s[2] * w, by + s[3] * h, th + 6, out, 1, 0);
    for (const s of S) cv.drawLine(bx + s[0] * w, by + s[1] * h, bx + s[2] * w, by + s[3] * h, th, fg, 1, 0);
  };
  drawS(segs3, x0 + Wp * 0.43, y0 + Hp * 0.52, Hp * 0.54);
  drawS(segs8, x0 + Wp * 0.59, y0 + Hp * 0.52, Hp * 0.54);
}

function buildOsadnyKabanAtlas(level) {
  const cv = new Canvas(1024);
  const ga = loadGameAssets(), R = ga.rects;
  const isVet = level === 'veteran', isElite = level === 'elite';
  const dmgSet = isElite ? ga.eliteDamages : ga.vetDamages;
  const stampDmg = (idx, dx0, dy0, dx1, dy1, rot = 0) => {
    const p = dmgSet[idx % dmgSet.length];
    cv.blitPatch(p, { x: 0, y: 0, w: p.W, h: p.H }, dx0, dy0, dx1, dy1, { useSrcAlphaAsOpacity: true, setTeamMask: 0, rotate: rot, opacity: isElite ? 0.96 : 0.88 });
  };

  cv.fillArmorBaseFromGame('pig', 1.05);

  // HULL TOP — кормовая палуба двигателя + жалюзи + люки
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.hullTop);
    cv.panelFrame(x0, y0, x1, y1, 5, 32);
    const cx = (x0 + x1) * 0.5;
    for (const dx of [-115, 0, 115]) cv.blitPatch(R.pigLouvers.img, R.pigLouvers, cx + dx - 36, y1 - 76, cx + dx + 36, y1 - 14, { setTeamMask: 0 });
    if (isVet || isElite) stampDmg(0, x0 + 24, y0 + 20, x0 + 165, y0 + 115);
  }

  // HULL FRONT — сверхтолстая лобовая бронеплита рубки + прицельная щель + заклёпки
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.hullFront);
    cv.panelFrame(x0, y0, x1, y1, 5, 24);
    const cx = (x0 + x1) * 0.5, cy = (y0 + y1) * 0.5;
    cv.fillRect(cx - 56, cy - 18, cx + 56, cy + 16, [0.15, 0.17, 0.19], 0.95, 0);
    cv.fillRect(cx - 46, cy - 9, cx + 46, cy + 6, [0.04, 0.07, 0.10], 1, 0);
    if (isVet || isElite) stampDmg(2, cx - 72, cy - 48, cx + 76, cy + 48);
  }

  // HULL SKIRT — бортовые экраны + шевроны Vet/Elite
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.hullSkirt);
    cv.panelFrame(x0, y0, x1, y1, 4, 30);
    const Wp = x1 - x0, Hp = y1 - y0;
    cv.drawLine(x0 + 22, y0 + Hp * 0.24, x1 - 22, y0 + Hp * 0.24, 4.5, [0.14, 0.16, 0.18], 0.85, 0);
    for (const f of [0.25, 0.50, 0.75]) cv.drawLine(x0 + Wp * f, y0 + 6, x0 + Wp * f, y1 - 6, 2.5, [0.06, 0.08, 0.10], 0.78);
    cv.fillCircle(x1 - 40, y1 - 28, 9, [0.08, 0.08, 0.08], 1, 0);
    cv.fillCircle(x1 - 40, y1 - 28, 6.5, [0.94, 0.58, 0.06], 1, 0);
    if (isVet) {
      cv.blitPatch(R.vetChevrons.img, R.vetChevrons, x0 + Wp * 0.34, y0 + Hp * 0.16, x0 + Wp * 0.62, y0 + Hp * 0.86, { cutoutByInvAlpha: true, setTeamMask: 0, rotate: 90 });
      stampDmg(1, x0 + Wp * 0.58, y0 + 18, x0 + Wp * 0.86, y1 - 12);
    } else if (isElite) {
      cv.blitPatch(R.eliteChevrons.img, R.eliteChevrons, x0 + Wp * 0.22, y0 + Hp * 0.16, x0 + Wp * 0.74, y0 + Hp * 0.86, { cutoutByInvAlpha: true, setTeamMask: 0, rotate: 90 });
      stampDmg(0, x0 + Wp * 0.10, y0 + 16, x0 + Wp * 0.40, y1 - 10);
      stampDmg(3, x0 + Wp * 0.64, y0 + 16, x0 + Wp * 0.92, y1 - 10);
    }
  }

  // HULL REAR + HAZARD
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.hullRear);
    cv.panelFrame(x0, y0, x1, y1, 4, 26);
    const cx = (x0 + x1) * 0.5, cy = (y0 + y1) * 0.44;
    cv.blitPatch(R.pigLogo.img, R.pigLogo, cx - 44, cy - 28, cx + 44, cy + 28, { cutoutByInvAlpha: true, setTeamMask: 0 });
    if (isVet || isElite) cv.blitPatch(R.hazardStrip.img, R.hazardStrip, x0 + 8, y1 - 28, x1 - 8, y1 - 6, { setTeamMask: 0 });
  }
  { const [x0, y0, x1, y1] = cv.regPx(UV.hazard); cv.blitPatch(R.hazardStrip.img, R.hazardStrip, x0, y0, x1, y1, { setTeamMask: 0 }); }
  { const [x0, y0, x1, y1] = cv.regPx(UV.wheels); cv.blitPatch(R.pigWheels5.img, R.pigWheels5, x0, y0, x1, y1, { setTeamMask: 0 }); }

  // BUNKER SIDE — борт массивной казематной рубки + «38» + боевые сколы/ржавчина
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.bunkerSide);
    cv.panelFrame(x0, y0, x1, y1, 5, 28);
    const Wp = x1 - x0, Hp = y1 - y0;
    cv.drawLine(x0 + Wp * 0.28, y0 + 8, x0 + Wp * 0.24, y1 - 8, 2.5, [0.06, 0.08, 0.10], 0.72);
    cv.drawLine(x0 + Wp * 0.74, y0 + 8, x0 + Wp * 0.78, y1 - 8, 2.5, [0.06, 0.08, 0.10], 0.72);
    drawDigit38(cv, x0, y0, Wp, Hp);
    if (isVet) {
      stampDmg(1, x0 + Wp * 0.58, y0 + 26, x0 + Wp * 0.86, y1 - 22);
      stampDmg(2, x0 + Wp * 0.12, y0 + 42, x0 + Wp * 0.34, y1 - 20);
    } else if (isElite) {
      stampDmg(0, x0 + Wp * 0.56, y0 + 20, x0 + Wp * 0.90, y1 - 18);
      stampDmg(3, x0 + Wp * 0.10, y0 + 24, x0 + Wp * 0.40, y1 - 16);
    }
  }

  // BUNKER TOP — крыша рубки + оригинальный логотип Свиней + люк заряжания 380-мм снарядов!
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.bunkerTop);
    cv.panelFrame(x0, y0, x1, y1, 5, 28);
    const cx = (x0 + x1) * 0.5, cy = (y0 + y1) * 0.5;
    cv.panelFrame(cx - 56, cy + 10, cx + 56, y1 - 22, 3, 24);
    cv.blitPatch(R.pigLogo.img, R.pigLogo, cx - 48, y0 + 20, cx + 48, y0 + 82, { cutoutByInvAlpha: true, setTeamMask: 0 });
    if (isVet || isElite) stampDmg(3, x0 + 18, y0 + 90, x0 + 132, y1 - 16);
  }
  { const [x0, y0, x1, y1] = cv.regPx(UV.bunkerRear); cv.panelFrame(x0, y0, x1, y1, 4, 24); cv.blitPatch(R.pigLouvers.img, R.pigLouvers, x0 + 10, y0 + 12, x1 - 10, y1 - 12, { setTeamMask: 0 }); }

  // MORTAR — 380-мм короткая толстая ракетная мортира (газоотводное кольцо по кругу среза + полосы Vet/Elite!)
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.mortar);
    const Wb = x1 - x0, Hb = y1 - y0;
    const splitY = Math.floor(y0 + Hb * 0.42);
    cv.blitPatch(R.mantletMetal.img, R.mantletMetal, x0, splitY, x1, y1, { setTeamMask: 0, rotate: 90, gain: 0.65 });
    // Сильная копоть у среза гигантской мортиры
    for (let y = Math.floor(y0 + Hb * 0.72); y < y1; y++) {
      const t = (y - (y0 + Hb * 0.72)) / (Hb * 0.28);
      for (let x = x0; x < x1; x++) cv.blendPx(x, y, [0.05, 0.05, 0.06], t * 0.85, 0);
    }
    // Фирменное кольцо газоотводных отверстий Sturmtiger вокруг дула!
    for (let col = 0; col < 12; col++) {
      const rx = x0 + Wb * (col + 0.5) / 12, ry = y0 + Hb * 0.82;
      cv.fillCircle(rx, ry, 7, [0.02, 0.02, 0.03], 1, 0);
      cv.drawRing(rx, ry, 6, 8.5, [0.55, 0.57, 0.60], 0.7, 0);
    }
    if (isVet || isElite) {
      const nStripes = isElite ? 4 : 2;
      for (let s = 0; s < nStripes; s++) {
        const sy = y0 + Hb * (0.12 + s * 0.068);
        cv.fillRect(x0, sy - 2, x1, sy + 7, [0.05, 0.05, 0.06], 1, 0);
        cv.fillRect(x0, sy, x1, sy + 5, [0.96, 0.80, 0.06], 1, 0);
      }
    }
  }

  { const [x0, y0, x1, y1] = cv.regPx(UV.mantlet);   cv.blitPatch(R.mantletMetal.img, R.mantletMetal, x0, y0, x1, y1, { setTeamMask: 0, gain: 0.90 }); }
  { const [x0, y0, x1, y1] = cv.regPx(UV.fenderTop); cv.blitPatch(R.fenderGrating.img, R.fenderGrating, x0, y0, x1, y1, { setTeamMask: 0 }); }
  { const [x0, y0, x1, y1] = cv.regPx(UV.metal);     cv.blitPatch(R.mantletMetal.img, R.mantletMetal, x0, y0, x1, y1, { setTeamMask: 0, gain: 0.62 }); }
  { const [x0, y0, x1, y1] = cv.regPx(UV.chrome);    cv.blitPatch(R.chromeMetal.img, R.chromeMetal, x0, y0, x1, y1, { setTeamMask: 0, rotate: 90, gain: 1.25 }); }
  { const [x0, y0, x1, y1] = cv.regPx(UV.lights);    cv.blitPatch(R.headlight.img, R.headlight, x0, y0, x1, y1, { setTeamMask: 0 }); }
  { const [x0, y0, x1, y1] = cv.regPx(UV.taillight); cv.blitPatch(R.taillight.img, R.taillight, x0, y0, x1, y1, { setTeamMask: 0, rotate: 90 }); }

  return cv.downsample2x();
}

function buildOsadnyKabanGeometry() {
  const parts = {};

  // 1) LANCTALP — тяжёлая широкая ванна (5 катков)
  {
    const m = new Mesh();
    const prof = [[-228, -48], [228, -48], [272, -14], [276, 30], [-272, 30], [-268, -14]];
    m.addPrismX(prof, 184, UV.wheels, UV.metal);
    parts.Lanctalp = m;
  }

  // 2) TEST — ГУСЕНИЧНЫЙ БУНКЕР STURMTIGER (массивная скошенная казематная рубка + кран заряжания + отвал + клыки!)
  {
    const m = new Mesh();

    // Нижняя палуба корпуса с тяжёлым лобовым клином
    const hullProf = [
      [-288, -24, 174], [254, -24, 174], [298, 6, 166], [228, 42, 166], [-286, 42, 172],
    ];
    m.addPrismX(hullProf, 170, UV.hullSkirt, UV.hullTop, {
      edgeRegs: [UV.metal, UV.hullFront, UV.hullFront, UV.hullTop, UV.hullRear],
    });

    // Надгусеничные полки и трапециевидные бортовые бронеэкраны
    for (const sx of [-1, 1]) {
      const xIn = sx * 164, xOut = sx * 222;
      const x0 = Math.min(xIn, xOut), x1 = Math.max(xIn, xOut);
      m.addBox(x0, x1, -278, 278, 16, 28, { top: UV.fenderTop, bot: UV.metal, front: UV.hullFront, back: UV.hullRear, left: UV.metal, right: UV.metal });
      m.addFrustum([x0, x1, 274, 302], [x0, x1, 270, 278], -4, 24, { all: UV.hullFront, top: UV.fenderTop });
      const sx0 = sx > 0 ? 218 : -230, sx1 = sx > 0 ? 230 : -218;
      m.addFrustum([sx0, sx1, -182, 188], [sx0, sx1, -256, 252], -20, 28, {
        top: UV.fenderTop, bot: UV.metal, front: UV.metal, back: UV.metal,
        left: sx > 0 ? UV.hullSkirt : UV.metal, right: sx < 0 ? UV.hullSkirt : UV.metal,
      });
      // Фары и задние фонари
      const fx = sx * 192;
      m.addBox(fx - 18, fx + 18, 254, 280, 24, 42, { all: UV.metal, front: UV.lights });
      m.addBox(fx - 20, fx + 20, -286, -264, 18, 36, { all: UV.metal, back: UV.taillight });
    }

    // Мощный передний осадный отвал + 2 массивных клыка кабана!
    m.addFrustum([-156, 156, 288, 318], [-146, 146, 278, 300], -36, 14, { all: UV.metal, front: UV.hazard });
    for (const sx of [-1, 1]) {
      m.addTube([[sx * 82, 268, -16], [sx * 92, 314, -12], [sx * 100, 342, 6], [sx * 106, 348, 34]], [19, 15, 10, 2], 8, UV.chrome, { capStart: true, capEnd: true });
    }

    // ═══ ГЛАВНАЯ ФИШКА: ГРОМАДНАЯ СКОШЕННАЯ БРОНЕРУБКА-БУНКЕР STURMTIGER! ═══
    // Наклонный лоб, мощные скошенные борта, прямая корма с люком!
    m.addFrustum([-176, 176, -152, 236], [-136, 136, -134, 148], 38, 158, {
      top: UV.bunkerTop, bot: UV.metal, front: UV.hullFront, back: UV.bunkerRear, left: false, right: false,
    });
    // Боковины бункера отдельно — чтобы «38» читалось прямо на обоих бортах в игре (swine-view --cull 1)!
    m.addQuad([-176, 236, 38], [-176, -152, 38], [-136, -134, 158], [-136, 148, 158], UV.bunkerSide, [1, 1], [0, 1], [0, 0], [1, 0]);
    m.addQuad([ 176, -152, 38], [ 176, 236, 38], [ 136, 148, 158], [ 136, -134, 158], UV.bunkerSide, [1, 1], [0, 1], [0, 0], [1, 0]);

    // Бронированная башенка наводчика на крыше рубки + поручни
    m.addLatheZ(-46, -24, [[154, 44, 44], [178, 36, 36], [186, 26, 26]], 6, UV.hullFront, { smooth: false, capStart: true, capEnd: true, capReg: UV.bunkerTop });
    for (const sx of [-1, 1]) {
      m.addTube([[sx * 144, 114, 128], [sx * 164, 98, 130], [sx * 164, -108, 130], [sx * 144, -124, 128]], 5.5, 6, UV.metal, { capStart: true, capEnd: true });
    }

    // ═══ ФИРМЕННАЯ КРАН-БАЛКА ЗАРЯЖАНИЯ 380-мм ФУГАСОВ НА КОРМЕ КРЫШИ РУБКИ! ═══
    m.addTube([[112, -124, 154], [116, -134, 212], [112, -196, 224], [112, -214, 196]], [9, 8.5, 7.5, 6], 7, UV.chrome, { capStart: true, capEnd: true });
    // Подвесной крюк/блок на конце стрелы крана
    m.addBox(102, 122, -222, -206, 168, 198, { all: UV.metal });

    // Штыревая антенна
    m.addLatheZ(-102, -112, [[154, 8, 8], [174, 5, 5], [340, 2, 2]], 6, UV.metal, { smooth: true, capStart: true, capEnd: true });

    // Кормовой отсек МТО + парные массивные выхлопные трубы + задний бампер
    m.addFrustum([-134, 134, -276, -152], [-122, 122, -264, -152], 38, 72, { all: UV.metal, top: UV.bunkerRear, back: UV.bunkerRear });
    m.addBox(-162, 162, -298, -274, -10, 24, { all: UV.hullRear, top: UV.fenderTop });
    for (const sx of [-1, 1]) {
      for (const dz of [0, 18]) {
        m.addTube([[sx * 136, -182, 34 + dz], [sx * 168, -194, 40 + dz], [sx * 172, -272, 46 + dz]], [8, 8, 9], 7, UV.chrome, { capStart: true, capEnd: true });
      }
    }

    parts.Test = m;
  }

  // 3) LOVEGTORONY — компактная шаровая бронемаска в лобовом листе бункера (ограниченный поворот!)
  {
    const m = new Mesh();
    m.addLatheY(0, 0, [[-44, 56], [-12, 64], [18, 60], [38, 48]], 12, UV.mantlet, { smooth: true, capStart: true, capEnd: true });
    parts.Lovegtorony = m;
  }

  // 4) CSO — ГИГАНТСКАЯ КОРОТКАЯ 380-мм РАКЕТНАЯ МОРТИРА STURMTIGER (приподнята вверх под +14° для навесного огня!)
  {
    const m = new Mesh();
    // Сверхтолстый короткий цилиндрический ствол с массивным дульным газоотводным кольцом!
    const tilt = 0.24; // ~14° вверх!
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    const pt = (y, r) => [0, y * ct, y * st]; // центр вдоль наклонной оси
    const rings = [
      [-46, 46], [-10, 46], [0, 48], [68, 47], [74, 52], [116, 52], [122, 48],
    ].map(([yy, rr]) => {
      const ring = [];
      for (let i = 0; i < 14; i++) {
        const a = 2 * Math.PI * i / 14;
        const rx = rr * Math.cos(a), rz = rr * Math.sin(a);
        ring.push([rx, yy * ct - rz * st, yy * st + rz * ct]);
      }
      return ring;
    });
    m.addLoft(rings, UV.mortar, { smooth: true, capStart: true, capEnd: true, vStart: 0.04, vEnd: 0.96, capReg: UV.metal });
    parts.Cso = m;
  }

  // 5) CHAIN R 001 / CHAIN L 001 — тяжёлые гусеницы
  const trkR = new Mesh(); buildTrackLoop(trkR, 42, -296, 294, -54, 54, -252, 248, 3.0);
  const trkL = new Mesh(); buildTrackLoop(trkL, 42, -296, 294, -54, 54, -252, 248, 3.0);
  parts['Chain R 001'] = trkR;
  parts['Chain L 001'] = trkL;

  const ROOT_M = [-1, 0, 0,  0, 0, -1,  0, 1, 0,  0, 50, 0];
  const ID_M = (tx, ty, tz, sx = 1, sy = 1, sz = 1) => [sx, 0, 0,  0, sy, 0,  0, 0, sz,  tx, ty, tz];
  const TRK_M = tx => [-0.90, 0, 0,  0, 0, -0.90,  0, 0.90, 0,  tx, 48, 0];

  return {
    trackTex: 'lanctalp.tga',
    nodes: [
      { name: 'Lanctalp',    parent: -1, m: ROOT_M, mesh: parts.Lanctalp },
      { name: 'Test',        parent:  0, m: ID_M(0, 0, 32), mesh: parts.Test },
      { name: 'Lovegtorony', parent:  1, m: ID_M(0, 182, 102), mesh: parts.Lovegtorony },
      { name: 'Cso',         parent:  2, m: ID_M(0, 32, 6), mesh: parts.Cso },
      { name: '_Torkolattuz',parent:  3, m: ID_M(0, 128, 32), helper: true },
      { name: '_kereso',     parent:  1, m: ID_M(76, 174, 152, 0.65, 1, 0.65), helper: true },
      { name: '_glow1piros', parent:  1, m: ID_M(192, -288, 28, -0.24, -1, 0.24), helper: true },
      { name: '_glow0piros', parent:  1, m: ID_M(-192, -288, 28, 0.24, -1, 0.24), helper: true },
      { name: '_glow2feher', parent:  1, m: ID_M(-192, 282, 33, 0.22, 1, 0.22), helper: true },
      { name: '_glow3feher', parent:  1, m: ID_M(192, 282, 33, -0.22, 1, 0.22), helper: true },
      { name: 'Chain R 001', parent: -1, m: TRK_M(-184), mesh: parts['Chain R 001'], isTrack: true },
      { name: 'Chain L 001', parent: -1, m: TRK_M( 184), mesh: parts['Chain L 001'], isTrack: true },
    ],
  };
}

const summary = buildUnitPackage({
  modelName: 'd_osadnykaban',
  race: 'pig',
  anifFrom: 'd_mozsar',
  outDir: OUT,
  buildGeometry: buildOsadnyKabanGeometry,
  buildAtlas: buildOsadnyKabanAtlas,
});
for (const s of summary) console.log(`d_osadnykaban_${s.level.padEnd(7)}  V=${String(s.verts).padStart(4)}  F=${String(s.faces).padStart(4)}  .4d=${s.size4d}B  .dxt=${s.sizeDxt}B`);

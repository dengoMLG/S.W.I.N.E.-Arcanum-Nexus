#!/usr/bin/env node
// Юнит #2 (Свиньи): «Свин-Царь» (d_svinczar) — Сверхтяжёлый танк-дредноут.
//
// Силуэт: колоссальный сверхтяжёлый корпус (шире и длиннее d_hardtank, 5 катков на борт),
// тройные гигантские клыки + силовой таран спереди, 4 дизельные выхлопные трубы на корме,
// огромная широкая башня-дредноут с «царской» окантовкой башенки, двумя антеннами, номером «01»
// и СПАРЕННЫМ СВЕРХТЯЖЁЛЫМ ОСАДНЫМ ОРУДИЕМ (единый узел Cso с общим откатом).
//
// Совместимость Gepard: Lanctalp, Test, Lovegtorony, Cso, _Torkolattuz, _kereso, _glow0..3, Chain R/L 001.
// 3D-модель едина для normal / veteran / elite; прогрессия текстурой + 100% динамический цвет команды.
'use strict';
const path = require('path');
const {
  clamp, uvRect, fbm,
  Mesh, buildTrackLoop, Canvas, loadGameAssets, buildUnitPackage,
} = require('../lib/swine-model-kit');

const OUT = path.resolve(process.argv[2] || 'mods-test/units/d_svinczar');

const UV = {
  hullTop:    [0.01, 0.01, 0.45, 0.27],
  hullFront:  [0.01, 0.29, 0.31, 0.46],
  hullSkirt:  [0.01, 0.48, 0.47, 0.64],
  hullRear:   [0.01, 0.66, 0.31, 0.81],
  hazard:     [0.01, 0.83, 0.47, 0.99],
  wheels:     [0.50, 0.01, 0.99, 0.14], // 5 тяжёлых катков (из d_hardtank_normal.dxt!)
  turretSide: [0.50, 0.16, 0.99, 0.36], // Борт башни + номер «01»
  turretTop:  [0.50, 0.38, 0.79, 0.61], // Крыша башни + лого Свиней
  turretRear: [0.81, 0.38, 0.99, 0.61], // Жалюзи МТО
  barrel:     [0.50, 0.63, 0.99, 0.76], // Спаренные тяжёлые пушки + полосы Vet/Elite
  mantlet:    [0.33, 0.29, 0.47, 0.46], // Литая броня маски
  fenderTop:  [0.33, 0.66, 0.47, 0.81], // Рифлёные надгусеничные полки
  metal:      [0.50, 0.78, 0.73, 0.98], // Тёмная воронёная сталь
  chrome:     [0.75, 0.78, 0.99, 0.89], // Полированная сталь (клыки, выхлопы, царский кант)
  lights:     [0.75, 0.91, 0.87, 0.99],
  taillight:  [0.89, 0.91, 0.99, 0.99],
};

function buildSvinCzarAtlas(level) {
  const cv = new Canvas(1024);
  const ga = loadGameAssets(), R = ga.rects;
  const isVet = level === 'veteran', isElite = level === 'elite';
  const dmgSet = isElite ? ga.eliteDamages : ga.vetDamages;
  const stampDmg = (idx, dx0, dy0, dx1, dy1, rot = 0) => {
    const p = dmgSet[idx % dmgSet.length];
    cv.blitPatch(p, { x: 0, y: 0, w: p.W, h: p.H }, dx0, dy0, dx1, dy1, { useSrcAlphaAsOpacity: true, setTeamMask: 0, rotate: rot, opacity: isElite ? 0.96 : 0.88 });
  };

  cv.fillArmorBaseFromGame('pig', 1.04);

  // HULL TOP — массивная палуба + копоть + 3 решётки МТО
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.hullTop);
    cv.panelFrame(x0, y0, x1, y1, 5, 32);
    const cx = (x0 + x1) * 0.5, cy = (y0 + y1) * 0.42;
    cv.blitPatch(R.turretSoot.img, R.turretSoot, cx - 125, cy - 102, cx + 125, cy + 102, { cutoutByInvAlpha: true, setTeamMask: 0, opacity: 0.92 });
    for (const dx of [-130, 0, 130]) {
      cv.blitPatch(R.pigLouvers.img, R.pigLouvers, cx + dx - 38, y1 - 76, cx + dx + 38, y1 - 12, { setTeamMask: 0 });
    }
    if (isVet || isElite) {
      stampDmg(0, x0 + 24, y0 + 20, x0 + 146, y0 + 108);
      stampDmg(2, x1 - 140, y0 + 28, x1 - 22, y0 + 112, 180);
    }
  }

  // HULL FRONT — сверхтолстая лобовая плита с двумя люками, смотровой щелью и заклёпками
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.hullFront);
    cv.panelFrame(x0, y0, x1, y1, 5, 24);
    const cx = (x0 + x1) * 0.5, cy = (y0 + y1) * 0.5;
    cv.fillRect(cx - 66, cy - 20, cx + 66, cy + 18, [0.15, 0.16, 0.18], 0.95, 0);
    cv.fillRect(cx - 56, cy - 10, cx + 56, cy + 7, [0.04, 0.07, 0.10], 1, 0);
    cv.drawLine(cx - 50, cy - 6, cx + 50, cy - 6, 2.2, [0.46, 0.62, 0.72], 0.65, 0);
    if (isVet || isElite) stampDmg(1, cx - 72, cy - 48, cx + 76, cy + 48);
  }

  // HULL SKIRT — тяжёлые секционные бронеэкраны + шевроны Vet/Elite
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.hullSkirt);
    cv.panelFrame(x0, y0, x1, y1, 4, 30);
    const Wp = x1 - x0, Hp = y1 - y0;
    cv.drawLine(x0 + 20, y0 + Hp * 0.22, x1 - 20, y0 + Hp * 0.22, 5, [0.14, 0.16, 0.18], 0.88, 0);
    cv.drawLine(x0 + 20, y0 + Hp * 0.22 - 1, x1 - 20, y0 + Hp * 0.22 - 1, 2, [0.78, 0.82, 0.86], 0.7, 0);
    for (const f of [0.20, 0.40, 0.60, 0.80]) cv.drawLine(x0 + Wp * f, y0 + 6, x0 + Wp * f, y1 - 6, 2.6, [0.05, 0.07, 0.09], 0.78);
    for (let y = Math.floor(y0 + Hp * 0.65); y < y1; y++) {
      const t = (y - (y0 + Hp * 0.65)) / (Hp * 0.35);
      for (let x = x0; x < x1; x++) cv.blendPx(x, y, [0.16, 0.14, 0.11], t * fbm(x * 0.04, y * 0.04, 3, 77) * 0.55, null);
    }
    cv.fillCircle(x1 - 42, y1 - 28, 10, [0.08, 0.08, 0.08], 1, 0);
    cv.fillCircle(x1 - 42, y1 - 28, 7.5, [0.95, 0.60, 0.06], 1, 0);
    if (isVet) {
      cv.blitPatch(R.vetChevrons.img, R.vetChevrons, x0 + Wp * 0.34, y0 + Hp * 0.16, x0 + Wp * 0.62, y0 + Hp * 0.86, { cutoutByInvAlpha: true, setTeamMask: 0, rotate: 90 });
      stampDmg(1, x0 + Wp * 0.58, y0 + 18, x0 + Wp * 0.86, y1 - 12);
    } else if (isElite) {
      cv.blitPatch(R.eliteChevrons.img, R.eliteChevrons, x0 + Wp * 0.22, y0 + Hp * 0.16, x0 + Wp * 0.74, y0 + Hp * 0.86, { cutoutByInvAlpha: true, setTeamMask: 0, rotate: 90 });
      stampDmg(0, x0 + Wp * 0.10, y0 + 16, x0 + Wp * 0.40, y1 - 10);
      stampDmg(3, x0 + Wp * 0.64, y0 + 16, x0 + Wp * 0.92, y1 - 10);
    }
  }

  // HULL REAR — корма с лого Свиней и предупреждающей полосой
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.hullRear);
    cv.panelFrame(x0, y0, x1, y1, 4, 26);
    const cx = (x0 + x1) * 0.5, cy = (y0 + y1) * 0.44;
    cv.blitPatch(R.pigLogo.img, R.pigLogo, cx - 44, cy - 30, cx + 44, cy + 30, { cutoutByInvAlpha: true, setTeamMask: 0 });
    cv.blitPatch(R.hazardStrip.img, R.hazardStrip, x0 + 8, y1 - 30, x1 - 8, y1 - 6, { setTeamMask: 0 });
  }

  // HAZARD / CROWN BRASS — золотисто-бронзовая царская отделка + жёлто-чёрные полосы
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.hazard);
    const ym = Math.floor((y0 + y1) * 0.5);
    cv.blitPatch(R.hazardStrip.img, R.hazardStrip, x0, y0, x1, ym, { setTeamMask: 0 });
    // Массивная тёмная бронза/латунь для короны башенки (alpha = 0!)
    cv.blitPatch(R.chromeMetal.img, R.chromeMetal, x0, ym, x1, y1, { setTeamMask: 0, rotate: 90, tint: [1.15, 0.92, 0.36], gain: 0.95 });
  }

  // WHEELS — 5 тяжёлых катков из d_hardtank_normal.dxt!
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.wheels);
    cv.blitPatch(R.pigWheels5.img, R.pigWheels5, x0, y0, x1, y1, { setTeamMask: 0 });
  }

  // TURRET SIDE — борт огромной башни + номер «01» + реальные боевые сколы/ржавчина
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.turretSide);
    cv.panelFrame(x0, y0, x1, y1, 5, 28);
    const Wp = x1 - x0, Hp = y1 - y0;
    cv.drawLine(x0 + Wp * 0.25, y0 + 8, x0 + Wp * 0.21, y1 - 8, 2.5, [0.06, 0.08, 0.10], 0.72);
    cv.drawLine(x0 + Wp * 0.75, y0 + 8, x0 + Wp * 0.79, y1 - 8, 2.5, [0.06, 0.08, 0.10], 0.72);
    cv.drawGlyph('0', x0 + Wp * 0.44, y0 + Hp * 0.52, Hp * 0.54, [0.92, 0.93, 0.94]);
    cv.drawGlyph('1', x0 + Wp * 0.58, y0 + Hp * 0.52, Hp * 0.54, [0.92, 0.93, 0.94]);
    if (isVet) {
      stampDmg(1, x0 + Wp * 0.58, y0 + 26, x0 + Wp * 0.86, y1 - 22);
      stampDmg(2, x0 + Wp * 0.12, y0 + 42, x0 + Wp * 0.34, y1 - 20);
    } else if (isElite) {
      stampDmg(0, x0 + Wp * 0.56, y0 + 20, x0 + Wp * 0.90, y1 - 18);
      stampDmg(3, x0 + Wp * 0.10, y0 + 24, x0 + Wp * 0.40, y1 - 16);
      stampDmg(1, x0 + Wp * 0.36, y0 + 18, x0 + Wp * 0.58, y0 + 96);
    }
  }

  // TURRET TOP — крыша дредноута + огромный оригинальный логотип Свиней!
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.turretTop);
    cv.panelFrame(x0, y0, x1, y1, 5, 28);
    const cx = (x0 + x1) * 0.5, cy = (y0 + y1) * 0.5;
    cv.drawRing(cx, cy + 16, 48, 58, [0.07, 0.09, 0.11], 0.78);
    cv.blitPatch(R.pigLogo.img, R.pigLogo, cx - 50, y0 + 18, cx + 50, y0 + 84, { cutoutByInvAlpha: true, setTeamMask: 0 });
    if (isVet || isElite) {
      stampDmg(3, x0 + 20, y0 + 94, x0 + 136, y1 - 16);
      if (isElite) stampDmg(1, x1 - 130, y0 + 26, x1 - 16, y0 + 124);
    }
  }

  // TURRET REAR — жалюзи кормы башни
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.turretRear);
    cv.panelFrame(x0, y0, x1, y1, 4, 24);
    cv.blitPatch(R.pigLouvers.img, R.pigLouvers, x0 + 10, y0 + 12, x1 - 10, y1 - 12, { setTeamMask: 0 });
  }

  // BARREL — спаренные тяжёлые осадные стволы (крашеные у основания, тёмный металл + щели на дульном тормозе + полосы Vet/Elite)
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.barrel);
    const Wb = x1 - x0, Hb = y1 - y0;
    const splitY = Math.floor(y0 + Hb * 0.74);
    cv.blitPatch(R.mantletMetal.img, R.mantletMetal, x0, splitY, x1, y1, { setTeamMask: 0, rotate: 90, gain: 0.62 });
    for (const vf of [0.14, 0.44, 0.58, 0.74]) {
      const yy = y0 + Hb * vf;
      cv.drawLine(x0, yy, x1, yy, 3, [0.05, 0.06, 0.07], 0.9, 0);
    }
    // Щели тяжёлого дульного тормоза
    for (let s = 0; s < 6; s++) {
      const sx = x0 + Wb * (s + 0.5) / 6;
      cv.fillRect(sx - 18, y0 + Hb * 0.81, sx + 18, y0 + Hb * 0.93, [0.03, 0.03, 0.04], 1, 0);
    }
    if (isVet || isElite) {
      const nStripes = isElite ? 4 : 2;
      for (let s = 0; s < nStripes; s++) {
        const sy = y0 + Hb * (0.18 + s * 0.065);
        cv.fillRect(x0, sy - 2, x1, sy + 7, [0.05, 0.05, 0.06], 1, 0);
        cv.fillRect(x0, sy, x1, sy + 5, [0.96, 0.80, 0.06], 1, 0);
      }
    }
  }

  // Вспомогательные зоны (из оригиналов игры)
  const [mx0, my0, mx1, my1] = cv.regPx(UV.mantlet);
  cv.blitPatch(R.mantletMetal.img, R.mantletMetal, mx0, my0, mx1, my1, { setTeamMask: 0, gain: 0.92 });
  const [fx0, fy0, fx1, fy1] = cv.regPx(UV.fenderTop);
  cv.blitPatch(R.fenderGrating.img, R.fenderGrating, fx0, fy0, fx1, fy1, { setTeamMask: 0 });
  const [tx0, ty0, tx1, ty1] = cv.regPx(UV.metal);
  cv.blitPatch(R.mantletMetal.img, R.mantletMetal, tx0, ty0, tx1, ty1, { setTeamMask: 0, gain: 0.62 });
  const [cx0, cy0, cx1, cy1] = cv.regPx(UV.chrome);
  cv.blitPatch(R.chromeMetal.img, R.chromeMetal, cx0, cy0, cx1, cy1, { setTeamMask: 0, rotate: 90, gain: 1.25 });
  const [lx0, ly0, lx1, ly1] = cv.regPx(UV.lights);
  cv.blitPatch(R.headlight.img, R.headlight, lx0, ly0, lx1, ly1, { setTeamMask: 0 });
  const [rx0, ry0, rx1, ry1] = cv.regPx(UV.taillight);
  cv.blitPatch(R.taillight.img, R.taillight, rx0, ry0, rx1, ry1, { setTeamMask: 0, rotate: 90 });

  return cv.downsample2x();
}

function buildSvinCzarGeometry() {
  const parts = {};
  const CROWN_UV = [UV.hazard[0], (UV.hazard[1] + UV.hazard[3]) * 0.52, UV.hazard[2], UV.hazard[3]];
  const HAZ_UV = [UV.hazard[0], UV.hazard[1], UV.hazard[2], (UV.hazard[1] + UV.hazard[3]) * 0.48];

  // 1) LANCTALP — колоссальная броневанна с 5 катками на борт (масштаб дредноута!)
  {
    const m = new Mesh();
    const prof = [[-266, -54], [268, -54], [316, -16], [322, 34], [-318, 34], [-312, -16]];
    m.addPrismX(prof, 210, UV.wheels, UV.metal);
    parts.Lanctalp = m;
  }

  // 2) TEST — сверхтяжёлый широкий корпус, 3 огромных клыка, мощный лобовой отвал, 4 дизельные трубы!
  {
    const m = new Mesh();
    const hullProf = [
      [-338, -28, 198],
      [304,  -28, 198],
      [356,    6, 188],  // чудовищный лобовой бронеклин
      [238,   54, 186],  // верх лобовой плиты
      [-196,  54, 190],  // просторная палуба под башню-дредноут
      [-342,  26, 196],  // скошенная корма двойного дизеля
    ];
    m.addPrismX(hullProf, 194, UV.hullSkirt, UV.hullTop, {
      edgeRegs: [UV.metal, UV.hullFront, UV.hullFront, UV.hullTop, UV.turretRear, UV.hullRear],
    });

    // Сверхширокие бронированные спонсоны и трапециевидные бортовые экраны
    for (const sx of [-1, 1]) {
      const xIn = sx * 188, xOut = sx * 256;
      const x0 = Math.min(xIn, xOut), x1 = Math.max(xIn, xOut);
      m.addBox(x0, x1, -326, 326, 18, 34, {
        top: UV.fenderTop, bot: UV.metal, front: UV.hullFront, back: UV.hullRear, left: UV.metal, right: UV.metal,
      });
      m.addFrustum([x0, x1, 322, 354], [x0, x1, 318, 326], -6, 30, { all: UV.hullFront, top: UV.fenderTop });
      m.addFrustum([x0, x1, -346, -322], [x0, x1, -330, -322], -4, 30, { all: UV.hullRear, top: UV.fenderTop });
      // Мощный бортовой бронеэкран
      const sx0 = sx > 0 ? 250 : -266, sx1 = sx > 0 ? 266 : -250;
      m.addFrustum([sx0, sx1, -218, 224], [sx0, sx1, -300, 296], -24, 34, {
        top: UV.fenderTop, bot: UV.metal, front: UV.metal, back: UV.metal,
        left: sx > 0 ? UV.hullSkirt : UV.metal, right: sx < 0 ? UV.hullSkirt : UV.metal,
      });
    }

    // ТРОЙНЫЕ ГИГАНТСКИЕ КЛЫКИ КАБАНА спереди (два боковых + один центральный таранный!)
    for (const sx of [-1, 1]) {
      m.addTube([
        [sx * 96, 298, -22], [sx * 112, 348, -18], [sx * 124, 382, 2], [sx * 134, 396, 34], [sx * 136, 386, 66],
      ], [24, 19, 14, 8, 2], 8, UV.chrome, { capStart: true, capEnd: true });
    }
    m.addTube([[0, 304, -22], [0, 360, -14], [0, 394, 14], [0, 398, 48]], [20, 15, 9, 2], 8, UV.chrome, { capStart: true, capEnd: true });

    // Бронированная рубка мехвода + пулемётное гнездо в лобовой плите
    m.addFrustum([-70, 70, 186, 266], [-56, 56, 194, 248], 44, 68, { all: UV.hullFront, top: UV.hullTop });

    // Фары и задние стоп-сигналы
    for (const sx of [-1, 1]) {
      const fx = sx * 222;
      m.addBox(fx - 22, fx + 22, 298, 328, 30, 50, { all: UV.metal, front: UV.lights });
      m.addBox(fx - 24, fx + 24, -334, -310, 22, 42, { all: UV.metal, back: UV.taillight });
    }

    // Двойной кормовой короб МТО + массивный отбойник с предупреждающими полосами
    m.addFrustum([-156, 156, -324, -214], [-142, 142, -314, -220], 34, 64, { all: UV.metal, top: UV.turretRear, back: UV.turretRear });
    m.addBox(-192, 192, -356, -330, -12, 28, { all: UV.hullRear, top: UV.fenderTop });

    // 4 ГИГАНТСКИЕ ВЕРТИКАЛЬНЫЕ ДИЗЕЛЬНЫЕ ТРУБЫ по углам кормы (жрёт топливо как не в себя!)
    for (const sx of [-1, 1]) {
      for (const dy of [-256, -296]) {
        m.addTube([
          [sx * 166, dy, 34], [sx * 204, dy, 46], [sx * 212, dy, 132], [sx * 222, dy - 14, 152],
        ], [12, 12, 11, 13], 8, UV.chrome, { capStart: true, capEnd: true });
      }
    }

    parts.Test = m;
  }

  // 3) LOVEGTORONY — КОЛОССАЛЬНАЯ БАШНЯ-ДРЕДНОУТ с «царской» башенкой, двойной антенной и огромной нишей
  {
    const m = new Mesh();
    // Кольцо строго CCW вокруг +Z
    const ring = (z, xF, xM, xB, yF, yM1, yM2, yB) => [
      [ xF, yF, z], [-xF, yF, z],
      [-xM, yM1, z], [-xM * 0.94, yM2, z],
      [-xB, yB, z], [ xB, yB, z],
      [ xM * 0.94, yM2, z], [ xM, yM1, z],
    ];
    const tRings = [
      ring(-66, 118, 212, 166,  218,  66, -138, -228),
      ring(-24, 112, 204, 158,  204,  58, -132, -218),
      ring( 42,  76, 138, 114,  144,  42, -104, -180),
    ];
    for (let r = 0; r < tRings.length - 1; r++) {
      const R0 = tRings[r], R1 = tRings[r + 1];
      const v0 = r === 0 ? 1.0 : 0.46, v1 = r === 0 ? 0.46 : 0.0;
      const sideRegs = [UV.hullFront, UV.turretSide, UV.turretSide, UV.turretSide, UV.turretRear, UV.turretSide, UV.turretSide, UV.turretSide];
      for (let i = 0; i < 8; i++) {
        const j = (i + 1) % 8;
        let u0 = 0, u1 = 1;
        if (i === 1) { u0 = 1.0; u1 = 0.74; }
        else if (i === 2) { u0 = 0.74; u1 = 0.22; }
        else if (i === 3) { u0 = 0.22; u1 = 0.0; }
        else if (i === 5) { u0 = 1.0; u1 = 0.78; }
        else if (i === 6) { u0 = 0.78; u1 = 0.26; }
        else if (i === 7) { u0 = 0.26; u1 = 0.0; }
        m.addQuad(R0[i], R0[j], R1[j], R1[i], sideRegs[i], [u0, v0], [u1, v0], [u1, v1], [u0, v1]);
      }
    }
    const topR = tRings[2];
    m.addPoly(topR, topR.map(p => uvRect(UV.turretTop, 1 - (p[0] + 144) / 288, 1 - (p[1] + 186) / 336)));
    m.addPoly([...tRings[0]].reverse(), tRings[0].map(() => uvRect(UV.metal, 0.5, 0.5)));

    // Кормовой бронированный сейф боеукладки с предупреждающей полосой
    m.addFrustum([-118, 118, -266, -214], [-108, 108, -254, -200], -42, 24, { all: UV.turretRear, back: HAZ_UV, top: UV.fenderTop });

    // Широкий литой воротник спаренной маски орудия
    m.addFrustum([-92, 92, 182, 236], [-78, 78, 158, 214], -48, 22, { all: UV.mantlet });

    // «Царская» командирская башенка с латунно-бронзовой короной-обручем!
    m.addLatheZ(0, -28, [[38, 68, 68], [66, 58, 58], [84, 52, 52], [88, 38, 38]], 8, UV.hullFront, { smooth: false, capStart: true, capEnd: true, capReg: UV.turretTop });
    // Бронзовый венец короны с 4 зубцами по периметру башенки!
    m.addLatheZ(0, -28, [[68, 60, 60], [82, 60, 60]], 8, CROWN_UV, { smooth: false, capStart: true, capEnd: true });
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + Math.PI / 4;
      const px = Math.cos(a) * 52, py = -28 + Math.sin(a) * 52;
      m.addFrustum([px - 10, px + 10, py - 10, py + 10], [px - 3, px + 3, py - 3, py + 3], 80, 106, { all: CROWN_UV });
    }

    // Массивные поручни и парные длинные антенны
    for (const sx of [-1, 1]) {
      m.addTube([[sx * 144, 102, 20], [sx * 172, 84, 22], [sx * 166, -112, 22], [sx * 136, -138, 20]], 6.5, 6, UV.metal, { capStart: true, capEnd: true });
      m.addLatheZ(sx * 76, -142, [[38, 10, 10], [60, 6, 6], [286, 2.4, 2.4]], 6, UV.metal, { smooth: true, capStart: true, capEnd: true });
    }

    parts.Lovegtorony = m;
  }

  // 4) CSO — СПАРЕННОЕ СВЕРХТЯЖЁЛОЕ ОСАДНОЕ ОРУДИЕ ДРЕДНОУТА (2 массивных ствола + эжекторы + дульные тормоза!)
  {
    const m = new Mesh();
    // Общий качающийся бронеблок маски между двумя стволами
    m.addBox(-72, 72, -108, -44, -26, 26, { all: UV.mantlet });
    for (const sx of [-38, 38]) {
      m.addLatheY(sx, 0, [
        [-96, 24], [-46, 22], [32, 20], [38, 27], [86, 27], [92, 18], [218, 16.5], [222, 22], [232, 22],
      ], 10, UV.barrel, { smooth: true, capStart: true, capEnd: true, vStart: 0.02, vEnd: 0.78 });
      // Массивный дульный тормоз на каждом стволе
      m.addFrustum([sx - 24, sx + 24, 230, 278], [sx - 21, sx + 21, 232, 276], -20, 20, {
        all: [UV.barrel[0], UV.barrel[1] + (UV.barrel[3] - UV.barrel[1]) * 0.76, UV.barrel[2], UV.barrel[3]],
        front: UV.metal, back: UV.metal,
      });
    }
    parts.Cso = m;
  }

  // 5) CHAIN R 001 / CHAIN L 001 — сверхширокие тяжёлые гусеницы
  const trkR = new Mesh(); buildTrackLoop(trkR, 48, -342, 342, -62, 60, -290, 290, 3.3);
  const trkL = new Mesh(); buildTrackLoop(trkL, 48, -342, 342, -62, 60, -290, 290, 3.3);
  parts['Chain R 001'] = trkR;
  parts['Chain L 001'] = trkL;

  const ROOT_M = [-1, 0, 0,  0, 0, -1,  0, 1, 0,  0, 58, 0];
  const ID_M = (tx, ty, tz, sx = 1, sy = 1, sz = 1) => [sx, 0, 0,  0, sy, 0,  0, 0, sz,  tx, ty, tz];
  const TRK_M = tx => [-0.92, 0, 0,  0, 0, -0.92,  0, 0.92, 0,  tx, 56, 0];

  return {
    trackTex: 'lanctalp.tga',
    nodes: [
      { name: 'Lanctalp',    parent: -1, m: ROOT_M, mesh: parts.Lanctalp },
      { name: 'Test',        parent:  0, m: ID_M(0, 0, 36), mesh: parts.Test },
      { name: 'Lovegtorony', parent:  1, m: ID_M(0, -6, 118), mesh: parts.Lovegtorony },
      { name: 'Cso',         parent:  2, m: ID_M(0, 272, -12), mesh: parts.Cso },
      { name: '_Torkolattuz',parent:  3, m: ID_M(0, 286, 0), helper: true },
      { name: '_kereso',     parent:  2, m: ID_M(66, 206, -12, 0.75, 1, 0.75), helper: true },
      { name: '_glow1piros', parent:  1, m: ID_M(222, -338, 32, -0.26, -1, 0.26), helper: true },
      { name: '_glow0piros', parent:  1, m: ID_M(-222, -338, 32, 0.26, -1, 0.26), helper: true },
      { name: '_glow2feher', parent:  1, m: ID_M(-222, 332, 40, 0.25, 1, 0.25), helper: true },
      { name: '_glow3feher', parent:  1, m: ID_M(222, 332, 40, -0.25, 1, 0.25), helper: true },
      { name: 'Chain R 001', parent: -1, m: TRK_M(-214), mesh: parts['Chain R 001'], isTrack: true },
      { name: 'Chain L 001', parent: -1, m: TRK_M( 214), mesh: parts['Chain L 001'], isTrack: true },
    ],
  };
}

const summary = buildUnitPackage({
  modelName: 'd_svinczar',
  race: 'pig',
  anifFrom: 'd_hardtank',
  outDir: OUT,
  buildGeometry: buildSvinCzarGeometry,
  buildAtlas: buildSvinCzarAtlas,
});
for (const s of summary) console.log(`d_svinczar_${s.level.padEnd(7)}  V=${String(s.verts).padStart(4)}  F=${String(s.faces).padStart(4)}  .4d=${s.size4d}B  .dxt=${s.sizeDxt}B`);

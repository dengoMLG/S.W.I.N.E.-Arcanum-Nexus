#!/usr/bin/env node
// Юнит #3 (Свиньи): «Бомбохряк» (d_bombohryak) — Бронированный грузовик-таран камикадзе.
//
// Силуэт: 4-колёсный бронированный тягач Свиней (вращающиеся/поворотные колёса Wheel L/R как в d_vontato!)
// с огромным V-образным стальным шипованным тараном и клыками спереди, бронированной кабиной с номером «99»,
// и открытым кузовом, доверху набитым красными топливными бочками (с табличками FUEL) и 2 гигантскими
// перевязанными авиабомбами/снарядами со стабилизаторами и жёлто-чёрной маркировкой!
//
// Совместимость Gepard: Wheel R/L 0 N002 (передние поворотные), Wheel R/L 1 N001 (задние), Test, Zaszlorud, _glow0..3.
'use strict';
const path = require('path');
const {
  clamp, uvRect, fbm,
  Mesh, buildWheelMesh, Canvas, loadGameAssets, buildUnitPackage,
} = require('../lib/swine-model-kit');

const OUT = path.resolve(process.argv[2] || 'mods-test/units/d_bombohryak');

const UV = {
  cabSide:    [0.01, 0.01, 0.45, 0.25], // Борт кабины + двери + лого Свиней + номер «99»
  cabFront:   [0.01, 0.27, 0.30, 0.45], // Лобовое бронестекло + решётка радиатора (из d_vontato!)
  bedSide:    [0.01, 0.47, 0.47, 0.63], // Бронированные борта кузова + шевроны Vet/Elite!
  bedFloor:   [0.01, 0.65, 0.31, 0.81], // Рифлёный настил кузова / крыша кабины
  barrelRed:  [0.01, 0.83, 0.48, 0.99], // Красные бочки с топливом + таблички FUEL!
  tireRim:    [0.50, 0.01, 0.72, 0.23], // Оригинальный диск колеса Свиней (d_vontato!)
  tireTread:  [0.74, 0.01, 0.86, 0.35], // Оригинальный протектор шины Свиней
  grille:     [0.88, 0.01, 0.99, 0.23], // Оригинальная решётка радиатора грузовика
  bombBody:   [0.50, 0.25, 0.72, 0.56], // Гигантские боеголовки/бомбы в кузове (тёмная сталь + жёлто-красные носы!)
  ramSteel:   [0.74, 0.37, 0.99, 0.61], // Побитый таранный щит + жёлто-чёрная полоса
  cabTop:     [0.50, 0.58, 0.72, 0.76], // Крыша кабины + логотип Свиней
  hazard:     [0.74, 0.63, 0.99, 0.76], // Предупреждающие полосы / ящики TNT
  metal:      [0.50, 0.78, 0.73, 0.98],
  chrome:     [0.75, 0.78, 0.99, 0.89],
  lights:     [0.75, 0.91, 0.87, 0.99],
  taillight:  [0.89, 0.91, 0.99, 0.99],
};

function buildBomboHryakAtlas(level) {
  const cv = new Canvas(1024);
  const ga = loadGameAssets(), R = ga.rects;
  const isVet = level === 'veteran', isElite = level === 'elite';
  const dmgSet = isElite ? ga.eliteDamages : ga.vetDamages;
  const stampDmg = (idx, dx0, dy0, dx1, dy1, rot = 0) => {
    const p = dmgSet[idx % dmgSet.length];
    cv.blitPatch(p, { x: 0, y: 0, w: p.W, h: p.H }, dx0, dy0, dx1, dy1, { useSrcAlphaAsOpacity: true, setTeamMask: 0, rotate: rot, opacity: isElite ? 0.95 : 0.86 });
  };

  cv.fillArmorBaseFromGame('pig', 1.05);

  // CAB SIDE — борта бронированной кабины с номером «99» и логотипом Свиней
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.cabSide);
    cv.panelFrame(x0, y0, x1, y1, 5, 32);
    const Wp = x1 - x0, Hp = y1 - y0;
    // Боковое бронеокно в верхней передней части двери
    cv.blitPatch(R.pigWindow.img, R.pigWindow, x0 + Wp * 0.54, y0 + 22, x0 + Wp * 0.88, y0 + Hp * 0.48, { setTeamMask: 0 });
    cv.drawGlyph('9', x0 + Wp * 0.24, y0 + Hp * 0.54, Hp * 0.44, [0.92, 0.93, 0.94]);
    cv.drawGlyph('9', x0 + Wp * 0.38, y0 + Hp * 0.54, Hp * 0.44, [0.92, 0.93, 0.94]);
    cv.blitPatch(R.pigLogo.img, R.pigLogo, x0 + Wp * 0.58, y0 + Hp * 0.54, x0 + Wp * 0.84, y0 + Hp * 0.88, { cutoutByInvAlpha: true, setTeamMask: 0 });
    if (isVet || isElite) stampDmg(isElite ? 0 : 1, x0 + 20, y0 + 20, x0 + 180, y0 + 115);
  }

  // CAB FRONT — лобовое стекло кабины (из d_vontato_normal.dxt!)
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.cabFront);
    cv.panelFrame(x0, y0, x1, y1, 5, 28);
    const cx = (x0 + x1) * 0.5;
    // Два бронированных лобовых окна с решётчатыми козырьками
    cv.blitPatch(R.pigWindow.img, R.pigWindow, x0 + 16, y0 + 24, cx - 8, y0 + 108, { setTeamMask: 0 });
    cv.blitPatch(R.pigWindow.img, R.pigWindow, cx + 8, y0 + 24, x1 - 16, y0 + 108, { setTeamMask: 0 });
    if (isVet || isElite) stampDmg(2, cx - 60, y0 + 105, cx + 68, y1 - 10);
  }

  // BED SIDE — борта кузова с ребрами жёсткости + оригинальные шевроны Vet/Elite!
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.bedSide);
    cv.panelFrame(x0, y0, x1, y1, 4, 30);
    const Wp = x1 - x0, Hp = y1 - y0;
    for (const f of [0.20, 0.40, 0.60, 0.80]) cv.drawLine(x0 + Wp * f, y0 + 6, x0 + Wp * f, y1 - 6, 3, [0.06, 0.08, 0.10], 0.78);
    if (isVet) {
      cv.blitPatch(R.vetChevrons.img, R.vetChevrons, x0 + Wp * 0.34, y0 + Hp * 0.16, x0 + Wp * 0.62, y0 + Hp * 0.86, { cutoutByInvAlpha: true, setTeamMask: 0, rotate: 90 });
      stampDmg(1, x0 + Wp * 0.62, y0 + 16, x0 + Wp * 0.90, y1 - 12);
    } else if (isElite) {
      cv.blitPatch(R.eliteChevrons.img, R.eliteChevrons, x0 + Wp * 0.22, y0 + Hp * 0.16, x0 + Wp * 0.74, y0 + Hp * 0.86, { cutoutByInvAlpha: true, setTeamMask: 0, rotate: 90 });
      stampDmg(0, x0 + Wp * 0.10, y0 + 16, x0 + Wp * 0.40, y1 - 12);
      stampDmg(3, x0 + Wp * 0.64, y0 + 16, x0 + Wp * 0.92, y1 - 12);
    }
  }

  // BED FLOOR — рифлёный стальной пол кузова
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.bedFloor);
    cv.blitPatch(R.fenderGrating.img, R.fenderGrating, x0, y0, x1, y1, { setTeamMask: 0 });
  }

  // BARREL RED — красные бочки с напалмом/топливом и оригинальными табличками «FUEL»!
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.barrelRed);
    const Wt = x1 - x0, Ht = y1 - y0;
    cv.blitPatch(R.fuelRedMetal.img, R.fuelRedMetal, x0, y0, x1, y1, { setTeamMask: 0, rotate: 90, gain: 0.95 });
    for (const fy of [0.16, 0.84]) cv.fillRect(x0, y0 + Ht * fy - 5, x1, y0 + Ht * fy + 5, [0.14, 0.14, 0.15], 0.95, 0);
    for (const fu of [0.22, 0.52, 0.82]) {
      const cx = x0 + Wt * fu, cy = y0 + Ht * 0.50;
      cv.blitPatch(R.fuelSign.img, R.fuelSign, cx - 32, cy - 38, cx + 32, cy + 38, { cutoutByInvAlpha: true, setTeamMask: 0 });
    }
  }

  // TIRE RIM, TREAD, TRUCK GRILLE — 100% оригинальные из d_vontato_normal.dxt!
  { const [x0, y0, x1, y1] = cv.regPx(UV.tireRim);   cv.blitPatch(R.pigTireRim.img, R.pigTireRim, x0, y0, x1, y1, { setTeamMask: 0 }); }
  { const [x0, y0, x1, y1] = cv.regPx(UV.tireTread); cv.blitPatch(R.pigTireTrd.img, R.pigTireTrd, x0, y0, x1, y1, { setTeamMask: 0 }); }
  { const [x0, y0, x1, y1] = cv.regPx(UV.grille);    cv.blitPatch(R.pigTruckGrill.img, R.pigTruckGrill, x0, y0, x1, y1, { setTeamMask: 0 }); }

  // BOMB BODY — гигантские авиабомбы/снаряды (тёмный оливково-серый корпус + жёлто-красная боеголовка!)
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.bombBody);
    const Hb = y1 - y0;
    cv.blitPatch(R.mantletMetal.img, R.mantletMetal, x0, y0, x1, y1, { setTeamMask: 0, tint: [0.55, 0.62, 0.50], gain: 0.95 });
    // Яркая жёлто-чёрная полоса взрывателя + красный нос боеголовки (V > 0.72)
    cv.blitPatch(R.hazardStrip.img, R.hazardStrip, x0, y0 + Hb * 0.62, x1, y0 + Hb * 0.74, { setTeamMask: 0 });
    cv.fillRect(x0, y0 + Hb * 0.74, x1, y1, [0.78, 0.12, 0.06], 0.92, 0);
  }

  // RAM STEEL — тяжёлый побитый таранный щит с предупреждающей полосой по низу (и боевой грязью!)
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.ramSteel);
    cv.blitPatch(R.mantletMetal.img, R.mantletMetal, x0, y0, x1, y1, { setTeamMask: 0, gain: 0.78 });
    cv.blitPatch(R.hazardStrip.img, R.hazardStrip, x0, y1 - 38, x1, y1 - 8, { setTeamMask: 0 });
    if (isVet || isElite) stampDmg(3, x0 + 18, y0 + 18, x1 - 18, y1 - 42);
  }

  // CAB TOP — крыша кабины + оригинальный логотип Свиней!
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.cabTop);
    cv.panelFrame(x0, y0, x1, y1, 4, 28);
    const cx = (x0 + x1) * 0.5, cy = (y0 + y1) * 0.5;
    cv.blitPatch(R.pigLogo.img, R.pigLogo, cx - 54, cy - 36, cx + 54, cy + 36, { cutoutByInvAlpha: true, setTeamMask: 0 });
  }

  // HAZARD / TNT CRATES, METAL, CHROME, LIGHTS, TAILLIGHTS
  { const [x0, y0, x1, y1] = cv.regPx(UV.hazard);    cv.blitPatch(R.hazardStrip.img, R.hazardStrip, x0, y0, x1, y1, { setTeamMask: 0 }); }
  { const [x0, y0, x1, y1] = cv.regPx(UV.metal);     cv.blitPatch(R.mantletMetal.img, R.mantletMetal, x0, y0, x1, y1, { setTeamMask: 0, gain: 0.62 }); }
  { const [x0, y0, x1, y1] = cv.regPx(UV.chrome);    cv.blitPatch(R.chromeMetal.img, R.chromeMetal, x0, y0, x1, y1, { setTeamMask: 0, rotate: 90, gain: 1.25 }); }
  { const [x0, y0, x1, y1] = cv.regPx(UV.lights);    cv.blitPatch(R.headlight.img, R.headlight, x0, y0, x1, y1, { setTeamMask: 0 }); }
  { const [x0, y0, x1, y1] = cv.regPx(UV.taillight); cv.blitPatch(R.taillight.img, R.taillight, x0, y0, x1, y1, { setTeamMask: 0, rotate: 90 }); }

  return cv.downsample2x();
}

function buildBomboHryakGeometry() {
  const parts = {};

  // 1) 4 тяжёлых колеса грузовика (ось вращения X, центр в 0,0,0 -> идеально крутятся и поворачивают в Gepard!)
  for (const wn of ['Wheel R 0 N002', 'Wheel L 0 N002', 'Wheel R 1 N001', 'Wheel L 1 N001']) {
    const w = new Mesh();
    buildWheelMesh(w, 28, 60, 14, UV.tireTread, UV.tireRim);
    parts[wn] = w;
  }

  // 2) TEST — бронированный грузовик с гигантским шипованным тараном, кабиной и кузовом с бочками и авиабомбами!
  {
    const m = new Mesh();

    // Силовая рама и мосты шасси
    m.addBox(-96, 96, -242, 232, -32, 6, { all: UV.metal });
    m.addBox(-114, 114, 134, 162, -40, -18, { all: UV.metal });
    m.addBox(-114, 114, -162, -134, -40, -18, { all: UV.metal });

    // Бронированный капот двигателя с решёткой радиатора
    m.addFrustum([-108, 108, 128, 240], [-96, 96, 122, 228], 4, 62, {
      all: UV.cabSide, top: UV.bedFloor, front: UV.grille,
    });
    // Надкрылья передних колёс
    for (const sx of [-1, 1]) {
      const x0 = sx > 0 ? 102 : -154, x1 = sx > 0 ? 154 : -102;
      m.addBox(x0, x1, 90, 214, 24, 38, { all: UV.bedSide, top: UV.bedFloor });
      // Фары и задние фонари
      const fx = sx * 124;
      m.addBox(fx - 16, fx + 16, 216, 244, 28, 48, { all: UV.metal, front: UV.lights });
      m.addBox(fx - 18, fx + 18, -256, -238, 6, 26, { all: UV.metal, back: UV.taillight });
    }

    // Бронированная наклонная кабина Свиней (отдельно левая/правая грань чтобы «99» не зеркалилось!)
    m.addFrustum([-118, 118, 10, 134], [-104, 104, 18, 118], 6, 126, {
      top: UV.cabTop, bot: UV.metal, front: UV.cabFront, back: UV.cabSide, left: false, right: false,
    });
    // Боковины кабины с прямым чтением «99» на обоих бортах в игре!
    m.addQuad([-118, 134, 6], [-118, 10, 6], [-104, 18, 126], [-104, 118, 126], UV.cabSide, [1, 1], [0, 1], [0, 0], [1, 0]);
    m.addQuad([ 118, 10, 6], [ 118, 134, 6], [ 104, 118, 126], [ 104, 18, 126], UV.cabSide, [1, 1], [0, 1], [0, 0], [1, 0]);

    // Парные выхлопные трубы сразу за кабиной
    for (const sx of [-1, 1]) {
      m.addTube([[sx * 108, 18, 16], [sx * 124, 14, 36], [sx * 124, 10, 148], [sx * 134, -2, 164]], [8, 8, 7.5, 9], 8, UV.chrome, { capStart: true, capEnd: true });
    }

    // ═══ ГИГАНТСКИЙ V-ОБРАЗНЫЙ ШИПОВАННЫЙ ТАРАН С КЛЫКАМИ СПЕРЕДИ! ═══
    // Центральный клин-отвал
    m.addFrustum([-144, 144, 240, 288], [-134, 134, 232, 268], -36, 44, { all: UV.ramSteel, front: UV.ramSteel });
    // 5 массивных стальных шипов-бивней вдоль тарана!
    for (const sx of [-114, -58, 0, 58, 114]) {
      const len = sx === 0 ? 64 : 48;
      m.addTube([[sx, 276, -12], [sx, 276 + len * 0.6, -4], [sx, 276 + len, 18]], [14, 9, 1.8], 7, UV.chrome, { capStart: true, capEnd: true });
    }

    // ═══ ОТКРЫТЫЙ БРОНИРОВАННЫЙ КУЗОВ, НАБИТЫЙ ВЗРЫВЧАТКОЙ! ═══
    // Платформа и низкие борта кузова (чтобы бочки и бомбы были отлично видны!)
    m.addBox(-134, 134, -248, 8, 4, 20, { all: UV.bedSide, top: UV.bedFloor });
    for (const sx of [-1, 1]) {
      const x0 = sx > 0 ? 120 : -136, x1 = sx > 0 ? 136 : -120;
      m.addBox(x0, x1, -248, 8, 20, 62, { all: UV.bedSide, top: UV.metal });
    }
    m.addBox(-134, 134, -252, -236, 20, 56, { all: UV.bedSide, back: UV.hazard, top: UV.metal });

    // 4 КРАСНЫЕ ТОПЛИВНЫЕ БОЧКИ (по 2 по бокам кузова, с табличками FUEL!)
    for (const sx of [-84, 84]) {
      for (const py of [-48, -172]) {
        m.addLatheZ(sx, py, [[20, 32, 32], [24, 35, 35], [108, 35, 35], [112, 32, 32]], 10, UV.barrelRed, { smooth: true, capStart: true, capEnd: true });
      }
    }

    // 2 ГИГАНТСКИЕ АВИАБОМБЫ / СНАРЯДЫ ПО ЦЕНТРУ КУЗОВА (перевязаны ремнями!)
    for (const sx of [-26, 26]) {
      m.addLatheY(sx, 58, [
        [-228, 12], [-212, 24], [-68, 26], [-24, 22], [2, 10], [10, 2],
      ], 10, UV.bombBody, { smooth: true, capStart: true, capEnd: true, vStart: 0.02, vEnd: 0.98 });
      // Хвостовые стабилизаторы бомбы
      m.addBox(sx - 24, sx + 24, -232, -198, 54, 62, { all: UV.metal });
      m.addBox(sx - 4, sx + 4, -232, -198, 34, 82, { all: UV.metal });
    }
    // Стяжные стальные дуги поверх всего взрывоопасного груза
    for (const py of [-74, -152]) {
      m.addTube([[-126, py, 56], [-118, py, 118], [118, py, 118], [126, py, 56]], 6, 6, UV.metal, { capStart: true, capEnd: true });
    }

    parts.Test = m;
  }

  // 3) ZASZLORUD — длинная антенна
  {
    const m = new Mesh();
    m.addLatheZ(0, 0, [[0, 6, 6], [24, 4, 4], [220, 1.8, 1.8]], 6, UV.metal, { smooth: true, capStart: true, capEnd: true });
    parts.Zaszlorud = m;
  }

  const ROOT_M = (tx, ty, tz) => [-1, 0, 0,  0, 0, -1,  0, 1, 0,  tx, ty, tz];
  const ID_M = (tx, ty, tz, sx = 1, sy = 1, sz = 1) => [sx, 0, 0,  0, sy, 0,  0, 0, sz,  tx, ty, tz];

  return {
    nodes: [
      { name: 'Wheel R 1 N001', parent: -1, m: ROOT_M(-128, 60, -148), mesh: parts['Wheel R 0 N002'] },
      { name: 'Wheel L 1 N001', parent: -1, m: ROOT_M( 128, 60, -148), mesh: parts['Wheel L 0 N002'] },
      { name: 'Wheel R 0 N002', parent: -1, m: ROOT_M(-128, 60,  148), mesh: parts['Wheel R 1 N001'] },
      { name: 'Wheel L 0 N002', parent: -1, m: ROOT_M( 128, 60,  148), mesh: parts['Wheel L 1 N001'] },
      { name: 'Test',           parent: -1, m: ROOT_M(0, 82, 0), mesh: parts.Test },
      { name: 'Zaszlorud',      parent:  4, m: ID_M(88, 36, 122), mesh: parts.Zaszlorud },
      { name: '_glow0piros',    parent:  4, m: ID_M(-124, -258, 16, 0.24, -1, 0.24), helper: true },
      { name: '_glow1piros',    parent:  4, m: ID_M( 124, -258, 16, -0.24, -1, 0.24), helper: true },
      { name: '_glow2feher',    parent:  4, m: ID_M(-124, 246, 38, 0.22, 1, 0.22), helper: true },
      { name: '_glow3feher',    parent:  4, m: ID_M( 124, 246, 38, -0.22, 1, 0.22), helper: true },
    ],
  };
}

const summary = buildUnitPackage({
  modelName: 'd_bombohryak',
  race: 'pig',
  anifFrom: 'd_dzsip',
  outDir: OUT,
  buildGeometry: buildBomboHryakGeometry,
  buildAtlas: buildBomboHryakAtlas,
});
for (const s of summary) console.log(`d_bombohryak_${s.level.padEnd(7)}  V=${String(s.verts).padStart(4)}  F=${String(s.faces).padStart(4)}  .4d=${s.size4d}B  .dxt=${s.sizeDxt}B`);

#!/usr/bin/env node
// Юнит #6 (Кролики): «Заяц-Призрак» (ny_zayacprizrak) — Снайперский багги-истребитель.
//
// Силуэт: крошечный приземистый 4-колёсный сверхбыстрый багги Кроликов (синеступичные колёса
// Wheel L/R из ny_dzsip, обтекаемый нос с заячьей решёткой, открытый каркас безопасности,
// задний ребристый хром-турбодвигатель, оригинальная морковка и римский номер VII), на который
// водрузили АБСУРДНО ДЛИННУЮ БРОНЕБОЙНУЮ СНАЙПЕРСКУЮ ПУШКУ (Cso) с оптическим прицелом и огромным дульным тормозом!
//
// Совместимость Gepard: Wheel R/L 0 N002, Wheel R/L 1 N001, Test, Lovegtorony, Cso, _Torkolattuz, Zaszlorud, _glow0..3.
'use strict';
const path = require('path');
const {
  clamp, uvRect,
  Mesh, buildWheelMesh, Canvas, loadGameAssets, buildUnitPackage,
} = require('../lib/swine-model-kit');

const OUT = path.resolve(process.argv[2] || 'mods-test/units/ny_zayacprizrak');

const UV = {
  bodySide:   [0.01, 0.01, 0.46, 0.25], // Борт багги + римское VII + оригинальная морковка + звезда Vet/Elite!
  bodyTop:    [0.01, 0.27, 0.31, 0.48], // Капот/крыша + оригинальная морковка / белая звезда Vet/Elite!
  window:     [0.33, 0.27, 0.47, 0.48], // Оригинальное стекло кабины Кроликов
  grille:     [0.01, 0.50, 0.24, 0.67], // Оригинальная заячья решётка радиатора (ny_dzsip!)
  ribbed:     [0.26, 0.50, 0.48, 0.67], // Оригинальный ребристый хромированный моторный кожух!
  turret:     [0.01, 0.69, 0.46, 0.85], // Лёгкая снайперская башенка
  scope:      [0.01, 0.87, 0.46, 0.99], // Оптика прицела (тёмный металл + синяя линза!)
  tireRim:    [0.50, 0.01, 0.72, 0.23], // Оригинальное колесо Кроликов (синяя ступица!)
  tireTread:  [0.74, 0.01, 0.88, 0.34], // Оригинальный протектор шины Кроликов
  barrel:     [0.50, 0.36, 0.99, 0.52], // Сверхдлинная снайперская пушка + белые полосы Vet/Elite!
  metal:      [0.50, 0.54, 0.74, 0.76],
  chrome:     [0.76, 0.54, 0.99, 0.76],
  lights:     [0.50, 0.78, 0.72, 0.98],
  taillight:  [0.74, 0.78, 0.99, 0.98],
};

function buildZayacPrizrakAtlas(level) {
  const cv = new Canvas(1024);
  const ga = loadGameAssets(), R = ga.rects;
  const isVet = level === 'veteran', isElite = level === 'elite';
  const dmgSet = isElite ? ga.eliteDamages : ga.vetDamages;
  const stampDmg = (idx, dx0, dy0, dx1, dy1, rot = 0) => {
    const p = dmgSet[idx % dmgSet.length];
    cv.blitPatch(p, { x: 0, y: 0, w: p.W, h: p.H }, dx0, dy0, dx1, dy1, { useSrcAlphaAsOpacity: true, setTeamMask: 0, rotate: rot, opacity: isElite ? 0.92 : 0.82 });
  };

  // Живая оригинальная охра Кроликов из ny_lighttank_normal.dxt (alpha = 1 -> динамический цвет команды!)
  cv.fillArmorBaseFromGame('rabbit', 1.02);

  // BODY SIDE — борта багги + VII + оригинальная морковка + белая звезда на Vet/Elite
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.bodySide);
    cv.panelFrame(x0, y0, x1, y1, 4, 34);
    const Wp = x1 - x0, Hp = y1 - y0;
    // Гоночная белая полоса вдоль низа борта на Vet/Elite (alpha = 0!)
    if (isVet || isElite) {
      cv.fillRect(x0 + 8, y1 - 36, x1 - 8, y1 - 20, [0.06, 0.06, 0.07], 1, 0);
      cv.fillRect(x0 + 8, y1 - 33, x1 - 8, y1 - 23, [0.95, 0.96, 0.97], 1, 0);
      if (isElite) {
        cv.fillRect(x0 + 8, y1 - 52, x1 - 8, y1 - 40, [0.06, 0.06, 0.07], 1, 0);
        cv.fillRect(x0 + 8, y1 - 50, x1 - 8, y1 - 42, [0.95, 0.96, 0.97], 1, 0);
      }
    }
    cv.drawGlyph('V', x0 + Wp * 0.24, y0 + Hp * 0.44, Hp * 0.44, [0.96, 0.97, 0.98]);
    cv.drawGlyph('I', x0 + Wp * 0.36, y0 + Hp * 0.44, Hp * 0.44, [0.96, 0.97, 0.98]);
    cv.drawGlyph('I', x0 + Wp * 0.44, y0 + Hp * 0.44, Hp * 0.44, [0.96, 0.97, 0.98]);
    cv.blitPatch(R.rabbitCarrotH.img, R.rabbitCarrotH, x0 + Wp * 0.56, y0 + Hp * 0.16, x0 + Wp * 0.84, y0 + Hp * 0.72, { cutoutByInvAlpha: true, setTeamMask: 0 });
    if (isVet || isElite) stampDmg(1, x0 + 20, y0 + 22, x0 + 160, y0 + 125);
  }

  // BODY TOP — капот и крыша + оригинальная морковка / белая звезда на Vet/Elite!
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.bodyTop);
    cv.panelFrame(x0, y0, x1, y1, 4, 30);
    const cx = (x0 + x1) * 0.5, cy = (y0 + y1) * 0.5;
    if (isVet || isElite) {
      cv.blitPatch(R.rabbitStar.img, R.rabbitStar, cx - 56, cy - 54, cx + 56, cy + 54, { cutoutByInvAlpha: true, setTeamMask: 0 });
      stampDmg(2, x0 + 20, y0 + 20, x0 + 140, y0 + 110);
    } else {
      cv.blitPatch(R.rabbitCarrot.img, R.rabbitCarrot, cx - 34, cy - 64, cx + 34, cy + 64, { cutoutByInvAlpha: true, setTeamMask: 0 });
    }
  }

  // TURRET — лёгкая снайперская башня (+ звезда на Elite!)
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.turret);
    cv.panelFrame(x0, y0, x1, y1, 4, 30);
    const cx = (x0 + x1) * 0.5, cy = (y0 + y1) * 0.5;
    if (isElite) cv.blitPatch(R.rabbitStar.img, R.rabbitStar, cx - 44, cy - 44, cx + 44, cy + 44, { cutoutByInvAlpha: true, setTeamMask: 0 });
    if (isVet || isElite) stampDmg(0, x0 + 28, y0 + 18, x0 + 150, y1 - 16);
  }

  // SCOPE — оптический прицел (тёмный металл + голубая стеклянная линза!)
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.scope);
    const xm = Math.floor((x0 + x1) * 0.65);
    cv.blitPatch(R.mantletMetal.img, R.mantletMetal, x0, y0, xm, y1, { setTeamMask: 0, gain: 0.45 });
    // Голубая линза прицела
    cv.fillRect(xm, y0, x1, y1, [0.06, 0.14, 0.24], 1, 0);
    cv.fillCircle((xm + x1) * 0.5, (y0 + y1) * 0.5, (y1 - y0) * 0.36, [0.22, 0.68, 0.94], 1, 0);
    cv.fillCircle((xm + x1) * 0.5 - 12, (y0 + y1) * 0.5 - 10, (y1 - y0) * 0.12, [0.88, 0.96, 1.0], 1, 0);
  }

  // BARREL — сверхдлинная снайперская пушка (крашеная у основания + белые полосы Vet/Elite + тёмный ствол + дульный тормоз!)
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.barrel);
    const Wb = x1 - x0, Hb = y1 - y0;
    const splitY = Math.floor(y0 + Hb * 0.58);
    cv.blitPatch(R.mantletMetal.img, R.mantletMetal, x0, splitY, x1, y1, { setTeamMask: 0, rotate: 90, gain: 0.60 });
    for (let s = 0; s < 6; s++) {
      const sx = x0 + Wb * (s + 0.5) / 6;
      cv.fillRect(sx - 16, y0 + Hb * 0.84, sx + 16, y0 + Hb * 0.95, [0.03, 0.03, 0.04], 1, 0);
    }
    if (isVet || isElite) {
      const nStripes = isElite ? 4 : 2;
      for (let s = 0; s < nStripes; s++) {
        const sy = y0 + Hb * (0.14 + s * 0.075);
        cv.fillRect(x0, sy - 2, x1, sy + 7, [0.06, 0.06, 0.07], 1, 0);
        cv.fillRect(x0, sy, x1, sy + 5, [0.96, 0.97, 0.98], 1, 0); // Белые полосы — стандарт Кроликов!
      }
    }
  }

  // Оригинальные ассеты Кроликов из ny_dzsip и ny_lighttank!
  { const [x0, y0, x1, y1] = cv.regPx(UV.window);    cv.blitPatch(R.rabbitWindow.img, R.rabbitWindow, x0, y0, x1, y1, { setTeamMask: 0, rotate: 90 }); }
  { const [x0, y0, x1, y1] = cv.regPx(UV.grille);    cv.blitPatch(R.rabbitGrille.img, R.rabbitGrille, x0, y0, x1, y1, { setTeamMask: 0 }); }
  { const [x0, y0, x1, y1] = cv.regPx(UV.ribbed);    cv.blitPatch(R.rabbitRibbed.img, R.rabbitRibbed, x0, y0, x1, y1, { setTeamMask: 0 }); }
  { const [x0, y0, x1, y1] = cv.regPx(UV.tireRim);   cv.blitPatch(R.rabbitTireRim.img, R.rabbitTireRim, x0, y0, x1, y1, { setTeamMask: 0 }); }
  { const [x0, y0, x1, y1] = cv.regPx(UV.tireTread); cv.blitPatch(R.rabbitTireTrd.img, R.rabbitTireTrd, x0, y0, x1, y1, { setTeamMask: 0 }); }
  { const [x0, y0, x1, y1] = cv.regPx(UV.metal);     cv.blitPatch(R.mantletMetal.img, R.mantletMetal, x0, y0, x1, y1, { setTeamMask: 0, gain: 0.65 }); }
  { const [x0, y0, x1, y1] = cv.regPx(UV.chrome);    cv.blitPatch(R.chromeMetal.img, R.chromeMetal, x0, y0, x1, y1, { setTeamMask: 0, rotate: 90, gain: 1.35 }); }
  { const [x0, y0, x1, y1] = cv.regPx(UV.lights);    cv.blitPatch(R.headlight.img, R.headlight, x0, y0, x1, y1, { setTeamMask: 0 }); }
  { const [x0, y0, x1, y1] = cv.regPx(UV.taillight); cv.blitPatch(R.taillight.img, R.taillight, x0, y0, x1, y1, { setTeamMask: 0, rotate: 90 }); }

  return cv.downsample2x();
}

function buildZayacPrizrakGeometry() {
  const parts = {};
  const LENS_UV = [UV.scope[0] + (UV.scope[2] - UV.scope[0]) * 0.68, UV.scope[1], UV.scope[2], UV.scope[3]];
  const BODY_SCOPE_UV = [UV.scope[0], UV.scope[1], UV.scope[0] + (UV.scope[2] - UV.scope[0]) * 0.62, UV.scope[3]];

  // 4 лёгких широких колеса багги Кроликов (синеступичные диски!)
  for (const wn of ['Wheel R 0 N002', 'Wheel L 0 N002', 'Wheel R 1 N001', 'Wheel L 1 N001']) {
    const w = new Mesh();
    buildWheelMesh(w, 26, 48, 14, UV.tireTread, UV.tireRim);
    parts[wn] = w;
  }

  // TEST — ультракомпактный приземистый багги-клиновик + хромированный кенгурятник + каркас + турбомотор сзади
  {
    const m = new Mesh();
    // Низкий спортивный обтекаемый корпус багги
    const prof = [[-174, -20, 92], [174, -20, 86], [202, 2, 76], [116, 36, 86], [-94, 38, 96], [-178, 22, 94]];
    m.addPrismX(prof, 90, UV.bodySide, UV.bodyTop, {
      edgeRegs: [UV.metal, UV.grille, UV.bodyTop, UV.bodyTop, UV.ribbed, UV.ribbed],
    });
    // Боковые понтоны-крылья над колёсами (с чётким чтением VII)
    for (const sx of [-1, 1]) {
      const x0 = sx > 0 ? 86 : -132, x1 = sx > 0 ? 132 : -86;
      m.addBox(x0, x1, -86, 82, -10, 28, { top: UV.bodyTop, bot: UV.metal, front: UV.bodyTop, back: UV.bodyTop, left: UV.bodySide, right: UV.bodySide });
      // Оси колёс
      m.addBox(sx > 0 ? 78 : -118, sx > 0 ? 118 : -78, 106, 126, -24, -10, { all: UV.metal });
      m.addBox(sx > 0 ? 78 : -118, sx > 0 ? 118 : -78, -126, -106, -24, -10, { all: UV.metal });
      // Хромированные круглые фары спереди и стоп-сигналы сзади
      m.addLatheY(sx * 76, 18, [[168, 10], [184, 14], [194, 13]], 10, UV.chrome, { smooth: true, capStart: true, capEnd: true, capReg: UV.lights });
      m.addBox(sx * 74 - 12, sx * 74 + 12, -184, -170, 6, 22, { all: UV.metal, back: UV.taillight });
    }
    // Фирменный хромированный передний кенгурятник-«резцы» Кроликов
    m.addTube([[-78, 184, -6], [-64, 210, 0], [64, 210, 0], [78, 184, -6]], 7.5, 7, UV.chrome, { capStart: true, capEnd: true });
    // Защитная кабина мехвода с наклонным лобовым стеклом
    m.addFrustum([-70, 70, 14, 118], [-58, 58, 22, 92], 32, 74, { top: UV.bodyTop, bot: UV.metal, front: UV.window, back: UV.ribbed, left: UV.bodySide, right: UV.bodySide });
    // Задний открытый ребристый хромированный турбомотор + двойные хромированные выхлопы!
    m.addFrustum([-76, 76, -168, -82], [-66, 66, -160, -88], 26, 62, { all: UV.ribbed });
    for (const sx of [-1, 1]) {
      m.addTube([[sx * 54, -138, 36], [sx * 64, -186, 46], [sx * 66, -206, 56]], [7, 7, 8.5], 7, UV.chrome, { capStart: true, capEnd: true });
    }
    parts.Test = m;
  }

  // LOVEGTORONY — компактная лёгкая поворотная снайперская турель (низкопрофильный щиток-обтекатель)
  {
    const m = new Mesh();
    m.addLatheZ(0, 0, [[-24, 68, 76], [0, 72, 80], [24, 54, 62], [32, 34, 40]], 10, UV.turret, { smooth: true, capStart: true, capEnd: true });
    // Противовес сзади башни (уравновешивает абсурдно длинную пушку!)
    m.addFrustum([-44, 44, -112, -58], [-38, 38, -104, -56], -12, 22, { all: UV.ribbed, top: UV.turret });
    parts.Lovegtorony = m;
  }

  // CSO — АБСУРДНО ДЛИННАЯ БРОНЕБОЙНАЯ СНАЙПЕРСКАЯ ПУШКА + ОПТИЧЕСКИЙ ПРИЦЕЛ + МАССИВНЫЙ ДУЛЬНЫЙ ТОРМОЗ!
  {
    const m = new Mesh();
    // Кожух казённика + невероятно длинный тонкий ствол (375 единиц — вдвое длиннее самого багги!)
    m.addLatheY(0, 0, [
      [-64, 20], [-14, 20], [-6, 15], [64, 14], [70, 18], [94, 18], [100, 11.5], [298, 9.5], [302, 13], [312, 13],
    ], 12, UV.barrel, { smooth: true, capStart: true, capEnd: true, vStart: 0.02, vEnd: 0.80 });
    // Широкий Т-образный снайперский дульный тормоз на самом конце (Y: 310..356)
    m.addFrustum([-24, 24, 310, 356], [-22, 22, 312, 354], -13, 13, {
      all: [UV.barrel[0], UV.barrel[1] + (UV.barrel[3] - UV.barrel[1]) * 0.78, UV.barrel[2], UV.barrel[3]],
      front: UV.metal, back: UV.metal,
    });
    // Оптический снайперский прицел на кронштейнах прямо поверх пушки (с голубой линзой!)
    m.addLatheY(0, 30, [[-26, 9], [52, 9], [66, 13], [84, 13]], 10, BODY_SCOPE_UV, { smooth: true, capStart: true, capEnd: true, capReg: LENS_UV });
    for (const cy of [-8, 36]) m.addBox(-4, 4, cy - 5, cy + 5, 14, 24, { all: UV.metal });
    parts.Cso = m;
  }

  // ZASZLORUD — тонкая высокая антенна
  {
    const m = new Mesh();
    m.addLatheZ(0, 0, [[0, 5, 5], [18, 3.5, 3.5], [190, 1.5, 1.5]], 6, UV.metal, { smooth: true, capStart: true, capEnd: true });
    parts.Zaszlorud = m;
  }

  const ROOT_M = (tx, ty, tz) => [-1, 0, 0,  0, 0, -1,  0, 1, 0,  tx, ty, tz];
  const ID_M = (tx, ty, tz, sx = 1, sy = 1, sz = 1) => [sx, 0, 0,  0, sy, 0,  0, 0, sz,  tx, ty, tz];

  return {
    nodes: [
      { name: 'Wheel R 1 N001', parent: -1, m: ROOT_M(-116, 48, -116), mesh: parts['Wheel R 0 N002'] },
      { name: 'Wheel L 1 N001', parent: -1, m: ROOT_M( 116, 48, -116), mesh: parts['Wheel L 0 N002'] },
      { name: 'Wheel R 0 N002', parent: -1, m: ROOT_M(-116, 48,  116), mesh: parts['Wheel R 1 N001'] },
      { name: 'Wheel L 0 N002', parent: -1, m: ROOT_M( 116, 48,  116), mesh: parts['Wheel L 1 N001'] },
      { name: 'Test',           parent: -1, m: ROOT_M(0, 62, 0), mesh: parts.Test },
      { name: 'Lovegtorony',    parent:  4, m: ID_M(0, -14, 88), mesh: parts.Lovegtorony },
      { name: 'Cso',            parent:  5, m: ID_M(0, 78, 8), mesh: parts.Cso },
      { name: '_Torkolattuz',   parent:  6, m: ID_M(0, 362, 0), helper: true },
      { name: 'Zaszlorud',      parent:  5, m: ID_M(44, -46, 22), mesh: parts.Zaszlorud },
      { name: '_glow0piros',    parent:  4, m: ID_M(-74, -186, 14, 0.28, -1, 0.28), helper: true },
      { name: '_glow1piros',    parent:  4, m: ID_M( 74, -186, 14, -0.28, -1, 0.28), helper: true },
      { name: '_glow2feher',    parent:  4, m: ID_M(-76, 198, 18, 0.24, 1, 0.24), helper: true },
      { name: '_glow3feher',    parent:  4, m: ID_M( 76, 198, 18, -0.24, 1, 0.24), helper: true },
    ],
  };
}

const summary = buildUnitPackage({
  modelName: 'ny_zayacprizrak',
  race: 'rabbit',
  anifFrom: 'ny_dzsip',
  outDir: OUT,
  buildGeometry: buildZayacPrizrakGeometry,
  buildAtlas: buildZayacPrizrakAtlas,
});
for (const s of summary) console.log(`ny_zayacprizrak_${s.level.padEnd(7)}  V=${String(s.verts).padStart(4)}  F=${String(s.faces).padStart(4)}  .4d=${s.size4d}B  .dxt=${s.sizeDxt}B`);

#!/usr/bin/env node
// Юнит #8 (Кролики): «Кротобой» (ny_krotoboy) — Скоростной сапёр-минёр.
//
// Силуэт: вёрткий гусеничный бронетрактор Кроликов (синеступичные катки ny_lighttank + бегущие
// гусеницы ny_lanctalp.tga), СПЕРЕДИ — зубчатый катковый минный трал на гидроштангах, СЗАДИ —
// открытый лоток миноукладчика со стопкой противотанковых мин, НА КРЫШЕ — компактная поворотная
// купольная пулемётная башенка самообороны (Lovegtorony + Cso) и высокая антенна-флагшток!
//
// Совместимость Gepard: Lanctalp, Test, Lovegtorony, Cso, _Torkolattuz, Zaszlorud, _glow0..3, Chain R/L 001.
'use strict';
const path = require('path');
const {
  clamp, uvRect,
  Mesh, buildTrackLoop, Canvas, loadGameAssets, buildUnitPackage,
} = require('../lib/swine-model-kit');

const OUT = path.resolve(process.argv[2] || 'mods-test/units/ny_krotoboy');

const UV = {
  hullTop:    [0.01, 0.01, 0.45, 0.27],
  hullFront:  [0.01, 0.29, 0.30, 0.46],
  hullSkirt:  [0.01, 0.48, 0.47, 0.64], // Борт трактора + IV + морковка + звезда Vet/Elite!
  window:     [0.32, 0.29, 0.47, 0.46], // Бронестекло сапёра
  hazard:     [0.01, 0.66, 0.47, 0.81], // Инженерные жёлто-чёрные полосы трала/лотка!
  mineMetal:  [0.01, 0.83, 0.47, 0.99], // Противотанковые мины (тёмный металл + красная кнопка-взрыватель!)
  wheels:     [0.50, 0.01, 0.99, 0.16], // Оригинальные синеступичные катки Кроликов!
  turret:     [0.50, 0.18, 0.99, 0.38], // Купольная пулемётная башенка + звезда Vet/Elite
  ribbed:     [0.50, 0.40, 0.99, 0.56], // Ребристый хром-кожух двигателя
  mgBarrel:   [0.50, 0.58, 0.99, 0.72], // Ствол пулемёта + полосы Vet/Elite
  metal:      [0.50, 0.74, 0.73, 0.98],
  chrome:     [0.75, 0.74, 0.99, 0.86],
  lights:     [0.75, 0.88, 0.87, 0.99],
  taillight:  [0.89, 0.88, 0.99, 0.99],
};

function buildKrotoboyAtlas(level) {
  const cv = new Canvas(1024);
  const ga = loadGameAssets(), R = ga.rects;
  const isVet = level === 'veteran', isElite = level === 'elite';
  const dmgSet = isElite ? ga.eliteDamages : ga.vetDamages;
  const stampDmg = (idx, dx0, dy0, dx1, dy1, rot = 0) => {
    const p = dmgSet[idx % dmgSet.length];
    cv.blitPatch(p, { x: 0, y: 0, w: p.W, h: p.H }, dx0, dy0, dx1, dy1, { useSrcAlphaAsOpacity: true, setTeamMask: 0, rotate: rot, opacity: isElite ? 0.92 : 0.82 });
  };

  cv.fillArmorBaseFromGame('rabbit', 1.02);

  {
    const [x0, y0, x1, y1] = cv.regPx(UV.hullTop);
    cv.panelFrame(x0, y0, x1, y1, 4, 30);
    const cx = (x0 + x1) * 0.5, cy = (y0 + y1) * 0.5;
    if (isVet || isElite) cv.blitPatch(R.rabbitStar.img, R.rabbitStar, cx - 54, cy - 52, cx + 54, cy + 52, { cutoutByInvAlpha: true, setTeamMask: 0 });
    else cv.blitPatch(R.rabbitCarrot.img, R.rabbitCarrot, cx - 34, cy - 62, cx + 34, cy + 62, { cutoutByInvAlpha: true, setTeamMask: 0 });
    if (isVet || isElite) stampDmg(0, x0 + 22, y0 + 20, x0 + 150, y0 + 108);
  }
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.hullFront);
    cv.panelFrame(x0, y0, x1, y1, 4, 28);
    cv.blitPatch(R.rabbitGrille.img, R.rabbitGrille, x0 + 24, y0 + 24, x1 - 24, y1 - 24, { setTeamMask: 0 });
  }
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.hullSkirt);
    cv.panelFrame(x0, y0, x1, y1, 4, 30);
    const Wp = x1 - x0, Hp = y1 - y0;
    if (isVet || isElite) {
      cv.fillRect(x0 + 8, y1 - 34, x1 - 8, y1 - 18, [0.06, 0.06, 0.07], 1, 0);
      cv.fillRect(x0 + 8, y1 - 31, x1 - 8, y1 - 21, [0.95, 0.96, 0.97], 1, 0);
      if (isElite) {
        cv.fillRect(x0 + 8, y1 - 50, x1 - 8, y1 - 38, [0.06, 0.06, 0.07], 1, 0);
        cv.fillRect(x0 + 8, y1 - 48, x1 - 8, y1 - 40, [0.95, 0.96, 0.97], 1, 0);
      }
    }
    cv.drawGlyph('I', x0 + Wp * 0.24, y0 + Hp * 0.44, Hp * 0.50, [0.96, 0.97, 0.98]);
    cv.drawGlyph('V', x0 + Wp * 0.36, y0 + Hp * 0.44, Hp * 0.50, [0.96, 0.97, 0.98]);
    cv.blitPatch(R.rabbitCarrotH.img, R.rabbitCarrotH, x0 + Wp * 0.56, y0 + Hp * 0.14, x0 + Wp * 0.84, y0 + Hp * 0.72, { cutoutByInvAlpha: true, setTeamMask: 0 });
    if (isVet || isElite) stampDmg(1, x0 + 24, y0 + 18, x0 + 165, y1 - 18);
  }
  { const [x0, y0, x1, y1] = cv.regPx(UV.window); cv.blitPatch(R.rabbitWindow.img, R.rabbitWindow, x0, y0, x1, y1, { setTeamMask: 0, rotate: 90 }); }
  { const [x0, y0, x1, y1] = cv.regPx(UV.hazard); cv.blitPatch(R.hazardStrip.img, R.hazardStrip, x0, y0, x1, y1, { setTeamMask: 0 }); }

  // MINE METAL — противотанковые мины (тёмно-зелёный/серый корпус + красная нажимная крышка по центру!)
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.mineMetal);
    cv.blitPatch(R.mantletMetal.img, R.mantletMetal, x0, y0, x1, y1, { setTeamMask: 0, tint: [0.48, 0.55, 0.42], gain: 0.95 });
    const cx = (x0 + x1) * 0.5, cy = (y0 + y1) * 0.5;
    cv.fillCircle(cx, cy, 26, [0.08, 0.08, 0.08], 1, 0);
    cv.fillCircle(cx, cy, 18, [0.88, 0.14, 0.08], 1, 0);
  }

  { const [x0, y0, x1, y1] = cv.regPx(UV.wheels); cv.blitPatch(R.rabbitWheels.img, R.rabbitWheels, x0, y0, x1, y1, { setTeamMask: 0 }); }
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.turret);
    cv.panelFrame(x0, y0, x1, y1, 4, 28);
    if (isElite) cv.blitPatch(R.rabbitStar.img, R.rabbitStar, (x0 + x1) * 0.5 - 48, (y0 + y1) * 0.5 - 48, (x0 + x1) * 0.5 + 48, (y0 + y1) * 0.5 + 48, { cutoutByInvAlpha: true, setTeamMask: 0 });
    if (isVet || isElite) stampDmg(2, x0 + 28, y0 + 20, x0 + 160, y1 - 16);
  }
  { const [x0, y0, x1, y1] = cv.regPx(UV.ribbed); cv.blitPatch(R.rabbitRibbed.img, R.rabbitRibbed, x0, y0, x1, y1, { setTeamMask: 0 }); }
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.mgBarrel);
    const Hb = y1 - y0;
    cv.blitPatch(R.mantletMetal.img, R.mantletMetal, x0, y0, x1, y1, { setTeamMask: 0, rotate: 90, gain: 0.52 });
    if (isVet || isElite) {
      for (let s = 0; s < (isElite ? 4 : 2); s++) {
        const sy = y0 + Hb * (0.14 + s * 0.11);
        cv.fillRect(x0, sy, x1, sy + 6, [0.96, 0.97, 0.98], 1, 0);
      }
    }
  }
  { const [x0, y0, x1, y1] = cv.regPx(UV.metal);     cv.blitPatch(R.mantletMetal.img, R.mantletMetal, x0, y0, x1, y1, { setTeamMask: 0, gain: 0.62 }); }
  { const [x0, y0, x1, y1] = cv.regPx(UV.chrome);    cv.blitPatch(R.chromeMetal.img, R.chromeMetal, x0, y0, x1, y1, { setTeamMask: 0, rotate: 90, gain: 1.35 }); }
  { const [x0, y0, x1, y1] = cv.regPx(UV.lights);    cv.blitPatch(R.headlight.img, R.headlight, x0, y0, x1, y1, { setTeamMask: 0 }); }
  { const [x0, y0, x1, y1] = cv.regPx(UV.taillight); cv.blitPatch(R.taillight.img, R.taillight, x0, y0, x1, y1, { setTeamMask: 0, rotate: 90 }); }

  return cv.downsample2x();
}

function buildKrotoboyGeometry() {
  const parts = {};

  // 1) LANCTALP — компактное быстрое гусеничное шасси Кроликов (синеступичные катки!)
  {
    const m = new Mesh();
    const prof = [[-174, -44], [174, -44], [212, -10], [216, 28], [-212, 28], [-208, -10]];
    m.addPrismX(prof, 138, UV.wheels, UV.metal);
    parts.Lanctalp = m;
  }

  // 2) TEST — бронетрактор-сапёр + СПЕРЕДИ КАТКОВЫЙ МИННЫЙ ТРАЛ + СЗАДИ ЛОТОК С МИНАМИ!
  {
    const m = new Mesh();
    const prof = [[-206, -18, 126], [198, -18, 122], [232, 8, 114], [148, 52, 122], [-156, 54, 126], [-212, 24, 126]];
    m.addPrismX(prof, 124, UV.hullSkirt, UV.hullTop, {
      edgeRegs: [UV.metal, UV.hullFront, UV.hullFront, UV.hullTop, UV.ribbed, UV.ribbed],
    });
    // Боковые спонсоны Кроликов (над гусеницами)
    for (const sx of [-1, 1]) {
      const x0 = sx > 0 ? 120 : -174, x1 = sx > 0 ? 174 : -120;
      m.addFrustum([x0, x1, -124, 118], [x0, x1, -98, 92], 14, 56, { all: UV.hullSkirt, top: UV.hullTop });
      m.addBox(x0, x1, -206, 204, 14, 24, { top: UV.metal, bot: UV.metal, front: UV.hazard, back: UV.hazard, left: UV.hullSkirt, right: UV.hullSkirt });
      m.addLatheY(sx * 102, 46, [[156, 10], [174, 15], [186, 14]], 10, UV.chrome, { smooth: true, capStart: true, capEnd: true, capReg: UV.lights });
      m.addBox(sx * 96 - 14, sx * 96 + 14, -218, -204, 16, 32, { all: UV.metal, back: UV.taillight });
    }
    // Бронированная рубка сапёра с наклонным лобовым стеклом
    m.addFrustum([-92, 92, 14, 144], [-78, 78, 28, 116], 48, 102, { top: UV.hullTop, bot: UV.metal, front: UV.window, back: UV.ribbed, left: UV.hullSkirt, right: UV.hullSkirt });

    // ═══ ФИШКА #1: КАТКОВЫЙ ЗУБЧАТЫЙ МИННЫЙ ТРАЛ НА ГИДРОШТАНГАХ СПЕРЕДИ! ═══
    for (const sx of [-98, 98]) {
      m.addTube([[sx, 194, 12], [sx * 1.12, 266, -12], [sx * 1.12, 294, -22]], 9.5, 7, UV.chrome, { capStart: true, capEnd: true });
    }
    // Поперечная балка с предупреждающими полосами + вращающийся барабан-трал с зубцами!
    m.addBox(-148, 148, 258, 284, -6, 16, { all: UV.hazard });
    m.addLatheX(298, -24, [[-144, 26], [144, 26]], 10, UV.metal, { smooth: true, capStart: true, capEnd: true });
    // Диски-режущие катки трала
    for (const dx of [-120, -72, -24, 24, 72, 120]) {
      m.addLatheX(298, -24, [[dx - 7, 42], [dx + 7, 42]], 10, UV.chrome, { smooth: false, capStart: true, capEnd: true });
    }

    // ═══ ФИШКА #2: ЗАДНИЙ ЛОТОК МИНОУКЛАДЧИКА СО СТОПКОЙ ПРОТИВОТАНКОВЫХ МИН! ═══
    m.addFrustum([-66, 66, -252, -166], [-60, 60, -240, -158], 12, 46, { all: UV.hazard, top: UV.metal });
    // Стопка из 3 хорошо заметных круглых мин с красной кнопкой в лотке!
    for (let k = 0; k < 3; k++) {
      const z0 = 46 + k * 14;
      m.addLatheZ(0, -198, [[z0, 34, 34], [z0 + 12, 32, 32]], 10, UV.mineMetal, { smooth: false, capStart: true, capEnd: true });
    }

    parts.Test = m;
  }

  // 3) LOVEGTORONY — компактная круглая пулемётная башенка самообороны на крыше рубки
  {
    const m = new Mesh();
    m.addLatheZ(0, 0, [[-18, 56, 58], [6, 52, 54], [24, 36, 38], [30, 18, 18]], 10, UV.turret, { smooth: true, capStart: true, capEnd: true });
    m.addBox(-24, 24, 42, 64, -8, 14, { all: UV.metal });
    parts.Lovegtorony = m;
  }

  // 4) CSO — лёгкий пулемёт самообороны с барабанным магазином
  {
    const m = new Mesh();
    m.addLatheY(0, 0, [[-24, 11], [12, 10], [16, 7], [116, 6], [124, 8]], 8, UV.mgBarrel, { smooth: true, capStart: true, capEnd: true });
    m.addLatheX(6, -6, [[12, 14], [32, 14]], 8, UV.metal, { smooth: true, capStart: true, capEnd: true });
    parts.Cso = m;
  }

  // 5) ZASZLORUD — антенна-флагшток
  {
    const m = new Mesh();
    m.addLatheZ(0, 0, [[0, 5, 5], [18, 3.5, 3.5], [210, 1.6, 1.6]], 6, UV.metal, { smooth: true, capStart: true, capEnd: true });
    parts.Zaszlorud = m;
  }

  // 6) CHAIN R/L 001 — быстрые гусеницы Кроликов (ny_lanctalp.tga!)
  const trkR = new Mesh(); buildTrackLoop(trkR, 35, -228, 228, -50, 50, -190, 190, 2.3);
  const trkL = new Mesh(); buildTrackLoop(trkL, 35, -228, 228, -50, 50, -190, 190, 2.3);
  parts['Chain R 001'] = trkR;
  parts['Chain L 001'] = trkL;

  const ROOT_M = [-1, 0, 0,  0, 0, -1,  0, 1, 0,  0, 48, 0];
  const ID_M = (tx, ty, tz, sx = 1, sy = 1, sz = 1) => [sx, 0, 0,  0, sy, 0,  0, 0, sz,  tx, ty, tz];
  const TRK_M = tx => [-0.89, 0, 0,  0, 0, -0.89,  0, 0.89, 0,  tx, 46, 0];

  return {
    trackTex: 'ny_lanctalp.tga',
    nodes: [
      { name: 'Lanctalp',    parent: -1, m: ROOT_M, mesh: parts.Lanctalp },
      { name: 'Test',        parent:  0, m: ID_M(0, 0, 30), mesh: parts.Test },
      { name: 'Lovegtorony', parent:  1, m: ID_M(0, 68, 114), mesh: parts.Lovegtorony },
      { name: 'Cso',         parent:  2, m: ID_M(0, 62, 4), mesh: parts.Cso },
      { name: '_Torkolattuz',parent:  3, m: ID_M(0, 128, 0), helper: true },
      { name: 'Zaszlorud',   parent:  1, m: ID_M(62, -12, 98), mesh: parts.Zaszlorud },
      { name: '_glow0piros', parent:  1, m: ID_M(-96, -220, 24, 0.30, -1, 0.30), helper: true },
      { name: '_glow1piros', parent:  1, m: ID_M( 96, -220, 24, -0.30, -1, 0.30), helper: true },
      { name: '_glow2feher', parent:  1, m: ID_M(-102, 190, 46, 0.26, 1, 0.26), helper: true },
      { name: '_glow3feher', parent:  1, m: ID_M( 102, 190, 46, -0.26, 1, 0.26), helper: true },
      { name: 'Chain R 001', parent: -1, m: TRK_M(-140), mesh: parts['Chain R 001'], isTrack: true },
      { name: 'Chain L 001', parent: -1, m: TRK_M( 140), mesh: parts['Chain L 001'], isTrack: true },
    ],
  };
}

const summary = buildUnitPackage({
  modelName: 'ny_krotoboy',
  race: 'rabbit',
  anifFrom: 'ny_aknarako',
  outDir: OUT,
  buildGeometry: buildKrotoboyGeometry,
  buildAtlas: buildKrotoboyAtlas,
});
for (const s of summary) console.log(`ny_krotoboy_${s.level.padEnd(7)}  V=${String(s.verts).padStart(4)}  F=${String(s.faces).padStart(4)}  .4d=${s.size4d}B  .dxt=${s.sizeDxt}B`);

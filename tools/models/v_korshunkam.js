#!/usr/bin/env node
// Корпус Воронов #13 (Arcanum #4): «Пикировщик» (v_korshunkam) — Реактивная крылатая бомба-брандер (4×4, A-4).
'use strict';
const path = require('path');
const { Mesh, drawFlameHazardSign, buildUnitPackage } = require('../lib/swine-model-kit');
const {
  RAVEN_UV: UV, buildRavenAtlas,
  addWingPair, addTailFinPair, addTurbinePair, makeWheeledSpec,
} = require('../lib/raven-kit');

const OUT = path.resolve(process.argv[2] || 'mods-test/units/v_korshunkam');

function buildGeometry() {
  const hull = new Mesh();
  hull.addFrustum([-98, 98, -172, 162], [-84, 84, -162, 150], -16, 28, {
    all: UV.hullSide, top: UV.armorClean, front: UV.hazard, back: UV.darkMetal,
  });

  // Цилиндрический фюзеляж крылатой бомбы: чистая авиаброня (без размазанного номера по кругу!)
  hull.addLatheY(0, 62, [
    [-198, 36], [-184, 54], [-130, 58], [-60, 58], [20, 58], [98, 58], [122, 56],
  ], 16, UV.armorClean, { smooth: true, capStart: true, capEnd: false });
  // Огромный алый конус-боеголовка с равномерными кольцами (чтобы знак пламени не растягивался!)
  hull.addLatheY(0, 62, [
    [118, 57], [150, 54], [182, 46], [214, 34], [246, 18], [276, 4],
  ], 16, UV.crimson, { smooth: true, capStart: true, capEnd: true, capReg: UV.hazard });
  hull.addLatheY(0, 62, [[98, 60], [124, 60]], 16, UV.hazard, { smooth: true, capStart: true, capEnd: true });
  hull.addLatheZ(0, 48, [[114, 24, 24], [134, 22, 22], [142, 12, 12]], 10, UV.darkMetal, { smooth: true, capStart: true, capEnd: true, capReg: UV.lights });

  addWingPair(hull, { xIn: 52, xOut: 214, yRootB: -124, yRootF: 26, yTipB: -22, yTipF: 88, zRoot: 58, zTip: 48, tRoot: 14, tTip: 6 });
  addTailFinPair(hull, { xRoot: 54, xTip: 88, yRootB: -206, yRootF: -120, yTipB: -234, yTipF: -164, zBot: 82, zTop: 172, thick: 9 });
  addTurbinePair(hull, { xOff: 68, yBack: -238, yFront: -54, z: 54, rBody: 34, rNozzle: 28 });
  hull.addLatheY(0, 62, [[-228, 30], [-194, 38]], 12, UV.turbine, { smooth: true, capStart: true, capEnd: true, capReg: UV.turbine });

  for (const sx of [-1, 1]) {
    hull.addLatheY(sx * 72, 14, [[146, 9], [168, 13], [176, 12]], 8, UV.chrome, { smooth: true, capStart: true, capEnd: true, capReg: UV.lights });
    hull.addBox(sx * 78 - 12, sx * 78 + 12, -180, -166, 8, 24, { all: UV.darkMetal, back: UV.taillight });
  }

  return makeWheeledSpec({
    wheelX: 118, wheelYF: 114, wheelYB: -116, wheelR: 46, wheelW: 26, bodyY: 58,
    testMesh: hull, turretMesh: null,
    flagPos: [78, -148, 32], headlightY: 182, headlightX: 72, headlightZ: 14,
    taillightY: -242, taillightX: 68, taillightZ: 54,
  });
}

const summary = buildUnitPackage({
  modelName: 'v_korshunkam', race: 'raven', anifFrom: 'ny_dzsip', outDir: OUT,
  buildGeometry,
  buildAtlas: lvl => buildRavenAtlas(lvl, {
    code: 'A-4', dmgSeed: 3, afterburnerOrange: true, hullAspect: 6.5, wingAspect: 1.25, finAspect: 0.90,
    customPaint: (cv, UV) => {
      // Две симметричные ровные эмблемы пламени по бокам алого конуса (без перекоса!)
      const [x0, y0, x1, y1] = cv.regPx(UV.crimson);
      const W = x1 - x0, H = y1 - y0;
      drawFlameHazardSign(cv, x0 + W * 0.25, y0 + H * 0.45, H * 0.28);
      drawFlameHazardSign(cv, x0 + W * 0.75, y0 + H * 0.45, H * 0.28);
    },
  }),
});
for (const s of summary) console.log(`v_korshunkam_${s.level.padEnd(7)} V=${s.verts} F=${s.faces} .4d=${s.size4d}B`);

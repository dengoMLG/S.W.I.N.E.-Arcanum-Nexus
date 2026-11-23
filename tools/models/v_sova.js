#!/usr/bin/env node
// Корпус Воронов #12 (Arcanum #3): «Сова-ДРЛО» (v_sova) — Командная машина ДРЛО и наведения авиации (4×4, A-3).
'use strict';
const path = require('path');
const { Mesh, buildUnitPackage } = require('../lib/swine-model-kit');
const {
  RAVEN_UV: UV, buildRavenAtlas,
  addWingPair, addTailFinPair, addTurbinePair, addCanopy, makeWheeledSpec,
} = require('../lib/raven-kit');

const OUT = path.resolve(process.argv[2] || 'mods-test/units/v_sova');

function buildGeometry() {
  const hull = new Mesh();
  const prof = [
    [-204, -16, 112], [182, -16, 108], [234, 18, 86], [192, 82, 102],
    [104, 114, 104], [-178, 114, 108], [-212, 62, 110],
  ];
  hull.addPrismX(prof, 108, UV.hullSide, UV.armorClean, {
    edgeRegs: [UV.darkMetal, UV.metal, UV.hullTop, UV.canopy, UV.armorClean, UV.darkMetal, UV.darkMetal],
  });
  addCanopy(hull, { xBot: 82, xTop: 64, yB: 98, yF: 204, zBot: 94, zTop: 128, yTopB: 108, yTopF: 174 });
  addWingPair(hull, { xIn: 106, xOut: 168, yRootB: -162, yRootF: 44, yTipB: -186, yTipF: -34, zRoot: 52, zTip: 62, tRoot: 12, tTip: 6 });
  addTailFinPair(hull, { xRoot: 94, xTip: 118, yRootB: -206, yRootF: -124, yTipB: -228, yTipF: -164, zBot: 106, zTop: 186, thick: 9 });
  addTurbinePair(hull, { xOff: 52, yBack: -218, yFront: -154, z: 42, rBody: 22, rNozzle: 17 });
  for (const sx of [-1, 1]) {
    hull.addLatheY(sx * 168, 62, [[-174, 8], [-108, 14], [-34, 14], [-18, 6]], 8, UV.chrome, { smooth: true, capStart: true, capEnd: true });
    hull.addLatheY(sx * 76, 30, [[192, 10], [216, 15], [224, 14]], 8, UV.chrome, { smooth: true, capStart: true, capEnd: true, capReg: UV.lights });
    hull.addBox(sx * 86 - 12, sx * 86 + 12, -216, -200, 28, 46, { all: UV.darkMetal, back: UV.taillight });
  }

  // ГИГАНТСКАЯ ВРАЩАЮЩАЯСЯ ТАРЕЛКА AWACS (ДРЛО) с чёткой 1:1 полярной радарной текстурой!
  const tur = new Mesh();
  tur.addLatheZ(0, 0, [[0, 48, 48], [20, 42, 42]], 12, UV.darkMetal, { smooth: true, capStart: true, capEnd: true });
  for (const sx of [-1, 1]) {
    tur.addFrustum([sx * 44 - 10, sx * 44 + 10, -28, 28], [sx * 24 - 8, sx * 24 + 8, -22, 22], 14, 86, { all: UV.metal, front: UV.hazard });
  }
  tur.addLatheZ(0, 0, [
    [76,  66,  66],
    [88, 134, 134],
    [102, 138, 138],
    [116, 128, 128],
    [130, 74,  74],
    [136, 22,  22],
  ], 20, UV.radar, { smooth: true, capStart: true, capEnd: true, capReg: UV.radar });
  tur.addBox(-134, 134, -18, 18, 114, 136, { all: UV.crimson, top: UV.hazard });
  tur.addLatheZ(0, 0, [[132, 20, 20], [154, 16, 16], [164, 6, 6]], 10, UV.lights, { smooth: true, capStart: true, capEnd: true });

  return makeWheeledSpec({
    wheelX: 128, wheelYF: 128, wheelYB: -126, wheelR: 50, wheelW: 26, bodyY: 64,
    testMesh: hull, turretMesh: tur, turretPos: [0, -34, 114],
    flagPos: [84, -158, 114], headlightY: 228, headlightX: 76, headlightZ: 30,
    taillightY: -220, taillightX: 86, taillightZ: 38,
  });
}

const summary = buildUnitPackage({
  modelName: 'v_sova', race: 'raven', anifFrom: 'ny_dzsip', outDir: OUT,
  buildGeometry, buildAtlas: lvl => buildRavenAtlas(lvl, { code: 'A-3', dmgSeed: 2, hullAspect: 3.4, wingAspect: 0.55, finAspect: 0.90 }),
});
for (const s of summary) console.log(`v_sova_${s.level.padEnd(7)} V=${s.verts} F=${s.faces} .4d=${s.size4d}B`);

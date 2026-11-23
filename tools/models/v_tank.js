#!/usr/bin/env node
// Корпус Воронов #3: «Беркут» (v_tank) — Аэродинамический основной танк (гусеничный, V-03).
'use strict';
const path = require('path');
const { Mesh, buildUnitPackage } = require('../lib/swine-model-kit');
const {
  RAVEN_UV: UV, buildRavenAtlas,
  addWingPair, addTailFinPair, addTurbinePair, addCanopy, makeTrackedSpec,
} = require('../lib/raven-kit');

const OUT = path.resolve(process.argv[2] || 'mods-test/units/v_tank');

function buildGeometry() {
  const hull = new Mesh();
  const prof = [
    [-248, -14, 134], [192, -14, 126], [280, 20, 74], [216, 68, 118],
    [136, 86, 126], [-210, 86, 132], [-258, 44, 128],
  ];
  hull.addPrismX(prof, 130, UV.hullSide, UV.armorClean, {
    edgeRegs: [UV.darkMetal, UV.metal, UV.armorClean, UV.hullTop, UV.armorClean, UV.darkMetal, UV.darkMetal],
  });
  addWingPair(hull, { xIn: 128, xOut: 204, yRootB: -214, yRootF: 170, yTipB: -236, yTipF: 52, zRoot: 50, zTip: 32, tRoot: 14, tTip: 7 });
  addTailFinPair(hull, { xRoot: 112, xTip: 146, yRootB: -244, yRootF: -156, yTipB: -268, yTipF: -198, zBot: 72, zTop: 136, thick: 9 });
  addTurbinePair(hull, { xOff: 62, yBack: -262, yFront: -188, z: 42, rBody: 28, rNozzle: 22 });
  hull.addFrustum([-52, 52, 232, 286], [-30, 30, 224, 272], 14, 42, { all: UV.crimson, bot: false });
  for (const sx of [-1, 1]) {
    hull.addLatheY(sx * 104, 40, [[196, 11], [220, 15], [228, 14]], 8, UV.chrome, { smooth: true, capStart: true, capEnd: true, capReg: UV.lights });
    hull.addBox(sx * 114 - 14, sx * 114 + 14, -260, -244, 34, 52, { all: UV.darkMetal, back: UV.taillight });
  }

  const tur = new Mesh();
  const tProf = [
    [-132, 0, 96], [122, 0, 74], [156, 26, 46], [94, 70, 72],
    [-98, 74, 88], [-146, 42, 92],
  ];
  tur.addPrismX(tProf, 84, UV.armorClean, UV.armorClean, {
    edgeRegs: [UV.darkMetal, UV.metal, UV.armorClean, UV.armorClean, UV.darkMetal, UV.darkMetal],
  });
  addCanopy(tur, { xBot: 46, xTop: 32, yB: -64, yF: 44, zBot: 72, zTop: 102, yTopB: -46, yTopF: 18 });
  addWingPair(tur, { xIn: 80, xOut: 124, yRootB: -98, yRootF: 36, yTipB: -120, yTipF: -22, zRoot: 38, zTip: 48, tRoot: 10, tTip: 5, reg: UV.armorClean });
  tur.addLatheZ(-58, -86, [[72, 4, 4], [176, 1.5, 1.5]], 6, UV.metal, { smooth: true, capStart: true, capEnd: true });

  const cso = new Mesh();
  cso.addBox(-34, 34, -24, 32, -20, 22, { all: UV.metal });
  cso.addLatheY(0, 0, [
    [-10, 20], [58, 18], [64, 14], [110, 14], [116, 19], [148, 19], [154, 13], [244, 11],
  ], 10, UV.darkMetal, { smooth: true, capStart: true, capEnd: true });
  cso.addFrustum([-26, 26, 240, 276], [-22, 22, 244, 272], -14, 14, { all: UV.chrome, front: UV.darkMetal });
  cso.addBox(-10, 10, 244, 272, -18, 18, { all: UV.crimson });

  return makeTrackedSpec({
    trackX: 152, trackW: 36, yB: -244, yF: 244, zB: -48, zT: 44, scale: 0.90, hullZ: 26,
    testMesh: hull, turretMesh: tur, turretPos: [0, 12, 86],
    csoMesh: cso, csoPos: [0, 144, 32], muzzlePos: [0, 282, 0],
    headlightY: 234, headlightX: 104, headlightZ: 40, taillightY: -264, taillightX: 114, taillightZ: 42,
  });
}

const summary = buildUnitPackage({
  modelName: 'v_tank', race: 'raven', anifFrom: 'ny_lighttank', outDir: OUT,
  buildGeometry, buildAtlas: lvl => buildRavenAtlas(lvl, { code: 'V-03', dmgSeed: 2, hullAspect: 4.4, wingAspect: 0.45, finAspect: 1.05 }),
});
for (const s of summary) console.log(`v_tank_${s.level.padEnd(7)} V=${s.verts} F=${s.faces} .4d=${s.size4d}B`);

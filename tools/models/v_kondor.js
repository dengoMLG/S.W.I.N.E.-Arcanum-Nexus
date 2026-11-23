#!/usr/bin/env node
// Корпус Воронов #14 (Arcanum #5): «Кондор» (v_kondor) — Командная штурмовая арт-платформа / кассетный бомбовоз (гусеничный, A-5).
'use strict';
const path = require('path');
const { Mesh, buildUnitPackage } = require('../lib/swine-model-kit');
const {
  RAVEN_UV: UV, buildRavenAtlas,
  addWingPair, addTailFinPair, addTurbinePair, addCanopy, addMissile, makeTrackedSpec,
} = require('../lib/raven-kit');

const OUT = path.resolve(process.argv[2] || 'mods-test/units/v_kondor');

function buildGeometry() {
  const hull = new Mesh();
  const prof = [
    [-264, -16, 158], [214, -16, 152], [292, 24, 96], [224, 86, 140],
    [122, 102, 148], [-228, 102, 154], [-274, 52, 152],
  ];
  hull.addPrismX(prof, 150, UV.hullSide, UV.armorClean, {
    edgeRegs: [UV.darkMetal, UV.metal, UV.hullTop, UV.canopy, UV.armorClean, UV.darkMetal, UV.darkMetal],
  });
  addCanopy(hull, { xBot: 76, xTop: 56, yB: 126, yF: 232, zBot: 86, zTop: 120, yTopB: 138, yTopF: 196 });
  for (const sx of [-1, 1]) {
    hull.addFrustum([sx * 56 - 24, sx * 56 + 24, 242, 306], [sx * 46 - 14, sx * 46 + 14, 242, 292], 4, 42, { all: UV.crimson, front: UV.metal });
  }
  addWingPair(hull, { xIn: 148, xOut: 242, yRootB: -214, yRootF: 152, yTipB: -242, yTipF: 24, zRoot: 58, zTip: 42, tRoot: 18, tTip: 9 });
  for (const sx of [-1, 1]) {
    hull.addBox(sx * 204 - 22, sx * 204 + 22, -138, 18, 22, 54, { all: UV.darkMetal, top: UV.armorClean, front: UV.hazard });
    hull.addLatheY(sx * 204, 38, [[14, 10], [104, 8], [114, 12]], 8, UV.chrome, { smooth: true, capStart: true, capEnd: true });
    hull.addLatheY(sx * 116, 44, [[222, 12], [248, 16], [256, 15]], 8, UV.chrome, { smooth: true, capStart: true, capEnd: true, capReg: UV.lights });
    hull.addBox(sx * 128 - 16, sx * 128 + 16, -278, -262, 36, 56, { all: UV.darkMetal, back: UV.taillight });
  }
  addTailFinPair(hull, { xRoot: 132, xTip: 184, yRootB: -264, yRootF: -162, yTipB: -302, yTipF: -210, zBot: 86, zTop: 194, thick: 12 });
  addTurbinePair(hull, { xOff: 102, yBack: -282, yFront: -206, z: 46, rBody: 28, rNozzle: 22 });
  addTurbinePair(hull, { xOff: 42,  yBack: -282, yFront: -206, z: 46, rBody: 28, rNozzle: 22 });

  // Башня флагмана: чистая броня по бокам + одна эмблема на крыше башни!
  const tur = new Mesh();
  tur.addFrustum([-108, 108, -118, 96], [-86, 86, -98, 76], 0, 68, { all: UV.armorClean, top: UV.hullTop, front: UV.metal, back: UV.darkMetal });
  addWingPair(tur, { xIn: 88, xOut: 142, yRootB: -94, yRootF: 44, yTipB: -116, yTipF: -24, zRoot: 40, zTip: 52, tRoot: 12, tTip: 6, reg: UV.armorClean });
  tur.addLatheZ(0, -82, [[64, 10, 10], [108, 7, 7]], 8, UV.chrome, { smooth: true, capStart: true, capEnd: true });
  tur.addFrustum([-54, 54, -92, -74], [-46, 46, -88, -76], 102, 134, { all: UV.metal, front: UV.radar, back: UV.armorClean });

  const cso = new Mesh();
  cso.addBox(-74, 74, -26, 42, -22, 34, { all: UV.metal, top: UV.hazard });
  for (const sx of [-1, 1]) {
    cso.addLatheY(sx * 48, 0, [[-12, 20], [82, 18], [88, 14], [228, 12], [238, 20], [264, 19]], 10, UV.darkMetal, { smooth: true, capStart: true, capEnd: true });
    cso.addLatheY(sx * 48, 0, [[88, 16], [118, 16]], 10, UV.crimson, { smooth: true, capStart: true, capEnd: true });
  }
  const pitch = 0.34;
  for (let col = 0; col < 3; col++) {
    const rx = -34 + col * 34;
    for (let row = 0; row < 2; row++) {
      addMissile(cso, { x: rx, y: -38, z: 42 + row * 24, len: 146, r: 10, pitch, finSpan: 14 });
    }
  }

  return makeTrackedSpec({
    trackX: 168, trackW: 42, yB: -264, yF: 264, zB: -50, zT: 50, scale: 0.98, hullZ: 28,
    testMesh: hull, turretMesh: tur, turretPos: [0, -14, 100],
    csoMesh: cso, csoPos: [0, 86, 36], muzzlePos: [0, 268, 0],
    headlightY: 262, headlightX: 116, headlightZ: 44, taillightY: -284, taillightX: 128, taillightZ: 46,
  });
}

const summary = buildUnitPackage({
  modelName: 'v_kondor', race: 'raven', anifFrom: 'ny_lighttank', outDir: OUT,
  buildGeometry, buildAtlas: lvl => buildRavenAtlas(lvl, { code: 'A-5', dmgSeed: 0, hullAspect: 4.5, wingAspect: 0.60, finAspect: 0.85 }),
});
for (const s of summary) console.log(`v_kondor_${s.level.padEnd(7)} V=${s.verts} F=${s.faces} .4d=${s.size4d}B`);

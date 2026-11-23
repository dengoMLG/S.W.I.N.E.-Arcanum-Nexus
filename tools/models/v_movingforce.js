#!/usr/bin/env node
// Корпус Воронов #9: «Альбатрос» (v_movingforce) — Мобильный Сухопутный Авианосец (гусеничный, V-09).
'use strict';
const path = require('path');
const { Mesh, buildUnitPackage } = require('../lib/swine-model-kit');
const {
  RAVEN_UV: UV, buildRavenAtlas,
  addWingPair, addTailFinPair, addTurbinePair, addMissile, makeTrackedSpec,
} = require('../lib/raven-kit');

const OUT = path.resolve(process.argv[2] || 'mods-test/units/v_movingforce');

function buildGeometry() {
  const hull = new Mesh();
  const prof = [
    [-286, -16, 168], [238, -16, 162], [306, 26, 128], [264, 92, 152],
    [-254, 92, 164], [-294, 48, 164],
  ];
  hull.addPrismX(prof, 160, UV.hullSide, UV.armorClean, {
    edgeRegs: [UV.darkMetal, UV.metal, UV.hullTop, UV.armorClean, UV.darkMetal, UV.darkMetal],
  });
  // Плоская взлётная палуба (чистая броня + отдельная чёткая полоса ВПП по центру!)
  hull.addFrustum([-192, 192, -274, 248], [-186, 186, -268, 256], 88, 108, {
    all: UV.metal, top: UV.armorClean, front: UV.hazard, back: UV.hazard,
  });
  // Отдельная ровная полоса ВПП (UV.deckStripe, без растянутой эмблемы!)
  hull.addQuad([-64, -262, 109], [64, -262, 109], [64, 250, 109], [-64, 250, 109], UV.deckStripe, [0, 0], [0, 1], [1, 1], [1, 0]);
  hull.addFrustum([-124, 124, 244, 312], [-96, 96, 244, 304], 90, 124, { all: UV.armorClean, top: UV.hazard });
  addWingPair(hull, { xIn: 178, xOut: 236, yRootB: -234, yRootF: 176, yTipB: -258, yTipF: 64, zRoot: 74, zTip: 66, tRoot: 18, tTip: 9 });
  addTailFinPair(hull, { xRoot: 158, xTip: 188, yRootB: -272, yRootF: -176, yTipB: -298, yTipF: -214, zBot: 102, zTop: 184, thick: 12 });
  addTurbinePair(hull, { xOff: 112, yBack: -302, yFront: -222, z: 48, rBody: 32, rNozzle: 25 });
  addTurbinePair(hull, { xOff: 44,  yBack: -302, yFront: -222, z: 48, rBody: 32, rNozzle: 25 });

  // Смещённый командный «остров» авианосца по правому борту (-X) с чистым номером V-09!
  hull.addFrustum([-184, -104, -184, 58], [-174, -112, -162, 34], 106, 178, {
    all: UV.hullSide, top: UV.armorClean, front: UV.canopy, back: UV.darkMetal,
  });
  hull.addFrustum([-176, -110, -48, 36], [-168, -118, -36, 18], 174, 204, { all: UV.canopy, bot: false });
  for (const sx of [-38, 38]) {
    hull.addBox(sx - 8, sx + 8, -220, 260, 108, 120, { all: UV.chrome, top: UV.hazard });
  }
  for (const sx of [-1, 1]) {
    hull.addLatheY(sx * 124, 48, [[244, 12], [272, 16], [282, 15]], 8, UV.chrome, { smooth: true, capStart: true, capEnd: true, capReg: UV.lights });
    hull.addBox(sx * 144 - 16, sx * 144 + 16, -298, -280, 40, 60, { all: UV.darkMetal, back: UV.taillight });
  }

  const tur = new Mesh();
  tur.addLatheZ(0, 0, [[0, 74, 74], [24, 68, 68]], 12, UV.darkMetal, { smooth: true, capStart: true, capEnd: true });
  tur.addFrustum([-52, 52, -112, 92], [-42, 42, -98, 82], 20, 48, { all: UV.metal, top: UV.hazard });
  tur.addLatheZ(-42, -72, [[44, 8, 8], [108, 6, 6]], 6, UV.chrome, { smooth: true, capStart: true, capEnd: true });
  tur.addFrustum([-92, 8, -82, -62], [-86, 2, -78, -66], 102, 134, { all: UV.metal, front: UV.radar, back: UV.armorClean });

  const cso = new Mesh();
  const pitch = 0.28;
  addMissile(cso, { x: 0, y: -90, z: 36, len: 290, r: 28, pitch, finSpan: 52 });
  addWingPair(cso, { xIn: 20, xOut: 118, yRootB: -36, yRootF: 94, yTipB: -82, yTipF: -8, zRoot: 56, zTip: 42, tRoot: 13, tTip: 6 });
  for (const sx of [-1, 1]) {
    addMissile(cso, { x: sx * 76, y: -38, z: 32, len: 122, r: 10, pitch, finSpan: 15 });
  }

  return makeTrackedSpec({
    trackX: 184, trackW: 44, yB: -282, yF: 282, zB: -52, zT: 52, scale: 1.02, hullZ: 28,
    testMesh: hull, turretMesh: tur, turretPos: [28, -32, 108],
    csoMesh: cso, csoPos: [0, 16, 62], muzzlePos: [0, 210, 124],
    headlightY: 286, headlightX: 124, headlightZ: 48, taillightY: -306, taillightX: 144, taillightZ: 50,
  });
}

const summary = buildUnitPackage({
  modelName: 'v_movingforce', race: 'raven', anifFrom: 'ny_lighttank', outDir: OUT,
  buildGeometry, buildAtlas: lvl => buildRavenAtlas(lvl, { code: 'V-09', dmgSeed: 1, hullAspect: 4.5, wingAspect: 0.45, finAspect: 1.05 }),
});
for (const s of summary) console.log(`v_movingforce_${s.level.padEnd(7)} V=${s.verts} F=${s.faces} .4d=${s.size4d}B`);

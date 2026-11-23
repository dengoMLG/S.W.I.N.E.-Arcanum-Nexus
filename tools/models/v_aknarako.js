#!/usr/bin/env node
// Корпус Воронов #8: «Дятел» (v_aknarako) — Инженерный авиа-минёр с крылом-детектором и барабаном мин (гусеничный, V-08).
'use strict';
const path = require('path');
const { Mesh, buildUnitPackage } = require('../lib/swine-model-kit');
const {
  RAVEN_UV: UV, buildRavenAtlas,
  addWingPair, addTailFinPair, addCanopy, makeTrackedSpec,
} = require('../lib/raven-kit');

const OUT = path.resolve(process.argv[2] || 'mods-test/units/v_aknarako');

function buildGeometry() {
  const hull = new Mesh();
  const prof = [
    [-228, -14, 128], [180, -14, 122], [238, 16, 86], [190, 74, 112],
    [88, 92, 118], [-192, 92, 126], [-234, 48, 124],
  ];
  hull.addPrismX(prof, 124, UV.hullSide, UV.armorClean, {
    edgeRegs: [UV.darkMetal, UV.hazard, UV.hullTop, UV.canopy, UV.armorClean, UV.hazard, UV.darkMetal],
  });
  addCanopy(hull, { xBot: 78, xTop: 58, yB: 72, yF: 184, zBot: 82, zTop: 118, yTopB: 84, yTopF: 148 });
  addWingPair(hull, { xIn: 122, xOut: 174, yRootB: -180, yRootF: 90, yTipB: -200, yTipF: -10, zRoot: 42, zTip: 30, tRoot: 12, tTip: 6 });
  addTailFinPair(hull, { xRoot: 108, xTip: 128, yRootB: -224, yRootF: -154, yTipB: -240, yTipF: -182, zBot: 84, zTop: 140, thick: 8 });

  for (const sx of [-1, 1]) {
    hull.addTube([[sx * 82, 200, 12], [sx * 112, 294, -18]], 10, 7, UV.chrome, { capStart: true, capEnd: true });
    hull.addLatheZ(sx * 114, 304, [[-28, 34, 34], [-14, 34, 34], [-8, 22, 22]], 10, UV.hazard, { smooth: true, capStart: true, capEnd: true, capReg: UV.radar });
    hull.addLatheY(sx * 92, 36, [[188, 10], [212, 14], [220, 13]], 8, UV.chrome, { smooth: true, capStart: true, capEnd: true, capReg: UV.lights });
    hull.addBox(sx * 102 - 14, sx * 102 + 14, -238, -222, 34, 52, { all: UV.darkMetal, back: UV.taillight });
  }
  hull.addBox(-132, 132, 286, 316, -20, -6, { all: UV.hazard, top: UV.armorClean });
  hull.addFrustum([-52, 52, -278, -220], [-44, 44, -254, -218], -14, 48, { all: UV.hazard, top: UV.darkMetal });

  // Барабан мин с чёткими процедурными 1024px полосами безопасности (без пикселизации!)
  const tur = new Mesh();
  tur.addLatheZ(0, 0, [[0, 92, 92], [18, 92, 92]], 12, UV.darkMetal, { smooth: true, capStart: true, capEnd: true });
  tur.addLatheZ(0, 0, [[16, 86, 86], [56, 84, 84], [64, 62, 62]], 12, UV.hazard, { smooth: true, capStart: true, capEnd: true, capReg: UV.armorClean });
  for (let k = 0; k < 6; k++) {
    const a = k * Math.PI / 3;
    const mx = Math.cos(a) * 58, my = Math.sin(a) * 58;
    tur.addLatheZ(mx, my, [[56, 20, 20], [72, 18, 18], [78, 10, 10]], 8, UV.crimson, { smooth: true, capStart: true, capEnd: true });
  }
  tur.addLatheZ(0, 0, [[62, 16, 16], [88, 14, 14], [96, 6, 6]], 8, UV.lights, { smooth: true, capStart: true, capEnd: true });

  return makeTrackedSpec({
    trackX: 146, trackW: 36, yB: -228, yF: 228, zB: -46, zT: 44, scale: 0.90, hullZ: 24,
    testMesh: hull, turretMesh: tur, turretPos: [0, -66, 92],
    headlightY: 226, headlightX: 92, headlightZ: 36, taillightY: -242, taillightX: 102, taillightZ: 42,
  });
}

const summary = buildUnitPackage({
  modelName: 'v_aknarako', race: 'raven', anifFrom: 'ny_aknarako', outDir: OUT,
  buildGeometry, buildAtlas: lvl => buildRavenAtlas(lvl, { code: 'V-08', dmgSeed: 3, hullAspect: 4.3, wingAspect: 0.45, finAspect: 1.1 }),
});
for (const s of summary) console.log(`v_aknarako_${s.level.padEnd(7)} V=${s.verts} F=${s.faces} .4d=${s.size4d}B`);

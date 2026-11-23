#!/usr/bin/env node
// Корпус Воронов #6: «Коршун» (v_raketas) — Гусеничная авиа-РСЗО с 12 ракетами (гусеничный, V-06).
'use strict';
const path = require('path');
const { Mesh, buildUnitPackage } = require('../lib/swine-model-kit');
const {
  RAVEN_UV: UV, buildRavenAtlas,
  addWingPair, addTailFinPair, addTurbinePair, addCanopy, addMissile, makeTrackedSpec,
} = require('../lib/raven-kit');

const OUT = path.resolve(process.argv[2] || 'mods-test/units/v_raketas');

function buildGeometry() {
  const hull = new Mesh();
  const prof = [
    [-236, -12, 130], [186, -12, 124], [254, 18, 86], [202, 76, 114],
    [76, 98, 120], [42, 62, 128], [-224, 62, 132], [-244, 34, 130],
  ];
  hull.addPrismX(prof, 126, UV.hullSide, UV.armorClean, {
    edgeRegs: [UV.darkMetal, UV.metal, UV.hullTop, UV.canopy, UV.armorClean, UV.darkMetal, UV.armorClean, UV.darkMetal],
  });
  addCanopy(hull, { xBot: 86, xTop: 64, yB: 82, yF: 194, zBot: 78, zTop: 112, yTopB: 92, yTopF: 162 });
  addWingPair(hull, { xIn: 126, xOut: 186, yRootB: -214, yRootF: 120, yTipB: -232, yTipF: 12, zRoot: 38, zTip: 24, tRoot: 13, tTip: 7 });
  addTailFinPair(hull, { xRoot: 110, xTip: 138, yRootB: -236, yRootF: -162, yTipB: -256, yTipF: -196, zBot: 58, zTop: 124, thick: 8 });
  hull.addBox(-96, 96, 40, 56, 60, 110, { all: UV.hazard, front: UV.metal });
  addTurbinePair(hull, { xOff: 62, yBack: -246, yFront: -182, z: 32, rBody: 24, rNozzle: 19 });
  for (const sx of [-1, 1]) {
    hull.addLatheY(sx * 96, 36, [[194, 10], [218, 14], [226, 13]], 8, UV.chrome, { smooth: true, capStart: true, capEnd: true, capReg: UV.lights });
    hull.addBox(sx * 108 - 14, sx * 108 + 14, -248, -234, 24, 42, { all: UV.darkMetal, back: UV.taillight });
  }

  const tur = new Mesh();
  tur.addLatheZ(0, 0, [[0, 78, 78], [28, 72, 72]], 12, UV.darkMetal, { smooth: true, capStart: true, capEnd: true });
  for (const sx of [-1, 1]) {
    tur.addFrustum([sx * 78 - 14, sx * 78 + 14, -56, 48], [sx * 74 - 12, sx * 74 + 12, -38, 34], 24, 92, { all: UV.armorClean });
  }

  const cso = new Mesh();
  const pitch = 0.44, cp = Math.cos(pitch), sp = Math.sin(pitch);
  const pt = (x, y, z) => [x, y * cp - z * sp, y * sp + z * cp];
  const bx0 = -76, bx1 = 76, by0 = -78, by1 = 64, bz0 = -40, bz1 = 44;
  const B0 = pt(bx0, by0, bz0), B1 = pt(bx1, by0, bz0), B2 = pt(bx1, by1, bz0), B3 = pt(bx0, by1, bz0);
  const T0 = pt(bx0, by0, bz1), T1 = pt(bx1, by0, bz1), T2 = pt(bx1, by1, bz1), T3 = pt(bx0, by1, bz1);
  // Чистая броня на боках кассеты + эмблема сверху!
  cso.addQuad(T0, T1, T2, T3, UV.hullTop);
  cso.addQuad(B3, B2, B1, B0, UV.darkMetal);
  cso.addQuad(B0, B1, T1, T0, UV.darkMetal);
  cso.addQuad(B2, B3, T3, T2, UV.hazard);
  cso.addQuad(B3, B0, T0, T3, UV.armorClean);
  cso.addQuad(B1, B2, T2, T1, UV.armorClean);
  for (let col = 0; col < 4; col++) {
    const rx = -52 + col * 34.6;
    for (let row = 0; row < 3; row++) {
      const rz = -22 + row * 24;
      const p0 = pt(rx, -20, rz);
      addMissile(cso, { x: p0[0], y: p0[1], z: p0[2], len: 148, r: 10, pitch, finSpan: 13 });
    }
  }

  return makeTrackedSpec({
    trackX: 148, trackW: 36, yB: -236, yF: 236, zB: -46, zT: 44, scale: 0.90, hullZ: 24,
    testMesh: hull, turretMesh: tur, turretPos: [0, -86, 62],
    csoMesh: cso, csoPos: [0, 0, 74], muzzlePos: [0, 128, 62],
    headlightY: 232, headlightX: 96, headlightZ: 36, taillightY: -250, taillightX: 108, taillightZ: 34,
  });
}

const summary = buildUnitPackage({
  modelName: 'v_raketas', race: 'raven', anifFrom: 'ny_raketas', outDir: OUT,
  buildGeometry, buildAtlas: lvl => buildRavenAtlas(lvl, { code: 'V-06', dmgSeed: 1, hullAspect: 4.5, wingAspect: 0.45, finAspect: 0.95 }),
});
for (const s of summary) console.log(`v_raketas_${s.level.padEnd(7)} V=${s.verts} F=${s.faces} .4d=${s.size4d}B`);

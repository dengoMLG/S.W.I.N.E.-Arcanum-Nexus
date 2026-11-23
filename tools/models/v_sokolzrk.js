#!/usr/bin/env node
// Корпус Воронов #10 (Arcanum #1): «Сапсан-ЗРК» (v_sokolzrk) — Гусеничный комплекс ПВО/ПРО (гусеничный, A-1).
'use strict';
const path = require('path');
const { Mesh, buildUnitPackage } = require('../lib/swine-model-kit');
const {
  RAVEN_UV: UV, buildRavenAtlas,
  addWingPair, addTailFinPair, addTurbinePair, addCanopy, addMissile, makeTrackedSpec,
} = require('../lib/raven-kit');

const OUT = path.resolve(process.argv[2] || 'mods-test/units/v_sokolzrk');

function buildGeometry() {
  const hull = new Mesh();
  const prof = [
    [-246, -14, 134], [190, -14, 128], [264, 18, 84], [206, 74, 118],
    [96, 94, 126], [-216, 94, 132], [-254, 48, 130],
  ];
  hull.addPrismX(prof, 130, UV.hullSide, UV.armorClean, {
    edgeRegs: [UV.darkMetal, UV.metal, UV.hullTop, UV.canopy, UV.armorClean, UV.darkMetal, UV.darkMetal],
  });
  addCanopy(hull, { xBot: 82, xTop: 62, yB: 98, yF: 204, zBot: 84, zTop: 118, yTopB: 108, yTopF: 170 });
  addWingPair(hull, { xIn: 128, xOut: 192, yRootB: -214, yRootF: 128, yTipB: -236, yTipF: 16, zRoot: 46, zTip: 30, tRoot: 14, tTip: 7 });
  addTailFinPair(hull, { xRoot: 114, xTip: 142, yRootB: -242, yRootF: -168, yTipB: -264, yTipF: -206, zBot: 84, zTop: 152, thick: 9 });
  addTurbinePair(hull, { xOff: 64, yBack: -258, yFront: -190, z: 42, rBody: 26, rNozzle: 20 });
  for (const sx of [-1, 1]) {
    hull.addLatheY(sx * 98, 38, [[204, 11], [228, 15], [236, 14]], 8, UV.chrome, { smooth: true, capStart: true, capEnd: true, capReg: UV.lights });
    hull.addBox(sx * 110 - 14, sx * 110 + 14, -260, -244, 34, 52, { all: UV.darkMetal, back: UV.taillight });
  }

  // Башня ЗРК: чистая броня на боках (без дубля эмблем) + крупная обзорная РЛС!
  const tur = new Mesh();
  tur.addFrustum([-92, 92, -108, 72], [-76, 76, -94, 56], 0, 52, { all: UV.armorClean, top: UV.hullTop, front: UV.metal, back: UV.darkMetal });
  tur.addLatheZ(0, -82, [[48, 14, 14], [124, 10, 10]], 8, UV.chrome, { smooth: true, capStart: true, capEnd: true });
  tur.addFrustum([-108, 108, -94, -70], [-96, 96, -88, -72], 118, 166, { all: UV.metal, front: UV.radar, back: UV.armorClean });
  tur.addLatheY(0, 34, [[46, 26], [70, 22], [84, 10]], 10, UV.crimson, { smooth: true, capStart: true, capEnd: true });

  const cso = new Mesh();
  const pitch = 0.58, cp = Math.cos(pitch), sp = Math.sin(pitch);
  const pt = (x, y, z) => [x, y * cp - z * sp, y * sp + z * cp];
  cso.addBox(-114, 114, -18, 18, -14, 14, { all: UV.darkMetal, top: UV.hazard });
  for (const sx of [-1, 1]) {
    const rx = sx * 92;
    cso.addTube([pt(rx, -92, 0), pt(rx, 86, 0)], 10, 6, UV.metal, { capStart: true, capEnd: true });
    for (const dx of [-22, 22]) {
      const m0 = pt(rx + dx, -102, 16);
      addMissile(cso, { x: m0[0], y: m0[1], z: m0[2], len: 238, r: 17, pitch, finSpan: 34 });
    }
  }

  return makeTrackedSpec({
    trackX: 154, trackW: 36, yB: -244, yF: 244, zB: -48, zT: 46, scale: 0.92, hullZ: 24,
    testMesh: hull, turretMesh: tur, turretPos: [0, -56, 94],
    csoMesh: cso, csoPos: [0, 8, 52], muzzlePos: [0, 120, 118],
    headlightY: 242, headlightX: 98, headlightZ: 38, taillightY: -262, taillightX: 110, taillightZ: 42,
  });
}

const summary = buildUnitPackage({
  modelName: 'v_sokolzrk', race: 'raven', anifFrom: 'ny_raketas', outDir: OUT,
  buildGeometry, buildAtlas: lvl => buildRavenAtlas(lvl, { code: 'A-1', dmgSeed: 0, hullAspect: 4.6, wingAspect: 0.45, finAspect: 0.95 }),
});
for (const s of summary) console.log(`v_sokolzrk_${s.level.padEnd(7)} V=${s.verts} F=${s.faces} .4d=${s.size4d}B`);

#!/usr/bin/env node
// Корпус Воронов #2: «Ястреб-ЗУ» (v_pancelkocsi) — Бронеавтомобиль ПВО со спаренной автопушкой (4×4, V-02).
'use strict';
const path = require('path');
const { Mesh, buildUnitPackage } = require('../lib/swine-model-kit');
const {
  RAVEN_UV: UV, buildRavenAtlas,
  addWingPair, addTailFinPair, addTurbinePair, addCanopy, makeWheeledSpec,
} = require('../lib/raven-kit');

const OUT = path.resolve(process.argv[2] || 'mods-test/units/v_pancelkocsi');

function buildGeometry() {
  const hull = new Mesh();
  const prof = [
    [-196, -16, 108], [166, -16, 102], [234, 14, 58], [176, 62, 92],
    [98, 86, 102], [-164, 86, 106], [-204, 48, 104],
  ];
  hull.addPrismX(prof, 104, UV.hullSide, UV.armorClean, {
    edgeRegs: [UV.darkMetal, UV.metal, UV.armorClean, UV.canopy, UV.armorClean, UV.darkMetal, UV.darkMetal],
  });
  addCanopy(hull, { xBot: 68, xTop: 52, yB: 78, yF: 162, zBot: 64, zTop: 94, yTopB: 86, yTopF: 132 });
  addWingPair(hull, { xIn: 102, xOut: 164, yRootB: -136, yRootF: 72, yTipB: -162, yTipF: -10, zRoot: 44, zTip: 34, tRoot: 12, tTip: 6 });
  addTailFinPair(hull, { xRoot: 84, xTip: 106, yRootB: -196, yRootF: -120, yTipB: -214, yTipF: -158, zBot: 74, zTop: 138, thick: 8 });
  addTurbinePair(hull, { xOff: 52, yBack: -206, yFront: -140, z: 36, rBody: 22, rNozzle: 18 });
  for (const sx of [-1, 1]) {
    hull.addLatheY(sx * 72, 26, [[184, 10], [208, 14], [216, 13]], 8, UV.chrome, { smooth: true, capStart: true, capEnd: true, capReg: UV.lights });
    hull.addBox(sx * 82 - 12, sx * 82 + 12, -208, -192, 28, 44, { all: UV.darkMetal, back: UV.taillight });
  }

  const tur = new Mesh();
  tur.addFrustum([-78, 78, -88, 68], [-58, 58, -72, 54], 0, 56, { all: UV.armorClean, top: UV.hullTop, front: UV.metal, back: UV.darkMetal });
  for (const sx of [-1, 1]) {
    tur.addLatheY(sx * 82, 26, [[-44, 24], [32, 24]], 10, UV.darkMetal, { smooth: true, capStart: true, capEnd: true, capReg: UV.crimson });
  }
  tur.addLatheZ(0, -68, [[52, 8, 8], [86, 6, 6]], 6, UV.chrome, { smooth: true, capStart: true, capEnd: true });
  tur.addFrustum([-44, 44, -76, -60], [-36, 36, -72, -62], 82, 118, { all: UV.metal, front: UV.radar, back: UV.armorClean });

  const cso = new Mesh();
  cso.addBox(-46, 46, -24, 34, -18, 22, { all: UV.metal });
  const pitch = 0.24, cp = Math.cos(pitch), sp = Math.sin(pitch);
  const pt = (x, y, z) => [x, y * cp - z * sp, y * sp + z * cp];
  for (const sx of [-1, 1]) {
    const bx = sx * 22;
    const rings = [[-10, 12], [62, 11], [68, 8], [168, 7], [176, 11], [192, 10]].map(([ly, r]) => {
      const ring = [];
      for (let i = 0; i < 8; i++) { const a = 2 * Math.PI * i / 8; ring.push(pt(bx + Math.cos(a) * r, ly, Math.sin(a) * r)); }
      return ring;
    });
    cso.addLoft(rings, UV.darkMetal, { smooth: true, capStart: true, capEnd: true });
  }

  return makeWheeledSpec({
    wheelX: 126, wheelYF: 126, wheelYB: -124, wheelR: 50, wheelW: 26, bodyY: 64,
    testMesh: hull, turretMesh: tur, turretPos: [0, -14, 86],
    csoMesh: cso, csoPos: [0, 62, 28], muzzlePos: [0, 196, 46],
    flagPos: [84, -158, 86], headlightY: 220, headlightX: 72, headlightZ: 26,
    taillightY: -210, taillightX: 82, taillightZ: 36,
  });
}

const summary = buildUnitPackage({
  modelName: 'v_pancelkocsi', race: 'raven', anifFrom: 'ny_lighttank', outDir: OUT,
  buildGeometry, buildAtlas: lvl => buildRavenAtlas(lvl, { code: 'V-02', dmgSeed: 1, hullAspect: 4.2, wingAspect: 0.55, finAspect: 0.95 }),
});
for (const s of summary) console.log(`v_pancelkocsi_${s.level.padEnd(7)} V=${s.verts} F=${s.faces} .4d=${s.size4d}B`);

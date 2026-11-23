#!/usr/bin/env node
// Корпус Воронов #7: «Филин» (v_mozsar) — Тяжёлая бронированная авиабомбомёт-мортира (гусеничный, V-07).
'use strict';
const path = require('path');
const { Mesh, buildUnitPackage } = require('../lib/swine-model-kit');
const {
  RAVEN_UV: UV, buildRavenAtlas,
  addWingPair, addTailFinPair, addTurbinePair, makeTrackedSpec,
} = require('../lib/raven-kit');

const OUT = path.resolve(process.argv[2] || 'mods-test/units/v_mozsar');

function buildGeometry() {
  const hull = new Mesh();
  const prof = [
    [-232, -16, 152], [198, -16, 146], [248, 22, 118], [194, 96, 134],
    [104, 116, 142], [-186, 114, 148], [-244, 62, 146],
  ];
  // Чистая броня на скосах + одна круглая эмблема на верхнем капоте (edge 3)
  hull.addPrismX(prof, 146, UV.hullSide, UV.armorClean, {
    edgeRegs: [UV.darkMetal, UV.metal, UV.armorClean, UV.hullTop, UV.armorClean, UV.darkMetal, UV.darkMetal],
  });
  for (const sx of [-1, 1]) {
    hull.addLatheY(sx * 76, 60, [[192, 34], [218, 36], [228, 30]], 12, UV.darkMetal, { smooth: true, capStart: true, capEnd: true, capReg: UV.lights });
    // Броневеки над «совиными глазами» — чистая авиаброня (без мелких дублей кокард!)
    hull.addFrustum([sx * 76 - 38, sx * 76 + 38, 194, 232], [sx * 76 - 28, sx * 76 + 28, 188, 220], 82, 100, { all: UV.armorClean });
    hull.addBox(sx * 114 - 16, sx * 114 + 16, -248, -232, 36, 56, { all: UV.darkMetal, back: UV.taillight });
  }
  hull.addFrustum([-36, 36, 212, 266], [-18, 18, 212, 248], 12, 58, { all: UV.crimson, front: UV.hazard });
  addWingPair(hull, { xIn: 146, xOut: 204, yRootB: -210, yRootF: 150, yTipB: -224, yTipF: 44, zRoot: 52, zTip: 30, tRoot: 18, tTip: 9 });
  addTailFinPair(hull, { xRoot: 122, xTip: 148, yRootB: -232, yRootF: -148, yTipB: -254, yTipF: -186, zBot: 94, zTop: 158, thick: 10 });
  addTurbinePair(hull, { xOff: 66, yBack: -250, yFront: -180, z: 46, rBody: 28, rNozzle: 22 });

  // Воротниковая турель: чистая клёпаная броня (без растянутой эмблемы по цилиндру!)
  const tur = new Mesh();
  tur.addLatheZ(0, 0, [[0, 108, 108], [32, 104, 104], [52, 86, 86]], 12, UV.armorClean, { smooth: true, capStart: true, capEnd: true });
  for (const sx of [-1, 1]) {
    tur.addFrustum([sx * 74 - 22, sx * 74 + 22, -74, 62], [sx * 68 - 18, sx * 68 + 18, -58, 48], 38, 96, { all: UV.armorClean, front: UV.hazard });
  }

  const cso = new Mesh();
  const pitch = 0.68, cp = Math.cos(pitch), sp = Math.sin(pitch);
  const pt = (x, y, z) => [x, y * cp - z * sp, y * sp + z * cp];
  const profM = [[-64, 52], [12, 56], [24, 48], [136, 46], [148, 56], [174, 54], [174, 34], [124, 32]];
  const rings = profM.map(([ly, r]) => {
    const ring = [];
    for (let i = 0; i < 12; i++) { const a = 2 * Math.PI * i / 12; ring.push(pt(Math.cos(a) * r, ly, Math.sin(a) * r)); }
    return ring;
  });
  cso.addLoft(rings, UV.darkMetal, { smooth: true, capStart: true, capEnd: true });
  const rRing = [[134, 49], [148, 59], [170, 58], [170, 50]].map(([ly, r]) => {
    const ring = [];
    for (let i = 0; i < 12; i++) { const a = 2 * Math.PI * i / 12; ring.push(pt(Math.cos(a) * r, ly, Math.sin(a) * r)); }
    return ring;
  });
  cso.addLoft(rRing, UV.crimson, { smooth: true, capStart: false, capEnd: false });
  for (const sx of [-1, 1]) {
    const rc = [[-40, 14], [96, 13]].map(([ly, r]) => {
      const ring = [];
      for (let i = 0; i < 8; i++) { const a = 2 * Math.PI * i / 8; ring.push(pt(sx * 54 + Math.cos(a) * r, ly, -10 + Math.sin(a) * r)); }
      return ring;
    });
    cso.addLoft(rc, UV.chrome, { smooth: true, capStart: true, capEnd: true });
  }

  return makeTrackedSpec({
    trackX: 162, trackW: 40, yB: -236, yF: 236, zB: -48, zT: 48, scale: 0.92, hullZ: 26,
    testMesh: hull, turretMesh: tur, turretPos: [0, -18, 112],
    csoMesh: cso, csoPos: [0, 14, 56], muzzlePos: [0, 142, 118],
    headlightY: 234, headlightX: 76, headlightZ: 60, taillightY: -252, taillightX: 114, taillightZ: 46,
  });
}

const summary = buildUnitPackage({
  modelName: 'v_mozsar', race: 'raven', anifFrom: 'ny_mozsar', outDir: OUT,
  buildGeometry, buildAtlas: lvl => buildRavenAtlas(lvl, { code: 'V-07', dmgSeed: 2, hullAspect: 3.7, wingAspect: 0.45, finAspect: 1.0 }),
});
for (const s of summary) console.log(`v_mozsar_${s.level.padEnd(7)} V=${s.verts} F=${s.faces} .4d=${s.size4d}B`);

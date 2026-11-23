#!/usr/bin/env node
// Корпус Воронов #11 (Arcanum #2): «Буревестник» (v_ekranoplan) — Ударный экраноплан-штурмовик (скоростной MT=2, A-2).
'use strict';
const path = require('path');
const { Mesh, buildUnitPackage } = require('../lib/swine-model-kit');
const {
  RAVEN_UV: UV, buildRavenAtlas,
  addWingPair, addTurbinePair, addCanopy, addMissile, makeWheeledSpec,
} = require('../lib/raven-kit');

const OUT = path.resolve(process.argv[2] || 'mods-test/units/v_ekranoplan');

function buildGeometry() {
  const hull = new Mesh();
  const prof = [
    [-228, -6, 62], [176, -6, 68], [268, 12, 22], [186, 56, 56],
    [82, 74, 68], [-196, 68, 56], [-238, 38, 48],
  ];
  hull.addPrismX(prof, 64, UV.hullSide, UV.armorClean, {
    edgeRegs: [UV.darkMetal, UV.metal, UV.crimson, UV.armorClean, UV.hullTop, UV.darkMetal, UV.darkMetal],
  });
  hull.addFrustum([-104, 104, -172, 168], [-82, 82, -162, 162], -26, 2, { all: UV.darkMetal, front: UV.hazard, back: UV.darkMetal });
  addCanopy(hull, { xBot: 54, xTop: 34, yB: 12, yF: 172, zBot: 62, zTop: 112, yTopB: 32, yTopF: 122 });

  // Широкие крылья экраноплана (wingAspect ~1.25 — идеально ровная кокарда!)
  addWingPair(hull, { xIn: 62, xOut: 248, yRootB: -98, yRootF: 88, yTipB: -136, yTipF: 16, zRoot: 28, zTip: 14, tRoot: 16, tTip: 8 });
  for (const sx of [-1, 1]) {
    // Вертикальные концевые шайбы (используют вертикальный tailFin — без сплющивания!)
    hull.addFrustum([sx * 246 - 7, sx * 246 + 7, -142, 24], [sx * 252 - 5, sx * 252 + 5, -146, 12], -10, 68, {
      all: UV.armorClean, left: UV.tailFin, right: UV.tailFin, top: UV.crimson,
    });
    hull.addBox(sx * 158 - 22, sx * 158 + 22, -64, 24, -12, 16, { all: UV.darkMetal, front: UV.hazard });
    addMissile(hull, { x: sx * 146, y: -66, z: 0, len: 132, r: 9, pitch: 0, finSpan: 14 });
    addMissile(hull, { x: sx * 170, y: -66, z: 0, len: 132, r: 9, pitch: 0, finSpan: 14 });
    hull.addLatheY(sx * 112, 22, [[54, 8], [76, 12], [84, 11]], 8, UV.chrome, { smooth: true, capStart: true, capEnd: true, capReg: UV.lights });
  }

  for (const sx of [-1, 1]) {
    hull.addBox(sx * 54 - 10, sx * 54 + 10, -144, -60, 56, 98, { all: UV.metal });
  }
  addTurbinePair(hull, { xOff: 66, yBack: -192, yFront: -38, z: 96, rBody: 32, rNozzle: 26 });

  // Т-образный хвост: вертикальный киль на UV.tailFin, горизонтальный стабилизатор на UV.armorClean + UV.crimson!
  hull.addFrustum([-10, 10, -238, -138], [-6, 6, -264, -196], 54, 184, {
    all: UV.armorClean, left: UV.tailFin, right: UV.tailFin, front: UV.metal, top: UV.crimson,
  });
  hull.addFrustum([-118, 118, -268, -206], [-106, 106, -264, -214], 172, 184, {
    all: UV.armorClean, front: UV.metal, back: UV.crimson,
  });

  const tur = new Mesh();
  tur.addLatheZ(0, 0, [[0, 32, 32], [20, 28, 28]], 10, UV.darkMetal, { smooth: true, capStart: true, capEnd: true });
  tur.addBox(-24, 24, -22, 26, 14, 34, { all: UV.metal, top: UV.crimson });

  const cso = new Mesh();
  cso.addLatheY(0, 0, [[-18, 18], [26, 17]], 10, UV.metal, { smooth: true, capStart: true, capEnd: true });
  for (let k = 0; k < 3; k++) {
    const a = k * 2 * Math.PI / 3 + Math.PI / 6;
    cso.addLatheY(Math.cos(a) * 10, Math.sin(a) * 10, [[16, 4.5], [142, 4.2]], 6, UV.darkMetal, { smooth: true, capStart: true, capEnd: true });
  }
  for (const cy of [64, 118]) cso.addLatheY(0, 0, [[cy - 5, 16], [cy + 5, 16]], 10, UV.chrome, { smooth: true, capStart: true, capEnd: true });

  return makeWheeledSpec({
    wheelX: 88, wheelYF: 110, wheelYB: -110, wheelR: 34, wheelW: 20, bodyY: 54,
    testMesh: hull, turretMesh: tur, turretPos: [0, 154, -22],
    csoMesh: cso, csoPos: [0, 22, 14], muzzlePos: [0, 148, 0],
    flagPos: [56, -152, 68], headlightY: 92, headlightX: 112, headlightZ: 22,
    taillightY: -206, taillightX: 66, taillightZ: 96,
  });
}

const summary = buildUnitPackage({
  modelName: 'v_ekranoplan', race: 'raven', anifFrom: 'ny_dzsip', outDir: OUT,
  buildGeometry, buildAtlas: lvl => buildRavenAtlas(lvl, { code: 'A-2', dmgSeed: 1, hullAspect: 6.0, wingAspect: 1.25, finAspect: 1.35 }),
});
for (const s of summary) console.log(`v_ekranoplan_${s.level.padEnd(7)} V=${s.verts} F=${s.faces} .4d=${s.size4d}B`);

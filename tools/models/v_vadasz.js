#!/usr/bin/env node
// Корпус Воронов #5: «Сокол-ПТ» (v_vadasz) — Сверхбыстрый перехватчик с крыльевыми ПТУР (4×4, V-05).
'use strict';
const path = require('path');
const { Mesh, buildUnitPackage } = require('../lib/swine-model-kit');
const {
  RAVEN_UV: UV, buildRavenAtlas,
  addWingPair, addTailFinPair, addTurbinePair, addCanopy, addMissile, makeWheeledSpec,
} = require('../lib/raven-kit');

const OUT = path.resolve(process.argv[2] || 'mods-test/units/v_vadasz');

function buildGeometry() {
  const hull = new Mesh();
  const prof = [
    [-196, -16, 102], [154, -16, 98], [244, 6, 42], [186, 48, 78],
    [98, 70, 96], [-164, 72, 102], [-202, 38, 100],
  ];
  hull.addPrismX(prof, 98, UV.hullSide, UV.armorClean, {
    edgeRegs: [UV.darkMetal, UV.metal, UV.crimson, UV.hullTop, UV.armorClean, UV.darkMetal, UV.darkMetal],
  });
  addCanopy(hull, { xBot: 58, xTop: 40, yB: 20, yF: 152, zBot: 62, zTop: 100, yTopB: 36, yTopF: 112 });
  addWingPair(hull, { xIn: 94, xOut: 176, yRootB: -158, yRootF: -18, yTipB: -186, yTipF: -88, zRoot: 42, zTip: 52, tRoot: 11, tTip: 5 });
  addTailFinPair(hull, { xRoot: 96, xTip: 108, yRootB: -196, yRootF: -136, yTipB: -214, yTipF: -164, zBot: 58, zTop: 130, thick: 8 });
  // Высокое заднее антикрыло (чистая броня + красная задняя кромка, без растянутого круга!)
  hull.addBox(-114, 114, -214, -166, 120, 132, { all: UV.armorClean, front: UV.metal, back: UV.crimson });
  addTurbinePair(hull, { xOff: 46, yBack: -206, yFront: -140, z: 32, rBody: 24, rNozzle: 19 });
  for (const sx of [-1, 1]) {
    hull.addLatheY(sx * 64, 22, [[186, 9], [208, 13], [216, 12]], 8, UV.chrome, { smooth: true, capStart: true, capEnd: true, capReg: UV.lights });
    hull.addBox(sx * 76 - 12, sx * 76 + 12, -206, -192, 22, 38, { all: UV.darkMetal, back: UV.taillight });
  }

  const tur = new Mesh();
  tur.addFrustum([-52, 52, -56, 48], [-40, 40, -44, 36], 0, 50, { all: UV.armorClean, front: UV.canopy, back: UV.darkMetal });
  tur.addBox(-124, 124, -24, 18, 22, 38, { all: UV.metal, top: UV.armorClean });
  tur.addLatheY(0, 62, [[-18, 16], [24, 15], [30, 12]], 8, UV.darkMetal, { smooth: true, capStart: true, capEnd: true, capReg: UV.lights });

  const cso = new Mesh();
  for (const sx of [-1, 1]) {
    cso.addBox(sx * 88 - 34, sx * 88 + 34, -56, 26, -8, 42, { all: UV.darkMetal, top: UV.armorClean, front: UV.hazard });
    for (const dx of [-16, 16]) for (const dz of [4, 28]) {
      addMissile(cso, { x: sx * 88 + dx, y: -62, z: dz, len: 146, r: 10.5, pitch: 0.08, finSpan: 17 });
    }
  }

  return makeWheeledSpec({
    wheelX: 122, wheelYF: 124, wheelYB: -124, wheelR: 48, wheelW: 25, bodyY: 60,
    testMesh: hull, turretMesh: tur, turretPos: [0, -44, 70],
    csoMesh: cso, csoPos: [0, 8, 22], muzzlePos: [0, 96, 18],
    flagPos: [76, -158, 72], headlightY: 222, headlightX: 64, headlightZ: 22,
    taillightY: -208, taillightX: 76, taillightZ: 30,
  });
}

const summary = buildUnitPackage({
  modelName: 'v_vadasz', race: 'raven', anifFrom: 'ny_lighttank', outDir: OUT,
  buildGeometry, buildAtlas: lvl => buildRavenAtlas(lvl, { code: 'V-05', dmgSeed: 0, hullAspect: 4.8, wingAspect: 0.85, finAspect: 0.78 }),
});
for (const s of summary) console.log(`v_vadasz_${s.level.padEnd(7)} V=${s.verts} F=${s.faces} .4d=${s.size4d}B`);

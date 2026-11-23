#!/usr/bin/env node
// Корпус Воронов #1: «Стриж» (v_dzsip) — Аэродинамический разведчик-наводчик авиации (4×4, V-01).
'use strict';
const path = require('path');
const { Mesh, buildUnitPackage } = require('../lib/swine-model-kit');
const {
  RAVEN_UV: UV, buildRavenAtlas,
  addWingPair, addTailFinPair, addTurbinePair, addCanopy, makeWheeledSpec,
} = require('../lib/raven-kit');

const OUT = path.resolve(process.argv[2] || 'mods-test/units/v_dzsip');

function buildGeometry() {
  const hull = new Mesh();
  const prof = [
    [-178, -14, 96], [148, -14, 92], [224, 6, 46], [198, 44, 64],
    [118, 62, 90], [-152, 64, 96], [-186, 36, 94],
  ];
  hull.addPrismX(prof, 94, UV.hullSide, UV.armorClean, {
    edgeRegs: [UV.darkMetal, UV.metal, UV.crimson, UV.hullTop, UV.armorClean, UV.darkMetal, UV.darkMetal],
  });
  addCanopy(hull, { xBot: 64, xTop: 44, yB: -46, yF: 108, zBot: 62, zTop: 118, yTopB: -24, yTopF: 52 });
  addWingPair(hull, { xIn: 90, xOut: 168, yRootB: -120, yRootF: 50, yTipB: -154, yTipF: -36, zRoot: 34, zTip: 42, tRoot: 10, tTip: 5 });
  addTailFinPair(hull, { xRoot: 74, xTip: 102, yRootB: -178, yRootF: -102, yTipB: -206, yTipF: -144, zBot: 60, zTop: 134, thick: 8 });
  addTurbinePair(hull, { xOff: 44, yBack: -186, yFront: -120, z: 30, rBody: 22, rNozzle: 17 });
  hull.addBox(-48, 48, 212, 232, 0, 18, { all: UV.metal });
  for (const sx of [-1, 1]) {
    hull.addLatheY(sx * 64, 24, [[168, 9], [190, 14], [198, 13]], 8, UV.chrome, { smooth: true, capStart: true, capEnd: true, capReg: UV.lights });
    hull.addBox(sx * 74 - 12, sx * 74 + 12, -190, -174, 22, 38, { all: UV.darkMetal, back: UV.taillight });
  }

  const tur = new Mesh();
  tur.addLatheZ(0, 0, [[0, 26, 26], [28, 22, 22], [38, 12, 12]], 10, UV.armorClean, { smooth: true, capStart: true, capEnd: true });
  tur.addLatheZ(0, 0, [[34, 8, 8], [76, 6, 6]], 8, UV.chrome, { smooth: true, capStart: true, capEnd: true });
  tur.addFrustum([-74, 74, -12, 12], [-66, 66, -8, 10], 72, 102, { all: UV.metal, front: UV.radar, back: UV.armorClean });
  tur.addLatheY(0, 88, [[10, 8], [26, 5]], 8, UV.lights, { smooth: true, capStart: true, capEnd: true });

  return makeWheeledSpec({
    wheelX: 114, wheelYF: 114, wheelYB: -112, wheelR: 46, wheelW: 24, bodyY: 58,
    testMesh: hull, turretMesh: tur, turretPos: [0, -106, 62],
    flagPos: [76, -158, 66], headlightY: 204, headlightX: 64, headlightZ: 24,
    taillightY: -192, taillightX: 74, taillightZ: 30,
  });
}

const summary = buildUnitPackage({
  modelName: 'v_dzsip', race: 'raven', anifFrom: 'ny_dzsip', outDir: OUT,
  buildGeometry, buildAtlas: lvl => buildRavenAtlas(lvl, { code: 'V-01', dmgSeed: 0, hullAspect: 4.8, wingAspect: 0.75, finAspect: 0.90 }),
});
for (const s of summary) console.log(`v_dzsip_${s.level.padEnd(7)} V=${s.verts} F=${s.faces} .4d=${s.size4d}B`);

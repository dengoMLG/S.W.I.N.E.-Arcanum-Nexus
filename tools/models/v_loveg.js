#!/usr/bin/env node
// Корпус Воронов #4: «Гриф» (v_loveg) — Дальнобойная колёсная авиа-гаубица (4×4, V-04).
'use strict';
const path = require('path');
const { Mesh, buildUnitPackage } = require('../lib/swine-model-kit');
const {
  RAVEN_UV: UV, buildRavenAtlas,
  addWingPair, addTurbinePair, addCanopy, makeWheeledSpec,
} = require('../lib/raven-kit');

const OUT = path.resolve(process.argv[2] || 'mods-test/units/v_loveg');

function buildGeometry() {
  const hull = new Mesh();
  // Нижняя рама с бортовым номером V-04 + чистая клёпаная броня сверху
  hull.addBox(-106, 106, -214, 198, -14, 48, {
    all: UV.hullSide, top: UV.armorClean, bot: UV.darkMetal, front: UV.metal, back: UV.darkMetal,
  });
  // Передняя бронированная авиакабина (чистая броня по бокам — номер не дублируется 3 раза!)
  hull.addFrustum([-100, 100, 48, 206], [-86, 86, 56, 152], 46, 104, {
    all: UV.armorClean, top: UV.armorClean, front: UV.canopy, bot: false,
  });
  hull.addFrustum([-88, 88, 192, 238], [-54, 54, 196, 224], -10, 46, { all: UV.armorClean, front: UV.crimson });
  addCanopy(hull, { xBot: 74, xTop: 58, yB: 74, yF: 172, zBot: 96, zTop: 122, yTopB: 84, yTopF: 140 });
  // Крылышки-стабилизаторы высоко над аркой заднего колеса + откидные сошники
  addWingPair(hull, { xIn: 104, xOut: 158, yRootB: -162, yRootF: 20, yTipB: -186, yTipF: -58, zRoot: 46, zTip: 54, tRoot: 11, tTip: 6 });
  for (const sx of [-1, 1]) {
    hull.addFrustum([sx * 64 - 22, sx * 64 + 22, -242, -206], [sx * 64 - 18, sx * 64 + 18, -228, -202], -34, 46, { all: UV.metal, back: UV.hazard });
    hull.addLatheY(sx * 70, 20, [[202, 10], [224, 14], [232, 13]], 8, UV.chrome, { smooth: true, capStart: true, capEnd: true, capReg: UV.lights });
    hull.addBox(sx * 82 - 12, sx * 82 + 12, -218, -202, 24, 40, { all: UV.darkMetal, back: UV.taillight });
  }
  addTurbinePair(hull, { xOff: 32, yBack: -222, yFront: -168, z: 18, rBody: 18, rNozzle: 14 });

  // Арт-лафетная турель (Lovegtorony): чистая броня на боках + эмблема Воронов сверху!
  const tur = new Mesh();
  tur.addLatheZ(0, 0, [[0, 74, 74], [24, 68, 68]], 12, UV.darkMetal, { smooth: true, capStart: true, capEnd: true });
  tur.addFrustum([-78, 78, -68, 56], [-64, 64, -56, 44], 22, 84, {
    all: UV.armorClean, top: UV.hullTop, front: UV.metal, back: UV.darkMetal,
  });
  for (const sx of [-1, 1]) {
    tur.addTube([[sx * 54, -22, 34], [sx * 54, 34, 96]], 9, 8, UV.chrome, { capStart: true, capEnd: true });
  }

  const cso = new Mesh();
  const pitch = 0.44, cp = Math.cos(pitch), sp = Math.sin(pitch);
  const pt = (x, y, z) => [x, y * cp - z * sp, y * sp + z * cp];
  const mkCyl = (ox, oz, prof, reg) => {
    const rings = prof.map(([ly, r]) => {
      const ring = [];
      for (let i = 0; i < 10; i++) { const a = 2 * Math.PI * i / 10; ring.push(pt(ox + Math.cos(a) * r, ly, oz + Math.sin(a) * r)); }
      return ring;
    });
    cso.addLoft(rings, reg, { smooth: true, capStart: true, capEnd: true });
  };
  mkCyl(0, 0, [[-76, 26], [34, 24], [42, 18], [156, 15], [164, 13], [312, 11], [322, 22], [352, 21]], UV.darkMetal);
  mkCyl(0, -24, [[-44, 12], [116, 11]], UV.chrome);
  mkCyl(0, 0, [[44, 20], [72, 20]], UV.crimson);

  return makeWheeledSpec({
    wheelX: 124, wheelYF: 136, wheelYB: -136, wheelR: 50, wheelW: 26, bodyY: 64,
    testMesh: hull, turretMesh: tur, turretPos: [0, -76, 48],
    csoMesh: cso, csoPos: [0, 12, 68], muzzlePos: [0, 326, 154],
    flagPos: [76, 86, 108], headlightY: 236, headlightX: 70, headlightZ: 20,
    taillightY: -222, taillightX: 82, taillightZ: 32,
  });
}

const summary = buildUnitPackage({
  modelName: 'v_loveg', race: 'raven', anifFrom: 'ny_loveg', outDir: OUT,
  buildGeometry, buildAtlas: lvl => buildRavenAtlas(lvl, { code: 'V-04', dmgSeed: 3, hullAspect: 5.5, wingAspect: 0.55 }),
});
for (const s of summary) console.log(`v_loveg_${s.level.padEnd(7)} V=${s.verts} F=${s.faces} .4d=${s.size4d}B`);

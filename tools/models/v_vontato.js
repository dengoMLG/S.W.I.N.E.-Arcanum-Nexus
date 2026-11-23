#!/usr/bin/env node
// Корпус Воронов #15: «Скворец» (v_vontato) — Аэродромный тягач-буксир снабжения (4×4, V-10).
// Силуэт: приземистый мускулистый аэродромный тягач с жёлто-чёрным силовым бампером-толкателем,
// панорамной кабиной авиадиспетчера, проблесковыми оранжевыми маячками, боковыми крылышками,
// грузовой палубой со стяжным барабаном-лебёдкой и мощным буксировочным сцепным крюком для прицепов!
'use strict';
const path = require('path');
const { Mesh, buildUnitPackage } = require('../lib/swine-model-kit');
const {
  RAVEN_UV: UV, buildRavenAtlas,
  addWingPair, addTailFinPair, addCanopy, makeWheeledSpec,
} = require('../lib/raven-kit');

const OUT = path.resolve(process.argv[2] || 'mods-test/units/v_vontato');

function buildGeometry() {
  const hull = new Mesh();
  // Приземистый широкий корпус аэродромного тягача (пропорция борта ~3.6:1)
  const prof = [
    [-198, -14, 114], [174, -14, 110], [214, 14, 96], [192, 68, 104],
    [110, 96, 102], [-28, 96, 106], [-56, 56, 112], [-198, 56, 114],
  ];
  hull.addPrismX(prof, 110, UV.hullSide, UV.armorClean, {
    edgeRegs: [UV.darkMetal, UV.hazard, UV.hazard, UV.canopy, UV.hullTop, UV.darkMetal, UV.armorClean, UV.hazard],
  });
  // Панорамная кабина аэродромного буксира + 2 оранжевых маячка на крыше!
  addCanopy(hull, { xBot: 82, xTop: 68, yB: -16, yF: 176, zBot: 84, zTop: 122, yTopB: -4, yTopF: 136 });
  for (const sx of [-1, 1]) {
    hull.addLatheZ(sx * 48, 36, [[120, 14, 14], [142, 12, 12], [148, 6, 6]], 8, UV.lights, { smooth: true, capStart: true, capEnd: true });
    hull.addLatheY(sx * 78, 28, [[184, 10], [208, 15], [216, 14]], 8, UV.chrome, { smooth: true, capStart: true, capEnd: true, capReg: UV.lights });
    hull.addBox(sx * 86 - 14, sx * 86 + 14, -206, -190, 26, 44, { all: UV.darkMetal, back: UV.taillight });
  }
  // Массивный передний жёлто-чёрный аэродромный бампер-толкатель!
  hull.addFrustum([-108, 108, 198, 232], [-96, 96, 200, 224], -12, 26, { all: UV.hazard, top: UV.metal });
  // Компактные боковые крылья-подножки + пара невысоких хвостовых стабилизаторов
  addWingPair(hull, { xIn: 108, xOut: 152, yRootB: -164, yRootF: 52, yTipB: -182, yTipF: -18, zRoot: 38, zTip: 42, tRoot: 11, tTip: 6 });
  addTailFinPair(hull, { xRoot: 96, xTip: 112, yRootB: -198, yRootF: -136, yTipB: -210, yTipF: -158, zBot: 54, zTop: 114, thick: 8 });

  // Задняя грузовая площадка: барабан лебёдки + инструментальные ящики + мощное сцепное устройство (фаркоп) для прицепов!
  hull.addLatheY(0, 74, [[-110, 26], [-72, 26]], 12, UV.chrome, { smooth: true, capStart: true, capEnd: true, capReg: UV.darkMetal });
  for (const sx of [-1, 1]) {
    hull.addBox(sx * 72 - 22, sx * 72 + 22, -168, -68, 56, 86, { all: UV.metal, top: UV.hazard });
    hull.addBox(sx * 24 - 8, sx * 24 + 8, -238, -194, 4, 24, { all: UV.darkMetal });
  }
  // Сцепной крюк / шар фаркопа + красная страховочная перекладина
  hull.addBox(-34, 34, -244, -224, 6, 22, { all: UV.crimson });
  hull.addLatheZ(0, -234, [[16, 12, 12], [34, 9, 9], [40, 14, 14]], 8, UV.chrome, { smooth: true, capStart: true, capEnd: true });
  // Радиомаяк запроса воздушного сброса (Air-Drop) за кабиной!
  hull.addLatheZ(-46, -42, [[56, 10, 10], [156, 4, 4]], 8, UV.chrome, { smooth: true, capStart: true, capEnd: true });
  hull.addLatheZ(-46, -42, [[152, 18, 18], [166, 14, 14]], 10, UV.crimson, { smooth: true, capStart: true, capEnd: true });

  return makeWheeledSpec({
    wheelX: 126, wheelYF: 122, wheelYB: -120, wheelR: 48, wheelW: 28, bodyY: 60,
    testMesh: hull, turretMesh: null,
    flagPos: [84, -158, 86], headlightY: 222, headlightX: 78, headlightZ: 28,
    taillightY: -208, taillightX: 86, taillightZ: 34,
  });
}

const summary = buildUnitPackage({
  modelName: 'v_vontato', race: 'raven', anifFrom: 'ny_dzsip', outDir: OUT,
  buildGeometry, buildAtlas: lvl => buildRavenAtlas(lvl, { code: 'V-10', dmgSeed: 1, hullAspect: 3.7, wingAspect: 0.45, finAspect: 0.95 }),
});
for (const s of summary) console.log(`v_vontato_${s.level.padEnd(7)} V=${s.verts} F=${s.faces} .4d=${s.size4d}B`);

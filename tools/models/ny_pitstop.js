#!/usr/bin/env node
// Юнит #9 (Кролики): «Пит-Стоп» (ny_pitstop) — Боевой ремонтник-эвакуатор.
//
// Силуэт: быстрый бронированный багги «формульной» техпомощи Кроликов — низкий гоночный
// нос, широкие синеступичные колёса (Wheel L/R), антикрыло-спойлер на корме, запасное колесо,
// красные канистры с топливом (FUEL) и инструментальный ящик, белая гоночная разметка + IX,
// и поворотная кран-стрела ремонтного манипулятора на крыше (Lovegtorony)!
//
// Совместимость Gepard: Wheel R/L 0 N002, Wheel R/L 1 N001, Test, Lovegtorony (кран), Zaszlorud, _glow0..3.
'use strict';
const path = require('path');
const {
  clamp, uvRect,
  Mesh, buildWheelMesh, Canvas, loadGameAssets, buildUnitPackage,
} = require('../lib/swine-model-kit');

const OUT = path.resolve(process.argv[2] || 'mods-test/units/ny_pitstop');

const UV = {
  bodySide:   [0.01, 0.01, 0.46, 0.25], // Борт болида + IX + морковка + гоночная полоса Vet/Elite
  bodyTop:    [0.01, 0.27, 0.31, 0.48], // Капот/антикрыло + гоночные полосы + морковка / звезда
  window:     [0.33, 0.27, 0.47, 0.48], // Лобовое стекло Кроликов
  grille:     [0.01, 0.50, 0.24, 0.67], // Заячья решётка
  ribbed:     [0.26, 0.50, 0.48, 0.67], // Ребристый хром двигателя
  fuelCan:    [0.01, 0.69, 0.24, 0.85], // Красные канистры топлива (из utanfuto_fuel.dxt + FUEL!)
  toolbox:    [0.26, 0.69, 0.48, 0.85], // Инструментальный ящик + знак ремонта/ключа!
  hazard:     [0.01, 0.87, 0.46, 0.99], // Жёлто-чёрные полосы кран-стрелы техпомощи!
  tireRim:    [0.50, 0.01, 0.72, 0.23], // Синеступичное колесо Кроликов!
  tireTread:  [0.74, 0.01, 0.88, 0.34],
  craneArm:   [0.50, 0.36, 0.99, 0.52], // Металл стрелы ремонтного крана + полосы Vet/Elite!
  metal:      [0.50, 0.54, 0.74, 0.76],
  chrome:     [0.76, 0.54, 0.99, 0.76],
  lights:     [0.50, 0.78, 0.72, 0.98],
  taillight:  [0.74, 0.78, 0.99, 0.98],
};

function buildPitstopAtlas(level) {
  const cv = new Canvas(1024);
  const ga = loadGameAssets(), R = ga.rects;
  const isVet = level === 'veteran', isElite = level === 'elite';
  const dmgSet = isElite ? ga.eliteDamages : ga.vetDamages;
  const stampDmg = (idx, dx0, dy0, dx1, dy1, rot = 0) => {
    const p = dmgSet[idx % dmgSet.length];
    cv.blitPatch(p, { x: 0, y: 0, w: p.W, h: p.H }, dx0, dy0, dx1, dy1, { useSrcAlphaAsOpacity: true, setTeamMask: 0, rotate: rot, opacity: isElite ? 0.90 : 0.80 });
  };

  cv.fillArmorBaseFromGame('rabbit', 1.02);

  // BODY SIDE — спортивный борт + IX + морковка + гоночная полоса
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.bodySide);
    cv.panelFrame(x0, y0, x1, y1, 4, 34);
    const Wp = x1 - x0, Hp = y1 - y0;
    // Белая «формульная» шашечка/полоса снизу (всегда 1 полоса, на Vet 2, на Elite шашки!)
    cv.fillRect(x0 + 8, y1 - 34, x1 - 8, y1 - 18, [0.06, 0.06, 0.07], 1, 0);
    if (isElite) {
      for (let bx = x0 + 10; bx < x1 - 10; bx += 20) {
        cv.fillRect(bx, y1 - 32, bx + 10, y1 - 26, [0.96, 0.97, 0.98], 1, 0);
        cv.fillRect(bx + 10, y1 - 26, bx + 20, y1 - 20, [0.96, 0.97, 0.98], 1, 0);
      }
    } else {
      cv.fillRect(x0 + 8, y1 - 31, x1 - 8, y1 - 21, [0.96, 0.97, 0.98], 1, 0);
      if (isVet) cv.fillRect(x0 + 8, y1 - 46, x1 - 8, y1 - 39, [0.96, 0.97, 0.98], 1, 0);
    }
    cv.drawGlyph('I', x0 + Wp * 0.24, y0 + Hp * 0.42, Hp * 0.46, [0.96, 0.97, 0.98]);
    cv.drawGlyph('X', x0 + Wp * 0.36, y0 + Hp * 0.42, Hp * 0.46, [0.96, 0.97, 0.98]);
    cv.blitPatch(R.rabbitCarrotH.img, R.rabbitCarrotH, x0 + Wp * 0.56, y0 + Hp * 0.14, x0 + Wp * 0.84, y0 + Hp * 0.70, { cutoutByInvAlpha: true, setTeamMask: 0 });
    if (isVet || isElite) stampDmg(1, x0 + 20, y0 + 22, x0 + 150, y0 + 120);
  }

  // BODY TOP — двойные белые гоночные полосы по центру капота + морковка / звезда!
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.bodyTop);
    cv.panelFrame(x0, y0, x1, y1, 4, 28);
    const cx = (x0 + x1) * 0.5, cy = (y0 + y1) * 0.5;
    for (const dx of [-22, 22]) {
      cv.fillRect(cx + dx - 9, y0 + 8, cx + dx + 9, y1 - 8, [0.06, 0.06, 0.07], 1, 0);
      cv.fillRect(cx + dx - 7, y0 + 8, cx + dx + 7, y1 - 8, [0.95, 0.96, 0.97], 1, 0);
    }
    if (isVet || isElite) cv.blitPatch(R.rabbitStar.img, R.rabbitStar, cx - 50, cy - 48, cx + 50, cy + 48, { cutoutByInvAlpha: true, setTeamMask: 0 });
    else cv.blitPatch(R.rabbitCarrot.img, R.rabbitCarrot, cx - 30, cy - 56, cx + 30, cy + 56, { cutoutByInvAlpha: true, setTeamMask: 0 });
  }

  // FUEL CAN — красные канистры с оригинальной табличкой FUEL!
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.fuelCan);
    cv.blitPatch(R.fuelRedMetal.img, R.fuelRedMetal, x0, y0, x1, y1, { setTeamMask: 0, gain: 0.95 });
    const cx = (x0 + x1) * 0.5, cy = (y0 + y1) * 0.5;
    cv.blitPatch(R.fuelSign.img, R.fuelSign, cx - 46, cy - 46, cx + 46, cy + 46, { cutoutByInvAlpha: true, setTeamMask: 0 });
  }

  // TOOLBOX — ремонтный ящик с белым крестом/гаечным ключом (alpha = 0!)
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.toolbox);
    cv.blitPatch(R.mantletMetal.img, R.mantletMetal, x0, y0, x1, y1, { setTeamMask: 0, tint: [0.30, 0.55, 0.90], gain: 1.15 });
    cv.panelFrame(x0, y0, x1, y1, 4, 28);
    const cx = (x0 + x1) * 0.5, cy = (y0 + y1) * 0.5;
    // Белый крест техпомощи / ключ
    cv.fillRect(cx - 38, cy - 12, cx + 38, cy + 12, [0.96, 0.97, 0.98], 1, 0);
    cv.fillRect(cx - 12, cy - 38, cx + 12, cy + 38, [0.96, 0.97, 0.98], 1, 0);
  }

  { const [x0, y0, x1, y1] = cv.regPx(UV.hazard); cv.blitPatch(R.hazardStrip.img, R.hazardStrip, x0, y0, x1, y1, { setTeamMask: 0 }); }
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.craneArm);
    const Hb = y1 - y0;
    cv.blitPatch(R.chromeMetal.img, R.chromeMetal, x0, y0, x1, y1, { setTeamMask: 0, rotate: 90, gain: 1.1 });
    cv.blitPatch(R.hazardStrip.img, R.hazardStrip, x0, y1 - 28, x1, y1 - 4, { setTeamMask: 0 });
    if (isVet || isElite) {
      for (let s = 0; s < (isElite ? 4 : 2); s++) {
        const sy = y0 + Hb * (0.14 + s * 0.11);
        cv.fillRect(x0, sy, x1, sy + 7, [0.96, 0.97, 0.98], 1, 0);
      }
    }
  }

  { const [x0, y0, x1, y1] = cv.regPx(UV.window);    cv.blitPatch(R.rabbitWindow.img, R.rabbitWindow, x0, y0, x1, y1, { setTeamMask: 0, rotate: 90 }); }
  { const [x0, y0, x1, y1] = cv.regPx(UV.grille);    cv.blitPatch(R.rabbitGrille.img, R.rabbitGrille, x0, y0, x1, y1, { setTeamMask: 0 }); }
  { const [x0, y0, x1, y1] = cv.regPx(UV.ribbed);    cv.blitPatch(R.rabbitRibbed.img, R.rabbitRibbed, x0, y0, x1, y1, { setTeamMask: 0 }); }
  { const [x0, y0, x1, y1] = cv.regPx(UV.tireRim);   cv.blitPatch(R.rabbitTireRim.img, R.rabbitTireRim, x0, y0, x1, y1, { setTeamMask: 0 }); }
  { const [x0, y0, x1, y1] = cv.regPx(UV.tireTread); cv.blitPatch(R.rabbitTireTrd.img, R.rabbitTireTrd, x0, y0, x1, y1, { setTeamMask: 0 }); }
  { const [x0, y0, x1, y1] = cv.regPx(UV.metal);     cv.blitPatch(R.mantletMetal.img, R.mantletMetal, x0, y0, x1, y1, { setTeamMask: 0, gain: 0.62 }); }
  { const [x0, y0, x1, y1] = cv.regPx(UV.chrome);    cv.blitPatch(R.chromeMetal.img, R.chromeMetal, x0, y0, x1, y1, { setTeamMask: 0, rotate: 90, gain: 1.35 }); }
  { const [x0, y0, x1, y1] = cv.regPx(UV.lights);    cv.blitPatch(R.headlight.img, R.headlight, x0, y0, x1, y1, { setTeamMask: 0 }); }
  { const [x0, y0, x1, y1] = cv.regPx(UV.taillight); cv.blitPatch(R.taillight.img, R.taillight, x0, y0, x1, y1, { setTeamMask: 0, rotate: 90 }); }

  return cv.downsample2x();
}

function buildPitstopGeometry() {
  const parts = {};

  // 4 широких гоночных колеса (задние ещё шире — стиль Formula 1 / Baja pit-crew!)
  for (const wn of ['Wheel R 0 N002', 'Wheel L 0 N002']) {
    const w = new Mesh(); buildWheelMesh(w, 26, 48, 14, UV.tireTread, UV.tireRim); parts[wn] = w;
  }
  for (const wn of ['Wheel R 1 N001', 'Wheel L 1 N001']) {
    const w = new Mesh(); buildWheelMesh(w, 34, 54, 14, UV.tireTread, UV.tireRim); parts[wn] = w;
  }

  // TEST — приземистый болид-техпомощь + гоночное антикрыло + канистры топлива + запаска + ящик инструментов!
  {
    const m = new Mesh();
    // Обтекаемый формульный корпус
    const prof = [[-196, -20, 100], [186, -20, 90], [228, -2, 68], [134, 38, 92], [-196, 44, 102]];
    m.addPrismX(prof, 94, UV.bodySide, UV.bodyTop, {
      edgeRegs: [UV.metal, UV.grille, UV.bodyTop, UV.bodyTop, UV.ribbed],
    });
    // Переднее формульное антикрыло-бампер с предупреждающей полосой!
    m.addBox(-122, 122, 214, 240, -24, -10, { all: UV.hazard, top: UV.bodyTop });
    for (const sx of [-1, 1]) {
      const x0 = sx > 0 ? 92 : -140, x1 = sx > 0 ? 140 : -92;
      m.addBox(x0, x1, -86, 84, -8, 28, { top: UV.bodyTop, bot: UV.metal, front: UV.bodyTop, back: UV.bodyTop, left: UV.bodySide, right: UV.bodySide });
      m.addBox(sx > 0 ? 84 : -124, sx > 0 ? 124 : -84, 114, 134, -24, -10, { all: UV.metal });
      m.addBox(sx > 0 ? 84 : -124, sx > 0 ? 124 : -84, -134, -114, -24, -10, { all: UV.metal });
      m.addLatheY(sx * 78, 18, [[184, 10], [200, 14], [210, 13]], 10, UV.chrome, { smooth: true, capStart: true, capEnd: true, capReg: UV.lights });
      m.addBox(sx * 76 - 12, sx * 76 + 12, -202, -188, 10, 26, { all: UV.metal, back: UV.taillight });
    }
    // Кабина пилота-механика с аэродинамическим стеклом
    m.addFrustum([-78, 78, 14, 136], [-64, 64, 28, 102], 36, 88, {
      top: UV.bodyTop, bot: UV.metal, front: UV.window, back: UV.ribbed, left: UV.bodySide, right: UV.bodySide,
    });

    // ═══ БОЛЬШОЕ ФОРМУЛЬНОЕ ЗАДНЕЕ АНТИКРЫЛО-СПОЙЛЕР! ═══
    for (const sx of [-94, 94]) m.addBox(sx - 6, sx + 6, -206, -166, 42, 112, { all: UV.metal });
    m.addFrustum([-126, 126, -212, -164], [-126, 126, -218, -172], 106, 118, { all: UV.bodyTop, back: UV.hazard });

    // ═══ БОРТОВОЕ РЕМОНТНОЕ ОБОРУДОВАНИЕ: 2 КАНИСТРЫ ТОПЛИВА + ЯЩИК ИНСТРУМЕНТОВ + ЗАПАСКА! ═══
    // Две красные канистры FUEL по бокам задней площадки
    for (const sx of [-78, 78]) {
      m.addBox(sx - 20, sx + 20, -136, -86, 44, 92, { all: UV.fuelCan });
    }
    // Синий ящик с белым крестом техпомощи по центру
    m.addBox(-46, 46, -158, -106, 44, 82, { all: UV.toolbox });
    // Запасное колесо с синей ступицей прикручено горизонтально на корме!
    m.addLatheZ(0, -168, [[44, 38, 38], [66, 38, 38]], 12, UV.tireTread, { smooth: true, capStart: true, capEnd: true, capReg: UV.tireRim });

    parts.Test = m;
  }

  // LOVEGTORONY — ПОВОРОТНЫЙ РЕМОНТНЫЙ МАНИПУЛЯТОР / СВАРОЧНАЯ СТРЕЛА НА КРЫШЕ!
  {
    const m = new Mesh();
    m.addLatheZ(0, 0, [[-14, 42, 42], [12, 34, 34]], 10, UV.metal, { smooth: true, capStart: true, capEnd: true });
    // Ломаная гидравлическая стрела-кран со сварочной головкой/захватом
    m.addTube([[0, 0, 12], [0, -24, 68], [0, 74, 86], [0, 116, 62]], [10, 9.5, 8.5, 7], 8, UV.craneArm, { capStart: true, capEnd: true });
    // Сварочные клещи / ремонтный захват на конце стрелы
    for (const sx of [-12, 12]) m.addBox(sx - 4, sx + 4, 112, 138, 52, 68, { all: UV.chrome });
    parts.Lovegtorony = m;
  }

  {
    const m = new Mesh();
    m.addLatheZ(0, 0, [[0, 5, 5], [18, 3.5, 3.5], [190, 1.5, 1.5]], 6, UV.metal, { smooth: true, capStart: true, capEnd: true });
    parts.Zaszlorud = m;
  }

  const ROOT_M = (tx, ty, tz) => [-1, 0, 0,  0, 0, -1,  0, 1, 0,  tx, ty, tz];
  const ID_M = (tx, ty, tz, sx = 1, sy = 1, sz = 1) => [sx, 0, 0,  0, sy, 0,  0, 0, sz,  tx, ty, tz];

  return {
    nodes: [
      { name: 'Wheel R 1 N001', parent: -1, m: ROOT_M(-122, 48, -124), mesh: parts['Wheel R 0 N002'] },
      { name: 'Wheel L 1 N001', parent: -1, m: ROOT_M( 122, 48, -124), mesh: parts['Wheel L 0 N002'] },
      { name: 'Wheel R 0 N002', parent: -1, m: ROOT_M(-128, 54,  124), mesh: parts['Wheel R 1 N001'] },
      { name: 'Wheel L 0 N002', parent: -1, m: ROOT_M( 128, 54,  124), mesh: parts['Wheel L 1 N001'] },
      { name: 'Test',           parent: -1, m: ROOT_M(0, 64, 0), mesh: parts.Test },
      { name: 'Lovegtorony',    parent:  4, m: ID_M(0, -34, 58), mesh: parts.Lovegtorony },
      { name: 'Zaszlorud',      parent:  4, m: ID_M(62, 42, 86), mesh: parts.Zaszlorud },
      { name: '_glow0piros',    parent:  4, m: ID_M(-76, -204, 18, 0.28, -1, 0.28), helper: true },
      { name: '_glow1piros',    parent:  4, m: ID_M( 76, -204, 18, -0.28, -1, 0.28), helper: true },
      { name: '_glow2feher',    parent:  4, m: ID_M(-78, 214, 18, 0.24, 1, 0.24), helper: true },
      { name: '_glow3feher',    parent:  4, m: ID_M( 78, 214, 18, -0.24, 1, 0.24), helper: true },
    ],
  };
}

const summary = buildUnitPackage({
  modelName: 'ny_pitstop',
  race: 'rabbit',
  anifFrom: 'ny_dzsip',
  outDir: OUT,
  buildGeometry: buildPitstopGeometry,
  buildAtlas: buildPitstopAtlas,
});
for (const s of summary) console.log(`ny_pitstop_${s.level.padEnd(7)}  V=${String(s.verts).padStart(4)}  F=${String(s.faces).padStart(4)}  .4d=${s.size4d}B  .dxt=${s.sizeDxt}B`);

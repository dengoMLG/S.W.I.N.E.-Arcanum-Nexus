#!/usr/bin/env node
// Юнит #10 (Кролики): «Кролик-Ушастик» (ny_ushastik) — Машина разведки и наведения (РЛС/РЭБ).
//
// Силуэт: странноватый обтекаемый фургон связи Кроликов (4 синеступичных колеса Wheel L/R,
// панорамное стекло кабины, заячья решётка, боковые радиоотсеки, морковка и XV), увенчанный
// ГИГАНТСКОЙ КРУТЯЩЕЙСЯ АНТЕННОЙ-РАДАРОМ В ФОРМЕ ДВУХ ОГРОМНЫХ ЗАЯЧЬИХ УШЕЙ (узел Lovegtorony —
// уши реально вращаются на крыше фургона в игре!) с параболическими решётками и диполями внутри!
//
// Совместимость Gepard: Wheel R/L 0 N002, Wheel R/L 1 N001, Test, Lovegtorony (радар-уши), Zaszlorud, _glow0..3.
'use strict';
const path = require('path');
const {
  clamp, uvRect,
  Mesh, buildWheelMesh, Canvas, loadGameAssets, buildUnitPackage,
} = require('../lib/swine-model-kit');

// 4.2.5: два варіанти моделі. Типовий ny_ushastik — вуха складені назад на дах (так Ушастик виглядає в магазині,
// на іконках і в бою, поки локатор вимкнено). --open → ny_ushastik_open: вуха розкладені (патч exe підміняє модель
// кнопкою «Локатор», SUnit::LoadNewSkinObject).
const OPEN = process.argv.includes('--open');
const MODEL = OPEN ? 'ny_ushastik_open' : 'ny_ushastik';
const OUT = path.resolve(process.argv.slice(2).find(a => !a.startsWith('--')) || 'mods-test/units/' + MODEL);
// Складання вуха: поворот навколо осі X через шарнір (y = 0, z = 24) назад (−Y) на EAR_FOLD радіан.
const EAR_FOLD = OPEN ? 0 : 1.36;
const foldPt = ([x, y, z]) => {
  const c = Math.cos(EAR_FOLD), s = Math.sin(EAR_FOLD), dz = z - 24;
  return [x, y * c - dz * s, 24 + y * s + dz * c];
};

const UV = {
  vanSide:    [0.01, 0.01, 0.46, 0.25], // Борт фургона РЭБ + XV + оригинальная морковка + экраны связи!
  vanTop:     [0.01, 0.27, 0.31, 0.48], // Крыша фургона + морковка / белая звезда Vet/Elite!
  window:     [0.33, 0.27, 0.47, 0.48], // Панорамное стекло кабины Кроликов
  grille:     [0.01, 0.50, 0.24, 0.67], // Заячья решётка спереди
  ribbed:     [0.26, 0.50, 0.48, 0.67], // Ребристый хром-генератор сзади
  earDish:    [0.01, 0.69, 0.46, 0.99], // Внутренняя решётка параболических «заячьих ушей» радара (сетка + свечение!)
  tireRim:    [0.50, 0.01, 0.72, 0.23],
  tireTread:  [0.74, 0.01, 0.88, 0.34],
  earOuter:   [0.50, 0.36, 0.99, 0.52], // Внешняя сторона «заячьих ушей» (красится цветом команды + полосы Vet/Elite!)
  metal:      [0.50, 0.54, 0.74, 0.76],
  chrome:     [0.76, 0.54, 0.99, 0.76],
  lights:     [0.50, 0.78, 0.72, 0.98],
  taillight:  [0.74, 0.78, 0.99, 0.98],
};

function buildUshastikAtlas(level) {
  const cv = new Canvas(1024);
  const ga = loadGameAssets(), R = ga.rects;
  const isVet = level === 'veteran', isElite = level === 'elite';
  const dmgSet = isElite ? ga.eliteDamages : ga.vetDamages;
  const stampDmg = (idx, dx0, dy0, dx1, dy1, rot = 0) => {
    const p = dmgSet[idx % dmgSet.length];
    cv.blitPatch(p, { x: 0, y: 0, w: p.W, h: p.H }, dx0, dy0, dx1, dy1, { useSrcAlphaAsOpacity: true, setTeamMask: 0, rotate: rot, opacity: isElite ? 0.90 : 0.80 });
  };

  cv.fillArmorBaseFromGame('rabbit', 1.02);

  // VAN SIDE — борт фургона связи + XV + морковка + окошко аппаратного отсека + полосы Vet/Elite!
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.vanSide);
    cv.panelFrame(x0, y0, x1, y1, 4, 34);
    const Wp = x1 - x0, Hp = y1 - y0;
    if (isVet || isElite) {
      cv.fillRect(x0 + 8, y1 - 34, x1 - 8, y1 - 18, [0.06, 0.06, 0.07], 1, 0);
      cv.fillRect(x0 + 8, y1 - 31, x1 - 8, y1 - 21, [0.96, 0.97, 0.98], 1, 0);
      if (isElite) {
        cv.fillRect(x0 + 8, y1 - 48, x1 - 8, y1 - 38, [0.06, 0.06, 0.07], 1, 0);
        cv.fillRect(x0 + 8, y1 - 46, x1 - 8, y1 - 40, [0.96, 0.97, 0.98], 1, 0);
      }
    }
    // Вентиляционная панель аппаратуры связи
    cv.fillRect(x0 + 24, y0 + 26, x0 + 116, y0 + 110, [0.14, 0.16, 0.18], 1, 0);
    for (let ly = y0 + 36; ly < y0 + 104; ly += 10) cv.drawLine(x0 + 32, ly, x0 + 108, ly, 3.5, [0.44, 0.48, 0.52], 1, 0);
    // Зелёный индикатор радара
    cv.fillCircle(x0 + 70, y0 + 132, 10, [0.06, 0.08, 0.06], 1, 0);
    cv.fillCircle(x0 + 70, y0 + 132, 6.5, [0.16, 0.92, 0.34], 1, 0);

    cv.drawGlyph('X', x0 + Wp * 0.38, y0 + Hp * 0.44, Hp * 0.44, [0.96, 0.97, 0.98]);
    cv.drawGlyph('V', x0 + Wp * 0.51, y0 + Hp * 0.44, Hp * 0.44, [0.96, 0.97, 0.98]);
    cv.blitPatch(R.rabbitCarrotH.img, R.rabbitCarrotH, x0 + Wp * 0.64, y0 + Hp * 0.14, x0 + Wp * 0.90, y0 + Hp * 0.70, { cutoutByInvAlpha: true, setTeamMask: 0 });
    if (isVet || isElite) stampDmg(1, x0 + 120, y0 + 20, x0 + 260, y0 + 115);
  }

  // VAN TOP — крыша фургона + морковка / звезда
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.vanTop);
    cv.panelFrame(x0, y0, x1, y1, 4, 28);
    const cx = (x0 + x1) * 0.5, cy = (y0 + y1) * 0.5;
    if (isVet || isElite) cv.blitPatch(R.rabbitStar.img, R.rabbitStar, cx - 54, cy - 52, cx + 54, cy + 52, { cutoutByInvAlpha: true, setTeamMask: 0 });
    else cv.blitPatch(R.rabbitCarrot.img, R.rabbitCarrot, cx - 34, cy - 62, cx + 34, cy + 62, { cutoutByInvAlpha: true, setTeamMask: 0 });
  }

  // EAR DISH — параболическая металлическая сетка внутри «заячьих ушей» (блестящая решётка + оранжево-белая окантовка, alpha = 0!)
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.earDish);
    cv.blitPatch(R.chromeMetal.img, R.chromeMetal, x0, y0, x1, y1, { setTeamMask: 0, gain: 0.90 });
    // Радарная сетка (ромбическая/перекрёстная металлизированная решётка!)
    for (let x = x0 + 10; x < x1 - 10; x += 18) cv.drawLine(x, y0 + 10, x, y1 - 10, 2.5, [0.14, 0.18, 0.22], 0.8, 0);
    for (let y = y0 + 10; y < y1 - 10; y += 18) cv.drawLine(x0 + 10, y, x1 - 10, y, 2.5, [0.14, 0.18, 0.22], 0.8, 0);
    // Внутренняя светящаяся голубая/бирюзовая зона облучателя (эффект «новогодней ёлки» / РЭБ!)
    const cx = (x0 + x1) * 0.5, cy = (y0 + y1) * 0.5;
    cv.fillCircle(cx, cy, 52, [0.14, 0.56, 0.82], 0.72, 0);
    cv.drawRing(cx, cy, 48, 60, [0.95, 0.97, 1.0], 0.9, 0);
    cv.drawRing(cx, cy, 86, 94, [0.96, 0.76, 0.12], 0.85, 0);
  }

  // EAR OUTER — внешняя поверхность заячьих ушей (динамический цвет команды + белые полосы на Vet/Elite!)
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.earOuter);
    cv.panelFrame(x0, y0, x1, y1, 4, 34);
    const Hb = y1 - y0;
    if (isVet || isElite) {
      for (let s = 0; s < (isElite ? 4 : 2); s++) {
        const sy = y0 + Hb * (0.16 + s * 0.14);
        cv.fillRect(x0 + 10, sy - 2, x1 - 10, sy + 8, [0.06, 0.06, 0.07], 1, 0);
        cv.fillRect(x0 + 10, sy, x1 - 10, sy + 6, [0.96, 0.97, 0.98], 1, 0);
      }
      if (isElite) stampDmg(0, x0 + 40, y0 + 16, x0 + 180, y1 - 16);
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

function buildUshastikGeometry() {
  const parts = {};

  for (const wn of ['Wheel R 0 N002', 'Wheel L 0 N002', 'Wheel R 1 N001', 'Wheel L 1 N001']) {
    const w = new Mesh(); buildWheelMesh(w, 26, 52, 14, UV.tireTread, UV.tireRim); parts[wn] = w;
  }

  // TEST — прикольный обтекаемый фургон разведки Кроликов с панорамным стеклом и ребристым генератором сзади!
  {
    const m = new Mesh();
    // Высокий обтекаемый «буханочный» корпус-фургон разведки
    const prof = [
      [-196, -20, 114], [186, -20, 108], [218, 12, 100], [194, 72, 104],
      [124, 118, 98], [-178, 118, 104], [-204, 68, 112],
    ];
    m.addPrismX(prof, 108, UV.vanSide, UV.vanTop, {
      edgeRegs: [UV.metal, UV.grille, UV.window, UV.window, UV.vanTop, UV.ribbed, UV.ribbed],
    });
    // Хромированный бампер + фары + стоп-сигналы + колёсные арки
    m.addTube([[-92, 206, -6], [-74, 232, 0], [74, 232, 0], [92, 206, -6]], 8, 7, UV.chrome, { capStart: true, capEnd: true });
    for (const sx of [-1, 1]) {
      m.addBox(sx > 0 ? 94 : -132, sx > 0 ? 132 : -94, 112, 134, -26, -10, { all: UV.metal });
      m.addBox(sx > 0 ? 94 : -132, sx > 0 ? 132 : -94, -134, -112, -26, -10, { all: UV.metal });
      m.addLatheY(sx * 82, 26, [[192, 10], [210, 16], [220, 15]], 10, UV.chrome, { smooth: true, capStart: true, capEnd: true, capReg: UV.lights });
      m.addBox(sx * 82 - 14, sx * 82 + 14, -206, -190, 18, 36, { all: UV.metal, back: UV.taillight });
      // Боковые радио-капсулы РЭБ по кромке крыши (не перекрывают XV на борту!)
      m.addLatheY(sx * 108, 114, [[-102, 7], [-86, 15], [38, 15], [52, 7]], 8, UV.chrome, { smooth: true, capStart: true, capEnd: true });
    }
    // Задний генераторный блок (ребристый хром!)
    m.addFrustum([-88, 88, -222, -184], [-78, 78, -214, -182], 22, 86, { all: UV.ribbed });
    parts.Test = m;
  }

  // ═══ ГЛАВНАЯ ФИШКА: ГИГАНТСКАЯ КРУТЯЩАЯСЯ АНТЕННА-РАДАР В ФОРМЕ ЗАЯЧЬИХ УШЕЙ (Lovegtorony)! ═══
  {
    const m = new Mesh();
    // Поворотный привод-тумба на крыше фургона
    m.addLatheZ(0, 0, [[-12, 54, 54], [18, 44, 44], [28, 32, 32]], 10, UV.metal, { smooth: true, capStart: true, capEnd: true });
    // Два гигантских параболических «ЗАЯЧЬИХ УХА»-радара (выгнутые вверх и слегка в стороны, с решёткой внутри!)
    for (const sx of [-1, 1]) {
      // Основание-шарнир уха
      const earPts = [
        [sx * 24, 0, 24],
        [sx * 54, -6, 78],
        [sx * 84, -12, 148],
        [sx * 96, -8, 212],
        [sx * 88,  4, 256],
      ];
      // Строим широкую плоскую лопасть-ухо (овал-радар, загнутый вперёд как параболическая тарелка!)
      const earWidths = [16, 36, 44, 34, 10];
      const earThick = [10, 12, 12, 10, 5];
      const rings = earPts.map(([px, py, pz], idx) => {
        const w = earWidths[idx], th = earThick[idx];
        // Наклон уха в сторону (tilt)
        const tilt = sx * (OPEN ? 0.28 : 0.12);
        const ct = Math.cos(tilt), st = Math.sin(tilt);
        const ring = [];
        for (let i = 0; i < 10; i++) {
          const a = 2 * Math.PI * i / 10;
          // Передняя (+Y) сторона чуть вогнутая как тарелка радара!
          const lx = Math.cos(a) * w;
          const ly = Math.sin(a) * th - (Math.sin(a) > 0 ? 5 * (1 - Math.abs(Math.cos(a))) : 0);
          ring.push(foldPt([px + lx * ct, py + ly, pz - lx * st]));
        }
        return ring;
      });
      m.addLoft(rings, UV.earOuter, { smooth: true, capStart: true, capEnd: true });
      // Внутренняя блестящая параболическая решётка-зеркало на передней (+Y) стороне каждого уха!
      const p0 = earPts[1], p1 = earPts[3];
      const dx = sx * 12;
      m.addQuad(
        foldPt([p0[0] + 24, p0[1] + 15, p0[2]]),
        foldPt([p0[0] - 24, p0[1] + 15, p0[2]]),
        foldPt([p1[0] - 22, p1[1] + 14, p1[2]]),
        foldPt([p1[0] + 22, p1[1] + 14, p1[2]]),
        UV.earDish, [0, 1], [1, 1], [1, 0], [0, 0]
      );
      // Хромированный стержень-облучатель (диполь), торчащий вперёд из середины каждого уха!
      const mid = earPts[2];
      m.addTube([foldPt([mid[0], mid[1] + 10, mid[2]]), foldPt([mid[0] + dx * 0.4, mid[1] + 54, mid[2] + 8])], [5, 2.5], 6, UV.chrome, { capStart: true, capEnd: true });
      if (OPEN) m.addLatheY(mid[0] + dx * 0.4, mid[2] + 8, [[mid[1] + 48, 9], [mid[1] + 58, 9]], 8, UV.lights, { smooth: true, capStart: true, capEnd: true });
    }
    // Центральный световой маячок между ушами!
    m.addLatheZ(0, 0, [[26, 16, 16], [54, 14, 14], [62, 6, 6]], 8, UV.lights, { smooth: true, capStart: true, capEnd: true });
    parts.Lovegtorony = m;
  }

  {
    const m = new Mesh();
    m.addLatheZ(0, 0, [[0, 5, 5], [18, 3.5, 3.5], [180, 1.5, 1.5]], 6, UV.metal, { smooth: true, capStart: true, capEnd: true });
    parts.Zaszlorud = m;
  }

  const ROOT_M = (tx, ty, tz) => [-1, 0, 0,  0, 0, -1,  0, 1, 0,  tx, ty, tz];
  const ID_M = (tx, ty, tz, sx = 1, sy = 1, sz = 1) => [sx, 0, 0,  0, sy, 0,  0, 0, sz,  tx, ty, tz];

  return {
    nodes: [
      { name: 'Wheel R 1 N001', parent: -1, m: ROOT_M(-128, 52, -124), mesh: parts['Wheel R 0 N002'] },
      { name: 'Wheel L 1 N001', parent: -1, m: ROOT_M( 128, 52, -124), mesh: parts['Wheel L 0 N002'] },
      { name: 'Wheel R 0 N002', parent: -1, m: ROOT_M(-128, 52,  124), mesh: parts['Wheel R 1 N001'] },
      { name: 'Wheel L 0 N002', parent: -1, m: ROOT_M( 128, 52,  124), mesh: parts['Wheel L 1 N001'] },
      { name: 'Test',           parent: -1, m: ROOT_M(0, 68, 0), mesh: parts.Test },
      { name: 'Lovegtorony',    parent:  4, m: ID_M(0, -18, 126), mesh: parts.Lovegtorony },
      { name: 'Zaszlorud',      parent:  4, m: ID_M(84, -148, 114), mesh: parts.Zaszlorud },
      { name: '_glow0piros',    parent:  4, m: ID_M(-82, -208, 27, 0.30, -1, 0.30), helper: true },
      { name: '_glow1piros',    parent:  4, m: ID_M( 82, -208, 27, -0.30, -1, 0.30), helper: true },
      { name: '_glow2feher',    parent:  4, m: ID_M(-82, 224, 26, 0.28, 1, 0.28), helper: true },
      { name: '_glow3feher',    parent:  4, m: ID_M( 82, 224, 26, -0.28, 1, 0.28), helper: true },
    ],
  };
}

const summary = buildUnitPackage({
  modelName: MODEL,
  race: 'rabbit',
  anifFrom: 'ny_dzsip',
  outDir: OUT,
  buildGeometry: buildUshastikGeometry,
  buildAtlas: buildUshastikAtlas,
});
for (const s of summary) console.log(`${MODEL}_${s.level.padEnd(7)}  V=${String(s.verts).padStart(4)}  F=${String(s.faces).padStart(4)}  .4d=${s.size4d}B  .dxt=${s.sizeDxt}B`);

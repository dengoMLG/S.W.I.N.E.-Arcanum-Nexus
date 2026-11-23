#!/usr/bin/env node
// Юнит #7 (Кролики): «Морковный Смерч» (ny_morkovsmerch) — Лёгкая тачанка-РСЗО.
//
// Силуэт: быстрый 4-колёсный джип Кроликов (синеступичные колёса Wheel L/R, заячья решётка,
// наклонное бронестекло, морковка и римский номер XII) с ГРОМОЗДКОЙ ПОВОРОТНОЙ 6-СТВОЛЬНОЙ
// ПУСКОВОЙ УСТАНОВКОЙ НА КРЫШЕ (Lovegtorony + Cso), из труб которой торчат 6 ЯРКО-ОРАНЖЕВЫХ
// МОРКОВНЫХ РАКЕТ С ЗЕЛЁНЫМИ СТАБИЛИЗАТОРАМИ!
//
// Совместимость Gepard: Wheel R/L 0 N002, Wheel R/L 1 N001, Test, Lovegtorony, Cso, _Torkolattuz, Zaszlorud, _glow0..3.
'use strict';
const path = require('path');
const {
  clamp, uvRect,
  Mesh, buildWheelMesh, Canvas, loadGameAssets, buildUnitPackage,
} = require('../lib/swine-model-kit');

const OUT = path.resolve(process.argv[2] || 'mods-test/units/ny_morkovsmerch');

const UV = {
  bodySide:   [0.01, 0.01, 0.46, 0.25], // Борт джипа + XII + оригинальная морковка
  bodyTop:    [0.01, 0.27, 0.31, 0.48], // Капот/крыша + морковка / звезда Vet/Elite
  window:     [0.33, 0.27, 0.47, 0.48], // Лобовое стекло Кроликов
  grille:     [0.01, 0.50, 0.24, 0.67], // Заячья решётка
  ribbed:     [0.26, 0.50, 0.48, 0.67], // Ребристый хром
  rackSide:   [0.01, 0.69, 0.46, 0.85], // Борт пусковой коробки РСЗО + полосы Vet/Elite + жёлто-чёрный кант!
  carrotTip:  [0.01, 0.87, 0.46, 0.99], // МОРКОВНЫЕ РАКЕТЫ (оранжевые боеголовки + зелёная ботва-стабилизаторы!)
  tireRim:    [0.50, 0.01, 0.72, 0.23],
  tireTread:  [0.74, 0.01, 0.88, 0.34],
  tubeMetal:  [0.50, 0.36, 0.99, 0.52], // Тёмные пусковые трубы РСЗО
  metal:      [0.50, 0.54, 0.74, 0.76],
  chrome:     [0.76, 0.54, 0.99, 0.76],
  lights:     [0.50, 0.78, 0.72, 0.98],
  taillight:  [0.74, 0.78, 0.99, 0.98],
};

function buildMorkovSmerchAtlas(level) {
  const cv = new Canvas(1024);
  const ga = loadGameAssets(), R = ga.rects;
  const isVet = level === 'veteran', isElite = level === 'elite';
  const dmgSet = isElite ? ga.eliteDamages : ga.vetDamages;
  const stampDmg = (idx, dx0, dy0, dx1, dy1, rot = 0) => {
    const p = dmgSet[idx % dmgSet.length];
    cv.blitPatch(p, { x: 0, y: 0, w: p.W, h: p.H }, dx0, dy0, dx1, dy1, { useSrcAlphaAsOpacity: true, setTeamMask: 0, rotate: rot, opacity: isElite ? 0.92 : 0.82 });
  };

  cv.fillArmorBaseFromGame('rabbit', 1.02);

  // BODY SIDE
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.bodySide);
    cv.panelFrame(x0, y0, x1, y1, 4, 32);
    const Wp = x1 - x0, Hp = y1 - y0;
    if (isVet || isElite) {
      cv.fillRect(x0 + 8, y1 - 36, x1 - 8, y1 - 20, [0.06, 0.06, 0.07], 1, 0);
      cv.fillRect(x0 + 8, y1 - 33, x1 - 8, y1 - 23, [0.95, 0.96, 0.97], 1, 0);
    }
    cv.drawGlyph('X', x0 + Wp * 0.22, y0 + Hp * 0.44, Hp * 0.44, [0.96, 0.97, 0.98]);
    cv.drawGlyph('I', x0 + Wp * 0.34, y0 + Hp * 0.44, Hp * 0.44, [0.96, 0.97, 0.98]);
    cv.drawGlyph('I', x0 + Wp * 0.43, y0 + Hp * 0.44, Hp * 0.44, [0.96, 0.97, 0.98]);
    cv.blitPatch(R.rabbitCarrotH.img, R.rabbitCarrotH, x0 + Wp * 0.56, y0 + Hp * 0.16, x0 + Wp * 0.84, y0 + Hp * 0.72, { cutoutByInvAlpha: true, setTeamMask: 0 });
    if (isVet || isElite) stampDmg(1, x0 + 20, y0 + 22, x0 + 160, y0 + 125);
  }

  // BODY TOP
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.bodyTop);
    cv.panelFrame(x0, y0, x1, y1, 4, 28);
    const cx = (x0 + x1) * 0.5, cy = (y0 + y1) * 0.5;
    if (isVet || isElite) cv.blitPatch(R.rabbitStar.img, R.rabbitStar, cx - 54, cy - 52, cx + 54, cy + 52, { cutoutByInvAlpha: true, setTeamMask: 0 });
    else cv.blitPatch(R.rabbitCarrot.img, R.rabbitCarrot, cx - 32, cy - 60, cx + 32, cy + 60, { cutoutByInvAlpha: true, setTeamMask: 0 });
  }

  // RACK SIDE — борт короба РСЗО + оригинальная предупреждающая полоса + белые полосы Vet/Elite!
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.rackSide);
    cv.panelFrame(x0, y0, x1, y1, 4, 28);
    const Wp = x1 - x0, Hp = y1 - y0;
    cv.blitPatch(R.hazardStrip.img, R.hazardStrip, x0 + 10, y1 - 34, x1 - 10, y1 - 10, { setTeamMask: 0 });
    if (isVet || isElite) {
      const nS = isElite ? 4 : 2;
      for (let s = 0; s < nS; s++) {
        const sx = x0 + 48 + s * 34;
        cv.fillRect(sx - 2, y0 + 14, sx + 16, y1 - 42, [0.06, 0.06, 0.07], 1, 0);
        cv.fillRect(sx, y0 + 16, sx + 14, y1 - 44, [0.96, 0.97, 0.98], 1, 0);
      }
      if (isElite) cv.blitPatch(R.rabbitStar.img, R.rabbitStar, x1 - 118, y0 + 16, x1 - 36, y1 - 40, { cutoutByInvAlpha: true, setTeamMask: 0 });
      stampDmg(0, x0 + Wp * 0.36, y0 + 16, x0 + Wp * 0.68, y1 - 36);
    }
  }

  // CARROT TIP — оранжевая «морковная» ракета с зелёными хвостовыми перьями! (V=0 хвост-ботва, V=1 оранжевый нос, alpha = 0!)
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.carrotTip);
    const Ht = y1 - y0;
    const gEnd = Math.floor(y0 + Ht * 0.28);
    cv.fillRect(x0, y0, x1, gEnd, [0.16, 0.66, 0.16], 1, 0);
    cv.fillRect(x0, gEnd, x1, y1, [0.94, 0.44, 0.04], 1, 0);
    // Горизонтальные насечки морковки для реализма
    for (let ly = gEnd + 16; ly < y1 - 10; ly += 20) cv.drawLine(x0, ly, x1, ly, 2.5, [0.58, 0.22, 0.02], 0.75, 0);
  }

  { const [x0, y0, x1, y1] = cv.regPx(UV.window);    cv.blitPatch(R.rabbitWindow.img, R.rabbitWindow, x0, y0, x1, y1, { setTeamMask: 0, rotate: 90 }); }
  { const [x0, y0, x1, y1] = cv.regPx(UV.grille);    cv.blitPatch(R.rabbitGrille.img, R.rabbitGrille, x0, y0, x1, y1, { setTeamMask: 0 }); }
  { const [x0, y0, x1, y1] = cv.regPx(UV.ribbed);    cv.blitPatch(R.rabbitRibbed.img, R.rabbitRibbed, x0, y0, x1, y1, { setTeamMask: 0 }); }
  { const [x0, y0, x1, y1] = cv.regPx(UV.tireRim);   cv.blitPatch(R.rabbitTireRim.img, R.rabbitTireRim, x0, y0, x1, y1, { setTeamMask: 0 }); }
  { const [x0, y0, x1, y1] = cv.regPx(UV.tireTread); cv.blitPatch(R.rabbitTireTrd.img, R.rabbitTireTrd, x0, y0, x1, y1, { setTeamMask: 0 }); }
  { const [x0, y0, x1, y1] = cv.regPx(UV.tubeMetal); cv.blitPatch(R.mantletMetal.img, R.mantletMetal, x0, y0, x1, y1, { setTeamMask: 0, rotate: 90, gain: 0.52 }); }
  { const [x0, y0, x1, y1] = cv.regPx(UV.metal);     cv.blitPatch(R.mantletMetal.img, R.mantletMetal, x0, y0, x1, y1, { setTeamMask: 0, gain: 0.62 }); }
  { const [x0, y0, x1, y1] = cv.regPx(UV.chrome);    cv.blitPatch(R.chromeMetal.img, R.chromeMetal, x0, y0, x1, y1, { setTeamMask: 0, rotate: 90, gain: 1.35 }); }
  { const [x0, y0, x1, y1] = cv.regPx(UV.lights);    cv.blitPatch(R.headlight.img, R.headlight, x0, y0, x1, y1, { setTeamMask: 0 }); }
  { const [x0, y0, x1, y1] = cv.regPx(UV.taillight); cv.blitPatch(R.taillight.img, R.taillight, x0, y0, x1, y1, { setTeamMask: 0, rotate: 90 }); }

  return cv.downsample2x();
}

function buildMorkovSmerchGeometry() {
  const parts = {};
  const GREEN_FIN_UV = [UV.carrotTip[0], UV.carrotTip[1], UV.carrotTip[2], UV.carrotTip[1] + (UV.carrotTip[3] - UV.carrotTip[1]) * 0.24];

  for (const wn of ['Wheel R 0 N002', 'Wheel L 0 N002', 'Wheel R 1 N001', 'Wheel L 1 N001']) {
    const w = new Mesh();
    buildWheelMesh(w, 28, 52, 14, UV.tireTread, UV.tireRim);
    parts[wn] = w;
  }

  // TEST — быстрый лёгкий джип-тачанка Кроликов с решёткой, лобовым бронестеклом и платформой под РСЗО
  {
    const m = new Mesh();
    const prof = [[-194, -22, 102], [186, -22, 98], [216, 4, 88], [128, 42, 96], [-194, 42, 104]];
    m.addPrismX(prof, 100, UV.bodySide, UV.bodyTop, {
      edgeRegs: [UV.metal, UV.grille, UV.bodyTop, UV.bodyTop, UV.ribbed],
    });
    for (const sx of [-1, 1]) {
      const x0 = sx > 0 ? 96 : -144, x1 = sx > 0 ? 144 : -96;
      m.addBox(x0, x1, -92, 86, -8, 30, { top: UV.bodyTop, bot: UV.metal, front: UV.bodyTop, back: UV.bodyTop, left: UV.bodySide, right: UV.bodySide });
      m.addBox(sx > 0 ? 84 : -126, sx > 0 ? 126 : -84, 114, 134, -26, -10, { all: UV.metal });
      m.addBox(sx > 0 ? 84 : -126, sx > 0 ? 126 : -84, -134, -114, -26, -10, { all: UV.metal });
      m.addLatheY(sx * 82, 22, [[180, 10], [198, 15], [208, 14]], 10, UV.chrome, { smooth: true, capStart: true, capEnd: true, capReg: UV.lights });
      m.addBox(sx * 80 - 13, sx * 80 + 13, -200, -186, 10, 26, { all: UV.metal, back: UV.taillight });
    }
    // Хромированный бампер Кроликов спереди
    m.addTube([[-86, 198, -4], [-70, 226, 2], [70, 226, 2], [86, 198, -4]], 8, 7, UV.chrome, { capStart: true, capEnd: true });
    // Бронированная передняя кабина джипа с наклонным бронестеклом
    m.addFrustum([-88, 88, 22, 134], [-74, 74, 34, 104], 38, 96, {
      top: UV.bodyTop, bot: UV.metal, front: UV.window, back: UV.ribbed, left: UV.bodySide, right: UV.bodySide,
    });
    // Выхлопные трубы сзади
    for (const sx of [-1, 1]) {
      m.addTube([[sx * 64, -162, 12], [sx * 72, -208, 18]], [7, 8.5], 7, UV.chrome, { capStart: true, capEnd: true });
    }
    parts.Test = m;
  }

  // LOVEGTORONY — поворотный постамент + массивная 6-ствольная ракетная кассета РСЗО с ОРАНЖЕВЫМИ МОРКОВНЫМИ РАКЕТАМИ!
  {
    const m = new Mesh();
    // Поворотная тумба + гидравлические стойки
    m.addLatheZ(0, 0, [[-18, 58, 58], [16, 48, 48]], 10, UV.metal, { smooth: true, capStart: true, capEnd: true });
    for (const sx of [-62, 62]) m.addBox(sx - 10, sx + 10, -28, 22, 8, 56, { all: UV.metal });
    parts.Lovegtorony = m;
  }

  // CSO — 6-ствольный блок РСЗО (наклон +22° вверх!) с торчащими оранжевыми морковками и зелёной ботвой сзади!
  {
    const m = new Mesh();
    const tilt = 0.36; // ~21° вверх!
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    const xf = (x, y, z) => [x, y * ct - z * st, y * st + z * ct];

    // Наклонённый внешний бронекороб пусковой (левая/правая боковины с полосами Vet/Elite и предупреждающей лентой!)
    const boxP = (x0, x1, y0, y1, z0, z1) => {
      const B0 = xf(x0, y0, z0), B1 = xf(x1, y0, z0), B2 = xf(x1, y1, z0), B3 = xf(x0, y1, z0);
      const T0 = xf(x0, y0, z1), T1 = xf(x1, y0, z1), T2 = xf(x1, y1, z1), T3 = xf(x0, y1, z1);
      m.addQuad(T0, T1, T2, T3, UV.rackSide);
      m.addQuad(B3, B2, B1, B0, UV.metal);
      m.addQuad(B0, B1, T1, T0, UV.metal);
      m.addQuad(B2, B3, T3, T2, UV.metal);
      m.addQuad(B3, B0, T0, T3, UV.rackSide, [0, 1], [1, 1], [1, 0], [0, 0]);
      m.addQuad(B1, B2, T2, T1, UV.rackSide, [0, 1], [1, 1], [1, 0], [0, 0]);
    };
    boxP(-94, 94, -108, 86, -34, 46);

    // 6 пусковых труб (3 в нижнем ряду, 3 в верхнем) + 6 ОРАНЖЕВЫХ МОРКОВНЫХ РАКЕТ, торчащих из стволов!
    for (const row of [-10, 22]) {
      for (const cx of [-56, 0, 56]) {
        // Пусковая труба
        const tRings = [[-116, 17], [96, 17]].map(([yy, rr]) =>
          Array.from({ length: 8 }, (_, i) => { const a = 2 * Math.PI * i / 8; return xf(cx + rr * Math.cos(a), yy, row + rr * Math.sin(a)); })
        );
        m.addLoft(tRings, UV.tubeMetal, { smooth: true, capStart: true, capEnd: true });
        // Оранжевая боеголовка «морковки», выступающая вперёд из трубы!
        const cRings = [[84, 14], [108, 13], [134, 7], [150, 1.5]].map(([yy, rr]) =>
          Array.from({ length: 8 }, (_, i) => { const a = 2 * Math.PI * i / 8; return xf(cx + rr * Math.cos(a), yy, row + rr * Math.sin(a)); })
        );
        m.addLoft(cRings, UV.carrotTip, { smooth: true, capStart: true, capEnd: true, vStart: 0.35, vEnd: 0.98 });
        // Зелёные перья «ботвы»-стабилизаторы сзади трубы!
        const fRings = [[-134, 13], [-112, 10]].map(([yy, rr]) =>
          Array.from({ length: 6 }, (_, i) => { const a = 2 * Math.PI * i / 6; return xf(cx + rr * Math.cos(a), yy, row + rr * Math.sin(a)); })
        );
        m.addLoft(fRings, GREEN_FIN_UV, { smooth: false, capStart: true, capEnd: true });
      }
    }
    parts.Cso = m;
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
      { name: 'Wheel R 1 N001', parent: -1, m: ROOT_M(-124, 52, -124), mesh: parts['Wheel R 0 N002'] },
      { name: 'Wheel L 1 N001', parent: -1, m: ROOT_M( 124, 52, -124), mesh: parts['Wheel L 0 N002'] },
      { name: 'Wheel R 0 N002', parent: -1, m: ROOT_M(-124, 52,  124), mesh: parts['Wheel R 1 N001'] },
      { name: 'Wheel L 0 N002', parent: -1, m: ROOT_M( 124, 52,  124), mesh: parts['Wheel L 1 N001'] },
      { name: 'Test',           parent: -1, m: ROOT_M(0, 68, 0), mesh: parts.Test },
      { name: 'Lovegtorony',    parent:  4, m: ID_M(0, -64, 56), mesh: parts.Lovegtorony },
      { name: 'Cso',            parent:  5, m: ID_M(0, 8, 62), mesh: parts.Cso },
      { name: '_Torkolattuz',   parent:  6, m: ID_M(0, 152, 56), helper: true },
      { name: 'Zaszlorud',      parent:  4, m: ID_M(68, 44, 92), mesh: parts.Zaszlorud },
      { name: '_glow0piros',    parent:  4, m: ID_M(-80, -202, 18, 0.28, -1, 0.28), helper: true },
      { name: '_glow1piros',    parent:  4, m: ID_M( 80, -202, 18, -0.28, -1, 0.28), helper: true },
      { name: '_glow2feher',    parent:  4, m: ID_M(-82, 212, 22, 0.24, 1, 0.24), helper: true },
      { name: '_glow3feher',    parent:  4, m: ID_M( 82, 212, 22, -0.24, 1, 0.24), helper: true },
    ],
  };
}

const summary = buildUnitPackage({
  modelName: 'ny_morkovsmerch',
  race: 'rabbit',
  anifFrom: 'ny_raketas',
  outDir: OUT,
  buildGeometry: buildMorkovSmerchGeometry,
  buildAtlas: buildMorkovSmerchAtlas,
});
for (const s of summary) console.log(`ny_morkovsmerch_${s.level.padEnd(7)}  V=${String(s.verts).padStart(4)}  F=${String(s.faces).padStart(4)}  .4d=${s.size4d}B  .dxt=${s.sizeDxt}B`);

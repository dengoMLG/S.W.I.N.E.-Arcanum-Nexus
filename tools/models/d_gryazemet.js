#!/usr/bin/env node
// Юнит #5 (Свиньи): «Гряземёт» (d_gryazemet) — Бронированный гусеничный шламовоз-ассенизатор.
//
// Силуэт (кардинально отличается от танка «Хряк-Гриль»!):
//  - спереди — бронированная угловатая КАБИНА-ТРАКТОР с решётчатым лобовым стеклом,
//    двумя высокими вертикальными дымовыми трубами и широким ГРЯЗЕВЫМ ОТВАЛОМ-КОВШОМ на носу;
//  - всю кормовую половину занимает ГИГАНТСКАЯ ПРОДОЛЬНАЯ БОЧКА-ЦИСТЕРНА С ГРЯЗЬЮ/ШЛАМОМ
//    (болотно-охристая проржавевшая сталь в густых бурых потёках, с 3 обручами, задним люком-клапаном
//    и заливной горловиной, из которой переливается густая грязь!);
//  - СВЕРХУ НА ЦИСТЕРНЕ установлена поворотная насосная турель (Lovegtorony) с высоко поднятой
//    ГРОМАДНОЙ ПУШКОЙ-РАСТРУБОМ (+22° вверх для навесной стрельбы!) и толстыми шлангами подачи жижи!
//
// Совместимость Gepard: Lanctalp, Test, Lovegtorony, Cso, _Torkolattuz, _kereso, _glow0..3, Chain R/L 001.
'use strict';
const path = require('path');
const {
  clamp, uvRect, fbm, vnoise,
  Mesh, buildTrackLoop, Canvas, loadGameAssets, buildUnitPackage,
} = require('../lib/swine-model-kit');

const OUT = path.resolve(process.argv[2] || 'mods-test/units/d_gryazemet');

const UV = {
  hullTop:    [0.01, 0.01, 0.35, 0.25], // Палуба + крыша кабины + лого Свиней
  cabFront:   [0.37, 0.01, 0.65, 0.25], // Лобовое окно кабины с решёткой + грязевые разводы от дворников
  wheels:     [0.67, 0.01, 0.99, 0.14], // 4 катка Свиней (в густой грязи)
  mudPlow:    [0.67, 0.16, 0.99, 0.31], // Широкий передний грязевой отвал-ковш (сталь + жёлто-чёрная полоса + комья грязи)
  hullSkirt:  [0.01, 0.27, 0.48, 0.44], // Бортовые экраны + шевроны Vet/Elite + обильные брызги грязи снизу
  cabSide:    [0.50, 0.33, 0.99, 0.52], // Борт кабины + чёткий номер «04» + брызги грязи + сколы Vet/Elite
  sludgeTank: [0.01, 0.46, 0.48, 0.72], // ГИГАНТСКАЯ ПРОДОЛЬНАЯ ЦИСТЕРНА: болотно-охристый металл + густые потёки грязи + полосы опасности!
  tankEnd:    [0.50, 0.54, 0.74, 0.76], // Задний торец цистерны (манометр, вентиль, потёки жижи, логотип Свиней)
  turretSide: [0.76, 0.54, 0.99, 0.76], // Верхняя насосная турель (командный цвет + лючки)
  mudGun:     [0.01, 0.74, 0.48, 0.87], // Грязевая пушка-раструб (полосы Vet/Elite + заляпанный буро-зелёной жижей колокол!)
  mudOoze:    [0.01, 0.89, 0.34, 0.99], // Густая блестящая буро-болотная грязь (в горловине, в ковше, внутри раструба)
  fenderTop:  [0.36, 0.89, 0.52, 0.99], // Рифлёные полки в грязи
  metal:      [0.54, 0.78, 0.74, 0.98], // Тёмный чугун / шланги / рама
  chrome:     [0.76, 0.78, 0.99, 0.88], // Хром / дымовые трубы / гидроцилиндры
  lights:     [0.76, 0.90, 0.87, 0.99], // Фары
  taillight:  [0.89, 0.90, 0.99, 0.99], // Задние фонари
};

// Реалистичные густые брызги и потёки буро-болотной грязи (alpha = 0, не перекрашиваются цветом команды!)
function splatterMud(cv, x0, y0, x1, y1, amount, seed, drip = false) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const n = fbm(x * 0.042, y * (drip ? 0.018 : 0.042), 3, seed);
    const n2 = vnoise(x * 0.14, y * (drip ? 0.035 : 0.10), seed + 31);
    const v = n * 0.68 + n2 * 0.32;
    if (v > 1 - amount) {
      const m = clamp((v - (1 - amount)) / amount, 0, 1);
      // Глубокий шоколадно-болотный цвет с лёгким оливковым оттенком мокрой жижи
      const r = 0.25 * (0.65 + 0.55 * m);
      const g = 0.19 * (0.65 + 0.55 * m);
      const b = 0.08 * (0.65 + 0.55 * m);
      cv.blendPx(x, y, [r, g, b], 0.92, 0);
    }
  }
}

function buildGryazemetAtlas(level) {
  const cv = new Canvas(1024);
  const ga = loadGameAssets(), R = ga.rects;
  const isVet = level === 'veteran', isElite = level === 'elite';
  const dmgSet = isElite ? ga.eliteDamages : ga.vetDamages;
  const stampDmg = (idx, dx0, dy0, dx1, dy1, rot = 0) => {
    const p = dmgSet[idx % dmgSet.length];
    cv.blitPatch(p, { x: 0, y: 0, w: p.W, h: p.H }, dx0, dy0, dx1, dy1, {
      useSrcAlphaAsOpacity: true, setTeamMask: 0, rotate: rot, opacity: isElite ? 0.95 : 0.88,
    });
  };

  // Базовая крашеная броня Свиней (alpha = 1 -> динамический цвет команды!)
  cv.fillArmorBaseFromGame('pig', 1.06);

  // 1) HULL TOP / CAB ROOF — крыша кабины с оригинальным логотипом Свиней + заклёпки + брызги грязи
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.hullTop);
    cv.panelFrame(x0, y0, x1, y1, 5, 28);
    const cx = (x0 + x1) * 0.5, cy = (y0 + y1) * 0.5;
    cv.panelFrame(cx - 56, cy + 16, cx + 56, y1 - 18, 3, 22);
    cv.blitPatch(R.pigLogo.img, R.pigLogo, cx - 50, y0 + 18, cx + 50, y0 + 86, { cutoutByInvAlpha: true, setTeamMask: 0 });
    splatterMud(cv, x0 + 8, y0 + 8, x1 - 8, y1 - 8, 0.20, 901);
    if (isVet || isElite) stampDmg(0, x0 + 16, y0 + 88, x0 + 148, y1 - 16);
  }

  // 2) CAB FRONT — лобовое стекло тракторной кабины с тяжёлыми защитными прутьями и грязью по углам!
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.cabFront);
    cv.panelFrame(x0, y0, x1, y1, 5, 26);
    const Wp = x1 - x0, Hp = y1 - y0;
    // Двойное бронированное лобовое окно (оригинальное стекло + тёмная стальная рама!)
    for (const [fx0, fx1] of [[0.10, 0.46], [0.54, 0.90]]) {
      const wx0 = x0 + Wp * fx0, wx1 = x0 + Wp * fx1;
      const wy0 = y0 + Hp * 0.18, wy1 = y0 + Hp * 0.64;
      cv.fillRect(wx0 - 6, wy0 - 6, wx1 + 6, wy1 + 6, [0.12, 0.14, 0.16], 1, 0);
      cv.blitPatch(R.pigWindow.img, R.pigWindow, wx0, wy0, wx1, wy1, { setTeamMask: 0, gain: 0.95 });
      // Защитные горизонтальные решётки поверх стекла
      for (const f of [0.35, 0.65]) {
        const gy = wy0 + (wy1 - wy0) * f;
        cv.drawLine(wx0 - 4, gy, wx1 + 4, gy, 4.5, [0.10, 0.11, 0.12], 0.95, 0);
      }
    }
    // Решётка радиатора внизу кабины + густые брызги грязи!
    cv.blitPatch(R.pigLouvers.img, R.pigLouvers, x0 + Wp * 0.16, y0 + Hp * 0.72, x0 + Wp * 0.84, y1 - 12, { setTeamMask: 0 });
    splatterMud(cv, x0 + 4, Math.floor(y0 + Hp * 0.56), x1 - 4, y1 - 4, 0.45, 909);
  }

  // 3) WHEELS — 4 катка Свиней, щедро забрызганные бурой грязью
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.wheels);
    cv.blitPatch(R.pigWheels.img, R.pigWheels, x0, y0, x1, y1, { setTeamMask: 0 });
    splatterMud(cv, x0, y0, x1, y1, 0.38, 953);
  }

  // 4) MUD PLOW — широкий передний грязевой отвал-ковш (жёлто-чёрная полоса сверху, обшарпанная сталь + толстая грязь!)
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.mudPlow);
    const Hp = y1 - y0;
    cv.blitPatch(R.mantletMetal.img, R.mantletMetal, x0, y0, x1, y1, { setTeamMask: 0, gain: 0.78 });
    cv.blitPatch(R.hazardStrip.img, R.hazardStrip, x0, y0, x1, y0 + Hp * 0.30, { setTeamMask: 0, gain: 0.95 });
    cv.drawLine(x0, y0 + Hp * 0.30, x1, y0 + Hp * 0.30, 4, [0.05, 0.05, 0.06], 0.95, 0);
    // Толстый комьями слой мокрой грязи на всей рабочей поверхности ковша!
    splatterMud(cv, x0, Math.floor(y0 + Hp * 0.26), x1, y1, 0.72, 961, true);
  }

  // 5) HULL SKIRT — бортовые экраны + шевроны Vet/Elite + грязь снизу
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.hullSkirt);
    cv.panelFrame(x0, y0, x1, y1, 4, 34);
    const Wp = x1 - x0, Hp = y1 - y0;
    for (const f of [0.25, 0.50, 0.75]) cv.drawLine(x0 + Wp * f, y0 + 6, x0 + Wp * f, y1 - 6, 2.5, [0.06, 0.08, 0.10], 0.78);
    splatterMud(cv, x0 + 4, Math.floor(y0 + Hp * 0.48), x1 - 4, y1 - 4, 0.50, 919);
    cv.fillCircle(x1 - 40, y1 - 28, 9, [0.08, 0.08, 0.08], 1, 0);
    cv.fillCircle(x1 - 40, y1 - 28, 6.5, [0.94, 0.58, 0.06], 1, 0);
    if (isVet) {
      cv.blitPatch(R.vetChevrons.img, R.vetChevrons, x0 + Wp * 0.34, y0 + Hp * 0.12, x0 + Wp * 0.62, y0 + Hp * 0.80, { cutoutByInvAlpha: true, setTeamMask: 0, rotate: 90 });
      stampDmg(1, x0 + Wp * 0.58, y0 + 14, x0 + Wp * 0.86, y1 - 12);
    } else if (isElite) {
      cv.blitPatch(R.eliteChevrons.img, R.eliteChevrons, x0 + Wp * 0.22, y0 + Hp * 0.12, x0 + Wp * 0.74, y0 + Hp * 0.80, { cutoutByInvAlpha: true, setTeamMask: 0, rotate: 90 });
      stampDmg(0, x0 + Wp * 0.10, y0 + 14, x0 + Wp * 0.40, y1 - 10);
      stampDmg(3, x0 + Wp * 0.64, y0 + 14, x0 + Wp * 0.92, y1 - 10);
    }
  }

  // 6) CAB SIDE — борт тракторной кабины + боковое окошко + чёткий номер «04» + брызги грязи
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.cabSide);
    cv.panelFrame(x0, y0, x1, y1, 5, 30);
    const Wp = x1 - x0, Hp = y1 - y0;
    // Боковое бронированное оконце спереди-сверху кабины
    cv.fillRect(x0 + Wp * 0.62, y0 + Hp * 0.14, x0 + Wp * 0.88, y0 + Hp * 0.46, [0.12, 0.14, 0.16], 1, 0);
    cv.blitPatch(R.pigWindow.img, R.pigWindow, x0 + Wp * 0.64, y0 + Hp * 0.17, x0 + Wp * 0.86, y0 + Hp * 0.43, { setTeamMask: 0, gain: 0.95 });
    // Чёткий белый номер «04»
    cv.drawGlyph('0', x0 + Wp * 0.25, y0 + Hp * 0.54, Hp * 0.50, [0.94, 0.95, 0.96]);
    cv.drawGlyph('4', x0 + Wp * 0.44, y0 + Hp * 0.54, Hp * 0.50, [0.94, 0.95, 0.96]);
    splatterMud(cv, x0 + 6, Math.floor(y0 + Hp * 0.68), x1 - 6, y1 - 6, 0.42, 929);
    if (isVet) {
      stampDmg(1, x0 + Wp * 0.54, y0 + Hp * 0.48, x0 + Wp * 0.88, y1 - 12);
    } else if (isElite) {
      stampDmg(0, x0 + Wp * 0.56, y0 + Hp * 0.48, x0 + Wp * 0.92, y1 - 8);
      stampDmg(3, x0 + Wp * 0.04, y0 + Hp * 0.06, x0 + Wp * 0.24, y0 + Hp * 0.34);
    }
  }

  // 7) SLUDGE TANK — ГИГАНТСКАЯ ПРОДОЛЬНАЯ ЦИСТЕРНА С ГРЯЗЬЮ (охристо-болотный промышленный бак,
  //    НЕ красный как у Хряк-Гриля! С жёлто-чёрными полосами, толстыми обручами, потёками жижи и знаком «грязь»!)
  //    Развёртка addLatheY: U = окружность (0..1), V = длина вдоль Y (0 = корма, 1 = перед к кабине)
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.sludgeTank);
    const Wt = x1 - x0, Ht = y1 - y0;
    // Выразительный промышленный охристо-болотный цвет ржавой цистерны ассенизатора (alpha = 0!)
    cv.blitPatch(R.chromeMetal.img, R.chromeMetal, x0, y0, x1, y1, {
      setTeamMask: 0, rotate: 90, tint: [0.76, 0.66, 0.36], gain: 0.96,
    });
    // Вертикальные полосы потёков густой шоколадно-болотной жижи, стекающей сверху цистерны!
    splatterMud(cv, x0, y0, x1, y1, 0.54, 941, true);
    // Жёлто-чёрные полосы опасности на переднем и заднем краю цистерны
    for (const [f0, f1] of [[0.06, 0.14], [0.86, 0.94]]) {
      const py0 = Math.floor(y0 + Ht * f0), py1 = Math.ceil(y0 + Ht * f1);
      cv.blitPatch(R.hazardStrip.img, R.hazardStrip, x0, py0, x0 + Wt * 0.5, py1, { setTeamMask: 0, gain: 0.95 });
      cv.blitPatch(R.hazardStrip.img, R.hazardStrip, x0 + Wt * 0.5, py0, x1, py1, { setTeamMask: 0, gain: 0.95 });
      cv.drawLine(x0, py0, x1, py0, 3, [0.05, 0.05, 0.06], 0.95, 0);
      cv.drawLine(x0, py1, x1, py1, 3, [0.05, 0.05, 0.06], 0.95, 0);
    }
    // Три чётких стальных обруча-стяжки (на Elite — золотисто-бронзовые!)
    for (const fc of [0.24, 0.50, 0.76]) {
      const py = y0 + Ht * fc;
      cv.fillRect(x0, py - 6, x1, py + 6, [0.05, 0.05, 0.06], 0.95, 0);
      cv.fillRect(x0, py - 3.5, x1, py + 3.5, isElite ? [0.76, 0.58, 0.16] : [0.28, 0.30, 0.32], 1, 0);
      for (let rx = x0 + 16; rx < x1 - 12; rx += 28) cv.rivet(rx, py, 2.0);
    }
    // Чёткие промышленные ромбы «ОПАСНО / ШЛАМ» по обоим бортам цистерны (скомпенсированы под пропорцию U/V!)
    for (const fu of [0.08, 0.50]) {
      const cx = x0 + Wt * fu, cy = y0 + Ht * 0.37;
      const rx = 26, ry = 18;
      const dia = s => [[cx, cy - ry * s], [cx + rx * s, cy], [cx, cy + ry * s], [cx - rx * s, cy]];
      cv.fillPoly(dia(1.08), [0.05, 0.05, 0.06], 1, 0);
      cv.fillPoly(dia(0.92), [0.94, 0.76, 0.08], 1, 0);
      cv.fillPoly(dia(0.74), [0.05, 0.05, 0.06], 1, 0);
      cv.fillPoly(dia(0.66), [0.44, 0.54, 0.14], 1, 0); // болотно-зелёный ромб!
      cv.fillCircle(cx, cy + 2, 6, [0.22, 0.15, 0.06], 1, 0);
      cv.fillCircle(cx - 6, cy - 4, 3.2, [0.22, 0.15, 0.06], 1, 0);
      cv.fillCircle(cx + 6, cy - 3, 2.8, [0.22, 0.15, 0.06], 1, 0);
    }
    if (isVet || isElite) {
      stampDmg(2, x0 + Wt * 0.16, y0 + Ht * 0.54, x0 + Wt * 0.38, y0 + Ht * 0.84);
      if (isElite) stampDmg(1, x0 + Wt * 0.58, y0 + Ht * 0.18, x0 + Wt * 0.84, y0 + Ht * 0.48);
    }
  }

  // 8) TANK END — задний круглый торец цистерны (манометр + логотип Свиней + потёки грязи!)
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.tankEnd);
    const cx = (x0 + x1) * 0.5, cy = (y0 + y1) * 0.5;
    cv.blitPatch(R.chromeMetal.img, R.chromeMetal, x0, y0, x1, y1, { setTeamMask: 0, tint: [0.70, 0.60, 0.34], gain: 0.92 });
    splatterMud(cv, x0, y0, x1, y1, 0.44, 969, true);
    // Круглый белый манометр с красной стрелкой в верхней части торца
    cv.fillCircle(cx, cy - 32, 26, [0.08, 0.08, 0.09], 1, 0);
    cv.fillCircle(cx, cy - 32, 21, [0.92, 0.90, 0.82], 1, 0);
    cv.drawLine(cx, cy - 32, cx + 14, cy - 42, 3.5, [0.88, 0.12, 0.08], 1, 0);
    cv.blitPatch(R.pigLogo.img, R.pigLogo, cx - 36, cy + 8, cx + 36, cy + 62, { cutoutByInvAlpha: true, setTeamMask: 0 });
  }

  // 9) TURRET SIDE — верхняя поворотная турель-насос (командный цвет + заклёпки + брызги грязи!)
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.turretSide);
    cv.panelFrame(x0, y0, x1, y1, 4, 24);
    const cx = (x0 + x1) * 0.5, cy = (y0 + y1) * 0.5;
    cv.blitPatch(R.pigLouvers.img, R.pigLouvers, cx - 38, cy - 28, cx + 38, cy + 28, { setTeamMask: 0 });
    splatterMud(cv, x0 + 6, y0 + 6, x1 - 6, y1 - 6, 0.25, 973);
    if (isVet || isElite) stampDmg(1, x0 + 18, y0 + 18, x1 - 18, y1 - 18);
  }

  // 10) MUD GUN — гигантская грязевая пушка-раструб (командный рукав с полосами Vet/Elite + колокол в густой грязи!)
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.mudGun);
    const Hb = y1 - y0;
    const splitY = Math.floor(y0 + Hb * 0.36);
    // Передняя часть и колокол — потёртая болотно-стальная труба в толстом слое бурой и болотно-зелёной грязи!
    cv.blitPatch(R.mantletMetal.img, R.mantletMetal, x0, splitY, x1, y1, { setTeamMask: 0, rotate: 90, tint: [0.85, 0.80, 0.65], gain: 0.78 });
    // Полоса опасности вокруг шейки колокола
    cv.blitPatch(R.hazardStrip.img, R.hazardStrip, x0, Math.floor(y0 + Hb * 0.42), x1, Math.floor(y0 + Hb * 0.54), { setTeamMask: 0, gain: 0.94 });
    // Толстый комковатый слой бурой грязи на всём раструбе-воронке!
    splatterMud(cv, x0, Math.floor(y0 + Hb * 0.54), x1, y1, 0.84, 977, true);
    // Вкрапления вязкой болотно-зелёной тины по самому краю раструба!
    for (let y = Math.floor(y0 + Hb * 0.76); y < y1; y++) for (let x = x0; x < x1; x++) {
      const n = fbm(x * 0.06, y * 0.06, 3, 989);
      if (n > 0.56) cv.blendPx(x, y, [0.34, 0.42, 0.11], 0.85, 0);
    }
    if (isVet || isElite) {
      const nStripes = isElite ? 4 : 2;
      for (let s = 0; s < nStripes; s++) {
        const sy = y0 + Hb * (0.07 + s * 0.068);
        cv.fillRect(x0, sy - 2, x1, sy + 7, [0.05, 0.05, 0.06], 1, 0);
        cv.fillRect(x0, sy, x1, sy + 5, [0.96, 0.80, 0.06], 1, 0);
      }
    }
  }

  // 11) MUD OOZE — густая блестящая буро-болотная жижа (переливающаяся из верхнего люка цистерны и в ковше!)
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.mudOoze);
    cv.fillRect(x0, y0, x1, y1, [0.24, 0.17, 0.07], 1, 0);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const n = fbm(x * 0.05, y * 0.05, 4, 991);
      const col = n > 0.58 ? [0.38, 0.44, 0.12] : n > 0.42 ? [0.28, 0.20, 0.08] : [0.16, 0.11, 0.05];
      cv.blendPx(x, y, col, 1, 0);
    }
  }

  { const [x0, y0, x1, y1] = cv.regPx(UV.fenderTop); cv.blitPatch(R.fenderGrating.img, R.fenderGrating, x0, y0, x1, y1, { setTeamMask: 0 }); splatterMud(cv, x0, y0, x1, y1, 0.35, 997); }
  { const [x0, y0, x1, y1] = cv.regPx(UV.metal);     cv.blitPatch(R.mantletMetal.img, R.mantletMetal, x0, y0, x1, y1, { setTeamMask: 0, gain: 0.56 }); }
  { const [x0, y0, x1, y1] = cv.regPx(UV.chrome);    cv.blitPatch(R.chromeMetal.img, R.chromeMetal, x0, y0, x1, y1, { setTeamMask: 0, rotate: 90, gain: 1.25 }); }
  { const [x0, y0, x1, y1] = cv.regPx(UV.lights);    cv.blitPatch(R.headlight.img, R.headlight, x0, y0, x1, y1, { setTeamMask: 0 }); }
  { const [x0, y0, x1, y1] = cv.regPx(UV.taillight); cv.blitPatch(R.taillight.img, R.taillight, x0, y0, x1, y1, { setTeamMask: 0, rotate: 90 }); }

  return cv.downsample2x();
}

function buildGryazemetGeometry() {
  const parts = {};

  // 1) LANCTALP — гусеничная ходовая Свиней (4 катка в грязи)
  {
    const m = new Mesh();
    const prof = [[-196, -46], [196, -46], [238, -12], [242, 28], [-238, 28], [-234, -12]];
    m.addPrismX(prof, 166, UV.wheels, UV.metal);
    parts.Lanctalp = m;
  }

  // 2) TEST — ГУСЕНИЧНЫЙ ШЛАМОВОЗ:
  //    Платформа + широкий грязевой отвал-ковш спереди + угловатая кабина-трактор спереди +
  //    2 высокие дымовые трубы + ОГРОМНАЯ ПРОДОЛЬНАЯ ЦИСТЕРНА С ГРЯЗЬЮ на всю корму!
  {
    const m = new Mesh();

    // Плоская грузово-тракторная рама корпуса
    const hullProf = [
      [-268, -24, 152],
      [ 238, -24, 152],
      [ 262,   8, 148],
      [ 238,  32, 148],
      [-268,  32, 152],
    ];
    m.addPrismX(hullProf, 150, UV.hullSkirt, UV.fenderTop, {
      edgeRegs: [UV.metal, UV.mudPlow, UV.mudPlow, UV.fenderTop, UV.metal],
    });

    // Надгусеничные полки, трапециевидные бортовые экраны (с шевронами Vet/Elite), фары и фонари
    for (const sx of [-1, 1]) {
      const xIn = sx * 144, xOut = sx * 198;
      const x0 = Math.min(xIn, xOut), x1 = Math.max(xIn, xOut);
      m.addBox(x0, x1, -252, 248, 16, 28, { top: UV.fenderTop, bot: UV.metal, front: UV.metal, back: UV.metal, left: UV.metal, right: UV.metal });
      const sx0 = sx > 0 ? 196 : -206, sx1 = sx > 0 ? 206 : -196;
      m.addFrustum([sx0, sx1, -160, 168], [sx0, sx1, -230, 224], -18, 28, {
        top: UV.fenderTop, bot: UV.metal, front: UV.metal, back: UV.metal,
        left: sx > 0 ? UV.hullSkirt : UV.metal, right: sx < 0 ? UV.hullSkirt : UV.metal,
      });
      const fx = sx * 168;
      m.addBox(fx - 18, fx + 18, 228, 252, 24, 42, { all: UV.metal, front: UV.lights });
      m.addBox(fx - 20, fx + 20, -262, -244, 18, 34, { all: UV.metal, back: UV.taillight });
    }

    // ═══ ШИРОКИЙ ГРЯЗЕВОЙ ОТВАЛ-КОВШ Спереди (вместо клыков Хряк-Гриля!) ═══
    // Вогнутый бульдозерный ковш с толстыми боковыми щёчками и комьями грязи!
    m.addFrustum([-176, 176, 276, 308], [-170, 170, 260, 288], -34, 24, {
      all: UV.metal, front: UV.mudPlow, top: UV.mudPlow,
    });
    // Боковые щёки ковша + силовые балки к раме
    for (const sx of [-1, 1]) {
      const bx0 = sx > 0 ? 168 : -182, bx1 = sx > 0 ? 182 : -168;
      m.addBox(bx0, bx1, 258, 316, -34, 26, { all: UV.mudPlow });
      m.addBox(sx * 100 - 12, sx * 100 + 12, 226, 276, -18, 6, { all: UV.metal });
    }
    // Ком грязи, налипший в центре ковша
    m.addFrustum([-118, 118, 288, 314], [-86, 86, 282, 300], -28, 4, { all: UV.mudOoze });

    // ═══ ПЕРЕДНЯЯ БРОНИРОВАННАЯ КАБИНА-ТРАКТОР (в командном цвете!) ═══
    m.addFrustum([-126, 126, 84, 232], [-108, 108, 92, 198], 30, 134, {
      top: UV.hullTop, bot: UV.metal, front: UV.cabFront, back: UV.metal, left: false, right: false,
    });
    // Боковины кабины отдельно — чтобы «04» читалось прямо на обоих бортах (swine-view --cull 1)!
    m.addQuad([-126, 232, 30], [-126, 84, 30], [-108, 92, 134], [-108, 198, 134], UV.cabSide, [1, 1], [0, 1], [0, 0], [1, 0]);
    m.addQuad([ 126,  84, 30], [ 126, 232, 30], [ 108, 198, 134], [ 108, 92, 134], UV.cabSide, [1, 1], [0, 1], [0, 0], [1, 0]);

    // Козырёк над лобовым стеклом кабины + оранжевый проблесковый маячок на углу крыши (не закрывает лого Свиней!)
    m.addBox(-114, 114, 194, 218, 126, 136, { all: UV.metal });
    m.addLatheZ(74, 174, [[132, 16, 16], [148, 14, 14], [154, 8, 8]], 8, UV.lights, { smooth: true, capStart: true, capEnd: true });

    // Две ВЫСОКИЕ ВЕРТИКАЛЬНЫЕ ДЫМОВЫЕ ТРУБЫ сразу за кабиной (фирменный силуэт дизель-трактора!)
    for (const sx of [-1, 1]) {
      m.addTube([
        [sx * 134, 72, 26],
        [sx * 140, 72, 168],
        [sx * 150, 56, 186],
      ], [11, 10.5, 11.5], 8, UV.chrome, { capStart: true, capEnd: true });
      // Защитный перфорированный кожух на трубе
      m.addLatheZ(sx * 139, 72, [[64, 15, 15], [136, 15, 15]], 8, UV.metal, { smooth: true, capStart: true, capEnd: true });
    }

    // ═══ ГИГАНТСКАЯ ПРОДОЛЬНАЯ ЦИСТЕРНА С ГРЯЗЬЮ/ШЛАМОМ (вдоль всей кормы Y = -256..+66!) ═══
    // Огромный пузатый продольный цилиндр с равномерным шагом колец (ровный UV без растяжки!)
    m.addLatheY(0, 102, [
      [-262, 26],
      [-248, 66],
      [-228, 82],
      [-174, 82],
      [-120, 82],
      [ -66, 82],
      [ -12, 82],
      [  42, 82],
      [  62, 66],
      [  74, 26],
    ], 16, UV.sludgeTank, { smooth: true, capStart: true, capEnd: true, capReg: UV.tankEnd });

    // Массивные седловые опоры под продольной цистерной (3 опоры вдоль Y)
    for (const sy of [-204, -92, 16]) {
      m.addBox(-96, 96, sy - 14, sy + 14, 26, 62, { all: UV.metal });
    }

    // Большая задняя заливная горловина с ПЕРЕЛИВАЮЩЕЙСЯ БУРО-ЗЕЛЁНОЙ ГРЯЗЬЮ!
    m.addLatheZ(0, -184, [[172, 34, 34], [198, 32, 32], [204, 38, 38]], 10, UV.metal, { smooth: true, capStart: true, capEnd: true, capReg: UV.mudOoze });
    // Шапка густой буро-зелёной грязи, выпирающая из горловины!
    m.addLatheZ(0, -184, [[200, 32, 32], [216, 26, 26], [224, 14, 14]], 10, UV.mudOoze, { smooth: true, capStart: true, capEnd: true });

    // Толстые боковые шланги-грязепроводы + вспомогательные грязевые бочки-ресиверы по обоим бортам цистерны!
    for (const sx of [-1, 1]) {
      m.addTube([
        [sx * 108, -220, 56],
        [sx * 124, -140, 74],
        [sx * 124,  -30, 88],
        [sx *  96,  -38, 162],
      ], 12, 7, UV.metal, { capStart: true, capEnd: true });
      // Боковой трап-поручень вдоль цистерны
      m.addTube([
        [sx * 140, -238, 28],
        [sx * 140, -238, 72],
        [sx * 140,  -40, 72],
        [sx * 140,  -40, 28],
      ], 5, 6, UV.chrome, { capStart: true, capEnd: true });
    }

    // Задний силовой бампер + защитная решётка
    m.addBox(-146, 146, -276, -254, -8, 24, { all: UV.metal, top: UV.fenderTop, back: UV.mudPlow });

    parts.Test = m;
  }

  // 3) LOVEGTORONY — ВЫСОКАЯ ПОВОРОТНАЯ НАСОСНАЯ ТУРЕЛЬ-ПОДИУМ СВЕРХУ НА ЦИСТЕРНЕ!
  //    (Как пожарный лафет/бетононасос: вращается на 360° поверх бочки!)
  {
    const m = new Mesh();
    // Командно-цветная круглая тумба-башня с боковыми щёчками крепления пушки
    m.addLatheZ(0, 0, [[-18, 62, 62], [8, 56, 56], [26, 48, 48]], 10, UV.turretSide, { smooth: false, capStart: true, capEnd: true, capReg: UV.hullTop });
    // Боковые бронированные щёки-лафет (в командном цвете!)
    for (const sx of [-1, 1]) {
      const x0 = sx > 0 ? 30 : -52, x1 = sx > 0 ? 52 : -30;
      m.addBox(x0, x1, -46, 54, 12, 54, { all: UV.turretSide });
      // Боковой хромированный баллон-компрессор высокого давления
      m.addLatheY(sx * 64, 24, [[-44, 14], [32, 14], [40, 8]], 8, UV.chrome, { smooth: true, capStart: true, capEnd: true });
    }
    // Задний кожух насоса и гибкий шланг подачи грязи сверху в казённик
    m.addBox(-42, 42, -74, -34, 8, 50, { all: UV.metal });
    m.addTube([[0, -70, 26], [0, -96, 6], [0, -82, -26]], 14, 8, UV.metal, { capStart: true, capEnd: true });
    // Штыревая антенна на краю турели
    m.addLatheZ(-46, -54, [[26, 7, 7], [44, 4.5, 4.5], [166, 2, 2]], 6, UV.metal, { smooth: true, capStart: true, capEnd: true });
    parts.Lovegtorony = m;
  }

  // 4) CSO — ГРОМАДНАЯ ГРЯЗЕВАЯ ПУШКА-РАСТРУБ (+22° ВВЕРХ ДЛЯ НАВЕСНОГО ПОЛИВА!)
  //    Огромный колоколообразный мушкетон с заляпанным грязью раструбом и двумя мощными гидроцилиндрами!
  {
    const m = new Mesh();
    const tilt = 0.38; // +22° вверх — мгновенно читается как навесной «гряземёт-лафет»!
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    const prof = [
      [-64, 28],
      [-16, 30],
      [ 36, 27],
      [ 88, 25],
      [112, 34],
      [142, 50],
      [164, 62],  // ГИГАНТСКИЙ РАСТРУБ-ВОРОНКА!
      [176, 58],
    ];
    const rings = prof.map(([yy, rr]) => {
      const ring = [];
      for (let i = 0; i < 14; i++) {
        const a = 2 * Math.PI * i / 14;
        const rx = rr * Math.cos(a), rz = rr * Math.sin(a);
        ring.push([rx, yy * ct - rz * st, yy * st + rz * ct]);
      }
      return ring;
    });
    m.addLoft(rings, UV.mudGun, { smooth: true, capStart: true, capEnd: true, vStart: 0.02, vEnd: 0.98, capReg: UV.mudOoze });

    // Парные мощные хромированные гидроцилиндры-поршни по бокам ствола (тоже под +22°!)
    for (const sx of [-38, 38]) {
      const p0 = [sx, -42 * ct, -42 * st];
      const p1 = [sx,  98 * ct,  98 * st];
      m.addTube([p0, p1], [10, 10], 8, UV.chrome, { capStart: true, capEnd: true });
    }
    parts.Cso = m;
  }

  // 5) CHAIN R 001 / CHAIN L 001 — прокручивающиеся гусеницы
  const trkR = new Mesh(); buildTrackLoop(trkR, 38, -264, 262, -52, 52, -220, 216, 2.75);
  const trkL = new Mesh(); buildTrackLoop(trkL, 38, -264, 262, -52, 52, -220, 216, 2.75);
  parts['Chain R 001'] = trkR;
  parts['Chain L 001'] = trkL;

  const ROOT_M = [-1, 0, 0,  0, 0, -1,  0, 1, 0,  0, 48, 0];
  const ID_M = (tx, ty, tz, sx = 1, sy = 1, sz = 1) => [sx, 0, 0,  0, sy, 0,  0, 0, sz,  tx, ty, tz];
  const TRK_M = tx => [-0.90, 0, 0,  0, 0, -0.90,  0, 0.90, 0,  tx, 46, 0];

  return {
    trackTex: 'lanctalp.tga',
    nodes: [
      { name: 'Lanctalp',    parent: -1, m: ROOT_M, mesh: parts.Lanctalp },
      { name: 'Test',        parent:  0, m: ID_M(0, 0, 32), mesh: parts.Test },
      { name: 'Lovegtorony', parent:  1, m: ID_M(0, -48, 192), mesh: parts.Lovegtorony },
      { name: 'Cso',         parent:  2, m: ID_M(0, 46, 36), mesh: parts.Cso },
      { name: '_Torkolattuz',parent:  3, m: ID_M(0, 168, 66), helper: true },
      { name: '_kereso',     parent:  1, m: ID_M(0, 212, 132, 0.65, 1, 0.65), helper: true },
      { name: '_glow1piros', parent:  1, m: ID_M(168, -264, 26, -0.24, -1, 0.24), helper: true },
      { name: '_glow0piros', parent:  1, m: ID_M(-168, -264, 26, 0.24, -1, 0.24), helper: true },
      { name: '_glow2feher', parent:  1, m: ID_M(-168, 254, 33, 0.22, 1, 0.22), helper: true },
      { name: '_glow3feher', parent:  1, m: ID_M(168, 254, 33, -0.22, 1, 0.22), helper: true },
      { name: 'Chain R 001', parent: -1, m: TRK_M(-164), mesh: parts['Chain R 001'], isTrack: true },
      { name: 'Chain L 001', parent: -1, m: TRK_M( 164), mesh: parts['Chain L 001'], isTrack: true },
    ],
  };
}

const summary = buildUnitPackage({
  modelName: 'd_gryazemet',
  race: 'pig',
  anifFrom: 'd_mozsar',
  outDir: OUT,
  buildGeometry: buildGryazemetGeometry,
  buildAtlas: buildGryazemetAtlas,
});
for (const s of summary) console.log(`d_gryazemet_${s.level.padEnd(7)}  V=${String(s.verts).padStart(4)}  F=${String(s.faces).padStart(4)}  .4d=${s.size4d}B  .dxt=${s.sizeDxt}B`);

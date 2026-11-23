#!/usr/bin/env node
// Юнит #1 (Свиньи): «Хряк-Гриль» (d_hryakgrill) — Тяжёлый огнемётный танк ближнего боя (v2).
//
// Использует реальные текстурные ассеты из base.pak S.W.I.N.E. HD:
//  - живая крашеная сталь брони Свиней (d_normaltank / d_hardtank),
//  - оригинальный логотип Свиней (d_raketas_normal.dxt),
//  - оригинальный знак «FUEL» с пламенем и металлик канистры (utanfuto_fuel.dxt),
//  - оригинальные 4 катка, рифлёные крылья, жалюзи МТО с 3 огоньками, фары, стоп-сигналы,
//    литая маска, копоть под башней, полосатый бампер, шевроны и боевые сколы/ржавчина Veteran/Elite!
//
// 3D-геометрия едина для всех 3 стадий (normal / veteran / elite); прогрессия выражена текстурой.
// Запуск: node tools/models/d_hryakgrill.js [out-dir]
'use strict';
const path = require('path');
const {
  clamp, lerp, uvRect, fbm, vnoise,
  Mesh, buildTrackLoop, Canvas, drawFlameHazardSign, loadGameAssets, buildUnitPackage,
} = require('../lib/swine-model-kit');

const OUT = path.resolve(process.argv[2] || 'mods-test/units/d_hryakgrill');

// ─── Карта UV-атласа 512×512 (выделенные зоны без перекрытий) ───
const UV = {
  hullTop:    [0.01, 0.01, 0.45, 0.27], // Палуба корпуса + оригинальная копоть под башней
  hullFront:  [0.01, 0.29, 0.31, 0.46], // Наклонная лобовая броня + смотровая щель
  hullSkirt:  [0.01, 0.48, 0.47, 0.64], // Трапециевидные бортовые экраны (ориг. шевроны Vet/Elite!)
  hullRear:   [0.01, 0.66, 0.31, 0.81], // Корма корпуса + ориг. лого свиней + ориг. полосатый бампер
  fuelTank:   [0.01, 0.83, 0.48, 0.99], // Огромный бак напалма на корме (металл + ориг. знаки FUEL + хомуты)
  wheels:     [0.50, 0.01, 0.99, 0.14], // Оригинальные 4 катка Свиней (из d_normaltank_normal.dxt)
  turretSide: [0.50, 0.16, 0.99, 0.36], // Борт башни (номер «66» + боевой нагар/сколы/ржавчина)
  turretTop:  [0.50, 0.38, 0.79, 0.61], // Крыша башни + оригинальный логотип Свиней + башенка
  turretRear: [0.81, 0.38, 0.99, 0.61], // Оригинальные жалюзи МТО с 3 янтарными огоньками
  flamer:     [0.50, 0.63, 0.99, 0.76], // Огнемёт: рукав с полосами Vet/Elite + перфорация + закопчённое сопло
  mantlet:    [0.33, 0.29, 0.47, 0.46], // Литая броня маски (из d_normaltank_normal.dxt)
  fenderTop:  [0.33, 0.66, 0.47, 0.81], // Оригинальная рифлёная сталь надгусеничных полок
  metal:      [0.50, 0.78, 0.73, 0.98], // Тёмный воронёный/оружейный металл (поручни, рама, трубы, хомуты)
  chrome:     [0.75, 0.78, 0.99, 0.89], // Полированная сталь (клыки, выхлопы, клапан, запальник)
  lights:     [0.75, 0.91, 0.87, 0.99], // Оригинальные передние фары
  taillight:  [0.89, 0.91, 0.99, 0.99], // Оригинальные задние стоп-сигналы
};

// ═══════════════════════════════════════════════════════════════════════
//  ТЕКСТУРНЫЙ АТЛАС 1024×1024 -> 512×512 НА БАЗЕ ОРИГИНАЛЬНЫХ АССЕТОВ ИГРЫ
// ═══════════════════════════════════════════════════════════════════════
function buildHryakGrillAtlas(level) {
  const W = 1024;
  const cv = new Canvas(W);
  const ga = loadGameAssets();
  const R = ga.rects;
  const isVet = level === 'veteran';
  const isElite = level === 'elite';
  const dmgSet = isElite ? ga.eliteDamages : ga.vetDamages;

  // 1) Живая оригинальная фактура крашеной брони Свиней из d_normaltank_normal.dxt (alpha = 1 -> динамический цвет!)
  cv.fillArmorBaseFromGame('pig', 1.06);

  // Хелпер: наложение реального штампа боевых сколов/ржавчины из d_normaltank_{veteran,elite}.dxt
  const stampDmg = (idx, dx0, dy0, dx1, dy1, rot = 0) => {
    const patch = dmgSet[idx % dmgSet.length];
    cv.blitPatch(patch, { x: 0, y: 0, w: patch.W, h: patch.H }, dx0, dy0, dx1, dy1, {
      useSrcAlphaAsOpacity: true, setTeamMask: 0, rotate: rot, opacity: isElite ? 0.96 : 0.88,
    });
  };

  // 2) HULL TOP — палуба корпуса + оригинальная копоть под башней + люки
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.hullTop);
    cv.panelFrame(x0, y0, x1, y1, 5, 36);
    const cx = (x0 + x1) * 0.50, cy = (y0 + y1) * 0.46;
    // Оригинальная копоть под башней (cutoutByInvAlpha сохраняет мягкую дымку!)
    cv.blitPatch(R.turretSoot.img, R.turretSoot, cx - 115, cy - 102, cx + 115, cy + 102, {
      cutoutByInvAlpha: true, setTeamMask: 0, opacity: 0.92,
    });
    // Боковые вентиляторы МТО (из оригинальных жалюзи)
    for (const dx of [-148, 148]) {
      cv.blitPatch(R.pigLouvers.img, R.pigLouvers, cx + dx - 30, y1 - 68, cx + dx + 30, y1 - 14, { setTeamMask: 0 });
    }
    cv.panelFrame(cx - 46, y0 + 16, cx + 46, y0 + 62, 3, 24);
    if (isVet || isElite) {
      stampDmg(0, x0 + 28, y0 + 22, x0 + 150, y0 + 108);
      stampDmg(1, x1 - 148, y0 + 82, x1 - 24, y0 + 172, 180);
    }
  }

  // 3) HULL FRONT — лобовая броня + смотровой прибор мехвода + заклёпки
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.hullFront);
    cv.panelFrame(x0, y0, x1, y1, 5, 32);
    const cx = (x0 + x1) * 0.50, cy = (y0 + y1) * 0.50;
    // Бронированная смотровая щель мехвода с мягким AO
    cv.fillRect(cx - 60, cy - 22, cx + 60, cy + 20, [0.16, 0.18, 0.20], 0.95, 0);
    cv.fillRect(cx - 50, cy - 11, cx + 50, cy + 8, [0.05, 0.08, 0.11], 1, 0);
    cv.drawLine(cx - 46, cy - 7, cx + 46, cy - 7, 2.2, [0.42, 0.58, 0.68], 0.65, 0);
    for (const dx of [-52, -26, 0, 26, 52]) { cv.rivet(cx + dx, cy - 17, 2.3); cv.rivet(cx + dx, cy + 15, 2.3); }
    if (isVet || isElite) stampDmg(2, cx - 70, cy - 52, cx + 76, cy + 48);
  }

  // 4) HULL SKIRT — трапециевидные бортовые экраны (как у d_normaltank!) + оригинальные шевроны Vet/Elite!
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.hullSkirt);
    cv.panelFrame(x0, y0, x1, y1, 4, 38);
    const Wp = x1 - x0, Hp = y1 - y0;
    // Горизонтальный трос/шина крепления вдоль борта (узнаваемая деталь из d_normaltank и d_hardtank!)
    cv.drawLine(x0 + 24, y0 + Hp * 0.24, x1 - 24, y0 + Hp * 0.24, 4.5, [0.14, 0.16, 0.18], 0.85, 0);
    cv.drawLine(x0 + 24, y0 + Hp * 0.24 - 1, x1 - 24, y0 + Hp * 0.24 - 1, 1.8, [0.76, 0.80, 0.84], 0.70, 0);
    for (const f of [0.22, 0.50, 0.78]) {
      const sx = x0 + Wp * f;
      cv.drawLine(sx, y0 + 6, sx, y1 - 6, 2.4, [0.06, 0.08, 0.10], 0.75);
    }
    // Пыль и грязь по нижней кромке экрана
    for (let y = Math.floor(y0 + Hp * 0.62); y < y1; y++) {
      const t = (y - (y0 + Hp * 0.62)) / (Hp * 0.38);
      for (let x = x0; x < x1; x++) cv.blendPx(x, y, [0.18, 0.16, 0.13], t * fbm(x * 0.04, y * 0.04, 3, 77) * 0.58, null);
    }
    // Оранжевый боковой катафот (как у оригинальных танков Свиней!)
    cv.fillCircle(x1 - 44, y1 - 30, 10, [0.08, 0.08, 0.08], 1, 0);
    cv.fillCircle(x1 - 44, y1 - 30, 7.5, [0.92, 0.58, 0.06], 1, 0);

    // ОРИГИНАЛЬНЫЕ ШЕВРОНЫ из d_normaltank_{veteran,elite}.dxt (повёрнуты на 90° горизонтально!)
    if (isVet) {
      cv.blitPatch(R.vetChevrons.img, R.vetChevrons, x0 + Wp * 0.33, y0 + Hp * 0.18, x0 + Wp * 0.62, y0 + Hp * 0.84, {
        cutoutByInvAlpha: true, setTeamMask: 0, rotate: 90,
      });
      stampDmg(1, x0 + Wp * 0.54, y0 + 18, x0 + Wp * 0.82, y1 - 12);
    } else if (isElite) {
      cv.blitPatch(R.eliteChevrons.img, R.eliteChevrons, x0 + Wp * 0.22, y0 + Hp * 0.18, x0 + Wp * 0.74, y0 + Hp * 0.84, {
        cutoutByInvAlpha: true, setTeamMask: 0, rotate: 90,
      });
      stampDmg(0, x0 + Wp * 0.12, y0 + 16, x0 + Wp * 0.42, y1 - 10);
      stampDmg(2, x0 + Wp * 0.60, y0 + 16, x0 + Wp * 0.90, y1 - 10);
    }
  }

  // 5) HULL REAR — кормовая плита + ОРИГИНАЛЬНЫЙ ЛОГОТИП СВИНЕЙ + оригинальный полосатый бампер на Vet/Elite
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.hullRear);
    cv.panelFrame(x0, y0, x1, y1, 4, 28);
    const cx = (x0 + x1) * 0.50, cy = (y0 + y1) * 0.50;
    cv.blitPatch(R.pigLogo.img, R.pigLogo, cx - 42, cy - 28, cx + 42, cy + 28, {
      cutoutByInvAlpha: true, setTeamMask: 0,
    });
    if (isVet || isElite) {
      cv.blitPatch(R.hazardStrip.img, R.hazardStrip, x0 + 8, y1 - 28, x1 - 8, y1 - 6, { setTeamMask: 0 });
    }
  }

  // 6) FUEL TANK — ЯРКО-АЛАЯ ПРОМЫШЛЕННАЯ ЦИСТЕРНА НАПАЛМА НА КОРМЕ (реальный красный металл + знаки FUEL + ромбы пламени!)
  // Развёртка: U = окружность (0..1), V = длина вдоль X (0 = левый торец, 1 = правый торец)
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.fuelTank);
    const Wt = x1 - x0, Ht = y1 - y0;
    // Насыщенный огненно-красный металл баллона (усиленный красный тон, чтобы мгновенно читался «НАПАЛМ»!)
    cv.blitPatch(R.fuelRedMetal.img, R.fuelRedMetal, x0, y0, x1, y1, { setTeamMask: 0, rotate: 90, tint: [1.18, 0.78, 0.70], gain: 1.08 });
    // Лёгкая дизельная патина и потёки (умеренные, чтобы не темнить алый бак!)
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const grime = fbm(x * 0.035, y * 0.035, 4, 317);
      const streak = fbm(x * 0.09, y * 0.018, 3, 331);
      cv.blendPx(x, y, [0.22, 0.05, 0.04], clamp((grime - 0.50) * 0.90, 0, 0.36), 0);
      if (streak > 0.68) cv.blendPx(x, y, [0.10, 0.05, 0.04], (streak - 0.68) * 1.1, 0);
    }
    // Яркие жёлто-чёрные предупреждающие полосы у торцов бочки
    for (const [f0, f1] of [[0.08, 0.18], [0.82, 0.92]]) {
      const py0 = Math.floor(y0 + Ht * f0), py1 = Math.ceil(y0 + Ht * f1);
      cv.blitPatch(R.hazardStrip.img, R.hazardStrip, x0, py0, x0 + Wt * 0.5, py1, { setTeamMask: 0, gain: 0.98 });
      cv.blitPatch(R.hazardStrip.img, R.hazardStrip, x0 + Wt * 0.5, py0, x1, py1, { setTeamMask: 0, gain: 0.98 });
      cv.drawLine(x0, py0, x1, py0, 2.5, [0.05, 0.05, 0.06], 0.9, 0);
      cv.drawLine(x0, py1, x1, py1, 2.5, [0.05, 0.05, 0.06], 0.9, 0);
    }
    // Две тяжёлые стальные стяжки с заклёпками (V = 0.28 и 0.72)
    for (const fc of [0.28, 0.72]) {
      const py = y0 + Ht * fc;
      const strapCol = isElite ? [0.74, 0.56, 0.16] : [0.22, 0.24, 0.26];
      cv.fillRect(x0, py - 9, x1, py + 9, [0.05, 0.05, 0.06], 0.95, 0);
      cv.fillRect(x0, py - 6, x1, py + 6, strapCol, 1, 0);
      for (let rx = x0 + 18; rx < x1 - 12; rx += 30) cv.rivet(rx, py, 2.2);
    }
    // Чередуем оригинальные таблички «FUEL» и яркие огненные ромбы «ОГНЕОПАСНО» по окружности цистерны!
    for (const fu of [0.14, 0.62]) {
      const cx = x0 + Wt * fu, cy = y0 + Ht * 0.50;
      const rx = Ht * 0.21, ry = Ht * 0.30;
      cv.blitPatch(R.fuelSign.img, R.fuelSign, cx - rx, cy - ry, cx + rx, cy + ry, {
        cutoutByInvAlpha: true, setTeamMask: 0, rotate: 90,
      });
    }
    for (const fu of [0.36, 0.86]) {
      drawFlameHazardSign(cv, x0 + Wt * fu, y0 + Ht * 0.50, Ht * 0.25);
    }
    if (isVet || isElite) {
      stampDmg(1, x0 + Wt * 0.34, y0 + 28, x0 + Wt * 0.46, y1 - 24);
      if (isElite) stampDmg(3, x0 + Wt * 0.56, y0 + 24, x0 + Wt * 0.70, y1 - 22);
    }
  }

  // 7) WHEELS — ОРИГИНАЛЬНЫЕ 4 КАТКА СВИНЕЙ (из d_normaltank_normal.dxt, alpha = 0!)
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.wheels);
    cv.blitPatch(R.pigWheels.img, R.pigWheels, x0, y0, x1, y1, { setTeamMask: 0 });
  }

  // 8) TURRET SIDE — борт башни (оригинальная сталь + номер «66» + реалистичные сколы/ржавчина + опалённый нагар на Elite)
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.turretSide);
    cv.panelFrame(x0, y0, x1, y1, 5, 34);
    const Wp = x1 - x0, Hp = y1 - y0;
    // Сварные швы и тени скул башни
    cv.drawLine(x0 + Wp * 0.25, y0 + 8, x0 + Wp * 0.21, y1 - 8, 2.4, [0.06, 0.08, 0.10], 0.72);
    cv.drawLine(x0 + Wp * 0.75, y0 + 8, x0 + Wp * 0.79, y1 - 8, 2.4, [0.06, 0.08, 0.10], 0.72);
    // Трафаретный белый номер «66» с лёгкой потёртостью в стиле «47»/«23» из оригинала
    cv.drawGlyph('6', x0 + Wp * 0.44, y0 + Hp * 0.52, Hp * 0.54, [0.91, 0.92, 0.93]);
    cv.drawGlyph('6', x0 + Wp * 0.59, y0 + Hp * 0.52, Hp * 0.54, [0.91, 0.92, 0.93]);
    // Реальные боевые повреждения из d_normaltank_{veteran,elite}.dxt (чистая альфа-маска!)
    if (isVet) {
      stampDmg(1, x0 + Wp * 0.58, y0 + 28, x0 + Wp * 0.84, y1 - 24);
      stampDmg(2, x0 + Wp * 0.14, y0 + 44, x0 + Wp * 0.36, y1 - 22);
    } else if (isElite) {
      stampDmg(0, x0 + Wp * 0.56, y0 + 22, x0 + Wp * 0.88, y1 - 18);
      stampDmg(3, x0 + Wp * 0.10, y0 + 24, x0 + Wp * 0.42, y1 - 16);
      stampDmg(1, x0 + Wp * 0.34, y0 + 18, x0 + Wp * 0.56, y0 + 96);
    }
  }

  // 9) TURRET TOP — крыша башни + ОРИГИНАЛЬНЫЙ ЛОГОТИП СВИНЕЙ + люк
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.turretTop);
    cv.panelFrame(x0, y0, x1, y1, 5, 30);
    const cx = (x0 + x1) * 0.50, cy = (y0 + y1) * 0.50;
    cv.drawRing(cx, cy + 16, 46, 55, [0.07, 0.09, 0.11], 0.78);
    // Оригинальный логотип Свиней из d_raketas_normal.dxt (как на крыше d_hardtank!)
    cv.blitPatch(R.pigLogo.img, R.pigLogo, cx - 44, y0 + 20, cx + 44, y0 + 78, {
      cutoutByInvAlpha: true, setTeamMask: 0,
    });
    if (isVet || isElite) {
      stampDmg(3, x0 + 22, y0 + 96, x0 + 136, y1 - 18);
      if (isElite) stampDmg(1, x1 - 128, y0 + 30, x1 - 18, y0 + 124);
    }
  }

  // 10) TURRET REAR — ОРИГИНАЛЬНЫЕ ЖАЛЮЗИ РАДИАТОРА С 3 ЯНТАРНЫМИ ОГОНЬКАМИ (из d_normaltank_normal.dxt!)
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.turretRear);
    cv.panelFrame(x0, y0, x1, y1, 4, 28);
    cv.blitPatch(R.pigLouvers.img, R.pigLouvers, x0 + 12, y0 + 14, x1 - 12, y1 - 14, { setTeamMask: 0 });
    if (isVet || isElite) stampDmg(2, x0 + 20, y0 + 20, x1 - 24, y0 + 115);
  }

  // 11) FLAMER — ствол огнемёта: крашеный рукав (с полосами Vet/Elite) -> тёмный перфорированный кожух -> обгоревшее сопло!
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.flamer);
    const Wb = x1 - x0, Hb = y1 - y0;
    // Передняя часть (V > 0.34) — реалистичный закопчённый оружейный металл (на основе mantletMetal, alpha = 0!)
    const splitY = Math.floor(y0 + Hb * 0.34);
    cv.blitPatch(R.mantletMetal.img, R.mantletMetal, x0, splitY, x1, y1, { setTeamMask: 0, rotate: 90, gain: 0.72 });
    // Градиент сильного нагара и жарового побежалости к самому соплу
    for (let y = splitY; y < y1; y++) {
      const vt = (y - y0) / Hb;
      const soot = clamp((vt - 0.62) / 0.38, 0, 1);
      for (let x = x0; x < x1; x++) {
        if (soot > 0) cv.blendPx(x, y, [0.07, 0.06, 0.06], soot * 0.85, 0);
      }
    }
    // Кольца стыков кожуха
    for (const vf of [0.34, 0.78]) {
      const yy = y0 + Hb * vf;
      cv.drawLine(x0, yy, x1, yy, 3.5, [0.05, 0.05, 0.06], 0.9, 0);
      cv.drawLine(x0, yy + 3, x1, yy + 3, 2, [0.64, 0.66, 0.70], 0.5, 0);
    }
    // Перфорация охлаждающего кожуха (3 ряда чётких отверстий, скомпенсированных под пропорцию UV)
    for (let row = 0; row < 3; row++) {
      const ry = y0 + Hb * (0.44 + row * 0.13);
      for (let col = 0; col < 10; col++) {
        const rx = x0 + Wb * (col + 0.5) / 10;
        for (let py = Math.floor(ry - 8); py <= Math.ceil(ry + 8); py++) {
          for (let px = Math.floor(rx - 14); px <= Math.ceil(rx + 14); px++) {
            const d = Math.hypot((px - rx) / 11.5, (py - ry) / 5.2);
            if (d < 1.15) cv.blendPx(px, py, d < 0.86 ? [0.02, 0.02, 0.03] : [0.46, 0.48, 0.50], 0.92, 0);
          }
        }
      }
    }
    // Полосы ранга на крашеном рукаве (Veteran: 2, Elite: 4 — точно как на стволе d_normaltank!)
    if (isVet || isElite) {
      const nStripes = isElite ? 4 : 2;
      for (let s = 0; s < nStripes; s++) {
        const sy = y0 + Hb * (0.08 + s * 0.062);
        cv.fillRect(x0, sy - 2, x1, sy + 7, [0.05, 0.05, 0.06], 1, 0);
        cv.fillRect(x0, sy, x1, sy + 5, [0.95, 0.78, 0.06], 1, 0);
      }
    }
    // Раскалённый огненно-оранжевый обод и тлеющая жаровая решётка у сопла огнемёта!
    cv.fillRect(x0, y0 + Hb * 0.87, x1, y0 + Hb * 0.95, [0.95, 0.42, 0.05], 0.92, 0);
    cv.drawLine(x0, y0 + Hb * 0.91, x1, y0 + Hb * 0.91, 4.0, [0.98, 0.78, 0.12], 0.88, 0);
  }

  // 12) MANTLET, FENDER GRATING, METAL, CHROME, LIGHTS, TAILLIGHTS — все на реальных ассетах игры!
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.mantlet);
    cv.blitPatch(R.mantletMetal.img, R.mantletMetal, x0, y0, x1, y1, { setTeamMask: 0, gain: 0.92 });
  }
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.fenderTop);
    cv.blitPatch(R.fenderGrating.img, R.fenderGrating, x0, y0, x1, y1, { setTeamMask: 0 });
  }
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.metal);
    cv.blitPatch(R.mantletMetal.img, R.mantletMetal, x0, y0, x1, y1, { setTeamMask: 0, gain: 0.65 });
  }
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.chrome);
    cv.blitPatch(R.chromeMetal.img, R.chromeMetal, x0, y0, x1, y1, { setTeamMask: 0, rotate: 90, gain: 1.25 });
  }
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.lights);
    cv.blitPatch(R.headlight.img, R.headlight, x0, y0, x1, y1, { setTeamMask: 0 });
  }
  {
    const [x0, y0, x1, y1] = cv.regPx(UV.taillight);
    cv.blitPatch(R.taillight.img, R.taillight, x0, y0, x1, y1, { setTeamMask: 0, rotate: 90 });
  }

  return cv.downsample2x(); // 512×512 anti-aliased!
}

// ═══════════════════════════════════════════════════════════════════════
//  3D-ГЕОМЕТРИЯ «ХРЯК-ГРИЛЬ» v2 (приземистый хищный силуэт S.W.I.N.E. HD!)
// ═══════════════════════════════════════════════════════════════════════
function buildHryakGrillGeometry() {
  const parts = {};

  // 1) LANCTALP — броневанна с 4 оригинальными катками на бортах
  {
    const m = new Mesh();
    const prof = [[-196, -46], [196, -46], [238, -12], [242, 28], [-238, 28], [-234, -12]];
    m.addPrismX(prof, 166, UV.wheels, UV.metal);
    parts.Lanctalp = m;
  }

  // 2) TEST — приземистый штурмовой корпус, трапециевидные экраны, клыки, бак напалма в кормовой нише, выхлопы
  {
    const m = new Mesh();

    // Основной низкий клиновидный корпус с нишей в корме под бак напалма
    const hullProf = [
      [-260, -24, 152],
      [236,  -24, 152],
      [278,    4, 146],  // острый хищный лобовой «нос»
      [186,   38, 146],  // верхняя кромка пологой лобовой брони
      [-118,  38, 148],  // подбашенная палуба (ниже и приземистее v1!)
      [-146,  14, 150],  // уступ кормовой ниши под бак
      [-264,  10, 152],  // площадка бака
    ];
    m.addPrismX(hullProf, 150, UV.hullSkirt, UV.hullTop, {
      edgeRegs: [UV.metal, UV.hullFront, UV.hullFront, UV.hullTop, UV.turretRear, UV.fenderTop, UV.hullRear],
    });

    // Надгусеничные полки + ФИРМЕННЫЕ ТРАПЕЦИЕВИДНЫЕ БОРТОВЫЕ ЭКРАНЫ СВИНЕЙ (как у d_normaltank!)
    for (const sx of [-1, 1]) {
      const xIn = sx * 144, xOut = sx * 198;
      const x0 = Math.min(xIn, xOut), x1 = Math.max(xIn, xOut);
      // Верхняя рифлёная полка (с вырезом спереди/сзади — гусеницы красиво открыты у звёздочек!)
      m.addBox(x0, x1, -248, 248, 16, 26, {
        top: UV.fenderTop, bot: UV.metal, front: UV.hullFront, back: UV.hullRear,
        left: UV.metal, right: UV.metal,
      });
      // Скошенные передний и задний брызговики
      m.addFrustum([x0, x1, 246, 270], [x0, x1, 244, 248], 0, 22, { all: UV.hullFront, top: UV.fenderTop });
      m.addFrustum([x0, x1, -264, -244], [x0, x1, -252, -244], 2, 22, { all: UV.hullRear, top: UV.fenderTop });

      // Трапециевидный бортовой экран (широкий сверху, суженный снизу — открывает передний и задний катки как в оригинале!)
      const sx0 = sx > 0 ? 196 : -206, sx1 = sx > 0 ? 206 : -196;
      m.addFrustum([sx0, sx1, -158, 168], [sx0, sx1, -228, 224], -18, 26, {
        top: UV.fenderTop, bot: UV.metal, front: UV.metal, back: UV.metal,
        left: sx > 0 ? UV.hullSkirt : UV.metal,
        right: sx < 0 ? UV.hullSkirt : UV.metal,
      });
    }

    // Культовые изогнутые 3D-клыки кабана + ФИРМЕННАЯ РЕШЁТКА-ГРИЛЬ между клыками на носу («Хряк-Гриль»!)
    for (const sx of [-1, 1]) {
      m.addTube([
        [sx * 76, 228, -18],
        [sx * 86, 272, -16],
        [sx * 94, 298,  -2],
        [sx * 100, 308,  22],
        [sx * 102, 298,  46],
      ], [18, 14, 10, 5.5, 1.5], 8, UV.chrome, { capStart: true, capEnd: true });
    }
    // Бронированная вертикальная решётка-гриль (бульбар) между клыками
    m.addBox(-74, 74, 266, 286, -14, -4, { all: UV.metal });
    m.addBox(-74, 74, 266, 286,  16, 26, { all: UV.metal });
    for (const gx of [-54, -27, 0, 27, 54]) {
      m.addBox(gx - 5, gx + 5, 272, 288, -16, 28, { all: UV.chrome });
    }

    // Низкий бронированный колпак мехвода
    m.addFrustum([-52, 52, 146, 206], [-42, 42, 152, 194], 32, 48, { all: UV.hullFront, top: UV.hullTop });

    // Встроенные передние фары и задние стоп-сигналы (утоплены в полки как у d_normaltank!)
    for (const sx of [-1, 1]) {
      const fx = sx * 170;
      m.addBox(fx - 17, fx + 17, 226, 250, 22, 37, { all: UV.metal, front: UV.lights });
      m.addBox(fx - 19, fx + 19, -256, -238, 16, 32, { all: UV.metal, back: UV.taillight });
    }

    // ═══ МАССИВНАЯ ПРОМЫШЛЕННАЯ ЦИСТЕРНА НАПАЛМА В КОРМОВОЙ НИШЕ ═══
    // Сидит ниже и органичнее в корпусе (Y = -208, Z = 54, R = 50 -> верх Z = 104, башня и огнемёт свободно проходят сверху!)
    m.addLatheX(-208, 54, [
      [-154, 16],
      [-144, 40],
      [-130, 50],
      [ 130, 50],
      [ 144, 40],
      [ 154, 16],
    ], 14, UV.fuelTank, { smooth: true, capStart: true, capEnd: true });

    // Три тяжёлые стальные опоры-седловины под баком
    for (const sx of [-92, 0, 92]) {
      m.addBox(sx - 10, sx + 10, -248, -168, 10, 32, { all: UV.metal });
    }

    // Бронированная горловина и клапан сброса давления на баке (замкнутая деталь — 0 вывернутых граней!)
    m.addLatheZ(0, -212, [[98, 22, 22], [112, 18, 18], [116, 24, 24], [122, 14, 14]], 8, UV.chrome, { smooth: true, capStart: true, capEnd: true });

    // Армированные шланги подачи огнесмеси от бака в корпус к башне
    for (const sx of [-1, 1]) {
      m.addTube([
        [sx * 74, -160, 58],
        [sx * 74, -134, 52],
        [sx * 62, -116, 34],
      ], 8.5, 7, UV.metal, { capStart: true, capEnd: true });
    }

    // Задний бронебампер (с эмблемой Свиней + полосами Vet/Elite) + защитная дуга бака
    m.addBox(-142, 142, -274, -252, -10, 20, { all: UV.hullRear, top: UV.fenderTop });
    m.addTube([
      [-140, -262, 20],
      [-140, -272, 54],
      [ 140, -272, 54],
      [ 140, -262, 20],
    ], 7, 6, UV.metal, { capStart: true, capEnd: true });

    // Фирменные двойные наклонные выхлопные трубы Свиней вдоль кормовых крыльев (замкнутые детали!)
    for (const sx of [-1, 1]) {
      for (const dz of [0, 16]) {
        m.addTube([
          [sx * 144, -124, 24 + dz],
          [sx * 166, -136, 28 + dz],
          [sx * 170, -214, 34 + dz],
        ], [6.8, 6.8, 7.6], 7, UV.chrome, { capStart: true, capEnd: true });
      }
    }

    parts.Test = m;
  }

  // 3) LOVEGTORONY — ПРИЗЕМИСТАЯ, ШИРОКАЯ, СКОШЕННАЯ ШТУРМОВАЯ БАШНЯ В СТИЛЕ d_normaltank / d_hardtank!
  {
    const m = new Mesh();
    // Кольцо строго CCW вокруг +Z: (xF,yF) -> (-xF,yF) -> (-xM,yM1) -> ... -> (xM,yM1)
    const ring = (z, xF, xM, xB, yF, yM1, yM2, yB) => [
      [ xF, yF, z], [-xF, yF, z],
      [-xM, yM1, z], [-xM * 0.92, yM2, z],
      [-xB, yB, z], [ xB, yB, z],
      [ xM * 0.92, yM2, z], [ xM, yM1, z],
    ];
    const tRings = [
      ring(-52,  76, 158, 114,  166,  42, -92, -142),
      ring(-22,  72, 150, 108,  154,  38, -88, -136),
      ring( 30,  46,  94,  76,  100,  26, -68, -112),
    ];
    for (let r = 0; r < tRings.length - 1; r++) {
      const R0 = tRings[r], R1 = tRings[r + 1];
      const v0 = r === 0 ? 1.0 : 0.48, v1 = r === 0 ? 0.48 : 0.0;
      const sideRegs = [UV.hullFront, UV.turretSide, UV.turretSide, UV.turretSide, UV.turretRear, UV.turretSide, UV.turretSide, UV.turretSide];
      for (let i = 0; i < 8; i++) {
        const j = (i + 1) % 8;
        let u0 = 0, u1 = 1;
        // В игре (swine-view.js --cull 1) «66» читается слева направо с обоих бортов!
        if (i === 1) { u0 = 1.0; u1 = 0.74; }
        else if (i === 2) { u0 = 0.74; u1 = 0.22; }
        else if (i === 3) { u0 = 0.22; u1 = 0.0; }
        else if (i === 5) { u0 = 1.0; u1 = 0.78; }
        else if (i === 6) { u0 = 0.78; u1 = 0.26; }
        else if (i === 7) { u0 = 0.26; u1 = 0.0; }
        m.addQuad(R0[i], R0[j], R1[j], R1[i], sideRegs[i], [u0, v0], [u1, v0], [u1, v1], [u0, v1]);
      }
    }
    const topR = tRings[2];
    m.addPoly(topR, topR.map(p => uvRect(UV.turretTop, 1 - (p[0] + 98) / 196, 1 - (p[1] + 116) / 220)));
    const botR = [...tRings[0]].reverse();
    m.addPoly(botR, botR.map(() => uvRect(UV.metal, 0.5, 0.5)));

    // Литой бронированный воротник маски огнемёта (использует реальную текстуру литой брони d_normaltank!)
    m.addFrustum([-56, 56, 134, 184], [-44, 44, 114, 166], -40, 18, { all: UV.mantlet, top: UV.mantlet });

    // Фирменные стальные поручни вдоль бортов башни (как у d_normaltank и d_hardtank!)
    for (const sx of [-1, 1]) {
      m.addTube([
        [sx * 102, 74, 16],
        [sx * 124, 58, 18],
        [sx * 118, -76, 18],
        [sx * 96, -98, 16],
      ], 5.0, 6, UV.metal, { capStart: true, capEnd: true });
      // Выразительные алые баллоны поддува на задних скулах + трубка подачи поверх плеча (не перекрывает номер «66»!)
      m.addLatheY(sx * 128, -8, [[-132, 8], [-120, 20], [-68, 20], [-56, 9]], 10, UV.fuelTank, { smooth: true, capStart: true, capEnd: true });
      m.addTube([[sx * 124, -66, 6], [sx * 102, -46, 26], [sx * 90, 56, 28], [sx * 54, 146, 12]], 5.5, 6, UV.chrome, { capStart: true, capEnd: true });
    }

    // Низкая шестигранная командирская башенка со смотровой щелью (замкнутая деталь!)
    m.addLatheZ(-10, -14, [[26, 54, 54], [48, 44, 44], [60, 38, 38], [64, 28, 28]], 6, UV.hullFront, { smooth: false, capStart: true, capEnd: true, capReg: UV.turretTop });
    m.addBox(-24, 24, 14, 34, 38, 54, { all: UV.metal, front: UV.turretRear });

    // Тонкая высокая штыревая антенна
    m.addLatheZ(50, -82, [[28, 8, 8], [46, 5, 5], [248, 2.0, 2.0]], 6, UV.metal, { smooth: true, capStart: true, capEnd: true });

    parts.Lovegtorony = m;
  }

  // 4) CSO — МАССИВНЫЙ ДИЗЕЛЬ-ПАНК ОГНЕМЁТ (перфорированный кожух + нижний запальник + обгоревший раструб)
  {
    const m = new Mesh();
    m.addLatheY(0, 0, [
      [-86, 28],
      [-52, 28],
      [-44, 25],
      [  8, 24],   // крашеный рукав (с полосами Vet/Elite!)
      [ 12, 28],
      [ 18, 28],
      [ 22, 23],   // перфорированный тёмный теплоотводящий кожух
      [112, 23],
      [116, 26],
      [124, 26],
      [128, 18],   // шейка
      [146, 25],   // расширенный раструб сопла
      [160, 23],
    ], 12, UV.flamer, { smooth: true, capStart: true, capEnd: true, vStart: 0.02, vEnd: 0.98 });

    // Нижняя труба запальника (pilot flame) + защитные хомуты
    m.addLatheY(0, -26, [[-60, 10], [124, 9.5], [138, 11], [150, 7]], 8, UV.chrome, { smooth: true, capStart: true, capEnd: true });
    for (const cy of [-18, 48, 112]) m.addBox(-11, 11, cy - 5, cy + 5, -32, -14, { all: UV.metal });
    m.addBox(-8, 8, -32, 114, 21, 32, { all: UV.metal });

    parts.Cso = m;
  }

  // 5) CHAIN R 001 / CHAIN L 001 — прокручивающиеся гусеницы (lanctalp.tga)
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
      { name: 'Lovegtorony', parent:  1, m: ID_M(0, 26, 94), mesh: parts.Lovegtorony },
      { name: 'Cso',         parent:  2, m: ID_M(0, 212, 10), mesh: parts.Cso },
      { name: '_Torkolattuz',parent:  3, m: ID_M(0, 166, 0), helper: true },
      { name: '_kereso',     parent:  2, m: ID_M(42, 152, -6, 0.65, 1, 0.65), helper: true },
      { name: '_glow1piros', parent:  1, m: ID_M(170, -258, 24, -0.24, -1, 0.24), helper: true },
      { name: '_glow0piros', parent:  1, m: ID_M(-170, -258, 24, 0.24, -1, 0.24), helper: true },
      { name: '_glow2feher', parent:  1, m: ID_M(-170, 252, 30, 0.22, 1, 0.22), helper: true },
      { name: '_glow3feher', parent:  1, m: ID_M(170, 252, 30, -0.22, 1, 0.22), helper: true },
      { name: 'Chain R 001', parent: -1, m: TRK_M(-164), mesh: parts['Chain R 001'], isTrack: true },
      { name: 'Chain L 001', parent: -1, m: TRK_M( 164), mesh: parts['Chain L 001'], isTrack: true },
    ],
  };
}

// ─── Сборка пакета «Хряк-Гриль» v2 ───
const summary = buildUnitPackage({
  modelName: 'd_hryakgrill',
  race: 'pig',
  anifFrom: 'd_normaltank',
  outDir: OUT,
  buildGeometry: buildHryakGrillGeometry,
  buildAtlas: buildHryakGrillAtlas,
});

for (const s of summary) {
  console.log(`d_hryakgrill_${s.level.padEnd(7)}  V=${String(s.verts).padStart(4)}  F=${String(s.faces).padStart(4)}  .4d=${s.size4d}B  .dxt=${s.sizeDxt}B`);
}
console.log('Done →', OUT);

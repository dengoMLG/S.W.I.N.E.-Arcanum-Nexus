'use strict';
// Общая библиотека Корпуса Воронов (Пернатый Авиакорпус — префикс v_ / Varjú).
// v2: исправлена плотность текселей (texel density) и пропорции UV-развёртки:
//  - отдельный крупный чистый лист авиаброни armorClean (без дублирования эмблем);
//  - hullSide 3.2:1 с авто-компенсацией пропорций (круглые раундели и ровные номера на длинных бортах);
//  - отдельные регионы wing (горизонтальный) и tailFin (вертикальный киль);
//  - процедурные чёткие полосы hazard 1024px, крупный 1:1 radar и 1:1 hullTop.
const {
  clamp, lerp, uvRect,
  Mesh, buildTrackLoop, buildWheelMesh, Canvas,
  drawCanopyPanel, loadGameAssets,
} = require('./swine-model-kit');

const ROOT_M = (tx, ty, tz, s = 1) => [-s, 0, 0,  0, 0, -s,  0, s, 0,  tx, ty, tz];
const ID_M = (tx, ty, tz, sx = 1, sy = 1, sz = 1) => [sx, 0, 0,  0, sy, 0,  0, 0, sz,  tx, ty, tz];

// Выверенная раскладка атласа 1024×1024 -> 512×512 (0% перекрытий, высокий texel density!)
const RAVEN_UV = {
  hullSide:   [0.01, 0.01, 0.65, 0.21], // 655×205 (3.2:1) — борт фюзеляжа: номер эскадрильи + раундель Воронов
  canopy:     [0.67, 0.01, 0.86, 0.21], // 195×205 — фонарь кабины истребителя (alpha=0)
  turbine:    [0.87, 0.01, 0.99, 0.14], // 123×133 — реактивное сопло + ядро форсажа (alpha=0)
  lights:     [0.87, 0.15, 0.99, 0.21], // 123×62  — посадочные фары (alpha=0)
  armorClean: [0.01, 0.23, 0.43, 0.53], // 430×307 — КРУПНАЯ чистая клёпаная авиаброня без эмблем/текста!
  hullTop:    [0.45, 0.23, 0.72, 0.50], // 276×276 (1:1) — верхняя палуба / крыша башни с круглой эмблемой
  radar:      [0.74, 0.23, 0.99, 0.48], // 256×256 (1:1) — сетка радара / тарелка ДРЛО (alpha=0)
  wing:       [0.01, 0.55, 0.43, 0.78], // 430×236 (1.82:1) — горизонтальное крыло (цвет команды + полосы + кокарда)
  tailFin:    [0.45, 0.52, 0.60, 0.78], // 154×266 (0.58:1) — вертикальный хвостовой киль (без сплющивания!)
  crimson:    [0.62, 0.50, 0.85, 0.65], // 236×154 — алый авиационный акцент / боевая часть (alpha=0)
  missile:    [0.87, 0.50, 0.99, 0.78], // 123×287 — белая ракета с жёлто-чёрной полосой и алым носом (alpha=0)
  metal:      [0.62, 0.67, 0.73, 0.78], // 113×113 — авиационный титан (alpha=0)
  darkMetal:  [0.75, 0.67, 0.85, 0.78], // 102×113 — тёмный оружейный металл стволов (alpha=0)
  hazard:     [0.01, 0.80, 0.37, 0.91], // 369×113 — процедурные чёткие диагональные полосы безопасности (alpha=0)
  chrome:     [0.01, 0.92, 0.25, 0.99], // 246×72  — полированный хром / гидроцилиндры (alpha=0)
  taillight:  [0.27, 0.92, 0.37, 0.99], // 102×72  — задние габаритные огни (alpha=0)
  wheels:     [0.39, 0.80, 0.72, 0.91], // 338×113 — полоса катков для гусеничных (alpha=0)
  deckStripe: [0.39, 0.92, 0.72, 0.99], // 338×72  — ВПП-разметка / доп. полоса (alpha=0)
  tireRim:    [0.74, 0.80, 0.89, 0.95], // 154×154 (1:1) — авиационное колесо со ступицей (alpha=0)
  tireTread:  [0.91, 0.80, 0.99, 0.99], // 82×195  — протектор шины (alpha=0)
};

// Эллипс-заливка с раздельной компенсацией X/Y (чтобы на растянутой грани 3D-модели круг оставался ИДЕАЛЬНО круглым!)
function fillEllipse(cv, cx, cy, rx, ry, rgb, w = 1, mask = 0) {
  const X0 = Math.max(0, Math.floor(cx - rx - 2)), X1 = Math.min(cv.W - 1, Math.ceil(cx + rx + 2));
  const Y0 = Math.max(0, Math.floor(cy - ry - 2)), Y1 = Math.min(cv.W - 1, Math.ceil(cy + ry + 2));
  const irx = 1 / Math.max(1, rx), iry = 1 / Math.max(1, ry);
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
    const d = Math.hypot((x - cx) * irx, (y - cy) * iry);
    if (d < 1.05) cv.blendPx(x, y, rgb, w * clamp((1.05 - d) * 14, 0, 1), mask);
  }
}

// Крылатая эмблема Воронов с раздельной шкалой rx/ry (авто-компенсация вытянутых граней!)
function drawRavenEmblemAR(cv, cx, cy, rx, ry, variant = 'normal', wings = true) {
  const blk = [0.05, 0.06, 0.08], navy = [0.10, 0.14, 0.22], crm = [0.84, 0.14, 0.12];
  const gold = [0.96, 0.78, 0.16], wht = [0.95, 0.96, 0.98], amb = [1.0, 0.84, 0.12];
  const pt = (ux, uy) => [cx + ux * rx, cy + uy * ry];
  if (wings) {
    for (const s of [-1, 1]) {
      cv.fillPoly([pt(s * 0.55, -0.18), pt(s * 1.52, -0.54), pt(s * 1.35, -0.12), pt(s * 1.45, 0.04), pt(s * 1.14, 0.22), pt(s * 0.55, 0.28)], blk, 1, 0);
      cv.fillPoly([pt(s * 0.62, -0.10), pt(s * 1.38, -0.42), pt(s * 1.22, -0.08), pt(s * 1.30, 0.03), pt(s * 1.06, 0.15), pt(s * 0.62, 0.21)], variant === 'elite' ? gold : wht, 1, 0);
      const lw = Math.max(2, Math.min(rx, ry) * 0.075);
      cv.drawLine(...pt(s * 0.74, -0.06), ...pt(s * 1.24, -0.25), lw, blk, 1, 0);
      cv.drawLine(...pt(s * 0.72, 0.08),  ...pt(s * 1.15, -0.02), lw, blk, 1, 0);
    }
  }
  fillEllipse(cv, cx, cy, rx * 0.92, ry * 0.92, blk, 1, 0);
  fillEllipse(cv, cx, cy, rx * 0.80, ry * 0.80, variant === 'elite' ? gold : wht, 1, 0);
  fillEllipse(cv, cx, cy, rx * 0.68, ry * 0.68, crm, 1, 0);
  fillEllipse(cv, cx, cy, rx * 0.56, ry * 0.56, navy, 1, 0);
  // Профиль головы ворона + золотой крючковатый клюв
  cv.fillPoly([pt(-0.42, 0.38), pt(-0.46, -0.06), pt(-0.22, -0.38), pt(0.12, -0.34), pt(0.22, -0.08), pt(0.10, 0.36)], blk, 1, 0);
  cv.fillPoly([pt(-0.32, 0.24), pt(-0.34, -0.04), pt(-0.16, -0.26), pt(0.05, -0.22), pt(0.02, 0.18)], [0.18, 0.24, 0.36], 1, 0);
  cv.fillPoly([pt(0.10, -0.20), pt(0.62, -0.06), pt(0.48, 0.16), pt(0.38, 0.04), pt(0.10, 0.08)], blk, 1, 0);
  cv.fillPoly([pt(0.14, -0.14), pt(0.52, -0.04), pt(0.42, 0.09), pt(0.14, 0.03)], gold, 1, 0);
  cv.fillPoly([pt(-0.12, -0.16), pt(0.08, -0.10), pt(-0.04, -0.02)], amb, 1, 0);
}

// Трафаретный код с раздельной шириной (чтобы не растягивался на длинном корпусе!)
function drawStencilCodeAR(cv, code, cx, cy, h, xScale = 1.0, fg = [0.96, 0.97, 0.99]) {
  const S = {
    '0': [[0.2,0.12,0.8,0.12],[0.8,0.12,0.9,0.28],[0.9,0.28,0.9,0.74],[0.9,0.74,0.8,0.90],[0.8,0.90,0.2,0.90],[0.2,0.90,0.1,0.74],[0.1,0.74,0.1,0.28],[0.1,0.28,0.2,0.12]],
    '1': [[0.52,0.12,0.52,0.90],[0.25,0.28,0.52,0.12],[0.25,0.90,0.78,0.90]],
    '2': [[0.14,0.28,0.28,0.12],[0.28,0.12,0.76,0.12],[0.76,0.12,0.88,0.28],[0.88,0.28,0.88,0.44],[0.88,0.44,0.14,0.90],[0.14,0.90,0.90,0.90]],
    '3': [[0.14,0.14,0.78,0.14],[0.78,0.14,0.88,0.28],[0.88,0.28,0.76,0.48],[0.36,0.48,0.76,0.48],[0.76,0.48,0.90,0.68],[0.90,0.68,0.78,0.90],[0.78,0.90,0.14,0.90]],
    '4': [[0.72,0.92,0.72,0.10],[0.72,0.10,0.10,0.62],[0.10,0.62,0.92,0.62]],
    '5': [[0.86,0.12,0.16,0.12],[0.16,0.12,0.16,0.48],[0.16,0.48,0.74,0.48],[0.74,0.48,0.88,0.64],[0.88,0.64,0.88,0.78],[0.88,0.78,0.72,0.90],[0.72,0.90,0.14,0.90]],
    '6': [[0.85,0.12,0.3,0.12],[0.3,0.12,0.12,0.35],[0.12,0.35,0.12,0.82],[0.12,0.82,0.35,0.92],[0.35,0.92,0.78,0.92],[0.78,0.92,0.92,0.72],[0.92,0.72,0.92,0.55],[0.92,0.55,0.72,0.45],[0.72,0.45,0.15,0.45]],
    '7': [[0.12,0.14,0.88,0.14],[0.88,0.14,0.36,0.90]],
    '8': [[0.24,0.12,0.76,0.12],[0.76,0.12,0.86,0.26],[0.86,0.26,0.74,0.48],[0.26,0.48,0.74,0.48],[0.26,0.48,0.14,0.26],[0.14,0.26,0.24,0.12],[0.26,0.48,0.12,0.68],[0.12,0.68,0.24,0.90],[0.24,0.90,0.76,0.90],[0.76,0.90,0.88,0.68],[0.88,0.68,0.74,0.48]],
    '9': [[0.15,0.90,0.70,0.90],[0.70,0.90,0.88,0.68],[0.88,0.68,0.88,0.22],[0.88,0.22,0.68,0.12],[0.68,0.12,0.24,0.12],[0.24,0.12,0.10,0.30],[0.10,0.30,0.10,0.48],[0.10,0.48,0.28,0.56],[0.28,0.56,0.86,0.56]],
    'A': [[0.12,0.90,0.50,0.12],[0.50,0.12,0.88,0.90],[0.26,0.62,0.74,0.62]],
    'V': [[0.10,0.12,0.50,0.90],[0.50,0.90,0.90,0.12]],
    '-': [[0.22,0.52,0.78,0.52]],
  };
  const w = h * 0.56 * xScale;
  const step = w * 1.18;
  const xStart = cx - (code.length - 1) * step * 0.5;
  const thick = Math.max(3.5, Math.min(h, w / 0.56) * 0.15);
  const outline = [0.05, 0.05, 0.07];
  for (let i = 0; i < code.length; i++) {
    const segs = S[code[i]]; if (!segs) continue;
    const gx0 = xStart + i * step - w * 0.5, gy0 = cy - h * 0.5;
    for (const s of segs) cv.drawLine(gx0 + s[0] * w, gy0 + s[1] * h, gx0 + s[2] * w, gy0 + s[3] * h, thick + 5, outline, 1, 0);
    for (const s of segs) cv.drawLine(gx0 + s[0] * w, gy0 + s[1] * h, gx0 + s[2] * w, gy0 + s[3] * h, thick, fg, 1, 0);
  }
}

function buildRavenAtlas(level, opts = {}) {
  const cv = new Canvas(1024);
  const ga = loadGameAssets(), R = ga.rects;
  const isVet = level === 'veteran', isElite = level === 'elite';
  const dmgSet = isElite ? ga.eliteDamages : ga.vetDamages;
  const stampDmg = (idx, dx0, dy0, dx1, dy1, rot = 0) => {
    const p = dmgSet[idx % dmgSet.length];
    cv.blitPatch(p, { x: 0, y: 0, w: p.W, h: p.H }, dx0, dy0, dx1, dy1, {
      useSrcAlphaAsOpacity: true, setTeamMask: 0, rotate: rot, opacity: isElite ? 0.84 : 0.70,
    });
  };
  const code = opts.code || 'V-01';
  // Физическое соотношение сторон борта корпуса (длина/высота) — по умолчанию 4.2:1 (типичный корпус танка/БТР)
  const hullAspect = opts.hullAspect || 4.0;
  const wingAspect = opts.wingAspect || 1.9;
  const finAspect  = opts.finAspect  || 0.65;

  // 1) Авиационная база брони с полной COLORIZE-совместимостью (alpha = 1)
  cv.fillArmorBaseFromGame('raven', opts.armorGain || 1.03);

  // 2) ARMOR CLEAN — крупный лист чистой клёпаной авиаброни (430×307 px!) БЕЗ эмблем и текста!
  {
    const [x0, y0, x1, y1] = cv.regPx(RAVEN_UV.armorClean);
    cv.panelFrame(x0, y0, x1, y1, 4, 32);
    const xm = (x0 + x1) * 0.5, ym = (y0 + y1) * 0.5;
    cv.drawLine(x0 + 10, ym, x1 - 10, ym, 2.2, [0.07, 0.09, 0.13], 0.55);
    cv.drawLine(xm, y0 + 10, xm, y1 - 10, 2.2, [0.07, 0.09, 0.13], 0.55);
    cv.drawLine(x0 + 10, ym + 2, x1 - 10, ym + 2, 1.3, [0.85, 0.90, 0.96], 0.20);
    // Технологический лючок с решёткой охлаждения в углу (аккуратный, без повтора эмблем)
    cv.fillRect(x0 + 26, y0 + 24, x0 + 96, y0 + 70, [0.12, 0.14, 0.18], 0.9, 0);
    for (let ly = y0 + 32; ly <= y0 + 62; ly += 8) cv.drawLine(x0 + 32, ly, x0 + 90, ly, 2.5, [0.46, 0.50, 0.56], 0.85, 0);
    if (isVet || isElite) {
      stampDmg((opts.dmgSeed || 0) + 1, x0 + 220, y0 + 30, x0 + 350, y0 + 125);
      if (isElite) stampDmg((opts.dmgSeed || 0) + 3, x0 + 50, y0 + 180, x0 + 180, y0 + 275);
    }
  }

  // 3) HULL SIDE — борт фюзеляжа (655×205 px, 3.2:1) с авто-компенсацией пропорций hullAspect!
  {
    const [x0, y0, x1, y1] = cv.regPx(RAVEN_UV.hullSide);
    cv.panelFrame(x0, y0, x1, y1, 4, 34);
    const Wp = x1 - x0, Hp = y1 - y0;
    const texAR = Wp / Hp; // ≈ 3.20
    const compX = clamp(texAR / hullAspect, 0.55, 1.35);
    // Нижняя линия отбортовки + ранговые авиационные полосы
    cv.drawLine(x0 + 10, y1 - 30, x1 - 10, y1 - 30, 2.6, [0.08, 0.10, 0.14], 0.72);
    if (isVet || isElite) {
      const stripes = isElite ? 3 : 2;
      for (let s = 0; s < stripes; s++) {
        const sy = y1 - 18 - s * 11;
        cv.fillRect(x0 + 10, sy - 3.5, x1 - 10, sy + 4.5, [0.05, 0.06, 0.08], 1, 0);
        const col = (isElite && s === 1) ? [0.88, 0.16, 0.12] : (isElite ? [0.97, 0.80, 0.16] : [0.95, 0.96, 0.98]);
        cv.fillRect(x0 + 10, sy - 1.5, x1 - 10, sy + 2.5, col, 1, 0);
      }
    }
    // Чёткий бортовой номер (компенсированный по ширине, всегда читается ровно!)
    drawStencilCodeAR(cv, code, x0 + Wp * 0.29, y0 + Hp * 0.42, Hp * 0.42, compX, [0.96, 0.97, 0.99]);
    // Крылатая эмблема Воронов (компенсированная: на 3D-борту ИДЕАЛЬНЫЙ круг!)
    const ry = Hp * 0.27;
    drawRavenEmblemAR(cv, x0 + Wp * 0.74, y0 + Hp * 0.44, ry * compX, ry, level, true);
    if (isVet || isElite) stampDmg(opts.dmgSeed || 0, x0 + Wp * 0.46, y0 + 16, x0 + Wp * 0.58, y0 + Hp * 0.55);
  }

  // 4) HULL TOP — 1:1 квадратная центральная палуба / крыша башни с идеально круглой эмблемой!
  {
    const [x0, y0, x1, y1] = cv.regPx(RAVEN_UV.hullTop);
    cv.panelFrame(x0, y0, x1, y1, 4, 28);
    const Wp = x1 - x0, Hp = y1 - y0;
    const cx = (x0 + x1) * 0.5, cy = (y0 + y1) * 0.48;
    const r = Math.min(Wp, Hp) * 0.25;
    drawRavenEmblemAR(cv, cx, cy, r, r, level, true);
    if (isElite) {
      for (let k = 0; k < 4; k++) cv.fillCircle(x0 + 26 + k * 20, y1 - 24, 6, [0.96, 0.80, 0.14], 1, 0);
      stampDmg(2, x0 + 18, y0 + 16, x0 + 102, y0 + 72);
    }
  }

  // 5) WING — горизонтальное крыло (430×236 px, 1.82:1) с круглой кокардой и чёткими полосами!
  {
    const [x0, y0, x1, y1] = cv.regPx(RAVEN_UV.wing);
    cv.panelFrame(x0, y0, x1, y1, 4, 34);
    const Wp = x1 - x0, Hp = y1 - y0;
    const compX = clamp((Wp / Hp) / wingAspect, 0.65, 1.40);
    // Усиленная металлическая передняя кромка
    cv.fillRect(x0 + 4, y0 + 4, x1 - 4, y0 + 24, [0.60, 0.64, 0.70], 0.94, 0);
    cv.drawLine(x0 + 4, y0 + 24, x1 - 4, y0 + 24, 3, [0.08, 0.10, 0.14], 0.9, 0);
    // Полосы быстрого опознавания поперёк крыла
    const bx = x0 + Wp * 0.72;
    cv.fillRect(bx - 16, y0 + 26, bx + 16, y1 - 8, [0.06, 0.07, 0.09], 1, 0);
    cv.fillRect(bx - 11, y0 + 26, bx + 11, y1 - 8, isElite ? [0.96, 0.78, 0.14] : [0.94, 0.95, 0.97], 1, 0);
    if (isVet || isElite) {
      const bx2 = x0 + Wp * 0.83;
      cv.fillRect(bx2 - 12, y0 + 26, bx2 + 12, y1 - 8, [0.06, 0.07, 0.09], 1, 0);
      cv.fillRect(bx2 - 8, y0 + 26, bx2 + 8, y1 - 8, isElite ? [0.86, 0.14, 0.12] : [0.96, 0.78, 0.14], 1, 0);
    }
    // Ровная круглая авиационная кокарда на крыле!
    const ry = Hp * 0.25, rx = ry * compX;
    const cx = x0 + Wp * 0.36, cy = y0 + Hp * 0.57;
    fillEllipse(cv, cx, cy, rx, ry, [0.05, 0.06, 0.08], 1, 0);
    fillEllipse(cv, cx, cy, rx * 0.82, ry * 0.82, [0.95, 0.96, 0.98], 1, 0);
    fillEllipse(cv, cx, cy, rx * 0.58, ry * 0.58, [0.84, 0.14, 0.12], 1, 0);
    fillEllipse(cv, cx, cy, rx * 0.30, ry * 0.30, [0.10, 0.14, 0.22], 1, 0);
    if (isElite) stampDmg(1, x0 + 20, y0 + 30, x0 + 118, y1 - 22);
  }

  // 6) TAIL FIN — вертикальный хвостовой киль (154×266 px, 0.58:1 — без растяжения!)
  {
    const [x0, y0, x1, y1] = cv.regPx(RAVEN_UV.tailFin);
    cv.panelFrame(x0, y0, x1, y1, 3, 28);
    const Wp = x1 - x0, Hp = y1 - y0;
    const compX = clamp((Wp / Hp) / finAspect, 0.65, 1.40);
    // Верхняя алая/золотая полоса киля
    cv.fillRect(x0 + 4, y0 + 10, x1 - 4, y0 + 34, [0.05, 0.06, 0.08], 1, 0);
    cv.fillRect(x0 + 4, y0 + 14, x1 - 4, y0 + 30, isElite ? [0.96, 0.78, 0.14] : [0.86, 0.14, 0.12], 1, 0);
    if (isVet || isElite) {
      cv.fillRect(x0 + 4, y0 + 40, x1 - 4, y0 + 56, [0.05, 0.06, 0.08], 1, 0);
      cv.fillRect(x0 + 4, y0 + 43, x1 - 4, y0 + 53, [0.95, 0.96, 0.98], 1, 0);
    }
    // Ровная круглая эмблема киля (НЕ сплющенная!)
    const r = Wp * 0.32;
    drawRavenEmblemAR(cv, (x0 + x1) * 0.5, y0 + Hp * 0.60, r * compX, r, level, false);
  }

  // 7) CANOPY — стекло истребителя
  {
    const [x0, y0, x1, y1] = cv.regPx(RAVEN_UV.canopy);
    drawCanopyPanel(cv, x0, y0, x1, y1, opts.canopyTint || [0.14, 0.44, 0.72]);
  }

  // 8) RADAR — чёткая 1:1 полярная сетка радара + свечение облучателя (256×256 px!)
  {
    const [x0, y0, x1, y1] = cv.regPx(RAVEN_UV.radar);
    cv.fillRect(x0, y0, x1, y1, [0.22, 0.25, 0.30], 1, 0);
    for (let x = x0 + 6; x < x1 - 6; x += 12) cv.drawLine(x, y0 + 6, x, y1 - 6, 1.8, [0.10, 0.13, 0.18], 0.85, 0);
    for (let y = y0 + 6; y < y1 - 6; y += 12) cv.drawLine(x0 + 6, y, x1 - 6, y, 1.8, [0.10, 0.13, 0.18], 0.85, 0);
    const cx = (x0 + x1) * 0.5, cy = (y0 + y1) * 0.5, rad = (x1 - x0) * 0.44;
    cv.drawRing(cx, cy, rad * 0.92, rad, [0.68, 0.72, 0.78], 0.95, 0);
    cv.drawRing(cx, cy, rad * 0.62, rad * 0.68, [0.96, 0.78, 0.14], 0.90, 0);
    cv.fillCircle(cx, cy, rad * 0.36, [0.10, 0.66, 0.94], 0.84, 0);
    cv.drawRing(cx, cy, rad * 0.32, rad * 0.40, [0.96, 0.98, 1.0], 0.94, 0);
    cv.drawLine(cx - rad, cy, cx + rad, cy, 2.2, [0.10, 0.14, 0.18], 0.75, 0);
    cv.drawLine(cx, cy - rad, cx, cy + rad, 2.2, [0.10, 0.14, 0.18], 0.75, 0);
  }

  // 9) TURBINE — сопло турбины с лопатками и форсажным ядром
  {
    const [x0, y0, x1, y1] = cv.regPx(RAVEN_UV.turbine);
    cv.fillRect(x0, y0, x1, y1, [0.14, 0.16, 0.20], 1, 0);
    const cx = (x0 + x1) * 0.5, cy = (y0 + y1) * 0.5;
    const rad = Math.min(x1 - x0, y1 - y0) * 0.45;
    cv.fillCircle(cx, cy, rad, [0.36, 0.40, 0.45], 1, 0);
    cv.fillCircle(cx, cy, rad * 0.82, [0.08, 0.10, 0.14], 1, 0);
    for (let k = 0; k < 12; k++) {
      const a = k * Math.PI / 6;
      cv.drawLine(cx, cy, cx + Math.cos(a) * rad * 0.78, cy + Math.sin(a) * rad * 0.78, 2.5, [0.24, 0.28, 0.34], 0.9, 0);
    }
    const coreCol = opts.afterburnerOrange ? [0.98, 0.50, 0.08] : [0.14, 0.72, 0.98];
    const hotCol  = opts.afterburnerOrange ? [1.00, 0.88, 0.26] : [0.76, 0.96, 1.00];
    cv.fillCircle(cx, cy, rad * 0.56, coreCol, 0.95, 0);
    cv.fillCircle(cx, cy, rad * 0.30, hotCol, 1, 0);
  }

  // 10) MISSILE — чёткая высокая белая ракета (123×287 px)
  {
    const [x0, y0, x1, y1] = cv.regPx(RAVEN_UV.missile);
    const H = y1 - y0;
    cv.fillRect(x0, y0, x1, y1, [0.91, 0.93, 0.96], 1, 0);
    cv.fillRect(x0, y0, x1, y0 + H * 0.14, [0.16, 0.18, 0.22], 1, 0);
    cv.fillRect(x0, y0 + H * 0.32, x1, y0 + H * 0.38, [0.06, 0.06, 0.08], 1, 0);
    cv.fillRect(x0, y0 + H * 0.38, x1, y0 + H * 0.44, [0.96, 0.78, 0.08], 1, 0);
    cv.fillRect(x0, y0 + H * 0.66, x1, y0 + H * 0.72, [0.06, 0.06, 0.08], 1, 0);
    cv.fillRect(x0, y0 + H * 0.72, x1, y1, [0.88, 0.14, 0.10], 1, 0);
    cv.fillRect(x0, y0 + H * 0.90, x1, y1, [0.98, 0.78, 0.14], 1, 0);
  }

  // 11) HAZARD — ПРОЦЕДУРНЫЕ ЧЁТКИЕ 1024px диагональные жёлто-чёрные полосы (без мыла и пикселей!)
  {
    const [x0, y0, x1, y1] = cv.regPx(RAVEN_UV.hazard);
    const period = 36;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const p = ((x - x0) + (y - y0)) % period;
      const isYel = p < period * 0.5;
      const edge = Math.min(Math.abs(p - period * 0.5), Math.min(p, period - p));
      const shade = 0.88 + 0.12 * Math.sin((y - y0) * 0.06);
      const col = isYel ? [0.96 * shade, 0.76 * shade, 0.08] : [0.09 * shade, 0.10 * shade, 0.12 * shade];
      cv.blendPx(x, y, edge < 1.5 ? [0.35, 0.28, 0.08] : col, 1, 0);
    }
    cv.panelFrame(x0, y0, x1, y1, 3, 0);
  }

  // 12) CRIMSON — чёткий клёпаный алый авиационный лист (236×154 px)
  {
    const [x0, y0, x1, y1] = cv.regPx(RAVEN_UV.crimson);
    cv.blitPatch(R.fuelRedMetal.img, R.fuelRedMetal, x0, y0, x1, y1, { setTeamMask: 0, gain: 1.06 });
    cv.panelFrame(x0, y0, x1, y1, 3, 28);
  }

  // 13) DECK STRIPE — ВПП-разметка (для авианосца Альбатрос и спецпанелей)
  {
    const [x0, y0, x1, y1] = cv.regPx(RAVEN_UV.deckStripe);
    cv.fillRect(x0, y0, x1, y1, [0.18, 0.20, 0.24], 1, 0);
    const cy = (y0 + y1) * 0.5;
    for (let x = x0 + 12; x < x1 - 12; x += 40) cv.fillRect(x, cy - 5, x + 22, cy + 5, [0.96, 0.97, 0.99], 0.95, 0);
    cv.fillRect(x0 + 4, y0 + 6, x1 - 4, y0 + 12, [0.96, 0.78, 0.14], 0.92, 0);
    cv.fillRect(x0 + 4, y1 - 12, x1 - 4, y1 - 6, [0.96, 0.78, 0.14], 0.92, 0);
  }

  // 14) Колёса, катки, металл, хром, огни из реальных ассетов игры
  { const [x0, y0, x1, y1] = cv.regPx(RAVEN_UV.wheels);    cv.blitPatch(R.rabbitWheels.img, R.rabbitWheels, x0, y0, x1, y1, { setTeamMask: 0, tint: [0.86, 0.92, 1.04] }); }
  { const [x0, y0, x1, y1] = cv.regPx(RAVEN_UV.tireRim);   cv.blitPatch(R.rabbitTireRim.img, R.rabbitTireRim, x0, y0, x1, y1, { setTeamMask: 0, tint: [0.92, 0.95, 1.02] }); }
  { const [x0, y0, x1, y1] = cv.regPx(RAVEN_UV.tireTread); cv.blitPatch(R.rabbitTireTrd.img, R.rabbitTireTrd, x0, y0, x1, y1, { setTeamMask: 0 }); }
  { const [x0, y0, x1, y1] = cv.regPx(RAVEN_UV.metal);     cv.blitPatch(R.mantletMetal.img, R.mantletMetal, x0, y0, x1, y1, { setTeamMask: 0, gain: 0.95 }); }
  { const [x0, y0, x1, y1] = cv.regPx(RAVEN_UV.darkMetal); cv.blitPatch(R.mantletMetal.img, R.mantletMetal, x0, y0, x1, y1, { setTeamMask: 0, gain: 0.50 }); }
  { const [x0, y0, x1, y1] = cv.regPx(RAVEN_UV.chrome);    cv.blitPatch(R.chromeMetal.img, R.chromeMetal, x0, y0, x1, y1, { setTeamMask: 0, rotate: 90, gain: 1.30 }); }
  { const [x0, y0, x1, y1] = cv.regPx(RAVEN_UV.lights);    cv.blitPatch(R.headlight.img, R.headlight, x0, y0, x1, y1, { setTeamMask: 0 }); }
  { const [x0, y0, x1, y1] = cv.regPx(RAVEN_UV.taillight); cv.blitPatch(R.taillight.img, R.taillight, x0, y0, x1, y1, { setTeamMask: 0, rotate: 90 }); }

  if (opts.customPaint) opts.customPaint(cv, RAVEN_UV, level, ga, stampDmg);
  return cv.downsample2x();
}

// ─── Авиационные 3D-примитивы (строго замкнутые, 0 вывернутых граней, ровные UV!) ───

// Стреловидная пара крыльев / обтекателей (широкие крылья -> UV.wing с кокардой, узкие бортовые щитки -> UV.armorClean без растяжения!)
function addWingPair(m, { xIn, xOut, yRootB, yRootF, yTipB, yTipF, zRoot, zTip, tRoot = 12, tTip = 6, reg = RAVEN_UV.wing, tipReg = RAVEN_UV.crimson }) {
  const span = Math.abs(xOut - xIn), chord = Math.abs(yRootF - yRootB);
  const useReg = (reg === RAVEN_UV.wing && chord > span * 2.1) ? RAVEN_UV.armorClean : reg;
  for (const sx of [-1, 1]) {
    const xi = sx * xIn, xo = sx * xOut;
    const R0 = [xi, yRootB, zRoot - tRoot * 0.5], R1 = [xi, yRootF, zRoot - tRoot * 0.5];
    const R2 = [xi, yRootF, zRoot + tRoot * 0.5], R3 = [xi, yRootB, zRoot + tRoot * 0.5];
    const T0 = [xo, yTipB,  zTip  - tTip  * 0.5], T1 = [xo, yTipF,  zTip  - tTip  * 0.5];
    const T2 = [xo, yTipF,  zTip  + tTip  * 0.5], T3 = [xo, yTipB,  zTip  + tTip  * 0.5];
    if (sx > 0) {
      m.addQuad(R3, R2, T2, T3, useReg, [0, 1], [0, 0], [1, 0], [1, 1]);
      m.addQuad(R0, T0, T1, R1, useReg, [0, 1], [1, 1], [1, 0], [0, 0]);
      m.addQuad(R1, T1, T2, R2, RAVEN_UV.metal);
      m.addQuad(R3, T3, T0, R0, RAVEN_UV.darkMetal);
      m.addQuad(T0, T3, T2, T1, tipReg);
      m.addQuad(R0, R1, R2, R3, RAVEN_UV.darkMetal);
    } else {
      m.addQuad(R2, R3, T3, T2, useReg, [0, 0], [0, 1], [1, 1], [1, 0]);
      m.addQuad(T0, R0, R1, T1, useReg, [1, 1], [0, 1], [0, 0], [1, 0]);
      m.addQuad(T1, R1, R2, T2, RAVEN_UV.metal);
      m.addQuad(T3, R3, R0, T0, RAVEN_UV.darkMetal);
      m.addQuad(T3, T0, T1, T2, tipReg);
      m.addQuad(R1, R0, R3, R2, RAVEN_UV.darkMetal);
    }
  }
}

// Пара вертикальных или V-образных хвостовых килей (собственный вертикальный UV.tailFin!)
function addTailFinPair(m, { xRoot, xTip, yRootB, yRootF, yTipB, yTipF, zBot, zTop, thick = 9, reg = RAVEN_UV.tailFin, tipReg = RAVEN_UV.crimson }) {
  for (const sx of [-1, 1]) {
    const xr = sx * xRoot, xt = sx * xTip, ht = thick * 0.5;
    const B0 = [xr - ht, yRootB, zBot], B1 = [xr + ht, yRootB, zBot];
    const B2 = [xr + ht, yRootF, zBot], B3 = [xr - ht, yRootF, zBot];
    const T0 = [xt - ht * 0.6, yTipB, zTop], T1 = [xt + ht * 0.6, yTipB, zTop];
    const T2 = [xt + ht * 0.6, yTipF, zTop], T3 = [xt - ht * 0.6, yTipF, zTop];
    m.addQuad(T0, T1, T2, T3, tipReg);
    m.addQuad(B3, B2, B1, B0, RAVEN_UV.darkMetal);
    m.addQuad(B0, B1, T1, T0, RAVEN_UV.darkMetal);
    m.addQuad(B2, B3, T3, T2, RAVEN_UV.metal);
    m.addQuad(B3, B0, T0, T3, reg, [0, 1], [1, 1], [1, 0], [0, 0]);
    m.addQuad(B1, B2, T2, T1, reg, [1, 1], [0, 1], [0, 0], [1, 0]);
  }
}

function addTurbinePair(m, { xOff, yBack, yFront, z, rBody = 24, rNozzle = 19, segs = 10 }) {
  for (const sx of [-1, 1]) {
    const cx = sx * xOff;
    m.addLatheY(cx, z, [
      [yBack - 14, rNozzle * 0.85],
      [yBack,      rNozzle],
      [yBack + 12, rBody],
      [yFront - 18, rBody],
      [yFront,     rBody * 0.78],
    ], segs, RAVEN_UV.darkMetal, { smooth: true, capStart: true, capEnd: true, capReg: RAVEN_UV.turbine });
    m.addLatheY(cx, z, [
      [yBack - 16, rNozzle * 0.68],
      [yBack - 13, rNozzle * 0.74],
    ], segs, RAVEN_UV.turbine, { smooth: false, capStart: true, capEnd: true, capReg: RAVEN_UV.turbine });
  }
}

function addCanopy(m, { xBot, xTop, yB, yF, zBot, zTop, yTopB, yTopF }) {
  const yb = yTopB ?? lerp(yB, yF, 0.18), yf = yTopF ?? lerp(yB, yF, 0.74);
  m.addFrustum([-xBot, xBot, yB, yF], [-xTop, xTop, yb, yf], zBot, zTop, {
    all: RAVEN_UV.canopy, bot: false,
  });
  m.addBox(-xBot - 4, xBot + 4, yB - 4, yF + 4, zBot - 4, zBot + 5, { all: RAVEN_UV.darkMetal });
}

function addMissile(m, { x, y, z, len = 140, r = 13, pitch = 0, finSpan = 24 }) {
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const pt = (lx, ly, lz) => [x + lx, y + ly * cp - lz * sp, z + ly * sp + lz * cp];
  const prof = [
    [0, r * 0.82], [len * 0.08, r], [len * 0.40, r], [len * 0.70, r],
    [len * 0.84, r * 0.75], [len * 0.94, r * 0.36], [len, r * 0.08],
  ];
  const segs = 8;
  const rings = prof.map(([ly, rad]) => {
    const ring = [];
    for (let i = 0; i < segs; i++) {
      const a = 2 * Math.PI * i / segs;
      ring.push(pt(Math.cos(a) * rad, ly, Math.sin(a) * rad));
    }
    return ring;
  });
  m.addLoft(rings, RAVEN_UV.missile, { smooth: true, capStart: true, capEnd: true, vStart: 0.02, vEnd: 0.98 });
  const f0 = len * 0.04, f1 = len * 0.24, t = Math.max(2.5, r * 0.20);
  m.addQuad(pt(-finSpan, f0, t), pt(finSpan, f0, t), pt(finSpan * 0.7, f1, t), pt(-finSpan * 0.7, f1, t), RAVEN_UV.darkMetal);
  m.addQuad(pt(finSpan, f0, -t), pt(-finSpan, f0, -t), pt(-finSpan * 0.7, f1, -t), pt(finSpan * 0.7, f1, -t), RAVEN_UV.darkMetal);
  m.addQuad(pt(-finSpan, f0, -t), pt(-finSpan, f0, t), pt(-finSpan * 0.7, f1, t), pt(-finSpan * 0.7, f1, -t), RAVEN_UV.darkMetal);
  m.addQuad(pt(finSpan, f0, t), pt(finSpan, f0, -t), pt(finSpan * 0.7, f1, -t), pt(finSpan * 0.7, f1, t), RAVEN_UV.darkMetal);
  m.addQuad(pt(-finSpan, f0, -t), pt(finSpan, f0, -t), pt(finSpan, f0, t), pt(-finSpan, f0, t), RAVEN_UV.darkMetal);
  m.addQuad(pt(t, f0, -finSpan), pt(t, f0, finSpan), pt(t, f1, finSpan * 0.7), pt(t, f1, -finSpan * 0.7), RAVEN_UV.darkMetal);
  m.addQuad(pt(-t, f0, finSpan), pt(-t, f0, -finSpan), pt(-t, f1, -finSpan * 0.7), pt(-t, f1, finSpan * 0.7), RAVEN_UV.darkMetal);
  m.addQuad(pt(-t, f0, -finSpan), pt(t, f0, -finSpan), pt(t, f1, -finSpan * 0.7), pt(-t, f1, -finSpan * 0.7), RAVEN_UV.darkMetal);
  m.addQuad(pt(t, f0, finSpan), pt(-t, f0, finSpan), pt(-t, f1, finSpan * 0.7), pt(t, f1, finSpan * 0.7), RAVEN_UV.darkMetal);
  m.addQuad(pt(-t, f0, -finSpan), pt(-t, f0, finSpan), pt(t, f0, finSpan), pt(t, f0, -finSpan), RAVEN_UV.darkMetal);
}

function makeTrackedSpec({
  trackX = 148, trackW = 34, yB = -236, yF = 236, zB = -46, zT = 44,
  scale = 0.90, hullZ = 28,
  testMesh, turretMesh, turretPos = [0, 12, 88],
  csoMesh = null, csoPos = [0, 140, 10], muzzlePos = [0, 180, 0],
  headlightY = 240, headlightX = 110, headlightZ = 24,
  taillightY = -240, taillightX = 110, taillightZ = 24,
}) {
  const lan = new Mesh();
  const xHull = trackX - trackW * 0.5 - 6;
  lan.addBox(-xHull, xHull, yB + 26, yF - 26, zB + 8, zT - 4, { all: RAVEN_UV.darkMetal });
  for (const sx of [-1, 1]) {
    const cx = sx * trackX;
    lan.addBox(cx - trackW * 0.42, cx + trackW * 0.42, yB + 16, yF - 16, zB + 6, zT - 6, {
      all: RAVEN_UV.darkMetal, left: RAVEN_UV.wheels, right: RAVEN_UV.wheels,
    });
  }
  const trkR = new Mesh(); buildTrackLoop(trkR, trackW, yB, yF, zB, zT, yB + 38, yF - 38, 2.7);
  const trkL = new Mesh(); buildTrackLoop(trkL, trackW, yB, yF, zB, zT, yB + 38, yF - 38, 2.7);

  const nodes = [
    { name: 'Lanctalp',    parent: -1, m: ROOT_M(0, Math.round(-zB * scale + 2), 0, scale), mesh: lan },
    { name: 'Test',        parent:  0, m: ID_M(0, 0, hullZ), mesh: testMesh },
  ];
  let turIdx = -1;
  if (turretMesh) {
    turIdx = nodes.length;
    nodes.push({ name: 'Lovegtorony', parent: 1, m: ID_M(...turretPos), mesh: turretMesh });
  }
  if (csoMesh && turIdx >= 0) {
    const csoIdx = nodes.length;
    nodes.push({ name: 'Cso', parent: turIdx, m: ID_M(...csoPos), mesh: csoMesh });
    nodes.push({ name: '_Torkolattuz', parent: csoIdx, m: ID_M(...muzzlePos), helper: true });
  }
  nodes.push(
    { name: '_glow0piros', parent: 1, m: ID_M(-taillightX, taillightY, taillightZ, 0.24, -1, 0.24), helper: true },
    { name: '_glow1piros', parent: 1, m: ID_M( taillightX, taillightY, taillightZ, -0.24, -1, 0.24), helper: true },
    { name: '_glow2feher', parent: 1, m: ID_M(-headlightX, headlightY, headlightZ, 0.24, 1, 0.24), helper: true },
    { name: '_glow3feher', parent: 1, m: ID_M( headlightX, headlightY, headlightZ, -0.24, 1, 0.24), helper: true },
    { name: 'Chain R 001', parent: -1, m: ROOT_M(-Math.round(trackX * scale), Math.round(-zB * scale + 2), 0, scale), mesh: trkR, isTrack: true },
    { name: 'Chain L 001', parent: -1, m: ROOT_M( Math.round(trackX * scale), Math.round(-zB * scale + 2), 0, scale), mesh: trkL, isTrack: true },
  );
  return { trackTex: 'ny_lanctalp.tga', nodes };
}

function makeWheeledSpec({
  wheelX = 116, wheelYF = 122, wheelYB = -122, wheelR = 48, wheelW = 24,
  bodyY = 64,
  testMesh, turretMesh = null, turretPos = [0, -10, 96],
  csoMesh = null, csoPos = [0, 72, 16], muzzlePos = [0, 140, 0],
  flagPos = [78, -146, 98],
  headlightY = 200, headlightX = 76, headlightZ = 22,
  taillightY = -196, taillightX = 76, taillightZ = 24,
}) {
  const mkWheel = () => { const w = new Mesh(); buildWheelMesh(w, wheelW, wheelR, 14, RAVEN_UV.tireTread, RAVEN_UV.tireRim); return w; };
  const flag = new Mesh();
  flag.addLatheZ(0, 0, [[0, 4.5, 4.5], [16, 3.2, 3.2], [150, 1.4, 1.4]], 6, RAVEN_UV.metal, { smooth: true, capStart: true, capEnd: true });

  const nodes = [
    { name: 'Wheel R 1 N001', parent: -1, m: ROOT_M(-wheelX, wheelR, -wheelYF), mesh: mkWheel() },
    { name: 'Wheel L 1 N001', parent: -1, m: ROOT_M( wheelX, wheelR, -wheelYF), mesh: mkWheel() },
    { name: 'Wheel R 0 N002', parent: -1, m: ROOT_M(-wheelX, wheelR, -wheelYB), mesh: mkWheel() },
    { name: 'Wheel L 0 N002', parent: -1, m: ROOT_M( wheelX, wheelR, -wheelYB), mesh: mkWheel() },
    { name: 'Test',           parent: -1, m: ROOT_M(0, bodyY, 0), mesh: testMesh },
  ];
  const testIdx = 4;
  let turIdx = -1;
  if (turretMesh) {
    turIdx = nodes.length;
    nodes.push({ name: 'Lovegtorony', parent: testIdx, m: ID_M(...turretPos), mesh: turretMesh });
  }
  if (csoMesh && turIdx >= 0) {
    const csoIdx = nodes.length;
    nodes.push({ name: 'Cso', parent: turIdx, m: ID_M(...csoPos), mesh: csoMesh });
    nodes.push({ name: '_Torkolattuz', parent: csoIdx, m: ID_M(...muzzlePos), helper: true });
  }
  nodes.push(
    { name: 'Zaszlorud',   parent: testIdx, m: ID_M(...flagPos), mesh: flag },
    { name: '_glow0piros', parent: testIdx, m: ID_M(-taillightX, taillightY, taillightZ, 0.26, -1, 0.26), helper: true },
    { name: '_glow1piros', parent: testIdx, m: ID_M( taillightX, taillightY, taillightZ, -0.26, -1, 0.26), helper: true },
    { name: '_glow2feher', parent: testIdx, m: ID_M(-headlightX, headlightY, headlightZ, 0.26, 1, 0.26), helper: true },
    { name: '_glow3feher', parent: testIdx, m: ID_M( headlightX, headlightY, headlightZ, -0.26, 1, 0.26), helper: true },
  );
  return { nodes };
}

module.exports = {
  RAVEN_UV, ROOT_M, ID_M,
  fillEllipse, drawRavenEmblemAR, drawStencilCodeAR, buildRavenAtlas,
  addWingPair, addTailFinPair, addTurbinePair, addCanopy, addMissile,
  makeTrackedSpec, makeWheeledSpec,
};

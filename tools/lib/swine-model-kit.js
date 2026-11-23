'use strict';
// Общая библиотека для создания 3D-моделей (.4d), текстур (.dxt DXT5 с динамической командной маской),
// экспорта .obj, иконок магазина 128×128 и рендеров-превью под движок Gepard (S.W.I.N.E. HD).
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const ANIF = require('../swine-anif.js');

const GAME_DIR = process.env.SWINE_DIR || 'A:/SteamLibrary/steamapps/common/SWINE HD Remaster';
const PAK_PATH = path.join(GAME_DIR, 'gamedata/base/base.pak');
const MAGIC = Buffer.from([0x53, 0x72, 0x1A, 0x1B, 0x0D, 0x0A, 0x87, 0x0A]);

// ─── Векторная математика ───
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;

function uvRect(reg, u, v) {
  return [reg[0] + (reg[2] - reg[0]) * u, reg[1] + (reg[3] - reg[1]) * v];
}

// ─── Чтение файлов из base.pak ───
function readPakEntry(pakPath, want) {
  const fd = fs.openSync(pakPath, 'r'), h = Buffer.alloc(16); fs.readSync(fd, h, 0, 16, 0);
  const isz = h.readUInt32LE(12), ib = Buffer.alloc(isz); fs.readSync(fd, ib, 0, isz, 16);
  let p = 0, prev = ''; const par = {};
  while (p < isz) {
    const pre = ib[p], nl = ib[p + 1], src = (p in par) ? par[p] : prev;
    const name = src.slice(0, pre) + ib.toString('latin1', p + 2, p + 2 + nl), q = p + 2 + nl;
    const C = ib.readUInt32LE(q + 9); if (C) par[C] = name;
    if (name.toLowerCase() === want.toLowerCase()) {
      const b = Buffer.alloc(ib.readUInt32LE(q + 4));
      fs.readSync(fd, b, 0, b.length, 16 + isz + ib.readUInt32LE(q));
      fs.closeSync(fd);
      return b;
    }
    prev = name; p = q + 13;
  }
  fs.closeSync(fd);
  throw new Error('not in pak: ' + want);
}

// ─── 3D-меш строитель (поддерживает плоские и сглаженные нормали, лофты, трубы, тела вращения) ───
class Mesh {
  constructor() { this.v = []; this.f = []; }

  addVert(p, n, uv) {
    const idx = this.v.length;
    this.v.push([p[0], p[1], p[2], n[0], n[1], n[2], uv[0], uv[1]]);
    return idx;
  }

  addTri(a, b, c, uvA, uvB, uvC) {
    const n = norm(cross(sub(b, a), sub(c, a)));
    const i = this.v.length;
    this.v.push([...a, ...n, ...uvA], [...b, ...n, ...uvB], [...c, ...n, ...uvC]);
    this.f.push([i, i + 1, i + 2]);
  }

  addQuad(a, b, c, d, reg, uvA = [0, 0], uvB = [1, 0], uvC = [1, 1], uvD = [0, 1]) {
    const n = norm(cross(sub(b, a), sub(c, a)));
    const i = this.v.length;
    const ua = reg ? uvRect(reg, uvA[0], uvA[1]) : uvA;
    const ub = reg ? uvRect(reg, uvB[0], uvB[1]) : uvB;
    const uc = reg ? uvRect(reg, uvC[0], uvC[1]) : uvC;
    const ud = reg ? uvRect(reg, uvD[0], uvD[1]) : uvD;
    this.v.push([...a, ...n, ...ua], [...b, ...n, ...ub], [...c, ...n, ...uc], [...d, ...n, ...ud]);
    this.f.push([i, i + 1, i + 2], [i, i + 2, i + 3]);
  }

  addPoly(pts, uvs) {
    const n = norm(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])));
    const base = this.v.length;
    for (let k = 0; k < pts.length; k++) this.v.push([...pts[k], ...n, ...uvs[k]]);
    for (let k = 1; k + 1 < pts.length; k++) this.f.push([base, base + k, base + k + 1]);
  }

  addFrustum(lo, hi, z0, z1, regs) {
    const [lx0, lx1, ly0, ly1] = lo;
    const [hx0, hx1, hy0, hy1] = hi;
    const B0 = [lx0, ly0, z0], B1 = [lx1, ly0, z0], B2 = [lx1, ly1, z0], B3 = [lx0, ly1, z0];
    const T0 = [hx0, hy0, z1], T1 = [hx1, hy0, z1], T2 = [hx1, hy1, z1], T3 = [hx0, hy1, z1];
    const rDef = regs.all || regs.top || [0, 0, 1, 1];
    // Все 6 граней строго нормалью НАРУЖУ в локальных координатах (после ROOT_M det=-1 даёт правильный обход игры!)
    if (regs.top !== false)   this.addQuad(T0, T1, T2, T3, regs.top || rDef, [0, 1], [1, 1], [1, 0], [0, 0]);
    if (regs.bot !== false)   this.addQuad(B3, B2, B1, B0, regs.bot || rDef, [0, 0], [1, 0], [1, 1], [0, 1]);
    if (regs.back !== false)  this.addQuad(B0, B1, T1, T0, regs.back || rDef, [0, 1], [1, 1], [1, 0], [0, 0]);
    if (regs.front !== false) this.addQuad(B2, B3, T3, T2, regs.front || rDef, [0, 1], [1, 1], [1, 0], [0, 0]);
    if (regs.right !== false) this.addQuad(B3, B0, T0, T3, regs.right || rDef, [1, 1], [0, 1], [0, 0], [1, 0]);
    if (regs.left !== false)  this.addQuad(B1, B2, T2, T1, regs.left || rDef, [1, 1], [0, 1], [0, 0], [1, 0]);
  }

  addBox(x0, x1, y0, y1, z0, z1, regs) {
    this.addFrustum([x0, x1, y0, y1], [x0, x1, y0, y1], z0, z1, regs);
  }

  // Призма по X из 2D-профиля [[y, z, hx?], ...] (CCW при взгляде с +X)
  addPrismX(profile, defaultHx, sideReg, stripReg, opts = {}) {
    const pts = profile.map(p => [p[0], p[1], p[2] !== undefined ? p[2] : defaultHx]);
    const L = pts.map(([y, z, hx]) => [-hx, y, z]);
    const R = pts.map(([y, z, hx]) => [hx, y, z]);
    const ys = pts.map(p => p[0]), zs = pts.map(p => p[1]);
    const yMin = Math.min(...ys), yMax = Math.max(...ys) || 1;
    const zMin = Math.min(...zs), zMax = Math.max(...zs) || 1;

    // Проверяем знак 2D-площади профиля (если вдруг задан CW — нормали всё равно смотрят наружу!)
    let area2 = 0;
    for (let k = 0; k < pts.length; k++) {
      const a = pts[k], b = pts[(k + 1) % pts.length];
      area2 += a[0] * b[1] - b[0] * a[1];
    }
    const isCCW = area2 >= 0;

    if (sideReg !== false) {
      const rRight = opts.rightReg || sideReg;
      const rLeft = opts.leftReg || sideReg;
      const rPts = isCCW ? R : [...R].reverse();
      const lPts = isCCW ? [...L].reverse() : L;
      const rSrc = isCCW ? pts : [...pts].reverse();
      const lSrc = isCCW ? [...pts].reverse() : pts;
      const uvR = rSrc.map(([y, z]) => uvRect(rRight, (y - yMin) / (yMax - yMin || 1), 1 - (z - zMin) / (zMax - zMin || 1)));
      this.addPoly(rPts, uvR);
      const uvL = lSrc.map(([y, z]) => uvRect(rLeft, (y - yMin) / (yMax - yMin || 1), 1 - (z - zMin) / (zMax - zMin || 1)));
      this.addPoly(lPts, uvL);
    }

    for (let k = 0; k < pts.length; k++) {
      const k2 = (k + 1) % pts.length;
      const segReg = (opts.edgeRegs && opts.edgeRegs[k]) || stripReg;
      if (segReg === false) continue;
      if (isCCW) this.addQuad(L[k], L[k2], R[k2], R[k], segReg, [0, 0], [0, 1], [1, 1], [1, 0]);
      else       this.addQuad(L[k], R[k], R[k2], L[k2], segReg, [0, 0], [1, 0], [1, 1], [0, 1]);
    }
  }

  addLoft(rings, reg, opts = {}) {
    const smooth = opts.smooth !== false;
    const capStart = opts.capStart !== false;
    const capEnd = opts.capEnd !== false;
    const N = rings[0].length, M = rings.length;
    const vStart = opts.vStart ?? 0, vEnd = opts.vEnd ?? 1;

    if (smooth) {
      const gridIdx = [];
      for (let r = 0; r < M; r++) {
        const row = [];
        const vT = lerp(vStart, vEnd, r / Math.max(1, M - 1));
        for (let i = 0; i <= N; i++) {
          const ii = i % N;
          const p = rings[r][ii];
          const pNext = rings[r][(ii + 1) % N], pPrev = rings[r][(ii - 1 + N) % N];
          const tU = sub(pNext, pPrev);
          const pR1 = rings[Math.min(M - 1, r + 1)][ii], pR0 = rings[Math.max(0, r - 1)][ii];
          const tV = sub(pR1, pR0);
          let n = cross(tU, tV);
          if (opts.flipNormal) n = scale(n, -1);
          n = norm(n);
          const uv = reg ? uvRect(reg, i / N, vT) : [i / N, vT];
          row.push(this.addVert(p, n, uv));
        }
        gridIdx.push(row);
      }
      for (let r = 0; r < M - 1; r++) {
        for (let i = 0; i < N; i++) {
          const a = gridIdx[r][i], b = gridIdx[r][i + 1], c = gridIdx[r + 1][i + 1], d = gridIdx[r + 1][i];
          if (opts.flipNormal) this.f.push([a, d, c], [a, c, b]);
          else this.f.push([a, b, c], [a, c, d]);
        }
      }
    } else {
      for (let r = 0; r < M - 1; r++) {
        const v0 = lerp(vStart, vEnd, r / Math.max(1, M - 1));
        const v1 = lerp(vStart, vEnd, (r + 1) / Math.max(1, M - 1));
        for (let i = 0; i < N; i++) {
          const j = (i + 1) % N;
          const a = rings[r][i], b = rings[r][j], c = rings[r + 1][j], d = rings[r + 1][i];
          const u0 = i / N, u1 = (i + 1) / N;
          if (opts.flipNormal) this.addQuad(a, d, c, b, reg, [u0, v0], [u0, v1], [u1, v1], [u1, v0]);
          else this.addQuad(a, b, c, d, reg, [u0, v0], [u1, v0], [u1, v1], [u0, v1]);
        }
      }
    }

    // Капы крышек лофта: проверяем направление наружу относительно центра соседнего кольца!
    const capReg = opts.capReg || reg;
    const ringCenter = r => [0, 1, 2].map(k => r.reduce((a, p) => a + p[k], 0) / r.length);
    if (capStart) {
      const c0 = ringCenter(rings[0]), c1 = ringCenter(rings[1]);
      const outDir = sub(c0, c1);
      let ring = rings[0];
      const n0 = cross(sub(ring[1], ring[0]), sub(ring[2], ring[0]));
      if (dot(n0, outDir) < 0) ring = [...ring].reverse();
      const uvs = ring.map((_, k) => {
        const a = 2 * Math.PI * k / N;
        return capReg ? uvRect(capReg, 0.5 + 0.45 * Math.cos(a), 0.5 + 0.45 * Math.sin(a)) : [0.5, 0.5];
      });
      this.addPoly(ring, uvs);
    }
    if (capEnd) {
      const cE = ringCenter(rings[M - 1]), cP = ringCenter(rings[M - 2]);
      const outDir = sub(cE, cP);
      let ring = rings[M - 1];
      const nE = cross(sub(ring[1], ring[0]), sub(ring[2], ring[0]));
      if (dot(nE, outDir) < 0) ring = [...ring].reverse();
      const uvs = ring.map((_, k) => {
        const a = 2 * Math.PI * k / N;
        return capReg ? uvRect(capReg, 0.5 + 0.45 * Math.cos(a), 0.5 + 0.45 * Math.sin(a)) : [0.5, 0.5];
      });
      this.addPoly(ring, uvs);
    }
  }

  addTube(pathPts, radii, seg, reg, opts = {}) {
    const rings = [];
    let prevUp = opts.up || [0, 0, 1];
    for (let k = 0; k < pathPts.length; k++) {
      const p = pathPts[k];
      const tang = k === 0 ? norm(sub(pathPts[1], pathPts[0]))
        : k === pathPts.length - 1 ? norm(sub(pathPts[k], pathPts[k - 1]))
        : norm(sub(pathPts[k + 1], pathPts[k - 1]));
      let side = cross(tang, prevUp);
      if (Math.hypot(...side) < 1e-4) side = cross(tang, [1, 0, 0]);
      side = norm(side);
      const up = norm(cross(side, tang));
      prevUp = up;
      const r = Array.isArray(radii) ? radii[k] : radii;
      const ring = [];
      for (let i = 0; i < seg; i++) {
        const a = 2 * Math.PI * i / seg;
        const ca = Math.cos(a) * r, sa = Math.sin(a) * r;
        ring.push([p[0] + side[0] * ca + up[0] * sa, p[1] + side[1] * ca + up[1] * sa, p[2] + side[2] * ca + up[2] * sa]);
      }
      rings.push(ring);
    }
    const c0 = pathPts[0];
    const p0 = rings[0][0], p1 = rings[0][1], p2 = rings[1][0];
    const flip = dot(cross(sub(p1, p0), sub(p2, p0)), sub(p0, c0)) < 0;
    this.addLoft(rings, reg, { ...opts, flipNormal: flip });
  }

  // Тело вращения вдоль оси X (например, горизонтальный цилиндрический топливный бак поперёк кормы!)
  addLatheX(cy, cz, profile, seg, reg, opts = {}) {
    const rings = profile.map(([x, r]) => {
      const ring = [];
      for (let i = 0; i < seg; i++) {
        const a = 2 * Math.PI * i / seg;
        ring.push([x, cy + r * Math.cos(a), cz + r * Math.sin(a)]);
      }
      return ring;
    });
    const testN = cross(sub(rings[0][1], rings[0][0]), sub(rings[1][0], rings[0][0]));
    const radial = [0, rings[0][0][1] - cy, rings[0][0][2] - cz];
    const flip = dot(testN, radial) < 0;
    this.addLoft(rings, reg, { ...opts, flipNormal: flip });
  }

  addLatheY(cx, cz, profile, seg, reg, opts = {}) {
    const rings = profile.map(([y, r]) => {
      const ring = [];
      for (let i = 0; i < seg; i++) {
        const a = 2 * Math.PI * i / seg;
        ring.push([cx + r * Math.cos(a), y, cz + r * Math.sin(a)]);
      }
      return ring;
    });
    const testN = cross(sub(rings[0][1], rings[0][0]), sub(rings[1][0], rings[0][0]));
    const radial = [rings[0][0][0] - cx, 0, rings[0][0][2] - cz];
    const flip = dot(testN, radial) < 0;
    this.addLoft(rings, reg, { ...opts, flipNormal: flip });
  }

  addLatheZ(cx, cy, profile, seg, reg, opts = {}) {
    const rings = profile.map(([z, rx, ry, yOff = 0]) => {
      const ring = [];
      for (let i = 0; i < seg; i++) {
        const a = 2 * Math.PI * i / seg;
        ring.push([cx + rx * Math.cos(a), cy + yOff + ry * Math.sin(a), z]);
      }
      return ring;
    });
    const testN = cross(sub(rings[0][1], rings[0][0]), sub(rings[1][0], rings[0][0]));
    const radial = [rings[0][0][0] - cx, rings[0][0][1] - (cy + (profile[0][3] || 0)), 0];
    const flip = dot(testN, radial) < 0;
    this.addLoft(rings, reg, { ...opts, flipNormal: flip });
  }

  verifyNormals() {
    let fixed = 0;
    for (const f of this.f) {
      const a = this.v[f[0]], b = this.v[f[1]], c = this.v[f[2]];
      const fn = cross(sub(b, a), sub(c, a));
      const vn = [a[3] + b[3] + c[3], a[4] + b[4] + c[4], a[5] + b[5] + c[5]];
      if (dot(fn, vn) < 0) { const tmp = f[1]; f[1] = f[2]; f[2] = tmp; fixed++; }
    }
    return fixed;
  }
}

// Колесо для колёсных машин Gepard (ось вращения — локальная X, диск в плоскости Y-Z, центр в 0,0,0)
function buildWheelMesh(m, halfW, radius, seg, tireReg, rimReg) {
  const rInner = radius * 0.88;
  // Протектор с лёгким скруглением боковин
  m.addLatheX(0, 0, [
    [-halfW,        rInner],
    [-halfW * 0.82, radius],
    [ halfW * 0.82, radius],
    [ halfW,        rInner],
  ], seg, tireReg, { smooth: true, capStart: true, capEnd: true, capReg: rimReg });
}

// Стандартная гусеничная петля для Gepard (U прокручивается движком SUnit::UpdateWheelsAndChains!)
// Все грани замкнутого полого обода строго наружу (проверено swine-4d-orient.js check)!
function buildTrackLoop(m, hx, yBack, yFront, zBot, zTop, yFlatBack, yFlatFront, uTiling) {
  const prof = [
    [yFlatBack, zBot],
    [yFlatFront, zBot],
    [yFront, zBot + 22],
    [yFront + 6, zTop - 16],
    [yFront - 16, zTop],
    [yBack + 16, zTop],
    [yBack - 6, zTop - 16],
    [yBack, zBot + 22],
  ];
  const acc = [0];
  for (let k = 1; k <= prof.length; k++) {
    const a = prof[k - 1], b = prof[k % prof.length];
    acc.push(acc[k - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const per = acc[prof.length];
  const L = prof.map(([y, z]) => [-hx, y, z]);
  const R = prof.map(([y, z]) => [hx, y, z]);
  const cy = (yBack + yFront) * 0.5, cz = (zBot + zTop) * 0.5;
  const inset = prof.map(([y, z]) => {
    const dy = y - cy, dz = z - cz, l = Math.hypot(dy, dz) || 1;
    return [y - (dy / l) * 9, z - (dz / l) * 9];
  });
  const Li = inset.map(([y, z]) => [-hx, y, z]);
  const Ri = inset.map(([y, z]) => [hx, y, z]);

  // Замкнутый полый обод гусеницы (4 стенки: внешняя, внутренняя, левый и правый торцы) — 100% замкнутый манифолд наружу!
  for (let k = 0; k < prof.length; k++) {
    const k2 = (k + 1) % prof.length;
    const u0 = uTiling * acc[k] / per, u1 = uTiling * acc[k + 1] / per;
    // Внешняя беговая лента (нормаль наружу)
    m.addQuad(L[k], L[k2], R[k2], R[k], null, [u0, 0], [u1, 0], [u1, 1], [u0, 1]);
    // Внутренняя стенка обода (нормаль внутрь к каткам)
    m.addQuad(Li[k], Ri[k], Ri[k2], Li[k2], null, [u0, 0], [u0, 1], [u1, 1], [u1, 0]);
    // Правый (+X) торец обода (нормаль +X)
    m.addQuad(R[k], R[k2], Ri[k2], Ri[k], null, [u0, 0.05], [u1, 0.05], [u1, 0.25], [u0, 0.25]);
    // Левый (-X) торец обода (нормаль -X)
    m.addQuad(Li[k], Li[k2], L[k2], L[k], null, [u0, 0.05], [u1, 0.05], [u1, 0.25], [u0, 0.25]);
  }
}

// ─── Художественный 2D-холст 1024×1024 -> 512×512 (RGB + TeamColor Alpha Mask) ───
function mulberry(a) {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hash2(x, y, seed = 1337) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, seed = 1) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(hash2(xi, yi, seed), hash2(xi + 1, yi, seed), u), lerp(hash2(xi, yi + 1, seed), hash2(xi + 1, yi + 1, seed), u), v);
}
function fbm(x, y, oct = 4, seed = 1) {
  let val = 0, amp = 0.5, freq = 1, tot = 0;
  for (let i = 0; i < oct; i++) { val += amp * vnoise(x * freq, y * freq, seed + i * 31); tot += amp; amp *= 0.5; freq *= 2.03; }
  return val / tot;
}

class Canvas {
  constructor(W = 1024) { this.W = W; this.px = new Float32Array(W * W * 4); }
  blendPx(x, y, rgb, w = 1, teamMask = null) {
    if (x < 0 || y < 0 || x >= this.W || y >= this.W || w <= 0) return;
    const i = (y * this.W + x) * 4, a = clamp(w, 0, 1);
    this.px[i]     = this.px[i] * (1 - a) + rgb[0] * a;
    this.px[i + 1] = this.px[i + 1] * (1 - a) + rgb[1] * a;
    this.px[i + 2] = this.px[i + 2] * (1 - a) + rgb[2] * a;
    if (teamMask !== null) this.px[i + 3] = this.px[i + 3] * (1 - a) + teamMask * a;
  }
  regPx(reg) {
    return [Math.floor(reg[0] * this.W), Math.floor(reg[1] * this.W), Math.ceil(reg[2] * this.W), Math.ceil(reg[3] * this.W)];
  }
  fillRect(x0, y0, x1, y1, rgb, w = 1, mask = null) {
    const X0 = Math.max(0, Math.floor(x0)), Y0 = Math.max(0, Math.floor(y0));
    const X1 = Math.min(this.W, Math.ceil(x1)), Y1 = Math.min(this.W, Math.ceil(y1));
    for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) this.blendPx(x, y, rgb, w, mask);
  }
  fillCircle(cx, cy, r, rgb, w = 1, mask = null, soft = 1.2) {
    const X0 = Math.max(0, Math.floor(cx - r - soft)), X1 = Math.min(this.W - 1, Math.ceil(cx + r + soft));
    const Y0 = Math.max(0, Math.floor(cy - r - soft)), Y1 = Math.min(this.W - 1, Math.ceil(cy + r + soft));
    for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d < r + soft) this.blendPx(x, y, rgb, w * clamp((r + soft - d) / (soft * 2), 0, 1), mask);
    }
  }
  drawRing(cx, cy, rIn, rOut, rgb, w = 1, mask = null) {
    const X0 = Math.max(0, Math.floor(cx - rOut - 2)), X1 = Math.min(this.W - 1, Math.ceil(cx + rOut + 2));
    const Y0 = Math.max(0, Math.floor(cy - rOut - 2)), Y1 = Math.min(this.W - 1, Math.ceil(cy + rOut + 2));
    for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d >= rIn - 1 && d <= rOut + 1) this.blendPx(x, y, rgb, w * Math.min(clamp(d - rIn + 0.5, 0, 1), clamp(rOut + 0.5 - d, 0, 1)), mask);
    }
  }
  drawLine(x0, y0, x1, y1, thick, rgb, w = 1, mask = null) {
    const pad = thick + 2;
    const X0 = Math.max(0, Math.floor(Math.min(x0, x1) - pad)), X1 = Math.min(this.W - 1, Math.ceil(Math.max(x0, x1) + pad));
    const Y0 = Math.max(0, Math.floor(Math.min(y0, y1) - pad)), Y1 = Math.min(this.W - 1, Math.ceil(Math.max(y0, y1) + pad));
    const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 1;
    for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
      const t = clamp(((x - x0) * dx + (y - y0) * dy) / l2, 0, 1);
      const d = Math.hypot(x - (x0 + t * dx), y - (y0 + t * dy));
      if (d < thick * 0.5 + 1.2) this.blendPx(x, y, rgb, w * clamp((thick * 0.5 + 1.2 - d) / 1.8, 0, 1), mask);
    }
  }
  fillPoly(pts, rgb, w = 1, mask = null) {
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const X0 = Math.max(0, Math.floor(Math.min(...xs))), X1 = Math.min(this.W - 1, Math.ceil(Math.max(...xs)));
    const Y0 = Math.max(0, Math.floor(Math.min(...ys))), Y1 = Math.min(this.W - 1, Math.ceil(Math.max(...ys)));
    for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
        if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi + 1e-9) + xi)) inside = !inside;
      }
      if (inside) this.blendPx(x, y, rgb, w, mask);
    }
  }
  rivet(cx, cy, r = 2.6) {
    this.fillCircle(cx + 1.0, cy + 1.2, r * 1.15, [0.06, 0.08, 0.10], 0.75, null, 0.9);
    this.fillCircle(cx, cy, r, [0.76, 0.80, 0.85], 0.55, null, 0.8);
    this.fillCircle(cx - 0.7, cy - 0.7, r * 0.45, [0.95, 0.97, 1.0], 0.55, null, 0.6);
  }
  panelFrame(x0, y0, x1, y1, inset = 4, rivetStep = 30) {
    for (let k = 0; k < 10; k++) {
      const a = 0.09 * (1 - k / 10);
      this.drawLine(x0 + k, y0 + k, x1 - k, y0 + k, 1.6, [0.04, 0.05, 0.07], a);
      this.drawLine(x0 + k, y1 - k, x1 - k, y1 - k, 1.6, [0.03, 0.04, 0.06], a * 1.35);
      this.drawLine(x0 + k, y0 + k, x0 + k, y1 - k, 1.6, [0.04, 0.05, 0.07], a);
      this.drawLine(x1 - k, y0 + k, x1 - k, y1 - k, 1.6, [0.03, 0.04, 0.06], a * 1.15);
    }
    const ix0 = x0 + inset, iy0 = y0 + inset, ix1 = x1 - inset, iy1 = y1 - inset;
    this.drawLine(ix0, iy0, ix1, iy0, 2.2, [0.06, 0.08, 0.10], 0.75);
    this.drawLine(ix0, iy1, ix1, iy1, 2.2, [0.06, 0.08, 0.10], 0.75);
    this.drawLine(ix0, iy0, ix0, iy1, 2.2, [0.06, 0.08, 0.10], 0.75);
    this.drawLine(ix1, iy0, ix1, iy1, 2.2, [0.06, 0.08, 0.10], 0.75);
    this.drawLine(ix0 + 2, iy0 + 2, ix1 - 2, iy0 + 2, 1.3, [0.85, 0.90, 0.96], 0.25);
    this.drawLine(ix0 + 2, iy0 + 2, ix0 + 2, iy1 - 2, 1.3, [0.85, 0.90, 0.96], 0.18);
    if (rivetStep > 0) {
      const m = inset + 7;
      for (let x = x0 + m; x <= x1 - m; x += rivetStep) { this.rivet(x, y0 + m); this.rivet(x, y1 - m); }
      for (let y = y0 + m + rivetStep; y <= y1 - m - rivetStep; y += rivetStep) { this.rivet(x0 + m, y); this.rivet(x1 - m, y); }
    }
  }
  drawGlyph(ch, cx, cy, h, fg = [0.95, 0.96, 0.98], outline = [0.05, 0.05, 0.06]) {
    const w = h * 0.58;
    const S = {
      '0': [[0.2,0.12,0.8,0.12],[0.8,0.12,0.9,0.28],[0.9,0.28,0.9,0.74],[0.9,0.74,0.8,0.90],[0.8,0.90,0.2,0.90],[0.2,0.90,0.1,0.74],[0.1,0.74,0.1,0.28],[0.1,0.28,0.2,0.12]],
      '1': [[0.52,0.12,0.52,0.90],[0.25,0.28,0.52,0.12],[0.25,0.90,0.78,0.90]],
      '6': [[0.85,0.12,0.3,0.12],[0.3,0.12,0.12,0.35],[0.12,0.35,0.12,0.82],[0.12,0.82,0.35,0.92],[0.35,0.92,0.78,0.92],[0.78,0.92,0.92,0.72],[0.92,0.72,0.92,0.55],[0.92,0.55,0.72,0.45],[0.72,0.45,0.15,0.45]],
      '4': [[0.72,0.92,0.72,0.10],[0.72,0.10,0.10,0.62],[0.10,0.62,0.92,0.62]],
      '9': [[0.15,0.90,0.70,0.90],[0.70,0.90,0.88,0.68],[0.88,0.68,0.88,0.22],[0.88,0.22,0.68,0.12],[0.68,0.12,0.24,0.12],[0.24,0.12,0.10,0.30],[0.10,0.30,0.10,0.48],[0.10,0.48,0.28,0.56],[0.28,0.56,0.86,0.56]],
      'X': [[0.12,0.12,0.88,0.90],[0.88,0.12,0.12,0.90]],
      'V': [[0.10,0.12,0.50,0.90],[0.50,0.90,0.90,0.12]],
      'I': [[0.50,0.12,0.50,0.90],[0.25,0.12,0.75,0.12],[0.25,0.90,0.75,0.90]],
    }[ch];
    if (!S) return;
    const x0 = cx - w / 2, y0 = cy - h / 2, thick = Math.max(4, h * 0.16);
    for (const s of S) this.drawLine(x0 + s[0] * w, y0 + s[1] * h, x0 + s[2] * w, y0 + s[3] * h, thick + 6, outline, 1, 0);
    for (const s of S) this.drawLine(x0 + s[0] * w, y0 + s[1] * h, x0 + s[2] * w, y0 + s[3] * h, thick, fg, 1, 0);
  }
  drawBattleDamage(x0, y0, x1, y1, count, isElite, seed) {
    const rnd = mulberry(seed);
    for (let k = 0; k < count; k++) {
      const cx = lerp(x0 + 18, x1 - 18, rnd()), cy = lerp(y0 + 18, y1 - 18, rnd()), rad = 14 + rnd() * 26;
      const X0 = Math.max(x0, Math.floor(cx - rad * 1.4)), X1 = Math.min(x1, Math.ceil(cx + rad * 1.4));
      const Y0 = Math.max(y0, Math.floor(cy - rad * 1.4)), Y1 = Math.min(y1, Math.ceil(cy + rad * 1.4));
      for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) {
        const n = fbm(x * 0.07, y * 0.07, 3, seed + k * 19);
        const d = Math.hypot((x - cx) * 0.85, (y - cy) * 1.15) / rad + (n - 0.5) * 0.85;
        if (d < 0.82) {
          const scratch = 0.28 + 0.25 * fbm(x * 0.22, y * 0.08, 2, seed + 99);
          let col = [scratch, scratch * 1.02, scratch * 1.05];
          if (isElite && n > 0.54) {
            const rt = clamp((n - 0.54) * 2.8, 0, 1);
            col = [lerp(col[0], 0.55, rt), lerp(col[1], 0.20, rt), lerp(col[2], 0.06, rt)];
          }
          if (d > 0.68) col = col.map(v => v * 0.40);
          this.blendPx(x, y, col, clamp((0.82 - d) * 6, 0, 1), 0);
        }
      }
    }
  }
  // Быстрая билинейная выборка без лишних аллокаций
  static sampleBilinear(img, fx, fy, out = [0, 0, 0, 0]) {
    const x0 = clamp(Math.floor(fx), 0, img.W - 1), y0 = clamp(Math.floor(fy), 0, img.H - 1);
    const x1 = Math.min(img.W - 1, x0 + 1), y1 = Math.min(img.H - 1, y0 + 1);
    const tx = clamp(fx - x0, 0, 1), ty = clamp(fy - y0, 0, 1);
    const q00 = (y0 * img.W + x0) * 4, q10 = (y0 * img.W + x1) * 4;
    const q01 = (y1 * img.W + x0) * 4, q11 = (y1 * img.W + x1) * 4;
    const p = img.px;
    for (let c = 0; c < 4; c++) {
      const a = p[q00 + c] + (p[q10 + c] - p[q00 + c]) * tx;
      const b = p[q01 + c] + (p[q11 + c] - p[q01 + c]) * tx;
      out[c] = a + (b - a) * ty;
    }
    return out;
  }

  // Наложение вырезки из реальной текстуры игры (с билинейной фильтрацией, поворотом и режимом вырезки по alpha!)
  blitPatch(srcImg, srcRect, dstX0, dstY0, dstX1, dstY1, opts = {}) {
    const sx0 = srcRect.x ?? 0, sy0 = srcRect.y ?? 0, sw = srcRect.w ?? srcImg.W, sh = srcRect.h ?? srcImg.H;
    const X0 = Math.max(0, Math.floor(dstX0)), Y0 = Math.max(0, Math.floor(dstY0));
    const X1 = Math.min(this.W, Math.ceil(dstX1)), Y1 = Math.min(this.W, Math.ceil(dstY1));
    const dw = Math.max(1, dstX1 - dstX0), dh = Math.max(1, dstY1 - dstY0);
    const rot = opts.rotate || 0;
    const opacity = opts.opacity ?? 1.0;
    const gain = opts.gain ?? 1.0;
    const tint = opts.tint || null;
    const s = [0, 0, 0, 0];

    for (let y = Y0; y < Y1; y++) {
      const v0 = (y - dstY0) / dh;
      for (let x = X0; x < X1; x++) {
        let u = (x - dstX0) / dw, v = v0;
        if (opts.flipX) u = 1 - u;
        let su = u, sv = v;
        if (rot === 90) { su = v; sv = 1 - u; }
        else if (rot === 180) { su = 1 - u; sv = 1 - v; }
        else if (rot === 270) { su = 1 - v; sv = u; }
        Canvas.sampleBilinear(srcImg, sx0 + su * (sw - 1), sy0 + sv * (sh - 1), s);
        let w = opacity;
        if (opts.cutoutByInvAlpha) {
          w *= clamp((0.88 - s[3]) / 0.55, 0, 1);
          if (w <= 0.01) continue;
        } else if (opts.useSrcAlphaAsOpacity) {
          w *= s[3];
          if (w <= 0.01) continue;
        }
        let r = clamp(s[0] * gain, 0, 1), g = clamp(s[1] * gain, 0, 1), b = clamp(s[2] * gain, 0, 1);
        if (tint) { r = clamp(r * tint[0], 0, 1); g = clamp(g * tint[1], 0, 1); b = clamp(b * tint[2], 0, 1); }
        const tm = opts.setTeamMask === 'src' ? s[3] : (opts.setTeamMask !== undefined ? opts.setTeamMask : null);
        this.blendPx(x, y, [r, g, b], w, tm);
      }
    }
  }

  // Бесшовная заливка реальной фактурой брони из оригинальных текстур игры (с кэшем на размер/расу!)
  fillArmorBaseFromGame(race, gain = 1.04) {
    Canvas._armorCache = Canvas._armorCache || {};
    const key = `${race}_${this.W}_${gain.toFixed(3)}`;
    if (Canvas._armorCache[key]) { this.px.set(Canvas._armorCache[key]); return; }
    const ga = loadGameAssets();
    // 100% чистые крупные участки живой кистевой брони без лючков, швов и бирюзовых краёв!
    const sx0 = race === 'pig' ? 12 : 298, sy0 = race === 'pig' ? 246 : 148;
    const sw = race === 'pig' ? 132 : 86, sh = race === 'pig' ? 92 : 66;
    const src = race === 'pig' ? ga.dVont : ga.nyLt;
    const tileW = sw * 2.2, tileH = sh * 2.2;
    const s = [0, 0, 0, 0];
    for (let y = 0; y < this.W; y++) {
      const py = (y % (tileH * 2)) / tileH;
      const fy = (py <= 1 ? py : 2 - py) * (sh - 1);
      for (let x = 0; x < this.W; x++) {
        const px2 = (x % (tileW * 2)) / tileW;
        const fx = (px2 <= 1 ? px2 : 2 - px2) * (sw - 1);
        Canvas.sampleBilinear(src, sx0 + fx, sy0 + fy, s);
        const macro = 1.0 + (vnoise(x * 0.015, y * 0.015, 55) - 0.5) * 0.12;
        const i = (y * this.W + x) * 4;
        this.px[i]     = clamp(s[0] * gain * macro, 0, 1);
        this.px[i + 1] = clamp(s[1] * gain * macro, 0, 1);
        this.px[i + 2] = clamp(s[2] * gain * macro, 0, 1);
        this.px[i + 3] = 1.0;
      }
    }
    Canvas._armorCache[key] = new Float32Array(this.px);
  }

  fillArmorBase(race, baseV = null) {
    const isPig = race === 'pig';
    const bv = baseV ?? (isPig ? 0.40 : 0.76);
    for (let y = 0; y < this.W; y++) for (let x = 0; x < this.W; x++) {
      const brush = (fbm(x * 0.015, y * 0.055, 3, 11) - 0.5) * 0.09;
      const grime = (fbm(x * 0.025, y * 0.025, 4, 47) - 0.5) * 0.11;
      const fine  = (vnoise(x * 0.25, y * 0.25, 83) - 0.5) * 0.03;
      const m = clamp(bv + brush + grime + fine, 0.12, 0.92);
      const col = isPig ? [m * 0.54, m * 0.80, m * 1.00] : [m * 1.00, m * 0.80, m * 0.34];
      const i = (y * this.W + x) * 4;
      this.px[i] = col[0]; this.px[i + 1] = col[1]; this.px[i + 2] = col[2]; this.px[i + 3] = 1.0;
    }
  }
  downsample2x() {
    const W2 = this.W / 2, out = new Float32Array(W2 * W2 * 4);
    for (let y = 0; y < W2; y++) for (let x = 0; x < W2; x++) {
      for (let c = 0; c < 4; c++) {
        out[(y * W2 + x) * 4 + c] = (
          this.px[((2 * y) * this.W + 2 * x) * 4 + c] +
          this.px[((2 * y) * this.W + 2 * x + 1) * 4 + c] +
          this.px[((2 * y + 1) * this.W + 2 * x) * 4 + c] +
          this.px[((2 * y + 1) * this.W + 2 * x + 1) * 4 + c]
        ) * 0.25;
      }
    }
    return { W: W2, px: out };
  }
}

// Культовые эмблемы (alpha = 0, не перекрашиваются цветом команды)
function drawPigEmblem(cv, cx, cy, r) {
  const red = [0.85, 0.08, 0.06], darkRed = [0.55, 0.04, 0.04], blk = [0.05, 0.05, 0.06], wht = [0.95, 0.96, 0.97];
  cv.fillPoly([[cx - r * 0.95, cy - r * 0.25], [cx - r * 1.12, cy - r * 0.92], [cx - r * 0.35, cy - r * 0.72]], blk, 1, 0);
  cv.fillPoly([[cx + r * 0.95, cy - r * 0.25], [cx + r * 1.12, cy - r * 0.92], [cx + r * 0.35, cy - r * 0.72]], blk, 1, 0);
  cv.fillPoly([[cx - r * 0.85, cy - r * 0.32], [cx - r * 0.98, cy - r * 0.78], [cx - r * 0.42, cy - r * 0.65]], red, 1, 0);
  cv.fillPoly([[cx + r * 0.85, cy - r * 0.32], [cx + r * 0.98, cy - r * 0.78], [cx + r * 0.42, cy - r * 0.65]], red, 1, 0);
  cv.fillCircle(cx, cy, r * 0.95, blk, 1, 0, 1);
  cv.fillCircle(cx, cy, r * 0.82, red, 1, 0, 1);
  cv.drawLine(cx - r * 0.58, cy - r * 0.34, cx - r * 0.14, cy - r * 0.16, r * 0.17, blk, 1, 0);
  cv.drawLine(cx + r * 0.58, cy - r * 0.34, cx + r * 0.14, cy - r * 0.16, r * 0.17, blk, 1, 0);
  cv.fillCircle(cx - r * 0.32, cy - r * 0.14, r * 0.12, wht, 1, 0, 0.6);
  cv.fillCircle(cx + r * 0.32, cy - r * 0.14, r * 0.12, wht, 1, 0, 0.6);
  cv.fillCircle(cx - r * 0.30, cy - r * 0.14, r * 0.06, blk, 1, 0, 0.5);
  cv.fillCircle(cx + r * 0.30, cy - r * 0.14, r * 0.06, blk, 1, 0, 0.5);
  cv.fillCircle(cx, cy + r * 0.20, r * 0.34, blk, 1, 0, 0.8);
  cv.fillCircle(cx, cy + r * 0.20, r * 0.26, darkRed, 1, 0, 0.8);
  cv.fillCircle(cx - r * 0.11, cy + r * 0.20, r * 0.07, blk, 1, 0, 0.5);
  cv.fillCircle(cx + r * 0.11, cy + r * 0.20, r * 0.07, blk, 1, 0, 0.5);
  cv.fillPoly([[cx - r * 0.55, cy + r * 0.45], [cx - r * 0.72, cy + r * 0.05], [cx - r * 0.36, cy + r * 0.34]], blk, 1, 0);
  cv.fillPoly([[cx + r * 0.55, cy + r * 0.45], [cx + r * 0.72, cy + r * 0.05], [cx + r * 0.36, cy + r * 0.34]], blk, 1, 0);
  cv.fillPoly([[cx - r * 0.52, cy + r * 0.40], [cx - r * 0.64, cy + r * 0.13], [cx - r * 0.40, cy + r * 0.32]], wht, 1, 0);
  cv.fillPoly([[cx + r * 0.52, cy + r * 0.40], [cx + r * 0.64, cy + r * 0.13], [cx + r * 0.40, cy + r * 0.32]], wht, 1, 0);
}

// Знак «ОГНЕОПАСНО» (ромб с пламенем, alpha = 0)
function drawFlameHazardSign(cv, cx, cy, r) {
  const blk = [0.05, 0.05, 0.06], yel = [0.97, 0.80, 0.06], red = [0.92, 0.16, 0.04], org = [0.98, 0.50, 0.04];
  const diamond = s => [[cx, cy - r * s], [cx + r * s, cy], [cx, cy + r * s], [cx - r * s, cy]];
  cv.fillPoly(diamond(1.08), blk, 1, 0);
  cv.fillPoly(diamond(0.94), yel, 1, 0);
  cv.fillPoly(diamond(0.82), blk, 1, 0);
  cv.fillPoly(diamond(0.75), red, 1, 0);
  // Язык пламени внутри
  const fl = [
    [cx, cy + r * 0.48], [cx - r * 0.34, cy + r * 0.22], [cx - r * 0.28, cy - r * 0.18],
    [cx - r * 0.10, cy + r * 0.02], [cx + r * 0.02, cy - r * 0.52], [cx + r * 0.18, cy - r * 0.06],
    [cx + r * 0.32, cy - r * 0.22], [cx + r * 0.34, cy + r * 0.22],
  ];
  cv.fillPoly(fl, yel, 1, 0);
  const flIn = fl.map(([x, y]) => [lerp(cx, x, 0.58), lerp(cy + r * 0.22, y, 0.62)]);
  cv.fillPoly(flIn, org, 1, 0);
}

// ─── Сериализация .4d, .dxt (DXT5), .obj, PNG ───
function makeNodeHeader(name, parent, m12) {
  const nb = Buffer.from(name, 'latin1');
  const buf = Buffer.alloc(2 + nb.length + 4 + 48);
  buf.writeUInt16LE(nb.length, 0); nb.copy(buf, 2);
  let o = 2 + nb.length;
  buf.writeInt32LE(parent, o); o += 4;
  for (let i = 0; i < 12; i++) buf.writeFloatLE(m12[i], o + i * 4);
  return buf;
}
function chunk(tag, body) {
  const h = Buffer.alloc(8); h.write(tag, 0, 'latin1'); h.writeUInt32LE(body.length, 4);
  return Buffer.concat([h, body]);
}
function meshChunk(header, mesh, texName) {
  mesh.verifyNormals();
  const P = mesh.v.map(v => v.slice(0, 3));
  const mn = [0, 1, 2].map(k => Math.min(...P.map(p => p[k])));
  const mx = [0, 1, 2].map(k => Math.max(...P.map(p => p[k])));
  const bb = Buffer.alloc(96); let o = 0;
  for (const x of [mn[0], mx[0]]) for (const y of [mn[1], mx[1]]) for (const z of [mn[2], mx[2]]) {
    bb.writeFloatLE(x, o); bb.writeFloatLE(y, o + 4); bb.writeFloatLE(z, o + 8); o += 12;
  }
  const vb = Buffer.alloc(8 + mesh.v.length * 32); vb.writeUInt32LE(mesh.v.length, 0);
  mesh.v.forEach((v, i) => v.forEach((x, k) => vb.writeFloatLE(x, 8 + i * 32 + k * 4)));
  const fb = Buffer.alloc(4 + mesh.f.length * 6); fb.writeUInt32LE(mesh.f.length, 0);
  mesh.f.forEach((f, i) => f.forEach((x, k) => fb.writeUInt16LE(x, 4 + i * 6 + k * 2)));
  const tn = Buffer.from(texName, 'latin1'), db = Buffer.alloc(2); db.writeUInt16LE(tn.length, 0);
  const mh = Buffer.alloc(12); mh.writeUInt32LE(mesh.f.length, 0); mh.writeUInt32LE(0, 4); mh.writeUInt32LE(mesh.v.length, 8);
  const mate = chunk('MATE', Buffer.concat([mh, chunk('DIFF', Buffer.concat([db, tn]))]));
  const one = Buffer.alloc(4); one.writeUInt32LE(1, 0);
  if (mesh.v.length > 65535) throw new Error('too many vertices: ' + mesh.v.length);
  return chunk('MESH', Buffer.concat([header, chunk('BBOX', bb), chunk('VERT', vb), chunk('FACE', fb), chunk('MTLS', Buffer.concat([one, mate]))]));
}
function makeHelperMesh(name, parent, m12, texName) {
  const m = new Mesh();
  m.addTri([-20, 0, -15], [20, 0, -15], [0, 0, 20], [0.5, 0.5], [0.5, 0.5], [0.5, 0.5]);
  return meshChunk(makeNodeHeader(name, parent, m12), m, texName);
}

const to565 = c => ((Math.round(clamp(c[0], 0, 1) * 31) & 31) << 11) | ((Math.round(clamp(c[1], 0, 1) * 63) & 63) << 5) | (Math.round(clamp(c[2], 0, 1) * 31) & 31);
const from565 = v => [((v >> 11) & 31) / 31, ((v >> 5) & 63) / 63, (v & 31) / 31];

function encodeDxt5(img) {
  const parts = []; let { W, px } = img;
  while (true) {
    const bw = Math.max(1, W / 4), out = Buffer.alloc(bw * bw * 16);
    for (let by = 0; by < bw; by++) for (let bx = 0; bx < bw; bx++) {
      const block = [], alpha = [];
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
        const x = Math.min(W - 1, bx * 4 + i), y = Math.min(W - 1, by * 4 + j), q = (y * W + x) * 4;
        block.push([clamp(px[q], 0, 1), clamp(px[q + 1], 0, 1), clamp(px[q + 2], 0, 1)]);
        alpha.push(clamp(px[q + 3], 0, 1));
      }
      const lum = c => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
      let lo = block[0], hi = block[0];
      for (const c of block) { if (lum(c) < lum(lo)) lo = c; if (lum(c) > lum(hi)) hi = c; }
      let c0 = to565(hi), c1 = to565(lo); if (c0 < c1) [c0, c1] = [c1, c0];
      const p0 = from565(c0), p1 = from565(c1);
      const pal = [p0, p1, p0.map((v, k) => (2 * v + p1[k]) / 3), p0.map((v, k) => (v + 2 * p1[k]) / 3)];
      let idx = 0;
      if (c0 !== c1) block.forEach((c, n) => {
        let best = 0, bd = 1e9;
        for (let k = 0; k < 4; k++) { const d = (c[0] - pal[k][0]) ** 2 + (c[1] - pal[k][1]) ** 2 + (c[2] - pal[k][2]) ** 2; if (d < bd) { bd = d; best = k; } }
        idx |= best << (2 * n);
      });
      const o = (by * bw + bx) * 16;
      const aMax = Math.round(Math.max(...alpha) * 255), aMin = Math.round(Math.min(...alpha) * 255);
      out[o] = aMax; out[o + 1] = aMin;
      if (aMax !== aMin) {
        const lv = [aMax, aMin, ...[1, 2, 3, 4, 5, 6].map(i => ((7 - i) * aMax + i * aMin) / 7)];
        let bits = 0n;
        alpha.forEach((a, n) => {
          let best = 0, bd = 1e9;
          for (let k = 0; k < 8; k++) { const d = Math.abs(a * 255 - lv[k]); if (d < bd) { bd = d; best = k; } }
          bits |= BigInt(best) << BigInt(3 * n);
        });
        for (let k = 0; k < 6; k++) out[o + 2 + k] = Number((bits >> BigInt(8 * k)) & 255n);
      }
      out.writeUInt16LE(c0, o + 8); out.writeUInt16LE(c1, o + 10); out.writeUInt32LE(idx >>> 0, o + 12);
    }
    parts.push(out);
    if (W === 1) break;
    const W2 = W / 2, p2 = new Float32Array(W2 * W2 * 4);
    for (let y = 0; y < W2; y++) for (let x = 0; x < W2; x++) for (let k = 0; k < 4; k++) {
      p2[(y * W2 + x) * 4 + k] = (
        px[((2 * y) * W + 2 * x) * 4 + k] + px[((2 * y) * W + 2 * x + 1) * 4 + k] +
        px[((2 * y + 1) * W + 2 * x) * 4 + k] + px[((2 * y + 1) * W + 2 * x + 1) * 4 + k]
      ) * 0.25;
    }
    W = W2; px = p2;
  }
  const data = Buffer.concat(parts), h = Buffer.alloc(16);
  h.writeUInt32LE(3, 0); h.writeUInt32LE(img.W, 4); h.writeUInt32LE(img.W, 8); h.write('DXT5', 12, 'latin1');
  const body = Buffer.concat([h, data]), th = Buffer.alloc(8); th.write('TEXT', 0, 'latin1'); th.writeUInt32LE(body.length, 4);
  return Buffer.concat([MAGIC, th, body]);
}

// Полный декодер DXT1/DXT3/DXT5 (с сохранением оригинального alpha-канала командной маски!)
function decodeDxtFull(b) {
  const W = b.readUInt32LE(20), H = b.readUInt32LE(24), fmt = b.toString('latin1', 28, 32);
  const px = new Float32Array(W * H * 4);
  const bw = Math.max(1, W / 4), bh = Math.max(1, H / 4);
  let off = 32;
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    const alphas = new Float32Array(16).fill(1.0);
    let cOff = off;
    if (fmt === 'DXT5') {
      const a0 = b[off], a1 = b[off + 1], lut = [a0, a1];
      if (a0 > a1) for (let i = 1; i <= 6; i++) lut.push(((7 - i) * a0 + i * a1) / 7);
      else { for (let i = 1; i <= 4; i++) lut.push(((5 - i) * a0 + i * a1) / 5); lut.push(0, 255); }
      let bits = 0n;
      for (let k = 0; k < 6; k++) bits |= BigInt(b[off + 2 + k]) << BigInt(8 * k);
      for (let n = 0; n < 16; n++) alphas[n] = lut[Number((bits >> BigInt(3 * n)) & 7n)] / 255;
      cOff = off + 8; off += 16;
    } else if (fmt === 'DXT3') {
      for (let n = 0; n < 16; n++) { const by2 = b[off + (n >> 1)]; alphas[n] = (((n & 1) ? (by2 >> 4) : (by2 & 15)) * 17) / 255; }
      cOff = off + 8; off += 16;
    } else { off += 8; }
    const c0 = b.readUInt16LE(cOff), c1 = b.readUInt16LE(cOff + 2), idx = b.readUInt32LE(cOff + 4);
    const p0 = from565(c0), p1 = from565(c1);
    const pal = (fmt !== 'DXT1' || c0 > c1)
      ? [p0, p1, p0.map((v, k) => (2 * v + p1[k]) / 3), p0.map((v, k) => (v + 2 * p1[k]) / 3)]
      : [p0, p1, p0.map((v, k) => (v + p1[k]) / 2), [0, 0, 0]];
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
      const x = bx * 4 + i, y = by * 4 + j;
      if (x >= W || y >= H) continue;
      const n = j * 4 + i, ci = (idx >>> (2 * n)) & 3, q = (y * W + x) * 4;
      px[q] = pal[ci][0]; px[q + 1] = pal[ci][1]; px[q + 2] = pal[ci][2];
      px[q + 3] = (fmt === 'DXT1' && c0 <= c1 && ci === 3) ? 0 : alphas[n];
    }
  }
  return { W, H, px };
}
const decodeDxtSimple = decodeDxtFull;

// Кэш оригинальных игровых текстур из base.pak (логотипы, стальная броня, катки, решётки, боевые повреждения, FUEL)
let _gameAssetsCache = null;
function loadGameAssets() {
  if (_gameAssetsCache) return _gameAssetsCache;
  const load = rel => decodeDxtFull(readPakEntry(PAK_PATH, rel));
  const dNorm = load('units/skinned/d_normaltank_normal.dxt');
  const dVet  = load('units/skinned/d_normaltank_veteran.dxt');
  const dEl   = load('units/skinned/d_normaltank_elite.dxt');
  const dHard = load('units/skinned/d_hardtank_normal.dxt');
  const dRak  = load('units/skinned/d_raketas_normal.dxt');
  const dVont = load('units/skinned/d_vontato_normal.dxt');
  const nyLt  = load('units/skinned/ny_lighttank_normal.dxt');
  const nyEl  = load('units/skinned/ny_lighttank_elite.dxt');
  const nyJep = load('units/skinned/ny_dzsip_normal.dxt');
  const fuel  = load('units/skinned/utanfuto_fuel.dxt');

  // Извлекаем реальные штампы повреждений (разница veteran/elite против normal по альфе и цвету!)
  function extractDiffPatch(src, ref, sx, sy, sw, sh) {
    const px = new Float32Array(sw * sh * 4);
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      const q = ((sy + y) * src.W + (sx + x)) * 4;
      const o = (y * sw + x) * 4;
      const da = Math.max(0, ref.px[q + 3] - src.px[q + 3]);
      const dc = Math.hypot(src.px[q] - ref.px[q], src.px[q + 1] - ref.px[q + 1], src.px[q + 2] - ref.px[q + 2]);
      const mask = clamp(Math.max(da * 1.4, (dc - 0.08) * 3.5), 0, 1);
      px[o] = src.px[q]; px[o + 1] = src.px[q + 1]; px[o + 2] = src.px[q + 2]; px[o + 3] = mask;
    }
    return { W: sw, H: sh, px };
  }

  _gameAssetsCache = {
    dNorm, dVet, dEl, dHard, dRak, dVont, nyLt, nyEl, nyJep, fuel,
    rects: {
      pigLogo:       { img: dRak,  x: 116, y: 118, w:  66, h:  44 }, // Оригинальный злой кабан Свиней!
      rabbitCarrot:  { img: nyJep, x: 416, y: 418, w:  46, h:  90 }, // Оригинальная вертикальная морковка Кроликов!
      rabbitCarrotH: { img: nyLt,  x: 374, y: 282, w:  60, h:  50 }, // Горизонтальная морковка Кроликов!
      rabbitStar:    { img: nyEl,  x: 310, y: 158, w:  64, h:  64 }, // Оригинальная белая звезда Кроликов!
      rabbitRibbed:  { img: nyLt,  x:  38, y:   6, w: 124, h:  52 }, // Оригинальный ребристый хромированный кожух!
      rabbitGrille:  { img: nyJep, x: 402, y:  82, w: 104, h:  64 }, // Оригинальная «заячья» решётка радиатора!
      rabbitWindow:  { img: nyJep, x:  12, y: 244, w:  22, h:  84 }, // Чистое лобовое стекло Кроликов (без жёлтых углов)!
      rabbitTireRim: { img: nyJep, x: 148, y:  66, w:  60, h:  60 }, // Оригинальное колесо Кроликов (синяя ступица)!
      rabbitTireTrd: { img: nyJep, x:  16, y:   4, w:  28, h: 156 }, // Оригинальный протектор шины Кроликов!
      pigTireRim:    { img: dVont, x:   2, y:  42, w: 106, h: 106 }, // Оригинальное тяжёлое колесо Свиней!
      pigTireTrd:    { img: dVont, x: 434, y: 384, w:  28, h: 124 }, // Оригинальный протектор шины Свиней!
      pigTruckGrill: { img: dVont, x: 110, y:  82, w:  76, h:  52 }, // Оригинальная решётка грузовика Свиней!
      pigWindow:     { img: dVont, x:  12, y: 158, w:  60, h:  36 }, // Оригинальное бронестекло кабины Свиней!
      fuelSign:      { img: fuel,  x: 266, y: 336, w:  66, h:  68 }, // Оригинальный знак «FUEL» с огнём!
      fuelRedMetal:  { img: fuel,  x: 176, y:  24, w:  32, h:  84 }, // Металлик красной канистры из игры!
      pigWheels:     { img: dNorm, x: 298, y:   2, w: 200, h:  46 }, // Оригинальные 4 катка Свиней!
      pigWheels5:    { img: dHard, x:   4, y: 266, w: 244, h:  48 }, // Оригинальные 5 катков тяжёлого танка!
      rabbitWheels:  { img: nyLt,  x:   2, y:  66, w: 274, h:  64 }, // Оригинальные катки Кроликов!
      pigLouvers:    { img: dNorm, x: 390, y:  98, w:  46, h:  48 }, // Чистые оригинальные жалюзи МТО + 3 огонька (без краёв)!
      fenderGrating: { img: dNorm, x: 174, y: 330, w:  28, h: 178 }, // Оригинальная рифлёная полка!
      headlight:     { img: dNorm, x: 460, y: 488, w:  36, h:  18 }, // Оригинальная фара!
      taillight:     { img: dNorm, x: 478, y: 408, w:  18, h:  50 }, // Оригинальный стоп-сигнал!
      mantletMetal:  { img: dNorm, x: 470, y: 306, w:  22, h:  36 }, // Чистая литая сталь без бирюзовых краёв!
      chromeMetal:   { img: dRak,  x: 422, y: 392, w:  20, h:  50 }, // Чистый цилиндрический металл/хром без краёв!
      turretSoot:    { img: dNorm, x:  68, y: 204, w: 114, h: 102 }, // Копоть под башней!
      hazardStrip:   { img: dVet,  x: 230, y: 472, w: 120, h:  14 }, // Оригинальная жёлто-чёрная полоса!
      vetChevrons:   { img: dVet,  x: 462, y: 152, w:  32, h:  52 }, // Оригинальные 2 шеврона Veteran!
      eliteChevrons: { img: dEl,   x: 462, y: 144, w:  32, h:  92 }, // Оригинальные 4 шеврона Elite!
      pigArmorA:     { img: dVont, x:  12, y: 246, w: 132, h:  92 }, // Живая стальная броня Свиней!
      pigArmorB:     { img: dHard, x: 318, y: 158, w: 138, h: 128 }, // Броня тяжёлого танка Свиней!
      rabbitArmorA:  { img: nyLt,  x: 280, y: 150, w: 110, h: 110 }, // Живая охра Кроликов!
    },
    vetDamages: [
      extractDiffPatch(dVet, dNorm,  22, 198,  92,  54),
      extractDiffPatch(dVet, dNorm,  76,  72,  66,  42),
      extractDiffPatch(dVet, dNorm, 152, 108,  68,  46),
      extractDiffPatch(dVet, dNorm,  26, 424,  76,  54),
    ],
    eliteDamages: [
      extractDiffPatch(dEl, dNorm,  22, 198,  92,  54),
      extractDiffPatch(dEl, dNorm,  68, 108,  92,  48),
      extractDiffPatch(dEl, dNorm, 152, 108,  72,  46),
      extractDiffPatch(dEl, dNorm,  26, 366,  92, 110),
    ],
  };
  return _gameAssetsCache;
}

const applyM = (m, p) => [
  p[0] * m[0] + p[1] * m[3] + p[2] * m[6] + m[9],
  p[0] * m[1] + p[1] * m[4] + p[2] * m[7] + m[10],
  p[0] * m[2] + p[1] * m[5] + p[2] * m[8] + m[11],
];
const applyRot = (m, n) => norm([
  n[0] * m[0] + n[1] * m[3] + n[2] * m[6],
  n[0] * m[1] + n[1] * m[4] + n[2] * m[7],
  n[0] * m[2] + n[1] * m[5] + n[2] * m[8],
]);

function exportObj(spec, filePath) {
  const lines = ['# S.W.I.N.E. HD Arcanum custom 3D model'];
  let vOff = 1;
  spec.nodes.forEach((node, ni) => {
    if (!node.mesh) return;
    lines.push(`o ${node.name.replace(/\s+/g, '_')}`);
    const chain = []; let k = ni;
    while (k >= 0) { chain.push(spec.nodes[k].m); k = spec.nodes[k].parent; }
    for (const v of node.mesh.v) {
      let p = [v[0], v[1], v[2]], n = [v[3], v[4], v[5]];
      for (const m of chain) { p = applyM(m, p); n = applyRot(m, n); }
      lines.push(`v ${p[0].toFixed(3)} ${p[1].toFixed(3)} ${p[2].toFixed(3)}`);
      lines.push(`vn ${n[0].toFixed(4)} ${n[1].toFixed(4)} ${n[2].toFixed(4)}`);
      lines.push(`vt ${v[6].toFixed(5)} ${(1 - v[7]).toFixed(5)}`);
    }
    for (const f of node.mesh.f) {
      const a = f[0] + vOff, b = f[1] + vOff, c = f[2] + vOff;
      lines.push(`f ${a}/${a}/${a} ${b}/${b}/${b} ${c}/${c}/${c}`);
    }
    vOff += node.mesh.v.length;
  });
  fs.writeFileSync(filePath, lines.join('\n') + '\n');
}

const crcT = new Int32Array(256).map((_, n) => {
  let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); return c;
});
const crc32 = b => { let c = -1; for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const pchunk = (t, d) => {
  const l = Buffer.alloc(4); l.writeUInt32BE(d.length);
  const td = Buffer.concat([Buffer.from(t), d]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td));
  return Buffer.concat([l, td, c]);
};
function writePngRGB(file, W, H, rgb) {
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; rgb.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pchunk('IHDR', ihdr), pchunk('IDAT', zlib.deflateSync(raw)), pchunk('IEND', Buffer.alloc(0))]));
}
function decodePng(buf, w0, h0) {
  let p = 8, W = 0, H = 0; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('latin1', p + 4, p + 8), d = buf.slice(p + 8, p + 8 + len);
    if (type === 'IHDR') { W = d.readUInt32BE(0); H = d.readUInt32BE(4); }
    if (type === 'IDAT') idat.push(d);
    p += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat)), bpp = 3, stride = W * bpp, px = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    const f = raw[y * (stride + 1)], row = raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0, b = y ? px[(y - 1) * stride + x] : 0, c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0;
      const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f];
      px[y * stride + x] = (row[x] + pred) & 255;
    }
  }
  return { W, px, w: w0, h: h0 };
}

function teamColor(race, h, s, v) {
  const f = (n, k = (n + h / 60) % 6) => 1 - Math.max(0, Math.min(k, 4 - k, 1));
  const m = race === 'pig' ? [3, 2] : [1.333, 1];
  return { rgb: [f(5), f(3), f(1)], mul: [s / 100 * m[0], v / 100 * m[1]] };
}

// Цвета команд из units_color.ini
const TEAM_PRESETS = race => ({
  blue:   teamColor(race, 203, 33, 50),
  red:    teamColor(race, 3,   62, 60),
  yellow: teamColor(race, 42,  74, 83),
  green:  teamColor(race, 118, 48, 52),
});

function renderSpec(spec, mainTex, trackTexImg, outFile, team, views, size, opts = {}) {
  const [W, H] = size;
  const img = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3, t = y / H;
    if (opts.bg) img.set(opts.bg, i);
    else { img[i] = 32 + 18 * t; img[i + 1] = 35 + 18 * t; img[i + 2] = 44 + 20 * t; }
  }

  // Опциональный поворот башни для проверки работы узла Lovegtorony + Cso!
  const turretYaw = opts.turretYaw || 0;
  const ct = Math.cos(turretYaw), st = Math.sin(turretYaw);

  const tris = [];
  spec.nodes.forEach((node, ni) => {
    if (!node.mesh) return;
    const chain = []; let k = ni;
    while (k >= 0) {
      let m = spec.nodes[k].m;
      if (turretYaw && spec.nodes[k].name === 'Lovegtorony') {
        // Поворот вокруг локальной оси Z башни (как делает движок Gepard!)
        m = [
          m[0] * ct - m[3] * st, m[1] * ct - m[4] * st, m[2] * ct - m[5] * st,
          m[0] * st + m[3] * ct, m[1] * st + m[4] * ct, m[2] * st + m[5] * ct,
          m[6], m[7], m[8], m[9], m[10], m[11],
        ];
      }
      chain.push(m);
      k = spec.nodes[k].parent;
    }
    const wPos = node.mesh.v.map(v => { let p = [v[0], v[1], v[2]]; for (const m of chain) p = applyM(m, p); return p; });
    const wNrm = node.mesh.v.map(v => { let n = [v[3], v[4], v[5]]; for (const m of chain) n = applyRot(m, n); return n; });
    const tex = node.isTrack ? trackTexImg : mainTex;
    for (const f of node.mesh.f) {
      tris.push({
        P: [wPos[f[0]], wPos[f[1]], wPos[f[2]]],
        N: [wNrm[f[0]], wNrm[f[1]], wNrm[f[2]]],
        UV: [[node.mesh.v[f[0]][6], node.mesh.v[f[0]][7]], [node.mesh.v[f[1]][6], node.mesh.v[f[1]][7]], [node.mesh.v[f[2]][6], node.mesh.v[f[2]][7]]],
        tex, isTrack: !!node.isTrack,
      });
    }
  });

  const L = norm([0.45, 0.82, 0.36]);
  for (const vw of views) {
    const zb = new Float32Array(vw.w * vw.h).fill(-1e9);
    const cy = Math.cos(vw.yaw), sy = Math.sin(vw.yaw);
    const cp = Math.cos(vw.pitch), sp = Math.sin(vw.pitch);
    const proj = p => {
      const x = p[0] * cy - p[2] * sy, z = p[0] * sy + p[2] * cy, y = p[1];
      return [x, y * cp - z * sp, y * sp + z * cp];
    };
    let mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9;
    for (const t of tris) for (const p of t.P) {
      const q = proj(p);
      if (q[0] < mnx) mnx = q[0]; if (q[0] > mxx) mxx = q[0];
      if (q[1] < mny) mny = q[1]; if (q[1] > mxy) mxy = q[1];
    }
    let sc = Math.min(vw.w / (mxx - mnx + 1e-3), vw.h / (mxy - mny + 1e-3)) * 0.84;
    let ox = vw.w / 2 - sc * (mnx + mxx) / 2, oy = vw.h / 2 + sc * (mny + mxy) / 2;
    if (vw.sphere) {
      // Сталий масштаб і центр за описаною сферою: у ролику танк не «дихає» під час обертання.
      const pts = tris.flatMap(t => t.P), c = [0, 1, 2].map(k => (Math.min(...pts.map(p => p[k])) + Math.max(...pts.map(p => p[k]))) / 2);
      const R = Math.max(...pts.map(p => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2])));
      const pc = proj(c); sc = Math.min(vw.w, vw.h) / (2 * R) * (vw.zoom || 1);
      ox = vw.w / 2 - sc * pc[0]; oy = vw.h / 2 + sc * pc[1] + (vw.drop || 0) * vw.h;
    }
    const vwTeam = vw.team || team;
    if (vw.shadow) {
      // Тінь на землю вздовж світла — затемнює тло, як в оригінальних іконках і роликах.
      const ground = Math.min(...tris.flatMap(t => t.P.map(p => p[1]))), Ls = [-0.35, 1, 0.25];
      const flat = p => { const k = (p[1] - ground) / Ls[1]; return [p[0] - Ls[0] * k, ground, p[2] - Ls[2] * k]; };
      const sh = new Uint8Array(vw.w * vw.h);
      for (const t of tris) {
        const V = t.P.map(flat).map(proj).map(p => [ox + p[0] * sc, oy - p[1] * sc]);
        const area = (V[1][0] - V[0][0]) * (V[2][1] - V[0][1]) - (V[2][0] - V[0][0]) * (V[1][1] - V[0][1]); if (Math.abs(area) < 1e-6) continue;
        const x0 = Math.max(0, Math.floor(Math.min(V[0][0], V[1][0], V[2][0]))), x1 = Math.min(vw.w - 1, Math.ceil(Math.max(V[0][0], V[1][0], V[2][0])));
        const y0 = Math.max(0, Math.floor(Math.min(V[0][1], V[1][1], V[2][1]))), y1 = Math.min(vw.h - 1, Math.ceil(Math.max(V[0][1], V[1][1], V[2][1])));
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const w0 = ((V[1][0] - x) * (V[2][1] - y) - (V[2][0] - x) * (V[1][1] - y)) / area, w1 = ((V[2][0] - x) * (V[0][1] - y) - (V[0][0] - x) * (V[2][1] - y)) / area;
          if (w0 >= 0 && w1 >= 0 && w0 + w1 <= 1) sh[y * vw.w + x] = 1;
        }
      }
      for (let i = 0; i < sh.length; i++) if (sh[i]) { const oi = ((vw.y0 + Math.floor(i / vw.w)) * W + vw.x0 + (i % vw.w)) * 3; for (let k = 0; k < 3; k++) img[oi + k] = Math.round(img[oi + k] * 0.62); }
    }

    for (const t of tris) {
      const V = t.P.map(proj).map(p => [ox + p[0] * sc, oy - p[1] * sc, p[2]]);
      const area = (V[1][0] - V[0][0]) * (V[2][1] - V[0][1]) - (V[2][0] - V[0][0]) * (V[1][1] - V[0][1]);
      if (Math.abs(area) < 1e-6) continue;
      // Отсечение изнанки точно как в игре (swine-view.js --cull 1)!
      if (opts.cull !== false && area < 0) continue;
      const x0 = Math.max(0, Math.floor(Math.min(V[0][0], V[1][0], V[2][0])));
      const x1 = Math.min(vw.w - 1, Math.ceil(Math.max(V[0][0], V[1][0], V[2][0])));
      const y0 = Math.max(0, Math.floor(Math.min(V[0][1], V[1][1], V[2][1])));
      const y1 = Math.min(vw.h - 1, Math.ceil(Math.max(V[0][1], V[1][1], V[2][1])));
      const invA = 1 / area;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const w0 = ((V[1][0] - x) * (V[2][1] - y) - (V[2][0] - x) * (V[1][1] - y)) * invA;
        const w1 = ((V[2][0] - x) * (V[0][1] - y) - (V[0][0] - x) * (V[2][1] - y)) * invA;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w0 * V[0][2] + w1 * V[1][2] + w2 * V[2][2];
        const zi = y * vw.w + x;
        if (z <= zb[zi]) continue;
        zb[zi] = z;
        const nx = w0 * t.N[0][0] + w1 * t.N[1][0] + w2 * t.N[2][0];
        const ny = w0 * t.N[0][1] + w1 * t.N[1][1] + w2 * t.N[2][1];
        const nz = w0 * t.N[0][2] + w1 * t.N[1][2] + w2 * t.N[2][2];
        const nl = Math.hypot(nx, ny, nz) || 1;
        const lit = 0.42 + 0.65 * Math.max(0, (nx * L[0] + ny * L[1] + nz * L[2]) / nl);

        let u = w0 * t.UV[0][0] + w1 * t.UV[1][0] + w2 * t.UV[2][0];
        let v = w0 * t.UV[0][1] + w1 * t.UV[1][1] + w2 * t.UV[2][1];
        u = u - Math.floor(u); v = v - Math.floor(v);
        const tW = t.tex.W, tH = t.tex.H || t.tex.W;
        const tx = Math.min(tW - 1, Math.max(0, Math.floor(u * tW)));
        const ty = Math.min(tH - 1, Math.max(0, Math.floor(v * tH)));
        const q = (ty * tW + tx) * 4;
        let r = t.tex.px[q], g = t.tex.px[q + 1], b = t.tex.px[q + 2], a = t.tex.px[q + 3];
        if (vwTeam && !t.isTrack && a > 0.05) {
          const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
          const sat = clamp((mx > 0 ? (mx - mn) / mx : 0) * vwTeam.mul[0], 0, 1);
          const val = clamp(mx * vwTeam.mul[1], 0, 1);
          r = r * (1 - a) + (vwTeam.rgb[0] * sat + (1 - sat)) * val * a;
          g = g * (1 - a) + (vwTeam.rgb[1] * sat + (1 - sat)) * val * a;
          b = b * (1 - a) + (vwTeam.rgb[2] * sat + (1 - sat)) * val * a;
        }
        const oi = ((vw.y0 + y) * W + (vw.x0 + x)) * 3;
        img[oi] = clamp(Math.round(r * lit * 255), 0, 255);
        img[oi + 1] = clamp(Math.round(g * lit * 255), 0, 255);
        img[oi + 2] = clamp(Math.round(b * lit * 255), 0, 255);
      }
    }
  }
  if (opts.badge) {
    const bd = opts.badge;
    for (let y = 0; y < bd.h; y++) for (let x = 0; x < bd.w; x++) {
      const s = (y * bd.W + x) * 3, d = (y * W + x) * 3;
      if (bd.px[s] + bd.px[s + 1] > 300 || (bd.px[s] > 150 && bd.px[s + 2] < 90)) {
        img[d] = bd.px[s]; img[d + 1] = bd.px[s + 1]; img[d + 2] = bd.px[s + 2];
      }
    }
  }
  if (outFile) writePngRGB(outFile, W, H, img);
  return img;
}

// Магазин: сіре тло 124,122,124 (як у menu/units/*.png і *.anif — зливається з панеллю), тінь, танк дивиться
// ліворуч і трохи на глядача, як оригінальні юніти. SHOP_YAW підібрано під проекцію renderSpec.
const SHOP_BG = [124, 122, 124], SHOP_YAW = Number(process.env.SWINE_SHOP_YAW || 1.75), SHOP_PITCH = 0.45;

// Сборка полного пакета юнита: 3 уровня (normal, veteran, elite) с ОДИНАКОВОЙ 3D-геометрией и разными текстурами!
function buildUnitPackage({ modelName, race, anifFrom, outDir, buildGeometry, buildAtlas }) {
  if ((race === 'pig') !== modelName.includes('d_')) {
    throw new Error(`Pig modelName must contain "d_" for COLORIZE shader, Rabbit must not: ${modelName}`);
  }
  const skDir = path.join(outDir, 'gamedata/base/units/skinned');
  const menuDir = path.join(outDir, 'gamedata/base/menu/units');
  const prevDir = path.join(outDir, 'previews');
  const objDir = path.join(outDir, 'obj');
  for (const d of [skDir, menuDir, prevDir, objDir]) fs.mkdirSync(d, { recursive: true });

  const spec = buildGeometry(); // ОДНА общая 3D-модель на все 3 уровня!
  const trackTexName = spec.trackTex || (race === 'pig' ? 'lanctalp.tga' : 'ny_lanctalp.tga');
  const trackDxtName = trackTexName.replace(/\.tga$/i, '.dxt');
  const trackImg = decodeDxtSimple(readPakEntry(PAK_PATH, `units/skinned/${trackDxtName}`));
  const teams = TEAM_PRESETS(race);
  const defaultTeam = race === 'pig' ? teams.blue : teams.yellow;

  const FOUR_VIEWS = [
    { x0: 0,   y0: 0,   w: 480, h: 320, yaw: 0.65, pitch: 0.44 },
    { x0: 480, y0: 0,   w: 480, h: 320, yaw: 2.38, pitch: 0.42 },
    { x0: 0,   y0: 320, w: 480, h: 320, yaw: Math.PI / 2, pitch: 0.08 },
    { x0: 480, y0: 320, w: 480, h: 320, yaw: 0.00, pitch: 1.45 },
  ];

  // Экспорт .obj (один раз, т.к. геометрия едина)
  exportObj(spec, path.join(objDir, `${modelName}.obj`));

  const summary = [];
  for (const level of ['normal', 'veteran', 'elite']) {
    const texBase = `${modelName}_${level}`;
    const atlas = buildAtlas(level);

    // 1) .4d файл
    const chunks = [];
    let totalV = 0, totalF = 0;
    for (const node of spec.nodes) {
      if (node.helper) {
        chunks.push(makeHelperMesh(node.name, node.parent, node.m, texBase + '.tga'));
      } else {
        const tName = node.isTrack ? trackTexName : texBase + '.tga';
        chunks.push(meshChunk(makeNodeHeader(node.name, node.parent, node.m), node.mesh, tName));
        totalV += node.mesh.v.length;
        totalF += node.mesh.f.length;
      }
    }
    const body = Buffer.concat([Buffer.from('v100', 'latin1'), ...chunks]);
    const sh = Buffer.alloc(8); sh.write('SCEN', 0, 'latin1'); sh.writeUInt32LE(body.length, 4);
    const out4d = path.join(skDir, texBase + '.4d');
    fs.writeFileSync(out4d, Buffer.concat([MAGIC, sh, body]));
    // Автоматическая гарантия правильной ориентации граней по мировому объёму (0 вывернутых граней!)
    const orientScript = path.join(__dirname, '..', 'swine-4d-orient.js');
    if (fs.existsSync(orientScript)) {
      require('child_process').execFileSync(process.execPath, [orientScript, 'fix', out4d], { stdio: 'ignore' });
    }

    // 2) .dxt (DXT5 + mipmaps)
    const outDxt = path.join(skDir, texBase + '.dxt');
    fs.writeFileSync(outDxt, encodeDxt5(atlas));

    // 3) Превью текстурного атласа (RGB | Alpha-маска командного цвета)
    const texOut = Buffer.alloc(atlas.W * 2 * atlas.W * 3);
    for (let y = 0; y < atlas.W; y++) for (let x = 0; x < atlas.W; x++) {
      const q = (y * atlas.W + x) * 4;
      const o1 = (y * atlas.W * 2 + x) * 3, o2 = (y * atlas.W * 2 + atlas.W + x) * 3;
      texOut[o1] = clamp(Math.round(atlas.px[q] * 255), 0, 255);
      texOut[o1 + 1] = clamp(Math.round(atlas.px[q + 1] * 255), 0, 255);
      texOut[o1 + 2] = clamp(Math.round(atlas.px[q + 2] * 255), 0, 255);
      const av = clamp(Math.round(atlas.px[q + 3] * 255), 0, 255);
      texOut[o2] = av; texOut[o2 + 1] = av; texOut[o2 + 2] = av;
    }
    writePngRGB(path.join(prevDir, `tex_${texBase}.png`), atlas.W * 2, atlas.W, texOut);

    // 4) 4-ракурсный рендер каждого уровня
    renderSpec(spec, atlas, trackImg, path.join(prevDir, `render_${texBase}.png`), defaultTeam, FOUR_VIEWS, [960, 640]);

    // На normal — дополнительно лист с 4 цветами команд + тест поворота башни на 35°!
    if (level === 'normal') {
      const TEAM_VIEWS = [
        { x0: 0,   y0: 0,   w: 480, h: 320, yaw: 0.65, pitch: 0.44, team: teams.blue },
        { x0: 480, y0: 0,   w: 480, h: 320, yaw: 0.65, pitch: 0.44, team: teams.red },
        { x0: 0,   y0: 320, w: 480, h: 320, yaw: 0.65, pitch: 0.44, team: teams.yellow },
        { x0: 480, y0: 320, w: 480, h: 320, yaw: 0.65, pitch: 0.44, team: teams.green },
      ];
      renderSpec(spec, atlas, trackImg, path.join(prevDir, `teams_${modelName}.png`), defaultTeam, TEAM_VIEWS, [960, 640], { turretYaw: 0.52 });
    }

    // 5) Иконка магазина 128×128 + .anif
    const suffix = level === 'normal' ? '' : '_' + level;
    const badge = level === 'normal' ? null : decodePng(readPakEntry(PAK_PATH, `menu/units/${anifFrom}_${level}.png`), 40, 40);
    renderSpec(spec, atlas, trackImg, path.join(menuDir, `${modelName}${suffix}.png`), defaultTeam,
      [{ x0: 0, y0: 0, w: 128, h: 128, yaw: SHOP_YAW, pitch: SHOP_PITCH, sphere: true, zoom: 1.45, drop: -0.04, shadow: true }], [128, 128], { badge, bg: SHOP_BG });
    // Ролик магазину: повний оберт за 200 кадрів 496×368, як оригінали (кадр 0 = ракурс іконки).
    const outAnif = path.join(menuDir, `${modelName}${suffix}.anif`);
    if (process.env.SWINE_KEEP_ANIF && fs.existsSync(outAnif)) { /* keep existing .anif */ }
    else if (process.env.SWINE_NO_ANIF) fs.writeFileSync(outAnif, readPakEntry(PAK_PATH, `menu/units/${anifFrom}${suffix}.anif`));
    else {
      const frames = [];
      for (let fi = 0; fi < 200; fi++) {
        const rgb = renderSpec(spec, atlas, trackImg, null, defaultTeam,
          [{ x0: 0, y0: 0, w: 496, h: 368, yaw: SHOP_YAW + 2 * Math.PI * fi / 200, pitch: SHOP_PITCH, sphere: true, zoom: 1.25, drop: -0.04, shadow: true }], [496, 368], { bg: SHOP_BG });
        const rgba = Buffer.alloc(496 * 368 * 4, 255); for (let i = 0; i < 496 * 368; i++) rgb.copy(rgba, i * 4, i * 3, i * 3 + 3);
        frames.push(rgba);
      }
      ANIF.write(outAnif, 496, 368, frames);
    }

    summary.push({ level, verts: totalV, faces: totalF, size4d: fs.statSync(out4d).size, sizeDxt: fs.statSync(outDxt).size });
  }
  return summary;
}

module.exports = {
  GAME_DIR, PAK_PATH,
  sub, add, scale, cross, dot, norm, clamp, lerp, uvRect,
  mulberry, vnoise, fbm,
  Mesh, buildTrackLoop, buildWheelMesh, Canvas, drawPigEmblem, drawFlameHazardSign,
  loadGameAssets, buildUnitPackage,
};

#!/usr/bin/env node
// Симуляція балансу S.W.I.N.E. на формулах exe (див. docs/ARC_UNITS.md, розділ «Механіка»).
//
//   node tools/balance-sim.js [units.ini] [--level 0|1|2] [--budget 4000]
//
// Модель бою (свідомо проста, але з тими самими формулами, що в грі):
//   * шкода влучання = ціле(Damage) + бонус рівня − броня сторони; ≤ 0 — подряпина (0);
//     прямий постріл (ShotType 1/3/4) б'є в лоб, навісний (2) — у дах; бонус броні рівня теж додається;
//   * рівні: рядовий +0/+0, ветеран HP×1.2 і +0.4, еліта HP×1.5 і +1.0;
//   * старт на дистанції max(дальність A, дальність B); коротший мусить під'їхати (MoveSpeed клітинок/с),
//     той, хто дістає, стріляє одразу й далі кожні ReloadTime с; швидший і далекобійніший може «кайтити»
//     — тоді повільний ніколи не стріляє;
//   * залп ракет (Cargo > 1) — Cargo пострілів по ReshotTime, потім ReloadTime;
//   * без наводчика стріляють не далі обзору + 1 (артилерії з дальністю 25 треба розвідка);
//   * навісний вогонь мажe: частка влучань 1 / (1 + 0.4·ShotSpread);
//   * бої груп на однакові гроші: N_A = бюджет / ціна A проти N_B = бюджет / ціна B, вогонь розподіляється
//     порівну, ланчестерівські втрати по секундах.
// Вихід: матриця «хто кого» 1×1 і групами, ефективність «шкода за 1000 очок» і рекомендації.
'use strict';
const fs = require('fs'), path = require('path');
const arg = (k, d) => process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d;
const INI = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(__dirname, '../mods-test/arcunits/gamedata/base/units.ini');
const LEVEL = +arg('--level', 0), BUDGET = +arg('--budget', 4000);
const LV = [{ hp: 1, b: 0 }, { hp: 1.2, b: 0.4 }, { hp: 1.5, b: 1 }][LEVEL];

const S = {}; let cur;
for (const l of fs.readFileSync(INI, 'latin1').split(/\r?\n/)) {
  const m = l.match(/^\s*\[(.+)\]/); if (m) { cur = m[1]; S[cur] = {}; continue; }
  const k = l.match(/^\s*([^;=]+?)\s*=\s*(.*?)\s*$/); if (cur && k) S[cur][k[1].toLowerCase()] = k[2];
}
const num = (u, k, d = 0) => u[k] !== undefined && u[k] !== '' ? parseFloat(u[k]) : d;
// Бойові юніти, що продаються (є ціна й зброя).
const units = Object.entries(S).filter(([n, u]) => /^(Diszno|Nyul) /.test(n) && num(u, 'price') > 0 && num(u, 'shottype') > 0 && num(u, 'damage') > 0)
  .map(([n, u]) => ({
    name: n, side: n.startsWith('Diszno') ? 'pig' : 'rabbit', price: num(u, 'price'),
    hp: num(u, 'maxhp', 10) * LV.hp, front: num(u, 'frontarmor') + LV.b, top: num(u, 'toparmor') + LV.b,
    side_: (num(u, 'frontarmor') + num(u, 'backarmor')) / 2 + LV.b,
    dmg: Math.trunc(num(u, 'damage')) + LV.b, reload: num(u, 'reloadtime', 2), shot: num(u, 'shottype'),
    range: Math.min(num(u, 'maxrange'), num(u, 'sight', 8) + 1), minRange: num(u, 'minrange'), speed: num(u, 'movespeed', 1),
    salvo: num(u, 'cargo') > 1 && num(u, 'specialtype', -1) === 6 ? num(u, 'cargo') : 1, reshot: num(u, 'reshottime', 0.1),
    ammo: num(u, 'ammo', 999), acc: num(u, 'shottype') === 2 ? 1 / (1 + 0.4 * num(u, 'shotspread', 0)) : 1,
  }));
const hit = (a, b) => Math.max(0, a.dmg - (a.shot === 2 ? b.top : b.front));
// Шкода за секунду з урахуванням залпу: salvo пострілів за (salvo-1)·reshot + reload.
const dps = (a, b) => hit(a, b) * a.acc * a.salvo / ((a.salvo - 1) * a.reshot + a.reload);

// 1×1: секунди до знищення з урахуванням зближення.
function duel(a, b) {
  const d0 = Math.max(a.range, b.range);
  const tIn = (x, y) => x.range >= d0 ? 0 : (y.speed >= x.speed && y.range > x.range ? Infinity : (d0 - x.range) / Math.max(0.05, x.speed));
  const ttk = (x, y) => { const h = hit(x, y) * x.acc; if (!h) return Infinity; const shots = Math.ceil(y.hp / h); const cycles = Math.ceil(shots / x.salvo);
    const ammoOk = shots <= x.ammo; return ammoOk ? tIn(x, y) + (cycles - 1) * x.reload + (shots - 1 - (cycles - 1)) * x.reshot : Infinity; };
  const ta = ttk(a, b), tb = ttk(b, a);
  return { ta, tb, win: ta < tb ? 1 : ta > tb ? -1 : 0 };
}
// Група на однакові гроші: ланчестер по секундах.
function battle(a, b) {
  let na = BUDGET / a.price, nb = BUDGET / b.price; const na0 = na, nb0 = nb;
  const d0 = Math.max(a.range, b.range);
  let t = 0, dist = d0;
  for (; t < 600 && na > 0.05 && nb > 0.05; t += 0.25) {
    const shortA = a.range < dist, shortB = b.range < dist;
    if (shortA && !(b.speed >= a.speed && b.range > a.range)) dist = Math.max(a.range, dist - a.speed * 0.25);
    if (shortB && !(a.speed >= b.speed && a.range > b.range)) dist = Math.max(b.range, dist - b.speed * 0.25);
    const fa = a.range >= dist ? na * dps(a, b) * 0.25 : 0, fb = b.range >= dist ? nb * dps(b, a) * 0.25 : 0;
    nb = Math.max(0, nb - fa / b.hp); na = Math.max(0, na - fb / a.hp);
  }
  return { left: na / na0 - nb / nb0, t };
}
const pigs = units.filter(u => u.side === 'pig'), rabbits = units.filter(u => u.side === 'rabbit');
const short = n => n.replace(/^Diszno /, 'D ').replace(/^Nyul /, 'N ').replace(/ (kamikaze|slow|hullaim|minelay)/g, '').slice(0, 18);

console.log(`Рівень ${['рядовий', 'ветеран', 'еліта'][LEVEL]}, бюджет групи ${BUDGET} SP\n`);
console.log('Бої груп на однакові гроші (свині проти кроликів): + перемога свиней, − кроликів; число — частка армії, що лишилась\n');
const pad = (s, n) => String(s).padEnd(n);
console.log(pad('', 19) + rabbits.map(r => pad(short(r.name), 11)).join(''));
const score = new Map(units.map(u => [u.name, []]));
for (const p of pigs) {
  let row = pad(short(p.name), 19);
  for (const r of rabbits) { const b = battle(p, r); row += pad((b.left >= 0 ? '+' : '') + b.left.toFixed(2), 11); score.get(p.name).push(b.left); score.get(r.name).push(-b.left); }
  console.log(row);
}
// Ефективність: шкода за секунду на 1000 очок проти середньої цілі протилежної раси (без зближення).
console.log('\nЕфективність (сер. результат групових боїв; ціль ≈ 0) і шкода/с на 1000 SP проти середньої цілі:');
const rows = units.map(u => {
  const foes = u.side === 'pig' ? rabbits : pigs, s = score.get(u.name);
  const avg = s.reduce((x, y) => x + y, 0) / s.length;
  const dpk = foes.reduce((x, f) => x + dps(u, f), 0) / foes.length / u.price * 1000;
  return { u, avg, dpk };
}).sort((a, b) => b.avg - a.avg);
for (const { u, avg, dpk } of rows) {
  const tag = avg > 0.25 ? 'надто сильний → дорожче' : avg < -0.25 ? 'слабкий → дешевше' : 'ок';
  console.log(`  ${pad(short(u.name), 19)} ціна ${pad(u.price, 5)} рез. ${pad((avg >= 0 ? '+' : '') + avg.toFixed(2), 6)} шкода/с/1000SP ${pad(dpk.toFixed(2), 6)} ${tag}`);
}
console.log(`\nСкільки купиш на ${BUDGET} SP: ` + units.filter(u => /normal tank|light tank|cartank/.test(u.name)).map(u => `${short(u.name)} ×${(BUDGET / u.price).toFixed(1)}`).join(', '));
if (process.argv.includes('--solve')) {
  // Підбір цін: ціна × (1 + 0.5·результат), 12 ітерацій, у межах ±40 % від стартової; округлення до 25.
  const base = new Map(units.map(u => [u.name, u.price]));
  for (let it = 0; it < 12; it++) {
    const sc = new Map(units.map(u => [u.name, []]));
    for (const p of pigs) for (const r of rabbits) { const b = battle(p, r); sc.get(p.name).push(b.left); sc.get(r.name).push(-b.left); }
    for (const u of units) { const v = sc.get(u.name), avg = v.reduce((x, y) => x + y, 0) / v.length, b0 = base.get(u.name);
      u.price = Math.min(b0 * 1.4, Math.max(b0 * 0.6, u.price * (1 + 0.5 * avg))); }
  }
  const out = {}; for (const u of units) out[u.name] = Math.round(u.price / 25) * 25;
  fs.writeFileSync(arg('--solve'), JSON.stringify(out, null, 2)); console.log('\nціни після підбору →', arg('--solve'));
  for (const u of units) console.log('  ' + pad(short(u.name), 19) + base.get(u.name) + ' → ' + out[u.name]);
}
if (process.argv.includes('--json')) fs.writeFileSync(arg('--json'), JSON.stringify(rows.map(r => ({ name: r.u.name, price: r.u.price, result: +r.avg.toFixed(3), dpsPer1000: +r.dpk.toFixed(3) })), null, 2));

#!/usr/bin/env node
// Arcanum Units: нові юніти S.W.I.N.E. (класи 14+, потрібен патч exe — tools/re/patchgen) і баланс.
//
//   node tools/arc-units.js <out-dir>
//
// Пише:
//   <out>/gamedata/base/units.ini           — оригінал з .pak + правки балансу + нові секції;
//   <out>/gamedata/<LANG>/units_text.ini     — Nick/Name/Desc нових юнітів для кожної мови гри;
//   <out>/classes.json                       — порядок нових класів для patchgen (--classes);
//   <out>/balance.json                       — таблиці «було → стало» і характеристики нових юнітів (для вікі).
//
// Механіка, на яку спирається баланс (розбір exe, див. docs/ARC_UNITS.md):
//   * урон пострілу = ціле(Damage) + бонус рівня − броня сторони цілі (лоб / борт = (лоб+корма)/2 / корма;
//     навісні постріли б'ють у дах). Урон ≤ 0 — подряпина. Тож +1 броні сильно ріже швидкострільну зброю;
//   * ветеран: HP ×1.2, урон і броня +0.4; еліта: HP ×1.5, урон і броня +1.0 (однаково для всіх юнітів);
//   * поріг досвіду: Level2XP / Level3XP, за замовчуванням 4·HP+20 і 10·HP+20; досвід дає завданий урон;
//   * AmmoValue гра не читає; MoveSpeed ×50 = «Скорость» у магазині; «Расход» = 100·MaxFuel/Consume;
//   * вибух при загибелі з уроном по площі — лише в мін і (з патчем) у юнітів з "kamikaze" в імені секції:
//     урон = ExtraArmor (якщо > 0, інакше Damage), радіус = ShotSpread, спад до країв лінійний.
'use strict';
const fs = require('fs'), path = require('path');
const OUT = path.resolve(process.argv[2] || 'out-units');
const GAME = process.env.SWINE_DIR || 'A:/SteamLibrary/steamapps/common/SWINE HD Remaster';
const BS = String.fromCharCode(92);

// ───────────── правки ванільних юнітів ─────────────
// #10 (23.11.2026): усі ванільні танки й покращення — з ванільними значеннями й цінами (колишні правки й
// загальну шкалу цін ×1.6 прибрано). Лишається тільки авіація кроликів: бомбардувальник утричі швидший —
// прилітає й відлітає (а значить, знову доступний) утричі швидше. Ціна авіаудару в exe: кролики 100, свині 50
// (tools/re/patchgen/Caves.cs, airprice).
const VANILLA = [
  { s: 'Nyul bombazo', set: { MoveSpeed: 14.4 },
    why: 'Авіація кроликів: бомбардувальник прилітає й відлітає втричі швидше (4.8 → 14.4), щоб кролики встигали бомбити. Авіаудар коштує 100 замість 50 (exe).' },
];

// Ключі «ролі» (зброя, спецздібність, дальність, досвід). Решта — «шасі»: модель, корпус, рух, звуки.
const ROLE_KEYS = ['shottype', 'turretspeed', 'ammo', 'ammovalue', 'damage', 'reloadtime', 'reshottime', 'shotspread', 'shotangle',
  'shotheight', 'shotspeed', 'projectile', 'projectile2', 'shoteffect', 'shotsound', 'specialtype', 'specialtime', 'extraarmor',
  'specialsound1', 'specialsound2', 'cargo', 'bodykick', 'kicksize', 'kicktime', 'detector', 'explodetype', 'explodesound',
  'minrange', 'maxrange', 'actionrange', 'resource', 'level2xp', 'level3xp', 'canswim'];
// Upgrade-маска: біт = номер у UpgradeClasses.
const UP = { fuel: 1, ammo: 2, sight: 4, mines: 8, armor: 16, repair: 32, turbo: 64, beer: 128, carrot: 256 };
const mask = (...u) => u.reduce((a, k) => a | UP[k], 0);

// ───────────── нові юніти ─────────────
// chassis — секція-основа корпусу (модель і характеристики руху перезаписуються), role — донор зброї
// і спецздібності (null — без зброї). model — своя модель з tools/models/<model>.js; без неї тимчасова
// d_arctank / ny_arctank.
const NO_SPECIAL = { SpecialType: null, SpecialTime: null, ExtraArmor: null, SpecialSound1: null, SpecialSound2: null };
const UNITS = [
  // ── свині ──
  // Хряк-Гриль: склянна гармата. Вогнемет — прямий постріл (ShotType 1) на 2.5 клітинки з величезною
  // шкодою: проти лобової броні 2 це ≈ 6 шкоди/с, ушестеро більше за звичайний танк. Плата — 60 HP,
  // корма без броні й бак напалму: під час загибелі вибух 30 шкоди в радіусі 2.5 (ExtraArmor/ShotSpread,
  // див. патч exe), тож він палить усіх поруч — і ворогів, з якими зчепився, і своїх, що стоять поряд.
  { s: 'Diszno grill kamikaze slow', race: 'pig', chassis: 'Diszno normal tank', role: 'Diszno normal tank', model: 'd_hryakgrill',
    set: { Price: 800, UpgradeMask: mask('fuel', 'ammo', 'armor', 'turbo', 'beer'), MaxHP: 60, FrontArmor: 1.5, BackArmor: 0, TopArmor: 1, Sight: 7,
           MinRange: 0, MaxRange: 2.5, Actionrange: 9, Damage: 12, ReloadTime: 1.6, Ammo: 40, TurretSpeed: 90,
           MoveSpeed: 0.95, SpinSpeed: 60, Level2XP: 500, Level3XP: 1200, ExplodeType: 2, ShotSound: 'shoot/arc_lang.wav',
           ...NO_SPECIAL, ExtraArmor: 30, ShotSpread: 2.5 },
    ru: ['Хряк-Гриль', 'Огнемётный танк', 'Стеклянная пушка ближнего боя: огнемёт бьёт всего на 2.5, зато на 12 урона каждые 1.6 секунды — обычный танк сгорает за десяток секунд. Сам хрупкий: 60 живучести, корма без брони, а бак напалма при гибели взрывается (до 30 урона в радиусе 2.5) и поджигает всех вокруг — и врагов, и своих.'],
    en: ['Hog Grill', 'Flame tank', 'A close-range glass cannon: the flamethrower reaches only 2.5 but deals 12 damage every 1.6 seconds — a regular tank burns in about ten seconds. Fragile itself: 60 HP, no rear armour, and its napalm tank explodes when destroyed (up to 30 damage in a 2.5 radius), burning everyone nearby, friend or foe.'],
    uk: ['Кабан-Гриль', 'Вогнеметний танк', 'Скляна гармата ближнього бою: вогнемет б\'є лише на 2.5, зате на 12 шкоди кожні 1.6 секунди — звичайний танк згоряє за десяток секунд. Сам крихкий: 60 живучості, корма без броні, а бак напалму під час загибелі вибухає (до 30 шкоди в радіусі 2.5) і підпалює всіх довкола — і ворогів, і своїх.'] },
  { s: 'Diszno cartank', race: 'pig', chassis: 'Diszno hard tank', role: 'Diszno hard tank', model: 'd_svinczar',
    set: { Price: 1800, UpgradeMask: mask('fuel', 'ammo', 'sight', 'repair', 'beer'), MaxHP: 220, FrontArmor: 6, BackArmor: 2, TopArmor: 3.5, Sight: 9,
           MinRange: 1.5, MaxRange: 8.5, Damage: 40, ReloadTime: 10, Ammo: 30, MoveSpeed: 0.45, SpinSpeed: 15, TurretSpeed: 8, Consume: 220,
           UnitSize: 1.5, Level2XP: 1500, Level3XP: 3500 },
    ru: ["Свин-Царь","Сверхтяжёлый танк","Апофеоз свинского эго: 220 живучести, лоб в 6 брони и залп на 40 урона, который с одного выстрела сносит разведку кроликов. Медленный, башню крутит целую вечность, а топливо жрёт вчетверо быстрее тяжёлого танка — без заправщика встанет посреди карты. Броню не улучшить."],
    en: ["Swine Tsar","Super-heavy tank","Pig ego incarnate: 220 HP, front armour 6 and a 40-damage shell that one-shots rabbit scouts. Slow, its turret takes forever to turn, and it burns fuel four times faster than the heavy tank — without a fuel trailer it stalls mid-map. Armour cannot be upgraded."],
    uk: ["Свин-Цар","Надважкий танк","Апофеоз свинячого его: 220 живучості, лоб у 6 броні й постріл на 40 шкоди, що з одного разу зносить розвідку кроликів. Повільний, башту крутить цілу вічність, а пальне жере вчетверо швидше за важкий танк — без заправника стане посеред мапи. Броню не покращити."] },
  { s: 'Diszno kamikaze', race: 'pig', chassis: 'Diszno normal tank', role: null, model: 'd_bombohryak',
    set: { Price: 650, UpgradeMask: mask('fuel', 'sight', 'armor', 'turbo'), MaxHP: 80, FrontArmor: 4, BackArmor: 0.5, TopArmor: 1, Sight: 9,
           MinRange: 0, MaxRange: 0, MoveType: 2, ChainSpeed: null, MoveSpeed: 1.6, SpinSpeed: 90, Consume: 900, Damage: 60, ExtraArmor: 60, ShotSpread: 5,
           ExplodeType: 2, SpecialType: 12, SpecialTime: null, SpecialSound1: null, SpecialSound2: null },   // 12 — своя кнопка «Підрив» (патч exe)
    ru: ["Бомбохряк","Таран-камикадзе","Бронированный таран, набитый бочками с топливом и снарядами. Оружия нет. Своя кнопка «Подрыв»: до 60 урона в радиусе 5, своим тоже достаётся. Если его подобьют раньше — взрывается там, где стоит, даже у вашей базы."],
    en: ["Boom Hog","Kamikaze ram","An armoured ram packed with fuel drums and shells. No gun. Its own Detonate button: up to 60 damage in a radius of 5, friend or foe. If it is shot first, it blows up where it stands — even next to your own base."],
    uk: ["Бомбокабан","Таран-камікадзе","Броньований таран, напханий бочками з пальним і снарядами. Зброї немає. Своя кнопка «Підрив»: до 60 шкоди в радіусі 5, своїм теж дістається. Якщо його підіб'ють раніше — вибухає там, де стоїть, навіть біля вашої бази."] },
  { s: 'Diszno ostromkoca hullaim', race: 'pig', chassis: 'Diszno hard tank', role: 'Diszno mozsar', model: 'd_osadnykaban',
    set: { Price: 1100, UpgradeMask: mask('fuel', 'ammo', 'sight', 'armor', 'beer'), MaxHP: 150, FrontArmor: 4, BackArmor: 1.5, TopArmor: 2.5, Sight: 7,
           MinRange: 3, MaxRange: 9, Damage: 40, ReloadTime: 25, Ammo: 20, Projectile: 'Arc ostrom lovedek', Projectile2: 'Arc ostrom lovedek',
           TurretSpeed: 25, MoveSpeed: 0.5, SpinSpeed: 25, UnitSize: 1.3, Level2XP: 600, Level3XP: 1500, ...NO_SPECIAL },
    ru: ["Осадный Кабан","Штурмовая мортира","Гусеничный бункер: навесом бросает фугас на 40 урона в радиусе 3 — сносит укрытых, скопления техники и мины. Перезарядка 25 секунд, 20 снарядов, а орудие не поворачивается: на цель доворачивается весь корпус."],
    en: ["Siege Boar","Assault mortar","A tracked bunker: lobs a 40-damage shell with a radius of 3 — wrecks units behind cover, vehicle clumps and minefields. 25-second reload, 20 rounds, and the gun does not traverse: the whole hull turns onto the target."],
    uk: ["Облоговий Вепр","Штурмова мортира","Гусеничний бункер: навісом кидає фугас на 40 шкоди в радіусі 3 — зносить укритих, скупчення техніки й міни. Перезаряджання 25 секунд, 20 снарядів, а гармата не повертається: на ціль доводиться весь корпус."] },
  { s: 'Diszno sarszoro slow', race: 'pig', chassis: 'Diszno normal tank', role: 'Diszno mozsar', model: 'd_gryazemet',
    set: { Price: 650, UpgradeMask: mask('fuel', 'ammo', 'sight', 'armor', 'turbo', 'beer'), MaxHP: 85, FrontArmor: 1.5, BackArmor: 0.5, TopArmor: 1, Sight: 9,
           MinRange: 2.5, MaxRange: 9, Damage: 3, ReloadTime: 2.5, Ammo: 80, Projectile: 'Arc sar', Projectile2: 'Arc sar', ShotSpread: 1.5,
           TurretSpeed: 50, MoveSpeed: 0.85, SpinSpeed: 55, Level2XP: 500, Level3XP: 1300, ...NO_SPECIAL },
    ru: ["Гряземёт","Шламовоз-подавитель","Швыряет грязь и мазут: каждое попадание на 5 секунд замедляет врага и его повороты больше чем вдвое, а на земле остаётся грязевая лужа на 10 секунд — кто в неё въедет, ползёт. Урон почти нулевой (3) — нужен танковый заслон."],
    en: ["Mud Slinger","Sludge suppressor","Lobs mud and fuel oil: every hit slows the enemy and its turning by more than half for 5 seconds, and leaves a mud puddle on the ground for 10 seconds — anyone driving into it crawls. Damage is next to nothing (3) — needs tanks to cover it."],
    uk: ["Гряземіт","Шламовоз-подавлювач","Жбурляє багно й мазут: кожне влучання на 5 секунд сповільнює ворога та його повороти більш ніж удвічі, а на землі лишається грязьова калюжа на 10 секунд — хто в неї в'їде, повзе. Шкода майже нульова (3) — потрібне танкове прикриття."] },
  // ── кролики ──
  { s: 'Nyul szellem', race: 'rabbit', chassis: 'Nyul light tank', role: 'Nyul light tank', model: 'ny_zayacprizrak',
    set: { Price: 800, UpgradeMask: mask('fuel', 'ammo', 'sight', 'turbo', 'carrot'), MaxHP: 30, FrontArmor: 0, BackArmor: 0, TopArmor: 0, Sight: 12,
           MinRange: 1, MaxRange: 12, Damage: 13, ReloadTime: 9, Ammo: 30, TurretSpeed: 60, MoveType: 2, ChainSpeed: null, MoveSpeed: 1.9, SpinSpeed: 140,
           Level2XP: 400, Level3XP: 1000, ...NO_SPECIAL },
    ru: ["Заяц-Призрак","Снайперский багги","Сверхбыстрый багги с абсурдно длинной пушкой: 13 урона на 12 клеток, прошивает тяжёлую броню свиней и успевает уехать до ответа. Брони нет вовсе, 30 живучести — умирает от первого же попадания."],
    en: ["Ghost Hare","Sniper buggy","A blazing-fast buggy with an absurdly long gun: 13 damage at 12 cells, pierces pig heavy armour and is gone before the reply lands. No armour at all, 30 HP — dies to the first hit."],
    uk: ["Заєць-Привид","Снайперський багі","Надшвидкий багі з абсурдно довгою гарматою: 13 шкоди на 12 клітинок, прошиває важку броню свиней і встигає поїхати до відповіді. Броні немає зовсім, 30 живучості — гине від першого ж влучання."] },
  { s: 'Nyul repavihar kamikaze salvo', race: 'rabbit', chassis: 'Nyul light tank', role: 'Nyul raketas', model: 'ny_morkovsmerch',
    set: { Price: 850, UpgradeMask: mask('fuel', 'sight', 'turbo', 'carrot'), MaxHP: 45, FrontArmor: 0, BackArmor: 0, TopArmor: 0, Sight: 9,
           MinRange: 3, MaxRange: 9, Damage: 7, ReloadTime: 25, ReshotTime: 0.1, ShotSpread: 4, Ammo: 40, Cargo: null, MoveType: 2, ChainSpeed: null, MoveSpeed: 1.5, SpinSpeed: 110,
           TurretSpeed: 90, Level2XP: 500, Level3XP: 1200, ExtraArmor: 20 },
    ru: ["Морковный Смерч","Лёгкая РСЗО","В залповом режиме за 4 секунды вываливает веером все 40 морковных ракет — один залп на весь боекомплект, потом к прицепу с боеприпасами. Одиночный огонь тоже есть, но перезарядка 25 секунд. Огромный разброс, брони нет, а при гибели боекомплект детонирует."],
    en: ["Carrot Twister","Light rocket launcher","In salvo mode it dumps all 40 carrot rockets in a fan within 4 seconds — one salvo empties it, then back to the ammo trailer. Single shots work too, but reload takes 25 seconds. Huge spread, no armour, and the ammo cooks off when it dies."],
    uk: ["Морквяний Смерч","Легка РСЗВ","У залповому режимі за 4 секунди вивалює віялом усі 40 морквяних ракет — один залп на весь боєкомплект, потім до причепа з боєприпасами. Поодинокий вогонь теж є, але перезаряджання 25 секунд. Величезний розкид, броні немає, а під час загибелі боєкомплект детонує."] },
  { s: 'Nyul vakond minelay', race: 'rabbit', chassis: 'Nyul light tank', role: 'Nyul aknarako', model: 'ny_krotoboy',
    set: { Price: 550, UpgradeMask: mask('fuel', 'ammo', 'sight', 'mines', 'armor', 'repair', 'turbo'), MaxHP: 70, FrontArmor: 2, BackArmor: 1, TopArmor: 1.5,
           Sight: 10, Ammo: 30, ReloadTime: 1, MoveSpeed: 1.35, SpinSpeed: 90, Detector: 1,
           SpecialType: 13, SpecialTime: null, Cargo: null, SpecialSound1: null, SpecialSound2: null },   // 13 — своя кнопка «Міни на ходу»
    ru: ["Кротобой","Скоростной сапёр","Вёрткий бронетрактор без оружия. Своя кнопка «Мины на ходу»: включил — едет и сам раскладывает мины по пути, каждые 2.5 клетки (30 мин); выключил — просто едет. Видит чужие мины."],
    en: ["Mole Smasher","Fast sapper","A nimble armoured tractor with no gun. Its own Mines on the Move button: switch it on and it drops a mine every 2.5 cells along its path (30 mines); switch it off and it just drives. Spots enemy mines."],
    uk: ["Кротобій","Швидкий сапер","Верткий бронетрактор без зброї. Своя кнопка «Міни на ходу»: увімкнув — їде й сам розкладає міни дорогою, кожні 2.5 клітинки (30 мін); вимкнув — просто їде. Бачить чужі міни."] },
  { s: 'Nyul boxkiallas', race: 'rabbit', chassis: 'Nyul light tank', role: 'Service', model: 'ny_pitstop',
    set: { Price: 500, UpgradeMask: mask('fuel', 'sight', 'turbo'), MaxHP: 75, FrontArmor: 2, BackArmor: 0.5, TopArmor: 1, Sight: 8,
           MoveType: 2, ChainSpeed: null, MoveSpeed: 2.2, SpinSpeed: 160, Cargo: 200, SpecialTime: 0.1, Resource: null, Projectile: 'Arc pitstop' },
    ru: ["Пит-Стоп","Боевой ремонтник","Быстрый бронированный багги техпомощи: врывается в бой, за секунды латает подбитых кроликов и подливает им топливо. Запас ресурсов маленький — на 1–2 машины, потом обратно к прицепам."],
    en: ["Pit Stop","Combat repair buggy","A fast armoured service buggy: rushes in, patches damaged rabbits in seconds and tops up their fuel. Its stock is small — enough for 1–2 vehicles, then back to the trailers."],
    uk: ["Піт-Стоп","Бойовий ремонтник","Швидкий броньований багі техдопомоги: вривається в бій, за секунди латає підбитих кроликів і доливає їм пальне. Запас ресурсів малий — на 1–2 машини, потім назад до причепів."] },
  { s: 'Nyul fulesek', race: 'rabbit', chassis: 'Nyul light tank', role: null, model: 'ny_ushastik',
    set: { Price: 900, UpgradeMask: mask('fuel', 'sight', 'repair', 'turbo'), MaxHP: 45, FrontArmor: 0.5, BackArmor: 0, TopArmor: 0.5, Sight: 22,
           MinRange: 0, MaxRange: 0, Detector: 1, 'Always Visible': 1, MoveType: 2, ChainSpeed: null, MoveSpeed: 1.2, SpinSpeed: 100,
           SpecialType: 14, SpecialTime: null, SpecialSound1: null, SpecialSound2: null },   // 14 — своя кнопка «Радар»: обзор ×3 на 15 с
    ru: ["Кролик-Ушастик","Машина разведки","Фургон с огромными антеннами-ушами: обзор 22 и видит мины. Своя кнопка «Радар»: на 15 секунд обзор втрое больше и сквозь деревья и холмы, потом 45 секунд перезарядки. Оружия нет, и светится как ёлка: врагу виден всегда."],
    en: ["Big Ears","Recon vehicle","A van with huge ear-shaped antennas: sight 22 and it spots mines. Its own Radar button: triple sight through trees and hills for 15 seconds, then a 45-second cooldown. No gun, and lit up like a Christmas tree: always visible to the enemy."],
    uk: ["Кролик-Вухань","Машина розвідки","Фургон з величезними антенами-вухами: огляд 22 і бачить міни. Своя кнопка «Радар»: на 15 секунд огляд утричі більший і крізь дерева й пагорби, потім 45 секунд перезаряджання. Зброї немає, і світиться як ялинка: ворогові видно завжди."] },
];

// Нові снаряди (секції, на які посилається Projectile=).
const PROJECTILES = `
;*************************************************************************
; Arcanum: снаряди нових юнітів
;*************************************************************************
[Arc lang]
Model = projectiles\\makklovedek.4d
CollisionSphere = 0.1
SmokeColor = 0xFF7A20
SmokeStrength = 6
SmokeFadeSpeed = 0.06
SmokeScale = 0.05
ExplodeSound = explode\\impact.wav
DamageRadius = 1.2

[Arc ostrom lovedek]
Model = projectiles\\mozsar_tolteny.4d
CollisionSphere = 0.1
SmokeColor = 0xC0D0E0
SmokeStrength = 4
SmokeFadeSpeed = 0.01
SmokeScale = 0.04
ExplodeSound = explode\\impact.wav
DamageRadius = 3

[Arc pitstop]
Model = projectiles\\attoltes_service.4d
SmokeColor = 0
SmokeStrength = 0
SmokeFadeSpeed = 1
SmokeScale = 0
AddHP = 1
AddFuel = 1

[Arc sar]
Model = projectiles\\makklovedek.4d
CollisionSphere = 0.1
SmokeColor = 0x4A3520
SmokeStrength = 8
SmokeFadeSpeed = 0.005
SmokeScale = 0.06
ExplodeSound = explode\\impact.wav
DamageRadius = 2.2
`.replace(/\n/g, '\r\n');

// ───────────── ini ─────────────
function readPakEntry(pakPath, want) {
  const fd = fs.openSync(pakPath, 'r'), h = Buffer.alloc(16); fs.readSync(fd, h, 0, 16, 0);
  const isz = h.readUInt32LE(12), ib = Buffer.alloc(isz); fs.readSync(fd, ib, 0, isz, 16);
  let p = 0, prev = ''; const par = {};
  while (p < isz) {
    const pre = ib[p], nl = ib[p + 1], src = (p in par) ? par[p] : prev;
    const name = src.slice(0, pre) + ib.toString('latin1', p + 2, p + 2 + nl), q = p + 2 + nl;
    const C = ib.readUInt32LE(q + 9); if (C) par[C] = name;
    if (name.toLowerCase() === want) { const b = Buffer.alloc(ib.readUInt32LE(q + 4)); fs.readSync(fd, b, 0, b.length, 16 + isz + ib.readUInt32LE(q)); fs.closeSync(fd); return b; }
    prev = name; p = q + 13;
  }
  fs.closeSync(fd); return null;
}
const keyOf = l => { const m = l.match(/^\s*([^=;\s][^=]*?)\s*=/); return m ? m[1].trim().toLowerCase() : null; };
function sectionRange(lines, name) {
  const start = lines.findIndex(l => l.trim().toLowerCase() === `[${name}]`.toLowerCase());
  if (start < 0) throw new Error('no section ' + name);
  let end = start + 1; while (end < lines.length && !lines[end].trim().startsWith('[')) end++;
  while (end > start + 1 && (lines[end - 1].trim() === '' || lines[end - 1].trim().startsWith(';'))) end--;
  return [start, end];
}
const fmt = v => typeof v === 'number' ? String(Math.round(v * 1000) / 1000) : String(v);
// Застосовує set до тіла секції: міняє значення, null — видаляє ключ, нові ключі — в кінець.
function applySet(body, set) {
  const lower = Object.fromEntries(Object.entries(set).map(([k, v]) => [k.toLowerCase(), [k, v]]));
  const seen = new Set();
  const out = body.flatMap(l => {
    const k = keyOf(l); if (!k || !(k in lower)) return [l];
    seen.add(k); const [K, v] = lower[k];
    if (v === null) return [];
    const ind = l.match(/^\s*/)[0]; return [`${ind}${l.trim().split('=')[0].trim()} = ${fmt(v)}`];
  });
  for (const [k, [K, v]] of Object.entries(lower)) if (!seen.has(k) && v !== null) out.push(`${K} = ${fmt(v)}`);
  return out;
}
const readSection = (lines, name) => { const [a, b] = sectionRange(lines, name); return lines.slice(a + 1, b); };
const props = body => Object.fromEntries(body.map(l => [keyOf(l), l.split('=').slice(1).join('=').trim()]).filter(([k]) => k));

// #3: третя раса — Ворони (раса 2), поки заглушка на моделі «Чародій»: tools/raven-race.js
const RAVEN = require('./raven-race');
UNITS.push(...RAVEN.UNITS);

// ───────────── збірка ─────────────
const base = readPakEntry(path.join(GAME, 'gamedata/base/base.pak'), 'units.ini').toString('latin1');
let lines = base.split('\r\n');
const balance = { vanilla: [], units: [] };
for (const v of VANILLA) {
  const [a, b] = sectionRange(lines, v.s), body = lines.slice(a + 1, b), before = props(body);
  lines.splice(a + 1, b - a - 1, ...applySet(body, v.set));
  balance.vanilla.push({ section: v.s, why: v.why, changes: Object.entries(v.set).map(([k, val]) => ({ key: k, from: before[k.toLowerCase()] ?? null, to: val })) });
}
// Загальної шкали цін більше нема (#10): ванільні ціни — як у грі.
const PRICE_SCALE = 1;
balance.priceScale = { factor: PRICE_SCALE, sections: [] };
// Ціни нових юнітів — modpack/balance/prices.json (у ванільній шкалі: звичайний танк 400).
const PRICES = JSON.parse(fs.readFileSync(path.join(__dirname, '../modpack/balance/prices.json'), 'utf8')).prices;
for (const [name, price] of Object.entries(PRICES)) {
  if (!lines.some(l => l.trim().toLowerCase() === `[${name}]`.toLowerCase())) continue;
  const [a0, b0] = sectionRange(lines, name), body = lines.slice(a0 + 1, b0), p = props(body);
  lines.splice(a0 + 1, b0 - a0 - 1, ...applySet(body, { Price: price }));
}
const orig = base.split('\r\n');                        // донори — з оригіналу, без наших правок
let added = '';
for (const u of UNITS) {
  const ch = readSection(orig, u.chassis).filter(l => !ROLE_KEYS.includes(keyOf(l)));
  const role = u.role ? readSection(orig, u.role).filter(l => ROLE_KEYS.includes(keyOf(l))) : [];
  const model = u.model || (u.race === 'pig' ? 'd_arctank' : 'ny_arctank');   // своя модель (tools/models/*.js) або тимчасова
  if (PRICES[u.s]) u.set.Price = PRICES[u.s];
  let body = applySet([...ch, ...role], { Model: `units${BS}skinned${BS}${model}`, Icon: model, MoveType: 1, ...u.set });
  body = body.filter(l => l.trim() !== '' && !l.trim().startsWith(';'));
  added += ['', ';---------------------------------------', `; Arcanum: ${u.en[0]} (${u.en[1]}). Needs patched swineHD.exe.`, `[${u.s}]`, ...body].join('\r\n') + '\r\n';
  const p = props(body);
  balance.units.push({ section: u.s, model, race: u.race, ru: u.ru, uk: u.uk, en: u.en, chassis: u.chassis, role: u.role, stats: p });
}
let units = lines.join('\r\n').replace(/\s*$/, '') + '\r\n' + added + PROJECTILES;
fs.mkdirSync(path.join(OUT, 'gamedata/base'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'gamedata/base/units.ini'), units, 'latin1');

// ───────────── тексти ─────────────
for (const lang of fs.readdirSync(path.join(GAME, 'gamedata'))) {
  const pak = path.join(GAME, 'gamedata', lang, lang.toLowerCase() + '.pak');
  if (!fs.existsSync(pak)) continue;
  const o = readPakEntry(pak, 'units_text.ini'); if (!o) continue;
  const add = UNITS.map(u => { const [nick, name, desc] = lang === 'RU' ? u.ru : u.en; return `\r\n[${u.s}]\r\n Nick = ${nick}\r\n Name = ${name}\r\n Desc = ${desc}`; }).join('');
  const isUtf8 = o[0] === 0xEF && o[1] === 0xBB;      // RU/ZH з BOM; інші — однобайтові кодування
  const tail = isUtf8 ? Buffer.from(add, 'utf8') : Buffer.from(add.replace(/[^\x00-\x7f]/g, '?'), 'latin1');
  fs.mkdirSync(path.join(OUT, 'gamedata', lang), { recursive: true });
  fs.writeFileSync(path.join(OUT, 'gamedata', lang, 'units_text.ini'), Buffer.concat([o.slice(0, o.length - (o.toString('latin1').match(/\s*$/)[0].length)), tail, Buffer.from('\r\n')]));
}

fs.writeFileSync(path.join(OUT, 'classes.json'), JSON.stringify({
  rabbit: UNITS.filter(u => u.race === 'rabbit').map(u => u.s), pig: UNITS.filter(u => u.race === 'pig').map(u => u.s), raven: RAVEN.row }, null, 2));
RAVEN.extra(OUT, GAME, readPakEntry);              // модель v_charodey, messages.ini (SWINE_RAVEN — раса в лобі)
fs.writeFileSync(path.join(OUT, 'balance.json'), JSON.stringify(balance, null, 2));
console.log(`units.ini: ${balance.vanilla.length} vanilla sections changed, ${UNITS.length} new units → ${OUT}`);
for (const u of balance.units) { const p = u.stats; console.log(`  ${u.section.padEnd(26)} ${u.ru[0].padEnd(16)} price ${p.price} hp ${p.maxhp} arm ${p.frontarmor}/${p.backarmor}/${p.toparmor} dmg ${p.damage ?? '-'} rl ${p.reloadtime ?? '-'} rng ${p.minrange ?? '-'}-${p.maxrange ?? '-'} spd ${p.movespeed} sp ${p.specialtype ?? '-'} shot ${p.shottype ?? '-'} proj ${p.projectile ?? '-'}`); }

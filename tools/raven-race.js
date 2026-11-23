// #3 — Третя раса «Корпус Воронов» (Пернатый Авиакорпус / Raven Air Corps, раса 2 у грі).
// Підключається з tools/arc-units.js.
//
// Що тут:
//   UNITS — 15 секцій units.ini «Varju …» (9 бойових базових класів + аеродромний тягач v_vontato + 5 унікальних
//           машин Arcanum Корпусу Воронів) зі своїми 3D-моделями tools/models/v_*.js, характеристиками, слабкими
//           місцями (висока витрата пального турбін, вразлива корма) і авіаційними спецздібностями.
//   row   — повний рядок таблиці класів для patchgen (classes.json "raven"): 13 базових місць (включно з Varju vontato,
//           спільними причепами Ammo/Fuel/Service та флагманом Varju movingforce) + 5 нових класів = 18.
//   extra(OUT, GAME, readPakEntry) — дописує бомбардувальники [Varju bombazo] (платний 35 SP, урон 24, швидкість 9.6)
//           і [Varju taktikai bombazo] (безкоштовний легкий наліт з КД 45 с, урон 11, швидкість 12.0), снаряд
//           крилатого дрона [Arc albatrosz dron], копіює всі 15 пакетів 3D-моделей v_* у OUT/gamedata/base/ та
//           додає «SWINE_RAVEN» у messages.ini всіх мов.
'use strict';
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');

const UP = { fuel: 1, ammo: 2, sight: 4, mines: 8, armor: 16, repair: 32, turbo: 64, beer: 128, carrot: 256 };
const mask = (...u) => u.reduce((a, k) => a | UP[k], 0);
const NO_SPECIAL = { SpecialType: null, SpecialTime: null, ExtraArmor: null, SpecialSound1: null, SpecialSound2: null };
const WHEELS = { MoveType: 2, ChainSpeed: null, Trail: null, TrailWidth: null, TrailOffset: null };
const TRACKS = { MoveType: 1, ChainSpeed: 1.6 };

const UNITS = [
  // ── 10 базових машин (слоти 0..8 та 12) ──
  {
    s: 'Varju dzsip', model: 'v_dzsip', chassis: 'Diszno dzsip', role: 'Diszno dzsip',
    set: {
      ...WHEELS, Character: 'R01-v_dzsip', Voice: 'R01-v_dzsip',
      Price: 280, UpgradeMask: mask('fuel', 'sight', 'repair', 'turbo'),
      MaxHP: 65, FrontArmor: 1, BackArmor: 0, TopArmor: 1.5, Sight: 15, UnitSize: 1.0,
      MoveSpeed: 1.85, SpinSpeed: 130, MaxFuel: 100, Consume: 1200,
      MinRange: 0, MaxRange: 15, SpecialType: 11,
    },
    ru: ['Стриж', 'Разведчик-наводчик', 'Сверхбыстрый авиа-джип с радаром: вызывает тяжёлый штурмовой авиаудар всего за 35 SP (быстрый бомбардировщик Воронов, скорость 9.6, 24 урона). Обзор 15, композитная крыша 1.5, но картонная корма и прожорливые турбины.'],
    uk: ['Стриж', 'Розвідник-навідник', 'Надшвидкий авіа-джип із радаром: викликає важкий штурмовий авіаудар лише за 35 SP (бомбардувальник Воронів, швидкість 9.6, 24 шкоди). Огляд 15, дах 1.5, але тонка корма і ненажерливі турбіни.'],
    en: ['Swift', 'Air-spotter jeep', 'Blazing aero-jeep with spotter radar: calls in a heavy Raven airstrike for only 35 SP (fast bomber speed 9.6, 24 damage). Sight 15, composite roof 1.5, fragile rear and thirsty turbines.'],
  },
  {
    s: 'Varju pancelauto freeair', model: 'v_pancelkocsi', chassis: 'Diszno pancelauto', role: 'Diszno pancelauto',
    set: {
      ...WHEELS, Character: 'R02-v_pancelkocsi', Voice: 'R02-v_pancelkocsi',
      Price: 320, UpgradeMask: mask('fuel', 'ammo', 'sight', 'armor', 'turbo'),
      MaxHP: 70, FrontArmor: 1, BackArmor: 0.5, TopArmor: 1.5, Sight: 12, UnitSize: 1.0,
      MoveSpeed: 1.55, SpinSpeed: 100, TurretSpeed: 105, MaxFuel: 100, Consume: 1100,
      MinRange: 0.7, MaxRange: 8, Actionrange: 12, Damage: 4, ReloadTime: 1.2, Ammo: 120,
      SpecialType: 11, Level2XP: 320, Level3XP: 820,
    },
    ru: ['Ястреб-ЗУ', 'Броневик ПВО', 'Скорострельная спаренная автопушка (4 урона каждые 1.2 с) + БЕСПЛАТНЫЙ лёгкий авианалёт прикрытия (0 SP, откат 45 с, штурмовик на 11 урона)! Отлично косит разведку и багги кроликов, но бессилен против тяжёлой брони.'],
    uk: ['Яструб-ЗУ', 'Броньовик ППО', 'Швидкострільна спарена автогармата (4 шкоди кожні 1.2 с) + БЕЗКОШТОВНИЙ легкий авіаналіт прикриття (0 SP, відкат 45 с, штурмовик на 11 шкоди)! Косить розвідку й багі, але слабкий проти важкої броні.'],
    en: ['Hawk AA', 'AA armored car', 'Rapid twin autocannon (4 damage every 1.2s) + FREE light tactical air support strike (0 SP, 45s cooldown, 11-damage striker)! Shreds light scouts and buggies, weak against heavy armor.'],
  },
  {
    s: 'Varju tank', model: 'v_tank', chassis: 'Diszno normal tank', role: 'Diszno normal tank',
    set: {
      ...TRACKS, Character: 'R03-v_tank', Voice: 'R03-v_tank',
      Price: 420, UpgradeMask: mask('fuel', 'ammo', 'sight', 'armor', 'repair', 'turbo'),
      MaxHP: 80, FrontArmor: 2, BackArmor: 0.5, TopArmor: 2.5, Sight: 9.5, UnitSize: 1.0,
      MoveSpeed: 1.05, SpinSpeed: 70, TurretSpeed: 85, MaxFuel: 100, Consume: 820,
      MinRange: 1.0, MaxRange: 7.5, Actionrange: 12, Damage: 8, ReloadTime: 5.2, Ammo: 75,
      SpecialType: 0, SpecialTime: 7, ExtraArmor: 2.0, Level2XP: 360, Level3XP: 900,
    },
    ru: ['Беркут', 'Основной стелс-танк', 'Танк с композитной крышей (2.5), скоростными турбинами (1.05) и пушкой на 8 урона: лучше всех держит навесной огонь и авиаудары, умеет окапываться (+2.0 к броне), но имеет слабую корму (0.5) и повышенный расход топлива.'],
    uk: ['Беркут', 'Основний стелс-танк', 'Танк із композитним дахом (2.5), швидкими турбінами (1.05) і гарматою на 8 шкоди: найкраще тримає навісний вогонь, окопується (+2.0 до броні), але має тонку корму (0.5) і високу витрату пального.'],
    en: ['Golden Eagle', 'Stealth main battle tank', 'MBT with composite roof armor (2.5), fast turbines (1.05) and an 8-damage gun: shrugs off artillery and air splashes, can dig in (+2.0 armor), but has thin rear armor (0.5) and higher fuel burn.'],
  },
  {
    s: 'Varju loveg', model: 'v_loveg', chassis: 'Diszno loveg', role: 'Diszno loveg',
    set: {
      ...WHEELS, Character: 'R04-v_loveg', Voice: 'R04-v_loveg',
      Price: 520, UpgradeMask: mask('fuel', 'ammo', 'sight', 'turbo'),
      MaxHP: 70, FrontArmor: 1.5, BackArmor: 0.5, TopArmor: 2, Sight: 8.5, UnitSize: 1.1,
      MoveSpeed: 1.25, SpinSpeed: 80, TurretSpeed: 75, MaxFuel: 100, Consume: 1050,
      MinRange: 4, MaxRange: 26, Actionrange: 14, Damage: 7, ReloadTime: 6.8, Ammo: 35,
      SpecialType: 0, SpecialTime: 4, ExtraArmor: 1.5,
      SpecialSound1: 'special/hidraulika2.wav', SpecialSound2: 'special/hidraulika2.wav',
      Level2XP: 320, Level3XP: 800,
    },
    ru: ['Гриф', 'Дальнобойная авиа-гаубица', 'Скоростная 4×4 гаубица на 26 клеток: стреляет сразу с хода без долгого развёртывания, а по кнопке «Стабилизация» за 4 секунды встаёт на упоры (+1.5 к броне). Возит всего 35 снарядов — берегите тягач с БК.'],
    uk: ['Гриф', 'Далекобійна авіа-гаубиця', 'Швидка 4×4 гаубиця на 26 клітинок: стріляє одразу з ходу без розгортання, а за кнопкою «Стабілізація» за 4 секунди стає на упори (+1.5 до броні). Везе лише 35 снарядів.'],
    en: ['Vulture', 'Long-range aero-howitzer', 'Fast 4x4 howitzer reaching 26 cells: fires immediately on the move without deploying, or locks down on outriggers in 4s (+1.5 armor). Carries only 35 shells — keep an ammo trailer close.'],
  },
  {
    s: 'Varju vadasz freeair', model: 'v_vadasz', chassis: 'Nyul raketas pancelkocsi', role: 'Nyul raketas pancelkocsi',
    set: {
      ...WHEELS, Character: 'R05-v_vadasz', Voice: 'R05-v_vadasz',
      Price: 620, UpgradeMask: mask('fuel', 'ammo', 'sight', 'turbo'),
      MaxHP: 65, FrontArmor: 1, BackArmor: 0, TopArmor: 1.5, Sight: 11, UnitSize: 1.0,
      MoveSpeed: 1.45, SpinSpeed: 105, TurretSpeed: 85, MaxFuel: 100, Consume: 950,
      MinRange: 2, MaxRange: 10.5, Actionrange: 13, Damage: 10, ReloadTime: 5.8, Ammo: 24,
      SpecialType: 11, Level2XP: 350, Level3XP: 900,
    },
    ru: ['Сокол-ПТ', 'Истребитель танков (ПТУР)', 'Сверхбыстрый перехватчик с управляемыми ракетами на крыльевых пилонах (10 урона на 10.5 клеток) + БЕСПЛАТНЫЙ точечный авианалёт (0 SP, откат 45 с, штурмовик на 11 урона). Прошивает тяжёлую броню Свинов, но возит лишь 24 ракеты.'],
    uk: ['Сокіл-ПТ', 'Винищувач танків (ПТКР)', 'Надшвидкий перехоплювач із керованими ракетами (10 шкоди на 10.5 клітинок) + БЕЗКОШТОВНИЙ точковий авіаналіт (0 SP, відкат 45 с, 11 шкоди). Прошиває важку броню, але має лише 24 ракети.'],
    en: ['Falcon AT', 'ATGM tank destroyer', 'Ultra-fast interceptor with wing-mounted guided missiles (10 damage at 10.5 range) + FREE tactical air strike (0 SP, 45s cooldown, 11-damage striker). Pierces heavy Pig armor, carries only 24 missiles.'],
  },
  {
    s: 'Varju raketas', model: 'v_raketas', chassis: 'Diszno raketas', role: 'Diszno raketas',
    set: {
      ...TRACKS, Character: 'R06-v_raketas', Voice: 'R06-v_raketas',
      Price: 680, UpgradeMask: mask('fuel', 'ammo', 'sight', 'armor'),
      MaxHP: 75, FrontArmor: 1.5, BackArmor: 0.5, TopArmor: 2, Sight: 9.5, UnitSize: 1.1,
      MoveSpeed: 0.88, SpinSpeed: 55, TurretSpeed: 50, MaxFuel: 100, Consume: 780,
      MinRange: 3, MaxRange: 11, Actionrange: 13, Damage: 8, ReloadTime: 6.5, ReshotTime: 0.25, ShotSpread: 2.4, Ammo: 48,
      SpecialType: 6, Level2XP: 400, Level3XP: 1000,
    },
    ru: ['Коршун', 'Гусеничная авиа-РСЗО', '12-ствольная пусковая авиационных ракет: в залповом режиме выпускает плотный веер из 8 ракет подряд (вместо 5 у обычных РСЗО) на 11 клеток! Быстро расходует боекомплект (48 ракет) и требует прикрытия.'],
    uk: ['Коршун', 'Гусенична авіа-РСЗВ', '12-ствольна пускова авіаракет: у залповому режимі випускає щільне віяло з 8 ракет поспіль (замість 5) на 11 клітинок! Швидко витрачає боєкомплект (48 ракет).'],
    en: ['Kite MLRS', 'Tracked aero-MLRS', '12-tube aircraft-rocket battery: in salvo mode unleashes an enhanced 8-rocket barrage (instead of 5) up to 11 cells! Burns through its 48-rocket reserve quickly.'],
  },
  {
    s: 'Varju mozsar slow', model: 'v_mozsar', chassis: 'Diszno mozsar', role: 'Diszno mozsar',
    set: {
      ...TRACKS, Character: 'R07-v_mozsar', Voice: 'R07-v_mozsar',
      Price: 650, UpgradeMask: mask('fuel', 'ammo', 'sight', 'armor', 'repair'),
      MaxHP: 115, FrontArmor: 3, BackArmor: 1.5, TopArmor: 3, Sight: 8, UnitSize: 1.15,
      MoveSpeed: 0.68, SpinSpeed: 45, TurretSpeed: 45, MaxFuel: 100, Consume: 650,
      MinRange: 2, MaxRange: 6.5, Actionrange: 10, Damage: 15, ReloadTime: 6.5, Ammo: 40,
      SpecialType: 0, SpecialTime: 5, ExtraArmor: 2.0,
      SpecialSound1: 'special/beasas8mp.wav', SpecialSound2: 'special/beasas8mp.wav',
      Level2XP: 450, Level3XP: 1100,
    },
    ru: ['Филин', 'Авиабомбомёт-мортира', 'Крепкий штурмовой бункер (115 HP, крыша 3.0): навесом метает фугасные авиабомбы со шламом на 15 урона — каждое попадание замедляет врага более чем вдвое и оставляет зону помех на 20 секунд! Умеет окапываться (+2.0 к броне).'],
    uk: ['Пугач', 'Авіабомбомет-мортира', 'Міцний штурмовий бункер (115 HP, дах 3.0): навісом кидає авіабомби на 15 шкоди — кожне влучання сповільнює ворога більш ніж удвічі та лишає зону перешкод на 20 секунд! Окопується (+2.0 до броні).'],
    en: ['Eagle Owl', 'Aerial bomb-mortar', 'Tough assault bunker (115 HP, roof 3.0): lobs 15-damage aerial sludge-bombs — every hit slows the target by over half and leaves a 20-second jammer puddle! Can fortify (+2.0 armor).'],
  },
  {
    s: 'Varju aknarako', model: 'v_aknarako', chassis: 'Diszno aknarako', role: 'Diszno aknarako',
    set: {
      ...TRACKS, Character: 'R08-v_aknarako', Voice: 'R08-v_aknarako',
      Price: 400, UpgradeMask: mask('fuel', 'ammo', 'sight', 'mines', 'armor', 'repair', 'turbo'),
      MaxHP: 75, FrontArmor: 2, BackArmor: 1, TopArmor: 2, Sight: 15, UnitSize: 1.0,
      MoveSpeed: 1.15, SpinSpeed: 70, MaxFuel: 100, Consume: 750,
      MinRange: 0, MaxRange: 14, Ammo: 30, ReloadTime: 1, Detector: 1,
      SpecialType: 13, SpecialTime: null, Cargo: null, SpecialSound1: null, SpecialSound2: null,
    },
    ru: ['Дятел', 'Инженерный авиа-минёр', 'Оснащён широким крылом-миноискателем (обзор 15, видит мины) и револьверной каруселью авиамин. Кнопка «Мины на ходу»: раскладывает мины каждые 2.5 клетки прямо в движении (30 мин). Оружия прямого боя нет.'],
    uk: ['Дятел', 'Інженерний авіа-мінер', 'Широке крило-міношукач (огляд 15, бачить міни) і револьверна карусель авіамін. Кнопка «Міни на ходу»: сам розкладає міни кожні 2.5 клітинки в русі (30 мін).'],
    en: ['Woodpecker', 'Aero-minelayer', 'Equipped with a wide wing-detector (sight 15, spots mines) and rotary aerial-mine carousel. Mines on the Move button: drops a mine every 2.5 cells while driving (30 mines).'],
  },
  {
    s: 'Varju vontato', model: 'v_vontato', chassis: 'Diszno vontato', role: 'Diszno vontato',
    set: {
      ...WHEELS, Character: 'R01-v_vontato', Voice: 'R01-v_vontato',
      Price: 220, UpgradeMask: mask('fuel', 'sight', 'armor', 'turbo'),
      MaxHP: 60, FrontArmor: 1.5, BackArmor: 0.5, TopArmor: 1, Sight: 7, UnitSize: 1.0,
      MoveSpeed: 1.5, SpinSpeed: 100, MaxFuel: 100, Consume: 1550,
      MinRange: 0, MaxRange: 6, SpecialType: 4,
    },
    ru: ['Скворец', 'Аэродромный тягач', 'Быстрый бронированный аэродромный буксир со сцепной фермой для стандартных прицепов (Топливо, Боеприпасы, Ремонт). Быстрее и крепче ванильных тягачей (60 HP, броня 1.5/0.5/1) — основа логистики прожорливого Корпуса Воронов.'],
    uk: ['Шпак', 'Аеродромний тягач', 'Швидкий броньований аеродромний буксир для причепів (Пальне, Боєприпаси, Ремонт). Швидший і міцніший за ванільні тягачі (60 HP, броня 1.5/0.5/1).'],
    en: ['Starling', 'Airfield tow tractor', 'Fast armored airfield pushback tug for standard trailers (Fuel, Ammo, Service). Faster and tougher than vanilla tow trucks (60 HP, armor 1.5/0.5/1) — vital for thirsty Raven turbines.'],
  },
  {
    s: 'Varju movingforce', model: 'v_movingforce', chassis: 'Diszno movingforce', role: 'Diszno movingforce',
    set: {
      ...TRACKS, Character: 'R12-v_movingforce', Voice: 'R12-v_movingforce',
      Price: 1450, UpgradeMask: mask('fuel', 'sight', 'repair'),
      MaxHP: 195, FrontArmor: 4, BackArmor: 2.5, TopArmor: 4.5, Sight: 11, UnitSize: 1.45,
      MoveSpeed: 0.62, SpinSpeed: 38, MaxFuel: 100, Consume: 1000000000,
      MinRange: 5, MaxRange: 24, Damage: 65, Projectile: 'Arc albatrosz dron',
      SpecialType: 5, SpecialTime: 35, Cargo: 100,
    },
    ru: ['Альбатрос', 'Сухопутный авианосец', 'Колоссальный флагман с полётной палубой (195 HP, броня крыши 4.5): каждые 35 секунд БЕСПЛАТНО запускает с катапульты крылатый дрон-камикадзе на 24 клетки (65 урона по площади в радиусе 3.5)! Неповоротлив в ближнем бою.'],
    uk: ['Альбатрос', 'Сухопутний авіаносець', 'Колосальний флагман із польотною палубою (195 HP, дах 4.5): кожні 35 секунд БЕЗКОШТОВНО запускає з катапульти крилатий дрон на 24 клітинки (65 шкоди в радіусі 3.5)!'],
    en: ['Albatross', 'Land aircraft carrier', 'Colossal flight-deck flagship (195 HP, roof armor 4.5): launches a FREE catapult cruise-drone every 35 seconds up to 24 cells away (65 splash damage in a 3.5 radius)!'],
  },

  // ── 5 унікальних машин Arcanum Корпусу Воронів (слоти 13..17) ──
  {
    s: 'Varju sokolzrk freeair', model: 'v_sokolzrk', chassis: 'Diszno raketas', role: 'Nyul raketas pancelkocsi',
    set: {
      ...TRACKS, Character: 'R02-v_sokolzrk', Voice: 'R02-v_sokolzrk',
      Price: 780, UpgradeMask: mask('fuel', 'ammo', 'sight', 'armor', 'repair'),
      MaxHP: 95, FrontArmor: 2, BackArmor: 1, TopArmor: 2.5, Sight: 13, UnitSize: 1.1,
      MoveSpeed: 0.85, SpinSpeed: 50, TurretSpeed: 95, MaxFuel: 100, Consume: 780,
      MinRange: 2.5, MaxRange: 11, Actionrange: 14, ShotType: 3, Damage: 11, ReloadTime: 5.5, Ammo: 16,
      SpecialType: 11, Level2XP: 500, Level3XP: 1300,
    },
    ru: ['Сапсан-ЗРК', 'Комплекс ПВО/ПРО', 'Гусеничный зенитно-ракетный комплекс: автоматически ПЕРЕХВАТЫВАЕТ вражеские бомбардировщики в радиусе 14 клеток (срывает авиаудар врага за 1 ракету!), бьёт тяжёлыми ЗУР по танкам на 11 клеток (11 урона) и вызывает БЕСПЛАТНЫЙ авианалёт прикрытия (0 SP, КД 45 с)! Малый боекомплект (16 ракет).'],
    uk: ['Сапсан-ЗРК', 'Комплекс ППО/ПРО', 'Гусеничний ЗРК: автоматично ПЕРЕХОПЛЮЄ ворожі бомбардувальники в радіусі 14 клітинок (зриває авіаудар за 1 ракету!), б\'є ракетами по танках на 11 клітинок (11 шкоди) та викликає БЕЗКОШТОВНИЙ авіаналіт (0 SP, КД 45 с)! Лише 16 ракет.'],
    en: ['Peregrine SAM', 'Air-defense SAM system', 'Tracked SAM battery: automatically INTERCEPTS enemy bombers within 14 cells (aborts enemy airstrikes for 1 missile!), fires 11-damage guided missiles at armor up to 11 cells, and calls a FREE tactical air strike (0 SP, 45s CD)! Small 16-missile reserve.'],
  },
  {
    s: 'Varju ekranoplan', model: 'v_ekranoplan', chassis: 'Diszno pancelauto', role: 'Diszno pancelauto',
    set: {
      ...WHEELS, Character: 'R03-v_ekranoplan', Voice: 'R03-v_ekranoplan',
      Price: 720, UpgradeMask: mask('fuel', 'ammo', 'sight', 'turbo'),
      MaxHP: 70, FrontArmor: 1.5, BackArmor: 0, TopArmor: 1.5, Sight: 11, UnitSize: 1.1,
      CanSwim: 1, MoveSpeed: 2.05, SpinSpeed: 135, TurretSpeed: 110, MaxFuel: 100, Consume: 520,
      MinRange: 0.5, MaxRange: 6.5, Actionrange: 11, ShotType: 1, Damage: 6, ReloadTime: 0.8, Ammo: 90,
      ...NO_SPECIAL, Level2XP: 500, Level3XP: 1200,
    },
    ru: ['Буревестник', 'Ударный экраноплан', 'Сверхбыстрый амфибийный штурмовик (скорость 2.05, скользит по воде — CanSwim!): носовой шестиствольный Гатлинг выплёвывает 6 урона каждые 0.8 секунды, в клочья разрывая багги, артиллерию и тыловые колонны. Огромный расход топлива и нулевая корма.'],
    uk: ['Буревісник', 'Ударний екраноплан', 'Надшвидкий амфібійний штурмовик (швидкість 2.05, ковзає по воді — CanSwim!): носовий шестиствольний Гатлінг видає 6 шкоди кожні 0.8 секунди, рвучи багі й артилерію. Велика витрата пального і нульова корма.'],
    en: ['Petrel', 'Amphibious assault ekranoplan', 'Blazing amphibious ground-effect striker (speed 2.05, skims across water — CanSwim!): nose 6-barrel Gatling deals 6 damage every 0.8s, shredding buggies and rear artillery. Huge fuel burn and zero rear armor.'],
  },
  {
    s: 'Varju sova', model: 'v_sova', chassis: 'Diszno dzsip', role: null,
    set: {
      ...WHEELS, Character: 'R05-v_sova', Voice: 'R05-v_sova',
      Price: 540, UpgradeMask: mask('fuel', 'sight', 'repair', 'turbo'),
      MaxHP: 55, FrontArmor: 1, BackArmor: 0, TopArmor: 1.5, Sight: 20, UnitSize: 1.0,
      MoveSpeed: 1.25, SpinSpeed: 100, MaxFuel: 100, Consume: 950,
      MinRange: 0, MaxRange: 0, Detector: 1,
      SpecialType: 14, SpecialTime: null, SpecialSound1: null, SpecialSound2: null,
    },
    ru: ['Сова-ДРЛО', 'Командный пункт ДРЛО', 'Бронефургон с вращающейся тарелкой AWACS: обзор 20 и обнаружение мин. Бесплатная кнопка «Орлиный Глаз» (0 SP): на 15 секунд утраивает обзор (до 60!) сквозь леса и горы, затем 45 секунд перезарядки. Оружия нет; через 10 минут боя засекается врагом.'],
    uk: ['Сова-ДРЛВ', 'Командний пункт ДРЛВ', 'Бронефургон із тарілкою AWACS: огляд 20 і виявлення мін. Безкоштовна кнопка «Орлине Око» (0 SP): на 15 секунд потроює огляд крізь ліс і гори, потім 45 секунд відкату. Без зброї.'],
    en: ['Owl AWACS', 'Command AWACS radar van', 'Armored van with rotating AWACS rotodome: sight 20 and mine detector. Free "Eagle Eye" button (0 SP): triples sight through hills and woods for 15 seconds, 45-second cooldown. No gun; revealed after 10 minutes.'],
  },
  {
    s: 'Varju korshun kamikaze', model: 'v_korshunkam', chassis: 'Diszno normal tank', role: null,
    set: {
      ...WHEELS, Character: 'R06-v_korshunkam', Voice: 'R06-v_korshunkam',
      Price: 420, UpgradeMask: mask('fuel', 'sight', 'turbo'),
      MaxHP: 40, FrontArmor: 0.5, BackArmor: 0, TopArmor: 0.5, Sight: 10, UnitSize: 0.95,
      MoveSpeed: 2.15, SpinSpeed: 135, MaxFuel: 100, Consume: 650,
      MinRange: 0, MaxRange: 0, Damage: 55, ExtraArmor: 55, ShotSpread: 4.5, ExplodeType: 2,
      SpecialType: 12, SpecialTime: null, SpecialSound1: null, SpecialSound2: null,
    },
    ru: ['Пикировщик', 'Крылатая бомба-брандер', 'Беспилотная реактивная крылатая бомба на гоночном шасси (скорость 2.15 — быстрее Бомбохряка!). Своя кнопка «Подрыв»: термитный взрыв до 55 урона в радиусе 4.5. Хрупкая (40 HP, броня 0.5) — если подобьют по дороге, сдетонирует на месте.'],
    uk: ['Пікірувальник', 'Крилата бомба-брандер', 'Безпілотна реактивна крилата бомба на шасі (швидкість 2.15!). Своя кнопка «Підрив»: термітний вибух до 55 шкоди в радіусі 4.5. Крихка (40 HP).'],
    en: ['Dive Bomber', 'Winged cruise-bomb', 'Unmanned jet-boosted cruise bomb on racing wheels (speed 2.15 — faster than Boom Hog!). Detonate button: thermite blast dealing up to 55 damage in a 4.5 radius. Fragile (40 HP).'],
  },
  {
    s: 'Varju kondor', model: 'v_kondor', chassis: 'Diszno hard tank', role: 'Diszno hard tank',
    set: {
      ...TRACKS, Character: 'R07-v_kondor', Voice: 'R07-v_kondor',
      Price: 1250, UpgradeMask: mask('fuel', 'ammo', 'sight', 'repair'),
      MaxHP: 170, FrontArmor: 4, BackArmor: 1.5, TopArmor: 4, Sight: 10.5, UnitSize: 1.35,
      MoveSpeed: 0.62, SpinSpeed: 30, TurretSpeed: 35, MaxFuel: 100, Consume: 480,
      MinRange: 1.5, MaxRange: 9.5, Actionrange: 13, ShotType: 1, Damage: 16, ReloadTime: 6.0, Ammo: 40,
      SpecialType: 11, Level2XP: 1100, Level3XP: 2600,
    },
    ru: ['Кондор', 'Командный штурмовой флагман', 'Тяжёлый двухпушечный флагман Воронов (170 HP, броня 4 / 1.5 / 4): бьёт залпами на 16 урона каждые 6 секунд на 9.5 клеток И прямо с передовой вызывает тяжёлый бомбардировщик за 35 SP! Медленный и прожорливый, берегите корму от диверсантов.'],
    uk: ['Кондор', 'Командний штурмовий флагман', 'Важкий двогарматний флагман Воронів (170 HP, броня 4 / 1.5 / 4): б\'є на 16 шкоди кожні 6 секунд на 9.5 клітинок ТА прямо з передової викликає важкий бомбардувальник за 35 SP!'],
    en: ['Condor', 'Command assault flagship', 'Heavy twin-gun Raven flagship (170 HP, armor 4 / 1.5 / 4): fires 16-damage salvos every 6s at 9.5 range AND calls in heavy 35 SP airstrikes straight from the front line! Slow and thirsty.'],
  },
].map(u => ({ ...u, race: 'raven', realPrice: u.set.Price, set: { ...u.set, Price: 100000 } }));

const S = prefix => {
  const hit = UNITS.find(u => u.s === prefix || u.s.startsWith(prefix + ' '));
  if (!hit) throw new Error('Missing Raven unit: ' + prefix);
  return hit.s;
};

// Повний рядок таблиці класів для раси 2 (13 базових слотів + 5 нових = 18):
// 0 джип, 1 броньовик, 2 танк, 3 гаубиця, 4 ПТ, 5 РСЗВ, 6 мортира, 7 мінер,
// 8 тягач (Varju vontato), 9–11 причепи Воронів з ціною 100 000 SP (режим огляду), 12 Moving Force (Varju movingforce), 13–17 Arcanum.
const row = [
  S('Varju dzsip'),
  S('Varju pancelauto'),
  S('Varju tank'),
  S('Varju loveg'),
  S('Varju vadasz'),
  S('Varju raketas'),
  S('Varju mozsar'),
  S('Varju aknarako'),
  S('Varju vontato'),
  'Varju ammo',
  'Varju fuel',
  'Varju service',
  S('Varju movingforce'),
  S('Varju sokolzrk'),
  S('Varju ekranoplan'),
  S('Varju sova'),
  S('Varju korshun'),
  S('Varju kondor'),
];

// Пункт раси в лобі (messages.ini: SWINE_RABBIT = Кролик, SWINE_PIG = Свин, SWINE_RAVEN = Ворон)
const RACE_NAME = { RU: 'Ворон', EN: 'Raven', DE: 'Rabe', FR: 'Corbeau', IT: 'Corvo', SP: 'Cuervo', CZ: 'Havran', HU: 'Varju', ZH: '乌鸦' };

// Бомбардувальники Воронів (платний 35 SP важкий та безкоштовний тактичний з КД 45 с) і снаряд крилатого дрона Альбатроса
const RAVEN_EXTRA_INI = `
;*************************************************************************
; Arcanum: авіація та спецснаряди Корпусу Воронів (раса 2)
;*************************************************************************
[Varju bombazo]
ExplodeType = 3
Model = units\\skinned\\d_bombazo
Character = P09-Pilota
Voice = P10-Bombazo
Icon = d_bombazo
MaxHP = 35
Level2XP = 1000000
Level3XP = 1000000
Sight = 16
UnitType = 1
Selectable = 0
MoveType = 4
MoveSpeed = 9.6
SpinSpeed = 45
WheelSpeed = 0.05
EngineSound = engine/repulo01plus.wav
Damage = 24
Ghost_Texture = pig_ghosts\\pilota1.tga

[Varju taktikai bombazo]
ExplodeType = 3
Model = units\\skinned\\d_bombazo
Character = P09-Pilota
Voice = P10-Bombazo
Icon = d_bombazo
MaxHP = 30
Level2XP = 1000000
Level3XP = 1000000
Sight = 14
UnitType = 1
Selectable = 0
MoveType = 4
MoveSpeed = 12.0
SpinSpeed = 55
WheelSpeed = 0.05
EngineSound = engine/repulo01plus.wav
Damage = 11
Ghost_Texture = pig_ghosts\\pilota1.tga

[Arc albatrosz dron]
Model = projectiles\\mozsar_tolteny.4d
CollisionSphere = 0.1
SmokeColor = 0x90B8E8
SmokeStrength = 6
SmokeFadeSpeed = 0.008
SmokeScale = 0.05
ExplodeSound = explode\\tuzi66.wav
DamageRadius = 3.5

[Varju ammo]
ExplodeType = 2
ExplodeSound = explode\\tuzi66.wav
Model = units\\skinned\\utanfuto_ammo.4d
Price = 100000
UpgradeMask = 48
Icon = ammo
UnitSize = 0.6
MaxHP = 40
Sight = 3.5
MaxRange = 4.5
Resource = 1
SpecialType = 9
SpecialTime = 0.25
Projectile = Load Ammo
ShotHeight = .5
ShotSpeed = 2.1
ShotAngle = 60
SpecialSound1 = special/tarcsere02.wav
MoveSpeed = 1.35
Cargo = 900

[Varju fuel]
ExplodeType = 1
Model = units\\skinned\\utanfuto_fuel.4d
Price = 100000
UpgradeMask = 48
Icon = fuel
UnitSize = 0.6
MaxHP = 40
Sight = 3.5
MaxRange = 4.5
Resource = 1
SpecialType = 1
SpecialTime = 0.25
Projectile = Load Fuel
ShotHeight = .5
ShotSpeed = 2.1
ShotAngle = 60
SpecialSound1 = special/tankolas03.wav
MoveSpeed = 1.35
Cargo = 900

[Varju service]
Model = units\\skinned\\utanfuto_service.4d
Price = 100000
UpgradeMask = 48
Icon = service
UnitSize = 0.6
MaxHP = 40
Sight = 3.5
MaxRange = 4.5
Resource = 1
SpecialType = 8
SpecialTime = 0.25
Projectile = Load Service
ShotHeight = .5
ShotSpeed = 2.1
ShotAngle = 60
SpecialSound1 = special/szereles.wav
Cargo = 900
MoveSpeed = 1.35
`.replace(/\n/g, '\r\n');

function copyDirRecursive(src, dst) {
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDirRecursive(s, d);
    else { fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(s, d); }
  }
}

function extra(OUT, GAME, readPakEntry) {
  // 1. Дописуємо [Varju bombazo], [Varju taktikai bombazo] і [Arc albatrosz dron] у units.ini
  const unitsIniPath = path.join(OUT, 'gamedata/base/units.ini');
  fs.appendFileSync(unitsIniPath, RAVEN_EXTRA_INI, 'latin1');

  // 2. Копіюємо всі 15 пакетів моделей Корпусу Воронів (v_*) із mods-test/units/v_*/gamedata/base/
  //    (якщо якоїсь моделі ще нема — збираємо її генератором tools/models/<model>.js)
  const unitsRoot = path.resolve(__dirname, '../mods-test/units');
  for (const u of UNITS) {
    const pkgDir = path.join(unitsRoot, u.model);
    const checkFile = path.join(pkgDir, 'gamedata/base/units/skinned', `${u.model}_normal.4d`);
    if (!fs.existsSync(checkFile)) {
      execFileSync(process.execPath, [path.join(__dirname, 'models', `${u.model}.js`), pkgDir], { stdio: 'inherit' });
    }
    copyDirRecursive(path.join(pkgDir, 'gamedata/base'), path.join(OUT, 'gamedata/base'));
  }

  // Прибираємо застарілу тимчасову модель v_charodey, якщо вона лишилась у OUT з попередніх збірок
  for (const rel of [
    'units/skinned/v_charodey_normal.4d', 'units/skinned/v_charodey_veteran.4d', 'units/skinned/v_charodey_elite.4d',
    'units/skinned/v_charodey_normal.dxt', 'units/skinned/v_charodey_veteran.dxt', 'units/skinned/v_charodey_elite.dxt',
    'menu/units/v_charodey_big.png', 'menu/units/v_charodey_small.png',
    'menu/units/v_charodey_normal.anif', 'menu/units/v_charodey_veteran.anif', 'menu/units/v_charodey_elite.anif',
  ]) {
    const p = path.join(OUT, 'gamedata/base', rel);
    if (fs.existsSync(p)) fs.rmSync(p, { force: true });
  }

  // 3. Додаємо SWINE_RAVEN у messages.ini та секції [Varju ammo/fuel/service] у units_text.ini для кожної мови гри
  const TRAILER_TEXT = {
    RU: [
      ['Varju ammo', 'Боеприпасы Воронов', 'Прицеп с боеприпасами', 'Режим просмотра Корпуса Воронов (цена 100 000 SP): аэродромный прицеп с авиационными ракетами и снарядами.'],
      ['Varju fuel', 'Керосин Воронов', 'Топливный прицеп', 'Режим просмотра Корпуса Воронов (цена 100 000 SP): аэродромная цистерна авиационного керосина для турбин.'],
      ['Varju service', 'Техслужба Воронов', 'Ремонтный прицеп', 'Режим просмотра Корпуса Воронов (цена 100 000 SP): мобильная аэродромная мастерская.'],
    ],
    EN: [
      ['Varju ammo', 'Raven Ammo', 'Ammo trailer', 'Raven Air Corps preview mode (100,000 SP): airfield trailer stocked with aircraft rockets and shells.'],
      ['Varju fuel', 'Raven Fuel', 'Fuel trailer', 'Raven Air Corps preview mode (100,000 SP): airfield aviation fuel tanker for turbines.'],
      ['Varju service', 'Raven Service', 'Service trailer', 'Raven Air Corps preview mode (100,000 SP): mobile airfield repair workshop.'],
    ],
  };
  for (const lang of fs.readdirSync(path.join(GAME, 'gamedata'))) {
    const pak = path.join(GAME, 'gamedata', lang, lang.toLowerCase() + '.pak');
    if (!fs.existsSync(pak)) continue;
    const o = readPakEntry(pak, 'messages.ini'); if (!o) continue;
    const isUtf8 = o[0] === 0xEF && o[1] === 0xBB;
    const name = RACE_NAME[lang] || 'Raven';
    const line = `\r\nSWINE_RAVEN = ${isUtf8 ? name : name.replace(/[^\x00-\x7f]/g, '?')}`;
    const body = o.slice(0, o.length - o.toString('latin1').match(/\s*$/)[0].length);
    fs.mkdirSync(path.join(OUT, 'gamedata', lang), { recursive: true });
    fs.writeFileSync(path.join(OUT, 'gamedata', lang, 'messages.ini'), Buffer.concat([body, Buffer.from(line, isUtf8 ? 'utf8' : 'latin1'), Buffer.from('\r\n')]));

    const utPath = path.join(OUT, 'gamedata', lang, 'units_text.ini');
    if (fs.existsSync(utPath)) {
      const ut = fs.readFileSync(utPath);
      const utUtf8 = ut[0] === 0xEF && ut[1] === 0xBB;
      const tList = lang === 'RU' ? TRAILER_TEXT.RU : TRAILER_TEXT.EN;
      const tAdd = tList.map(([sec, nick, nm, desc]) => `\r\n[${sec}]\r\n Nick = ${nick}\r\n Name = ${nm}\r\n Desc = ${desc}`).join('') + '\r\n';
      const tBuf = utUtf8 ? Buffer.from(tAdd, 'utf8') : Buffer.from(tAdd.replace(/[^\x00-\x7f]/g, '?'), 'latin1');
      fs.writeFileSync(utPath, Buffer.concat([ut, tBuf]));
    }
  }
}

module.exports = { UNITS, row, extra };

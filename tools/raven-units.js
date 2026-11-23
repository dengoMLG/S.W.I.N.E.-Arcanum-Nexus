#!/usr/bin/env node
// Корпус Воронов (Пернатый Авиакорпус — Varjú): генератор полных игровых параметров (units.ini),
// локализаций (RU/EN/UK) и сводной таблицы баланса (raven-balance.json) для всех 15 машин + бомбардировщика.
//
//   node tools/raven-units.js [out-dir]
'use strict';
const fs = require('fs'), path = require('path');
const OUT = path.resolve(process.argv[2] || 'mods-test/raven');
const BS = String.fromCharCode(92);

const UP = { fuel: 1, ammo: 2, sight: 4, mines: 8, armor: 16, repair: 32, turbo: 64, beer: 128, carrot: 256 };
const mask = (...u) => u.reduce((a, k) => a | UP[k], 0);

const LORE = {
  name_ru: 'Корпус Воронов (Пернатый Авиакорпус)',
  name_en: 'Raven Air Corps (Varjú)',
  prefix: 'v_',
  doctrine: 'Господство в воздухе, командные машины-наводчики, бесплатные тактические налёты с откатом, ПВО-зонтик и композитная защита крыши ценой прожорливых турбин и хрупкой кормы.',
  story_ru: 'Десятилетиями Воздушная Лига Воронов правила горными аэродромами Пиков Клюва и держала вооружённый нейтралитет, продавая авиапочту и снимки разведки и Свиньям, и Кроликам. Всё рухнуло за одну ночь: пьяный зенитный расчёт Свиней сбил флагманский золотой бомбардировщик Воронов, а кроличьи диверсанты выкрали чертежи главного радара ДРЛО. Разгневанный Генерал Кондор объявил операцию «Чёрное Перо» — аэродромные бронемашины, экранопланы и сухопутные авианосцы Воронов спустились с гор, чтобы навести порядок с воздуха.',
  air_economy: {
    bomber_section: 'Varju bombazo',
    bomber_speed: 12.0,
    bomber_damage: 24,
    standard_airstrike_sp: 35,
    pig_airstrike_sp: 50,
    rabbit_airstrike_sp: 100,
    free_tactical_strikes: [
      { unit: 'Сова-ДРЛО (A-3)', ability: 'Развед-пролёт «Орлиный Глаз»', cost_sp: 0, cooldown_s: 45, effect: 'Обзор ×3 сквозь лес/холмы на 15 с + подсветка мин и целей.' },
      { unit: 'Филин (V-07)', ability: 'Дымовой/фосфорный сброс «Сумрак»', cost_sp: 0, cooldown_s: 35, effect: 'Бесплатный налёт сбрасывает облако помех (R=3.0, 8 с, замедление врагов ×0.45, урон 2).' },
      { unit: 'Альбатрос (V-09)', ability: 'Катапультный дрон «Штурм»', cost_sp: 0, cooldown_s: 50, effect: 'Запуск одиночного крылатого дрона в видимую точку (22 урона по крыше, R=3.0).' },
    ],
    paid_heavy_strikes: [
      { unit: 'Стриж (V-01)', ability: 'Штурмовой авиаудар', cost_sp: 35, cooldown_s: 20, effect: 'Быстрый бомбардировщик (скорость 12.0), 24 урона по крыше.' },
      { unit: 'Кондор (A-5)', ability: 'Кассетный ковровый налёт «Чёрная Тень»', cost_sp: 60, cooldown_s: 45, effect: 'Звено штурмовиков накрывает полосу R=5.5 кассетами (14 урона по крыше — сносит кроликов, прицепы и мины).' },
      { unit: 'Скворец (V-10)', ability: 'Воздушный сброс снабжения (Air-Drop)', cost_sp: 25, cooldown_s: 60, effect: 'Транспортник сбрасывает контейнер (+40 топлива и +25% БК союзникам в R=3.5).' },
    ],
  },
  matchups: {
    vs_pigs: {
      advantage: 'Вороны бьют по слабой крыше (TopArmor) и медленным колоннам Свинов дешёвыми авиаударами, дальнобойной гаубицей «Гриф» и ракетами «Коршуна»/«Сокола-ПТ», а «Филин» и «Буревестник» срывают рывок Хряк-Гриля и Бомбохряка.',
      weakness: 'Лоб «Свин-Царя» (6) и «Осадного Кабана» (4) держит лёгкие калибры Воронов; «Гряземёт» лишает экраноплан и броневики скорости, а прорыв «Хряк-Гриля» в упор сжигает хрупкие командные машины.',
    },
    vs_rabbits: {
      advantage: '«Сапсан-ЗРК» и «Ястреб-ЗУ» закрывают небо для дорогих быстрых бомбардировщиков Кроликов (100 SP), «Буревестник» с Гатлингом и кассеты «Кондора» выкашивают безбронных багги («Заяц-Призрак», «Морковный Смерч»).',
      weakness: '«Заяц-Призрак» с дистанции 12 отстреливает дорогие машины ПВО/ДРЛО раньше, чем те выйдут на выстрел; «Кротобой» минирует маршруты прожорливых тягачей «Скворец», а «Пит-Стоп» переигрывает Воронов в затяжном размене по БК.',
    },
  },
};

// Все 15 наземных машин Корпуса Воронов (9 базовых + 1 тягач + 5 уникальных Arcanum)
const UNITS = [
  // ── 9 базовых боевых классов + тягач ──
  {
    s: 'Varju dzsip', model: 'v_dzsip', code: 'V-01', tier: 'core', char_id: 'R01-v_dzsip',
    ru: ['Стриж', 'Разведчик-наводчик', 'Сверхбыстрый авиа-джип с радаром: вызывает штурмовой авиаудар всего за 35 SP (быстрый бомбардировщик, скорость 9.6, урон 24). Обзор 15, но тонкая броня и прожорливые турбины.'],
    en: ['Swift', 'Air-spotter jeep', 'Blazing aero-jeep with spotter radar: calls in a fast Raven airstrike for only 35 SP (bomber speed 9.6, 24 dmg). Sight 15, light armor and thirsty turbines.'],
    uk: ['Стриж', 'Розвідник-навідник', 'Надшвидкий авіа-джип із радаром: викликає штурмовий авіаудар лише за 35 SP (швидкість бомбардувальника 9.6, урон 24). Огляд 15, тонка броня і ненажерливі турбіни.'],
    ability: 'Штурмовой авиаудар (35 SP, скорость 9.6, урон 24)',
    role_summary: 'Основной наводчик платных авиаударов и передовой разведчик.',
    counter_to: 'Медленная артиллерия и колонны без ПВО.',
    countered_by: 'Бронеавтомобили (Ястреб/Панцер), снайпер Заяц-Призрак.',
    stats: { Price: 280, UpgradeMask: mask('fuel', 'sight', 'repair', 'turbo'), MaxHP: 65, FrontArmor: 1, BackArmor: 0, TopArmor: 1.5, Sight: 15, UnitSize: 1.0, MoveType: 2, MoveSpeed: 1.85, SpinSpeed: 130, MaxFuel: 100, Consume: 1200, MinRange: 0, MaxRange: 15, SpecialType: 11 },
  },
  {
    s: 'Varju pancelauto freeair', model: 'v_pancelkocsi', code: 'V-02', tier: 'core', char_id: 'R02-v_pancelkocsi',
    ru: ['Ястреб-ЗУ', 'Броневик ПВО', 'Скорострельная спаренная автопушка (4 урона / 1.2 с) + БЕСПЛАТНЫЙ лёгкий авианалёт прикрытия (0 SP, откат 45 с, штурмовик на 11 урона)! Косит разведку и багги, но слаб против тяжёлой брони.'],
    en: ['Hawk AA', 'AA armored car', 'Rapid twin autocannon (4 dmg / 1.2s) + FREE light tactical air support strike (0 SP, 45s CD, 11-dmg striker)! Shreds light scouts, weak against heavy tank armor.'],
    uk: ['Яструб-ЗУ', 'Броньовик ППО', 'Швидкострільна спарена автогармата (4 шкоди / 1.2 с) + БЕЗКОШТОВНИЙ легкий авіаналіт прикриття (0 SP, відкат 45 с, 11 шкоди)!'],
    ability: 'БЕСПЛАТНЫЙ лёгкий авианалёт (0 SP, КД 45 с, урон 11) + скорострельность 1.2 с',
    role_summary: 'Прикрытие колонн от лёгкой техники + бесплатная поддержка с воздуха.',
    counter_to: 'Разведчики, багги кроликов (Призрак, Пит-Стоп), лёгкая техника.',
    countered_by: 'Средние и тяжёлые танки (броня ≥ 3 гасит урон 4).',
    stats: { Price: 320, UpgradeMask: mask('fuel', 'ammo', 'sight', 'armor', 'turbo'), MaxHP: 70, FrontArmor: 1, BackArmor: 0.5, TopArmor: 1.5, Sight: 12, UnitSize: 1.0, MoveType: 2, MoveSpeed: 1.55, SpinSpeed: 100, TurretSpeed: 105, MaxFuel: 100, Consume: 1100, MinRange: 0.7, MaxRange: 8, Actionrange: 12, ShotType: 1, Damage: 4, ReloadTime: 1.2, Ammo: 120, SpecialType: 11, Level2XP: 320, Level3XP: 820 },
  },
  {
    s: 'Varju tank', model: 'v_tank', code: 'V-03', tier: 'core', char_id: 'R03-v_tank',
    ru: ['Беркут', 'Основной танк', 'Стелс-танк с композитной крышей (2.5) и быстрыми турбинами (1.05): переживает навесной огонь лучше аналогов, но уступает свиным танкам в лоб и быстрее жжёт топливо.'],
    en: ['Golden Eagle', 'Main battle tank', 'Stealth MBT with composite roof (2.5) and fast turbines (1.05): shrugs off mortar/artillery splashes better than peers, but loses head-on brawls to Pigs and burns more fuel.'],
    uk: ['Беркут', 'Основний танк', 'Стелс-танк із композитним дахом (2.5) і швидкими турбінами (1.05): краще тримає навісний вогонь, але слабший за свиней у лоб і швидше палить пальне.'],
    ability: 'Окопаться (SpecialType 0, +2.0 к броне)',
    role_summary: 'Универсальный мобильный танк линии фронта с защитой от артиллерии.',
    counter_to: 'Мортиры, артиллерия, лёгкие танки и броневики.',
    countered_by: 'Тяжёлый танк Свинов, Свин-Царь, Хряк-Гриль в упор.',
    stats: { Price: 420, UpgradeMask: mask('fuel', 'ammo', 'sight', 'armor', 'repair', 'turbo'), MaxHP: 80, FrontArmor: 2, BackArmor: 0.5, TopArmor: 2.5, Sight: 9.5, UnitSize: 1.0, MoveType: 1, MoveSpeed: 1.05, SpinSpeed: 70, TurretSpeed: 85, MaxFuel: 100, Consume: 820, MinRange: 1.0, MaxRange: 7.5, Actionrange: 12, ShotType: 1, Damage: 8, ReloadTime: 5.2, Ammo: 75, SpecialType: 0, SpecialTime: 7, ExtraArmor: 2.0, Level2XP: 360, Level3XP: 900 },
  },
  {
    s: 'Varju loveg', model: 'v_loveg', code: 'V-04', tier: 'core', char_id: 'R04-v_loveg',
    ru: ['Гриф', 'Дальнобойная авиа-гаубица', 'Скоростная 4×4 гаубица на 26 клеток: стреляет сразу с хода без развёртывания и может закрепляться на сошниках (+1.5 к броне за 4 с), но возит меньше снарядов (35) и слабее бронирована в корме.'],
    en: ['Vulture', 'Long-range aero-howitzer', 'Fast 4x4 artillery reaching 26 cells: fires on the move and can lock down on outriggers (+1.5 armor in 4s), but carries fewer shells (35) and has paper rear armor.'],
    uk: ['Гриф', 'Далекобійна авіа-гаубиця', 'Швидка 4×4 гаубиця на 26 клітинок: стріляє з ходу та стає на сошники (+1.5 до броні), але везе менше снарядів (35) і має слабку корму.'],
    ability: 'Стрельба с хода + стабилизация на сошниках (SpecialType 0, +1.5 к броне)',
    role_summary: 'Высокомобильная контрбатарейная артиллерия по подсветке Совы-ДРЛО.',
    counter_to: 'Окопанные танки, Осадный Кабан, бункеры и чужая арта.',
    countered_by: 'Фланговые рейды, Бомбохряк, контр-авиаудар.',
    stats: { Price: 520, UpgradeMask: mask('fuel', 'ammo', 'sight', 'turbo'), MaxHP: 70, FrontArmor: 1.5, BackArmor: 0.5, TopArmor: 2, Sight: 8.5, UnitSize: 1.1, MoveType: 2, MoveSpeed: 1.25, SpinSpeed: 80, TurretSpeed: 75, MaxFuel: 100, Consume: 1050, MinRange: 4, MaxRange: 26, Actionrange: 14, ShotType: 2, Damage: 7, ReloadTime: 6.8, Ammo: 35, SpecialType: 0, SpecialTime: 4, ExtraArmor: 1.5, Level2XP: 320, Level3XP: 800 },
  },
  {
    s: 'Varju vadasz freeair', model: 'v_vadasz', code: 'V-05', tier: 'core', char_id: 'R05-v_vadasz',
    ru: ['Сокол-ПТ', 'Истребитель танков (ПТУР)', 'Сверхбыстрый перехватчик с 8 управляемыми ракетами на крыльевых пилонах: бьёт на 10.5 клеток по 10 урона + вызывает БЕСПЛАТНЫЙ точечный авианалёт (0 SP, КД 45 с, 11 урона), но всего 24 ракеты и картонная броня.'],
    en: ['Falcon AT', 'ATGM interceptor', 'Ultra-fast interceptor carrying 8 wing-mounted guided missiles: deals 10 damage at 10.5 range + FREE tactical air strike (0 SP, 45s CD, 11 dmg), but only 24 missiles and fragile armor.'],
    uk: ['Сокіл-ПТ', 'Винищувач танків (ПТКР)', 'Надшвидкий перехоплювач із 8 крильовими ракетами: б\'є на 10.5 клітинок по 10 шкоди + БЕЗКОШТОВНИЙ авіаналіт (0 SP, КД 45 с), але всього 24 ракети.'],
    ability: 'Высокоточные ПТУР (ShotType 3, дальн. 10.5) + БЕСПЛАТНЫЙ авианалёт (0 SP, КД 45 с)',
    role_summary: 'Охотник на тяжёлые танки Свинов и Свин-Царя с дистанции.',
    counter_to: 'Тяжёлый танк Свинов, Свин-Царь, Осадный Кабан.',
    countered_by: 'Заяц-Призрак (бьёт дальше на 12), Хряк-Гриль, Гряземёт.',
    stats: { Price: 620, UpgradeMask: mask('fuel', 'ammo', 'sight', 'turbo'), MaxHP: 65, FrontArmor: 1, BackArmor: 0, TopArmor: 1.5, Sight: 11, UnitSize: 1.0, MoveType: 2, MoveSpeed: 1.45, SpinSpeed: 105, TurretSpeed: 85, MaxFuel: 100, Consume: 950, MinRange: 2, MaxRange: 10.5, Actionrange: 13, ShotType: 3, Damage: 10, ReloadTime: 5.8, Ammo: 24, SpecialType: 11, Level2XP: 350, Level3XP: 900 },
  },
  {
    s: 'Varju raketas', model: 'v_raketas', code: 'V-06', tier: 'core', char_id: 'R06-v_raketas',
    ru: ['Коршун', 'Гусеничная авиа-РСЗО', '12-ствольная пусковая авиационных ракет: в залповом режиме даёт точный веер из 8 ракет по крыше (вместо 5). Дорогая и прожорливая, требует прикрытия.'],
    en: ['Kite MLRS', 'Tracked aero-MLRS', '12-tube aircraft-rocket battery: fires a tight 8-rocket salvo targeting roofs (instead of 5). Expensive and fuel-hungry, needs escort.'],
    uk: ['Коршун', 'Гусенична авіа-РСЗВ', '12-ствольна пускова авіаракети: у залпі дає щільне віяло з 8 ракет у дах. Дорога й ненажерлива, потребує прикриття.'],
    ability: 'Усиленный залп (SpecialType 6, 8 ракет вместо 5)',
    role_summary: 'Мощное площадочное подавление укреплений и скоплений врага.',
    counter_to: 'Скопления средних танков, артиллерия и минные поля.',
    countered_by: 'Снайперы, прорывные камикадзе, перехват прицепов БК.',
    stats: { Price: 680, UpgradeMask: mask('fuel', 'ammo', 'sight', 'armor'), MaxHP: 75, FrontArmor: 1.5, BackArmor: 0.5, TopArmor: 2, Sight: 9.5, UnitSize: 1.1, MoveType: 1, MoveSpeed: 0.88, SpinSpeed: 55, TurretSpeed: 50, MaxFuel: 100, Consume: 780, MinRange: 3, MaxRange: 11, Actionrange: 13, ShotType: 2, Damage: 8, ReloadTime: 6.5, ReshotTime: 0.25, ShotSpread: 2.4, Ammo: 48, SpecialType: 6, Level2XP: 400, Level3XP: 1000 },
  },
  {
    s: 'Varju mozsar slow', model: 'v_mozsar', code: 'V-07', tier: 'core', char_id: 'R07-v_mozsar',
    ru: ['Филин', 'Авиабомбомёт-мортира', 'Крепкий совиный бункер (115 HP, крыша 3): метает авиабомбы по 15 урона — каждое попадание замедляет врага (×0.4 на 5 с) и оставляет зону помех на 20 с! Умеет окапываться (+2.0 к броне).'],
    en: ['Eagle Owl', 'Aerial bomb-mortar', 'Tough owl bunker (115 HP, top 3): lobs 15-dmg aerial bombs — every hit slows enemies (×0.4 for 5s) and leaves a 20s jammer zone! Can fortify (+2.0 armor).'],
    uk: ['Пугач', 'Авіабомбомет-мортира', 'Міцний бункер (115 HP, дах 3): кидає авіабомби на 15 шкоди — кожне влучання сповільнює ворога (×0.4) і лишає зону перешкод на 20 с!'],
    ability: 'Шламово-дымовые авиабомбы (slow: ×0.4 на 5 с + зона помех 20 с) + Окопаться (+2.0 к броне)',
    role_summary: 'Бронированная осадная поддержка + контроль темпа.',
    counter_to: 'Хряк-Гриль, Бомбохряк, окопанные танки и укрытия.',
    countered_by: 'Дальнобойная артиллерия и снайперы вне дальности 6.5.',
    stats: { Price: 650, UpgradeMask: mask('fuel', 'ammo', 'sight', 'armor', 'repair'), MaxHP: 115, FrontArmor: 3, BackArmor: 1.5, TopArmor: 3, Sight: 8, UnitSize: 1.15, MoveType: 1, MoveSpeed: 0.68, SpinSpeed: 45, TurretSpeed: 45, MaxFuel: 100, Consume: 650, MinRange: 2, MaxRange: 6.5, Actionrange: 10, ShotType: 2, Damage: 15, ReloadTime: 6.5, Ammo: 40, SpecialType: 0, SpecialTime: 5, ExtraArmor: 2.0, Level2XP: 450, Level3XP: 1100 },
  },
  {
    s: 'Varju aknarako', model: 'v_aknarako', code: 'V-08', tier: 'core', char_id: 'R08-v_aknarako',
    ru: ['Дятел', 'Инженерный авиа-минёр', 'Оснащён широким крылом-миноискателем (обзор 15, видит мины) и револьверной каруселью авиамин. Кнопка «Мины на ходу» (SpecialType 13): раскладывает мины каждые 2.5 клетки в движении (30 мин).'],
    en: ['Woodpecker', 'Aero-minelayer', 'Equipped with a wide wing-detector (sight 15, spots mines) and rotary aerial-mine carousel. Mines on the Move button (SpecialType 13): lays mines every 2.5 cells while moving.'],
    uk: ['Дятел', 'Інженерний авіа-мінер', 'Широке крило-міношукач (огляд 15, бачить міни) і карусель авіамін. Кнопка «Міни на ходу» (SpecialType 13).'],
    ability: 'Кнопка «Мины на ходу» (SpecialType 13, 30 мин, Detector 1)',
    role_summary: 'Разминирование против Кротобоя и минирование подступов к ПВО/арте.',
    counter_to: 'Кротобой, вражеские минные поля, фланговые рейды.',
    countered_by: 'Любой боевой танк (без прямого оружия).',
    stats: { Price: 400, UpgradeMask: mask('fuel', 'ammo', 'sight', 'mines', 'armor', 'repair', 'turbo'), MaxHP: 75, FrontArmor: 2, BackArmor: 1, TopArmor: 2, Sight: 15, UnitSize: 1.0, MoveType: 1, MoveSpeed: 1.15, SpinSpeed: 70, MaxFuel: 100, Consume: 750, MinRange: 0, MaxRange: 14, Ammo: 30, ReloadTime: 1, Detector: 1, SpecialType: 13 },
  },
  {
    s: 'Varju movingforce', model: 'v_movingforce', code: 'V-09', tier: 'core', char_id: 'R12-v_movingforce',
    ru: ['Альбатрос', 'Сухопутный авианосец', 'Колоссальный флагман (195 HP, крыша 4.5): каждые 35 секунд БЕСПЛАТНО запускает с катапульты крылатый дрон-камикадзе на 24 клетки (65 урона по крыше в R=3.5)!'],
    en: ['Albatross', 'Land aircraft carrier', 'Colossal flagship (195 HP, roof 4.5): launches a FREE catapult cruise-drone every 35s up to 24 cells (65 roof splash damage, R=3.5)!'],
    uk: ['Альбатрос', 'Сухопутний авіаносець', 'Колосальний флагман (195 HP, дах 4.5): кожні 35 с БЕЗКОШТОВНО запускає з катапульти крилатий дрон на 24 клітинки (65 шкоди в R=3.5).'],
    ability: 'БЕСПЛАТНЫЙ пуск крылатого дрона (0 SP, зарядка 35 с, урон 65, R=3.5, SpecialType 5)',
    role_summary: 'Командный авианесущий супер-юнит для затяжного контроля карты.',
    counter_to: 'Чужая артиллерия, прицепы снабжения, укрытые позиции.',
    countered_by: 'Свин-Царь в лоб, массовый фокус ПТУР/снайперов, Бомбохряк.',
    stats: { Price: 1450, UpgradeMask: mask('fuel', 'sight', 'repair'), MaxHP: 195, FrontArmor: 4, BackArmor: 2.5, TopArmor: 4.5, Sight: 11, UnitSize: 1.45, MoveType: 1, MoveSpeed: 0.62, SpinSpeed: 38, MaxFuel: 100, Consume: 1000000000, MinRange: 5, MaxRange: 24, Damage: 65, SpecialType: 5, SpecialTime: 35, Cargo: 100 },
  },
  {
    s: 'Varju vontato', model: 'v_vontato', code: 'V-10', tier: 'core', char_id: 'R01-v_vontato',
    ru: ['Скворец', 'Аэродромный тягач', 'Быстрый бронированный аэродромный буксир для ванильных прицепов (Топливо/БК/Ремонт). Быстрее и крепче ванильных тягачей (60 HP, броня 1.5/0.5/1) — основа логистики Воронов.'],
    en: ['Starling', 'Airfield tow tractor', 'Fast armored pushback tug for standard trailers (Fuel/Ammo/Service). Faster and tougher than vanilla tow trucks (60 HP, armor 1.5/0.5/1).'],
    uk: ['Шпак', 'Аеродромний тягач', 'Швидкий броньований аеродромний буксир для причепів (60 HP, броня 1.5/0.5/1).'],
    ability: 'Буксировка прицепов (SpecialType 4, повышенная броня и скорость 1.5)',
    role_summary: 'Критически важная логистика для прожорливых турбин и малого БК Воронов.',
    counter_to: 'Топливный голод и нехватка ракет в рейде.',
    countered_by: 'Перехватчики, снайперы, Кротобой с минами.',
    stats: { Price: 220, UpgradeMask: mask('fuel', 'sight', 'armor', 'turbo'), MaxHP: 60, FrontArmor: 1.5, BackArmor: 0.5, TopArmor: 1, Sight: 7, UnitSize: 1.0, MoveType: 2, MoveSpeed: 1.5, SpinSpeed: 100, MaxFuel: 100, Consume: 1550, MinRange: 0, MaxRange: 6, SpecialType: 4 },
  },

  // ── 5 уникальных машин Arcanum Корпуса Воронов ──
  {
    s: 'Varju sokolzrk freeair', model: 'v_sokolzrk', code: 'A-1', tier: 'arcanum', char_id: 'R02-v_sokolzrk',
    ru: ['Сапсан-ЗРК', 'Комплекс ПВО/ПРО', 'Гусеничный комплекс ПВО дальнего действия: автоматически ПЕРЕХВАТЫВАЕТ вражеские бомбардировщики в R=14 (за 1 ракету!), бьёт тяжёлыми ЗУР по наземным целям на 11 клеток (11 урона, 16 ракет) и вызывает БЕСПЛАТНЫЙ авианалёт прикрытия (0 SP, КД 45 с)!'],
    en: ['Peregrine SAM', 'Air-defense SAM', 'Tracked long-range SAM: automatically INTERCEPTS enemy bombers in R=14 (for 1 missile!), fires heavy guided missiles at ground armor up to 11 cells (11 dmg, 16 rounds), and calls a FREE tactical air strike (0 SP, 45s CD)!'],
    uk: ['Сапсан-ЗРК', 'Комплекс ППО/ПРО', 'Гусеничний комплекс ППО: автоматично ПЕРЕХОПЛЮЄ ворожі бомбардувальники в R=14, б\'є ракетами по техніці на 11 клітинок (11 шкоди, 16 ракет) і викликає БЕЗКОШТОВНИЙ авіаналіт (0 SP, КД 45 с)!'],
    ability: 'Авто-перехват бомбардировщиков врага (R=14) + ЗУР на 11 клеток + БЕСПЛАТНЫЙ авианалёт (0 SP, КД 45 с)',
    role_summary: 'Щит неба против быстрых бомбардировщиков Кроликов и дешёвой авиации Свинов.',
    counter_to: 'Бомбардировщики (особенно Кролики 14.4), дальние цели, вертолёты.',
    countered_by: 'Заяц-Призрак (бьёт с 12), Осадный Кабан, Хряк-Гриль в упор.',
    stats: { Price: 780, UpgradeMask: mask('fuel', 'ammo', 'sight', 'armor', 'repair'), MaxHP: 95, FrontArmor: 2, BackArmor: 1, TopArmor: 2.5, Sight: 13, UnitSize: 1.1, MoveType: 1, MoveSpeed: 0.85, SpinSpeed: 50, TurretSpeed: 95, MaxFuel: 100, Consume: 780, MinRange: 2.5, MaxRange: 11, Actionrange: 14, ShotType: 3, Damage: 11, ReloadTime: 5.5, Ammo: 16, SpecialType: 11, Level2XP: 500, Level3XP: 1300 },
  },
  {
    s: 'Varju ekranoplan', model: 'v_ekranoplan', code: 'A-2', tier: 'arcanum', char_id: 'R03-v_ekranoplan',
    ru: ['Буревестник', 'Ударный экраноплан', 'Сверхбыстрый приземный штурмовик (скорость 2.05, умеет скользить по воде — CanSwim=1!): носовой Гатлинг косит лёгкую броню каждые 0.8 с (6 урона). Огромный расход топлива и нулевая корма.'],
    en: ['Petrel', 'Assault ekranoplan', 'Blazing ground-effect attacker (speed 2.05, skims water — CanSwim=1!): nose Gatling shreds light armor every 0.8s (6 dmg). Heavy fuel burn and zero rear armor.'],
    uk: ['Буревісник', 'Ударний екраноплан', 'Надшвидкий штурмовик (швидкість 2.05, ковзає над водою — CanSwim=1!): носовий Гатлінг косить легку броню кожні 0.8 с (6 шкоди). Велика витрата пального.'],
    ability: 'Амфибийное скольжение над водой (CanSwim=1) + шквальный Гатлинг (0.8 с)',
    role_summary: 'Фланговый охотник за багги, прицепами, артиллерией и тылом через реки.',
    counter_to: 'Заяц-Призрак, Морковный Смерч, Пит-Стоп, Ушастик, тыловая арта.',
    countered_by: 'Тяжёлые танки (броня ≥ 4 режет Гатлинг), Гряземёт, мины.',
    stats: { Price: 720, UpgradeMask: mask('fuel', 'ammo', 'sight', 'turbo'), MaxHP: 70, FrontArmor: 1.5, BackArmor: 0, TopArmor: 1.5, Sight: 11, UnitSize: 1.1, MoveType: 2, CanSwim: 1, MoveSpeed: 2.05, SpinSpeed: 135, TurretSpeed: 110, MaxFuel: 100, Consume: 520, MinRange: 0.5, MaxRange: 6.5, Actionrange: 11, ShotType: 1, Damage: 6, ReloadTime: 0.8, Ammo: 90, Level2XP: 500, Level3XP: 1200 },
  },
  {
    s: 'Varju sova', model: 'v_sova', code: 'A-3', tier: 'arcanum', char_id: 'R05-v_sova',
    ru: ['Сова-ДРЛО', 'Командный пункт ДРЛО', 'Фургон с гигантской тарелкой AWACS (обзор 20, видит мины). БЕСПЛАТНЫЙ развед-пролёт «Орлиный Глаз» (0 SP, КД 45 с): на 15 с обзор ×3 сквозь холмы и лес. Оружия нет, спустя 10 минут боя засекается врагом.'],
    en: ['Owl AWACS', 'Command AWACS van', 'Van with giant rotating AWACS rotodome (sight 20, spots mines). FREE recon sweep "Eagle Eye" (0 SP, 45s CD): 15s triple sight through hills & woods. No gun.'],
    uk: ['Сова-ДРЛВ', 'Командний пункт ДРЛВ', 'Фургон із величезною тарілкою AWACS (огляд 20, бачить міни). БЕЗКОШТОВНИЙ розвід-проліт «Орлине Око» (0 SP, КД 45 с): 15 с огляду ×3 крізь гори й ліс. Без зброї.'],
    ability: 'БЕСПЛАТНЫЙ развед-пролёт «Орлиный Глаз» (0 SP, SpecialType 14, обзор ×3 сквозь рельеф на 15 с, КД 45 с)',
    role_summary: 'Командные глаза всей авиации и дальнобойных батарей Корпуса Воронов.',
    counter_to: 'Засады в лесах, скрытые минные поля, дальнобойные снайперы.',
    countered_by: 'Заяц-Призрак, вражеская арта (светится через 10 мин боя).',
    stats: { Price: 540, UpgradeMask: mask('fuel', 'sight', 'repair', 'turbo'), MaxHP: 55, FrontArmor: 1, BackArmor: 0, TopArmor: 1.5, Sight: 20, UnitSize: 1.0, MoveType: 2, MoveSpeed: 1.25, SpinSpeed: 100, MaxFuel: 100, Consume: 950, MinRange: 0, MaxRange: 0, Detector: 1, SpecialType: 14 },
  },
  {
    s: 'Varju korshun kamikaze', model: 'v_korshunkam', code: 'A-4', tier: 'arcanum', char_id: 'R06-v_korshunkam',
    ru: ['Пикировщик', 'Крылатая бомба-брандер', 'Беспилотная реактивная бомба на колёсах (скорость 2.15!). Кнопка «Подрыв» (Sp=12) или гибель вызывает термитный взрыв 55 урона в радиусе 4.5. Картонная (40 HP), но быстрее Бомбохряка и сжигает цели за секунды.'],
    en: ['Dive Bomber', 'Winged cruise-bomb', 'Unmanned jet-boosted cruise bomb on racing wheels (speed 2.15!). Detonate button (Sp=12) or destruction triggers a 55-dmg thermite blast (R=4.5). Fragile (40 HP), way faster than Boom Hog.'],
    uk: ['Пікірувальник', 'Крилата бомба-брандер', 'Безпілотна реактивна бомба на колесах (швидкість 2.15!). Кнопка «Підрив» (Sp=12) або загибель — термітний вибух 55 шкоди в радіусі 4.5. Крихка (40 HP), але блискавична.'],
    ability: 'Термитный подрыв (SpecialType 12 + kamikaze: 55 урона, R=4.5, скорость 2.15)',
    role_summary: 'Сверхбыстрая управляемая «земля-земля» бомба против Свин-Царя и арты.',
    counter_to: 'Свин-Царь, Осадный Кабан, скопления техники, бункеры.',
    countered_by: 'Любой скорострельный огонь на подлёте (всего 40 HP, броня 0.5).',
    stats: { Price: 420, UpgradeMask: mask('fuel', 'sight', 'turbo'), MaxHP: 40, FrontArmor: 0.5, BackArmor: 0, TopArmor: 0.5, Sight: 10, UnitSize: 0.95, MoveType: 2, MoveSpeed: 2.15, SpinSpeed: 135, MaxFuel: 100, Consume: 650, MinRange: 0, MaxRange: 0, Damage: 55, ExtraArmor: 55, ShotSpread: 4.5, ExplodeType: 2, SpecialType: 12 },
  },
  {
    s: 'Varju kondor', model: 'v_kondor', code: 'A-5', tier: 'arcanum', char_id: 'R07-v_kondor',
    ru: ['Кондор', 'Командный штурмовой флагман', 'Тяжёлая гусеничная арт-платформа (170 HP, броня 4/1.5/4): спаренные пушки (16 урона / 6 с на 9.5 клеток) + командный вызов тяжёлого бомбардировщика прямо с передовой за 35 SP (SpecialType 11)!'],
    en: ['Condor', 'Command assault flagship', 'Heavy tracked gunship platform (170 HP, armor 4/1.5/4): twin heavy cannons (16 dmg / 6s at 9.5 range) + frontline command call for heavy 35 SP airstrikes (SpecialType 11)!'],
    uk: ['Кондор', 'Командний штурмовий флагман', 'Важка гусенична арт-платформа (170 HP, броня 4/1.5/4): спарені гармати (16 шкоди / 6 с) + командний виклик важкого бомбардувальника з передової за 35 SP!'],
    ability: 'Спаренное орудие (16 урона / 6 с) + Командный вызов тяжёлого авиаудара с передовой (35 SP, урон 24)',
    role_summary: 'Тяжёлый командный якорь фронта + главный авиаудар по большим армиям.',
    counter_to: 'Рои лёгких кроликов, скопления Свинов, минные поля, прицепы.',
    countered_by: 'Свин-Царь 1-на-1, дальнобойная арта, диверсия в корму (броня 1.5).',
    stats: { Price: 1250, UpgradeMask: mask('fuel', 'ammo', 'sight', 'repair'), MaxHP: 170, FrontArmor: 4, BackArmor: 1.5, TopArmor: 4, Sight: 10.5, UnitSize: 1.35, MoveType: 1, MoveSpeed: 0.62, SpinSpeed: 30, TurretSpeed: 35, MaxFuel: 100, Consume: 480, MinRange: 1.5, MaxRange: 9.5, Actionrange: 13, ShotType: 1, Damage: 16, ReloadTime: 6.0, Ammo: 40, SpecialType: 11, Level2XP: 1100, Level3XP: 2600 },
  },
];

// Генерация готовых файлов для интеграции (units.ini.raven, units_text.ini RU/EN/UK, raven-balance.json)
fs.mkdirSync(path.join(OUT, 'gamedata/base'), { recursive: true });
const iniLines = [
  ';*************************************************************************',
  '; VARJU EGYSEGEK — Корпус Воронов (Пернатый Авиакорпус)',
  '; Auto-generated by tools/raven-units.js',
  ';*************************************************************************',
  '',
  '[Varju bombazo]',
  'Model = units\\skinned\\ny_bombazo',
  'MaxHP = 35',
  'Sight = 16',
  'MoveType = 4',
  'MoveSpeed = 12.0',
  'SpinSpeed = 55',
  'Damage = 24',
  '',
];

for (const u of UNITS) {
  iniLines.push(';---------------------------------------');
  iniLines.push(`; ${u.code}: ${u.ru[0]} (${u.en[0]}) — ${u.ability}`);
  iniLines.push(`[${u.s}]`);
  iniLines.push(`Model = units${BS}skinned${BS}${u.model}`);
  iniLines.push(`Icon = ${u.model}`);
  iniLines.push(`Character = ${u.char_id}`);
  iniLines.push(`Voice = ${u.char_id}`);
  for (const [k, v] of Object.entries(u.stats)) iniLines.push(`${k} = ${v}`);
  iniLines.push('');
}

fs.writeFileSync(path.join(OUT, 'gamedata/base/units.raven.ini'), iniLines.join('\r\n'), 'latin1');

for (const lang of ['RU', 'EN', 'UK']) {
  const key = lang.toLowerCase();
  const txt = UNITS.map(u => {
    const [nick, name, desc] = u[key];
    return `[${u.s}]\r\n Nick = ${nick}\r\n Name = ${name}\r\n Desc = ${desc}\r\n`;
  }).join('\r\n');
  fs.mkdirSync(path.join(OUT, 'gamedata', lang), { recursive: true });
  fs.writeFileSync(path.join(OUT, 'gamedata', lang, 'units_text.raven.ini'), '\uFEFF' + txt, 'utf8');
}

const balance = { lore: LORE, units: UNITS };
fs.writeFileSync(path.join(OUT, 'raven-balance.json'), JSON.stringify(balance, null, 2), 'utf8');

console.log(`Raven faction specs generated → ${OUT} (${UNITS.length} ground units + Varju bombazo)`);
for (const u of UNITS) {
  const s = u.stats;
  console.log(`  ${u.code} ${u.ru[0].padEnd(14)} P=${String(s.Price).padEnd(4)} HP=${String(s.MaxHP).padEnd(3)} Arm=${s.FrontArmor}/${s.BackArmor}/${s.TopArmor} Dmg=${String(s.Damage ?? '-').padEnd(3)} RL=${String(s.ReloadTime ?? '-').padEnd(4)} Rng=${s.MinRange}-${s.MaxRange} Spd=${s.MoveSpeed} Cns=${s.Consume}`);
}

// #3 — третя раса «Ворони» (раса 2 у грі), заглушка. Підключається з tools/arc-units.js.
//
// Що тут:
//   UNITS — 15 секцій units.ini «Varju …» (varjú — ворона угорською, як Diszno/Nyul) на тимчасовій моделі
//           «Чародій» (v_charodey, tools/make-test-tank.js) з довільними характеристиками на основі ванільних донорів.
//           Імена секцій збігаються з моделями tools/models/v_*.js (Корпус Воронів) — коли ті будуть готові,
//           досить замінити model тут.
//   row   — повний рядок таблиці класів для patchgen (classes.json "raven"): 13 ванільних місць + 5 нових.
//           Тягач, причепи (Ammo/Fuel/Service) і «Moving Force» поки свинячі: їх гра шукає за іменем.
//   extra(OUT, GAME, readPakEntry) — модель «Чародій» v_charodey і messages.ini з «SWINE_RAVEN» (пункт раси в лобі).
//
// Обмеження заглушки (exe, docs/EXE_PATCH_14_UNITS.md §«Третя раса»): усе, що гра вибирає «свині / кролики»
// за раса ≠ 0, у Воронів свиняче — меню, шрифти, музика, бомбардувальник, гелікоптер постачання.
'use strict';
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');

const MODEL = 'v_charodey';
const NO_SPECIAL = { SpecialType: null, SpecialTime: null, ExtraArmor: null, SpecialSound1: null, SpecialSound2: null };
// Чародій — гусеничний (Chain R/L 001): колісним донорам ставимо гусениці.
const TRACKS = { MoveType: 1, ChainSpeed: 1.6 };

// Характеристики — заглушка «від балди» (задача #3: потім буде справжній баланс).
const UNITS = [
  { s: 'Varju dzsip', chassis: 'Diszno dzsip', role: 'Diszno dzsip',
    set: { ...TRACKS, Price: 260, MaxHP: 70, FrontArmor: 1, BackArmor: 0.5, TopArmor: 1, Sight: 15, MoveSpeed: 1.7, SpinSpeed: 120 },
    ru: ['Стриж', 'Разведчик Воронов', 'Заглушка: быстрый разведчик-командир Корпуса Воронов на модели «Чародей». Своя модель будет позже.'],
    uk: ['Стриж', 'Розвідник Воронів', 'Заглушка: швидкий розвідник-командир Корпусу Воронів на моделі «Чародій». Своя модель буде пізніше.'],
    en: ['Swift', 'Raven scout', 'Placeholder: fast Raven Corps scout on the Sorcerer model. Its own model comes later.'] },
  { s: 'Varju pancelauto', chassis: 'Diszno pancelauto', role: 'Diszno pancelauto',
    set: { ...TRACKS, Price: 320, MaxHP: 75, FrontArmor: 1.5, BackArmor: 0.5, TopArmor: 1, Damage: 5, ReloadTime: 1.4, MoveSpeed: 1.4 },
    ru: ['Ястреб-ЗУ', 'Броневик Воронов', 'Заглушка: броневик со спаренной автопушкой на модели «Чародей».'],
    uk: ['Яструб-ЗУ', 'Броньовик Воронів', 'Заглушка: броньовик зі спареною автогарматою на моделі «Чародій».'],
    en: ['Hawk AA', 'Raven armoured car', 'Placeholder: armoured car with a twin autocannon on the Sorcerer model.'] },
  { s: 'Varju tank', chassis: 'Diszno normal tank', role: 'Diszno normal tank',
    set: { Price: 420, MaxHP: 90, FrontArmor: 2, BackArmor: 1, TopArmor: 2, Damage: 7, ReloadTime: 4.6, MaxRange: 7.5, MoveSpeed: 1.0 },
    ru: ['Беркут', 'Основной танк Воронов', 'Заглушка: основной танк Корпуса Воронов на модели «Чародей».'],
    uk: ['Беркут', 'Основний танк Воронів', 'Заглушка: основний танк Корпусу Воронів на моделі «Чародій».'],
    en: ['Golden Eagle', 'Raven main tank', 'Placeholder: Raven Corps main battle tank on the Sorcerer model.'] },
  { s: 'Varju loveg', chassis: 'Diszno loveg', role: 'Diszno loveg',
    set: { ...TRACKS, ...NO_SPECIAL, Price: 520, MaxHP: 70, Damage: 8, ReloadTime: 7.5, MaxRange: 22, MinRange: 4, MoveSpeed: 1.0 },
    ru: ['Гриф', 'Гаубица Воронов', 'Заглушка: дальнобойная гаубица на модели «Чародей». Стреляет без развёртывания.'],
    uk: ['Гриф', 'Гаубиця Воронів', 'Заглушка: далекобійна гаубиця на моделі «Чародій». Стріляє без розгортання.'],
    en: ['Vulture', 'Raven howitzer', 'Placeholder: long-range howitzer on the Sorcerer model. Fires without deploying.'] },
  { s: 'Varju vadasz', chassis: 'Nyul raketas pancelkocsi', role: 'Nyul raketas pancelkocsi',
    set: { ...TRACKS, Price: 580, MaxHP: 70, FrontArmor: 1, BackArmor: 0.5, TopArmor: 1, Damage: 9, ReloadTime: 5.5, MaxRange: 10, MoveSpeed: 1.5 },
    ru: ['Сокол-ПТ', 'Истребитель танков Воронов', 'Заглушка: быстрый истребитель танков с ракетами на модели «Чародей».'],
    uk: ['Сокіл-ПТ', 'Винищувач танків Воронів', 'Заглушка: швидкий винищувач танків з ракетами на моделі «Чародій».'],
    en: ['Falcon AT', 'Raven tank destroyer', 'Placeholder: fast missile tank destroyer on the Sorcerer model.'] },
  { s: 'Varju raketas', chassis: 'Diszno raketas', role: 'Diszno raketas',
    set: { Price: 640, MaxHP: 70, Damage: 8, ReloadTime: 6, MaxRange: 11, MoveSpeed: 0.85 },
    ru: ['Коршун', 'РСЗО Воронов', 'Заглушка: реактивная система залпового огня на модели «Чародей».'],
    uk: ['Шуліка', 'РСЗВ Воронів', 'Заглушка: реактивна система залпового вогню на моделі «Чародій».'],
    en: ['Kite', 'Raven rocket launcher', 'Placeholder: multiple rocket launcher on the Sorcerer model.'] },
  { s: 'Varju mozsar', chassis: 'Diszno mozsar', role: 'Diszno mozsar',
    set: { Price: 620, MaxHP: 110, FrontArmor: 2.5, BackArmor: 1.5, TopArmor: 2, Damage: 13, ReloadTime: 6.5, MoveSpeed: 0.65 },
    ru: ['Филин', 'Мортира Воронов', 'Заглушка: тяжёлая мортира на модели «Чародей».'],
    uk: ['Пугач', 'Мортира Воронів', 'Заглушка: важка мортира на моделі «Чародій».'],
    en: ['Eagle Owl', 'Raven mortar', 'Placeholder: heavy mortar on the Sorcerer model.'] },
  // Ванільний мінер (SpecialType 10) шукає в моделі вузли «Aknarako cso», «Lenyomo kar» — у Чародія їх нема.
  // Тому кнопка «Міни на ходу» (13), як у Кротобоя (Caves.cs).
  { s: 'Varju aknarako', chassis: 'Diszno aknarako', role: 'Diszno aknarako',
    set: { Price: 420, MaxHP: 75, Ammo: 30, ReloadTime: 1, MoveSpeed: 1.15, Detector: 1,
           SpecialType: 13, SpecialTime: null, Cargo: null, SpecialSound1: null, SpecialSound2: null },
    ru: ['Дятел', 'Минёр Воронов', 'Заглушка: минёр на модели «Чародей». Кнопка «Мины на ходу», видит мины.'],
    uk: ['Дятел', 'Мінер Воронів', 'Заглушка: мінер на моделі «Чародій». Кнопка «Міни на ходу», бачить міни.'],
    en: ['Woodpecker', 'Raven minelayer', 'Placeholder: minelayer on the Sorcerer model. Mines on the Move button, spots mines.'] },
  // 5 нових (місця 13–17) — у Корпусу Воронів моделі A-1…A-5 (tools/models/v_*.js)
  { s: 'Varju sokolzrk', chassis: 'Diszno raketas', role: 'Diszno raketas',
    set: { Price: 700, MaxHP: 80, Damage: 10, ReloadTime: 7, MaxRange: 12, MoveSpeed: 0.9 },
    ru: ['Сапсан-ЗРК', 'Ракетный комплекс Воронов', 'Заглушка: тяжёлый ракетный комплекс на модели «Чародей».'],
    uk: ['Сапсан-ЗРК', 'Ракетний комплекс Воронів', 'Заглушка: важкий ракетний комплекс на моделі «Чародій».'],
    en: ['Peregrine SAM', 'Raven missile system', 'Placeholder: heavy missile system on the Sorcerer model.'] },
  { s: 'Varju ekranoplan', chassis: 'Nyul raketas pancelkocsi', role: 'Nyul raketas pancelkocsi',
    set: { ...TRACKS, Price: 750, MaxHP: 65, FrontArmor: 1, BackArmor: 0.5, TopArmor: 0.5, Damage: 8, ReloadTime: 4, MaxRange: 9, MoveSpeed: 2.2, SpinSpeed: 120 },
    ru: ['Буревестник', 'Экраноплан-штурмовик', 'Заглушка: очень быстрый штурмовик на модели «Чародей».'],
    uk: ['Буревісник', 'Екраноплан-штурмовик', 'Заглушка: дуже швидкий штурмовик на моделі «Чародій».'],
    en: ['Petrel', 'Ground-effect striker', 'Placeholder: very fast striker on the Sorcerer model.'] },
  { s: 'Varju sova', chassis: 'Diszno dzsip', role: 'Diszno dzsip',
    set: { ...TRACKS, Price: 650, MaxHP: 60, FrontArmor: 0.5, BackArmor: 0, TopArmor: 0.5, Sight: 22, Detector: 1, MoveSpeed: 1.2 },
    ru: ['Сова-ДРЛО', 'Радар Воронов', 'Заглушка: машина радара на модели «Чародей»: обзор 22, видит мины. Без оружия.'],
    uk: ['Сова-ДРЛВ', 'Радар Воронів', 'Заглушка: машина радара на моделі «Чародій»: огляд 22, бачить міни. Без зброї.'],
    en: ['Owl AWACS', 'Raven radar', 'Placeholder: radar vehicle on the Sorcerer model: sight 22, spots mines. No gun.'] },
  { s: 'Varju korshunkam', chassis: 'Diszno normal tank', role: 'Diszno normal tank',
    set: { Price: 480, MaxHP: 55, FrontArmor: 1, BackArmor: 0, TopArmor: 1, Damage: 14, ReloadTime: 8, MaxRange: 4, MoveSpeed: 1.6, SpinSpeed: 110 },
    ru: ['Пикировщик', 'Штурмовой дрон Воронов', 'Заглушка: быстрый хрупкий штурмовик ближнего боя на модели «Чародей».'],
    uk: ['Пікірувальник', 'Штурмовий дрон Воронів', 'Заглушка: швидкий крихкий штурмовик ближнього бою на моделі «Чародій».'],
    en: ['Dive Bomber', 'Raven assault drone', 'Placeholder: fast, fragile close-range striker on the Sorcerer model.'] },
  { s: 'Varju kondor', chassis: 'Diszno hard tank', role: 'Diszno hard tank',
    set: { Price: 1100, MaxHP: 160, FrontArmor: 4, BackArmor: 2, TopArmor: 3, Damage: 12, ReloadTime: 6, MaxRange: 8.5, MoveSpeed: 0.6 },
    ru: ['Кондор', 'Тяжёлый танк Воронов', 'Заглушка: тяжёлая штурмовая платформа на модели «Чародей».'],
    uk: ['Кондор', 'Важкий танк Воронів', 'Заглушка: важка штурмова платформа на моделі «Чародій».'],
    en: ['Condor', 'Raven heavy tank', 'Placeholder: heavy assault platform on the Sorcerer model.'] },
].map(u => ({ ...u, race: 'raven', model: MODEL }));

const S = name => UNITS.find(u => u.s === name).s;
// Порядок як у ванільних рядках (0 джип, 1 броньовик, 2 танк, 3 гаубиця, 4 важкий/ПТ, 5 РСЗВ, 6 мортира, 7 мінер,
// 8 тягач, 9–11 причепи, 12 Moving Force), далі нові класи.
const row = [S('Varju dzsip'), S('Varju pancelauto'), S('Varju tank'), S('Varju loveg'), S('Varju vadasz'), S('Varju raketas'),
  S('Varju mozsar'), S('Varju aknarako'), 'Diszno vontato', 'Ammo', 'Fuel', 'Service', 'Diszno movingforce',
  S('Varju sokolzrk'), S('Varju ekranoplan'), S('Varju sova'), S('Varju korshunkam'), S('Varju kondor')];

// Пункт раси в лобі (messages.ini: SWINE_RABBIT = Кролик, SWINE_PIG = Свин)
const RACE_NAME = { RU: 'Ворон', EN: 'Raven', DE: 'Rabe', FR: 'Corbeau', IT: 'Corvo', SP: 'Cuervo', CZ: 'Havran', HU: 'Varju', ZH: '乌鸦' };

function extra(OUT, GAME, readPakEntry) {
  // модель «Чародій» під іменем v_charodey (4d, dxt, іконки, ролик магазину). Без «d_» в імені — фарба команди
  // за «Rabbit default multipliers» (SUnit::SetModelColorizeProperties), тому --race rabbit.
  execFileSync(process.execPath, [path.join(__dirname, 'make-test-tank.js'), OUT, '--race', 'rabbit', '--name', MODEL], { stdio: 'pipe' });
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
  }
}

module.exports = { UNITS, row, extra, MODEL };

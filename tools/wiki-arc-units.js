#!/usr/bin/env node
// Сторінки вікі для Arcanum Units з balance.json (його пише tools/arc-units.js) — таблиці не пишемо руками.
//
//   node tools/wiki-arc-units.js <balance.json>
//
// Оновлює modpack/wiki/wiki.src.json: група "arc-units" (огляд, свині, кролики, баланс) і запис у «Що нового».
// Повторний запуск замінює ці сторінки, а не дублює їх.
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'modpack/wiki/wiki.src.json');
const bal = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const w = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const DATE = { ru: '23.11.2026', uk: '23.11.2026', en: '2026-11-23' };
const T = (ru, uk, en) => ({ ru, uk, en });
const L3 = arr => ({ ru: arr.ru, uk: arr.uk, en: arr.en });

const UP = [['fuel', 1, T('бак', 'бак', 'fuel')], ['ammo', 2, T('боезапас', 'боєзапас', 'ammo')], ['sight', 4, T('прицел', 'приціл', 'sight')],
  ['mines', 8, T('миноискатель', 'міношукач', 'mine detector')], ['armor', 16, T('броня', 'броня', 'armour')], ['repair', 32, T('ремкомплект', 'ремкомплект', 'repair kit')],
  ['turbo', 64, T('турбо', 'турбо', 'turbo')], ['beer', 128, T('пиво', 'пиво', 'beer')], ['carrot', 256, T('морковный напиток', 'морквяний напій', 'carrot drink')]];
const upgrades = m => { const on = UP.filter(([, b]) => m & b).map(([, , t]) => t); return { ru: on.map(t => t.ru).join(', ') || '—', uk: on.map(t => t.uk).join(', ') || '—', en: on.map(t => t.en).join(', ') || '—' }; };
const num = v => v === undefined || v === null ? '—' : String(+v);

function unitBlocks(u) {
  const p = u.stats, f = [];
  const fact = (value, label) => f.push({ value: String(value), label });
  fact(num(p.price), T('цена', 'ціна', 'price'));
  fact(num(p.maxhp), T('живучесть', 'живучість', 'HP'));
  fact(`${num(p.frontarmor)} / ${num(p.backarmor)} / ${num(p.toparmor)}`, T('броня: лоб / корма / верх', 'броня: лоб / корма / дах', 'armour: front / rear / top'));
  if (p.damage !== undefined) fact(num(p.damage), u.section.includes('kamikaze') && !p.shottype ? T('урон взрыва', 'шкода вибуху', 'blast damage') : T('урон', 'шкода', 'damage'));
  if (p.reloadtime !== undefined && p.shottype) fact(num(p.reloadtime) + ' s', T('перезарядка', 'перезаряджання', 'reload'));
  if (+p.maxrange > 0) fact(`${num(p.minrange ?? 0)}–${num(p.maxrange)}`, T('дальность', 'дальність', 'range'));
  fact(num(p.sight), T('обзор', 'огляд', 'sight'));
  fact(String(Math.round(+p.movespeed * 50)), T('скорость', 'швидкість', 'speed'));
  if (p.ammo !== undefined) fact(num(p.ammo), T('боезапас', 'боєзапас', 'ammo'));
  if (u.section.includes('kamikaze')) fact(`${num(p.damage)} / r ${num(p.shotspread)}`, T('взрыв при гибели', 'вибух під час загибелі', 'death blast'));
  return [
    { type: 'heading', text: T(`${u.ru[0]} — ${u.ru[1]}`, `${u.uk[0]} — ${u.uk[1]}`, `${u.en[0]} — ${u.en[1]}`) },
    { type: 'paragraph', text: T(u.ru[2], u.uk[2], u.en[2]) },
    { type: 'facts', facts: f },
    { type: 'paragraph', text: (() => { const up = upgrades(+p.upgrademask); return T(`Улучшения: ${up.ru}.`, `Покращення: ${up.uk}.`, `Upgrades: ${up.en}.`); })() },
  ];
}

const KEY_RU = { price: 'цена', maxrange: 'дальность', reloadtime: 'перезарядка', ammo: 'боезапас', movespeed: 'скорость', spinspeed: 'поворот корпуса' };
const KEY_UK = { price: 'ціна', maxrange: 'дальність', reloadtime: 'перезаряджання', ammo: 'боєзапас', movespeed: 'швидкість', spinspeed: 'поворот корпусу' };
const KEY_EN = { price: 'price', maxrange: 'range', reloadtime: 'reload', ammo: 'ammo', movespeed: 'speed', spinspeed: 'hull turn' };
const NAMES = {
  'Nyul raketas pancelkocsi': T('Истребитель танков (кролики)', 'Винищувач танків (кролики)', 'Tank killer (rabbits)'),
  'Diszno hard tank': T('Тяжёлый танк (свиньи)', 'Важкий танк (свині)', 'Heavy tank (pigs)'),
  'Diszno mozsar': T('Мортира (свиньи)', 'Мортира (свині)', 'Mortar (pigs)'), 'Nyul mozsar': T('Мортира (кролики)', 'Мортира (кролики)', 'Mortar (rabbits)'),
  'Diszno loveg': T('Артиллерия (свиньи)', 'Артилерія (свині)', 'Artillery (pigs)'), 'Nyul loveg': T('Артиллерия (кролики)', 'Артилерія (кролики)', 'Artillery (rabbits)'),
  'Upgrade armor': T('Улучшение «Броня»', 'Покращення «Броня»', 'Armour upgrade'),
  'Upgrade diszno sor': T('Улучшение «Пиво» (свиньи)', 'Покращення «Пиво» (свині)', 'Beer upgrade (pigs)'),
  'Upgrade nyul repa': T('Улучшение «Морковный напиток» (кролики)', 'Покращення «Морквяний напій» (кролики)', 'Carrot drink upgrade (rabbits)'),
};
// Пояснення правок пишемо в arc-units.js українською (мова коду проєкту); тут — короткі тексти для вікі трьома мовами.
const WHY = {
  'Nyul raketas pancelkocsi': T('Главная жалоба в сетевой игре: быстрее свиных танков и бьёт дальше, поэтому расстреливает их без ответа.', 'Головна скарга в мережевій грі: швидший за свинячі танки й б\'є далі, тож розстрілює їх без відповіді.', 'The top multiplayer complaint: faster than pig tanks and outranges them, so it kites them freely.'),
  'Diszno hard tank': T('Не успевал за кроличьими ракетными машинами.', 'Не встигав за кролячими ракетними машинами.', 'Could not keep up with the rabbit rocket cars.'),
  'Diszno mozsar': T('Мортиры почти не покупают: дорого за дальность 5.5.', 'Мортири майже не купують: дорого за дальність 5.5.', 'Mortars are rarely bought: too pricey for range 5.5.'),
  'Nyul mozsar': T('То же, что у свиней.', 'Те саме, що у свиней.', 'Same as the pig mortar.'),
  'Diszno loveg': T('Артиллерия с дальностью 25 — самый сильный юнит игры.', 'Артилерія з дальністю 25 — найсильніший юніт гри.', 'Range-25 artillery is the strongest unit in the game.'),
  'Nyul loveg': T('То же, что у свиней.', 'Те саме, що у свиней.', 'Same as the pig artillery.'),
  'Upgrade armor': T('Броня вычитается из каждого попадания: +1 брони вдвое режет урон броневика (4 − 3 = 1).', 'Броня віднімається від кожного влучання: +1 броні вдвічі ріже шкоду броньовика (4 − 3 = 1).', 'Armour is subtracted from every hit: +1 armour halves an armoured car\'s damage (4 − 3 = 1).'),
  'Upgrade diszno sor': T('−10 % перезарядки за 25 очков было самым выгодным улучшением.', '−10 % перезаряджання за 25 очок було найвигіднішим покращенням.', '−10 % reload for 25 points was the best deal in the game.'),
  'Upgrade nyul repa': T('То же, что пиво у свиней.', 'Те саме, що пиво у свиней.', 'Same as the pig beer.'),
};

const pages = [
  { id: 'au-overview', group: 'arc-units', title: T('Обзор', 'Огляд', 'Overview'),
    summary: T('Новые юниты для обеих рас и правки баланса. Тестовая сборка, в мод-пак пока не входит.', 'Нові юніти для обох рас і правки балансу. Тестова збірка, у мод-пак поки не входить.', 'New units for both sides and balance fixes. Test build, not in the mod pack yet.'),
    blocks: [
      { type: 'callout', tone: 'warn', title: T('Тестовая сборка', 'Тестова збірка', 'Test build'),
        text: T('Нужен пропатченный swineHD.exe: в обычной игре только 13 типов юнитов на расу. Играть по сети можно, только если патч и файлы стоят у всех. «Проверить целостность файлов» в Steam вернёт оригинальный exe.',
          'Потрібен пропатчений swineHD.exe: у звичайній грі лише 13 типів юнітів на расу. Грати по мережі можна, лише якщо патч і файли стоять у всіх. «Перевірити цілісність файлів» у Steam поверне оригінальний exe.',
          'Needs a patched swineHD.exe: the stock game has only 13 unit types per side. Online play only works if everyone has the patch and files. Steam\'s “Verify integrity” restores the original exe.') },
      { type: 'facts', facts: [
        { value: String(bal.units.filter(u => u.race === 'pig').length), label: T('новых у свиней', 'нових у свиней', 'new pig units') },
        { value: String(bal.units.filter(u => u.race === 'rabbit').length), label: T('новых у кроликов', 'нових у кроликів', 'new rabbit units') },
        { value: String(bal.vanilla.length), label: T('правок баланса', 'правок балансу', 'balance changes') } ] },
      { type: 'heading', text: T('Где их купить', 'Де їх купити', 'Where to buy them') },
      { type: 'bullets', items: [
        T('В магазине перед сетевым матчем: в списке новых юнитов они идут последними, листайте стрелкой.', 'У магазині перед мережевим матчем: у списку нових юнітів вони йдуть останніми, гортайте стрілкою.', 'In the pre-match multiplayer shop: they are last in the new-units list, page with the arrow.'),
        T('В магазине кампании (во всех миссиях с магазином) и в «Штабе» — покупке прямо во время боя (сетка 9×2).', 'У магазині кампанії (в усіх місіях з магазином) і в «Штабі» — купівлі просто під час бою (сітка 9×2).', 'In the campaign shop (every mission that has one) and in Headquarters — buying mid-battle (a 9×2 grid).'),
        T('Все 10 новых юнитов (по 5 у свиней и кроликов) получили свои 3D-модели, иконки и ролики магазина, включая колёсную ходовую (MoveType 2) с поворотными передними колёсами. Временный «Чародей» убран.', 'Усі 10 нових юнітів (по 5 у свиней і кроликів) отримали свої 3D-моделі, іконки й ролики магазину, включно з колісною ходовою (MoveType 2) з поворотними передніми колесами. Тимчасового «Чародія» прибрано.', 'All 10 new units (5 pig and 5 rabbit) now have their own 3D models, shop icons and turntable videos, including wheeled MoveType 2 chassis with steering front wheels. The temporary Warlock has been removed.') ] },
      { type: 'heading', text: T('Как работает бой', 'Як працює бій', 'How combat works') },
      { type: 'bullets', items: [
        T('Урон попадания = урон оружия − броня той стороны, куда попали: лоб, борт (среднее лба и кормы) или корма. Навесные снаряды бьют в крышу.', 'Шкода влучання = шкода зброї − броня тієї сторони, куди влучили: лоб, борт (середнє лоба й корми) або корма. Навісні снаряди б\'ють у дах.', 'Hit damage = weapon damage − armour of the side that was hit: front, side (average of front and rear) or rear. Lobbed shells hit the roof.'),
        T('Если броня не меньше урона, попадание лишь царапает. Поэтому лишняя единица брони так сильна против скорострельного оружия.', 'Якщо броня не менша за шкоду, влучання лише дряпає. Тому зайва одиниця броні така сильна проти скорострільної зброї.', 'If armour is at least the damage, the hit only scratches. That is why one extra armour point is so strong against rapid-fire weapons.'),
        T('Опыт даёт нанесённый урон. Ветеран: живучесть ×1.2, урон и броня +0.4. Элита: живучесть ×1.5, урон и броня +1.', 'Досвід дає завдана шкода. Ветеран: живучість ×1.2, шкода й броня +0.4. Еліта: живучість ×1.5, шкода й броня +1.', 'Experience comes from damage dealt. Veteran: HP ×1.2, damage and armour +0.4. Elite: HP ×1.5, damage and armour +1.'),
        T('Порог опыта у каждого юнита свой. Сильным и скорострельным новым юнитам он поднят, чтобы плоский бонус элиты их не ломал.', 'Поріг досвіду в кожного юніта свій. Сильним і скорострільним новим юнітам його піднято, щоб пласкі бонуси еліти їх не ламали.', 'Each unit has its own experience threshold. It is raised for strong and rapid-fire new units so the flat elite bonus does not break them.') ] },
    ] },
  { id: 'au-pigs', group: 'arc-units', title: T('Новые юниты свиней', 'Нові юніти свиней', 'New pig units'),
    summary: T('Дизель, перебор и грубая мощь.', 'Дизель, перебір і груба сила.', 'Diesel, excess and brute force.'),
    blocks: bal.units.filter(u => u.race === 'pig').flatMap(unitBlocks) },
  { id: 'au-rabbits', group: 'arc-units', title: T('Новые юниты кроликов', 'Нові юніти кроликів', 'New rabbit units'),
    summary: T('Скорость, засады и хитрые гаджеты.', 'Швидкість, засідки й хитрі гаджети.', 'Speed, ambushes and clever gadgets.'),
    blocks: bal.units.filter(u => u.race === 'rabbit').flatMap(unitBlocks) },
  { id: 'au-balance', group: 'arc-units', title: T('Правки старых юнитов', 'Правки старих юнітів', 'Changes to old units'),
    summary: T('Что поменялось у обычных юнитов и улучшений, и почему.', 'Що змінилося у звичайних юнітів і покращень, і чому.', 'What changed for the stock units and upgrades, and why.'),
    blocks: bal.vanilla.flatMap(v => [
      { type: 'heading', text: NAMES[v.section] || T(v.section, v.section, v.section) },
      { type: 'paragraph', text: WHY[v.section] },
      { type: 'facts', facts: v.changes.map(c => ({ value: `${+c.from} → ${c.to}`, label: T(KEY_RU[c.key.toLowerCase()] || c.key, KEY_UK[c.key.toLowerCase()] || c.key, KEY_EN[c.key.toLowerCase()] || c.key) })) },
    ]) },
];

w.groups = w.groups.filter(g => g.id !== 'arc-units');
const helpIdx = w.groups.findIndex(g => g.id === 'help');
w.groups.splice(helpIdx < 0 ? w.groups.length : helpIdx, 0, { id: 'arc-units', mod: 'arcanum-units', title: T('Arcanum Units', 'Arcanum Units', 'Arcanum Units') });
w.pages = w.pages.filter(p => p.group !== 'arc-units');
const firstHelp = w.pages.findIndex(p => p.group === 'help');
w.pages.splice(firstHelp < 0 ? w.pages.length : firstHelp, 0, ...pages);

// «Що нового»: запис з ключем, щоб повторний запуск його замінював.
const ch = w.pages.find(p => p.id === 'changes');
const KEY = 'arc-units-test-1';
const i0 = ch.blocks.findIndex(b => b.key === KEY);
if (i0 >= 0) ch.blocks.splice(i0, 2);
ch.blocks.unshift(
  { type: 'heading', key: KEY, text: T(`Arcanum Units · тестовая сборка · ${DATE.ru}`, `Arcanum Units · тестова збірка · ${DATE.uk}`, `Arcanum Units · test build · ${DATE.en}`) },
  { type: 'bullets', items: [
    T(`Патч exe: ${13 + bal.units.length / 2} типов юнитов на расу вместо 13. Новые юниты продаются в магазине перед сетевым матчем.`, `Патч exe: ${13 + bal.units.length / 2} типів юнітів на расу замість 13. Нові юніти продаються в магазині перед мережевим матчем.`, `Exe patch: ${13 + bal.units.length / 2} unit types per side instead of 13. New units are sold in the pre-match multiplayer shop.`),
    T('Свиньи: Чародей, Хряк-Гриль, Свин-Царь, Бомбохряк, Осадный Кабан, Гряземёт. Кролики: Чародей, Заяц-Призрак, Морковный Смерч, Кротобой, Пит-Стоп, Кролик-Ушастик.', 'Свині: Чародій, Кабан-Гриль, Свин-Цар, Бомбокабан, Облоговий Вепр, Гряземіт. Кролики: Чародій, Заєць-Привид, Морквяний Смерч, Кротобій, Піт-Стоп, Кролик-Вухань.', 'Pigs: Warlock, Hog Grill, Swine Tsar, Boom Hog, Siege Boar, Mud Slinger. Rabbits: Warlock, Ghost Hare, Carrot Twister, Mole Smasher, Pit Stop, Big Ears.'),
    T('Юниты с «kamikaze» в названии секции при гибели взрываются с уроном по площади, как мины.', 'Юніти з «kamikaze» у назві секції під час загибелі вибухають зі шкодою по площі, як міни.', 'Units with “kamikaze” in their section name explode with area damage when destroyed, like mines.'),
    T('Баланс: ослаблен кроличий истребитель танков, ускорен тяжёлый танк свиней, подешевели мортиры, подорожали артиллерия, броня и пиво/морковный напиток.', 'Баланс: послаблено кролячий винищувач танків, пришвидшено важкий танк свиней, подешевшали мортири, подорожчали артилерія, броня й пиво/морквяний напій.', 'Balance: the rabbit tank killer is weaker, the pig heavy tank faster, mortars cheaper; artillery, armour and beer/carrot drink cost more.'),
    T('Свой ролик и иконка в магазине: танк смотрит влево на сером фоне, как у остальных юнитов.', 'Свій ролик та іконка в магазині: танк дивиться ліворуч на сірому тлі, як в інших юнітів.', 'Own shop video and icon: the tank faces left on a grey background like the other units.'),
    T('Хряк-Гриль переделан в «стеклянную пушку»: огнемёт бьёт на 2.5 клетки, 12 урона каждые 1.6 с; живучесть 60, корма без брони. При гибели бак взрывается: до 30 урона в радиусе 2.5 по всем вокруг.', 'Кабан-Гриль перероблено на «скляну гармату»: вогнемет б’є на 2.5 клітинки, 12 шкоди кожні 1.6 с; живучість 60, корма без броні. Під час загибелі бак вибухає: до 30 шкоди в радіусі 2.5 по всіх довкола.', 'The Hog Grill is now a glass cannon: the flamethrower reaches 2.5 cells, 12 damage every 1.6 s; 60 HP, no rear armour. When destroyed its tank explodes: up to 30 damage in a 2.5 radius to everyone around.'),
    T('Исправлены модели: часть граней была вывернута наизнанку, и в игре корпус Хряк-Гриля выглядел серым, а ствол Чародея — полутрубой.', 'Виправлено моделі: частина граней була вивернута навиворіт, і в грі корпус Кабана-Гриля виглядав сірим, а ствол Чародія — напівтрубою.', 'Models fixed: some faces were inside out, so in game the Hog Grill hull looked grey and the Warlock barrel looked like a half-pipe.'),
    T('Все 10 новых юнитов получили свои 3D-модели с динамическим цветом команды, текстурами Veteran/Elite, иконками и 200-кадровыми роликами магазина: Хряк-Гриль, Свин-Царь, Бомбохряк, Осадный Кабан, Гряземёт, Заяц-Призрак, Морковный Смерч, Кротобой, Пит-Стоп и Кролик-Ушастик. Колёсные машины переведены на MoveType 2 с рабочими передними поворотными колёсами.', 'Усі 10 нових юнітів отримали свої 3D-моделі з динамічним кольором команди, текстурами Veteran/Elite, іконками та 200-кадровими роликами магазину: Кабан-Гриль, Свин-Цар, Бомбокабан, Облоговий Вепр, Гряземіт, Заєць-Привид, Морквяний Смерч, Кротобій, Піт-Стоп і Кролик-Вухань. Колісні машини переведено на MoveType 2 з робочими передніми поворотними колесами.', 'All 10 new units received their own 3D models with dynamic team colour, Veteran/Elite textures, shop icons and 200-frame turntable videos: Hog Grill, Swine Tsar, Boom Hog, Siege Boar, Mud Slinger, Ghost Hare, Carrot Twister, Mole Smasher, Pit Stop and Big Ears. Wheeled vehicles now use MoveType 2 with steering front wheels.') ] });

// Тестова збірка 2: механіки з патча exe, ребаланс цін, песочниця, мультиплеєр.
const KEY2 = 'arc-units-test-2';
const j0 = ch.blocks.findIndex(b => b.key === KEY2);
if (j0 >= 0) ch.blocks.splice(j0, 2);
ch.blocks.unshift(
  { type: 'heading', key: KEY2, text: T('Arcanum Units · тестовая сборка 2 · 23.11.2026', 'Arcanum Units · тестова збірка 2 · 23.11.2026', 'Arcanum Units · test build 2 · 2026-11-23') },
  { type: 'bullets', items: [
    T('Исправлен вылет при гибели любой техники: вставка в exe работала с абсолютными адресами, а Windows загружал игру по случайному адресу (ASLR). Теперь патч выключает ASLR для swineHD.exe.', 'Виправлено виліт під час загибелі будь-якої техніки: вставка в exe працювала з абсолютними адресами, а Windows вантажив гру за випадковою адресою (ASLR). Тепер патч вимикає ASLR для swineHD.exe.', 'Fixed the crash whenever a vehicle was destroyed: the exe insert used absolute addresses while Windows loaded the game at a random address (ASLR). The patch now turns ASLR off for swineHD.exe.'),
    T('Бомбохряк: кнопка спецдействия — подрыв (до 60 урона в радиусе 5). Гряземёт и Хряк-Гриль: попадание вдвое замедляет врага и его повороты на 5 секунд. Осадный Кабан наводится всем корпусом. Морковный Смерч: залп 20 ракет, боекомплект 40, перезарядка 25 с. Кротобой: кнопка включает минирование на ходу, пушка убрана. Пит-Стоп в 1.5 раза быстрее и заодно заправляет.', 'Бомбокабан: кнопка спецдії — підрив (до 60 шкоди в радіусі 5). Гряземіт і Кабан-Гриль: влучання вдвічі сповільнює ворога та його повороти на 5 секунд. Облоговий Вепр наводиться всім корпусом. Морквяний Смерч: залп 20 ракет, боєкомплект 40, перезаряджання 25 с. Кротобій: кнопка вмикає мінування на ходу, гармату прибрано. Піт-Стоп у 1.5 раза швидший і заразом заправляє.', 'Boom Hog: the special button detonates it (up to 60 damage, radius 5). Mud Slinger and Hog Grill: hits halve enemy speed and turning for 5 seconds. Siege Boar aims with its whole hull. Carrot Twister: 20-rocket salvo, 40 rounds, 25 s reload. Mole Smasher: the button turns on mining on the move, gun removed. Pit Stop is 1.5× faster and refuels too.'),
    T('Все юниты переделаны по концепту: Свин-Царь — 45 % от 4000 SP, жрёт топливо вчетверо, башня еле поворачивается; Заяц-Призрак и Морковный Смерч — без брони; Ушастик всегда виден врагу.', 'Усі юніти перероблено за концептом: Свин-Цар — 45 % від 4000 SP, жере пальне вчетверо, башта ледве повертається; Заєць-Привид і Морквяний Смерч — без броні; Вухань завжди видимий ворогові.', 'Every unit now follows the concept: Swine Tsar costs 45 % of 4000 SP, burns fuel four times as fast and barely turns its turret; Ghost Hare and Carrot Twister have no armour; Big Ears is always visible to the enemy.'),
    T('Цены: всё, что продаётся, дорожает примерно в 1.6 раза (танк 400 → 650), поэтому армии меньше. Соотношение цен боевых юнитов подобрано симуляцией боёв на формулах игры.', 'Ціни: усе, що продається, дорожчає приблизно в 1.6 раза (танк 400 → 650), тож армії менші. Співвідношення цін бойових юнітів підібрано симуляцією боїв на формулах гри.', 'Prices: everything for sale costs about 1.6× more (tank 400 → 650), so armies are smaller. Combat unit price ratios come from a battle simulation built on the game formulas.'),
    T('Сетевая игра: союзники по команде могут выделять и водить технику друг друга (противники и игроки без команды — нет). Без случайной расстановки игроки одной команды стартуют рядом.', 'Мережева гра: союзники по команді можуть виділяти й водити техніку одне одного (супротивники та гравці без команди — ні). Без випадкової розстановки гравці однієї команди стартують поруч.', 'Multiplayer: teammates can select and drive each other\'s vehicles (opponents and players without a team cannot). With random start positions off, players of one team start next to each other.'),
    T('Песочница для тестов: сценарный режим игры — магазин со всеми юнитами и 100 000 SP, затем карта кампании с врагами (опыт идёт за урон по ним).', 'Пісочниця для тестів: сценарний режим гри — магазин з усіма юнітами й 100 000 SP, потім мапа кампанії з ворогами (досвід іде за шкоду по них).', 'Test sandbox: the game\'s scenario mode — a shop with every unit and 100,000 SP, then a campaign map with enemies (experience comes from damaging them).') ] });

// Тестова збірка 3: свої кнопки, калюжі, залп 40, магазин у бою, мережеві мапи, лаунчер.
const KEY3 = 'arc-units-test-3';
const k0 = ch.blocks.findIndex(b => b.key === KEY3);
if (k0 >= 0) ch.blocks.splice(k0, 2);
ch.blocks.unshift(
  { type: 'heading', key: KEY3, text: T('Мод-пак v2 · Arcanum Units · тестовая сборка 3 · 23.11.2026', 'Мод-пак v2 · Arcanum Units · тестова збірка 3 · 23.11.2026', 'Mod pack v2 · Arcanum Units · test build 3 · 2026-11-23') },
  { type: 'bullets', items: [
    T('Мод-пак v2: вместо Full ReBalance — Arcanum Units. Лаунчер сам ставит патч swineHD.exe: бэкап оригинала, проверка версии игры до и после, возврат при «Удалить мод».', 'Мод-пак v2: замість Full ReBalance — Arcanum Units. Лаунчер сам ставить патч swineHD.exe: бекап оригіналу, перевірка версії гри до й після, повернення при «Видалити мод».', 'Mod pack v2: Arcanum Units replaces Full ReBalance. The launcher applies the swineHD.exe patch itself: original backed up, game version checked before and after, restored by “Remove mods”.'),
    T('Исправлен вылет при взрыве Бомбохряка и любого «камикадзе»: в коде взрыва потерялась одна инструкция.', 'Виправлено виліт під час вибуху Бомбокабана й будь-якого «камікадзе»: у коді вибуху загубилася одна інструкція.', 'Fixed the crash when Boom Hog or any kamikaze unit exploded: one instruction was missing in the blast code.'),
    T('Свои кнопки спецдействий: «Подрыв» (Бомбохряк), «Мины на ходу» (Кротобой), «Радар» (Ушастик, обзор ×3 на 15 с, перезарядка 45 с). Раньше кнопка Бомбохряка его закапывала.', 'Свої кнопки спецдій: «Підрив» (Бомбокабан), «Міни на ходу» (Кротобій), «Радар» (Вухань, огляд ×3 на 15 с, перезаряджання 45 с). Раніше кнопка Бомбокабана його закопувала.', 'Own special buttons: Detonate (Boom Hog), Mines on the Move (Mole Smasher), Radar (Big Ears, 3× sight for 15 s, 45 s cooldown). Before, Boom Hog’s button dug it in.'),
    T('Гряземёт: грязевые лужи на 10 секунд, замедление ×0.4 по площади, на земле видно бурое пятно.', 'Гряземіт: грязьові калюжі на 10 секунд, сповільнення ×0.4 по площі, на землі видно буру пляму.', 'Mud Slinger: mud puddles for 10 seconds, 0.4× slow in an area, a brown stain on the ground.'),
    T('Морковный Смерч: залп 40 ракет, боекомплект 40; больше не показывается как прицеп и тратит боеприпасы (раньше ключ Cargo делал из него «прицеп»).', 'Морквяний Смерч: залп 40 ракет, боєкомплект 40; більше не показується як причіп і витрачає боєприпаси (раніше ключ Cargo робив з нього «причіп»).', 'Carrot Twister: 40-rocket salvo, 40 rounds; no longer shown as a trailer and it uses up ammo (the Cargo key used to turn it into a “trailer”).'),
    T('Осадный Кабан: 20 снарядов. Хряк-Гриль: свой звук огнемёта. Временный юнит «Чародей» убран у обеих рас.', 'Облоговий Вепр: 20 снарядів. Кабан-Гриль: свій звук вогнемета. Тимчасовий юніт «Чародій» прибрано в обох рас.', 'Siege Boar: 20 shells. Hog Grill: its own flamethrower sound. The temporary Warlock unit is gone for both sides.'),
    T('Новые юниты продаются везде: в магазине кампании (все миссии с магазином) и в «Штабе» — покупке прямо во время боя (там теперь сетка 9×2).', 'Нові юніти продаються всюди: у магазині кампанії (усі місії з магазином) і в «Штабі» — купівлі просто під час бою (там тепер сітка 9×2).', 'New units are sold everywhere: in the campaign shop (every mission that has one) and in Headquarters — buying mid-battle (now a 9×2 grid).'),
    T('19 новых сетевых карт на 8 игроков из карт обеих кампаний: «Arc …» в списке карт. Старты разведены по сторонам (команды стартуют своими сторонами), флаг CTF посередине и 4 точки захвата.', '19 нових мережевих мап на 8 гравців з мап обох кампаній: «Arc …» у списку мап. Старти розведено по сторонах (команди стартують своїми сторонами), прапор CTF посередині й 4 точки захоплення.', '19 new 8-player multiplayer maps built from both campaigns: “Arc …” in the map list. Starts are split by side (teams start on their own side), with a CTF flag in the middle and 4 domination points.'),
    T('Ограничение: больше 8 игроков игра не держит — массивы игроков, туман войны, слоты лобби и сетевые пакеты рассчитаны ровно на 8. (Снято совместным командованием — см. ниже.)', 'Обмеження: понад 8 гравців гра не тримає — масиви гравців, туман війни, слоти лобі й мережеві пакети розраховані рівно на 8. (Знято спільним командуванням — див. нижче.)', 'Limit: the game cannot take more than 8 players — player arrays, fog of war, lobby slots and network packets are sized for exactly 8. (Lifted by co-command — see below.)'),
    T("Вики пака в лаунчере теперь общая для всего мод-пака: страницы по группам слева, свежая версия подтягивается с сайта, без сети — встроенная копия. Страницы Full ReBalance убраны: этого мода в паке v2 нет.", "Вікі паку в лаунчері тепер спільна для всього мод-паку: сторінки за групами ліворуч, свіжа версія підтягується з сайту, без мережі — вбудована копія. Сторінки Full ReBalance прибрано: цього мода в паку v2 немає.", "The launcher wiki now covers the whole mod pack: pages grouped on the left, the latest version is fetched from the site, the built-in copy is used offline. Full ReBalance pages are gone: that mod is not in pack v2."),
    T("На одном компьютере теперь можно запустить до 20 копий игры (раньше 4): каждая берёт следующий свободный порт с 60500. Это нужно для проверки сетевой игры без друзей: tools/mp-test.ps1 запускает хост и подключения (ключи игры +host, +connect 127.0.0.1, +name). Предел в 8 игроков в матче пока остаётся — следующим шагом будет совместное командование (до 16 человек, по двое на армию). Первый этап сделан: сетевая часть игры хранит данные уже для 16 слотов, матч пока на 8. Для проверки у игры появился ключ +autostart N: хост сам начинает матч, когда зайдут N игроков (tools/mp-test.ps1 -AutoStart). Незнакомые ключи командной строки больше не роняют игру.", "На одному комп’ютері тепер можна запустити до 20 копій гри (раніше 4): кожна бере наступний вільний порт з 60500. Це потрібно для перевірки мережевої гри без друзів: tools/mp-test.ps1 запускає хост і підключення (ключі гри +host, +connect 127.0.0.1, +name). Межа у 8 гравців у матчі поки лишається — наступним кроком буде спільне командування (до 16 людей, по двоє на армію). Перший етап зроблено: мережева частина гри зберігає дані вже для 16 слотів, матч поки на 8. Для перевірки в гри з’явився ключ +autostart N: хост сам починає матч, коли зайдуть N гравців (tools/mp-test.ps1 -AutoStart). Незнайомі ключі командного рядка більше не валять гру.", "One PC can now run up to 20 copies of the game (was 4): each takes the next free port from 60500. This lets us test multiplayer without friends: tools/mp-test.ps1 starts a host and clients (game switches +host, +connect 127.0.0.1, +name). The 8-player match limit stays for now — the next step is co-command (up to 16 people, two per army). Stage one is done: the game’s network code now stores data for 16 slots; matches are still 8 players. For testing the game has a +autostart N switch: the host starts the match once N players join (tools/mp-test.ps1 -AutoStart). Unknown command-line switches no longer crash the game."),
    T("Исправлено падение игры при гибели камикадзе (Бомбохряк, Хряк-Гриль, Морковный Смерч). Его взрыв задевал его самого, и он «погибал» снова и снова, пока игра не вылетала с «Stack overflow». Теперь свой взрыв камикадзе не задевает, а два камикадзе рядом больше не подрывают друг друга по кругу.", "Виправлено падіння гри під час загибелі камікадзе (Бомбокабан, Хряк-Гриль, Морквяний Смерч). Його вибух зачіпав його самого, і він «гинув» знову й знову, доки гра не вилітала зі «Stack overflow». Тепер власний вибух камікадзе не зачіпає, а два камікадзе поруч більше не підривають одне одного по колу.", "Fixed a crash when a kamikaze unit dies (Boom Hog, Hog Grill, Carrot Twister). Its blast hit the unit itself, so it “died” again and again until the game crashed with “Stack overflow”. A kamikaze’s own blast no longer hits it, and two kamikazes next to each other no longer set each other off in a loop."),
    T("Совместное командование: до 16 человек в одном матче, по двое на армию. Когда все 8 мест заняты, девятый и следующие игроки становятся вторыми командирами армий 1–8 по порядку и управляют той же армией, что и её хозяин. Проверено на 16 копиях игры на одном ПК: матч идёт, состояние мира у всех копий совпадает. В лобби второй командир виден в строке армии: «P1 + P9». Пока ограничения: если хозяин армии уйдёт, армия выбывает, даже если второй командир остался; приказы второго командира ещё нужно проверить в живой игре. Попутно: сетевая часть держит до 20 соединений вместо 8, исправлена ошибка, из-за которой рассылка читала таблицу подключений по старому адресу.", "Спільне командування: до 16 людей в одному матчі, по двоє на армію. Коли всі 8 місць зайняті, дев’ятий і наступні гравці стають другими командирами армій 1–8 по черзі й керують тією самою армією, що й її господар. Перевірено на 16 копіях гри на одному ПК: матч іде, стан світу в усіх копій збігається. У лобі другого командира видно в рядку армії: «P1 + P9». Поки обмеження: якщо господар армії піде, армія вибуває, навіть якщо другий командир лишився; накази другого командира ще треба перевірити в живій грі. Принагідно: мережева частина тримає до 20 з’єднань замість 8, виправлено помилку, через яку розсилка читала таблицю підключень за старою адресою.", "Co-command: up to 16 people in one match, two per army. Once all 8 seats are taken, the 9th and later players become second commanders of armies 1–8 in order and control the same army as its owner. Tested with 16 game copies on one PC: the match runs and the world state matches across all copies. The lobby shows a second commander in the army’s row: “P1 + P9”. Current limits: if the army’s owner leaves, the army is out even if the second commander stays; the second commander’s orders still need a live test. Also: the network layer now holds up to 20 connections instead of 8, and a bug where broadcasting read the connection table at its old address is fixed.") ] });

// Сторінка механік і песочниці.
const mech = { id: 'au-mechanics', group: 'arc-units', title: T('Механики и песочница', 'Механіки та пісочниця', 'Mechanics and sandbox'),
  summary: T('Что умеют новые юниты сверх обычных параметров и как всё проверить.', 'Що вміють нові юніти понад звичайні параметри і як усе перевірити.', 'What the new units do beyond normal stats, and how to test it all.'),
  blocks: [
    { type: 'heading', text: T('Спецмеханики (патч exe)', 'Спецмеханіки (патч exe)', 'Special mechanics (exe patch)') },
    { type: 'bullets', items: [
T('Свои кнопки спецдействий (новые иконки в панели): «Подрыв» у Бомбохряка — до 60 урона в радиусе 5; «Мины на ходу» у Кротобоя — включил, и он кладёт мину каждые 2.5 клетки пути (не чаще раза в секунду); «Радар» у Ушастика — обзор ×3 на 15 секунд, потом 45 секунд перезарядки.', 'Свої кнопки спецдій (нові іконки в панелі): «Підрив» у Бомбокабана — до 60 шкоди в радіусі 5; «Міни на ходу» у Кротобоя — увімкнув, і він кладе міну кожні 2.5 клітинки шляху (не частіше разу на секунду); «Радар» у Вуханя — огляд ×3 на 15 секунд, потім 45 секунд перезаряджання.', 'Own special buttons (new panel icons): Boom Hog’s Detonate — up to 60 damage in a radius of 5; Mole Smasher’s Mines on the Move — switch it on and it drops a mine every 2.5 cells (at most once a second); Big Ears’ Radar — triple sight for 15 seconds, then a 45-second cooldown.'),
      T('Взрыв при гибели (Бомбохряк, Хряк-Гриль, Морковный Смерч): урон по площади всем вокруг, линейно слабеет к краю.', 'Вибух під час загибелі (Бомбокабан, Кабан-Гриль, Морквяний Смерч): шкода по площі всім довкола, лінійно слабшає до краю.', 'Death blasts (Boom Hog, Hog Grill, Carrot Twister): area damage to everyone around, fading linearly to the edge.'),
      T('Грязь (Гряземёт, Хряк-Гриль): попадание по врагу — скорость и поворот ×0.4 на 5 секунд. Снаряд Гряземёта оставляет на земле бурую лужу на 10 секунд: каждый чужой юнит в радиусе 2.5 от неё ползёт так же. Своих и союзников грязь не тормозит.', 'Багно (Гряземіт, Кабан-Гриль): влучання по ворогу — швидкість і поворот ×0.4 на 5 секунд. Снаряд Гряземета лишає на землі буру калюжу на 10 секунд: кожен чужий юніт у радіусі 2.5 від неї повзе так само. Своїх і союзників багно не гальмує.', 'Mud (Mud Slinger, Hog Grill): a hit on an enemy cuts speed and turning to 0.4× for 5 seconds. A Mud Slinger shell leaves a brown puddle for 10 seconds: every enemy unit within 2.5 of it crawls the same way. Mud never slows you or your allies.'),
      T('Наведение корпусом (Осадный Кабан): орудие смотрит строго вперёд, на цель доворачивается машина.', 'Наведення корпусом (Облоговий Вепр): гармата дивиться строго вперед, на ціль доводиться машина.', 'Hull aiming (Siege Boar): the gun points straight ahead; the vehicle turns onto the target.'),
      T('Залп (Морковный Смерч): в режиме залпа — все 40 ракет за 4 секунды.', 'Залп (Морквяний Смерч): у режимі залпу — усі 40 ракет за 4 секунди.', 'Salvo (Carrot Twister): all 40 rockets in 4 seconds in salvo mode.'),
      T('Журнал: каждая механика пишет строку «ARC: …» в журнал игры (папка Kite Games\\Swine\\log в LOCALAPPDATA) — по нему видно, что подрыв, мины, лужи, радар и залп сработали.', 'Журнал: кожна механіка пише рядок «ARC: …» у журнал гри (тека Kite Games\\Swine\\log у LOCALAPPDATA) — з нього видно, що підрив, міни, калюжі, радар і залп спрацювали.', 'Log: every mechanic writes an “ARC: …” line to the game journal (Kite Games\\Swine\\log under LOCALAPPDATA), so you can see that detonation, mines, puddles, radar and salvo fired.') ] },
    { type: 'heading', text: T('Песочница', 'Пісочниця', 'Sandbox') },
    { type: 'paragraph', text: T('Если запустить swineHD.exe с картой кампании в параметрах, игра открывает сценарный режим: магазин со всеми юнитами и 100 000 SP, потом карта с врагами кампании. Готовые ярлыки — modpack/sandbox/sandbox-rabbits.cmd (карта d_04, играешь кроликами) и sandbox-pigs.cmd (карта ny_08).', 'Якщо запустити swineHD.exe з мапою кампанії в параметрах, гра відкриває сценарний режим: магазин з усіма юнітами й 100 000 SP, потім мапа з ворогами кампанії. Готові ярлики — modpack/sandbox/sandbox-rabbits.cmd (мапа d_04, граєш кроликами) і sandbox-pigs.cmd (мапа ny_08).', 'Launching swineHD.exe with a campaign map as a parameter opens scenario mode: a shop with every unit and 100,000 SP, then the map with campaign enemies. Ready shortcuts: modpack/sandbox/sandbox-rabbits.cmd (map d_04, you play rabbits) and sandbox-pigs.cmd (map ny_08).') },
  ] };
w.pages = w.pages.filter(p => p.id !== 'au-mechanics');
w.pages.splice(w.pages.findIndex(p => p.id === 'au-balance') + 1, 0, mech);

w.updated = '2026-11-23';
fs.writeFileSync(SRC, JSON.stringify(w, null, 2) + '\n');
fs.mkdirSync(path.join(ROOT, 'modpack/wiki/data'), { recursive: true });
fs.copyFileSync(process.argv[2], path.join(ROOT, 'modpack/wiki/data/arc-units.balance.json'));
console.log(`wiki: ${pages.length} pages in arc-units, ${pages.reduce((a, p) => a + p.blocks.length, 0)} blocks; changelog updated`);

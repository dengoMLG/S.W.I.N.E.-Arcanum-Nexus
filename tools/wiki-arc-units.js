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
  'Nyul bombazo': T('Бомбардировщик (кролики)', 'Бомбардувальник (кролики)', 'Bomber (rabbits)'),
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
  'Nyul bombazo': T('Авиация кроликов: бомбардировщик прилетает и улетает (а значит, снова доступен) втрое быстрее. Авиаудар у кроликов стоит 100 очков вместо 50; у свиней авиация не менялась.', 'Авіація кроликів: бомбардувальник прилітає й відлітає (а отже, знову доступний) утричі швидше. Авіаудар у кроликів коштує 100 очок замість 50; у свиней авіація не змінювалась.', 'Rabbit aviation: the bomber arrives and leaves (so is available again) three times faster. A rabbit airstrike costs 100 points instead of 50; pig aviation is unchanged.'),
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
    summary: T('Новые юниты для обеих рас. Обычные юниты — с обычными характеристиками и ценами.', 'Нові юніти для обох рас. Звичайні юніти — зі звичайними характеристиками й цінами.', 'New units for both sides. Stock units keep their stock stats and prices.'),
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
  // #3: третя раса — Корпус Воронів (tools/raven-race.js), повна лінійка з 15 машин
  { id: 'au-ravens', group: 'arc-units', title: T('Корпус Воронов (третья раса)', 'Корпус Воронів (третя раса)', 'Raven Air Corps (third race)'),
    summary: T('Пернатый Авиакорпус: 15 собственных 3D-машин, дешёвая и бесплатная авиаподдержка, ПВО-зонтик, композитная крыша и русская озвучка с экранчиками.', 'Пернатий Авіакорпус: 15 власних 3D-машин, дешева й безкоштовна авіапідтримка, ППО-парасолька, композитний дах та озвучення з екранчиками.', 'The Raven Air Corps: 15 custom 3D vehicles, cheap and free air support, SAM umbrella, composite roof armour, HUD animations and Russian voices.'),
    blocks: [
      { type: 'bullets', items: [
        T('В лобби у выбора расы третий пункт — «Ворон». Полностью работает по сети: магазин из 18 слотов (10 базовых машин Воронов, включая аэродромный тягач «Скворец» и флагман «Альбатрос», 3 общих прицепа и 5 уникальных машин Arcanum).', 'У лобі у виборі раси третій пункт — «Ворон». Повністю працює по мережі: магазин із 18 слотів (10 базових машин Воронів, включно з тягачем «Шпак» і флагманом «Альбатрос», 3 спільні причепи та 5 унікальних машин Arcanum).', 'The lobby race dropdown has a third entry, Raven. Fully playable online: an 18-slot shop (10 base Raven vehicles including the Starling tow tractor and Albatross carrier, 3 shared trailers and 5 unique Arcanum units).'),
        T('Все 15 машин получили собственные 3D-модели с крыльями, турбинами, килями и кабинами пилотов (45 вариантов Normal/Veteran/Elite с выровненной плотностью UV-текстур без растяжений), иконки, 200-кадровые ролики магазина, 105 анимированных экранчиков HUD и 450 русских реплик.', 'Усі 15 машин отримали власні 3D-моделі з крилами, турбінами, кілями й кабінами пілотів (45 варіантів Normal/Veteran/Elite з вирівняною щільністю UV-текстур без розтягувань), іконки, 200-кадрові ролики магазину, 105 анімованих екранчиків HUD і 450 реплік.', 'All 15 vehicles have custom 3D models with wings, turbines, tail fins and cockpits (45 Normal/Veteran/Elite variants with aspect-compensated UVs), shop icons, 200-frame turntable videos, 105 animated HUD screens and 450 Russian voice lines.'),
        T('Доктрина авиаподдержки: тяжёлый авиаудар («Стриж» и флагман «Кондор») стоит всего 35 SP (бомбардировщик Varju bombazo летит вдвое быстрее свиного — 9.6, урон 24). Машины поддержки («Ястреб-ЗУ», «Сокол-ПТ», «Сапсан-ЗРК») вызывают БЕСПЛАТНЫЙ лёгкий тактический штурмовик (0 SP, откат 45 с, скорость 12.0, урон 11). Сухопутный авианосец «Альбатрос» каждые 35 секунд бесплатно запускает с катапульты крылатый дрон (65 урона в радиусе 3.5 на 24 клетки).', 'Доктрина авіапідтримки: важкий авіаудар («Стриж» і флагман «Кондор») коштує лише 35 SP (бомбардувальник Varju bombazo летить удвічі швидше за свинячий — 9.6, шкода 24). Машини підтримки («Яструб-ЗУ», «Сокіл-ПТ», «Сапсан-ЗРК») викликають БЕЗКОШТОВНИЙ легкий тактичний штурмовик (0 SP, відкат 45 с, швидкість 12.0, шкода 11). Сухопутний авіаносець «Альбатрос» кожні 35 секунд безкоштовно запускає крилатий дрон (65 шкоди в радіусі 3.5 на 24 клітинки).', 'Air-support doctrine: heavy airstrikes (Swift jeep and Condor flagship) cost only 35 SP (Varju bombazo flies twice as fast as the pig bomber at 9.6, 24 damage). Support vehicles (Hawk AA, Falcon AT, Peregrine SAM) call in a FREE light tactical striker (0 SP, 45 s cooldown, speed 12.0, 11 damage). The Albatross land carrier launches a free catapult cruise-drone every 35 s (65 damage in a 3.5 radius up to 24 cells).'),
        T('Господство в воздухе и спецмеханики: «Сапсан-ЗРК» автоматически перехватывает вражеские бомбардировщики в радиусе 14 клеток (срывает сброс бомб за 1 ракету!); «Коршун» даёт залп из 8 ракет вместо 5; «Филин» бьёт шламовыми авиабомбами на 15 урона с замедлением и 20-секундной зоной помех; экраноплан «Буревестник» скользит по воде (CanSwim) и косит багги Гатлингом (0.8 с); «Сова-ДРЛО» включает бесплатный радар ×3 сквозь рельеф.', 'Панування в повітрі та спецмеханіки: «Сапсан-ЗРК» автоматично перехоплює ворожі бомбардувальники в радіусі 14 клітинок (зриває скидання бомб за 1 ракету!); «Коршун» дає залп із 8 ракет замість 5; «Пугач» б\'є шламовими авіабомбами на 15 шкоди зі сповільненням і 20-секундною зоною перешкод; екраноплан «Буревісник» ковзає по воді (CanSwim) і косить багі Гатлінгом (0.8 с); «Сова-ДРЛВ» вмикає безкоштовний радар ×3 крізь рельєф.', 'Air superiority and special mechanics: Peregrine SAM automatically intercepts enemy bombers within 14 cells (aborting their bomb run for 1 missile!); Kite MLRS fires an 8-rocket salvo instead of 5; Eagle Owl lobs 15-damage sludge bombs with a 20 s jammer puddle; Petrel ekranoplan skims across water (CanSwim) with a 0.8 s Gatling; Owl AWACS activates a free 3× terrain-piercing radar.'),
        T('Сильные и слабые стороны: композитная броня крыши (TopArmor до 4.5) защищает Воронов от мортир и чужой авиации, но турбины расходуют много топлива, а корма большинства машин тонкая (0–0.5) — без аэродромного тягача «Скворец» с прицепами снабжения эскадрилья быстро встанет.', 'Сильні й слабкі сторони: композитна броня даху (TopArmor до 4.5) захищає Воронів від мортир і чужої авіації, але турбіни витрачають багато пального, а корма більшості машин тонка (0–0.5) — без тягача «Шпак» із причепами ескадрилья швидко зупиниться.', 'Strengths and weaknesses: composite roof armour (TopArmor up to 4.5) shields Ravens from mortars and enemy air, but their turbines burn fuel rapidly and rear armour is thin (0–0.5) — without the Starling tow tractor and supply trailers the squadron will stall.'),
        T('Сохранённые армии Воронов пишутся в отдельные файлы (V…army) и не смешиваются со свиными.', 'Збережені армії Воронів пишуться в окремі файли (V…army) і не змішуються зі свинячими.', 'Saved Raven armies use separate V…army files and do not mix with pig armies.'),
      ] },
      ...bal.units.filter(u => u.race === 'raven').flatMap(unitBlocks),
    ] },
  { id: 'au-balance', group: 'arc-units', title: T('Правки старых юнитов', 'Правки старих юнітів', 'Changes to old units'),
    summary: T('Обычные юниты и улучшения — как в игре; изменена только авиация кроликов.', 'Звичайні юніти й покращення — як у грі; змінено лише авіацію кроликів.', 'Stock units and upgrades are as in the game; only rabbit aviation changed.'),
    blocks: [
      { type: 'paragraph', text: T('С версии 4.0.2 все обычные танки, машины и улучшения вернулись к своим характеристикам и ценам из игры (раньше были правки и общая наценка ×1.6). Новые юниты оценены рядом с обычными: обычный танк стоит 400.', 'З версії 4.0.2 усі звичайні танки, машини й покращення повернулися до своїх характеристик і цін з гри (раніше були правки й загальна націнка ×1.6). Нові юніти оцінено поруч зі звичайними: звичайний танк коштує 400.', 'Since 4.0.2 all stock tanks, vehicles and upgrades are back to their in-game stats and prices (before, there were tweaks and a ×1.6 price markup). New units are priced next to the stock ones: a regular tank costs 400.') },
    ...bal.vanilla.flatMap(v => [
      { type: 'heading', text: NAMES[v.section] || T(v.section, v.section, v.section) },
      { type: 'paragraph', text: WHY[v.section] },
      { type: 'facts', facts: v.changes.map(c => ({ value: `${+c.from} → ${c.to}`, label: T(KEY_RU[c.key.toLowerCase()] || c.key, KEY_UK[c.key.toLowerCase()] || c.key, KEY_EN[c.key.toLowerCase()] || c.key) })) },
    ])] },
];

w.groups = w.groups.filter(g => g.id !== 'arc-units');
const helpIdx = w.groups.findIndex(g => g.id === 'help');
w.groups.splice(helpIdx < 0 ? w.groups.length : helpIdx, 0, { id: 'arc-units', mod: 'arcanum-units', title: T('Arcanum Units', 'Arcanum Units', 'Arcanum Units') });
w.pages = w.pages.filter(p => p.group !== 'arc-units');
const firstHelp = w.pages.findIndex(p => p.group === 'help');
w.pages.splice(firstHelp < 0 ? w.pages.length : firstHelp, 0, ...pages);

// «Що нового»: запис 4.2.2 на початок.
const ch = w.pages.find(p => p.id === 'changes');
const KEY422 = 'nexus-4.2.2';
const i422 = ch.blocks.findIndex(b => b.key === KEY422);
if (i422 >= 0) ch.blocks.splice(i422, 2);
ch.blocks.unshift(
  { type: 'heading', key: KEY422, text: T(`Мод 4.2.2 · Корпус Воронов: режим просмотра в магазине (цена 100 000 SP) · ${DATE.ru}`, `Мод 4.2.2 · Корпус Воронів: режим огляду в магазині (ціна 100 000 SP) · ${DATE.uk}`, `Mod 4.2.2 · Raven Air Corps: shop preview-only mode (100,000 SP price) · ${DATE.en}`) },
  { type: 'bullets', items: [
    T('Корпус Воронов переведён в режим витрины (предпросмотра): всем 15 машинам и 3 прицепам Воронов в магазине выставлена цена 100 000 SP. В лобби можно выбрать расу «Ворон», зайти в магазин, рассмотреть 3D-ролики, характеристики и описания каждой машины, но купить их в бой пока нельзя.', 'Корпус Воронів переведено в режим вітрини (попереднього перегляду): усім 15 машинам і 3 причепам Воронів у магазині виставлено ціну 100 000 SP. У лобі можна обрати расу «Ворон», зайти в магазин, роздивитися 3D-ролики, характеристики й описи кожної машини, але купити їх у бій поки не можна.', 'The Raven Air Corps is now in showcase preview-only mode: all 15 vehicles and 3 trailers in the Raven shop are priced at 100,000 SP. Players can select Raven in the lobby, open the shop, and inspect all 3D turntable videos, stats and descriptions, but cannot buy them for matches yet.'),
  ] }
);

const ov = w.pages.find(p => p.id === 'overview');
if (ov) {
  const f0 = ov.blocks.find(b => b.type === 'facts');
  if (f0 && f0.facts && f0.facts[0]) f0.facts[0].value = '4.2.2';
}

// Сторінка механік і песочниці.
const mech = { id: 'au-mechanics', group: 'arc-units', title: T('Механики и песочница', 'Механіки та пісочниця', 'Mechanics and sandbox'),
  summary: T('Что умеют новые юниты сверх обычных параметров и как всё проверить.', 'Що вміють нові юніти понад звичайні параметри і як усе перевірити.', 'What the new units do beyond normal stats, and how to test it all.'),
  blocks: [
    { type: 'heading', text: T('Спецмеханики (патч exe)', 'Спецмеханіки (патч exe)', 'Special mechanics (exe patch)') },
    { type: 'bullets', items: [
T('Свои кнопки спецдействий (новые иконки в панели): «Подрыв» у Бомбохряка — до 60 урона в радиусе 5; «Мины на ходу» у Кротобоя — включил, и он кладёт мину каждые 2.5 клетки пути (не чаще раза в секунду); «Локатор» у Ушастика — уши раскладываются: его сразу видят все на карте, через 5 секунд обзор ×3 сквозь деревья и холмы, сколько угодно; повторное нажатие складывает уши (5 секунд он ещё виден и слеп).', 'Свої кнопки спецдій (нові іконки в панелі): «Підрив» у Бомбокабана — до 60 шкоди в радіусі 5; «Міни на ходу» у Кротобоя — увімкнув, і він кладе міну кожні 2.5 клітинки шляху (не частіше разу на секунду); «Локатор» у Вуханя — вуха розкладаються: його одразу бачать усі на мапі, за 5 секунд огляд ×3 крізь дерева й пагорби, скільки завгодно; повторне натискання складає вуха (5 секунд його ще видно і він сліпий).', 'Own special buttons (new panel icons): Boom Hog’s Detonate — up to 60 damage in a radius of 5; Mole Smasher’s Mines on the Move — switch it on and it drops a mine every 2.5 cells (at most once a second); Big Ears’ Locator — the ears unfold: everyone on the map sees it at once, 5 seconds later triple sight through trees and hills for as long as you like; press again to fold the ears (for 5 seconds it is still visible and blind).'),
      T('Взрыв при гибели (Бомбохряк, Хряк-Гриль, Морковный Смерч): урон по площади всем вокруг, линейно слабеет к краю.', 'Вибух під час загибелі (Бомбокабан, Кабан-Гриль, Морквяний Смерч): шкода по площі всім довкола, лінійно слабшає до краю.', 'Death blasts (Boom Hog, Hog Grill, Carrot Twister): area damage to everyone around, fading linearly to the edge.'),
      T('Грязь (Гряземёт, Хряк-Гриль): попадание по врагу — скорость и поворот ×0.4 на 5 секунд. Снаряд Гряземёта оставляет на земле бурую лужу на 10 секунд: каждый чужой юнит в радиусе 2.5 от неё ползёт так же. Своих и союзников грязь не тормозит.', 'Багно (Гряземіт, Кабан-Гриль): влучання по ворогу — швидкість і поворот ×0.4 на 5 секунд. Снаряд Гряземета лишає на землі буру калюжу на 10 секунд: кожен чужий юніт у радіусі 2.5 від неї повзе так само. Своїх і союзників багно не гальмує.', 'Mud (Mud Slinger, Hog Grill): a hit on an enemy cuts speed and turning to 0.4× for 5 seconds. A Mud Slinger shell leaves a brown puddle for 10 seconds: every enemy unit within 2.5 of it crawls the same way. Mud never slows you or your allies.'),
      T('Наведение корпусом (Осадный Кабан): орудие смотрит строго вперёд, на цель доворачивается машина.', 'Наведення корпусом (Облоговий Вепр): гармата дивиться строго вперед, на ціль доводиться машина.', 'Hull aiming (Siege Boar): the gun points straight ahead; the vehicle turns onto the target.'),
      T('Залп (Морковный Смерч): в режиме залпа — 20 ракет за 2 секунды, а если осталось меньше — все оставшиеся.', 'Залп (Морквяний Смерч): у режимі залпу — 20 ракет за 2 секунди, а якщо лишилося менше — усі, що лишилися.', 'Salvo (Carrot Twister): 20 rockets in 2 seconds in salvo mode, or all that remain if fewer.'),
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

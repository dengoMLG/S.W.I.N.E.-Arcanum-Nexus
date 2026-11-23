# S.W.I.N.E. HD — моды Arcanum

Моды для онлайн-игры с друзьями, раздаются через лаунчер Arcanum (`A:\Arcanum\Launcher\Arcanum-Launcher`, страница S.W.I.N.E.).

## Обязательное правило: всё записывать в вики

Любое изменение, добавление или нововведение (новый мод, правка баланса, новая версия пака, новая функция лаунчера для S.W.I.N.E., найденное ограничение) **записывается в вики мод-пака** в том же изменении:

- исходник вики: `modpack/wiki/wiki.src.json` (страницы, тексты uk/ru/en);
- страница «Что нового» получает запись с версией пака и датой;
- у нового мода есть своя группа страниц (обзор + что меняет), таблицы юнитов генерируются скриптом, а не пишутся руками;
- после правки: `node tools/build-wiki.js --no-launcher` → `modpack/out/wiki.json`, файл заливается на сервер (`/srv/arcanum/dist/launcher/games/swine/wiki.json`, отдаётся без кеша через API `https://arcanum-nexus.com/api/launcher/swine/wiki` и `/launcher/games/swine/wiki.json`). Лаунчер (с `0.7.23.10`) подтягивает правки сразу с сервера — обновлять лаунчер ради вики не нужно; встроенная копия `Assets/swine_wiki.json` служит лишь офлайн-запасом.

В вики пишем только то, что подтверждено файлами мода или игры. Если в описании мода заявлено что-то, чего в файлах нет, так и пишем.

## Обязательное правило: версия мода

Весь пак — **один мод Arcanum Nexus Mod** (`arcanum-nexus`): юниты и патч exe (`modpack/mods/arcanum-units`) + экранчики, озвучка и меню (`modpack/mods/arcanum-voices`), склеиваются в один zip (`"sources"` в `modpack/pack.json`).

- Версия одна — `"version"` в `modpack/pack.json` (пак = мод), сейчас вида `4.0.N`. **Любое изменение мода → новая версия** (мелкое — последнее число, крупное — среднее).
- Версия видна в главном меню игры («Arcanum Nexus Mod vX» под версией игры — `menuver` в `tools/re/patchgen/Caves.cs`; `patchgen` берёт её из `pack.json`) и в лаунчере в списке модов. Поэтому после смены версии exe пересобирается всегда.
- `tools/build-modpack.js` не даст ошибиться: zip изменился, а версия та же (`modpack/version-lock.json`) — стоп; версия в `exe_patch.json` не равна версии пака — стоп.
- Новая версия записывается в «Что нового» вики.
- `--sync-launcher` (и коммит лаунчера) — только для версии, которая выложена на CDN: вшитый в лаунчер пак должен скачиваться. Промежуточные версии (как 4.0.3) собираются без него.

## Карта проекта

- `docs/MODDING_RECON.md` — что можно моддить, формат .pak, сеть.
- `docs/EXE_PATCH_14_UNITS.md` — патч exe: новые классы юнитов и взрыв камикадзе (`tools/re/patchgen`).
- `docs/ARC_UNITS.md` — механика боя из exe, новые юниты и баланс; данные — `tools/arc-units.js`, вики — `tools/wiki-arc-units.js`.
- `docs/MODEL_RULES.md` — правила для 3D-моделей; проверка: `tools/swine-4d-orient.js` (вывернутые грани), `tools/swine-view.js` (рендер как в игре), `tools/swine-dxt.js` (текстуры).
- `tools/make-test-tank.js` — временная модель, иконки и ролики магазина; `tools/swine-anif.js` — формат роликов .anif.
- Сборка Arcanum Units:
  1. `tools/arc-units.js` — `units.ini` и тексты;
  2. `tools/make-arc-assets.js` — эффекты, звук, атлас кнопок, маски кампании;
  3. `tools/make-mp-maps.js` — сетевые карты из кампании;
  4. `tools/re/bin-patchgen/patchgen.exe` — патч exe;
  5. `tools/build-arcunits-mod.js` — `modpack/mods/arcanum-units`. Сначала сам запускает `tools/check-arc-refs.js`: каждый файл, на который ссылаются наши `units.ini` и `effects.ini` (модели, иконки, звуки, текстуры эффектов, включая копии по тайлсетам), должен быть в моде или в `base.pak`, иначе сборка останавливается.
  `tools/install-arcunits.js` ставит мод в **тестовую копию игры** `mods-test/game` для проверки, `--uninstall` возвращает оригинал.
- **Тестовая копия игры — `mods-test/game`** (`tools/make-test-game.ps1` создаёт/обновляет её из папки Steam). Туда ставят `install-arcunits.js` / `install-voices.js`, оттуда запускают `mp-run`, `mp-test`, `menu-shot`. В папку Steam тестовые сборки **не ставить**: её обновляет лаунчер, а он отказывается патчить не-оригинальный `swineHD.exe` (так 23.11.2026 у пользователя сломалось обновление до 4.0.2). Скрипты установки сами откажутся писать в `steamapps` без `--steam`.
- **Третья раса — Вороны** (#3, раса 2): данные `tools/raven-race.js` (подключён из `arc-units.js`, ряд классов `"raven"` в `classes.json`), правки exe — `docs/EXE_PATCH_14_UNITS.md` §«Третья раса». Модели Корпуса Воронов `tools/models/v_*.js` делает внешний инструмент; пока все машины на модели «Чародей» (`v_charodey`). Следующая раса — Мыши.
- Сборка Arcanum Voices & Screens:
  - `modpack/voices/` — исходники 70 экранчиков `.anif`, 300 русских реплик `.mp3` (`voice_scripts.json`) и 26 прозрачных портретов угла меню (`menu/faces/*.png`);
  - `tools/build-menu-scene.js` — фон главного меню в свинском городе Штадт (`missions/menu_background.scene`, 10 моделей танков в `objects/arcanum_menu/` в `ver=0 DXT1`, секция камеры `cameras.ini`);
  - `tools/build-voices-mod.js` — собирает `modpack/mods/arcanum-voices` (`units.ini.arcpatch`, `cameras.ini.arcpatch`, `reportanim/`, `sounds/speech/`, `menu/faces/`, `missions/menu_background.scene`, `objects/arcanum_menu/`);
  - `tools/install-voices.js` — ставит портреты, озвучку и меню в игру поверх `Arcanum Units` (`--uninstall` откатывает).
- Проверка сети на одном ПК: `tools/mp-run.ps1 -Count N -Wait S [-Races "2,1"]` (N копий, автостарт матча, раса каждой копии), затем `tools/mp-check.ps1 -Count N` (места, кадры, совпадение сумм мира); интерактивно — `tools/mp-test.ps1`.
- Полная сборка после изменения: поднять версию в `modpack/pack.json` → шаги 1–5 Arcanum Units (`patchgen` из корня репо, результат `swineHD.patched.exe` скопировать в `mods-test/arcunits/swineHD.exe`) → `tools/build-voices-mod.js` → `tools/build-modpack.js --sync-launcher` → `tools/build-wiki.js`. `tools/menu-shot.ps1` — снимок главного меню (проверить строку версии).
- `tools/swine-pak.js` — распаковщик .pak; `tools/build-modpack.js [--sync-launcher]` — сборка пака (и синхронизация `SwineModpack.BuiltIn()` в лаунчере); `tools/build-wiki.js` — сборка вики.
- `modpack/` — исходники пака (`pack.json`, `mods/`, `wiki/`); `modpack/out/` — то, что выкладывается на CDN.
- `_extracted/` — распакованные файлы игры, только локально, не распространять.

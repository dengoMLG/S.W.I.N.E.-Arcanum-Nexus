# S.W.I.N.E. HD — моды Arcanum

Моды для онлайн-игры с друзьями, раздаются через лаунчер Arcanum (`A:\Arcanum\Launcher\Arcanum-Launcher`, страница S.W.I.N.E.).

## Обязательное правило: всё записывать в вики

Любое изменение, добавление или нововведение (новый мод, правка баланса, новая версия пака, новая функция лаунчера для S.W.I.N.E., найденное ограничение) **записывается в вики мод-пака** в том же изменении:

- исходник вики: `modpack/wiki/wiki.src.json` (страницы, тексты uk/ru/en);
- страница «Что нового» получает запись с версией пака и датой;
- у нового мода есть своя группа страниц (обзор + что меняет), таблицы юнитов генерируются скриптом, а не пишутся руками;
- после правки: `node tools/build-wiki.js` → `modpack/out/wiki.json`, копия уходит в лаунчер (`Assets/swine_wiki.json`) и на CDN (`/launcher/games/swine/wiki.json`).

В вики пишем только то, что подтверждено файлами мода или игры. Если в описании мода заявлено что-то, чего в файлах нет, так и пишем.

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
  5. `tools/build-arcunits-mod.js` — `modpack/mods/arcanum-units`.
  `tools/install-arcunits.js` ставит мод в игру для проверки, `--uninstall` возвращает оригинал.
- `tools/swine-pak.js` — распаковщик .pak; `tools/build-modpack.js` — сборка пака; `tools/build-wiki.js` — сборка вики.
- `modpack/` — исходники пака (`pack.json`, `mods/`, `wiki/`); `modpack/out/` — то, что выкладывается на CDN.
- `_extracted/` — распакованные файлы игры, только локально, не распространять.

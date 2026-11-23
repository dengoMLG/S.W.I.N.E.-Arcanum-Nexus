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
  5. `tools/build-arcunits-mod.js` — `modpack/mods/arcanum-units`. Сначала сам запускает `tools/check-arc-refs.js`: каждый файл, на который ссылаются наши `units.ini` и `effects.ini` (модели, иконки, звуки, текстуры эффектов, включая копии по тайлсетам), должен быть в моде или в `base.pak`, иначе сборка останавливается.
  `tools/install-arcunits.js` ставит мод в игру для проверки, `--uninstall` возвращает оригинал.
- Сборка Arcanum Voices & Screens:
  - `modpack/voices/` — исходники 70 экранчиков `.anif`, 300 русских реплик `.mp3` (`voice_scripts.json`) и 26 прозрачных портретов угла меню (`menu/faces/*.png`);
  - `tools/build-menu-scene.js` — фон главного меню в свинском городе Штадт (`missions/menu_background.scene`, 10 моделей танков в `objects/arcanum_menu/` в `ver=0 DXT1`, секция камеры `cameras.ini`);
  - `tools/build-voices-mod.js` — собирает `modpack/mods/arcanum-voices` (`units.ini.arcpatch`, `cameras.ini.arcpatch`, `reportanim/`, `sounds/speech/`, `menu/faces/`, `missions/menu_background.scene`, `objects/arcanum_menu/`);
  - `tools/install-voices.js` — ставит портреты, озвучку и меню в игру поверх `Arcanum Units` (`--uninstall` откатывает).
- Проверка сети на одном ПК: `tools/mp-run.ps1 -Count N -Wait S` (N копий, автостарт матча), затем `tools/mp-check.ps1 -Count N` (места, кадры, совпадение сумм мира); интерактивно — `tools/mp-test.ps1`.
- `tools/swine-pak.js` — распаковщик .pak; `tools/build-modpack.js [--sync-launcher]` — сборка пака (и синхронизация `SwineModpack.BuiltIn()` в лаунчере); `tools/build-wiki.js` — сборка вики.
- `modpack/` — исходники пака (`pack.json`, `mods/`, `wiki/`); `modpack/out/` — то, что выкладывается на CDN.
- `_extracted/` — распакованные файлы игры, только локально, не распространять.

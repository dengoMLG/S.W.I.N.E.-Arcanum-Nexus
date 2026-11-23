# S.W.I.N.E. HD — Arcanum Nexus mods

Моды для **S.W.I.N.E. HD Remaster** (v1.7.1846) для сетевой игры с друзьями. Раздаются и обновляются автоматически через лаунчер Arcanum (`Arcanum-Launcher`, страница S.W.I.N.E.).

## Состав мод-пака (`arcanum-swine` v3)

1. **`Arcanum Units` (`arcanum-units` v2)** — 10 новых боевых машин (5 Свинов + 5 Кроликов), 3D-модели, иконки и ролики магазина, эффекты, сетевые карты, перебалансировка цен, патч `swineHD.exe` (новые классы, механики и совместное командование).
2. **`Arcanum Voices & Screens` (`arcanum-voices` v1)** — полная локализация экипажей новых танков и обновлённое главное меню:
   - **70 анимированных экранчиков HUD** (`.anif`, `120×90 @ 25 FPS`, 7 эмоций × 10 персонажей: `3mp`, `5mp`, `success`, `laugh`, `spec`, `death`, `death2` с ТВ-помехами при обрыве связи).
   - **300 уникальных русских реплик** (2 620 файлов `.mp3`, `22050 Hz mono 48 kbps`, 9 игровых категорий от `selected` до `death` на каждого из 10 персонажей).
   - **Главное меню в свинском городе Штадт** (`missions/menu_background.scene` + `cameras.ini.arcpatch`): 3D-площадь с флагами, вывеской «Welcome to Stahlstadt» и всеми 10 новыми танками с пред-окрашенными `ver=0 DXT1` текстурами (`objects/arcanum_menu/`).
   - **Наши свины и кролики в углу меню**: 26 прозрачных `512×512` RGBA-портретов (`menu/faces/pig_face_01..12.png`, `rabbit_face_01..14.png`).

## Структура репозитория

- `docs/` — разбор игры, патча exe, механик и правил моделей.
- `tools/` — сборка `Arcanum Units`, `Arcanum Voices & Screens` (`build-voices-mod.js`, `build-menu-scene.js`, `install-voices.js`), сборка мод-пака (`build-modpack.js`) и вики (`build-wiki.js`).
- `modpack/` — исходники пака (`pack.json`), ассеты озвучки/экранчиков/портретов (`modpack/voices/`) и вики (`modpack/wiki/wiki.src.json`).

## Сборка для лаунчера Arcanum

```bash
node tools/build-voices-mod.js
node tools/build-modpack.js --sync-launcher
node tools/build-wiki.js
```

После сборки выложите `modpack/out/mods/*.zip`, `modpack/out/modpack.json` и `modpack/out/wiki.json` на CDN (`/launcher/games/swine/`), и лаунчер Arcanum автоматически обнаружит v3 и доустановит `Arcanum Voices & Screens` поверх `Arcanum Units` у всех игроков.

Файлы оригинальной игры в репозиторий не входят: для сборки нужна своя установленная копия игры (см. `CLAUDE.md` и `modpack/README.md`).

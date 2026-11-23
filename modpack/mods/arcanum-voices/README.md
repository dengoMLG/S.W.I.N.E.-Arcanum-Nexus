# Arcanum Voices & Screens

Анимированные экранчики (портреты HUD) и русская озвучка для всех 10 новых танков из **Arcanum Units**.
Собирается скриптом `node tools/build-voices-mod.js` из исходников в `modpack/voices/`, руками `gamedata/` не править.

- `gamedata/base/units.ini.arcpatch` — назначает уникальные `Character` и `Voice` всем 10 новым юнитам поверх `arcanum-units`.
- `gamedata/base/reportanim/<CharId>/*.anif` — 70 экранчиков (10.0 МБ, 120×90 @ 25 FPS, полный набор из 7 эмоций: `3mp`, `5mp`, `success`, `laugh`, `spec`, `death`, `death2`, с ТВ-шумом при гибели).
- `gamedata/base/sounds/speech/<CharId>/*.mp3` — 300 уникальных реплик (Qwen3-TTS, 22050 Hz mono 48 kbps), разложенных по всем 2620 игровым ID событий (67.3 МБ), включая раненые варианты `*w.mp3`.

Префиксы `Character` (`P04`–`P08` у свиней, `R02`/`R03`/`R05`/`R06`/`R12` у кроликов) подобраны по разбору `SGameWorld::ShowEventMsg`, чтобы движок проигрывал все 7 анимаций без патча exe.

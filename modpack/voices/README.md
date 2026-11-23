# Исходники мода Arcanum Voices & Screens

100% оригинальные ассеты (анимированные портреты HUD и русская озвучка) для 10 новых танков из `Arcanum Units`.
Из этой папки скрипт `node tools/build-voices-mod.js` собирает игровой мод в `modpack/mods/arcanum-voices/`.

## Содержимое

- `reportanim/<CharId>/*.anif` — **70 файлов** (7 эмоций × 10 юнитов, формат `ANI2`, `120×90`, `25 FPS`, Wan 2.2 + программный ТВ-шум для `death`/`death2`).
- `lines/<CharId>/<category>/*.mp3` — **300 уникальных русских реплик** (30 реплик в 9 категориях × 10 юнитов, `Qwen3-TTS`, `22050 Hz`, `mono`, `48 kbps`).
- `voice_scripts.json` — сценарии всех 300 реплик, описания тембров и привязка секций `units.ini` к игровым ID `Character`/`Voice`.

## Таблица ID персонажей (`Character` / `Voice`)

| Секция `units.ini` | Юнит | Персонаж | `Character` / `Voice` |
| :--- | :--- | :--- | :--- |
| `Diszno grill kamikaze slow` | Хряк-Гриль | Капрал Шкварка | `P07-hryakgrill` |
| `Diszno cartank` | Свин-Царь | Фельдмаршал Боров-Великолепный | `P06-svinczar` |
| `Diszno kamikaze` | Бомбохряк | Рядовой Детонатор | `P05-bombohryak` |
| `Diszno ostromkoca hullaim` | Осадный Кабан | Бомбардир Громила | `P08-osadnykaban` |
| `Diszno sarszoro slow` | Гряземёт | Механик Шмяк | `P04-gryazemet` |
| `Nyul szellem` | Заяц-Призрак | Снайпер Вектор | `R06-zayacprizrak` |
| `Nyul repavihar kamikaze salvo` | Морковный Смерч | Стрелок Вспышка | `R03-morkovsmerch` |
| `Nyul vakond minelay` | Кротобой | Сапёр Кусачка | `R12-krotoboy` |
| `Nyul boxkiallas` | Пит-Стоп | Механик Гайка | `R02-pitstop` |
| `Nyul fulesek` | Кролик-Ушастик | Радист Локатор | `R05-ushastik` |

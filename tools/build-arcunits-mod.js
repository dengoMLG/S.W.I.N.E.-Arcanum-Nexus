#!/usr/bin/env node
// Збирає мод Arcanum Units для мод-паку: modpack/mods/arcanum-units/ із зібраного mods-test/arcunits.
//   node tools/build-arcunits-mod.js
// Порядок повної збірки:
//   node tools/arc-units.js mods-test/arcunits        — units.ini, units_text, classes.json
//   node tools/make-arc-assets.js mods-test/arcunits   — ефекти, звук, атлас кнопок, маски магазину кампанії
//   tools/re/bin-patchgen/patchgen.exe <оригінальний swineHD.exe> mods-test/arcunits --classes mods-test/arcunits/classes.json
//   node tools/build-arcunits-mod.js                   — цей скрипт
//   node tools/build-modpack.js                        — zip і modpack.json для CDN
// У мод іде gamedata/** (крім тимчасової моделі d_arctank/ny_arctank — юніта «Чародій» більше нема) і
// exe_patch.json — лаунчер сам застосовує його до swineHD.exe гравця (з бекапом і перевіркою sha).
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), SRC = path.join(ROOT, 'mods-test/arcunits'), DST = path.join(ROOT, 'modpack/mods/arcanum-units');
// Фон меню (сцена, моделі, камера) — частина tools/build-voices-mod.js (там камера як cameras.ini.arcpatch);
// build-menu-scene.js без аргументу пише його в mods-test/arcunits, тож тут пропускаємо, щоб не було двох копій.
const SKIP = /(^|\/)(d|ny)_arctank[^/]*$|^gamedata\/base\/(cameras\.ini|missions\/menu_background\.scene|objects\/arcanum_menu\/.*)$/i;
// Спершу — чи є в моді/грі всі файли, на які посилаються наші ini (інакше — «Fatal error» уже в бою, як 23.11.2026).
require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'check-arc-refs.js'), SRC], { stdio: 'inherit' });

fs.rmSync(DST, { recursive: true, force: true });
let n = 0, bytes = 0;
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name), rel = path.relative(SRC, p).replace(/\\/g, '/');
    if (e.isDirectory()) { walk(p); continue; }
    if (SKIP.test(rel)) continue;
    const o = path.join(DST, rel); fs.mkdirSync(path.dirname(o), { recursive: true }); fs.copyFileSync(p, o); n++; bytes += fs.statSync(p).size;
  }
})(path.join(SRC, 'gamedata'));
const patch = JSON.parse(fs.readFileSync(path.join(SRC, 'exe_patch.json'), 'utf8'));
fs.copyFileSync(path.join(SRC, 'exe_patch.json'), path.join(DST, 'exe_patch.json'));
fs.writeFileSync(path.join(DST, 'README.md'), `# Arcanum Units

Новые юниты (по 5 у свиней и кроликов), их механики и баланс цен. Собирается скриптом \`tools/build-arcunits-mod.js\`, руками не править.

- \`gamedata/**\` — данные игры (units.ini, тексты, модели, иконки, эффекты, звук, атлас кнопок, маски магазина кампании).
- \`exe_patch.json\` — патч \`swineHD.exe\` v1.7.1846 (${patch.edits.length} правок + секция .arcmod). Лаунчер применяет его сам: бэкап оригинала, проверка sha до и после.
`);
console.log(`arcanum-units: ${n} files (${(bytes / 1048576).toFixed(1)} MB) + exe_patch.json (${patch.edits.length} edits, patched sha ${patch.patchedSha256.slice(0, 12)}…) → ${DST}`);

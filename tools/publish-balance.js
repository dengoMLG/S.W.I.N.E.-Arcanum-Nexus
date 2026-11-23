#!/usr/bin/env node
// Быстрая публикация правок баланса / кода S.W.I.N.E. (слой arcanum-nexus, ~170 КБ вместо 498 МБ).
//
// Использование:
//   node tools/publish-balance.js [--channel prod|test] [--rebuild] [--dry-run]
//
// Что делает:
//   1. Если указан --rebuild: прогоняет arc-units.js → patchgen.exe → build-arcunits-mod.js.
//   2. Собирает разделённый мод-пак (build-modpack.js): тяжёлый слой arcanum-assets (~498 МБ)
//      берётся из кеша за ~3 с без пережатия, пересобирается только arcanum-nexus-<ver>.zip (~170 КБ).
//   3. Собирает modpack/out/wiki.json (build-wiki.js --no-launcher).
//   4. Проверяет, какие zip-файлы уже лежат на CDN (arcanum-ai:/srv/arcanum/dist/launcher/games/swine/mods/)
//      с тем же размером, и заливает ТОЛЬКО отсутствующие/новые zip + modpack.json (или modpack-test.json) + wiki.json.
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const rebuild = args.includes('--rebuild');
const chIdx = args.indexOf('--channel');
const channel = (chIdx >= 0 && args[chIdx + 1] ? args[chIdx + 1] : 'prod').toLowerCase();
if (!['prod', 'test'].includes(channel)) {
  console.error('ERROR: --channel must be prod or test');
  process.exit(1);
}

const SSH_HOST = process.env.SWINE_CDN_SSH || 'arcanum-ai';
const REMOTE_DIR = '/srv/arcanum/dist/launcher/games/swine';
const REMOTE_MODS = REMOTE_DIR + '/mods';
const MANIFEST_NAME = channel === 'test' ? 'modpack-test.json' : 'modpack.json';

function run(cmd, cmdArgs, opts = {}) {
  console.log(`> ${cmd} ${cmdArgs.join(' ')}`);
  execFileSync(cmd, cmdArgs, { cwd: ROOT, stdio: 'inherit', ...opts });
}

if (rebuild) {
  const localAppData = process.env.LOCALAPPDATA || '';
  const origExeCandidates = [
    path.join(localAppData, 'Arcanum', 'games', 'swine-hd', 'backup', 'swineHD.exe'),
    path.join(ROOT, '_extracted', 'swineHD.exe'),
  ];
  const origExe = origExeCandidates.find(p => p && fs.existsSync(p));
  if (!origExe) {
    console.error('ERROR: vanilla swineHD.exe not found for --rebuild');
    process.exit(1);
  }
  run('node', ['tools/arc-units.js', 'mods-test/arcunits']);
  run(path.join(ROOT, 'tools/re/bin-patchgen/patchgen.exe'), [
    origExe,
    'mods-test/arcunits',
    '--classes',
    'mods-test/arcunits/classes.json',
  ]);
  fs.copyFileSync(
    path.join(ROOT, 'mods-test/arcunits/swineHD.patched.exe'),
    path.join(ROOT, 'mods-test/arcunits/swineHD.exe')
  );
  run('node', ['tools/build-arcunits-mod.js']);
}

const packArgs = ['tools/build-modpack.js'];
if (channel === 'test') packArgs.push('--test');
run('node', packArgs);
if (channel === 'prod') {
  run('node', ['tools/build-wiki.js', '--no-launcher']);
}

const outDir = path.join(ROOT, 'modpack/out');
const manifestPath = path.join(outDir, MANIFEST_NAME);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

// Проверяем, какие zip-архивы уже есть на сервере с тем же размером — тяжёлый arcanum-assets не гоняем повторно.
let remoteSizes = new Map();
try {
  const lsOut = execFileSync('ssh', [
    SSH_HOST,
    `stat -c '%n %s' ${REMOTE_MODS}/*.zip 2>/dev/null || true`,
  ], { encoding: 'utf8' });
  for (const line of lsOut.split(/\r?\n/)) {
    const m = /^(.+)\s+(\d+)$/.exec(line.trim());
    if (m) remoteSizes.set(path.basename(m[1]), Number(m[2]));
  }
} catch (e) {
  console.warn('WARN: could not query remote zip sizes, will upload all:', e.message);
}

const uploads = [];
for (const mod of manifest.mods) {
  const file = `${mod.id}-${mod.version}.zip`;
  const localZip = path.join(outDir, 'mods', file);
  if (!fs.existsSync(localZip)) {
    console.error('ERROR: missing local zip ' + localZip);
    process.exit(1);
  }
  if (remoteSizes.get(file) === mod.size) {
    console.log(`  skip ${file} (${(mod.size / 1048576).toFixed(2)} MB already on CDN)`);
  } else {
    uploads.push({ local: localZip, remote: `${REMOTE_MODS}/${file}`, label: `${file} (${(mod.size / 1024).toFixed(1)} KB)` });
  }
}
uploads.push({ local: manifestPath, remote: `${REMOTE_DIR}/${MANIFEST_NAME}`, label: MANIFEST_NAME });
if (channel === 'prod') {
  uploads.push({ local: path.join(outDir, 'wiki.json'), remote: `${REMOTE_DIR}/wiki.json`, label: 'wiki.json' });
}

if (dryRun) {
  console.log('DRY RUN — would upload:', uploads.map(u => u.label));
  process.exit(0);
}

for (const u of uploads) {
  const tmp = `/tmp/swine-upload-${path.basename(u.remote)}`;
  run('scp', [u.local, `${SSH_HOST}:${tmp}`]);
  run('ssh', [SSH_HOST, `sudo install -D -o root -g www-data -m 0644 '${tmp}' '${u.remote}' && rm -f '${tmp}'`]);
}

console.log(`PUBLISHED channel=${channel} version=${manifest.version} (${uploads.length} file(s) uploaded)`);

#!/usr/bin/env node
// Генерує tools/re/patchgen/smulti16.json — перенос масивів SMulti «на 8 гравців» у хвіст
// збільшеного об'єкта, щоб у них влізло 16 слотів (docs/EXE_PATCH_14_UNITS.md, «Карта SMulti»).
//   node tools/re/gen-smulti16.js [exe.orig]
//
// Береться кожне звернення [base+disp] у методах SMulti (tools/re/bin/disasm.exe fields) і
// безпосередні add reg,2190h/2194h/216Ch. Поля меню лобі ([this+2160h] → SChatRoomMenu) не чіпаємо.
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const EXE = process.argv[2] || path.join(ROOT, 'mods-test/backup/swineHD.exe.orig');
const DIS = path.join(ROOT, 'tools/re/bin/disasm.exe');
const SYMS = path.join(ROOT, 'docs/swine_symbols.txt');
const CLASS_RX = '^\\?\\?[0-9_A-Z]+SMulti@@|^\\?[A-Za-z_0-9]+@SMulti@@';

// Новий розклад (старий розмір об'єкта 0x28F0).
const L = {
  oldSize: 0x28F0,
  slot: 0x28F0, slotOld: 0x2190, slotSize: 0x70,        // 16 × 70h = 700h
  conn: 0x2FF0, connOld: 0x216C,                          // dword[16]
  mapl: 0x3030, maplOld: 0x2510,                          // dword[16] (індекс слота, база 250Ch + slot·4)
  frames: 0x3078, frameSize: 0x3E4,                       // SFrameHistory[16]; база кратна 12 (індекс кадру ·12)
};
L.newSize = L.frames + 16 * L.frameSize;                  // 0x6EB0

const run = (...a) => execFileSync(DIS, [EXE, SYMS, ...a], { maxBuffer: 1 << 26 }).toString().replace(/\r/g, '');
// Методи IConnectionManagerEventHandler викликаються з vtable без перехідника: ecx = SMulti+4,
// тож [this'+d] — це поле d+4. Класифікуємо за полем, переносимо на ту ж дельту.
// (Звернення через справжній this, lea r,[ecx-4], на межі масивів не потрапляють — перевірено.)
const ICM = new Set(['OnConnectionSuccessful', 'OnConnectionFailed', 'OnPeerConnected', 'OnDisconnected',
  'OnMessage', 'OnFileDownloaded', 'OnFileProgress'].map(n => '?' + n + '@SMulti'));
const edits = [];
const review = [];

for (const line of run('fields', '2100', '2600', CLASS_RX).split('\n')) {
  if (!line.trim()) continue;
  const [vaS, fn, ins, prov] = line.split('\t');
  const m = /\+([0-9A-F]+)h\]/.exec(ins);
  if (!m) continue;
  const d = parseInt(m[1], 16);
  const va = parseInt(vaS, 16);
  const f = fn.replace(/@@.*/, '');
  const fld = d + (ICM.has(f) ? 4 : 0);
  let to = null, why = null;
  if (fld >= L.slotOld && fld < L.slotOld + 8 * L.slotSize) {
    if (/\+2160h\]/.test(prov)) continue;                // поле SChatRoomMenu
    to = d - L.slotOld + L.slot; why = 'slot';
  } else if (fld >= L.connOld && fld < L.connOld + 32) {
    to = d - L.connOld + L.conn; why = 'conn';
  } else if (fld >= L.maplOld && fld < L.maplOld + 32 && fld !== 0x2530) {
    to = d - L.maplOld + L.mapl; why = 'mapload';      // 252Ch (без ICM) — 8-й елемент; 2530h — «мій слот», лишається
  } else continue;
  if (prov !== 'THIS' && !/imul|add|lea|mov|pop|sub|\?/.test(prov)) review.push(line);
  edits.push({ va: '0x' + va.toString(16), kind: 'disp', old: '0x' + d.toString(16), new: '0x' + to.toString(16), why: `${f}: ${why}` });
}

// Безпосередні: add reg,2190h / 2194h (база слота) і add ebx,216Ch (Disconnect).
for (const imm of ['2190', '2194', '216c']) {
  for (const line of run('imm', imm, CLASS_RX).split('\n')) {
    const m = /^([0-9a-f]+)\s+\[([^\]]*)\]\s+(.*)$/.exec(line.trim());
    if (!m || !/^add\s/.test(m[3]) || /\[/.test(m[3])) continue;
    const d = parseInt(imm, 16);
    const to = imm === '216c' ? L.conn : d - L.slotOld + L.slot;
    edits.push({ va: '0x' + m[1], kind: 'imm', old: '0x' + imm, new: '0x' + to.toString(16), why: `${m[2].replace(/@@.*/, '')}: ${imm === '216c' ? 'conn' : 'slot'} (imm)` });
  }
}

// Розмір об'єкта: new у п'яти місцях, scalar deleting dtor і розмотування винятків.
for (const line of run('imm', '28f0').split('\n')) {
  const m = /^([0-9a-f]+)\s+\[([^\]]*)\]\s+push\s+28F0h/.exec(line.trim());
  if (m) edits.push({ va: '0x' + m[1], kind: 'imm', old: '0x28f0', new: '0x' + L.newSize.toString(16), why: `${m[2] || 'unwind'}: sizeof(SMulti)` });
}

// Кільце кадрів lockstep: SFrameHistory[8] по 3E4h з +234h → [16] з L.frames.
// Тут — місця з довгими зміщеннями; 7 місць з коротким «add eax,2Fh» (індекс +47) — вставки в Caves.cs (FrameIdx).
const FR = L.frames;
for (const [va, kind, old, nw, why] of [
  [0x477664, 'imm', 8, 16, '??0SMulti: SFrameHistory ×8 → ×16'],
  [0x47766b, 'disp', 0x234, FR, '??0SMulti: SFrameHistory база'],
  [0x477945, 'imm', 8, 16, '??1SMulti: SFrameHistory ×8 → ×16'],
  [0x47794c, 'disp', 0x234, FR, '??1SMulti: SFrameHistory база'],
  [0x477a5c, 'imm', 8, 16, '??_GSMulti: SFrameHistory ×8 → ×16'],
  [0x477a63, 'disp', 0x234, FR, '??_GSMulti: SFrameHistory база'],
  [0x478fa0, 'disp', 0x23C, FR + 8, 'Disconnect: обхід кадрів (+8 ptr)'],
  [0x47c023, 'disp', 0x230, FR - 4, 'OnMessage (this+4): кадр'],
  [0x47c02c, 'disp', 0x238, FR + 4, 'OnMessage (this+4): кадр +8'],
  [0x47dd94, 'imm', 0x234, FR, 'StartSyncAfterDisconnect: база кадрів'],
  [0x47e02a, 'disp', 0x234, FR, 'UpdateConnectivity: база кадрів'],
]) edits.push({ va: '0x' + va.toString(16), kind, old: '0x' + old.toString(16), new: '0x' + nw.toString(16), why: why.split(': ')[0] + ': frames ' + why.split(': ')[1] });

edits.sort((a, b) => parseInt(a.va) - parseInt(b.va));
const seen = new Set();
const out = edits.filter(e => !seen.has(e.va) && seen.add(e.va));
fs.writeFileSync(path.join(ROOT, 'tools/re/patchgen/smulti16.json'),
  JSON.stringify({ layout: Object.fromEntries(Object.entries(L).map(([k, v]) => [k, '0x' + v.toString(16)])), edits: out }, null, 1) + '\n');
const by = out.reduce((a, e) => (a[e.why.split(': ')[1]] = (a[e.why.split(': ')[1]] || 0) + 1, a), {});
console.log(`smulti16: ${out.length} edits`, by);
if (review.length) { console.log('review:'); review.forEach(r => console.log('  ' + r)); }

// patchgen — будує патч swineHD.exe (S.W.I.N.E. HD Remaster v1.7.1846), що додає K нових класів юнітів
// кожній расі (13 → 13+K). Усі правки перевіряються декодером Iced: якщо байти не ті, що очікуються,
// патч не будується.
//
//   patchgen <swineHD.exe> <out-dir> [--classes classes.json]
//   classes.json: { "rabbit": ["Nyul arctank", ...], "pig": ["Diszno arctank", ...] } — однакова кількість.
//
// Пише: <out>/swineHD.patched.exe, <out>/exe_patch.json (для лаунчера: зсуви/старі/нові байти + нова секція).
//
// Що змінюється (адреси — з docs/swine_symbols.txt, розбір — docs/EXE_PATCH_14_UNITS.md):
//  * нова секція .arcmod: UnitClassesN[2][N][64] + маска "JSTAHRMLtafsM" + "X"×K + вставка коду;
//  * усі посилання на UnitClasses (індексація класів) → нова таблиця, крок рядка 13 → 14 (imul 0Dh → 0Eh,
//    IsValidUnit: 340h → 380h);
//  * цикли по класах там, де новий клас має бути видно (магазин, IsValidUnit, GetClassIndex): 13 → 14;
//  * SMarket: масив іконок класів (+26D0h, 13×12 Б) і список доступних класів (+5AECh, 13×4 Б) переносяться
//    в кінець об'єкта; розмір new SMarket 6020h → 6108h;
//  * маска магазину в мережевій грі "JSTAHRMLtafsM" → N літер;
//  * SUnit::Explode: вибух з уроном по площі був лише в мін ("Akna"). Тепер так само вибухають юніти,
//    у чиєму імені секції є "kamikaze": урон = ExtraArmor (якщо > 0, інакше Damage), радіус = ShotSpread.
//    ExtraArmor читають лише спецздібності 0 (окопатися) і 2 (мортира), ShotSpread — лише снаряди (ShotType 2+),
//    тож у камікадзе без них ці ключі вільні.
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Iced.Intel;

const string OriginalSha = "ea0154eca35597bf7d1c10cb2cae2f1cfe07e3f468c3a4b757094ed06fe10097";
const uint OldTable = 0x554320;
const uint OldMaskStr = 0; // знаходимо за вмістом

var exePath = args[0]; var outDir = args[1];
string[][] classes = { new[] { "Nyul arctank" }, new[] { "Diszno arctank" } };
var ci = Array.IndexOf(args, "--classes");
if (ci > 0)
{
    using var cj = JsonDocument.Parse(File.ReadAllText(args[ci + 1]));
    classes = new[] { "rabbit", "pig" }.Select(r => cj.RootElement.GetProperty(r).EnumerateArray().Select(e => e.GetString()!).ToArray()).ToArray();
}
int K = classes[0].Length, N = 13 + K;
if (K < 1 || classes[1].Length != K) throw new Exception("rabbit and pig need the same number of new classes");
if (N > 32) throw new Exception("too many classes");

var exe = File.ReadAllBytes(exePath);
var sha = Convert.ToHexString(SHA256.HashData(exe)).ToLowerInvariant();
if (sha != OriginalSha) { Console.Error.WriteLine($"unexpected swineHD.exe sha256 {sha} (need v1.7.1846 {OriginalSha})"); return 2; }

int pe = BitConverter.ToInt32(exe, 0x3c); int nsec = BitConverter.ToUInt16(exe, pe + 6); int optSz = BitConverter.ToUInt16(exe, pe + 20);
int opt = pe + 24; uint imageBase = BitConverter.ToUInt32(exe, opt + 28);
uint secAlign = BitConverter.ToUInt32(exe, opt + 32), fileAlign = BitConverter.ToUInt32(exe, opt + 36);
int shdr = opt + optSz;
var secs = Enumerable.Range(0, nsec).Select(i => { int s = shdr + i * 40; return (va: BitConverter.ToUInt32(exe, s + 12) + imageBase, vs: BitConverter.ToUInt32(exe, s + 8), raw: BitConverter.ToUInt32(exe, s + 20), rs: BitConverter.ToUInt32(exe, s + 16)); }).ToList();
int Off(uint va) { foreach (var s in secs) if (va >= s.va && va < s.va + Math.Max(s.vs, s.rs)) return (int)(s.raw + (va - s.va)); throw new Exception($"va {va:x} not mapped"); }

// ── нова секція ──
var last = secs[^1];
uint newRva = Align(last.va - imageBase + Math.Max(last.vs, last.rs), secAlign);
uint newVa = imageBase + newRva;
uint newRaw = Align((uint)exe.Length, fileAlign);
var sec = new byte[0x2000];
uint tableVa = newVa;                       // [2][N][64]
for (int race = 0; race < 2; race++)
{
    for (int i = 0; i < 13; i++) Array.Copy(exe, Off(OldTable) + (race * 13 + i) * 64, sec, (race * N + i) * 64, 64);
    for (int k = 0; k < K; k++)
    {
        var nm = Encoding.ASCII.GetBytes(classes[race][k]); if (nm.Length > 63) throw new Exception("name too long");
        Array.Copy(nm, 0, sec, (race * N + 13 + k) * 64, nm.Length);
    }
}
uint maskVa = newVa + (uint)(2 * N * 64);
var mask = Encoding.ASCII.GetBytes("JSTAHRMLtafsM" + new string('X', K) + "\0"); Array.Copy(mask, 0, sec, maskVa - newVa, mask.Length);
// Рядки й константи для вставок (Caves.cs) — одразу після маски.
uint dataPtr = Align(maskVa + (uint)mask.Length, 16);
var strings = new Dictionary<string, uint>(); var consts = new Dictionary<string, uint>();
uint Str(string v) { if (strings.TryGetValue(v, out var a)) return a; var b = Encoding.ASCII.GetBytes(v + "\0"); b.CopyTo(sec, dataPtr - newVa); strings[v] = dataPtr; dataPtr += (uint)b.Length; return dataPtr - (uint)b.Length; }
void Const(string name, params uint[] words) { dataPtr = Align(dataPtr, 16); consts[name] = dataPtr; foreach (var w in words) { BitConverter.GetBytes(w).CopyTo(sec, dataPtr - newVa); dataPtr += 4; } }
uint F(float v) => BitConverter.SingleToUInt32Bits(v);
foreach (var v in new[] { "kamikaze", "slow", "hullaim", "salvo", "Akna", Caves.MudEffect }) Str(v);
Const("pi", F(MathF.PI)); Const("-pi", F(-MathF.PI)); Const("2pi", F(2 * MathF.PI));
Const("absmask", 0x7fffffff, 0x7fffffff, 0x7fffffff, 0x7fffffff); Const("signmask", 0x80000000, 0x80000000, 0x80000000, 0x80000000);
Const("slow", F(Caves.SlowFactor)); Const("radarmul", F(Caves.RadarMul)); Const("zoner2", F(Caves.ZoneRadius * Caves.ZoneRadius));
var gl = Caves.GlyphTable.Concat(new byte[(4 - Caves.GlyphTable.Length % 4) % 4]).ToArray();
Const("glyphs", Enumerable.Range(0, gl.Length / 4).Select(i => BitConverter.ToUInt32(gl, i * 4)).ToArray()); Const("minedist2", F(Caves.MineDist * Caves.MineDist)); Const("big", F(3.0e38f));
Const("startnames", Enumerable.Range(1, 8).Select(i => Str($"start {i}")).ToArray());
uint caveVa = Align(dataPtr, 16);
const uint SecRaw = 0x2000, LateStr = 0x1C00;                       // код і дані — у файлі; код до 0x1C00, далі — рядки журналу з вставок
uint stateVa = newVa + SecRaw;                                       // таблиця стану юнітів — лише в пам'яті
uint secVirtual = SecRaw + (uint)(Caves.TableEntries * Caves.EntrySize) + 0x1000;   // + дані розстановки стартів
uint oldMaskVa = FindString("JSTAHRMLtafsM\0");

// ── правки інструкцій ──
var patches = new List<(uint va, string why, Func<Instruction, (string kind, uint oldV, uint newV)> pick)>();
void Imm(uint va, uint oldV, uint newV, string why) => patches.Add((va, why, _ => ("imm", oldV, newV)));
void Disp(uint va, uint oldV, uint newV, string why) => patches.Add((va, why, _ => ("disp", oldV, newV)));

// посилання на таблицю класів (крім циклів по UpgradeClasses, де UnitClasses — лише кінець сусідньої таблиці)
foreach (var va in new uint[] { 0x4cdb02, 0x4ee9e9, 0x4eea25, 0x4eea5d, 0x4eec09, 0x4eec85, 0x4eecb2,
                                 0x4f42bf, 0x4f4315, 0x4f436a, 0x4f4bbf, 0x4f530f, 0x4f7bde, 0x4f879e, 0x4f91e6, 0x4f9498 })
    Imm(va, OldTable, tableVa, "UnitClasses → UnitClasses14");
Disp(0x4eeaca, OldTable, tableVa, "UnitClasses → UnitClasses14 (lea)");
// крок рядка: раса × 13 → раса × 14
foreach (var va in new uint[] { 0x4ee9d1, 0x4eea0d, 0x4eea45, 0x4eeab2, 0x4eebf1, 0x4eec6b, 0x4eec9a,
                                 0x4f42ad, 0x4f4303, 0x4f4358, 0x4f4bad, 0x4f5307, 0x4f7bc9, 0x4f8789, 0x4f91c2, 0x4f9490 })
    Imm(va, 13, (uint)N, $"row stride 13 → {N}");
Imm(0x4cdaf8, 0x340, (uint)N * 64, $"IsValidUnit row stride 13*64 → {N}*64");
// цикли, що мають бачити нові класи
Imm(0x4cdb1b, 13, (uint)N, "IsValidUnit loop");
Imm(0x4f43a5, 13, (uint)N, "SMarket::Create icon loop");
Imm(0x4f47ef, 13, (uint)N, "SMarket::Create mask loop");
Imm(0x4f5324, 13, (uint)N, "SMarket::GetClassIndex loop");
Imm(0x4f9480, 13, (uint)N, "SMarket::ShowMyUnits loop");
Imm(0x4f33f6, 13, (uint)N, "SMarket::~SMarket icon release loop");
// SMarket: іконки класів +26D0h → +6024h (індекс у кроках по 12 Б: 33Ch → 803h), список класів +5AECh → хвіст
uint IconBase = 0x6024, MaskList = IconBase + (uint)N * 12, NewSize = MaskList + (uint)N * 4 + 4;
Disp(0x4f4291, 0x26D4, IconBase + 4, "SMarket::Create icons → object tail");
Disp(0x4f33f0, 0x26D4, IconBase + 4, "SMarket::~SMarket icons → object tail");
Imm(0x4f94b5, 0x33C, IconBase / 12, "ShowMyUnits icon index base");
Imm(0x4f95ad, 0x33C, IconBase / 12, "ShowNewUnits icon index base");
foreach (var va in new uint[] { 0x4f47e1, 0x4f7bd2, 0x4f91bb, 0x4f95a4 }) Disp(va, 0x5AEC, MaskList, "SMarket available-class list → object tail");
Imm(0x4fcb48, 0x6020, NewSize, "new SMarket size");
Imm(0x4f3721, 0x6020, NewSize, "delete SMarket size");
// маска магазину в мережевій грі
Imm(0x49b690, oldMaskVa, maskVa, $"multiplayer market mask ({N} letters)");
// атлас кнопок спецздібностей: клітинок 48 → таблиця Caves.GlyphTable (з іконками типів 12–14)
Imm(0x4e0197, 0x30, (uint)Caves.GlyphTable.Length, "panel_spec.png glyph cells");

// SQuickMarket («Штаб» — купівля під час бою): 12 кнопок (+504h, по 198h), список класів кнопок (+28B4h, 12 × 4),
// іконки класів (+2844h, 13 × 4) — усе впритул до сусідніх полів. Переносимо в хвіст об'єкта (0x3BA0 → більше):
// QB кнопок, QB класів у списку, N іконок. Сітка 6×2 → 9×2. Клас 12 (MovingForce) у список не потрапляє, як і раніше.
const int QB = 18;
uint QmOld = 0x3BA0, QmBtn = QmOld, QmList = QmBtn + QB * 0x198, QmIcons = QmList + QB * 4, QmSize = QmIcons + (uint)N * 4;
foreach (var va in new uint[] { 0x4f32d6, 0x4f36c4, 0x4f3894, 0x4f4ed1 }) Disp(va, 0x504, QmBtn, "SQuickMarket buttons → object tail");
Disp(0x4f872a, 0x690, QmBtn + 0x18C, "SQuickMarket buttons → object tail");
Disp(0x4f875a, 0x698, QmBtn + 0x194, "SQuickMarket buttons → object tail");
Disp(0x4f5244, 0x694, QmBtn + 0x190, "SQuickMarket buttons → object tail");
foreach (var va in new uint[] { 0x4f5223, 0x4f878c }) Disp(va, 0x28B4, QmList, "SQuickMarket button→class list → object tail");
foreach (var va in new uint[] { 0x4f35de, 0x4f37b5, 0x4f4b83 }) Disp(va, 0x2844, QmIcons, "SQuickMarket class icons → object tail");
foreach (var va in new uint[] { 0x4f32cf, 0x4f36bd, 0x4f388d }) Imm(va, 12, QB, $"SQuickMarket buttons ctor/dtor 12 → {QB}");
foreach (var va in new uint[] { 0x4f35e4, 0x4f37bb }) Imm(va, 13, (uint)N, $"SQuickMarket icon release loop 13 → {N}");
Imm(0x4f4bf9, 13, (uint)N, $"SQuickMarket icon load loop 13 → {N}");
Imm(0x4f4f98, 12, QB, $"SQuickMarket button create loop 12 → {QB}");
Imm(0x4f525c, 12, (uint)N, $"SQuickMarket class list loop 12 → {N} (клас 12 пропускає вставка)");
Imm(0x4e2276, QmOld, QmSize, "new SQuickMarket size");
foreach (var va in new uint[] { 0x4f38c3, 0x541630 }) Imm(va, QmOld, QmSize, "delete SQuickMarket size");
Imm(0x4f4edf, 0xAAAAAAAB, 0x38E38E39, "SQuickMarket grid: i / 6 → i / 9 (magic)");
Imm(0x4f4ee8, 2, 1, "SQuickMarket grid: i / 9 (shift)");
var raws = new List<(uint va, string oldHex, string newHex, string why)> {
    (0x4f4efe, "8D0452", "8D04D2", "SQuickMarket grid: row·6 → row·9 (lea [edx+edx*8])"),
    (0x4f4f07, "03C0", "6690", "SQuickMarket grid: row·9 без подвоєння"),
    (0x4ffae0, "FFD68B00FF", "E9C9FBFFFF", "SSuperWindow::Play: незнайомий ключ командного рядка — пропустити замість Panic (+autostart N)"),
};
Imm(0x4f4f23, 0xFFFFFF36, unchecked((uint)-298), "SQuickMarket grid: центрування 9 стовпців");

// Мережа: кожна копія гри бере перший вільний UDP-порт з 60500; оригінал пробує лише 4,
// тож на одному ПК більше 4 копій не запускалось (локальна перевірка, tools/mp-test.ps1).
Imm(0x474404, 4, 20, "ConnectionManager::CreatePeer: спроб порту 4 → 20");
Imm(0x473f53, 4, 20, "ConnectionManager::ConnectionManager (вбудований CreatePeer): спроб порту 4 → 20");

// SMulti: масиви «на 8 гравців» (слоти 70h, з'єднання, завантаження карти) → хвіст об'єкта на 16.
// Список правок генерує tools/re/gen-smulti16.js (smulti16.json поруч із цим файлом).
if (Environment.GetEnvironmentVariable("ARC_NO_SMULTI16") != "1")   // для порівняльних прогонів без переносу
{
    var sm = Path.Combine(AppContext.BaseDirectory, "smulti16.json");
    if (!File.Exists(sm)) sm = Path.Combine(Path.GetDirectoryName(Environment.ProcessPath)!, "..", "patchgen", "smulti16.json");
    using var sj = JsonDocument.Parse(File.ReadAllText(sm));
    foreach (var e in sj.RootElement.GetProperty("edits").EnumerateArray())
    {
        uint P(string k) => Convert.ToUInt32(e.GetProperty(k).GetString()!, 16);
        var why = "SMulti16 " + e.GetProperty("why").GetString();
        if (e.GetProperty("kind").GetString() == "disp") Disp(P("va"), P("old"), P("new"), why);
        else Imm(P("va"), P("old"), P("new"), why);
    }
}

var outExe = (byte[])exe.Clone();
var edits = new List<object>();
foreach (var (va, why, pick) in patches)
{
    int off = Off(va);
    var dec = Iced.Intel.Decoder.Create(32, new ByteArrayCodeReader(exe, off, 16)); dec.IP = va;
    var ins = dec.Decode(); var co = dec.GetConstantOffsets(ins);
    var (kind, oldV, newV) = pick(ins);
    int fieldOff, size;
    if (kind == "imm")
    {
        if (!co.HasImmediate) throw new Exception($"{va:x}: no immediate ({ins})");
        fieldOff = co.ImmediateOffset; size = co.ImmediateSize;
        uint cur = size == 1 ? exe[off + fieldOff] : size == 2 ? BitConverter.ToUInt16(exe, off + fieldOff) : BitConverter.ToUInt32(exe, off + fieldOff);
        if (cur != oldV) throw new Exception($"{va:x}: immediate is {cur:x}, expected {oldV:x} ({ins})");
        if (size == 1 && newV > 0x7f) throw new Exception($"{va:x}: imm8 cannot hold {newV:x}");
    }
    else
    {
        if (!co.HasDisplacement) throw new Exception($"{va:x}: no displacement ({ins})");
        fieldOff = co.DisplacementOffset; size = co.DisplacementSize;
        uint cur = size == 1 ? exe[off + fieldOff] : BitConverter.ToUInt32(exe, off + fieldOff);
        if (cur != oldV) throw new Exception($"{va:x}: displacement is {cur:x}, expected {oldV:x} ({ins})");
        if (size == 1) throw new Exception($"{va:x}: disp8 cannot be widened");
    }
    var bytes = size == 1 ? new[] { (byte)newV } : BitConverter.GetBytes(newV).Take(size).ToArray();
    var oldBytes = exe.Skip(off + fieldOff).Take(size).ToArray();
    Array.Copy(bytes, 0, outExe, off + fieldOff, size);
    edits.Add(new { va = $"0x{va:x}", offset = off + fieldOff, old = Convert.ToHexString(oldBytes), @new = Convert.ToHexString(bytes), why, ins = ins.ToString() });
    Console.WriteLine($"{va:x8}  {ins,-40} {Convert.ToHexString(oldBytes)} → {Convert.ToHexString(bytes)}  {why}");
}

foreach (var (va, oldHex, newHex, why) in raws)
{
    int off = Off(va); var ob = Convert.FromHexString(oldHex); var nb = Convert.FromHexString(newHex);
    if (!exe.AsSpan(off, ob.Length).SequenceEqual(ob)) throw new Exception($"{va:x}: bytes differ ({why})");
    nb.CopyTo(outExe, off);
    edits.Add(new { va = $"0x{va:x}", offset = off, old = oldHex, @new = newHex, why, ins = "raw" });
    Console.WriteLine($"{va:x8}  {oldHex} → {newHex}  {why}");
}

// ── вставки коду (Caves.cs): вибух і підрив камікадзе, залп, наведення корпусом, уповільнення, міни на ходу ──
uint latePtr = newVa + LateStr;
uint CaveStr(string v)
{   // рядки, яких не було до caveVa (формати журналу), — у хвіст секції, щоб не налізти на код
    if (strings.TryGetValue(v, out var a)) return a;
    var b = Encoding.ASCII.GetBytes(v + "\0"); if (latePtr + b.Length > newVa + SecRaw) throw new Exception("late strings do not fit");
    b.CopyTo(sec, latePtr - newVa); strings[v] = latePtr; latePtr += (uint)b.Length; return latePtr - (uint)b.Length;
}
var (caveCode, hooks, caveListing) = Caves.Build(newVa, caveVa, stateVa, CaveStr, n => consts[n]);
if (caveVa + caveCode.Length > newVa + LateStr) throw new Exception("caves do not fit into .arcmod");
caveCode.CopyTo(sec, (int)(caveVa - newVa));
foreach (var hk in hooks)
{
    int off = Off(hk.Va);
    if (!exe.AsSpan(off, hk.Len).SequenceEqual(hk.Old)) throw new Exception($"{hk.Va:x}: bytes differ ({hk.Why})");
    var nb = Enumerable.Repeat((byte)0x90, hk.Len).ToArray(); nb[0] = 0xE9;
    BitConverter.GetBytes((int)(hk.Target - (hk.Va + 5))).CopyTo(nb, 1);
    nb.CopyTo(outExe, off);
    edits.Add(new { va = $"0x{hk.Va:x}", offset = off, old = Convert.ToHexString(hk.Old), @new = Convert.ToHexString(nb), why = hk.Why, ins = $"jmp {hk.Target:x}" });
    Console.WriteLine($"{hk.Va:x8}  jmp {hk.Target:x8}  {hk.Why}");
}
// Керування технікою союзників: у шести функціях вибору чужий юніт можна було взяти, лише якщо це
// причіп (Resource). Знімаємо цю умову — далі гра сама перевіряє, що команда гравця та сама (team ≠ 0).
// Без команди або з ворогом вибір, як і раніше, не проходить.
foreach (var (va, len) in new (uint, int)[] { (0x4d68a3, 6), (0x4d6a29, 2), (0x4d6b5a, 2), (0x4d6cdb, 2), (0x4d6e89, 2), (0x4d705a, 2) })
{
    int off = Off(va); var dec2 = Iced.Intel.Decoder.Create(32, new ByteArrayCodeReader(exe, off, 16)); dec2.IP = va; var ins = dec2.Decode();
    if (ins.Mnemonic != Mnemonic.Je || ins.Length != len) throw new Exception($"{va:x}: expected je, got {ins}");
    var old = exe.Skip(off).Take(len).ToArray(); var nb = len == 2 ? new byte[] { 0x66, 0x90 } : new byte[] { 0x66, 0x0F, 0x1F, 0x44, 0x00, 0x00 };
    nb.CopyTo(outExe, off);
    edits.Add(new { va = $"0x{va:x}", offset = off, old = Convert.ToHexString(old), @new = Convert.ToHexString(nb), why = "вибір техніки союзника (не лише причепів)", ins = ins.ToString() });
    Console.WriteLine($"{va:x8}  {ins,-40} → nop  вибір техніки союзника");
}
Console.WriteLine($"\ncaves @ {caveVa:x} ({caveCode.Length} B), state table @ {stateVa:x}:\n{caveListing}");

// ── додаємо секцію ──
int newHdr = shdr + nsec * 40;
if (newHdr + 40 > BitConverter.ToUInt32(exe, opt + 60) || exe.Skip(newHdr).Take(40).Any(b => b != 0)) throw new Exception("no room for a section header");
var withSec = new byte[newRaw + sec.Length];
Array.Copy(outExe, withSec, outExe.Length);
Array.Copy(sec, 0, withSec, newRaw, sec.Length);
var h = new byte[40];
Encoding.ASCII.GetBytes(".arcmod").CopyTo(h, 0);
BitConverter.GetBytes(secVirtual).CopyTo(h, 8);           // VirtualSize (+ таблиця стану, нулі)
BitConverter.GetBytes(newRva).CopyTo(h, 12);
BitConverter.GetBytes((uint)sec.Length).CopyTo(h, 16);  // SizeOfRawData
BitConverter.GetBytes(newRaw).CopyTo(h, 20);
BitConverter.GetBytes(0xE0000060u).CopyTo(h, 36);       // CODE | INITIALIZED_DATA | EXECUTE | READ | WRITE
h.CopyTo(withSec, newHdr);
BitConverter.GetBytes((ushort)(nsec + 1)).CopyTo(withSec, pe + 6);
BitConverter.GetBytes(Align(newRva + secVirtual, secAlign)).CopyTo(withSec, opt + 56); // SizeOfImage
// ASLR вимикаємо (DllCharacteristics &= ~DYNAMIC_BASE): вставки в .arcmod містять абсолютні адреси
// (рядок "kamikaze", імпорт strstr, власні таблиці) без записів у .reloc. З ASLR Windows вантажить exe
// за випадковою адресою, і кожна загибель юніта (SUnit::Explode → вставка) падала з Access violation.
ushort dllChar = BitConverter.ToUInt16(exe, opt + 70);
BitConverter.GetBytes((ushort)(dllChar & ~0x40)).CopyTo(withSec, opt + 70);

Directory.CreateDirectory(outDir);
File.WriteAllBytes(Path.Combine(outDir, "swineHD.patched.exe"), withSec);
var patchedSha = Convert.ToHexString(SHA256.HashData(withSec)).ToLowerInvariant();
var json = new
{
    schema = 1, game = "S.W.I.N.E. HD Remaster v1.7.1846", file = "swineHD.exe",
    originalSha256 = OriginalSha, patchedSha256 = patchedSha, patchedSize = withSec.Length,
    unitClasses = new { rabbit = classes[0], pig = classes[1] }, classesPerRace = N,
    header = new[] {
        new { offset = pe + 6, old = Convert.ToHexString(exe, pe + 6, 2), @new = Convert.ToHexString(withSec, pe + 6, 2) },
        new { offset = opt + 56, old = Convert.ToHexString(exe, opt + 56, 4), @new = Convert.ToHexString(withSec, opt + 56, 4) },
        new { offset = opt + 70, old = Convert.ToHexString(exe, opt + 70, 2), @new = Convert.ToHexString(withSec, opt + 70, 2) },
        new { offset = newHdr, old = Convert.ToHexString(exe, newHdr, 40), @new = Convert.ToHexString(h) } },
    edits,
    appendAt = newRaw, append = Convert.ToBase64String(sec),
};
File.WriteAllText(Path.Combine(outDir, "exe_patch.json"), JsonSerializer.Serialize(json, new JsonSerializerOptions { WriteIndented = true }));
Console.WriteLine($"\n{edits.Count} edits, {N} classes/race, section .arcmod @ {newVa:x} (table {tableVa:x}, mask {maskVa:x}, caves {caveVa:x}, state {stateVa:x}); SMarket size {NewSize:x}");
Console.WriteLine($"patched sha256 {patchedSha}");
return 0;

uint Align(uint v, uint a) => (v + a - 1) / a * a;
uint FindString(string s)
{
    var b = Encoding.ASCII.GetBytes(s);
    foreach (var sc in secs)
        for (int i = (int)sc.raw; i < sc.raw + sc.rs - b.Length; i++)
            if (exe.AsSpan(i, b.Length).SequenceEqual(b)) return (uint)(sc.va + (i - sc.raw));
    throw new Exception("string not found: " + s);
}

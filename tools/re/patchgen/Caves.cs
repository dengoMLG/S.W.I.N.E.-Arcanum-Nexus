// Вставки коду для механік Arcanum Units (асемблер Iced, 32 біт). Усе пишеться в секцію .arcmod.
// Кожен хук — jmp з оригінальної інструкції у вставку; витіснені інструкції повторюються у вставці.
//
// Гра — lockstep: команди гравців розсилаються всім, і кожен комп'ютер сам рахує SGameWorld::ServerRefresh.
// Тому вставки мусять бути детерміновані (жодного rand, часу чи «свого» гравця) — тоді світ у всіх однаковий.
//
// Поля SUnit (з розбору SUnit::InitVariables, див. docs/EXE_PATCH_14_UNITS.md):
//   +000 SGameWorld*     +004 id юніта        +254 ім'я секції units.ini   +258 гравець  +264/+26C x/z  +2A0 y
//   +044 Sight (з покращеннями)  +068 швидкість/тік   +06C поворот корпусу/тік     +090 TurretSpeed/тік
//   +0A0 Damage(+рівень) +0A4 ShotSpread              +0C8 SpecialType   +0D0 ExtraArmor  +0D8 Cargo
//   +098 ReloadTime у тіках  +270 курс корпусу (рад)  +274 кут башти (рад, світовий)
//   +290 поточний боєзапас   +394 ракет у залпі (спецрежим 6)
//   +3A0 спецздібність є (SpecialType ≥ 0)  +3A4 стан спецздібності (0/1, з нього панель бере іконку)
// SGameWorld: +16F4 номер тіку гри (20 тіків/с, зберігається в сейві), гравці — +F8 + i·5Ch (+100 тип, +104 команда).
using Iced.Intel;
using static Iced.Intel.AssemblerRegisters;

static class Caves
{
    // Адреси гри (v1.7.1846, без ASLR — патч вимикає DYNAMIC_BASE).
    const uint ImpStrstr = 0x544224, TakeDamage = 0x4ca9f0, RadiusDamage = 0x4a97a0, GetUnit = 0x4a3c90, CreateUnit = 0x49ffe0,
               ShowEvent = 0x4afc10, LoadEffect = 0x4243e0, LogFn = 0x500490, LoggerVar = 0xED2A04, GepardVar = 0x59587C,
               IsAllyFn = 0x4a5e80, EcFollowFn = 0x4bbf20, LoadNewSkin = 0x4c53f0;
    public const int TableEntries = 4096, EntrySize = 32;   // таблиця стану юнітів за id: див. Entry*
    // Entry: +0 SUnit*  +4 тіків уповільнення  +8 швидкість до  +12 поворот до  +16 уповільнена швидкість
    //        мінер (13): +20/+24 x/z останньої міни  +28 тіків до наступної міни
    //        локатор (14, 4.2.5): +20 звичайний обзор  +24 = 1, коли вуха розкладені й обзор ×3  +28 тіків до кінця розкладання/складання
    public const int SlowTicks = 100, ZoneSlowTicks = 10;     // влучання — 5 с; у калюжі — поки стоїш + 0.5 с
    public const float SlowFactor = 0.4f, MineDist = 2.5f;
    public const int SalvoSize = 20, RavenSalvoSize = 8;      // ракет у залпі: "salvo" — 20 (4.2.5; менше — усе, що лишилось), "Varju" (Коршун) — 8, решта — 5; перший постріл миттєвий (4.1.3)
    public const int SpecDetonate = 12, SpecMines = 13, SpecRadar = 14;
    public const float RadarMul = 3f;                                                          // локатор Ушастика: обзор ×3, поки вуха розкладені
    public const int FreeAirCooldown = 900; public const float SamRadius = 14f;                 // Ворони: безкоштовний тактичний авіаналіт (КД 45 с) і ППО Сапсан-ЗРК (R=14)
    public const int EarTicks = 100; public const float EarBlindSight = 0.5f;                  // 4.2.5: Ушастик розкладає/складає вуха 5 с, увесь цей час сліпий (обзор 0.5)
    public const int VisMaxR = 64;                                                             // #12: розширені таблиці DrawVisMap (було 36 → Sight 18; тепер 64 → Sight 31.5)
    public const float VisMaxSight = 31.5f;
    public const int Zones = 64, ZoneTicks = 400; public const float ZoneRadius = 2.5f;          // калюжа — 20 с (#11: ×2)
    public const string MudEffect = "arc_sar_folt";

    public record Hook(uint Va, byte[] Old, string Why, uint Target, int Len);

    public const int SpawnScratch = TableEntries * EntrySize;   // після таблиці: дані розстановки стартів (0xA0 Б)
    public const int ZoneTable = SpawnScratch + 0x200;          // калюжі: Zones × {x, z, тік кінця, гравець}
    public const int ZoneIdx = ZoneTable + Zones * 16, FxId = ZoneIdx + 4;
    public const int AutoState = FxId + 0x100;                  // +autostart: 4 dword (мережа, не світ — детермінізм не зачіпає)
    public const int CoState = AutoState + 0x10;                // біт k — у армії k на старті матчу був другий командир (слот 8 + k)
    public const int CoNames = CoState + 0x20;                  // лобі: 8 × 128 Б — «ім'я армії + ім'я другого командира»
    public const int MenuVer = CoNames + 0x400;                 // головне меню: кадр рядка версії мода + 1, SMenu*
    public const int RadarSee = MenuVer + 8;
    public const int RaceArg = MenuVer + 0x10;                  // «+race R» (перевірка): 3 dword
    // #12: розширені таблиці CreateVisMap і буфери h/m для DrawVisMapAid/DetAid (у ванілі 36 → переповнення на SuperWindow* 0xED2344)
    public const int VisBase = SpawnScratch + 0x1000;
    public const int VisTbl1 = VisBase, VisTbl2 = VisTbl1 + 0x2100, VisTbl3 = VisTbl2 + 0x2100;   // по 2112 float (> 63·66/2 = 2079)
    public const int VisAidH = VisTbl3 + 0x2100 + 0x10, VisAidM = VisAidH + 0x110;                // по 64 float (+16 Б запасу спереду для [-1])
    public const int VisDetH = VisAidM + 0x110, VisDetM = VisDetH + 0x110;
    public const int BssEnd = VisDetM + 0x120;
    public const int AirPricePig = 50, AirPriceRabbit = 100, AirPriceRaven = 35;    // авіаудар, SP (свині 50, кролики 100, ворони 35)
    // #2: гравці 8…15 — у хвості SGameWorld (+27A0h, 8 × 5Ch; об'єкт 27A0h → 2A80h). Зсув i·5Ch для i ≥ 8 + World16Delta.
    public const int WorldOldSize = 0x27A0, WorldNewSize = WorldOldSize + 8 * 0x5C, World16Delta = WorldOldSize - (0xF8 + 8 * 0x5C);
    // місця imul …,5Ch з tools/re/world16.json; вікно (≥ 5 Б) — Program.cs: інструкції до imul, сам imul, після
    // K[i] ≥ 0 — після Ins[i] (imul) PlayerOff(k); PreReg — PlayerOff перед вікном (вікно починається одразу після imul,
    // бо на наступну інструкцію є перехід з іншого місця — там регістр уже з переміщеного imul, PlayerOff ідемпотентний)
    public record W16Site(uint Va, Instruction[] Ins, int[] K, byte[] Old, int Len, Register PreReg = Register.None, int PreK = 0);
    public static List<W16Site> World16 = new();
    const uint BoardVar = 0x58d060, SDXWidgetDtor = 0x4885f0;   // SIBoard* Board; SDXWidget::~SDXWidget
    public static string ModLine = "Arcanum Nexus Mod";
    public static bool Ravens;                                  // #3: третя раса (Program.cs — є рядок "raven" у classes.json)
    const uint GetTextFn = 0x4f9b00, DropAddItem = 0x487250;    // GetText(key) cdecl; SDropList::AddItem(text, bool, DWORD) thiscall         // Program.cs: «Arcanum Nexus Mod v<версія з modpack/pack.json>»
    const uint ImpArgc = 0x54439c, ImpArgv = 0x5443a0, ImpStricmp = 0x544460, Atoi = 0x53c5eb,
               GetFullSlots = 0x479e70, StartGame = 0x47dba0, SendPlayerChangeRace = 0x47d700;
    const int FrameBase = 0x3078;                               // = smulti16.json layout.frames (кратне 12)
    const int SlotBase = 0x28F0, SlotSize = 0x70, ConnBase = 0x2FF0;   // = smulti16.json layout.slot / conn
    const int RecvBase = 0x6EB8, ReqBase = 0x6EF8;                      // = smulti16.json layout.recv / req
    const int MySlot = 0x2530, ConnMgr = 0x28E4;                        // поля SMulti, що не переносились
    const uint CmSend = 0x474ad0;                                       // ConnectionManager::Send(conn, data, size, type), callee-clean
    const uint HasFrameData = 0x47a430, GetFrameData = 0x479d50, GetSlots = 0x47a1c0, SendMePackets = 0x47d480,
               ProcessPacket = 0x4a7940, StreamBufCtor = 0x500e00, StreamBufDtor = 0x501050;
    public static (byte[] code, List<Hook> hooks, string listing) Build(uint dataVa, uint codeVa, uint tableVa,
        Func<string, uint> str, Func<string, uint> cst)
    {
        var a = new Assembler(32);
        var hooks = new List<Hook>();
        uint S(string s) => str(s);
        uint ZONES = tableVa + ZoneTable, ZIDX = tableVa + ZoneIdx, FXID = tableVa + FxId;
        void Strstr(AssemblerRegister32 unit, string needle)
        {   // eax = strstr(unit->name, needle); ecx/edx портяться
            a.push(S(needle)); a.push(__dword_ptr[unit + 0x254]); a.call(__dword_ptr[ImpStrstr]); a.add(esp, 8);
        }
        // Рядок у журнал гри (%LOCALAPPDATA%\Kite Games\Swine\log): SLogger::Log(Logger, 0, fmt, a, b). Регістри цілі.
        void Log(string fmt, Action pushB, Action pushA)
        {
            a.pushad(); pushB(); pushA(); a.push(S(fmt)); a.push(0); a.push(__dword_ptr[LoggerVar]); a.call(LogFn); a.add(esp, 20); a.popad();
        }
        Action Mem(AssemblerRegister32 r, int off) => () => a.push(__dword_ptr[r + off]);
        Action Reg(AssemblerRegister32 r) => () => a.push(r);
        Action Imm(int v) => () => a.push(v);
        // 4.2.5: модель Ушастика (esi) з розкладеними / складеними вухами — [esi+20h] (основа імені «%s_%s.4d»)
        // і SUnit::LoadNewSkinObject (Replace object, як при підвищенні до ветерана). Регістри цілі.
        void EarModel(bool open)
        {
            a.pushad();
            a.mov(__dword_ptr[esi + 0x20], S(open ? "units\\skinned\\ny_ushastik_open" : "units\\skinned\\ny_ushastik"));
            a.mov(ecx, esi); a.call(LoadNewSkin);
            a.popad();
        }
        // r = i·5Ch (i — гравець) → зсув у SGameWorld з урахуванням хвоста для i ≥ 8 (#2). Прапорці портяться.
        void PlayerOff(AssemblerRegister32 r, int k = 0)
        {
            // лише «сирий» зсув (< 1000h; i·5Ch для i < 24): уже переміщений (≥ 26A8h) не чіпаємо — можна викликати двічі
            var lo = a.CreateLabel(); a.cmp(r, (8 + k) * 0x5C); a.jl(lo); a.cmp(r, 0x1000); a.jge(lo); a.add(r, World16Delta); a.Label(ref lo);
        }

        // ── підпрограма: уповільнити юніт esi на ecx тіків (не менше вже наявного). Портить eax, edx, xmm0. ──
        var applySlow = a.CreateLabel("applyslow");
        {
            var have = a.CreateLabel(); var refresh = a.CreateLabel(); var ret = a.CreateLabel();
            a.Label(ref applySlow);
            a.mov(eax, __dword_ptr[esi + 4]); a.cmp(eax, TableEntries); a.jae(ret);
            a.shl(eax, 5); a.add(eax, tableVa);
            a.cmp(__dword_ptr[eax], esi); a.je(have);
            a.mov(__dword_ptr[eax], esi); a.mov(__dword_ptr[eax + 4], 0);
            a.Label(ref have);
            a.cmp(__dword_ptr[eax + 4], 0); a.jg(refresh);
            a.mov(edx, __dword_ptr[esi + 0x68]); a.mov(__dword_ptr[eax + 8], edx);
            a.mov(edx, __dword_ptr[esi + 0x6C]); a.mov(__dword_ptr[eax + 12], edx);
            a.movss(xmm0, __dword_ptr[eax + 8]); a.mulss(xmm0, __dword_ptr[cst("slow")]);
            a.movss(__dword_ptr[esi + 0x68], xmm0); a.movss(__dword_ptr[eax + 16], xmm0);
            a.movss(xmm0, __dword_ptr[eax + 12]); a.mulss(xmm0, __dword_ptr[cst("slow")]); a.movss(__dword_ptr[esi + 0x6C], xmm0);
            a.Label(ref refresh);
            a.cmp(__dword_ptr[eax + 4], ecx); a.jge(ret); a.mov(__dword_ptr[eax + 4], ecx);
            a.Label(ref ret); a.ret();
        }
        // ── підпрограма: eax = 1, якщо гравці eax і edx — одна сторона (той самий гравець або спільна команда ≠ 0).
        //    ecx = SGameWorld*. Портить edx. ──
        var sameSide = a.CreateLabel("sameside");
        {
            var yes = a.CreateLabel(); var no = a.CreateLabel();
            a.Label(ref sameSide);
            a.cmp(eax, edx); a.je(yes);
            a.cmp(eax, 16); a.jae(no); a.cmp(edx, 16); a.jae(no);
            a.imul(eax, eax, 0x5C); PlayerOff(eax); a.mov(eax, __dword_ptr[ecx + eax + 0x104]);
            a.imul(edx, edx, 0x5C); PlayerOff(edx); a.mov(edx, __dword_ptr[ecx + edx + 0x104]);
            a.test(eax, eax); a.je(no); a.cmp(eax, edx); a.jne(no);
            a.Label(ref yes); a.mov(eax, 1); a.ret();
            a.Label(ref no); a.xor(eax, eax); a.ret();
        }

        // ── 1. SUnit::Explode: вибух камікадзе ──
        // Було (0x4bcffa): add esp,8 / test eax,eax / jne 4bd051 — після _stricmp(name, "Akna").
        var explode = a.CreateLabel("explode");
        {
            var noBoom = a.CreateLabel(); var dmgOk = a.CreateLabel(); var guarded = a.CreateLabel(); var unguarded = a.CreateLabel();
            a.Label(ref explode);
            a.add(esp, 8); a.test(eax, eax); a.je(0x4bd001UL);                    // міна — як було
            Strstr(edi, "kamikaze"); a.test(eax, eax); a.je(noBoom);
            // Захист від повторного входу: поки йде RadiusDamage цього камікадзе, у записі таблиці +28 = SUnit*.
            // Інакше два камікадзе в радіусі одне одного «вмирали» знову й знову — переповнення стека (лист 23.11).
            a.mov(eax, __dword_ptr[edi + 4]); a.cmp(eax, TableEntries); a.jae(unguarded);
            a.shl(eax, 5); a.cmp(__dword_ptr[eax + (int)tableVa + 28], edi); a.je(0x4bd063UL);   // уже вибухає — без шкоди
            a.mov(__dword_ptr[eax + (int)tableVa + 28], edi);
            a.Label(ref unguarded);
            Log("ARC: kamikaze %d explodes", Imm(0), Mem(edi, 4));
            a.push(__dword_ptr[edi + 4]); a.movss(xmm0, __dword_ptr[esi]); a.push(2); a.sub(esp, 0x10);
            a.movss(xmm1, __dword_ptr[edi + 0xA4]); a.movss(__dword_ptr[esp + 0xC], xmm1);   // радіус = ShotSpread
            a.movss(__dword_ptr[esp + 8], xmm0);
            a.movss(xmm0, __dword_ptr[edi + 0x2A0]); a.movss(__dword_ptr[esp + 4], xmm0);
            a.movss(xmm0, __dword_ptr[ebx]); a.movss(__dword_ptr[esp], xmm0);
            a.movss(xmm0, __dword_ptr[edi + 0xD0]); a.xorps(xmm2, xmm2); a.comiss(xmm0, xmm2); a.ja(dmgOk);
            a.movss(xmm0, __dword_ptr[edi + 0xA0]);                                // урон = ExtraArmor, інакше Damage
            a.Label(ref dmgOk);
            // RadiusDamage(урон, нападник = сам камікадзе, не чіпати = індекс самого камікадзе, x, y, z, радіус, 2, id).
            // Третій аргумент — індекс юніта в масиві світу (= id), якого вибух не зачіпає. Було −1, як у міни: вибух бив
            // і по самому камікадзе, той «помирав» удруге й знову вибухав — нескінченна рекурсія.
            // ecx = світ (у першій версії цей mov загубився в коментарі — RadiusDamage отримував сміття й падав).
            a.push(__dword_ptr[edi + 4]); a.push(__dword_ptr[edi + 4]); a.push(ecx);
            a.mov(ecx, __dword_ptr[edi]);
            a.movss(__dword_ptr[esp], xmm0);
            a.call(RadiusDamage);
            a.mov(eax, __dword_ptr[edi + 4]); a.cmp(eax, TableEntries); a.jae(guarded);
            a.shl(eax, 5); a.mov(__dword_ptr[eax + (int)tableVa + 28], 0);
            a.Label(ref guarded);
            a.jmp(0x4bd063UL);
            a.Label(ref noBoom); a.jmp(0x4bd051UL);
        }

        // ── 2. SUnit::EC_SpecAction (сервер, у кожного гравця): кнопка спецздібності ──
        // Було (0x4bc190): push esi / mov esi,ecx / cmp dword ptr [esi+3A0h],0. Ванільна таблиця знає типи 0–9;
        // наші 12–14 мають свої іконки (menu/panel/panel_spec.png, гліфи 48–59) і обробляються тут.
        var spec = a.CreateLabel("specaction");
        {
            var ret = a.CreateLabel(); var orig = a.CreateLabel(); var salvo = a.CreateLabel(); var det = a.CreateLabel();
            var mines = a.CreateLabel(); var radar = a.CreateLabel(); var salvoOn = a.CreateLabel(); var salvoSet = a.CreateLabel();
            var rOwn = a.CreateLabel();
            a.Label(ref spec);
            a.push(esi); a.mov(esi, ecx);
            a.cmp(__dword_ptr[esi + 0x3A0], 0); a.je(ret);
            a.mov(eax, __dword_ptr[esi + 0xC8]);
            a.cmp(eax, 6); a.je(salvo);
            a.cmp(eax, SpecDetonate); a.je(det);
            a.cmp(eax, SpecMines); a.je(mines);
            a.cmp(eax, SpecRadar); a.je(radar);
            a.Label(ref orig); a.jmp(0x4bc1a0UL);
            a.Label(ref ret); a.pop(esi); a.ret();

            // залп: у "salvo" — SalvoSize (40) ракет, у "Varju" (Коршун) — RavenSalvoSize (8), у решти — 5.
            // 4.1.3: перший постріл залпу спрацьовує ОДРАЗУ (0 тіків), якщо гармата вже заряджена ([388h]==0 і залп не розпочато).
            a.Label(ref salvo);
            {
                var doSalvo = a.CreateLabel(); var tryV = a.CreateLabel();
                Strstr(esi, "salvo"); a.test(eax, eax); a.mov(ecx, SalvoSize); a.jne(doSalvo);
                Strstr(esi, "Varju"); a.test(eax, eax); a.mov(ecx, RavenSalvoSize); a.jne(doSalvo);
                a.mov(ecx, 5);
                a.Label(ref doSalvo);
            }
            a.mov(edx, __dword_ptr[esi + 0x394]); a.mov(eax, 1); a.cmp(edx, 1); a.jg(salvoSet);
            a.Label(ref salvoOn); a.mov(eax, ecx);
            a.Label(ref salvoSet);
            a.mov(__dword_ptr[esi + 0x394], eax);
            a.push(edx);                                                                // старий salvoCount
            a.xor(eax, eax); a.cmp(edx, 1); a.setg(al); a.add(eax, 0xE);                // подія 0Eh — увімкнено, 0Fh — вимкнено
            a.mov(ecx, __dword_ptr[esi]); a.push(eax); a.push(__dword_ptr[esi + 4]); a.call(ShowEvent);
            a.pop(edx);                                                                 // edx = старий salvoCount
            {
                var onCd = a.CreateLabel(); var midSalvo = a.CreateLabel(); var waitAmmo = a.CreateLabel(); var doneSalvo = a.CreateLabel();
                a.cmp(__dword_ptr[esi + 0x388], 0); a.jg(onCd);                         // уже на перезарядці — КД не скидаємо
                a.cmp(__dword_ptr[esi + 0x398], edx); a.jl(midSalvo);                   // перервав залп посередині — чесний КД
                a.mov(eax, __dword_ptr[esi + 0x394]);
                a.cmp(__dword_ptr[esi + 0x290], eax); a.jl(waitAmmo);                   // замало ракет — чекаємо причепа (1 тік)
                a.mov(__dword_ptr[esi + 0x398], eax);                                   // заряджений повністю — стріляє ОДРАЗУ!
                a.jmp(doneSalvo);
                a.Label(ref waitAmmo);
                a.mov(__dword_ptr[esi + 0x398], -1);
                a.mov(__dword_ptr[esi + 0x388], 1);
                a.jmp(doneSalvo);
                a.Label(ref midSalvo);
                a.mov(eax, __dword_ptr[esi + 0x98]);
                a.mov(__dword_ptr[esi + 0x388], eax);
                a.Label(ref onCd);
                a.mov(__dword_ptr[esi + 0x398], -1);
                a.Label(ref doneSalvo);
            }
            Log("ARC: unit %d salvo = %d", Mem(esi, 0x394), Mem(esi, 4));
            a.jmp(ret);

            // підрив: TakeDamage(1e6, свій id, &позиція, 2, -1, false) → загибель → Explode → вибух
            a.Label(ref det);
            Log("ARC: unit %d detonated by button%s", Imm((int)S("")), Mem(esi, 4));
            a.push(0); a.push(-1); a.push(2); a.lea(eax, __dword_ptr[esi + 0x264]); a.push(eax);
            a.push(__dword_ptr[esi + 4]); a.push(0x49742400);                          // 1 000 000.0f
            a.mov(ecx, esi); a.call(TakeDamage);
            a.jmp(ret);

            // мінування на ходу: перемикач
            a.Label(ref mines);
            a.xor(__dword_ptr[esi + 0x3A4], 1);
            Log("ARC: unit %d mining = %d", Mem(esi, 0x3A4), Mem(esi, 4));
            a.jmp(ret);

            // локатор (4.2.5): перемикач «розкласти / скласти вуха» ([3A4h] = 1 — розкладені або розкладаються).
            // Розкласти: одразу видно всім ([56h] = 1, модель з розкладеними вухами), 5 с сліпий, потім обзор ×3 (крізь
            // дерева, visunit). Скласти: обзор ×3 зникає одразу, 5 с ще видно всім і сліпий, потім звичайний обзор і туман.
            // Під час розкладання/складання ([+28] > 0) кнопка не діє.
            a.Label(ref radar);
            {
                var fold = a.CreateLabel();
                a.mov(eax, __dword_ptr[esi + 4]); a.cmp(eax, TableEntries); a.jae(ret);
                a.shl(eax, 5); a.add(eax, tableVa);
                a.cmp(__dword_ptr[eax], esi); a.je(rOwn);
                a.mov(__dword_ptr[eax], esi); a.mov(__dword_ptr[eax + 4], 0); a.mov(__dword_ptr[eax + 24], 0); a.mov(__dword_ptr[eax + 28], 0);
                a.Label(ref rOwn);
                a.cmp(__dword_ptr[eax + 28], 0); a.jg(ret);
                a.mov(__dword_ptr[eax + 24], 0); a.mov(__dword_ptr[eax + 28], EarTicks);
                a.cmp(__dword_ptr[esi + 0x3A4], 0); a.jne(fold);
                a.mov(edx, __dword_ptr[esi + 0x44]); a.mov(__dword_ptr[eax + 20], edx);           // звичайний обзор
                a.mov(edx, __dword_ptr[cst("blind")]); a.mov(__dword_ptr[esi + 0x44], edx);
                a.mov(__dword_ptr[esi + 0x3A4], 1); a.mov(__byte_ptr[esi + 0x56], 1);
                EarModel(true);
                Log("ARC: unit %d ears unfolding%s", Imm((int)S("")), Mem(esi, 4));
                a.jmp(ret);
                a.Label(ref fold);
                a.mov(edx, __dword_ptr[cst("blind")]); a.mov(__dword_ptr[esi + 0x44], edx);
                a.mov(__dword_ptr[esi + 0x3A4], 0);
                Log("ARC: unit %d ears folding%s", Imm((int)S("")), Mem(esi, 4));
                a.jmp(ret);
            }
        }

        // ── 3. SUnit::SetSpecialState (стан з інтерфейсу) для спецрежиму 6: у "salvo" — SalvoSize ракет, у "Varju" — RavenSalvoSize (8) ──
        // Було (0x4c9e96): mov dword ptr [ecx+394h],5
        var salvoUi = a.CreateLabel("salvoui");
        {
            var tryV = a.CreateLabel(); var five = a.CreateLabel(); var set = a.CreateLabel();
            a.Label(ref salvoUi);
            a.push(ecx); Strstr(ecx, "salvo"); a.pop(ecx);
            a.test(eax, eax); a.je(tryV); a.mov(eax, SalvoSize); a.jmp(set);
            a.Label(ref tryV);
            a.push(ecx); Strstr(ecx, "Varju"); a.pop(ecx);
            a.test(eax, eax); a.je(five); a.mov(eax, RavenSalvoSize); a.jmp(set);
            a.Label(ref five); a.mov(eax, 5);
            a.Label(ref set); a.mov(__dword_ptr[ecx + 0x394], eax); a.jmp(0x4c9eacUL);
        }

        // ── 4. SUnit::AimTarget: наведення корпусом ──
        // Для "hullaim" башта стоїть уздовж корпусу, а на ціль доводиться корпус зі швидкістю TurretSpeed.
        var aim = a.CreateLabel("aim");
        {
            var orig = a.CreateLabel(); var n1 = a.CreateLabel(); var n2 = a.CreateLabel(); var partial = a.CreateLabel();
            var pos = a.CreateLabel(); var n3 = a.CreateLabel(); var n4 = a.CreateLabel();
            a.Label(ref aim);
            a.push(ebp); a.mov(ebp, esp); a.push(ecx);
            Strstr(ecx, "hullaim"); a.pop(ecx); a.test(eax, eax); a.je(orig);
            a.movss(xmm0, __dword_ptr[ebp + 8]); a.subss(xmm0, __dword_ptr[ecx + 0x270]);
            a.comiss(xmm0, __dword_ptr[cst("pi")]); a.jbe(n1); a.subss(xmm0, __dword_ptr[cst("2pi")]); a.Label(ref n1);
            a.comiss(xmm0, __dword_ptr[cst("-pi")]); a.jae(n2); a.addss(xmm0, __dword_ptr[cst("2pi")]); a.Label(ref n2);
            a.movss(xmm1, __dword_ptr[ecx + 0x90]);
            a.movaps(xmm2, xmm0); a.andps(xmm2, __xmmword_ptr[cst("absmask")]);
            a.comiss(xmm1, xmm2); a.jb(partial);
            a.movss(xmm0, __dword_ptr[ebp + 8]); a.movss(__dword_ptr[ecx + 0x270], xmm0); a.movss(__dword_ptr[ecx + 0x274], xmm0);
            a.mov(al, 1); a.pop(ebp); a.ret(4);
            a.Label(ref partial);
            a.xorps(xmm3, xmm3); a.comiss(xmm0, xmm3); a.jae(pos); a.xorps(xmm1, __xmmword_ptr[cst("signmask")]);
            a.Label(ref pos);
            a.movss(xmm0, __dword_ptr[ecx + 0x270]); a.addss(xmm0, xmm1);
            a.comiss(xmm0, __dword_ptr[cst("pi")]); a.jbe(n3); a.subss(xmm0, __dword_ptr[cst("2pi")]); a.Label(ref n3);
            a.comiss(xmm0, __dword_ptr[cst("-pi")]); a.jae(n4); a.addss(xmm0, __dword_ptr[cst("2pi")]); a.Label(ref n4);
            a.movss(__dword_ptr[ecx + 0x270], xmm0); a.movss(__dword_ptr[ecx + 0x274], xmm0);
            a.xor(al, al); a.pop(ebp); a.ret(4);
            a.Label(ref orig);
            a.movss(xmm6, __dword_ptr[ebp + 8]); a.jmp(0x4b6e78UL);
        }

        // ── 5. SUnit::TakeDamage: уповільнення від влучання ──
        // Влучання юніта з "slow" в імені по будь-кому, крім себе: швидкість і поворот ×SlowFactor на SlowTicks.
        var takeDmg = a.CreateLabel("takedamage");
        {
            var done = a.CreateLabel();
            a.Label(ref takeDmg);
            a.push(ebp); a.mov(ebp, esp); a.pushad();
            a.mov(esi, ecx);
            a.cmp(__byte_ptr[esi + 0x57], 0); a.jne(done);
            a.mov(eax, __dword_ptr[ebp + 0xC]); a.test(eax, eax); a.js(done);
            a.mov(ecx, __dword_ptr[esi]); a.push(eax); a.push(0); a.call(GetUnit);
            a.test(eax, eax); a.je(done); a.mov(edi, eax);
            Strstr(edi, "slow"); a.test(eax, eax); a.je(done);
            a.cmp(edi, esi); a.je(done);                                   // грязь сповільнює всіх, крім самого стрільця (#8)
            a.mov(ecx, SlowTicks); a.call(applySlow);
            Log("ARC: unit %d slowed by hit of %d", Mem(edi, 4), Mem(esi, 4));
            a.Label(ref done);
            a.popad(); a.and(esp, -8); a.sub(esp, 0x30); a.jmp(0x4ca9f9UL);
        }

        // ── 6. SProjectile::ServerRefresh, вибух снаряда на землі: грязьова калюжа ──
        // Було (0x4b5b4e): push dword ptr [esi+2Ch] / movss xmm0,[esi+58h] — перед RadiusDamage.
        // Снаряд юніта з "slow" лишає калюжу (ZoneRadius, ZoneTicks) і пляму на землі (ефект MudEffect з effects.ini).
        var mud = a.CreateLabel("mud");
        {
            var skip = a.CreateLabel(); var haveFx = a.CreateLabel(); var noFx = a.CreateLabel();
            a.Label(ref mud);
            a.pushad();
            a.mov(eax, __dword_ptr[esi + 0x28]); a.test(eax, eax); a.js(skip);
            a.mov(ecx, __dword_ptr[esi]); a.push(eax); a.push(0); a.call(GetUnit);
            a.test(eax, eax); a.je(skip); a.mov(edi, eax);
            Strstr(edi, "slow"); a.test(eax, eax); a.je(skip);
            a.mov(ebx, __dword_ptr[ZIDX]); a.inc(ebx); a.and(ebx, Zones - 1); a.mov(__dword_ptr[ZIDX], ebx);
            a.shl(ebx, 4); a.add(ebx, ZONES);
            a.mov(eax, __dword_ptr[esi + 0xC]); a.mov(__dword_ptr[ebx], eax);
            a.mov(eax, __dword_ptr[esi + 0x14]); a.mov(__dword_ptr[ebx + 4], eax);
            a.mov(ecx, __dword_ptr[esi]); a.mov(eax, __dword_ptr[ecx + 0x16F4]); a.add(eax, ZoneTicks); a.mov(__dword_ptr[ebx + 8], eax);
            a.mov(eax, __dword_ptr[edi + 0x258]); a.mov(__dword_ptr[ebx + 12], eax);
            Log("ARC: mud puddle by unit %d, ends at tick %d", Mem(ebx, 8), Mem(edi, 4));
            // пляма: ефект вантажимо при першій потребі (id+1 у FXID; 0 — ще не вантажили)
            a.mov(eax, __dword_ptr[FXID]); a.test(eax, eax); a.jne(haveFx);
            a.mov(ecx, __dword_ptr[GepardVar]); a.test(ecx, ecx); a.je(skip);
            a.mov(ecx, __dword_ptr[ecx + 0x1208]); a.test(ecx, ecx); a.je(skip);
            a.push(unchecked((int)0xBF800000)); a.push(unchecked((int)0xBF800000)); a.push(0); a.push(S(MudEffect));
            a.call(LoadEffect); a.inc(eax); a.mov(__dword_ptr[FXID], eax);
            a.Label(ref haveFx);
            a.dec(eax); a.js(skip);
            a.mov(ecx, __dword_ptr[GepardVar]); a.test(ecx, ecx); a.je(skip);
            a.mov(edx, __dword_ptr[ecx]);
            a.push(0); a.push(__dword_ptr[esi + 0x14]); a.push(__dword_ptr[esi + 0x10]); a.push(__dword_ptr[esi + 0xC]); a.push(eax);
            a.call(__dword_ptr[edx + 0x280]);
            a.Label(ref skip);
            a.popad(); a.push(__dword_ptr[esi + 0x2C]); a.movss(xmm0, __dword_ptr[esi + 0x58]); a.jmp(0x4b5b56UL);
        }

        // ── 7. SUnit::ServerRefresh (кожен тік кожного юніта) ──
        // кінець уповільнення; калюжі; міни на ходу (спецздібність 13); таймер радара (14)
        var tick = a.CreateLabel("tick");
        {
            var zones = a.CreateLabel(); var zl = a.CreateLabel(); var zn = a.CreateLabel(); var zdone = a.CreateLabel();
            var mines = a.CreateLabel(); var outL = a.CreateLabel(); var own = a.CreateLabel(); var cd0 = a.CreateLabel(); var noset = a.CreateLabel();
            var radar = a.CreateLabel();
            a.Label(ref tick);
            a.pushad(); a.mov(esi, ecx);
            a.mov(eax, __dword_ptr[esi + 4]); a.cmp(eax, TableEntries); a.jae(outL);
            a.shl(eax, 5); a.lea(edi, __dword_ptr[eax + tableVa]);
            // кінець уповільнення
            a.cmp(__dword_ptr[edi], esi); a.jne(zones);
            a.mov(eax, __dword_ptr[edi + 4]); a.test(eax, eax); a.jle(zones);
            a.dec(eax); a.mov(__dword_ptr[edi + 4], eax); a.jne(zones);
            a.mov(eax, __dword_ptr[esi + 0x68]); a.cmp(eax, __dword_ptr[edi + 16]); a.jne(zones);
            a.mov(eax, __dword_ptr[edi + 8]); a.mov(__dword_ptr[esi + 0x68], eax);
            a.mov(eax, __dword_ptr[edi + 12]); a.mov(__dword_ptr[esi + 0x6C], eax);
            // калюжі: будь-який юніт усередині — уповільнений, поки там
            a.Label(ref zones);
            a.cmp(__dword_ptr[esi + 0x68], 0); a.je(zdone);                                   // нерухоме (міни, будівлі)
            a.xor(ebx, ebx);
            a.Label(ref zl);
            a.mov(ebp, ebx); a.shl(ebp, 4); a.add(ebp, ZONES);
            a.mov(ecx, __dword_ptr[esi]); a.mov(eax, __dword_ptr[ecx + 0x16F4]); a.cmp(__dword_ptr[ebp + 8], eax); a.jle(zn);
            // калюжа сповільнює всіх — і чужих, і своїх (#8: «щоб усіх сповільнювала»)
            a.movss(xmm0, __dword_ptr[esi + 0x264]); a.subss(xmm0, __dword_ptr[ebp]); a.mulss(xmm0, xmm0);
            a.movss(xmm1, __dword_ptr[esi + 0x26C]); a.subss(xmm1, __dword_ptr[ebp + 4]); a.mulss(xmm1, xmm1);
            a.addss(xmm0, xmm1); a.comiss(xmm0, __dword_ptr[cst("zoner2")]); a.jae(zn);
            {   // у журнал — лише коли юніт щойно заїхав у грязь (ще не сповільнений)
                var noLog = a.CreateLabel(); var doLog = a.CreateLabel();
                a.cmp(__dword_ptr[edi], esi); a.jne(doLog); a.cmp(__dword_ptr[edi + 4], 0); a.jg(noLog);
                a.Label(ref doLog);
                Log("ARC: unit %d slowed in mud puddle %d", Reg(ebx), Mem(esi, 4));
                a.Label(ref noLog);
            }
            a.mov(ecx, ZoneSlowTicks); a.call(applySlow); a.jmp(zdone);
            a.Label(ref zn); a.inc(ebx); a.cmp(ebx, Zones); a.jl(zl);
            a.Label(ref zdone);
            a.mov(eax, __dword_ptr[esi + 0xC8]);
            a.cmp(eax, SpecRadar); a.je(radar);
            {   // Ворони: відкат безкоштовного тактичного авіанальоту ("freeair", SpecialType = 11) у [edi+28]
                var notAir = a.CreateLabel();
                a.cmp(eax, 11); a.jne(notAir);
                a.cmp(__dword_ptr[edi], esi); a.jne(outL);
                a.mov(eax, __dword_ptr[edi + 28]); a.test(eax, eax); a.jle(outL);
                a.dec(eax); a.mov(__dword_ptr[edi + 28], eax);
                a.jmp(outL);
                a.Label(ref notAir);
            }
            a.cmp(eax, SpecMines); a.jne(outL);
            // міни на ходу
            a.Label(ref mines);
            a.cmp(__dword_ptr[esi + 0x3A4], 1); a.jne(outL);
            a.cmp(__dword_ptr[esi + 0x290], 0); a.jle(outL);
            a.cmp(__dword_ptr[edi], esi); a.je(own);
            a.mov(__dword_ptr[edi], esi); a.mov(__dword_ptr[edi + 4], 0); a.mov(__dword_ptr[edi + 28], 0);
            a.mov(eax, __dword_ptr[esi + 0x264]); a.mov(__dword_ptr[edi + 20], eax);
            a.mov(eax, __dword_ptr[esi + 0x26C]); a.mov(__dword_ptr[edi + 24], eax);
            a.Label(ref own);
            a.mov(eax, __dword_ptr[edi + 28]); a.test(eax, eax); a.jle(cd0);
            a.dec(eax); a.mov(__dword_ptr[edi + 28], eax); a.jmp(outL);
            a.Label(ref cd0);
            a.movss(xmm0, __dword_ptr[esi + 0x264]); a.subss(xmm0, __dword_ptr[edi + 20]); a.mulss(xmm0, xmm0);
            a.movss(xmm1, __dword_ptr[esi + 0x26C]); a.subss(xmm1, __dword_ptr[edi + 24]); a.mulss(xmm1, xmm1);
            a.addss(xmm0, xmm1); a.comiss(xmm0, __dword_ptr[cst("minedist2")]); a.jb(outL);
            a.mov(eax, __dword_ptr[esi + 0x264]); a.mov(__dword_ptr[edi + 20], eax);
            a.mov(eax, __dword_ptr[esi + 0x26C]); a.mov(__dword_ptr[edi + 24], eax);
            a.mov(eax, __dword_ptr[esi + 0x98]); a.mov(__dword_ptr[edi + 28], eax);
            // CreateUnit(гравець, "Akna", x, z, 0, NULL, 0, 0.0, false, 0) — як ванільний мінер (0x4c8ceb)
            a.push(0); a.push(0); a.push(0); a.push(0); a.push(0); a.push(0);
            a.push(__dword_ptr[esi + 0x26C]); a.push(__dword_ptr[esi + 0x264]);
            a.push(S("Akna")); a.push(__dword_ptr[esi + 0x258]);
            a.mov(ecx, __dword_ptr[esi]); a.call(CreateUnit);
            a.push(eax); a.push(0); a.mov(ecx, __dword_ptr[esi]); a.call(GetUnit);
            a.test(eax, eax); a.je(noset); a.mov(ecx, __dword_ptr[esi + 4]); a.mov(__dword_ptr[eax + 0x314], ecx);
            a.Label(ref noset);
            a.dec(__dword_ptr[esi + 0x290]);
            Log("ARC: unit %d laid a mine, %d left", Mem(esi, 0x290), Mem(esi, 4));
            a.jmp(outL);
            // локатор (4.2.5): кінець розкладання вух — обзор ×3 (+24 = 1, visunit заливає коло крізь дерева);
            // кінець складання — звичайний обзор, знову туман війни ([56h] = 0, клас видимості моделі) і модель зі складеними вухами.
            a.Label(ref radar);
            {
                var folded = a.CreateLabel(); var visOk = a.CreateLabel();
                a.cmp(__dword_ptr[edi], esi); a.jne(outL);
                a.mov(eax, __dword_ptr[edi + 28]); a.test(eax, eax); a.jle(outL);
                a.dec(eax); a.mov(__dword_ptr[edi + 28], eax); a.jne(outL);
                a.cmp(__dword_ptr[esi + 0x3A4], 0); a.je(folded);
                a.movss(xmm0, __dword_ptr[edi + 20]); a.mulss(xmm0, __dword_ptr[cst("radarmul")]); a.movss(__dword_ptr[esi + 0x44], xmm0);
                a.mov(__dword_ptr[edi + 24], 1);
                Log("ARC: unit %d ears open, sight x3%s", Imm((int)S("")), Mem(esi, 4));
                a.jmp(outL);
                a.Label(ref folded);
                a.mov(eax, __dword_ptr[edi + 20]); a.mov(__dword_ptr[esi + 0x44], eax);
                a.mov(__byte_ptr[esi + 0x56], 0);
                EarModel(false);
                // клас видимості моделі (SGroup::SetVisClass, vt+9Ch): LoadNewSkinObject сам ставить 2/3/0 за [58h]/[55h]/[56h];
                // інакше 1 — за картою огляду (туман війни), а своєму гравцеві 0 — як ServerInit.
                a.cmp(__dword_ptr[esi + 0x58], 2); a.je(visOk); a.cmp(__byte_ptr[esi + 0x55], 0); a.jne(visOk);
                a.mov(ecx, __dword_ptr[esi + 0x128]); a.test(ecx, ecx); a.jz(visOk);
                a.mov(eax, __dword_ptr[esi]); a.mov(eax, __dword_ptr[eax + 0x434]); a.cmp(eax, __dword_ptr[esi + 0x258]); a.setne(al); a.movzx(eax, al);
                a.mov(edx, __dword_ptr[ecx]); a.push(eax); a.call(__dword_ptr[edx + 0x9C]);
                a.Label(ref visOk);
                Log("ARC: unit %d ears folded, hidden%s", Imm((int)S("")), Mem(esi, 4));
            }
            a.Label(ref outL);
            a.popad(); a.push(ebp); a.mov(ebp, esp); a.and(esp, -8); a.jmp(0x4c7236UL);
        }

        // ── 8. SGameWorld::ServerInit: союзники стартують поруч ──
        // Було (0x4aca0b): jmp 4acb2e — кінець звичайної роздачі стартів (гравець N → "start N+1"), коли
        // випадкову розстановку в лобі вимкнено. Перед переходом переставляємо: перший гравець команди лишається
        // на своєму старті, кожен наступний бере вільний старт, найближчий до нього. Гравці без команди — як були.
        var spawn = a.CreateLabel("spawn");
        {
            uint sc = tableVa + (uint)SpawnScratch, CX = sc, CZ = sc + 32, VALID = sc + 64, USED = sc + 96, ANCH = sc + 128;
            var kloop = a.CreateLabel(); var aloop = a.CreateLabel(); var anext = a.CreateLabel(); var knext = a.CreateLabel();
            var init = a.CreateLabel(); var pass = a.CreateLabel(); var ploop = a.CreateLabel(); var pnext = a.CreateLabel();
            var noAnchor = a.CreateLabel(); var kk = a.CreateLabel(); var kkNext = a.CreateLabel(); var chosen = a.CreateLabel();
            var firstFree = a.CreateLabel(); var ff = a.CreateLabel(); var ffNext = a.CreateLabel(); var done = a.CreateLabel();
            a.Label(ref spawn);
            a.pushad(); a.mov(ebp, edi);
            // 1) центри стартових областей "start 1".."start 8"
            a.xor(ebx, ebx);
            a.Label(ref kloop);
            a.mov(__dword_ptr[ebx * 4 + VALID], 0); a.mov(__dword_ptr[ebx * 4 + USED], 0);
            a.xor(esi, esi);
            a.Label(ref aloop);
            a.cmp(esi, __dword_ptr[ebp + 0x500]); a.jge(knext);
            a.mov(eax, __dword_ptr[ebp + 0x4FC]); a.lea(ecx, __dword_ptr[esi + esi * 8]); a.lea(eax, __dword_ptr[eax + ecx * 4]);
            a.cmp(__dword_ptr[eax], 0x7FFFFFFF); a.jne(anext);
            a.push(eax); a.push(__dword_ptr[ebx * 4 + cst("startnames")]); a.push(__dword_ptr[eax + 0x14]);
            a.call(__dword_ptr[0x544460]); a.add(esp, 8); a.pop(ecx);                 // _stricmp(name, "start k")
            a.test(eax, eax); a.jne(anext);
            a.mov(eax, __dword_ptr[ecx + 4]); a.add(eax, __dword_ptr[ecx + 0xC]); a.mov(__dword_ptr[ebx * 4 + CX], eax);
            a.mov(eax, __dword_ptr[ecx + 8]); a.add(eax, __dword_ptr[ecx + 0x10]); a.mov(__dword_ptr[ebx * 4 + CZ], eax);
            a.mov(__dword_ptr[ebx * 4 + VALID], 1); a.jmp(knext);
            a.Label(ref anext); a.inc(esi); a.jmp(aloop);
            a.Label(ref knext); a.inc(ebx); a.cmp(ebx, 8); a.jl(kloop);
            a.xor(ebx, ebx);
            a.Label(ref init); a.mov(__dword_ptr[ebx * 4 + ANCH], -1); a.inc(ebx); a.cmp(ebx, 16); a.jl(init);
            // 2) два проходи: спершу гравці (тип 0/1), потім порожні слоти
            a.xor(edx, edx);                                                                // edx = номер проходу
            a.Label(ref pass);
            a.xor(esi, esi);                                                                // esi = гравець
            a.Label(ref ploop);
            a.imul(edi, esi, 0x5C); PlayerOff(edi); a.add(edi, ebp);                                       // edi = &гравець - 0xF8
            a.xor(eax, eax); a.cmp(__dword_ptr[edi + 0x100], 1); a.setbe(al);               // eax = активний
            a.xor(eax, 1); a.cmp(eax, edx); a.jne(pnext);                                    // прохід 0 — активні, 1 — решта
            a.mov(ecx, __dword_ptr[edi + 0x104]); a.and(ecx, 15);                            // ecx = команда
            a.test(ecx, ecx); a.je(noAnchor);
            a.mov(eax, __dword_ptr[ecx * 4 + ANCH]); a.test(eax, eax); a.js(noAnchor);
            // найближчий вільний старт до якоря eax
            a.push(edx); a.push(ecx);
            a.cvtsi2ss(xmm6, __dword_ptr[eax * 4 + CX]); a.cvtsi2ss(xmm7, __dword_ptr[eax * 4 + CZ]);
            a.mov(ebx, -1); a.movss(xmm5, __dword_ptr[cst("big")]); a.xor(eax, eax);
            a.Label(ref kk);
            a.cmp(__dword_ptr[eax * 4 + VALID], 0); a.je(kkNext); a.cmp(__dword_ptr[eax * 4 + USED], 0); a.jne(kkNext);
            a.cvtsi2ss(xmm0, __dword_ptr[eax * 4 + CX]); a.subss(xmm0, xmm6); a.mulss(xmm0, xmm0);
            a.cvtsi2ss(xmm1, __dword_ptr[eax * 4 + CZ]); a.subss(xmm1, xmm7); a.mulss(xmm1, xmm1); a.addss(xmm0, xmm1);
            a.comiss(xmm0, xmm5); a.jae(kkNext); a.movss(xmm5, xmm0); a.mov(ebx, eax);
            a.Label(ref kkNext); a.inc(eax); a.cmp(eax, 8); a.jl(kk);
            a.pop(ecx); a.pop(edx); a.jmp(chosen);
            // без якоря: свій старт, якщо вільний, інакше перший вільний
            a.Label(ref noAnchor);
            a.mov(ebx, __dword_ptr[edi + 0x10C]); a.cmp(ebx, 8); a.jae(firstFree);
            a.cmp(__dword_ptr[ebx * 4 + VALID], 0); a.je(firstFree); a.cmp(__dword_ptr[ebx * 4 + USED], 0); a.je(chosen);
            a.Label(ref firstFree); a.mov(ebx, -1); a.xor(eax, eax);
            a.Label(ref ff);
            a.cmp(__dword_ptr[eax * 4 + VALID], 0); a.je(ffNext); a.cmp(__dword_ptr[eax * 4 + USED], 0); a.jne(ffNext);
            a.mov(ebx, eax); a.jmp(chosen);
            a.Label(ref ffNext); a.inc(eax); a.cmp(eax, 8); a.jl(ff);
            a.Label(ref chosen);
            a.test(ebx, ebx); a.js(pnext);                                                   // немає вільних — як було
            a.mov(__dword_ptr[ebx * 4 + USED], 1); a.mov(__dword_ptr[edi + 0x10C], ebx);
            a.test(ecx, ecx); a.je(pnext); a.cmp(__dword_ptr[ecx * 4 + ANCH], 0); a.jge(pnext); a.mov(__dword_ptr[ecx * 4 + ANCH], ebx);
            a.Label(ref pnext); a.inc(esi); a.cmp(esi, 8); a.jl(ploop);
            a.inc(edx); a.cmp(edx, 2); a.jl(pass);
            a.Label(ref done);
            a.popad(); a.jmp(0x4acb2eUL);
        }

        // ── 8a. SGameWorld::ServerInit (початок): чистимо наш стан — таблиця юнітів і калюжі живуть у пам'яті
        //    між матчами, і без цього в новій грі могли б «ожити» старі калюжі чи таймери радара. ──
        // Було (0x4ac410): push ebp / mov ebp,esp / push -1
        var worldInit = a.CreateLabel("worldinit");
        {
            a.Label(ref worldInit);
            a.pushad(); a.cld();
            a.mov(edi, tableVa); a.xor(eax, eax); a.mov(ecx, (TableEntries * EntrySize) / 4); a.rep.stosd();
            a.mov(edi, ZONES); a.mov(ecx, Zones * 4 + 1); a.rep.stosd();                    // калюжі + індекс
            // спільне командування: біт k = зайняті і слот k, і слот 8 + k (однаково в усіх — дані слотів з лобі)
            {
                var none = a.CreateLabel(); var lp = a.CreateLabel(); var nx = a.CreateLabel();
                a.mov(__dword_ptr[tableVa + CoState], 0); a.mov(__dword_ptr[tableVa + CoState + 4], 0); a.mov(__dword_ptr[tableVa + CoState + 8], 0);
                a.mov(ecx, __dword_ptr[esp + 0x24]); a.test(ecx, ecx); a.jz(none);       // SMulti* (у грі на одного — 0)
                a.xor(esi, esi);
                a.Label(ref lp);
                a.imul(edx, esi, SlotSize);
                a.mov(eax, __dword_ptr[ecx + edx + SlotBase + 0x60]); a.or(eax, __dword_ptr[ecx + edx + SlotBase + 0x64]); a.jz(nx);
                a.mov(eax, __dword_ptr[ecx + edx + SlotBase + 8 * SlotSize + 0x60]); a.or(eax, __dword_ptr[ecx + edx + SlotBase + 8 * SlotSize + 0x64]); a.jz(nx);
                a.bts(__dword_ptr[tableVa + CoState], esi);
                a.Label(ref nx);
                a.inc(esi); a.cmp(esi, 8); a.jl(lp);
                Log("ARC: co-command armies mask %x", Imm(0), () => a.push(__dword_ptr[tableVa + CoState]));
                a.Label(ref none);
            }
            a.popad(); a.push(ebp); a.mov(ebp, esp); a.push(-1); a.jmp(0x4ac415UL);
        }

        // ── 9. SGameView::Create: атлас кнопок спецздібностей panel_spec.png ──
        // LoadFixedFont(ім'я, 35, 35, 7 стовпців, к-сть клітинок, таблиця клітинка→гліф, HD). Таблиця була на стеку
        // (48 клітинок); тепер — наша (cst "glyphs"), клітинок більше, атлас 512×1024 з іконками типів 12–14.
        // Було (0x4e0191): lea edx,[ebp-34h] / push 1 / push edx
        var glyphs = a.CreateLabel("glyphs");
        {
            a.Label(ref glyphs);
            a.push(1); a.push(cst("glyphs")); a.jmp(0x4e0197UL);
        }

        // ── 10. SQuickMarket::Create, список класів для кнопок: пропускаємо клас 12 (MovingForce) ──
        // Цикл тепер іде до N класів (раніше зупинявся на 12). Було (0x4f5217): cmp al,'-' / je 4f5254 / mov eax,[ebx+28ACh]
        var qmSkip = a.CreateLabel("qmskip");
        {
            a.Label(ref qmSkip);
            a.cmp(al, 0x2D); a.je(0x4f5254UL);
            a.cmp(esi, 12); a.je(0x4f5254UL);
            a.mov(eax, __dword_ptr[ebx + 0x28AC]); a.jmp(0x4f5221UL);
        }

        // ── 11. SMulti::Update: «+autostart N» у командному рядку — хост сам починає матч ──
        // Для перевірки мережевої гри кількома копіями на одному ПК (tools/mp-test.ps1) без кліків:
        // коли в хоста зайнято ≥ N слотів і так триває ~300 викликів Update (кілька секунд, щоб дані слотів
        // розійшлись), викликаємо SMulti::StartGame один раз. Без ключа нічого не змінюється.
        // Було (0x47df40): push ebp / mov ebp,esp / sub esp,2Ch
        var autoStart = a.CreateLabel("autostart");
        {
            uint ST = tableVa + AutoState;          // +0 розібрано, +4 N, +8 лічильник, +12 вже стартували
            var parsed = a.CreateLabel(); var loop = a.CreateLabel(); var next = a.CreateLabel();
            var done = a.CreateLabel(); var reset = a.CreateLabel();
            a.Label(ref autoStart);
            a.pushad();
            a.cmp(__dword_ptr[ST], 0); a.jne(parsed);
            a.mov(__dword_ptr[ST], 1);
            a.call(__dword_ptr[ImpArgc]); a.mov(ebx, __dword_ptr[eax]);
            a.call(__dword_ptr[ImpArgv]); a.mov(esi, __dword_ptr[eax]);
            a.mov(edi, 1);
            a.Label(ref loop);
            a.cmp(edi, ebx); a.jge(parsed);
            a.push(S("+autostart")); a.push(__dword_ptr[esi + edi * 4]); a.call(__dword_ptr[ImpStricmp]); a.add(esp, 8);
            a.test(eax, eax); a.jne(next);
            a.lea(eax, __dword_ptr[edi + 1]); a.cmp(eax, ebx); a.jge(parsed);
            a.push(__dword_ptr[esi + eax * 4]); a.call(Atoi); a.add(esp, 4);
            a.mov(__dword_ptr[ST + 4], eax);
            Log("ARC: autostart %d (players %d)", Imm(0), () => a.push(__dword_ptr[ST + 4]));
            a.jmp(parsed);
            a.Label(ref next);
            a.inc(edi); a.jmp(loop);
            a.Label(ref parsed);
            // «+race R» (перевірка рас, зокрема Воронів = 2): поки своя раса в слоті не R — раз на 200 викликів
            // SMulti::SendPlayerChangeRace(R), як вибір у списку лобі. Без ключа нічого не змінюється.
            {
                uint RA = tableVa + RaceArg;        // +0 розібрано, +4 R + 1 (0 — ключа нема), +8 лічильник
                var rParsed = a.CreateLabel(); var rLoop = a.CreateLabel(); var rNext = a.CreateLabel(); var rDone = a.CreateLabel();
                a.cmp(__dword_ptr[RA], 0); a.jne(rParsed);
                a.mov(__dword_ptr[RA], 1);
                a.call(__dword_ptr[ImpArgc]); a.mov(ebx, __dword_ptr[eax]);
                a.call(__dword_ptr[ImpArgv]); a.mov(esi, __dword_ptr[eax]);
                a.mov(edi, 1);
                a.Label(ref rLoop);
                a.cmp(edi, ebx); a.jge(rParsed);
                a.push(S("+race")); a.push(__dword_ptr[esi + edi * 4]); a.call(__dword_ptr[ImpStricmp]); a.add(esp, 8);
                a.test(eax, eax); a.jne(rNext);
                a.lea(eax, __dword_ptr[edi + 1]); a.cmp(eax, ebx); a.jge(rParsed);
                a.push(__dword_ptr[esi + eax * 4]); a.call(Atoi); a.add(esp, 4);
                a.inc(eax); a.mov(__dword_ptr[RA + 4], eax);
                a.jmp(rParsed);
                a.Label(ref rNext);
                a.inc(edi); a.jmp(rLoop);
                a.Label(ref rParsed);
                a.cmp(__dword_ptr[RA + 4], 0); a.je(rDone);
                a.mov(ecx, __dword_ptr[esp + 0x18]);                                   // this з pushad
                a.mov(eax, __dword_ptr[ecx + MySlot]); a.cmp(eax, 16); a.jae(rDone);
                a.imul(eax, eax, SlotSize);
                a.mov(edx, __dword_ptr[ecx + eax + SlotBase]); a.and(edx, 0xF); a.cmp(edx, 2); a.jne(rDone);   // слот зайнятий людиною
                a.movzx(edx, __byte_ptr[ecx + eax + SlotBase + 0x68]);                // раса слота (було +21F8h = слот +68h)
                a.mov(eax, __dword_ptr[RA + 4]); a.dec(eax); a.cmp(edx, eax); a.je(rDone);
                a.inc(__dword_ptr[RA + 8]); a.cmp(__dword_ptr[RA + 8], 200); a.jl(rDone);
                a.mov(__dword_ptr[RA + 8], 0);
                Log("ARC: +race %d (slot race %d)", () => a.push(edx), () => a.push(eax));
                a.push(eax); a.call(SendPlayerChangeRace);
                a.Label(ref rDone);
            }
            a.cmp(__dword_ptr[ST + 4], 0); a.jle(done);
            var notStarted = a.CreateLabel();
            a.cmp(__dword_ptr[ST + 12], 0); a.je(notStarted);
            // після старту: кожні 600 викликів — номер кадру lockstep у журнал (видно, що матч іде)
            a.inc(__dword_ptr[ST + 8]); a.cmp(__dword_ptr[ST + 8], 600); a.jl(done);
            a.mov(__dword_ptr[ST + 8], 0);
            a.mov(ecx, __dword_ptr[esp + 0x18]);
            Log("ARC: autostart frame %d slot %d", () => a.push(__dword_ptr[ecx + 0x2530]), () => a.push(__dword_ptr[ecx + 0x2154]));
            a.jmp(done);
            a.Label(ref notStarted);
            a.mov(ecx, __dword_ptr[esp + 0x18]);                       // this з pushad
            var isHost = a.CreateLabel();
            a.cmp(__dword_ptr[ecx + 0x220], 0); a.jne(isHost);          // хост — як у StartGame
            a.mov(__dword_ptr[ST + 12], 1); a.jmp(done);                // клієнт: лише журнал кадрів
            a.Label(ref isHost);
            {   // зайняті людьми слоти з усіх 16 (GetFullSlots рахує лише 0…7 — армії)
                var cl16 = a.CreateLabel(); var cn = a.CreateLabel();
                a.xor(eax, eax); a.xor(esi, esi);
                a.Label(ref cl16);
                a.imul(edx, esi, SlotSize); a.mov(edx, __dword_ptr[ecx + edx + SlotBase]); a.and(edx, 0xF); a.cmp(edx, 2); a.jne(cn); a.inc(eax);
                a.Label(ref cn);
                a.inc(esi); a.cmp(esi, 16); a.jl(cl16);
            }
            a.cmp(eax, __dword_ptr[ST + 4]); a.jl(reset);
            a.inc(__dword_ptr[ST + 8]); a.cmp(__dword_ptr[ST + 8], 300); a.jl(done);
            a.mov(__dword_ptr[ST + 12], 1); a.mov(__dword_ptr[ST + 8], 0);
            Log("ARC: autostart %d -> StartGame (%d)", Imm(0), () => a.push(__dword_ptr[ST + 4]));
            a.mov(ecx, __dword_ptr[esp + 0x18]); a.call(StartGame);
            a.jmp(done);
            a.Label(ref reset);
            a.mov(__dword_ptr[ST + 8], 0);
            a.Label(ref done);
            a.popad();
            a.push(ebp); a.mov(ebp, esp); a.sub(esp, 0x2C); a.jmp(0x47df46UL);
        }

        // ── 12. SMulti: кільце кадрів lockstep на 16 слотів (SFrameHistory[16] з +FrameBase) ──
        // Індекс запису = слот·83 + 47 + кадр % 83 (47·12 = 234h — стара база). «add eax,2Fh» — imm8, нову базу
        // (FrameBase/12) на місці не записати, тож ці дві інструкції переносимо сюди. Інші місця — smulti16.json.
        var frameSites = new (uint va, int len, Action tail, uint back)[] {
            (0x477f02, 6, () => a.mov(__dword_ptr[ebp - 0x10], esi), 0x477f08),   // AssembleDataPacket: + mov [ebp-10h],esi
            (0x477f32, 5, () => a.add(eax, edx), 0x477f37),                          // AssembleDataPacket (кадр-1)
            (0x477f5e, 5, () => a.add(eax, edx), 0x477f63),                          // AssembleDataPacket (кадр-2)
            (0x479d74, 5, () => a.add(eax, edi), 0x479d79),                          // GetFrameData
            (0x47a451, 5, () => a.add(eax, edi), 0x47a456),                          // HasFrameData
            (0x47d235, 5, () => a.add(eax, ecx), 0x47d23a),                          // SendFrameData
            (0x47dee3, 5, () => a.add(eax, esi), 0x47dee8),                          // StoreFrameData
        };
        var frameLabels = new List<Label>();
        foreach (var fs in frameSites)
        {
            var l = a.CreateLabel($"frame{fs.va:x}");
            a.Label(ref l);
            a.add(eax, FrameBase / 12); fs.tail(); a.jmp((ulong)fs.back);
            frameLabels.Add(l);
        }

        // ── 13. SMulti, етап 3: слоти 8…15 — другий командир армії (слот − 8) ──
        // Вільний слот: спершу відкритий з 0…7 (статус & 0Fh = 0), інакше 8 + k, де слот k зайнятий людиною (2),
        // а 8 + k відкритий. Поки GetFullAndOpenSlots рахує лише 0…7 (ліміт вхідних RakNet), дев'ятий не зайде —
        // це «ворота», їх відчиняємо останніми (docs/EXE_PATCH_14_UNITS.md, етап 3).
        var freeSlot16 = a.CreateLabel("freeslot16");
        {
            var l1 = a.CreateLabel(); var l2 = a.CreateLabel(); var nx = a.CreateLabel(); var ok = a.CreateLabel();
            a.Label(ref freeSlot16);
            a.push(edx); a.xor(eax, eax);
            a.Label(ref l1);
            a.imul(edx, eax, SlotSize); a.test(__dword_ptr[ecx + edx + SlotBase], 0xF); a.jz(ok);
            a.inc(eax); a.cmp(eax, 8); a.jl(l1);
            a.xor(eax, eax);
            a.Label(ref l2);
            a.imul(edx, eax, SlotSize); a.mov(edx, __dword_ptr[ecx + edx + SlotBase]); a.and(edx, 0xF); a.cmp(edx, 2); a.jne(nx);
            a.imul(edx, eax, SlotSize); a.test(__dword_ptr[ecx + edx + SlotBase + 8 * SlotSize], 0xF); a.jnz(nx);
            a.add(eax, 8); a.jmp(ok);
            a.Label(ref nx);
            a.inc(eax); a.cmp(eax, 8); a.jl(l2);
            a.or(eax, -1);
            a.Label(ref ok);
            a.pop(edx); a.ret();
        }
        // OnIntroductionMessage: вбудований пошук вільного слота → freeslot16 (результат у ebx, як було).
        // Було (0x47b1ce): xor ebx,ebx / lea eax,[edi+2190h]; далі test ebx,ebx / jns «знайдено» (0x47b1e9).
        var introSlot = a.CreateLabel("introslot");
        {
            a.Label(ref introSlot);
            a.push(eax); a.push(ecx); a.push(edx);
            a.mov(ecx, edi); a.call(freeSlot16); a.mov(ebx, eax);
            a.pop(edx); a.pop(ecx); a.pop(eax);
            a.jmp(0x47b1e9UL);
        }
        // ClearSlotArray: очищає лише 0…7 (розгорнуто). Хвіст об'єкта після new не обнулений — чистимо 8…15
        // і з'єднання 8…15 = −1. Було (0x478c57): mov dword ptr [esi+2504h],0 (тепер слот 7 +64h у новому місці).
        var clearSlots = a.CreateLabel("clearslots");
        {
            a.Label(ref clearSlots);
            a.mov(__dword_ptr[esi + SlotBase + 7 * SlotSize + 0x64], 0);
            a.push(edi); a.push(ecx); a.push(eax);
            a.lea(edi, __dword_ptr[esi + SlotBase + 8 * SlotSize]); a.xor(eax, eax); a.mov(ecx, 8 * SlotSize / 4); a.cld(); a.rep.stosd();
            a.lea(edi, __dword_ptr[esi + ConnBase + 8 * 4]); a.or(eax, -1); a.mov(ecx, 8); a.rep.stosd();
            a.lea(edi, __dword_ptr[esi + RecvBase + 8 * 4]); a.xor(eax, eax); a.mov(ecx, 8); a.rep.stosd();   // recv/req 8…15
            a.lea(edi, __dword_ptr[esi + ReqBase + 8 * 4]); a.mov(ecx, 8); a.rep.stosd();
            a.pop(eax); a.pop(ecx); a.pop(edi);
            a.jmp(0x478c61UL);
        }

        // Initialize (CreateInternetGame / CreateLanGame / JoinGame — і хост, і клієнт): те саме для 8…15. Конструктор
        // ставить −1 лише conn[0…7], а ClearSlotArray у клієнта не викликається: conn[8] = 0 (сміття нового об'єкта) —
        // і на дані порожнього слота 8 клієнт робив Disconnect(0), тобто відключався від хоста.
        // Було (0x47a543): mov dword ptr [esi+2154h],0
        var initTail = a.CreateLabel("inittail16");
        {
            a.Label(ref initTail);
            a.mov(__dword_ptr[esi + 0x2154], 0);
            a.push(edi); a.push(ecx); a.push(eax); a.cld();
            a.lea(edi, __dword_ptr[esi + SlotBase + 8 * SlotSize]); a.xor(eax, eax); a.mov(ecx, 8 * SlotSize / 4); a.rep.stosd();
            a.lea(edi, __dword_ptr[esi + RecvBase + 8 * 4]); a.mov(ecx, 8); a.rep.stosd();
            a.lea(edi, __dword_ptr[esi + ReqBase + 8 * 4]); a.mov(ecx, 8); a.rep.stosd();
            a.lea(edi, __dword_ptr[esi + ConnBase + 8 * 4]); a.or(eax, -1); a.mov(ecx, 8); a.rep.stosd();
            a.pop(eax); a.pop(ecx); a.pop(edi);
            a.jmp(0x47a54dUL);
        }

        // ── 14. SMulti, етап 3: розсилка слотам 8…15 і прийом від них ──
        // Байт +2 заголовка — 8-бітна маска «кому доставити / кому ретранслювати», граф зв'язності — 8×8.
        // Слотам 8…15 шлемо напряму (без ретрансляції) з маскою 0; слот ≥ 8 приймає все, що прийшло, і нічого не
        // ретранслює. Втрата зв'язку другого командира поки не відстежується (docs/EXE_PATCH_14_UNITS.md, етап 3).
        // Розсилка (SendBroadcastMessage, хвіст перед епілогом; esi = this, [ebp-14h] повідомлення, [ebp+10h] розмір,
        // [ebp-18h] тип, [ebp+8] «і собі»). Було (0x47cd51): mov ecx,[ebp-4] / pop edi / pop esi
        var sbmTail = a.CreateLabel("sbm16");
        {
            var direct = a.CreateLabel(); var lp = a.CreateLabel(); var nx = a.CreateLabel();
            a.Label(ref sbmTail);
            a.cmp(__dword_ptr[esi + MySlot], 8); a.jl(direct);
            a.cmp(__byte_ptr[ebp + 8], 0); a.je(direct);
            a.mov(ecx, __dword_ptr[ebp - 0x14]); a.mov(__byte_ptr[ecx + 2], 0);           // собі: оригінал ставить біт 1 << слот = 0
            a.push(__dword_ptr[ebp + 0x10]); a.push(ecx); a.push(-1);
            a.lea(ecx, __dword_ptr[esi + 4]); a.mov(eax, __dword_ptr[ecx]); a.call(__dword_ptr[eax + 0x10]);   // OnMessage(-1, msg, size)
            a.Label(ref direct);
            a.mov(edi, 8);
            a.Label(ref lp);
            a.cmp(edi, __dword_ptr[esi + MySlot]); a.je(nx);
            a.imul(eax, edi, SlotSize); a.mov(edx, __dword_ptr[esi + eax + SlotBase + 0x60]); a.or(edx, __dword_ptr[esi + eax + SlotBase + 0x64]); a.jz(nx);
            a.mov(eax, __dword_ptr[esi + edi * 4 + ConnBase]); a.cmp(eax, -1); a.je(nx);
            a.mov(ecx, __dword_ptr[ebp - 0x14]); a.mov(__byte_ptr[ecx + 2], 0);
            a.push(__dword_ptr[ebp - 0x18]); a.push(__dword_ptr[ebp + 0x10]); a.push(ecx); a.push(eax);
            a.mov(ecx, __dword_ptr[esi + ConnMgr]); a.call(CmSend);
            a.Label(ref nx);
            a.inc(edi); a.cmp(edi, 16); a.jl(lp);
            a.mov(ecx, __dword_ptr[ebp - 4]); a.pop(edi); a.pop(esi); a.jmp(0x47cd56UL);
        }
        // Адресна розсилка (SendMessageInternal, маска тепер 16 біт — Program.cs raws; ebx повідомлення, [ebp-1Ch] маска,
        // [ebp-18h] тип, [ebp+0Ch] розмір, [ebp-10h] this). Біти 8…15 — напряму. Було (0x47d675): mov ecx,[ebp-4] / pop edi / pop esi
        var smiTail = a.CreateLabel("smi16");
        {
            var lp = a.CreateLabel(); var nx = a.CreateLabel();
            a.Label(ref smiTail);
            a.mov(ecx, __dword_ptr[ebp - 0x10]); a.mov(esi, 8);
            a.Label(ref lp);
            a.cmp(esi, __dword_ptr[ecx + MySlot]); a.je(nx);
            a.bt(__dword_ptr[ebp - 0x1C], esi); a.jae(nx);
            a.mov(eax, __dword_ptr[ecx + esi * 4 + ConnBase]); a.cmp(eax, -1); a.je(nx);
            a.mov(__byte_ptr[ebx + 2], 0);
            a.push(__dword_ptr[ebp - 0x18]); a.push(__dword_ptr[ebp + 0x0C]); a.push(ebx); a.push(eax);
            a.mov(ecx, __dword_ptr[ecx + ConnMgr]); a.call(CmSend);
            a.mov(ecx, __dword_ptr[ebp - 0x10]);
            a.Label(ref nx);
            a.inc(esi); a.cmp(esi, 16); a.jl(lp);
            a.mov(ecx, __dword_ptr[ebp - 4]); a.pop(edi); a.pop(esi); a.jmp(0x47d67aUL);
        }
        // OnIntroductionMessage: відповідь новачку — маска 1 << слот у 32 бітах (для слота ≥ 8 «mov al,1 / shl al,cl» = 0).
        // Було (0x47b2b4): mov al,1 / shl al,cl / mov ecx,edi / push eax; далі mov [ebp-2CCh],eax (друга відповідь)
        var introMask = a.CreateLabel("intromask16");
        {
            a.Label(ref introMask);
            a.mov(eax, 1); a.shl(eax, cl); a.mov(ecx, edi); a.push(eax); a.jmp(0x47b2bbUL);
        }
        // OnMessage: я — слот ≥ 8 → без ретрансляції й перевірки маски, одразу до обробки за типом (0x47b551).
        // Було (0x47b4bd): mov eax,[ebx+252Ch] (ebx = this+4 → поле 2530h «мій слот»)
        var recv16 = a.CreateLabel("recv16");
        {
            var back = a.CreateLabel();
            a.Label(ref recv16);
            a.mov(eax, __dword_ptr[ebx + MySlot - 4]); a.cmp(eax, 8); a.jl(back);
            a.jmp(0x47b551UL);
            a.Label(ref back);
            a.jmp(0x47b4c3UL);
        }
        // Матриця «останній отриманий кадр» [8][8] (+2798h): записи з індексом ≥ 8 відкидаємо (інакше — поверх
        // сусідніх полів). OnMessage 0x98: esi = відправник, edx = про кого. Було (0x47c1cc): lea eax,[esi+edx*8] / mov [ebx+eax*4+2794h],ecx
        var lrfMsg = a.CreateLabel("lrf16msg");
        {
            var skip = a.CreateLabel();
            a.Label(ref lrfMsg);
            a.cmp(esi, 8); a.jae(skip); a.cmp(edx, 8); a.jae(skip);
            a.lea(eax, __dword_ptr[esi + edx * 8]); a.mov(__dword_ptr[ebx + eax * 4 + 0x2794], ecx);
            // Другий командир (мій слот ≥ 8) не веде UpdateConnectivity, тож «гравець edx відпав» (+2898h) дізнається з
            // цього ж повідомлення: 0x98 шлють лише під час StartSyncAfterDisconnect. Тоді IsDisconnected(edx) у нього
            // рахується з тих самих даних, що й у господарів армій, — і в той самий кадр.
            a.cmp(__dword_ptr[ebx + MySlot - 4], 8); a.jl(skip);
            a.mov(__byte_ptr[ebx + edx + 0x2894], 1);
            a.Label(ref skip);
            a.jmp(0x47c1d6UL);
        }
        // HandleLastReceivedFrameMessage(edi, esi, edx). Було (0x47a406): lea eax,[edi+esi*8] / mov [ecx+eax*4+2798h],edx
        var lrfFn = a.CreateLabel("lrf16fn");
        {
            var skip = a.CreateLabel();
            a.Label(ref lrfFn);
            a.cmp(edi, 8); a.jae(skip); a.cmp(esi, 8); a.jae(skip);
            a.lea(eax, __dword_ptr[edi + esi * 8]); a.mov(__dword_ptr[ecx + eax * 4 + 0x2798], edx);
            a.Label(ref skip);
            a.jmp(0x47a410UL);
        }
        // OnMessage 0x99 (рядок графа зв'язності від відправника cl): від слота ≥ 8 — ігноруємо (рядки графа лише 0…7).
        // Було (0x47c1f9): movups xmm0,[edi+4] / movzx esi,cl
        var graph16 = a.CreateLabel("graph16");
        {
            var ign = a.CreateLabel();
            a.Label(ref graph16);
            a.cmp(cl, 8); a.jae(ign);
            a.movups(xmm0, __xmmword_ptr[edi + 4]); a.movzx(esi, cl); a.jmp(0x47c200UL);
            a.Label(ref ign);
            a.jmp(0x47c230UL);
        }
        // UpdateConnectivity: у слота ≥ 8 рядок графа (this→граф + слот·20h) вийшов би за таблицю 8×8 — пропускаємо.
        // Було (0x47e000): push ebp / mov ebp,esp / sub esp,58h
        var conn16 = a.CreateLabel("conn16");
        {
            var orig = a.CreateLabel();
            a.Label(ref conn16);
            a.cmp(__dword_ptr[ecx + MySlot], 8); a.jl(orig);
            a.ret();
            a.Label(ref orig);
            a.push(ebp); a.mov(ebp, esp); a.sub(esp, 0x58); a.jmp(0x47e006UL);
        }

        // SetPingToolTips (лобі): пінги з рядка графа «мій слот» — для слота ≥ 8 його немає, підказки не ставимо.
        // Було (0x47da11): call UpdateConnectivity
        var pingTips = a.CreateLabel("pingtips16");
        {
            a.Label(ref pingTips);
            a.call(0x47e000UL);
            a.cmp(__dword_ptr[ebx + MySlot], 8); a.jae(0x47db02UL);
            a.jmp(0x47da16UL);
        }

        // DisplaySlotData (лобі): ім'я в рядку армії k — перший пункт списку. Якщо зайнятий слот 8 + k, показуємо
        // «ім'я + ім'я другого командира» (рядків лише 8). Список тепер перезаповнюється щоразу (Program.cs raws).
        // Було (0x47949e): add ecx,3A84h / push eax / add ecx,ebx; eax = ім'я, esi = this, edi = k
        var coName = a.CreateLabel("coname16");
        {
            var plain = a.CreateLabel(); var l1 = a.CreateLabel(); var d1 = a.CreateLabel(); var l2 = a.CreateLabel();
            a.Label(ref coName);
            a.add(ecx, 0x3A84); a.push(ecx);
            a.lea(edx, __dword_ptr[edi + 8]); a.imul(edx, edx, SlotSize);
            a.mov(ecx, __dword_ptr[esi + edx + SlotBase + 0x60]); a.or(ecx, __dword_ptr[esi + edx + SlotBase + 0x64]); a.jz(plain);
            a.push(esi); a.push(edi); a.cld();
            a.mov(ecx, edi); a.shl(ecx, 7); a.add(ecx, (int)(tableVa + CoNames)); a.push(ecx);
            a.mov(esi, eax); a.mov(edi, ecx);
            a.Label(ref l1); a.lodsb(); a.test(al, al); a.jz(d1); a.stosb(); a.jmp(l1);
            a.Label(ref d1);
            a.mov(al, 0x20); a.stosb(); a.mov(al, 0x2B); a.stosb(); a.mov(al, 0x20); a.stosb();
            a.mov(esi, __dword_ptr[esp + 8]); a.lea(esi, __dword_ptr[esi + edx + SlotBase + 4]);
            a.Label(ref l2); a.lodsb(); a.stosb(); a.test(al, al); a.jnz(l2);
            a.pop(eax); a.pop(edi); a.pop(esi);
            a.Label(ref plain);
            a.pop(ecx); a.push(eax); a.add(ecx, ebx); a.jmp(0x4794a7UL);
        }

        // ── 15. Етап 3: ворота, вихід гравця, бій ──
        // Ворота: GetFullAndOpenSlots (→ SetMaxPlayers, ліміт вхідних) — відкриті й зайняті з 0…7 плюс місце другого
        // командира 8 + k (відкрите чи зайняте) у кожної зайнятої людиною армії k. Було (0x479de0): mov edx,[ecx+2190h]
        var gate16 = a.CreateLabel("gate16");
        {
            var lp = a.CreateLabel(); var one = a.CreateLabel(); var two = a.CreateLabel(); var nx = a.CreateLabel();
            a.Label(ref gate16);
            a.push(esi); a.push(edi); a.push(edx);
            a.xor(eax, eax); a.xor(esi, esi);
            a.Label(ref lp);
            a.imul(edi, esi, SlotSize);
            a.mov(edx, __dword_ptr[ecx + edi + SlotBase]); a.and(edx, 0xF); a.jz(one);
            a.cmp(edx, 2); a.jne(nx);
            a.mov(edx, __dword_ptr[ecx + edi + SlotBase + 8 * SlotSize]); a.and(edx, 0xF); a.jz(two);
            a.cmp(edx, 2); a.jne(one);
            a.Label(ref two); a.inc(eax);
            a.Label(ref one); a.inc(eax);
            a.Label(ref nx);
            a.inc(esi); a.cmp(esi, 8); a.jl(lp);
            a.pop(edx); a.pop(edi); a.pop(esi); a.ret();
        }
        // IsDisconnected(слот ≥ 8): «вийшов» = GUID слота порожній (RemovePlayerFromStage чистить його при відключенні);
        // матриця кадрів і +2898h — лише 8. Було (0x47a880): push ebp / mov ebp,esp / push ebx / mov ebx,[ebp+8]
        var isDisc16 = a.CreateLabel("isdisc16");
        {
            var orig = a.CreateLabel();
            a.Label(ref isDisc16);
            a.mov(eax, __dword_ptr[esp + 4]); a.cmp(eax, 8); a.jl(orig);
            a.imul(eax, eax, SlotSize); a.mov(edx, __dword_ptr[ecx + eax + SlotBase + 0x60]); a.or(edx, __dword_ptr[ecx + eax + SlotBase + 0x64]);
            a.sete(al); a.ret(8);
            a.Label(ref orig);
            a.push(ebp); a.mov(ebp, esp); a.push(ebx); a.mov(ebx, __dword_ptr[ebp + 8]); a.jmp(0x47a887UL);
        }
        // ConnectivityGraph::ClearPeerInfo(слот ≥ 8) писав би за таблицю 8×8 (OnDisconnected, OnMessage, OnSlotDataMessage).
        // Було (0x475360): push ebp / mov ebp,esp / mov eax,[ebp+8]
        var clearPeer16 = a.CreateLabel("clearpeer16");
        {
            var orig = a.CreateLabel();
            a.Label(ref clearPeer16);
            a.cmp(__dword_ptr[esp + 4], 8); a.jl(orig);
            a.ret(4);
            a.Label(ref orig);
            a.push(ebp); a.mov(ebp, esp); a.mov(eax, __dword_ptr[ebp + 8]); a.jmp(0x475366UL);
        }
        // Бій (SGameWorld::ServerRefresh, lockstep). Кадри слота 8 + k виконуються від імені армії k, одразу після кадрів k.
        // Правило однакове в усіх копіях: армія k у масці CoState (другий командир був на старті) і кадр слота 8 + k є.
        // Чекаємо його, поки слот 8 + k зайнятий (вихід гравця — GUID порожній — не чекаємо).
        // Очікування: обгортка HasFrameData(k, кадр). ebx = світ, esi = k, [ebp-20h] = тік. Було (0x4ae92a): call HasFrameData
        var waitCo = a.CreateLabel("waitco");
        var coCheck = a.CreateLabel("cocheck");
        {
            var back = a.CreateLabel(); var gone = a.CreateLabel(); var wait = a.CreateLabel();
            a.Label(ref waitCo);
            a.call(HasFrameData);
            a.test(al, al); a.jz(back);
            a.bt(__dword_ptr[tableVa + CoState], esi); a.jae(back);
            a.Label(ref coCheck);                                                  // сюди ж — армія без господаря (discCo)
            a.lea(eax, __dword_ptr[esi + 8]); a.push(__dword_ptr[ebx + 0x1B14]); a.push(eax); a.mov(ecx, __dword_ptr[ebx + 0x1B10]); a.call(HasFrameData);
            a.test(al, al); a.jnz(back);
            a.lea(eax, __dword_ptr[esi + 8]); a.push(eax); a.mov(ecx, __dword_ptr[ebx + 0x1B10]); a.call(GetSlots);
            a.test(al, al); a.jz(gone);
            // кадру ще немає: запит «надішліть пакети слота 8 + k» не частіше ніж раз на 200 мс (як для звичайних)
            a.mov(ecx, __dword_ptr[ebx + 0x1B10]); a.mov(eax, __dword_ptr[ecx + esi * 4 + ReqBase + 8 * 4]); a.add(eax, 200);
            a.cmp(eax, __dword_ptr[ebp - 0x20]); a.ja(wait);
            a.mov(eax, __dword_ptr[ebx + 0x1B14]); a.dec(eax); a.push(eax); a.lea(eax, __dword_ptr[esi + 8]); a.push(eax); a.call(SendMePackets);
            a.Label(ref wait);
            a.xor(al, al); a.jmp(back);
            a.Label(ref gone);
            a.mov(al, 1);
            a.Label(ref back);
            a.jmp(0x4ae92fUL);
        }
        // StartSyncAfterDisconnect: «мій останній кадр від гравця, що відпав» (0x98) — ще й зайнятим слотам 8…15, інакше
        // другі командири не дізнаються про відключення й чекають кадрів того гравця вічно (тест 23.11: стоп на 783).
        // Було (0x47dea7): push dword ptr [ebp+8] (маска 0…7) / lea eax,[ebp-0Ch]; esi = this
        var syncMask = a.CreateLabel("syncmask16");
        {
            var lp = a.CreateLabel(); var nx = a.CreateLabel();
            a.Label(ref syncMask);
            // ebx/ecx/edx далі не потрібні: після виклику SendMessageInternal — pop edi/esi/ebx і ret
            a.movzx(eax, __byte_ptr[ebp + 8]); a.mov(ecx, 8);
            a.Label(ref lp);
            a.imul(ebx, ecx, SlotSize); a.mov(edx, __dword_ptr[esi + ebx + SlotBase + 0x60]); a.or(edx, __dword_ptr[esi + ebx + SlotBase + 0x64]); a.jz(nx);
            a.bts(eax, ecx);
            a.Label(ref nx);
            a.inc(ecx); a.cmp(ecx, 16); a.jl(lp);
            a.push(eax); a.lea(eax, __dword_ptr[ebp - 0x0C]); a.jmp(0x47deadUL);
        }

        // Господар армії k пішов (IsDisconnected(k) — той самий момент, що у ванільній грі), а другий командир був на
        // старті: армію не прибираємо. Біт k у CoState+8 — «без господаря»: кадрів слота k більше не чекаємо й не
        // виконуємо, лише слота 8 + k. Було (0x4ae8e4): test al,al / je 4ae91e / push dword ptr [edi+3Ch]
        var discCo = a.CreateLabel("discco");
        {
            var remove = a.CreateLabel();
            a.Label(ref discCo);
            // IsDisconnected(k) каже «пішов» лише в один узгоджений кадр (ваніль тоді ж прибирає армію); далі знову
            // «на місці» — і без цієї перевірки гра чекала б кадрів господаря вічно («Ожидание данных от P2»).
            a.bt(__dword_ptr[tableVa + CoState + 8], esi); a.jc(coCheck);
            a.test(al, al); a.jz(0x4ae91eUL);
            a.bt(__dword_ptr[tableVa + CoState], esi); a.jae(remove);
            a.bts(__dword_ptr[tableVa + CoState + 8], esi); a.jc(coCheck);
            Log("ARC: army %d owner left, co-commander keeps it", Imm(0), Reg(esi));
            a.jmp(coCheck);
            a.Label(ref remove);
            a.push(__dword_ptr[edi + 0x3C]); a.jmp(0x4ae8ebUL);
        }
        // Виконання армії без господаря: GetFrameData(k) пропускаємо (кадрів k немає), одразу до кадру 8 + k (procCo).
        // Було (0x4aeac5): call GetFrameData (аргументи вже в стеку)
        var getFrameCo = a.CreateLabel("getframeco");
        {
            var normal = a.CreateLabel();
            a.Label(ref getFrameCo);
            a.bt(__dword_ptr[tableVa + CoState + 8], esi); a.jae(normal);
            a.add(esp, 12); a.jmp(0x4aeadeUL);
            a.Label(ref normal);
            a.call(GetFrameData); a.jmp(0x4aeacaUL);
        }

        // Виконання: після ProcessPacket(k, буфер) — той самий буфер наново, GetFrameData(8 + k) і ProcessPacket(k).
        // Було (0x4aeade): lea ecx,[ebp-54h] / mov dword ptr [ebp-4],-1 (далі виклик деструктора буфера)
        var procCo = a.CreateLabel("procco");
        {
            var done = a.CreateLabel();
            a.Label(ref procCo);
            {   // перевірка синхронності для тестів: раз на 256 кадрів (у гравця 0) — сума стану юнітів у журнал.
                // У всіх копій у тому самому кадрі вона має збігатися; «co» — скільки пакетів других командирів виконано.
                var skipH = a.CreateLabel(); var lp = a.CreateLabel(); var nx = a.CreateLabel(); var end = a.CreateLabel();
                a.test(esi, esi); a.jnz(skipH);
                a.test(__dword_ptr[ebx + 0x1B14], 0xFF); a.jnz(skipH);
                a.pushad();
                a.xor(edx, edx); a.xor(ecx, ecx); a.mov(esi, __dword_ptr[ebx + 0x43C]);
                a.Label(ref lp);
                a.cmp(ecx, __dword_ptr[ebx + 0x440]); a.jge(end);
                a.cmp(__dword_ptr[esi + ecx * 8], 0x7FFFFFFF); a.jne(nx);
                a.mov(edi, __dword_ptr[esi + ecx * 8 + 4]); a.test(edi, edi); a.jz(nx);
                a.rol(edx, 5); a.xor(edx, __dword_ptr[edi + 0x264]); a.rol(edx, 5); a.xor(edx, __dword_ptr[edi + 0x26C]);
                a.rol(edx, 5); a.xor(edx, __dword_ptr[edi + 0x290]); a.add(edx, ecx);
                a.Label(ref nx);
                a.inc(ecx); a.jmp(lp);
                a.Label(ref end);
                Log("ARC: sync frame %d hash %x", Reg(edx), Mem(ebx, 0x1B14));
                Log("ARC: sync co packets %d (mask %x)", () => a.push(__dword_ptr[tableVa + CoState]), () => a.push(__dword_ptr[tableVa + CoState + 4]));
                a.popad();
                a.Label(ref skipH);
            }
            a.bt(__dword_ptr[tableVa + CoState], esi); a.jae(done);
            a.lea(eax, __dword_ptr[esi + 8]); a.push(__dword_ptr[ebx + 0x1B14]); a.push(eax); a.mov(ecx, __dword_ptr[ebx + 0x1B10]); a.call(HasFrameData);
            a.test(al, al); a.jz(done);
            a.lea(ecx, __dword_ptr[ebp - 0x54]); a.call(StreamBufDtor);
            a.lea(ecx, __dword_ptr[ebp - 0x54]); a.call(StreamBufCtor);
            a.lea(eax, __dword_ptr[ebp - 0x54]); a.push(eax); a.push(__dword_ptr[ebx + 0x1B14]); a.lea(eax, __dword_ptr[esi + 8]); a.push(eax);
            a.mov(ecx, __dword_ptr[ebx + 0x1B10]); a.call(GetFrameData);
            a.test(al, al); a.jz(done);
            a.lea(eax, __dword_ptr[ebp - 0x54]); a.push(eax); a.push(esi); a.mov(ecx, ebx); a.call(ProcessPacket);
            a.inc(__dword_ptr[tableVa + CoState + 4]);
            a.Label(ref done);
            a.lea(ecx, __dword_ptr[ebp - 0x54]); a.mov(__dword_ptr[ebp - 4], -1); a.jmp(0x4aeae8UL);
        }

        // ── Головне меню: під рядком «S.W.I.N.E. HD Remaster v1.7.1846» — «Arcanum Nexus Mod v…» (ModLine). ──
        // SMenu::Create(name, true) робить текстовий кадр [edi+194h] у (5, 3) і фарбує його 0xF0F0F0. Ми додаємо
        // такий самий кадр на висоту першого рядка нижче. Текст гра малює з DT_SINGLELINE, тож «\n» не підходить.
        // Кадр і його власник — у MenuVer (+0 кадр + 1, 0 = нема; +4 SMenu*); ~SMenu прибирає свій кадр.
        // Було (0x4f9ac7): mov ecx,[Board] / далі push 0F0F0F0h; edi = SMenu*
        var menuVer = a.CreateLabel("menuver");
        {
            var fresh = a.CreateLabel();
            uint MV = tableVa + MenuVer;
            a.Label(ref menuVer);
            a.pushad();
            a.mov(eax, __dword_ptr[MV]); a.test(eax, eax); a.je(fresh);          // кадр попереднього меню — прибрати
            a.dec(eax); a.push(eax); a.mov(ecx, __dword_ptr[BoardVar]); a.mov(edx, __dword_ptr[ecx]); a.call(__dword_ptr[edx + 4]);
            a.mov(__dword_ptr[MV], 0);
            a.Label(ref fresh);
            a.sub(esp, 8);                                                        // [esp] w, [esp+4] h першого рядка
            a.lea(eax, __dword_ptr[esp + 4]); a.push(eax); a.lea(eax, __dword_ptr[esp + 4]); a.push(eax);
            a.push(__dword_ptr[edi + 0x194]); a.mov(ecx, __dword_ptr[BoardVar]); a.mov(edx, __dword_ptr[ecx]); a.call(__dword_ptr[edx + 0x1C]);   // GetFrameSize
            a.mov(ebx, __dword_ptr[esp + 4]); a.add(esp, 8); a.add(ebx, 3);
            a.mov(ecx, __dword_ptr[edi + 0x14]); a.mov(eax, __dword_ptr[ecx]); a.call(__dword_ptr[eax + 0x70]);   // батьківський кадр (SDXWidget::GetFrame)
            a.push(1); a.push(0); a.push(ebx); a.push(5); a.push(eax); a.push(2);
            a.mov(ecx, __dword_ptr[BoardVar]); a.mov(edx, __dword_ptr[ecx]); a.call(__dword_ptr[edx]);            // CreateFrame(текст, батько, 5, 3 + h, 0, 1)
            a.mov(esi, eax); a.lea(eax, __dword_ptr[esi + 1]); a.mov(__dword_ptr[MV], eax); a.mov(__dword_ptr[MV + 4], edi);
            a.push(S(ModLine)); a.push(0); a.push(0); a.push(esi);
            a.mov(ecx, __dword_ptr[BoardVar]); a.mov(edx, __dword_ptr[ecx]); a.call(__dword_ptr[edx + 0x2C]);     // SetText
            a.push(0xF0F0F0); a.push(esi);
            a.mov(ecx, __dword_ptr[BoardVar]); a.mov(edx, __dword_ptr[ecx]); a.call(__dword_ptr[edx + 0x28]);     // SetTextColor
            a.popad();
            a.mov(ecx, __dword_ptr[BoardVar]); a.jmp(0x4f9acdUL);
        }
        // ── #3 Ворони: третій пункт у списку раси лобі. SChatRoomMenu::Create додає «SWINE_RABBIT», «SWINE_PIG» (індекс =
        //    раса) і ставить вибір [ebx+916Ch]. Додаємо «SWINE_RAVEN» (messages.ini, arc-units.js → raven-race.js) — раса 2.
        // Було (0x4d912f): movzx eax,byte ptr [ebx+916Ch]; esi = SDropList*, ebx = SChatRoomMenu*
        var lobbyRace = a.CreateLabel("lobbyrace");
        {
            a.Label(ref lobbyRace);
            a.push(0); a.push(1); a.push(S("SWINE_RAVEN")); a.call(GetTextFn); a.add(esp, 4);
            a.mov(ecx, esi); a.push(eax); a.call(DropAddItem);
            a.movzx(eax, __byte_ptr[ebx + 0x916C]); a.jmp(0x4d9136UL);
        }
        // #3: список армій у лобі — маска «R*.army» для раси 0, інакше «P*.army». Для раси 2 — «V*.army» (SaveArmy, Program.cs).
        // Було (0x4dac50): mov ax,word ptr ["P"]; esi = SChatRoomMenu*, [esi+916Ch] — своя раса
        var armyPrefix = a.CreateLabel("armyprefix");
        {
            var back = a.CreateLabel();
            a.Label(ref armyPrefix);
            a.cmp(__byte_ptr[esi + 0x916C], 2);
            a.mov(ax, __word_ptr[0x555678]);                      // рядок "P" гри (2 байти: P і нуль)
            a.jne(back);
            a.mov(ax, __word_ptr[S("RPV") + 2]);                  // "V" і нуль — кінець рядка "RPV"
            a.Label(ref back);
            a.jmp(0x4dac56UL);
        }
        // ~SMenu: прибрати наш кадр, якщо він цього меню. Було (0x4f971d): mov ecx,esi / call ~SDXWidget; esi = SMenu*
        var menuVerDtor = a.CreateLabel("menuverdtor");
        {
            var keep = a.CreateLabel();
            uint MV = tableVa + MenuVer;
            a.Label(ref menuVerDtor);
            a.cmp(__dword_ptr[MV + 4], esi); a.jne(keep);
            a.mov(eax, __dword_ptr[MV]); a.test(eax, eax); a.je(keep);
            a.dec(eax); a.push(eax); a.mov(ecx, __dword_ptr[BoardVar]); a.mov(edx, __dword_ptr[ecx]); a.call(__dword_ptr[edx + 4]);   // DestroyFrame
            a.mov(__dword_ptr[MV], 0); a.mov(__dword_ptr[MV + 4], 0);
            a.Label(ref keep);
            a.mov(ecx, esi); a.call(SDXWidgetDtor); a.jmp(0x4f9724UL);
        }

        // ── Авіаудар (#10, #3 Ворони): кролики 100 SP, свині 50 SP, ворони 35 SP (платний Varju bombazo) або 0 SP з КД 45 с ("freeair" → Varju taktikai bombazo). ──
        // SUnit::EC_SpecTargetGround (0x4bc609): push 32h / push [esi+258h] → TryToBuy(гравець, ціна); edi = світ, esi = юніт
        var airBuy = a.CreateLabel("airbuy");
        {
            var paid = a.CreateLabel(); var fOwn = a.CreateLabel(); var fReady = a.CreateLabel();
            var notRab = a.CreateLabel(); var priceOk = a.CreateLabel();
            a.Label(ref airBuy);
            Strstr(esi, "freeair"); a.test(eax, eax); a.je(paid);
            a.mov(eax, __dword_ptr[esi + 4]); a.cmp(eax, TableEntries); a.jae(0x4bc654UL);
            a.shl(eax, 5); a.add(eax, tableVa);
            a.cmp(__dword_ptr[eax], esi); a.je(fOwn);
            a.mov(__dword_ptr[eax], esi); a.mov(__dword_ptr[eax + 4], 0); a.mov(__dword_ptr[eax + 24], 0); a.mov(__dword_ptr[eax + 28], 0);
            a.Label(ref fOwn);
            a.cmp(__dword_ptr[eax + 28], 0); a.jle(fReady);
            Log("ARC: unit %d freeair cooldown %d", Mem(eax, 28), Mem(esi, 4));
            a.jmp(0x4bc654UL);
            a.Label(ref fReady);
            a.mov(__dword_ptr[eax + 28], FreeAirCooldown);
            Log("ARC: unit %d called freeair strike%s", Imm((int)S("")), Mem(esi, 4));
            a.xor(eax, eax); a.jmp(priceOk);

            a.Label(ref paid);
            a.mov(eax, __dword_ptr[esi + 0x258]); a.imul(eax, eax, 0x5C); PlayerOff(eax);
            a.mov(ecx, __dword_ptr[edi + eax + 0xFC]);
            a.cmp(ecx, 0); a.jne(notRab); a.mov(eax, AirPriceRabbit); a.jmp(priceOk);
            a.Label(ref notRab);
            a.mov(eax, AirPricePig); a.cmp(ecx, 2); a.jne(priceOk); a.mov(eax, AirPriceRaven);
            a.Label(ref priceOk);
            a.push(eax); a.push(__dword_ptr[esi + 0x258]); a.jmp(0x4bc611UL);
        }
        // SGameWorld::IsBomberAvailable, мережа (0x4a5f5d): cmp [eax+esi+138h],32h — гроші гравця eax/5Ch ≥ ціни
        // Для раси 2 (Ворони) поріг = 0 SP, бо машини з "freeair" викликають тактичний наліт безкоштовно, а платні
        // перевіряються через TryToBuy(35) в airBuy.
        var airAvail = a.CreateLabel("airavail");
        {
            var notRab = a.CreateLabel(); var checkSp = a.CreateLabel();
            a.Label(ref airAvail);
            a.push(edx);
            a.mov(edx, __dword_ptr[eax + esi + 0xFC]);
            a.cmp(edx, 0); a.jne(notRab); a.mov(edx, AirPriceRabbit); a.jmp(checkSp);
            a.Label(ref notRab);
            a.cmp(edx, 2); a.mov(edx, AirPricePig); a.jne(checkSp); a.xor(edx, edx);
            a.Label(ref checkSp);
            a.cmp(__dword_ptr[eax + esi + 0x138], edx); a.pop(edx); a.setge(al); a.jmp(0x4a5f78UL);
        }
        // те саме в кампанії (0x4a5f72): cmp eax(SP кампанії),32h / setge al; гравець — [esi+434h]
        var airAvailCamp = a.CreateLabel("airavailcamp");
        {
            var notRab = a.CreateLabel(); var checkSp = a.CreateLabel();
            a.Label(ref airAvailCamp);
            a.push(edx); a.mov(edx, __dword_ptr[esi + 0x434]); a.imul(edx, edx, 0x5C); PlayerOff(edx);
            a.mov(edx, __dword_ptr[edx + esi + 0xFC]);
            a.cmp(edx, 0); a.jne(notRab); a.mov(edx, AirPriceRabbit); a.jmp(checkSp);
            a.Label(ref notRab);
            a.cmp(edx, 2); a.mov(edx, AirPricePig); a.jne(checkSp); a.xor(edx, edx);
            a.Label(ref checkSp);
            a.cmp(eax, edx); a.pop(edx); a.setge(al); a.jmp(0x4a5f78UL);
        }
        // SGameWorld::AirStrike (0x49e1da): вибір секції літака за расою ([ecx+ebx+FCh]) і тим, хто викликав ([ebp+14h]):
        // 0 → "Nyul bombazo" (вже в esi), 1 → "Diszno bombazo", 2 → "Varju taktikai bombazo" (якщо "freeair") або "Varju bombazo".
        // Було (0x49e1da): mov eax, offset "Diszno bombazo" (0x552370) / cmovne esi, eax
        var airPick = a.CreateLabel("airpick");
        {
            var notPig = a.CreateLabel(); var donePop = a.CreateLabel(); var donePick = a.CreateLabel();
            a.Label(ref airPick);
            a.mov(eax, __dword_ptr[ecx + ebx + 0xFC]);
            a.cmp(eax, 1); a.jne(notPig);
            a.mov(esi, 0x552370); a.jmp(donePick);
            a.Label(ref notPig);
            a.cmp(eax, 2); a.jne(donePick);
            a.mov(esi, S("Varju bombazo"));
            a.sub(esp, 4); a.movss(__dword_ptr[esp], xmm0);
            a.push(ecx); a.push(edx);
            a.push(__dword_ptr[ebp + 0x14]); a.push(0); a.mov(ecx, ebx); a.call(GetUnit);
            a.test(eax, eax); a.je(donePop);
            Strstr(eax, "freeair"); a.test(eax, eax); a.je(donePop);
            a.mov(esi, S("Varju taktikai bombazo"));
            a.Label(ref donePop);
            a.pop(edx); a.pop(ecx);
            a.movss(xmm0, __dword_ptr[esp]); a.add(esp, 4);
            a.Label(ref donePick);
            a.jmp(0x49e1e2UL);
        }

        // ── Політ бомбардувальника (SUnit::AirPlaneCallBack, 0x4b722e):
        //    1) Перехоплення ППО «Сапсан-ЗРК» (sokolzrk): на першому тіку скидання бомб ([ebx+9B4h]==1, [918h]==0, [914h]==0),
        //       якщо в радіусі 14 клітинок є ворожий живий sokolzrk із боєзапасом > 0 — списуємо 1 ракету й зриваємо скидання ([ebx+9B4h]=2)!
        //    2) Точне скидання бомб при підвищеній швидкості літака (повертаємо vx/vz бомб до 4.8):
        //       кролики (14.4) → ×1/3; ворони важкий (9.6) → ×1/2; ворони тактичний (12.0) → ×2/5.
        // Було (0x4b722e): fmul dword ptr [esp+18h] / fstp dword ptr [esp+20h]; ebx = SUnit*, eax = [ebx+9A8h]
        var airBomb = a.CreateLabel("airbomb");
        {
            var done = a.CreateLabel(); var noSam = a.CreateLabel(); var samLoop = a.CreateLabel(); var samNext = a.CreateLabel();
            var notRab = a.CreateLabel(); var notRav = a.CreateLabel(); var takBomb = a.CreateLabel(); var applyMul = a.CreateLabel();
            a.Label(ref airBomb);
            a.fmul(__dword_ptr[esp + 0x18]);
            a.fstp(__dword_ptr[esp + 0x20]);
            a.cmp(__dword_ptr[ebx + 0x9B4], 1); a.jne(done);
            a.pushad();
            // 1) ППО Сапсан-ЗРК: перевіряємо лише на старті бомбометання ([918h]==0 і [914h]==0)
            a.mov(eax, __dword_ptr[ebx + 0x918]); a.or(eax, __dword_ptr[ebx + 0x914]); a.jne(noSam);
            a.mov(ebp, __dword_ptr[ebx]);                                           // ebp = SGameWorld*
            a.xor(edi, edi);
            a.Label(ref samLoop);
            a.cmp(edi, __dword_ptr[ebp + 0x440]); a.jge(noSam);
            a.mov(eax, __dword_ptr[ebp + 0x43C]);
            a.cmp(__dword_ptr[eax + edi * 8], 0x7FFFFFFF); a.jne(samNext);
            a.mov(esi, __dword_ptr[eax + edi * 8 + 4]); a.test(esi, esi); a.jz(samNext);
            a.cmp(__byte_ptr[esi + 0x58], 0); a.jne(samNext);                       // живий
            a.cmp(__dword_ptr[esi + 0x290], 0); a.jle(samNext);                     // є ракети
            a.mov(eax, __dword_ptr[esi + 0x258]); a.mov(edx, __dword_ptr[ebx + 0x258]);
            a.mov(ecx, ebp); a.call(sameSide); a.test(eax, eax); a.jne(samNext);    // ворожий
            Strstr(esi, "sokolzrk"); a.test(eax, eax); a.je(samNext);
            a.movss(xmm0, __dword_ptr[esi + 0x264]); a.subss(xmm0, __dword_ptr[ebx + 0x264]); a.mulss(xmm0, xmm0);
            a.movss(xmm1, __dword_ptr[esi + 0x26C]); a.subss(xmm1, __dword_ptr[ebx + 0x26C]); a.mulss(xmm1, xmm1);
            a.addss(xmm0, xmm1); a.comiss(xmm0, __dword_ptr[cst("samr2")]); a.jae(samNext);
            // Перехоплено! Списуємо 1 ракету ЗРК і скасовуємо скидання бомб ([ebx+9B4h] = 2)
            a.dec(__dword_ptr[esi + 0x290]);
            a.mov(__dword_ptr[ebx + 0x9B4], 2);
            Log("ARC: sokolzrk %d intercepted bomber %d", Mem(ebx, 4), Mem(esi, 4));
            a.popad();
            a.jmp(done);
            a.Label(ref samNext);
            a.inc(edi); a.jmp(samLoop);

            // 2) Масштаб швидкості бомб під час скидання (усередині pushad: vx = [esp+3Ch], vz = [esp+40h])
            a.Label(ref noSam);
            a.mov(ecx, __dword_ptr[ebx]);
            a.mov(eax, __dword_ptr[ebx + 0x258]); a.imul(eax, eax, 0x5C); PlayerOff(eax);
            a.mov(edx, __dword_ptr[ecx + eax + 0xFC]);
            a.cmp(edx, 0); a.jne(notRab);
            a.mov(esi, cst("third")); a.jmp(applyMul);
            a.Label(ref notRab);
            a.cmp(edx, 2); a.jne(notRav);
            Strstr(ebx, "taktikai"); a.test(eax, eax); a.jne(takBomb);
            a.mov(esi, cst("half")); a.jmp(applyMul);
            a.Label(ref takBomb);
            a.mov(esi, cst("twofifths"));
            a.Label(ref applyMul);
            a.movss(xmm0, __dword_ptr[esp + 0x3C]); a.mulss(xmm0, __dword_ptr[esi]); a.movss(__dword_ptr[esp + 0x3C], xmm0);
            a.movss(xmm0, __dword_ptr[esp + 0x40]); a.mulss(xmm0, __dword_ptr[esi]); a.movss(__dword_ptr[esp + 0x40], xmm0);
            a.Label(ref notRav);
            a.popad();
            a.Label(ref done);
            a.jmp(0x4b7236UL);
        }

        // ── 4.2.6: початок скидання бомб (SUnit::AirPlaneCallBack, 0x4b728d) за швидкістю літака ──
        // Ваніль починає скидання за 10 клітинок до цілі й кидає 8 бомб ~0.8 с; за цей час літак (4.8) пролітає 3.84 —
        // серія лягає на ціль (бомби летять уперед ~8.08 клітинки, швидкість бомб airbomb повертає до 4.8). Літак кроликів
        // (14.4) за 0.8 с пролітає 11.5 — серія лягала до ~10 клітинок за ціллю. Тепер поріг = 8.08 + 0.4·v
        // (v = GetMaxMoveSpeed, уже в [esp+18h]): 4.8 → 10 (як у ванілі), 14.4 → 13.84, Ворони 9.6 → 11.92, 12.0 → 12.88.
        // Було: movss xmm0,[__real@41200000] (10.0); далі comiss xmm0,xmm1 (xmm1 — відстань до цілі).
        var dropStart = a.CreateLabel("dropstart");
        {
            a.Label(ref dropStart);
            a.movss(xmm0, __dword_ptr[esp + 0x18]); a.mulss(xmm0, __dword_ptr[cst("dropk")]); a.addss(xmm0, __dword_ptr[cst("dropf")]);
            a.jmp(0x4b7295UL);
        }

        // ── Радар Ушастика (#10, виправлення #12): огляд ×3 крізь дерева й пагорби без переповнення DrawVisMap. ──
        // У ванілі DrawVisMapAid/DetAid мають буфери h/m на 36 float (за ними лежить SuperWindow* 0xED2344 і RakNet
        // SystemAddress) і таблиці на 36 клітинок, а перевірка краю мапи (48 тайлів = 96 клітинок) не тримає радіус
        // радара (132…165) — тому при ввімкненні радара гра падала на 0x4A0DE2 або псувала SuperWindow* (0x4DC5DC).
        // 1) Для звичайного огляду таблиці й буфери перенесені в .arcmod на VisMaxR = 64, Sight обмежено ≤ 31.5.
        // 2) Коли діє радар — заповнюємо коло радіуса int(Sight·2) напряму в visMap/detMap із перевіркою меж [0,visW)×[0,visH).
        var visUnit = a.CreateLabel("visunit");
        {
            var normal = a.CreateLabel(); var radarFill = a.CreateLabel();
            var rowLoop = a.CreateLabel(); var nextRow = a.CreateLabel(); var doneFill = a.CreateLabel();
            var z0Ok = a.CreateLabel(); var z1Ok = a.CreateLabel(); var x0Ok = a.CreateLabel(); var x1Ok = a.CreateLabel();
            var noDet = a.CreateLabel();
            a.Label(ref visUnit);
            a.mov(eax, __dword_ptr[ecx + 4]); a.cmp(eax, TableEntries); a.jae(normal);
            a.shl(eax, 5); a.add(eax, tableVa);
            a.cmp(__dword_ptr[eax], ecx); a.jne(normal);
            a.cmp(__dword_ptr[eax + 24], 0); a.jg(radarFill);
            a.Label(ref normal);
            a.movss(xmm0, __dword_ptr[ecx + 0x44]);
            a.minss(xmm0, __dword_ptr[cst("maxsight")]);
            a.jmp(0x4a0708UL);

            a.Label(ref radarFill);
            a.push(ebp); a.push(ebx); a.push(esi); a.push(edi);
            a.sub(esp, 32);
            // [esp+0]=visW, [esp+4]=visH, [esp+8]=visMap, [esp+12]=detMap, [esp+16]=cx, [esp+20]=cz, [esp+24]=R2, [esp+28]=z1
            a.mov(eax, __dword_ptr[edi + 0x26E0]); a.mov(__dword_ptr[esp], eax);
            a.mov(eax, __dword_ptr[edi + 0x26E4]); a.mov(__dword_ptr[esp + 4], eax);
            a.mov(eax, __dword_ptr[edi + ebx * 4 + 0x26EC]); a.mov(__dword_ptr[esp + 8], eax);
            a.xor(eax, eax); a.cmp(__byte_ptr[ecx + 0x54], 0); a.je(noDet);
            a.mov(eax, __dword_ptr[edi + ebx * 4 + 0x270C]);
            a.Label(ref noDet);
            a.mov(__dword_ptr[esp + 12], eax);
            a.addss(xmm1, xmm1); a.cvttss2si(eax, xmm1); a.mov(__dword_ptr[esp + 16], eax);       // cx = int(x * 2)
            a.addss(xmm2, xmm2); a.cvttss2si(edx, xmm2); a.mov(__dword_ptr[esp + 20], edx);       // cz = int(z * 2)
            a.movss(xmm0, __dword_ptr[ecx + 0x44]); a.addss(xmm0, xmm0); a.cvttss2si(eax, xmm0);  // R = int(Sight * 2)
            a.mov(esi, eax); a.imul(esi, eax); a.mov(__dword_ptr[esp + 24], esi);                 // R2 = R * R
            a.mov(ebp, edx); a.sub(ebp, eax); a.jns(z0Ok); a.xor(ebp, ebp);                       // gz = max(0, cz - R)
            a.Label(ref z0Ok);
            a.add(edx, eax); a.mov(ecx, __dword_ptr[esp + 4]); a.dec(ecx);
            a.cmp(edx, ecx); a.jle(z1Ok); a.mov(edx, ecx);                                        // z1 = min(visH - 1, cz + R)
            a.Label(ref z1Ok);
            a.mov(__dword_ptr[esp + 28], edx);
            a.cmp(ebp, edx); a.jg(doneFill);
            a.cld();
            a.Label(ref rowLoop);
            a.mov(eax, ebp); a.sub(eax, __dword_ptr[esp + 20]); a.imul(eax, eax);                 // dz^2
            a.mov(edx, __dword_ptr[esp + 24]); a.sub(edx, eax); a.jl(nextRow);                    // rem = R^2 - dz^2
            a.cvtsi2sd(xmm0, edx); a.sqrtsd(xmm0, xmm0); a.cvttsd2si(edx, xmm0);                  // dxMax = floor(sqrt(rem))
            a.mov(esi, __dword_ptr[esp + 16]); a.sub(esi, edx); a.jns(x0Ok); a.xor(esi, esi);     // gx0 = max(0, cx - dxMax)
            a.Label(ref x0Ok);
            a.mov(ebx, __dword_ptr[esp + 16]); a.add(ebx, edx);
            a.mov(eax, __dword_ptr[esp]); a.dec(eax);
            a.cmp(ebx, eax); a.jle(x1Ok); a.mov(ebx, eax);                                        // gx1 = min(visW - 1, cx + dxMax)
            a.Label(ref x1Ok);
            a.sub(ebx, esi); a.jl(nextRow); a.inc(ebx);                                           // count = gx1 - gx0 + 1
            a.mov(eax, ebp); a.imul(eax, __dword_ptr[esp]); a.add(eax, esi); a.mov(esi, eax);     // rowStart = gz * visW + gx0
            a.mov(edi, __dword_ptr[esp + 8]); a.add(edi, esi); a.mov(ecx, ebx); a.mov(al, 1); a.rep.stosb();
            a.mov(edi, __dword_ptr[esp + 12]); a.test(edi, edi); a.jz(nextRow);
            a.add(edi, esi); a.mov(ecx, ebx); a.mov(al, 1); a.rep.stosb();
            a.Label(ref nextRow);
            a.inc(ebp); a.cmp(ebp, __dword_ptr[esp + 28]); a.jle(rowLoop);
            a.Label(ref doneFill);
            a.add(esp, 32);
            a.pop(edi); a.pop(esi); a.pop(ebx); a.pop(ebp);
            a.jmp(0x4a05faUL);
        }
        // Обнулення розширених буферів h[64]/m[64] на вході DrawVisMapAid / DrawVisMapDetAid (#12).
        var visAidInit = a.CreateLabel("visaidinit");
        {
            a.Label(ref visAidInit);
            a.push(ebp); a.mov(ebp, esp); a.and(esp, -8); a.sub(esp, 0x1C);
            a.push(ebx); a.push(esi); a.push(edi);
            a.mov(__dword_ptr[esp + 0x10], ecx);
            a.mov(edx, ecx);
            a.cld(); a.xor(eax, eax); a.mov(edi, tableVa + VisAidH - 0x10); a.mov(ecx, 0x220 / 4); a.rep.stosd();
            a.mov(ecx, edx); a.xor(ebx, ebx); a.mov(esi, __dword_ptr[ebp + 0x0C]);
            a.mov(edi, 1); a.mov(__dword_ptr[esp + 0x14], edi);
            a.jmp(0x4a0985UL);
        }
        var visDetInit = a.CreateLabel("visdetinit");
        {
            a.Label(ref visDetInit);
            a.push(ebp); a.mov(ebp, esp); a.and(esp, -8); a.sub(esp, 0x1C);
            a.push(ebx); a.push(esi); a.push(edi);
            a.mov(ebx, ecx); a.mov(esi, __dword_ptr[ebp + 0x0C]);
            a.cld(); a.xor(eax, eax); a.mov(edi, tableVa + VisDetH - 0x10); a.mov(ecx, 0x220 / 4); a.rep.stosd();
            a.xor(edi, edi); a.mov(__dword_ptr[esp + 0x10], edi);
            a.jmp(0x4a0c2eUL);
        }

        // ── 4.1.3: Миттєвий перший постріл після поповнення БК (SUnit::DoGunner, 0x4ba279) ──
        // У ванілі при ammo < salvoCount ([290h] < [394h]) таймер перезарядки [388h] взагалі не зменшувався:
        // танк після поїздки до причепа з 0 БК все одно чекав повний ReloadTime (25–30 с) перед першим пострілом.
        // Тепер [388h] чесно тікає до 1 навіть із порожнім БК і спрацьовує миттєво, щойно БК поповнено.
        var reloadTick = a.CreateLabel("reloadtick");
        {
            var decReady = a.CreateLabel(); var done = a.CreateLabel();
            a.Label(ref reloadTick);
            a.mov(ecx, __dword_ptr[esi + 0x394]);
            {   // 4.2.5: Морковний Смерч ("salvo") у залповому режимі, коли ракет 1…19 < 20, — залп на всі, що лишилися
                var noClamp = a.CreateLabel();
                a.cmp(ecx, 1); a.jle(noClamp);
                a.mov(edx, __dword_ptr[esi + 0x290]); a.test(edx, edx); a.jle(noClamp); a.cmp(edx, ecx); a.jge(noClamp);
                a.cmp(__dword_ptr[esi + 0xC8], 6); a.jne(noClamp);
                a.push(ecx); a.push(edx); Strstr(esi, "salvo"); a.pop(edx); a.pop(ecx);
                a.test(eax, eax); a.je(noClamp);
                a.mov(ecx, edx);
                a.Label(ref noClamp);
            }
            a.mov(eax, __dword_ptr[esi + 0x388]);
            a.test(eax, eax); a.je(done);
            a.cmp(__dword_ptr[esi + 0x290], ecx); a.jge(decReady);
            a.cmp(eax, 1); a.jle(done);
            a.dec(eax); a.mov(__dword_ptr[esi + 0x388], eax);
            a.jmp(done);
            a.Label(ref decReady);
            a.dec(eax); a.mov(__dword_ptr[esi + 0x388], eax); a.jne(done);
            a.mov(__dword_ptr[esi + 0x398], ecx);
            a.Label(ref done);
            a.jmp(0x4ba2a2UL);
        }

        // ── 4.1.3: Піт-Стоп (SpecialType 8, Resource == 0) не вибухає при Cargo == 0 і заряджається від причепа Ammo ──
        // 1) SUnit::ServerRefresh (0x4c8fe3): не викликати Explode при Cargo == 0, якщо [edi+2C0h] == 0 (не причіп).
        var pitstopNoBoom = a.CreateLabel("pitstopnoboom");
        {
            a.Label(ref pitstopNoBoom);
            a.cmp(__dword_ptr[edi + 0x294], 0); a.jne(0x4c903dUL);
            a.cmp(__dword_ptr[edi + 0x2C0], 0); a.je(0x4c903dUL);
            a.jmp(0x4c8fecUL);
        }
        // 2) SUnit::EC_SpecTargetUnit (0x4bc8b1): ПКМ Піт-Стопом по союзному причепу Ammo/Fuel/Service (навіть коли Cargo == 0)
        //    відправляє Піт-Стоп під'їхати й зарядитися (EC_Follow → причіп отримує команду обслуговування).
        var pitstopClick = a.CreateLabel("pitstopclick");
        {
            var orig = a.CreateLabel(); var checkFuel = a.CreateLabel(); var checkSvc = a.CreateLabel(); var doFollow = a.CreateLabel();
            a.Label(ref pitstopClick);
            a.cmp(__dword_ptr[esi + 0xC8], 8); a.jne(orig);
            a.cmp(__dword_ptr[esi + 0x2C0], 0); a.jne(orig);
            a.push(__dword_ptr[ebp + 8]); a.push(esi); a.mov(ecx, __dword_ptr[esi]); a.call(GetUnit);
            a.test(eax, eax); a.je(orig);
            a.mov(edi, eax);
            a.push(__dword_ptr[edi + 0x258]); a.push(__dword_ptr[esi + 0x258]); a.mov(ecx, __dword_ptr[esi]); a.call(IsAllyFn);
            a.test(al, al); a.je(orig);
            a.mov(eax, __dword_ptr[edi + 0xC8]);
            a.cmp(eax, 9); a.jne(checkFuel);                                            // причіп Ammo
            a.mov(ecx, __dword_ptr[esi + 0x294]); a.cmp(ecx, __dword_ptr[esi + 0xD8]); a.jl(doFollow);
            a.jmp(orig);
            a.Label(ref checkFuel);
            a.cmp(eax, 1); a.jne(checkSvc);                                             // причіп Fuel
            a.movss(xmm0, __dword_ptr[esi + 0x28C]); a.cvtsi2ss(xmm1, __dword_ptr[esi + 0x78]);
            a.comiss(xmm0, xmm1); a.jb(doFollow);
            a.jmp(orig);
            a.Label(ref checkSvc);
            a.cmp(eax, 8); a.jne(orig);                                                 // причіп Service (ремонт власного HP)
            a.cmp(__dword_ptr[edi + 0x2C0], 0); a.je(orig);
            a.movss(xmm0, __dword_ptr[esi + 0x288]); a.comiss(xmm0, __dword_ptr[esi + 0x28]); a.jb(doFollow);
            a.jmp(orig);
            a.Label(ref doFollow);
            a.push(__dword_ptr[ebp + 8]); a.mov(ecx, esi); a.call(EcFollowFn);
            a.jmp(0x4bc9bcUL);
            a.Label(ref orig);
            a.mov(edx, __dword_ptr[ebp + 8]);
            a.cmp(__dword_ptr[esi + 0x294], 0); a.je(0x4bc9bcUL);
            a.jmp(0x4bc8beUL);
        }
        // 3) SUnit::ServerRefresh (0x4c8e01): причіп Ammo (SpecialType 9) бачить, що Піт-Стопу потрібен Cargo ([294h] < [D8h]).
        var pitstopAmmoCheck = a.CreateLabel("pitstopammocheck");
        {
            a.Label(ref pitstopAmmoCheck);
            a.mov(eax, __dword_ptr[ecx + 0x290]);
            a.cmp(eax, __dword_ptr[ecx + 0x94]); a.jl(0x4c8e4aUL);
            a.cmp(__dword_ptr[ecx + 0xC8], 8); a.jne(0x4c8fb0UL);
            a.cmp(__dword_ptr[ecx + 0x2C0], 0); a.jne(0x4c8fb0UL);
            a.mov(eax, __dword_ptr[ecx + 0x294]);
            a.cmp(eax, __dword_ptr[ecx + 0xD8]); a.jl(0x4c8e4aUL);
            a.jmp(0x4c8fb0UL);
        }
        // 4) SUnit::TakeResource (0x4cb682): пакет Load Ammo (addAmmo > 0) поповнює Cargo ([294h]) Піт-Стопа до [D8h] (300).
        //    Зберігаємо EFLAGS (pushfd/popfd), бо 0x4cb688 перевіряє ZF від cmp [edx+2C4h],0 на 0x4cb605!
        var pitstopTakeAmmo = a.CreateLabel("pitstoptakeammo");
        {
            var done = a.CreateLabel(); var hasDelta = a.CreateLabel(); var storeCargo = a.CreateLabel();
            a.Label(ref pitstopTakeAmmo);
            a.mov(__dword_ptr[edx + 0x290], eax);
            a.pushfd();
            a.cmp(__dword_ptr[edx + 0xC8], 8); a.jne(done);
            a.cmp(__dword_ptr[edx + 0x2C0], 0); a.jne(done);
            a.movss(xmm3, __dword_ptr[ebp + 0x0C]);
            a.xorps(xmm4, xmm4);
            a.comiss(xmm3, xmm4); a.jbe(done);
            a.mov(eax, __dword_ptr[edx]);
            a.mulss(xmm3, __dword_ptr[eax + 0x1F30]);
            a.cvttss2si(eax, xmm3);
            a.test(eax, eax); a.jg(hasDelta);
            a.mov(eax, 1);
            a.Label(ref hasDelta);
            a.add(eax, __dword_ptr[edx + 0x294]);
            a.mov(ecx, __dword_ptr[edx + 0xD8]);
            a.cmp(eax, ecx); a.jle(storeCargo);
            a.mov(eax, ecx);
            a.Label(ref storeCargo);
            a.mov(__dword_ptr[edx + 0x294], eax);
            a.Label(ref done);
            a.popfd();
            a.jmp(0x4cb688UL);
        }

        // ── 4.2.4: SWorld::CreateUnit (0x4d03c5) — новий юніт отримує чистий запис таблиці стану ──
        // Номер (id) загиблого юніта SHeap::Add віддає наступному новому, а записи таблиці впізнають «свій» юніт за
        // адресою об'єкта. Якщо new SUnit на одному ПК повернув ту саму адресу, а на іншому ні, то старий стан
        // (уповільнення, радар, міни, камікадзе) у новому юніті є лише в одній копії гри → «Inconsistency», кік.
        // Було: push 9F8h / mov edi,eax (edi = id нового юніта).
        var newUnit = a.CreateLabel("newunit");
        {
            var skip = a.CreateLabel();
            a.Label(ref newUnit);
            a.mov(edi, eax);
            a.cmp(edi, TableEntries); a.jae(skip);
            a.mov(eax, edi); a.shl(eax, 5); a.add(eax, tableVa); a.xor(ecx, ecx);
            for (int i = 0; i < EntrySize; i += 4) a.mov(__dword_ptr[eax + i], ecx);
            a.Label(ref skip);
            a.push(0x9F8); a.jmp(0x4d03ccUL);
        }

        // ── 4.2.5: SGameWorld::ProcessPacket (0x4a8cc9), «Inconsistency in frame %d with player %d» — знімок стану ──
        // Перевірка йде, коли обидві копії виконують той самий кадр (контрольний байт кадру [1710h + (кадр & FFh)·4]),
        // тож журнали обох гравців містять стан того самого кадру: порівняти рядки «ARC: desync unit» — і видно,
        // який юніт розійшовся. Поля — сирі біти float (x, z, HP, швидкість), щоб порівнювати точно.
        // Було: mov esi,[ebp-0CCh] (номер гравця).
        var desyncDump = a.CreateLabel("desyncdump");
        {
            var lp = a.CreateLabel(); var nx = a.CreateLabel(); var end = a.CreateLabel();
            a.Label(ref desyncDump);
            Log("ARC: desync dump at frame %d, player %d", () => a.push(__dword_ptr[ebp - 0xCC]), Reg(edx));
            a.pushad();
            a.mov(esi, __dword_ptr[ebx + 0x43C]); a.xor(edi, edi);
            a.Label(ref lp);
            a.cmp(edi, __dword_ptr[ebx + 0x440]); a.jge(end);
            a.cmp(__dword_ptr[esi + edi * 8], 0x7FFFFFFF); a.jne(nx);
            a.mov(ecx, __dword_ptr[esi + edi * 8 + 4]); a.test(ecx, ecx); a.jz(nx);
            a.push(__dword_ptr[ecx + 0x68]); a.push(__dword_ptr[ecx + 0x290]); a.push(__dword_ptr[ecx + 0x288]);
            a.push(__dword_ptr[ecx + 0x26C]); a.push(__dword_ptr[ecx + 0x264]); a.push(__dword_ptr[ecx + 0x258]);
            a.push(__dword_ptr[ecx + 0x254]); a.push(__dword_ptr[ecx + 4]);
            a.push(S("ARC: desync unit %d %s owner %d x %08x z %08x hp %08x ammo %d spd %08x"));
            a.push(0); a.push(__dword_ptr[LoggerVar]); a.call(LogFn); a.add(esp, 44);
            a.Label(ref nx);
            a.inc(edi); a.jmp(lp);
            a.Label(ref end);
            a.popad();
            a.mov(esi, __dword_ptr[ebp - 0xCC]); a.jmp(0x4a8ccfUL);
        }

        // ── #2: кожен imul …,5Ch гравця — копія вікна інструкцій + PlayerOff після imul ──
        var w16Labels = new List<Label>();
        foreach (var st in World16)
        {
            var l = a.CreateLabel($"w16_{st.Va:x}"); a.Label(ref l); w16Labels.Add(l);
            if (st.PreReg != Register.None) PlayerOff(new AssemblerRegister32(st.PreReg), st.PreK);
            for (int i = 0; i < st.Ins.Length; i++)
            {
                a.AddInstruction(st.Ins[i]);
                if (st.K[i] >= 0) PlayerOff(new AssemblerRegister32(st.Ins[i].Op0Register), st.K[i]);
            }
            a.jmp((ulong)(st.Va + st.Len));
        }

        var w = new ByteWriter();
        var res = a.Assemble(w, codeVa, BlockEncoderOptions.ReturnNewInstructionOffsets);
        ulong L(Label l) => res.GetLabelRIP(l);
        hooks.Add(new Hook(0x4bcffa, Convert.FromHexString("83C40885C07550"), "SUnit::Explode → вибух камікадзе", (uint)L(explode), 7));
        hooks.Add(new Hook(0x4bc190, Convert.FromHexString("568BF183BEA003000000"), "SUnit::EC_SpecAction → залп 40, підрив, мінування, радар", (uint)L(spec), 10));
        hooks.Add(new Hook(0x4c9e96, Convert.FromHexString("C7819403000005000000"), "SetSpecialState спецрежим 6 → залп salvo", (uint)L(salvoUi), 10));
        hooks.Add(new Hook(0x4b6e70, Convert.FromHexString("558BECF30F107508"), "SUnit::AimTarget → наведення корпусом (hullaim)", (uint)L(aim), 8));
        hooks.Add(new Hook(0x4ca9f0, Convert.FromHexString("558BEC83E4F883EC30"), "SUnit::TakeDamage → уповільнення (slow)", (uint)L(takeDmg), 9));
        hooks.Add(new Hook(0x4b5b4e, Convert.FromHexString("FF762CF30F104658"), "SProjectile::ServerRefresh → грязьова калюжа (slow)", (uint)L(mud), 8));
        hooks.Add(new Hook(0x4aca0b, Convert.FromHexString("E91E010000"), "SGameWorld::ServerInit → союзники стартують поруч", (uint)L(spawn), 5));
        hooks.Add(new Hook(0x4c7230, Convert.FromHexString("558BEC83E4F8"), "SUnit::ServerRefresh → уповільнення, калюжі, міни на ходу, радар", (uint)L(tick), 6));
        hooks.Add(new Hook(0x4f5217, Convert.FromHexString("3C2D74398B83AC280000"), "SQuickMarket::Create → без класу 12 у списку кнопок", (uint)L(qmSkip), 10));
        hooks.Add(new Hook(0x4ac410, Convert.FromHexString("558BEC6AFF"), "SGameWorld::ServerInit → скидання стану вставок", (uint)L(worldInit), 5));
        hooks.Add(new Hook(0x4e0191, Convert.FromHexString("8D55CC6A0152"), "SGameView::Create → атлас кнопок спецздібностей з типами 12–14", (uint)L(glyphs), 6));
        hooks.Add(new Hook(0x47df40, Convert.FromHexString("558BEC83EC2C"), "SMulti::Update → +autostart N (перевірка мережі)", (uint)L(autoStart), 6));
        hooks.Add(new Hook(0x479dc0, Convert.FromHexString("33C081C190210000"), "SMulti::GetFreePlayerSlot → 16 слотів (другий командир)", (uint)L(freeSlot16), 8));
        hooks.Add(new Hook(0x47b1ce, Convert.FromHexString("33DB8D8790210000"), "SMulti::OnIntroductionMessage: вільний слот → 16", (uint)L(introSlot), 8));
        hooks.Add(new Hook(0x478c57, Convert.FromHexString("C7860425000000000000"), "SMulti::ClearSlotArray: очистити слоти 8…15", (uint)L(clearSlots), 10));
        hooks.Add(new Hook(0x47a543, Convert.FromHexString("C7865421000000000000"), "SMulti::Initialize: слоти, conn, recv/req 8…15", (uint)L(initTail), 10));
        hooks.Add(new Hook(0x4f9ac7, Convert.FromHexString("8B0D60D05800"), "SMenu::Create: рядок «Arcanum Nexus Mod v…» під версією гри", (uint)L(menuVer), 6));
        if (Ravens) hooks.Add(new Hook(0x4dac50, Convert.FromHexString("66A178565500"), "#3 SChatRoomMenu::LoadArmyNames: армії Воронів — V*.army", (uint)L(armyPrefix), 6));
        if (Ravens) hooks.Add(new Hook(0x4d912f, Convert.FromHexString("0FB6836C910000"), "#3 SChatRoomMenu::Create: раса «Ворон» у списку лобі", (uint)L(lobbyRace), 7));
        hooks.Add(new Hook(0x4f971d, Convert.FromHexString("8BCEE8CCEEF8FF"), "~SMenu: прибрати рядок версії мода", (uint)L(menuVerDtor), 7));
        for (int i = 0; i < World16.Count; i++)
            hooks.Add(new Hook(World16[i].Va, World16[i].Old, "#2: зсув гравця i·5Ch → хвіст SGameWorld для i ≥ 8", (uint)L(w16Labels[i]), World16[i].Len));
        hooks.Add(new Hook(0x4bc609, Convert.FromHexString("6A32FFB658020000"), "SUnit::EC_SpecTargetGround: авіаудар за расою та freeair", (uint)L(airBuy), 8));
        hooks.Add(new Hook(0x4a5f5d, Convert.FromHexString("83BC303801000032"), "SGameWorld::IsBomberAvailable: ціна за расою (мережа)", (uint)L(airAvail), 8));
        hooks.Add(new Hook(0x4a5f72, Convert.FromHexString("83F8320F9DC0"), "SGameWorld::IsBomberAvailable: ціна за расою (кампанія)", (uint)L(airAvailCamp), 6));
        hooks.Add(new Hook(0x49e1da, Convert.FromHexString("B8702355000F45F0"), "SGameWorld::AirStrike: вибір бомбардувальника Воронів (важкий / тактичний)", (uint)L(airPick), 8));
        hooks.Add(new Hook(0x4b728d, Convert.FromHexString("F30F1005B09E5400"), "SUnit::AirPlaneCallBack: початок скидання бомб за швидкістю літака (точно в точку виклику)", (uint)L(dropStart), 8));
        hooks.Add(new Hook(0x4b722e, Convert.FromHexString("D84C2418D95C2420"), "SUnit::AirPlaneCallBack: ППО Сапсан-ЗРК + точне скидання бомб на 4.8", (uint)L(airBomb), 8));
        hooks.Add(new Hook(0x4a0703, Convert.FromHexString("F30F104144"), "SGameWorld::DrawVisMap: радар Ушастика (коло без переповнення) + межа Sight", (uint)L(visUnit), 5));
        hooks.Add(new Hook(0x4a08d0, Convert.FromHexString("558BEC83E4F8"), "SGameWorld::DrawVisMapAid: очищення розширених буферів h/m[64]", (uint)L(visAidInit), 6));
        hooks.Add(new Hook(0x4a0b80, Convert.FromHexString("558BEC83E4F8"), "SGameWorld::DrawVisMapDetAid: очищення розширених буферів h/m[64]", (uint)L(visDetInit), 6));
        hooks.Add(new Hook(0x4ba279, Convert.FromHexString("8B8E94030000"), "SUnit::DoGunner: перезарядка тікає навіть при 0 БК → миттєвий перший постріл після зарядки", (uint)L(reloadTick), 6));
        hooks.Add(new Hook(0x4c8fe3, Convert.FromHexString("83BF94020000007551"), "SUnit::ServerRefresh: Піт-Стоп (Resource==0) не вибухає при Cargo==0", (uint)L(pitstopNoBoom), 9));
        hooks.Add(new Hook(0x4bc8b1, Convert.FromHexString("83BE9402000000"), "SUnit::EC_SpecTargetUnit: ПКМ Піт-Стопом по причепу Ammo/Fuel/Service → під'їхати й зарядитись", (uint)L(pitstopClick), 7));
        hooks.Add(new Hook(0x4c8e01, Convert.FromHexString("8B81900200003B8194000000"), "SUnit::ServerRefresh: причіп Ammo заряджає Cargo Піт-Стопа", (uint)L(pitstopAmmoCheck), 12));
        hooks.Add(new Hook(0x4cb682, Convert.FromHexString("898290020000"), "SUnit::TakeResource: Load Ammo поповнює Cargo Піт-Стопа до 300", (uint)L(pitstopTakeAmmo), 6));
        hooks.Add(new Hook(0x4d03c5, Convert.FromHexString("68F80900008BF8"), "SWorld::CreateUnit: чистий запис таблиці для нового юніта (рассинхрон при повторному id)", (uint)L(newUnit), 7));
        hooks.Add(new Hook(0x4a8cc9, Convert.FromHexString("8BB534FFFFFF"), "SGameWorld::ProcessPacket: рассинхрон → стан усіх юнітів у журнал", (uint)L(desyncDump), 6));
        hooks.Add(new Hook(0x47cd51,Convert.FromHexString("8B4DFC5F5E"), "SMulti::SendBroadcastMessage: слотам 8…15 напряму", (uint)L(sbmTail), 5));
        hooks.Add(new Hook(0x47d675, Convert.FromHexString("8B4DFC5F5E"), "SMulti::SendMessageInternal: біти 8…15 напряму", (uint)L(smiTail), 5));
        hooks.Add(new Hook(0x47b2b4, Convert.FromHexString("B001D2E08BCF50"), "SMulti::OnIntroductionMessage: маска відповіді 16 біт", (uint)L(introMask), 7));
        hooks.Add(new Hook(0x47b4bd, Convert.FromHexString("8B832C250000"), "SMulti::OnMessage: слот ≥ 8 приймає без маски", (uint)L(recv16), 6));
        hooks.Add(new Hook(0x47c1cc, Convert.FromHexString("8D04D6898C8394270000"), "SMulti::OnMessage 0x98: матриця кадрів лише 8×8", (uint)L(lrfMsg), 10));
        hooks.Add(new Hook(0x47a406, Convert.FromHexString("8D04F789948198270000"), "SMulti::HandleLastReceivedFrameMessage: лише 8×8", (uint)L(lrfFn), 10));
        hooks.Add(new Hook(0x47c1f9, Convert.FromHexString("0F1047040FB6F1"), "SMulti::OnMessage 0x99: граф лише від слотів 0…7", (uint)L(graph16), 7));
        hooks.Add(new Hook(0x47e000, Convert.FromHexString("558BEC83EC58"), "SMulti::UpdateConnectivity: не для слота ≥ 8", (uint)L(conn16), 6));
        hooks.Add(new Hook(0x47949e, Convert.FromHexString("81C1843A00005003CB"), "SMulti::DisplaySlotData: ім'я армії + другий командир", (uint)L(coName), 9));
        hooks.Add(new Hook(0x47da11,Convert.FromHexString("E8EA050000"), "SMulti::SetPingToolTips: не для слота ≥ 8", (uint)L(pingTips), 5));
        hooks.Add(new Hook(0x479de0,Convert.FromHexString("8B9190210000"), "SMulti::GetFullAndOpenSlots: + місця других командирів (ворота)", (uint)L(gate16), 6));
        hooks.Add(new Hook(0x47a880, Convert.FromHexString("558BEC538B5D08"), "SMulti::IsDisconnected: слот ≥ 8 — за GUID", (uint)L(isDisc16), 7));
        hooks.Add(new Hook(0x475360, Convert.FromHexString("558BEC8B4508"), "ConnectivityGraph::ClearPeerInfo: лише 0…7", (uint)L(clearPeer16), 6));
        hooks.Add(new Hook(0x47dea7, Convert.FromHexString("FF75088D45F4"), "SMulti::StartSyncAfterDisconnect: 0x98 ще й слотам 8…15", (uint)L(syncMask), 6));
        hooks.Add(new Hook(0x4ae8e4,Convert.FromHexString("84C07436FF773C"), "SGameWorld::ServerRefresh: господар пішов — армія лишається другому командиру", (uint)L(discCo), 7));
        hooks.Add(new Hook(0x4aeac5, Convert.FromHexString("E886B2FCFF"), "SGameWorld::ServerRefresh: армія без господаря — лише кадри 8 + k", (uint)L(getFrameCo), 5));
        hooks.Add(new Hook(0x4ae92a,Convert.FromHexString("E801BBFCFF"), "SGameWorld::ServerRefresh: чекати кадр другого командира", (uint)L(waitCo), 5));
        hooks.Add(new Hook(0x4aeade, Convert.FromHexString("8D4DACC745FCFFFFFFFF"), "SGameWorld::ServerRefresh: кадр слота 8 + k → армія k", (uint)L(procCo), 10));
        var frameOld = new Dictionary<uint, string> {
            [0x477f02] = "83C02F8975F0", [0x477f32] = "83C02F03C2", [0x477f5e] = "83C02F03C2", [0x479d74] = "83C02F03C7",
            [0x47a451] = "83C02F03C7", [0x47d235] = "83C02F03C1", [0x47dee3] = "83C02F03C6" };
        for (int i = 0; i < frameSites.Length; i++)
            hooks.Add(new Hook(frameSites[i].va, Convert.FromHexString(frameOld[frameSites[i].va]), "SMulti: індекс кадру → SFrameHistory[16]", (uint)L(frameLabels[i]), frameSites[i].len));

        var dec = Iced.Intel.Decoder.Create(32, new ByteArrayCodeReader(w.ToArray())); dec.IP = codeVa;
        var fmt = new MasmFormatter(); var so = new StringOutput(); var sb = new System.Text.StringBuilder();
        while (dec.IP < codeVa + (uint)w.Count) { var ins = dec.Decode(); fmt.Format(ins, so); sb.AppendLine($"  {ins.IP:x8}  {so.ToStringAndReset()}"); }
        return (w.ToArray(), hooks, sb.ToString());
    }

    // Атлас panel_spec.png: клітинка i (7 у рядку, 35×35 логічних px) показує гліф table[i]. Гліф кнопки = (тип·2 + стан)·2
    // (+1 — під курсором). Перші 48 — як у грі; 48 — порожня; 49–60 — гліфи 48–59 (типи 12, 13, 14 × стан 0/1 × 2).
    public static readonly byte[] GlyphTable = BuildGlyphs();
    static byte[] BuildGlyphs()
    {
        var t = new List<byte> { 0x00, 0x02, 0x04, 0x06, 0x01, 0x03, 0x15, 0x08, 0x0A, 0x0C, 0x0E, 0x09, 0x0B, 0x17, 0x10, 0x12,
            0x14, 0x16, 0x11, 0x13, 0x2B, 0x18, 0x1A, 0x28, 0x2A, 0x19, 0x1B, 0x29, 0x1C, 0x1E, 0x2C, 0x2D, 0x1D, 0x1F, 0x2E, 0x20,
            0x22, 0x21, 0x23, 0x05, 0x07, 0x2F, 0x24, 0x26, 0x25, 0x27, 0x0D, 0x0F };
        t.Add(0xFF);
        for (int g = 48; g < 60; g++) t.Add((byte)g);
        return t.ToArray();
    }

    sealed class ByteWriter : CodeWriter
    {
        readonly List<byte> b = new();
        public override void WriteByte(byte value) => b.Add(value);
        public int Count => b.Count;
        public byte[] ToArray() => b.ToArray();
    }
}

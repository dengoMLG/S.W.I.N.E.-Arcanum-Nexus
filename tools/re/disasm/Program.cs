// Дизасемблер swineHD.exe з іменами з PDB (docs/swine_symbols.txt, див. tools/re/pdbsyms.js).
//   disasm <exe> <symbols.txt> fn <name-substring|0xVA> [maxBytes]  — одна функція
//   disasm <exe> <symbols.txt> fns <regex>                          — усі функції, чиє ім'я збігається
//   disasm <exe> <symbols.txt> xref <0xVA> [0xVA2]                   — інструкції з посиланням на адреси в діапазоні
//   disasm <exe> <symbols.txt> imm <hex> [regex-of-function]         — інструкції з таким безпосереднім значенням
using Iced.Intel;

var exe = File.ReadAllBytes(args[0]);
var syms = File.ReadAllLines(args[1]).Select(l => l.Split(' ', 3)).Where(p => p.Length == 3)
    .Select(p => (va: Convert.ToUInt32(p[0], 16), kind: p[1], name: p[2])).OrderBy(s => s.va).ToList();
int pe = BitConverter.ToInt32(exe, 0x3c); int nsec = BitConverter.ToUInt16(exe, pe + 6); int os = BitConverter.ToUInt16(exe, pe + 20);
uint imageBase = BitConverter.ToUInt32(exe, pe + 24 + 28);
var secs = Enumerable.Range(0, nsec).Select(i => { int s = pe + 24 + os + i * 40; return (name: System.Text.Encoding.ASCII.GetString(exe, s, 8).TrimEnd('\0'), va: BitConverter.ToUInt32(exe, s + 12) + imageBase, vs: BitConverter.ToUInt32(exe, s + 8), raw: BitConverter.ToUInt32(exe, s + 20)); }).ToList();
int Off(uint va) { foreach (var s in secs) if (va >= s.va && va < s.va + s.vs) return (int)(s.raw + (va - s.va)); return -1; }
string Sym(ulong va) { var i = syms.FindLastIndex(s => s.va <= va); if (i < 0) return ""; var s = syms[i]; var d = va - s.va; return d < 0x4000 ? s.name + (d > 0 ? $"+0x{d:x}" : "") : ""; }
var fmt = new MasmFormatter(null, new Res(Sym)); fmt.Options.FirstOperandCharIndex = 10;
var fnsyms = syms.Where(x => x.kind == "F").ToList();

void Dump(uint start, int max)
{
    var dec = Decoder.Create(32, new ByteArrayCodeReader(exe, Off(start), max)); dec.IP = start; var o = new StringOutput();
    while (dec.IP < start + (uint)max) { var ins = dec.Decode(); fmt.Format(ins, o); Console.WriteLine($"{ins.IP:x8}  {o.ToStringAndReset()}"); }
}
int FnSize(uint start) { var next = fnsyms.Where(s => s.va > start).Select(s => s.va).DefaultIfEmpty(start + 0x400).First(); return (int)Math.Min(next - start, 0x6000); }

IEnumerable<Instruction> AllText()
{
    var text = secs.First(s => s.name == ".text");
    var dec = Decoder.Create(32, new ByteArrayCodeReader(exe, (int)text.raw, (int)text.vs)); dec.IP = text.va;
    while (dec.IP < text.va + text.vs) yield return dec.Decode();
}

switch (args[2])
{
    case "fn":
    {
        uint start = args[3].StartsWith("0x") ? Convert.ToUInt32(args[3], 16) : fnsyms.First(s => s.name.Contains(args[3])).va;
        int max = args.Length > 4 ? int.Parse(args[4]) : FnSize(start);
        Console.WriteLine($"; {Sym(start)} @ {start:x} ({max} bytes)"); Dump(start, max); break;
    }
    case "fns":
    {
        var rx = new System.Text.RegularExpressions.Regex(args[3]);
        foreach (var f in fnsyms.Where(f => rx.IsMatch(f.name)))
        { int max = FnSize(f.va); Console.WriteLine($"\n; ===== {f.name} @ {f.va:x} ({max} bytes)"); Dump(f.va, max); }
        break;
    }
    case "xref":
    case "imm":
    {
        uint lo = Convert.ToUInt32(args[3], 16), hi = args[2] == "xref" && args.Length > 4 ? Convert.ToUInt32(args[4], 16) : lo;
        var rx = args[2] == "imm" && args.Length > 4 ? new System.Text.RegularExpressions.Regex(args[4]) : null;
        var o = new StringOutput();
        foreach (var ins in AllText())
        {
            bool hit = false;
            for (int k = 0; k < ins.OpCount; k++)
            {
                var kind = ins.GetOpKind(k);
                if (args[2] == "xref" && kind == OpKind.Memory && ins.MemoryDisplacement32 >= lo && ins.MemoryDisplacement32 <= hi) hit = true;
                if (kind is OpKind.Immediate32 or OpKind.Immediate8to32 or OpKind.Immediate8 or OpKind.Immediate16)
                { var v = ins.GetImmediate(k); if (v >= lo && v <= hi) hit = true; }
                if (args[2] == "imm" && kind == OpKind.Memory && ins.MemoryDisplacement32 == lo) hit = true;
                if (args[2] == "xref" && kind == OpKind.NearBranch32 && ins.NearBranch32 >= lo && ins.NearBranch32 <= hi) hit = true;
            }
            if (!hit) continue;
            var s = Sym(ins.IP); if (rx != null && !rx.IsMatch(s)) continue;
            fmt.Format(ins, o); Console.WriteLine($"{ins.IP:x8}  [{s}]  {o.ToStringAndReset()}");
        }
        break;
    }
}

class Res(Func<ulong, string> sym) : ISymbolResolver
{
    public bool TryGetSymbol(in Instruction instruction, int operand, int instructionOperand, ulong address, int addressSize, out SymbolResult symbol)
    { var s = address > 0x400000 && address < 0x700000 ? sym(address) : ""; symbol = s.Length > 0 ? new SymbolResult(address, s) : default; return s.Length > 0; }
}

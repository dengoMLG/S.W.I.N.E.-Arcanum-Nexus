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
    case "fields":
    {
        // fields <lo> <hi> [regex-of-function] — пам'ять [base+disp], disp у [lo, hi]; для кожної — звідки взявся base.
        // THIS = регістр/слот стеку, що несе ecx зі входу функції (лінійне простеження, без гілок).
        uint lo = Convert.ToUInt32(args[3], 16), hi = Convert.ToUInt32(args[4], 16);
        var rx = args.Length > 5 ? new System.Text.RegularExpressions.Regex(args[5]) : null;
        var o = new StringOutput();
        foreach (var f in fnsyms)
        {
            if (rx != null && !rx.IsMatch(f.name)) continue;
            int size = FnSize(f.va); int off = Off(f.va); if (off < 0) continue;
            var dec = Decoder.Create(32, new ByteArrayCodeReader(exe, off, size)); dec.IP = f.va;
            var list = new List<Instruction>();
            while (dec.IP < f.va + (uint)size) list.Add(dec.Decode());
            var thisRegs = new HashSet<Register> { Register.ECX }; var thisStack = new HashSet<long>();
            var thisAt = new List<bool>();
            foreach (var ins in list)
            {
                // перевіряємо до застосування інструкції
                thisAt.Add(ins.OpCount > 0 && Enumerable.Range(0, ins.OpCount).Any(k => ins.GetOpKind(k) == OpKind.Memory) && thisRegs.Contains(ins.MemoryBase));
                if (ins.Mnemonic == Mnemonic.Mov && ins.Op0Kind == OpKind.Register && ins.Op1Kind == OpKind.Register)
                { if (thisRegs.Contains(ins.Op1Register)) thisRegs.Add(ins.Op0Register); else thisRegs.Remove(ins.Op0Register); continue; }
                if (ins.Mnemonic == Mnemonic.Mov && ins.Op0Kind == OpKind.Memory && ins.MemoryBase == Register.EBP && ins.Op1Kind == OpKind.Register)
                { if (thisRegs.Contains(ins.Op1Register)) thisStack.Add((int)ins.MemoryDisplacement32); else thisStack.Remove((int)ins.MemoryDisplacement32); continue; }
                if (ins.Mnemonic == Mnemonic.Mov && ins.Op0Kind == OpKind.Register && ins.Op1Kind == OpKind.Memory && ins.MemoryBase == Register.EBP && ins.MemoryIndex == Register.None)
                { if (thisStack.Contains((int)ins.MemoryDisplacement32)) thisRegs.Add(ins.Op0Register); else thisRegs.Remove(ins.Op0Register); continue; }
                if (ins.Mnemonic == Mnemonic.Call) { thisRegs.Remove(Register.EAX); thisRegs.Remove(Register.ECX); thisRegs.Remove(Register.EDX); continue; }
                if (ins.OpCount > 0 && ins.Op0Kind == OpKind.Register && ins.Mnemonic != Mnemonic.Cmp && ins.Mnemonic != Mnemonic.Test && ins.Mnemonic != Mnemonic.Push)
                    thisRegs.Remove(ins.Op0Register);
            }
            for (int i = 0; i < list.Count; i++)
            {
                var ins = list[i];
                bool mem = Enumerable.Range(0, ins.OpCount).Any(k => ins.GetOpKind(k) == OpKind.Memory);
                if (!mem || ins.MemoryBase == Register.EBP || ins.MemoryBase == Register.ESP) continue;
                if (ins.MemoryDisplacement32 < lo || ins.MemoryDisplacement32 > hi) continue;
                string prov;
                if (thisAt[i]) prov = "THIS";
                else
                {
                    var b = ins.MemoryBase; prov = b == Register.None ? "abs" : "?";
                    for (int j = i - 1; j >= 0 && j >= i - 40; j--)
                    {
                        var p = list[j];
                        if (p.OpCount > 0 && p.Op0Kind == OpKind.Register && (p.Op0Register == b || p.Op0Register.GetFullRegister32() == b.GetFullRegister32())
                            && p.Mnemonic != Mnemonic.Cmp && p.Mnemonic != Mnemonic.Test && p.Mnemonic != Mnemonic.Push)
                        { fmt.Format(p, o); prov = $"{p.IP:x}: {o.ToStringAndReset()}"; break; }
                    }
                }
                fmt.Format(ins, o);
                Console.WriteLine($"{ins.IP:x8}\t{f.name}\t{o.ToStringAndReset()}\t{prov}");
            }
        }
        break;
    }
}

class Res(Func<ulong, string> sym) : ISymbolResolver
{
    public bool TryGetSymbol(in Instruction instruction, int operand, int instructionOperand, ulong address, int addressSize, out SymbolResult symbol)
    { var s = address > 0x400000 && address < 0x700000 ? sym(address) : ""; symbol = s.Length > 0 ? new SymbolResult(address, s) : default; return s.Length > 0; }
}

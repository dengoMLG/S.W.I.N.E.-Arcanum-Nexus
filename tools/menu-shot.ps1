param([string]$Shot = "menu.png", [int]$Wait = 25, [string]$Game = "$PSScriptRoot\..\mods-test\game")
# Знімок головного меню: одна копія гри у вікні, через $Wait с — знімок екрана там, де вікно, закриття, повернення options.ini.
# Для перевірки рядка «Arcanum Nexus Mod v…» під версією гри (Caves.cs, menuver). Не запускати, поки граєш.
$opt = "$env:LOCALAPPDATA\Kite Games\Swine\options.ini"; $bak = "$opt.menu-shot.bak"; Copy-Item $opt $bak -Force
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class MW { [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r); [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
public struct R { public int L, T, Ri, B; } }
"@
$p = $null
try {
  (Get-Content $opt) -replace '^Display mode = .*','Display mode = 0' -replace '^Screen resolution = .*','Screen resolution = 0' -replace '^Resolution scale = .*','Resolution scale = 1000' | Set-Content $opt -Encoding ascii
  $p = Start-Process "$Game\swineHD.exe" -WorkingDirectory $Game -PassThru
  Start-Sleep -Seconds $Wait
  if ($p.HasExited) { "game exited early (code $($p.ExitCode))"; return }
  [MW]::SetProcessDPIAware() | Out-Null
  $h = (Get-Process -Id $p.Id).MainWindowHandle; [MW]::SetForegroundWindow($h) | Out-Null; Start-Sleep -Milliseconds 1500
  $r = New-Object MW+R; [MW]::GetWindowRect($h, [ref]$r) | Out-Null
  $bmp = New-Object System.Drawing.Bitmap ($r.Ri - $r.L), ($r.B - $r.T); $gr = [System.Drawing.Graphics]::FromImage($bmp)
  $gr.CopyFromScreen($r.L, $r.T, 0, 0, $bmp.Size); $bmp.Save($Shot); "shot: $Shot"
} finally { if ($p -and -not $p.HasExited) { Stop-Process -Id $p.Id -Force }; Copy-Item $bak $opt -Force; Remove-Item $bak; "restored" }

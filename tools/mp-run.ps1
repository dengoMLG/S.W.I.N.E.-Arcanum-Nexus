param([int]$Count = 8, [int]$Wait = 10, [string]$Shot = "", [string]$Game = "$PSScriptRoot\..\mods-test\game",
      [int]$AutoStart = 0, [int]$ShotOf = 0, [int]$Kill = -1, [int]$KillAfter = 30)
# -Kill i -KillAfter s — через s с після запуску всіх копій закрити копію i (гравець вийшов посеред матчу).
# -AutoStart 99 — матч не починати (лишитися в лобі); -Shot файл.png -ShotOf i — знімок вікна копії i (0 — хост).
if ($AutoStart -le 0) { $AutoStart = $Count }
# Неінтерактивна перевірка мережі: N копій з +autostart N у вікні, журнали, (знімок), закриття, повернення options.ini.
# Далі tools/mp-check.ps1 -Count N — слоти, кадри, синхронність (docs/EXE_PATCH_14_UNITS.md, етап 3).
$g = $Game; $opt = "$env:LOCALAPPDATA\Kite Games\Swine\options.ini"; $bak = "$opt.mp-test.bak"
Copy-Item $opt $bak -Force
$log = "$env:LOCALAPPDATA\Kite Games\Swine\log"; $before = Get-ChildItem $log | Select-Object -ExpandProperty Name; $procs = @()
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class W { [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r); [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr dc, uint f); [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
public struct R { public int L, T, Ri, B; } }
"@
try {
  (Get-Content $opt) -replace '^Display mode = .*','Display mode = 0' -replace '^Screen resolution = .*','Screen resolution = 0' -replace '^Resolution scale = .*','Resolution scale = 1000' | Set-Content $opt -Encoding ascii
  for ($i=0; $i -lt $Count; $i++) { $a = if ($i -eq 0) { @("+host","+name","P1","+autostart","$AutoStart") } else { @("+connect","127.0.0.1","+name","P$($i+1)","+autostart","$AutoStart") }; $procs += Start-Process "$g\swineHD.exe" -ArgumentList $a -WorkingDirectory $g -PassThru; Start-Sleep -Seconds 7 }
  if ($Kill -ge 0) { Start-Sleep -Seconds $KillAfter; Stop-Process -Id $procs[$Kill].Id -Force; "killed copy $Kill" }
  Start-Sleep -Seconds $Wait
  "alive: " + (($procs | Where-Object { -not $_.HasExited }).Count) + " / $Count"
  if ($Shot) {
    # PrintWindow для D3D дає чорне — знімаємо екран там, де вікно (воно має бути зверху)
    [W]::SetProcessDPIAware() | Out-Null
    $h = (Get-Process -Id $procs[$ShotOf].Id).MainWindowHandle; [W]::SetForegroundWindow($h) | Out-Null; Start-Sleep -Milliseconds 1500
    $r = New-Object W+R; [W]::GetWindowRect($h, [ref]$r) | Out-Null
    $bmp = New-Object System.Drawing.Bitmap ($r.Ri - $r.L), ($r.B - $r.T); $gr = [System.Drawing.Graphics]::FromImage($bmp)
    $gr.CopyFromScreen($r.L, $r.T, 0, 0, $bmp.Size); $bmp.Save($Shot); "shot: $Shot"
  }
  $files = Get-ChildItem $log | Where-Object { $before -notcontains $_.Name } | Sort-Object LastWriteTime
  $files | ForEach-Object { $t = Get-Content $_.FullName; $slot = ($t | Select-String "slot id =" | Select-Object -Last 1).Line; $err = ($t | Select-String "exception|crash|assert" | Select-Object -First 1).Line; "$($_.Name): $slot $err" }
  "== host"; Get-Content $files[0].FullName | Select-String "ARC:|STARTGAME|contradiction|not arrived" | Select-Object -Last 12 | ForEach-Object { $_.Line }; "== client"; Get-Content $files[-1].FullName | Select-String "ARC:|STARTGAME|contradiction|not arrived" | Select-Object -Last 12 | ForEach-Object { $_.Line }
} finally { foreach ($p in $procs) { if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force } }; Copy-Item $bak $opt -Force; Remove-Item $bak; "restored" }

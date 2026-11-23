# Локальна перевірка мережевої гри: N копій гри на одному ПК (хост + N-1 підключень на 127.0.0.1).
#   powershell -File tools/mp-test.ps1 [-Count 2] [-AutoStart] [-Game <тека гри, типово mods-test/game>]
#
# Гра сама розуміє ключі: +host, +connect <ip>, +name <ім'я> (SSuperWindow::Play).
# Порт: перша копія займає 60500, наступні — 60501…; оригінальний exe пробує лише 4 порти,
# патч Arcanum Units — 20. Поки копії працюють, options.ini переведено у вікно 800×600;
# після Enter (або Ctrl+C) копії закриваються, options.ini повертається як був.
# -AutoStart: ключ +autostart N (патч Arcanum Units) — хост сам починає матч, щойно зайдуть N гравців;
# кожна копія пише в журнал «ARC: autostart frame K» — видно, що кадри lockstep ідуть.
# Що відбувалось — у журналах %LOCALAPPDATA%\Kite Games\Swine\log (рядки SwineNet / ARC:).
param(
    [int]$Count = 2,
    [string]$Game = "$PSScriptRoot\..\mods-test\game",
    [int]$DelaySec = 6,
    [switch]$AutoStart
)
$ErrorActionPreference = "Stop"
$opt = Join-Path $env:LOCALAPPDATA "Kite Games\Swine\options.ini"
$bak = "$opt.mp-test.bak"
$exe = Join-Path $Game "swineHD.exe"
if (-not (Test-Path $exe)) { throw "немає $exe" }

Copy-Item $opt $bak -Force
$procs = @()
try {
    (Get-Content $opt) `
        -replace '^Display mode = .*', 'Display mode = 0' `
        -replace '^Screen resolution = .*', 'Screen resolution = 0' `
        -replace '^Resolution scale = .*', 'Resolution scale = 1000' |
        Set-Content $opt -Encoding ascii

    for ($i = 0; $i -lt $Count; $i++) {
        $name = "P$($i + 1)"
        $args = if ($i -eq 0) { @("+host", "+name", $name) } else { @("+connect", "127.0.0.1", "+name", $name) }
        if ($AutoStart) { $args += @("+autostart", "$Count") }
        $procs += Start-Process -FilePath $exe -ArgumentList $args -WorkingDirectory $Game -PassThru
        Write-Host "запущено $name (pid $($procs[-1].Id))"
        Start-Sleep -Seconds $DelaySec
    }
    Read-Host "Enter — закрити всі копії"
}
finally {
    foreach ($p in $procs) { if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force } }
    Copy-Item $bak $opt -Force
    Remove-Item $bak
    Write-Host "options.ini повернуто"
}

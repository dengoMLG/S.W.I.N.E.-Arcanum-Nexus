param([string]$Steam = "A:\SteamLibrary\steamapps\common\SWINE HD Remaster")
# Тестова копія гри: mods-test/game (не в git). Сюди ставлять тестові збірки install-arcunits.js / install-voices.js
# і звідси запускають mp-run / mp-test / menu-shot. Тека Steam лишається чистою: її оновлює лише лаунчер,
# а він відмовляється патчити не-оригінальний swineHD.exe («Не вийшло» в лаунчері, 23.11.2026).
#   powershell -File tools/make-test-game.ps1      (повторний запуск — оновити копію з теки Steam)
$dst = Join-Path $PSScriptRoot "..\mods-test\game"
robocopy $Steam $dst /MIR /XD bonus /XF *.pdb /NFL /NDL /NJH /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed ($LASTEXITCODE)" }
# Запуск не з теки Steam: без steam_appid.txt SteamAPI може перезапустити гру через Steam (з оригінальної теки).
Set-Content (Join-Path $dst "steam_appid.txt") "944010" -Encoding ascii -NoNewline
$h = (Get-FileHash (Join-Path $dst "swineHD.exe")).Hash
"test game: $((Resolve-Path $dst).Path)  swineHD.exe $($h.Substring(0,12))"

param([int]$Count = 10)
# Свежие N журналів: слот, останній кадр, пакети других командирів; сума світу по кадрах — однакова в усіх копіях?
$log = "$env:LOCALAPPDATA\Kite Games\Swine\log"
$files = Get-ChildItem $log | Sort-Object LastWriteTime | Select-Object -Last $Count
$tab = @{}
foreach ($f in $files) {
  $t = Get-Content $f.FullName
  $m = $t | Select-String 'slot id = (\d+)' | Select-Object -Last 1
  $slot = if ($m) { $m.Matches[0].Groups[1].Value } else { 'host?' }
  foreach ($s in ($t | Select-String 'sync frame (\d+) hash ([0-9a-f]+)')) {
    $k = [int]$s.Matches[0].Groups[1].Value; if (-not $tab.ContainsKey($k)) { $tab[$k] = @{} }; $tab[$k]["s$slot"] = $s.Matches[0].Groups[2].Value }
  $co = ($t | Select-String 'sync co packets' | Select-Object -Last 1).Line
  $fr = ($t | Select-String 'autostart frame' | Select-Object -Last 1).Line
  $late = ($t | Select-String 'not arrived').Count
  "slot $slot | late $late | $fr | $co"
}
$bad = 0
foreach ($k in ($tab.Keys | Sort-Object)) { $v = $tab[$k]; $u = @($v.Values | Sort-Object -Unique); if ($u.Count -gt 1) { $bad++ }; "frame $k : copies $($v.Count), hashes $($u.Count) ($($u -join ','))" }
"desync frames: $bad"

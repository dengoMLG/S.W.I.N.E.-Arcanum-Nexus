# Атлас кнопок спецздібностей menu/panel/panel_spec.png з іконками нових типів 12–14 (патч exe, Caves.GlyphTable).
#   powershell -File tools/make-panel-spec.ps1 <оригінальний panel_spec.png> <вихідний png>
# Оригінал 512×512: клітинки 70×70 (логічні 35×35 у HD), 7 у рядку. Вихід 512×1024: зверху оригінал,
# клітинки 49–60 — гліфи 48–59: (тип·2 + стан)·2 (+1 — підсвічена). Темна кнопка — звичайна, світла — під курсором.
param([string]$SrcPath, [string]$Out)
Add-Type -AssemblyName System.Drawing
$atlas = [System.Drawing.Bitmap]::FromFile((Resolve-Path $SrcPath))
$bmp = New-Object System.Drawing.Bitmap 512, 1024, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear($atlas.GetPixel(505, 505))
$g.DrawImage($atlas, 0, 0, 512, 512)

# Порожня кнопка з клітинки-зразка: рамка як є, обличчя — інтерполяція країв (гліф стирається).
function New-Blank([int]$cell) {
  $x0 = ($cell % 7) * 70; $y0 = [math]::Floor($cell / 7) * 70
  $b = New-Object System.Drawing.Bitmap 70, 70, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  for ($y = 0; $y -lt 70; $y++) { for ($x = 0; $x -lt 70; $x++) { $b.SetPixel($x, $y, $atlas.GetPixel($x0 + $x, $y0 + $y)) } }
  $lo = 10; $hi = 60
  for ($y = $lo + 1; $y -lt $hi; $y++) {
    for ($x = $lo + 1; $x -lt $hi; $x++) {
      $tx = ($x - $lo) / ($hi - $lo); $ty = ($y - $lo) / ($hi - $lo)
      $cL = $b.GetPixel($lo, $y); $cR = $b.GetPixel($hi, $y); $cT = $b.GetPixel($x, $lo); $cB = $b.GetPixel($x, $hi)
      $vr = (($cL.R * (1 - $tx) + $cR.R * $tx) + ($cT.R * (1 - $ty) + $cB.R * $ty)) / 2
      $gg = (($cL.G * (1 - $tx) + $cR.G * $tx) + ($cT.G * (1 - $ty) + $cB.G * $ty)) / 2
      $bb = (($cL.B * (1 - $tx) + $cR.B * $tx) + ($cT.B * (1 - $ty) + $cB.B * $ty)) / 2
      $b.SetPixel($x, $y, [System.Drawing.Color]::FromArgb([int]$vr, [int]$gg, [int]$bb))
    }
  }
  return $b
}
$dark = New-Blank 0    # клітинка 0 — «окопатися», темна
$light = New-Blank 4   # клітинка 4 — те саме, світла

$ink = [System.Drawing.Brushes]::Black
function Pen([float]$w) { $p = New-Object System.Drawing.Pen ([System.Drawing.Color]::Black), $w; $p.StartCap = 'Round'; $p.EndCap = 'Round'; $p.LineJoin = 'Round'; return $p }
function Pt([float]$x, [float]$y) { New-Object System.Drawing.PointF $x, $y }
function Star($gr, [float]$cx, [float]$cy, [float]$r1, [float]$r2, [int]$n) {
  $pts = @(); for ($i = 0; $i -lt 2 * $n; $i++) { $r = if ($i % 2) { $r2 } else { $r1 }; $a = [math]::PI * $i / $n - [math]::PI / 2; $pts += Pt ($cx + $r * [math]::Cos($a)) ($cy + $r * [math]::Sin($a)) }
  $gr.FillPolygon($ink, [System.Drawing.PointF[]]$pts)
}
# Гліфи (координати в клітинці 70×70, центр обличчя ≈ 35,35)
$draw = @{
  # 12 «Підрив»: бомба з ґнотом і спалахом (обидва стани однакові — кнопка одноразова)
  '12' = { param($gr, $s) $gr.FillEllipse($ink, 16, 27, 30, 30); $gr.FillRectangle($ink, 33, 22, 9, 9)
           $gr.DrawBezier((Pen 3), (Pt 38 24), (Pt 42 14), (Pt 48 20), (Pt 50 14)); Star $gr 51 13 8 3 8 }
  # 13 «Міни на ходу»: міна-купол і доріжка мін зі стрілкою; стан 1 (мінує) — купол і знак «стоп»
  '13' = { param($gr, $s)
           $gr.FillPie($ink, 22, 20, 30, 26, 180, 180); $gr.FillRectangle($ink, 18, 33, 38, 5)
           if ($s -eq 0) { foreach ($x in 14, 25, 36) { $gr.FillEllipse($ink, $x, 46, 7, 7) }; $gr.FillPolygon($ink, [System.Drawing.PointF[]]@((Pt 47 43), (Pt 57 49.5), (Pt 47 56))) }
           else { $gr.FillRectangle($ink, 22, 45, 30, 11); $gr.FillRectangle([System.Drawing.Brushes]::White, 26, 48, 22, 5) } }
  # 14 «Радар»: око з променями; стан 1 (діє / перезарядка) — заплющене око
  '14' = { param($gr, $s)
           if ($s -eq 0) { $gr.DrawEllipse((Pen 4), 13, 28, 44, 22); $gr.FillEllipse($ink, 27, 31, 16, 16)
             $gr.DrawLine((Pen 3), 35, 13, 35, 21); $gr.DrawLine((Pen 3), 20, 17, 24, 24); $gr.DrawLine((Pen 3), 50, 17, 46, 24) }
           else { $gr.DrawArc((Pen 4), 13, 22, 44, 26, 20, 140)
             foreach ($x in 22, 35, 48) { $gr.DrawLine((Pen 3), $x, 47, ($x + ($x - 35) * 0.3), 55) } } }
}
foreach ($t in 12, 13, 14) {
  foreach ($s in 0, 1) {
    foreach ($hover in 0, 1) {
      $glyph = ($t * 2 + $s) * 2 + $hover; $cell = 49 + ($glyph - 48)
      $tile = if ($hover) { $light.Clone() } else { $dark.Clone() }
      $gr = [System.Drawing.Graphics]::FromImage($tile); $gr.SmoothingMode = 'AntiAlias'
      & $draw["$t"] $gr $s
      $gr.Dispose()
      $g.DrawImage($tile, ($cell % 7) * 70, [math]::Floor($cell / 7) * 70, 70, 70)
      $tile.Dispose()
    }
  }
}
$g.Dispose()
New-Item -ItemType Directory -Force (Split-Path $Out) | Out-Null
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
"panel_spec.png: 512x1024, icons for special types 12-14 -> $Out"

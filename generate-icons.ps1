Add-Type -AssemblyName System.Drawing

function Create-AlarmIcon([int]$size, [string]$outputPath, [bool]$maskable = $false) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    $s = [float]$size
    $scale = [float]($size / 512.0)

    # Background gradient
    $rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
    $redTop = [System.Drawing.Color]::FromArgb(239, 68, 68)
    $redBottom = [System.Drawing.Color]::FromArgb(185, 28, 28)
    $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $redTop, $redBottom, 45.0)

    if ($maskable) {
        $g.FillRectangle($bgBrush, $rect)
    } else {
        # Rounded squircle
        $radius = [float]($s * 0.22)
        $diameter = [float]($radius * 2.0)
        $path = New-Object System.Drawing.Drawing2D.GraphicsPath
        $pad = [float]($s * 0.04)
        $innerW = [float]($s - ($pad * 2.0))
        $innerH = [float]($s - ($pad * 2.0))
        
        $path.AddArc($pad, $pad, $diameter, $diameter, [float]180, [float]90)
        $path.AddArc([float]($pad + $innerW - $diameter), $pad, $diameter, $diameter, [float]270, [float]90)
        $path.AddArc([float]($pad + $innerW - $diameter), [float]($pad + $innerH - $diameter), $diameter, $diameter, [float]0, [float]90)
        $path.AddArc($pad, [float]($pad + $innerH - $diameter), $diameter, $diameter, [float]90, [float]90)
        $path.CloseFigure()
        
        $g.FillPath($bgBrush, $path)

        # Border
        $borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(100, 255, 255, 255), [float]($s * 0.015))
        $g.DrawPath($borderPen, $path)
    }

    # Center Bell Emblem
    $whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    
    # Draw bell handle
    $handlePen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, [float](18.0 * $scale))
    $handlePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $handlePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $g.DrawArc($handlePen, [float](226.0 * $scale), [float](100.0 * $scale), [float](60.0 * $scale), [float](60.0 * $scale), [float]180, [float]180)

    # Bell Body
    $bellPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $bellPath.StartFigure()
    $bellPath.AddBezier([float](256.0 * $scale), [float](140.0 * $scale), [float](195.0 * $scale), [float](140.0 * $scale), [float](160.0 * $scale), [float](200.0 * $scale), [float](155.0 * $scale), [float](285.0 * $scale))
    $bellPath.AddBezier([float](155.0 * $scale), [float](285.0 * $scale), [float](150.0 * $scale), [float](330.0 * $scale), [float](120.0 * $scale), [float](355.0 * $scale), [float](110.0 * $scale), [float](365.0 * $scale))
    $bellPath.AddLine([float](110.0 * $scale), [float](365.0 * $scale), [float](402.0 * $scale), [float](365.0 * $scale))
    $bellPath.AddBezier([float](402.0 * $scale), [float](365.0 * $scale), [float](392.0 * $scale), [float](355.0 * $scale), [float](362.0 * $scale), [float](330.0 * $scale), [float](357.0 * $scale), [float](285.0 * $scale))
    $bellPath.AddBezier([float](357.0 * $scale), [float](285.0 * $scale), [float](352.0 * $scale), [float](200.0 * $scale), [float](317.0 * $scale), [float](140.0 * $scale), [float](256.0 * $scale), [float](140.0 * $scale))
    $bellPath.CloseFigure()
    $g.FillPath($whiteBrush, $bellPath)

    # Clapper Ball
    $g.FillEllipse($whiteBrush, [float](230.0 * $scale), [float](375.0 * $scale), [float](52.0 * $scale), [float](52.0 * $scale))
    $redBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(239, 68, 68))
    $g.FillEllipse($redBrush, [float](238.0 * $scale), [float](383.0 * $scale), [float](36.0 * $scale), [float](36.0 * $scale))

    # Reimu Accent Ribbon on Bell
    $ribbonPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(239, 68, 68), [float](12.0 * $scale))
    $ribbonPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $ribbonPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $g.DrawArc($ribbonPen, [float](185.0 * $scale), [float](240.0 * $scale), [float](142.0 * $scale), [float](50.0 * $scale), [float]10, [float]160)

    # Sound wave arc
    $wavePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(220, 255, 255, 255), [float](10.0 * $scale))
    $wavePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $wavePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $g.DrawArc($wavePen, [float](65.0 * $scale), [float](210.0 * $scale), [float](40.0 * $scale), [float](80.0 * $scale), [float]110, [float]140)
    $g.DrawArc($wavePen, [float](405.0 * $scale), [float](210.0 * $scale), [float](40.0 * $scale), [float](80.0 * $scale), [float]290, [float]140)

    # Save PNG
    $bmp.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Host "Created: $outputPath ($size x $size)"
}

$iconDir = "c:\projek aplikasi\icons"
if (!(Test-Path $iconDir)) {
    New-Item -ItemType Directory -Path $iconDir | Out-Null
}

Create-AlarmIcon -size 192 -outputPath "$iconDir\icon-192.png" -maskable $false
Create-AlarmIcon -size 512 -outputPath "$iconDir\icon-512.png" -maskable $false
Create-AlarmIcon -size 512 -outputPath "$iconDir\maskable-icon-512.png" -maskable $true

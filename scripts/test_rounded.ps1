Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\tirth\.gemini\antigravity\brain\812c49d6-c021-4ccd-b604-548e00ba622d\.user_uploaded\media_1793359206064_fa18b998.jpg"
$src = [System.Drawing.Image]::FromFile($srcPath)

function Create-RoundedIcon($srcImg, $w, $h, $radius, $outPath) {
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $radius * 2
    $path.AddArc(0, 0, $d, $d, 180, 90)
    $path.AddArc($w - $d, 0, $d, $d, 270, 90)
    $path.AddArc($w - $d, $h - $d, $d, $d, 0, 90)
    $path.AddArc(0, $h - $d, $d, $d, 90, 90)
    $path.CloseFigure()

    $g.Clip = New-Object System.Drawing.Region($path)
    # Fill background with white inside rounded shape
    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $g.FillPath($brush, $path)
    $brush.Dispose()

    # Draw the logo image inside the clipped rounded path
    # With a small 3% margin so emblem isn't cut off at the rounded corners
    $pad = [math]::Round($w * 0.03)
    $drawW = $w - ($pad * 2)
    $drawH = $h - ($pad * 2)
    $g.DrawImage($srcImg, $pad, $pad, $drawW, $drawH)

    $path.Dispose()
    $g.Dispose()

    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Output "Created rounded icon: $outPath ($($w)x$($h), radius=$radius)"
}

Create-RoundedIcon $src 180 180 40 "tests\scratch\test_rounded_180.png"
Create-RoundedIcon $src 32 32 7 "tests\scratch\test_rounded_32.png"

$src.Dispose()

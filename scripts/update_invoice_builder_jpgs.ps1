Add-Type -AssemblyName System.Drawing

$srcEmblemCrop = [System.Drawing.Bitmap]::FromFile((Resolve-Path "tests\scratch\cropped_emblem.png"))

function Save-CleanJpg($src, $w, $h, $destPath, $quality = 95) {
    $dir = Split-Path -Parent $destPath
    if ($dir -and (-not (Test-Path $dir))) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::White)

    # Inset slightly
    $pad = [math]::Round($w * 0.04)
    $drawW = $w - ($pad * 2)
    $drawH = $h - ($pad * 2)
    $g.DrawImage($src, $pad, $pad, $drawW, $drawH)
    $g.Dispose()

    $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
    $encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
    $encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]$quality)

    $bmp.Save($destPath, $codec, $encoderParams)
    $bmp.Dispose()
    Write-Output "Updated JPG: $destPath ($($w)x$($h))"
}

$jpgVariants = @(
    @{ Path = "Invoice Builder\public\favicon-16x16.jpg"; W = 16; H = 16 },
    @{ Path = "Invoice Builder\public\favicon-32x32.jpg"; W = 32; H = 32 },
    @{ Path = "Invoice Builder\public\apple-touch-icon.jpg"; W = 180; H = 180 },
    @{ Path = "Invoice Builder\public\android-chrome-192x192.jpg"; W = 192; H = 192 },
    @{ Path = "Invoice Builder\public\android-chrome-512x512.jpg"; W = 512; H = 512 },
    @{ Path = "Invoice Builder\public\maskable-icon.jpg"; W = 512; H = 512 },
    @{ Path = "apps\Invoice Builder\public\favicon-16x16.jpg"; W = 16; H = 16 },
    @{ Path = "apps\Invoice Builder\public\favicon-32x32.jpg"; W = 32; H = 32 },
    @{ Path = "apps\Invoice Builder\public\apple-touch-icon.jpg"; W = 180; H = 180 },
    @{ Path = "apps\Invoice Builder\public\android-chrome-192x192.jpg"; W = 192; H = 192 },
    @{ Path = "apps\Invoice Builder\public\android-chrome-512x512.jpg"; W = 512; H = 512 },
    @{ Path = "apps\Invoice Builder\public\maskable-icon.jpg"; W = 512; H = 512 }
)

foreach ($item in $jpgVariants) {
    Save-CleanJpg $srcEmblemCrop $item.W $item.H $item.Path 95
}

$srcEmblemCrop.Dispose()
Write-Output "Updated Invoice Builder JPGs!"

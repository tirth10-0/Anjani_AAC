Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\tirth\.gemini\antigravity\brain\812c49d6-c021-4ccd-b604-548e00ba622d\.user_uploaded\media_1793359206064_fa18b998.jpg"

if (-not (Test-Path $srcPath)) {
    Write-Error "Source file not found at $srcPath"
    exit 1
}

$srcImg = [System.Drawing.Image]::FromFile($srcPath)
Write-Output "Official Source Loaded: $($srcImg.Width)x$($srcImg.Height), Size: $((Get-Item $srcPath).Length) bytes"

# Helper function to resize and save image as PNG
function Save-ResizedPng($src, $w, $h, $destPath) {
    $dir = Split-Path -Parent $destPath
    if ($dir -and (-not (Test-Path $dir))) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.DrawImage($src, 0, 0, $w, $h)
    $g.Dispose()

    $bmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Output "Generated PNG: $destPath ($($w)x$($h))"
}

# Helper function to resize and save image as JPG
function Save-ResizedJpg($src, $w, $h, $destPath, $quality = 95) {
    $dir = Split-Path -Parent $destPath
    if ($dir -and (-not (Test-Path $dir))) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.Clear([System.Drawing.Color]::White)
    $g.DrawImage($src, 0, 0, $w, $h)
    $g.Dispose()

    $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
    $encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
    $encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]$quality)

    $bmp.Save($destPath, $codec, $encoderParams)
    $bmp.Dispose()
    Write-Output "Generated JPG: $destPath ($($w)x$($h))"
}

# 1. Official Direct Copy (exact byte-for-byte source image, zero modification)
$exactJpgDests = @(
    "assets\images\logo.jpg",
    "Invoice Builder\logo.jpg",
    "Invoice Builder\public\logo.jpg",
    "Invoice Builder\public\logo-full.jpg",
    "apps\Invoice Builder\logo.jpg",
    "apps\Invoice Builder\public\logo.jpg",
    "apps\Invoice Builder\public\logo-full.jpg",
    "public\assets\images\logo.jpg"
)

foreach ($d in $exactJpgDests) {
    $dir = Split-Path -Parent $d
    if ($dir -and (-not (Test-Path $dir))) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    Copy-Item -Path $srcPath -Destination $d -Force
    Write-Output "Copied exact official logo: $d"
}

# 2. High-Res PNG Logo (1024x1024)
$pngDests = @(
    "assets\images\logo.png",
    "assets\images\logo-rounded.png",
    "assets\formulations-build\logo-rounded-d20ZjoY5.png",
    "apps\Formulations\dist\assets\logo-rounded-d20ZjoY5.png"
)
foreach ($d in $pngDests) {
    Save-ResizedPng $srcImg 1024 1024 $d
}

# 3. Favicon & Apple Touch Icons
$iconSizes = @(
    @{ Path = "assets\icons\favicon-16x16.png"; W = 16; H = 16 },
    @{ Path = "assets\icons\favicon-32x32.png"; W = 32; H = 32 },
    @{ Path = "assets\icons\favicon-48x48.png"; W = 48; H = 48 },
    @{ Path = "favicon.png"; W = 32; H = 32 },
    @{ Path = "public\favicon.png"; W = 32; H = 32 },
    @{ Path = "apple-touch-icon.png"; W = 180; H = 180 },
    @{ Path = "public\apple-touch-icon.png"; W = 180; H = 180 },
    @{ Path = "assets\icons\apple-touch-icon.png"; W = 180; H = 180 },
    @{ Path = "assets\icons\apple-touch-icon-180x180.png"; W = 180; H = 180 },
    @{ Path = "assets\icons\apple-touch-icon-152x152.png"; W = 152; H = 152 },
    @{ Path = "assets\icons\icon-48x48.png"; W = 48; H = 48 },
    @{ Path = "assets\icons\icon-72x72.png"; W = 72; H = 72 },
    @{ Path = "assets\icons\icon-96x96.png"; W = 96; H = 96 },
    @{ Path = "assets\icons\icon-128x128.png"; W = 128; H = 128 },
    @{ Path = "assets\icons\icon-144x144.png"; W = 144; H = 144 },
    @{ Path = "assets\icons\icon-152x152.png"; W = 152; H = 152 },
    @{ Path = "assets\icons\icon-192x192.png"; W = 192; H = 192 },
    @{ Path = "assets\icons\icon-384x384.png"; W = 384; H = 384 },
    @{ Path = "assets\icons\icon-512x512.png"; W = 512; H = 512 },
    @{ Path = "assets\icons\icon-maskable-192x192.png"; W = 192; H = 192 },
    @{ Path = "assets\icons\icon-maskable-512x512.png"; W = 512; H = 512 },

    # Invoice Builder
    @{ Path = "Invoice Builder\public\favicon-16x16.png"; W = 16; H = 16 },
    @{ Path = "Invoice Builder\public\favicon-32x32.png"; W = 32; H = 32 },
    @{ Path = "Invoice Builder\public\apple-touch-icon.png"; W = 180; H = 180 },
    @{ Path = "Invoice Builder\public\icon-192.png"; W = 192; H = 192 },
    @{ Path = "Invoice Builder\public\icon-512.png"; W = 512; H = 512 },
    @{ Path = "Invoice Builder\public\android-chrome-192x192.png"; W = 192; H = 192 },
    @{ Path = "Invoice Builder\public\android-chrome-512x512.png"; W = 512; H = 512 },

    # apps/Invoice Builder
    @{ Path = "apps\Invoice Builder\public\favicon-16x16.png"; W = 16; H = 16 },
    @{ Path = "apps\Invoice Builder\public\favicon-32x32.png"; W = 32; H = 32 },
    @{ Path = "apps\Invoice Builder\public\apple-touch-icon.png"; W = 180; H = 180 },
    @{ Path = "apps\Invoice Builder\public\icon-192.png"; W = 192; H = 192 },
    @{ Path = "apps\Invoice Builder\public\icon-512.png"; W = 512; H = 512 },
    @{ Path = "apps\Invoice Builder\public\android-chrome-192x192.png"; W = 192; H = 192 },
    @{ Path = "apps\Invoice Builder\public\android-chrome-512x512.png"; W = 512; H = 512 }
)

foreach ($item in $iconSizes) {
    Save-ResizedPng $srcImg $item.W $item.H $item.Path
    if ($item.Path -like "assets\icons\*") {
        $pubPath = $item.Path.Replace("assets\icons\", "public\assets\icons\")
        Save-ResizedPng $srcImg $item.W $item.H $pubPath
    }
}

# JPG variants in Invoice Builder
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
    Save-ResizedJpg $srcImg $item.W $item.H $item.Path 95
}

$srcImg.Dispose()
Write-Output "ALL ASSETS SUCCESSFULLY GENERATED FROM NEW LOGO!"

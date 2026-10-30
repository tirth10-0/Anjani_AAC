Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\tirth\.gemini\antigravity\brain\812c49d6-c021-4ccd-b604-548e00ba622d\.user_uploaded\media_1793358274486_a10cc3fd.jpg"

if (-not (Test-Path $srcPath)) {
    Write-Error "Source file not found at $srcPath"
    exit 1
}

$srcImg = [System.Drawing.Image]::FromFile($srcPath)
Write-Output "Source Loaded: $($srcImg.Width)x$($srcImg.Height)"

# Helper function to resize and save image as PNG
function Save-ResizedPng($src, $w, $h, $destPath) {
    $dir = Split-Path -Parent $destPath
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    
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
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    
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

# Helper function to build multi-resolution ICO file
function Build-IcoFile($src, $sizes, $destPath) {
    $dir = Split-Path -Parent $destPath
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }

    $entries = @()
    foreach ($sz in $sizes) {
        $bmp = New-Object System.Drawing.Bitmap $sz, $sz
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $g.Clear([System.Drawing.Color]::Transparent)
        $g.DrawImage($src, 0, 0, $sz, $sz)
        $g.Dispose()

        $ms = New-Object System.IO.MemoryStream
        $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
        $bmp.Dispose()
        $bytes = $ms.ToArray()
        $ms.Dispose()

        $entries += ,@($sz, $bytes)
    }

    $fs = [System.IO.File]::Create($destPath)
    $bw = New-Object System.IO.BinaryWriter $fs

    # ICONDIR: Reserved=0, Type=1 (ICO), Count
    $bw.Write([uint16]0)
    $bw.Write([uint16]1)
    $bw.Write([uint16]$entries.Count)

    # Offset to image data: Header (6) + (16 * count)
    $offset = 6 + (16 * $entries.Count)

    foreach ($e in $entries) {
        $sz = $e[0]
        $bytes = $e[1]
        $bW = if ($sz -ge 256) { [byte]0 } else { [byte]$sz }
        $bH = if ($sz -ge 256) { [byte]0 } else { [byte]$sz }

        $bw.Write($bW)
        $bw.Write($bH)
        $bw.Write([byte]0)   # color count
        $bw.Write([byte]0)   # reserved
        $bw.Write([uint16]1) # planes
        $bw.Write([uint16]32)# bpp
        $bw.Write([uint32]$bytes.Length)
        $bw.Write([uint32]$offset)
        $offset += $bytes.Length
    }

    foreach ($e in $entries) {
        $bw.Write($e[1])
    }

    $bw.Flush()
    $bw.Close()
    $fs.Close()
    Write-Output "Generated ICO: $destPath ($($sizes -join ',') px)"
}

# 1. Official Direct Copy (exact byte-for-byte source image)
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
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
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
    # Also sync to public/ if in assets/icons/
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

# 4. Multi-Resolution ICO files (16, 32, 48)
$icoDests = @(
    "favicon.ico",
    "public\favicon.ico",
    "Invoice Builder\public\favicon.ico",
    "apps\Invoice Builder\public\favicon.ico"
)
foreach ($d in $icoDests) {
    Build-IcoFile $srcImg @(16, 32, 48) $d
}

$srcImg.Dispose()
Write-Output "ALL BRANDING ASSETS SUCCESSFULLY GENERATED!"

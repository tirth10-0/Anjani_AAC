Add-Type -AssemblyName System.Drawing

$srcEmblemPath = "C:\Users\tirth\.gemini\antigravity\brain\812c49d6-c021-4ccd-b604-548e00ba622d\.user_uploaded\media_1793360415258_3ae950d2.jpg"
$srcFullLogoPath = "C:\Users\tirth\.gemini\antigravity\brain\812c49d6-c021-4ccd-b604-548e00ba622d\.user_uploaded\media_1793359206064_fa18b998.jpg"

if (-not (Test-Path $srcEmblemPath)) {
    Write-Error "Emblem source not found: $srcEmblemPath"
    exit 1
}

# 1. Load source emblem and crop out the perimeter border (emblem center is at 512, 511)
$rawEmblemBmp = [System.Drawing.Bitmap]::FromFile($srcEmblemPath)
$cleanEmblem = New-Object System.Drawing.Bitmap 640, 640
$cg = [System.Drawing.Graphics]::FromImage($cleanEmblem)
$cg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$cg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$cg.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$cg.Clear([System.Drawing.Color]::White)
$cg.DrawImage($rawEmblemBmp, (New-Object System.Drawing.Rectangle 0, 0, 640, 640), 192, 191, 640, 640, [System.Drawing.GraphicsUnit]::Pixel)
$cg.Dispose()
$rawEmblemBmp.Dispose()

Write-Output "Clean Emblem Crop Ready: 640x640"

# Also load clean full logo
$cleanFullLogo = [System.Drawing.Bitmap]::FromFile($srcFullLogoPath)
Write-Output "Clean Full Logo Ready: $($cleanFullLogo.Width)x$($cleanFullLogo.Height)"

# Function to generate a rounded-corner PNG
function Save-RoundedEmblemPng($srcImg, $w, $h, $radius, $destPath, $innerPadPercent = 0.04) {
    $dir = Split-Path -Parent $destPath
    if ($dir -and (-not (Test-Path $dir))) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = [math]::Round($radius * 2)
    if ($d -gt $w) { $d = $w }
    if ($d -gt $h) { $d = $h }

    $path.AddArc(0, 0, $d, $d, 180, 90)
    $path.AddArc($w - $d, 0, $d, $d, 270, 90)
    $path.AddArc($w - $d, $h - $d, $d, $d, 0, 90)
    $path.AddArc(0, $h - $d, $d, $d, 90, 90)
    $path.CloseFigure()

    $g.Clip = New-Object System.Drawing.Region($path)
    
    # Fill background with clean white inside the rounded shape
    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $g.FillPath($brush, $path)
    $brush.Dispose()

    # Draw emblem inside the rounded shape with slight inset
    $pad = [math]::Round($w * $innerPadPercent)
    $drawW = $w - ($pad * 2)
    $drawH = $h - ($pad * 2)
    $g.DrawImage($srcImg, $pad, $pad, $drawW, $drawH)

    $path.Dispose()
    $g.Dispose()

    $bmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Output "Created Rounded Icon: $destPath ($($w)x$($h), r=$radius)"
}

# Generate 1024x1024 high-res rounded logo (using full logo)
Save-RoundedEmblemPng $cleanFullLogo 1024 1024 220 "assets\images\logo-rounded.png" 0.02
Save-RoundedEmblemPng $cleanFullLogo 1024 1024 220 "assets\formulations-build\logo-rounded-d20ZjoY5.png" 0.02
Save-RoundedEmblemPng $cleanFullLogo 1024 1024 220 "apps\Formulations\dist\assets\logo-rounded-d20ZjoY5.png" 0.02

# List of all icons to generate with rounded corners (using clean emblem for optimal legibility)
$icons = @(
    # Favicons
    @{ Path = "assets\icons\favicon-16x16.png"; W = 16; H = 16; R = 4 },
    @{ Path = "assets\icons\favicon-32x32.png"; W = 32; H = 32; R = 8 },
    @{ Path = "assets\icons\favicon-48x48.png"; W = 48; H = 48; R = 12 },
    @{ Path = "favicon.png"; W = 32; H = 32; R = 8 },
    @{ Path = "public\favicon.png"; W = 32; H = 32; R = 8 },

    # Apple Touch Icons
    @{ Path = "apple-touch-icon.png"; W = 180; H = 180; R = 40 },
    @{ Path = "public\apple-touch-icon.png"; W = 180; H = 180; R = 40 },
    @{ Path = "assets\icons\apple-touch-icon.png"; W = 180; H = 180; R = 40 },
    @{ Path = "assets\icons\apple-touch-icon-180x180.png"; W = 180; H = 180; R = 40 },
    @{ Path = "assets\icons\apple-touch-icon-152x152.png"; W = 152; H = 152; R = 34 },

    # PWA Standard Icons
    @{ Path = "assets\icons\icon-48x48.png"; W = 48; H = 48; R = 11 },
    @{ Path = "assets\icons\icon-72x72.png"; W = 72; H = 72; R = 16 },
    @{ Path = "assets\icons\icon-96x96.png"; W = 96; H = 96; R = 22 },
    @{ Path = "assets\icons\icon-128x128.png"; W = 128; H = 128; R = 29 },
    @{ Path = "assets\icons\icon-144x144.png"; W = 144; H = 144; R = 33 },
    @{ Path = "assets\icons\icon-152x152.png"; W = 152; H = 152; R = 35 },
    @{ Path = "assets\icons\icon-192x192.png"; W = 192; H = 192; R = 44 },
    @{ Path = "assets\icons\icon-384x384.png"; W = 384; H = 384; R = 86 },
    @{ Path = "assets\icons\icon-512x512.png"; W = 512; H = 512; R = 116 },

    # Maskable PWA Icons (inset 10% for circular/adaptive clipping)
    @{ Path = "assets\icons\icon-maskable-192x192.png"; W = 192; H = 192; R = 44 },
    @{ Path = "assets\icons\icon-maskable-512x512.png"; W = 512; H = 512; R = 116 },

    # Invoice Builder Public Icons
    @{ Path = "Invoice Builder\public\favicon-16x16.png"; W = 16; H = 16; R = 4 },
    @{ Path = "Invoice Builder\public\favicon-32x32.png"; W = 32; H = 32; R = 8 },
    @{ Path = "Invoice Builder\public\apple-touch-icon.png"; W = 180; H = 180; R = 40 },
    @{ Path = "Invoice Builder\public\icon-192.png"; W = 192; H = 192; R = 44 },
    @{ Path = "Invoice Builder\public\icon-512.png"; W = 512; H = 512; R = 116 },
    @{ Path = "Invoice Builder\public\android-chrome-192x192.png"; W = 192; H = 192; R = 44 },
    @{ Path = "Invoice Builder\public\android-chrome-512x512.png"; W = 512; H = 512; R = 116 },

    # apps/Invoice Builder Mirrors
    @{ Path = "apps\Invoice Builder\public\favicon-16x16.png"; W = 16; H = 16; R = 4 },
    @{ Path = "apps\Invoice Builder\public\favicon-32x32.png"; W = 32; H = 32; R = 8 },
    @{ Path = "apps\Invoice Builder\public\apple-touch-icon.png"; W = 180; H = 180; R = 40 },
    @{ Path = "apps\Invoice Builder\public\icon-192.png"; W = 192; H = 192; R = 44 },
    @{ Path = "apps\Invoice Builder\public\icon-512.png"; W = 512; H = 512; R = 116 },
    @{ Path = "apps\Invoice Builder\public\android-chrome-192x192.png"; W = 192; H = 192; R = 44 },
    @{ Path = "apps\Invoice Builder\public\android-chrome-512x512.png"; W = 512; H = 512; R = 116 }
)

foreach ($item in $icons) {
    $pad = 0.04
    if ($item.Path -like "*maskable*") { $pad = 0.10 }
    Save-RoundedEmblemPng $cleanEmblem $item.W $item.H $item.R $item.Path $pad
    if ($item.Path -like "assets\icons\*") {
        $pubPath = $item.Path.Replace("assets\icons\", "public\assets\icons\")
        Save-RoundedEmblemPng $cleanEmblem $item.W $item.H $item.R $pubPath $pad
    }
}

$cleanEmblem.Dispose()
$cleanFullLogo.Dispose()

Write-Output "ALL ROUNDED ICONS GENERATED SUCCESSFULLY!"

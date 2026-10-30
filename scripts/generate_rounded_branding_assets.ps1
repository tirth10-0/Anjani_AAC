Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\tirth\.gemini\antigravity\brain\812c49d6-c021-4ccd-b604-548e00ba622d\.user_uploaded\media_1793359206064_fa18b998.jpg"

if (-not (Test-Path $srcPath)) {
    Write-Error "Source file not found at $srcPath"
    exit 1
}

$srcImg = [System.Drawing.Image]::FromFile($srcPath)
Write-Output "Source Loaded for Rounded Assets: $($srcImg.Width)x$($srcImg.Height)"

# Helper function to generate a smooth rounded-corner PNG
function Save-RoundedPng($src, $w, $h, $radius, $destPath, $innerPadPercent = 0.02) {
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

    # Draw emblem inside the rounded shape with slight inset so it breathes beautifully
    $pad = [math]::Round($w * $innerPadPercent)
    $drawW = $w - ($pad * 2)
    $drawH = $h - ($pad * 2)
    $g.DrawImage($src, $pad, $pad, $drawW, $drawH)

    $path.Dispose()
    $g.Dispose()

    $bmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Output "Created Rounded PNG: $destPath ($($w)x$($h), r=$radius)"
}

# 1. High-Res Logo-Rounded (1024x1024, radius=220)
Save-RoundedPng $srcImg 1024 1024 220 "assets\images\logo-rounded.png" 0.02
Save-RoundedPng $srcImg 1024 1024 220 "assets\formulations-build\logo-rounded-d20ZjoY5.png" 0.02
Save-RoundedPng $srcImg 1024 1024 220 "apps\Formulations\dist\assets\logo-rounded-d20ZjoY5.png" 0.02

# 2. Favicons with Beautiful Rounded Corners (radius = 24% of dimension)
$faviconList = @(
    @{ Path = "assets\icons\favicon-16x16.png"; W = 16; H = 16; R = 4 },
    @{ Path = "assets\icons\favicon-32x32.png"; W = 32; H = 32; R = 8 },
    @{ Path = "assets\icons\favicon-48x48.png"; W = 48; H = 48; R = 12 },
    @{ Path = "favicon.png"; W = 32; H = 32; R = 8 },
    @{ Path = "public\favicon.png"; W = 32; H = 32; R = 8 },
    @{ Path = "apple-touch-icon.png"; W = 180; H = 180; R = 40 },
    @{ Path = "public\apple-touch-icon.png"; W = 180; H = 180; R = 40 },
    @{ Path = "assets\icons\apple-touch-icon.png"; W = 180; H = 180; R = 40 },
    @{ Path = "assets\icons\apple-touch-icon-180x180.png"; W = 180; H = 180; R = 40 },
    @{ Path = "assets\icons\apple-touch-icon-152x152.png"; W = 152; H = 152; R = 34 },

    # PWA Standard Icons (with smooth rounded corners)
    @{ Path = "assets\icons\icon-48x48.png"; W = 48; H = 48; R = 11 },
    @{ Path = "assets\icons\icon-72x72.png"; W = 72; H = 72; R = 16 },
    @{ Path = "assets\icons\icon-96x96.png"; W = 96; H = 96; R = 22 },
    @{ Path = "assets\icons\icon-128x128.png"; W = 128; H = 128; R = 28 },
    @{ Path = "assets\icons\icon-144x144.png"; W = 144; H = 144; R = 32 },
    @{ Path = "assets\icons\icon-152x152.png"; W = 152; H = 152; R = 34 },
    @{ Path = "assets\icons\icon-192x192.png"; W = 192; H = 192; R = 42 },
    @{ Path = "assets\icons\icon-384x384.png"; W = 384; H = 384; R = 84 },
    @{ Path = "assets\icons\icon-512x512.png"; W = 512; H = 512; R = 112 },

    # Maskable PWA Icons (Safe zone inset 10%, rounded emblem)
    @{ Path = "assets\icons\icon-maskable-192x192.png"; W = 192; H = 192; R = 42 },
    @{ Path = "assets\icons\icon-maskable-512x512.png"; W = 512; H = 512; R = 112 },

    # Invoice Builder Public
    @{ Path = "Invoice Builder\public\favicon-16x16.png"; W = 16; H = 16; R = 4 },
    @{ Path = "Invoice Builder\public\favicon-32x32.png"; W = 32; H = 32; R = 8 },
    @{ Path = "Invoice Builder\public\apple-touch-icon.png"; W = 180; H = 180; R = 40 },
    @{ Path = "Invoice Builder\public\icon-192.png"; W = 192; H = 192; R = 42 },
    @{ Path = "Invoice Builder\public\icon-512.png"; W = 512; H = 512; R = 112 },
    @{ Path = "Invoice Builder\public\android-chrome-192x192.png"; W = 192; H = 192; R = 42 },
    @{ Path = "Invoice Builder\public\android-chrome-512x512.png"; W = 512; H = 512; R = 112 },

    # apps/Invoice Builder Public
    @{ Path = "apps\Invoice Builder\public\favicon-16x16.png"; W = 16; H = 16; R = 4 },
    @{ Path = "apps\Invoice Builder\public\favicon-32x32.png"; W = 32; H = 32; R = 8 },
    @{ Path = "apps\Invoice Builder\public\apple-touch-icon.png"; W = 180; H = 180; R = 40 },
    @{ Path = "apps\Invoice Builder\public\icon-192.png"; W = 192; H = 192; R = 42 },
    @{ Path = "apps\Invoice Builder\public\icon-512.png"; W = 512; H = 512; R = 112 },
    @{ Path = "apps\Invoice Builder\public\android-chrome-192x192.png"; W = 192; H = 192; R = 42 },
    @{ Path = "apps\Invoice Builder\public\android-chrome-512x512.png"; W = 512; H = 512; R = 112 }
)

foreach ($item in $faviconList) {
    Save-RoundedPng $srcImg $item.W $item.H $item.R $item.Path 0.02
    if ($item.Path -like "assets\icons\*") {
        $pubPath = $item.Path.Replace("assets\icons\", "public\assets\icons\")
        Save-RoundedPng $srcImg $item.W $item.H $item.R $pubPath 0.02
    }
}

$srcImg.Dispose()
Write-Output "ALL ROUNDED BRANDING ASSETS SUCCESSFULLY GENERATED!"

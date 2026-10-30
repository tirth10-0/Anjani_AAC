Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\tirth\.gemini\antigravity\brain\812c49d6-c021-4ccd-b604-548e00ba622d\.user_uploaded\media_1793358274486_a10cc3fd.jpg"

if (-not (Test-Path $srcPath)) {
    Write-Error "Source file not found at $srcPath"
    exit 1
}

$srcImg = [System.Drawing.Image]::FromFile($srcPath)
Write-Output "Source Loaded: $($srcImg.Width)x$($srcImg.Height)"
$srcImg.Dispose()

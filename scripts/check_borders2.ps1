Add-Type -AssemblyName System.Drawing

$img1 = [System.Drawing.Bitmap]::FromFile('C:\Users\tirth\.gemini\antigravity\brain\812c49d6-c021-4ccd-b604-548e00ba622d\.user_uploaded\media_1793358274486_a10cc3fd.jpg')
$img2 = [System.Drawing.Bitmap]::FromFile('C:\Users\tirth\.gemini\antigravity\brain\812c49d6-c021-4ccd-b604-548e00ba622d\.user_uploaded\media_1793359206064_fa18b998.jpg')

for ($y = 0; $y -lt 300; $y++) {
    $found = $false
    for ($x = 0; $x -lt 1024; $x++) {
        $p1 = $img1.GetPixel($x, $y)
        if ($p1.R -lt 240) {
            Write-Output "Image 1 first non-white at y=$y, x=$x"
            $found = $true
            break
        }
    }
    if ($found) { break }
}

for ($y = 0; $y -lt 300; $y++) {
    $found = $false
    for ($x = 0; $x -lt 1024; $x++) {
        $p2 = $img2.GetPixel($x, $y)
        if ($p2.R -lt 240) {
            Write-Output "Image 2 first non-white at y=$y, x=$x"
            $found = $true
            break
        }
    }
    if ($found) { break }
}

$img1.Dispose()
$img2.Dispose()

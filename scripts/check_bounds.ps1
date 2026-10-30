Add-Type -AssemblyName System.Drawing

$img2 = [System.Drawing.Bitmap]::FromFile('C:\Users\tirth\.gemini\antigravity\brain\812c49d6-c021-4ccd-b604-548e00ba622d\.user_uploaded\media_1793359206064_fa18b998.jpg')

# Check bounds of non-white pixels in Image 2
$minX = 1024; $maxX = 0; $minY = 1024; $maxY = 0

for ($y = 0; $y -lt 1024; $y += 4) {
    for ($x = 0; $x -lt 1024; $x += 4) {
        $p = $img2.GetPixel($x, $y)
        if ($p.R -lt 245 -or $p.G -lt 245 -or $p.B -lt 245) {
            if ($x -lt $minX) { $minX = $x }
            if ($x -gt $maxX) { $maxX = $x }
            if ($y -lt $minY) { $minY = $y }
            if ($y -gt $maxY) { $maxY = $y }
        }
    }
}

Write-Output "Image 2 Content Bounds: X=[$minX, $maxX], Y=[$minY, $maxY]"
$img2.Dispose()

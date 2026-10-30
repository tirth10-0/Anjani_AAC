Add-Type -AssemblyName System.Drawing

$img1 = [System.Drawing.Bitmap]::FromFile('C:\Users\tirth\.gemini\antigravity\brain\812c49d6-c021-4ccd-b604-548e00ba622d\.user_uploaded\media_1793358274486_a10cc3fd.jpg')
$img2 = [System.Drawing.Bitmap]::FromFile('C:\Users\tirth\.gemini\antigravity\brain\812c49d6-c021-4ccd-b604-548e00ba622d\.user_uploaded\media_1793359206064_fa18b998.jpg')

Write-Output "Image 1 (first upload): $($img1.Width)x$($img1.Height)"
Write-Output "Image 2 (second upload): $($img2.Width)x$($img2.Height)"

# Check pixel at 40,40
Write-Output "Image 1 at (40,40): $($img1.GetPixel(40,40))"
Write-Output "Image 2 at (40,40): $($img2.GetPixel(40,40))"

# Check pixel at 10,10
Write-Output "Image 1 at (10,10): $($img1.GetPixel(10,10))"
Write-Output "Image 2 at (10,10): $($img2.GetPixel(10,10))"

# Find non-white borders in image 1 vs image 2
function Check-SquareBorder($bmp, $name) {
    $borderPixels = 0
    # Scan horizontal line at y=40
    for ($x = 40; $x -lt ($bmp.Width - 40); $x++) {
        $px = $bmp.GetPixel($x, 40)
        if ($px.R -lt 200 -and $px.G -lt 200 -and $px.B -lt 200) {
            $borderPixels++
        }
    }
    Write-Output "$name non-white pixels along y=40: $borderPixels"
}

Check-SquareBorder $img1 "Image 1 (with square border line)"
Check-SquareBorder $img2 "Image 2 (new upload)"

$img1.Dispose()
$img2.Dispose()

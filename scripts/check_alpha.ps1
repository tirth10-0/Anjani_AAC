Add-Type -AssemblyName System.Drawing

$bmp = [System.Drawing.Bitmap]::FromFile('tests\scratch\test_rounded_32.png')
Write-Output "Corner (0,0) Alpha: $($bmp.GetPixel(0,0).A)"
Write-Output "Corner (31,0) Alpha: $($bmp.GetPixel(31,0).A)"
Write-Output "Center (16,16) Alpha: $($bmp.GetPixel(16,16).A), Color: $($bmp.GetPixel(16,16))"
$bmp.Dispose()

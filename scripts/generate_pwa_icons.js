const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const iconsDir = path.resolve('assets/icons');

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

const logoBase64 = fs.readFileSync('assets/images/logo.png').toString('base64');
const logoDataUri = 'data:image/png;base64,' + logoBase64;

async function generateIcons() {
  const browser = await puppeteer.launch({
    executablePath: edgePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  // Define icon targets
  const targets = [
    { name: 'icon-48x48.png', size: 48, maskable: false },
    { name: 'icon-72x72.png', size: 72, maskable: false },
    { name: 'icon-96x96.png', size: 96, maskable: false },
    { name: 'icon-128x128.png', size: 128, maskable: false },
    { name: 'icon-144x144.png', size: 144, maskable: false },
    { name: 'icon-152x152.png', size: 152, maskable: false },
    { name: 'icon-192x192.png', size: 192, maskable: false },
    { name: 'icon-384x384.png', size: 384, maskable: false },
    { name: 'icon-512x512.png', size: 512, maskable: false },
    { name: 'icon-maskable-192x192.png', size: 192, maskable: true },
    { name: 'icon-maskable-512x512.png', size: 512, maskable: true },
    { name: 'apple-touch-icon.png', size: 180, maskable: false, paddingFactor: 0.1 },
    { name: 'apple-touch-icon-180x180.png', size: 180, maskable: false, paddingFactor: 0.1 },
    { name: 'apple-touch-icon-152x152.png', size: 152, maskable: false, paddingFactor: 0.1 },
    { name: 'favicon-16x16.png', size: 16, maskable: false, paddingFactor: 0.05 },
    { name: 'favicon-32x32.png', size: 32, maskable: false, paddingFactor: 0.05 },
    { name: 'favicon-48x48.png', size: 48, maskable: false, paddingFactor: 0.05 }
  ];

  for (const target of targets) {
    const pngDataUrl = await page.evaluate(async (uri, size, isMaskable, customPadding) => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          
          // Image smoothing for highest quality antialiasing
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';

          // Background fill: clean white #FFFFFF
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, size, size);

          // Calculate sizing:
          // Maskable icon safe zone requires 80% circle, so emblem fits within 75-80% of canvas
          // Standard icons look best with ~90% scale (5% padding on each side)
          let padding;
          if (customPadding !== undefined) {
            padding = size * customPadding;
          } else if (isMaskable) {
            padding = size * 0.12; // 76% usable area, well inside the 80% safe zone
          } else {
            padding = size * 0.05; // 90% usable area
          }

          const drawSize = size - (padding * 2);
          const drawX = padding;
          const drawY = padding;

          ctx.drawImage(img, drawX, drawY, drawSize, drawSize);
          resolve(canvas.toDataURL('image/png'));
        };
        img.src = uri;
      });
    }, logoDataUri, target.size, target.maskable, target.paddingFactor);

    const base64Data = pngDataUrl.replace(/^data:image\/png;base64,/, '');
    const outPath = path.join(iconsDir, target.name);
    fs.writeFileSync(outPath, base64Data, 'base64');
    console.log(`Generated: ${target.name} (${target.size}x${target.size}) [maskable: ${target.maskable}]`);
  }

  // Also create a copy of 32x32 favicon at root as favicon.ico and favicon.png
  fs.copyFileSync(path.join(iconsDir, 'favicon-32x32.png'), 'favicon.ico');
  fs.copyFileSync(path.join(iconsDir, 'favicon-32x32.png'), 'favicon.png');
  fs.copyFileSync(path.join(iconsDir, 'apple-touch-icon.png'), 'apple-touch-icon.png');
  console.log('Generated root favicon.ico, favicon.png, apple-touch-icon.png');

  await browser.close();
}

generateIcons().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const sourceImagePath = 'C:/Users/tirth/.gemini/antigravity/brain/f96c51f5-083a-43ab-b2cf-e51f633b1bac/.user_uploaded/media_1792908783120_0199a79d.jpg';

if (!fs.existsSync(sourceImagePath)) {
  console.error('Source image does not exist:', sourceImagePath);
  process.exit(1);
}

const sourceBuffer = fs.readFileSync(sourceImagePath);
const sourceDataUri = 'data:image/jpeg;base64,' + sourceBuffer.toString('base64');

async function run() {
  const browser = await puppeteer.launch({
    executablePath: edgePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  // Helper to render image to dataUrl at given size
  async function renderCanvas(size, options = {}) {
    return page.evaluate(async (uri, targetSize, opts) => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = targetSize;
          canvas.height = targetSize;
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';

          // Background
          if (opts.transparent) {
            ctx.clearRect(0, 0, targetSize, targetSize);
          } else {
            ctx.fillStyle = opts.bgColor || '#FFFFFF';
            ctx.fillRect(0, 0, targetSize, targetSize);
          }

          let padding = 0;
          if (opts.maskable) {
            padding = targetSize * 0.12; // 76% safe zone
          } else if (opts.paddingFactor !== undefined) {
            padding = targetSize * opts.paddingFactor;
          }

          const drawSize = targetSize - (padding * 2);
          ctx.drawImage(img, padding, padding, drawSize, drawSize);

          const mime = opts.format === 'jpeg' ? 'image/jpeg' : 'image/png';
          const quality = opts.quality || 0.95;
          resolve(canvas.toDataURL(mime, quality));
        };
        img.src = uri;
      });
    }, sourceDataUri, size, options);
  }

  console.log('1. Generating base image assets...');
  // Primary 480x480 logo.png and logo.jpg
  const logoPngUri = await renderCanvas(480, { format: 'png' });
  const logoJpgUri = await renderCanvas(480, { format: 'jpeg', quality: 0.96 });
  const logoPngBuffer = Buffer.from(logoPngUri.replace(/^data:image\/png;base64,/, ''), 'base64');
  const logoJpgBuffer = Buffer.from(logoJpgUri.replace(/^data:image\/jpeg;base64,/, ''), 'base64');

  // Save primary assets in assets/images/
  fs.mkdirSync('assets/images', { recursive: true });
  fs.writeFileSync('assets/images/logo.png', logoPngBuffer);
  fs.writeFileSync('assets/images/logo.jpg', logoJpgBuffer);
  fs.writeFileSync('assets/images/logo-rounded.png', logoPngBuffer);
  console.log('Saved assets/images/logo.png, logo.jpg, logo-rounded.png');

  // Invoice builder logo copies
  const invoiceDirs = ['Invoice Builder', 'Invoice Builder/public', 'apps/Invoice Builder', 'apps/Invoice Builder/public'];
  for (const d of invoiceDirs) {
    if (fs.existsSync(d)) {
      fs.writeFileSync(path.join(d, 'logo.jpg'), logoJpgBuffer);
      if (d.includes('public')) {
        fs.writeFileSync(path.join(d, 'logo-full.jpg'), logoJpgBuffer);
      }
      console.log(`Saved logo in ${d}`);
    }
  }

  // 2. Icon targets
  const iconTargets = [
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
    { name: 'apple-touch-icon.png', size: 180, maskable: false, paddingFactor: 0.08 },
    { name: 'apple-touch-icon-180x180.png', size: 180, maskable: false, paddingFactor: 0.08 },
    { name: 'apple-touch-icon-152x152.png', size: 152, maskable: false, paddingFactor: 0.08 },
    { name: 'favicon-16x16.png', size: 16, maskable: false, paddingFactor: 0.04 },
    { name: 'favicon-32x32.png', size: 32, maskable: false, paddingFactor: 0.04 },
    { name: 'favicon-48x48.png', size: 48, maskable: false, paddingFactor: 0.04 }
  ];

  const iconsDir = path.resolve('assets/icons');
  const publicIconsDir = path.resolve('public/assets/icons');
  fs.mkdirSync(iconsDir, { recursive: true });
  fs.mkdirSync(publicIconsDir, { recursive: true });

  for (const target of iconTargets) {
    const dataUri = await renderCanvas(target.size, {
      maskable: target.maskable,
      paddingFactor: target.paddingFactor
    });
    const buf = Buffer.from(dataUri.replace(/^data:image\/png;base64,/, ''), 'base64');
    fs.writeFileSync(path.join(iconsDir, target.name), buf);
    fs.writeFileSync(path.join(publicIconsDir, target.name), buf);
    console.log(`Generated: ${target.name} (${target.size}x${target.size})`);
  }

  // Favicon 32x32 buffer for root favicons
  const fav32Buf = fs.readFileSync(path.join(iconsDir, 'favicon-32x32.png'));
  const appleTouchBuf = fs.readFileSync(path.join(iconsDir, 'apple-touch-icon.png'));
  const icon192Buf = fs.readFileSync(path.join(iconsDir, 'icon-192x192.png'));
  const icon512Buf = fs.readFileSync(path.join(iconsDir, 'icon-512x512.png'));

  // Root favicons
  fs.writeFileSync('favicon.ico', fav32Buf);
  fs.writeFileSync('favicon.png', fav32Buf);
  fs.writeFileSync('apple-touch-icon.png', appleTouchBuf);
  console.log('Saved root favicon.ico, favicon.png, apple-touch-icon.png');

  // Public root favicons
  fs.mkdirSync('public', { recursive: true });
  fs.writeFileSync('public/favicon.ico', fav32Buf);
  fs.writeFileSync('public/favicon.png', fav32Buf);
  fs.writeFileSync('public/apple-touch-icon.png', appleTouchBuf);
  console.log('Saved public/ favicon.ico, favicon.png, apple-touch-icon.png');

  // Invoice builder public icons
  const invPubDirs = ['Invoice Builder/public', 'apps/Invoice Builder/public'];
  for (const ipd of invPubDirs) {
    if (fs.existsSync(ipd)) {
      fs.writeFileSync(path.join(ipd, 'favicon.ico'), fav32Buf);
      fs.writeFileSync(path.join(ipd, 'favicon-16x16.png'), fs.readFileSync(path.join(iconsDir, 'favicon-16x16.png')));
      fs.writeFileSync(path.join(ipd, 'favicon-32x32.png'), fav32Buf);
      fs.writeFileSync(path.join(ipd, 'apple-touch-icon.png'), appleTouchBuf);
      fs.writeFileSync(path.join(ipd, 'icon-192.png'), icon192Buf);
      fs.writeFileSync(path.join(ipd, 'icon-512.png'), icon512Buf);
      console.log(`Saved public icons to ${ipd}`);
    }
  }

  await browser.close();
  console.log('All branding assets generated successfully!');
}

run().catch(err => {
  console.error('Error generating assets:', err);
  process.exit(1);
});

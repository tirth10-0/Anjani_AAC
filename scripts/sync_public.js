const fs = require('fs');
const path = require('path');

const publicDir = path.resolve('public');
const publicIconsDir = path.join(publicDir, 'assets/icons');

fs.mkdirSync(publicIconsDir, { recursive: true });

// Copy root static PWA assets
['manifest.json', 'sw.js', 'favicon.ico', 'favicon.png', 'apple-touch-icon.png'].forEach(file => {
  if (fs.existsSync(file)) {
    fs.copyFileSync(file, path.join(publicDir, file));
    console.log(`Copied ${file} to public/`);
  }
});

// Copy icons
fs.readdirSync('assets/icons').forEach(file => {
  fs.copyFileSync(path.join('assets/icons', file), path.join(publicIconsDir, file));
  console.log(`Copied assets/icons/${file} to public/assets/icons/`);
});

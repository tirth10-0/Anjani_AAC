const fs = require('fs');
const path = require('path');

function walk(dir) {
  let files = [];
  try {
    for (const item of fs.readdirSync(dir)) {
      if (item === 'node_modules' || item === '.git' || item === 'dist' || item === '.gemini') continue;
      const full = path.join(dir, item);
      if (fs.statSync(full).isDirectory()) files = files.concat(walk(full));
      else if (full.endsWith('.html') || full.endsWith('.js')) files.push(full);
    }
  } catch (e) {}
  return files;
}

const files = walk('.');
console.log('=== CHECKING ALL IMAGE SOURCES IN HTML & JS ===');
for (const f of files) {
  const c = fs.readFileSync(f, 'utf8');
  const dir = path.dirname(f);
  
  // Search for img src
  const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
  let match;
  while ((match = imgRegex.exec(c)) !== null) {
    const src = match[1];
    if (src.startsWith('data:') || src.startsWith('http://') || src.startsWith('https://') || src.includes('${')) continue;
    const cleanSrc = src.split('?')[0];
    const resolved = path.resolve(dir, cleanSrc);
    const exists = fs.existsSync(resolved);
    if (!exists) {
      console.log(`[MISSING!] ${f} -> src="${src}" (resolved: ${resolved})`);
    } else {
      console.log(`[OK] ${f} -> src="${src}"`);
    }
  }

  // Also check favicon links
  const iconRegex = /<link[^>]+href=["']([^"']+\.(?:png|jpg|jpeg|svg|ico)(?:\?[^"']*)?)["']/gi;
  while ((match = iconRegex.exec(c)) !== null) {
    const href = match[1];
    if (href.startsWith('data:') || href.startsWith('http://') || href.startsWith('https://') || href.includes('${')) continue;
    const cleanHref = href.split('?')[0];
    const resolved = path.resolve(dir, cleanHref);
    const exists = fs.existsSync(resolved);
    if (!exists) {
      console.log(`[MISSING ICON!] ${f} -> href="${href}" (resolved: ${resolved})`);
    }
  }
}

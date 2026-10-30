const fs = require('fs');
const path = require('path');

function createIcoFromPngs(pngPaths, outPath) {
  const images = pngPaths.map(p => {
    const buf = fs.readFileSync(p);
    // Find width and height from PNG IHDR chunk (offset 16: width 4 bytes, height 4 bytes BE)
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    return { buf, w, h };
  });

  const count = images.length;
  const headerSize = 6 + (16 * count);
  let currentOffset = headerSize;

  const headerBuf = Buffer.alloc(headerSize);
  headerBuf.writeUInt16LE(0, 0); // reserved
  headerBuf.writeUInt16LE(1, 2); // icon type
  headerBuf.writeUInt16LE(count, 4); // number of images

  const imgBuffers = [];

  images.forEach((img, idx) => {
    const entryOffset = 6 + (16 * idx);
    headerBuf.writeUInt8(img.w >= 256 ? 0 : img.w, entryOffset);
    headerBuf.writeUInt8(img.h >= 256 ? 0 : img.h, entryOffset + 1);
    headerBuf.writeUInt8(0, entryOffset + 2); // colors
    headerBuf.writeUInt8(0, entryOffset + 3); // reserved
    headerBuf.writeUInt16LE(1, entryOffset + 4); // color planes
    headerBuf.writeUInt16LE(32, entryOffset + 6); // bpp
    headerBuf.writeUInt32LE(img.buf.length, entryOffset + 8); // size
    headerBuf.writeUInt32LE(currentOffset, entryOffset + 12); // offset

    imgBuffers.push(img.buf);
    currentOffset += img.buf.length;
  });

  const finalBuf = Buffer.concat([headerBuf, ...imgBuffers]);
  fs.writeFileSync(outPath, finalBuf);
  console.log(`Generated ${outPath} (${finalBuf.length} bytes, ${count} images: ${images.map(i => `${i.w}x${i.h}`).join(', ')})`);
}

const pngs = [
  'assets/icons/favicon-16x16.png',
  'assets/icons/favicon-32x32.png',
  'assets/icons/favicon-48x48.png'
];

const dests = [
  'favicon.ico',
  'public/favicon.ico',
  'dist/favicon.ico',
  'Invoice Builder/public/favicon.ico',
  'apps/Invoice Builder/public/favicon.ico'
];

dests.forEach(d => {
  const dir = path.dirname(d);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  createIcoFromPngs(pngs, d);
});

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const SOURCE = 'c:/Users/user/Downloads/SYSTEM/App icon.png';
const OUT = 'c:/Users/user/Downloads/SYSTEM/new-project/apps/web/public';

const square = [48, 72, 96, 120, 144, 152, 167, 180, 192, 512];
const MASKABLE = { 192: 152, 512: 400 }; // maskable canvas -> content size (safe zone)

function pngBlob(data) {
  return Buffer.from(new Uint8Array(data));
}

async function main() {
  fs.mkdirSync(path.join(OUT, 'icons'), { recursive: true });
  const src = sharp(SOURCE).resize(512, 512, { fit: 'cover' });

  // Standard icons + apple touch
  for (const size of square) {
    const buf = await sharp(SOURCE).resize(size, size, { fit: 'cover' }).png().toBuffer();
    fs.writeFileSync(path.join(OUT, 'icons', `icon-${size}.png`), buf);
    console.log('icon-', size);
  }

  // favicon.png (32)
  fs.writeFileSync(path.join(OUT, 'favicon.png'), await sharp(SOURCE).resize(32, 32, { fit: 'cover' }).png().toBuffer());
  // apple-touch-icon.png (180)
  fs.writeFileSync(path.join(OUT, 'apple-touch-icon.png'), await sharp(SOURCE).resize(180, 180, { fit: 'cover' }).png().toBuffer());

  // Maskable icons with safe zone
  for (const [canvas, content] of Object.entries(MASKABLE)) {
    const c = Number(canvas);
    const contentSize = Number(content);
    const offset = Math.round((c - contentSize) / 2);
    const icon = await sharp(SOURCE).resize(contentSize, contentSize, { fit: 'cover' }).toBuffer();
    const mask = await sharp({
      create: { width: c, height: c, channels: 4, background: { r: 255, g: 247, b: 244, alpha: 255 } },
    }).composite([{ input: icon, left: offset, top: offset }]).png().toBuffer();
    fs.writeFileSync(path.join(OUT, 'icons', `maskable-${c}.png`), mask);
    console.log('maskable-', c);
  }

  // favicon.ico with PNG entries (16/32/48/256)
  const entries = [16, 32, 48, 256];
  const blobs = {};
  for (const size of entries) {
    blobs[size] = Buffer.from(await sharp(SOURCE).resize(size, size, { fit: 'cover' }).png().toBuffer());
  }
  const dir = Buffer.alloc(6 + 16 * entries.length);
  dir.writeUInt16LE(0, 0);       // reserved
  dir.writeUInt16LE(1, 2);       // type: icon
  dir.writeUInt16LE(entries.length, 4);
  let offset = 6 + 16 * entries.length;
  let idx = 6;
  for (const size of entries) {
    const b = blobs[size];
    const dim = size >= 256 ? 0 : size;
    dir.writeUInt8(dim, idx);     // width
    dir.writeUInt8(dim, idx + 1); // height
    dir.writeUInt8(0, idx + 2);   // colors
    dir.writeUInt8(0, idx + 3);   // reserved
    dir.writeUInt16LE(1, idx + 4); // planes
    dir.writeUInt16LE(32, idx + 6); // bpp
    dir.writeUInt32LE(b.length, idx + 8); // size
    dir.writeUInt32LE(offset, idx + 12);  // offset
    offset += b.length;
    idx += 16;
  }
  fs.writeFileSync(path.join(OUT, 'favicon.ico'), Buffer.concat([dir, ...entries.map((s) => blobs[s])]));
  console.log('favicon.ico done');

  // touch icons for android (android-icon)
  for (const size of [96, 192]) {
    fs.writeFileSync(path.join(OUT, 'icons', `android-icon-${size}.png`), await sharp(SOURCE).resize(size, size, { fit: 'cover' }).png().toBuffer());
  }
  console.log('ALL ICONS GENERATED');
}

main().catch((e) => { console.error(e); process.exit(1); });
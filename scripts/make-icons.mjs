// Renders the app icon (the same design as packages/ui/public/icon.svg) to PNG files
// without any image library: polygon/circle coverage with 4x4 supersampling + zlib.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'apps', 'windows', 'assets');
mkdirSync(out, { recursive: true });

const BOLT = [[36, 10], [18, 36], [30, 36], [26, 54], [46, 26], [34, 26]];

function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inRoundRect(x, y, s, r) {
  const cx = Math.min(Math.max(x, r), s - r);
  const cy = Math.min(Math.max(y, r), s - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

// Returns RGBA for a point in 64x64 design space.
function shade(x, y, { dot, gray }) {
  if (dot) {
    const d = Math.hypot(x - 50, y - 50);
    if (d <= 9) return gray ? [128, 132, 142, 255] : [35, 165, 90, 255];
    if (d <= 12) return [255, 255, 255, 255];
  }
  if (!inRoundRect(x, y, 64, 16)) return [0, 0, 0, 0];
  if (inPoly(x, y, BOLT)) return [255, 255, 255, 255];
  const t = (x + y) / 128;
  if (gray) return [Math.round(110 - 20 * t), Math.round(114 - 20 * t), Math.round(124 - 20 * t), 255];
  return [Math.round(114 - 26 * t), Math.round(137 - 36 * t), 255 - Math.round(13 * t), 255];
}

function render(size, opts) {
  const px = Buffer.alloc(size * size * 4);
  const ss = 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0, 0];
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const c = shade(((x + (sx + 0.5) / ss) / size) * 64, ((y + (sy + 0.5) / ss) / size) * 64, opts);
          acc[0] += c[0] * c[3];
          acc[1] += c[1] * c[3];
          acc[2] += c[2] * c[3];
          acc[3] += c[3];
        }
      }
      const i = (y * size + x) * 4;
      const a = acc[3] / (ss * ss);
      px[i] = acc[3] ? Math.round(acc[0] / acc[3]) : 0;
      px[i + 1] = acc[3] ? Math.round(acc[1] / acc[3]) : 0;
      px[i + 2] = acc[3] ? Math.round(acc[2] / acc[3]) : 0;
      px[i + 3] = Math.round(a);
    }
  }
  return png(size, size, px);
}

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

writeFileSync(join(out, 'icon.png'), render(256, { dot: true }));
writeFileSync(join(out, 'tray.png'), render(32, { dot: true }));
writeFileSync(join(out, 'tray-paused.png'), render(32, { dot: true, gray: true }));
console.log('icons written to apps/windows/assets');

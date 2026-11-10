// Generates the app icons (PNG set + Windows ICO) without any dependencies.
// Icons are build artifacts: they are git-ignored and regenerated before
// every build (locally via `npm run icons`, in CI by the workflow).
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src-tauri", "icons");
mkdirSync(outDir, { recursive: true });

// --- CRC32 (PNG chunks) ---
const crcTable = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// --- Draw a dark square with a green "pulse" polyline, encode as PNG ---
function renderPng(size) {
  const px = new Uint8Array(size * size * 4);
  const BG = [13, 21, 34];
  const GRID = [26, 40, 61];
  const ACCENT = [74, 222, 128];
  const set = (x, y, rgb) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    px[i] = rgb[0];
    px[i + 1] = rgb[1];
    px[i + 2] = rgb[2];
    px[i + 3] = 255;
  };

  const cell = Math.max(4, Math.floor(size / 4));
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) set(x, y, x % cell === 0 || y % cell === 0 ? GRID : BG);

  const pts = [
    [0.04, 0.56], [0.3, 0.56], [0.4, 0.56], [0.48, 0.24],
    [0.57, 0.78], [0.65, 0.56], [0.96, 0.56],
  ];
  const r = Math.max(1, Math.round(size / 30));
  for (let s = 0; s < pts.length - 1; s++) {
    const [x1, y1] = pts[s];
    const [x2, y2] = pts[s + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot((x2 - x1) * size, (y2 - y1) * size)));
    for (let t = 0; t <= steps; t++) {
      const cx = Math.round((x1 + ((x2 - x1) * t) / steps) * (size - 1));
      const cy = Math.round((y1 + ((y2 - y1) * t) / steps) * (size - 1));
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++)
          if (dx * dx + dy * dy <= r * r) set(cx + dx, cy + dy, ACCENT);
    }
  }

  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    Buffer.from(px.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const png256 = renderPng(256);
writeFileSync(join(outDir, "32x32.png"), renderPng(32));
writeFileSync(join(outDir, "128x128.png"), renderPng(128));
writeFileSync(join(outDir, "128x128@2x.png"), png256);
writeFileSync(join(outDir, "icon.png"), renderPng(512));

// ICO container wrapping the 256px PNG (256 is stored as 0 in ICO headers)
const ico = Buffer.alloc(6 + 16);
ico.writeUInt16LE(0, 0); // reserved
ico.writeUInt16LE(1, 2); // type: icon
ico.writeUInt16LE(1, 4); // image count
ico[6] = 0; // width 256
ico[7] = 0; // height 256
ico[8] = 0; // palette colors
ico[9] = 0; // reserved
ico.writeUInt16LE(1, 10); // planes
ico.writeUInt16LE(32, 12); // bits per pixel
ico.writeUInt32LE(png256.length, 14);
ico.writeUInt32LE(6 + 16, 18);
writeFileSync(join(outDir, "icon.ico"), Buffer.concat([ico, png256]));

console.log("Icons written to", outDir);

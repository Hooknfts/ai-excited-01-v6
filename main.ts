// The Porcelain Kintsugi Snow Leopard — make.fun ai-excited-01 entry.
// Validates entry.png (a JPEG image) and copies it to the output directory.
//
// Usage: node main.ts
//   MAKEFUN_OUTPUT_DIR=./out node main.ts   (default: ./out)

import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_SIZE_BYTES = 1024 * 1024; // 1 MiB
const MAX_DIMENSION = 1024;

const here = new URL(".", import.meta.url);
const repoRoot = fileURLToPath(here);
const entryPath = resolve(repoRoot, "entry.png");
const outputDir = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? "./out");

function fail(message) {
  throw new Error(`entry validation failed: ${message}`);
}

// Parse the SOF segment of a JPEG and return its width/height.
// Walks markers until a Start-Of-Frame marker (0xC0-0xCF except 0xC4, 0xC8, 0xCC)
// is found; returns null if none is found before SOS/EOI.
function readJpegDimensions(buf) {
  let offset = 2; // skip SOI (0xFFD8)
  while (offset + 1 < buf.length) {
    if (buf[offset] !== 0xff) fail(`bad marker prefix 0x${buf[offset].toString(16)} at offset ${offset}`);
    // Skip 0xFF fill bytes that may precede a marker.
    while (offset + 1 < buf.length && buf[offset + 1] === 0xff) offset += 1;
    if (offset + 3 >= buf.length) fail("truncated JPEG marker");
    const marker = buf[offset + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2; // standalone markers have no length field
      continue;
    }
    if (marker === 0xda || marker === 0xd9) return null; // SOS / EOI: no SOF seen
    const length = buf.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > buf.length) fail("truncated JPEG segment");
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      const height = buf.readUInt16BE(offset + 5);
      const width = buf.readUInt16BE(offset + 7);
      return { width, height };
    }
    offset += 2 + length;
  }
  return null;
}

const buf = await readFile(entryPath);
const info = await stat(entryPath);

if (info.size > MAX_SIZE_BYTES) {
  fail(`entry.png is ${info.size} bytes, over the 1 MiB limit`);
}
if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) {
  fail("missing JPEG SOI marker (0xFFD8)");
}
if (buf[buf.length - 2] !== 0xff || buf[buf.length - 1] !== 0xd9) {
  fail("missing JPEG EOI marker (0xFFD9)");
}
const dims = readJpegDimensions(buf);
if (!dims) fail("no JPEG SOF segment found");
if (dims.width > MAX_DIMENSION || dims.height > MAX_DIMENSION) {
  fail(`dimensions ${dims.width}x${dims.height} exceed ${MAX_DIMENSION}x${MAX_DIMENSION}`);
}

await mkdir(outputDir, { recursive: true });
const outPath = join(outputDir, "entry.png");
await copyFile(entryPath, outPath);

console.log(`OK: entry.png ${dims.width}x${dims.height}, ${info.size} bytes -> ${outPath}`);

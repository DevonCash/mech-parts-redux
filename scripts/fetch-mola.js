#!/usr/bin/env node
/**
 * Downloads MOLA MEGDR topography data and converts it to a compact format.
 *
 * Source: NASA PDS Geosciences Node (public domain)
 * Default: 16 pixels/degree (~115m/pixel), 5760x2880 grid
 *
 * Run: node scripts/fetch-mola.js
 * Output: public/data/mola-topo.bin (Int16Array, system endian)
 *         public/data/mola-topo.json (metadata)
 */

import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const OUTPUT_DIR = join(PROJECT_ROOT, "public", "data");

// 16ppd MOLA MEGDR — four quadrant files that tile the full planet
// Each file covers 90° latitude × 180° longitude
const PPD = 16;
const TILE_WIDTH = 180 * PPD;   // 2880 pixels per quadrant
const TILE_HEIGHT = 90 * PPD;   // 1440 pixels per quadrant
const WIDTH = 360 * PPD;        // 5760 total
const HEIGHT = 180 * PPD;       // 2880 total
const EXPECTED_TILE_BYTES = TILE_WIDTH * TILE_HEIGHT * 2;

const BASE_URL = "https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg016";

// Quadrants: [filename, row offset, col offset]
// MOLA files: megt{lat}{lon}{ppd}.img
//   lat: 90n, 00n (north half, south half)
//   lon: 000 = 0°E, 180 = 180°E
const QUADRANTS = [
  { file: "megt90n000hb.img", rowOff: 0,           colOff: 0 },
  { file: "megt90n180hb.img", rowOff: 0,           colOff: TILE_WIDTH },
  { file: "megt00n000hb.img", rowOff: TILE_HEIGHT, colOff: 0 },
  { file: "megt00n180hb.img", rowOff: TILE_HEIGHT, colOff: TILE_WIDTH },
];

async function fetchQuadrant(filename) {
  const url = `${BASE_URL}/${filename}`;
  console.log(`  Fetching ${filename}...`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${filename}: ${response.statusText}`);
  }
  const buf = await response.arrayBuffer();
  if (buf.byteLength !== EXPECTED_TILE_BYTES) {
    throw new Error(`${filename}: expected ${EXPECTED_TILE_BYTES} bytes, got ${buf.byteLength}`);
  }
  return buf;
}

async function main() {
  console.log(`Fetching MOLA ${PPD}ppd topography data...`);
  console.log(`  Resolution: ${WIDTH}x${HEIGHT} (~${Math.round(360 * 111 / WIDTH * 0.532)}m/pixel on Mars)`);
  console.log(`  4 quadrant files, ${(EXPECTED_TILE_BYTES / 1e6).toFixed(1)} MB each\n`);

  const elevation = new Int16Array(WIDTH * HEIGHT);

  for (const quad of QUADRANTS) {
    const buf = await fetchQuadrant(quad.file);
    const raw = new DataView(buf);

    for (let row = 0; row < TILE_HEIGHT; row++) {
      for (let col = 0; col < TILE_WIDTH; col++) {
        const srcIdx = row * TILE_WIDTH + col;
        const dstRow = quad.rowOff + row;
        const dstCol = quad.colOff + col;
        const dstIdx = dstRow * WIDTH + dstCol;
        elevation[dstIdx] = raw.getInt16(srcIdx * 2, false); // big-endian
      }
    }
    console.log(`  ✓ ${quad.file} placed at row=${quad.rowOff} col=${quad.colOff}`);
  }

  // Find elevation range
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < elevation.length; i++) {
    if (elevation[i] < min) min = elevation[i];
    if (elevation[i] > max) max = elevation[i];
  }
  console.log(`\n  Elevation range: ${min}m to ${max}m`);

  // Write output
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const binPath = join(OUTPUT_DIR, "mola-topo.bin");
  writeFileSync(binPath, Buffer.from(elevation.buffer));
  console.log(`  Written: ${binPath} (${(elevation.buffer.byteLength / 1e6).toFixed(1)} MB)`);

  const metaPath = join(OUTPUT_DIR, "mola-topo.json");
  const meta = {
    source: "NASA PDS MOLA MEGDR v2.0",
    license: "Public Domain",
    width: WIDTH,
    height: HEIGHT,
    pixelsPerDegree: PPD,
    format: "Int16Array (system endian)",
    elevationMin: min,
    elevationMax: max,
    units: "meters relative to Mars areoid",
    projection: "Simple Cylindrical",
    latRange: [90, -90],
    lonRange: [0, 360],
  };
  writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  console.log(`  Written: ${metaPath}`);

  console.log("\nDone. MOLA data ready. Next: npm run build:contours");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});

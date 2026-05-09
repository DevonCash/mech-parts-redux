#!/usr/bin/env node
/**
 * Downloads MOLA MEGDR 128ppd topography data and converts it to a compact format.
 *
 * The 128ppd data is tiled into 16 files (4 lat bands × 4 lon bands),
 * covering 88°N to 88°S. This script downloads all tiles and stitches
 * them into a single grid.
 *
 * Source: NASA PDS Geosciences Node (public domain)
 * Resolution: 128 pixels/degree, 46080×22528 grid, ~2.08 GB total download
 * Requires ~6 GB of RAM. Run with: node --max-old-space-size=8192 scripts/fetch-mola.js
 *
 * Output: public/data/mola-topo.bin (Int16Array, system endian)
 *         public/data/mola-topo.json (metadata)
 */

import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const OUTPUT_DIR = join(PROJECT_ROOT, "public", "data");

const PPD = 128;

// 128ppd tiles cover 88°N to 88°S (poles are in separate polar files)
const LAT_TOP = 88;
const LAT_BOTTOM = -88;
const LAT_RANGE_DEG = LAT_TOP - LAT_BOTTOM; // 176°

const WIDTH = 360 * PPD;          // 46080
const HEIGHT = LAT_RANGE_DEG * PPD; // 22528

// Tile layout: 4 lat bands × 4 lon bands
// Each tile: 44° lat × 90° lon = 5632 × 11520 pixels
const TILE_LAT_DEG = 44;
const TILE_LON_DEG = 90;
const TILE_W = TILE_LON_DEG * PPD; // 11520
const TILE_H = TILE_LAT_DEG * PPD; // 5632
const TILE_BYTES = TILE_W * TILE_H * 2;

const BASE_URL =
  "https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg128";

// Topography tiles in row-major order (top to bottom, left to right)
// Filename format: megt{lat}{n|s}{lon}hb.img
const TILES = [
  // 88°N → 44°N
  { file: "megt88n000hb.img", latTop: 88, lonLeft: 0 },
  { file: "megt88n090hb.img", latTop: 88, lonLeft: 90 },
  { file: "megt88n180hb.img", latTop: 88, lonLeft: 180 },
  { file: "megt88n270hb.img", latTop: 88, lonLeft: 270 },
  // 44°N → 0°
  { file: "megt44n000hb.img", latTop: 44, lonLeft: 0 },
  { file: "megt44n090hb.img", latTop: 44, lonLeft: 90 },
  { file: "megt44n180hb.img", latTop: 44, lonLeft: 180 },
  { file: "megt44n270hb.img", latTop: 44, lonLeft: 270 },
  // 0° → 44°S
  { file: "megt00n000hb.img", latTop: 0, lonLeft: 0 },
  { file: "megt00n090hb.img", latTop: 0, lonLeft: 90 },
  { file: "megt00n180hb.img", latTop: 0, lonLeft: 180 },
  { file: "megt00n270hb.img", latTop: 0, lonLeft: 270 },
  // 44°S → 88°S
  { file: "megt44s000hb.img", latTop: -44, lonLeft: 0 },
  { file: "megt44s090hb.img", latTop: -44, lonLeft: 90 },
  { file: "megt44s180hb.img", latTop: -44, lonLeft: 180 },
  { file: "megt44s270hb.img", latTop: -44, lonLeft: 270 },
];


/**
 * Download a single tile.
 * Returns a Uint8Array of the raw bytes.
 */
async function downloadTile(url, expectedBytes) {
  const filename = url.split("/").pop();
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${filename}: ${response.statusText}`);
  }

  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
  }

  const combined = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  if (received !== expectedBytes) {
    throw new Error(
      `Size mismatch for ${url.split("/").pop()}: expected ${expectedBytes}, got ${received}`
    );
  }

  return combined;
}

const CONCURRENCY = 16;

/**
 * Stitch a downloaded tile into the full elevation grid.
 */
function stitchTile(raw, tile, elevation) {
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const gridX = (tile.lonLeft / TILE_LON_DEG) * TILE_W;
  const gridY = ((LAT_TOP - tile.latTop) / TILE_LAT_DEG) * TILE_H;

  let min = Infinity;
  let max = -Infinity;

  for (let ty = 0; ty < TILE_H; ty++) {
    const outRowStart = (gridY + ty) * WIDTH + gridX;
    const inRowStart = ty * TILE_W;

    for (let tx = 0; tx < TILE_W; tx++) {
      const val = view.getInt16((inRowStart + tx) * 2, false); // big-endian
      elevation[outRowStart + tx] = val;
      if (val < min) min = val;
      if (val > max) max = val;
    }
  }

  return { min, max };
}

async function main() {
  console.log(`Fetching MOLA ${PPD}ppd topography data (16 tiles, ${CONCURRENCY} parallel)...`);
  console.log(`  Output grid: ${WIDTH}×${HEIGHT} (${LAT_TOP}°N to ${-LAT_BOTTOM}°S)`);
  console.log(`  Each tile: ${TILE_W}×${TILE_H} (~${(TILE_BYTES / 1e6).toFixed(0)} MB)\n`);

  // Allocate full grid
  const elevation = new Int16Array(WIDTH * HEIGHT);

  let min = Infinity;
  let max = -Infinity;
  let completed = 0;

  // Download tiles in parallel batches
  async function processTile(tile) {
    const url = `${BASE_URL}/${tile.file}`;
    const raw = await downloadTile(url, TILE_BYTES);
    const stats = stitchTile(raw, tile, elevation);
    completed++;
    console.log(`  [${completed}/${TILES.length}] ${tile.file} done`);
    return stats;
  }

  // Run with bounded concurrency
  const pending = new Set();
  const results = [];

  for (const tile of TILES) {
    const p = processTile(tile).then((stats) => {
      pending.delete(p);
      results.push(stats);
    });
    pending.add(p);

    if (pending.size >= CONCURRENCY) {
      await Promise.race(pending);
    }
  }
  await Promise.all(pending);

  for (const { min: lo, max: hi } of results) {
    if (lo < min) min = lo;
    if (hi > max) max = hi;
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
    sourceUrl: `${BASE_URL}/`,
    license: "Public Domain",
    width: WIDTH,
    height: HEIGHT,
    pixelsPerDegree: PPD,
    format: "Int16Array (system endian)",
    elevationMin: min,
    elevationMax: max,
    units: "meters relative to Mars areoid",
    projection: "Simple Cylindrical",
    latRange: [LAT_TOP, LAT_BOTTOM],
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

#!/usr/bin/env node
/**
 * Downloads the MOLA MEGDR 4 pixels/degree topography data
 * and converts it to a compact format for the game.
 *
 * Source: NASA PDS Geosciences Node (public domain)
 * Format: 1440x720 grid of INT16 big-endian elevation values (meters)
 *
 * Run: node scripts/fetch-mola.js
 * Output: public/data/mola-topo-4ppd.bin (compressed binary)
 *         public/data/mola-topo-4ppd.json (metadata)
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const OUTPUT_DIR = join(PROJECT_ROOT, "public", "data");

const MOLA_URL =
  "https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg004/megt90n000cb.img";

const WIDTH = 1440; // 360° * 4 pixels/degree
const HEIGHT = 720; // 180° * 4 pixels/degree
const EXPECTED_BYTES = WIDTH * HEIGHT * 2; // INT16 = 2 bytes per pixel

async function main() {
  console.log("Fetching MOLA topography data...");
  console.log(`  Source: ${MOLA_URL}`);
  console.log(`  Expected: ${WIDTH}x${HEIGHT} INT16 BE (${EXPECTED_BYTES} bytes)`);

  const response = await fetch(MOLA_URL);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  console.log(`  Received: ${arrayBuffer.byteLength} bytes`);

  if (arrayBuffer.byteLength !== EXPECTED_BYTES) {
    throw new Error(
      `Size mismatch: expected ${EXPECTED_BYTES}, got ${arrayBuffer.byteLength}`
    );
  }

  // Parse INT16 big-endian into a regular Int16Array
  const raw = new DataView(arrayBuffer);
  const elevation = new Int16Array(WIDTH * HEIGHT);
  let min = Infinity;
  let max = -Infinity;

  for (let i = 0; i < WIDTH * HEIGHT; i++) {
    const val = raw.getInt16(i * 2, false); // false = big-endian
    elevation[i] = val;
    if (val < min) min = val;
    if (val > max) max = val;
  }

  console.log(`  Elevation range: ${min}m to ${max}m`);

  // Write output
  mkdirSync(OUTPUT_DIR, { recursive: true });

  // Binary: raw Int16Array in system endianness (little-endian on most platforms)
  // The game will read this as Int16Array directly via fetch + ArrayBuffer
  const binPath = join(OUTPUT_DIR, "mola-topo-4ppd.bin");
  writeFileSync(binPath, Buffer.from(elevation.buffer));
  console.log(`  Written: ${binPath} (${elevation.buffer.byteLength} bytes)`);

  // Metadata
  const metaPath = join(OUTPUT_DIR, "mola-topo-4ppd.json");
  const meta = {
    source: "NASA PDS MOLA MEGDR v2.0",
    sourceUrl: MOLA_URL,
    license: "Public Domain",
    width: WIDTH,
    height: HEIGHT,
    pixelsPerDegree: 4,
    format: "Int16Array (system endian)",
    elevationMin: min,
    elevationMax: max,
    units: "meters relative to Mars areoid",
    projection: "Simple Cylindrical",
    latRange: [90, -90], // top row = 90°N, bottom row = 90°S
    lonRange: [0, 360], // left col = 0°E, right col = 360°E
  };
  writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  console.log(`  Written: ${metaPath}`);

  console.log("\nDone. MOLA data ready for the game.");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});

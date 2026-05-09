#!/usr/bin/env node
/**
 * Downloads MOLA MEGDR topography data and converts it to a compact format.
 *
 * Source: NASA PDS Geosciences Node (public domain)
 * Resolution: 128 pixels/degree (~14m/pixel), 46080x23040 grid, ~2.1 GB
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
const WIDTH = 360 * PPD;   // 46080
const HEIGHT = 180 * PPD;  // 23040
const EXPECTED_BYTES = WIDTH * HEIGHT * 2; // INT16 = 2 bytes per pixel

const MOLA_URL =
  "https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg128/megt90n000hb.img";

function progressBar(current, total, width = 40) {
  const pct = Math.min(current / total, 1);
  const filled = Math.round(pct * width);
  const bar = "█".repeat(filled) + "░".repeat(width - filled);
  const mb = (current / 1e6).toFixed(1);
  const totalMb = (total / 1e6).toFixed(1);
  process.stdout.write(`\r  [${bar}] ${mb} / ${totalMb} MB (${(pct * 100).toFixed(0)}%)`);
}

async function main() {
  console.log(`Fetching MOLA ${PPD}ppd topography data...`);
  console.log(`  Source: ${MOLA_URL}`);

  const response = await fetch(MOLA_URL);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const contentLength = Number(response.headers.get("content-length")) || EXPECTED_BYTES;

  // Stream the response to track progress
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    progressBar(received, contentLength);
  }
  process.stdout.write("\n");

  // Combine chunks into a single ArrayBuffer
  const combined = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  const arrayBuffer = combined.buffer;

  console.log(`  Received: ${(received / 1e6).toFixed(1)} MB`);

  if (received !== EXPECTED_BYTES) {
    throw new Error(
      `Size mismatch: expected ${EXPECTED_BYTES}, got ${received}`
    );
  }

  // Parse INT16 big-endian into a regular Int16Array
  console.log("  Parsing elevation data...");
  const raw = new DataView(arrayBuffer);
  const elevation = new Int16Array(WIDTH * HEIGHT);
  let min = Infinity;
  let max = -Infinity;

  const totalPixels = WIDTH * HEIGHT;
  for (let i = 0; i < totalPixels; i++) {
    const val = raw.getInt16(i * 2, false); // false = big-endian
    elevation[i] = val;
    if (val < min) min = val;
    if (val > max) max = val;
    if (i % 10_000_000 === 0) {
      progressBar(i, totalPixels);
    }
  }
  progressBar(totalPixels, totalPixels);
  process.stdout.write("\n");

  console.log(`  Elevation range: ${min}m to ${max}m`);

  // Write output
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const binPath = join(OUTPUT_DIR, "mola-topo.bin");
  writeFileSync(binPath, Buffer.from(elevation.buffer));
  console.log(`  Written: ${binPath} (${(elevation.buffer.byteLength / 1e6).toFixed(1)} MB)`);

  const metaPath = join(OUTPUT_DIR, "mola-topo.json");
  const meta = {
    source: "NASA PDS MOLA MEGDR v2.0",
    sourceUrl: MOLA_URL,
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

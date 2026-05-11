#!/usr/bin/env node
/**
 * Build all map data in the correct order.
 *
 * Runs each pipeline step sequentially. Each individual script
 * skips if its output already exists, so re-running is safe and
 * only rebuilds what's missing.
 *
 * Prerequisites: Node 20+, GDAL (ogr2ogr), tippecanoe
 *
 * Run: node --max-old-space-size=8192 scripts/build-data.js
 */

import { execSync } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const steps = [
  {
    name: "Fetch MOLA elevation data",
    cmd: "node --max-old-space-size=8192 scripts/fetch-mola.js",
  },
  {
    name: "Build terrain PMTiles",
    cmd: "node scripts/build-terrain.js",
  },
  {
    name: "Build contour lines",
    cmd: "node --max-old-space-size=8192 scripts/build-contours.js",
  },
  {
    name: "Build contour PMTiles",
    cmd: 'tippecanoe -P -o public/data/mars-contours.pmtiles --no-feature-limit --no-tile-size-limit --minimum-zoom=0 --maximum-zoom=10 -l contours --simplification=4 --force public/data/mars-contours.ndjson',
  },
  {
    name: "Fetch nomenclature",
    cmd: "node scripts/fetch-nomenclature.js",
  },
  {
    name: "Fetch geology",
    cmd: "node scripts/fetch-geology.js",
  },
  {
    name: "Build geology PMTiles",
    cmd: 'tippecanoe -o public/data/mars-geology.pmtiles --no-feature-limit --no-tile-size-limit --minimum-zoom=0 --maximum-zoom=8 -l geology --simplification=4 --detect-shared-borders --force public/data/mars-geology.json',
  },
];

console.log(`\n  Building all map data (${steps.length} steps)\n`);

for (let i = 0; i < steps.length; i++) {
  const step = steps[i];
  console.log(`\n[${ i + 1}/${steps.length}] ${step.name}`);
  console.log(`  $ ${step.cmd}\n`);
  try {
    execSync(step.cmd, { cwd: ROOT, stdio: "inherit" });
  } catch (err) {
    console.error(`\n  Step failed: ${step.name}`);
    process.exit(1);
  }
}

console.log("\n  All data built.\n");

#!/usr/bin/env node
/**
 * Build contour GeoJSON from MOLA elevation data.
 *
 * Pipeline: MOLA binary → marching squares → trace polylines → GeoJSON
 * Parallelized across CPU cores using worker_threads with SharedArrayBuffer.
 *
 * Prerequisites: run `node scripts/fetch-mola.js` first to download MOLA data.
 * Output: public/data/mars-contours.json
 *
 * Run: node --max-old-space-size=8192 scripts/build-contours.js
 */

import { readFileSync, writeFileSync, mkdirSync, createWriteStream, statSync, unlinkSync, renameSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Worker } from "worker_threads";
import os from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const DATA_DIR = join(PROJECT_ROOT, "public", "data");

// Contour intervals (meters)
const MINOR_INTERVAL = 100;
const MID_INTERVAL = 500;
const MAJOR_INTERVAL = 2000;

function contourClass(elevation) {
  if (elevation % MAJOR_INTERVAL === 0) return "major";
  if (elevation % MID_INTERVAL === 0) return "mid";
  return "minor";
}

function main() {
  const ndjsonPath = join(DATA_DIR, "mars-contours.ndjson");

  if (existsSync(ndjsonPath)) {
    const sizeMB = (statSync(ndjsonPath).size / 1e6).toFixed(1);
    console.log(`NDJSON already exists: ${ndjsonPath} (${sizeMB} MB)`);
    console.log("Skipping contour generation. Delete the file to regenerate.");
    return;
  }

  console.log("Loading MOLA data...");
  const metaPath = join(DATA_DIR, "mola-topo.json");
  const binPath = join(DATA_DIR, "mola-topo.bin");

  const meta = JSON.parse(readFileSync(metaPath, "utf-8"));
  const buf = readFileSync(binPath);

  console.log(`  Grid: ${meta.width}x${meta.height}`);
  console.log(`  Elevation: ${meta.elevationMin}m to ${meta.elevationMax}m`);

  // Copy elevation data into a SharedArrayBuffer so workers can read it
  // without each needing their own copy
  const sharedBuf = new SharedArrayBuffer(buf.byteLength);
  const sharedView = new Uint8Array(sharedBuf);
  sharedView.set(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));

  // Determine contour levels
  const levelMin = Math.ceil(meta.elevationMin / MINOR_INTERVAL) * MINOR_INTERVAL;
  const levelMax = Math.floor(meta.elevationMax / MINOR_INTERVAL) * MINOR_INTERVAL;
  const levels = [];
  for (let l = levelMin; l <= levelMax; l += MINOR_INTERVAL) levels.push(l);
  console.log(`  Contour levels: ${levels.length} (${levelMin}m to ${levelMax}m)`);

  // Split levels across workers
  const numWorkers = Math.min(os.cpus().length, levels.length);
  console.log(`  Workers: ${numWorkers}`);

  const chunks = Array.from({ length: numWorkers }, () => []);
  levels.forEach((level, i) => chunks[i % numWorkers].push(level));

  console.log("\nGenerating contours...");
  const startTime = Date.now();

  let completedLevels = 0;
  let totalFeatures = 0;

  // Stream features to a newline-delimited temp file to avoid holding
  // millions of features in memory (which blows the call stack on push/spread)
  mkdirSync(DATA_DIR, { recursive: true });
  const outPath = join(DATA_DIR, "mars-contours.json");
  const tmpPath = outPath + ".tmp.ndjson";
  const tmpStream = createWriteStream(tmpPath);

  const workerPath = join(__dirname, "build-contours-worker.js");

  // Have workers send features in small batches instead of one giant array
  const promises = chunks.map((chunk, workerIdx) => {
    return new Promise((resolve, reject) => {
      const worker = new Worker(workerPath, {
        workerData: {
          sharedBuf,
          meta,
          levels: chunk,
        },
      });

      worker.on("message", (msg) => {
        if (msg.type === "level-done") {
          completedLevels++;
          if (completedLevels % 10 === 0 || completedLevels === levels.length) {
            const pct = Math.round((completedLevels / levels.length) * 100);
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            process.stdout.write(`\r  ${completedLevels}/${levels.length} levels (${pct}%) — ${elapsed}s`);
          }
        } else if (msg.type === "features") {
          // Streamed batch of features from one level
          for (const f of msg.features) {
            tmpStream.write(JSON.stringify(f) + "\n");
            totalFeatures++;
          }
        } else if (msg.type === "done") {
          resolve();
        }
      });

      worker.on("error", reject);
      worker.on("exit", (code) => {
        if (code !== 0) reject(new Error(`Worker ${workerIdx} exited with code ${code}`));
      });
    });
  });

  Promise.all(promises).then(() => {
    tmpStream.end(() => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`\n\n  Total: ${totalFeatures.toLocaleString()} features in ${elapsed}s`);

      const ndjsonPath = join(DATA_DIR, "mars-contours.ndjson");

      // Rename tmp to final ndjson
      renameSync(tmpPath, ndjsonPath);

      const sizeMB = (statSync(ndjsonPath).size / 1e6).toFixed(1);
      console.log(`\nWritten: ${ndjsonPath} (${sizeMB} MB)`);
      console.log("Feed to tippecanoe with -P flag for newline-delimited GeoJSON input.");
      console.log("Done.");
    });
  });
}

main();

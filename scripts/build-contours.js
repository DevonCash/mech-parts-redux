#!/usr/bin/env node
/**
 * Build contour GeoJSON from MOLA elevation data.
 *
 * Pipeline: MOLA binary → marching squares → trace polylines → GeoJSON
 *
 * Prerequisites: run `node scripts/fetch-mola.js` first to download MOLA data.
 * Output: public/data/mars-contours.json
 *
 * Run: node scripts/build-contours.js
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const DATA_DIR = join(PROJECT_ROOT, "public", "data");

// Contour intervals (meters)
const MINOR_INTERVAL = 500;
const MID_INTERVAL = 1000;
const MAJOR_INTERVAL = 2000;

// MOLA grid dimensions — read from metadata at runtime
let WIDTH, HEIGHT, LAT_TOP, LAT_BOTTOM;

// ─── Load MOLA data ──────────────────────────────────────────────────────────

function loadMola() {
  const metaPath = join(DATA_DIR, "mola-topo.json");
  const binPath = join(DATA_DIR, "mola-topo.bin");

  const meta = JSON.parse(readFileSync(metaPath, "utf-8"));
  const buf = readFileSync(binPath);
  const elevation = new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);

  if (elevation.length !== meta.width * meta.height) {
    throw new Error(`MOLA data size mismatch`);
  }

  WIDTH = meta.width;
  HEIGHT = meta.height;
  LAT_TOP = meta.latRange[0];
  LAT_BOTTOM = meta.latRange[1];

  return { meta, elevation };
}

// ─── Marching squares ────────────────────────────────────────────────────────

/**
 * Run marching squares for a single contour level.
 * Returns an array of line segments in MOLA pixel coordinates:
 *   [[x1, y1, x2, y2], ...]
 */
function marchLevel(elevation, width, height, level) {
  const segments = [];

  for (let cy = 0; cy < height - 1; cy++) {
    const rowOff = cy * width;
    const nextRowOff = (cy + 1) * width;

    for (let cx = 0; cx < width - 1; cx++) {
      const tl = elevation[rowOff + cx];
      const tr = elevation[rowOff + cx + 1];
      const bl = elevation[nextRowOff + cx];
      const br = elevation[nextRowOff + cx + 1];

      const caseIndex =
        (tl >= level ? 8 : 0) |
        (tr >= level ? 4 : 0) |
        (br >= level ? 2 : 0) |
        (bl >= level ? 1 : 0);

      if (caseIndex === 0 || caseIndex === 15) continue;

      const lerp = (a, b) => (b === a ? 0.5 : (level - a) / (b - a));

      const top = lerp(tl, tr);
      const right = lerp(tr, br);
      const bottom = lerp(bl, br);
      const left = lerp(tl, bl);

      const t = [cx + top, cy];
      const r = [cx + 1, cy + right];
      const b = [cx + bottom, cy + 1];
      const l = [cx, cy + left];

      const add = (p1, p2) => segments.push([p1[0], p1[1], p2[0], p2[1]]);

      switch (caseIndex) {
        case 1: case 14: add(l, b); break;
        case 2: case 13: add(b, r); break;
        case 3: case 12: add(l, r); break;
        case 4: case 11: add(t, r); break;
        case 5: {
          const c = (tl + tr + bl + br) / 4;
          if (c >= level) { add(l, t); add(b, r); } else { add(l, b); add(t, r); }
          break;
        }
        case 6: case 9: add(t, b); break;
        case 7: case 8: add(l, t); break;
        case 10: {
          const c = (tl + tr + bl + br) / 4;
          if (c >= level) { add(t, r); add(l, b); } else { add(l, t); add(b, r); }
          break;
        }
      }
    }
  }

  return segments;
}

// ─── Trace segments into polylines ───────────────────────────────────────────

/**
 * Join head-to-tail segments into connected polylines.
 * Uses a spatial hash for fast endpoint lookup.
 */
function tracePolylines(segments) {
  if (segments.length === 0) return [];

  // Quantize coordinates for hashing
  const Q = 1e4;
  const key = (x, y) => `${Math.round(x * Q)},${Math.round(y * Q)}`;

  // Build adjacency: each endpoint maps to a list of segment indices
  const endpointMap = new Map();
  const used = new Uint8Array(segments.length);

  for (let i = 0; i < segments.length; i++) {
    const [x1, y1, x2, y2] = segments[i];
    const k1 = key(x1, y1);
    const k2 = key(x2, y2);

    if (!endpointMap.has(k1)) endpointMap.set(k1, []);
    endpointMap.get(k1).push({ idx: i, end: 0 });

    if (!endpointMap.has(k2)) endpointMap.set(k2, []);
    endpointMap.get(k2).push({ idx: i, end: 1 });
  }

  const polylines = [];

  for (let i = 0; i < segments.length; i++) {
    if (used[i]) continue;

    used[i] = 1;
    const [x1, y1, x2, y2] = segments[i];
    const coords = [[x1, y1], [x2, y2]];

    // Extend forward from the end
    let currentKey = key(x2, y2);
    while (true) {
      const neighbors = endpointMap.get(currentKey);
      if (!neighbors) break;
      let found = false;
      for (const n of neighbors) {
        if (used[n.idx]) continue;
        used[n.idx] = 1;
        const seg = segments[n.idx];
        if (n.end === 0) {
          coords.push([seg[2], seg[3]]);
          currentKey = key(seg[2], seg[3]);
        } else {
          coords.push([seg[0], seg[1]]);
          currentKey = key(seg[0], seg[1]);
        }
        found = true;
        break;
      }
      if (!found) break;
    }

    // Extend backward from the start
    currentKey = key(x1, y1);
    while (true) {
      const neighbors = endpointMap.get(currentKey);
      if (!neighbors) break;
      let found = false;
      for (const n of neighbors) {
        if (used[n.idx]) continue;
        used[n.idx] = 1;
        const seg = segments[n.idx];
        if (n.end === 1) {
          coords.unshift([seg[0], seg[1]]);
          currentKey = key(seg[0], seg[1]);
        } else {
          coords.unshift([seg[2], seg[3]]);
          currentKey = key(seg[2], seg[3]);
        }
        found = true;
        break;
      }
      if (!found) break;
    }

    polylines.push(coords);
  }

  return polylines;
}

// ─── Coordinate conversion ───────────────────────────────────────────────────

/**
 * Convert MOLA pixel coords to [longitude, latitude] (GeoJSON order).
 * MOLA grid: row 0 = LAT_TOP, col 0 = 0°E
 * Output: lng [-180, 180], lat [LAT_BOTTOM, LAT_TOP]
 */
function molaToLngLat(px, py) {
  const lng = (px / WIDTH) * 360 - 180;
  const latSpan = LAT_TOP - LAT_BOTTOM;
  const lat = LAT_TOP - (py / HEIGHT) * latSpan;
  return [
    Math.round(lng * 1e4) / 1e4,
    Math.round(lat * 1e4) / 1e4,
  ];
}

// ─── Classify contour importance ─────────────────────────────────────────────

function contourClass(elevation) {
  if (elevation % MAJOR_INTERVAL === 0) return "major";
  if (elevation % MID_INTERVAL === 0) return "mid";
  return "minor";
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  console.log("Loading MOLA data...");
  const { meta, elevation } = loadMola();
  console.log(`  Grid: ${meta.width}x${meta.height}`);
  console.log(`  Elevation: ${meta.elevationMin}m to ${meta.elevationMax}m`);

  // Determine contour levels
  const levelMin = Math.ceil(meta.elevationMin / MINOR_INTERVAL) * MINOR_INTERVAL;
  const levelMax = Math.floor(meta.elevationMax / MINOR_INTERVAL) * MINOR_INTERVAL;
  const levels = [];
  for (let l = levelMin; l <= levelMax; l += MINOR_INTERVAL) levels.push(l);
  console.log(`  Contour levels: ${levels.length} (${levelMin}m to ${levelMax}m)`);

  // Generate contours and build GeoJSON features
  console.log("\nGenerating contours...");
  const features = [];
  let totalSegments = 0;
  let totalPolylines = 0;

  for (const level of levels) {
    const cls = contourClass(level);
    const segments = marchLevel(elevation, meta.width, meta.height, level);
    totalSegments += segments.length;

    if (segments.length === 0) continue;

    const polylines = tracePolylines(segments);
    totalPolylines += polylines.length;

    for (const coords of polylines) {
      const lngLatCoords = coords.map(([px, py]) => molaToLngLat(px, py));

      features.push({
        type: "Feature",
        properties: {
          elevation: level,
          class: cls,
        },
        geometry: {
          type: "LineString",
          coordinates: lngLatCoords,
        },
      });
    }

    if (levels.indexOf(level) % 10 === 0) {
      process.stdout.write(`  ${level}m (${cls})... ${segments.length} segments → ${polylines.length} polylines\n`);
    }
  }

  console.log(`\n  Total: ${totalSegments.toLocaleString()} segments → ${totalPolylines.toLocaleString()} polylines → ${features.length.toLocaleString()} features`);

  const geojson = {
    type: "FeatureCollection",
    features,
  };

  mkdirSync(DATA_DIR, { recursive: true });
  const outPath = join(DATA_DIR, "mars-contours.json");
  writeFileSync(outPath, JSON.stringify(geojson));

  const sizeMB = (Buffer.byteLength(JSON.stringify(geojson)) / 1e6).toFixed(1);
  console.log(`\nWritten: ${outPath} (${sizeMB} MB)`);
  console.log("Done.");
}

main();

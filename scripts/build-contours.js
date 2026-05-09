#!/usr/bin/env node
/**
 * Build contour vector tiles from MOLA elevation data.
 *
 * Pipeline: MOLA binary → marching squares → trace polylines → GeoJSON
 *           → geojson-vt (slice tiles) → vt-pbf (encode) → PMTiles (pack)
 *
 * Prerequisites: run `node scripts/fetch-mola.js` first to download MOLA data.
 * Output: public/data/mars-contours.pmtiles
 *
 * Run: node scripts/build-contours.js
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import geojsonvt from "geojson-vt";
import vtpbf from "vt-pbf";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const DATA_DIR = join(PROJECT_ROOT, "public", "data");

// Contour intervals (meters)
const MINOR_INTERVAL = 500;
const MID_INTERVAL = 1000;
const MAJOR_INTERVAL = 2000;

// MOLA grid dimensions
const WIDTH = 1440;
const HEIGHT = 720;

// ─── Load MOLA data ──────────────────────────────────────────────────────────

function loadMola() {
  const metaPath = join(DATA_DIR, "mola-topo-4ppd.json");
  const binPath = join(DATA_DIR, "mola-topo-4ppd.bin");

  const meta = JSON.parse(readFileSync(metaPath, "utf-8"));
  const buf = readFileSync(binPath);
  const elevation = new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);

  if (elevation.length !== meta.width * meta.height) {
    throw new Error(`MOLA data size mismatch`);
  }

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

  // Quantize coordinates for hashing (6 decimal places is sub-meter)
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
    endpointMap.get(k1).push({ idx: i, end: 0 }); // end 0 = start point

    if (!endpointMap.has(k2)) endpointMap.set(k2, []);
    endpointMap.get(k2).push({ idx: i, end: 1 }); // end 1 = end point
  }

  const polylines = [];

  for (let i = 0; i < segments.length; i++) {
    if (used[i]) continue;

    // Start a new polyline from this segment
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
          // Matched at segment's start, append segment's end
          coords.push([seg[2], seg[3]]);
          currentKey = key(seg[2], seg[3]);
        } else {
          // Matched at segment's end, append segment's start
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
          // Matched at segment's end, prepend segment's start
          coords.unshift([seg[0], seg[1]]);
          currentKey = key(seg[0], seg[1]);
        } else {
          // Matched at segment's start, prepend segment's end
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
 * MOLA grid: row 0 = 90°N, col 0 = 0°E
 * Output: lng [-180, 180], lat [-90, 90]
 */
function molaToLngLat(px, py) {
  // px: 0..1440 maps to 0°E..360°E → shift to -180..180
  const lng = (px / WIDTH) * 360 - 180;
  // py: 0..720 maps to 90°N..90°S
  const lat = 90 - (py / HEIGHT) * 180;
  return [lng, lat];
}

// ─── Classify contour importance ─────────────────────────────────────────────

function contourClass(elevation) {
  if (elevation % MAJOR_INTERVAL === 0) return "major";
  if (elevation % MID_INTERVAL === 0) return "mid";
  return "minor";
}

// ─── PMTiles writer ──────────────────────────────────────────────────────────

// PMTiles v3 spec: https://github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md
// We write a minimal v3 archive with a flat (non-clustered) directory.

function buildPMTiles(tileIndex, minZoom, maxZoom) {
  // Collect all tiles from geojson-vt
  const tiles = new Map(); // "z/x/y" → Uint8Array (pbf)

  for (let z = minZoom; z <= maxZoom; z++) {
    // geojson-vt uses a tile coordinate space; iterate the possible range
    const dim = 1 << z;
    for (let x = 0; x < dim; x++) {
      for (let y = 0; y < dim; y++) {
        const tile = tileIndex.getTile(z, x, y);
        if (!tile || !tile.features || tile.features.length === 0) continue;

        // Encode to protobuf
        const pbf = vtpbf.fromGeojsonVt({ contours: tile }, { version: 2 });
        tiles.set(`${z}/${x}/${y}`, Buffer.from(pbf));
      }
    }
  }

  console.log(`  Total tiles: ${tiles.size}`);

  // Build PMTiles v3 archive
  return writePMTilesV3(tiles, minZoom, maxZoom);
}

function writePMTilesV3(tiles, minZoom, maxZoom) {
  // PMTiles v3 uses a hilbert-curve-ordered directory of tile entries.
  // For simplicity, we write a flat (non-clustered) directory.

  // Convert tile coords to TileID (hilbert curve index)
  const entries = [];
  for (const [key, data] of tiles) {
    const [z, x, y] = key.split("/").map(Number);
    const tileId = zxyToTileId(z, x, y);
    entries.push({ tileId, data });
  }

  // Sort by tileId
  entries.sort((a, b) => (a.tileId < b.tileId ? -1 : a.tileId > b.tileId ? 1 : 0));

  // Header is 127 bytes
  const HEADER_SIZE = 127;

  // Build directory entries and tile data
  // Each directory entry: tileId(varint), runLength(varint), length(varint), offset(varint)
  // For simplicity, write fixed-size entries

  // First, concatenate all tile data
  const tileDataParts = [];
  let dataOffset = 0;
  const dirEntries = [];

  for (const entry of entries) {
    dirEntries.push({
      tileId: entry.tileId,
      offset: dataOffset,
      length: entry.data.length,
      runLength: 1,
    });
    tileDataParts.push(entry.data);
    dataOffset += entry.data.length;
  }

  const tileDataBuf = Buffer.concat(tileDataParts);

  // Serialize directory (simple binary format for PMTiles v3)
  const dirBuf = serializeDirectory(dirEntries);

  // Compute offsets
  const rootDirOffset = HEADER_SIZE;
  const rootDirLength = dirBuf.length;
  const tileDataOffset = HEADER_SIZE + rootDirLength;
  const tileDataLength = tileDataBuf.length;

  // Build header
  const header = Buffer.alloc(HEADER_SIZE);
  let pos = 0;

  // Magic "PMTiles" + version 3
  header.write("PMTiles", 0, "ascii"); pos = 7;
  header.writeUInt8(3, pos); pos = 1 + pos; // version

  // Root directory offset and length (uint64 LE)
  writeUInt64LE(header, pos, BigInt(rootDirOffset)); pos += 8;
  writeUInt64LE(header, pos, BigInt(rootDirLength)); pos += 8;

  // Metadata offset and length (empty)
  writeUInt64LE(header, pos, BigInt(0)); pos += 8;
  writeUInt64LE(header, pos, BigInt(0)); pos += 8;

  // Leaf directory offset and length (none for flat directory)
  writeUInt64LE(header, pos, BigInt(0)); pos += 8;
  writeUInt64LE(header, pos, BigInt(0)); pos += 8;

  // Tile data offset and length
  writeUInt64LE(header, pos, BigInt(tileDataOffset)); pos += 8;
  writeUInt64LE(header, pos, BigInt(tileDataLength)); pos += 8;

  // Addressed tiles count
  writeUInt64LE(header, pos, BigInt(entries.length)); pos += 8;

  // Tile entries count
  writeUInt64LE(header, pos, BigInt(entries.length)); pos += 8;

  // Tile contents count
  writeUInt64LE(header, pos, BigInt(entries.length)); pos += 8;

  // Clustered: false (0)
  header.writeUInt8(0, pos); pos += 1;

  // Internal compression: none (0)
  header.writeUInt8(0, pos); pos += 1;

  // Tile compression: none (0) — tiles are uncompressed pbf
  header.writeUInt8(0, pos); pos += 1;

  // Tile type: mvt (1)
  header.writeUInt8(1, pos); pos += 1;

  // Min zoom
  header.writeUInt8(minZoom, pos); pos += 1;

  // Max zoom
  header.writeUInt8(maxZoom, pos); pos += 1;

  // Min position (lon, lat) as int32 * 1e7
  // Full planet bounds
  header.writeInt32LE(Math.round(-180 * 1e7), pos); pos += 4; // min lon
  header.writeInt32LE(Math.round(-90 * 1e7), pos); pos += 4;  // min lat
  header.writeInt32LE(Math.round(180 * 1e7), pos); pos += 4;  // max lon
  header.writeInt32LE(Math.round(90 * 1e7), pos); pos += 4;   // max lat

  // Center position
  header.writeInt32LE(0, pos); pos += 4; // center lon
  header.writeInt32LE(0, pos); pos += 4; // center lat
  header.writeUInt8(2, pos); pos += 1;   // center zoom

  // Pad remaining to 127
  // (already zeroed by Buffer.alloc)

  return Buffer.concat([header, dirBuf, tileDataBuf]);
}

function writeUInt64LE(buf, offset, val) {
  buf.writeBigUInt64LE(val, offset);
}

// ─── PMTiles directory serialization ─────────────────────────────────────────

function serializeDirectory(entries) {
  // PMTiles v3 directory: sequence of varint-encoded entries
  // Each entry: tileId delta (varint), runLength (varint), length (varint), offset (varint)
  // If runLength == 0, offset is interpreted as the offset into leaf directories.

  const parts = [];

  // Number of entries as varint
  parts.push(encodeVarint(entries.length));

  // TileId deltas
  let lastTileId = BigInt(0);
  for (const e of entries) {
    const id = BigInt(e.tileId);
    parts.push(encodeVarint(Number(id - lastTileId)));
    lastTileId = id;
  }

  // Run lengths
  for (const e of entries) {
    parts.push(encodeVarint(e.runLength));
  }

  // Lengths
  for (const e of entries) {
    parts.push(encodeVarint(e.length));
  }

  // Offsets (delta-encoded from cumulative position)
  // In PMTiles v3, offset 0 means "immediately follows previous tile"
  // We store actual offsets and let readers handle it
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (i > 0 && e.offset === entries[i - 1].offset + entries[i - 1].length) {
      // Consecutive — encode as 0
      parts.push(encodeVarint(0));
    } else {
      // Non-consecutive — encode offset + 1
      parts.push(encodeVarint(e.offset + 1));
    }
  }

  return Buffer.concat(parts);
}

function encodeVarint(value) {
  const bytes = [];
  value = value >>> 0; // treat as unsigned
  while (value > 0x7f) {
    bytes.push((value & 0x7f) | 0x80);
    value >>>= 7;
  }
  bytes.push(value & 0x7f);
  return Buffer.from(bytes);
}

// ─── Hilbert curve tile ID ───────────────────────────────────────────────────

// PMTiles uses a modified hilbert curve to map (z, x, y) to a single uint64 tileId.
// Tiles at zoom z occupy IDs starting at sum(4^i, i=0..z-1) through sum(4^i, i=0..z).

function zxyToTileId(z, x, y) {
  if (z === 0) return 0;

  // Offset for zoom level
  let offset = 0;
  for (let i = 0; i < z; i++) offset += (1 << i) * (1 << i);

  // Hilbert curve index within this zoom level
  const n = 1 << z;
  const h = xyToHilbert(n, x, y);

  return offset + h;
}

// Convert (x, y) to hilbert curve index for an n x n grid
function xyToHilbert(n, x, y) {
  let d = 0;
  for (let s = n >> 1; s > 0; s >>= 1) {
    const rx = (x & s) > 0 ? 1 : 0;
    const ry = (y & s) > 0 ? 1 : 0;
    d += s * s * ((3 * rx) ^ ry);

    // Rotate
    if (ry === 0) {
      if (rx === 1) {
        x = s - 1 - x;
        y = s - 1 - y;
      }
      [x, y] = [y, x];
    }
  }
  return d;
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
      // Convert MOLA pixel coords to [lng, lat]
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

  console.log(`  Total: ${totalSegments.toLocaleString()} segments → ${totalPolylines.toLocaleString()} polylines → ${features.length.toLocaleString()} features`);

  const geojson = {
    type: "FeatureCollection",
    features,
  };

  // Optionally write GeoJSON for debugging
  if (process.argv.includes("--geojson")) {
    const gjPath = join(DATA_DIR, "mars-contours.geojson");
    writeFileSync(gjPath, JSON.stringify(geojson));
    console.log(`  Debug GeoJSON written: ${gjPath}`);
  }

  // Slice into vector tiles
  console.log("\nSlicing into vector tiles...");
  const minZoom = 0;
  const maxZoom = 6; // MOLA 4ppd resolution doesn't support much higher
  const tileIndex = geojsonvt(geojson, {
    maxZoom,
    indexMaxZoom: maxZoom,
    indexMaxPoints: 0, // index all features
    tolerance: 3,      // simplification tolerance (in tile pixel units)
    extent: 4096,      // tile extent
    buffer: 64,        // tile buffer for line rendering across boundaries
    lineMetrics: false,
    generateId: false,
  });

  // Pack into PMTiles
  console.log("\nBuilding PMTiles archive...");
  const pmtilesBuf = buildPMTiles(tileIndex, minZoom, maxZoom);

  mkdirSync(DATA_DIR, { recursive: true });
  const outPath = join(DATA_DIR, "mars-contours.pmtiles");
  writeFileSync(outPath, pmtilesBuf);
  console.log(`\nWritten: ${outPath} (${(pmtilesBuf.length / 1e6).toFixed(1)} MB)`);
  console.log("Done.");
}

main();

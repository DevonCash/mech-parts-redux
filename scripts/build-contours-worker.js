/**
 * Worker thread for contour generation.
 * Receives a SharedArrayBuffer of elevation data and a list of contour levels.
 * Runs marching squares + polyline tracing for each level, posts results back.
 */

import { workerData, parentPort } from "worker_threads";

const { sharedBuf, meta, levels } = workerData;

const WIDTH = meta.width;
const HEIGHT = meta.height;
const LAT_TOP = meta.latRange[0];
const LAT_BOTTOM = meta.latRange[1];

const MINOR_INTERVAL = 100;
const MID_INTERVAL = 500;
const MAJOR_INTERVAL = 2000;

// Read elevation from SharedArrayBuffer
const elevation = new Int16Array(sharedBuf);

// ─── Marching squares ────────────────────────────────────────────────────────

function marchLevel(level) {
  const segments = [];

  for (let cy = 0; cy < HEIGHT - 1; cy++) {
    const rowOff = cy * WIDTH;
    const nextRowOff = (cy + 1) * WIDTH;

    for (let cx = 0; cx < WIDTH - 1; cx++) {
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

// ─── Trace segments into polylines ──────────────────────────────────────────

function tracePolylines(segments) {
  if (segments.length === 0) return [];

  const Q = 1e4;
  const key = (x, y) => `${Math.round(x * Q)},${Math.round(y * Q)}`;

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

    // Extend forward
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

    // Extend backward
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

// ─── Coordinate conversion ──────────────────────────────────────────────────

function molaToLngLat(px, py) {
  const lng = (px / WIDTH) * 360 - 180;
  const latSpan = LAT_TOP - LAT_BOTTOM;
  const lat = LAT_TOP - (py / HEIGHT) * latSpan;
  return [
    Math.round(lng * 1e4) / 1e4,
    Math.round(lat * 1e4) / 1e4,
  ];
}

function contourClass(elevation) {
  if (elevation % MAJOR_INTERVAL === 0) return "major";
  if (elevation % MID_INTERVAL === 0) return "mid";
  return "minor";
}

// ─── Process assigned levels ────────────────────────────────────────────────

for (const level of levels) {
  const cls = contourClass(level);
  const segments = marchLevel(level);

  if (segments.length > 0) {
    const polylines = tracePolylines(segments);
    const features = [];

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

    // Send features for this level immediately so the main thread
    // can stream them to disk instead of accumulating in memory
    parentPort.postMessage({ type: "features", features });
  }

  parentPort.postMessage({ type: "level-done", level });
}

parentPort.postMessage({ type: "done" });

/**
 * Contour line generation from MOLA elevation grid.
 *
 * Uses marching squares to trace isolines at specified elevation intervals.
 * Outputs line segments that can be rendered directly to Canvas 2D.
 */

import type { MolaData } from "./mola";

export interface ContourLine {
  elevation: number;
  segments: Array<[x1: number, y1: number, x2: number, y2: number]>;
}

/**
 * Generate contour lines using marching squares.
 *
 * @param mola - Loaded MOLA data
 * @param interval - Elevation interval between contour lines (meters)
 * @param region - Optional sub-region to process {x, y, w, h} in pixel coords.
 *                 Defaults to full grid.
 */
export function generateContours(
  mola: MolaData,
  interval: number,
  region?: { x: number; y: number; w: number; h: number }
): ContourLine[] {
  const { meta, elevation } = mola;
  const rx = region?.x ?? 0;
  const ry = region?.y ?? 0;
  const rw = region?.w ?? meta.width;
  const rh = region?.h ?? meta.height;

  // Determine which elevation levels to trace
  const minElev = Math.ceil(meta.elevationMin / interval) * interval;
  const maxElev = Math.floor(meta.elevationMax / interval) * interval;

  const contours: ContourLine[] = [];

  for (let level = minElev; level <= maxElev; level += interval) {
    const segments: ContourLine["segments"] = [];

    // March through the grid cells
    for (let cy = ry; cy < ry + rh - 1; cy++) {
      for (let cx = rx; cx < rx + rw - 1; cx++) {
        // Get corner values
        const tl = elevation[cy * meta.width + cx];
        const tr = elevation[cy * meta.width + cx + 1];
        const bl = elevation[(cy + 1) * meta.width + cx];
        const br = elevation[(cy + 1) * meta.width + cx + 1];

        // Marching squares case index (4 bits)
        const caseIndex =
          (tl >= level ? 8 : 0) |
          (tr >= level ? 4 : 0) |
          (br >= level ? 2 : 0) |
          (bl >= level ? 1 : 0);

        if (caseIndex === 0 || caseIndex === 15) continue;

        // Interpolation helpers
        const lerp = (a: number, b: number) => {
          if (b === a) return 0.5;
          return (level - a) / (b - a);
        };

        // Edge midpoints (interpolated)
        const top = lerp(tl, tr);
        const right = lerp(tr, br);
        const bottom = lerp(bl, br);
        const left = lerp(tl, bl);

        // Convert to pixel coordinates
        const t: [number, number] = [cx + top, cy];
        const r: [number, number] = [cx + 1, cy + right];
        const b: [number, number] = [cx + bottom, cy + 1];
        const l: [number, number] = [cx, cy + left];

        // Emit segments based on case
        switch (caseIndex) {
          case 1:
          case 14:
            segments.push([l[0], l[1], b[0], b[1]]);
            break;
          case 2:
          case 13:
            segments.push([b[0], b[1], r[0], r[1]]);
            break;
          case 3:
          case 12:
            segments.push([l[0], l[1], r[0], r[1]]);
            break;
          case 4:
          case 11:
            segments.push([t[0], t[1], r[0], r[1]]);
            break;
          case 5:
            // Saddle: use center value to disambiguate
            {
              const center = (tl + tr + bl + br) / 4;
              if (center >= level) {
                segments.push([l[0], l[1], t[0], t[1]]);
                segments.push([b[0], b[1], r[0], r[1]]);
              } else {
                segments.push([l[0], l[1], b[0], b[1]]);
                segments.push([t[0], t[1], r[0], r[1]]);
              }
            }
            break;
          case 6:
          case 9:
            segments.push([t[0], t[1], b[0], b[1]]);
            break;
          case 7:
          case 8:
            segments.push([l[0], l[1], t[0], t[1]]);
            break;
          case 10:
            // Saddle: use center value to disambiguate
            {
              const center = (tl + tr + bl + br) / 4;
              if (center >= level) {
                segments.push([t[0], t[1], r[0], r[1]]);
                segments.push([l[0], l[1], b[0], b[1]]);
              } else {
                segments.push([l[0], l[1], t[0], t[1]]);
                segments.push([b[0], b[1], r[0], r[1]]);
              }
            }
            break;
        }
      }
    }

    if (segments.length > 0) {
      contours.push({ elevation: level, segments });
    }
  }

  return contours;
}

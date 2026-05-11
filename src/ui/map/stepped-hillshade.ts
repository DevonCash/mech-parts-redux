/**
 * Custom MapLibre protocol that generates stepped (banded) hillshade
 * raster tiles from DEM elevation data.
 *
 * Uses the same DemSource cache as the contour worker — no extra tile fetches.
 */

import type { DemSource } from "./maplibre-contour-pmtiles.mjs";

interface SteppedHillshadeOptions {
  /** Light direction in degrees clockwise from north (default: 315) */
  azimuth?: number;
  /** Light altitude in degrees above horizon (default: 45) */
  altitude?: number;
  /** Number of discrete brightness bands (default: 6) */
  steps?: number;
  /** Darkest output value 0–255 (default: 0) */
  minBrightness?: number;
  /** Brightest output value 0–255 (default: 50) */
  maxBrightness?: number;
}

export function createSteppedHillshadeProtocol(
  demSource: DemSource,
  options: SteppedHillshadeOptions = {},
) {
  const {
    azimuth = 315,
    altitude = 45,
    steps = 6,
    minBrightness = 0,
    maxBrightness = 50,
  } = options;

  // Convert to radians, adjusting azimuth to math convention
  const azRad = ((360 - azimuth + 90) * Math.PI) / 180;
  const altRad = (altitude * Math.PI) / 180;
  const sinAlt = Math.sin(altRad);
  const cosAlt = Math.cos(altRad);

  const protocolId = "stepped-hillshade";
  const tileUrl = `${protocolId}://{z}/{x}/{y}`;

  const handler = async (
    params: { url: string },
    abortController: AbortController,
  ) => {
    const match = /\/\/(\d+)\/(\d+)\/(\d+)/.exec(params.url);
    if (!match) throw new Error(`Invalid tile URL: ${params.url}`);
    const [, z, x, y] = match.map(Number);

    const tile = await demSource.getDemTile(z, x, y, abortController);
    const { width, height } = tile;

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d")!;
    const imageData = ctx.createImageData(width, height);
    const pixels = imageData.data;

    // HeightTile exposes a get(x, y) accessor, not a flat data array
    const el = (px: number, py: number) =>
      tile.get(
        Math.max(0, Math.min(width - 1, px)),
        Math.max(0, Math.min(height - 1, py)),
      );

    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        // Horn's method for slope/aspect from 3×3 neighborhood
        const dzdx =
          (el(px + 1, py - 1) + 2 * el(px + 1, py) + el(px + 1, py + 1) -
           (el(px - 1, py - 1) + 2 * el(px - 1, py) + el(px - 1, py + 1))) / 8;
        const dzdy =
          (el(px - 1, py + 1) + 2 * el(px, py + 1) + el(px + 1, py + 1) -
           (el(px - 1, py - 1) + 2 * el(px, py - 1) + el(px + 1, py - 1))) / 8;

        const slope = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy));
        const aspect = Math.atan2(dzdy, -dzdx);

        let shade =
          sinAlt * Math.cos(slope) +
          cosAlt * Math.sin(slope) * Math.cos(azRad - aspect);
        shade = Math.max(0, Math.min(1, shade));

        // Quantize into discrete steps
        const stepped = Math.floor(shade * steps) / steps;
        const brightness = Math.round(
          minBrightness + stepped * (maxBrightness - minBrightness),
        );

        const i = (py * width + px) * 4;
        pixels[i] = brightness;
        pixels[i + 1] = brightness;
        pixels[i + 2] = brightness;
        pixels[i + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    const blob = await canvas.convertToBlob({ type: "image/png" });
    return { data: await blob.arrayBuffer() };
  };

  return { protocolId, tileUrl, handler };
}

/**
 * MOLA topography data loader and accessor.
 *
 * Loads the preprocessed 4 pixels-per-degree elevation grid
 * and provides lat/lng → elevation lookups.
 */

export interface MolaMeta {
  width: number;
  height: number;
  pixelsPerDegree: number;
  elevationMin: number;
  elevationMax: number;
  latRange: [number, number];
  lonRange: [number, number];
}

export interface MolaData {
  meta: MolaMeta;
  elevation: Int16Array;

  /** Get elevation in meters at a lat/lng coordinate. Returns interpolated value. */
  getElevation(lat: number, lng: number): number;

  /** Get elevation at a grid pixel (no interpolation). */
  getElevationAt(x: number, y: number): number;
}

export async function loadMola(basePath = "/data"): Promise<MolaData> {
  const [metaRes, binRes] = await Promise.all([
    fetch(`${basePath}/mola-topo-4ppd.json`),
    fetch(`${basePath}/mola-topo-4ppd.bin`),
  ]);

  if (!metaRes.ok) throw new Error(`Failed to load MOLA metadata: ${metaRes.status}`);
  if (!binRes.ok) throw new Error(`Failed to load MOLA data: ${binRes.status}`);

  const meta: MolaMeta = await metaRes.json();
  const buffer = await binRes.arrayBuffer();
  const elevation = new Int16Array(buffer);

  if (elevation.length !== meta.width * meta.height) {
    throw new Error(
      `MOLA data size mismatch: expected ${meta.width * meta.height}, got ${elevation.length}`
    );
  }

  function getElevationAt(x: number, y: number): number {
    // Clamp to grid bounds
    x = Math.max(0, Math.min(meta.width - 1, Math.floor(x)));
    y = Math.max(0, Math.min(meta.height - 1, Math.floor(y)));
    return elevation[y * meta.width + x];
  }

  function getElevation(lat: number, lng: number): number {
    // Normalize longitude to [0, 360)
    lng = ((lng % 360) + 360) % 360;

    // Convert lat/lng to fractional pixel coordinates
    // Top row (y=0) = latRange[0] (90°N)
    // Bottom row (y=height-1) = latRange[1] (90°S)
    const fx = (lng / 360) * meta.width;
    const fy = ((meta.latRange[0] - lat) / (meta.latRange[0] - meta.latRange[1])) * meta.height;

    // Bilinear interpolation
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(x0 + 1, meta.width - 1);
    const y1 = Math.min(y0 + 1, meta.height - 1);
    const dx = fx - x0;
    const dy = fy - y0;

    const v00 = getElevationAt(x0, y0);
    const v10 = getElevationAt(x1, y0);
    const v01 = getElevationAt(x0, y1);
    const v11 = getElevationAt(x1, y1);

    return (
      v00 * (1 - dx) * (1 - dy) +
      v10 * dx * (1 - dy) +
      v01 * (1 - dx) * dy +
      v11 * dx * dy
    );
  }

  return { meta, elevation, getElevation, getElevationAt };
}

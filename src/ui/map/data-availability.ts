/**
 * Probe which optional map data files exist before building the map style.
 *
 * The terrain/contour/geology PMTiles are produced by `pnpm build:data`
 * (a multi-GB NASA download plus GDAL/tippecanoe) and are not committed,
 * so the game must run without them. The dev server falls back to
 * index.html for unknown paths, so a 200 with an HTML content-type still
 * means "missing".
 */

export interface MapDataAvailability {
  terrain: boolean;
  contours: boolean;
  geology: boolean;
}

async function exists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD" });
    if (!res.ok) return false;
    const type = res.headers.get("content-type") ?? "";
    return !type.includes("text/html");
  } catch {
    return false;
  }
}

export async function checkMapData(): Promise<MapDataAvailability> {
  const [terrain, contours, geology] = await Promise.all([
    exists("/data/mars-terrain.pmtiles"),
    exists("/data/mars-contours.pmtiles"),
    exists("/data/mars-geology.pmtiles"),
  ]);
  return { terrain, contours, geology };
}

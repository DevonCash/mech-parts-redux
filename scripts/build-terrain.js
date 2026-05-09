#!/usr/bin/env node
/**
 * Build Terrarium-encoded raster DEM tiles from MOLA elevation data.
 *
 * Uses GDAL VRT to describe the raw binary, rio-rgbify to create
 * Terrarium-encoded tiles, and pmtiles to package them.
 *
 * Prerequisites:
 *   brew install gdal pmtiles
 *   pip install rio-rgbify
 *
 * Input:  public/data/mola-topo.bin + mola-topo.json (from fetch-mola.js)
 * Output: public/data/mars-terrain.pmtiles
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { availableParallelism } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const DATA_DIR = join(PROJECT_ROOT, "public", "data");

const MAX_ZOOM = 7;
const MIN_ZOOM = 0;

// Terrarium encoding: elevation = (R * 256 + G + B / 256) - 32768
// rio-rgbify params: base = -32768, interval = 1/256
const TERRARIUM_BASE = -32768;
const TERRARIUM_INTERVAL = 0.00390625; // 1/256

function checkTool(name, cmd, installHint) {
  try {
    execSync(cmd, { stdio: "ignore" });
  } catch {
    console.error(`Error: ${name} not found.`);
    console.error(`  Install: ${installHint}`);
    process.exit(1);
  }
}

function main() {
  // Check prerequisites
  checkTool("GDAL", "gdalinfo --version", "brew install gdal");
  checkTool("rio-rgbify", "rio rgbify --help", "pip install rio-rgbify");
  checkTool("pmtiles", "pmtiles version", "brew install pmtiles");

  // Read MOLA metadata
  const metaPath = join(DATA_DIR, "mola-topo.json");
  const binPath = join(DATA_DIR, "mola-topo.bin");

  if (!existsSync(metaPath) || !existsSync(binPath)) {
    console.error("MOLA data not found.");
    console.error("  Run: node --max-old-space-size=8192 scripts/fetch-mola.js");
    process.exit(1);
  }

  const meta = JSON.parse(readFileSync(metaPath, "utf-8"));
  const { width, height } = meta;
  const latTop = meta.latRange[0];
  const pixelSize = 360 / width;
  const lineOffset = width * 2; // Int16 = 2 bytes per pixel
  const halfWidth = width / 2;

  console.log("Building terrain tiles from MOLA data...");
  console.log(`  Grid: ${width}×${height} (${meta.pixelsPerDegree}ppd)`);
  console.log(`  Lat: ${meta.latRange[0]}°N to ${Math.abs(meta.latRange[1])}°S`);
  console.log(`  Zoom: ${MIN_ZOOM}–${MAX_ZOOM}\n`);

  // ── Step 1: VRT for raw binary (lon 0–360) ────────────────────────────────

  const rawVrtPath = join(DATA_DIR, "mola-raw.vrt");
  console.log("Creating raw VRT (lon 0–360)...");

  writeFileSync(rawVrtPath, `<VRTDataset rasterXSize="${width}" rasterYSize="${height}">
  <SRS>EPSG:4326</SRS>
  <GeoTransform>0, ${pixelSize}, 0, ${latTop}, 0, -${pixelSize}</GeoTransform>
  <VRTRasterBand dataType="Int16" band="1" subClass="VRTRawRasterBand">
    <SourceFilename relativeToVRT="1">mola-topo.bin</SourceFilename>
    <ImageOffset>0</ImageOffset>
    <PixelOffset>2</PixelOffset>
    <LineOffset>${lineOffset}</LineOffset>
    <ByteOrder>LSB</ByteOrder>
  </VRTRasterBand>
</VRTDataset>`);

  // ── Step 2: VRT that shifts lon 0–360 → −180–180 ─────────────────────────

  const shiftedVrtPath = join(DATA_DIR, "mola-shifted.vrt");
  console.log("Creating shifted VRT (lon −180–180)...");

  writeFileSync(shiftedVrtPath, `<VRTDataset rasterXSize="${width}" rasterYSize="${height}">
  <SRS>EPSG:4326</SRS>
  <GeoTransform>-180, ${pixelSize}, 0, ${latTop}, 0, -${pixelSize}</GeoTransform>
  <VRTRasterBand dataType="Int16" band="1">
    <SimpleSource>
      <SourceFilename relativeToVRT="1">mola-raw.vrt</SourceFilename>
      <SourceBand>1</SourceBand>
      <SrcRect xOff="${halfWidth}" yOff="0" xSize="${halfWidth}" ySize="${height}" />
      <DstRect xOff="0" yOff="0" xSize="${halfWidth}" ySize="${height}" />
    </SimpleSource>
    <SimpleSource>
      <SourceFilename relativeToVRT="1">mola-raw.vrt</SourceFilename>
      <SourceBand>1</SourceBand>
      <SrcRect xOff="0" yOff="0" xSize="${halfWidth}" ySize="${height}" />
      <DstRect xOff="${halfWidth}" yOff="0" xSize="${halfWidth}" ySize="${height}" />
    </SimpleSource>
  </VRTRasterBand>
</VRTDataset>`);

  // ── Step 3: rio-rgbify → Terrarium MBTiles ────────────────────────────────

  const mbtilesPath = join(DATA_DIR, "mars-terrain.mbtiles");
  console.log(`\nRunning rio-rgbify (Terrarium encoding, zoom ${MIN_ZOOM}–${MAX_ZOOM})...`);
  console.log("  This may take several minutes.\n");

  execSync([
    "rio", "rgbify",
    "-b", String(TERRARIUM_BASE),
    "-i", String(TERRARIUM_INTERVAL),
    "--format", "png",
    "--min-z", String(MIN_ZOOM),
    "--max-z", String(MAX_ZOOM),
    "-j", String(availableParallelism()),
    `"${shiftedVrtPath}"`,
    `"${mbtilesPath}"`,
  ].join(" "), {
    stdio: "inherit",
    env: { ...process.env, PYTHONWARNINGS: "ignore::UserWarning:rasterio,ignore::FutureWarning:mercantile" },
  });

  // ── Step 4: MBTiles → PMTiles ─────────────────────────────────────────────

  const pmtilesPath = join(DATA_DIR, "mars-terrain.pmtiles");
  console.log("\nConverting MBTiles → PMTiles...");

  execSync(`pmtiles convert "${mbtilesPath}" "${pmtilesPath}"`, {
    stdio: "inherit",
  });

  // ── Cleanup ───────────────────────────────────────────────────────────────

  console.log("\nCleaning up intermediate files...");
  for (const f of [rawVrtPath, shiftedVrtPath, mbtilesPath]) {
    try { unlinkSync(f); } catch { /* ignore */ }
  }

  const { size } = statSync(pmtilesPath);
  console.log(`\nDone. Terrain tiles: ${pmtilesPath} (${(size / 1e6).toFixed(1)} MB)`);
}

main();

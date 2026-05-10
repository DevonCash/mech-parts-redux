#!/usr/bin/env node
/**
 * Download IAU Mars nomenclature data (named features) from USGS.
 *
 * Source: USGS Planetary Names Gazetteer
 * https://planetarynames.wr.usgs.gov/GIS_Downloads
 *
 * Downloads the shapefile zip, extracts it, converts to GeoJSON using
 * the .dbf fields, and writes to public/data/mars-nomenclature.json.
 *
 * Coordinate system: east longitude, planetocentric latitude (IAU Mars).
 *
 * Run: node scripts/fetch-nomenclature.js
 */

import { mkdirSync, writeFileSync, existsSync, createWriteStream, readFileSync, readdirSync, unlinkSync } from "fs";
import { join, dirname, extname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const DATA_DIR = join(PROJECT_ROOT, "public", "data");
const TMP_DIR = join(DATA_DIR, "nomenclature-tmp");

const SHAPEFILE_URL = "https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MARS_nomenclature_center_pts.zip";
const ZIP_PATH = join(TMP_DIR, "mars-nomenclature.zip");
const OUTPUT_PATH = join(DATA_DIR, "mars-nomenclature.json");

async function download(url, dest) {
  console.log(`  Downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
  console.log(`  Saved: ${dest} (${(buf.byteLength / 1e6).toFixed(1)} MB)`);
}

async function main() {
  if (existsSync(OUTPUT_PATH)) {
    console.log(`Already exists: ${OUTPUT_PATH}`);
    console.log("Delete to re-download.");
    return;
  }

  mkdirSync(TMP_DIR, { recursive: true });

  // Download shapefile zip
  console.log("Downloading Mars nomenclature data...");
  await download(SHAPEFILE_URL, ZIP_PATH);

  // Extract
  console.log("\nExtracting...");
  execSync(`unzip -o "${ZIP_PATH}" -d "${TMP_DIR}"`, { stdio: "inherit" });

  // Find the .shp file
  const files = readdirSync(TMP_DIR);
  const shpFile = files.find(f => extname(f).toLowerCase() === ".shp");
  if (!shpFile) throw new Error("No .shp file found in archive");

  const shpPath = join(TMP_DIR, shpFile);
  console.log(`  Found: ${shpFile}`);

  // Convert shapefile to GeoJSON using ogr2ogr if available, otherwise parse manually
  let geojson;
  try {
    console.log("\nConverting with ogr2ogr...");
    const tmpGeoJson = join(TMP_DIR, "tmp.geojson");
    execSync(`ogr2ogr -f GeoJSON "${tmpGeoJson}" "${shpPath}"`, { stdio: "inherit" });
    geojson = JSON.parse(readFileSync(tmpGeoJson, "utf-8"));
  } catch (e) {
    console.log("  ogr2ogr not found, trying shapefile npm package...");
    // Fallback: use the shapefile package
    try {
      const shapefile = await import("shapefile");
      const collection = { type: "FeatureCollection", features: [] };
      const source = await shapefile.open(shpPath);
      while (true) {
        const result = await source.read();
        if (result.done) break;
        collection.features.push(result.value);
      }
      geojson = collection;
    } catch (e2) {
      console.error("Failed to convert shapefile. Install GDAL (ogr2ogr) or run: npm install shapefile");
      throw e2;
    }
  }

  // Convert east longitude (0–360) to standard longitude (-180–180)
  for (const f of geojson.features) {
    const [lon, lat] = f.geometry.coordinates;
    f.geometry.coordinates = [lon > 180 ? lon - 360 : lon, lat];
    if (f.properties.center_lon > 180) f.properties.center_lon -= 360;
    if (f.properties.min_lon > 180) f.properties.min_lon -= 360;
    if (f.properties.max_lon > 180) f.properties.max_lon -= 360;
  }

  console.log(`\n  Features: ${geojson.features.length}`);

  // Log feature type breakdown
  const typeCounts = {};
  for (const f of geojson.features) {
    const type = f.properties.type || f.properties.TYPE || f.properties.feat_type || "unknown";
    typeCounts[type] = (typeCounts[type] || 0) + 1;
  }
  console.log("  Feature types:");
  for (const [type, count] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${type}: ${count}`);
  }

  // Write output
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(geojson));
  const sizeMB = (Buffer.byteLength(JSON.stringify(geojson)) / 1e6).toFixed(1);
  console.log(`\nWritten: ${OUTPUT_PATH} (${sizeMB} MB)`);

  // Clean up tmp
  console.log("Cleaning up...");
  for (const f of readdirSync(TMP_DIR)) {
    unlinkSync(join(TMP_DIR, f));
  }
  try { execSync(`rmdir "${TMP_DIR}"`); } catch {}

  console.log("Done.");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

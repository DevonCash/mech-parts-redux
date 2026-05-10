#!/usr/bin/env node
/**
 * Download USGS Global Geologic Map of Mars (SIM 3292).
 *
 * Source: USGS Scientific Investigations Map 3292
 * https://pubs.usgs.gov/sim/3292/
 *
 * Downloads the database ZIP (~790 MB), extracts shapefiles from the
 * "Shapefiles" subdirectory, converts geology polygons to GeoJSON using
 * ogr2ogr (reprojects from Robinson Mars 2000 to geographic coordinates),
 * and writes to public/data/mars-geology.json.
 *
 * Requires: GDAL (ogr2ogr) installed — needed for reprojection from
 * Robinson projection to geographic lat/lon.
 *
 * Run: node scripts/fetch-geology.js
 */

import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync, unlinkSync, statSync } from "fs";
import { join, dirname, extname, basename } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const DATA_DIR = join(PROJECT_ROOT, "public", "data");
const TMP_DIR = join(DATA_DIR, "geology-tmp");

const DATABASE_URL = "https://pubs.usgs.gov/sim/3292/downloads/sim3292_database.zip";
const ZIP_PATH = join(TMP_DIR, "sim3292_database.zip");
const OUTPUT_PATH = join(DATA_DIR, "mars-geology.json");

async function download(url, dest) {
  console.log(`  Downloading ${url}`);
  console.log("  (this is ~790 MB, may take a while)");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
  console.log(`  Saved: ${dest} (${(buf.byteLength / 1e6).toFixed(1)} MB)`);
}

function rmrf(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      rmrf(p);
      try { execSync(`rmdir "${p}"`); } catch {}
    } else {
      unlinkSync(p);
    }
  }
  try { execSync(`rmdir "${dir}"`); } catch {}
}

async function main() {
  if (existsSync(OUTPUT_PATH)) {
    console.log(`Already exists: ${OUTPUT_PATH}`);
    console.log("Delete to re-download.");
    return;
  }

  // Check for ogr2ogr — required for reprojection from Robinson
  try {
    execSync("ogr2ogr --version", { stdio: "pipe" });
  } catch {
    console.error("Error: ogr2ogr (GDAL) is required for this script.");
    console.error("The geology data uses Robinson projection and needs reprojection.");
    console.error("Install GDAL: brew install gdal");
    process.exit(1);
  }

  mkdirSync(TMP_DIR, { recursive: true });

  // Download database ZIP
  if (!existsSync(ZIP_PATH)) {
    console.log("Downloading Mars geologic map data...");
    await download(DATABASE_URL, ZIP_PATH);
  } else {
    console.log(`Using cached ZIP: ${ZIP_PATH}`);
  }

  // Extract — only the Shapefiles directory
  console.log("\nExtracting shapefiles...");
  const zipPrefix = "SIM3292_MarsGlobalGeologicGIS_20M/SIM3292_Shapefiles";
  execSync(`unzip -o "${ZIP_PATH}" "${zipPrefix}/*" -d "${TMP_DIR}"`, { stdio: "inherit" });

  const shapefilesDir = join(TMP_DIR, zipPrefix);

  const files = readdirSync(shapefilesDir);
  console.log("  Shapefiles found:", files.filter(f => extname(f).toLowerCase() === ".shp").join(", "));

  // Look for the geology polygon shapefile
  const geologyShp = files.find(f =>
    extname(f).toLowerCase() === ".shp" &&
    f.toLowerCase().includes("geol")
  );

  if (!geologyShp) {
    console.log("  Available .shp files:", files.filter(f => extname(f).toLowerCase() === ".shp"));
    throw new Error("No geology shapefile found. Check the file listing above.");
  }

  const shpPath = join(shapefilesDir, geologyShp);
  console.log(`\n  Using: ${geologyShp}`);

  // Convert with ogr2ogr — reproject from Robinson Mars 2000 to geographic
  // The source CRS is a Mars Robinson projection; we reproject to simple
  // geographic coordinates (lon/lat) on the Mars IAU sphere.
  console.log("\nConverting and reprojecting with ogr2ogr...");
  const tmpGeoJson = join(TMP_DIR, "geology.geojson");
  execSync(
    `ogr2ogr -f GeoJSON -t_srs "+proj=longlat +a=3396190 +b=3376200 +no_defs" "${tmpGeoJson}" "${shpPath}"`,
    { stdio: "inherit" }
  );

  const geojson = JSON.parse(readFileSync(tmpGeoJson, "utf-8"));
  console.log(`\n  Features: ${geojson.features.length}`);

  // Log unit type breakdown
  const unitCounts = {};
  for (const f of geojson.features) {
    const unit = f.properties.Unit || f.properties.UNIT || f.properties.unit || "unknown";
    unitCounts[unit] = (unitCounts[unit] || 0) + 1;
  }
  const uniqueUnits = Object.keys(unitCounts).length;
  console.log(`  Unique geologic units: ${uniqueUnits}`);

  // Simplify properties — keep only what we need for rendering
  for (const f of geojson.features) {
    const props = f.properties;
    f.properties = {
      unit: props.Unit || props.UNIT || props.unit || "",
      description: props.UnitDesc || props.UNITDESC || props.unitdesc || "",
      area_km2: props.SphArea_km || props.SPHAREA_KM || null,
    };
  }

  // Write output
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(geojson));
  const sizeMB = (Buffer.byteLength(JSON.stringify(geojson)) / 1e6).toFixed(1);
  console.log(`\nWritten: ${OUTPUT_PATH} (${sizeMB} MB)`);

  // Clean up tmp
  console.log("Cleaning up...");
  rmrf(TMP_DIR);

  console.log("Done.");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

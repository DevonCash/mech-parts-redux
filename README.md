# mech.parts

Mars-based RTS built with Svelte, MapLibre GL, and Three.js. The map uses real MOLA elevation data, USGS geology, and IAU nomenclature rendered as a 3D terrain globe.

## Prerequisites

- **Node.js** (v20+)
- **pnpm**
- **GDAL** (`ogr2ogr`) — needed to reproject geology shapefiles
- **tippecanoe** — builds PMTiles from GeoJSON

On macOS:

```sh
brew install gdal tippecanoe
```

## Install

```sh
pnpm install
```

## Build map data

The map layers depend on several data files that live in `public/data/`. One command fetches and builds everything in the right order:

```sh
pnpm run build:data
```

This downloads MOLA elevation data (~2 GB), builds terrain and contour PMTiles, fetches IAU nomenclature, and downloads/reprojects the USGS geology map (~790 MB). Each step skips if its output already exists, so re-running is safe and only rebuilds what's missing. First run takes a while.

## Run

```sh
pnpm dev
```

Opens at `http://localhost:5173`.

## Project structure

```
scripts/           data pipeline scripts (fetch + build)
public/data/       generated map data (not committed)
src/lib/mars/      map components (MapLibre, terrain, overlays)
docs/              game design docs (unit data model, etc.)
```

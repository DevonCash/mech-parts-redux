<script lang="ts">
  import { onMount } from "svelte";
  import maplibregl from "maplibre-gl";
  import "maplibre-gl/dist/maplibre-gl.css";
  import { Protocol } from "pmtiles";
  import { createTerrainShaderProtocol } from "./terrain-shader";
  import { addRouteLayer } from "./route-layer";
  import { addNodeLayer } from "./node-layer";
  import { addCrawlerLayer } from "./crawler-layer";

  let mapContainer: HTMLDivElement;
  let map: maplibregl.Map;
  let cleanupRoutes: (() => void) | undefined;
  let cleanupNodes: (() => void) | undefined;
  let cleanupCrawler: (() => void) | undefined;
  let loading = $state(true);
  let error = $state<string | null>(null);
  let geologyVisible = $state(false);


  // Geology resource categories (debug overlay)
  const geologyCategories = [
    {
      id: "volcanic",
      label: "Volcanic",
      color: "rgba(200, 80, 40, 0.25)",
      swatch: "rgb(200, 80, 40)",
      units: ["Av", "Ave", "AHv", "Hve", "Nve", "eHv", "lAv", "lAvf", "lHv", "lHvf", "lNv"],
    },
    {
      id: "highland",
      label: "Highland",
      color: "rgba(200, 160, 50, 0.25)",
      swatch: "rgb(200, 160, 50)",
      units: ["HNhu", "Nhe", "Nhu", "eHh", "eNh", "eNhm", "lNh", "mNh", "mNhm"],
    },
    {
      id: "basin",
      label: "Basin / Lowland",
      color: "rgba(60, 120, 200, 0.25)",
      swatch: "rgb(60, 120, 200)",
      units: ["HNb", "eAb", "eHb", "lHb", "lHl", "mAl"],
    },
    {
      id: "polar",
      label: "Polar",
      color: "rgba(80, 200, 200, 0.25)",
      swatch: "rgb(80, 200, 200)",
      units: ["Ap", "Apu", "Hp", "Hpe", "Hpu", "lApc", "lApd"],
    },
    {
      id: "impact",
      label: "Impact",
      color: "rgba(180, 80, 180, 0.25)",
      swatch: "rgb(180, 80, 180)",
      units: ["AHi"],
    },
    {
      id: "transition",
      label: "Transition",
      color: "rgba(140, 140, 100, 0.25)",
      swatch: "rgb(140, 140, 100)",
      units: ["HNt", "Ht", "Hto", "Htu", "AHtu", "eHt", "lHt", "ANa", "Aa", "lAa"],
    },
  ] as const;

  const geologyLayerIds = geologyCategories.map(c => `geology-${c.id}`);

  function toggleGeology() {
    geologyVisible = !geologyVisible;
    if (!map) return;
    const visibility = geologyVisible ? "visible" : "none";
    for (const id of geologyLayerIds) {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, "visibility", visibility);
      }
    }
  }

  onMount(() => {
    const protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);

    // GPU-rendered stepped hillshade from raw DEM tiles
    const demHttpUrl = `${window.location.origin}/data/mars-terrain.pmtiles`;
    const terrain = createTerrainShaderProtocol({ demUrl: demHttpUrl });
    maplibregl.addProtocol(terrain.protocolId, terrain.handler);

    map = new maplibregl.Map({
      container: mapContainer,
      style: {
        version: 8,
        name: "Mars",
        sources: {
          // GPU-rendered stepped hillshade
          "terrain-shader": {
            type: "raster",
            tiles: [terrain.tileUrl],
            tileSize: 512,
            maxzoom: 7,
          },
          // DEM source for 3D terrain
          "terrain-dem": {
            type: "raster-dem",
            url: "pmtiles:///data/mars-terrain.pmtiles",
            tileSize: 512,
            encoding: "terrarium",
          },
          // Pre-built vector contour lines from MOLA data
          contours: {
            type: "vector",
            url: "pmtiles:///data/mars-contours.pmtiles",
          },
        },
        transition: {
          duration: 500,
          delay: 0,
        },
        layers: [
          {
            id: "background",
            type: "background",
            paint: { "background-color": "#0a0a0a" },
          },
          {
            id: "terrain",
            type: "raster",
            source: "terrain-shader",
            paint: {
              "raster-opacity": 0,
            },
          },
          // Contour lines — major (2000m), visible from zoom 0
          {
            id: "contour-major",
            type: "line",
            source: "contours",
            "source-layer": "contours",
            filter: ["==", ["get", "class"], "major"],
            paint: {
              "line-color": "rgba(255, 255, 255, 0.75)",
              "line-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.25, 3, 1],
              "line-width": ["interpolate", ["linear"], ["zoom"], 0, 1, 4, 1, 6, 1.5, 10, 2],
            },
          },
          // Contour lines — mid (500m), visible from zoom 4
          {
            id: "contour-mid",
            type: "line",
            source: "contours",
            "source-layer": "contours",
            filter: ["==", ["get", "class"], "mid"],
            minzoom: 3,
            paint: {
              "line-color": "rgba(255, 255, 255, 0.75)",
              "line-opacity": ["interpolate", ["linear"], ["zoom"], 3, 0, 4, 1],
              "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.3, 8, 1, 10, 1.5],
            },
          },
          // Contour lines — minor (100m), visible from zoom 6
          {
            id: "contour-minor",
            type: "line",
            source: "contours",
            "source-layer": "contours",
            filter: ["==", ["get", "class"], "minor"],
            minzoom: 5,
            paint: {
              "line-color": "rgba(255, 255, 255, 0.75)",
              "line-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0, 6, 1],
              "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.2, 8, 0.5, 10, 1],
            },
          },
          // Elevation labels — major (2000m)
          {
            id: "contour-labels-major",
            type: "symbol",
            source: "contours",
            "source-layer": "contours",
            filter: ["==", ["get", "class"], "major"],
            minzoom: 3,
            layout: {
              "symbol-placement": "line",
              "text-field": ["concat", ["to-string", ["get", "elevation"]], "m"],
              "text-font": ["Open Sans Regular"],
              "text-size": 10,
              "text-max-angle": 30,
              "symbol-spacing": 250,
            },
            paint: {
              "text-color": "#FFFFFF",
              "text-halo-color": "#0a0a0a",
              "text-halo-width": 1.5,
            },
          },
          // Elevation labels — mid (500m)
          {
            id: "contour-labels-mid",
            type: "symbol",
            source: "contours",
            "source-layer": "contours",
            filter: ["==", ["get", "class"], "mid"],
            minzoom: 6,
            layout: {
              "symbol-placement": "line",
              "text-field": ["concat", ["to-string", ["get", "elevation"]], "m"],
              "text-font": ["Open Sans Regular"],
              "text-size": 10,
              "text-max-angle": 30,
              "symbol-spacing": 250,
            },
            paint: {
              "text-color": "#FFFFFF",
              "text-halo-color": "#0a0a0a",
              "text-halo-width": 1.5,
            },
          },
          // Elevation labels — minor (100m)
          {
            id: "contour-labels-minor",
            type: "symbol",
            source: "contours",
            "source-layer": "contours",
            filter: ["==", ["get", "class"], "minor"],
            minzoom: 8,
            layout: {
              "symbol-placement": "line",
              "text-field": ["concat", ["to-string", ["get", "elevation"]], "m"],
              "text-font": ["Open Sans Regular"],
              "text-size": 9,
              "text-max-angle": 30,
              "symbol-spacing": 300,
            },
            paint: {
              "text-color": "#FFFFFF",
              "text-halo-color": "#0a0a0a",
              "text-halo-width": 1.5,
            },
          },
        ],
      },
      center: [0, 0],
      zoom: 3,
      pitch: 0,
      maxPitch: 85,
      minZoom: 0,
      maxZoom: 14,
      renderWorldCopies: false,
      attributionControl: false,
      localFontFamily: "monospace",
    });

    map.scrollZoom.setZoomRate(1 / 600);

    map.on("style.load", async () => {
      map.setProjection({ type: "globe" });
      map.setSky({});
      map.setTerrain({ source: "terrain-dem", exaggeration: 1 });

      // Load nomenclature data and convert east longitude (0–360) to standard (-180–180)
      try {
        const res = await fetch("/data/mars-nomenclature.json");
        if (res.ok) {
          const nomenclature = await res.json();

          map.addSource("nomenclature", {
            type: "geojson",
            data: nomenclature,
          });

          // Major regions — terra, planitia, vastitas (zoom 0+)
          map.addLayer({
            id: "nomenclature-regions",
            type: "symbol",
            source: "nomenclature",
            filter: ["in", ["get", "type"],
              ["literal", ["Terra, terrae", "Planitia, planitiae", "Vastitas, vastitates"]]
            ],
            minzoom: 2,
            layout: {
              "text-field": ["get", "name"],
              "text-font": ["Open Sans Regular"],
              "text-size": ["interpolate", ["linear"], ["zoom"], 2, 11, 6, 16],
              "text-letter-spacing": 0.2,
              "text-transform": "uppercase",
              "text-allow-overlap": false,
            },
            paint: {
              "text-color": "rgba(255, 255, 255, 0.5)",
              "text-halo-color": "#0a0a0a",
              "text-halo-width": 1.5,
            },
          });

          // Medium features — planum, chasma, mons, vallis, chaos (zoom 4+)
          map.addLayer({
            id: "nomenclature-features",
            type: "symbol",
            source: "nomenclature",
            filter: ["in", ["get", "type"],
              ["literal", [
                "Planum, plana", "Chasma, chasmata", "Mons, montes",
                "Vallis, valles", "Chaos, chaoses", "Patera, paterae",
                "Labyrinthus, labyrinthi", "Tholus, tholi",
              ]]
            ],
            minzoom: 4,
            layout: {
              "text-field": ["get", "name"],
              "text-font": ["Open Sans Regular"],
              "text-size": ["interpolate", ["linear"], ["zoom"], 4, 9, 8, 13],
              "text-allow-overlap": false,
            },
            paint: {
              "text-color": "rgba(255, 255, 255, 0.4)",
              "text-halo-color": "#0a0a0a",
              "text-halo-width": 1,
            },
          });

          // Craters and small features (zoom 7+)
          map.addLayer({
            id: "nomenclature-craters",
            type: "symbol",
            source: "nomenclature",
            filter: ["==", ["get", "type"], "Crater, craters"],
            minzoom: 7,
            layout: {
              "text-field": ["get", "name"],
              "text-font": ["Open Sans Regular"],
              "text-size": ["interpolate", ["linear"], ["zoom"], 7, 8, 10, 11],
              "text-allow-overlap": false,
            },
            paint: {
              "text-color": "rgba(255, 255, 255, 0.3)",
              "text-halo-color": "#0a0a0a",
              "text-halo-width": 1,
            },
          });
        }
      } catch (e) {
        console.warn("Nomenclature data not available:", e);
      }

      // Geology overlay from PMTiles
      try {
        map.addSource("geology", {
          type: "vector",
          url: "pmtiles:///data/mars-geology.pmtiles",
        });

        for (const cat of geologyCategories) {
          map.addLayer(
            {
              id: `geology-${cat.id}`,
              type: "fill",
              source: "geology",
              "source-layer": "geology",
              filter: ["in", ["get", "unit"], ["literal", cat.units]],
              layout: { visibility: "none" },
              paint: {
                "fill-color": cat.color,
                "fill-outline-color": "transparent",
              },
            },
            "contour-major", // insert below contour lines
          );
        }
      } catch (e) {
        console.warn("Geology data not available:", e);
      }

      // Routes first (render below nodes), then node markers, then crawler on top
      cleanupRoutes = addRouteLayer(map);
      cleanupNodes = addNodeLayer(map);
      cleanupCrawler = addCrawlerLayer(map);

      loading = false;
    });

    map.on("error", (e) => {
      const msg = e.error?.message || "";
      if (msg.includes("pmtiles") || msg.includes("404")) {
        error = "Map data not found. Run: pnpm build:contours && pnpm build:terrain";
      }
    });

    return () => {
      cleanupCrawler?.();
      cleanupNodes?.();
      cleanupRoutes?.();
      map.remove();
      maplibregl.removeProtocol(terrain.protocolId);
      maplibregl.removeProtocol("pmtiles");
    };
  });
</script>

<div class="map-wrapper">
  <div class="map" bind:this={mapContainer}></div>

  {#if loading}
    <div class="overlay">
      <span class="loading-text">LOADING TERRAIN DATA...</span>
    </div>
  {/if}

  {#if !loading}
    <button class="geology-toggle" class:active={geologyVisible} onclick={toggleGeology}>
      GEO
    </button>
    {#if geologyVisible}
      <div class="geology-legend">
        {#each geologyCategories as cat}
          <div class="legend-item">
            <span class="legend-swatch" style="background: {cat.swatch}"></span>
            <span class="legend-label">{cat.label}</span>
          </div>
        {/each}
      </div>
    {/if}
  {/if}

  {#if error}
    <div class="overlay error">
      <span>TERRAIN DATA ERROR</span>
      <span class="error-detail">{error}</span>
      <span class="error-hint">Run: npm run build:terrain</span>
    </div>
  {/if}
</div>

<style>
  .map-wrapper {
    position: absolute;
    inset: 0;
  }

  .map {
    position: absolute;
    inset: 0;
    background: #0a0a0a;
  }

  .map :global(.maplibregl-canvas) {
    outline: none;
  }

  .map :global(.maplibregl-ctrl-group) {
    background: #1a1a1a;
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  .map :global(.maplibregl-ctrl-group button) {
    background: #1a1a1a;
    color: rgba(255, 255, 255, 0.7);
  }

  .map :global(.maplibregl-ctrl-group button:hover) {
    background: #2a2a2a;
  }

  .map :global(.maplibregl-ctrl-group button + button) {
    border-top-color: rgba(255, 255, 255, 0.15);
  }

  .geology-toggle {
    position: absolute;
    bottom: 16px;
    left: 16px;
    z-index: 100;
    background: #1a1a1a;
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: rgba(255, 255, 255, 0.6);
    font-family: monospace;
    font-size: 11px;
    letter-spacing: 1px;
    padding: 6px 10px;
    cursor: pointer;
  }

  .geology-toggle:hover {
    background: #2a2a2a;
    color: rgba(255, 255, 255, 0.8);
  }

  .geology-toggle.active {
    background: #2a2a2a;
    color: rgba(255, 255, 255, 0.9);
    border-color: rgba(255, 255, 255, 0.4);
  }

  .geology-legend {
    position: absolute;
    bottom: 48px;
    left: 16px;
    z-index: 100;
    background: rgba(20, 20, 20, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.15);
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .legend-swatch {
    width: 10px;
    height: 10px;
    flex-shrink: 0;
  }

  .legend-label {
    font-family: monospace;
    font-size: 10px;
    color: rgba(255, 255, 255, 0.6);
    letter-spacing: 0.5px;
  }

  .overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: rgba(255, 255, 255, 0.6);
    font-family: monospace;
    font-size: 14px;
    letter-spacing: 2px;
    background: rgba(10, 10, 10, 0.9);
    pointer-events: none;
    z-index: 1000;
  }

  .overlay.error {
    color: rgba(255, 80, 80, 0.9);
    pointer-events: auto;
  }

  .error-detail {
    font-size: 12px;
    opacity: 0.7;
    max-width: 400px;
    text-align: center;
  }

  .error-hint {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.4);
    margin-top: 8px;
  }

  .loading-text {
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 0.4;
    }
    50% {
      opacity: 1;
    }
  }
</style>

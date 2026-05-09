<script lang="ts">
  import { onMount } from "svelte";
  import maplibregl from "maplibre-gl";
  import "maplibre-gl/dist/maplibre-gl.css";
  import { Protocol } from "pmtiles";

  let mapContainer: HTMLDivElement;
  let map: maplibregl.Map;
  let loading = $state(true);
  let error = $state<string | null>(null);

  onMount(() => {
    // Register PMTiles protocol handler
    const protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);

    map = new maplibregl.Map({
      container: mapContainer,
      style: {
        version: 8,
        name: "Mars",
        glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
        sources: {
          contours: {
            type: "vector",
            url: "pmtiles:///data/mars-contours.pmtiles",
          },
        },
        layers: [
          // Space background
          {
            id: "background",
            type: "background",
            paint: {
              "background-color": "#0a0a0a",
            },
          },
          // Minor contours (500m) — only at higher zoom
          {
            id: "contour-minor",
            type: "line",
            source: "contours",
            "source-layer": "contours",
            filter: ["==", ["get", "class"], "minor"],
            minzoom: 4,
            paint: {
              "line-color": "rgba(0, 255, 136, 0.15)",
              "line-width": 0.4,
            },
          },
          // Mid contours (1000m)
          {
            id: "contour-mid",
            type: "line",
            source: "contours",
            "source-layer": "contours",
            filter: ["==", ["get", "class"], "mid"],
            minzoom: 2,
            paint: {
              "line-color": "rgba(0, 255, 136, 0.4)",
              "line-width": [
                "interpolate", ["linear"], ["zoom"],
                2, 0.5,
                6, 1.0,
              ],
            },
          },
          // Major contours (2000m) — always visible
          {
            id: "contour-major",
            type: "line",
            source: "contours",
            "source-layer": "contours",
            filter: ["==", ["get", "class"], "major"],
            paint: {
              "line-color": "rgba(0, 255, 136, 0.7)",
              "line-width": [
                "interpolate", ["linear"], ["zoom"],
                0, 0.6,
                3, 1.0,
                6, 1.5,
              ],
            },
          },
          // Elevation labels on major contours at higher zoom
          {
            id: "contour-labels",
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
              "text-color": "rgba(0, 255, 136, 0.6)",
              "text-halo-color": "#0a0a0a",
              "text-halo-width": 1.5,
            },
          },
        ],
      },
      center: [0, 0],
      zoom: 1.5,
      minZoom: 0,
      maxZoom: 6,
      projection: { type: "globe" },
      renderWorldCopies: false,
      attributionControl: false,
    });

    // Disable atmosphere (Earth-tinted by default)
    map.on("style.load", () => {
      map.setSky({});
      loading = false;
    });

    map.on("error", (e) => {
      if (e.error?.message?.includes("pmtiles") || e.error?.message?.includes("contours")) {
        error = "Contour data not found. Run: npm run build:contours";
      }
    });

    return () => {
      map.remove();
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

  {#if error}
    <div class="overlay error">
      <span>TERRAIN DATA ERROR</span>
      <span class="error-detail">{error}</span>
      <span class="error-hint">Run: npm run build:contours</span>
    </div>
  {/if}
</div>

<style>
  .map-wrapper {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .map {
    width: 100%;
    height: 100%;
    background: #0a0a0a;
  }

  /* Override MapLibre defaults */
  .map :global(.maplibregl-canvas) {
    outline: none;
  }

  .map :global(.maplibregl-ctrl-group) {
    background: #1a1a1a;
    border: 1px solid rgba(0, 255, 136, 0.3);
  }

  .map :global(.maplibregl-ctrl-group button) {
    background: #1a1a1a;
    color: rgba(0, 255, 136, 0.8);
  }

  .map :global(.maplibregl-ctrl-group button:hover) {
    background: #2a2a2a;
  }

  .map :global(.maplibregl-ctrl-group button + button) {
    border-top-color: rgba(0, 255, 136, 0.2);
  }

  .overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: rgba(0, 255, 136, 0.7);
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
    color: rgba(0, 255, 136, 0.5);
    margin-top: 8px;
  }

  .loading-text {
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 1; }
  }
</style>

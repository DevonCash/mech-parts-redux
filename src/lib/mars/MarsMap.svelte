<script lang="ts">
  import { onMount } from "svelte";
  import maplibregl from "maplibre-gl";
  import "maplibre-gl/dist/maplibre-gl.css";

  let mapContainer: HTMLDivElement;
  let map: maplibregl.Map;
  let loading = $state(true);
  let error = $state<string | null>(null);

  onMount(() => {
    map = new maplibregl.Map({
      container: mapContainer,
      style: {
        version: 8,
        name: "Mars",
        glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
        sources: {},
        layers: [
          {
            id: "background",
            type: "background",
            paint: { "background-color": "#0a0a0a" },
          },
        ],
      },
      center: [0, 0],
      zoom: 1.5,
      minZoom: 0,
      maxZoom: 6,
      renderWorldCopies: false,
      attributionControl: false,
    });

    map.on("style.load", async () => {
      map.setProjection({ type: "globe" });
      map.setSky({});

      try {
        // Load contour GeoJSON
        const res = await fetch("/data/mars-contours.json");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const geojson = await res.json();

        map.addSource("contours", {
          type: "geojson",
          data: geojson,
        });

        // Minor contours (500m) — higher zoom only
        map.addLayer({
          id: "contour-minor",
          type: "line",
          source: "contours",
          filter: ["==", ["get", "class"], "minor"],
          minzoom: 4,
          paint: {
            "line-color": "rgba(255, 255, 255, 0.15)",
            "line-width": 0.4,
          },
        });

        // Mid contours (1000m)
        map.addLayer({
          id: "contour-mid",
          type: "line",
          source: "contours",
          filter: ["==", ["get", "class"], "mid"],
          minzoom: 2,
          paint: {
            "line-color": "rgba(255, 255, 255, 0.35)",
            "line-width": [
              "interpolate", ["linear"], ["zoom"],
              2, 0.5,
              6, 1.0,
            ],
          },
        });

        // Major contours (2000m) — always visible
        map.addLayer({
          id: "contour-major",
          type: "line",
          source: "contours",
          filter: ["==", ["get", "class"], "major"],
          paint: {
            "line-color": "rgba(255, 255, 255, 0.6)",
            "line-width": [
              "interpolate", ["linear"], ["zoom"],
              0, 0.6,
              3, 1.0,
              6, 1.5,
            ],
          },
        });

        // Elevation labels on major contours
        map.addLayer({
          id: "contour-labels",
          type: "symbol",
          source: "contours",
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
            "text-color": "rgba(255, 255, 255, 0.5)",
            "text-halo-color": "#0a0a0a",
            "text-halo-width": 1.5,
          },
        });

        loading = false;
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
        loading = false;
      }
    });

    return () => {
      map.remove();
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
    0%, 100% { opacity: 0.4; }
    50% { opacity: 1; }
  }
</style>

<script lang="ts">
  import { onMount } from "svelte";
  import * as THREE from "three";
  import { OrbitControls } from "three/addons/controls/OrbitControls.js";
  import { PMTiles } from "pmtiles";

  let container: HTMLDivElement;
  let loading = $state(true);
  let error = $state<string | null>(null);
  let loadProgress = $state(0);

  // ── Shader source ────────────────────────────────────────────────────────

  const vertexShader = `
    varying vec2 vUv;
    void main() {
      // Flip V: Three.js sphere has v=0 at south pole, but tile atlas has y=0 at north
      vUv = vec2(uv.x, 1.0 - uv.y);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const fragmentShader = `
    precision highp float;

    uniform sampler2D u_dem;
    uniform vec2 u_atlasSize;
    uniform float u_azimuth;
    uniform float u_sinAlt;
    uniform float u_cosAlt;
    uniform float u_steps;
    uniform float u_minBright;
    uniform float u_maxBright;
    uniform float u_contourInterval;
    uniform float u_contourBright;

    varying vec2 vUv;

    const float PI = 3.14159265359;

    // Convert sphere UV to mercator-corrected atlas UV
    vec2 toMerc(vec2 sphereUv) {
      float lat = PI * (0.5 - sphereUv.y);
      float maxLat = atan(sinh(PI));
      lat = clamp(lat, -maxLat, maxLat);
      float mercY = 0.5 - log(tan(PI / 4.0 + lat / 2.0)) / (2.0 * PI);
      return vec2(sphereUv.x, mercY);
    }

    // Bicubic interpolation via 4 bilinear taps (GPU Gems 2, Ch. 20)
    // Uses Catmull-Rom weights for C2-smooth interpolation
    vec4 textureBicubic(vec2 uv) {
      vec2 texSize = u_atlasSize;
      vec2 invTex = 1.0 / texSize;
      vec2 p = uv * texSize - 0.5;
      vec2 i = floor(p);
      vec2 f = fract(p);

      // Catmull-Rom weights
      vec2 f2 = f * f;
      vec2 f3 = f2 * f;
      vec2 w0 = -0.5 * f3 + f2 - 0.5 * f;
      vec2 w1 =  1.5 * f3 - 2.5 * f2 + 1.0;
      vec2 w2 = -1.5 * f3 + 2.0 * f2 + 0.5 * f;
      vec2 w3 =  0.5 * f3 - 0.5 * f2;

      // Combine into 4 bilinear taps
      vec2 s0 = w0 + w1;
      vec2 s1 = w2 + w3;
      vec2 f0 = w1 / s0;
      vec2 f1 = w3 / s1;

      vec2 t0 = (i - 1.0 + f0 + 0.5) * invTex;
      vec2 t1 = (i + 1.0 + f1 + 0.5) * invTex;

      return
        (texture2D(u_dem, vec2(t0.x, t0.y)) * s0.x +
         texture2D(u_dem, vec2(t1.x, t0.y)) * s1.x) * s0.y +
        (texture2D(u_dem, vec2(t0.x, t1.y)) * s0.x +
         texture2D(u_dem, vec2(t1.x, t1.y)) * s1.x) * s1.y;
    }

    // Decode terrarium: elevation = (R*256 + G + B/256) - 32768
    float decodeElevation(vec2 sphereUv) {
      vec4 c = textureBicubic(toMerc(sphereUv));
      return (c.r * 255.0 * 256.0 + c.g * 255.0 + c.b * 255.0 / 256.0) - 32768.0;
    }

    void main() {
      float mc = decodeElevation(vUv);

      // Smooth contour lines via fwidth distance-to-isoline
      float d = mod(mc + u_contourInterval * 0.5, u_contourInterval) - u_contourInterval * 0.5;
      float fw = max(fwidth(mc), 0.001);
      float pixelDist = abs(d) / fw;
      float contour = 1.0 - smoothstep(0.0, 1.5, pixelDist);

      float brightness = mix(0.0, u_contourBright, contour);
      gl_FragColor = vec4(brightness, brightness, brightness, 1.0);
    }
  `;

  // ── Tile loading ─────────────────────────────────────────────────────────

  const TILE_ZOOM = 3;
  const TILES_PER_SIDE = 1 << TILE_ZOOM; // 8
  const TILE_SIZE = 512;
  const ATLAS_SIZE = TILES_PER_SIDE * TILE_SIZE; // 4096

  async function loadAtlas(pmtiles: PMTiles): Promise<HTMLCanvasElement> {
    const canvas = document.createElement("canvas");
    canvas.width = ATLAS_SIZE;
    canvas.height = ATLAS_SIZE;
    const ctx = canvas.getContext("2d")!;

    const totalTiles = TILES_PER_SIDE * TILES_PER_SIDE;
    let loaded = 0;

    // Load all tiles at this zoom level
    const promises: Promise<void>[] = [];
    for (let y = 0; y < TILES_PER_SIDE; y++) {
      for (let x = 0; x < TILES_PER_SIDE; x++) {
        promises.push(
          (async () => {
            try {
              const tile = await pmtiles.getZxy(TILE_ZOOM, x, y);
              if (tile?.data) {
                const blob = new Blob([tile.data], { type: "image/png" });
                const bitmap = await createImageBitmap(blob);
                ctx.drawImage(bitmap, x * TILE_SIZE, y * TILE_SIZE);
                bitmap.close();
              }
            } catch {
              // Missing tile — leave black
            }
            loaded++;
            loadProgress = Math.round((loaded / totalTiles) * 100);
          })(),
        );
      }
    }
    await Promise.all(promises);
    return canvas;
  }

  // ── Scene setup ──────────────────────────────────────────────────────────

  onMount(() => {
    const pmtiles = new PMTiles(
      `${window.location.origin}/data/mars-terrain.pmtiles`,
    );

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x0a0a0a);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0, 3);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.zoomSpeed = 0.8;
    controls.minDistance = 1.05;
    controls.maxDistance = 10;
    controls.enablePan = false;

    const azimuth = 315;
    const altitude = 45;
    const azRad = ((360 - azimuth + 90) * Math.PI) / 180;
    const altRad = (altitude * Math.PI) / 180;

    const uniforms = {
      u_dem: { value: null as THREE.Texture | null },
      u_atlasSize: { value: new THREE.Vector2(ATLAS_SIZE, ATLAS_SIZE) },
      u_azimuth: { value: azRad },
      u_sinAlt: { value: Math.sin(altRad) },
      u_cosAlt: { value: Math.cos(altRad) },
      u_steps: { value: 6.0 },
      u_minBright: { value: 0.0 },
      u_maxBright: { value: 0.2 },
      u_contourInterval: { value: 25.0 },
      u_contourBright: { value: 1.0 },
    };

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
    });

    // Sphere: 64 segments is enough for smooth globe, UV maps to equirectangular
    const geometry = new THREE.SphereGeometry(1, 128, 64);
    const globe = new THREE.Mesh(geometry, material);
    scene.add(globe);

    // Resize handler
    function resize() {
      const w = container.clientWidth;
      const h = container.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    // Animation loop
    let animId: number;
    function animate() {
      animId = requestAnimationFrame(animate);
      // Scale rotate speed with distance: fast when zoomed out, slow when close
      const dist = camera.position.length();
      controls.rotateSpeed = Math.max(0.02, (dist - 1.0) / 2.0);
      // Keep near plane just inside the gap between camera and surface
      camera.near = Math.max(0.001, (dist - 1.0) * 0.5);
      camera.updateProjectionMatrix();
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    // Load DEM atlas
    loadAtlas(pmtiles)
      .then((atlasCanvas) => {
        const texture = new THREE.CanvasTexture(atlasCanvas);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        uniforms.u_dem.value = texture;
        loading = false;
      })
      .catch((e) => {
        error = `Failed to load terrain: ${e.message}`;
      });

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      container.removeChild(renderer.domElement);
    };
  });
</script>

<div class="globe-wrapper">
  <div class="globe" bind:this={container}></div>

  {#if loading}
    <div class="overlay">
      <span class="loading-text">LOADING TERRAIN {loadProgress}%</span>
    </div>
  {/if}

  {#if error}
    <div class="overlay error">
      <span>TERRAIN ERROR</span>
      <span class="error-detail">{error}</span>
    </div>
  {/if}
</div>

<style>
  .globe-wrapper {
    position: absolute;
    inset: 0;
  }

  .globe {
    position: absolute;
    inset: 0;
    background: #0a0a0a;
  }

  .globe :global(canvas) {
    outline: none;
    display: block;
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

/**
 * Custom MapLibre protocol that renders stepped hillshade + minor contour
 * lines from raw terrarium-encoded DEM tiles using WebGL on an OffscreenCanvas.
 *
 * Fetches DEM PNGs directly from PMTiles — bypasses the contour worker entirely.
 * All per-pixel math (elevation decoding, Horn's method, quantization, contour
 * detection) runs in a single fragment shader pass.
 */

import { PMTiles } from "pmtiles";

interface TerrainShaderOptions {
  /** HTTP URL for the DEM PMTiles file, e.g. "http://localhost/data/mars-terrain.pmtiles" */
  demUrl: string;
  /** Max zoom level of the DEM tileset (default: 7) */
  maxzoom?: number;
  /** Light direction in degrees clockwise from north (default: 315) */
  azimuth?: number;
  /** Light altitude in degrees above horizon (default: 45) */
  altitude?: number;
  /** Number of discrete hillshade brightness bands (default: 6) */
  steps?: number;
  /** Darkest hillshade value 0–1 (default: 0) */
  minBrightness?: number;
  /** Brightest hillshade value 0–1 (default: 0.2) */
  maxBrightness?: number;
}

// ── GLSL ────────────────────────────────────────────────────────────────────

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  // Flip Y so readPixels (bottom-to-top) produces correct ImageData (top-to-bottom)
  v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;

uniform sampler2D u_dem;
uniform vec2 u_texSize;      // DEM texture dimensions
uniform float u_azimuth;     // radians, math convention
uniform float u_sinAlt;
uniform float u_cosAlt;
uniform float u_steps;
uniform float u_minBright;
uniform float u_maxBright;
in vec2 v_uv;
out vec4 fragColor;

// Decode terrarium encoding: elevation = (R*256 + G + B/256) - 32768
// texture() returns normalized [0,1] values, so multiply by 255 to get byte values
float decodeElevation(vec2 uv) {
  vec4 c = texture(u_dem, uv);
  return (c.r * 255.0 * 256.0 + c.g * 255.0 + c.b * 255.0 / 256.0) - 32768.0;
}

void main() {
  vec2 px = 1.0 / u_texSize;  // one pixel in UV space

  // Sample 3x3 neighborhood for Horn's method
  float tl = decodeElevation(v_uv + vec2(-px.x, -px.y));
  float tc = decodeElevation(v_uv + vec2(  0.0, -px.y));
  float tr = decodeElevation(v_uv + vec2( px.x, -px.y));
  float ml = decodeElevation(v_uv + vec2(-px.x,   0.0));
  float mc = decodeElevation(v_uv);
  float mr = decodeElevation(v_uv + vec2( px.x,   0.0));
  float bl = decodeElevation(v_uv + vec2(-px.x,  px.y));
  float bc = decodeElevation(v_uv + vec2(  0.0,  px.y));
  float br = decodeElevation(v_uv + vec2( px.x,  px.y));

  // Horn's method
  float dzdx = (tr + 2.0*mr + br - tl - 2.0*ml - bl) / 8.0;
  float dzdy = (bl + 2.0*bc + br - tl - 2.0*tc - tr) / 8.0;

  float slope = atan(sqrt(dzdx*dzdx + dzdy*dzdy));
  float aspect = atan(dzdy, -dzdx);

  float shade = u_sinAlt * cos(slope)
              + u_cosAlt * sin(slope) * cos(u_azimuth - aspect);
  shade = clamp(shade, 0.0, 1.0);

  // Quantize into discrete bands
  float stepped = floor(shade * u_steps) / u_steps;
  float brightness = u_minBright + stepped * (u_maxBright - u_minBright);

  fragColor = vec4(brightness, brightness, brightness, 1.0);
}`;

// ── WebGL setup (reused across tiles) ───────────────────────────────────────

let _gl: WebGL2RenderingContext | null = null;
let _program: WebGLProgram | null = null;
let _vao: WebGLVertexArrayObject | null = null;
let _fbo: WebGLFramebuffer | null = null;
let _canvas: OffscreenCanvas | null = null;
let _uniforms: Record<string, WebGLUniformLocation> = {};

function getGL(size: number) {
  if (_gl && _canvas!.width === size) return _gl;

  _canvas = new OffscreenCanvas(size, size);
  const gl = _canvas.getContext("webgl2", {
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
  })!;

  // Compile shaders
  const vs = gl.createShader(gl.VERTEX_SHADER)!;
  gl.shaderSource(vs, VERT);
  gl.compileShader(vs);
  if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
    throw new Error("Vertex shader: " + gl.getShaderInfoLog(vs));
  }

  const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
  gl.shaderSource(fs, FRAG);
  gl.compileShader(fs);
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    throw new Error("Fragment shader: " + gl.getShaderInfoLog(fs));
  }

  _program = gl.createProgram()!;
  gl.attachShader(_program, vs);
  gl.attachShader(_program, fs);
  gl.linkProgram(_program);
  if (!gl.getProgramParameter(_program, gl.LINK_STATUS)) {
    throw new Error("Program link: " + gl.getProgramInfoLog(_program));
  }

  // Cache uniform locations
  const names = [
    "u_dem", "u_texSize", "u_azimuth", "u_sinAlt", "u_cosAlt",
    "u_steps", "u_minBright", "u_maxBright",
  ];
  _uniforms = {};
  for (const name of names) {
    _uniforms[name] = gl.getUniformLocation(_program, name)!;
  }

  // Full-screen quad
  _vao = gl.createVertexArray()!;
  gl.bindVertexArray(_vao);
  const buf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,  1, -1,  -1, 1,  1, 1,
  ]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(_program, "a_pos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  // Framebuffer for readback
  _fbo = gl.createFramebuffer()!;

  _gl = gl;
  return gl;
}

// ── Protocol factory ────────────────────────────────────────────────────────

export function createTerrainShaderProtocol(options: TerrainShaderOptions) {
  const {
    demUrl,
    maxzoom = 7,
    azimuth = 315,
    altitude = 45,
    steps = 6,
    minBrightness = 0,
    maxBrightness = 0.2,
  } = options;

  const azRad = ((360 - azimuth + 90) * Math.PI) / 180;
  const altRad = (altitude * Math.PI) / 180;
  const sinAlt = Math.sin(altRad);
  const cosAlt = Math.cos(altRad);

  const protocolId = "terrain-shader";
  const tileUrl = `${protocolId}://{z}/{x}/{y}`;

  // Open the PMTiles archive directly — bypasses the contour worker
  const pmtiles = new PMTiles(demUrl);

  const handler = async (
    params: { url: string },
    abortController: AbortController,
  ) => {
    const match = /\/\/(\d+)\/(\d+)\/(\d+)/.exec(params.url);
    if (!match) throw new Error(`Invalid tile URL: ${params.url}`);
    const [, z, x, y] = match.map(Number);

    // Clamp to maxzoom — always fetch the highest-res DEM tile
    const demZ = Math.min(z, maxzoom);

    // When overzoomed, figure out which maxzoom tile contains this tile
    let demX = x;
    let demY = y;
    if (z > maxzoom) {
      const dz = z - maxzoom;
      demX = x >> dz;
      demY = y >> dz;
    }

    // Fetch the raw terrarium PNG directly from PMTiles
    const tileData = await pmtiles.getZxy(demZ, demX, demY);
    if (!tileData || !tileData.data) {
      // Return a transparent tile for missing data
      const empty = new OffscreenCanvas(1, 1);
      const ctx = empty.getContext("2d")!;
      const blob = await empty.convertToBlob({ type: "image/png" });
      return { data: await blob.arrayBuffer() };
    }

    const blob = new Blob([tileData.data], { type: "image/png" });
    const bitmap = await createImageBitmap(blob);
    const size = bitmap.width; // assume square

    // ── WebGL render ──
    const gl = getGL(size);
    gl.useProgram(_program);

    // Upload DEM as texture
    const tex = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    // Flip Y on upload so texture orientation matches UV convention
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    let outW = size;

    // If overzoomed, extract the sub-region from the parent tile
    if (z > maxzoom) {
      const dz = z - maxzoom;
      const subTiles = 1 << dz;
      const subX = x - (demX << dz);
      const subY = y - (demY << dz);
      const subSize = size / subTiles;
      outW = subSize;

      // Crop using OffscreenCanvas 2D
      const cropCanvas = new OffscreenCanvas(subSize, subSize);
      const cropCtx = cropCanvas.getContext("2d")!;
      cropCtx.drawImage(
        bitmap,
        subX * subSize, subY * subSize, subSize, subSize,
        0, 0, subSize, subSize,
      );
      const croppedBitmap = await createImageBitmap(cropCanvas);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, croppedBitmap);
      croppedBitmap.close();
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
    }
    bitmap.close();
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

    // Set uniforms
    gl.uniform1i(_uniforms.u_dem, 0);
    gl.uniform2f(_uniforms.u_texSize, outW, outW);
    gl.uniform1f(_uniforms.u_azimuth, azRad);
    gl.uniform1f(_uniforms.u_sinAlt, sinAlt);
    gl.uniform1f(_uniforms.u_cosAlt, cosAlt);
    gl.uniform1f(_uniforms.u_steps, steps);
    gl.uniform1f(_uniforms.u_minBright, minBrightness);
    gl.uniform1f(_uniforms.u_maxBright, maxBrightness);

    // Render to a texture attached to the FBO
    const outTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, outTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, outW, outW, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, _fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, outTex, 0);

    gl.viewport(0, 0, outW, outW);

    // Re-bind the DEM texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);

    gl.bindVertexArray(_vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Read back pixels
    const pixels = new Uint8Array(outW * outW * 4);
    gl.readPixels(0, 0, outW, outW, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteTexture(tex);
    gl.deleteTexture(outTex);

    // Encode as PNG via 2D canvas
    const outCanvas = new OffscreenCanvas(outW, outW);
    const outCtx = outCanvas.getContext("2d")!;
    const imageData = new ImageData(new Uint8ClampedArray(pixels.buffer), outW, outW);
    outCtx.putImageData(imageData, 0, 0);
    const outBlob = await outCanvas.convertToBlob({ type: "image/png" });
    return { data: await outBlob.arrayBuffer() };
  };

  return { protocolId, tileUrl, handler };
}

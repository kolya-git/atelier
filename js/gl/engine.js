// Ein gemeinsamer WebGL2-Kontext für die ganze App (iPadOS erlaubt nur wenige gleichzeitig).
import { VS, FS_LOOK, FS_ORIENT, FS_PRINT } from './glsl.js';
import { drawScaled, makeCanvas } from '../core/imageio.js';

const T = {
  FLOAT: 0x1406, FLOAT_VEC2: 0x8b50, FLOAT_VEC3: 0x8b51, FLOAT_VEC4: 0x8b52,
  INT: 0x1404, INT_VEC2: 0x8b53, BOOL: 0x8b56, UNSIGNED_INT: 0x1405,
  FLOAT_MAT3: 0x8b5b, SAMPLER_2D: 0x8b5e,
};

export class Engine {
  constructor() {
    this.canvas = makeCanvas(16, 16);
    const gl = this.canvas.getContext('webgl2', {
      alpha: true, premultipliedAlpha: false, antialias: false, depth: false, stencil: false,
      preserveDrawingBuffer: false, powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 wird von diesem Browser nicht unterstützt.');
    this.gl = gl;
    this.programs = new Map();
    this.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    this.maxRB = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
    const vp = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
    this.maxVP = Math.min(vp[0], vp[1]);
    this.vao = gl.createVertexArray();
    this.lost = false;
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.lost = false; this.programs.clear(); this.vao = gl.createVertexArray();
      for (const fn of this.restoreHandlers) fn();
    });
    this.restoreHandlers = new Set();
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.PACK_ALIGNMENT, 1);
  }

  program(key) {
    if (this.programs.has(key)) return this.programs.get(key);
    const src = { look: FS_LOOK, orient: FS_ORIENT, print: FS_PRINT }[key];
    const gl = this.gl;
    const compile = (type, source) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, source);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(sh);
        gl.deleteShader(sh);
        throw new Error('Shader-Fehler (' + key + '): ' + log);
      }
      return sh;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, src));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('Programm-Fehler: ' + gl.getProgramInfoLog(prog));
    const uniforms = new Map();
    const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(prog, i);
      const name = info.name.replace(/\[0\]$/, '');
      uniforms.set(name, { loc: gl.getUniformLocation(prog, info.name), type: info.type, size: info.size });
    }
    const p = { prog, uniforms };
    this.programs.set(key, p);
    return p;
  }

  setUniforms(p, values) {
    const gl = this.gl;
    for (const [name, v] of Object.entries(values)) {
      const u = p.uniforms.get(name);
      if (!u || v == null) continue;
      switch (u.type) {
        case T.FLOAT: u.size > 1 ? gl.uniform1fv(u.loc, v) : gl.uniform1f(u.loc, v); break;
        case T.FLOAT_VEC2: gl.uniform2fv(u.loc, v); break;
        case T.FLOAT_VEC3: gl.uniform3fv(u.loc, v.flat ? v.flat() : v); break;
        case T.FLOAT_VEC4: gl.uniform4fv(u.loc, v); break;
        case T.INT: case T.BOOL: gl.uniform1i(u.loc, v | 0); break;
        case T.UNSIGNED_INT: gl.uniform1ui(u.loc, v >>> 0); break;
        case T.FLOAT_MAT3: gl.uniformMatrix3fv(u.loc, false, v); break;
        default: break;
      }
    }
  }

  /** Textur aus Bild/Canvas. Optional mit Mipmaps (für sauberes Verkleinern). */
  texture(src, { mipmap = true } = {}) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.BROWSER_DEFAULT_WEBGL);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (mipmap) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    } else {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
    return tex;
  }

  /** Float-Textur (RGBA16F) für Helligkeitsfelder. data: Float32Array (RGBA). */
  floatTexture(data, w, h) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.FLOAT, data);
    this._linearClamp();
    return tex;
  }

  /** Einkanal-Textur (R8) – gemalte Maske. */
  r8Texture(data, w, h, tex) {
    const gl = this.gl;
    if (!tex) tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, data);
    this._linearClamp();
    return tex;
  }

  _linearClamp() {
    const gl = this.gl;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }

  deleteTexture(tex) { if (tex) this.gl.deleteTexture(tex); }

  framebuffer(w, h) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
    this._linearClamp();
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!ok) throw new Error('Framebuffer nicht verfügbar');
    return { fb, tex, w, h, dispose: () => { gl.deleteFramebuffer(fb); gl.deleteTexture(tex); } };
  }

  /**
   * Zeichnet ein Vollbild-Dreieck.
   * target: null → eigenes Canvas (Größe w×h), sonst Framebuffer-Objekt.
   */
  draw(key, uniforms, textures, { target = null, w, h }) {
    const gl = this.gl;
    const p = this.program(key);
    if (target) gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
    else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    }
    gl.viewport(0, 0, w, h);
    gl.disable(gl.BLEND);
    gl.useProgram(p.prog);
    let unit = 0;
    for (const [name, tex] of Object.entries(textures || {})) {
      const u = p.uniforms.get(name);
      if (!u) continue;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(u.loc, unit);
      unit++;
    }
    this.setUniforms(p, uniforms);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  read(target, w, h, out) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
    const buf = out || new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return buf;
  }

  /** Kopiert das Ergebnis aus dem WebGL-Canvas in ein sichtbares 2D-Canvas. */
  blitTo(canvas2d) {
    const w = this.canvas.width, h = this.canvas.height;
    if (canvas2d.width !== w || canvas2d.height !== h) { canvas2d.width = w; canvas2d.height = h; }
    const g = canvas2d.getContext('2d');
    g.clearRect(0, 0, w, h);
    g.drawImage(this.canvas, 0, 0);
    return canvas2d;
  }
}

let engine = null;
export function getEngine() {
  if (!engine) engine = new Engine();
  return engine;
}

// ---------- Ausrichtung (EXIF) ----------
// Die 8 möglichen Abbildungen: ausgerichtete UV (u,v) → Textur-UV. Spaltenweise mat3.
const ORIENTS = [
  [1, 0, 0, 0, 1, 0, 0, 0, 1],       // unverändert
  [-1, 0, 0, 0, 1, 0, 1, 0, 1],      // horizontal gespiegelt
  [-1, 0, 0, 0, -1, 0, 1, 1, 1],     // 180°
  [1, 0, 0, 0, -1, 0, 0, 1, 1],      // vertikal gespiegelt
  [0, 1, 0, 1, 0, 0, 0, 0, 1],       // transponiert
  [0, 1, 0, -1, 0, 0, 1, 0, 1],      // 90°
  [0, -1, 0, -1, 0, 0, 1, 1, 1],     // quer gespiegelt
  [0, -1, 0, 1, 0, 0, 0, 1, 1],      // 270°
];
export const IDENTITY_ORIENT = new Float32Array(ORIENTS[0]);

/**
 * Lädt ein Quellbild als Textur (mit Mipmaps) und bestimmt die Ausrichtung robust:
 * Ergebnis wird mit einer Canvas-Referenz verglichen (Canvas beachtet EXIF immer).
 */
export function sourceTexture(eng, img) {
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  let src = img, tw = W, th = H, scaled = false;
  if (Math.max(W, H) > eng.maxTex) {
    src = drawScaled(img, eng.maxTex);
    tw = src.width; th = src.height; scaled = true;
  }
  const tex = eng.texture(src, { mipmap: true });
  let orient = ORIENTS[0], swapped = false;
  if (!scaled && img instanceof HTMLImageElement) {
    const N = 16;
    const ref = drawScaled(drawScaled(img, 256), N, {}).getContext('2d');
    const refCanvas = makeCanvas(N, N);
    refCanvas.getContext('2d').drawImage(ref.canvas, 0, 0, N, N);
    const refData = refCanvas.getContext('2d').getImageData(0, 0, N, N).data;
    const fb = eng.framebuffer(N, N);
    let best = 0, bestErr = Infinity, errId = Infinity;
    for (let k = 0; k < 8; k++) {
      eng.draw('orient', { u_outSize: [N, N], u_tile: [0, 0, N, N], u_flipY: 0, u_orient: new Float32Array(ORIENTS[k]) }, { u_src: tex }, { target: fb, w: N, h: N });
      const px = eng.read(fb, N, N);
      let err = 0;
      for (let i = 0; i < px.length; i += 4) {
        const a = px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11;
        const b = refData[i] * 0.3 + refData[i + 1] * 0.59 + refData[i + 2] * 0.11;
        err += (a - b) * (a - b);
      }
      if (k === 0) errId = err;
      if (err < bestErr) { bestErr = err; best = k; }
    }
    fb.dispose();
    // nur abweichen, wenn eindeutig besser
    if (best !== 0 && bestErr < errId * 0.5) {
      orient = ORIENTS[best];
      swapped = best >= 4;
    }
  }
  if (swapped) { const t = tw; tw = th; th = t; }
  return { tex, texW: tw, texH: th, w: swapped ? th : tw, h: swapped ? tw : th, orient: new Float32Array(orient), dispose: () => eng.deleteTexture(tex) };
}

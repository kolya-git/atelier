// GLSL-Bausteine. Alles prozedural: keine fremden Texturen, keine KI – nur Mathematik.

export const VS = `#version 300 es
const vec2 P[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
void main() { gl_Position = vec4(P[gl_VertexID], 0.0, 1.0); }`;

export const COMMON = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
out vec4 fragColor;

uniform vec2 u_outSize;   // Gesamtgröße der Ausgabe in px
uniform vec4 u_tile;      // x0, y0, Breite, Höhe der aktuellen Kachel (px)
uniform float u_flipY;    // 1 = Bildschirm, 0 = Auslesen (Zeile 0 oben)
uniform uint u_seed;

vec2 outPx() {
  float fy = u_flipY > 0.5 ? (u_tile.w - gl_FragCoord.y) : gl_FragCoord.y;
  return vec2(u_tile.x + gl_FragCoord.x, u_tile.y + fy);
}

uint pcg(uint v) {
  uint state = v * 747796405u + 2891336453u;
  uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}
uint hashI(ivec2 p, uint s) { return pcg(uint(p.x + 1048576) ^ pcg(uint(p.y + 1048576) + pcg(s))); }
float rnd(ivec2 p, uint s) { return float(hashI(p, s)) * 2.3283064e-10; }

vec2 gradDir(ivec2 p, uint s) { float a = rnd(p, s) * 6.2831853; return vec2(cos(a), sin(a)); }
// Gradientenrauschen, Wertebereich etwa -1..1
float gnoise(vec2 x, uint s) {
  vec2 i = floor(x); vec2 f = x - i; ivec2 ii = ivec2(i);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(gradDir(ii, s), f);
  float b = dot(gradDir(ii + ivec2(1, 0), s), f - vec2(1.0, 0.0));
  float c = dot(gradDir(ii + ivec2(0, 1), s), f - vec2(0.0, 1.0));
  float d = dot(gradDir(ii + ivec2(1, 1), s), f - vec2(1.0, 1.0));
  return 1.4142 * mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 x, int oct, uint s) {
  float sum = 0.0, amp = 0.5, norm = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= oct) break;
    sum += amp * gnoise(x, s + uint(i) * 1013u);
    norm += amp;
    x = mat2(1.6, 1.2, -1.2, 1.6) * x + vec2(5.3, 1.7);
    amp *= 0.5;
  }
  return sum / norm;
}

vec3 srgb2lin(vec3 c) { c = max(c, 0.0); return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 lin2srgb(vec3 c) { c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}
vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}
`;

// Abtastung: bikubisch (Mitchell/Catmull-Rom) beim Vergrößern, Flächenmittel beim Verkleinern.
export const SAMPLING = `
uniform sampler2D u_src;
uniform vec2 u_srcSize;
uniform mat3 u_orient;    // ausgerichtete UV → Textur-UV
uniform float u_cubicB;
uniform float u_cubicC;

float bcOuter(float x, float B, float C) { return ((-B - 6.0 * C) * x * x * x + (6.0 * B + 30.0 * C) * x * x + (-12.0 * B - 48.0 * C) * x + (8.0 * B + 24.0 * C)) / 6.0; }
float bcInner(float x, float B, float C) { return ((12.0 - 9.0 * B - 6.0 * C) * x * x * x + (-18.0 + 12.0 * B + 6.0 * C) * x * x + (6.0 - 2.0 * B)) / 6.0; }
vec4 bcW(float t, float B, float C) { return vec4(bcOuter(1.0 + t, B, C), bcInner(t, B, C), bcInner(1.0 - t, B, C), bcOuter(2.0 - t, B, C)); }

vec3 sampleBicubic(vec2 uv) {
  vec2 p = uv * u_srcSize - 0.5;
  vec2 i = floor(p); vec2 f = p - i;
  vec4 wx = bcW(f.x, u_cubicB, u_cubicC), wy = bcW(f.y, u_cubicB, u_cubicC);
  ivec2 base = ivec2(i);
  ivec2 mx = ivec2(u_srcSize) - 1;
  vec3 acc = vec3(0.0);
  for (int y = 0; y < 4; y++) {
    vec3 row = vec3(0.0);
    for (int x = 0; x < 4; x++) {
      ivec2 c = clamp(base + ivec2(x - 1, y - 1), ivec2(0), mx);
      row += texelFetch(u_src, c, 0).rgb * wx[x];
    }
    acc += row * wy[y];
  }
  return acc;
}

// dx/dy: Ableitungen der Textur-UV je Ausgabepixel (vorher berechnet, außerhalb von Verzweigungen)
vec3 sampleSrc(vec2 tuv, vec2 dx, vec2 dy) {
  float m = max(length(dx * u_srcSize), length(dy * u_srcSize));
  if (m <= 1.15) return clamp(sampleBicubic(tuv), 0.0, 1.0);
  if (m <= 4.5) {
    int n = int(ceil(m));
    vec3 acc = vec3(0.0);
    for (int j = 0; j < 5; j++) {
      if (j >= n) break;
      for (int i = 0; i < 5; i++) {
        if (i >= n) break;
        vec2 o = (vec2(float(i), float(j)) + 0.5) / float(n) - 0.5;
        acc += textureLod(u_src, tuv + dx * o.x + dy * o.y, 0.0).rgb;
      }
    }
    return acc / float(n * n);
  }
  return textureGrad(u_src, tuv, dx, dy).rgb;
}

// Glatte B-Spline-Abtastung (für Helligkeitsfelder → weiche, „natürliche“ Linien)
vec4 sampleBS(sampler2D tex, vec2 uv, vec2 size) {
  vec2 p = uv * size - 0.5;
  vec2 i = floor(p); vec2 f = p - i;
  vec2 f2 = f * f, f3 = f2 * f;
  vec2 w0 = (-f3 + 3.0 * f2 - 3.0 * f + 1.0) / 6.0;
  vec2 w1 = (3.0 * f3 - 6.0 * f2 + 4.0) / 6.0;
  vec2 w2 = (-3.0 * f3 + 3.0 * f2 + 3.0 * f + 1.0) / 6.0;
  vec2 w3 = f3 / 6.0;
  vec2 g0 = w0 + w1, g1 = w2 + w3;
  vec2 h0 = (i - 0.5 + w1 / g0) / size;
  vec2 h1 = (i + 1.5 + w3 / g1) / size;
  vec4 t00 = textureLod(tex, vec2(h0.x, h0.y), 0.0);
  vec4 t10 = textureLod(tex, vec2(h1.x, h0.y), 0.0);
  vec4 t01 = textureLod(tex, vec2(h0.x, h1.y), 0.0);
  vec4 t11 = textureLod(tex, vec2(h1.x, h1.y), 0.0);
  return g0.y * (g0.x * t00 + g1.x * t10) + g1.y * (g0.x * t01 + g1.x * t11);
}
`;

// Farb-Look: natürliche, filmnahe Abstimmung. Wird von Planer, Stories und Druck genutzt.
export const LOOK = `
uniform float u_exposure;
uniform vec3 u_wbGain;
uniform float u_contrast;
uniform float u_pivot;
uniform float u_highlights;
uniform float u_shadows;
uniform float u_whites;
uniform float u_blacks;
uniform float u_fade;
uniform float u_rolloff;
uniform float u_saturation;
uniform float u_vibrance;
uniform vec3 u_hslOrange;
uniform vec3 u_hslYellow;
uniform vec3 u_hslGreen;
uniform vec3 u_hslBlue;
uniform vec3 u_shadowTint;
uniform vec3 u_highlightTint;
uniform float u_tintBalance;
uniform float u_mono;
uniform vec3 u_monoMix;
uniform float u_vignette;
uniform float u_grain;
uniform float u_grainSize;
uniform vec3 u_hGain;
uniform float u_hExposure;
uniform float u_hContrast;
uniform float u_hPivot;
uniform float u_hSat;

float softClip(float x, float k) {
  float t = 1.0 - 0.32 * k;
  if (x <= t) return x;
  float r = 1.0 - t;
  return t + r * (1.0 - exp(-(x - t) / r));
}
float contrastCurve(float x, float c) {
  x = clamp(x, 0.0, 1.0);
  float p = u_pivot;
  float e = 1.0 + c * 0.85;
  if (x < p) return p * pow(x / p, e);
  return 1.0 - (1.0 - p) * pow((1.0 - x) / (1.0 - p), e);
}
float toneCh(float x) {
  float xs = clamp(x, 0.0, 1.0);
  float bs = xs * (1.0 - xs) * (1.0 - xs) * 6.75;
  float bh = xs * xs * (1.0 - xs) * 6.75;
  x += 0.13 * u_shadows * bs + 0.13 * u_highlights * bh;
  x += 0.07 * u_blacks * pow(1.0 - xs, 4.0) + 0.07 * u_whites * pow(xs, 4.0);
  return contrastCurve(x, u_contrast);
}
float bandW(float h, float c, float w) {
  float d = abs(fract(h - c + 0.5) - 0.5);
  float t = clamp(d / w, 0.0, 1.0);
  return 0.5 + 0.5 * cos(3.14159265 * t);
}

// vuv: Position im Bildausschnitt (0..1) für die Vignette; gq: Kornkoordinate; ga: Kornsichtbarkeit
vec3 applyLook(vec3 srgb, vec2 vuv, float aspect, vec2 gq, float ga) {
  vec3 lin = srgb2lin(srgb);
  lin *= u_hGain * exp2(u_hExposure);
  lin *= u_wbGain * exp2(u_exposure);
  lin = vec3(softClip(lin.r, u_rolloff), softClip(lin.g, u_rolloff), softClip(lin.b, u_rolloff));
  vec3 g = lin2srgb(lin);
  g = (g - u_hPivot) * u_hContrast + u_hPivot;
  g = vec3(toneCh(g.r), toneCh(g.g), toneCh(g.b));
  g = clamp(g, 0.0, 1.0);

  // Farbbereiche (Hauttöne, Gelb, Grün, Blau)
  vec3 hsv = rgb2hsv(g);
  float satGate = smoothstep(0.04, 0.22, hsv.y);
  float wO = bandW(hsv.x, 0.075, 0.075) * satGate;
  float wY = bandW(hsv.x, 0.155, 0.065) * satGate;
  float wG = bandW(hsv.x, 0.31, 0.12) * satGate;
  float wB = bandW(hsv.x, 0.60, 0.11) * satGate;
  vec3 dsum = u_hslOrange * wO + u_hslYellow * wY + u_hslGreen * wG + u_hslBlue * wB;
  hsv.x = fract(hsv.x + dsum.x);
  hsv.y = clamp(hsv.y * (1.0 + dsum.y), 0.0, 1.0);
  hsv.z = clamp(hsv.z * (1.0 + 0.35 * dsum.z), 0.0, 1.0);
  g = hsv2rgb(hsv);

  float l = luma(g);
  float sat = max(g.r, max(g.g, g.b)) - min(g.r, min(g.g, g.b));
  float vib = u_vibrance * (1.0 - sat) * (1.0 - sat) * (1.0 - 0.6 * wO);
  g = mix(vec3(l), g, max(0.0, (1.0 + u_saturation) * (1.0 + vib) * u_hSat));

  // Schwarzweiß
  float m = dot(g, u_monoMix);
  g = mix(g, vec3(m), u_mono);

  // Teiltonung
  float lt = luma(g);
  float ws = 1.0 - smoothstep(0.0, 0.55 + 0.25 * u_tintBalance, lt);
  float wh = smoothstep(0.45 + 0.25 * u_tintBalance, 1.0, lt);
  g += u_shadowTint * ws + u_highlightTint * wh;

  // matte Tiefen
  g = u_fade + g * (1.0 - u_fade);

  // Vignette (sehr zurückhaltend)
  vec2 d = (vuv - 0.5) * 2.0 * vec2(aspect, 1.0) / length(vec2(aspect, 1.0));
  g *= 1.0 - u_vignette * 0.38 * smoothstep(0.25, 1.05, length(d));

  // Filmkorn: klumpig, in den Mitteltönen am stärksten
  if (u_grain > 0.0) {
    float n = gnoise(gq, u_seed + 9001u) * 0.62 + gnoise(gq * 2.13 + 7.1, u_seed + 9002u) * 0.38;
    float lc = clamp(luma(g), 0.0, 1.0);
    float w = 0.3 + 2.8 * lc * (1.0 - lc);
    vec3 chroma = vec3(gnoise(gq * 1.7 + 3.3, u_seed + 9003u), 0.0, gnoise(gq * 1.7 + 8.9, u_seed + 9004u)) * 0.18;
    g += (vec3(n) + chroma) * u_grain * 0.085 * w * ga;
  }
  return clamp(g, 0.0, 1.0);
}
`;

// ---------- Programm: Bildausschnitt mit Look (Planer, Stories) ----------
export const FS_LOOK = COMMON + SAMPLING + LOOK + `
uniform vec4 u_crop;      // ausgerichtete UV des Ausschnitts (x0, y0, x1, y1)
uniform float u_lookOn;
void main() {
  vec2 px = outPx();
  vec2 uv = px / u_outSize;
  vec2 ouv = clamp(mix(u_crop.xy, u_crop.zw, uv), 0.0, 1.0);
  vec2 tuv = (u_orient * vec3(ouv, 1.0)).xy;
  vec2 dx = dFdx(tuv), dy = dFdy(tuv);
  vec3 c = sampleSrc(tuv, dx, dy);
  if (u_lookOn > 0.5) c = applyLook(c, uv, u_outSize.x / u_outSize.y, px / max(u_grainSize, 0.5), 1.0);
  fragColor = vec4(c, 1.0);
}`;

// ---------- Programm: Ausrichtung prüfen (kleines Testbild) ----------
export const FS_ORIENT = COMMON + `
uniform sampler2D u_src;
uniform mat3 u_orient;
void main() {
  vec2 uv = outPx() / u_outSize;
  vec2 tuv = (u_orient * vec3(uv, 1.0)).xy;
  fragColor = vec4(texture(u_src, tuv).rgb, 1.0);
}`;

// ---------- Programm: Druck mit Stilen ----------
export const FS_PRINT = COMMON + SAMPLING + LOOK + `
uniform sampler2D u_field;      // R: Helligkeit fein, G: mittel, B: grob, A: Detaildichte
uniform vec2 u_fieldSize;
uniform sampler2D u_paint;      // gemalte Maske (0.5 = neutral)
uniform vec2 u_paintSize;
uniform float u_hasPaint;
uniform vec2 u_paperMM;
uniform float u_mmPerPx;
uniform vec4 u_imgRect;         // Bildfenster in Ausgabe-UV
uniform vec4 u_crop;            // Ausschnitt in ausgerichteter Quell-UV
uniform int u_style;
uniform float u_p[24];
uniform vec3 u_paper;
uniform vec3 u_ink;
uniform int u_ground;           // 0 Papier, 1 Leinen, 2 schlicht, 3 transparent
uniform float u_groundTex;
uniform vec3 u_tone[5];
uniform float u_lookOn;
uniform float u_showPaint;

struct Ctx {
  vec2 px; vec2 uvO; vec2 mm; vec2 iuv; vec2 ouv; vec2 tuv; vec2 tdx; vec2 tdy;
  float inWin; float sdWin;
};

// ---------- Untergründe ----------
vec3 paperTexture(vec2 mm, vec3 base, float amt) {
  if (amt <= 0.001) return base;
  float fw = u_mmPerPx;
  float mot = fbm(mm / 11.0, 4, u_seed + 101u);
  float sc = 0.85;
  float h0 = fbm(mm / sc, 3, u_seed + 202u);
  float hx = fbm((mm + vec2(0.1, 0.0)) / sc, 3, u_seed + 202u);
  float hy = fbm((mm + vec2(0.0, 0.1)) / sc, 3, u_seed + 202u);
  vec2 gr = vec2(hx - h0, hy - h0) / 0.1 * sc;
  float shade = dot(gr, vec2(-0.6, -0.8));
  float vis = smoothstep(0.45, 0.1, fw);
  float fib = gnoise(vec2(mm.x * 0.9 + mm.y * 0.35, mm.y * 7.0 - mm.x * 2.4) / 1.3, u_seed + 303u);
  fib = smoothstep(0.55, 0.85, fib) * smoothstep(0.25, 0.06, fw);
  vec3 col = base * (1.0 + amt * 0.022 * mot);
  col += amt * vis * 0.05 * shade;
  col += amt * 0.018 * fib;
  return col;
}

vec3 linenTexture(vec2 mm, vec3 base, float amt) {
  if (amt <= 0.001) return base;
  float fw = u_mmPerPx;
  float pitch = 0.42;
  vec2 q = mm / pitch;
  vec2 wob = vec2(gnoise(vec2(q.y * 0.05, floor(q.x) * 0.31), u_seed + 11u),
                  gnoise(vec2(q.x * 0.05, floor(q.y) * 0.27), u_seed + 13u)) * 0.16;
  vec2 w = q + wob;
  vec2 cell = floor(w); vec2 f = fract(w) - 0.5;
  float tv = 0.74 + 0.26 * gnoise(vec2(cell.x * 3.7, q.y * 0.09), u_seed + 17u) + 0.12 * (rnd(ivec2(int(cell.x), 7), u_seed + 18u) - 0.5);
  float th = 0.74 + 0.26 * gnoise(vec2(cell.y * 3.1, q.x * 0.09), u_seed + 19u) + 0.12 * (rnd(ivec2(int(cell.y), 9), u_seed + 20u) - 0.5);
  tv += 0.38 * smoothstep(0.45, 0.95, gnoise(vec2(cell.x * 1.9, q.y * 0.03), u_seed + 23u));
  th += 0.38 * smoothstep(0.45, 0.95, gnoise(vec2(cell.y * 2.3, q.x * 0.03), u_seed + 29u));
  float pv = sqrt(clamp(1.0 - abs(f.x) / (0.5 * tv), 0.0, 1.0));
  float ph = sqrt(clamp(1.0 - abs(f.y) / (0.5 * th), 0.0, 1.0));
  float top = mod(cell.x + cell.y, 2.0);
  float vV = pv * (0.72 + 0.28 * cos(f.y * 3.14159));
  float vH = ph * (0.72 + 0.28 * cos(f.x * 3.14159));
  float lum = top < 0.5 ? max(vV, vH * 0.5) : max(vH, vV * 0.5);
  float cover = max(pv, ph);
  float yarn = top < 0.5 ? gnoise(vec2(cell.x * 5.3, q.y * 0.025), u_seed + 31u) : gnoise(vec2(cell.y * 4.7, q.x * 0.025), u_seed + 37u);
  float detail = (lum - 0.62) * 0.24 + yarn * 0.06 - (1.0 - cover) * 0.12;
  float vis = smoothstep(pitch * 0.85, pitch * 0.3, fw);
  float avgShift = -0.03;
  float low = fbm(mm / 16.0, 3, u_seed + 41u) * 0.03 + yarn * 0.02 * (1.0 - vis);
  return base * (1.0 + amt * (mix(avgShift, detail, vis) + low));
}

vec3 groundColor(vec2 mm) {
  if (u_ground == 0) return paperTexture(mm, u_paper, u_groundTex);
  if (u_ground == 1) return linenTexture(mm, u_paper, u_groundTex);
  return u_paper;
}

// ---------- Bild ----------
vec3 photoRaw(Ctx c) { return sampleSrc(c.tuv, c.tdx, c.tdy); }
vec3 lookOf(vec3 s, Ctx c) {
  if (u_lookOn < 0.5) return s;
  vec2 wsz = (u_imgRect.zw - u_imgRect.xy) * u_paperMM;
  return applyLook(s, c.iuv, wsz.x / wsz.y, c.mm / max(u_grainSize, 0.01), clamp(u_grainSize / u_mmPerPx, 0.0, 1.0));
}
vec3 photoLook(Ctx c) { return lookOf(photoRaw(c), c); }
vec4 field(Ctx c) { return sampleBS(u_field, clamp(c.ouv, 0.0, 1.0), u_fieldSize); }

// B-Spline auf einer Mipmap-Stufe: weiche Unschärfe ohne Blockmuster
vec4 sampleBSlod(sampler2D tex, vec2 uv, vec2 size, float lod) {
  vec2 p = uv * size - 0.5;
  vec2 i = floor(p); vec2 f = p - i;
  vec2 f2 = f * f, f3 = f2 * f;
  vec2 w0 = (-f3 + 3.0 * f2 - 3.0 * f + 1.0) / 6.0;
  vec2 w1 = (3.0 * f3 - 6.0 * f2 + 4.0) / 6.0;
  vec2 w2 = (-3.0 * f3 + 3.0 * f2 + 3.0 * f + 1.0) / 6.0;
  vec2 w3 = f3 / 6.0;
  vec2 g0 = w0 + w1, g1 = w2 + w3;
  vec2 h0 = (i - 0.5 + w1 / g0) / size;
  vec2 h1 = (i + 1.5 + w3 / g1) / size;
  return g0.y * (g0.x * textureLod(tex, vec2(h0.x, h0.y), lod) + g1.x * textureLod(tex, vec2(h1.x, h0.y), lod))
       + g1.y * (g0.x * textureLod(tex, vec2(h0.x, h1.y), lod) + g1.x * textureLod(tex, vec2(h1.x, h1.y), lod));
}
vec3 sampleBlur(vec2 tuv, float lod) {
  float l0 = floor(lod);
  float t = lod - l0;
  vec2 s0 = max(floor(u_srcSize / exp2(l0)), vec2(1.0));
  vec2 s1 = max(floor(u_srcSize / exp2(l0 + 1.0)), vec2(1.0));
  return mix(sampleBSlod(u_src, tuv, s0, l0).rgb, sampleBSlod(u_src, tuv, s1, l0 + 1.0).rgb, t);
}
float srcLodBase(Ctx c) { return max(0.0, log2(max(max(length(c.tdx * u_srcSize), length(c.tdy * u_srcSize)), 1e-4))); }
// Foto, das zum Rand hin unscharf wird (w: 0 scharf … 1 maximal, amt: Stärke 0..1)
vec3 photoBlend(Ctx c, float amt, float w) {
  vec3 sharp = photoRaw(c);
  if (amt <= 0.001 || w <= 0.001) return lookOf(sharp, c);
  vec3 b = sampleBlur(c.tuv, srcLodBase(c) + amt * 6.5 * w);
  return lookOf(mix(sharp, b, clamp(w * amt * 3.0, 0.0, 1.0)), c);
}

float coverLine(float dpx, float wpx) { return clamp(min(dpx + 0.5, wpx * 0.5) - max(dpx - 0.5, -wpx * 0.5), 0.0, 1.0); }

// ---------- Organische Maske („Bereiche herausnehmen“ entlang natürlicher Linien) ----------
// p0 Menge, p1 Quelle, p2 Richtung, p3 Weichheit, p4 Unruhe, p5 Faser, p6 Maßstab, p7 Detail, p10 Motiv schützen
float maskFieldAt(vec2 iuv, vec2 ouv) {
  float mode = u_p[1];
  vec4 fl = sampleBS(u_field, clamp(ouv, 0.0, 1.0), u_fieldSize);
  float det = u_p[7];
  float L = mix(mix(fl.r, fl.g, smoothstep(0.0, 0.5, det)), fl.b, smoothstep(0.5, 1.0, det));
  float F;
  if (mode < 0.5) F = 1.0 - L;
  else if (mode < 1.5) F = L;
  else if (mode < 2.5) {
    vec2 d = abs(iuv - 0.5) * 2.0;
    F = 1.0 - pow(pow(d.x, 3.0) + pow(d.y, 3.0), 1.0 / 3.0);
    F = F * 0.85 + 0.15 * fl.a;
  } else if (mode < 3.5) {
    vec2 dir = vec2(cos(u_p[2]), sin(u_p[2]));
    float e = abs(dir.x) + abs(dir.y);
    F = 0.5 - dot(iuv - 0.5, dir) / e;
  } else F = 0.55;
  F += 0.45 * (fl.a - 0.35) * u_p[10];
  if (u_hasPaint > 0.5) {
    float pm = sampleBS(u_paint, clamp(ouv, 0.0, 1.0), u_paintSize).r;
    F += (pm - 0.5) * 2.6;
  }
  return F;
}

// Breite des Übergangs: „Weichheit“ (fein) + zusätzlicher, breiter Übergang
float softWidth(float extra) { return mix(0.0, 0.14, u_p[3] * u_p[3]) + mix(0.0, 0.5, extra * extra); }

// F: Maskenwert mit Fasern, Fs: geglättet (für Linien entlang des Motivrands), T: Schwelle
void maskValues(Ctx c, out float F, out float Fs, out float T) {
  float scale = mix(6.0, 60.0, u_p[6]);
  vec2 wv = vec2(fbm(c.mm / scale, 5, u_seed + 1u), fbm(c.mm / scale + 19.7, 5, u_seed + 2u));
  vec2 iuvW = c.iuv + wv * u_p[4] * 0.09;
  vec2 ouvW = mix(u_crop.xy, u_crop.zw, iuvW);
  Fs = maskFieldAt(iuvW, ouvW);
  vec2 fq = c.mm + 0.6 * vec2(gnoise(c.mm / 1.7, u_seed + 5u), gnoise(c.mm / 1.7 + 3.7, u_seed + 6u));
  float fib = fbm(fq / 1.1, 4, u_seed + 3u);
  float fib2 = gnoise(fq / 0.22, u_seed + 4u);
  F = Fs + (fib * 0.78 + fib2 * 0.22) * u_p[5] * 0.12;
  T = u_p[0];
}

// Anteil „behalten“ (0..1). edgeMM: ungefährer Abstand zur Kante (mm, + innen)
float keepFrom(float F, float T, float extra, out float edgeMM) {
  float g = max(fwidth(F), 1e-6);
  float soft = softWidth(extra);
  edgeMM = (F - T) / g * u_mmPerPx;
  float aa = g * 0.75;
  return smoothstep(T - soft - aa, T + soft + aa, F);
}
float organicKeep(Ctx c, float thresholdShift, out float edgeMM) {
  float F, Fs, T;
  maskValues(c, F, Fs, T);
  return keepFrom(F, T + thresholdShift, 0.0, edgeMM);
}

// ---------- Höhenlinien ----------
// Wert, dessen Höhenlinien gezeichnet werden: Helligkeit, Motivrand (Maske) oder beides
float topoValue(Ctx c, float smoothness, float source, float Fs) {
  vec4 fl = field(c);
  float L = mix(mix(fl.r, fl.g, smoothstep(0.0, 0.5, smoothness)), fl.b, smoothstep(0.5, 1.0, smoothness));
  L += 0.006 * fbm(c.mm / 30.0, 3, u_seed + 501u);
  if (source > 0.5) {
    float m = Fs * 0.8 + 0.1;
    L = source < 1.5 ? m : mix(L, m, 0.5);
  }
  return L;
}
float contourCov(float v, float widthMM, float idxEvery) {
  float fwv = max(fwidth(v), 1e-6);
  float d = abs(fract(v + 0.5) - 0.5);
  float dpx = d / fwv;
  float lw = widthMM / u_mmPerPx;
  if (idxEvery > 0.5) {
    float k = mod(floor(v + 0.5), idxEvery);
    if (k < 0.5) lw *= 1.9;
  }
  float cov = coverLine(dpx, lw);
  // zu dichte Linien → mittlere Deckung statt Flimmern
  float dens = smoothstep(0.35, 0.8, fwv);
  return mix(cov, clamp(lw * fwv, 0.0, 1.0) * 0.8, dens);
}
float contours(Ctx c, float levels, float widthMM, float idxEvery, float smoothness) {
  return contourCov(topoValue(c, smoothness, 0.0, 0.0) * levels, widthMM, idxEvery);
}

// ---------- Stil 0: Galerie ----------
vec4 styleGalerie(Ctx c) {
  vec3 col = groundColor(c.mm);
  vec2 wmin = u_imgRect.xy * u_paperMM, wmax = u_imgRect.zw * u_paperMM;
  vec2 cen = (wmin + wmax) * 0.5;
  if (u_p[12] > 0.5) {
    // Plattenrand (Prägung wie beim Tiefdruck)
    vec2 hs = (wmax - wmin) * 0.5 + u_p[13];
    float r = 1.6;
    vec2 rel = c.mm - cen;
    vec2 q = abs(rel) - (hs - r);
    float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
    vec2 nrm;
    if (q.x > 0.0 && q.y > 0.0) nrm = normalize(q) * sign(rel);
    else nrm = q.x > q.y ? vec2(sign(rel.x), 0.0) : vec2(0.0, sign(rel.y));
    float band = 0.45;
    float bev = 1.0 - smoothstep(0.0, band, abs(sd + band * 0.5));
    float lightDot = dot(-nrm, normalize(vec2(-0.55, -0.83)));
    col *= 1.0 + bev * lightDot * 0.075 * u_p[14];
    col *= 1.0 + 0.008 * u_p[14] * (1.0 - smoothstep(-0.3, 0.3, sd));
    // Plattenton: ein Hauch Druckfarbe auf der Plattenfläche, wie beim Tiefdruck
    float inside = 1.0 - smoothstep(-0.2, 0.2, sd);
    float haze = 0.7 + 0.3 * fbm(c.mm / 9.0, 3, u_seed + 31u);
    col *= mix(vec3(1.0), u_ink / max(u_paper, vec3(0.05)), 0.07 * u_p[17] * inside * haze);
  }
  if (u_p[15] > 0.0) {
    // feine Linie um das Bild
    float gap = u_p[16] / u_mmPerPx;
    float lw = max(0.14 / u_mmPerPx, 0.5);
    float a = coverLine(abs(c.sdWin - gap), lw);
    col = mix(col, u_ink, a * u_p[15]);
  }
  if (c.inWin > 0.0) col = mix(col, photoLook(c), c.inWin);
  return vec4(col, 1.0);
}

// ---------- Stil 1: Aussparung (Leinen/Papier scheint durch) ----------
vec4 styleReveal(Ctx c) {
  vec3 ground = groundColor(c.mm);
  float F, Fs, T;
  maskValues(c, F, Fs, T);
  float edgeMM;
  float keep = keepFrom(F, T, u_p[16], edgeMM) * c.inWin;
  float softW = softWidth(u_p[16]);
  float lines = u_p[14] > 0.0 ? contourCov(topoValue(c, 0.55, u_p[17], Fs) * u_p[15], 0.18, 0.0) : 0.0;
  vec3 ph = photoBlend(c, u_p[11], 1.0 - smoothstep(T - softW, T + softW + 0.25, Fs));
  vec3 tex = ground / max(u_paper, vec3(0.05));
  vec3 onGround = ph * mix(vec3(1.0), tex, u_p[12]);
  onGround *= mix(vec3(1.0), u_paper / max(max(u_paper.r, max(u_paper.g, u_paper.b)), 0.05), u_p[13]);
  float rim = exp(-max(edgeMM, 0.0) / 0.9) * smoothstep(-0.2, 0.3, edgeMM);
  onGround *= 1.0 - u_p[8] * 0.22 * rim;
  vec3 removed = ground * mix(vec3(1.0), mix(vec3(1.0), ph, 0.85), u_p[9] * 0.45 * c.inWin);
  removed = mix(removed, u_ink * tex, lines * u_p[14] * c.inWin);
  vec3 col = mix(removed, onGround, keep);
  float alpha = u_ground == 3 ? max(keep, max(u_p[9] * 0.45, lines * u_p[14]) * c.inWin) : 1.0;
  return vec4(col, alpha);
}

// ---------- Stil 2: Edeldruck (Cyanotypie, Platin, Van Dyke, Salzpapier) ----------
vec3 toneRamp(float D) {
  D = clamp(D, 0.0, 1.0) * 4.0;
  int i = int(min(floor(D), 3.0));
  float f = D - float(i);
  vec3 a = u_tone[4 - i], b = u_tone[3 - i];
  return mix(a, b, smoothstep(0.0, 1.0, f) * 0.5 + f * 0.5);
}
vec4 styleAltProcess(Ctx c) {
  vec3 ground = groundColor(c.mm);
  vec3 tex = ground / max(u_paper, vec3(0.05));
  vec2 wmin = u_imgRect.xy * u_paperMM, wmax = u_imgRect.zw * u_paperMM;
  vec2 cen = (wmin + wmax) * 0.5, hs = (wmax - wmin) * 0.5;
  bool vert = u_p[18] > 0.5;
  vec2 m = vert ? c.mm.yx : c.mm;
  vec2 rel = m - (vert ? cen.yx : cen);
  vec2 hm = vert ? hs.yx : hs;
  float ext = u_p[15];
  float rough = u_p[16];
  float bristle = u_p[17];
  // Strichenden (quer zur Pinselrichtung ausgefranst)
  float ex = hm.x + ext + rough * (9.0 * fbm(vec2(rel.y / 38.0, 3.1), 3, u_seed + 61u))
           + rough * bristle * (2.4 * gnoise(vec2(rel.y / 0.45, 1.7), u_seed + 62u) + 1.6 * gnoise(vec2(rel.y / 1.6, 5.3), u_seed + 63u));
  float ey = hm.y + ext + rough * (6.0 * fbm(vec2(rel.x / 55.0, 7.7), 3, u_seed + 64u) + 1.6 * gnoise(vec2(rel.x / 7.0, 2.2), u_seed + 65u))
           + rough * bristle * 0.9 * gnoise(vec2(rel.x / 0.9, 9.1), u_seed + 72u);
  float dX = ex - abs(rel.x);
  float dY = ey - abs(rel.y);
  float aa = u_mmPerPx;
  float streakX = gnoise(vec2(rel.x / 7.0, rel.y / 0.22), u_seed + 66u);
  float coatX = smoothstep(-aa, aa, dX) * smoothstep(-0.35, 0.45, streakX * bristle + dX / 3.5 - 0.05);
  float streakY = gnoise(vec2(rel.x / 28.0, rel.y / 0.28), u_seed + 67u) * 0.6 + gnoise(vec2(rel.x / 60.0, rel.y / 0.9), u_seed + 68u) * 0.4;
  float coatY = smoothstep(-aa, aa, dY) * smoothstep(-0.35, 0.35, streakY * bristle + dY / 2.2 - 0.04);
  float coat = clamp(coatX * coatY, 0.0, 1.0);
  float mott = 1.0 - u_p[20] * 0.22 * (0.5 + 0.5 * fbm(vec2(rel.x / 26.0, rel.y / 2.6), 4, u_seed + 69u));
  // Belichtung
  vec3 ph = photoLook(c);
  float lum = luma(srgb2lin(ph));
  lum = pow(lum, 1.0 / 2.2);
  float x = clamp(1.0 - lum, 0.0, 1.0);
  float k = u_p[13];
  float Dimg = mix(x, x * x * (3.0 - 2.0 * x), k);
  Dimg = mix(Dimg, pow(Dimg, 0.8), 0.5);
  float sdmm = c.sdWin * u_mmPerPx;
  float rebate = u_p[19] > 0.0 ? (1.0 - smoothstep(u_p[19] - aa, u_p[19] + aa, sdmm)) * smoothstep(-aa, aa, sdmm) : 0.0;
  float marks = fbm(vec2(rel.x / 42.0, rel.y / 1.3), 4, u_seed + 70u);
  float marks2 = gnoise(vec2(rel.x / 9.0, rel.y / 0.35), u_seed + 71u);
  float Dout = (1.0 - 0.9 * rebate) * (1.0 - bristle * (0.22 * smoothstep(-0.25, 0.55, marks) + 0.08 * marks2));
  float D = mix(Dout, Dimg, c.inWin) * coat * mott * u_p[14];
  vec3 col = toneRamp(D) * tex;
  return vec4(col, u_ground == 3 ? clamp(D * 1.4, 0.0, 1.0) : 1.0);
}

// ---------- Stil 3: Topografie (Höhenlinien aus dem Bild) ----------
// p12 Darstellung, p13 Linien, p14 Stärke, p15 betonte Linie, p16 Ruhe, p17 Farbe aus Bild, p18 Bild unter Linien,
// p19 Übergang weich, p20 Linien ins Bild, p21 außen ausblenden, p22 Linien folgen, p11 Unschärfe,
// p9 Anzahl Schichten, p8 Schichtfarbe aus Bild, p23 Linien zwischen Schichten
vec4 styleTopo(Ctx c) {
  vec3 ground = groundColor(c.mm);
  vec3 tex = ground / max(u_paper, vec3(0.05));
  float mode = u_p[12];
  float F = 0.0, Fs = 0.0, T = 0.5;
  bool needMask = (mode > 1.5 && mode < 2.5) || (mode < 2.5 && u_p[22] > 0.5);
  if (needMask) maskValues(c, F, Fs, T);
  float L = topoValue(c, u_p[16], mode < 2.5 ? u_p[22] : 0.0, Fs);
  vec3 col;
  float alpha = 1.0;
  if (mode > 2.5) {
    // Höhenschichten: Flächen in Tonstufen, feine Linien an den Grenzen
    float bands = max(2.0, u_p[9]);
    float v = clamp(L, 0.0, 0.9999) * bands;
    float fv = max(fwidth(v), 1e-5);
    float up = smoothstep(1.0 - fv, 1.0, fract(v));
    vec3 pal = mix(toneRamp(1.0 - (floor(v) + 0.5) / bands), toneRamp(1.0 - (floor(v) + 1.5) / bands), up);
    vec3 phb = lookOf(sampleBlur(c.tuv, srcLodBase(c) + 3.5), c);
    vec3 photoBand = clamp(phb * (luma(pal) / max(luma(phb), 0.02)), 0.0, 1.0);
    vec3 fill = mix(pal, photoBand, u_p[8]) * tex * (1.0 - 0.025 * fbm(c.mm / 4.0, 3, u_seed + 41u));
    float cov = contourCov(v, u_p[14], u_p[15]) * u_p[23];
    vec3 lineCol = mix(u_ink * tex, fill * 0.55, u_p[17]);
    col = mix(ground, mix(fill, lineCol, cov), c.inWin);
    alpha = c.inWin;
  } else {
    float cov = contourCov(L * u_p[13], u_p[14], u_p[15]) * c.inWin;
    if (mode < 0.5) {
      vec3 ph = photoLook(c);
      vec3 lineCol = mix(u_ink, clamp(ph * 0.62, 0.0, 1.0), u_p[17]) * tex;
      col = mix(ground, lineCol, cov);
      alpha = cov;
    } else if (mode < 1.5) {
      vec3 ph = photoLook(c);
      vec3 lineCol = mix(u_ink, clamp(ph * 0.62, 0.0, 1.0), u_p[17]) * tex;
      vec3 base = mix(ground, ph * tex, u_p[18] * c.inWin);
      col = mix(base, lineCol, cov);
      alpha = max(cov, u_p[18] * c.inWin);
    } else {
      // Übergang Bild ↔ Linien: weich auslaufend, Linien beginnen früher und reichen ins Bild
      float edgeMM;
      float keep = keepFrom(F, T, u_p[19], edgeMM) * c.inWin;
      float softW = softWidth(u_p[19]);
      vec3 ph = photoBlend(c, u_p[11], 1.0 - smoothstep(T - softW, T + softW + 0.25, Fs));
      vec3 lineCol = mix(u_ink, clamp(ph * 0.62, 0.0, 1.0), u_p[17]) * tex;
      float lineEnd = T + softW * 0.6 + u_p[20] * 0.45;
      float lineVis = 1.0 - smoothstep(lineEnd - 0.1 - softW * 0.5, lineEnd + 0.04, Fs);
      float far = clamp((T - Fs) / mix(1.2, 0.12, u_p[21]), 0.0, 1.0);
      lineVis *= 1.0 - u_p[21] * smoothstep(0.0, 1.0, far);
      float a = cov * lineVis;
      vec3 base = mix(ground, ph * tex, keep);
      col = mix(base, lineCol, a * mix(1.0, 0.88, keep));
      alpha = max(keep, a);
    }
  }
  return vec4(col, u_ground == 3 ? alpha : 1.0);
}

// ---------- Stil 4: Linienstich ----------
vec4 styleEngrave(Ctx c) {
  vec3 ground = groundColor(c.mm);
  vec3 tex = ground / max(u_paper, vec3(0.05));
  float spacing = u_p[12];
  float ang = radians(u_p[13]);
  vec2 dir = vec2(cos(ang), sin(ang)), nrm = vec2(-dir.y, dir.x);
  vec4 fl = field(c);
  float s = dot(c.mm, nrm) / spacing;
  float t = dot(c.mm, dir);
  s += u_p[14] * 1.4 * fbm(vec2(t / 45.0, s * 0.015), 3, u_seed + 601u);
  s += u_p[15] * (fl.g - 0.5) * 7.0;
  vec3 ph = photoLook(c);
  float lum = pow(luma(srgb2lin(ph)), 1.0 / 2.2);
  float dark = pow(clamp(1.0 - lum, 0.0, 1.0), u_p[16]);
  float minW = clamp(u_p[20] / spacing, 0.0, 0.5);
  float w = clamp(minW + dark * (0.93 - minW), 0.0, 0.93);
  float fs = max(fwidth(s), 1e-6);
  float d = abs(fract(s + 0.5) - 0.5) / fs;
  float cov = coverLine(d, w / fs);
  cov = mix(cov, w, smoothstep(0.28, 0.6, fs));
  if (u_p[17] > 0.0) {
    float th = 1.0 - u_p[17];
    float dark2 = clamp((dark - th) / max(1.0 - th, 1e-3), 0.0, 1.0);
    vec2 dir2 = vec2(cos(ang + 1.05), sin(ang + 1.05)), n2 = vec2(-dir2.y, dir2.x);
    float s2 = dot(c.mm, n2) / spacing + u_p[14] * 0.9 * fbm(vec2(dot(c.mm, dir2) / 45.0, 4.2), 3, u_seed + 602u);
    float fs2 = max(fwidth(s2), 1e-6);
    float w2 = dark2 * 0.75;
    float cov2 = coverLine(abs(fract(s2 + 0.5) - 0.5) / fs2, w2 / fs2);
    cov2 = mix(cov2, w2, smoothstep(0.28, 0.6, fs2));
    cov = 1.0 - (1.0 - cov) * (1.0 - cov2);
  }
  cov *= c.inWin;
  vec3 inkC = mix(u_ink, clamp(ph * 0.82, 0.0, 1.0), u_p[18]) * tex;
  return vec4(mix(ground, inkC, cov), u_ground == 3 ? cov : 1.0);
}

// ---------- Stil 5: Büttenrand / Fragment ----------
float deckleSD(vec2 mm, vec2 cen, vec2 hs, float amp, float sc, uint s) {
  vec2 rel = mm - cen;
  vec2 q = abs(rel) - hs;
  float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
  float dis = amp * (0.62 * fbm(mm / sc, 4, s) + 0.38 * fbm(mm / (sc * 0.16), 3, s + 7u));
  return sd + dis;
}
vec4 styleDeckle(Ctx c) {
  vec3 ground = groundColor(c.mm);
  vec2 wmin = u_imgRect.xy * u_paperMM, wmax = u_imgRect.zw * u_paperMM;
  vec2 cen = (wmin + wmax) * 0.5, hs = (wmax - wmin) * 0.5;
  float amp = u_p[13];
  float sc = mix(4.0, 30.0, u_p[18]);
  float fringe = u_p[14];
  float aa = u_mmPerPx;
  float photoCov, paperCov, sdPaper;
  if (u_p[16] > 0.5) {
    float e1, e2;
    photoCov = organicKeep(c, 0.0, e1) * c.inWin;
    paperCov = organicKeep(c, -0.05 - fringe * 0.04, e2);
    sdPaper = -e2;
  } else {
    float sdPhoto = deckleSD(c.mm, cen, hs, amp, sc, u_seed + 701u);
    float fib = fbm(vec2(c.mm.x * 1.3 + c.mm.y * 0.5, c.mm.y * 1.3 - c.mm.x * 0.5) / 0.25, 3, u_seed + 709u);
    sdPhoto += fib * amp * 0.12;
    photoCov = 1.0 - smoothstep(-aa, aa, sdPhoto);
    sdPaper = deckleSD(c.mm, cen, hs + fringe, amp * 1.1, sc * 1.3, u_seed + 711u) + fib * fringe * 0.35;
    paperCov = 1.0 - smoothstep(-aa, aa, sdPaper);
  }
  vec3 col = ground;
  if (u_p[15] > 0.0 && u_p[16] < 0.5) {
    float sdS = deckleSD(c.mm - vec2(0.5, 0.9), cen, hs + fringe, amp * 1.1, sc * 1.3, u_seed + 711u);
    float sh = 1.0 - smoothstep(-0.6, 2.6, sdS);
    col *= 1.0 - u_p[15] * 0.16 * sh * (1.0 - paperCov);
  }
  // Fragmentpapier: etwas heller, mit faserigem, leicht durchscheinendem Rand
  vec3 frag = mix(ground, vec3(1.0), 0.35) * (1.0 + 0.02 * fbm(c.mm / 3.0, 3, u_seed + 713u));
  float edgeFib = smoothstep(0.0, 1.2, -sdPaper);
  frag = mix(mix(ground, frag, 0.65), frag, edgeFib);
  col = mix(col, frag, paperCov);
  vec3 ph = photoLook(c);
  col = mix(col, ph * (frag / max(vec3(0.05), mix(u_paper, vec3(1.0), 0.35))), photoCov);
  float alpha = u_ground == 3 ? paperCov : 1.0;
  return vec4(col, alpha);
}

// Übergang Foto ↔ Technik (Punktstich, Strömung). p20: Modus, p21: Übergang weich, p11: Unschärfe
vec3 withPhotoTransition(Ctx c, vec3 colT, vec3 tex, inout float alpha) {
  if (u_p[20] < 0.5) return colT;
  float F, Fs, T;
  maskValues(c, F, Fs, T);
  float edgeMM;
  float keep = keepFrom(F, T, u_p[21], edgeMM) * c.inWin;
  float softW = softWidth(u_p[21]);
  vec3 ph = photoBlend(c, u_p[11], 1.0 - smoothstep(T - softW, T + softW + 0.25, Fs)) * tex;
  alpha = max(alpha, keep);
  return mix(colT, ph, keep);
}

// ---------- Stil 6: Punktstich (Stippling) ----------
// p12 Abstand mm, p13 Unregelmäßigkeit, p14 Kontrast, p15 Größe in Tiefen, p16 Farbe aus Bild, p17 Punkte in Lichtern, p18 Punktkante
float stippleRadius(float dark) { return sqrt(clamp(u_p[17] + dark * (1.0 - u_p[17]), 0.0, 1.0)) * u_p[15] * 0.6; }
vec4 styleStipple(Ctx c) {
  vec3 ground = groundColor(c.mm);
  vec3 tex = ground / max(u_paper, vec3(0.05));
  float sp = u_p[12];
  vec2 winMin = u_imgRect.xy * u_paperMM;
  vec2 winSz = (u_imgRect.zw - u_imgRect.xy) * u_paperMM;
  float tpp = max(length(c.tdx * u_srcSize), length(c.tdy * u_srcSize));
  float lod = max(0.0, log2(max(tpp * sp / u_mmPerPx, 1e-4)) - 0.5);
  vec2 q = c.mm / sp;
  vec2 cell = floor(q);
  float px = sp / u_mmPerPx;
  float cov = 0.0;
  vec3 dotCol = u_ink;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 cc = cell + vec2(float(i), float(j));
      ivec2 ic = ivec2(cc);
      vec2 jit = vec2(rnd(ic, u_seed + 801u), rnd(ic, u_seed + 802u)) - 0.5;
      vec2 ctr = cc + 0.5 + jit * u_p[13];
      vec2 iuv = (ctr * sp - winMin) / winSz;
      if (iuv.x < 0.0 || iuv.y < 0.0 || iuv.x > 1.0 || iuv.y > 1.0) continue;
      vec2 tuv = (u_orient * vec3(mix(u_crop.xy, u_crop.zw, iuv), 1.0)).xy;
      vec3 sCol = textureLod(u_src, tuv, lod).rgb;
      if (u_lookOn > 0.5) sCol = applyLook(sCol, iuv, winSz.x / winSz.y, vec2(0.0), 0.0);
      float dark = pow(clamp(1.0 - pow(luma(srgb2lin(sCol)), 1.0 / 2.2), 0.0, 1.0), u_p[14]);
      float r = stippleRadius(dark);
      if (r < 0.01) continue;
      vec2 d = q - ctr;
      float rr = r * (1.0 + u_p[18] * 0.22 * gnoise(d / max(r, 0.05) * 1.6 + cc * 3.1, u_seed + 803u));
      float a = clamp((rr - length(d)) * px + 0.5, 0.0, 1.0);
      if (a > cov) { cov = a; dotCol = mix(u_ink, clamp(sCol * 0.8, 0.0, 1.0), u_p[16]); }
    }
  }
  // Punkte kleiner als ein paar Pixel (Vorschau): mittlerer Ton statt Flimmern
  vec3 phP = photoLook(c);
  float darkP = pow(clamp(1.0 - pow(luma(srgb2lin(phP)), 1.0 / 2.2), 0.0, 1.0), u_p[14]);
  float rP = stippleRadius(darkP);
  float lowRes = smoothstep(4.0, 1.6, px);
  cov = mix(cov, clamp(3.14159 * rP * rP, 0.0, 1.0), lowRes);
  dotCol = mix(dotCol, mix(u_ink, clamp(phP * 0.8, 0.0, 1.0), u_p[16]), lowRes);
  cov *= c.inWin;
  vec3 colT = mix(ground, dotCol * tex, cov);
  float alpha = u_ground == 3 ? cov : 1.0;
  colT = withPhotoTransition(c, colT, tex, alpha);
  return vec4(colT, alpha);
}

// ---------- Stil 7: Strömung (Striche folgen den Formen des Bildes) ----------
// p12 Strichlänge mm, p13 Strichbreite mm, p14 Kontrast, p15 Richtung in ruhigen Flächen, p16 Dichte,
// p17 Farbe aus Bild, p18 Details ↔ große Formen, p19 weiche Strichkanten
float flowL(vec2 ouv, float det) {
  vec4 fl = textureLod(u_field, clamp(ouv, 0.0, 1.0), 0.0);
  return mix(mix(fl.r, fl.g, smoothstep(0.0, 0.5, det)), fl.b, smoothstep(0.5, 1.0, det));
}
// Richtung entlang der Höhenlinien; in ruhigen Flächen sanft zur Grundrichtung (Mischung im Doppelwinkel)
vec2 flowDirAt(vec2 mm, vec2 winMin, vec2 k, float det, float fa) {
  vec2 ouv = u_crop.xy + (mm - winMin) * k;
  vec2 e = 1.0 / u_fieldSize;
  float gx = flowL(ouv + vec2(e.x, 0.0), det) - flowL(ouv - vec2(e.x, 0.0), det);
  float gy = flowL(ouv + vec2(0.0, e.y), det) - flowL(ouv - vec2(0.0, e.y), det);
  vec2 g = vec2(gx / (2.0 * e.x), gy / (2.0 * e.y)) * k;
  float m = length(g);
  float th = atan(g.x, -g.y);
  float wgt = smoothstep(0.0015, 0.01, m);
  vec2 o = mix(vec2(cos(2.0 * fa), sin(2.0 * fa)), vec2(cos(2.0 * th), sin(2.0 * th)), wgt);
  float tb = 0.5 * atan(o.y, o.x + 1e-6);
  return vec2(cos(tb), sin(tb));
}
vec4 styleFlow(Ctx c) {
  vec3 ground = groundColor(c.mm);
  vec3 tex = ground / max(u_paper, vec3(0.05));
  vec2 winMin = u_imgRect.xy * u_paperMM;
  vec2 winSz = (u_imgRect.zw - u_imgRect.xy) * u_paperMM;
  vec2 k = (u_crop.zw - u_crop.xy) / winSz;
  float det = u_p[18];
  float fa = radians(u_p[15]);
  float cellMM = max(u_p[13], u_mmPerPx * 1.6);
  const int N = 14;
  float stepMM = u_p[12] / (2.0 * float(N));
  float sum = gnoise(c.mm / cellMM, u_seed + 901u);
  float wsum = 1.0;
  vec2 d0 = flowDirAt(c.mm, winMin, k, det, fa);
  for (int sgn = 0; sgn < 2; sgn++) {
    vec2 p = c.mm;
    vec2 prev = sgn == 0 ? d0 : -d0;
    for (int i = 1; i <= N; i++) {
      vec2 d = flowDirAt(p, winMin, k, det, fa);
      if (dot(d, prev) < 0.0) d = -d;
      p += d * stepMM;
      prev = d;
      float w = 0.5 + 0.5 * cos(3.14159 * float(i) / float(N + 1));
      sum += w * gnoise(p / cellMM, u_seed + 901u);
      wsum += w;
    }
  }
  float tval = 0.5 + (sum / wsum) * 1.9;
  vec3 ph = photoLook(c);
  float dark = pow(clamp(1.0 - pow(luma(srgb2lin(ph)), 1.0 / 2.2), 0.0, 1.0), u_p[14]);
  float th = dark * 0.92 + u_p[16];
  float edge = max(fwidth(tval), 1e-4) * 0.75 + u_p[19] * 0.08;
  float cov = smoothstep(tval - edge, tval + edge, th) * c.inWin;
  vec3 inkC = mix(u_ink, clamp(ph * 0.82, 0.0, 1.0), u_p[17]) * tex;
  vec3 colT = mix(ground, inkC, cov);
  float alpha = u_ground == 3 ? cov : 1.0;
  colT = withPhotoTransition(c, colT, tex, alpha);
  return vec4(colT, alpha);
}

void main() {
  Ctx c;
  c.px = outPx();
  c.uvO = c.px / u_outSize;
  c.mm = c.uvO * u_paperMM;
  c.iuv = (c.uvO - u_imgRect.xy) / (u_imgRect.zw - u_imgRect.xy);
  c.ouv = mix(u_crop.xy, u_crop.zw, c.iuv);
  c.tuv = (u_orient * vec3(clamp(c.ouv, 0.0, 1.0), 1.0)).xy;
  vec2 ouvRaw = mix(u_crop.xy, u_crop.zw, c.iuv);
  vec2 tuvRaw = (u_orient * vec3(ouvRaw, 1.0)).xy;
  c.tdx = dFdx(tuvRaw);
  c.tdy = dFdy(tuvRaw);
  vec2 wmin = u_imgRect.xy * u_outSize, wmax = u_imgRect.zw * u_outSize;
  vec2 dd = max(wmin - c.px, c.px - wmax);
  c.sdWin = max(dd.x, dd.y);
  c.inWin = clamp(0.5 - c.sdWin, 0.0, 1.0);
  vec4 res;
  if (u_style == 0) res = styleGalerie(c);
  else if (u_style == 1) res = styleReveal(c);
  else if (u_style == 2) res = styleAltProcess(c);
  else if (u_style == 3) res = styleTopo(c);
  else if (u_style == 4) res = styleEngrave(c);
  else if (u_style == 5) res = styleDeckle(c);
  else if (u_style == 6) res = styleStipple(c);
  else res = styleFlow(c);
  if (u_showPaint > 0.5 && u_hasPaint > 0.5 && c.inWin > 0.0) {
    float pm = sampleBS(u_paint, clamp(c.ouv, 0.0, 1.0), u_paintSize).r - 0.5;
    vec3 tint = pm > 0.0 ? vec3(0.36, 0.55, 0.32) : vec3(0.75, 0.25, 0.22);
    res.rgb = mix(res.rgb, tint, min(abs(pm) * 1.3, 0.55));
    res.a = max(res.a, abs(pm));
  }
  fragColor = vec4(clamp(res.rgb, 0.0, 1.0), res.a);
}`;

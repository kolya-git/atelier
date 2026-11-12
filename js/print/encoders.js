// Streifenweise Kodierung sehr großer Bilder (Baseline-JPEG und PNG), ohne das ganze Bild im Speicher zu halten.
// Eigene Implementierung nach JPEG-Norm (ITU T.81, Anhang K: Standard-Tabellen) und PNG-Spezifikation.

const ZIGZAG = new Int32Array([
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28,
  35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63,
]);
const QT_Y = [16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99];
const QT_C = [17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99];
const DC_Y_BITS = [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0];
const DC_C_BITS = [0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0];
const DC_VALS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const AC_Y_BITS = [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d];
const AC_Y_VALS = [
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08,
  0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
  0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
  0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
  0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6,
  0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
  0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa,
];
const AC_C_BITS = [0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 0x77];
const AC_C_VALS = [
  0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41, 0x51, 0x07, 0x61, 0x71, 0x13, 0x22, 0x32, 0x81, 0x08, 0x14, 0x42, 0x91,
  0xa1, 0xb1, 0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0, 0x15, 0x62, 0x72, 0xd1, 0x0a, 0x16, 0x24, 0x34, 0xe1, 0x25, 0xf1, 0x17, 0x18, 0x19, 0x1a, 0x26,
  0x27, 0x28, 0x29, 0x2a, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58,
  0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87,
  0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4,
  0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda,
  0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa,
];
const AASF = [1.0, 1.387039845, 1.306562965, 1.175875602, 1.0, 0.785694958, 0.5411961, 0.275899379];

function buildHuff(bits, vals) {
  const code = new Uint16Array(256), len = new Uint8Array(256);
  let c = 0, k = 0;
  for (let l = 1; l <= 16; l++) {
    for (let i = 0; i < bits[l - 1]; i++) { code[vals[k]] = c; len[vals[k]] = l; k++; c++; }
    c <<= 1;
  }
  return { code, len };
}

function scaleQT(base, quality) {
  const q = Math.min(100, Math.max(1, quality | 0));
  const s = q < 50 ? Math.floor(5000 / q) : 200 - q * 2;
  return base.map((v) => Math.min(255, Math.max(1, Math.floor((v * s + 50) / 100))));
}

class ByteSink {
  constructor() { this.chunks = []; this.buf = new Uint8Array(1 << 20); this.pos = 0; this.total = 0; }
  byte(b) {
    if (this.pos === this.buf.length) { this.chunks.push(this.buf); this.buf = new Uint8Array(1 << 20); this.pos = 0; }
    this.buf[this.pos++] = b; this.total++;
  }
  bytes(arr) { for (let i = 0; i < arr.length; i++) this.byte(arr[i]); }
  word(w) { this.byte((w >> 8) & 255); this.byte(w & 255); }
  parts() { return [...this.chunks, this.buf.subarray(0, this.pos)]; }
}

export class JpegEncoder {
  /** quality 1..100, subsample: 4:2:0 (kleiner) oder 4:4:4 (feinste Farbkanten) */
  constructor(width, height, { quality = 92, subsample = true, dpi = 300 } = {}) {
    if (width > 65535 || height > 65535) throw new Error('JPEG erlaubt höchstens 65535 px pro Seite');
    this.w = width; this.h = height;
    this.sub = !!subsample;
    this.mcu = this.sub ? 16 : 8;
    this.sink = new ByteSink();
    this.qY = scaleQT(QT_Y, quality); this.qC = scaleQT(QT_C, quality);
    this.fY = new Float32Array(64); this.fC = new Float32Array(64);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const k = r * 8 + c;
      this.fY[k] = 1 / (this.qY[k] * AASF[r] * AASF[c] * 8);
      this.fC[k] = 1 / (this.qC[k] * AASF[r] * AASF[c] * 8);
    }
    this.hDCY = buildHuff(DC_Y_BITS, DC_VALS); this.hACY = buildHuff(AC_Y_BITS, AC_Y_VALS);
    this.hDCC = buildHuff(DC_C_BITS, DC_VALS); this.hACC = buildHuff(AC_C_BITS, AC_C_VALS);
    this.bitBuf = 0; this.bitCnt = 0;
    this.dcY = 0; this.dcCb = 0; this.dcCr = 0;
    this.rowBuf = new Uint8Array(this.mcu * width * 4);
    this.rowsInBuf = 0; this.rowsDone = 0;
    this.blk = new Float32Array(64); this.q = new Int32Array(64);
    this.cbBlk = new Float32Array(64); this.crBlk = new Float32Array(64);
    // Ebenen eines MCU-Streifens
    this.Y = new Float32Array(this.mcu * this.padW());
    this.Cb = new Float32Array(this.mcu * this.padW());
    this.Cr = new Float32Array(this.mcu * this.padW());
    this.header(dpi);
  }
  padW() { return Math.ceil(this.w / this.mcu) * this.mcu; }

  header(dpi) {
    const s = this.sink;
    s.word(0xffd8);
    s.word(0xffe0); s.word(16); s.bytes([0x4a, 0x46, 0x49, 0x46, 0]); s.byte(1); s.byte(1); s.byte(1); s.word(dpi); s.word(dpi); s.byte(0); s.byte(0);
    s.word(0xffdb); s.word(132);
    s.byte(0); for (let i = 0; i < 64; i++) s.byte(this.qY[ZIGZAG[i]]);
    s.byte(1); for (let i = 0; i < 64; i++) s.byte(this.qC[ZIGZAG[i]]);
    s.word(0xffc0); s.word(17); s.byte(8); s.word(this.h); s.word(this.w); s.byte(3);
    s.byte(1); s.byte(this.sub ? 0x22 : 0x11); s.byte(0);
    s.byte(2); s.byte(0x11); s.byte(1);
    s.byte(3); s.byte(0x11); s.byte(1);
    s.word(0xffc4); s.word(418);
    const dht = (cls, bits, vals) => { s.byte(cls); s.bytes(bits); s.bytes(vals); };
    dht(0x00, DC_Y_BITS, DC_VALS); dht(0x10, AC_Y_BITS, AC_Y_VALS); dht(0x01, DC_C_BITS, DC_VALS); dht(0x11, AC_C_BITS, AC_C_VALS);
    s.word(0xffda); s.word(12); s.byte(3); s.byte(1); s.byte(0x00); s.byte(2); s.byte(0x11); s.byte(3); s.byte(0x11); s.byte(0); s.byte(63); s.byte(0);
  }

  bits(code, len) {
    this.bitBuf = (this.bitBuf << len) | code;
    this.bitCnt += len;
    const s = this.sink;
    while (this.bitCnt >= 8) {
      const b = (this.bitBuf >> (this.bitCnt - 8)) & 255;
      s.byte(b);
      if (b === 255) s.byte(0);
      this.bitCnt -= 8;
    }
    this.bitBuf &= (1 << this.bitCnt) - 1;
  }

  /** Vorwärts-DCT (AAN, Gleitkomma) + Quantisierung. Ergebnis in this.q (natürliche Reihenfolge). */
  fdctQuant(d, f) {
    for (let i = 0; i < 64; i += 8) {
      const t0 = d[i] + d[i + 7], t7 = d[i] - d[i + 7], t1 = d[i + 1] + d[i + 6], t6 = d[i + 1] - d[i + 6];
      const t2 = d[i + 2] + d[i + 5], t5 = d[i + 2] - d[i + 5], t3 = d[i + 3] + d[i + 4], t4 = d[i + 3] - d[i + 4];
      let a = t0 + t3; const b = t0 - t3; let c = t1 + t2; const e = t1 - t2;
      d[i] = a + c; d[i + 4] = a - c;
      const z1 = (e + b) * 0.707106781;
      d[i + 2] = b + z1; d[i + 6] = b - z1;
      a = t4 + t5; c = t5 + t6; const g = t6 + t7;
      const z5 = (a - g) * 0.382683433, z2 = 0.5411961 * a + z5, z4 = 1.306562965 * g + z5, z3 = c * 0.707106781;
      const z11 = t7 + z3, z13 = t7 - z3;
      d[i + 5] = z13 + z2; d[i + 3] = z13 - z2; d[i + 1] = z11 + z4; d[i + 7] = z11 - z4;
    }
    for (let i = 0; i < 8; i++) {
      const t0 = d[i] + d[i + 56], t7 = d[i] - d[i + 56], t1 = d[i + 8] + d[i + 48], t6 = d[i + 8] - d[i + 48];
      const t2 = d[i + 16] + d[i + 40], t5 = d[i + 16] - d[i + 40], t3 = d[i + 24] + d[i + 32], t4 = d[i + 24] - d[i + 32];
      let a = t0 + t3; const b = t0 - t3; let c = t1 + t2; const e = t1 - t2;
      d[i] = a + c; d[i + 32] = a - c;
      const z1 = (e + b) * 0.707106781;
      d[i + 16] = b + z1; d[i + 48] = b - z1;
      a = t4 + t5; c = t5 + t6; const g = t6 + t7;
      const z5 = (a - g) * 0.382683433, z2 = 0.5411961 * a + z5, z4 = 1.306562965 * g + z5, z3 = c * 0.707106781;
      const z11 = t7 + z3, z13 = t7 - z3;
      d[i + 40] = z13 + z2; d[i + 24] = z13 - z2; d[i + 8] = z11 + z4; d[i + 56] = z11 - z4;
    }
    const q = this.q;
    for (let i = 0; i < 64; i++) { const v = d[i] * f[i]; q[i] = v > 0 ? (v + 0.5) | 0 : (v - 0.5) | 0; }
  }

  encodeBlock(d, f, prevDC, dcT, acT) {
    this.fdctQuant(d, f);
    const q = this.q;
    const dc = q[0];
    let diff = dc - prevDC;
    let a = diff < 0 ? -diff : diff, nb = 0;
    while (a) { nb++; a >>= 1; }
    this.bits(dcT.code[nb], dcT.len[nb]);
    if (nb) this.bits(diff < 0 ? (diff - 1) & ((1 << nb) - 1) : diff, nb);
    let run = 0;
    let last = 63;
    while (last > 0 && q[ZIGZAG[last]] === 0) last--;
    for (let k = 1; k <= last; k++) {
      const v = q[ZIGZAG[k]];
      if (v === 0) { run++; continue; }
      while (run > 15) { this.bits(acT.code[0xf0], acT.len[0xf0]); run -= 16; }
      let av = v < 0 ? -v : v, n = 0;
      while (av) { n++; av >>= 1; }
      const sym = (run << 4) | n;
      this.bits(acT.code[sym], acT.len[sym]);
      this.bits(v < 0 ? (v - 1) & ((1 << n) - 1) : v, n);
      run = 0;
    }
    if (last < 63) this.bits(acT.code[0], acT.len[0]);
    return dc;
  }

  /** RGBA-Zeilen anhängen (von oben nach unten). */
  addRows(rgba, rows) {
    const rowBytes = this.w * 4;
    let off = 0;
    for (let r = 0; r < rows; r++) {
      if (this.rowsDone + this.rowsInBuf >= this.h) break;
      this.rowBuf.set(rgba.subarray(off, off + rowBytes), this.rowsInBuf * rowBytes);
      off += rowBytes;
      this.rowsInBuf++;
      if (this.rowsInBuf === this.mcu) this.flushStrip();
    }
  }

  flushStrip() {
    const W = this.w, M = this.mcu, PW = this.padW();
    const rb = this.rowBuf, rowBytes = W * 4;
    const n = this.rowsInBuf;
    // fehlende Zeilen (letzter Streifen) mit der letzten Zeile auffüllen
    for (let r = n; r < M; r++) rb.copyWithin(r * rowBytes, (n - 1) * rowBytes, n * rowBytes);
    const Y = this.Y, Cb = this.Cb, Cr = this.Cr;
    for (let y = 0; y < M; y++) {
      for (let x = 0; x < PW; x++) {
        const sx = x < W ? x : W - 1;
        const i = y * rowBytes + sx * 4;
        const R = rb[i], G = rb[i + 1], B = rb[i + 2];
        const o = y * PW + x;
        Y[o] = 0.299 * R + 0.587 * G + 0.114 * B - 128;
        Cb[o] = -0.168736 * R - 0.331264 * G + 0.5 * B;
        Cr[o] = 0.5 * R - 0.418688 * G - 0.081312 * B;
      }
    }
    const blk = this.blk, cb = this.cbBlk, cr = this.crBlk;
    for (let mx = 0; mx < PW; mx += M) {
      if (this.sub) {
        for (let by = 0; by < 16; by += 8) for (let bx = 0; bx < 16; bx += 8) {
          for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) blk[y * 8 + x] = Y[(by + y) * PW + mx + bx + x];
          this.dcY = this.encodeBlock(blk, this.fY, this.dcY, this.hDCY, this.hACY);
        }
        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
          const o = (y * 2) * PW + mx + x * 2;
          cb[y * 8 + x] = (Cb[o] + Cb[o + 1] + Cb[o + PW] + Cb[o + PW + 1]) * 0.25;
          cr[y * 8 + x] = (Cr[o] + Cr[o + 1] + Cr[o + PW] + Cr[o + PW + 1]) * 0.25;
        }
      } else {
        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
          const o = y * PW + mx + x;
          blk[y * 8 + x] = Y[o]; cb[y * 8 + x] = Cb[o]; cr[y * 8 + x] = Cr[o];
        }
        this.dcY = this.encodeBlock(blk, this.fY, this.dcY, this.hDCY, this.hACY);
      }
      this.dcCb = this.encodeBlock(cb, this.fC, this.dcCb, this.hDCC, this.hACC);
      this.dcCr = this.encodeBlock(cr, this.fC, this.dcCr, this.hDCC, this.hACC);
    }
    this.rowsDone += n;
    this.rowsInBuf = 0;
  }

  get bytesSoFar() { return this.sink.total; }

  finish() {
    if (this.rowsInBuf > 0) this.flushStrip();
    if (this.bitCnt > 0) this.bits((1 << (8 - this.bitCnt)) - 1, 8 - this.bitCnt);
    this.sink.word(0xffd9);
    return new Blob(this.sink.parts(), { type: 'image/jpeg' });
  }
}

// ---------- PNG ----------
let CRC_T = null;
function crc32(bytes, crc = 0xffffffff) {
  if (!CRC_T) {
    CRC_T = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC_T[n] = c >>> 0; }
  }
  for (let i = 0; i < bytes.length; i++) crc = CRC_T[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
  return crc;
}
function pngChunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const crc = crc32(data, crc32(out.subarray(4, 8))) ^ 0xffffffff;
  dv.setUint32(8 + data.length, crc >>> 0);
  return out;
}

export class PngEncoder {
  constructor(width, height, { alpha = false, dpi = 300 } = {}) {
    if (typeof CompressionStream === 'undefined') throw new Error('PNG-Export braucht iPadOS 16.4 oder neuer');
    this.w = width; this.h = height; this.alpha = alpha; this.bpp = alpha ? 4 : 3;
    this.prev = new Uint8Array(width * this.bpp);
    this.cur = new Uint8Array(width * this.bpp);
    this.rowsDone = 0;
    const cs = new CompressionStream('deflate');
    this.writer = cs.writable.getWriter();
    const reader = cs.readable.getReader();
    this.idat = [];
    this.drained = (async () => {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        this.idat.push(pngChunk('IDAT', value));
      }
    })();
    const ihdr = new Uint8Array(13);
    const dv = new DataView(ihdr.buffer);
    dv.setUint32(0, width); dv.setUint32(4, height);
    ihdr[8] = 8; ihdr[9] = alpha ? 6 : 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    const phys = new Uint8Array(9);
    const ppm = Math.round(dpi / 0.0254);
    const pv = new DataView(phys.buffer);
    pv.setUint32(0, ppm); pv.setUint32(4, ppm); phys[8] = 1;
    this.head = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', ihdr), pngChunk('sRGB', new Uint8Array([0])), pngChunk('pHYs', phys)];
  }

  async addRows(rgba, rows) {
    const W = this.w, bpp = this.bpp, stride = W * bpp + 1;
    rows = Math.min(rows, this.h - this.rowsDone);
    if (rows <= 0) return;
    const out = new Uint8Array(rows * stride);
    const cand = [new Uint8Array(W * bpp), new Uint8Array(W * bpp), new Uint8Array(W * bpp)];
    for (let r = 0; r < rows; r++) {
      const cur = this.cur, prev = this.prev;
      const base = r * W * 4;
      for (let x = 0, j = 0; x < W; x++) {
        const i = base + x * 4;
        cur[j++] = rgba[i]; cur[j++] = rgba[i + 1]; cur[j++] = rgba[i + 2];
        if (bpp === 4) cur[j++] = rgba[i + 3];
      }
      // Filter wählen: Sub, Up, Paeth (minimale Summe)
      let best = 0, bestSum = Infinity;
      for (let f = 0; f < 3; f++) {
        const c = cand[f];
        let sum = 0;
        for (let i = 0; i < cur.length; i++) {
          const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], cc = i >= bpp ? prev[i - bpp] : 0;
          let v;
          if (f === 0) v = cur[i] - a;
          else if (f === 1) v = cur[i] - b;
          else {
            const p = a + b - cc, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - cc);
            v = cur[i] - (pa <= pb && pa <= pc ? a : pb <= pc ? b : cc);
          }
          v &= 255;
          c[i] = v;
          sum += v < 128 ? v : 256 - v;
        }
        if (sum < bestSum) { bestSum = sum; best = f; }
      }
      out[r * stride] = [1, 2, 4][best];
      out.set(cand[best], r * stride + 1);
      this.prev = cur; this.cur = prev;
    }
    this.rowsDone += rows;
    await this.writer.ready;
    await this.writer.write(out);
  }

  async finish() {
    await this.writer.close();
    await this.drained;
    return new Blob([...this.head, ...this.idat, pngChunk('IEND', new Uint8Array(0))], { type: 'image/png' });
  }
}

// Maske malen (Apple Pencil / Finger): „behalten“ oder „entfernen“. Gespeichert in Bildkoordinaten,
// damit sie am Motiv haftet, auch wenn Format oder Ausschnitt geändert werden.
import { makeCanvas, canvasToBlob, loadImage } from '../core/imageio.js';

export class PaintMask {
  constructor(srcW, srcH, maxSide = 768) {
    const s = Math.min(1, maxSide / Math.max(srcW, srcH));
    this.w = Math.max(16, Math.round(srcW * s));
    this.h = Math.max(16, Math.round(srcH * s));
    this.canvas = makeCanvas(this.w, this.h);
    this.g = this.canvas.getContext('2d', { willReadFrequently: true });
    this.clear();
    this.history = [];
  }
  clear() {
    this.g.fillStyle = 'rgb(128,128,128)';
    this.g.fillRect(0, 0, this.w, this.h);
    this.empty = true;
  }
  snapshot() {
    this.history.push(this.g.getImageData(0, 0, this.w, this.h));
    if (this.history.length > 20) this.history.shift();
  }
  undo() {
    const d = this.history.pop();
    if (d) this.g.putImageData(d, 0, 0);
    return !!d;
  }
  /** u,v: ausgerichtete Bildkoordinaten (0..1); radius relativ zur Bildbreite; mode: 'keep' | 'remove' | 'erase' */
  dab(u, v, radius, mode, strength = 1, hardness = 0.4) {
    const x = u * this.w, y = v * this.h, r = Math.max(1.5, radius * this.w);
    const val = mode === 'keep' ? 255 : mode === 'remove' ? 0 : 128;
    const grad = this.g.createRadialGradient(x, y, r * hardness, x, y, r);
    const a = Math.max(0.05, Math.min(1, strength));
    grad.addColorStop(0, `rgba(${val},${val},${val},${a})`);
    grad.addColorStop(1, `rgba(${val},${val},${val},0)`);
    this.g.fillStyle = grad;
    this.g.beginPath();
    this.g.arc(x, y, r, 0, Math.PI * 2);
    this.g.fill();
    this.empty = false;
  }
  stroke(u0, v0, u1, v1, radius, mode, strength) {
    const d = Math.hypot((u1 - u0) * this.w, (v1 - v0) * this.h);
    const step = Math.max(1, radius * this.w * 0.35);
    const n = Math.max(1, Math.ceil(d / step));
    for (let i = 1; i <= n; i++) this.dab(u0 + ((u1 - u0) * i) / n, v0 + ((v1 - v0) * i) / n, radius, mode, strength * 0.6);
  }
  /** Daten für die R8-Textur */
  data() {
    const px = this.g.getImageData(0, 0, this.w, this.h).data;
    const out = new Uint8Array(this.w * this.h);
    for (let i = 0, j = 0; j < out.length; i += 4, j++) out[j] = px[i];
    return out;
  }
  hasContent() {
    if (this.empty) return false;
    const px = this.g.getImageData(0, 0, this.w, this.h).data;
    for (let i = 0; i < px.length; i += 16) if (Math.abs(px[i] - 128) > 6) return true;
    return false;
  }
  toBlob() { return canvasToBlob(this.canvas, 'image/png'); }
  async fromBlob(blob) {
    const img = await loadImage(blob);
    this.g.drawImage(img, 0, 0, this.w, this.h);
    this.empty = false;
  }
}

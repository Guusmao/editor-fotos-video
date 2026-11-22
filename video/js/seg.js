// Remoção de fundo por IA (pessoas) com MediaPipe, rodando no aparelho.
const MODEL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';

export class Segmenter {
  constructor(onStatus) {
    this.state = 'idle'; // idle | loading | ready | error
    this.onStatus = onStatus || (() => {});
    this.seg = null;
    this.out = document.createElement('canvas');
    this.maskC = document.createElement('canvas');
    this.cache = new Map();
    this.lastTs = 0;
  }

  async load() {
    if (this.state === 'ready' || this.state === 'loading') return;
    this.state = 'loading';
    this.onStatus('Baixando modelo de recorte (≈250 KB)…');
    try {
      const base = new URL('../vendor/mediapipe/', import.meta.url).href;
      const { FilesetResolver, ImageSegmenter } = await import('../vendor/mediapipe/vision_bundle.mjs');
      const files = await FilesetResolver.forVisionTasks(base.replace(/\/$/, ''));
      const make = (delegate) => ImageSegmenter.createFromOptions(files, {
        baseOptions: { modelAssetPath: MODEL, delegate },
        runningMode: 'VIDEO', outputCategoryMask: false, outputConfidenceMasks: true,
      });
      try { this.seg = await make('GPU'); } catch (e) { this.seg = await make('CPU'); }
      this.state = 'ready';
      this.onStatus('Recorte por IA pronto.');
    } catch (e) {
      console.error(e);
      this.state = 'error';
      this.onStatus('Não foi possível carregar o recorte por IA: ' + (e.message || e));
    }
  }

  // Recebe um quadro e devolve um canvas com o fundo transparente (ou null se ainda não pronto).
  cutout(frame, w, h, key) {
    if (this.state !== 'ready') { if (this.state === 'idle') this.load(); return null; }
    let mask = this.cache.get(key);
    if (!mask) {
      try {
        let ts = performance.now();
        if (ts <= this.lastTs) ts = this.lastTs + 1;
        this.lastTs = ts;
        let res = null;
        this.seg.segmentForVideo(frame, ts, r => {
          const m = r.confidenceMasks && r.confidenceMasks[0];
          if (m) {
            const mw = m.width, mh = m.height, data = m.getAsFloat32Array();
            const img = new ImageData(mw, mh);
            for (let i = 0; i < data.length; i++) { const a = Math.min(1, Math.max(0, (data[i] - 0.25) * 2)); img.data[i * 4 + 3] = a * 255; }
            res = { img, mw, mh };
          }
        });
        if (!res) return null;
        mask = res;
        if (this.cache.size > 40) this.cache.clear();
        this.cache.set(key, mask);
      } catch (e) { console.warn(e); return null; }
    }
    const mc = this.maskC;
    if (mc.width !== mask.mw || mc.height !== mask.mh) { mc.width = mask.mw; mc.height = mask.mh; }
    mc.getContext('2d').putImageData(mask.img, 0, 0);
    const o = this.out;
    if (o.width !== w || o.height !== h) { o.width = w; o.height = h; }
    const c = o.getContext('2d');
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, w, h);
    c.drawImage(frame, 0, 0, w, h);
    c.globalCompositeOperation = 'destination-in';
    c.imageSmoothingEnabled = true;
    c.drawImage(mc, 0, 0, w, h);
    c.globalCompositeOperation = 'source-over';
    return o;
  }
}

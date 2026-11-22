// Composição de um quadro da linha do tempo num canvas 2D.
import { FX, NEUTRAL, isNeutral, hexToRgb } from './fx.js';
import { FILTERS, EFFECTS } from './catalog.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = t => 1 - Math.pow(1 - t, 3);
const easeInOut = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeBack = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

export const DEFAULT_T = { x: 0.5, y: 0.5, scale: 1, rot: 0, opacity: 1 };

export function transformAt(clip, lt) {
  const base = { ...DEFAULT_T, ...(clip.t || {}) };
  const kf = clip.kf;
  if (!kf || !kf.length) return base;
  if (lt <= kf[0].t) return { ...base, ...pick(kf[0]) };
  const last = kf[kf.length - 1];
  if (lt >= last.t) return { ...base, ...pick(last) };
  for (let i = 0; i < kf.length - 1; i++) {
    const a = kf[i], b = kf[i + 1];
    if (lt >= a.t && lt <= b.t) {
      const p = easeInOut((lt - a.t) / Math.max(1e-4, b.t - a.t));
      const o = {};
      for (const k of ['x', 'y', 'scale', 'rot', 'opacity']) o[k] = lerp(a[k] ?? base[k], b[k] ?? base[k], p);
      return { ...base, ...o };
    }
  }
  return base;
}
function pick(k) { const o = {}; for (const n of ['x', 'y', 'scale', 'rot', 'opacity']) if (k[n] !== undefined) o[n] = k[n]; return o; }

export function animMod(clip, lt) {
  const m = { alpha: 1, dx: 0, dy: 0, mul: 1, dr: 0, blur: 0, chars: 1 };
  const d = clip.dur;
  const apply = (type, e, dir) => {
    switch (type) {
      case 'fade': m.alpha *= e; break;
      case 'up': m.dy += (1 - e) * 0.15 * dir; m.alpha *= e; break;
      case 'down': m.dy -= (1 - e) * 0.15 * dir; m.alpha *= e; break;
      case 'left': m.dx += (1 - e) * 0.35 * dir; m.alpha *= e; break;
      case 'right': m.dx -= (1 - e) * 0.35 * dir; m.alpha *= e; break;
      case 'zoom': m.mul *= 0.3 + 0.7 * e; m.alpha *= e; break;
      case 'shrink': m.mul *= 1 + (1 - e) * 0.8; m.alpha *= e; break;
      case 'pop': m.mul *= Math.max(0.01, easeBack(e)); break;
      case 'spin': m.dr += (1 - e) * -180 * dir; m.mul *= 0.5 + 0.5 * e; m.alpha *= e; break;
      case 'blur': m.blur += (1 - e) * 10; m.alpha *= Math.min(1, e * 1.5); break;
      case 'type': m.chars = Math.min(m.chars, e); break;
    }
  };
  const ai = clip.animIn, ao = clip.animOut;
  if (ai && ai.type && ai.type !== 'none') {
    const p = clamp(lt / Math.max(0.05, ai.dur || 0.5), 0, 1);
    if (p < 1) apply(ai.type, ai.type === 'type' || ai.type === 'pop' ? p : easeOut(p), 1);
  }
  if (ao && ao.type && ao.type !== 'none') {
    const p = clamp((d - lt) / Math.max(0.05, ao.dur || 0.5), 0, 1);
    if (p < 1) apply(ao.type, ao.type === 'type' || ao.type === 'pop' ? p : easeOut(p), -1);
  }
  return m;
}

export function fxParams(clip, lt, extra) {
  const p = { ...NEUTRAL };
  const f = FILTERS.find(x => x.id === (clip.filter?.id || 'none'));
  const fa = clip.filter?.amt ?? 1;
  if (f && f.id !== 'none') for (const k in f.p) p[k] = lerp(NEUTRAL[k], f.p[k], fa);
  const adj = clip.adj || {};
  for (const k in adj) {
    if (k === 'contrast' || k === 'sat') p[k] *= adj[k];
    else p[k] += adj[k] - (NEUTRAL[k] || 0);
  }
  const ef = EFFECTS.find(x => x.id === (clip.effect?.id || 'none'));
  if (ef && ef.fx) { const o = ef.fx(clip.effect.amt ?? 0.7, lt, clip.dur); for (const k in o) p[k] = (k === 'mirror' ? o[k] : p[k] + o[k] - (k === 'contrast' || k === 'sat' ? 1 : 0)); }
  if (clip.chroma?.on) { p.keyOn = 1; p.keyColor = hexToRgb(clip.chroma.color || '#00ff00'); p.keyTol = clip.chroma.tol ?? 0.12; p.keySoft = clip.chroma.soft ?? 0.08; }
  if (extra) for (const k in extra) p[k] = (p[k] || 0) + extra[k];
  return p;
}

export function motionMod(clip, lt) {
  const ef = EFFECTS.find(x => x.id === (clip.effect?.id || 'none'));
  if (!ef || !ef.motion) return null;
  return ef.motion(clip.effect.amt ?? 0.7, lt, clip.dur);
}

export class Renderer {
  constructor(app) {
    this.app = app;
    this.fx = new FX();
    this.small = document.createElement('canvas');
    this.small.width = 48; this.small.height = 48;
    this.tmp = document.createElement('canvas');
    this.boxes = [];
    this.textCache = new Map();
  }

  render(ctx, t, opts = {}) {
    const app = this.app, P = app.project;
    const W = ctx.canvas.width, H = ctx.canvas.height;
    this.W = W; this.H = H;
    this.boxes = [];
    this.editId = opts.editId || null;
    ctx.save();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    const tracks = P.tracks;
    const main = tracks.find(tr => tr.kind === 'main');
    let barsOn = false;
    if (main && !main.hidden) barsOn = this.drawMain(ctx, main, t);
    for (const kind of ['overlay', 'text']) {
      for (const tr of tracks) {
        if (tr.kind !== kind || tr.hidden) continue;
        for (const c of tr.clips) {
          if (t >= c.start && t < c.start + c.dur) this.drawClip(ctx, c, t, null, false);
        }
      }
    }
    if (barsOn) { ctx.fillStyle = '#000'; const b = Math.round(H * 0.11); ctx.fillRect(0, 0, W, b); ctx.fillRect(0, H - b, W, b); }
    ctx.restore();
    if (opts.selId) this.drawSelection(ctx, opts.selId);
  }

  drawMain(ctx, track, t) {
    const clips = track.clips;
    let idx = clips.findIndex(c => t >= c.start && t < c.start + c.dur);
    if (idx < 0) return false;
    const B = clips[idx];
    const tr = B.trans;
    const td = Math.min(tr?.dur || 0.6, B.dur * 0.9);
    const lt = t - B.start;
    const bars = EFFECTS.find(e => e.id === B.effect?.id)?.bars;
    if (!tr || !tr.type || tr.type === 'none' || idx === 0 || lt >= td) {
      this.drawClip(ctx, B, t, null, true);
      return bars;
    }
    const A = clips[idx - 1];
    const tA = A.start + A.dur - 0.001;
    const p = clamp(lt / td, 0, 1);
    const e = easeInOut(p);
    const W = this.W, H = this.H;
    switch (tr.type) {
      case 'dissolver':
        this.drawClip(ctx, A, tA, null, true);
        this.drawClip(ctx, B, t, { alpha: e }, true); break;
      case 'preto': case 'branco': {
        const col = tr.type === 'preto' ? '#000' : '#fff';
        if (p < 0.5) this.drawClip(ctx, A, tA, null, true); else this.drawClip(ctx, B, t, null, true);
        ctx.save(); ctx.globalAlpha = p < 0.5 ? p * 2 : (1 - p) * 2; ctx.fillStyle = col; ctx.fillRect(0, 0, W, H); ctx.restore(); break;
      }
      case 'esquerda':
        this.drawClip(ctx, A, tA, null, true);
        this.drawClip(ctx, B, t, { dx: (1 - e) }, true); break;
      case 'direita':
        this.drawClip(ctx, A, tA, null, true);
        this.drawClip(ctx, B, t, { dx: -(1 - e) }, true); break;
      case 'cima':
        this.drawClip(ctx, A, tA, null, true);
        this.drawClip(ctx, B, t, { dy: (1 - e) }, true); break;
      case 'empurrar':
        this.drawClip(ctx, A, tA, { dx: -e }, true);
        this.drawClip(ctx, B, t, { dx: 1 - e }, true); break;
      case 'zoom':
        this.drawClip(ctx, A, tA, { mul: 1 + e * 1.5, alpha: 1 - e }, true);
        this.drawClip(ctx, B, t, { mul: 0.6 + 0.4 * e, alpha: e }, true); break;
      case 'girar':
        if (p < 0.5) this.drawClip(ctx, A, tA, { dr: e * 180, mul: 1 - e * 0.8 }, true);
        else this.drawClip(ctx, B, t, { dr: -(1 - e) * 180, mul: 0.2 + e * 0.8 }, true);
        break;
      case 'cortina':
        this.drawClip(ctx, A, tA, null, true);
        this.drawClip(ctx, B, t, { clip: c => { c.beginPath(); c.rect(0, 0, W * e, H); } }, true); break;
      case 'circulo':
        this.drawClip(ctx, A, tA, null, true);
        this.drawClip(ctx, B, t, { clip: c => { c.beginPath(); c.arc(W / 2, H / 2, Math.hypot(W, H) / 2 * e, 0, Math.PI * 2); } }, true); break;
      case 'desfoque':
        if (p < 0.5) this.drawClip(ctx, A, tA, { fx: { blur: e * 24 } }, true);
        else this.drawClip(ctx, B, t, { fx: { blur: (1 - e) * 24 } }, true);
        break;
      case 'falha':
        if (p < 0.5) this.drawClip(ctx, A, tA, { fx: { glitch: 1, rgbshift: 10 * e } }, true);
        else this.drawClip(ctx, B, t, { fx: { glitch: 1, rgbshift: 10 * (1 - e) } }, true);
        break;
      default:
        this.drawClip(ctx, B, t, null, true);
    }
    return bars;
  }

  // Desenha um clipe (vídeo, imagem, texto, forma). mod: alterações de transição.
  drawClip(ctx, clip, t, mod, isMain) {
    const lt = clamp(t - clip.start, 0, clip.dur);
    const W = this.W, H = this.H;
    const tf = transformAt(clip, lt);
    // parado e editando: mostra o clipe selecionado sem a animação de entrada/saída
    const am = clip.id === this.editId ? { alpha: 1, dx: 0, dy: 0, mul: 1, dr: 0, blur: 0, chars: 1 } : animMod(clip, lt);
    const mm = motionMod(clip, lt) || {};
    const k = Math.min(W, H) / 1080;
    let alpha = clamp(tf.opacity, 0, 1) * am.alpha * (mod?.alpha ?? 1);
    if (alpha <= 0.001) return;
    const cx = (tf.x + am.dx + (mm.dx || 0) + (mod?.dx || 0)) * W;
    const cy = (tf.y + am.dy + (mm.dy || 0) + (mod?.dy || 0)) * H;
    const scale = tf.scale * am.mul * (1 + (mm.ds || 0)) * (mod?.mul ?? 1);
    const rot = (tf.rot + am.dr + (mm.dr || 0) + (mod?.dr || 0)) * Math.PI / 180;

    ctx.save();
    if (mod?.clip) { mod.clip(ctx); ctx.clip(); }
    if (clip.type === 'text') {
      ctx.globalAlpha = alpha;
      ctx.globalCompositeOperation = clip.blend || 'source-over';
      this.drawText(ctx, clip, lt, cx, cy, scale, rot, am.chars, k);
      ctx.restore();
      return;
    }
    if (clip.type === 'shape') {
      ctx.globalAlpha = alpha;
      ctx.globalCompositeOperation = clip.blend || 'source-over';
      this.drawShape(ctx, clip, cx, cy, scale * k, rot);
      ctx.restore();
      return;
    }
    const app = this.app;
    const media = app.media.get(clip.mediaId);
    if (!media) { ctx.restore(); return; }
    let src, sw, sh;
    if (media.kind === 'video') {
      const el = app.elFor(clip);
      if (!el || el.readyState < 2 || !el.videoWidth) { ctx.restore(); return; }
      src = el; sw = el.videoWidth; sh = el.videoHeight;
    } else if (media.kind === 'image') {
      const img = app.imgFor(media);
      if (!img || !img.complete || !img.naturalWidth) { ctx.restore(); return; }
      src = img; sw = img.naturalWidth; sh = img.naturalHeight;
    } else { ctx.restore(); return; }

    const cr = clip.crop || { l: 0, t: 0, r: 0, b: 0 };
    let rx = cr.l * sw, ry = cr.t * sh, rw = sw * (1 - cr.l - cr.r), rh = sh * (1 - cr.t - cr.b);
    rw = Math.max(2, rw); rh = Math.max(2, rh);
    let frame = src, fk = 1;
    const extra = { ...(mod?.fx || {}) };
    if (am.blur) extra.blur = (extra.blur || 0) + am.blur;
    const params = fxParams(clip, lt, extra);
    if (this.fx.ok && !isNeutral(params)) {
      const out = this.fx.process(src, sw, sh, params, t);
      if (out) { frame = out; fk = out.width / sw; }
    }
    if (clip.bgAI && app.seg) {
      const cut = app.seg.cutout(frame, frame.width || sw, frame.height || sh, clip.id + ':' + (src.currentTime ?? 0));
      if (cut) { frame = cut; fk = cut.width / sw; }
    }
    const fit = clip.fit || (isMain ? 'contain' : 'contain');
    let s = fit === 'cover' ? Math.max(W / rw, H / rh) : Math.min(W / rw, H / rh);
    if (!isMain) s = Math.min(W / rw, H / rh);
    const dw = rw * s * scale, dh = rh * s * scale;

    // Fundo do clipe principal (cor ou desfoque) acompanha a transição.
    if (isMain) {
      const P = app.project;
      ctx.save();
      const offX = (mod?.dx || 0) * W, offY = (mod?.dy || 0) * H;
      ctx.globalAlpha = (mod?.alpha ?? 1);
      if ((P.bg?.type || 'blur') === 'blur') {
        const sm = this.small;
        const ss = Math.max(sm.width / rw, sm.height / rh);
        const sctx = sm.getContext('2d');
        sctx.clearRect(0, 0, sm.width, sm.height);
        sctx.drawImage(frame, rx * fk, ry * fk, rw * fk, rh * fk, (sm.width - rw * ss) / 2, (sm.height - rh * ss) / 2, rw * ss, rh * ss);
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        const cs = Math.max(W, H) * 1.15;
        ctx.drawImage(sm, offX + (W - cs) / 2, offY + (H - cs) / 2, cs, cs);
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(offX, offY, W, H);
      } else {
        ctx.fillStyle = P.bg?.color || '#000';
        ctx.fillRect(offX, offY, W, H);
      }
      ctx.restore();
    }
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = clip.blend || 'source-over';
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.scale(clip.flipH ? -1 : 1, clip.flipV ? -1 : 1);
    if (clip.mask && clip.mask !== 'none') this.applyMask(ctx, clip.mask, dw, dh);
    ctx.drawImage(frame, rx * fk, ry * fk, rw * fk, rh * fk, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
    this.boxes.push({ id: clip.id, cx, cy, w: dw, h: dh, rot });
  }

  applyMask(ctx, mask, w, h) {
    ctx.beginPath();
    if (mask === 'circulo') ctx.ellipse(0, 0, Math.min(w, h) / 2, Math.min(w, h) / 2, 0, 0, Math.PI * 2);
    else if (mask === 'elipse') ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
    else if (mask === 'arredondado') roundRect(ctx, -w / 2, -h / 2, w, h, Math.min(w, h) * 0.12);
    else if (mask === 'coracao') heartPath(ctx, 0, 0, Math.min(w, h));
    else if (mask === 'estrela') starPath(ctx, 0, 0, Math.min(w, h) / 2);
    else ctx.rect(-w / 2, -h / 2, w, h);
    ctx.clip();
  }

  textLayout(ctx, clip, k) {
    const s = clip.text;
    const px = (s.size || 72) * k;
    const font = `${s.italic ? 'italic ' : ''}${s.bold ? 800 : 500} ${px}px ${s.font || 'system-ui, sans-serif'}`;
    const key = [s.content, font, s.spacing || 0, this.W].join('|');
    let lay = this.textCache.get(key);
    if (lay) return lay;
    ctx.save();
    ctx.font = font;
    if ('letterSpacing' in ctx) ctx.letterSpacing = (s.spacing || 0) * k + 'px';
    const maxW = this.W * 0.86;
    const lines = [];
    for (const para of String(s.content || '').split('\n')) {
      const words = para.split(/\s+/).filter(Boolean);
      if (!words.length) { lines.push(''); continue; }
      let cur = words[0];
      for (let i = 1; i < words.length; i++) {
        const test = cur + ' ' + words[i];
        if (ctx.measureText(test).width > maxW) { lines.push(cur); cur = words[i]; } else cur = test;
      }
      lines.push(cur);
    }
    const lh = px * (s.lineHeight || 1.18);
    const widths = lines.map(l => ctx.measureText(l).width);
    const w = Math.max(10, ...widths);
    const h = lh * lines.length;
    ctx.restore();
    lay = { font, px, lines, widths, w, h, lh };
    if (this.textCache.size > 300) this.textCache.clear();
    this.textCache.set(key, lay);
    return lay;
  }

  drawText(ctx, clip, lt, cx, cy, scale, rot, chars, k) {
    const s = clip.text;
    const lay = this.textLayout(ctx, clip, k);
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.scale(scale, scale);
    ctx.font = lay.font;
    if ('letterSpacing' in ctx) ctx.letterSpacing = (s.spacing || 0) * k + 'px';
    ctx.textBaseline = 'middle';
    const align = s.align || 'center';
    ctx.textAlign = align;
    const pad = lay.px * 0.32;
    if (s.bg && s.bg !== 'none') {
      ctx.save();
      ctx.globalAlpha *= s.bgAlpha ?? 1;
      ctx.fillStyle = s.bg;
      if (s.bgMode === 'line') {
        lay.lines.forEach((l, i) => {
          const lw = lay.widths[i]; if (!lw) return;
          const x = align === 'left' ? -lay.w / 2 : align === 'right' ? lay.w / 2 - lw : -lw / 2;
          roundRect(ctx, x - pad, -lay.h / 2 + i * lay.lh - pad * 0.15, lw + pad * 2, lay.lh + pad * 0.3, pad * 0.6); ctx.fill();
        });
      } else {
        roundRect(ctx, -lay.w / 2 - pad, -lay.h / 2 - pad * 0.6, lay.w + pad * 2, lay.h + pad * 1.2, pad * 0.7);
        ctx.fill();
      }
      ctx.restore();
    }
    const totalChars = lay.lines.reduce((a, l) => a + l.length, 0);
    let budget = chars >= 1 ? Infinity : Math.floor(totalChars * chars);
    const x0 = align === 'left' ? -lay.w / 2 : align === 'right' ? lay.w / 2 : 0;
    // Destaque palavra a palavra (estilo karaokê)
    let hiCount = -1;
    if (s.karaoke) {
      const totalWords = lay.lines.reduce((a, l) => a + l.split(/\s+/).filter(Boolean).length, 0);
      hiCount = Math.floor(clamp(lt / Math.max(0.1, clip.dur), 0, 0.999) * totalWords) + 1;
    }
    let wordIdx = 0;
    lay.lines.forEach((line, i) => {
      if (budget <= 0) return;
      let txt = line;
      if (budget < txt.length) txt = txt.slice(0, budget);
      budget -= line.length;
      const y = -lay.h / 2 + lay.lh * (i + 0.5);
      if (s.shadow) { ctx.shadowColor = s.shadowColor || 'rgba(0,0,0,0.75)'; ctx.shadowBlur = lay.px * 0.35 * s.shadow; ctx.shadowOffsetY = s.shadowColor ? 0 : lay.px * 0.06 * s.shadow; }
      if (hiCount < 0) {
        if (s.stroke) { ctx.lineJoin = 'round'; ctx.lineWidth = s.stroke * k * 2; ctx.strokeStyle = s.strokeColor || '#000'; ctx.strokeText(txt, x0, y); ctx.shadowColor = 'transparent'; }
        ctx.fillStyle = s.color || '#fff';
        ctx.fillText(txt, x0, y);
      } else {
        // desenha palavra por palavra
        const words = txt.split(' ');
        const full = ctx.measureText(txt).width;
        let x = align === 'left' ? x0 : align === 'right' ? x0 - full : -full / 2;
        ctx.textAlign = 'left';
        for (const w of words) {
          if (!w) { x += ctx.measureText(' ').width; continue; }
          const on = wordIdx < hiCount;
          const cur = wordIdx === hiCount - 1;
          if (s.stroke) { ctx.lineJoin = 'round'; ctx.lineWidth = s.stroke * k * 2; ctx.strokeStyle = s.strokeColor || '#000'; ctx.strokeText(w, x, y); }
          ctx.fillStyle = cur ? (s.hiColor || '#ffe23d') : on ? (s.color || '#fff') : (s.dimColor || s.color || '#fff');
          ctx.fillText(w, x, y);
          x += ctx.measureText(w + ' ').width;
          wordIdx++;
        }
        ctx.textAlign = align;
      }
      ctx.shadowColor = 'transparent';
    });
    this.boxes.push({ id: clip.id, cx, cy, w: (lay.w + pad * 2) * scale, h: (lay.h + pad * 1.2) * scale, rot });
  }

  drawShape(ctx, clip, cx, cy, scale, rot) {
    const sz = 320;
    ctx.translate(cx, cy); ctx.rotate(rot); ctx.scale(scale, scale);
    ctx.fillStyle = clip.shape?.color || '#ffb547';
    ctx.strokeStyle = clip.shape?.color || '#ffb547';
    ctx.lineWidth = 18; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const id = clip.shape?.id;
    ctx.beginPath();
    if (id === 'seta') { ctx.moveTo(-sz / 2, 0); ctx.lineTo(sz / 2 - 40, 0); ctx.stroke(); ctx.beginPath(); ctx.moveTo(sz / 2, 0); ctx.lineTo(sz / 2 - 90, -70); ctx.lineTo(sz / 2 - 90, 70); ctx.closePath(); ctx.fill(); }
    else if (id === 'circulo') { ctx.arc(0, 0, sz / 2, 0, Math.PI * 2); ctx.stroke(); }
    else if (id === 'balao') { roundRect(ctx, -sz / 2, -sz / 3, sz, sz * 0.55, 50); ctx.fill(); ctx.beginPath(); ctx.moveTo(-40, sz * 0.2); ctx.lineTo(-90, sz * 0.42); ctx.lineTo(20, sz * 0.2); ctx.fill(); }
    else if (id === 'estrela') { starPath(ctx, 0, 0, sz / 2); ctx.fill(); }
    else if (id === 'coracao') { heartPath(ctx, 0, 0, sz); ctx.fill(); }
    else if (id === 'moldura') { ctx.lineWidth = 14; ctx.strokeRect(-sz / 2, -sz * 0.4, sz, sz * 0.8); }
    this.boxes.push({ id: clip.id, cx, cy, w: sz * scale, h: sz * scale, rot });
  }

  drawSelection(ctx, id) {
    const b = this.boxes.find(x => x.id === id);
    if (!b) return;
    const k = Math.min(this.W, this.H) / 1080;
    ctx.save();
    ctx.translate(b.cx, b.cy); ctx.rotate(b.rot);
    ctx.strokeStyle = '#ffb547'; ctx.lineWidth = 3 * k * 1.5;
    ctx.setLineDash([12 * k, 8 * k]);
    ctx.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h);
    ctx.setLineDash([]);
    ctx.fillStyle = '#ffb547';
    ctx.beginPath(); ctx.arc(b.w / 2, b.h / 2, 22 * k, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a1206'; ctx.font = `${26 * k}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('⤡', b.w / 2, b.h / 2 + 1);
    ctx.restore();
  }
}

export function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function starPath(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5; const rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.closePath();
}
function heartPath(ctx, x, y, s) {
  const k = s / 2;
  ctx.beginPath();
  ctx.moveTo(x, y + k * 0.75);
  ctx.bezierCurveTo(x - k * 1.2, y - k * 0.1, x - k * 0.55, y - k * 0.95, x, y - k * 0.35);
  ctx.bezierCurveTo(x + k * 0.55, y - k * 0.95, x + k * 1.2, y - k * 0.1, x, y + k * 0.75);
  ctx.closePath();
}

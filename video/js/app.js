// Rolo: editor de vídeo no navegador. Núcleo: mídia, reprodução, linha do tempo, prévia e histórico.
import { db, persistStorage } from './store.js';
import { Renderer } from './render.js';
import { Segmenter } from './seg.js';
import {
  A, uid, clamp, clone, fmtTime, newProject, aspectOf, mainTrack, findClip, selected, packMain, duration,
  sortTrack, overlaps, placeClip, removeEmptyTracks, baseClip, mediaMaxDur, writeTransform, currentTransform, clipLabel, volumeAt,
} from './state.js';
import { buildTools, closeSheet, initPanels } from './panels.js';

const $ = id => document.getElementById(id);
const view = $('view');
const ctx = view.getContext('2d');
const renderer = new Renderer(A);
A.renderer = renderer;
A.seg = new Segmenter(msg => toast(msg));

// ---------- utilidades de interface ----------
let toastTimer = 0;
export function toast(msg, ms = 2600) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), ms);
}
A.toast = toast;
export function markDirty() { A.dirty = true; }
A.markDirty = markDirty;

// ---------- histórico e salvamento ----------
let history = [], future = [], lastSnap = null, commitTimer = 0, saveTimer = 0;
function snap() { return JSON.stringify(A.project); }
export function commit(now = false) {
  clearTimeout(commitTimer);
  const doIt = () => {
    const s = snap();
    if (s === lastSnap) return;
    if (lastSnap) history.push(lastSnap);
    if (history.length > 80) history.shift();
    lastSnap = s; future = [];
    scheduleSave();
    updateUndo();
  };
  if (now) doIt(); else commitTimer = setTimeout(doIt, 350);
}
A.commit = commit;
function resetHistory() { history = []; future = []; lastSnap = snap(); updateUndo(); }
function undo() {
  commit(true);
  if (!history.length) return;
  future.push(lastSnap);
  lastSnap = history.pop();
  A.project = JSON.parse(lastSnap);
  if (!findClip(A.sel)) A.sel = null;
  refreshAll(); scheduleSave(); updateUndo();
}
function redo() {
  if (!future.length) return;
  history.push(lastSnap);
  lastSnap = future.pop();
  A.project = JSON.parse(lastSnap);
  if (!findClip(A.sel)) A.sel = null;
  refreshAll(); scheduleSave(); updateUndo();
}
function updateUndo() { $('btnUndo').disabled = !history.length; $('btnRedo').disabled = !future.length; }
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveProject, 700);
}
export async function saveProject() {
  if (!A.project) return;
  A.project.updated = Date.now();
  try { await db.put('projects', clone(A.project)); localStorage.setItem('rolo-last', A.project.id); } catch (e) { console.warn('save', e); }
}
A.saveProject = saveProject;

// Atualiza tudo depois de uma mudança estrutural.
export function refreshAll() {
  packMain();
  removeEmptyTracks();
  sizeCanvas();
  renderTimeline();
  buildTools();
  $('projName').textContent = A.project.name;
  $('btnAspect').textContent = A.project.aspect;
  $('emptyHint').style.display = duration() > 0 ? 'none' : 'flex';
  markDirty();
}
A.refreshAll = refreshAll;
export function changed(structural = true) {
  if (structural) refreshAll(); else markDirty();
  commit();
}
A.changed = changed;

// ---------- mídia ----------
const holder = document.createElement('div');
holder.style.cssText = 'position:fixed;left:-10px;top:-10px;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
document.body.appendChild(holder);

function probe(url, kind) {
  return new Promise((res) => {
    if (kind === 'image') {
      const img = new Image();
      img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight, duration: Infinity, img });
      img.onerror = () => res(null);
      img.src = url;
      return;
    }
    const v = document.createElement('video');
    v.preload = 'metadata'; v.muted = true; v.playsInline = true;
    let done = false;
    const finish = (o) => { if (done) return; done = true; res(o); };
    v.onloadedmetadata = () => {
      if (v.duration === Infinity || isNaN(v.duration)) {
        v.currentTime = 1e7;
        v.ontimeupdate = () => { v.ontimeupdate = null; const d = v.duration; v.currentTime = 0; finish({ w: v.videoWidth, h: v.videoHeight, duration: isFinite(d) ? d : 10, v }); };
      } else finish({ w: v.videoWidth, h: v.videoHeight, duration: v.duration, v });
    };
    v.onerror = () => finish(null);
    setTimeout(() => finish(null), 15000);
    v.src = url;
  });
}

function kindOf(file) {
  const t = file.type || '';
  if (t.startsWith('image/')) return 'image';
  if (t.startsWith('audio/')) return 'audio';
  if (t.startsWith('video/')) return 'video';
  const n = (file.name || '').toLowerCase();
  if (/\.(jpe?g|png|gif|webp|heic|avif|bmp)$/.test(n)) return 'image';
  if (/\.(mp3|wav|m4a|aac|ogg|oga|flac|opus)$/.test(n)) return 'audio';
  return 'video';
}

async function makeThumbs(m, v) {
  try {
    if (m.kind === 'image') {
      const img = m._img || await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = m.url; });
      const c = document.createElement('canvas'); const h = 60; c.height = h; c.width = Math.max(20, Math.round(h * img.naturalWidth / img.naturalHeight));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      m.thumb = c.toDataURL('image/jpeg', 0.6);
      return;
    }
    if (m.kind !== 'video' || !m.w) return;
    const vid = document.createElement('video'); vid.muted = true; vid.playsInline = true; vid.preload = 'auto'; vid.src = m.url;
    await new Promise(r => { vid.onloadeddata = r; vid.onerror = r; setTimeout(r, 6000); });
    const n = clamp(Math.ceil(m.duration / 2), 4, 16);
    const th = 56, tw = Math.round(th * m.w / m.h);
    const c = document.createElement('canvas'); c.width = tw * n; c.height = th;
    const cx = c.getContext('2d');
    for (let i = 0; i < n; i++) {
      await new Promise(r => { const tm = setTimeout(r, 2500); vid.onseeked = () => { clearTimeout(tm); r(); }; vid.currentTime = Math.min(m.duration - 0.05, (i + 0.5) * m.duration / n); });
      try { cx.drawImage(vid, i * tw, 0, tw, th); } catch (e) {}
    }
    m.thumb = c.toDataURL('image/jpeg', 0.55);
    vid.removeAttribute('src'); vid.load();
  } catch (e) { console.warn('thumbs', e); }
}

async function makeWave(m) {
  try {
    if (m.blob.size > 120 * 1024 * 1024) return;
    const buf = await m.blob.arrayBuffer();
    const ac = new OfflineAudioContext(1, 8000, 8000);
    const ab = await ac.decodeAudioData(buf);
    const d = ab.getChannelData(0);
    const bins = 800, step = Math.max(1, Math.floor(d.length / bins));
    const c = document.createElement('canvas'); c.width = bins; c.height = 60;
    const cx = c.getContext('2d'); cx.fillStyle = 'rgba(255,255,255,.75)';
    for (let i = 0; i < bins; i++) {
      let mx = 0; for (let j = i * step; j < (i + 1) * step && j < d.length; j++) mx = Math.max(mx, Math.abs(d[j]));
      const h = Math.max(1, mx * 56); cx.fillRect(i, 30 - h / 2, 1, h);
    }
    m.wave = c.toDataURL('image/png');
  } catch (e) { /* vídeo sem áudio */ }
}

// Importa arquivos/blobs como mídia do projeto.
export async function importBlob(blob, name, forceKind) {
  const kind = forceKind || kindOf(blob);
  const id = uid('m');
  const url = URL.createObjectURL(blob);
  const info = await probe(url, kind === 'audio' ? 'video' : kind);
  if (!info) { toast('Formato não suportado: ' + (name || 'arquivo')); URL.revokeObjectURL(url); return null; }
  const m = { id, kind, name: name || 'Mídia', url, blob, duration: info.duration, w: info.w || 0, h: info.h || 0, projectId: A.project.id };
  if (kind === 'image') m._img = info.img;
  A.media.set(id, m);
  await Promise.all([makeThumbs(m), kind === 'audio' ? makeWave(m) : Promise.resolve()]);
  const { url: _u, _img, ...rec } = m;
  db.put('media', rec).catch(e => { console.warn(e); toast('Pouco espaço: a mídia não foi salva no aparelho.'); });
  return m;
}
A.importBlob = importBlob;

export function clipFromMedia(m, extra = {}) {
  const dur = m.kind === 'image' ? 3 : m.duration;
  const type = m.kind === 'audio' ? 'audio' : m.kind;
  return baseClip(type, { mediaId: m.id, dur, ...extra });
}

export async function addFiles(files, target = 'main') {
  files = Array.from(files || []);
  if (!files.length) return;
  toast(files.length > 1 ? `Importando ${files.length} arquivos…` : 'Importando…', 8000);
  let firstId = null, insertAt = null;
  for (const f of files) {
    const m = await importBlob(f, f.name);
    if (!m) continue;
    let clip;
    if (m.kind === 'audio' || target === 'audio') {
      clip = clipFromMedia(m, { type: 'audio', start: A.t });
      placeClip('audio', clip);
    } else if (target === 'overlay') {
      clip = clipFromMedia(m, { start: A.t, t: { x: 0.5, y: 0.5, scale: 0.5, rot: 0, opacity: 1 } });
      placeClip('overlay', clip);
    } else {
      clip = clipFromMedia(m);
      const tr = mainTrack();
      // insere depois do clipe sob o cursor, mantendo a ordem dos arquivos escolhidos
      if (insertAt == null) { const idx = tr.clips.findIndex(c => A.t >= c.start && A.t < c.start + c.dur); insertAt = idx >= 0 ? idx + 1 : tr.clips.length; }
      tr.clips.splice(insertAt++, 0, clip);
      packMain();
    }
    firstId = firstId || clip.id;
  }
  toast('Pronto!');
  if (firstId) A.sel = firstId;
  changed();
}
A.addFiles = addFiles;

// Um <video> por clipe, ligado ao mixer de áudio.
const els = new Map();
const imgs = new Map();
let ac = null, master = null, speakerOn = true;

export function ensureAudio() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
    master = ac.createGain();
    master.connect(ac.destination);
    for (const el of els.values()) connectEl(el);
  }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}
A.audio = () => ({ ac, master });
A.setSpeaker = (on) => {
  if (!master) return;
  if (on && !speakerOn) master.connect(ac.destination);
  if (!on && speakerOn) { try { master.disconnect(ac.destination); } catch (e) {} }
  speakerOn = on;
};
function connectEl(el) {
  if (!ac || el._node) return;
  try {
    el._node = ac.createMediaElementSource(el);
    el._gain = ac.createGain();
    el._node.connect(el._gain); el._gain.connect(master);
  } catch (e) { console.warn('audio node', e); }
}
function setVol(el, v) {
  if (el._gain) { el._gain.gain.value = v; el.volume = 1; }
  else el.volume = clamp(v, 0, 1);
}

export function elFor(clip) {
  let el = els.get(clip.id);
  const m = A.media.get(clip.mediaId);
  if (!m) return null;
  if (el && el._mediaId === clip.mediaId) return el;
  if (el) { el.pause(); el.remove(); }
  el = document.createElement('video');
  el.playsInline = true; el.preload = 'auto';
  el.setAttribute('playsinline', '');
  el._mediaId = clip.mediaId;
  el.src = m.url;
  el.addEventListener('seeked', markDirty);
  el.addEventListener('loadeddata', markDirty);
  holder.appendChild(el);
  connectEl(el);
  els.set(clip.id, el);
  return el;
}
A.elFor = elFor;
export function imgFor(m) {
  let img = imgs.get(m.id);
  if (img) return img;
  img = m._img || new Image();
  if (!m._img) { img.onload = markDirty; img.src = m.url; }
  imgs.set(m.id, img);
  return img;
}
A.imgFor = imgFor;
function dropElements() {
  for (const el of els.values()) { el.pause(); el.removeAttribute('src'); el.load(); el.remove(); }
  els.clear(); imgs.clear();
}

// Sincroniza cada mídia com o relógio da linha do tempo.
function syncMedia(t, playing) {
  const P = A.project;
  const hold = new Set();
  const main = mainTrack();
  // clipe anterior congelado durante a transição
  const bi = main.clips.findIndex(c => t >= c.start && t < c.start + c.dur);
  if (bi > 0) {
    const B = main.clips[bi];
    if (B.trans && B.trans.type !== 'none' && t - B.start < Math.min(B.trans.dur, B.dur * 0.9)) hold.add(main.clips[bi - 1].id);
  }
  const live = new Set();
  for (const tr of P.tracks) {
    for (const c of tr.clips) {
      const m = A.media.get(c.mediaId);
      if (!m || m.kind === 'image') continue;
      live.add(c.id);
      const el = elFor(c);
      if (!el) continue;
      const active = t >= c.start && t < c.start + c.dur;
      const isVisual = c.type === 'video';
      if (active) {
        const target = c.in + (t - c.start) * c.speed;
        const rate = clamp(c.speed, 0.0625, 16);
        if (el.playbackRate !== rate) el.playbackRate = rate;
        const muted = tr.muted || (A.recordingMute);
        setVol(el, muted ? 0 : volumeAt(c, t - c.start));
        if (playing) {
          if (el.paused) { try { el.currentTime = target; } catch (e) {} const p = el.play(); if (p) p.catch(() => {}); }
          else if (Math.abs(el.currentTime - target) > 0.3) el.currentTime = target;
        } else {
          if (!el.paused) el.pause();
          if (Math.abs(el.currentTime - target) > 0.03 && !el.seeking) el.currentTime = target;
        }
      } else if (hold.has(c.id) && isVisual) {
        if (!el.paused) el.pause();
        const end = c.in + c.dur * c.speed - 0.04;
        if (Math.abs(el.currentTime - end) > 0.1 && !el.seeking) el.currentTime = end;
      } else {
        if (!el.paused) el.pause();
        // pré-carrega o início do próximo trecho
        if (t < c.start && c.start - t < 1.5 && Math.abs(el.currentTime - c.in) > 0.05 && !el.seeking) el.currentTime = c.in;
      }
    }
  }
  for (const [id, el] of els) if (!live.has(id)) { el.pause(); }
}

// ---------- reprodução ----------
let clock0 = 0, t0 = 0;
export function play() {
  if (A.playing) return;
  ensureAudio();
  const d = duration();
  if (d <= 0) return;
  if (A.t >= d - 0.05) A.t = 0;
  A.playing = true; t0 = A.t; clock0 = performance.now();
  $('btnPlay').textContent = '❚❚';
}
export function pause() {
  if (!A.playing) return;
  A.playing = false;
  $('btnPlay').textContent = '▶';
  syncMedia(A.t, false);
  markDirty();
  buildTools();
}
A.play = play; A.pause = pause;
export function seek(t) {
  A.t = clamp(t, 0, Math.max(0, duration()));
  if (A.playing) { t0 = A.t; clock0 = performance.now(); }
  markDirty();
}
A.seek = seek;
A.onEnd = null;

function loop() {
  requestAnimationFrame(loop);
  if (A.playing) {
    A.t = t0 + (performance.now() - clock0) / 1000;
    const d = duration();
    if (A.t >= d) {
      A.t = d;
      if (A.onEnd) { const f = A.onEnd; A.onEnd = null; syncMedia(A.t, false); renderer.render(ctx, Math.max(0, d - 0.001)); f(); }
      pause();
      return;
    }
    syncMedia(A.t, true);
    renderer.render(ctx, A.t, { selId: A.exporting ? null : A.sel });
    updatePlayhead(true);
    return;
  }
  if (!A.dirty) return;
  A.dirty = false;
  syncMedia(A.t, false);
  renderer.render(ctx, A.t, { selId: A.exporting ? null : A.sel, editId: A.exporting ? null : A.sel });
  updatePlayhead(false);
}

// ---------- prévia ----------
export function sizeCanvas(exportSize) {
  const asp = aspectOf(A.project);
  let w, h;
  if (exportSize) { w = exportSize.w; h = exportSize.h; }
  else {
    const maxLong = 960;
    const s = Math.min(1, maxLong / Math.max(asp.w, asp.h));
    w = Math.round(asp.w * s / 2) * 2; h = Math.round(asp.h * s / 2) * 2;
  }
  if (view.width !== w || view.height !== h) { view.width = w; view.height = h; }
  fitCanvasCss();
  markDirty();
}
A.sizeCanvas = sizeCanvas;
function fitCanvasCss() {
  const st = $('stage');
  const asp = aspectOf(A.project);
  const aw = st.clientWidth - 20, ah = st.clientHeight - 20;
  const s = Math.min(aw / asp.w, ah / asp.h);
  view.style.width = Math.max(40, Math.floor(asp.w * s)) + 'px';
  view.style.height = Math.max(40, Math.floor(asp.h * s)) + 'px';
}
new ResizeObserver(() => { if (A.project) fitCanvasCss(); }).observe($('stage'));

// Interação direta na prévia: tocar seleciona, arrastar move, pinça escala e gira.
(function canvasGestures() {
  const pts = new Map();
  let g = null;
  const toCanvas = (e) => { const r = view.getBoundingClientRect(); return { x: (e.clientX - r.left) * view.width / r.width, y: (e.clientY - r.top) * view.height / r.height }; };
  const hit = (p) => {
    const bs = renderer.boxes;
    for (let i = bs.length - 1; i >= 0; i--) {
      const b = bs[i];
      const dx = p.x - b.cx, dy = p.y - b.cy;
      const c = Math.cos(-b.rot), s = Math.sin(-b.rot);
      const lx = dx * c - dy * s, ly = dx * s + dy * c;
      if (Math.abs(lx) <= b.w / 2 + 6 && Math.abs(ly) <= b.h / 2 + 6) return b;
    }
    return null;
  };
  view.addEventListener('pointerdown', (e) => {
    if (A.exporting) return;
    view.setPointerCapture(e.pointerId);
    const p = toCanvas(e);
    pts.set(e.pointerId, p);
    if (A.playing) pause();
    if (pts.size === 2 && g && g.clip) {
      const [a, b] = [...pts.values()];
      const cur = currentTransform(g.clip);
      g = { ...g, mode: 'pinch', d0: Math.hypot(b.x - a.x, b.y - a.y), a0: Math.atan2(b.y - a.y, b.x - a.x), s0: cur.scale, r0: cur.rot };
      return;
    }
    const k = Math.min(view.width, view.height) / 1080;
    const selBox = renderer.boxes.find(b => b.id === A.sel);
    if (selBox) {
      const c = Math.cos(selBox.rot), s = Math.sin(selBox.rot);
      const hx = selBox.cx + (selBox.w / 2) * c - (selBox.h / 2) * s;
      const hy = selBox.cy + (selBox.w / 2) * s + (selBox.h / 2) * c;
      if (Math.hypot(p.x - hx, p.y - hy) < 40 * k && Math.min(selBox.w, selBox.h) > 30 * k) {
        const fc = findClip(A.sel); const cur = currentTransform(fc.clip);
        g = { mode: 'handle', clip: fc.clip, cx: selBox.cx, cy: selBox.cy, d0: Math.max(12, Math.hypot(p.x - selBox.cx, p.y - selBox.cy)), a0: Math.atan2(p.y - selBox.cy, p.x - selBox.cx), s0: cur.scale, r0: cur.rot };
        return;
      }
    }
    const b = hit(p);
    if (!b) { g = { mode: 'none', p0: p }; return; }
    const fc = findClip(b.id);
    if (!fc) return;
    if (A.sel !== b.id) { A.sel = b.id; renderTimeline(); buildTools(); markDirty(); }
    const cur = currentTransform(fc.clip);
    g = { mode: 'move', clip: fc.clip, p0: p, x0: cur.x, y0: cur.y, moved: false };
  });
  view.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId) || !g) return;
    const p = toCanvas(e);
    pts.set(e.pointerId, p);
    const W = view.width, H = view.height;
    if (g.mode === 'move') {
      const dx = (p.x - g.p0.x) / W, dy = (p.y - g.p0.y) / H;
      if (!g.moved && Math.hypot(p.x - g.p0.x, p.y - g.p0.y) < 4) return;
      g.moved = true;
      let nx = g.x0 + dx, ny = g.y0 + dy;
      if (Math.abs(nx - 0.5) < 0.015) nx = 0.5;
      if (Math.abs(ny - 0.5) < 0.015) ny = 0.5;
      writeTransform(g.clip, { x: nx, y: ny });
      markDirty();
    } else if (g.mode === 'pinch' && pts.size >= 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(b.x - a.x, b.y - a.y), an = Math.atan2(b.y - a.y, b.x - a.x);
      writeTransform(g.clip, { scale: clamp(g.s0 * d / g.d0, 0.05, 10), rot: g.r0 + (an - g.a0) * 180 / Math.PI });
      markDirty();
    } else if (g.mode === 'handle') {
      const d = Math.hypot(p.x - g.cx, p.y - g.cy), an = Math.atan2(p.y - g.cy, p.x - g.cx);
      let rot = g.r0 + (an - g.a0) * 180 / Math.PI;
      const snapR = Math.round(rot / 90) * 90; if (Math.abs(rot - snapR) < 4) rot = snapR;
      writeTransform(g.clip, { scale: clamp(g.s0 * d / g.d0, 0.05, 10), rot });
      markDirty();
    }
  });
  const end = (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (!g) return;
    if (g.mode === 'none' && pts.size === 0) {
      if (A.sel) { A.sel = null; renderTimeline(); buildTools(); markDirty(); }
    }
    if (pts.size === 0) {
      if (g.mode !== 'none' && (g.moved || g.mode !== 'move')) { commit(); renderTimeline(); }
      g = null;
    } else if (g.mode === 'pinch') {
      const rest = [...pts.values()][0]; const cur = currentTransform(g.clip);
      g = { mode: 'move', clip: g.clip, p0: rest, x0: cur.x, y0: cur.y, moved: true };
    }
  };
  view.addEventListener('pointerup', end);
  view.addEventListener('pointercancel', end);
  view.addEventListener('wheel', (e) => {
    const fc = selected(); if (!fc || fc.clip.type === 'audio') return;
    e.preventDefault();
    const cur = currentTransform(fc.clip);
    if (e.shiftKey) writeTransform(fc.clip, { rot: cur.rot + (e.deltaY > 0 ? 3 : -3) });
    else writeTransform(fc.clip, { scale: clamp(cur.scale * (e.deltaY > 0 ? 0.95 : 1.05), 0.05, 10) });
    markDirty(); commit();
  }, { passive: false });
})();

// ---------- linha do tempo ----------
const tlScroll = $('tlScroll'), tlInner = $('tlInner'), tracksEl = $('tracks'), rulerEl = $('ruler'), playheadEl = $('playhead');
const PAD = 12;
const xOf = t => PAD + t * A.pps;
const tOf = x => (x - PAD) / A.pps;

function trackOrder() {
  const P = A.project;
  const by = k => P.tracks.filter(t => t.kind === k);
  return [...by('text').reverse(), ...by('overlay').reverse(), ...by('main'), ...by('audio')];
}

export function renderTimeline() {
  const P = A.project;
  const d = duration();
  const width = xOf(d) + Math.max(tlScroll.clientWidth * 0.7, 200);
  tlInner.style.width = width + 'px';
  // régua
  const cands = [0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
  const step = cands.find(s => s * A.pps >= 64) || 600;
  let html = '';
  const end = tOf(width);
  for (let s = 0; s <= end; s += step) html += `<div class="tick" style="left:${xOf(s)}px">${fmtTime(s, step < 1)}</div>`;
  for (let s = step / 2; s <= end; s += step) html += `<div class="tick minor" style="left:${xOf(s)}px"></div>`;
  rulerEl.innerHTML = html;
  // faixas
  tracksEl.innerHTML = '';
  for (const tr of trackOrder()) {
    const row = document.createElement('div');
    row.className = 'track ' + tr.kind;
    row.dataset.track = tr.id;
    row.dataset.kind = tr.kind;
    const canMute = tr.kind === 'main' || tr.kind === 'audio' || tr.kind === 'overlay';
    const btns = document.createElement('div');
    btns.className = 'tbtns';
    btns.style.left = (tlScroll.scrollLeft) + 'px';
    if (canMute) btns.appendChild(mkTBtn(tr.muted ? '🔇' : '🔊', tr.muted ? 'Ativar som da faixa' : 'Silenciar faixa', () => { tr.muted = !tr.muted; changed(); }));
    if (tr.kind !== 'audio') btns.appendChild(mkTBtn(tr.hidden ? '🙈' : '👁', tr.hidden ? 'Mostrar faixa' : 'Ocultar faixa', () => { tr.hidden = !tr.hidden; changed(); }));
    row.appendChild(btns);
    for (const c of tr.clips) row.appendChild(clipEl(c, tr));
    if (tr.kind === 'main') {
      tr.clips.forEach((c, i) => {
        if (i === 0) return;
        const b = document.createElement('button');
        b.className = 'trans-dot' + (c.trans?.type && c.trans.type !== 'none' ? ' on' : '');
        b.style.left = xOf(c.start) + 'px';
        b.textContent = c.trans?.type && c.trans.type !== 'none' ? '⧓' : '＋';
        b.title = 'Transição';
        b.addEventListener('click', (e) => { e.stopPropagation(); A.sel = c.id; renderTimeline(); buildTools(); markDirty(); A.openPanel('transition'); });
        row.appendChild(b);
      });
    }
    tracksEl.appendChild(row);
  }
  updatePlayhead(false);
}
A.renderTimeline = renderTimeline;
function mkTBtn(txt, title, fn) {
  const b = document.createElement('button');
  b.className = 'icon'; b.style.cssText = 'width:24px;height:24px;font-size:12px;background:rgba(0,0,0,.45);border-radius:6px';
  b.textContent = txt; b.title = title;
  b.addEventListener('pointerdown', e => e.stopPropagation());
  b.addEventListener('click', e => { e.stopPropagation(); fn(); });
  return b;
}
tlScroll.addEventListener('scroll', () => { for (const b of tracksEl.querySelectorAll('.tbtns')) b.style.left = tlScroll.scrollLeft + 'px'; });

function clipEl(c, tr) {
  const el = document.createElement('div');
  const m = A.media.get(c.mediaId);
  let cls = 'clip';
  if (c.type === 'text') cls += c.caption ? ' caption' : ' text';
  else if (c.type === 'shape') cls += ' shape';
  else if (tr.kind === 'audio') cls += ' audio';
  else if (tr.kind === 'overlay') cls += ' overlay';
  if (c.id === A.sel) cls += ' sel';
  el.className = cls;
  el.dataset.id = c.id;
  const w = Math.max(6, c.dur * A.pps);
  el.style.left = xOf(c.start) + 'px';
  el.style.width = w + 'px';
  if (m && tr.kind !== 'audio' && m.thumb && c.type !== 'audio') {
    if (m.kind === 'video' && isFinite(m.duration)) {
      const full = w * m.duration / (c.dur * c.speed);
      el.style.backgroundImage = `url(${m.thumb})`;
      el.style.backgroundSize = `${full}px 100%`;
      el.style.backgroundPosition = `${-(c.in / m.duration) * full}px 0`;
    } else {
      el.style.backgroundImage = `url(${m.thumb})`;
      el.style.backgroundSize = 'auto 100%';
      el.style.backgroundRepeat = 'repeat-x';
    }
  } else if (m && m.wave && isFinite(m.duration)) {
    const full = w * m.duration / (c.dur * c.speed);
    el.style.backgroundImage = `url(${m.wave})`;
    el.style.backgroundSize = `${full}px 100%`;
    el.style.backgroundPosition = `${-(c.in / m.duration) * full}px 0`;
  }
  const name = document.createElement('div'); name.className = 'cname';
  name.textContent = (c.type === 'audio' ? '♪ ' : '') + clipLabel(c);
  el.appendChild(name);
  const badges = [];
  if (c.speed !== 1) badges.push(c.speed.toFixed(2).replace(/\.?0+$/, '') + '×');
  if (c.filter?.id && c.filter.id !== 'none') badges.push('🎨');
  if (c.effect?.id && c.effect.id !== 'none') badges.push('✨');
  if (c.bgAI || c.chroma?.on) badges.push('✂');
  if ((c.type === 'video' || c.type === 'audio') && c.volume === 0) badges.push('🔇');
  if (badges.length) { const b = document.createElement('div'); b.className = 'cbadges'; b.innerHTML = badges.map(x => `<span>${x}</span>`).join(''); el.appendChild(b); }
  for (const k of c.kf || []) { const d = document.createElement('div'); d.className = 'kf'; d.style.left = (k.t / c.dur * 100) + '%'; el.appendChild(d); }
  const hl = document.createElement('div'); hl.className = 'h l'; hl.textContent = '‹';
  const hr = document.createElement('div'); hr.className = 'h r'; hr.textContent = '›';
  el.appendChild(hl); el.appendChild(hr);
  el.style.touchAction = c.id === A.sel ? 'none' : 'pan-x pan-y';
  el.addEventListener('pointerdown', (e) => clipPointer(e, c, tr, el, e.target === hl ? 'l' : e.target === hr ? 'r' : 'move'));
  return el;
}

let snapEl = null;
function showSnap(t) {
  if (t == null) { if (snapEl) snapEl.remove(); snapEl = null; return; }
  if (!snapEl) { snapEl = document.createElement('div'); snapEl.className = 'snapline'; tlInner.appendChild(snapEl); }
  snapEl.style.left = xOf(t) + 'px';
}
function snapPoints(exceptId) {
  const pts = [A.t, 0];
  for (const tr of A.project.tracks) for (const c of tr.clips) if (c.id !== exceptId) { pts.push(c.start, c.start + c.dur); }
  return pts;
}
function snapTo(t, pts) {
  const th = 8 / A.pps;
  let best = null, bd = th;
  for (const p of pts) { const d = Math.abs(p - t); if (d < bd) { bd = d; best = p; } }
  return best;
}

function clipPointer(e, c, tr, el, mode) {
  if (e.button > 0) return;
  e.stopPropagation();
  const isSel = A.sel === c.id;
  if (A.playing) pause();
  const x0 = e.clientX, y0 = e.clientY;
  const orig = { start: c.start, dur: c.dur, in: c.in };
  let moved = false;
  const pts = snapPoints(c.id);
  const isTouch = e.pointerType === 'touch';
  if (!isSel && isTouch) {
    // no toque, primeiro toque só seleciona (deixa rolar a linha do tempo)
    const up = (ev) => {
      el.removeEventListener('pointerup', up);
      if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 10) { A.sel = c.id; renderTimeline(); buildTools(); markDirty(); }
    };
    el.addEventListener('pointerup', up);
    return;
  }
  el.setPointerCapture(e.pointerId);
  if (!isSel) { A.sel = c.id; el.classList.add('sel'); for (const o of tracksEl.querySelectorAll('.clip.sel')) if (o !== el) o.classList.remove('sel'); buildTools(); markDirty(); }
  const onMove = (ev) => {
    const dx = ev.clientX - x0, dy = ev.clientY - y0;
    if (!moved && Math.hypot(dx, dy) < 5) return;
    moved = true;
    const dt = dx / A.pps;
    if (mode === 'move') {
      if (tr.kind === 'main') {
        el.style.transform = `translateX(${dx}px)`; el.style.zIndex = 20; el.style.opacity = .85;
      } else {
        let ns = Math.max(0, orig.start + dt);
        const s1 = snapTo(ns, pts), s2 = snapTo(ns + c.dur, pts);
        if (s1 != null) { ns = s1; showSnap(s1); } else if (s2 != null) { ns = s2 - c.dur; showSnap(s2); } else showSnap(null);
        c.start = Math.max(0, ns);
        el.style.left = xOf(c.start) + 'px';
        el.style.transform = `translateY(${dy}px)`; el.style.zIndex = 20;
      }
    } else if (mode === 'r') {
      let nd = Math.max(0.1, orig.dur + dt);
      const lim = c.type === 'video' || c.type === 'audio' ? (mediaMaxDur(c)) : Infinity;
      nd = Math.min(nd, lim);
      const s = snapTo(c.start + nd, pts); if (s != null && s - c.start >= 0.1 && s - c.start <= lim) { nd = s - c.start; showSnap(s); } else showSnap(null);
      c.dur = nd;
      if (c.kf) c.kf = c.kf.filter(k => k.t <= nd);
      el.style.width = c.dur * A.pps + 'px';
    } else if (mode === 'l') {
      const hasSrc = c.type === 'video' || c.type === 'audio';
      let delta = dt; // positivo encurta
      if (hasSrc) delta = Math.max(delta, -orig.in / c.speed);
      if (tr.kind !== 'main') delta = Math.max(delta, -orig.start);
      delta = Math.min(delta, orig.dur - 0.1);
      if (tr.kind !== 'main') { const s = snapTo(orig.start + delta, pts); if (s != null) { const d2 = s - orig.start; if (d2 <= orig.dur - 0.1 && (!hasSrc || d2 >= -orig.in / c.speed)) { delta = d2; showSnap(s); } } else showSnap(null); }
      c.dur = orig.dur - delta;
      if (hasSrc) c.in = orig.in + delta * c.speed;
      if (tr.kind !== 'main') c.start = orig.start + delta;
      el.style.left = xOf(tr.kind === 'main' ? orig.start + delta : c.start) + 'px';
      el.style.width = c.dur * A.pps + 'px';
    }
    markDirty();
  };
  const onUp = (ev) => {
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onUp);
    showSnap(null);
    if (!moved) { if (!isSel) renderTimeline(); return; }
    if (mode === 'move') {
      if (tr.kind === 'main') {
        const dropT = orig.start + (ev.clientX - x0) / A.pps + c.dur / 2;
        const others = tr.clips.filter(o => o !== c);
        let idx = others.findIndex(o => dropT < o.start + o.dur / 2 - (o.start > orig.start ? c.dur : 0));
        if (idx < 0) idx = others.length;
        others.splice(idx, 0, c);
        tr.clips = others;
        packMain();
      } else {
        // muda de faixa se soltou sobre outra do mesmo tipo
        const under = document.elementsFromPoint(ev.clientX, ev.clientY).find(n => n.classList && n.classList.contains('track'));
        let target = tr;
        if (under && under.dataset.track !== tr.id) {
          const t2 = A.project.tracks.find(t => t.id === under.dataset.track);
          const compatible = t2 && (t2.kind === tr.kind || (tr.kind === 'overlay' && t2.kind === 'text' && false));
          if (compatible) target = t2;
        }
        tr.clips = tr.clips.filter(o => o !== c);
        if (overlaps(target, c.start, c.dur, c.id)) {
          placeClip(tr.kind, c, null);
        } else { target.clips.push(c); sortTrack(target); }
      }
    } else if (tr.kind === 'main') packMain();
    changed();
  };
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
}

// Tocar na régua ou em área vazia: mover o cursor de reprodução.
(function timelineSeek() {
  let scrub = false;
  const tAt = (e) => { const r = tlInner.getBoundingClientRect(); return tOf(e.clientX - r.left); };
  rulerEl.addEventListener('pointerdown', (e) => { scrub = true; rulerEl.setPointerCapture(e.pointerId); if (A.playing) pause(); seek(tAt(e)); });
  rulerEl.addEventListener('pointermove', (e) => { if (scrub) seek(tAt(e)); });
  rulerEl.addEventListener('pointerup', () => { scrub = false; });
  let down = null;
  tracksEl.addEventListener('pointerdown', (e) => { if (e.target.closest('.clip,.trans-dot,.tbtns')) return; down = { x: e.clientX, y: e.clientY }; });
  tracksEl.addEventListener('pointerup', (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8;
    down = null;
    if (moved) return;
    if (A.playing) pause();
    seek(tAt(e));
    if (A.sel) { A.sel = null; renderTimeline(); buildTools(); }
  });
  tlScroll.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomTl(e.deltaY < 0 ? 1.2 : 1 / 1.2); }
  }, { passive: false });
})();

function zoomTl(f) {
  const center = A.t;
  A.pps = clamp(A.pps * f, 4, 600);
  renderTimeline();
  tlScroll.scrollLeft = xOf(center) - tlScroll.clientWidth / 2;
}

function updatePlayhead(follow) {
  const d = duration();
  playheadEl.style.left = xOf(A.t) + 'px';
  $('timeLabel').textContent = fmtTime(A.t) + ' / ' + fmtTime(d);
  if (follow) {
    const x = xOf(A.t), sl = tlScroll.scrollLeft, w = tlScroll.clientWidth;
    if (x > sl + w - 40 || x < sl) tlScroll.scrollLeft = x - w * 0.25;
  }
}

// ---------- projetos ----------
export async function loadProject(p) {
  pause();
  dropElements();
  for (const m of A.media.values()) { try { URL.revokeObjectURL(m.url); } catch (e) {} }
  A.media.clear();
  A.project = p;
  A.sel = null; A.t = 0;
  const all = await db.all('media').catch(() => []);
  for (const rec of all) {
    if (rec.projectId !== p.id) continue;
    A.media.set(rec.id, { ...rec, url: URL.createObjectURL(rec.blob) });
  }
  localStorage.setItem('rolo-last', p.id);
  closeSheet();
  refreshAll();
  resetHistory();
  tlScroll.scrollLeft = 0;
}
A.loadProject = loadProject;
export async function createProject() {
  const p = newProject();
  await db.put('projects', clone(p));
  await loadProject(p);
}
A.createProject = createProject;
A.deleteProject = async (id) => {
  const all = await db.all('media');
  for (const m of all) if (m.projectId === id) await db.del('media', m.id);
  await db.del('projects', id);
};
// Copia mídias usadas por um clipe de outro projeto (não usado) — mantido simples.

// ---------- controles ----------
$('btnPlay').addEventListener('click', () => A.playing ? pause() : play());
$('btnStart').addEventListener('click', () => { pause(); seek(0); tlScroll.scrollLeft = 0; });
$('btnUndo').addEventListener('click', undo);
$('btnRedo').addEventListener('click', redo);
$('btnZoomIn').addEventListener('click', () => zoomTl(1.4));
$('btnZoomOut').addEventListener('click', () => zoomTl(1 / 1.4));
$('btnFirstImport').addEventListener('click', () => $('fileMedia').click());
$('fileMedia').addEventListener('change', (e) => { const f = e.target.files; addFiles(f, 'main'); e.target.value = ''; });
$('fileAudio').addEventListener('change', (e) => { const f = e.target.files; addFiles(f, 'audio'); e.target.value = ''; });
$('fileOverlay').addEventListener('change', (e) => { const f = e.target.files; addFiles(f, 'overlay'); e.target.value = ''; });

document.addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input,textarea,select')) return;
  if (e.code === 'Space') { e.preventDefault(); A.playing ? pause() : play(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
  else if (e.key === 'Delete' || e.key === 'Backspace') { if (A.sel) { e.preventDefault(); A.ops.del(); } }
  else if (e.key.toLowerCase() === 's' && !e.ctrlKey) { A.ops.split(); }
  else if (e.key === 'ArrowLeft') seek(A.t - (e.shiftKey ? 1 : 1 / 30));
  else if (e.key === 'ArrowRight') seek(A.t + (e.shiftKey ? 1 : 1 / 30));
});

// ---------- exportação ----------
A.exportVideo = async function ({ height, fps, bitrate, onProgress, signal }) {
  const asp = aspectOf(A.project);
  const short = Math.min(asp.w, asp.h);
  const s = height / short;
  const size = { w: Math.round(asp.w * s / 2) * 2, h: Math.round(asp.h * s / 2) * 2 };
  const types = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  const mime = types.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
  if (!mime || !view.captureStream) throw new Error('Este navegador não consegue gravar vídeo. Use o Chrome.');
  pause();
  ensureAudio();
  const sel = A.sel; A.sel = null;
  A.exporting = true;
  sizeCanvas(size);
  let wake = null;
  try { wake = await navigator.wakeLock?.request('screen'); } catch (e) {}
  const stream = view.captureStream(fps);
  let dest = null;
  if (ac) { dest = ac.createMediaStreamDestination(); master.connect(dest); dest.stream.getAudioTracks().forEach(t => stream.addTrack(t)); A.setSpeaker(false); }
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate, audioBitsPerSecond: 192000 });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const d = duration();
  // prepara o primeiro quadro
  A.t = 0; syncMedia(0, false);
  await new Promise(r => setTimeout(r, 700));
  renderer.render(ctx, 0);
  const done = new Promise((resolve) => { rec.onstop = resolve; });
  let cancelled = false;
  const tick = setInterval(() => {
    onProgress && onProgress(Math.min(1, A.t / d));
    if (signal && signal.cancelled && !cancelled) { cancelled = true; A.onEnd = null; pause(); try { rec.stop(); } catch (e) {} }
  }, 200);
  rec.start(500);
  A.onEnd = () => { setTimeout(() => { try { rec.stop(); } catch (e) {} }, 150); };
  play();
  await done;
  clearInterval(tick);
  if (dest) { try { master.disconnect(dest); } catch (e) {} }
  A.setSpeaker(true);
  try { wake && wake.release(); } catch (e) {}
  A.exporting = false;
  A.sel = sel;
  sizeCanvas();
  seek(0);
  if (cancelled) return null;
  const type = mime.split(';')[0];
  return { blob: new Blob(chunks, { type }), ext: type.includes('mp4') ? 'mp4' : 'webm', size };
};

A.snapshotPNG = () => new Promise(r => { const sel = A.sel; A.sel = null; renderer.render(ctx, A.t); view.toBlob(b => { A.sel = sel; markDirty(); r(b); }, 'image/png'); });

// Quadro atual da fonte de um clipe (para "congelar").
A.grabSourceFrame = (clip) => new Promise((res) => {
  const el = elFor(clip);
  if (!el || !el.videoWidth) return res(null);
  const c = document.createElement('canvas'); c.width = el.videoWidth; c.height = el.videoHeight;
  c.getContext('2d').drawImage(el, 0, 0);
  c.toBlob(b => res(b), 'image/jpeg', 0.92);
});

// ---------- gravação de narração ----------
A.recordVoice = async function (onState) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const types = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg'];
  const mime = types.find(t => MediaRecorder.isTypeSupported(t)) || '';
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks = [];
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const startT = A.t;
  const stopped = new Promise(r => rec.onstop = r);
  rec.start(250);
  if (duration() > startT + 0.1) play();
  onState && onState('rec');
  return {
    stop: async () => {
      rec.stop(); stream.getTracks().forEach(t => t.stop());
      pause();
      await stopped;
      const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
      const n = [...A.media.values()].filter(m => m.name.startsWith('Narração')).length + 1;
      const m = await importBlob(blob, 'Narração ' + n, 'audio');
      if (!m) return;
      const clip = clipFromMedia(m, { type: 'audio', start: startT, voice: true });
      if (!isFinite(clip.dur) || clip.dur <= 0) clip.dur = Math.max(0.5, A.t - startT);
      placeClip('audio', clip);
      A.sel = clip.id;
      changed();
    },
  };
};

// ---------- legendas automáticas ----------
A.mixSpeech = async function ({ includeMusic }) {
  const d = duration();
  if (d <= 0) throw new Error('A linha do tempo está vazia.');
  const sr = 16000;
  const off = new OfflineAudioContext(1, Math.ceil(sr * d) + sr, sr);
  const cache = new Map();
  let any = false;
  for (const tr of A.project.tracks) {
    if (tr.muted) continue;
    for (const c of tr.clips) {
      const m = A.media.get(c.mediaId);
      if (!m || m.kind === 'image') continue;
      if (c.type === 'audio' && !c.voice && !includeMusic && m.kind === 'audio') continue;
      if ((c.volume ?? 1) <= 0) continue;
      let buf = cache.get(m.id);
      if (!buf) {
        try { buf = await off.decodeAudioData(await m.blob.arrayBuffer()); } catch (e) { buf = null; }
        cache.set(m.id, buf);
      }
      if (!buf) continue;
      const src = off.createBufferSource(); src.buffer = buf; src.playbackRate.value = c.speed;
      const g = off.createGain(); g.gain.value = Math.min(1.5, c.volume ?? 1);
      src.connect(g); g.connect(off.destination);
      src.start(c.start, c.in, c.dur * c.speed);
      any = true;
    }
  }
  if (!any) throw new Error('Nenhum áudio com fala encontrado na linha do tempo.');
  const out = await off.startRendering();
  return out.getChannelData(0).slice(0, Math.ceil(sr * d));
};

A.transcribe = function (audio, model, language, onMsg) {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./captions-worker.js', import.meta.url), { type: 'module' });
    w.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'done') { resolve(m.chunks); w.terminate(); }
      else if (m.type === 'error') { reject(new Error(m.text)); w.terminate(); }
      else onMsg && onMsg(m);
    };
    w.onerror = (e) => { reject(new Error(e.message || 'Falha ao iniciar a transcrição')); w.terminate(); };
    w.postMessage({ audio, model, language }, [audio.buffer]);
  });
};

// ---------- instalação / compartilhamento ----------
let installEvt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; A.canInstall = true; buildTools(); });
A.install = async () => { if (!installEvt) return false; installEvt.prompt(); await installEvt.userChoice; installEvt = null; A.canInstall = false; return true; };

async function checkInbox() {
  const items = await db.all('inbox').catch(() => []);
  if (!items.length) return;
  await db.clear('inbox');
  const files = items.map(i => new File([i.blob], i.name || 'compartilhado', { type: i.blob.type }));
  await addFiles(files, 'main');
}

// ---------- início ----------
async function boot() {
  initPanels();
  persistStorage();
  const lastId = localStorage.getItem('rolo-last');
  let p = lastId ? await db.get('projects', lastId).catch(() => null) : null;
  if (!p) {
    const all = await db.all('projects').catch(() => []);
    all.sort((a, b) => b.updated - a.updated);
    p = all[0];
  }
  if (!p) { p = newProject(); await db.put('projects', clone(p)); }
  await loadProject(p);
  requestAnimationFrame(loop);
  if (new URLSearchParams(location.search).has('shared')) { window.history.replaceState(null, '', location.pathname); await checkInbox(); }
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('../sw.js', { scope: '../' }).catch(e => console.warn('sw', e));
  }
}
boot();
window.__rolo = A;

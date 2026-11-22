// Estado compartilhado e operações do modelo do projeto (sem DOM).
import { ASPECTS } from './catalog.js';
import { transformAt } from './render.js';

export const A = {
  project: null,
  media: new Map(),   // id -> {id, kind, name, url, blob, duration, w, h, thumb, wave}
  sel: null,          // id do clipe selecionado
  t: 0,
  playing: false,
  exporting: false,
  pps: 60,            // pixels por segundo na linha do tempo
  dirty: true,
};

export const uid = (p = 'c') => p + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const clone = o => JSON.parse(JSON.stringify(o));

export function fmtTime(s, dec = true) {
  s = Math.max(0, s || 0);
  const m = Math.floor(s / 60), r = s - m * 60;
  return String(m).padStart(2, '0') + ':' + (dec ? r.toFixed(1).padStart(4, '0') : String(Math.floor(r)).padStart(2, '0'));
}

export function newProject(name) {
  return {
    id: uid('p'), name: name || 'Projeto ' + new Date().toLocaleDateString('pt-BR'),
    aspect: '9:16', bg: { type: 'blur', color: '#000000' },
    tracks: [{ id: uid('t'), kind: 'main', clips: [] }],
    created: Date.now(), updated: Date.now(), version: 1,
  };
}

export function aspectOf(p) { return ASPECTS.find(a => a.id === p.aspect) || ASPECTS[0]; }

export function mainTrack() { return A.project.tracks.find(t => t.kind === 'main'); }

export function findClip(id) {
  if (!id || !A.project) return null;
  for (const tr of A.project.tracks) {
    const i = tr.clips.findIndex(c => c.id === id);
    if (i >= 0) return { clip: tr.clips[i], track: tr, index: i };
  }
  return null;
}

export function selected() { return findClip(A.sel); }

export function packMain() {
  const tr = mainTrack();
  let s = 0;
  for (const c of tr.clips) { c.start = s; s += c.dur; }
}

export function duration() {
  let d = 0;
  for (const tr of A.project.tracks) for (const c of tr.clips) d = Math.max(d, c.start + c.dur);
  return d;
}

export function sortTrack(tr) { tr.clips.sort((a, b) => a.start - b.start); }

export function overlaps(tr, start, dur, exceptId) {
  return tr.clips.some(c => c.id !== exceptId && start < c.start + c.dur - 1e-3 && start + dur > c.start + 1e-3);
}

// Coloca um clipe numa faixa do tipo pedido que tenha espaço; cria faixa nova se preciso.
export function placeClip(kind, clip, preferTrack) {
  const P = A.project;
  if (preferTrack && preferTrack.kind === kind && !overlaps(preferTrack, clip.start, clip.dur, clip.id)) {
    preferTrack.clips.push(clip); sortTrack(preferTrack); return preferTrack;
  }
  for (const tr of P.tracks) {
    if (tr.kind === kind && !overlaps(tr, clip.start, clip.dur, clip.id)) { tr.clips.push(clip); sortTrack(tr); return tr; }
  }
  const tr = { id: uid('t'), kind, clips: [clip] };
  P.tracks.push(tr);
  return tr;
}

export function removeEmptyTracks() {
  const P = A.project;
  P.tracks = P.tracks.filter(t => t.kind === 'main' || t.clips.length);
}

export function baseClip(type, extra = {}) {
  return {
    id: uid(), type, start: 0, dur: 3, in: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0,
    t: { x: 0.5, y: 0.5, scale: 1, rot: 0, opacity: 1 }, kf: [],
    filter: { id: 'none', amt: 1 }, adj: {}, effect: { id: 'none', amt: 0.7 },
    trans: { type: 'none', dur: 0.6 }, animIn: { type: 'none', dur: 0.5 }, animOut: { type: 'none', dur: 0.5 },
    ...extra,
  };
}

export function mediaMaxDur(clip) {
  const m = A.media.get(clip.mediaId);
  if (!m || m.kind === 'image' || !isFinite(m.duration)) return Infinity;
  return (m.duration - clip.in) / clip.speed;
}

export function splitClip(clip, track, t) {
  const lt = t - clip.start;
  if (lt < 0.05 || lt > clip.dur - 0.05) return null;
  const right = clone(clip);
  right.id = uid();
  right.start = clip.start + lt;
  right.dur = clip.dur - lt;
  right.in = clip.in + lt * clip.speed;
  right.trans = { type: 'none', dur: clip.trans?.dur || 0.6 };
  right.animIn = { type: 'none', dur: 0.5 };
  clip.animOut = { type: 'none', dur: 0.5 };
  clip.dur = lt;
  if (clip.kf && clip.kf.length) {
    const at = transformAt({ ...clip, kf: clone(clip.kf) }, lt);
    const cut = { t: lt, x: at.x, y: at.y, scale: at.scale, rot: at.rot, opacity: at.opacity };
    clip.kf = clip.kf.filter(k => k.t < lt - 1e-3).concat([cut]);
    right.kf = [{ ...cut, t: 0 }].concat(right.kf.filter(k => k.t > lt + 1e-3).map(k => ({ ...k, t: k.t - lt })));
  }
  const i = track.clips.indexOf(clip);
  track.clips.splice(i + 1, 0, right);
  return right;
}

// Escreve transformação: se o clipe tem keyframes, grava/atualiza o keyframe no tempo atual.
export function writeTransform(clip, props) {
  if (clip.kf && clip.kf.length) {
    const lt = clamp(A.t - clip.start, 0, clip.dur);
    let k = clip.kf.find(k => Math.abs(k.t - lt) < 0.05);
    if (!k) {
      const cur = transformAt(clip, lt);
      k = { t: lt, x: cur.x, y: cur.y, scale: cur.scale, rot: cur.rot, opacity: cur.opacity };
      clip.kf.push(k);
      clip.kf.sort((a, b) => a.t - b.t);
    }
    Object.assign(k, props);
  } else {
    clip.t = { ...clip.t, ...props };
  }
}

export function currentTransform(clip) {
  return transformAt(clip, clamp(A.t - clip.start, 0, clip.dur));
}

export function clipLabel(c) {
  if (c.type === 'text') return (c.text?.content || 'Texto').split('\n')[0];
  if (c.type === 'shape') return 'Forma';
  const m = A.media.get(c.mediaId);
  return m ? m.name : 'Mídia';
}

export function volumeAt(clip, lt) {
  let v = clip.volume ?? 1;
  if (clip.fadeIn > 0 && lt < clip.fadeIn) v *= lt / clip.fadeIn;
  if (clip.fadeOut > 0 && clip.dur - lt < clip.fadeOut) v *= Math.max(0, (clip.dur - lt) / clip.fadeOut);
  return v;
}

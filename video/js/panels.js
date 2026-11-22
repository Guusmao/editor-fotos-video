// Barra de ferramentas e painéis (folhas) de cada recurso.
import {
  A, uid, clamp, clone, fmtTime, mainTrack, findClip, selected, packMain, duration, placeClip, baseClip,
  splitClip, writeTransform, currentTransform, mediaMaxDur, sortTrack,
} from './state.js';
import { FILTERS, ADJUST, EFFECTS, TRANSITIONS, ANIMS_IN, ANIMS_OUT, FONTS, TEXT_STYLES, STICKERS, SHAPES, BLENDS, ASPECTS, SOUNDS, synthSound } from './catalog.js';
import { FX } from './fx.js';
import { fxParams, transformAt } from './render.js';
import { db } from './store.js';

const $ = id => document.getElementById(id);
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') el.className = attrs[k];
    else if (k === 'html') el.innerHTML = attrs[k];
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), attrs[k]);
    else if (attrs[k] !== undefined && attrs[k] !== null && attrs[k] !== false) el.setAttribute(k, attrs[k]);
  }
  for (const c of kids.flat()) if (c != null) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  return el;
};

let currentPanel = null;
let panelSel = null;

// ---------- folha ----------
function openSheet(title, build, name) {
  currentPanel = name || title;
  panelSel = A.sel;
  $('sheetTitle').textContent = title;
  const body = $('sheetBody');
  body.innerHTML = '';
  build(body);
  $('sheet').classList.add('on');
  $('sheet').setAttribute('aria-hidden', 'false');
}
export function closeSheet() {
  currentPanel = null;
  $('sheet').classList.remove('on');
  $('sheet').setAttribute('aria-hidden', 'true');
}
function modal(build) {
  const card = $('modalCard');
  card.innerHTML = '';
  build(card, () => $('modal').classList.remove('on'));
  $('modal').classList.add('on');
}

// ---------- controles ----------
function live(structural) { if (structural) A.refreshAll(); else A.markDirty(); A.commit(); }

function slider(parent, label, min, max, step, get, set, fmt, structural) {
  const val = h('span', { class: 'val' });
  const inp = h('input', { type: 'range', min, max, step });
  inp.value = get();
  const show = () => { val.textContent = fmt ? fmt(+inp.value) : (+inp.value).toFixed(step < 1 ? 2 : 0); };
  show();
  inp.addEventListener('input', () => { set(+inp.value); show(); A.markDirty(); A.commit(); });
  inp.addEventListener('change', () => { if (structural) A.refreshAll(); });
  inp.addEventListener('dblclick', () => {});
  const row = h('div', { class: 'row' }, h('label', {}, label), inp, val);
  parent.appendChild(row);
  return inp;
}
function segmented(parent, label, opts, get, set, structural) {
  const seg = h('div', { class: 'seg' });
  const paint = () => { for (const b of seg.children) b.classList.toggle('on', b.dataset.v === String(get())); };
  for (const [v, l] of opts) seg.appendChild(h('button', { 'data-v': String(v), onclick: () => { set(v); paint(); live(structural); } }, l));
  paint();
  parent.appendChild(label ? h('div', { class: 'row' }, h('label', {}, label), seg) : h('div', { class: 'row' }, seg));
  return seg;
}
function colorRow(parent, label, get, set) {
  const inp = h('input', { type: 'color' });
  inp.value = get();
  inp.addEventListener('input', () => { set(inp.value); A.markDirty(); A.commit(); });
  const sw = h('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;flex:1' });
  for (const c of ['#ffffff', '#000000', '#ffb547', '#ffe23d', '#ff3d8b', '#e2574c', '#3ddc97', '#4aa8ff', '#9b6bff']) {
    sw.appendChild(h('button', { style: `width:24px;height:24px;border-radius:50%;background:${c};border:1px solid #555`, onclick: () => { inp.value = c; set(c); A.markDirty(); A.commit(); } }));
  }
  parent.appendChild(h('div', { class: 'row' }, h('label', {}, label), inp, sw));
}
function grid(parent, items, isOn, onPick, render, cls = '') {
  const g = h('div', { class: 'grid ' + cls });
  const paint = () => items.forEach((it, i) => g.children[i].classList.toggle('on', !!isOn(it)));
  for (const it of items) {
    const b = h('button', { class: 'opt', onclick: () => { onPick(it); paint(); } });
    render(b, it);
    g.appendChild(b);
  }
  paint();
  parent.appendChild(g);
  return { g, paint };
}
const sub = (parent, txt) => parent.appendChild(h('div', { class: 'sub' }, txt));
const note = (parent, txt) => parent.appendChild(h('p', { class: 'note', html: txt }));
const btnRow = (parent, ...btns) => parent.appendChild(h('div', { class: 'btnrow' }, ...btns));
const btn = (label, fn, cls = '') => h('button', { class: 'btn ' + cls, onclick: fn }, label);

function selClip() { const f = selected(); return f ? f.clip : null; }
function needSel(fn) { return () => { const f = selected(); if (!f) { A.toast('Selecione um clipe primeiro.'); return; } fn(f.clip, f.track, f); }; }
const isVisual = c => c && (c.type === 'video' || c.type === 'image');
const visualClipsAll = () => A.project.tracks.flatMap(t => t.kind === 'main' || t.kind === 'overlay' ? t.clips.filter(isVisual) : []);

// ---------- ferramentas ----------
const TOOLS_ROOT = [
  ['＋', 'Mídia', () => openPanel('media')],
  ['♪', 'Áudio', () => openPanel('audio')],
  ['T', 'Texto', () => addText()],
  ['💬', 'Legendas', () => openPanel('captions')],
  ['😀', 'Figurinhas', () => openPanel('stickers')],
  ['⧉', 'Sobrepor', () => openPanel('overlay')],
  ['▭', 'Proporção', () => openPanel('aspect')],
  ['◧', 'Fundo', () => openPanel('bg')],
  ['🎨', 'Filtro geral', () => openPanel('filters-all')],
];

export function buildTools() {
  const bar = $('tools');
  bar.innerHTML = '';
  const add = (icon, label, fn, cls = '') => bar.appendChild(h('button', { class: 'tool ' + cls, onclick: fn }, h('i', {}, icon), label));
  const f = selected();
  if (!f) {
    for (const t of TOOLS_ROOT) add(...t);
    if (A.canInstall) add('⬇', 'Instalar', async () => { await A.install(); buildTools(); });
    if (currentPanel && currentPanel.startsWith('clip:')) closeSheet();
    return;
  }
  const c = f.clip, tr = f.track;
  add('‹', 'Voltar', () => { A.sel = null; A.renderTimeline(); buildTools(); A.markDirty(); closeSheet(); }, 'back');
  add('✂', 'Dividir', () => ops.split());
  if (c.type === 'text') {
    add('✎', 'Editar', () => openPanel('text'));
    add('Aa', 'Estilo', () => openPanel('textstyle'));
  }
  if (isVisual(c) || c.type === 'audio') {
    add('⏩', 'Velocidade', () => openPanel('speed'));
  }
  if (c.type === 'video' || c.type === 'audio') add('🔊', 'Volume', () => openPanel('volume'));
  if (isVisual(c)) {
    add('🎨', 'Filtros', () => openPanel('filters'));
    add('☀', 'Ajustes', () => openPanel('adjust'));
  }
  if (c.type !== 'audio') add('✨', 'Efeitos', () => openPanel('effects'));
  if (tr.kind === 'main' && f.index > 0) add('⧓', 'Transição', () => openPanel('transition'));
  if (c.type !== 'audio') {
    add('➚', 'Animação', () => openPanel('anim'));
    add('✥', 'Transformar', () => openPanel('transform'));
    add('◆', 'Keyframes', () => openPanel('keyframes'));
  }
  if (isVisual(c)) {
    add('⌗', 'Recortar', () => openPanel('crop'));
    add('👤', 'Remover fundo', () => openPanel('cutout'));
    add('◑', 'Máscara', () => openPanel('mask'));
  }
  if (tr.kind === 'overlay' || c.type === 'text' || c.type === 'shape') add('◐', 'Mesclar', () => openPanel('blend'));
  if (c.type === 'video') {
    add('❄', 'Congelar', () => ops.freeze());
    add('♫', 'Separar áudio', () => ops.detach());
  }
  if (isVisual(c)) {
    add('⇄', 'Substituir', () => $('fileReplace').click());
    if (tr.kind === 'main') add('⧉', 'Para cima', () => ops.toOverlay());
    else add('▤', 'Para principal', () => ops.toMain());
  }
  add('⧉', 'Duplicar', () => ops.dup());
  add('🗑', 'Excluir', () => ops.del(), 'danger');
  if (currentPanel && currentPanel.startsWith('clip:') && panelSel !== A.sel) {
    // reabre o painel atual para o novo clipe selecionado, se fizer sentido
    const name = currentPanel.slice(5);
    if (PANELS[name] && panelFits(name, c, tr)) openPanel(name); else closeSheet();
  }
}

function panelFits(name, c, tr) {
  if (['filters', 'adjust', 'crop', 'cutout', 'mask'].includes(name)) return isVisual(c);
  if (name === 'transition') return tr.kind === 'main';
  if (name === 'text' || name === 'textstyle') return c.type === 'text';
  if (name === 'volume') return c.type === 'video' || c.type === 'audio';
  if (['anim', 'transform', 'keyframes', 'effects'].includes(name)) return c.type !== 'audio';
  return true;
}

// ---------- operações ----------
const ops = {
  split() {
    const f = selected();
    let target = f;
    if (!target) {
      // sem seleção: divide o clipe principal sob o cursor
      const tr = mainTrack();
      const c = tr.clips.find(c => A.t > c.start && A.t < c.start + c.dur);
      if (!c) return A.toast('Posicione o cursor sobre um clipe.');
      target = { clip: c, track: tr };
    }
    const r = splitClip(target.clip, target.track, A.t);
    if (!r) return A.toast('Mova o cursor para dentro do clipe para dividir.');
    A.sel = r.id;
    A.changed();
  },
  del() {
    const f = selected(); if (!f) return;
    f.track.clips.splice(f.index, 1);
    A.sel = null;
    closeSheet();
    A.changed();
  },
  dup() {
    const f = selected(); if (!f) return;
    const c = clone(f.clip); c.id = uid();
    if (f.track.kind === 'main') { f.track.clips.splice(f.index + 1, 0, c); }
    else { c.start = f.clip.start + f.clip.dur; placeClip(f.track.kind, c, f.track); }
    A.sel = c.id;
    A.changed();
  },
  async freeze() {
    const f = selected(); if (!f || f.clip.type !== 'video') return;
    const c = f.clip;
    if (A.t < c.start || A.t >= c.start + c.dur) return A.toast('Posicione o cursor sobre o clipe.');
    const blob = await A.grabSourceFrame(c);
    if (!blob) return A.toast('Não consegui capturar o quadro.');
    const m = await A.importBlob(blob, 'Quadro congelado', 'image');
    if (!m) return;
    const fr = baseClip('image', { mediaId: m.id, dur: 2, filter: clone(c.filter), adj: clone(c.adj), t: clone(c.t), crop: clone(c.crop || null) });
    if (f.track.kind === 'main') {
      const right = splitClip(c, f.track, A.t);
      const idx = f.track.clips.indexOf(c);
      f.track.clips.splice(idx + 1, 0, fr);
      packMain();
    } else {
      const right = splitClip(c, f.track, A.t);
      if (right) { for (const tr of A.project.tracks) for (const x of tr.clips) if (tr.kind !== 'main' && x !== c && x.start >= A.t - 1e-3 && tr === f.track) x.start += 2; }
      fr.start = A.t; placeClip(f.track.kind, fr, f.track);
    }
    A.sel = fr.id;
    A.toast('Quadro congelado por 2 s.');
    A.changed();
  },
  detach() {
    const f = selected(); if (!f || f.clip.type !== 'video') return;
    const c = f.clip;
    const a = baseClip('audio', { mediaId: c.mediaId, start: c.start, dur: c.dur, in: c.in, speed: c.speed, volume: c.volume || 1, fadeIn: c.fadeIn, fadeOut: c.fadeOut, voice: true });
    c.volume = 0;
    placeClip('audio', a);
    A.sel = a.id;
    A.toast('Áudio separado em uma faixa própria.');
    A.changed();
  },
  toOverlay() {
    const f = selected(); if (!f || f.track.kind !== 'main') return;
    const c = f.clip;
    f.track.clips.splice(f.index, 1);
    packMain();
    c.start = A.t; c.trans = { type: 'none', dur: 0.6 };
    c.t = { ...c.t, scale: 0.55 };
    placeClip('overlay', c);
    A.changed();
  },
  toMain() {
    const f = selected(); if (!f || f.track.kind === 'main') return;
    const c = f.clip;
    f.track.clips.splice(f.index, 1);
    const tr = mainTrack();
    let idx = tr.clips.findIndex(x => c.start < x.start + x.dur / 2);
    if (idx < 0) idx = tr.clips.length;
    c.t = { ...c.t, x: 0.5, y: 0.5, scale: 1 }; c.blend = 'source-over';
    tr.clips.splice(idx, 0, c);
    packMain();
    A.changed();
  },
};
A.ops = ops;

function addText(opts = {}) {
  const c = baseClip('text', {
    start: A.t, dur: 3,
    text: { content: opts.content || 'Seu texto', font: FONTS[1].id, size: 84, color: '#ffffff', align: 'center', bold: true, italic: false, stroke: 0, strokeColor: '#000000', bg: 'none', bgAlpha: 1, shadow: 0.4, spacing: 0, lineHeight: 1.15, ...opts.text },
    t: { x: 0.5, y: opts.y ?? 0.5, scale: 1, rot: 0, opacity: 1 },
    animIn: { type: 'pop', dur: 0.4 },
    ...opts.extra,
  });
  placeClip('text', c);
  A.sel = c.id;
  A.changed();
  if (!opts.silent) openPanel('text');
  return c;
}

// ---------- painéis ----------
const PANELS = {};
function openPanel(name) {
  const p = PANELS[name];
  if (!p) return;
  p();
}
A.openPanel = openPanel;

PANELS.media = () => openSheet('Mídia', (b) => {
  btnRow(b, btn('＋ Importar vídeos e fotos', () => $('fileMedia').click(), 'accent'));
  note(b, 'Os arquivos ficam salvos só neste aparelho, dentro do projeto.');
  const list = [...A.media.values()].filter(m => m.kind !== 'audio');
  if (list.length) {
    sub(b, 'Já no projeto (toque para adicionar de novo)');
    grid(b, list, () => false, (m) => { const c = A.clipFromMedia ? null : null; addMediaToMain(m); }, (el, m) => {
      el.appendChild(h('div', { class: 'sw', style: m.thumb ? `background-image:url(${m.thumb})` : 'background:#333' }));
      el.appendChild(h('span', {}, (m.kind === 'video' ? '▶ ' : '') + m.name));
    }, 'media-grid');
  }
  sub(b, 'Clipe de cor sólida');
  const g = h('div', { class: 'grid tight' });
  for (const col of ['#000000', '#ffffff', '#ffb547', '#1d3557', '#e63946', '#2a9d8f', '#6a4c93', '#f1faee']) {
    g.appendChild(h('button', { class: 'opt', style: `background:${col}`, onclick: () => addSolid(col) }));
  }
  b.appendChild(g);
}, 'media');

function addMediaToMain(m) {
  const c = baseClip(m.kind === 'image' ? 'image' : 'video', { mediaId: m.id, dur: m.kind === 'image' ? 3 : m.duration });
  const tr = mainTrack();
  const idx = tr.clips.findIndex(x => A.t >= x.start && A.t < x.start + x.dur);
  if (idx >= 0) tr.clips.splice(idx + 1, 0, c); else tr.clips.push(c);
  A.sel = c.id;
  A.changed();
  closeSheet();
}
async function addSolid(col) {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
  const x = cv.getContext('2d'); x.fillStyle = col; x.fillRect(0, 0, 64, 64);
  const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
  const m = await A.importBlob(blob, 'Cor ' + col, 'image');
  if (m) { const c = baseClip('image', { mediaId: m.id, dur: 3, fit: 'cover' }); const tr = mainTrack(); tr.clips.push(c); A.sel = c.id; A.changed(); closeSheet(); }
}

PANELS.overlay = () => openSheet('Sobrepor (imagem sobre imagem)', (b) => {
  note(b, 'Adiciona um vídeo ou foto por cima do principal, no ponto do cursor. Depois você arrasta e redimensiona direto na prévia.');
  btnRow(b, btn('＋ Escolher vídeo ou foto', () => $('fileOverlay').click(), 'accent'));
  const list = [...A.media.values()].filter(m => m.kind !== 'audio');
  if (list.length) {
    sub(b, 'Do projeto');
    grid(b, list, () => false, (m) => {
      const c = baseClip(m.kind === 'image' ? 'image' : 'video', { mediaId: m.id, start: A.t, dur: m.kind === 'image' ? 3 : m.duration, t: { x: 0.5, y: 0.5, scale: 0.5, rot: 0, opacity: 1 } });
      placeClip('overlay', c); A.sel = c.id; A.changed(); closeSheet();
    }, (el, m) => { el.appendChild(h('div', { class: 'sw', style: m.thumb ? `background-image:url(${m.thumb})` : 'background:#333' })); el.appendChild(h('span', {}, m.name)); }, 'media-grid');
  }
}, 'overlay');

PANELS.audio = () => openSheet('Áudio', (b) => {
  btnRow(b,
    btn('♪ Importar música ou áudio', () => $('fileAudio').click(), 'accent'),
    btn('🎙 Gravar narração', () => voiceModal()),
  );
  note(b, 'Dica: em "Importar" você também pode escolher um <b>vídeo</b>; só o som dele entra na linha do tempo (extrair áudio).');
  sub(b, 'Efeitos sonoros e trilhas prontas');
  grid(b, SOUNDS, () => false, async (s) => {
    A.toast('Gerando som…');
    const blob = await synthSound(s.id);
    const m = await A.importBlob(blob, s.name, 'audio');
    if (!m) return;
    const c = baseClip('audio', { mediaId: m.id, start: A.t, dur: m.duration, volume: s.dur > 4 ? 0.6 : 1 });
    placeClip('audio', c); A.sel = c.id; A.changed();
    A.toast(s.name + ' adicionado.');
  }, (el, s) => { el.appendChild(h('b', {}, s.dur > 4 ? '🎼' : '🔉')); el.appendChild(h('span', {}, s.name)); });
  const list = [...A.media.values()].filter(m => m.kind === 'audio');
  if (list.length) {
    sub(b, 'Áudios do projeto');
    const l = h('div', { class: 'list' });
    for (const m of list) l.appendChild(h('div', { class: 'item' }, h('div', { class: 'grow' }, m.name, h('small', {}, fmtTime(m.duration))), btn('Adicionar', () => { const c = baseClip('audio', { mediaId: m.id, start: A.t, dur: m.duration }); placeClip('audio', c); A.sel = c.id; A.changed(); }, 'small')));
    b.appendChild(l);
  }
}, 'audio');

function voiceModal() {
  closeSheet();
  modal((card, close) => {
    card.appendChild(h('h3', {}, 'Gravar narração'));
    note(card, 'A gravação começa no ponto do cursor e o vídeo toca junto, para você narrar em cima. Use fone de ouvido para evitar eco.');
    let muteRow = h('label', { style: 'display:flex;gap:8px;align-items:center;margin:8px 0' });
    const cb = h('input', { type: 'checkbox' }); cb.checked = true;
    muteRow.append(cb, 'Silenciar o vídeo durante a gravação');
    card.appendChild(muteRow);
    const status = h('p', { class: 'note' }, 'Pronto para gravar.');
    card.appendChild(status);
    let session = null;
    const go = btn('● Gravar', async () => {
      if (!session) {
        try {
          A.recordingMute = cb.checked;
          session = await A.recordVoice();
          status.innerHTML = '<span class="rec-dot"></span>Gravando… toque em Parar quando terminar.';
          go.textContent = '■ Parar';
        } catch (e) { status.textContent = 'Não foi possível usar o microfone: ' + e.message; A.recordingMute = false; }
      } else {
        go.disabled = true; status.textContent = 'Salvando…';
        await session.stop();
        A.recordingMute = false;
        close();
        A.toast('Narração adicionada.');
      }
    }, 'accent');
    btnRow(card, go, btn('Cancelar', () => { if (session) { session.stop(); } A.recordingMute = false; close(); }));
  });
}

PANELS.captions = () => openSheet('Legendas', (b) => {
  sub(b, 'Automáticas (IA no aparelho)');
  note(b, 'Reconhece a fala do vídeo e cria as legendas sozinho. Na primeira vez baixa o modelo de voz (rápido ≈ 45 MB, preciso ≈ 80 MB) e depois fica guardado. Nada sai do seu aparelho.');
  const cfg = { model: 'Xenova/whisper-base', lang: 'portuguese', words: 4, music: false, karaoke: true };
  segmented(b, 'Qualidade', [['Xenova/whisper-tiny', 'Rápida'], ['Xenova/whisper-base', 'Precisa']], () => cfg.model, v => cfg.model = v);
  const sel = h('select', {}, ...[['portuguese', 'Português'], ['english', 'Inglês'], ['spanish', 'Espanhol'], ['french', 'Francês'], ['italian', 'Italiano'], ['german', 'Alemão']].map(([v, l]) => h('option', { value: v }, l)));
  sel.addEventListener('change', () => cfg.lang = sel.value);
  b.appendChild(h('div', { class: 'row' }, h('label', {}, 'Idioma'), sel));
  segmented(b, 'Palavras', [[3, '3'], [4, '4'], [6, '6'], [10, 'Frase']], () => cfg.words, v => cfg.words = v);
  segmented(b, 'Destaque', [[true, 'Palavra a palavra'], [false, 'Simples']], () => cfg.karaoke, v => cfg.karaoke = v);
  const chk = h('input', { type: 'checkbox' });
  chk.addEventListener('change', () => cfg.music = chk.checked);
  b.appendChild(h('label', { class: 'row', style: 'gap:8px' }, chk, 'Incluir músicas importadas (normalmente desligado)'));
  const prog = h('div', { class: 'progress' }, h('div'));
  const status = h('p', { class: 'note' });
  const go = btn('Gerar legendas', async () => {
    go.disabled = true;
    try {
      status.textContent = 'Preparando o áudio…';
      const audio = await A.mixSpeech({ includeMusic: cfg.music });
      status.textContent = 'Carregando o modelo de voz…';
      const files = {};
      const chunks = await A.transcribe(audio, cfg.model, cfg.lang, (m) => {
        if (m.type === 'progress') {
          files[m.file] = m.progress;
          const vals = Object.values(files); const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
          prog.firstChild.style.width = avg + '%';
          status.textContent = `Baixando modelo… ${Math.round(avg)}%`;
        } else if (m.type === 'status') { status.textContent = m.text + ' (pode levar alguns minutos)'; prog.firstChild.style.width = '100%'; }
      });
      const n = makeCaptions(chunks, cfg);
      status.textContent = n ? `${n} legendas criadas. Toque numa delas para editar.` : 'Não encontrei fala no áudio.';
    } catch (e) {
      console.error(e);
      status.textContent = 'Falhou: ' + e.message;
    }
    go.disabled = false;
  }, 'accent');
  btnRow(b, go);
  b.append(prog, status);
  sub(b, 'Manual');
  btnRow(b,
    btn('＋ Legenda no cursor', () => addText({ content: 'Legenda', y: 0.78, text: captionStyle(), extra: { caption: true, animIn: { type: 'none', dur: 0.3 } } })),
    btn('Importar .srt', () => $('fileSrt').click()),
    btn('Baixar .srt', () => exportSrt()),
  );
  btnRow(b, btn('Apagar todas as legendas', () => { for (const tr of A.project.tracks) tr.clips = tr.clips.filter(c => !c.caption); A.sel = null; A.changed(); A.toast('Legendas apagadas.'); }, 'danger small'));
}, 'captions');

function captionStyle() {
  return { font: FONTS[1].id, size: 64, color: '#ffffff', bold: true, stroke: 6, strokeColor: '#000000', bg: 'none', shadow: 0.3, hiColor: '#ffe23d' };
}
function makeCaptions(chunks, cfg) {
  const items = [];
  for (const ch of chunks) {
    const [s, e0] = ch.timestamp || [0, 0];
    const text = (ch.text || '').trim();
    if (!text || s == null) continue;
    const e = e0 == null ? s + 2 : e0;
    const words = text.split(/\s+/);
    const groups = [];
    for (let i = 0; i < words.length; i += cfg.words) groups.push(words.slice(i, i + cfg.words).join(' '));
    const total = groups.reduce((a, g) => a + g.length, 0) || 1;
    let t = s;
    for (const g of groups) { const d = (e - s) * g.length / total; items.push({ s: t, e: t + d, text: g }); t += d; }
  }
  if (!items.length) return 0;
  const tr = { id: uid('t'), kind: 'text', clips: [] };
  A.project.tracks.push(tr);
  for (const it of items) {
    const c = baseClip('text', { start: it.s, dur: Math.max(0.3, it.e - it.s), caption: true, text: { ...captionStyle(), content: it.text, align: 'center', karaoke: cfg.karaoke, lineHeight: 1.15 }, t: { x: 0.5, y: 0.78, scale: 1, rot: 0, opacity: 1 } });
    tr.clips.push(c);
  }
  A.changed();
  return items.length;
}
function parseSrt(txt) {
  const out = [];
  const toS = (s) => { const m = s.trim().replace(',', '.').split(':'); return m.length === 3 ? +m[0] * 3600 + +m[1] * 60 + parseFloat(m[2]) : +m[0] * 60 + parseFloat(m[1]); };
  for (const block of txt.replace(/\r/g, '').split(/\n\n+/)) {
    const lines = block.split('\n').filter(Boolean);
    const li = lines.findIndex(l => l.includes('-->'));
    if (li < 0) continue;
    const [a, b] = lines[li].split('-->');
    out.push({ s: toS(a), e: toS(b.split(' ').filter(Boolean)[0]), text: lines.slice(li + 1).join('\n').replace(/<[^>]+>/g, '') });
  }
  return out;
}
function srtTime(s) {
  const ms = Math.round(s * 1000);
  const hh = Math.floor(ms / 3600000), mm = Math.floor(ms / 60000) % 60, ss = Math.floor(ms / 1000) % 60, r = ms % 1000;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')},${String(r).padStart(3, '0')}`;
}
function exportSrt() {
  let clips = A.project.tracks.flatMap(t => t.clips.filter(c => c.caption));
  if (!clips.length) clips = A.project.tracks.flatMap(t => t.clips.filter(c => c.type === 'text'));
  if (!clips.length) return A.toast('Não há legendas para baixar.');
  clips.sort((a, b) => a.start - b.start);
  const txt = clips.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.start + c.dur)}\n${c.text.content}\n`).join('\n');
  download(new Blob([txt], { type: 'text/plain' }), (A.project.name || 'legendas') + '.srt');
}

PANELS.stickers = () => openSheet('Figurinhas e formas', (b) => {
  const g = h('div', { class: 'grid tight' });
  for (const s of STICKERS) g.appendChild(h('button', { class: 'opt emoji', onclick: () => {
    const c = addText({ content: s, silent: true, text: { size: 200, stroke: 0, shadow: 0, bg: 'none', font: FONTS[0].id }, extra: { sticker: true, animIn: { type: 'pop', dur: 0.4 }, effect: { id: 'flutuar', amt: 0.5 } } });
    A.toast('Figurinha adicionada. Arraste na prévia para posicionar.');
  } }, s));
  b.appendChild(g);
  sub(b, 'Formas');
  grid(b, SHAPES, () => false, (s) => {
    const c = baseClip('shape', { start: A.t, dur: 3, shape: { id: s.id, color: '#ffb547' }, t: { x: 0.5, y: 0.5, scale: 0.8, rot: 0, opacity: 1 }, animIn: { type: 'zoom', dur: 0.3 } });
    placeClip('text', c); A.sel = c.id; A.changed();
  }, (el, s) => { el.appendChild(h('b', {}, ({ seta: '➜', circulo: '◯', balao: '💭', estrela: '★', coracao: '♥', moldura: '▢' })[s.id])); el.appendChild(h('span', {}, s.name)); });
  const c = selClip();
  if (c && c.type === 'shape') colorRow(b, 'Cor da forma', () => c.shape.color, v => c.shape.color = v);
}, 'stickers');

PANELS.aspect = () => openSheet('Proporção da tela', (b) => {
  grid(b, ASPECTS, a => a.id === A.project.aspect, (a) => { A.project.aspect = a.id; live(true); }, (el, a) => {
    const r = a.w / a.h, bw = r >= 1 ? 34 : 34 * r, bh = r >= 1 ? 34 / r : 34;
    el.appendChild(h('div', { style: `width:${bw}px;height:${bh}px;border:2px solid currentColor;border-radius:4px` }));
    el.appendChild(h('span', {}, a.name));
    el.appendChild(h('small', { style: 'color:var(--muted);font-size:10px' }, a.hint));
  });
}, 'aspect');

PANELS.bg = () => openSheet('Fundo da tela', (b) => {
  note(b, 'Aparece nas bordas quando o vídeo não preenche a proporção escolhida.');
  const P = A.project;
  segmented(b, 'Tipo', [['blur', 'Desfocado'], ['color', 'Cor']], () => P.bg.type, v => P.bg.type = v);
  colorRow(b, 'Cor', () => P.bg.color || '#000000', v => { P.bg.color = v; P.bg.type = 'color'; });
  const f = selected();
  if (f && f.track.kind === 'main' && isVisual(f.clip)) {
    sub(b, 'Clipe selecionado');
    segmented(b, 'Enquadrar', [['contain', 'Mostrar tudo'], ['cover', 'Preencher']], () => f.clip.fit || 'contain', v => f.clip.fit = v);
  } else {
    segmented(b, 'Todos os clipes', [['contain', 'Mostrar tudo'], ['cover', 'Preencher']], () => mainTrack().clips[0]?.fit || 'contain', v => mainTrack().clips.forEach(c => c.fit = v));
  }
}, 'bg');

PANELS.speed = needSel((c, tr) => openSheet('Velocidade', (b) => {
  const setSpeed = (v) => {
    const old = c.speed;
    const ratio = old / v;
    c.speed = v;
    c.dur = c.dur * ratio;
    if (c.kf) c.kf.forEach(k => k.t *= ratio);
    const lim = mediaMaxDur(c);
    if (c.dur > lim) c.dur = lim;
    if (tr.kind === 'main') packMain();
  };
  const fmt = v => v.toFixed(2).replace(/\.?0+$/, '') + '×';
  const s = slider(b, 'Velocidade', 0.1, 4, 0.05, () => c.speed, v => { setSpeed(v); A.renderTimeline(); }, fmt, true);
  const g = h('div', { class: 'grid tight' });
  for (const v of [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4]) g.appendChild(h('button', { class: 'opt', onclick: () => { setSpeed(v); s.value = v; s.dispatchEvent(new Event('input')); A.refreshAll(); } }, fmt(v)));
  b.appendChild(g);
  note(b, `Duração no vídeo final: ${c.dur.toFixed(1)} s. O tom da voz é preservado quando o navegador permite.`);
}, 'clip:speed'));

PANELS.volume = needSel((c) => openSheet('Volume', (b) => {
  slider(b, 'Volume', 0, 2, 0.01, () => c.volume ?? 1, v => c.volume = v, v => Math.round(v * 100) + '%');
  slider(b, 'Surgir (fade in)', 0, Math.min(5, c.dur / 2), 0.1, () => c.fadeIn || 0, v => c.fadeIn = v, v => v.toFixed(1) + 's');
  slider(b, 'Sumir (fade out)', 0, Math.min(5, c.dur / 2), 0.1, () => c.fadeOut || 0, v => c.fadeOut = v, v => v.toFixed(1) + 's');
  btnRow(b, btn(c.volume === 0 ? 'Ativar som' : 'Silenciar', () => { c.volume = c.volume === 0 ? 1 : 0; live(true); openPanel('volume'); }));
  if (c.type === 'video') btnRow(b, btn('Separar áudio para faixa própria', () => ops.detach()));
}, 'clip:volume'));

// Miniaturas de filtro geradas a partir do quadro atual do clipe.
let thumbFx = null;
function filterThumbs(c) {
  try {
    const m = A.media.get(c.mediaId);
    if (!m) return null;
    let src = m.kind === 'video' ? A.elFor(c) : A.imgFor(m);
    if (!src) return null;
    const sw = src.videoWidth || src.naturalWidth, sh = src.videoHeight || src.naturalHeight;
    if (!sw) return null;
    thumbFx = thumbFx || new FX();
    if (!thumbFx.ok) return null;
    const cv = document.createElement('canvas'); cv.width = 72; cv.height = 72;
    const cx = cv.getContext('2d');
    const small = document.createElement('canvas'); const s = 160 / Math.max(sw, sh); small.width = Math.round(sw * s); small.height = Math.round(sh * s);
    small.getContext('2d').drawImage(src, 0, 0, small.width, small.height);
    const out = {};
    for (const f of FILTERS) {
      const fake = { ...c, filter: { id: f.id, amt: 1 }, adj: {}, effect: { id: 'none' }, chroma: null, dur: 1 };
      const r = thumbFx.process(small, small.width, small.height, fxParams(fake, 0), 0);
      const k = Math.max(72 / small.width, 72 / small.height);
      cx.clearRect(0, 0, 72, 72);
      cx.drawImage(r || small, (72 - small.width * k) / 2, (72 - small.height * k) / 2, small.width * k, small.height * k);
      out[f.id] = cv.toDataURL('image/jpeg', 0.7);
    }
    return out;
  } catch (e) { return null; }
}

function filterSheet(targets, title, name) {
  openSheet(title, (b) => {
    const first = targets[0];
    const th = first ? filterThumbs(first) : null;
    const cur = () => first?.filter?.id || 'none';
    let amt;
    grid(b, FILTERS, f => f.id === cur(), (f) => { for (const c of targets) c.filter = { id: f.id, amt: c.filter?.amt ?? 1 }; live(true); }, (el, f) => {
      el.appendChild(h('div', { class: 'sw', style: th ? `background-image:url(${th[f.id]})` : 'background:linear-gradient(135deg,#6b5,#a53)' }));
      el.appendChild(h('span', {}, f.name));
    });
    amt = slider(b, 'Intensidade', 0, 1, 0.01, () => first?.filter?.amt ?? 1, v => { for (const c of targets) c.filter = { ...(c.filter || { id: 'none' }), amt: v }; }, v => Math.round(v * 100) + '%');
    if (targets.length === 1) btnRow(b, btn('Aplicar a todos os clipes', () => { for (const c of visualClipsAll()) c.filter = clone(first.filter); live(true); A.toast('Filtro aplicado em todos.'); }));
  }, name);
}
PANELS.filters = needSel((c) => filterSheet([c], 'Filtros', 'clip:filters'));
PANELS['filters-all'] = () => {
  const all = visualClipsAll();
  if (!all.length) return A.toast('Adicione vídeos ou fotos primeiro.');
  filterSheet(all, 'Filtro em todos os clipes', 'filters-all');
};

PANELS.adjust = needSel((c) => openSheet('Ajustes de cor', (b) => {
  c.adj = c.adj || {};
  for (const a of ADJUST) slider(b, a.name, a.min, a.max, a.step, () => c.adj[a.k] ?? a.def, v => { c.adj[a.k] = v; }, v => (a.k === 'contrast' || a.k === 'sat') ? Math.round(v * 100) + '%' : v.toFixed(2));
  btnRow(b,
    btn('Zerar', () => { c.adj = {}; live(true); openPanel('adjust'); }),
    btn('Aplicar a todos', () => { for (const x of visualClipsAll()) x.adj = clone(c.adj); live(true); A.toast('Ajustes aplicados em todos.'); }),
  );
}, 'clip:adjust'));

PANELS.effects = needSel((c) => openSheet('Efeitos', (b) => {
  const list = c.type === 'video' || c.type === 'image' ? EFFECTS : EFFECTS.filter(e => !e.fx || e.motion || e.id === 'none');
  grid(b, list, e => (c.effect?.id || 'none') === e.id, (e) => { c.effect = { id: e.id, amt: c.effect?.amt ?? 0.7 }; live(true); }, (el, e) => { el.appendChild(h('b', {}, e.icon)); el.appendChild(h('span', {}, e.name)); });
  slider(b, 'Intensidade', 0, 1, 0.01, () => c.effect?.amt ?? 0.7, v => c.effect = { ...(c.effect || { id: 'none' }), amt: v }, v => Math.round(v * 100) + '%');
  note(b, 'Toque em ▶ para ver os efeitos com movimento.');
}, 'clip:effects'));

PANELS.transition = needSel((c, tr, f) => {
  if (tr.kind !== 'main' || f.index === 0) return A.toast('Transições ficam entre dois clipes da faixa principal.');
  openSheet('Transição (entrada deste clipe)', (b) => {
    c.trans = c.trans || { type: 'none', dur: 0.6 };
    grid(b, TRANSITIONS, t => c.trans.type === t.id, (t) => { c.trans.type = t.id; live(true); A.seek(Math.max(0, c.start - 0.4)); A.play(); }, (el, t) => { el.appendChild(h('b', {}, t.icon)); el.appendChild(h('span', {}, t.name)); });
    slider(b, 'Duração', 0.2, 2, 0.05, () => c.trans.dur, v => c.trans.dur = v, v => v.toFixed(2) + 's');
    btnRow(b, btn('Aplicar a todas as junções', () => { mainTrack().clips.forEach((x, i) => { if (i > 0) x.trans = clone(c.trans); }); live(true); A.toast('Transição aplicada em todas.'); }));
  }, 'clip:transition');
});

PANELS.anim = needSel((c) => openSheet('Animação', (b) => {
  let side = 'in';
  const body = h('div');
  const draw = () => {
    body.innerHTML = '';
    const key = side === 'in' ? 'animIn' : 'animOut';
    c[key] = c[key] || { type: 'none', dur: 0.5 };
    const list = (side === 'in' ? ANIMS_IN : ANIMS_OUT).filter(a => !a.textOnly || c.type === 'text');
    grid(body, list, a => c[key].type === a.id, (a) => { c[key].type = a.id; live(true); const s = side === 'in' ? c.start : Math.max(c.start, c.start + c.dur - c[key].dur - 0.3); A.seek(s); A.play(); }, (el, a) => el.appendChild(h('span', {}, a.name)));
    slider(body, 'Duração', 0.1, Math.max(0.2, Math.min(3, c.dur)), 0.05, () => c[key].dur, v => c[key].dur = v, v => v.toFixed(2) + 's');
  };
  segmented(b, null, [['in', 'Entrada'], ['out', 'Saída']], () => side, v => { side = v; draw(); });
  b.appendChild(body);
  draw();
}, 'clip:anim'));

PANELS.transform = needSel((c, tr) => openSheet('Transformar', (b) => {
  const cur = currentTransform(c);
  if (c.kf?.length) note(b, '◆ Este clipe tem keyframes: as mudanças são gravadas no keyframe do ponto atual do cursor.');
  const set = (k) => v => writeTransform(c, { [k]: v });
  slider(b, 'Posição X', -0.5, 1.5, 0.005, () => cur.x, set('x'), v => Math.round((v - 0.5) * 100));
  slider(b, 'Posição Y', -0.5, 1.5, 0.005, () => cur.y, set('y'), v => Math.round((v - 0.5) * 100));
  slider(b, 'Tamanho', 0.05, 4, 0.01, () => cur.scale, set('scale'), v => Math.round(v * 100) + '%');
  slider(b, 'Rotação', -180, 180, 1, () => cur.rot, set('rot'), v => Math.round(v) + '°');
  slider(b, 'Opacidade', 0, 1, 0.01, () => cur.opacity, set('opacity'), v => Math.round(v * 100) + '%');
  btnRow(b,
    btn('↻ 90°', () => { writeTransform(c, { rot: (currentTransform(c).rot + 90) % 360 }); live(); openPanel('transform'); }, 'small'),
    btn('⇋ Espelhar', () => { c.flipH = !c.flipH; live(); }, 'small'),
    btn('⇵ Virar', () => { c.flipV = !c.flipV; live(); }, 'small'),
    btn('Centralizar', () => { writeTransform(c, { x: 0.5, y: 0.5 }); live(); openPanel('transform'); }, 'small'),
    btn('Redefinir', () => { c.kf = []; c.t = { x: 0.5, y: 0.5, scale: tr.kind === 'overlay' ? 0.5 : 1, rot: 0, opacity: 1 }; c.flipH = c.flipV = false; live(true); openPanel('transform'); }, 'small'),
  );
  if (tr.kind === 'main' && isVisual(c)) segmented(b, 'Enquadrar', [['contain', 'Mostrar tudo'], ['cover', 'Preencher']], () => c.fit || 'contain', v => c.fit = v);
  if (c.type === 'shape') colorRow(b, 'Cor', () => c.shape.color, v => c.shape.color = v);
  note(b, 'Na prévia: arraste para mover, use dois dedos (ou a bolinha do canto) para girar e mudar o tamanho.');
}, 'clip:transform'));

PANELS.crop = needSel((c) => openSheet('Recortar', (b) => {
  c.crop = c.crop || { l: 0, t: 0, r: 0, b: 0 };
  const cr = c.crop;
  const fmt = v => Math.round(v * 100) + '%';
  slider(b, 'Esquerda', 0, 0.9, 0.005, () => cr.l, v => cr.l = Math.min(v, 0.95 - cr.r), fmt);
  slider(b, 'Direita', 0, 0.9, 0.005, () => cr.r, v => cr.r = Math.min(v, 0.95 - cr.l), fmt);
  slider(b, 'Topo', 0, 0.9, 0.005, () => cr.t, v => cr.t = Math.min(v, 0.95 - cr.b), fmt);
  slider(b, 'Base', 0, 0.9, 0.005, () => cr.b, v => cr.b = Math.min(v, 0.95 - cr.t), fmt);
  sub(b, 'Atalhos');
  const m = A.media.get(c.mediaId);
  const presets = [['Livre', null], ['9:16', 9 / 16], ['1:1', 1], ['4:5', 4 / 5], ['16:9', 16 / 9]];
  btnRow(b, ...presets.map(([l, r]) => btn(l, () => {
    if (!r || !m || !m.w) { c.crop = { l: 0, t: 0, r: 0, b: 0 }; }
    else {
      const sr = m.w / m.h;
      if (sr > r) { const keep = r / sr; c.crop = { l: (1 - keep) / 2, r: (1 - keep) / 2, t: 0, b: 0 }; }
      else { const keep = sr / r; c.crop = { t: (1 - keep) / 2, b: (1 - keep) / 2, l: 0, r: 0 }; }
    }
    live(); openPanel('crop');
  }, 'small')));
}, 'clip:crop'));

PANELS.keyframes = needSel((c) => openSheet('Keyframes (movimento)', (b) => {
  note(b, 'Keyframes animam posição, tamanho, rotação e opacidade. Mova o cursor, ajuste o clipe na prévia ou em Transformar e adicione outro keyframe: o Rolo faz o caminho entre eles.');
  const lt = clamp(A.t - c.start, 0, c.dur);
  const inside = A.t >= c.start && A.t <= c.start + c.dur;
  c.kf = c.kf || [];
  btnRow(b,
    btn('◆ Adicionar aqui', () => {
      if (!inside) return A.toast('Posicione o cursor dentro do clipe.');
      const cur = transformAt(c, lt);
      if (!c.kf.length && lt > 0.05) c.kf.push({ t: 0, x: cur.x, y: cur.y, scale: cur.scale, rot: cur.rot, opacity: cur.opacity });
      const ex = c.kf.find(k => Math.abs(k.t - lt) < 0.05);
      if (!ex) c.kf.push({ t: lt, x: cur.x, y: cur.y, scale: cur.scale, rot: cur.rot, opacity: cur.opacity });
      c.kf.sort((a, b) => a.t - b.t);
      live(true); openPanel('keyframes');
    }, 'accent'),
    btn('Remover deste ponto', () => { const n = c.kf.length; c.kf = c.kf.filter(k => Math.abs(k.t - lt) >= 0.05); if (n === c.kf.length) A.toast('Não há keyframe neste ponto.'); live(true); openPanel('keyframes'); }),
    btn('Limpar todos', () => { if (c.kf.length) c.t = { ...c.t, ...transformAt(c, lt) }; c.kf = []; live(true); openPanel('keyframes'); }, 'danger'),
  );
  sub(b, 'Movimentos prontos');
  const preset = (name, a, z) => btn(name, () => { c.kf = [{ t: 0, ...a }, { t: c.dur, ...z }]; const base = { x: 0.5, y: 0.5, scale: 1, rot: 0, opacity: 1 }; c.kf.forEach(k => { for (const n in base) if (k[n] === undefined) k[n] = (c.t || base)[n] ?? base[n]; }); live(true); openPanel('keyframes'); A.seek(c.start); A.play(); }, 'small');
  btnRow(b,
    preset('Zoom de entrada', { scale: 1 }, { scale: 1.35 }),
    preset('Zoom de saída', { scale: 1.35 }, { scale: 1 }),
    preset('Panorâmica →', { x: 0.42, scale: 1.25 }, { x: 0.58, scale: 1.25 }),
    preset('Panorâmica ←', { x: 0.58, scale: 1.25 }, { x: 0.42, scale: 1.25 }),
    preset('Subir', { y: 0.58, scale: 1.2 }, { y: 0.42, scale: 1.2 }),
  );
  if (c.kf.length) {
    sub(b, 'Keyframes deste clipe');
    const l = h('div', { class: 'list' });
    for (const k of c.kf) l.appendChild(h('div', { class: 'item' + (Math.abs(k.t - lt) < 0.05 ? ' cur' : '') }, h('div', { class: 'grow' }, '◆ ' + fmtTime(c.start + k.t), h('small', {}, `tam. ${Math.round(k.scale * 100)}% · rot. ${Math.round(k.rot)}° · opac. ${Math.round(k.opacity * 100)}%`)), btn('Ir', () => { A.seek(c.start + k.t); openPanel('keyframes'); }, 'small')));
    b.appendChild(l);
  }
}, 'clip:keyframes'));

PANELS.cutout = needSel((c) => openSheet('Remover fundo', (b) => {
  sub(b, 'Recorte automático de pessoas (IA)');
  note(b, 'Separa a pessoa do fundo, quadro a quadro, no próprio aparelho. Funciona melhor com uma pessoa bem iluminada. Em celulares mais simples a prévia pode ficar mais lenta.');
  segmented(b, null, [[false, 'Desligado'], [true, 'Ligado']], () => !!c.bgAI, v => { c.bgAI = v; if (v) A.seg.load(); }, true);
  sub(b, 'Chroma key (fundo verde ou azul)');
  c.chroma = c.chroma || { on: false, color: '#00ff00', tol: 0.12, soft: 0.08 };
  const k = c.chroma;
  segmented(b, null, [[false, 'Desligado'], [true, 'Ligado']], () => !!k.on, v => k.on = v, true);
  btnRow(b,
    btn('Verde', () => { k.color = '#00ff00'; k.on = true; live(true); openPanel('cutout'); }, 'small'),
    btn('Azul', () => { k.color = '#0047ff'; k.on = true; live(true); openPanel('cutout'); }, 'small'),
    btn('Pegar cor do canto', () => { pickCorner(c); }, 'small'),
  );
  colorRow(b, 'Cor do fundo', () => k.color, v => { k.color = v; k.on = true; });
  slider(b, 'Tolerância', 0, 0.5, 0.005, () => k.tol, v => k.tol = v);
  slider(b, 'Suavidade', 0, 0.3, 0.005, () => k.soft, v => k.soft = v);
  note(b, 'Coloque o clipe recortado na faixa de cima (botão "Para cima") para aparecer sobre outro vídeo.');
}, 'clip:cutout'));

function pickCorner(c) {
  const m = A.media.get(c.mediaId);
  const src = m.kind === 'video' ? A.elFor(c) : A.imgFor(m);
  const cv = document.createElement('canvas'); cv.width = 8; cv.height = 8;
  const x = cv.getContext('2d');
  try {
    x.drawImage(src, 0, 0, src.videoWidth || src.naturalWidth, (src.videoHeight || src.naturalHeight), 0, 0, 8, 8);
    const d = x.getImageData(0, 0, 1, 1).data;
    c.chroma.color = '#' + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join('');
    c.chroma.on = true;
    live(true); openPanel('cutout');
  } catch (e) { A.toast('Não consegui ler a cor.'); }
}

PANELS.mask = needSel((c) => openSheet('Máscara', (b) => {
  const masks = [['none', 'Nenhuma', '▭'], ['circulo', 'Círculo', '◯'], ['elipse', 'Elipse', '⬭'], ['arredondado', 'Arredondada', '▢'], ['coracao', 'Coração', '♥'], ['estrela', 'Estrela', '★']];
  grid(b, masks, m => (c.mask || 'none') === m[0], (m) => { c.mask = m[0]; live(); }, (el, m) => { el.appendChild(h('b', {}, m[2])); el.appendChild(h('span', {}, m[1])); });
  note(b, 'Ótimo para sobreposições (imagem sobre imagem) em formato de círculo ou coração.');
}, 'clip:mask'));

PANELS.blend = needSel((c) => openSheet('Mesclagem', (b) => {
  grid(b, BLENDS, m => (c.blend || 'source-over') === m[0], (m) => { c.blend = m[0]; live(); }, (el, m) => el.appendChild(h('span', {}, m[1])));
  const cur = currentTransform(c);
  slider(b, 'Opacidade', 0, 1, 0.01, () => cur.opacity, v => writeTransform(c, { opacity: v }), v => Math.round(v * 100) + '%');
}, 'clip:blend'));

PANELS.text = needSel((c) => {
  if (c.type !== 'text') return;
  openSheet(c.caption ? 'Editar legenda' : 'Editar texto', (b) => {
    const s = c.text;
    const ta = h('textarea', { rows: 3 });
    ta.value = s.content;
    ta.addEventListener('input', () => { s.content = ta.value; A.markDirty(); A.commit(); });
    ta.addEventListener('change', () => A.renderTimeline());
    b.appendChild(ta);
    sub(b, 'Fonte');
    grid(b, FONTS, f => s.font === f.id, f => { s.font = f.id; live(); }, (el, f) => { el.style.fontFamily = f.id; el.appendChild(h('b', { style: `font-family:${f.id};font-size:18px` }, 'Aa')); el.appendChild(h('span', {}, f.name)); });
    slider(b, 'Tamanho', 16, 300, 1, () => s.size, v => s.size = v);
    colorRow(b, 'Cor', () => s.color, v => s.color = v);
    segmented(b, 'Alinhar', [['left', 'Esq.'], ['center', 'Centro'], ['right', 'Dir.']], () => s.align || 'center', v => s.align = v);
    segmented(b, 'Peso', [[true, 'Negrito'], [false, 'Normal']], () => !!s.bold, v => s.bold = v);
    segmented(b, 'Itálico', [[false, 'Não'], [true, 'Sim']], () => !!s.italic, v => s.italic = v);
    btnRow(b, btn('Mais estilo (contorno, caixa, sombra) →', () => openPanel('textstyle')));
    if (c.caption) btnRow(b, btn('Aplicar este visual a todas as legendas', () => { for (const tr of A.project.tracks) for (const x of tr.clips) if (x.caption && x !== c) { const content = x.text.content; x.text = { ...clone(s), content }; x.t = { ...x.t, y: c.t.y, scale: c.t.scale }; } live(true); A.toast('Visual aplicado.'); }));
  }, 'clip:text');
});

PANELS.textstyle = needSel((c) => {
  if (c.type !== 'text') return;
  openSheet('Estilo do texto', (b) => {
    const s = c.text;
    sub(b, 'Estilos prontos');
    grid(b, TEXT_STYLES, () => false, (st) => { Object.assign(s, st.s); if (st.s.bg === 'none') s.bg = 'none'; live(); openPanel('textstyle'); }, (el, st) => {
      const bg = st.s.bg && st.s.bg !== 'none' ? st.s.bg : 'transparent';
      el.appendChild(h('b', { style: `font-size:16px;font-weight:800;color:${st.s.color};background:${bg};padding:2px 6px;border-radius:4px;${st.s.stroke ? `-webkit-text-stroke:1px ${st.s.strokeColor}` : ''}` }, 'Aa'));
      el.appendChild(h('span', {}, st.name));
    });
    sub(b, 'Contorno');
    slider(b, 'Espessura', 0, 16, 0.5, () => s.stroke || 0, v => s.stroke = v);
    colorRow(b, 'Cor', () => s.strokeColor || '#000000', v => s.strokeColor = v);
    sub(b, 'Caixa de fundo');
    segmented(b, 'Fundo', [['none', 'Sem'], ['box', 'Bloco'], ['line', 'Por linha']], () => s.bg === 'none' || !s.bg ? 'none' : (s.bgMode === 'line' ? 'line' : 'box'), v => { if (v === 'none') s.bg = 'none'; else { if (!s.bg || s.bg === 'none') s.bg = '#000000'; s.bgMode = v; } });
    colorRow(b, 'Cor', () => (s.bg && s.bg !== 'none') ? s.bg : '#000000', v => s.bg = v);
    slider(b, 'Opacidade', 0, 1, 0.01, () => s.bgAlpha ?? 1, v => s.bgAlpha = v, v => Math.round(v * 100) + '%');
    sub(b, 'Sombra e espaçamento');
    slider(b, 'Sombra', 0, 2, 0.05, () => s.shadow || 0, v => s.shadow = v);
    slider(b, 'Letras', -5, 30, 0.5, () => s.spacing || 0, v => s.spacing = v);
    slider(b, 'Linhas', 0.8, 2, 0.01, () => s.lineHeight || 1.15, v => s.lineHeight = v);
    sub(b, 'Destaque palavra a palavra');
    segmented(b, null, [[false, 'Desligado'], [true, 'Ligado']], () => !!s.karaoke, v => s.karaoke = v);
    colorRow(b, 'Cor do destaque', () => s.hiColor || '#ffe23d', v => s.hiColor = v);
  }, 'clip:textstyle');
});

// ---------- exportar ----------
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
const safeName = () => (A.project.name || 'video').replace(/[^\w\-áéíóúâêôãõç ]+/gi, '').trim() || 'video';

function exportModal() {
  A.pause();
  closeSheet();
  if (duration() <= 0) return A.toast('Adicione algo à linha do tempo antes de exportar.');
  modal((card, close) => {
    card.appendChild(h('h3', {}, 'Exportar vídeo'));
    const cfg = { height: 1080, fps: 30, rate: 12e6 };
    segmented(card, 'Resolução', [[480, '480p'], [720, '720p'], [1080, '1080p']], () => cfg.height, v => { cfg.height = v; cfg.rate = v >= 1080 ? 12e6 : v >= 720 ? 7e6 : 3e6; });
    segmented(card, 'Quadros/s', [[24, '24'], [30, '30'], [60, '60']], () => cfg.fps, v => cfg.fps = v);
    segmented(card, 'Qualidade', [['n', 'Normal'], ['a', 'Alta']], () => cfg.rate > (cfg.height >= 1080 ? 12e6 : cfg.height >= 720 ? 7e6 : 3e6) ? 'a' : 'n', v => { const base = cfg.height >= 1080 ? 12e6 : cfg.height >= 720 ? 7e6 : 3e6; cfg.rate = v === 'a' ? base * 1.8 : base; });
    note(card, `Duração: ${fmtTime(duration())}. A exportação acontece em tempo real (um vídeo de 30 s leva cerca de 30 s). Mantenha a tela ligada e o app aberto.`);
    const prog = h('div', { class: 'progress' }, h('div'));
    const status = h('p', { class: 'note' });
    const result = h('div');
    const signal = { cancelled: false };
    const go = btn('Exportar', async () => {
      go.disabled = true; signal.cancelled = false;
      status.textContent = 'Gravando…';
      try {
        const r = await A.exportVideo({ height: cfg.height, fps: cfg.fps, bitrate: cfg.rate, signal, onProgress: p => { prog.firstChild.style.width = (p * 100).toFixed(1) + '%'; status.textContent = `Gravando… ${Math.round(p * 100)}%`; } });
        if (!r) { status.textContent = 'Exportação cancelada.'; go.disabled = false; return; }
        prog.firstChild.style.width = '100%';
        const mb = (r.blob.size / 1048576).toFixed(1);
        status.textContent = `Pronto! ${r.size.w}×${r.size.h}, ${r.ext.toUpperCase()}, ${mb} MB.`;
        const fname = safeName() + '.' + r.ext;
        const file = new File([r.blob], fname, { type: r.blob.type });
        result.innerHTML = '';
        const btns = [btn('⬇ Baixar', () => download(r.blob, fname), 'accent')];
        if (navigator.canShare && navigator.canShare({ files: [file] })) btns.push(btn('Compartilhar…', () => navigator.share({ files: [file], title: A.project.name }).catch(() => {})));
        btnRow(result, ...btns);
        if (r.ext === 'webm') note(result, 'Este navegador gravou em WebM. O Instagram e o WhatsApp aceitam na maioria dos casos; o Chrome atualizado grava em MP4.');
        const vid = h('video', { controls: '', playsinline: '', style: 'width:100%;max-height:40vh;border-radius:10px;margin-top:8px;background:#000' });
        vid.src = URL.createObjectURL(r.blob);
        result.appendChild(vid);
      } catch (e) {
        console.error(e);
        status.textContent = 'Falhou: ' + e.message;
      }
      go.disabled = false;
    }, 'accent');
    btnRow(card, go, btn('Cancelar', () => { if (A.exporting) signal.cancelled = true; else close(); }));
    card.append(prog, status, result);
    sub(card, 'Outros');
    btnRow(card,
      btn('Salvar quadro atual (PNG)', async () => { const b = await A.snapshotPNG(); download(b, safeName() + '-quadro.png'); }, 'small'),
      btn('Baixar legendas (.srt)', () => exportSrt(), 'small'),
      btn('Fechar', () => { if (!A.exporting) close(); }, 'small'),
    );
  });
}

// ---------- projetos ----------
async function projectsSheet() {
  const all = (await db.all('projects').catch(() => [])).sort((a, b) => b.updated - a.updated);
  const media = await db.all('media').catch(() => []);
  openSheet('Projetos', (b) => {
    const nameIn = h('input', { type: 'text', value: A.project.name });
    nameIn.addEventListener('change', () => { A.project.name = nameIn.value.trim() || 'Sem título'; A.refreshAll(); A.commit(true); A.saveProject(); });
    b.appendChild(h('div', { class: 'row' }, h('label', {}, 'Nome deste'), nameIn));
    btnRow(b, btn('＋ Novo projeto', async () => { await A.saveProject(); await A.createProject(); }, 'accent'));
    if (A.canInstall) btnRow(b, btn('⬇ Instalar o Rolo no aparelho', () => A.install()));
    const l = h('div', { class: 'list' });
    for (const p of all) {
      const used = media.filter(m => m.projectId === p.id).reduce((a, m) => a + (m.blob?.size || 0), 0);
      const clips = p.tracks.reduce((a, t) => a + t.clips.length, 0);
      let confirmDel = false;
      const del = btn('🗑', async () => {
        if (!confirmDel) { confirmDel = true; del.textContent = 'Apagar?'; setTimeout(() => { confirmDel = false; del.textContent = '🗑'; }, 3000); return; }
        await A.deleteProject(p.id);
        if (p.id === A.project.id) { await A.createProject(); }
        projectsSheet();
      }, 'small danger');
      l.appendChild(h('div', { class: 'item' + (p.id === A.project.id ? ' cur' : '') },
        h('div', { class: 'grow' }, p.name, h('small', {}, `${clips} clipes · ${(used / 1048576).toFixed(0)} MB · ${new Date(p.updated).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`)),
        p.id === A.project.id ? h('small', {}, 'aberto') : btn('Abrir', async () => { await A.saveProject(); await A.loadProject(p); }, 'small'),
        del));
    }
    b.appendChild(l);
    const est = h('p', { class: 'note' });
    b.appendChild(est);
    navigator.storage?.estimate?.().then(e => { est.textContent = `Espaço usado pelo Rolo: ${(e.usage / 1048576).toFixed(0)} MB de ${(e.quota / 1073741824).toFixed(1)} GB disponíveis.`; });
    note(b, 'Os projetos ficam guardados neste navegador. Se limpar os dados do site, eles são apagados.');
  }, 'projects');
}

// ---------- inicialização ----------
export function initPanels() {
  $('sheetClose').addEventListener('click', closeSheet);
  $('btnExport').addEventListener('click', exportModal);
  $('btnProjects').addEventListener('click', projectsSheet);
  $('btnAspect').addEventListener('click', () => openPanel('aspect'));
  $('modal').addEventListener('click', (e) => { if (e.target.id === 'modal' && !A.exporting) $('modal').classList.remove('on'); });
  $('fileSrt').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    const items = parseSrt(await f.text());
    if (!items.length) return A.toast('Arquivo de legenda vazio ou inválido.');
    const tr = { id: uid('t'), kind: 'text', clips: [] };
    A.project.tracks.push(tr);
    for (const it of items) tr.clips.push(baseClip('text', { start: it.s, dur: Math.max(0.2, it.e - it.s), caption: true, text: { ...captionStyle(), content: it.text, align: 'center', lineHeight: 1.15 }, t: { x: 0.5, y: 0.78, scale: 1, rot: 0, opacity: 1 } }));
    A.changed();
    A.toast(`${items.length} legendas importadas.`);
  });
  $('fileReplace').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    const s = selected(); if (!f || !s) return;
    const m = await A.importBlob(f, f.name);
    if (!m || m.kind === 'audio') return;
    const c = s.clip;
    c.mediaId = m.id; c.type = m.kind; c.in = 0;
    if (m.kind === 'video') c.dur = Math.min(c.dur, m.duration / c.speed);
    A.changed();
    A.toast('Mídia substituída.');
  });
}

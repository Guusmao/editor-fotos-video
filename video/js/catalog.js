// Catálogos: filtros, efeitos, transições, animações, estilos de texto, fontes, figurinhas e sons.

export const FILTERS = [
  { id: 'none', name: 'Original', p: {} },
  { id: 'vivo', name: 'Vivo', p: { sat: 1.35, contrast: 1.1, bright: 0.02 } },
  { id: 'cinema', name: 'Cinema', p: { contrast: 1.15, sat: 0.85, temp: -0.25, tint: -0.05, fade: 0.08, vign: 0.35 } },
  { id: 'ouro', name: 'Ouro', p: { temp: 0.4, contrast: 1.06, bright: 0.03, sat: 1.1 } },
  { id: 'retro', name: 'Retrô', p: { temp: 0.35, fade: 0.3, sat: 0.8, grain: 0.07, vign: 0.25 } },
  { id: 'pb', name: 'P&B', p: { mono: 1, contrast: 1.1 } },
  { id: 'noir', name: 'Noir', p: { mono: 1, contrast: 1.45, vign: 0.55, bright: -0.03 } },
  { id: 'sepia', name: 'Sépia', p: { sepia: 0.9, contrast: 1.05 } },
  { id: 'frio', name: 'Frio', p: { temp: -0.5, sat: 0.95 } },
  { id: 'quente', name: 'Quente', p: { temp: 0.55, sat: 1.1 } },
  { id: 'pastel', name: 'Pastel', p: { sat: 0.7, bright: 0.06, fade: 0.25 } },
  { id: 'desbotado', name: 'Desbotado', p: { fade: 0.45, sat: 0.6 } },
  { id: 'neon', name: 'Neon', p: { sat: 1.7, contrast: 1.2, hue: 0.35, glow: 0.3 } },
  { id: 'praia', name: 'Praia', p: { temp: 0.15, tint: -0.1, sat: 1.25, bright: 0.05 } },
  { id: 'noite', name: 'Noite', p: { temp: -0.6, bright: -0.08, contrast: 1.15, sat: 0.7 } },
  { id: 'filme', name: 'Filme 35', p: { grain: 0.1, fade: 0.15, contrast: 1.08, temp: 0.12, vign: 0.3 } },
  { id: 'esporte', name: 'Esporte', p: { contrast: 1.25, sat: 1.25, sharpen: 0.4 } },
  { id: 'sonho', name: 'Sonho', p: { glow: 0.5, bright: 0.05, sat: 0.9, fade: 0.1 } },
];

export const ADJUST = [
  { k: 'bright', name: 'Brilho', min: -0.5, max: 0.5, step: 0.01, def: 0 },
  { k: 'contrast', name: 'Contraste', min: 0.3, max: 2, step: 0.01, def: 1 },
  { k: 'sat', name: 'Saturação', min: 0, max: 2.5, step: 0.01, def: 1 },
  { k: 'hue', name: 'Matiz', min: -3.14, max: 3.14, step: 0.01, def: 0 },
  { k: 'temp', name: 'Temperatura', min: -1, max: 1, step: 0.01, def: 0 },
  { k: 'tint', name: 'Tonalidade', min: -1, max: 1, step: 0.01, def: 0 },
  { k: 'fade', name: 'Desbotar', min: 0, max: 1, step: 0.01, def: 0 },
  { k: 'sharpen', name: 'Nitidez', min: 0, max: 1.5, step: 0.01, def: 0 },
  { k: 'vign', name: 'Vinheta', min: 0, max: 1, step: 0.01, def: 0 },
  { k: 'grain', name: 'Granulado', min: 0, max: 0.4, step: 0.01, def: 0 },
  { k: 'blur', name: 'Desfoque', min: 0, max: 12, step: 0.1, def: 0 },
  { k: 'glow', name: 'Brilho suave', min: 0, max: 1, step: 0.01, def: 0 },
];

// Efeitos: parâmetros de shader (fx), movimento (motion) ou ambos. "amt" é a intensidade (0..1).
export const EFFECTS = [
  { id: 'none', name: 'Nenhum', icon: '∅' },
  { id: 'vhs', name: 'Fita VHS', icon: '📼', fx: (a, t) => ({ rgbshift: 3 * a, scan: a, grain: 0.12 * a, fade: 0.15 * a }) },
  { id: 'glitch', name: 'Falha', icon: '⚡', fx: a => ({ glitch: a }) },
  { id: 'rgb', name: 'RGB', icon: '🌈', fx: (a, t) => ({ rgbshift: 6 * a * (0.6 + 0.4 * Math.sin(t * 6)) }) },
  { id: 'tremor', name: 'Tremor', icon: '〰️', motion: (a, t) => ({ dx: (noise(t * 18) - 0.5) * 0.03 * a, dy: (noise(t * 18 + 50) - 0.5) * 0.03 * a, ds: 0.03 * a }) },
  { id: 'pulso', name: 'Pulso', icon: '💓', motion: (a, t) => ({ ds: 0.06 * a * Math.max(0, Math.sin(t * Math.PI * 2 * 1.6)) }) },
  { id: 'aproximar', name: 'Aproximar lento', icon: '🔍', motion: (a, t, d) => ({ ds: 0.18 * a * Math.min(1, t / Math.max(d, 0.1)) }) },
  { id: 'afastar', name: 'Afastar lento', icon: '🔭', motion: (a, t, d) => ({ ds: 0.18 * a * (1 - Math.min(1, t / Math.max(d, 0.1))) }) },
  { id: 'flutuar', name: 'Flutuar', icon: '🎈', motion: (a, t) => ({ dy: Math.sin(t * 2.2) * 0.02 * a }) },
  { id: 'balanco', name: 'Balanço', icon: '🎐', motion: (a, t) => ({ dr: Math.sin(t * 3) * 6 * a }) },
  { id: 'flash', name: 'Flash', icon: '💥', fx: (a, t) => ({ bright: Math.max(0, 0.6 * a * (1 - t / 0.35)) }) },
  { id: 'estrobo', name: 'Estrobo', icon: '🔦', fx: (a, t) => ({ bright: (Math.floor(t * 8) % 2) ? 0.35 * a : 0 }) },
  { id: 'pixel', name: 'Pixelado', icon: '👾', fx: a => ({ pixel: 4 + 36 * a }) },
  { id: 'espelho', name: 'Espelho', icon: '🪞', fx: () => ({ mirror: 1 }) },
  { id: 'negativo', name: 'Negativo', icon: '🎞️', fx: a => ({ invert: a }) },
  { id: 'sonhar', name: 'Sonhar', icon: '☁️', fx: a => ({ glow: 0.8 * a, blur: 1.5 * a, bright: 0.04 * a }) },
  { id: 'cinemascope', name: 'Faixas de cinema', icon: '🎬', bars: true },
  { id: 'batida', name: 'Batida', icon: '🥁', motion: (a, t) => { const p = (t * 2) % 1; return { ds: 0.08 * a * Math.max(0, 1 - p * 4) }; }, fx: (a, t) => { const p = (t * 2) % 1; return { bright: 0.15 * a * Math.max(0, 1 - p * 4) }; } },
];

function noise(x) {
  const i = Math.floor(x), f = x - i;
  const h = n => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
  const u = f * f * (3 - 2 * f);
  return h(i) * (1 - u) + h(i + 1) * u;
}

export const TRANSITIONS = [
  { id: 'none', name: 'Nenhuma', icon: '∅' },
  { id: 'dissolver', name: 'Dissolver', icon: '◐' },
  { id: 'preto', name: 'Pelo preto', icon: '●' },
  { id: 'branco', name: 'Pelo branco', icon: '○' },
  { id: 'esquerda', name: 'Deslizar ←', icon: '⇠' },
  { id: 'direita', name: 'Deslizar →', icon: '⇢' },
  { id: 'cima', name: 'Deslizar ↑', icon: '⇡' },
  { id: 'empurrar', name: 'Empurrar', icon: '⇥' },
  { id: 'zoom', name: 'Zoom', icon: '⊕' },
  { id: 'girar', name: 'Girar', icon: '↻' },
  { id: 'cortina', name: 'Cortina', icon: '▥' },
  { id: 'circulo', name: 'Círculo', icon: '◎' },
  { id: 'desfoque', name: 'Desfoque', icon: '◌' },
  { id: 'falha', name: 'Falha', icon: '⚡' },
];

export const ANIMS_IN = [
  { id: 'none', name: 'Nenhuma' },
  { id: 'fade', name: 'Surgir' },
  { id: 'up', name: 'Subir' },
  { id: 'down', name: 'Descer' },
  { id: 'left', name: 'Da direita' },
  { id: 'right', name: 'Da esquerda' },
  { id: 'zoom', name: 'Crescer' },
  { id: 'shrink', name: 'Encolher' },
  { id: 'pop', name: 'Saltar' },
  { id: 'spin', name: 'Girar' },
  { id: 'blur', name: 'Focar' },
  { id: 'type', name: 'Máquina de escrever', textOnly: true },
];
export const ANIMS_OUT = ANIMS_IN.map(a => ({ ...a, name: ({ fade: 'Sumir', up: 'Subir', down: 'Descer', left: 'Para esquerda', right: 'Para direita', zoom: 'Crescer', shrink: 'Encolher', pop: 'Saltar', spin: 'Girar', blur: 'Desfocar', type: 'Apagar letras' })[a.id] || a.name }));

export const FONTS = [
  { id: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', name: 'Padrão' },
  { id: '"Montserrat", sans-serif', name: 'Montserrat', g: 'Montserrat:wght@400;800' },
  { id: '"Anton", sans-serif', name: 'Anton', g: 'Anton' },
  { id: '"Bebas Neue", sans-serif', name: 'Bebas', g: 'Bebas+Neue' },
  { id: '"Playfair Display", serif', name: 'Playfair', g: 'Playfair+Display:wght@400;800' },
  { id: '"Pacifico", cursive', name: 'Pacifico', g: 'Pacifico' },
  { id: '"Caveat", cursive', name: 'Caveat', g: 'Caveat:wght@500;700' },
  { id: '"Permanent Marker", cursive', name: 'Marcador', g: 'Permanent+Marker' },
  { id: '"Lobster", cursive', name: 'Lobster', g: 'Lobster' },
  { id: '"Space Mono", monospace', name: 'Space Mono', g: 'Space+Mono:wght@400;700' },
  { id: 'Georgia, serif', name: 'Georgia' },
  { id: 'Impact, Haettenschweiler, sans-serif', name: 'Impact' },
];

export const TEXT_STYLES = [
  { name: 'Simples', s: { color: '#ffffff', stroke: 0, bg: 'none', shadow: 0.4, bold: true } },
  { name: 'Contorno', s: { color: '#ffffff', stroke: 6, strokeColor: '#000000', bg: 'none', shadow: 0, bold: true } },
  { name: 'Caixa', s: { color: '#111111', stroke: 0, bg: '#ffffff', bgAlpha: 1, shadow: 0, bold: true } },
  { name: 'Faixa escura', s: { color: '#ffffff', stroke: 0, bg: '#000000', bgAlpha: 0.6, shadow: 0, bold: false } },
  { name: 'Âmbar', s: { color: '#1a1206', stroke: 0, bg: '#ffb547', bgAlpha: 1, shadow: 0, bold: true } },
  { name: 'Neon', s: { color: '#7cf7ff', stroke: 2, strokeColor: '#0b3a5a', bg: 'none', shadow: 1, shadowColor: '#00e5ff', bold: true } },
  { name: 'Amarelo', s: { color: '#ffe23d', stroke: 7, strokeColor: '#000000', bg: 'none', shadow: 0, bold: true } },
  { name: 'Impacto amarelo', s: { color: '#ffe600', stroke: 9, strokeColor: '#000000', bg: 'none', shadow: 0, bold: true, italic: true, font: '"Montserrat", sans-serif', spacing: 1 } },
  { name: 'Impacto branco', s: { color: '#ffffff', stroke: 9, strokeColor: '#000000', bg: 'none', shadow: 0, bold: true, italic: true, font: '"Montserrat", sans-serif', spacing: 1 } },
  { name: 'Rosa', s: { color: '#ffffff', stroke: 0, bg: '#ff3d8b', bgAlpha: 1, shadow: 0, bold: true } },
];

export const STICKERS = ['🔥', '😂', '😍', '🥳', '👏', '💯', '❤️', '✨', '⭐', '👀', '🎉', '😎', '🤯', '🙌', '👍', '💪', '🏃', '🏆', '🎯', '📍', '➡️', '⬇️', '❗', '❓', '💬', '🎵', '📸', '🌟', '☀️', '🌈', '⚡', '🍕', '☕', '🐶', '🐱', '🚀', '💡', '✅', '❌', '🆕'];

export const SHAPES = [
  { id: 'seta', name: 'Seta' }, { id: 'circulo', name: 'Círculo' }, { id: 'balao', name: 'Balão' },
  { id: 'estrela', name: 'Estrela' }, { id: 'coracao', name: 'Coração' }, { id: 'moldura', name: 'Moldura' },
];

export const BLENDS = [
  ['source-over', 'Normal'], ['multiply', 'Multiplicar'], ['screen', 'Tela'], ['overlay', 'Sobrepor'],
  ['darken', 'Escurecer'], ['lighten', 'Clarear'], ['color-dodge', 'Subexpor'], ['color-burn', 'Superexpor'],
  ['hard-light', 'Luz forte'], ['soft-light', 'Luz suave'], ['difference', 'Diferença'],
];

export const ASPECTS = [
  { id: '9:16', w: 1080, h: 1920, name: '9:16', hint: 'Reels, Shorts, TikTok' },
  { id: '16:9', w: 1920, h: 1080, name: '16:9', hint: 'YouTube' },
  { id: '1:1', w: 1080, h: 1080, name: '1:1', hint: 'Quadrado' },
  { id: '4:5', w: 1080, h: 1350, name: '4:5', hint: 'Feed do Instagram' },
  { id: '3:4', w: 1080, h: 1440, name: '3:4', hint: 'Retrato' },
  { id: '4:3', w: 1440, h: 1080, name: '4:3', hint: 'Clássico' },
  { id: '21:9', w: 2100, h: 900, name: '21:9', hint: 'Cinema' },
];

// Sons sintetizados no próprio aparelho (sem baixar nada).
export const SOUNDS = [
  { id: 'pop', name: 'Pop', dur: 0.25 },
  { id: 'whoosh', name: 'Vupt', dur: 0.7 },
  { id: 'ding', name: 'Plim', dur: 1.2 },
  { id: 'click', name: 'Clique', dur: 0.08 },
  { id: 'boom', name: 'Grave', dur: 1.0 },
  { id: 'rise', name: 'Subida', dur: 1.6 },
  { id: 'clap', name: 'Palmas', dur: 2.0 },
  { id: 'beat', name: 'Batida (loop 8s)', dur: 8 },
  { id: 'lofi', name: 'Lo-fi (loop 16s)', dur: 16 },
];

export async function synthSound(id) {
  const meta = SOUNDS.find(s => s.id === id);
  const sr = 44100;
  const ctx = new OfflineAudioContext(2, Math.ceil(sr * meta.dur), sr);
  const out = ctx.createGain(); out.gain.value = 0.9; out.connect(ctx.destination);
  const noiseBuf = () => { const b = ctx.createBuffer(1, sr * 2, sr); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; };
  const tone = (type, f0, f1, t0, len, vol = 0.6) => {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t0 + len);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
    o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + len + 0.02);
  };
  const noise = (t0, len, vol, ftype, f0, f1) => {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf();
    const f = ctx.createBiquadFilter(); f.type = ftype; f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(f1, t0 + len); f.Q.value = 1.2;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.02, len / 3)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
    s.connect(f); f.connect(g); g.connect(out); s.start(t0); s.stop(t0 + len + 0.02);
  };
  const kick = t => tone('sine', 150, 40, t, 0.35, 0.9);
  const snare = t => { noise(t, 0.18, 0.5, 'highpass', 1800, 1500); tone('triangle', 220, 160, t, 0.1, 0.3); };
  const hat = t => noise(t, 0.05, 0.25, 'highpass', 8000, 7000);
  if (id === 'pop') { tone('sine', 900, 250, 0, 0.12, 0.8); }
  if (id === 'whoosh') { noise(0, 0.65, 0.6, 'bandpass', 300, 3500); }
  if (id === 'ding') { tone('sine', 1320, 1318, 0, 1.1, 0.5); tone('sine', 2640, 2630, 0, 0.6, 0.15); }
  if (id === 'click') { noise(0, 0.03, 0.8, 'highpass', 3000, 2500); }
  if (id === 'boom') { tone('sine', 90, 30, 0, 0.95, 1); noise(0, 0.4, 0.3, 'lowpass', 400, 80); }
  if (id === 'rise') { noise(0, 1.55, 0.4, 'bandpass', 200, 6000); tone('sawtooth', 110, 880, 0, 1.55, 0.12); }
  if (id === 'clap') { for (let i = 0; i < 26; i++) { const t = i * 0.07 + Math.random() * 0.04; noise(t, 0.09, 0.35 * (1 - i / 30), 'bandpass', 1500, 1200); } }
  if (id === 'beat') {
    const bpm = 96, b = 60 / bpm;
    for (let i = 0; i * b < meta.dur - 0.05; i++) { const t = i * b; if (i % 4 === 0 || i % 4 === 2) kick(t); if (i % 4 === 1 || i % 4 === 3) snare(t); hat(t); hat(t + b / 2); }
  }
  if (id === 'lofi') {
    const bpm = 80, b = 60 / bpm;
    const chords = [[220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7], [164.8, 207.7, 246.9]];
    for (let bar = 0; bar * 4 * b < meta.dur - 0.05; bar++) {
      const t0 = bar * 4 * b; const ch = chords[bar % 4];
      for (const f of ch) { const o = ctx.createOscillator(); const g = ctx.createGain(); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; o.type = 'triangle'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.09, t0 + 0.2); g.gain.linearRampToValueAtTime(0.0001, t0 + 4 * b); o.connect(lp); lp.connect(g); g.connect(out); o.start(t0); o.stop(t0 + 4 * b + 0.05); }
      for (let i = 0; i < 4; i++) { const t = t0 + i * b; if (i % 2 === 0) kick(t); else snare(t); hat(t + b / 2); }
    }
  }
  const buf = await ctx.startRendering();
  return audioBufferToWav(buf);
}

export function audioBufferToWav(buf) {
  const ch = buf.numberOfChannels, sr = buf.sampleRate, len = buf.length;
  const data = new DataView(new ArrayBuffer(44 + len * ch * 2));
  const w = (o, s) => { for (let i = 0; i < s.length; i++) data.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); data.setUint32(4, 36 + len * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, ch, true); data.setUint32(24, sr, true);
  data.setUint32(28, sr * ch * 2, true); data.setUint16(32, ch * 2, true); data.setUint16(34, 16, true); w(36, 'data'); data.setUint32(40, len * ch * 2, true);
  const chans = []; for (let c = 0; c < ch; c++) chans.push(buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) { const v = Math.max(-1, Math.min(1, chans[c][i])); data.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2; }
  return new Blob([data], { type: 'audio/wav' });
}

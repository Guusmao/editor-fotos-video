// Processador de cor e efeitos em WebGL (funciona em Chrome, Firefox e Safari).
const VS = `attribute vec2 p; varying vec2 v; void main(){ v = p*0.5+0.5; gl_Position = vec4(p,0.0,1.0); }`;
const FS = `precision mediump float;
varying vec2 v;
uniform sampler2D tex;
uniform vec2 res;
uniform float time;
uniform float bright, contrast, sat, hue, temp, tint, fade, vign, grain, blur, sharpen, pixel, rgbshift, glitch, scan, mono, sepia, invert, mirror, glow;
uniform float keyOn, keyTol, keySoft;
uniform vec3 keyColor;

float rnd(vec2 s){ return fract(sin(dot(s, vec2(12.9898,78.233)))*43758.5453); }
vec3 hueShift(vec3 c, float a){ const vec3 k = vec3(0.57735); float ca = cos(a); return c*ca + cross(k,c)*sin(a) + k*dot(k,c)*(1.0-ca); }
vec2 chromaUV(vec3 c){ return vec2(-0.169*c.r - 0.331*c.g + 0.5*c.b, 0.5*c.r - 0.419*c.g - 0.081*c.b); }

vec4 sampleBlur(vec2 uv, float r){
  vec2 o = r / res;
  vec4 c = texture2D(tex, uv) * 0.2;
  c += texture2D(tex, uv + vec2(o.x, 0.0)) * 0.1;
  c += texture2D(tex, uv - vec2(o.x, 0.0)) * 0.1;
  c += texture2D(tex, uv + vec2(0.0, o.y)) * 0.1;
  c += texture2D(tex, uv - vec2(0.0, o.y)) * 0.1;
  c += texture2D(tex, uv + o) * 0.1;
  c += texture2D(tex, uv - o) * 0.1;
  c += texture2D(tex, uv + vec2(o.x, -o.y)) * 0.1;
  c += texture2D(tex, uv + vec2(-o.x, o.y)) * 0.1;
  return c;
}

void main(){
  vec2 uv = v;
  if (mirror > 0.5) { uv.x = uv.x > 0.5 ? 1.0 - uv.x : uv.x; }
  if (glitch > 0.0) {
    float band = floor(uv.y * 24.0);
    float n = rnd(vec2(band, floor(time * 12.0)));
    if (n > 1.0 - glitch * 0.35) uv.x += (rnd(vec2(band, time)) - 0.5) * 0.12 * glitch;
  }
  if (pixel > 1.0) { vec2 p = res / pixel; uv = (floor(uv * p) + 0.5) / p; }
  uv = clamp(uv, 0.0, 1.0);
  vec4 base = blur > 0.0 ? sampleBlur(uv, blur) : texture2D(tex, uv);
  vec3 c = base.rgb;
  float shift = rgbshift + glitch * 6.0 * step(0.7, rnd(vec2(floor(time * 10.0), 3.0)));
  if (shift > 0.0) {
    vec2 o = vec2(shift / res.x, 0.0);
    c.r = texture2D(tex, clamp(uv + o, 0.0, 1.0)).r;
    c.b = texture2D(tex, clamp(uv - o, 0.0, 1.0)).b;
  }
  if (sharpen > 0.0) { vec3 b = sampleBlur(uv, 1.5).rgb; c = c + (c - b) * sharpen * 2.0; }
  if (glow > 0.0) { vec3 b = sampleBlur(uv, 6.0).rgb; c = c + b * glow * 0.6; }
  float a = base.a;
  if (keyOn > 0.5) {
    float d = distance(chromaUV(base.rgb), chromaUV(keyColor));
    a *= smoothstep(keyTol, keyTol + keySoft + 0.001, d);
    // tira o reflexo verde/azul das bordas
    float spill = clamp(1.0 - d / (keyTol + keySoft + 0.05), 0.0, 1.0);
    float l0 = dot(c, vec3(0.299, 0.587, 0.114));
    c = mix(c, vec3(l0), spill * 0.6);
  }
  c += bright;
  c = (c - 0.5) * contrast + 0.5;
  c.r += temp * 0.12; c.b -= temp * 0.12; c.g += tint * 0.1;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, sat);
  if (hue != 0.0) c = hueShift(c, hue);
  c = mix(c, vec3(l), mono);
  vec3 sp = vec3(dot(c, vec3(0.393, 0.769, 0.189)), dot(c, vec3(0.349, 0.686, 0.168)), dot(c, vec3(0.272, 0.534, 0.131)));
  c = mix(c, sp, sepia);
  c = mix(c, 1.0 - c, invert);
  c = mix(c, c * 0.78 + 0.14, fade);
  if (vign > 0.0) { float d = distance(v, vec2(0.5)); c *= 1.0 - vign * smoothstep(0.25, 0.85, d); }
  if (scan > 0.0) { c *= 1.0 - scan * 0.35 * step(0.5, fract(v.y * res.y / 4.0)); }
  if (grain > 0.0) { float n = rnd(v * res + fract(time) * 100.0); c += (n - 0.5) * grain; }
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), a);
}`;

export const NEUTRAL = {
  bright: 0, contrast: 1, sat: 1, hue: 0, temp: 0, tint: 0, fade: 0, vign: 0, grain: 0, blur: 0,
  sharpen: 0, pixel: 0, rgbshift: 0, glitch: 0, scan: 0, mono: 0, sepia: 0, invert: 0, mirror: 0, glow: 0,
  keyOn: 0, keyTol: 0.12, keySoft: 0.08, keyColor: [0, 1, 0],
};
const KEYS = Object.keys(NEUTRAL).filter(k => k !== 'keyColor');

export function isNeutral(p) {
  for (const k of KEYS) if (Math.abs((p[k] ?? NEUTRAL[k]) - NEUTRAL[k]) > 1e-4) return false;
  return true;
}

export class FX {
  constructor() {
    this.canvas = document.createElement('canvas');
    const opts = { premultipliedAlpha: false, preserveDrawingBuffer: true, alpha: true, antialias: false };
    const gl = this.canvas.getContext('webgl', opts) || this.canvas.getContext('experimental-webgl', opts);
    this.gl = gl;
    this.ok = !!gl;
    if (!gl) return;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s)); return s; };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(pr)); this.ok = false; return; }
    gl.useProgram(pr);
    this.pr = pr;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    this.u = {};
    for (const k of [...KEYS, 'keyColor', 'res', 'time', 'tex']) this.u[k] = gl.getUniformLocation(pr, k);
    gl.uniform1i(this.u.tex, 0);
  }

  // source: vídeo, imagem ou canvas. Devolve um canvas com o resultado (válido até a próxima chamada).
  process(source, w, h, params, time) {
    const gl = this.gl;
    const max = 1280;
    const s = Math.min(1, max / Math.max(w, h));
    const cw = Math.max(2, Math.round(w * s)), ch = Math.max(2, Math.round(h * s));
    if (this.canvas.width !== cw || this.canvas.height !== ch) { this.canvas.width = cw; this.canvas.height = ch; }
    gl.viewport(0, 0, cw, ch);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    } catch (e) { return null; }
    for (const k of KEYS) gl.uniform1f(this.u[k], params[k] ?? NEUTRAL[k]);
    const kc = params.keyColor || NEUTRAL.keyColor;
    gl.uniform3f(this.u.keyColor, kc[0], kc[1], kc[2]);
    gl.uniform2f(this.u.res, cw, ch);
    gl.uniform1f(this.u.time, time % 1000);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return this.canvas;
  }
}

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

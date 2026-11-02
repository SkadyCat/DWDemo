// 音效：全部用 Web Audio 现场合成，没有音频文件。风格往「暗色奇幻 + 有分量」靠：
// 低频托底、短促的瞬态、一点空间混响；同类声音有冷却和并发上限，几百只怪同时挨打也不会糊成一片。
// 一个声音 = 一个小配方函数（噪声 / 振荡器 → 滤波 → 包络 → 声像），都在下面的 SFX 表里。
//
// 用法：import { sfx, audio } from './audio.mjs'; sfx('pickup', { rarity: 'rare' }); audio.setVolume(0.6)
// 浏览器要求先有用户操作才能出声：第一次点击 / 按键时自动解锁。

const VOL_KEY = 'dw.volume';
let ctx = null, master = null, dry = null, wet = null, noiseBuf = null, comp = null, meter = null;
let volume = (() => { try { const v = parseFloat(localStorage.getItem(VOL_KEY)); return Number.isFinite(v) ? v : 0.6; } catch { return 0.6; } })();
const last = new Map(), live = new Map();

function impulse(c, seconds = 2.2, decay = 3.2) {
  const n = Math.floor(c.sampleRate * seconds), b = c.createBuffer(2, n, c.sampleRate);
  for (let ch = 0; ch < 2; ++ch) { const d = b.getChannelData(ch); for (let i = 0; i < n; ++i) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); }
  return b;
}
function init() {
  if (ctx) return ctx;
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext; if (!AC) return null;
  ctx = new AC();
  comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.2;
  master = ctx.createGain(); master.gain.value = volume;
  dry = ctx.createGain(); wet = ctx.createGain(); wet.gain.value = 0.22;
  const verb = ctx.createConvolver(); verb.buffer = impulse(ctx);
  const verbLow = ctx.createBiquadFilter(); verbLow.type = 'lowpass'; verbLow.frequency.value = 5200;
  dry.connect(comp); wet.connect(verb); verb.connect(verbLow); verbLow.connect(comp); comp.connect(master); master.connect(ctx.destination);
  meter = ctx.createAnalyser(); meter.fftSize = 2048; master.connect(meter);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; ++i) d[i] = Math.random() * 2 - 1;
  return ctx;
}
const unlock = () => { init(); if (ctx?.state === 'suspended') ctx.resume(); };
if (typeof addEventListener === 'function') for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, unlock, { capture: true });

// ---- building blocks --------------------------------------------------------------------------
/** Output chain for one sound: gain → (pan) → dry + reverb send. */
function out(t, { gain = 1, pan = 0, verb = 0.3 } = {}) {
  const g = ctx.createGain(); g.gain.value = gain;
  let head = g;
  if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); head = p; }
  head.connect(dry);
  if (verb > 0) { const s = ctx.createGain(); s.gain.value = verb; head.connect(s); s.connect(wet); }
  return g;
}
function env(param, t, a, peak, d, end = 0.0001) {
  param.cancelScheduledValues(t); param.setValueAtTime(0.0001, t);
  param.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
  param.exponentialRampToValueAtTime(end, t + a + d);
}
function noise(dest, t, dur, { type = 'bandpass', f0 = 1000, f1 = f0, q = 1, a = 0.005, peak = 1, rate = 1 } = {}) {
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.playbackRate.value = rate; src.loop = true;
  const flt = ctx.createBiquadFilter(); flt.type = type; flt.Q.value = q;
  flt.frequency.setValueAtTime(f0, t); flt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain(); env(g.gain, t, a, peak, dur);
  src.connect(flt); flt.connect(g); g.connect(dest);
  src.start(t, Math.random() * 1.5); src.stop(t + a + dur + 0.05);
  return flt;
}
function tone(dest, t, dur, { type = 'sine', f0 = 440, f1 = f0, a = 0.004, peak = 1, detune = 0, glide = 'exp' } = {}) {
  const o = ctx.createOscillator(); o.type = type; o.detune.value = detune;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) (glide === 'exp' ? o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + dur) : o.frequency.linearRampToValueAtTime(f1, t + dur));
  const g = ctx.createGain(); env(g.gain, t, a, peak, dur);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + a + dur + 0.05);
  return o;
}
/** A bell / chime: a few inharmonic partials with their own decays. */
function bell(dest, t, f, { dur = 1.2, peak = 0.5, bright = 1 } = {}) {
  for (const [ratio, amp, dk] of [[1, 1, 1], [2.01, 0.5 * bright, 0.6], [2.76, 0.35 * bright, 0.45], [5.4, 0.18 * bright, 0.25], [0.5, 0.25, 1.1]])
    tone(dest, t, dur * dk, { f0: f * ratio, peak: peak * amp, a: 0.002 });
}
const rnd = (a, b) => a + Math.random() * (b - a);

// ---- the sound list ---------------------------------------------------------------------------
// Each entry: [cooldown seconds, max voices at once, recipe(t, o, opts)]
const SFX = {
  // UI
  click: [0.03, 3, (t, o) => { tone(o, t, 0.05, { type: 'triangle', f0: 1400, f1: 900, peak: 0.06 }); noise(o, t, 0.03, { f0: 4000, q: 2, peak: 0.03 }); }],
  open: [0.08, 2, (t, o) => { noise(o, t, 0.22, { type: 'bandpass', f0: 500, f1: 2400, q: 1.4, a: 0.05, peak: 0.12 }); tone(o, t, 0.25, { f0: 330, f1: 495, peak: 0.05, a: 0.04 }); }],
  close: [0.08, 2, (t, o) => { noise(o, t, 0.18, { type: 'bandpass', f0: 2000, f1: 500, q: 1.4, a: 0.02, peak: 0.1 }); }],
  equip: [0.05, 2, (t, o) => { tone(o, t, 0.25, { type: 'triangle', f0: 220, f1: 180, peak: 0.25 }); noise(o, t, 0.12, { type: 'bandpass', f0: 3200, f1: 1800, q: 6, peak: 0.25 }); bell(o, t + 0.01, 880, { dur: 0.35, peak: 0.06, bright: 1.4 }); }],
  unequip: [0.05, 2, (t, o) => { tone(o, t, 0.18, { type: 'triangle', f0: 180, f1: 140, peak: 0.2 }); noise(o, t, 0.1, { f0: 2200, f1: 1200, q: 5, peak: 0.18 }); }],
  craft: [0.05, 3, (t, o, { kind = 'augment' }) => {
    const f = { augment: 660, chaos: 330, upgrade: 880, annul: 220, seal: 523, temper: 440, essence_form: 587, essence_link: 698, essence_core: 784, skill_gem: 494 }[kind] ?? 660;
    if (kind === 'chaos') { for (let i = 0; i < 6; ++i) tone(o, t + i * 0.035, 0.25, { type: 'sine', f0: f * rnd(0.8, 1.8), f1: f * rnd(1.5, 2.5), peak: 0.06 }); }
    else if (kind === 'annul') { tone(o, t, 0.4, { type: 'sine', f0: 600, f1: 120, peak: 0.18 }); noise(o, t, 0.3, { type: 'lowpass', f0: 3000, f1: 200, peak: 0.12 }); }
    else { bell(o, t, f, { dur: 0.9, peak: 0.16 }); bell(o, t + 0.07, f * 1.5, { dur: 0.7, peak: 0.1 }); }
    noise(o, t, 0.12, { type: 'highpass', f0: 6000, peak: 0.08 });
  }],
  craftFail: [0.1, 1, (t, o) => { tone(o, t, 0.2, { type: 'square', f0: 140, f1: 110, peak: 0.05 }); }],
  // loot (PoE-like: the rarer, the more it rings)
  drop: [0.04, 4, (t, o, { tier = 1 }) => {
    if (tier <= 1) { tone(o, t, 0.08, { type: 'triangle', f0: 900, f1: 600, peak: 0.06 }); return; }
    if (tier === 2) { bell(o, t, 1046, { dur: 0.7, peak: 0.1 }); return; }
    if (tier === 3) { bell(o, t, 784, { dur: 1.1, peak: 0.16 }); bell(o, t + 0.09, 1175, { dur: 0.9, peak: 0.12 }); return; }
    // legendary / three base lines: a low gong under a rising shimmer
    tone(o, t, 2.2, { f0: 98, peak: 0.25, a: 0.01 }); tone(o, t, 1.8, { f0: 147, peak: 0.12 }); bell(o, t, 523, { dur: 2, peak: 0.2 });
    for (let i = 0; i < 5; ++i) bell(o, t + 0.12 + i * 0.07, 1046 * Math.pow(1.122, i * 2), { dur: 0.8, peak: 0.07 });
  }],
  stoneDrop: [0.05, 2, (t, o) => { tone(o, t, 0.5, { f0: 196, f1: 180, peak: 0.2 }); noise(o, t, 0.15, { type: 'lowpass', f0: 900, f1: 300, peak: 0.25 }); bell(o, t + 0.02, 392, { dur: 0.9, peak: 0.08, bright: 0.6 }); }],
  pickup: [0.03, 3, (t, o, { rarity = 'normal' }) => {
    noise(o, t, 0.06, { type: 'lowpass', f0: 1600, f1: 400, peak: 0.18 }); tone(o, t, 0.1, { type: 'triangle', f0: 320, f1: 220, peak: 0.12 });
    const f = { magic: 880, rare: 1175, exalted: 1319, legendary: 1568 }[rarity]; if (f) bell(o, t + 0.02, f, { dur: 0.4, peak: 0.07 });
  }],
  coin: [0.04, 3, (t, o) => { const f = rnd(2000, 2400); tone(o, t, 0.12, { f0: f, peak: 0.08 }); tone(o, t + 0.04, 0.18, { f0: f * 1.5, peak: 0.06 }); }],
  // combat
  cast: [0.05, 3, (t, o, { el = 'physical' }) => {
    if (el === 'fire') noise(o, t, 0.28, { type: 'bandpass', f0: 400, f1: 1600, q: 0.8, a: 0.04, peak: 0.22 });
    else if (el === 'cold') { noise(o, t, 0.25, { type: 'highpass', f0: 5000, f1: 2500, a: 0.03, peak: 0.12 }); tone(o, t, 0.3, { f0: rnd(1800, 2200), f1: 1500, peak: 0.04 }); }
    else if (el === 'lightning') { noise(o, t, 0.08, { type: 'bandpass', f0: 3000, q: 3, peak: 0.25 }); tone(o, t, 0.12, { type: 'sawtooth', f0: 1600, f1: 200, peak: 0.05 }); }
    else if (el === 'chaos') { tone(o, t, 0.3, { type: 'sawtooth', f0: 110, f1: 70, peak: 0.06 }); noise(o, t, 0.25, { type: 'lowpass', f0: 800, f1: 300, peak: 0.12, a: 0.04 }); }
    else noise(o, t, 0.16, { type: 'bandpass', f0: 1200, f1: 3200, q: 1.2, a: 0.02, peak: 0.16 });
  }],
  swing: [0.06, 3, (t, o, { heavy = false }) => { noise(o, t, heavy ? 0.24 : 0.16, { type: 'bandpass', f0: heavy ? 500 : 900, f1: heavy ? 1800 : 3500, q: 1.6, a: 0.02, peak: heavy ? 0.3 : 0.2 }); }],
  hit: [0.035, 5, (t, o, { el = 'physical', crit = false }) => {
    const k = crit ? 1.6 : 1;
    tone(o, t, 0.12, { f0: rnd(150, 190), f1: 60, peak: 0.22 * k });
    if (el === 'fire') noise(o, t, 0.14, { type: 'lowpass', f0: 2400, f1: 500, peak: 0.16 * k });
    else if (el === 'cold') noise(o, t, 0.1, { type: 'highpass', f0: 4500, peak: 0.12 * k });
    else if (el === 'lightning') noise(o, t, 0.06, { type: 'bandpass', f0: 3500, q: 2, peak: 0.2 * k });
    else noise(o, t, 0.07, { type: 'bandpass', f0: 1400, f1: 700, q: 1.5, peak: 0.2 * k });
    if (crit) bell(o, t, 1760, { dur: 0.25, peak: 0.05, bright: 0.5 });
  }],
  boom: [0.07, 3, (t, o, { big = false, el = 'fire' }) => {
    const k = big ? 1.5 : 1;
    tone(o, t, big ? 0.9 : 0.5, { f0: 90, f1: 32, peak: 0.45 * k, a: 0.005 });
    noise(o, t, big ? 1.1 : 0.6, { type: 'lowpass', f0: el === 'cold' ? 6000 : 3500, f1: 120, peak: 0.4 * k, a: 0.004 });
    if (el === 'cold') noise(o, t + 0.02, 0.4, { type: 'highpass', f0: 5000, peak: 0.12 });
    if (el === 'lightning') tone(o, t, 0.15, { type: 'sawtooth', f0: 2400, f1: 300, peak: 0.06 });
  }],
  zap: [0.05, 3, (t, o) => { noise(o, t, 0.12, { type: 'bandpass', f0: 2500, f1: 5000, q: 4, peak: 0.25 }); tone(o, t, 0.1, { type: 'square', f0: 900, f1: 1800, peak: 0.03 }); }],
  thunder: [0.12, 2, (t, o) => { noise(o, t, 0.05, { type: 'highpass', f0: 3000, peak: 0.5 }); noise(o, t + 0.02, 1.4, { type: 'lowpass', f0: 1200, f1: 60, peak: 0.5, a: 0.01 }); tone(o, t, 1, { f0: 60, f1: 30, peak: 0.35 }); }],
  shatter: [0.06, 3, (t, o) => { for (let i = 0; i < 5; ++i) tone(o, t + i * 0.012, 0.25, { f0: rnd(2400, 4800), peak: 0.05 }); noise(o, t, 0.2, { type: 'highpass', f0: 4000, peak: 0.2 }); }],
  slam: [0.1, 2, (t, o) => { tone(o, t, 0.7, { f0: 70, f1: 28, peak: 0.6 }); noise(o, t, 0.8, { type: 'lowpass', f0: 1500, f1: 80, peak: 0.45 }); noise(o, t + 0.05, 0.6, { type: 'bandpass', f0: 300, q: 0.8, peak: 0.15, a: 0.05 }); }],
  blink: [0.1, 2, (t, o) => { tone(o, t, 0.18, { type: 'sine', f0: 400, f1: 2400, peak: 0.08 }); noise(o, t, 0.2, { type: 'bandpass', f0: 800, f1: 4000, q: 2, peak: 0.12 }); }],
  summon: [0.15, 2, (t, o) => { for (let i = 0; i < 3; ++i) bell(o, t + i * 0.06, [392, 523, 659][i], { dur: 0.6, peak: 0.07, bright: 0.5 }); }],
  kill: [0.045, 4, (t, o) => { tone(o, t, 0.14, { f0: rnd(240, 320), f1: 90, peak: 0.12 }); noise(o, t, 0.12, { type: 'lowpass', f0: 1800, f1: 300, peak: 0.1 }); }],
  eliteKill: [0.1, 2, (t, o) => { tone(o, t, 0.6, { f0: 110, f1: 45, peak: 0.35 }); noise(o, t, 0.5, { type: 'lowpass', f0: 2500, f1: 150, peak: 0.3 }); bell(o, t + 0.03, 330, { dur: 0.8, peak: 0.08, bright: 0.6 }); }],
  bossKill: [1, 1, (t, o) => {
    tone(o, t, 2.5, { f0: 55, f1: 28, peak: 0.7 }); noise(o, t, 2.2, { type: 'lowpass', f0: 2000, f1: 60, peak: 0.55, a: 0.01 });
    for (const [i, f] of [262, 330, 392, 523].entries()) bell(o, t + 0.5 + i * 0.12, f, { dur: 2.2, peak: 0.12 });
  }],
  hurt: [0.12, 1, (t, o) => { tone(o, t, 0.25, { f0: 120, f1: 50, peak: 0.35 }); noise(o, t, 0.15, { type: 'lowpass', f0: 900, f1: 200, peak: 0.25 }); }],
  telegraph: [0.2, 2, (t, o) => { tone(o, t, 0.9, { type: 'sawtooth', f0: 70, f1: 140, peak: 0.08, a: 0.3 }); noise(o, t, 0.9, { type: 'bandpass', f0: 200, f1: 900, q: 3, peak: 0.08, a: 0.3 }); }],
  // world / story
  mapStart: [1, 1, (t, o) => { tone(o, t, 2.4, { f0: 55, peak: 0.3, a: 0.2 }); tone(o, t, 2.4, { f0: 82.4, peak: 0.15, a: 0.3 }); noise(o, t, 1.8, { type: 'bandpass', f0: 200, f1: 1200, q: 1, peak: 0.12, a: 0.6 }); }],
  portal: [1, 1, (t, o) => { for (let i = 0; i < 8; ++i) bell(o, t + i * 0.09, 392 * Math.pow(2, i / 6), { dur: 1.4, peak: 0.07 }); noise(o, t, 2, { type: 'bandpass', f0: 300, f1: 3000, q: 2, peak: 0.1, a: 0.8 }); }],
  quest: [0.3, 1, (t, o) => { bell(o, t, 659, { dur: 0.9, peak: 0.14 }); bell(o, t + 0.13, 988, { dur: 1.2, peak: 0.12 }); }],
  chapter: [1, 1, (t, o) => { for (const [i, f] of [392, 494, 587, 784].entries()) bell(o, t + i * 0.16, f, { dur: 2.4 - i * 0.2, peak: 0.16 }); tone(o, t, 3, { f0: 98, peak: 0.2, a: 0.3 }); }],
  story: [1, 1, (t, o) => { tone(o, t, 3, { f0: 110, peak: 0.12, a: 0.8 }); tone(o, t, 3, { f0: 164.8, peak: 0.08, a: 1 }); bell(o, t + 0.3, 659, { dur: 2.5, peak: 0.06, bright: 0.4 }); }],
};

/**
 * Play a sound. opts: { pan (-1..1), gain, ...recipe options }.
 * Cooldown and voice caps keep a 200-monster fight readable.
 */
export function sfx(name, opts = {}) {
  if (volume <= 0) return;
  const def = SFX[name]; if (!def || !init() || ctx.state !== 'running') return;
  const [cool, cap, recipe] = def, now = ctx.currentTime;
  if (now - (last.get(name) ?? -1) < cool) return;
  const n = live.get(name) ?? 0; if (n >= cap) return;
  last.set(name, now); live.set(name, n + 1);
  setTimeout(() => live.set(name, Math.max(0, (live.get(name) ?? 1) - 1)), 350);
  try { recipe(now + 0.005, out(now, { gain: opts.gain ?? 1, pan: opts.pan ?? 0, verb: opts.verb ?? 0.3 }), opts); } catch (e) { console.warn('[sfx]', name, e); }
}

// ---- loops: wind for tornadoes, a low drone in maps --------------------------------------------
const loops = {};
function loop(name, build) {
  if (!init()) return null;
  if (!loops[name]) { const g = ctx.createGain(); g.gain.value = 0; g.connect(dry); const s = ctx.createGain(); s.gain.value = 0.4; g.connect(s); s.connect(wet); build(g); loops[name] = g; }
  return loops[name];
}
/** level 0..1; the loop fades towards it. */
export function setLoop(name, level) {
  if (!ctx || ctx.state !== 'running') { if (level > 0) init(); return; }
  const g = loop(name, dest => {
    if (name === 'wind') {
      const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 600; f.Q.value = 0.9;
      const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.35; lg.gain.value = 380; lfo.connect(lg); lg.connect(f.frequency); lfo.start();
      src.connect(f); f.connect(dest); src.start();
    } else if (name === 'drone') {
      for (const [fq, a] of [[55, 0.5], [82.6, 0.25], [110.3, 0.12]]) { const o = ctx.createOscillator(); o.frequency.value = fq; const og = ctx.createGain(); og.gain.value = a; o.connect(og); og.connect(dest); o.start(); }
      const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260; const ng = ctx.createGain(); ng.gain.value = 0.6;
      src.connect(f); f.connect(ng); ng.connect(dest); src.start();
    }
  });
  if (!g) return;
  const peak = { wind: 0.22, drone: 0.05 }[name] ?? 0.1;
  g.gain.setTargetAtTime(Math.max(0, Math.min(1, level)) * peak, ctx.currentTime, 0.25);
}

export const audio = {
  get volume() { return volume; },
  setVolume(v) { volume = Math.max(0, Math.min(1, v)); try { localStorage.setItem(VOL_KEY, String(volume)); } catch { /* ignore */ } if (master) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.05); },
  names: Object.keys(SFX),
  /** Current output level 0..1 (for tests and a level meter). */
  level() { if (!meter) return 0; const a = new Float32Array(meter.fftSize); meter.getFloatTimeDomainData(a); let m = 0; for (const v of a) m = Math.max(m, Math.abs(v)); return m; },
};

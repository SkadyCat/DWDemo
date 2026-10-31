// Presentation-only reward feedback: banners, toasts and synthesized chimes.
// Nothing here changes the save or combat; callers pass in what happened.
import { reactive } from '/vendor/vue.esm-browser.prod.js';

export const feedback = reactive({ banners: [], toasts: [], streak: 0, streakBonus: 0, streakAt: 0, flash: 0 });
let serial = 0;

/** A big centred banner (level up, chapter complete, legendary drop). */
export function banner(kind, title, sub = '', { duration = 2600 } = {}) {
  const id = ++serial;
  feedback.banners.push({ id, kind, title, sub });
  if (feedback.banners.length > 3) feedback.banners.shift();
  setTimeout(() => { const i = feedback.banners.findIndex(b => b.id === id); if (i >= 0) feedback.banners.splice(i, 1); }, duration);
  if (kind === 'level') feedback.flash = id;
}

/** A small stacked toast on the right (quest done, rewards, first clear). */
export function toast(kind, title, lines = [], { duration = 6500 } = {}) {
  const id = ++serial;
  feedback.toasts.push({ id, kind, title, lines });
  if (feedback.toasts.length > 4) feedback.toasts.shift();
  setTimeout(() => { const i = feedback.toasts.findIndex(t => t.id === id); if (i >= 0) feedback.toasts.splice(i, 1); }, duration);
}

export function setStreak(count, bonus) {
  feedback.streak = count; feedback.streakBonus = bonus; feedback.streakAt = performance.now();
}

// ------------------------------------------------------------------ chimes
let ctx = null, master = null, volume = 0.4, muted = false;
export function configureChimes({ volume: v, muted: m } = {}) {
  if (Number.isFinite(v)) volume = v;
  if (typeof m === 'boolean') muted = m;
  if (master) master.gain.value = muted ? 0 : volume * 0.5;
}
function audio() {
  if (ctx) return ctx;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = muted ? 0 : volume * 0.5; master.connect(ctx.destination);
  } catch { ctx = null; }
  return ctx;
}
function note(freq, start, length, type = 'triangle', gain = 0.25) {
  const c = audio(); if (!c) return;
  const o = c.createOscillator(), g = c.createGain(), t = c.currentTime + start;
  o.type = type; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0008, t + length);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + length + 0.05);
}
const CHIMES = {
  level: () => { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => note(f, i * 0.09, 0.9, 'triangle', 0.22)); note(1567.98, 0.38, 1.2, 'sine', 0.12); },
  quest: () => { note(659.25, 0, 0.35, 'triangle', 0.2); note(987.77, 0.12, 0.6, 'triangle', 0.2); },
  claim: () => { [783.99, 987.77, 1174.66].forEach((f, i) => note(f, i * 0.06, 0.5, 'sine', 0.16)); },
  rare: () => { note(880, 0, 0.5, 'sine', 0.16); note(1318.5, 0.08, 0.7, 'sine', 0.14); },
  legendary: () => { [440, 554.37, 659.25, 880, 1108.73].forEach((f, i) => note(f, i * 0.07, 1.1, 'triangle', 0.16)); },
  streak: () => note(1174.66, 0, 0.18, 'square', 0.05),
};
export function chime(kind) { try { if (!muted && volume > 0) CHIMES[kind]?.(); } catch { /* audio is optional */ } }

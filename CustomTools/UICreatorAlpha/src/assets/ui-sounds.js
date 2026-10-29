import { soundAsset, defaultAudio } from '../core/audio.js';

// Authored PCM assets: generated once, then the exact same WAV bytes are used on both platforms.
function tone(duration, start, end, harmonics = [1, .12]) {
  const rate = 24000, count = Math.round(duration * rate), bytes = new Uint8Array(44 + count * 2), view = new DataView(bytes.buffer);
  const text = (offset, value) => [...value].forEach((c, i) => { bytes[offset + i] = c.charCodeAt(0); });
  text(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); text(8, 'WAVEfmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, count * 2, true);
  let phase = 0;
  for (let i = 0; i < count; i++) { const t = i / count, envelope = Math.min(1, t / .04) * Math.pow(1 - t, 2.8); phase += 2 * Math.PI * (start + (end - start) * t) / rate; const value = harmonics.reduce((sum, amplitude, j) => sum + Math.sin(phase * (j + 1)) * amplitude, 0) * envelope * .19; view.setInt16(44 + i * 2, Math.round(value * 32767), true); }
  return bytes;
}
let cache;
export function builtinSounds() {
  cache ||= Object.fromEntries([
    ['ui-hover', '轻触 · 悬停', .035, 1600, 1850], ['ui-press', '轻触 · 按下', .045, 460, 280],
    ['ui-click', '轻触 · 确认', .085, 980, 1220], ['ui-select', '柔和 · 选中', .12, 780, 1180],
    ['ui-open', '柔和 · 打开', .16, 480, 920], ['ui-close', '柔和 · 关闭', .13, 720, 340],
  ].map(([id, name, duration, a, b]) => [id, soundAsset(id, name, tone(duration, a, b))]));
  return structuredClone(cache);
}
export function materializeSounds(project) {
  const defaults = builtinSounds(); project.sounds ||= structuredClone(defaults);
  const visit = node => { node.audio ||= defaultAudio(node.type, node.binding); for (const id of Object.values(node.audio.events)) if (defaults[id]) project.sounds[id] ||= structuredClone(defaults[id]); for (const patch of Object.values(node.overrides || {})) for (const id of Object.values(patch.audio?.events || {})) if (defaults[id]) project.sounds[id] ||= structuredClone(defaults[id]); for (const child of node.children || []) visit(child); };
  visit(project.root); for (const prefab of Object.values(project.prefabs || {})) visit(prefab.root);
  return project;
}

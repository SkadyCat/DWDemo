export const AUDIO_EVENTS = { hovered: '悬停', unhovered: '移出', pressed: '按下', released: '释放', clicked: '点击确认', selected: '选中', opened: '打开', closed: '关闭' };
export const MAX_AUDIO_BYTES = 1024 * 1024;
const waveInfoCache = new Map();
export const defaultAudio = (type, binding = '') => ({ enabled: true, volume: 1, pitch: 1, events: type === 'Button' ? { hovered: 'ui-hover', clicked: 'ui-click', ...(binding === 'ability' ? { selected: 'ui-select' } : {}) } : {} });
export function wavBytes(source) {
  if (typeof source !== 'string' || !/^data:audio\/wav;base64,[A-Za-z0-9+/]+={0,2}$/.test(source) || source.length > MAX_AUDIO_BYTES * 1.34 + 100) throw new Error('音效需为不超过 1 MB 的 PCM WAV');
  return Uint8Array.from(atob(source.slice(source.indexOf(',') + 1)), c => c.charCodeAt(0));
}
export function inspectWav(bytes) {
  if (!bytes || bytes.byteLength < 44 || bytes.byteLength > MAX_AUDIO_BYTES) throw new Error('WAV 文件大小无效');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), text = (offset, count) => String.fromCharCode(...bytes.subarray(offset, offset + count));
  if (text(0, 4) !== 'RIFF' || text(8, 4) !== 'WAVE' || view.getUint32(4, true) + 8 !== bytes.length) throw new Error('不是完整的 RIFF WAV 文件');
  let channels, sampleRate, blockAlign, dataSize;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const name = text(offset, 4), size = view.getUint32(offset + 4, true), start = offset + 8;
    if (start + size > bytes.length) throw new Error('WAV 数据截断');
    if (name === 'fmt ') {
      if (size < 16 || view.getUint16(start, true) !== 1 || view.getUint16(start + 14, true) !== 16) throw new Error('请导入 16 位 PCM WAV');
      channels = view.getUint16(start + 2, true); sampleRate = view.getUint32(start + 4, true); blockAlign = view.getUint16(start + 12, true);
      if (![1, 2].includes(channels) || sampleRate < 8000 || sampleRate > 96000 || blockAlign !== channels * 2 || view.getUint32(start + 8, true) !== sampleRate * blockAlign) throw new Error('WAV 需为单/双声道、8–96 kHz');
    }
    if (name === 'data') dataSize = size;
    offset = start + size + size % 2;
  }
  if (!sampleRate || !dataSize || dataSize % blockAlign) throw new Error('WAV 缺少有效音频采样');
  const duration = dataSize / (sampleRate * blockAlign);
  if (duration > 10) throw new Error('UI 音效最长 10 秒');
  return { channels, sampleRate, duration, bytes: bytes.length };
}
export function soundAsset(id, name, bytes, props = {}) {
  const metadata = inspectWav(bytes); let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
  return { id, name, version: 1, folderId: '', source: `data:audio/wav;base64,${btoa(binary)}`, volume: .65, pitch: 1, cooldown: 60, ...metadata, ...props };
}
export function validateSoundAsset(asset, id = asset?.id) {
  if (!asset || asset.id !== id || !/^[a-zA-Z0-9_-]{1,160}$/.test(id || '') || asset.version !== 1 || typeof asset.name !== 'string' || !asset.name.trim() || asset.name.length > 240) return ['音效资产身份或版本无效'];
  const errors = [];
  if (!Number.isFinite(asset.volume) || asset.volume < 0 || asset.volume > 1 || !Number.isFinite(asset.pitch) || asset.pitch < .25 || asset.pitch > 4 || !Number.isFinite(asset.cooldown) || asset.cooldown < 0 || asset.cooldown > 5000) errors.push(`音效 ${asset.name}: 音量、音高或间隔无效`);
  try { let info = waveInfoCache.get(asset.source); if (!info) { info = inspectWav(wavBytes(asset.source)); if (waveInfoCache.size >= 64) waveInfoCache.delete(waveInfoCache.keys().next().value); waveInfoCache.set(asset.source, info); } if (Math.abs(info.duration - asset.duration) > .0001 || info.channels !== asset.channels || info.sampleRate !== asset.sampleRate) errors.push(`音效 ${asset.name}: 元数据与 WAV 不一致`); } catch (error) { errors.push(`音效 ${asset.name}: ${error.message}`); }
  return errors;
}
export function validateAudioBinding(audio, sounds, label = '') {
  if (!audio) return [];
  if (typeof audio !== 'object' || Array.isArray(audio) || typeof audio.enabled !== 'boolean' || !Number.isFinite(audio.volume) || audio.volume < 0 || audio.volume > 1 || !Number.isFinite(audio.pitch) || audio.pitch < .25 || audio.pitch > 4 || !audio.events || typeof audio.events !== 'object' || Array.isArray(audio.events)) return [`${label}: 音效配置无效`];
  return Object.entries(audio.events).filter(([event, id]) => !/^[a-zA-Z0-9_-]{1,80}$/.test(event) || typeof id !== 'string' || (id && !Object.hasOwn(sounds || {}, id))).map(([event, id]) => `${label}: 缺少音效或事件无效 ${event} → ${id}`);
}
export function resolveSound(node, event, sounds) {
  const audio = node.audio || defaultAudio(node.type, node.binding); if (!audio.enabled || (node.type === 'Button' && node.interactable === false)) return null;
  const id = audio.events?.[event], asset = Object.hasOwn(sounds || {}, id) ? sounds[id] : null; if (!asset) return null;
  return { asset, volume: asset.volume * audio.volume, pitch: Math.max(.25, Math.min(4, asset.pitch * audio.pitch)) };
}

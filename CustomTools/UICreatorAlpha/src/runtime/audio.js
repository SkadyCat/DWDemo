import { resolveSound, wavBytes } from '../core/audio.js';
let sharedContext;
export class UiAudioPlayer {
  constructor({ context = null, onPlay = () => {}, onError = () => {} } = {}) { this.context = context; this.onPlay = onPlay; this.onError = onError; this.volume = 1; this.muted = false; this.buffers = new Map(); this.lastPlayed = new Map(); this.voices = []; this.destroyed = false; }
  async unlock() {
    if (this.destroyed || this.muted) return false;
    try {
      const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!this.context) { if (!Audio) return false; sharedContext ||= new Audio({ latencyHint: 'interactive' }); this.context = sharedContext; }
      if (this.context.state === 'suspended') await this.context.resume();
      return this.context.state === 'running';
    } catch (error) { this.onError(error); return false; }
  }
  async play(node, event, sounds) {
    const cue = resolveSound(node, event, sounds); if (!cue || this.destroyed || this.muted || this.volume <= 0 || cue.volume <= 0) return false;
    const context = this.context; if (!context || context.state !== 'running') return false;
    const { asset } = cue, now = context.currentTime * 1000;
    if (now - (this.lastPlayed.get(asset.id) ?? -Infinity) < asset.cooldown) return false;
    this.lastPlayed.set(asset.id, now);
    try {
      const cached = this.buffers.get(asset.id); let pending;
      if (cached?.source === asset.source) pending = cached.pending;
      else { const bytes = wavBytes(asset.source); pending = context.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)); this.buffers.set(asset.id, { source: asset.source, pending }); }
      const buffer = await pending;
      if (this.destroyed || this.muted || context.state !== 'running') return false;
      while (this.voices.length >= 8) this.voices.shift().stop();
      const voice = context.createBufferSource(), gain = context.createGain(); voice.buffer = buffer; voice.playbackRate.value = cue.pitch; gain.gain.value = cue.volume * this.volume;
      voice.connect(gain); gain.connect(context.destination); this.voices.push(voice);
      voice.onended = () => { this.voices = this.voices.filter(v => v !== voice); voice.disconnect(); gain.disconnect(); };
      voice.start(); this.onPlay({ id: asset.id, name: asset.name, event, volume: gain.gain.value, pitch: cue.pitch, duration: buffer.duration }); return true;
    } catch (error) { this.buffers.delete(asset.id); this.onError(error); return false; }
  }
  setMuted(muted) { this.muted = muted; if (muted) this.stop(); }
  stop() { for (const voice of this.voices.splice(0)) voice.stop(); }
  destroy() { this.destroyed = true; this.stop(); this.buffers.clear(); this.lastPlayed.clear(); }
}

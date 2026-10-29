// Presentation-only rolling damage statistics. Hits in one simulation frame
// share a total and target set, regardless of hit count. No combat decisions.
export class AverageTargetDps {
  constructor() { this.reset(); }

  reset() {
    this.time = 0;
    this.total = 0;
    this.frames = [];
    this.head = 0;
    this.targetFrames = new Map();
    this.pool = [];
  }

  // The HUD clock pauses with gameplay but continues draining after combat ends.
  advance(seconds) {
    if (!(seconds > 0) || !Number.isFinite(seconds)) return;
    this.time += seconds;
    const cutoff = this.time - 1 + 1e-9;
    while (this.head < this.frames.length && this.frames[this.head].time <= cutoff) {
      const frame = this.frames[this.head++];
      this.total -= frame.amount;
      for (const id of frame.targets) {
        const remaining = this.targetFrames.get(id) - 1;
        if (remaining) this.targetFrames.set(id, remaining);
        else this.targetFrames.delete(id);
      }
      frame.targets.clear();
      this.pool.push(frame);
    }
    if (!this.targetFrames.size) this.total = 0;
    if (this.head >= 64 && this.head * 2 >= this.frames.length) {
      this.frames = this.frames.slice(this.head);
      this.head = 0;
    }
  }

  record(targetId, amount) {
    if (!(amount > 0) || !Number.isFinite(amount)) return;
    let frame = this.frames.length > this.head ? this.frames[this.frames.length - 1] : null;
    if (!frame || frame.time !== this.time) {
      frame = this.pool.pop() || { time: 0, amount: 0, targets: new Set() };
      frame.time = this.time;
      frame.amount = 0;
      this.frames.push(frame);
    }
    if (!frame.targets.has(targetId)) {
      frame.targets.add(targetId);
      this.targetFrames.set(targetId, (this.targetFrames.get(targetId) || 0) + 1);
    }
    frame.amount += amount;
    this.total += amount;
  }

  get targets() { return this.targetFrames.size; }
  // Full-second denominator prevents frame-duration spikes during startup.
  get value() { return this.targets ? Math.max(0, this.total) / this.targets : 0; }
}

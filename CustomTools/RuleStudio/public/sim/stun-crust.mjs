import { statusKey } from '../../engine/types.mjs';

// 3D battle policy over resolved Character damage. The rule interpreter and
// damage resolver stay unchanged; parameters come from the character fixed slot.
export class StunCrust {
  constructor(battle) {
    this.battle = battle;
    this.breaks = 0;
    this.reset();
    const character = battle.character, takeHit = character.takeHit.bind(character);
    character.takeHit = hit => {
      this.readRules();
      const fraction = character.base.stunFraction;
      if (this.enabled) character.base.stunFraction = Number.MAX_VALUE;
      let result;
      try { result = takeHit(hit); } finally { character.base.stunFraction = fraction; }
      if (character.dead) this.reset();
      // taken is the mitigated hit BEFORE shield/life allocation. Shield-only
      // hits wear the crust too; do not replace this with lifeLost.
      else if (this.enabled && !hit.dot && result.taken > 0 && !result.evaded) this.hit(result.taken);
      return result;
    };
  }
  reset() { this.amount = 0; this.quiet = 0; this.rate = 0; this.phase = 'ready'; this.breakAge = 0; this.hitAge = 1; }
  readRules() {
    const c = this.battle.character, s = path => c.stat('stun.' + path);
    this.weight = s('buildup'); this.percent = s('threshold_life_percent'); this.duration = s('duration');
    this.delay = s('decay_delay'); this.decay = s('decay_seconds'); this.restore = s('restore_seconds');
    this.capacity = c.maxLife * this.percent / 100;
    this.enabled = this.weight > 0 && this.capacity > 0 && this.duration > 0;
  }
  hit(damage) {
    // Only resolved non-DOT hits reach here. Hits also interrupt recovery;
    // an already empty layer cannot repeatedly stun before it has recovered.
    const hadIntegrity = this.amount < this.capacity;
    this.amount = Math.min(this.capacity, this.amount + damage * this.weight);
    this.quiet = this.rate = this.hitAge = 0;
    if (!hadIntegrity || this.amount < this.capacity) return;
    const { character: c, hero, host, heroTargetId } = this.battle;
    this.phase = 'broken'; this.breakAge = 0; this.breaks++;
    c.stunned = Math.max(c.stunned, this.duration); c.totals.stuns++;
    hero.castClock = 0; hero.casting = false;
    host.world.applyStatusKey(heroTargetId, statusKey('stun'), 1, this.duration, hero.owner);
  }
  tick(dt) {
    this.readRules();
    if (this.battle.character.dead || !this.enabled) { this.reset(); return; }
    dt = Math.max(0, dt); this.hitAge += dt;
    const before = Math.max(0, this.quiet - this.delay); this.quiet += dt;
    const after = Math.max(0, this.quiet - this.delay);
    if (this.phase === 'broken') {
      this.breakAge += dt;
      if (this.battle.character.stunned > 0) return;
      this.phase = 'restoring';
    }
    if (this.amount <= 0 || after <= 0) return;
    const seconds = this.phase === 'restoring' ? this.restore : this.decay;
    if (seconds <= 0) { this.reset(); return; }
    if (this.rate <= 0) this.rate = this.amount / seconds;
    this.amount = Math.max(0, this.amount - this.rate * (after - before));
    if (this.amount < 1e-9) this.reset();
  }
  snapshot() {
    this.readRules();
    const integrity = Math.max(0, 1 - this.amount / Math.max(1, this.capacity));
    const maxLife = this.battle.character.maxLife, amount = this.amount;
    return { enabled: this.enabled, amount, maxLife, buildupFraction: maxLife > 0 ? Math.max(0, Math.min(1, amount / maxLife)) : 0, integrity, capacity: this.capacity, remaining: integrity * this.capacity,
      phase: this.phase, stunSeconds: this.battle.character.stunned, breakAge: this.breakAge, breaks: this.breaks, hitAge: this.hitAge };
  }
}

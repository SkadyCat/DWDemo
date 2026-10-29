// Generic owner-maintained layers, autonomous event pulses and idle decay.
// There are no skill ids, meshes, browser timers or resource grants in this module.
import { ESlot } from './compiler.mjs';
import { InvalidId, INDEX_NONE, KeepInherited, mix64, random01, safeNormal, clamp } from './types.mjs';

const EPS = 1e-5;
export class MaintainedEmitters {
  constructor(world) { this.world = world; this.entries = new Map(); }

  maintain(action, context) {
    const w = this.world, read = (slot, fallback = 0) => w.slotOr(action, slot, context, fallback);
    if (action.mode === 1) {
      const key = `${action.stateKey}|o${context.root.owner}`, entry = this.entries.get(key), value = read(ESlot.Value);
      if (!entry || !Number.isFinite(value) || value <= 0 || !(w.ownerState.get(key) > 0)) return false;
      entry.level = Math.min(entry.cap, Math.floor(w.ownerState.get(key)) + Math.max(1, Math.floor(value)));
      entry.lastInput = w.clock; entry.decayAt = w.clock + entry.duration;
      w.ownerState.set(key, entry.level);
      w.trace?.('emitter_fed', { key, owner: entry.owner, level: entry.level, cap: entry.cap, decayAt: entry.decayAt });
      return true;
    }
    const value = read(ESlot.Value), cap = read(ESlot.Cap), duration = read(ESlot.Duration), interval = read(ESlot.Interval);
    const decay = w.eval(action.decayInterval, context), radius = read(ESlot.Radius, 24);
    if (![value, cap, duration, interval, decay, radius].every(Number.isFinite) || value <= 0 || cap < 1 || duration < 0 || (!action.rate && interval <= 0) || decay <= 0 || radius < 0) return false;
    const owner = context.root.owner, key = `${action.stateKey}|o${owner}`, previous = this.entries.get(key);
    if (!previous && this.entries.size >= 128) { ++w.frameStats.CapacityDrops; return false; }
    const entry = previous || { key, stateKey: action.stateKey, owner, born: w.clock, pulse: 0,
      nextFire: w.clock + Math.max(.05, interval), lastPulse: null, level: 0 };
    const wasRandom = !!entry.rate;
    const oldRoot = previous?.root;
    w.holdRoot(context.rootIndex);
    Object.assign(entry, { root: context.rootIndex, cap: clamp(Math.floor(cap), 1, 512), interval: Math.max(.05, interval),
      rate: action.rate,
      duration, decayInterval: Math.max(.05, decay), radius: Math.min(1000, radius), event: action.event, targeting: action.targeting,
      power: context.event.amount, tags: (context.event.tags & KeepInherited) | action.addTags,
      seed: context.root.seed, lastInput: w.clock, decayAt: w.clock + duration });
    entry.level = Math.min(entry.cap, Math.max(0, Math.floor(w.ownerState.get(key) || 0)) + Math.max(1, Math.floor(value)));
    this.entries.set(key, entry); w.ownerState.set(key, entry.level);
    if (action.rate) {
      if (entry.hazard == null) { entry.scheduleSeed = context.root.seed; entry.sample = 0; entry.hazard = this.sampleHazard(entry); entry.rateAt = w.clock; }
      if (!wasRandom) entry.rateAt = w.clock;
      const rate = this.rate(entry); entry.nextFire = rate > 0 ? w.clock + entry.hazard / rate : Infinity;
    } else if (wasRandom) entry.nextFire = w.clock + entry.interval;
    if (oldRoot != null) w.releaseHeldRoot(oldRoot);
    w.trace?.('emitter_maintained', { key, owner, level: entry.level, cap: entry.cap, decayAt: entry.decayAt });
    return true;
  }

  stop(entry) {
    this.entries.delete(entry.key); this.world.ownerState.set(entry.key, 0);
    this.world.releaseHeldRoot(entry.root);
    this.world.trace?.('emitter_end', { key: entry.key, owner: entry.owner });
  }

  sampleHazard(entry) {
    return -Math.log(Math.max(1e-7, 1 - random01(entry.scheduleSeed, ++entry.sample, 0x504F4953)));
  }

  rate(entry) {
    const w = this.world, root = w.roots[entry.root];
    const value = w.eval(entry.rate, { root, rootIndex: entry.root, plan: w.plans[root.plan], stored: entry.level,
      event: { amount: entry.level, damage: entry.power, generation: 0, sequence: entry.pulse } });
    return Number.isFinite(value) ? clamp(value, 0, 1024) : 0;
  }

  randomTick(entry) {
    const w = this.world;
    let from = entry.rateAt, work = 0;
    while (entry.level && from < w.clock) {
      const until = Math.min(w.clock, entry.decayAt), rate = this.rate(entry);
      let budget = rate * Math.max(0, until - from);
      // Integrate the exponential waiting time. Recasts and level changes retain
      // its unspent probability; they never restart a timer or force an extra shot.
      while (budget >= entry.hazard && work < 64) {
        budget -= entry.hazard; this.fire(entry); ++work; entry.hazard = this.sampleHazard(entry);
      }
      if (work === 64 && budget >= entry.hazard) { ++w.frameStats.CapacityDrops; budget = 0; }
      entry.hazard -= budget; from = until;
      if (from + EPS >= entry.decayAt) {
        --entry.level; entry.decayAt += entry.decayInterval; w.ownerState.set(entry.key, entry.level);
        w.trace?.('emitter_decay', { key: entry.key, owner: entry.owner, level: entry.level });
      }
    }
    entry.rateAt = w.clock;
    if (!entry.level) { this.stop(entry); return; }
    const rate = this.rate(entry); entry.nextFire = rate > 0 ? w.clock + entry.hazard / rate : Infinity;
  }

  target(entry) {
    const w = this.world, t = w.targets, owner = w.owners[entry.owner];
    if (entry.targeting === 'aim') return INDEX_NONE;
    const candidates = []; let nearest = INDEX_NONE, best = entry.radius ** 2;
    for (let i = 0; i < t.num; i++) {
      if (!(t.health[i] > 0) || !w.isHostile(entry.owner, i)) continue;
      const d = (t.px[i] - owner.px) ** 2 + (t.py[i] - owner.py) ** 2;
      if (d > entry.radius ** 2) continue;
      if (entry.targeting === 'random') candidates.push(i);
      else if (d < best || (d === best && (nearest < 0 || t.externalId[i] < t.externalId[nearest]))) { nearest = i; best = d; }
    }
    return candidates.length ? candidates[Math.min(candidates.length - 1, Math.floor(random01(entry.seed, entry.pulse, 0xE117) * candidates.length))] : nearest;
  }

  fire(entry) {
    const w = this.world, source = w.roots[entry.root], owner = w.owners[entry.owner];
    const rootIndex = w.openRoot(source.plan, entry.owner, mix64(entry.seed ^ BigInt(++entry.pulse)));
    if (rootIndex === INDEX_NONE) return;
    const root = w.roots[rootIndex], target = this.target(entry), t = w.targets;
    const [dx, dy, dz] = target >= 0 ? safeNormal(t.px[target] - owner.px, t.py[target] - owner.py, 0) : owner.aim;
    w.emitterPulseHook?.(rootIndex, entry.root, entry);
    w.pushEvent({ type: entry.event, generation: 0, element: 3, root: rootIndex, sequence: root.nextSequence++, lineage: 0,
      sourceIndex: INDEX_NONE, sourceId: InvalidId, targetIndex: target, targetId: target >= 0 ? t.externalId[target] : InvalidId,
      px: owner.px, py: owner.py, pz: owner.pz, dx, dy, dz: dz || 0,
      amount: entry.level, damage: entry.power, stored: entry.level, tags: entry.tags });
    w.releaseHeldRoot(rootIndex);
    entry.lastPulse = w.clock;
    w.trace?.('emitter_pulse', { key: entry.key, owner: entry.owner, root: rootIndex, level: entry.level, target });
  }

  tick() {
    const w = this.world;
    for (const entry of this.entries.values()) {
      const owner = w.owners[entry.owner], body = owner ? w.targetIndexOf(owner.statusId) : INDEX_NONE;
      if (!owner || !w.roots[entry.root]?.active || (body >= 0 && !(w.targets.health[body] > 0))) { this.stop(entry); continue; }
      entry.level = clamp(Math.floor(w.ownerState.get(entry.key) || 0), 0, entry.cap);
      if (!entry.level) { this.stop(entry); continue; }
      if (entry.rate) { this.randomTick(entry); continue; }
      if (w.clock + EPS >= entry.decayAt) {
        const lost = Math.floor((w.clock + EPS - entry.decayAt) / entry.decayInterval) + 1;
        entry.level = Math.max(0, entry.level - lost); entry.decayAt += lost * entry.decayInterval;
        w.ownerState.set(entry.key, entry.level);
        w.trace?.('emitter_decay', { key: entry.key, owner: entry.owner, level: entry.level });
      }
      if (!entry.level) { this.stop(entry); continue; }
      if (w.clock + EPS < entry.nextFire) continue;
      // A long frame coalesces overdue pulses rather than creating an unbounded burst.
      entry.nextFire += (Math.floor((w.clock + EPS - entry.nextFire) / entry.interval) + 1) * entry.interval;
      this.fire(entry);
    }
  }
}

// 世界：单位、时间、随机数、属性求值、资源、状态、事件队列。技能、载体、伤害各自独立成模块挂在这里。
import { Actor } from './actor.mjs';
import { Grid } from './grid.mjs';
import { statDef, CHARGES } from './registry.mjs';
import { newAccumulator, accumulate, resolve } from './mods.mjs';
import { applyStatus, activeInstances, removeStatus } from './status.mjs';

/** Deterministic PRNG (mulberry32). Every random roll in combat goes through world.random(). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const EMPTY_TAGS = new Set();

export class World {
  constructor(content, { seed = 1, eventBudget = 20000, maxDepth = 8 } = {}) {
    this.content = content;
    this.time = 0;
    this.seed = seed;
    this.random = rng(seed);
    this.streams = new Map();
    this.actors = new Map();
    this.nextId = 1;
    this.queue = [];
    this.eventBudget = eventBudget; this.maxDepth = maxDepth;
    this.stats = { events: 0, dropped: 0 };
    this.listeners = [];       // host/test hooks: (event) => void
    this.systems = [];         // per-step systems (carriers, skills, AI): { step(world, dt) }
    this.handlers = new Map(); // event type → [(world, event) => void] engine-level handlers (rules, kill credit)
    this.timers = [];          // delayed actions: { at, fn }
    this.grid = new Grid();
  }

  /**
   * Independent random streams per purpose ('crit', 'spawn', 'rule:<id>'…). Changing how often one
   * kind of roll happens never shifts another kind, so A/B comparisons of builds stay stable.
   */
  roll(purpose) {
    let r = this.streams.get(purpose);
    if (!r) {
      let h = this.seed >>> 0;
      for (let i = 0; i < purpose.length; ++i) h = Math.imul(h ^ purpose.charCodeAt(i), 2654435761) >>> 0;
      this.streams.set(purpose, r = rng(h));
    }
    return r();
  }

  // ---- actors -------------------------------------------------------------------------------
  spawn(opts) {
    const actor = new Actor({ ...opts, id: this.nextId++ });
    if (opts.owner) opts.owner.minions.add(actor);
    for (const m of opts.mods ?? []) actor.sheet.add(m);
    this.actors.set(actor.id, actor);
    this.grid.insert(actor);
    this.refreshPools(actor, true);
    return actor;
  }
  remove(actor) {
    actor.alive = false;
    this.actors.delete(actor.id);
    actor.owner?.minions.delete(actor);
  }
  rootOwner(actor) { return actor.root; }
  areEnemies(a, b) { return a.team !== b.team; }
  *each(filter) { for (const a of this.actors.values()) if (a.alive && (!filter || filter(a))) yield a; }
  /** Live actors within `radius` of a point (edge distance), optionally filtered. */
  around(x, y, radius, fn, filter) {
    this.grid.query(x, y, radius, a => { if (Math.hypot(a.x - x, a.y - y) - a.radius <= radius) fn(a); }, filter);
  }
  countNearby(who, rel, radius) {
    let n = 0;
    this.grid.query(who.x, who.y, radius, a => {
      if (a !== who && Math.hypot(a.x - who.x, a.y - who.y) <= radius) ++n;
    }, rel === 'enemy' ? { notTeam: who.team } : { team: who.team });
    return n;
  }
  nearest(who, rel, radius, exclude) {
    let best = null, bd = radius * radius;
    // Grow the search ring so the common case (something close) stays cheap.
    for (let r = Math.min(radius, 400); ; r = Math.min(radius, r * 2)) {
      this.grid.query(who.x, who.y, r, a => {
        if (a === who || exclude?.has(a.id)) return;
        const dx = a.x - who.x, dy = a.y - who.y, d = dx * dx + dy * dy;
        if (d < bd || (d === bd && best && a.id < best.id)) { bd = d; best = a; }
      }, rel === 'enemy' ? { notTeam: who.team } : { team: who.team });
      if (best || r >= radius) return best;
    }
  }

  // ---- stats --------------------------------------------------------------------------------
  /**
   * Evaluate a stat on an actor right now. `tags` is the set of skill/damage tags of what is being
   * evaluated; `ctx` may carry target, skill (for linked support mods) and the triggering event.
   */
  stat(actor, key, tags = EMPTY_TAGS, ctx = null) { return this.scaled(actor, key, undefined, tags, ctx); }

  /** Like stat(), but with an explicit base (a skill's own crit chance, a hit's damage amount). */
  scaled(actor, key, base, tags = EMPTY_TAGS, ctx = null) {
    const def = statDef(key);
    if (!def) throw new Error(`未知属性 ${key}`);
    const c = ctx && ctx.self === actor && ctx.tags === tags ? ctx : { world: this, self: actor, target: ctx?.target ?? null, tags, skill: ctx?.skill ?? null, event: ctx?.event ?? null };
    const acc = newAccumulator(def);
    if (base !== undefined) acc.base = base;
    accumulate(acc, actor.sheet.get(key), c);
    for (const s of actor.statuses) {
      const mods = s.def.mods.get(key);
      if (!mods) continue;
      if (s.def.stacking === 'strongest' && activeInstances(actor, s.def)[0] !== s) continue;
      accumulate(acc, mods, c, s.magnitude * s.stacks);
    }
    for (let o = actor.owner; o; o = o.owner) accumulate(acc, o.sheet.get(key), c, 1, 'minion');
    if (c.skill?.mods) accumulate(acc, c.skill.mods.get(key), c, 1, 'skill');
    return resolve(acc, def);
  }

  /** Cheap pre-check: can any modifier reach this stat on this actor? (stat base must be 0 to rely on it) */
  mayHave(actor, key) {
    if (actor.sheet.get(key)) return true;
    for (const s of actor.statuses) if (s.def.mods.get(key)) return true;
    for (let o = actor.owner; o; o = o.owner) if (o.sheet.get(key)) return true;
    return false;
  }

  /** stat() for untagged reads, skipping evaluation when no modifier can reach the stat. */
  quick(actor, key) {
    this.baseStats ??= new Set(this.content.baseMods.map(m => m.stat));
    return this.baseStats.has(key) || this.mayHave(actor, key) ? this.stat(actor, key) : statDef(key).base;
  }

  /** Recompute pool maxima; keeps the current fill ratio (or fills up on spawn). */
  refreshPools(actor, fill = false) {
    for (const pool of ['life', 'mana', 'es']) {
      const old = actor.max[pool], next = this.stat(actor, pool);
      actor.max[pool] = next;
      actor[pool] = fill || old <= 0 ? next : Math.min(next, actor[pool] * (next / old));
    }
  }

  // ---- resources ----------------------------------------------------------------------------
  resourceMax(actor, key) {
    if (CHARGES.includes(key)) return this.stat(actor, `charge.max.${key}`);
    const def = this.content.resources?.get(key);
    return def ? this.stat(actor, def.maxStat) : Infinity;
  }
  gain(actor, key, amount = 1) {
    const max = this.resourceMax(actor, key), before = actor.resource(key);
    const after = Math.min(max, before + amount);
    actor.resources.set(key, after);
    if (CHARGES.includes(key) && amount > 0) actor.resourceTimers.set(key, this.stat(actor, `charge.duration.${key}`));
    if (after !== before) this.emit({ type: 'resourceGain', source: actor, key, amount: after - before, value: after });
    return after - before;
  }
  /** Spend up to `amount` (or all with amount=Infinity). Returns what was actually spent. */
  consume(actor, key, amount = Infinity) {
    const before = actor.resource(key), spent = Math.min(before, amount);
    if (spent <= 0) return 0;
    actor.resources.set(key, before - spent);
    this.emit({ type: 'resourceSpend', source: actor, key, amount: spent, value: before - spent });
    return spent;
  }

  // ---- statuses -----------------------------------------------------------------------------
  statusDef(id) {
    const def = this.content.statuses.get(id);
    if (!def) throw new Error(`未知状态 ${id}`);
    return def;
  }
  applyStatus(bearer, id, opts = {}) {
    if (!bearer.alive) return null;
    const def = this.statusDef(id);
    const inst = applyStatus(bearer, def, { ...opts, source: opts.source?.id ?? opts.source ?? 0 });
    if (inst && !opts.silent) this.emit({ type: 'statusApplied', source: opts.source && typeof opts.source === 'object' ? opts.source : this.actors.get(inst.source) ?? null, target: bearer, key: id, tags: def.tags, stacks: inst.stacks, depth: opts.depth ?? 0 });
    if (def.mods.size && (def.mods.get('life') || def.mods.get('mana') || def.mods.get('es'))) this.refreshPools(bearer);
    return inst;
  }
  removeStatus(bearer, id) { const n = removeStatus(bearer, this.statusDef(id)); if (n) this.refreshPools(bearer); return n; }

  // ---- events -------------------------------------------------------------------------------
  /**
   * Queue an event. Fields: type, source (actor), target (actor), skill, tags (array), amount, x, y,
   * depth (trigger chain depth). `root` (owner of the source chain) is filled in automatically.
   */
  emit(event) {
    if (event.source) event.root = event.source.root;
    event.depth ??= 0;
    event.time = this.time;
    if (event.depth > this.maxDepth) { this.stats.dropped++; return; }
    this.queue.push(event);
  }
  on(type, handler) { let a = this.handlers.get(type); if (!a) this.handlers.set(type, a = []); a.push(handler); }

  /** Process queued events wave by wave until the queue is empty or the per-step budget runs out. */
  flush() {
    let budget = this.eventBudget;
    while (this.queue.length) {
      const wave = this.queue; this.queue = [];
      for (const e of wave) {
        if (budget-- <= 0) { this.stats.dropped += wave.length; this.queue.length = 0; return; }
        this.stats.events++;
        if (e.source && e.type !== 'resourceGain' && e.type !== 'resourceSpend') e.source.lastEvent.set(e.type, this.time);
        const hs = this.handlers.get(e.type);
        if (hs) for (const h of hs) h(this, e);
        const any = this.handlers.get('*');
        if (any) for (const h of any) h(this, e);
        for (const l of this.listeners) l(e);
      }
    }
  }

  // ---- time ---------------------------------------------------------------------------------
  schedule(delay, fn) { this.timers.push({ at: this.time + delay, fn }); }

  step(dt) {
    this.time += dt;
    if (this.timers.length) {
      const due = this.timers.filter(t => t.at <= this.time + 1e-9);
      if (due.length) { this.timers = this.timers.filter(t => t.at > this.time + 1e-9); due.sort((a, b) => a.at - b.at); for (const t of due) t.fn(); }
    }
    for (const sys of this.systems) sys.step(this, dt);
    this.flush();
  }
}

// 动作：技能和规则的「做什么」。一次调用（invocation）携带施放者、技能、位置、目标、触发事件和局部变量，
// 动作按顺序执行；载体（投射物、区域、地面）命中时再执行自己的子动作，于是技能可以像积木一样任意嵌套。
//
// Numbers in actions can be expressions: 3 · {var:'charges', mul:3, add:1} · {res:'power', mul:50} (any measure).
import { hit, kill } from './damage.mjs';
import { measure } from './expr.mjs';
import { activeInstances } from './status.mjs';

export function num(v, inv, fallback = 0) {
  if (v === undefined || v === null) return fallback;
  if (typeof v === 'number') return v;
  return measure(v, inv.ctx()) * (v.mul ?? 1) + (v.add ?? 0);
}

/** One running execution of an action list. */
export class Invocation {
  constructor(world, { caster, skill = null, origin, aim, target = null, event = null, vars = {}, depth = 0, mult = 1, tags = null, triggered = false }) {
    Object.assign(this, { world, caster, skill, target, event, depth, mult, triggered });
    this.origin = origin ?? { x: caster.x, y: caster.y };
    this.aim = aim ?? (target ? { x: target.x, y: target.y } : { x: caster.x + 100, y: caster.y });
    this.vars = { ...vars };
    this.tags = tags ?? skill?.tags ?? new Set();
  }
  ctx(target = this.target) { return { world: this.world, self: this.caster, target, tags: this.tags, skill: this.skill, event: this.event, vars: this.vars }; }
  fork(over = {}) {
    const inv = new Invocation(this.world, { caster: this.caster, skill: this.skill, origin: this.origin, aim: this.aim, target: this.target, event: this.event, vars: this.vars, depth: this.depth, mult: this.mult, tags: this.tags, triggered: this.triggered });
    inv.remote = this.remote;
    return Object.assign(inv, over);
  }
  stat(key, base) { return base === undefined ? this.world.stat(this.caster, key, this.tags, this.ctx()) : this.world.scaled(this.caster, key, base, this.tags, this.ctx()); }
}

const ACTIONS = new Map();
export const defineAction = (name, fn) => ACTIONS.set(name, fn);
export const actionNames = () => [...ACTIONS.keys()];

export function run(actions, inv) {
  if (!actions) return;
  for (const a of actions) {
    if (!inv.caster.alive && !a.afterDeath) return;
    if (a.when && !inv.world.testCond(a.when, inv.ctx())) continue;
    if (a.chance !== undefined && inv.world.roll('action') * 100 >= num(a.chance, inv)) continue;
    const fn = ACTIONS.get(a.do);
    if (!fn) throw new Error(`未知动作 ${a.do}`);
    // `tags` on a carrier/damage action marks everything it produces (e.g. 'herald' so heralds don't feed themselves).
    fn(a, a.tags && a.do !== 'tag' && a.do !== 'explode' ? inv.fork({ tags: new Set([...inv.tags, ...a.tags]) }) : inv);
  }
}

// ---- helpers -----------------------------------------------------------------------------------
function point(at, inv) {
  switch (at ?? 'aim') {
    // A skill re-cast from a corpse ("remote") treats that spot as where its caster stands.
    case 'self': return inv.remote ? { ...inv.origin } : { x: inv.caster.x, y: inv.caster.y };
    case 'origin': return inv.origin;
    case 'target': return inv.target ? { x: inv.target.x, y: inv.target.y } : inv.aim;
    case 'event': return inv.event ? { x: inv.event.x ?? inv.event.target?.x ?? inv.caster.x, y: inv.event.y ?? inv.event.target?.y ?? inv.caster.y } : inv.aim;
    default: return inv.aim;
  }
}

/** Area radius scales with the square root of area-of-effect, as in PoE. */
export function areaRadius(a, inv) { return num(a.radius, inv, 100) * Math.sqrt(inv.stat('area') / 100); }

/** The skill's hit against one target, with the invocation's multipliers. */
export function skillHit(inv, target, a = {}) {
  const sk = inv.skill?.def;
  const base = {};
  const dmg = a.damage ?? sk?.damage ?? {};
  for (const t in dmg) base[t] = num(dmg[t], inv);
  return hit(inv.world, {
    source: inv.caster, target, skill: inv.skill, tags: inv.tags, base,
    crit: a.crit ?? sk?.crit ?? 0, attack: inv.tags.has('attack'), effectiveness: a.effectiveness ?? sk?.effectiveness ?? 100,
    mult: inv.mult * (a.mult !== undefined ? num(a.mult, inv) / 100 : 1), depth: inv.depth, vars: inv.vars, noAilments: a.ailments === false, unscaled: !!a.unscaled,
  });
}

export function hitAndFollow(a, inv, target) {
  if (a.hit !== false) { const r = skillHit(inv, target, a); if (!r.landed) return; }
  if (a.onHit) run(a.onHit, inv.fork({ target, aim: { x: target.x, y: target.y } }));
}

// ---- immediate actions ---------------------------------------------------------------------------
defineAction('area', (a, inv) => {
  const delay = num(a.delay, inv);
  const fire = (fixed = null) => {
    const shape = a.shape ?? 'circle', at = a.at ?? (shape === 'circle' ? 'aim' : 'origin'), c = fixed ?? point(at, inv);
    // Areas centred on the caster reach from the caster's edge, matching how melee range is measured.
    const r = areaRadius(a, inv) + (!inv.remote && (at === 'self' || (at === 'origin' && c.x === inv.caster.x && c.y === inv.caster.y)) ? inv.caster.radius : 0);
    const dirx = inv.aim.x - inv.origin.x, diry = inv.aim.y - inv.origin.y, len = Math.hypot(dirx, diry) || 1;
    const half = (a.angle ?? 90) * Math.PI / 360, width = num(a.width, inv, 60);
    const hits = [];
    inv.world.grid.query(c.x, c.y, shape === 'line' ? r + width : r, o => {
      const dx = o.x - c.x, dy = o.y - c.y, d = Math.hypot(dx, dy) - o.radius;
      if (shape === 'circle' && d > r) return;
      if (shape === 'cone' && (d > r || Math.acos(Math.max(-1, Math.min(1, (dx * dirx + dy * diry) / ((Math.hypot(dx, dy) || 1) * len)))) > half)) return;
      if (shape === 'line') { const along = (dx * dirx + dy * diry) / len, across = Math.abs(dx * diry - dy * dirx) / len; if (along < 0 || along > r || across > width / 2 + o.radius) return; }
      hits.push(o);
    }, { notTeam: inv.caster.team });
    hits.sort((p, q) => p.id - q.id);
    inv.world.emit({ type: 'area', source: inv.caster, skill: inv.skill, x: c.x, y: c.y, radius: r, shape, fx: a.fx, tags: [...inv.tags], depth: inv.depth });
    for (const o of hits) hitAndFollow(a, inv.fork({ origin: c }), o);
    if (a.onCast) run(a.onCast, inv.fork({ origin: c, aim: c }));
    // Aftershocks (area.cascade): smaller repeats of a skill's area landing around it.
    // Only skills' own areas get aftershocks (not rule-made bursts like reactions or explosions).
    const n = a.noCascade || !inv.skill || inv.tags.has('cascade') ? 0 : Math.round(inv.stat('area.cascade'));
    for (let i = 0; i < n; ++i) {
      const ang = inv.world.roll('cascade') * Math.PI * 2, dist = r * (0.6 + inv.world.roll('cascade') * 0.6);
      const at2 = { x: c.x + Math.cos(ang) * dist, y: c.y + Math.sin(ang) * dist };
      inv.world.schedule(0.12 * (i + 1), () => {
        if (!inv.caster.alive) return;
        run([{ ...a, at: 'aim', shape: 'circle', radius: num(a.radius, inv, 100) * 0.6, delay: 0, mult: 60, noCascade: true }],
          inv.fork({ aim: at2, origin: at2, tags: new Set([...inv.tags, 'cascade']) }));
      });
    }
  };
  if (delay > 0) {
    // Telegraph: where and when a delayed area will land (boss slams), so the player can react.
    const c = point(a.at ?? 'aim', inv);
    inv.world.emit({ type: 'telegraph', source: inv.caster, skill: inv.skill, x: c.x, y: c.y, radius: areaRadius(a, inv), delay, depth: inv.depth });
    inv.world.schedule(delay, () => { if (inv.caster.alive) fire(c); });
  } else fire();
});

defineAction('strike', (a, inv) => {
  // Melee: hit the closest enemies in front of the caster, up to strike.targets.
  const range = num(a.range, inv, 150) * (a.areaScales ? Math.sqrt(inv.stat('area') / 100) : 1);
  const n = Math.round(inv.stat('strike.targets', num(a.targets, inv, 1)));
  const list = [], at = inv.remote ? inv.origin : inv.caster, cr = inv.remote ? 0 : inv.caster.radius;
  inv.world.grid.query(at.x, at.y, range + cr, o => {
    const d = Math.hypot(o.x - at.x, o.y - at.y) - o.radius - cr;
    if (d <= range) list.push([d, o]);
  }, { notTeam: inv.caster.team });
  list.sort((x, y) => x[0] - y[0] || x[1].id - y[1].id);
  if (inv.target?.alive && list.some(([, o]) => o === inv.target)) list.sort((x, y) => (y[1] === inv.target) - (x[1] === inv.target));
  inv.world.emit({ type: 'strike', source: inv.caster, skill: inv.skill, x: inv.aim.x, y: inv.aim.y, fx: a.fx, depth: inv.depth });
  const struck = list.slice(0, n).map(([, o]) => o);
  for (const o of struck) hitAndFollow(a, inv, o);
  // Melee splash: every struck enemy's neighbours take a reduced copy of the hit.
  const splash = a.noSplash ? 0 : inv.stat('strike.splash');
  if (splash > 0) for (const o of struck) {
    const around = [];
    inv.world.grid.query(o.x, o.y, splash, q => { if (q !== o && !struck.includes(q) && Math.hypot(q.x - o.x, q.y - o.y) - q.radius <= splash) around.push(q); }, { notTeam: inv.caster.team });
    around.sort((p, q) => p.id - q.id);
    if (around.length) inv.world.emit({ type: 'area', source: inv.caster, skill: inv.skill, x: o.x, y: o.y, radius: splash, shape: 'circle', fx: 'splash', tags: [...inv.tags, 'splash'], depth: inv.depth });
    const sub = inv.fork({ tags: new Set([...inv.tags, 'splash']) });
    for (const q of around) if (q.alive) hitAndFollow({ ...a, mult: 50, onHit: undefined }, sub, q);
  }
});

defineAction('damage', (a, inv) => { const t = a.on === 'self' ? inv.caster : inv.target; if (t?.alive) hitAndFollow(a, inv, t); });

defineAction('status', (a, inv) => {
  const targets = a.on === 'self' ? [inv.caster] : a.on === 'allies' ? [...inv.world.each(o => o.team === inv.caster.team && Math.hypot(o.x - inv.caster.x, o.y - inv.caster.y) <= num(a.radius, inv, 600))] : [inv.target];
  for (const t of targets) if (t?.alive) inv.world.applyStatus(t, a.status, {
    source: inv.caster, magnitude: num(a.magnitude, inv, 1) * inv.world.scaled(inv.caster, 'buffEffect', 100, new Set([...inv.tags, a.status])) / 100,
    stacks: Math.max(1, Math.round(num(a.stacks, inv, 1))), duration: a.duration !== undefined ? num(a.duration, inv) * inv.stat('duration') / 100 : undefined,
    dps: num(a.dps, inv), depth: inv.depth,
  });
});

/** Remove a status, or only `stacks` of it ("the next 3 attacks" style buffs spend one stack per use). */
defineAction('removeStatus', (a, inv) => {
  const t = a.on === 'self' ? inv.caster : inv.target;
  if (!t) return;
  if (a.stacks !== undefined) {
    let left = Math.round(num(a.stacks, inv, 1)), n = 0;
    for (const s of t.statuses) if (s.def.id === a.status && left > 0) { const k = Math.min(left, s.stacks); s.stacks -= k; left -= k; n += k; }
    if (t.statuses.some(s => s.def.id === a.status && s.stacks <= 0)) { t.statuses = t.statuses.filter(s => s.stacks > 0); t.statusVersion++; }
    if (a.as) inv.vars[a.as] = n;
    return;
  }
  const n = inv.world.removeStatus(t, a.status); if (a.as) inv.vars[a.as] = n;
});

/** Consume statuses from the target, storing the stacks removed (elemental reactions, detonations). */
defineAction('consumeStatus', (a, inv) => {
  const t = a.on === 'self' ? inv.caster : inv.target;
  if (!t) return;
  const ids = Array.isArray(a.status) ? a.status : [a.status];
  let stacks = 0, dps = 0, left = 0;
  for (const id of ids) {
    const def = inv.world.statusDef(id);
    // Only instances that actually act count (a 'strongest' ignite contributes its strongest instance).
    for (const s of activeInstances(t, def)) { stacks += s.stacks; dps += s.dps; left += s.dps * s.remaining; }
  }
  for (const id of ids) inv.world.removeStatus(t, id);
  inv.vars[a.as ?? 'consumed'] = stacks;
  inv.vars[(a.as ?? 'consumed') + 'Damage'] = left;
});

defineAction('gain', (a, inv) => { const n = inv.world.gain(a.on === 'target' ? inv.target : inv.caster, a.res, num(a.amount, inv, 1)); if (a.as) inv.vars[a.as] = n; });
/** Spend a resource. The amount spent is stored in a variable; `consumeKeep` (tagged with the resource) is a chance to keep it anyway. */
defineAction('consume', (a, inv) => {
  const who = a.on === 'target' ? inv.target : inv.caster;
  if (!who) return;
  const want = a.amount === 'all' || a.amount === undefined ? Infinity : num(a.amount, inv);
  const have = Math.min(who.resource(a.res), want);
  const keep = inv.world.stat(who, 'consumeKeep', new Set([a.res]));
  const kept = keep > 0 && have > 0 && inv.world.roll('keep') * 100 < keep;
  const n = kept ? have : inv.world.consume(who, a.res, want);
  if (kept) inv.world.emit({ type: 'resourceSpend', source: who, key: a.res, amount: n, kept: true, depth: inv.depth });
  inv.vars[a.as ?? a.res] = n;
});
defineAction('set', (a, inv) => { inv.vars[a.var] = num(a.value, inv); });
defineAction('more', (a, inv) => { inv.mult *= Math.max(0, 1 + num(a.value, inv) / 100); });
defineAction('tag', (a, inv) => { inv.tags = new Set([...inv.tags, ...a.tags]); });
defineAction('if', (a, inv) => { run(inv.world.testCond(a.cond, inv.ctx()) ? a.then : a.else, inv); });
defineAction('die', (a, inv) => { const t = a.on === 'target' ? inv.target : inv.caster; if (t?.alive) kill(inv.world, t, inv.caster, { depth: inv.depth }); });
defineAction('heal', (a, inv) => { const t = a.on === 'target' ? inv.target : inv.caster; if (!t?.alive) return; const pool = a.pool ?? 'life'; t[pool] = Math.min(t.max[pool], t[pool] + num(a.amount, inv) + t.max[pool] * num(a.pct, inv) / 100); });
defineAction('emit', (a, inv) => { inv.world.emit({ type: a.event, source: inv.caster, target: inv.target, skill: inv.skill, amount: num(a.amount, inv), x: inv.aim.x, y: inv.aim.y, depth: inv.depth }); });

defineAction('repeat', (a, inv) => {
  // Fractional repeats: every full 100 % is one repeat, the remainder is a chance (Torchlight multistrike).
  const raw = num(a.times, inv, 1), times = Math.floor(raw) + (inv.world.roll('repeat') < raw - Math.floor(raw) ? 1 : 0), interval = num(a.interval, inv, 0);
  for (let i = 0; i < times; ++i) {
    const sub = inv.fork({ vars: { ...inv.vars, i } });
    if (interval > 0 && i > 0) inv.world.schedule(interval * i, () => run(a.actions, sub)); else run(a.actions, sub);
  }
});

/** Cast another skill the caster owns or a skill granted by content (triggers, meta skills). */
defineAction('cast', (a, inv) => {
  const w = inv.world;
  // '$primary' = the caster's main skill (first manually used one): generic "re-cast your skill" traits.
  const sk = a.skill === '$event' ? inv.event?.skill : a.skill === '$primary' ? inv.caster.skills.find(s => s.manual && !s.def.reserve) ?? inv.caster.skills.find(s => !s.def.reserve) : w.skillFor(inv.caster, a.skill);
  if (!sk) return;
  let origin, aim = point(a.at ?? 'target', inv), target = a.at === 'self' ? null : inv.target;
  if (a.from === 'event') {
    // Cast from where the event happened (a corpse, a shatter) at the closest other enemy there:
    // the cascade jumps from body to body instead of always starting at the caster.
    origin = point('event', inv);
    const dead = inv.event?.target;
    let best = null, bd = Infinity;
    w.grid.query(origin.x, origin.y, num(a.range, inv, 700), o => {
      if (o === dead) return;
      const d = Math.hypot(o.x - origin.x, o.y - origin.y);
      if (d < bd || (d === bd && o.id < best.id)) { bd = d; best = o; }
    }, { notTeam: inv.caster.team });
    if (!best && a.needTarget !== false) return;
    target = best;
    const ang = w.roll('castFrom') * Math.PI * 2;
    aim = best ? { x: best.x, y: best.y } : { x: origin.x + Math.cos(ang) * 300, y: origin.y + Math.sin(ang) * 300 };
  }
  w.cast(inv.caster, sk, { origin, remote: !!origin, aim, target, triggered: true, depth: inv.depth + 1, event: inv.event, mult: num(a.mult, inv, 100) / 100, vars: a.passVars ? inv.vars : {} });
});

/** Re-cast every trigger-bound skill in a named group (e.g. all skills socketed into a "Cast on Crit"). */
defineAction('castGroup', (a, inv) => {
  for (const sk of inv.caster.skills) if (sk.groups.has(a.group)) inv.world.cast(inv.caster, sk, { aim: point(a.at ?? 'target', inv), target: inv.target, triggered: true, depth: inv.depth + 1, event: inv.event });
});

defineAction('blink', (a, inv) => {
  if (inv.remote) return; // a re-cast from a corpse strikes there; it never moves the caster
  const range = num(a.range, inv, 600);
  const t = a.to === 'aim' ? null : inv.world.nearest(inv.caster, 'enemy', range, a.avoidLast ? new Set([inv.caster.lastBlink]) : null);
  const p = t ? { x: t.x - Math.sign(t.x - inv.caster.x || 1) * (t.radius + inv.caster.radius), y: t.y } : inv.aim;
  inv.world.emit({ type: 'blink', source: inv.caster, x: p.x, y: p.y, fromX: inv.caster.x, fromY: inv.caster.y, depth: inv.depth });
  if (!inv.world.clearLine(inv.caster.x, inv.caster.y, p.x, p.y, inv.caster.radius * 0.5)) return; // no blinking through walls
  inv.caster.x = p.x; inv.caster.y = p.y;
  if (t) { inv.caster.lastBlink = t.id; inv.target = t; inv.aim = { x: t.x, y: t.y }; }
});

/** Explode the event's dead target for a share of its maximum life (corpse/kill explosions). */
defineAction('explode', (a, inv) => {
  const dead = inv.event?.target ?? inv.target;
  if (!dead) return;
  const amount = dead.max.life * num(a.pct, inv, 10) / 100;
  run([{ do: 'area', at: 'event', radius: a.radius ?? 150, damage: { [a.type ?? 'fire']: amount }, effectiveness: 100, crit: 0, fx: a.fx ?? 'explode', onHit: a.onHit }], inv.fork({ target: null, tags: new Set([...inv.tags, 'area', ...(a.tags ?? [])]) }));
});

defineAction('summon', (a, inv) => {
  const w = inv.world, c = point(a.at ?? 'self', inv);
  const count = Math.round(num(a.count, inv, 1));
  const limit = Math.round(inv.stat('minion.limit', num(a.limit, inv, count)));
  const mine = [...inv.caster.minions].filter(m => m.alive && m.template === a.minion);
  for (let i = 0; i < count; ++i) {
    if (mine.length >= limit) { const old = mine.shift(); old.alive = false; w.emit({ type: 'death', source: old, x: old.x, y: old.y, unsummoned: true }); }
    const ang = (i / Math.max(1, count)) * Math.PI * 2;
    const m = w.spawnFromTemplate(a.minion, { owner: inv.caster, team: inv.caster.team, x: c.x + Math.cos(ang) * 60, y: c.y + Math.sin(ang) * 60, duration: a.duration !== undefined ? num(a.duration, inv) * inv.stat('duration') / 100 : undefined });
    mine.push(m);
    w.emit({ type: 'summon', source: inv.caster, target: m, skill: inv.skill, x: m.x, y: m.y, depth: inv.depth });
  }
});

// ---- carriers (simulated by the carriers system) ---------------------------------------------------
defineAction('projectile', (a, inv) => {
  const w = inv.world;
  const count = Math.max(1, Math.round(inv.stat('proj.count', num(a.count, inv, 1))));
  // Adjacent projectiles are at most 8° apart, so a small volley still converges on one target.
  const nova = (a.ring || inv.stat('proj.nova') > 0) && count > 1;
  const spread = nova ? Math.PI * 2 * (count - 1) / count : Math.min(inv.stat('proj.spread', a.spread ?? 30), 8 * (count - 1)) * Math.PI / 180;
  const from = point(a.from ?? 'origin', inv);
  const to = inv.target && a.from !== 'event' ? { x: inv.target.x, y: inv.target.y } : inv.aim;
  const base = Math.atan2(to.y - from.y, to.x - from.x);
  const speed = num(a.speed, inv, 1000) * inv.stat('proj.speed') / 100;
  const shared = {
    inv, action: a, speed, radius: num(a.radius, inv, 20), lifetime: inv.stat('proj.lifetime', a.lifetime ?? 1.2),
    pierce: Math.round(inv.stat('proj.pierce', num(a.pierce, inv, 0))), fork: Math.round(inv.stat('proj.fork', num(a.fork, inv, 0))),
    chain: Math.round(inv.stat('proj.chain', num(a.chain, inv, 0))), split: Math.round(inv.stat('proj.split', num(a.split, inv, 0))),
    returns: Math.round(inv.stat('proj.return', num(a.returns, inv, 0))), chainRadius: a.chainRadius ?? 400,
    explode: inv.stat('proj.explode'),
  };
  for (let i = 0; i < count; ++i) {
    // A ring volley keeps its first projectile on the target.
    const ang = count === 1 ? base : nova ? base + Math.PI * 2 * i / count : base - spread / 2 + spread * i / (count - 1);
    w.carriers.spawnProjectile({ ...shared, x: from.x, y: from.y, angle: ang, hitIds: new Set(a.from === 'event' && inv.target ? [inv.target.id] : []) });
  }
});

defineAction('zone', (a, inv) => {
  const w = inv.world, c = point(a.at, inv);
  // Moving zones (vortices) travel toward the aim; extra copies (zone.count) fan out around that heading.
  const n = 1 + Math.round(inv.stat('zone.count')), speed = num(a.speed, inv, 0) * inv.stat('zone.speed') / 100;
  const heading = Math.atan2(inv.aim.y - c.y, inv.aim.x - c.x) || 0;
  const shared = { radius: areaRadius(a, inv), remaining: num(a.duration, inv, 4) * inv.stat('duration') / 100, interval: num(a.interval, inv, 0.5),
    pull: inv.stat('zone.pull'), growth: inv.stat('zone.growth'), burst: inv.stat('zone.burst'), speed, wander: num(a.wander, inv, 0), seek: num(a.seek, inv, 0) };
  for (let i = 0; i < n; ++i) {
    const side = i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2);
    const ang = heading + side * 0.45;
    // Static zones place their copies around the first one instead of steering them.
    const p = speed > 0 || i === 0 ? c : { x: c.x + Math.cos(ang + Math.PI / 2) * shared.radius * 1.4 * side, y: c.y + Math.sin(ang + Math.PI / 2) * shared.radius * 1.4 * side };
    w.carriers.spawnZone({ inv: inv.fork({ origin: p, aim: p }), action: a, x: p.x, y: p.y, ...shared, angle: ang,
      timer: a.delayFirst ? shared.interval : 0, follow: a.follow === 'target' ? inv.target : a.follow ? inv.caster : null, kind: a.kind ?? null });
  }
});

/** Trigger the caster's existing zones of a kind near a point (Blade Blast on Blade Fall blades). */
defineAction('detonate', (a, inv) => {
  const c = point(a.at, inv), r = areaRadius(a, inv);
  let n = 0;
  for (const z of inv.world.carriers.zones) {
    if (!z.alive || z.kind !== a.kind || z.inv.caster !== inv.caster || Math.hypot(z.x - c.x, z.y - c.y) > r) continue;
    if (a.consume !== false) { z.alive = false; z.remaining = 0; }
    ++n;
    run(a.onEach, inv.fork({ origin: { x: z.x, y: z.y }, aim: { x: z.x, y: z.y }, target: null, vars: { ...inv.vars, index: n } }));
  }
  inv.vars[a.as ?? 'detonated'] = n;
});

/** Copy a status from the event's target (usually the one that just died) to enemies around it. */
defineAction('spread', (a, inv) => {
  const from = inv.event?.target ?? inv.target;
  if (!from) return;
  const insts = from.statuses.filter(s => s.def.id === a.status);
  if (!insts.length) return;
  const r = areaRadius({ radius: a.radius ?? 250 }, inv);
  const near = [];
  inv.world.grid.query(from.x, from.y, r, o => { if (o !== from && Math.hypot(o.x - from.x, o.y - from.y) <= r) near.push(o); }, { notTeam: inv.caster.team });
  near.sort((p, q) => p.id - q.id);
  for (const o of near.slice(0, Math.round(num(a.max, inv, 99))))
    for (const s of insts) inv.world.applyStatus(o, a.status, { source: inv.caster, dps: s.dps * num(a.effect, inv, 100) / 100, magnitude: s.magnitude, duration: s.duration, stacks: s.stacks, depth: inv.depth });
});

/** Copy the ailment the event just applied to up to `max` other enemies near its target (contagion). */
defineAction('proliferate', (a, inv) => {
  const t = inv.event?.target, key = inv.event?.key;
  const ail = key && inv.world.content.ailments?.get(key);
  if (!t || !ail) return;
  const insts = t.statuses.filter(s => s.def.id === ail.status);
  if (!insts.length) return;
  const r = num(a.radius, inv, 220), near = [];
  inv.world.grid.query(t.x, t.y, r, o => { if (o !== t && !o.hasStatus(ail.status) && Math.hypot(o.x - t.x, o.y - t.y) <= r) near.push(o); }, { notTeam: inv.caster.team });
  near.sort((p, q) => Math.hypot(p.x - t.x, p.y - t.y) - Math.hypot(q.x - t.x, q.y - t.y) || p.id - q.id);
  for (const o of near.slice(0, Math.round(num(a.max, inv, 1))))
    for (const s of insts) inv.world.applyStatus(o, ail.status, { source: inv.caster, dps: s.dps, magnitude: s.magnitude, duration: s.remaining, stacks: s.stacks, depth: inv.depth });
});

// "基础战斗": one or more casts against a fixed target layout, recorded hit by hit.
// Same host semantics as the parity driver (targets re-exported every frame, damage committed).
import { RuleWorld, RuleLibrary, compileBuild, statusKey, ELEMENT_NAMES, f, INDEX_NONE, BUILTIN_EVENT_NAMES, newBuild, resolveGrantSources, withHeld, sourcesKey } from '../engine/index.mjs';

export const LAYOUTS = {
  lane: (count, health) => Array.from({ length: count }, (_, k) => ({ id: k + 1, x: 2 * (k + 1), y: ((k + 1) % 3 - 1) * 0.6, health })),
  ring: (count, health) => Array.from({ length: count }, (_, i) => {
    const angle = i * 2.399963, distance = 3 + 0.25 * i;
    return { id: i + 1, x: Math.cos(angle) * distance, y: Math.sin(angle) * distance, health };
  }),
  pack: (count, health) => Array.from({ length: count }, (_, i) => ({ id: i + 1, x: 6 + (i % 5) * 0.9, y: (Math.floor(i / 5) - (Math.ceil(count / 5) - 1) / 2) * 0.9, health })),
};

// Status ids shown in snapshots/summary (strongest visual first).
export const COMBAT_STATUSES = ['freeze', 'ignite', 'shock', 'bleed', 'chill', 'slow'];
const OWNER_STATUS_ID = 0x7FFFFF00;

/**
 * options.source: ready build source; options.sourceAt(seconds): build source at a time (timed traits
 * that expire mid-fight); otherwise options.build + options.extra from the library.
 * options.library: resolves fixed grant_traits lists (stitched wrappers carry their own sources).
 */
export function runCombat(ruleFiles, options) {
  const { build, extra = [], layout = 'lane', count = 12, health = 60, radius = 0.45, resist = [0, 0, 0, 0], casts = 1, castInterval = 20, frames = 120, seed = 7 } = options;
  let source = options.source || (options.sourceAt ? options.sourceAt(0) : null);
  let statusDefs = options.statusDefs || null;
  let library = options.library || null;
  if (!source || !statusDefs) {
    const loadedLibrary = new RuleLibrary();
    const loaded = loadedLibrary.load(ruleFiles);
    if (!loaded.ok && !source) return { error: loaded.error };
    if (loaded.ok) library = library || loadedLibrary;
    if (loaded.ok && !statusDefs) statusDefs = loadedLibrary.statusDefs();
    if (!source) {
      const named = loadedLibrary.namedBuildSource(build, extra);
      if (!named.source) return { error: named.error };
      source = named.source;
    }
  }
  const statuses = options.statuses || COMBAT_STATUSES;
  const compiled = compileBuild(source);
  if (!compiled.plan) return { error: compiled.error };
  const world = new RuleWorld();
  world.setStatusDefs(statusDefs || []);
  const plan = world.addPlan(compiled.plan);
  const planByHash = new Map([[compiled.plan.hash, plan]]);
  const addPlan = build => {
    const result = build ? compileBuild(build) : null;
    if (!result || !result.plan) return INDEX_NONE;
    if (!planByHash.has(result.plan.hash)) planByHash.set(result.plan.hash, world.addPlan(result.plan));
    return planByHash.get(result.plan.hash);
  };

  // grant_traits ("附带持续时间" wrappers): held traits per id; same wrapper + contents refreshes.
  const grants = [];
  const grantLog = [];
  world.onGrantTraits = request => {
    const sources = resolveGrantSources(request.entries, library);
    if (!sources.length) return;
    const expire = f(world.clock + request.duration);
    const live = grants.find(g => g.key === request.key && g.targetId === request.targetId && g.expire > world.clock);
    if (live) live.expire = Math.max(live.expire, expire);
    else grants.push({ key: request.key, targetId: request.targetId, sources, expire });
    if (grantLog.length < 500) grantLog.push({ frame, target: request.targetId === OWNER_STATUS_ID ? 'self' : request.targetId, traits: sources.map(s => s.id), duration: request.duration, refreshed: !!live });
  };
  const held = id => {
    const out = [];
    for (const g of grants) if (g.targetId === id && g.expire > world.clock) for (const s of g.sources) if (!out.some(o => o.id.toLowerCase() === s.id.toLowerCase())) out.push(s);
    return out;
  };
  const planAt = seconds => {
    const mine = held(OWNER_STATUS_ID);
    if (!options.sourceAt && !mine.length) return plan;
    const base = options.sourceAt ? options.sourceAt(seconds) || source : source;
    const index = addPlan(mine.length ? newBuild(base.activeId, withHeld(base.traits, mine)) : base);
    return index === INDEX_NONE ? plan : index;
  };
  // Debuffs held by targets: their defense (resistances etc.) follows the held traits.
  const appliedDefense = new Map();
  const refreshDefense = () => {
    for (const t of targets) {
      const mine = t.health > 0 ? held(t.id) : [];
      const key = sourcesKey(mine);
      if ((appliedDefense.get(t.id) || '') === key) continue;
      appliedDefense.set(t.id, key);
      world.setTargetDefensePlan(t.id, mine.length ? addPlan(newBuild(mine[0].id, mine)) : INDEX_NONE);
    }
  };
  const owner = world.addOwner(1, 0);
  // Statuses applied to the caster itself must not land on target #1.
  world.setOwnerStatusId(owner, OWNER_STATUS_ID);
  world.updateOwner(owner, 0, 0, 0, 1, 0, 0);
  const targets = LAYOUTS[layout](count, health).map(t => ({ ...t, x: f(t.x), y: f(t.y), health: f(t.health), max: f(t.health) }));
  const byId = new Map(targets.map(t => [t.id, t]));
  const trace = [];
  let frame = 0;
  world.trace = (kind, payload) => {
    if (trace.length > 5000) return;
    if (kind === 'rule') trace.push({ frame, kind, event: payload.plan.eventNames.names[payload.event.type], rule: `${payload.plan.traitIds[payload.rule.trait]}/${payload.rule.id}`, generation: payload.event.generation, sequence: payload.event.sequence, target: payload.event.targetId === 0xFFFFFFFF ? null : payload.event.targetId });
    else if (kind === 'damage') trace.push({ frame, kind, target: payload.TargetExternalId, amount: payload.Amount, requested: payload.requested, element: ELEMENT_NAMES[payload.Element], critical: payload.bCritical, killed: payload.bKilled, resistance: payload.resistance, dot: payload.dot || null });
    else if (kind === 'status') trace.push({ frame, kind, target: payload.targetId, key: payload.key, value: payload.value, stacks: payload.stacks });
    else if (kind === 'spawn') trace.push({ frame, kind, id: payload.id, carrier: payload.plan.kindNames.names[payload.kind] });
    else if (kind === 'area') trace.push({ frame, kind, x: payload.x, y: payload.y, radius: payload.radius, amount: payload.amount, victims: payload.victims });
    else if (kind === 'grant') trace.push({ frame, kind, target: payload.self ? null : payload.targetId, key: payload.key, duration: payload.duration });
  };
  const snapshots = [];
  const rows = [];
  const keys = statuses.map(name => statusKey(name));
  // Index into `statuses` of the first live status on a target, -1 when none.
  const topStatus = id => keys.findIndex(key => world.getStatus(id, key) > 0);
  const dotsRunning = () => {
    const alive = new Set(targets.filter(t => t.health > 0).map(t => t.id));
    for (const s of world.statuses.values()) if (alive.has(s.targetId) && s.expire > world.clock && world.statusDefs.get(s.key)?.tickInterval > 0) return true;
    return false;
  };
  for (frame = 0; frame < frames; ++frame) {
    world.targets.reset();
    for (const t of targets) if (t.health > 0) world.targets.add(t.x, t.y, 0, radius, t.health, 1, t.id, resist);
    if (frame % castInterval === 0 && frame / castInterval < casts) {
      if (world.cast(planAt(frame / 60), owner, 0, 0, 0, 1, 0, 0, BigInt(seed + frame)) === INDEX_NONE) return { error: 'cast rejected' };
    }
    refreshDefense();
    world.step(1 / 60);
    for (const record of world.damageLog) {
      const target = byId.get(record.TargetExternalId);
      if (target) target.health = f(target.health - record.Amount);
      rows.push({ frame, target: record.TargetExternalId, amount: record.Amount, element: ELEMENT_NAMES[record.Element], critical: record.bCritical, killed: record.bKilled });
    }
    world.damageLog = [];
    const c = world.carriers;
    const projectiles = [];
    for (let i = 0; i < c.num; ++i) projectiles.push([c.px[i], c.py[i], c.radius[i]]);
    snapshots.push({
      projectiles,
      summons: world.summons.map(s => [s.x, s.y, s.dx, s.dy]),
      targets: targets.map(t => [t.id, t.x, t.y, Math.max(0, t.health) / t.max, topStatus(t.id)]),
      stats: { ...world.getStats() },
    });
    if (frame > casts * castInterval && world.activeRoots() === 0 && c.num === 0 && !dotsRunning()) { ++frame; break; }
  }
  const total = rows.reduce((acc, r) => ({ damage: acc.damage + r.amount, hits: acc.hits + 1, kills: acc.kills + (r.killed ? 1 : 0), crits: acc.crits + (r.critical ? 1 : 0) }), { damage: 0, hits: 0, kills: 0, crits: 0 });
  const remaining = {};
  for (const name of statuses) remaining[name] = targets.filter(t => world.getStatusRemaining(t.id, statusKey(name)) > 0).length;
  return { plan: compiled.plan, rows, trace, snapshots, total, remaining, statuses, grants: grantLog, frames: frame, targets, radius, hash: world.stateHash().toString(16).padStart(16, '0') };
}

export { BUILTIN_EVENT_NAMES };

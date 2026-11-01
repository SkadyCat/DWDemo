// 新规则引擎入口。网页版专用，纯 JS、确定性、无旧引擎依赖。
//
//   import { compileContent, createWorld, BASE } from './core/index.mjs';
//   const content = compileContent(BASE, myPack);
//   const world = createWorld(content, { seed: 7 });
//   const hero = world.spawnActor({ team: 0, kind: 'hero', mods: [...] });
//   world.equip(hero, content.affixes.get('cast_on_crit_arc'));
import { World } from './world.mjs';
import { installRules, attachRule } from './rules.mjs';
import { Carriers } from './carriers.mjs';
import { vitals } from './vitals.mjs';
import { instantiate, cast, castTime } from './skills.mjs';
import { test } from './expr.mjs';
import { run, Invocation } from './actions.mjs';
import { compileMod } from './mods.mjs';

export { compileContent, compileAffix } from './content.mjs';
export { compileMod } from './mods.mjs';
export { hit, convert, armourReduction } from './damage.mjs';
export { BASE } from './content/base.mjs';
export * as registry from './registry.mjs';

/** Movement and auto-casting for actors with a brain ('chase' | 'turret'). Heroes driven by the host have none. */
const brains = {
  step(world, dt) {
    const moveRules = world.ruleIndex.get('move');
    for (const a of world.actors.values()) {
      if (!a.alive) continue;
      if (a.expireAt !== undefined && world.time >= a.expireAt) { a.alive = false; world.emit({ type: 'death', source: a, x: a.x, y: a.y }); continue; }
      const ox = a.x, oy = a.y;
      if (a.channeling) channelTick(world, a, dt);
      if (a.brain && a.brain !== 'none' && !world.quick(a, 'cannotAct')) think(world, a, dt);
      else if (a.vx || a.vy) { const sp = world.quick(a, 'moveBase') * world.quick(a, 'moveSpeed') / 100; const l = Math.hypot(a.vx, a.vy) || 1; if (!world.quick(a, 'cannotMove')) { a.x += a.vx / l * sp * dt; a.y += a.vy / l * sp * dt; } }
      const moved = Math.hypot(a.x - ox, a.y - oy);
      a.moving = moved > 1e-6;
      if (a.moving && moveRules?.some(r => r.actor === a)) world.emit({ type: 'move', source: a, amount: moved, x: a.x, y: a.y });
    }
  },
};

/**
 * Channelled skills repeat their actions every `channel` seconds (scaled by speed) and emit 'channel'
 * events, which rules use for cast-while-channelling, stages and similar. Each tick pays the cost.
 */
function channelTick(world, a, dt) {
  const sk = a.channeling;
  if (world.quick(a, 'cannotAct')) return;
  a.channelTimer = (a.channelTimer ?? 0) - dt;
  if (a.channelTimer > 0) return;
  const interval = sk.def.channel / (world.stat(a, 'speed', sk.tags) / 100);
  a.channelTimer += interval;
  const cost = world.scaled(a, 'cost', sk.def.cost, sk.tags);
  if (a.mana < cost) { stopChannel(world, a); return; }
  a.mana -= cost;
  a.channelTicks = (a.channelTicks ?? 0) + 1;
  const target = a.channelTarget?.alive ? a.channelTarget : world.nearest(a, 'enemy', sk.def.range + 200);
  world.emit({ type: 'channel', source: a, skill: sk, tags: [...sk.tags], amount: a.channelTicks, x: a.x, y: a.y });
  world.runSkillActions(a, sk, { target, aim: target ? { x: target.x, y: target.y } : undefined });
}

export function stopChannel(world, a) {
  if (!a.channeling) return;
  world.emit({ type: 'channelEnd', source: a, skill: a.channeling, tags: [...a.channeling.tags], amount: a.channelTicks ?? 0 });
  a.channeling = null; a.channelTicks = 0; a.channelTimer = 0;
}

function think(world, a, dt) {
  if (a.channeling) { if (!world.nearest(a, 'enemy', a.channeling.def.range + 200)) stopChannel(world, a); return; }
  if (world.time < (a.busyUntil ?? 0)) return;
  // Re-acquire the nearest enemy a few times per second, not every frame (staggered by id).
  let target = a.brainTarget;
  if (!target?.alive || world.time >= (a.retargetAt ?? 0)) {
    target = a.brainTarget = world.nearest(a, 'enemy', a.aggro ?? 2000);
    a.retargetAt = world.time + 0.25 + (a.id % 7) * 0.02;
  }
  if (!target) return;
  const d = Math.hypot(target.x - a.x, target.y - a.y) - target.radius - a.radius;
  for (const sk of a.skills) if (sk.def.reserve && !sk.active) cast(world, a, sk);
  for (const sk of a.skills) {
    if (sk.def.reserve) continue;
    if (sk.manual || d > sk.def.range) continue;
    if (cast(world, a, sk, { aim: { x: target.x, y: target.y }, target })) { a.busyUntil = world.time + castTime(world, a, sk); return; }
  }
  if (a.brain === 'chase' && d > (a.keepDistance ?? 0) && !world.quick(a, 'cannotMove')) {
    const sp = world.quick(a, 'moveBase') * world.quick(a, 'moveSpeed') / 100 * dt, l = Math.hypot(target.x - a.x, target.y - a.y) || 1;
    const step = Math.min(sp, d - (a.keepDistance ?? 0));
    a.x += (target.x - a.x) / l * step; a.y += (target.y - a.y) / l * step;
  }
}

export function createWorld(content, opts = {}) {
  const world = new World(content, opts);
  installRules(world);
  world.carriers = new Carriers();
  world.systems.push({ step: w => w.grid.rebuild(w.actors.values()) }, brains, { step: w => w.grid.rebuild(w.actors.values()) }, world.carriers, vitals);

  world.testCond = (cond, ctx) => test(cond, ctx);
  world.cast = (actor, sk, o) => cast(world, actor, sk, o);
  world.stopChannel = (actor) => stopChannel(world, actor);
  world.runSkillActions = (actor, sk, o = {}) => run(sk.def.actions, new Invocation(world, { caster: actor, skill: sk, aim: o.aim, target: o.target ?? null }));
  world.instantiateSkill = (actor, id, supportIds = [], groups = []) => {
    const def = content.skills.get(id);
    if (!def) throw new Error(`未知技能 ${id}`);
    const sk = instantiate(world, actor, def, supportIds.map(s => { const d = content.supports.get(s); if (!d) throw new Error(`未知辅助 ${s}`); return d; }));
    for (const g of groups) sk.groups.add(g);
    return sk;
  };
  /** The actor's own instance of a skill, or a hidden one created once for triggers that grant it. */
  world.skillFor = (actor, id) => {
    const own = actor.skills.find(s => s.def.id === id);
    if (own) return own;
    actor.hiddenSkills ??= new Map();
    let sk = actor.hiddenSkills.get(id);
    if (!sk) actor.hiddenSkills.set(id, sk = world.instantiateSkill(actor, id));
    return sk;
  };
  /** Give an actor a skill it can use (auto-cast by its brain unless `manual`). */
  world.addSkill = (actor, id, { supports = [], groups = [], manual = false } = {}) => {
    const sk = world.instantiateSkill(actor, id, supports, groups);
    sk.manual = manual;
    actor.skills.push(sk);
    return sk;
  };
  world.spawnActor = (o) => {
    const mods = [...content.baseMods, ...(o.mods ?? []).map((m, i) => m.op !== undefined && Object.isFrozen(m) ? m : compileMod(m, `${o.name ?? o.kind}.mods[${i}]`))];
    const a = world.spawn({ ...o, mods });
    a.brain = o.brain ?? (o.kind === 'hero' ? 'none' : 'chase');
    if (o.aggro) a.aggro = o.aggro;
    for (const id of o.skills ?? []) world.addSkill(a, id);
    for (const af of o.affixes ?? []) world.equip(a, af);
    if (o.resources) for (const [k, v] of Object.entries(o.resources)) a.resources.set(k, v);
    world.refreshPools(a, true);
    return a;
  };
  world.spawnFromTemplate = (id, o) => {
    const t = content.minions.get(id);
    if (!t) throw new Error(`未知召唤物 ${id}`);
    const a = world.spawnActor({ kind: 'minion', name: t.name, radius: t.radius ?? 25, brain: t.brain ?? 'chase', mods: [{ stat: 'life', op: 'base', value: t.life ?? 100 }, ...t.mods], skills: t.skills ?? [], ...o });
    a.template = id;
    for (const af of t.affixes ?? []) world.equip(a, af);
    const dur = o.duration ?? t.duration;
    if (dur !== undefined) a.expireAt = world.time + dur;
    if (t.keepDistance) a.keepDistance = t.keepDistance;
    return a;
  };
  /** Install a (concrete) affix: mods into the sheet, rules onto the actor, granted skills into its bar. */
  world.equip = (actor, affix) => {
    if (typeof affix === 'string') { const a = content.affixes.get(affix); if (!a) throw new Error(`未知词条 ${affix}`); affix = a; }
    for (const m of affix.mods) actor.sheet.add(m);
    for (const r of affix.rules) attachRule(world, actor, r, null);
    for (const g of affix.grants.skills) world.addSkill(actor, g.skill, { supports: g.supports, groups: g.groups, manual: g.groups.length > 0 });
    world.refreshPools(actor);
    return affix;
  };
  return world;
}

// 触发规则：事件 + 角色 + 过滤 + 积累 + 限流 + 动作。暴击时、移动时、元素命中时、被击时、
// 每消耗 N 点法力、每 X 秒、击杀时……全部是同一个结构的不同参数。
//
//   { id, on:'crit', role:'source', filter:{ tags:['spell'], cond:{status:'shock', of:'target'} },
//     accumulate:{ kind:'chance', pct:30 }, limit:{ cooldown:0.15 }, chain:false,
//     at:'target', do:[ {do:'cast', skill:'arc'} ] }
//
// role     source (default) · owned (source is the holder or anything it owns) · minion · target · owner (the holder's owner did it)
// filter   tags (all) · anyTags · notTags · key (event.key: status/resource/ailment id) · skill · notSkill · cond
// accumulate
//   instant                     every matching event
//   chance  {pct}               rolls
//   count   {n}                 every n-th event
//   meter   {amount, threshold} sums an expression per event (e.g. {event:'amount'} mana spent), fires per full threshold
//   periodic {interval}         on 'tick' events, every interval seconds
// limit    cooldown (seconds) · perSecond (max fires in any rolling second)
// chain    events produced by triggered actions are ignored unless chain:true (depth still capped by the world)
import { checkCondition, test, evalNum } from './expr.mjs';
import { run, Invocation, num } from './actions.mjs';

const ROLES = new Set(['source', 'owned', 'minion', 'target', 'owner']);
const KINDS = new Set(['instant', 'chance', 'count', 'meter', 'periodic']);

export function compileRule(raw, where = `规则 ${raw?.id}`) {
  if (!raw?.on) throw new Error(`${where}: 缺少 on`);
  const role = raw.role ?? 'source';
  if (!ROLES.has(role)) throw new Error(`${where}: 未知角色 ${role}`);
  const acc = raw.accumulate ?? { kind: 'instant' };
  if (!KINDS.has(acc.kind)) throw new Error(`${where}: 未知积累方式 ${acc.kind}`);
  if (acc.kind === 'periodic' && raw.on !== 'tick') throw new Error(`${where}: periodic 只能用于 tick`);
  if (!Array.isArray(raw.do) || !raw.do.length) throw new Error(`${where}: do 需要非空动作列表`);
  checkCondition(raw.filter?.cond, `${where}.filter.cond`);
  return Object.freeze({
    id: raw.id ?? `${raw.on}_rule`, on: raw.on, role, filter: raw.filter ?? {}, accumulate: acc,
    limit: raw.limit ?? {}, chain: !!raw.chain, at: raw.at ?? 'target', range: raw.range, do: raw.do, skill: raw.skill ?? null,
  });
}

/** Attach a rule to an actor. `skill` is an optional skill instance used for tags/mods of the actions. */
export function attachRule(world, actor, rule, skill = null) {
  const inst = { rule, actor, skill, counter: 0, meter: 0, readyAt: 0, fires: [], timer: 0 };
  actor.rules.push(inst);
  let list = world.ruleIndex.get(rule.on);
  if (!list) world.ruleIndex.set(rule.on, list = []);
  list.push(inst);
  return inst;
}

export function detachRules(world, actor, pred = () => true) {
  const gone = new Set(actor.rules.filter(pred));
  actor.rules = actor.rules.filter(r => !gone.has(r));
  for (const [k, list] of world.ruleIndex) world.ruleIndex.set(k, list.filter(r => !gone.has(r)));
}

function roleMatches(role, holder, e) {
  switch (role) {
    case 'source': return e.source === holder;
    case 'owned': return e.root === holder;
    case 'minion': return e.root === holder && e.source !== holder;
    case 'target': return e.target === holder;
    case 'owner': return !!holder.owner && e.source === holder.owner;
  }
  return false;
}

function filterMatches(f, inst, e, world) {
  if (f.key !== undefined && e.key !== f.key) return false;
  if (f.skill && e.skill?.def.id !== f.skill) return false;
  if (f.notSkill && e.skill?.def.id === f.notSkill) return false;
  if (f.ownSkill && e.skill !== inst.skill) return false;
  const tags = e.tags;
  if (f.tags) for (const t of f.tags) if (!tags?.includes(t)) return false;
  if (f.anyTags && !f.anyTags.some(t => tags?.includes(t))) return false;
  if (f.notTags && f.notTags.some(t => tags?.includes(t))) return false;
  if (f.cond) {
    const other = e.source === inst.actor ? e.target : e.source;
    if (!test(f.cond, { world, self: inst.actor, target: other ?? null, tags: new Set(tags ?? []), skill: e.skill ?? null, event: e })) return false;
  }
  return true;
}

function accumulate(inst, e, world) {
  const a = inst.rule.accumulate;
  switch (a.kind) {
    case 'instant': return 1;
    case 'chance': return world.random() * 100 < a.pct ? 1 : 0;
    case 'count': if (++inst.counter >= a.n) { inst.counter = 0; return 1; } return 0;
    case 'periodic': {
      // The interval may be an expression (faster with more stages, charges…).
      const iv = evalNum(a.interval, { world, self: inst.actor, target: null, tags: new Set(), skill: inst.skill, event: e });
      inst.timer += e.dt;
      if (iv > 0 && inst.timer >= iv) { inst.timer -= iv; return 1; }
      return 0;
    }
    case 'meter': {
      const ctx = { world, self: inst.actor, target: e.target ?? null, tags: new Set(e.tags ?? []), skill: e.skill ?? null, event: e };
      inst.meter += evalNum(a.amount, ctx);
      const th = evalNum(a.threshold, ctx);
      if (th <= 0) return 0;
      const n = Math.floor(inst.meter / th);
      inst.meter -= n * th;
      return Math.min(n, a.maxPerEvent ?? 5);
    }
  }
  return 0;
}

function limited(inst, world) {
  const l = inst.rule.limit;
  if (l.cooldown && world.time < inst.readyAt - 1e-9) return true;
  if (l.perSecond) { inst.fires = inst.fires.filter(t => world.time - t < 1); if (inst.fires.length >= l.perSecond) return true; }
  return false;
}

function fire(inst, e, world) {
  const l = inst.rule.limit;
  if (l.cooldown) inst.readyAt = world.time + l.cooldown;
  if (l.perSecond) inst.fires.push(world.time);
  const holder = inst.actor;
  const other = e.source === holder ? e.target : e.source;
  const target = inst.rule.at === 'self' ? null : inst.rule.at === 'nearest' ? world.nearest(holder, 'enemy', inst.rule.range ?? 1500) : (other && other !== holder ? other : null);
  if (inst.rule.at === 'nearest' && !target) return;
  const p = inst.rule.at === 'self' || !target ? { x: e.x ?? holder.x, y: e.y ?? holder.y } : { x: target.x, y: target.y };
  const inv = new Invocation(world, { caster: holder, skill: inst.skill, origin: inst.rule.at === 'event' ? p : undefined, aim: p, target, event: e, depth: (e.depth ?? 0) + 1, triggered: true, tags: inst.skill?.tags ?? new Set(['triggered']) });
  world.emit({ type: 'trigger', source: holder, key: inst.rule.id, depth: inv.depth, x: p.x, y: p.y });
  run(inst.rule.do, inv);
}

/** Install the rule dispatcher on a world. */
export function installRules(world) {
  world.ruleIndex = new Map();
  world.on('*', (w, e) => {
    const list = w.ruleIndex.get(e.type);
    if (!list) return;
    for (const inst of list.slice()) {
      if (!inst.actor.alive && inst.rule.on !== 'death') continue;
      if ((e.depth ?? 0) > 0 && !inst.rule.chain) continue;
      if (!roleMatches(inst.rule.role, inst.actor, e)) continue;
      if (!filterMatches(inst.rule.filter, inst, e, w)) continue;
      const n = accumulate(inst, e, w);
      for (let i = 0; i < n; ++i) { if (limited(inst, w)) break; fire(inst, e, w); }
    }
  });
  // A tick event per actor that has periodic rules, so "every 2 seconds" rules need no special casing.
  world.systems.push({ step(w, dt) {
    const list = w.ruleIndex.get('tick');
    if (!list?.length) return;
    const seen = new Set();
    for (const inst of list) if (inst.actor.alive && !seen.has(inst.actor)) { seen.add(inst.actor); w.emit({ type: 'tick', source: inst.actor, dt }); }
  } });
}

export { num };

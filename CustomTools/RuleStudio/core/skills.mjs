// 技能：标签 + 基础数值 + 动作图。技能本身尽量朴素，形态变化全部来自词条（全局修正、规则、链接）。
//
//   { id:'fireball', tags:['spell','projectile','fire'], time:0.75, cost:8, crit:7, damage:{fire:40},
//     actions:[ {do:'projectile', speed:1200, onEnd:[{do:'area', radius:80}]} ] }
//
// Persistent skills (heralds, auras) set `reserve` (percent of mana) and `status` (applied to the caster
// for as long as the skill is active). Links attach supports to one skill instance: their mods are
// compiled with scope 'skill', their tags join the skill's tags, and their rules fire with that skill.
import { compileMod, ModIndex } from './mods.mjs';
import { compileRule, attachRule } from './rules.mjs';
import { Invocation, run, actionNames } from './actions.mjs';

export function compileSkill(raw) {
  const where = `技能 ${raw?.id}`;
  if (!raw?.id) throw new Error('技能缺少 id');
  if (!Array.isArray(raw.actions)) throw new Error(`${where}: actions 必须是数组`);
  checkActions(raw.actions, where);
  return Object.freeze({
    id: raw.id, name: raw.name ?? raw.id, tags: Object.freeze([...(raw.tags ?? [])]),
    time: raw.time ?? 0.8, cost: raw.cost ?? 0, cooldown: raw.cooldown ?? 0, crit: raw.crit ?? 5,
    damage: Object.freeze({ ...(raw.damage ?? {}) }), effectiveness: raw.effectiveness ?? 100,
    range: raw.range ?? 800, channel: raw.channel ?? 0, actions: raw.actions, reserve: raw.reserve ?? 0, status: raw.status ?? null,
    mods: (raw.mods ?? []).map((m, i) => compileMod({ ...m, scope: 'skill' }, `${where}.mods[${i}]`)),
    rules: (raw.rules ?? []).map((r, i) => compileRule(r, `${where}.rules[${i}]`)),
  });
}

export function compileSupport(raw) {
  const where = `辅助 ${raw?.id}`;
  return Object.freeze({
    id: raw.id, name: raw.name ?? raw.id, requires: raw.requires ?? null, addTags: Object.freeze([...(raw.addTags ?? [])]),
    mods: (raw.mods ?? []).map((m, i) => compileMod({ ...m, scope: 'skill' }, `${where}.mods[${i}]`)),
    rules: (raw.rules ?? []).map((r, i) => compileRule(r, `${where}.rules[${i}]`)),
    groups: Object.freeze([...(raw.groups ?? [])]),
  });
}

const CONTAINERS = ['onHit', 'onEnd', 'onPulse', 'onCast', 'actions', 'then', 'else'];
function checkActions(list, where) {
  const known = new Set(actionNames());
  for (const [i, a] of list.entries()) {
    if (!known.has(a.do)) throw new Error(`${where}: 第 ${i} 个动作未知 ${a.do}`);
    for (const k of CONTAINERS) if (a[k]) checkActions(a[k], `${where}.${a.do}.${k}`);
  }
}

/** A skill as owned by one actor, with its links. */
export function instantiate(world, actor, def, supports = []) {
  for (const s of supports) if (s.requires && !s.requires.some(t => def.tags.includes(t))) throw new Error(`辅助 ${s.id} 不能链接到 ${def.id}`);
  const inst = {
    def, owner: actor, readyAt: 0, active: false,
    tags: new Set([...def.tags, ...supports.flatMap(s => s.addTags)]),
    mods: new ModIndex([...def.mods, ...supports.flatMap(s => s.mods)]),
    groups: new Set(supports.flatMap(s => s.groups)),
    supports,
  };
  for (const r of [...def.rules, ...supports.flatMap(s => s.rules)]) attachRule(world, actor, r, inst);
  return inst;
}

export function castTime(world, actor, sk) {
  const tags = sk.tags, ctx = { world, self: actor, target: null, tags, skill: sk };
  const base = tags.has('attack') ? world.stat(actor, 'attackTime', tags, ctx) * sk.def.time / 0.8 : sk.def.time;
  return base / (world.stat(actor, 'speed', tags, ctx) / 100);
}

export function ready(world, actor, sk) {
  if (world.time < sk.readyAt - 1e-9) return false;
  const cost = world.scaled(actor, 'cost', sk.def.cost, sk.tags, { world, self: actor, tags: sk.tags, skill: sk });
  return actor.mana >= cost - 1e-9;
}

/**
 * Cast a skill now. opts: { aim, target, triggered, depth, event, mult, vars }.
 * Triggered casts pay no cost and ignore the skill's cast time; they still respect its cooldown.
 */
export function cast(world, actor, sk, opts = {}) {
  if (!actor.alive || !sk) return false;
  const ctx = { world, self: actor, target: opts.target ?? null, tags: sk.tags, skill: sk };
  if (sk.def.reserve) return togglePersistent(world, actor, sk, true);
  if (world.time < sk.readyAt - 1e-9) return false;
  if (sk.def.channel && !opts.triggered) { if (actor.channeling === sk) return false; actor.channeling = sk; actor.channelTarget = opts.target ?? null; actor.channelTimer = 0; actor.channelTicks = 0; world.emit({ type: 'channelStart', source: actor, skill: sk, tags: [...sk.tags] }); return true; }
  if (!opts.triggered) {
    const cost = world.scaled(actor, 'cost', sk.def.cost, sk.tags, ctx);
    if (actor.mana < cost - 1e-9) return false;
    actor.mana -= cost;
    if (cost > 0) world.emit({ type: 'spend', source: actor, key: 'mana', amount: cost, skill: sk, tags: [...sk.tags] });
  }
  const cd = world.scaled(actor, 'cooldown', sk.def.cooldown, sk.tags, ctx);
  sk.readyAt = world.time + (cd > 0 ? cd / (1 + world.stat(actor, 'cooldownRecovery', sk.tags, ctx) / 100) : 0);
  const inv = new Invocation(world, { caster: actor, skill: sk, aim: opts.aim, target: opts.target ?? null, event: opts.event ?? null, depth: opts.depth ?? 0, mult: opts.mult ?? 1, vars: opts.vars ?? {}, triggered: !!opts.triggered,
    tags: opts.triggered ? new Set([...sk.tags, 'triggered']) : sk.tags });
  world.emit({ type: 'cast', source: actor, target: opts.target ?? null, skill: sk, tags: [...sk.tags, ...(opts.triggered ? ['triggered'] : [])], x: inv.aim.x, y: inv.aim.y, depth: opts.depth ?? 0 });
  run(sk.def.actions, inv);
  // Repeats (multistrike, spell echo): the same invocation again with fresh carriers.
  const rr = world.stat(actor, 'repeat', sk.tags, ctx), repeats = Math.floor(rr) + (world.roll('repeat') < rr - Math.floor(rr) ? 1 : 0);
  for (let i = 1; i <= repeats; ++i) world.schedule(0.12 * i, () => { if (actor.alive) run(sk.def.actions, inv.fork({ vars: { ...inv.vars, repeat: i } })); });
  return true;
}

/** Heralds/auras: reserve mana and keep their status on the caster while active. */
export function togglePersistent(world, actor, sk, on) {
  if (sk.active === on) return false;
  sk.active = on;
  const pct = sk.def.reserve * 100 / (100 + world.stat(actor, 'reserveEfficiency', sk.tags));
  actor.reserved += on ? pct : -pct;
  actor.mana = Math.min(actor.mana, actor.max.mana * (1 - actor.reserved / 100));
  if (sk.def.status) {
    if (on) world.applyStatus(actor, sk.def.status, { source: actor, duration: 1e9, magnitude: world.scaled(actor, 'buffEffect', 100, new Set([...sk.tags, sk.def.status])) / 100 });
    else world.removeStatus(actor, sk.def.status);
  }
  world.emit({ type: on ? 'activate' : 'deactivate', source: actor, skill: sk, tags: [...sk.tags] });
  return true;
}

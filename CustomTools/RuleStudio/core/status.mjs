// 状态：每次施加都是一个实例，带来源、强度、剩余时间。异常、增益、诅咒、光环效果、充能都走这里。
//
//   { id:'ignite', tags:['ailment','elemental','dot'], stacking:'strongest', max:1, duration:4,
//     dot:{ type:'fire' }, mods:[...], aura:{ radius:300, team:'enemy', status:'chilled_ground' } }
//
// stacking:
//   refresh    one instance; reapplying keeps the stronger magnitude and the longer remaining time
//   stack      one instance with a stack count (≤ max); each application adds stacks and refreshes
//   instances  independent instances (≤ max, oldest dropped) — poison, bleed stacks, multiple curses' worth
//   strongest  instances kept, only the strongest one acts (PoE ignite)
// Mods on a status scale with `magnitude × stacks` (instances: summed over active instances).
// A status with `dot` deals `instance.dps` of that damage type each second to its bearer and emits
// dot events, so "when your ignite deals damage" style rules work.
import { compileMod, ModIndex } from './mods.mjs';
import { DAMAGE_TYPES } from './registry.mjs';

const STACKING = new Set(['refresh', 'stack', 'instances', 'strongest']);

export function compileStatus(raw) {
  const where = `状态 ${raw?.id}`;
  if (!raw?.id) throw new Error('状态缺少 id');
  const stacking = raw.stacking ?? 'refresh';
  if (!STACKING.has(stacking)) throw new Error(`${where}: 未知叠加方式 ${stacking}`);
  if (raw.dot && !DAMAGE_TYPES.includes(raw.dot.type)) throw new Error(`${where}: dot.type 未知 ${raw.dot.type}`);
  const mods = (raw.mods ?? []).map((m, i) => compileMod(m, `${where}.mods[${i}]`));
  return Object.freeze({
    id: raw.id, name: raw.name ?? raw.id, tags: Object.freeze([...(raw.tags ?? [])]), stacking,
    max: raw.max ?? (stacking === 'refresh' ? 1 : 999), duration: raw.duration ?? 4,
    dot: raw.dot ? Object.freeze({ type: raw.dot.type }) : null,
    mods: new ModIndex(mods), aura: raw.aura ? Object.freeze({ ...raw.aura }) : null,
    debuff: raw.debuff ?? !!raw.dot,
  });
}

/**
 * Apply to a bearer. `opts`: { source (actor id), magnitude (default 1), stacks (default 1), duration, dps }.
 * Returns the instance that now carries the effect, or null if nothing changed.
 */
export function applyStatus(bearer, def, opts = {}) {
  const magnitude = opts.magnitude ?? 1, duration = opts.duration ?? def.duration, dps = opts.dps ?? 0, add = opts.stacks ?? 1;
  const same = bearer.statuses.filter(s => s.def === def);
  if (def.stacking === 'refresh' || def.stacking === 'stack') {
    let inst = same[0];
    if (!inst) { inst = { def, source: opts.source ?? 0, stacks: 0, magnitude, remaining: duration, duration, dps }; bearer.statuses.push(inst); }
    if (def.stacking === 'stack') inst.stacks = Math.min(def.max, inst.stacks + add);
    else inst.stacks = 1;
    if (magnitude >= inst.magnitude) { inst.magnitude = magnitude; inst.source = opts.source ?? inst.source; }
    inst.dps = Math.max(inst.dps, dps);
    inst.remaining = Math.max(inst.remaining, duration); inst.duration = Math.max(inst.duration, duration);
    bearer.statusVersion++;
    return inst;
  }
  // instances / strongest
  const inst = { def, source: opts.source ?? 0, stacks: 1, magnitude, remaining: duration, duration, dps };
  bearer.statuses.push(inst);
  if (same.length + 1 > def.max) {
    // Drop the instance closest to expiring (the oldest).
    let worst = same[0];
    for (const s of same) if (s.remaining < worst.remaining) worst = s;
    bearer.statuses.splice(bearer.statuses.indexOf(worst), 1);
  }
  bearer.statusVersion++;
  return inst;
}

/** Instances of `def` that currently act. */
export function activeInstances(bearer, def) {
  const list = bearer.statuses.filter(s => s.def === def);
  if (def.stacking !== 'strongest' || list.length <= 1) return list;
  let best = list[0];
  for (const s of list) if (s.dps * s.magnitude > best.dps * best.magnitude) best = s;
  return [best];
}

export function removeStatus(bearer, def) {
  const before = bearer.statuses.length;
  bearer.statuses = bearer.statuses.filter(s => s.def !== def);
  if (bearer.statuses.length !== before) bearer.statusVersion++;
  return before - bearer.statuses.length;
}

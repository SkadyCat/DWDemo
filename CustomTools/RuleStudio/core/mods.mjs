// 修正语法：属性 · 运算 · 数值 · 作用范围 · 条件 · 缩放。
//
//   { stat:'damage', op:'more', value:40, tags:['fire','spell'], when:{res:'power', gte:1}, per:{status:'shock', of:'target', max:5} }
//
// op:   base (flat, added before multipliers) · inc (summed percent) · more (each multiplies) · flag · set (overrides)
// tags: the modifier only counts when the evaluation context carries every tag (skill tags + damage-type tags)
// notTags: and none of these
// scope: self (default) · minion (counts on every minion this actor owns, recursively) · skill (only for the skill it is linked to)
// when / per: see expr.mjs; both are evaluated at hit time, so "while at full life", "per frenzy charge",
// "against shocked enemies" all stay correct without recompiling anything.
import { statDef } from './registry.mjs';
import { checkCondition, checkScaling, test, scale } from './expr.mjs';

const OPS = new Set(['base', 'inc', 'more', 'flag', 'set']);
const SCOPES = new Set(['self', 'minion', 'skill']);

export function compileMod(raw, where = 'mod') {
  if (!raw || typeof raw !== 'object') throw new Error(`${where}: 修正必须是对象`);
  const def = statDef(raw.stat);
  if (!def) throw new Error(`${where}: 未知属性 ${raw.stat}`);
  const op = raw.op ?? (def.kind === 'flag' ? 'flag' : 'base');
  if (!OPS.has(op)) throw new Error(`${where}: 未知运算 ${op}`);
  if (def.kind === 'flag' && op !== 'flag') throw new Error(`${where}: ${raw.stat} 是开关属性，只能用 flag`);
  if (def.kind !== 'flag' && op === 'flag') throw new Error(`${where}: ${raw.stat} 是数值属性，不能用 flag`);
  const value = op === 'flag' ? (raw.value ?? 1) : raw.value;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${where}: 数值无效 ${raw.value}`);
  const scope = raw.scope ?? 'self';
  if (!SCOPES.has(scope)) throw new Error(`${where}: 未知作用范围 ${scope}`);
  checkCondition(raw.when, `${where}.when`);
  checkScaling(raw.per, `${where}.per`);
  const known = new Set(['stat', 'op', 'value', 'tags', 'notTags', 'scope', 'when', 'per', 'source']);
  for (const k of Object.keys(raw)) if (!known.has(k)) throw new Error(`${where}: 未知字段 ${k}`);
  return Object.freeze({
    stat: raw.stat, op, value, scope,
    tags: raw.tags?.length ? Object.freeze([...raw.tags]) : null,
    notTags: raw.notTags?.length ? Object.freeze([...raw.notTags]) : null,
    when: raw.when ?? null, per: raw.per ?? null, source: raw.source ?? '',
  });
}

/** Mods grouped by stat, for one holder (an actor's gear, a status definition, a linked skill). */
export class ModIndex {
  constructor(mods = []) { this.byStat = new Map(); this.list = []; for (const m of mods) this.add(m); }
  add(mod) { this.list.push(mod); let a = this.byStat.get(mod.stat); if (!a) this.byStat.set(mod.stat, a = []); a.push(mod); }
  get(stat) { return this.byStat.get(stat); }
  get size() { return this.list.length; }
}

export function newAccumulator(def) { return { base: def.base, inc: 0, more: 1, set: null, flag: 0 }; }

/** Fold a list of mods into an accumulator. `mult` scales magnitudes (status effect, stacks). */
export function accumulate(acc, mods, ctx, mult = 1, scope = null) {
  if (!mods) return;
  for (let i = 0; i < mods.length; ++i) {
    const m = mods[i];
    if (scope && m.scope !== scope) continue;
    if (!scope && m.scope === 'minion') continue;
    if (m.tags) { let ok = true; for (const t of m.tags) if (!ctx.tags?.has(t)) { ok = false; break; } if (!ok) continue; }
    if (m.notTags && ctx.tags) { let bad = false; for (const t of m.notTags) if (ctx.tags.has(t)) { bad = true; break; } if (bad) continue; }
    if (m.when && !test(m.when, ctx)) continue;
    const k = m.per ? scale(m.per, ctx) : 1;
    if (k === 0) continue;
    const v = m.value * k * mult;
    switch (m.op) {
      case 'base': acc.base += v; break;
      case 'inc': acc.inc += v; break;
      case 'more': acc.more *= Math.max(0, 1 + v / 100); break;
      case 'set': acc.set = v; break;
      case 'flag': if (v > 0) acc.flag = 1; break;
    }
  }
}

export function resolve(acc, def) {
  if (def.kind === 'flag') return acc.flag || acc.base > 0 ? 1 : 0;
  const v = acc.set ?? acc.base * Math.max(0, 1 + acc.inc / 100) * acc.more;
  return Math.min(def.max, Math.max(def.min, v));
}

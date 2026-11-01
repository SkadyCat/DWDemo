// 伤害管线：一次命中 = 一个多类型伤害包，按固定顺序走完：
//   基础 + 附加 → 转化 / 额外获得 → 按「血统标签」放大 → 暴击 → 命中判定（闪避、格挡）
//   → 防御（护甲、抗性 − 穿透 − 曝露、承伤）→ 能量护盾 / 生命 → 偷取、回复 → 异常 → 事件
// Attacker and defender are symmetric: monsters run the exact same pipeline against the hero.
import { DAMAGE_TYPES, ELEMENTS, CONVERSION_ORDER } from './registry.mjs';

const ORDER = CONVERSION_ORDER;

/**
 * Conversion and gain-as-extra. Input: { type: amount }. Output: chunks [{type, amount, lineage:Set}].
 * A chunk remembers every type it has been (PoE rule): physical converted to fire is scaled by both
 * physical and fire modifiers.
 */
export function convert(world, source, base, tags, ctx) {
  const pending = new Map(ORDER.map(t => [t, []]));
  for (const t of DAMAGE_TYPES) if (base[t] > 0) pending.get(t).push({ amount: base[t], lineage: new Set([t]) });
  const out = [];
  for (let i = 0; i < ORDER.length; ++i) {
    const from = ORDER[i], chunks = pending.get(from);
    if (!chunks.length) continue;
    const later = ORDER.slice(i + 1);
    const conv = later.map(to => world.stat(source, `conv.${from}.${to}`, tags, ctx));
    const total = conv.reduce((a, b) => a + b, 0), k = total > 100 ? 100 / total : 1;
    const extra = ORDER.filter(t => t !== from).map(to => [to, world.stat(source, `extra.${from}.${to}`, tags, ctx)]);
    for (const c of chunks) {
      let kept = c.amount;
      later.forEach((to, j) => {
        const moved = c.amount * conv[j] * k / 100;
        if (moved > 0) { kept -= moved; pending.get(to).push({ amount: moved, lineage: new Set([...c.lineage, to]) }); }
      });
      // Extra damage is gained from the pre-conversion amount and does not convert further from its source.
      for (const [to, pct] of extra) if (pct > 0) out.push({ type: to, amount: c.amount * pct / 100, lineage: new Set([...c.lineage, to]) });
      if (kept > 1e-9) out.push({ type: from, amount: kept, lineage: c.lineage });
    }
  }
  return out;
}

function lineageTags(skillTags, lineage) {
  const t = new Set(skillTags);
  for (const x of lineage) { t.add(x); if (ELEMENTS.includes(x)) t.add('elemental'); }
  return t;
}

function hitChance(accuracy, evasion) {
  if (evasion <= 0) return 1;
  const c = 1.25 * accuracy / (accuracy + Math.pow(evasion * 0.2, 0.9));
  return Math.min(1, Math.max(0.05, c));
}

/** PoE-style armour: reduction = A / (A + 5·D), capped at 90 %. */
export const armourReduction = (armour, damage) => armour <= 0 || damage <= 0 ? 0 : Math.min(0.9, armour / (armour + 5 * damage));

/** Mitigate one chunk against the defender; shared by hits and damage over time. */
function mitigate(world, attacker, target, type, amount, tags, isHit) {
  const tctx = { world, self: target, target: attacker, tags, skill: null, event: null };
  if (type === 'physical') {
    if (isHit) amount *= 1 - armourReduction(world.stat(target, 'armour', tags, tctx), amount);
  } else {
    const max = world.stat(target, `res.max.${type}`, tags, tctx);
    const res = Math.min(max, world.stat(target, `res.${type}`, tags, tctx)) - world.stat(target, `exposure.${type}`, tags, tctx);
    const pen = attacker && isHit ? world.stat(attacker, `pen.${type}`, tags) : 0;
    amount *= 1 - Math.max(-200, res - pen) / 100;
  }
  const taken = world.scaled(target, 'damageTaken', 100, tags, tctx) / 100 * world.scaled(target, isHit ? 'damageTaken.hit' : 'damageTaken.dot', 100, tags, tctx) / 100;
  return Math.max(0, amount * taken);
}

/** Take damage into energy shield then life (chaos skips shield unless the defender says otherwise). */
function absorb(world, target, byType) {
  let total = 0;
  for (const t in byType) total += byType[t];
  let toEs = total - (byType.chaos || 0) * (world.stat(target, 'chaosBypassEs') ? 1 : 0);
  const fromEs = Math.min(target.es, toEs);
  target.es -= fromEs;
  let rest = total - fromEs;
  const mom = world.stat(target, 'mindOverMatter') / 100;
  if (mom > 0 && rest > 0) { const m = Math.min(target.mana, rest * mom); target.mana -= m; rest -= m; }
  target.life -= rest;
  if (target.life <= 0 && world.quick(target, 'immortal')) target.life = 1; // training dummies
  if (total > 0 && target.max.es > 0) target.esDelay = world.stat(target, 'es.rechargeDelay');
  return total;
}

export function kill(world, target, source, extra = {}) {
  if (!target.alive) return;
  target.alive = false; target.life = 0;
  world.emit({ type: 'kill', source, target, x: target.x, y: target.y, ...extra });
  if (target.hasStatus('frozen')) world.emit({ type: 'shatter', source, target, x: target.x, y: target.y, ...extra });
  world.emit({ type: 'death', source: target, target: source, x: target.x, y: target.y, depth: extra.depth ?? 0 });
}

/**
 * Resolve one hit.
 * spec: { source, target, skill, tags (Set), base {type: amount}, crit (skill base crit %),
 *         attack (bool: evasion/accuracy apply), depth, noAilments, mult (extra final multiplier) }
 * Returns { landed, crit, amount, byType } — or { landed:false, reason }.
 */
export function hit(world, spec) {
  const { source, target } = spec;
  if (!target.alive) return { landed: false, reason: 'dead' };
  const tags = spec.tags ?? new Set();
  const ctx = { world, self: source, target, tags, skill: spec.skill ?? null, event: null, vars: spec.vars ?? null };
  const eff = world.scaled(source, 'effectiveness', spec.effectiveness ?? 100, tags, ctx) / 100;
  const base = {};
  for (const t of DAMAGE_TYPES) base[t] = (spec.base?.[t] || 0) + world.stat(source, `added.${t}`, tags, ctx) * eff;

  // Hit roll and block happen before damage is calculated, so they never waste a crit roll.
  const tctx = { world, self: target, target: source, tags, skill: null, event: null };
  if (spec.attack) {
    const chance = hitChance(world.stat(source, 'accuracy', tags, ctx), world.stat(target, 'evasion', tags, tctx));
    if (world.roll('evade') >= chance) { world.emit({ type: 'evade', source: target, target: source, skill: spec.skill, depth: spec.depth }); return { landed: false, reason: 'evaded' }; }
  }
  const block = Math.min(world.stat(target, 'block.max'), world.stat(target, 'block', tags, tctx));
  if (block > 0 && world.roll('block') * 100 < block) { world.emit({ type: 'block', source: target, target: source, skill: spec.skill, depth: spec.depth }); return { landed: false, reason: 'blocked' }; }

  // Crit
  let crit = false;
  if (!world.stat(target, 'cannotBeCrit')) {
    const chance = world.scaled(source, 'crit.chance', spec.crit ?? 0, tags, ctx) + world.stat(target, 'crit.taken', tags, tctx);
    const roll = world.stat(source, 'lucky.crit', tags, ctx) ? Math.min(world.roll('crit'), world.roll('crit')) : world.roll('crit');
    crit = roll * 100 < chance;
  }
  const critMult = crit ? 1 + world.stat(source, 'crit.bonus', tags, ctx) / 100 : 1;
  const hitTags = new Set(tags); hitTags.add('hit'); if (crit) hitTags.add('crit');

  // Scale every chunk by the modifiers its lineage qualifies for; keep pre-mitigation amounts for ailments.
  const chunks = convert(world, source, base, hitTags, ctx);
  const raw = {}, byType = {};
  const mult = spec.mult ?? 1;
  for (const c of chunks) {
    const ct = lineageTags(hitTags, c.lineage);
    const scaled = world.scaled(source, 'damage', c.amount, ct, { ...ctx, tags: ct }) * critMult * mult;
    raw[c.type] = (raw[c.type] || 0) + scaled;
    // Lineage matters for ailments too: fire converted from physical can ignite *and* bleed.
    for (const l of c.lineage) raw[`~${l}`] = (raw[`~${l}`] || 0) + scaled;
    byType[c.type] = (byType[c.type] || 0) + mitigate(world, source, target, c.type, scaled, ct, true);
  }
  const amount = absorb(world, target, byType);
  const eventTags = [...hitTags, ...Object.keys(byType).filter(t => byType[t] > 0)];
  for (const t of Object.keys(byType)) if (ELEMENTS.includes(t) && byType[t] > 0) { eventTags.push('elemental'); break; }

  // Recovery for the attacker
  if (amount > 0 && source.alive) {
    const leech = world.stat(source, 'leech.life', hitTags, ctx), cap = world.stat(source, 'leech.max') / 100 * source.max.life;
    const heal = Math.min(cap, amount * leech / 100) + world.stat(source, 'life.onHit', hitTags, ctx);
    if (heal > 0) source.life = Math.min(source.max.life, source.life + heal);
    const ml = world.stat(source, 'leech.mana', hitTags, ctx);
    if (ml > 0) source.mana = Math.min(source.max.mana, source.mana + Math.min(cap, amount * ml / 100));
  }

  const event = { type: 'hit', source, target, skill: spec.skill, tags: eventTags, amount, crit, byType, raw, x: target.x, y: target.y, depth: spec.depth ?? 0 };
  world.emit(event);
  if (crit) world.emit({ ...event, type: 'crit' });
  world.emit({ type: 'struck', source: target, target: source, skill: spec.skill, tags: eventTags, amount, crit, depth: spec.depth ?? 0 });
  if (!spec.noAilments) applyAilments(world, source, target, raw, hitTags, ctx, spec.depth ?? 0);
  if (target.life <= 0) kill(world, target, source, { skill: spec.skill, tags: eventTags, overkill: -target.life, depth: spec.depth ?? 0 });
  return { landed: true, crit, amount, byType, raw };
}

/** Roll every ailment the content defines against the pre-mitigation amounts of the hit. */
export function applyAilments(world, source, target, raw, hitTags, ctx, depth) {
  const ailments = world.content.ailments;
  if (!ailments) return;
  for (const a of ailments.values()) {
    let eligible = 0;
    for (const t of a.from) eligible += raw[`~${t}`] || 0;
    if (eligible <= 0) continue;
    const tags = new Set(hitTags); tags.add(a.id); tags.add('ailment');
    const actx = { ...ctx, tags };
    const chance = world.stat(source, `chance.${a.id}`, tags, actx) - world.stat(target, 'avoid.ailment', tags);
    if (chance <= 0 || world.roll(a.id) * 100 >= chance) continue;
    const effect = world.stat(source, `effect.${a.id}`, tags, actx) / 100;
    const duration = a.duration * world.stat(source, `ailmentDuration.${a.id}`, tags, actx) / 100 * world.stat(source, 'duration', tags, actx) / 100;
    if (a.kind === 'dot') {
      const dps = eligible * a.pct / 100 * effect * world.stat(source, 'ailmentDamage', tags, actx) / 100;
      const n = Math.max(1, Math.floor(world.stat(source, `ailmentStacks.${a.id}`, tags, actx)));
      for (let i = 0; i < n; ++i) world.applyStatus(target, a.status, { source, dps, duration, depth });
    } else {
      // Non-damaging ailments: bigger hits relative to the target's pool give a stronger effect.
      const pool = Math.max(1, target.max.life + target.max.es);
      const magnitude = Math.min(a.cap, a.scale * Math.pow(eligible / pool, 0.4)) * effect;
      if (magnitude < (a.min ?? 0)) continue;
      // Fixed ailments (freeze, stun-like) have a constant effect; a bigger hit lasts longer instead.
      if (a.fixed) world.applyStatus(target, a.status, { source, magnitude: 1, duration: duration * Math.max(0.25, Math.min(1, magnitude / a.cap)), depth });
      else world.applyStatus(target, a.status, { source, magnitude, duration, depth });
    }
    world.emit({ type: 'ailment', source, target, key: a.id, tags: [...tags], depth });
  }
}

/** Damage over time from a status instance; called by the vitals system every step. */
export function dotDamage(world, bearer, inst, dt) {
  if (!bearer.alive || inst.dps <= 0) return 0;
  const source = world.actors.get(inst.source) ?? null;
  const type = inst.def.dot.type, tags = new Set(['dot', type, ...inst.def.tags]);
  if (ELEMENTS.includes(type)) tags.add('elemental');
  let dps = inst.dps;
  if (source) dps *= world.stat(source, 'dotDamage', tags, { world, self: source, target: bearer, tags }) / 100;
  const amount = mitigate(world, source, bearer, type, dps * dt, tags, false);
  absorb(world, bearer, { [type]: amount });
  inst.dealt = (inst.dealt || 0) + amount;
  inst.tickTimer = (inst.tickTimer ?? 0.5) - dt;
  if (inst.tickTimer <= 0) {
    inst.tickTimer += 0.5;
    world.emit({ type: 'dotTick', source, target: bearer, key: inst.def.id, tags: [...tags], amount: inst.dealt, x: bearer.x, y: bearer.y });
    inst.dealt = 0;
  }
  if (bearer.life <= 0) kill(world, bearer, source, { tags: [...tags], dot: inst.def.id });
  return amount;
}

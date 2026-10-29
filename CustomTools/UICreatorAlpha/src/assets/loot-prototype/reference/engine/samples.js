// Mirror of DWRuleSamples.cpp (C++-authored sample traits used by the core tests).
import { EModOp, EOp, EElement, EOrigin, ELayout, EScope, ERedirect } from './types.js';
import { Expr, newTrait, newAction, newRule, newCondition, newModifier, newBuild } from './reader.js';

const modifier = (stat, op, value) => newModifier(stat, op, Expr.number(value));
function tagCondition(tag) {
  const c = newCondition();
  c.op = 'tag';
  c.tag = tag;
  return c;
}

export function iceLance() {
  const trait = newTrait('ice_lance');
  trait.params.set('damage', 12);
  trait.modifiers.push(modifier('projectile.damage', EModOp.Set, 12), modifier('projectile.speed', EModOp.Set, 18),
    modifier('projectile.lifetime', EModOp.Set, 1.5), modifier('projectile.radius', EModOp.Set, 0.25), modifier('element.cold.damage_flat', EModOp.Add, 2));
  const emit = newAction(EOp.Emit);
  emit.kind = 'ice_lance';
  emit.element = EElement.Cold;
  emit.origin = EOrigin.Event;
  emit.tags.push('cold');
  emit.numbers.set('damage', Expr.param('damage'));
  const rule = newRule();
  rule.id = 'cast_lance';
  rule.event = 'cast';
  rule.actions.push(emit);
  trait.rules.push(rule);
  return trait;
}

export function multiple(extra) {
  const trait = newTrait('multiple_projectiles');
  trait.parentId = 'ice_lance';
  trait.modifiers.push(modifier('projectile.count', EModOp.Add, extra), modifier('projectile.spread', EModOp.Set, 50), modifier('projectile.damage', EModOp.Multiply, 0.8));
  return trait;
}

export function pierce(count) {
  const trait = newTrait('pierce');
  trait.parentId = 'ice_lance';
  trait.modifiers.push(modifier('projectile.pierce', EModOp.Add, count));
  return trait;
}

export function ricochet(count) {
  const trait = newTrait('ricochet');
  trait.parentId = 'ice_lance';
  trait.modifiers.push(modifier('projectile.ricochet_count', EModOp.Add, count));
  const redirect = newAction(EOp.Redirect);
  redirect.mode = ERedirect.Ricochet;
  const rule = newRule();
  rule.id = 'ricochet_on_hit';
  rule.event = 'hit';
  rule.maxDepth = 8;
  rule.conditions.push(tagCondition('projectile'));
  rule.actions.push(redirect);
  trait.rules.push(rule);
  return trait;
}

export function shatterOnKill() {
  const trait = newTrait('shatter');
  trait.parentId = 'ice_lance';
  trait.params.set('radius', 3);
  trait.params.set('amount', 15);
  const burst = newAction(EOp.DamageArea);
  burst.element = EElement.Cold;
  burst.emitEvent = 'shatter_hit';
  burst.tags.push('shatter');
  burst.numbers.set('radius', Expr.param('radius'));
  burst.numbers.set('amount', Expr.param('amount'));
  const rule = newRule();
  rule.id = 'shatter_on_kill';
  rule.event = 'kill';
  rule.channel = 'shatter';
  // Chain explosions at most 3 deep per root, independent of projectile generation.
  rule.maxDepth = 3;
  rule.actions.push(burst);
  trait.rules.push(rule);
  return trait;
}

export function frostReservoir() {
  const trait = newTrait('frost_reservoir');
  trait.parentId = 'ice_lance';
  const nova = newAction(EOp.Emit);
  nova.kind = 'ice_shard';
  nova.layout = ELayout.Radial;
  nova.inherit = false;
  nova.element = EElement.Cold;
  nova.tags.push('nova');
  for (const [field, value] of [['count', 8], ['speed', 14], ['lifetime', 0.6], ['damage', 6], ['radius', 0.2]]) nova.numbers.set(field, Expr.number(value));
  const store = newAction(EOp.Accumulate);
  store.key = 'frost';
  store.scope = EScope.Owner;
  store.numbers.set('value', Expr.event('amount'));
  store.numbers.set('cap', Expr.number(2000));
  store.numbers.set('threshold', Expr.number(250));
  store.then.push(nova);
  const rule = newRule();
  rule.id = 'store_frost';
  rule.event = 'hit';
  rule.maxDepth = 3;
  rule.conditions.push(tagCondition('cold'));
  rule.actions.push(store);
  trait.rules.push(rule);
  return trait;
}

export function coldMastery(increasedPercent) {
  const trait = newTrait('cold_mastery');
  trait.modifiers.push(modifier('element.cold.damage_percent', EModOp.IncreasedPercent, increasedPercent), modifier('owner.critical_chance', EModOp.Add, 10));
  return trait;
}

export function stackedIceLance() {
  return newBuild('ice_lance', [iceLance(), multiple(4), pierce(2), ricochet(2), shatterOnKill(), frostReservoir(), coldMastery(60)]);
}

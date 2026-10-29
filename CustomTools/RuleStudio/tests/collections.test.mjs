import test from 'node:test';
import assert from 'node:assert/strict';
import { readRuleFiles } from '../scripts/rule-files.mjs';
import { readBaselineRuleFiles, projectileWeaponFixture } from './rule-fixture.mjs';
import { checkRuleSet, parseCollection, serializeCollection, validateCollection, aggregate, markEnabled, compileBuild, referencesTo } from '../engine/index.mjs';
import { runCombat } from '../public/combat.mjs';

const loaded = () => {
  const check = checkRuleSet([...readRuleFiles(), projectileWeaponFixture()]);
  assert.ok(check.ok, check.error);
  return check;
};
const part = (check, kind, id) => ({ kind, doc: check.collections[kind].get(id).doc });

test('集合: the whole rule set (traits, skills, equipment, items) validates', () => {
  const check = loaded();
  assert.ok(check.collections.skill.size >= 6);
  assert.ok(check.collections.equipment.size >= 1);
  assert.ok(check.collections.item.size >= 1);
});

test('集合: serialize -> parse round trip for every collection', () => {
  const check = loaded();
  for (const kind of ['skill', 'equipment', 'item']) {
    for (const [, entry] of check.collections[kind]) {
      const text = serializeCollection(kind, entry.doc);
      const back = parseCollection(kind, text);
      assert.ok(back.doc, `${entry.path}: ${back.error}`);
      assert.deepEqual(back.doc, entry.doc, entry.path);
    }
  }
});

test('集合: closed fields, unknown traits and unknown params are rejected', () => {
  const check = loaded();
  assert.match(parseCollection('equipment', '{"id":"x","name":"x","color":"red"}').error, /未知字段/);
  assert.match(parseCollection('skill', '{"id":"x","active":"chill","traits":[{"id":"chill","params":{"slow":1}}]}').error, /不支持参数覆盖/);
  assert.match(parseCollection('item', '{"id":"Bad-Id"}').error, /id/);
  const unknownTrait = parseCollection('item', '{"id":"x","name":"x","traits":["nope"]}').doc;
  assert.match(validateCollection('item', unknownTrait, check.library).error, /未知特性/);
  const unknownParam = parseCollection('item', '{"id":"x","name":"x","traits":[{"id":"chill","params":{"speed":1}}]}').doc;
  assert.match(validateCollection('item', unknownParam, check.library).error, /没有参数/);
});

test('集合: equipment aggregates with a skill; params override; stat traits stack; child traits need their parent', () => {
  const check = loaded();
  const staff = part(check, 'equipment', 'test_projectile_weapon');
  const split = { kind: 'equipment', doc: parseCollection('equipment', { id: 'test_projectile_gloves', slot: 'gloves', traits: ['multiple_projectiles'] }).doc };
  const scroll = part(check, 'item', 'scroll_frost_lance');
  const agg = aggregate(check.library, 'frost_lance', [staff, split, scroll]);
  assert.ifError(agg.error || null);
  const compiled = compileBuild(agg.source);
  assert.ok(compiled.plan, compiled.error);
  markEnabled(agg.contributions, compiled.plan, check.library);
  assert.ok(compiled.plan.traitIds.includes('multiple_projectiles~2'), 'stat trait stacked');
  const chill = agg.contributions.filter(c => c.traitId === 'chill');
  assert.equal(chill.find(c => c.status === 'on').params.slow, 45, 'later override re-tunes the rule trait');
  assert.equal(chill.filter(c => c.status === 'on').length, 1, 'rule trait fires once');

  const slash = aggregate(check.library, 'player_slash', [staff]);
  const slashPlan = compileBuild(slash.source).plan;
  markEnabled(slash.contributions, slashPlan, check.library);
  assert.equal(slash.contributions.find(c => c.traitId === 'pierce').status, 'on', 'generic projectile modifiers are no longer tied to create_ice_lance');
  const dependent = { ...check.library.trait('pierce').source, id: 'test_dependent_pierce', parentId: 'absent_parent' };
  const dependentPlan = compileBuild({ ...slash.source, traits: [...slash.source.traits, dependent] }).plan;
  assert.ok(!dependentPlan.traitIds.includes(dependent.id), 'explicit parent dependencies still exclude an absent parent');
});

test('集合: equipment makes the test skill stronger in combat', () => {
  const check = checkRuleSet(readBaselineRuleFiles());
  assert.ok(check.ok, check.error);
  const fight = source => runCombat([], { source, layout: 'pack', count: 15, health: 80, casts: 3, castInterval: 30, frames: 600, seed: 11 });
  const base = fight(aggregate(check.library, 'frost_lance', []).source);
  const geared = fight(aggregate(check.library, 'frost_lance', [part(check, 'equipment', 'test_projectile_weapon'), part(check, 'equipment', 'cinder_surge_robe')]).source);
  assert.ifError(base.error || geared.error || null);
  console.log(`frost_lance base=${base.total.damage.toFixed(1)} geared=${geared.total.damage.toFixed(1)} kills ${base.total.kills}->${geared.total.kills}`);
  assert.ok(geared.total.damage > base.total.damage * 1.5);
});

test('集合: references find skills granted by equipment', () => {
  const check = loaded();
  // The authored staff can grant any skill; provide this test's explicit prerequisite.
  check.collections.equipment.get('test_projectile_weapon').doc.skills = ['frost_lance'];
  assert.ok(referencesTo(check.collections, 'frost_lance').some(r => r.id === 'test_projectile_weapon' && r.as === 'skill'));
});

// "附带持续时间": wrapper traits (Content/Rules/Timed) that stitch any traits and grant them for a duration.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkRuleSet, parseCollection, serializeCollection, validateCollection, aggregate, compileBuild, describeTrait,
  RuleLibrary, RuleHost, readTraitText, isStitchable, sourceFromEntry,
} from '../engine/index.mjs';
import { readBaselineRuleFiles as readRuleFiles } from './rule-fixture.mjs';
import { runCombat } from '../public/combat.mjs';

const files = readRuleFiles();
const check = checkRuleSet(files);
const L = check.library;
const ring = traits => parseCollection('equipment', { id: 't', name: 't', slot: 'ring', rarity: 'rare', level: 1, traits });

test('附带持续时间: wrapper traits load from Timed/ and are kept out of UE folders', () => {
  assert.ok(check.ok, check.error);
  for (const id of ['timed_on_cast', 'timed_on_hit', 'timed_on_crit', 'timed_on_kill', 'timed_hit_curse']) {
    const trait = L.trait(id);
    assert.ok(trait && trait.webOnly && isStitchable(trait.source), id);
    assert.equal(describeTrait(trait).kind, 'timed');
  }
  assert.equal(describeTrait(L.trait('timed_on_kill')).stitchTarget, 'self');
  assert.equal(describeTrait(L.trait('timed_hit_curse')).stitchTarget, 'target');
  const wrapper = files.find(f => f.path === 'Timed/timed_on_kill.json');
  // Same file under Traits/ (loaded by UE) is refused; a UE build cannot reference a Timed/ trait.
  assert.match(new RuleLibrary().load([...files.filter(f => f !== wrapper), { path: 'Traits/timed_on_kill.json', text: wrapper.text }]).error, /grant_traits/);
  assert.match(new RuleLibrary().load([...files, { path: 'Builds/x.json', text: '{"id":"x","traits":["create_ice_lance","timed_on_kill"]}' }]).error, /Timed/);
  assert.match(readTraitText('{"id":"x","rules":[{"id":"r","event":"hit","actions":[{"op":"grant_traits","traits":7,"duration":1}]}]}').error, /traits/);
  assert.match(readTraitText('{"id":"x","rules":[{"id":"r","event":"hit","actions":[{"op":"apply_status","key":"chill","traits":"stitched","value":1,"duration":1}]}]}').error, /traits/);
});

test('附带持续时间: collection entries stitch any traits, nest, round-trip and validate', () => {
  const { doc, error } = ring([
    { id: 'timed_on_kill', params: { duration: 5 }, with: [{ id: 'fire_damage', params: { amount: 40 } }, { id: 'timed_on_hit', with: ['chill'] }] },
    { id: 'timed_on_kill', with: ['lightning_damage'] },
  ]);
  assert.equal(error, '');
  assert.equal(doc.traits[0].with[1].with[0].id, 'chill');
  const text = serializeCollection('equipment', doc);
  assert.deepEqual(parseCollection('equipment', text).doc, doc);
  assert.deepEqual(validateCollection('equipment', doc, L), { error: '', warnings: [] });
  assert.match(validateCollection('equipment', ring([{ id: 'fire_damage', with: ['chill'] }]).doc, L).error, /不能缝合/);
  assert.match(validateCollection('equipment', ring([{ id: 'timed_on_kill', with: ['nope'] }]).doc, L).error, /未知特性 nope/);
  assert.ok(validateCollection('equipment', ring(['timed_on_kill']).doc, L).warnings.some(w => /还没有缝合/.test(w)));
  assert.match(ring([{ id: 'timed_on_kill', with: [{ id: 'chill', duration: 3 }] }]).error, /duration/);
  assert.match(ring([{ id: 'timed_on_kill', with: ['chill', 'chill'] }]).error, /重复/);
  const deep = n => (n === 0 ? 'chill' : { id: 'timed_on_hit', with: [deep(n - 1)] });
  assert.equal(ring([deep(3)]).error, '');
  assert.match(ring([deep(4)]).error, /嵌套/);
  assert.match(parseCollection('skill', { id: 's', active: 'create_ice_lance', traits: ['create_ice_lance', { id: 'timed_on_kill', with: ['chill'] }] }).error, /缝合/);
});

test('附带持续时间: stitched contents are part of the plan hash; plain builds hash as before', () => {
  const plain = aggregate(L, 'frost_lance', []).source;
  assert.equal(compileBuild(plain).plan.hash, compileBuild({ ...plain, traits: plain.traits.map(t => ({ ...t })) }).plan.hash);
  const hashWith = stitched => compileBuild(aggregate(L, 'frost_lance', [{ kind: 'equipment', doc: ring([{ id: 'timed_on_kill', with: stitched }]).doc }]).source).plan.hash;
  assert.notEqual(hashWith(['fire_damage']), hashWith(['lightning_damage']));
  assert.notEqual(hashWith([{ id: 'fire_damage', params: { amount: 1 } }]), hashWith([{ id: 'fire_damage', params: { amount: 2 } }]));
  const two = aggregate(L, 'frost_lance', [{ kind: 'equipment', doc: ring([{ id: 'timed_on_kill', with: ['fire_damage'] }, { id: 'timed_on_kill', with: ['lightning_damage'] }]).doc }]);
  assert.deepEqual(two.source.traits.map(t => t.id).slice(-2), ['timed_on_kill', 'timed_on_kill~2']);
  assert.deepEqual(two.contributions.slice(-1)[0].stitched.map(s => s.id), ['lightning_damage']);
});

test('附带持续时间: kill grants the stitched traits to the caster; hit curses the target; re-trigger refreshes', () => {
  const opts = { library: L, statusDefs: L.statusDefs(), layout: 'lane', count: 8, health: 20, casts: 5, castInterval: 30, frames: 400, seed: 3 };
  const fire = run => run.rows.filter(r => r.element === 'fire').reduce((n, r) => n + r.amount, 0);
  const base = runCombat([], { ...opts, source: aggregate(L, 'frost_lance', []).source });
  const doc = ring([{ id: 'timed_on_kill', params: { duration: 10 }, with: [{ id: 'fire_damage', params: { amount: 30 } }] }]).doc;
  const run = runCombat([], { ...opts, source: aggregate(L, 'frost_lance', [{ kind: 'equipment', doc }]).source });
  assert.ifError(run.error || null);
  assert.equal(fire(base), 0);
  assert.ok(base.total.kills > 0);
  const first = run.grants.find(g => g.target === 'self');
  assert.ok(first && first.traits[0] === 'fire_damage');
  assert.ok(run.rows.some(r => r.element === 'fire' && r.frame > first.frame), 'fire damage after the first kill');
  assert.ok(!run.rows.some(r => r.element === 'fire' && r.frame <= first.frame), 'no fire damage before it');
  assert.ok(run.grants.some(g => g.refreshed), 'later kills refresh the same grant');

  const curse = ring([{ id: 'timed_hit_curse', with: [{ id: 'frost_resistance', params: { resistance: -60 } }] }]).doc;
  const sturdy = { ...opts, health: 1e6 };
  const cursed = runCombat([], { ...sturdy, source: aggregate(L, 'frost_lance', [{ kind: 'equipment', doc: curse }]).source });
  const plain = runCombat([], { ...sturdy, source: aggregate(L, 'frost_lance', []).source });
  assert.ok(cursed.grants.some(g => g.target !== 'self'));
  assert.ok(cursed.total.damage > plain.total.damage, `${cursed.total.damage} > ${plain.total.damage}`);
});

test('附带持续时间: RuleHost holds rule grants on the holder and merges them into casts', () => {
  const host = new RuleHost();
  assert.ok(host.loadRuleLibrary(files).ok);
  const wrapper = sourceFromEntry(L, { id: 'timed_on_kill', params: { duration: 2 }, with: [{ id: 'fire_damage', params: { amount: 9 } }] });
  const base = aggregate(L, 'frost_lance', []).source;
  const { plan } = host.compileSource({ ...base, traits: [...base.traits, wrapper] });
  const grant = host.world.getPlan(plan).actions.find(a => a.grant);
  const request = { targetId: 77, entries: grant.grant.entries, key: grant.grant.key, duration: 2 };
  const id = host.grantFromRule(request);
  assert.equal(host.grantFromRule({ ...request, duration: 5 }), id, 'same wrapper + contents refreshes');
  assert.deepEqual(host.activeGrants(77).map(g => [g.label, g.traits, g.remaining]), [['附带持续时间·击杀后', ['fire_damage'], 5]]);
  const held = host.heldSources(77);
  assert.equal(held[0].params.get('amount'), 9);
  const merged = host.world.getPlan(host.planWithSources(plan, held));
  assert.ok(merged.traitIds.includes('fire_damage'));
  // Item-style grant of a wrapper keeps it separate from other wrappers with the same id.
  const g1 = host.grantTraits(77, [{ id: 'timed_on_kill', with: ['chill'] }], 3);
  const g2 = host.grantTraits(77, [{ id: 'timed_on_kill', with: ['lightning_damage'] }], 3);
  assert.ok(g1 > 0 && g2 > 0);
  assert.equal(host.heldSources(77).filter(s => s.id.startsWith('timed_on_kill')).length, 2);
});

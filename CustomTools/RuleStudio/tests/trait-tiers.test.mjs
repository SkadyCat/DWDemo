import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkRuleSet, parseCollection, serializeCollection, validateCollection, aggregate, compileBuild, sourceFromEntry,
  traitTierProfile, createTraitValueEntry, validateTraitValueEntry, buildTraitTierIndex, parseTraitTierCatalog,
  rollEquipmentAffix, equipmentAffixPool, equipmentRandom, rollEquipment, rerollWithCurrency, equipmentDocument,
  monsterTraitSources, parseMonsterTraits,
} from '../engine/index.mjs';
import { readRuleFiles } from '../scripts/rule-files.mjs';
import { runCombat } from '../public/combat.mjs';

const files = readRuleFiles(), check = checkRuleSet(files);
assert.ok(check.ok, check.error);
const { library, collections, tags } = check;

test('十阶数值: elemental and source selectors retain their existing identities at every tier', () => {
  for (const { source } of library.traits.values()) {
    if (!(source.sheet || []).some(e => ['extra_damage', 'convert_damage'].includes(e.trigger))) continue;
    for (let tier = 1; tier <= 10; tier++) {
      const entry = createTraitValueEntry(library, source.id, { tier, random: () => 1 });
      for (const key of ['source', 'element']) assert.equal(entry.params[key], source.params.get(key), `${source.id}.${key} T${tier}`);
    }
  }
  const bad = JSON.parse(files.find(f => f.path === 'Values/trait_tiers.json').text);
  bad.traits.void_extra_physical.params.element.tiers[9] = [6, 6];
  assert.match(buildTraitTierIndex(library, bad).error, /机制编号/);
});

test('十阶数值: every numeric trait has ten bands; mechanism-only traits have none', () => {
  let numeric = 0, flags = 0;
  for (const { source } of library.traits.values()) {
    const profile = traitTierProfile(library, source.id);
    if (!source.params.size) { assert.equal(profile, null); flags++; continue; }
    numeric++;
    assert.deepEqual(Object.keys(profile.params), [...source.params.keys()]);
    for (const [name, spec] of Object.entries(profile.params)) {
      assert.equal(spec.tiers.length, 10);
      const min = Math.min(...spec.tiers.flat()), max = Math.max(...spec.tiers.flat());
      if (Math.round((max - min) / spec.step) + 1 >= 10) {
        for (let i = 1; i < 10; i++) assert.ok(source.params.get(name) >= 0
          ? spec.tiers[i - 1][1] < spec.tiers[i][0] : spec.tiers[i - 1][0] > spec.tiers[i][1], `${source.id}.${name}: overlapping ranks`);
      }
    }
    for (let tier = 1; tier <= 10; tier++) for (const random of [() => 0, () => 1, equipmentRandom(tier)]) {
      const entry = createTraitValueEntry(library, source.id, { tier, random });
      assert.equal(entry.tier, tier); assert.equal(validateTraitValueEntry(library, entry), '', source.id);
    }
  }
  assert.ok(numeric > 700 && flags > 0);
  for (const id of ['pierce', 'ricochet', 'multiple_projectiles', 'cold_mastery', 'monster_bolt', 'monster_nova']) assert.ok(traitTierProfile(library, id));
  assert.equal(createTraitValueEntry(library, 'area_follow_target').tier, undefined);
  assert.throws(() => createTraitValueEntry(library, 'area_follow_target', { tier: 1 }), /没有数值/);
});

test('十阶数值: integer granularity may repeat without inflating the original range', () => {
  const p = traitTierProfile(library, 'pierce').params.count;
  assert.equal(p.step, 1); assert.equal(p.tiers[0][0], 1); assert.equal(p.tiers[9][1], 4);
  const values = new Set(p.tiers.flat());
  assert.ok(values.size < 10, 'ten ranks do not invent ten distinct integer counts');
  for (const tier of [0, 11, 1.5]) assert.throws(() => createTraitValueEntry(library, 'pierce', { tier }), /1–10/);
});

test('十阶数值: malformed and unknown catalogue fields are rejected; new traits get default bands', () => {
  const doc = { version: 1, tiers: 10, traits: { chill: { params: { slow: { step: 1, tiers: Array.from({ length: 10 }, () => [10, 20]) } } } } };
  assert.equal(buildTraitTierIndex(library, doc).error, '');
  const bad = value => parseTraitTierCatalog(value).error;
  assert.match(bad({ ...doc, tiers: 9 }), /10/);
  const malformed = structuredClone(doc); malformed.traits.chill.params.slow.tiers.pop();
  assert.match(bad(malformed), /10 阶/);
  malformed.traits.chill.params.slow.tiers.push([20, 10]); assert.match(bad(malformed), /最小值/);
  const unknown = structuredClone(doc); unknown.traits.missing = unknown.traits.chill; delete unknown.traits.chill;
  assert.match(buildTraitTierIndex(library, unknown).error, /未知特性/);
  const unknownParam = structuredClone(doc); unknownParam.traits.chill.params.missing = unknownParam.traits.chill.params.slow;
  assert.match(buildTraitTierIndex(library, unknownParam).error, /没有参数/);
  const changed = checkRuleSet(files.concat({ path: 'Affixes/new_tier_probe.json', text: JSON.stringify({ id: 'new_tier_probe', params: { n: 40 }, sheet: [{ stat: 'life.base', value: { param: 'n' } }] }) }));
  assert.ok(changed.ok, changed.error); assert.equal(traitTierProfile(changed.library, 'new_tier_probe').params.n.tiers.length, 10);
});

test('十阶数值: collections and nested stitched traits round-trip complete values and tier metadata', () => {
  const wrapper = createTraitValueEntry(library, 'timed_on_kill', { tier: 5, random: () => .5 });
  wrapper.with = [createTraitValueEntry(library, 'chill', { tier: 10, random: () => 1 })];
  const parsed = parseCollection('item', { id: 'tiered_test', name: '阶级集合', traits: [wrapper] });
  assert.ok(parsed.doc, parsed.error); assert.equal(validateCollection('item', parsed.doc, library).error, '');
  const roundTrip = parseCollection('item', serializeCollection('item', parsed.doc));
  assert.deepEqual(roundTrip.doc, parsed.doc);
  assert.equal(roundTrip.doc.traits[0].with[0].tier, 10);
  const source = sourceFromEntry(library, parsed.doc.traits[0]);
  assert.equal(source.tier, undefined); assert.equal(source.stitched[0].tier, undefined);
  assert.equal(source.stitched[0].params.get('slow'), wrapper.with[0].params.slow);
  assert.match(parseCollection('item', { id: 'x', traits: [{ id: 'chill', tier: 11 }] }).error, /tier/);
  assert.match(validateTraitValueEntry(library, { id: 'chill', tier: 1, params: {} }), /缺少实际参数/);
  assert.match(validateTraitValueEntry(library, { id: 'chill', tier: 1, params: { slow: 999, duration: 1 } }), /范围/);
});

test('十阶数值: low and high ranks aggregate into ordinary compiled stats and real damage', () => {
  const hits = [];
  for (const tier of [1, 10]) {
    const active = createTraitValueEntry(library, 'create_ice_lance', { tier, random: () => .5 });
    const skill = { id: 'tier_probe', active: 'create_ice_lance', traits: [{ id: 'create_ice_lance' }] };
    const agg = aggregate(library, skill, [{ kind: 'item', doc: { id: 'tiered_active', traits: [active] } }]);
    assert.ok(agg.source, agg.error);
    assert.ok(agg.source.traits.every(s => !Object.hasOwn(s, 'tier')));
    assert.equal(agg.contributions.find(c => c.status === 'on').tier, tier);
    assert.ok(compileBuild(agg.source).plan);
    const fight = runCombat([], { source: agg.source, layout: 'pack', count: 1, health: 100000, casts: 1, frames: 180, seed: 11 });
    assert.ok(!fight.error, fight.error); assert.ok(fight.total.damage > 0); hits.push(fight.total.damage);
  }
  assert.ok(hits[1] > hits[0] * 1.5, `${hits[0]} -> ${hits[1]}`);
});

test('十阶数值: drops and currency share profiles; compound affixes use one rank and fixed lines stay', () => {
  const random = equipmentRandom(73), pool = equipmentAffixPool(library), seen = new Set();
  for (let i = 0; i < 200; i++) {
    const a = rollEquipmentAffix(pool.find(x => x.id === 'shocking_hits'), random, library);
    seen.add(a.tier);
    for (const entry of a.traits) { assert.equal(entry.tier, a.tier); assert.equal(validateTraitValueEntry(library, entry), ''); }
  }
  assert.equal(seen.size, 10);
  const flags = rollEquipmentAffix(pool.find(x => x.id === 'area_follow_target'), random, library);
  assert.equal(flags.tier, undefined); assert.equal(flags.traits[0].tier, undefined);
  const item = rollEquipment(collections.equipment.get('stormband').doc, library, { random, rarity: 'rare', uid: 'tiered_test_instance' });
  const original = structuredClone(item), next = rerollWithCurrency(item, library, tags, { index: 0, random });
  assert.deepEqual(item, original); assert.deepEqual(next.affixes.slice(1), item.affixes.slice(1));
  const doc = equipmentDocument(next, collections);
  for (const entry of doc.traits) assert.equal(validateTraitValueEntry(library, entry), '');
  const parsed = parseCollection('equipment', serializeCollection('equipment', doc)); assert.ok(parsed.doc, parsed.error);
  assert.equal(validateCollection('equipment', parsed.doc, library).error, '');
});

test('十阶数值: authored catalogue controls future creation; saved params never reroll at aggregation', () => {
  const original = createTraitValueEntry(library, 'chill', { tier: 1, random: () => 0 });
  const file = files.find(f => f.path === 'Values/trait_tiers.json'), catalog = JSON.parse(file.text);
  catalog.traits.chill.params.slow.tiers[0] = [60, 60];
  const historical = { id: 'historical_tier_value', traits: [original] };
  const edited = checkRuleSet(files.map(f => f === file ? { ...file, text: JSON.stringify(catalog) } : f)
    .concat({ path: 'Items/historical_tier_value.json', text: JSON.stringify(historical) }));
  assert.ok(edited.ok, edited.error);
  assert.equal(createTraitValueEntry(edited.library, 'chill', { tier: 1 }).params.slow, 60);
  const source = sourceFromEntry(edited.library, original);
  assert.equal(source.params.get('slow'), original.params.slow);
  assert.equal(original.params.slow, 15);
  assert.equal(edited.collections.item.get(historical.id).doc.traits[0].params.slow, 15);
});

test('十阶数值: monster collection entries use the same value structure without runtime rank fields', () => {
  const created = createTraitValueEntry(library, 'life_base', { tier: 10, random: () => .5 });
  const entry = { id: created.id, params: created.params, tier: created.tier };
  const parsed = parseMonsterTraits([entry]); assert.equal(parsed.error, '');
  const result = monsterTraitSources(library, parsed.entries); assert.equal(result.error, '');
  assert.equal(result.sources[0].tier, undefined);
  assert.deepEqual(Object.fromEntries(result.sources[0].params), entry.params);
  assert.match(parseMonsterTraits([{ ...entry, tier: 11 }]).error, /1–10/);
});

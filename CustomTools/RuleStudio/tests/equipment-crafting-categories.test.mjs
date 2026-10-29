import test from 'node:test';
import assert from 'node:assert/strict';
import { readRuleFiles } from '../scripts/rule-files.mjs';
import { checkRuleSet, createProgression, equipmentRandom, equipmentAffixPool, rerollPool, omenFamily,
  affixFamilies, craftEquipment as genericCraft, AFFIX_CATEGORY_FILE } from '../engine/index.mjs';
import { rollEquipment, registerEquipmentDropLibrary, EQUIPMENT_DROP_CATEGORIES } from '../public/equipment-generation.mjs';
import { craftEquipment, equipmentCraftAffixPool } from '../public/equipment-crafting.mjs';

const files = readRuleFiles(), checked = checkRuleSet(files);
assert.ok(checked.ok, checked.error);
const { library, collections, tags, affixCategories } = checked;
registerEquipmentDropLibrary(files, library, affixCategories);
const pool = equipmentAffixPool(library), slots = [...Object.keys(EQUIPMENT_DROP_CATEGORIES), 'helmet', 'offhand'];
const grades = ['chaos_orb', 'spirit_stone_mid', 'spirit_stone_high'];
const clone = value => JSON.parse(JSON.stringify(value));
const fresh = (slot = 'ring', seed = 1) => {
  const state = createProgression(collections, library);
  const template = [...collections.equipment.values()].find(({ doc }) => doc.slot === slot && doc.rarity !== 'legendary').doc;
  state.instances.test = rollEquipment(template, library, { uid: 'test', tier: 7, rarity: 'legendary', random: equipmentRandom(seed) });
  for (const id of [...grades, 'quad_affix_orb']) state.owned.item[id] = 20;
  for (const { doc } of collections.item.values()) if (doc.category === 'omen') state.owned.item[doc.id] = 20;
  return state;
};
const craft = (state, options, c = collections, t = tags) => craftEquipment(state, 'test', { random: equipmentRandom(321), ...options }, c, library, t);
const assertAllowed = item => {
  const allowed = EQUIPMENT_DROP_CATEGORIES[item.slot];
  if (allowed) for (const affix of item.affixes) assert.ok(allowed.includes(affixCategories.categoryOf(affix.id, 'affix').category), `${item.slot}: ${affix.id}`);
};

test('网站洗炼池：所有部位和预兆均取交集，未指定部位不增加限制', () => {
  for (const slot of slots) for (const family of ['', ...tags.families.keys()]) {
    const allowed = EQUIPMENT_DROP_CATEGORIES[slot];
    const expected = rerollPool(library, tags, family).filter(affix => !allowed || allowed.includes(affixCategories.categoryOf(affix.id, 'affix').category));
    assert.deepEqual(equipmentCraftAffixPool(library, tags, slot, family), expected);
  }
});

test('网站洗炼：三档灵石与重复洗炼都遵守部位表，保留其他随机词条、固定设计和绑定', () => {
  for (const slot of slots) {
    const state = fresh(slot), original = clone(state.instances.test);
    for (const [grade, index] of [0, 1, 2, 0, 1, 2].entries()) {
      const before = clone(state.instances.test);
      const result = craft(state, { currencyId: grades[grade % 3], index });
      assert.ifError(result.error);
      assertAllowed(result.after);
      assert.deepEqual(result.changed, [index]);
      assert.deepEqual(result.after.affixes.filter((_, i) => i !== index), before.affixes.filter((_, i) => i !== index));
      assert.deepEqual(result.after.reforgeTargets, [0, 1, 2].slice(0, Math.min(3, grade + 1)));
      for (const key of ['bases', 'legendary', 'tier', 'skill', 'uid', 'rarity', 'slot']) assert.deepEqual(result.after[key], original[key]);
    }
    for (const id of grades) assert.equal(state.owned.item[id], 18);
  }
});

test('网站洗炼：真实预兆不能越过部位限制，当前存在的交集都能单条加工', () => {
  let combinations = 0;
  for (const slot of slots) for (const { doc } of collections.item.values()) {
    const family = omenFamily(tags, doc);
    if (!family || !equipmentCraftAffixPool(library, tags, slot, family).length) continue;
    const state = fresh(slot), before = clone(state);
    const result = craft(state, { currencyId: grades[0], omenId: doc.id, index: 0 });
    // Existing untouched affixes can exclude a tiny family pool; failure must be atomic.
    if (result.error) { assert.match(result.error, /词条.*不够|可用词条不足/); assert.deepEqual(state, before); continue; }
    assertAllowed(result.after);
    assert.ok(affixFamilies(tags, result.after.affixes[0]).includes(family));
    assert.equal(state.owned.item[doc.id], 19);
    assert.equal(state.owned.item[grades[0]], 19);
    combinations++;
  }
  assert.ok(combinations >= slots.length);
});

test('网站加工：陨星石重置与增缀共用部位交集，不回退完整池，保留固定词条', () => {
  const custom = { ...collections, item: new Map(collections.item) };
  custom.item.set('test_append', { doc: { id: 'test_append', category: 'currency', craft: { op: 'add_affixes', count: 4 } } });
  const omen = [...collections.item.values()].find(({ doc }) => omenFamily(tags, doc) === 'vitality').doc;
  for (const slot of slots) for (const currencyId of ['quad_affix_orb', 'test_append']) {
    const state = fresh(slot);
    state.owned.item.test_append = 2;
    state.instances.test.reforgeTargets = [0];
    const before = clone(state.instances.test);
    const result = craft(state, { currencyId, omenId: omen.id }, custom);
    assert.ifError(result.error);
    assertAllowed(result.after);
    assert.ok(result.changed.every(index => affixFamilies(tags, result.after.affixes[index]).includes('vitality')));
    assert.deepEqual(result.after.bases, before.bases);
    assert.deepEqual(result.after.legendary, before.legendary);
    if (currencyId === 'quad_affix_orb') {
      assert.equal(result.after.affixes.length, 4);
      assert.equal(result.after.reforgeTargets, undefined);
    } else {
      assert.deepEqual(result.after.affixes.slice(0, before.affixes.length), before.affixes);
      assert.equal(result.after.affixes.length, before.affixes.length + 4);
      assert.deepEqual(result.after.reforgeTargets, before.reforgeTargets);
    }
  }
});

test('网站加工：部位交集为空、数量不足或与保留词条冲突时，装备和所有材料均不变', () => {
  const custom = { ...collections, item: new Map(collections.item) };
  custom.item.set('omen_test', { doc: { id: 'omen_test', category: 'omen', tags: ['test'] } });
  const candidate = equipmentCraftAffixPool(library, tags, 'ring').find(affix => affix.traits.length === 1);
  for (const mode of ['empty', 'short', 'conflict']) {
    const state = fresh();
    state.owned.item.omen_test = 2;
    const trait = mode === 'empty' ? 'flat_lightning' : candidate.traits[0].id;
    const tiny = { familiesOf: id => id === trait ? ['test'] : [], collectionFamilies: () => ({ families: ['test'] }), familyName: () => '测试族' };
    if (mode === 'conflict') state.instances.test.affixes[1] = clone(candidate);
    const before = clone(state);
    const result = craft(state, { currencyId: mode === 'short' ? 'quad_affix_orb' : grades[0], omenId: 'omen_test', index: mode === 'short' ? null : 0, pool }, custom, tiny);
    assert.ok(result.error, mode);
    assert.deepEqual(state, before, mode);
  }
  // The authored elemental omen has only three defensive candidates: never fill the fourth from another pool.
  const chest = fresh('chest'), snapshot = clone(chest);
  assert.equal(equipmentCraftAffixPool(library, tags, 'chest', 'elemental').length, 3);
  assert.ok(craft(chest, { currencyId: 'quad_affix_orb', omenId: 'omen_elemental' }).error);
  assert.deepEqual(chest, snapshot);
});

test('网站洗炼：读取保存的人工分类，旧装备只重洗所选行，通用离线事务仍无部位政策', () => {
  const authored = JSON.parse(files.find(file => file.path === AFFIX_CATEGORY_FILE).text);
  authored.traits.flat_lightning = { category: 'special', reason: '验证洗炼使用保存的分类。' };
  const custom = checkRuleSet(files.map(file => file.path === AFFIX_CATEGORY_FILE ? { ...file, text: JSON.stringify(authored) } : file));
  assert.ok(custom.ok, custom.error);
  registerEquipmentDropLibrary([], custom.library, custom.affixCategories);
  assert.ok(equipmentCraftAffixPool(custom.library, custom.tags, 'ring').some(affix => affix.id === 'flat_lightning'));
  assert.ok(!equipmentCraftAffixPool(library, tags, 'ring').some(affix => affix.id === 'flat_lightning'));

  const state = fresh(), foreign = pool.find(affix => affixCategories.categoryOf(affix.id, 'affix').category === 'attack');
  state.instances.test.affixes[4] = clone(foreign);
  const original = clone(state.instances.test), seen = new Set();
  const result = craft(state, { currencyId: grades[0], index: 0 });
  assert.ifError(result.error);
  assert.deepEqual(result.after.affixes.slice(1), original.affixes.slice(1));
  assert.equal(affixCategories.categoryOf(result.after.affixes[0].id, 'affix').category, 'special');
  const random = equipmentRandom(93);
  state.owned.item[grades[0]] = 100;
  for (let i = 0; i < 50; i++) {
    const raw = genericCraft(state, 'test', { currencyId: grades[0], index: 0, random }, collections, library, tags);
    assert.ifError(raw.error);
    seen.add(affixCategories.categoryOf(raw.after.affixes[0].id, 'affix').category);
  }
  assert.deepEqual([...seen].sort(), ['attack', 'defense', 'special']);
});

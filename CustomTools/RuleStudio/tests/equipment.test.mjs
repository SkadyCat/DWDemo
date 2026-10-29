import test from 'node:test';
import assert from 'node:assert/strict';
import { readRuleFiles } from '../scripts/rule-files.mjs';
import { checkRuleSet, parseCollection, validateCollection, aggregate, compileBuild, validateTraitValueEntry } from '../engine/index.mjs';
import { equipmentRandom, equipmentAffixPool, rollEquipment, rerollEquipment, equipmentDocument, rollEquipmentDrop } from '../engine/equipment.mjs';

const loaded = checkRuleSet(readRuleFiles());
assert.ok(loaded.ok, loaded.error);
const { library, collections } = loaded;
const template = collections.equipment.get('frostthorn_staff').doc;

test('随机装备：普通无词条，魔法 1–2 条，稀有 3–6 条，每件单独生成', () => {
  const random = equipmentRandom(27);
  const counts = { magic: new Set(), rare: new Set() };
  const ids = new Set();
  for (let i = 0; i < 120; i++) for (const rarity of ['common', 'magic', 'rare']) {
    const item = rollEquipment(template, library, { rarity, random });
    const count = item.affixes.length;
    assert.ok(rarity === 'common' ? count === 0 : rarity === 'magic' ? count >= 1 && count <= 2 : count >= 3 && count <= 6);
    counts[rarity]?.add(count);
    assert.ok(!ids.has(item.uid)); ids.add(item.uid);
    assert.equal(item.skill, template.skills[0]);
    assert.equal(item.legendary, null);
  }
  assert.deepEqual([...counts.magic].sort(), [1, 2]);
  assert.deepEqual([...counts.rare].sort(), [3, 4, 5, 6]);
});

test('随机装备：词条池只引用已有规则，复合异常带有现有伤害前置', () => {
  const pool = equipmentAffixPool(library);
  const has = (entry, id) => entry.traits.some(t => t.id === id);
  const shock = pool.find(a => a.id === 'shocking_hits');
  assert.ok(has(shock, 'lightning_damage') && has(shock, 'shock'));
  for (const affix of pool) {
    const { doc, error } = parseCollection('item', { id: 'pool_probe', name: affix.name, category: 'material', traits: affix.traits });
    assert.ok(doc, error);
    assert.equal(validateCollection('item', doc, library).error, '', affix.id);
    assert.ok(affix.traits.every(t => library.trait(t.id)), affix.id);
  }
});

test('洗练：整件和单条均保留实例、绑定技能、品质及词条数量', () => {
  const random = equipmentRandom(112);
  const original = rollEquipment(template, library, { rarity: 'rare', random });
  const before = JSON.stringify(original);
  const all = rerollEquipment(original, library, { random });
  assert.equal(JSON.stringify(original), before, 'rerolls do not mutate their input');
  assert.equal(all.uid, original.uid); assert.equal(all.skill, original.skill); assert.equal(all.rarity, original.rarity);
  assert.equal(all.affixes.length, original.affixes.length);
  assert.notDeepEqual(all.affixes, original.affixes);
  const one = rerollEquipment(all, library, { random, index: 0 });
  assert.deepEqual(one.affixes.slice(1), all.affixes.slice(1));
  assert.throws(() => rerollEquipment(one, library, { index: -1 }), /随机词条/);
  assert.throws(() => rerollEquipment(rollEquipment(template, library, { rarity: 'common' }), library), /普通/);
});

test('随机装备：实例转换为现有构筑后可编译，同名物品的词条互不覆盖', () => {
  const random = equipmentRandom(92);
  for (let i = 0; i < 30; i++) {
    const item = rollEquipment(template, library, { rarity: 'rare', random });
    const doc = equipmentDocument(item, collections);
    assert.equal(doc.traits.length, [...(item.bases || []), ...item.affixes].reduce((n, a) => n + a.traits.length, 0));
    const result = aggregate(library, 'frost_lance', [{ kind: 'equipment', doc }], Infinity);
    assert.ok(result.source, result.error);
    const compiled = compileBuild(result.source);
    assert.ok(compiled.plan, compiled.error);
  }
});

test('掉落：概率为零不生成，成功使用单独的装备随机流', () => {
  assert.equal(rollEquipmentDrop(collections, library, { chance: 0 }), null);
  // Default drops carry their already rolled values.
  const drop = rollEquipmentDrop(collections, library, { random: () => 0.1, chance: 1, uid: 'test_drop' });
  assert.equal(drop.identified, true); assert.equal(drop.uid, 'test_drop'); assert.equal(drop.rarity, 'common'); assert.equal(drop.affixes.length, 0);
});

test('掉落等阶: each map cap bounds equipment and every numeric affix, while lower tiers remain available', () => {
  const random = equipmentRandom(541);
  for (let maxTier = 1; maxTier <= 10; maxTier++) {
    const seen = new Set();
    for (let i = 0; i < 80; i++) {
      const item = rollEquipmentDrop(collections, library, { chance: 1, maxTier, random });
      seen.add(item.tier);
      assert.ok(item.tier >= 1 && item.tier <= maxTier);
      const walk = entry => {
        if (entry.tier !== undefined) assert.ok(entry.tier >= 1 && entry.tier <= item.tier);
        assert.equal(validateTraitValueEntry(library, entry), '', entry.id);
        for (const child of entry.with || []) walk(child);
      };
      for (const affix of [...item.affixes, ...(item.legendary ? [item.legendary] : [])]) {
        if (affix.tier !== undefined) assert.ok(affix.tier <= item.tier);
        for (const entry of affix.traits) walk(entry);
      }
    }
    assert.deepEqual([...seen].sort((a, b) => a - b), Array.from({ length: maxTier }, (_, i) => i + 1));
  }
});

test('掉落等阶: explicit tier cannot bypass a map cap, including legendary values; invalid caps are rejected', () => {
  const pool = { equipment: new Map([[template.id, { doc: template }]]) };
  const item = rollEquipmentDrop(pool, library, { chance: 1, random: () => 1, tier: 10, maxTier: 3 });
  assert.equal(item.tier, 3); assert.equal(item.rarity, 'legendary');
  assert.equal(item.legendary.tier, 3);
  assert.ok(item.affixes.every(affix => affix.tier === undefined || affix.tier <= 3));
  for (const maxTier of [0, 11, 1.5, NaN]) assert.throws(() => rollEquipmentDrop(pool, library, { maxTier }), /T 阶/);
});

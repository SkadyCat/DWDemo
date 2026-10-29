import test from 'node:test';
import assert from 'node:assert/strict';
import { readRuleFiles } from '../scripts/rule-files.mjs';
import { checkRuleSet, equipmentAffixPool, rollEquipment, equipmentRandom, rerollPool } from '../engine/index.mjs';
import { AFFIX_CATEGORY_FILE, AFFIX_CATEGORIES, buildAffixCategoryIndex } from '../engine/affix-categories.mjs';
import { affixCategoryRows } from '../public/affix-category-view.mjs';
import { createAffixCategoryCatalog } from '../scripts/classify-affixes.mjs';

const files = readRuleFiles(), checked = checkRuleSet(files);
assert.ok(checked.ok, checked.error);
const { library, collections, tags, affixCategories: index } = checked;
const catalog = JSON.parse(files.find(file => file.path === AFFIX_CATEGORY_FILE).text);

test('词缀分类：全库和复合词条全部持久化，每条恰好一个用途标签，结果视图不重复不遗漏', () => {
  assert.deepEqual(AFFIX_CATEGORIES.map(row => row.name), ['攻击型', '防御型', '特殊型']);
  assert.deepEqual(index.missing, []); assert.deepEqual(index.stale, []);
  assert.deepEqual(createAffixCategoryCatalog(library, catalog), catalog);
  const rows = affixCategoryRows(library, collections, tags, index);
  const expected = new Set([...library.traits.keys(), ...equipmentAffixPool(library).map(row => row.id)]);
  assert.equal(rows.length, expected.size);
  assert.deepEqual(new Set(rows.map(row => row.id)), expected);
  assert.equal(rows.filter(row => row.rollable).length, equipmentAffixPool(library).length);
  for (const row of rows) { assert.ok(AFFIX_CATEGORIES.some(type => type.id === row.category), row.id); assert.ok(row.reason.trim(), row.id); }
  assert.equal(rows.filter(row => row.category === 'attack').length + rows.filter(row => row.category === 'defense').length + rows.filter(row => row.category === 'special').length, rows.length);
});

test('词缀分类：按最终效果区分血盾进攻、反击、暴击回复、触发与混合成长', () => {
  const cases = { flat_lightning: 'attack', frost_pen: 'attack', shield_added_lightning: 'attack', block_reflect_fire: 'attack', evasion_crit: 'attack',
    fire_resistance: 'defense', life_on_crit: 'defense', shield_on_crit: 'defense', shield_recharge_on_damaged: 'defense', poison_enemy_weaken: 'defense',
    minion_crit_your_mana: 'special', trigger_repeat: 'special', legendary_consumed_nova: 'special', grant_sacrifice: 'special', monster_tower_level: 'special' };
  for (const [id, category] of Object.entries(cases)) assert.equal(index.categoryOf(id)?.category, category, id);
  assert.equal(index.categoryOf('consume_lightning_nova', 'affix').category, 'special');
});

test('词缀分类：不污染特性族、预兆词条池或同种子的装备词条与数值', () => {
  const withoutMetadata = checkRuleSet(files.filter(file => file.path !== AFFIX_CATEGORY_FILE));
  assert.ok(withoutMetadata.ok, withoutMetadata.error);
  for (const [id] of tags.families) assert.deepEqual(rerollPool(library, tags, id), rerollPool(withoutMetadata.library, withoutMetadata.tags, id), id);
  assert.equal(tags.collectionFamilies(['攻击型', '防御型', '特殊型']).families.length, 0);
  for (const tier of [1, 5, 10]) {
    const a = rollEquipment(collections.equipment.get('frostthorn_staff').doc, library, { uid: 'same_roll', tier, rarity: 'rare', random: equipmentRandom(21) });
    const b = rollEquipment(withoutMetadata.collections.equipment.get('frostthorn_staff').doc, withoutMetadata.library, { uid: 'same_roll', tier, rarity: 'rare', random: equipmentRandom(21) });
    assert.deepEqual(a, b);
  }
});

test('词缀分类：分类文件校验有效类别与依据，允许独立人工调整', () => {
  for (const category of ['unknown', '', null]) {
    const bad = structuredClone(catalog); bad.traits.flat_lightning.category = category;
    assert.throws(() => buildAffixCategoryIndex(library, bad), /有效的 category/);
  }
  const missingReason = structuredClone(catalog); missingReason.traits.flat_lightning.reason = '';
  assert.throws(() => buildAffixCategoryIndex(library, missingReason), /分类依据/);
  const manual = structuredClone(catalog); manual.traits.flat_lightning = { category: 'special', reason: '设计者调整用途。' };
  assert.equal(buildAffixCategoryIndex(library, manual).categoryOf('flat_lightning').category, 'special');
  const badFile = files.map(file => file.path === AFFIX_CATEGORY_FILE ? { ...file, text: '{' } : file);
  assert.match(checkRuleSet(badFile).error, /affix_categories.json/);
});

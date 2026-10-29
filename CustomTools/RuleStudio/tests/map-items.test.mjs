import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as engine from '../engine/index.mjs';
import { readBaselineRuleFiles } from './rule-fixture.mjs';

const check = engine.checkRuleSet(readBaselineRuleFiles());
assert.ok(check.ok, check.error);
const config = JSON.parse(readFileSync(new URL('../../../Content/Rules/MapItems/catalog.json', import.meta.url), 'utf8'));

test('地图物品是独立分类，16 层各有普通、魔法和稀有模板', () => {
  assert.equal(engine.ITEM_CATEGORIES.find(c => c.id === 'map').name, '地图物品');
  const maps = [...check.collections.item.values()].map(e => e.doc).filter(d => d.category === 'map');
  assert.equal(maps.length, 48);
  for (let tier = 1; tier <= 16; tier++) for (const rarity of ['common', 'magic', 'rare']) {
    const doc = maps.find(d => d.tier === tier && d.rarity === rarity);
    assert.ok(doc, `${tier}/${rarity}`);
    assert.equal(doc.stack, 1);
    assert.deepEqual(doc.traits, []);
    assert.deepEqual(engine.parseCollection('item', engine.serializeCollection('item', doc)).doc, doc);
  }
});

test('地图模板拒绝越界层级、传奇品质、固定词缀和施放技能', () => {
  const map = { id: 'test_map', category: 'map', rarity: 'common', tier: 16, traits: [] };
  assert.equal(engine.parseCollection('item', map).error, '');
  for (const tier of [0, 17, 1.5, '16']) assert.ok(engine.parseCollection('item', { ...map, tier }).error);
  for (const rarity of ['legendary', 'unique']) assert.ok(engine.parseCollection('item', { ...map, rarity }).error);
  assert.ok(engine.parseCollection('item', { ...map, traits: ['map_monster_life'] }).error);
  assert.ok(engine.parseCollection('item', { ...map, skill: 'frost_lance' }).error);
  assert.ok(engine.parseCollection('item', { id: 'not_map', tier: 1 }).error);
});

test('地图专属词缀池支持稀有地图 6 条不重复词缀，沿用现有 sheet 统计项', () => {
  assert.deepEqual(Object.values(config.rarities).map(q => [q.minAffixes, q.maxAffixes]), [[0,0],[1,2],[3,6]]);
  assert.equal(new Set(config.affixes.map(a => a.id)).size, config.affixes.length);
  assert.ok(config.affixes.length >= 6);
  for (const affix of config.affixes) {
    assert.ok(check.library.trait(affix.id), affix.id);
    assert.ok(affix.id.startsWith('map_'));
    assert.ok(Number.isFinite(affix.min) && affix.min <= affix.max);
  }
});

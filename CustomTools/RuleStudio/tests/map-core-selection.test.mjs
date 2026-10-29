import test from 'node:test';
import assert from 'node:assert/strict';
import { readRuleFiles } from '../scripts/rule-files.mjs';
import { checkRuleSet } from '../engine/index.mjs';
import { TowerRun } from '../public/sim/dungeon-battle.mjs';
import { mapCoreChoices, selectedMapCore, configureMapCore, MAP_CORE_SAVE_KEY } from '../public/map-core-selection.mjs';
import { mapEquipmentPanel } from '../public/battle-panels.mjs';

const files = readRuleFiles(), check = checkRuleSet(files);
assert.ok(check.ok, check.error);
const choices = mapCoreChoices(check.collections, check.library);
const run = () => new TowerRun(files, { collections: check.collections, seed: 18 });

test('ten authored cores expose 0–900% through actual rule aggregation', () => {
  assert.equal(choices.length, 10);
  assert.deepEqual(choices.map(core => core.packs), Array.from({ length: 10 }, (_, i) => i * 100));
  assert.deepEqual(choices.map(core => core.tier), Array.from({ length: 10 }, (_, i) => i + 1));
  for (const core of choices) {
    const tower = run(); configureMapCore(tower, core.id);
    assert.equal(tower.battle.monsterCount, 1 + 19 * core.tier);
    const item = mapEquipmentPanel(tower.battle).equipment.find(item => item.slot === 'map');
    assert.equal(item.id, core.id); assert.equal(item.tier, core.tier);
    assert.deepEqual(item.affixes.map(row => row.text), [`怪物群 +${core.packs}%`, '地图召唤物气血 +0%', '地图召唤物伤害 +0%', '首领有 60% 概率掉落同级地图']);
  }
});

test('live selection preserves current actors and progress, updates later dungeons, and persists across floors', () => {
  const tower = run(), battle = tower.battle; battle.step(1 / 60);
  const actors = [...battle.monsters], kills = battle.kills, elapsed = battle.elapsed;
  const storage = { data: new Map(), getItem(key) { return this.data.get(key); }, setItem(key, value) { this.data.set(key, value); } };
  const last = choices.at(-1); configureMapCore(tower, last.id, storage);
  assert.equal(tower.battle, battle); assert.deepEqual(battle.monsters, actors);
  assert.equal(battle.elapsed, elapsed); assert.equal(battle.kills, kills);
  assert.deepEqual(battle.waveCounts, [190]);
  assert.equal(selectedMapCore(storage, check.collections), last.id);
  assert.equal(storage.getItem(MAP_CORE_SAVE_KEY), last.id);
  const authored = check.collections.equipment.get(last.id).doc;
  assert.notEqual(battle.map.equipment.map, authored);
  battle.phase = 'cleared'; assert.equal(tower.advance(), true);
  assert.equal(tower.battle.map.equipment.map.id, last.id);
  assert.equal(tower.battle.monsterCount, 191);
  assert.notEqual(tower.battle.map.equipment.map, battle.map.equipment.map);
});

test('a new selection respects the existing 300 monster cap and feeds the loot tier ceiling', () => {
  const tower = new TowerRun(files, { collections: check.collections, monsterCount: 300,
    seed: 18, rewards: { catalog: check.catalog } });
  configureMapCore(tower, choices.at(-1).id);
  assert.equal(tower.battle.monsterCount, 300);
  assert.equal(tower.battle.waveCounts.reduce((sum, value) => sum + value, 1), 300);
  assert.equal(tower.battle.rewards.maxTier, 10);
});

test('invalid or unavailable cores cannot change the equipped item or remembered selection', () => {
  const tower = run(), before = tower.battle.map.equipment.map.id;
  assert.throws(() => configureMapCore(tower, 'missing'), /有效的地图核心/);
  assert.throws(() => configureMapCore(tower, 'frostthorn_staff'), /有效的地图核心/);
  assert.equal(tower.battle.map.equipment.map.id, before);
  for (const value of ['missing', 'frostthorn_staff', null]) assert.equal(selectedMapCore({ getItem: () => value }, check.collections), before);
  const denied = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.equal(selectedMapCore(denied, check.collections), before);
  assert.doesNotThrow(() => configureMapCore(tower, choices[1].id, denied));
  assert.equal(tower.battle.map.equipment.map.id, choices[1].id);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '../engine/index.mjs';
import { readBaselineRuleFiles } from './rule-fixture.mjs';
import { cleanPlayerInventory } from '../public/player-storage.mjs';
import { applyBuildPreset } from '../public/build-presets.mjs';
import { Battle } from '../public/sim/battle.mjs';
import { FloorRewards } from '../engine/floor-rewards.mjs';

const files = readBaselineRuleFiles(), check = engine.checkRuleSet(files);
assert.ok(check.ok, check.error);
const { library, collections, catalog } = check;
const retired = ['gem_sentinel_ice_lance', 'gem_sentinel_lightning', 'gem_sentinel_fire_nova',
  'new_item_1', 'new_item_2', 'void_shard', 'rune_split', 'rune_ricochet'];

test('物品模型: retired categories and socket APIs are absent; new items use the current category model', () => {
  for (const category of ['gem', 'rune']) {
    assert.equal(engine.ITEM_CATEGORIES.some(row => row.id === category), false);
    assert.match(engine.parseCollection('item', { id: 'retired_category', category }).error, /category|类别/);
  }
  assert.equal(engine.emptyCollection('item').category, 'consumable');
  assert.equal(engine.parseCollection('item', { id: 'new_consumable' }).doc.category, 'consumable');
  for (const name of ['GEM_SLOTS', 'gemSlots', 'gemParts', 'changeGemSocket', 'validSkillGems', 'availableGems']) assert.equal(name in engine, false);
  for (const id of retired) assert.equal(collections.item.has(id), false, id);
  for (const entry of collections.item.values()) assert.ok(engine.ITEM_CATEGORIES.some(row => row.id === entry.doc.category));
});

test('存档清理: remove retired inventory and loadout fields while preserving equipment, skills, consumables and currency', () => {
  const state = engine.createProgression(collections, library);
  state.stones = 587; state.stats.kills = 42;
  state.owned.item = { frost_tonic: 3, chaos_orb: 5, ...Object.fromEntries(retired.map(id => [id, 2])) };
  state.loadout.belt = ['frost_tonic', 'rune_split'];
  state.loadout.gems = { frost_lance: ['void_shard', 'new_item_1'] };
  const before = structuredClone(state);
  cleanPlayerInventory(state, collections);
  assert.deepEqual(state.owned.item, { frost_tonic: 3, chaos_orb: 5 });
  assert.deepEqual(state.loadout, { skills: before.loadout.skills, equipment: before.loadout.equipment, belt: ['frost_tonic'] });
  for (const field of ['stones', 'instances', 'stats', 'progression']) assert.deepEqual(state[field], before[field]);
  const cleaned = structuredClone(state), loadout = state.loadout;
  cleanPlayerInventory(state, collections);
  assert.deepEqual(state, cleaned); assert.equal(state.loadout, loadout, 'unchanged cleanup must not trigger another reactive rebuild');
});

test('旧配装: removed socket data cannot affect a real cast, character pools or defense', () => {
  // Simulate a caller still holding an old in-memory collection, in addition to old save fields.
  const staleItem = { id: 'legacy_socket_item', name: '旧物品', category: 'gem', traits: [
    { id: 'multiple_projectiles', params: {}, duration: 0, with: [] },
    { id: 'life_base', params: { n: 200 }, duration: 0, with: [] },
    { id: 'frost_resistance', params: { resistance: 80 }, duration: 0, with: [] },
  ] };
  const staleCollections = { ...collections, item: new Map([...collections.item, [staleItem.id, { doc: staleItem }]]) };
  const b = new Battle(files, { collections: staleCollections, maxMonsters: 0, spawnRate: 0 });
  b.setLoadout({ skills: ['frost_lance'], gems: { frost_lance: Array(6).fill(staleItem.id) } });
  const baseline = new Battle(files, { collections, maxMonsters: 0, spawnRate: 0 }); baseline.setLoadout({ skills: ['frost_lance'] });
  assert.equal(b.host.plan(b.skills[0].plan).hash, baseline.host.plan(baseline.skills[0].plan).hash);
  assert.deepEqual(Object.keys(b.loadout), ['skills', 'equipment', 'belt', 'activeAuras', 'passives']);
  assert.deepEqual(b.loadout.passives, []);
  assert.equal(b.hero.maxHealth, baseline.hero.maxHealth);
  assert.ok(b.skills[0].contributions.every(row => row.kind === 'skill'));
  b.hero.casting = true; b.hero.castClock = 1 / b.hero.castsPerSecond; b.step(1 / 60);
  assert.equal(b.host.world.carriers.num, b.host.plan(b.skills[0].plan).stats.get(engine.EStat.ProjectileCount));
});

test('旧预设: unsupported fields are ignored and cannot grant removed items or recreate sockets', () => {
  const state = engine.createProgression(collections, library);
  const result = applyBuildPreset(state, { skills: ['frost_lance'], gems: { frost_lance: ['void_shard', 'rune_split'] } }, collections, library);
  assert.equal(result.error, '');
  assert.deepEqual(Object.keys(state.loadout), ['skills', 'equipment', 'belt']);
  assert.deepEqual(state.owned.item, {});
});

test('物品获取: global shop, normal drops, Boss drops and floor merchant only offer remaining item types', () => {
  const valid = id => collections.item.has(id) && !retired.includes(id);
  for (const listing of engine.listings(collections, catalog).filter(row => row.kind === 'item')) assert.ok(valid(listing.id));
  const rewards = new FloorRewards(collections, library, catalog, { equipmentChance: 0, itemChance: 1, merchantChance: 1, seed: 29 });
  for (let i = 0; i < 20; i++) rewards.onKill({ x: 0, y: 0, boss: false });
  rewards.onKill({ x: 0, y: 0, boss: true });
  assert.equal(rewards.remaining.filter(row => row.kind === 'item').length, 21);
  assert.ok(rewards.remaining.filter(row => row.kind === 'item').every(row => valid(row.id)));
  const stock = rewards.complete().stock.filter(row => row.kind === 'item');
  assert.equal(stock.length, 4); assert.ok(stock.every(row => valid(row.id)));
});

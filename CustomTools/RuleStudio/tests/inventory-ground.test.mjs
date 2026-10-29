import test from 'node:test';
import assert from 'node:assert/strict';
import { checkRuleSet, createProgression, rollEquipment, equipmentRandom } from '../engine/index.mjs';
import { FloorRewards } from '../engine/floor-rewards.mjs';
import { inventoryEntries } from '../public/battle-panels.mjs';
import { reconcileInventoryLayout, splitInventoryStack, reducePlacedStack } from '../public/inventory-layout.mjs';
import { readBaselineRuleFiles } from './rule-fixture.mjs';

const { collections, library, catalog } = checkRuleSet(readBaselineRuleFiles());
const hero = { x: 300, y: -200, dead: false };
const setup = () => ({ state: createProgression(collections, library), rewards: new FloorRewards(collections, library, catalog, { seed: 42 }) });

test('丢地面：已装备传奇保留完整实例；解除穿戴与技能资格，拾回不增加掉落统计或奖励', () => {
  const { state, rewards } = setup();
  const item = rollEquipment(collections.equipment.get('rime_thunder_annihilation_ring').doc, library, { uid: 'kept_ring', tier: 5, random: equipmentRandom(12) });
  item.reforgeTargets = [0, 2, 4];
  state.instances[item.uid] = item; state.loadout.equipment.ring = item.uid;
  const original = structuredClone(item), stats = structuredClone(state.stats), progression = structuredClone(state.progression);
  const result = rewards.dropInventory(state, { kind: 'equipment', id: item.uid }, hero);
  assert.deepEqual(result.drop.item, original); assert.equal(result.drop.origin, 'inventory');
  assert.equal(result.drop.sourceX, hero.x); assert.equal(result.drop.sourceY, hero.y);
  assert.ok(Math.hypot(result.drop.x - hero.x, result.drop.y - hero.y) < 100);
  assert.equal(state.instances[item.uid], undefined); assert.equal(state.loadout.equipment.ring, undefined);
  const afterDrop = structuredClone(state);
  assert.ok(rewards.dropInventory(state, { kind: 'equipment', id: item.uid }, hero).error);
  assert.deepEqual(state, afterDrop); assert.equal(rewards.remaining.length, 1);
  assert.ok(rewards.pickup(result.drop.key, state, hero).drop);
  assert.deepEqual(state.instances[item.uid], original);
  assert.deepEqual(state.stats, stats); assert.deepEqual(state.progression, progression);
  const picked = structuredClone(state); assert.ok(rewards.pickup(result.drop.key, state, hero).error); assert.deepEqual(state, picked);
  const weapon = state.instances.starter_weapon;
  const droppedWeapon = rewards.dropInventory(state, { kind: 'equipment', id: weapon.uid }, hero);
  assert.ok(droppedWeapon.drop); assert.equal(state.loadout.equipment.weapon, undefined);
  assert.ok(!state.loadout.skills.includes('frost_lance'));
});

test('丢地面：只移走指定拆分堆，其他格子与总数量守恒；拾取恢复实物', () => {
  const { state, rewards } = setup();
  state.owned.item.chaos_orb = 10; state.owned.item.frost_tonic = 1; state.loadout.belt = ['frost_tonic'];
  const entries = inventoryEntries(state, collections);
  const split = splitInventoryStack(null, entries, 'item:chaos_orb', 3);
  state.bagLayout = split.layout;
  const view = reconcileInventoryLayout(state.bagLayout, entries), pile = view.entries.find(row => row.key === split.key);
  const result = rewards.dropInventory(state, { kind: pile.kind, id: pile.id, count: pile.count }, hero);
  assert.equal(result.drop.count, 3); assert.equal(state.owned.item.chaos_orb, 7);
  state.bagLayout = reducePlacedStack(view.layout, pile.key, pile.count);
  const remaining = reconcileInventoryLayout(state.bagLayout, inventoryEntries(state, collections));
  assert.ok(!remaining.entries.some(row => row.key === pile.key));
  assert.equal(remaining.entries.find(row => row.id === 'chaos_orb').count, 7);
  assert.ok(rewards.pickup(result.drop.key, state, hero).drop); assert.equal(state.owned.item.chaos_orb, 10);
  const tonic = rewards.dropInventory(state, { kind: 'item', id: 'frost_tonic' }, hero);
  assert.equal(state.owned.item.frost_tonic, undefined); assert.ok(!state.loadout.belt.includes('frost_tonic'));
  assert.ok(rewards.pickup(tonic.drop.key, state, hero).drop); assert.equal(state.owned.item.frost_tonic, 1);
});

test('丢地面：未鉴定实例与未鉴定装备堆原样转移，消费/商店随机序列不受影响', () => {
  const { state, rewards } = setup(), control = setup().rewards;
  const pending = { uid: 'pending', baseId: 'frostthorn_staff', name: '未鉴定法杖', slot: 'weapon', rarity: 'rare', tier: 3, identified: false, affixes: [], bases: [], legendary: null, skill: '' };
  state.instances.pending = structuredClone(pending);
  const drop = rewards.dropInventory(state, { kind: 'equipment', id: 'pending' }, hero).drop;
  assert.deepEqual(drop.item, pending); assert.ok(rewards.pickup(drop.key, state, hero).drop);
  assert.deepEqual(state.instances.pending, pending);
  state.owned.equipment.frostthorn_staff = 4;
  const stack = rewards.dropInventory(state, { kind: 'equipment', id: 'frostthorn_staff', count: 3 }, hero).drop;
  assert.equal(stack.templateId, 'frostthorn_staff'); assert.equal(state.owned.equipment.frostthorn_staff, 1);
  assert.ok(rewards.pickup(stack.key, state, hero).drop); assert.equal(state.owned.equipment.frostthorn_staff, 4);
  assert.equal(rewards.random(), control.random()); assert.equal(rewards.merchantRandom(), control.merchantRandom());
});

test('丢地面：非法数量、技能、固定槽、死亡与无效坐标失败时不改背包或地面', () => {
  const { state, rewards } = setup(); state.owned.item.chaos_orb = 3;
  state.owned.equipment.map_core_equipment = 1;
  const before = structuredClone(state), nextId = rewards.nextId;
  for (const request of [
    ...[0, -1, 1.5, NaN, 4].map(count => ({ kind: 'item', id: 'chaos_orb', count })),
    { kind: 'item', id: 'missing' }, { kind: 'skill', id: 'frost_lance' },
    { kind: 'equipment', id: 'map_core_equipment' }, { kind: 'equipment', id: 'starter_weapon', count: 2 },
  ]) assert.ok(rewards.dropInventory(state, request, hero).error);
  assert.ok(rewards.dropInventory(state, { kind: 'item', id: 'chaos_orb' }, { ...hero, dead: true }).error);
  assert.ok(rewards.dropInventory(state, { kind: 'item', id: 'chaos_orb' }, { ...hero, x: NaN }).error);
  assert.deepEqual(state, before); assert.equal(rewards.remaining.length, 0); assert.equal(rewards.nextId, nextId);
});

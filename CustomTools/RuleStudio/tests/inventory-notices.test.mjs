import test from 'node:test';
import assert from 'node:assert/strict';
import { inventoryCounts, updateInventoryNotices, isInventoryNew, seeInventoryItem } from '../public/inventory-notices.mjs';
import { freshHideout } from '../public/hideout/model.mjs';
import { reconcileInventoryLayout, organizeInventory, splitInventoryStack } from '../public/inventory-layout.mjs';

const fresh = () => ({ owned: { equipment: {}, item: {}, skill: {} }, instances: {}, hideout: freshHideout(), newInventory: {} });
const row = (id, count = 1, kind = 'item') => ({ id, kind, count, key: `${kind}:${id}`, name: id, maxStack: 99 });

test('新获得的装备、道具与叠加数量高亮，失败/消费不提示；悬停后再获得可重新提示', () => {
  const state = fresh(); let previous = inventoryCounts(state);
  state.instances.loot = { uid: 'loot', affixes: [] }; state.owned.item.chaos = 3; state.owned.skill.frost_lance = true;
  let current = inventoryCounts(state); updateInventoryNotices(state, current, previous);
  assert.ok(isInventoryNew(state, row('loot', 1, 'equipment'))); assert.ok(isInventoryNew(state, row('chaos')));
  assert.ok(!isInventoryNew(state, row('frost_lance', 1, 'skill')));
  seeInventoryItem(state, row('chaos'));
  updateInventoryNotices(state, current, current); assert.ok(!isInventoryNew(state, row('chaos')));
  previous = current; state.owned.item.chaos--; current = inventoryCounts(state); updateInventoryNotices(state, current, previous);
  assert.ok(!isInventoryNew(state, row('chaos')));
  previous = current; state.owned.item.chaos++; current = inventoryCounts(state); updateInventoryNotices(state, current, previous);
  assert.ok(isInventoryNew(state, row('chaos')));
  previous = current; delete state.instances.loot; current = inventoryCounts(state); updateInventoryNotices(state, current, previous);
  assert.ok(!isInventoryNew(state, row('loot', 1, 'equipment')));
});

test('读档保留未查看标记，不将旧背包全标新；排序、拆分的格子使用原物品标记', () => {
  const state = fresh(); state.owned.item.chaos = 8; state.owned.item.old = 1; state.newInventory['item:chaos'] = true;
  const saved = JSON.parse(JSON.stringify(state)); updateInventoryNotices(saved, inventoryCounts(saved));
  assert.ok(isInventoryNew(saved, row('chaos'))); assert.ok(!isInventoryNew(saved, row('old')));
  const entries = [row('chaos', 8), row('old')], split = splitInventoryStack(null, entries, 'item:chaos', 3);
  let view = reconcileInventoryLayout(split.layout, entries);
  const pile = view.entries.find(i => i.key === split.key); assert.ok(isInventoryNew(saved, pile));
  seeInventoryItem(saved, pile); assert.ok(view.entries.every(i => !isInventoryNew(saved, i)));
  view = reconcileInventoryLayout(organizeInventory(view.layout, entries).layout, entries);
  assert.ok(view.entries.every(i => !isInventoryNew(saved, i)));
  updateInventoryNotices(saved, inventoryCounts(saved), inventoryCounts(state));
  assert.ok(view.entries.every(i => !isInventoryNew(saved, i)));
});

test('仓库、商家容器转移不伪造新获得；未查看提示在转移及刷新后仍可在背包消除', () => {
  const state = fresh(); state.owned.item.chaos = 5; state.instances.gear = { uid: 'gear' };
  state.newInventory['equipment:gear'] = true;
  const before = inventoryCounts(state), stash = state.hideout.stash, goods = state.hideout.merchant.inventory;
  stash.owned.item.chaos = 3; state.owned.item.chaos = 2;
  goods.instances.gear = state.instances.gear; delete state.instances.gear;
  const after = inventoryCounts(state); assert.deepEqual(after, before);
  updateInventoryNotices(state, after, before); assert.ok(!isInventoryNew(state, row('chaos')));
  state.instances.gear = goods.instances.gear; delete goods.instances.gear;
  updateInventoryNotices(state, inventoryCounts(state), after);
  assert.ok(isInventoryNew(state, row('gear', 1, 'equipment')));
  seeInventoryItem(state, row('gear', 1, 'equipment')); assert.deepEqual(state.newInventory, {});
});

test('鉴定同一实例、洗练和装备变化不会被当成新物品，也不读取词条或战斗数据', () => {
  const state = fresh(); state.instances.gear = { uid: 'gear', identified: false };
  const before = inventoryCounts(state);
  state.instances.gear.identified = true; state.instances.gear.affixes = [{ id: 'proj_count' }];
  state.loadout = { equipment: { ring: 'gear' } }; state.stats = { kills: 100 };
  const after = inventoryCounts(state); assert.deepEqual(after, before);
  updateInventoryNotices(state, after, before); assert.deepEqual(state.newInventory, {});
});

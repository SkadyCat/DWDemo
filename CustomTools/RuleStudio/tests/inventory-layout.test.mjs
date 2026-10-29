import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileInventoryLayout, inventoryGrid, characterInventoryGrid, moveInventoryStack, splitInventoryStack, organizeInventory, reducePlacedStack } from '../public/inventory-layout.mjs';
import { inventoryEntries } from '../public/battle-panels.mjs';
import { checkRuleSet, createProgression, craftEquipment, equipmentRandom } from '../engine/index.mjs';
import { readBaselineRuleFiles } from './rule-fixture.mjs';

const row = (id, count = 1, extra = {}) => ({ key: 'item:' + id, id, kind: 'item', name: id, count, maxStack: 99, ...extra });
const sum = layout => layout.slots.filter(Boolean).reduce((out, slot) => ({ ...out, [slot.ref]: (out[slot.ref] || 0) + slot.count }), {});

test('角色背包：筛选隐藏的物品不成为空格落点，移动后缺口与落点跨刷新保留',()=>{
  const entries=[row('sword',1,{kind:'equipment'}),row('currency',7),row('helmet',1,{kind:'equipment'})];
  const view=reconcileInventoryLayout(null,entries),visible=view.entries.filter(e=>e.kind==='equipment');
  const cells=characterInventoryGrid(view,visible);
  assert.equal(cells.length,36);assert.equal(cells.some(c=>c.index===1),false,'hidden occupied cell is never an empty target');
  const target=cells[20].index,result=moveInventoryStack(view.layout,entries,'item:sword',target);
  assert.equal(result.error,'');const saved=JSON.parse(JSON.stringify(result.layout));
  const reload=reconcileInventoryLayout(saved,entries),after=characterInventoryGrid(reload,reload.entries.filter(e=>e.kind==='equipment'));
  assert.equal(after.find(c=>c.index===0).item,null);assert.equal(after.find(c=>c.index===target).item.id,'sword');
  assert.equal(reload.layout.slots[1].ref,'item:currency');assert.deepEqual(sum(result.layout),sum(view.layout));
});

test('角色背包：当前页没有真实空位时，可放入新增的空格，不能越界或覆盖隐藏物品',()=>{
  const entries=Array.from({length:72},(_,i)=>row('entry-'+i,1,{kind:i===0?'equipment':'item'}));
  const view=reconcileInventoryLayout(null,entries),cells=characterInventoryGrid(view,[view.entries[0]]),target=cells.at(-1).index;
  assert.ok(target>=72);assert.notEqual(moveInventoryStack(view.layout,entries,view.entries[0].key,target).error,'');
  const result=moveInventoryStack(view.layout,entries,view.entries[0].key,target,{minimumCapacity:target+1});
  assert.equal(result.error,'');assert.equal(result.layout.slots[0],null);assert.equal(result.layout.slots[target].ref,entries[0].key);
  assert.deepEqual(sum(result.layout),sum(view.layout));assert.equal(result.layout.slots[1].ref,entries[1].key);
  assert.notEqual(moveInventoryStack(view.layout,entries,entries[0].key,10000,{minimumCapacity:10001}).error,'');
});

test('背包布局: old saves initialize lazily; empty-cell placement survives JSON reload and repeated reconciliation', () => {
  const entries = [row('chaos', 10), row('omen', 3)], before = structuredClone(entries);
  const initial = reconcileInventoryLayout(null, entries);
  const moved = moveInventoryStack(initial.layout, entries, 'item:chaos', 71);
  assert.equal(moved.error, ''); assert.equal(moved.layout.slots[0], null);
  assert.equal(moved.layout.slots[71].ref, 'item:chaos');
  const loaded = reconcileInventoryLayout(JSON.parse(JSON.stringify(moved.layout)), entries);
  assert.deepEqual(loaded.layout, moved.layout);
  assert.equal(inventoryGrid(loaded).cells[0], null); assert.equal(inventoryGrid(loaded).cells[71].count, 10);
  assert.deepEqual(reconcileInventoryLayout(loaded.layout, entries), loaded);
  assert.deepEqual(entries, before); assert.equal(initial.layout.slots[0].ref, 'item:chaos');
});

test('背包拖拽: different items swap; identical stacks merge only up to the authored limit', () => {
  const entries = [row('chaos', 110), row('omen', 2)];
  const view = reconcileInventoryLayout(null, entries);
  const swap = moveInventoryStack(view.layout, entries, 'item:chaos', 2);
  assert.equal(swap.layout.slots[0].ref, 'item:omen'); assert.equal(swap.layout.slots[2].count, 99);
  const split = splitInventoryStack(swap.layout, entries, 'item:chaos', 20);
  assert.equal(split.error, '');
  const merged = moveInventoryStack(split.layout, entries, split.key, 1);
  assert.equal(merged.error, ''); assert.equal(merged.layout.slots[1].count, 31);
  assert.ok(!merged.layout.slots[split.slotIndex]);
  assert.deepEqual(sum(merged.layout), { 'item:omen': 2, 'item:chaos': 110 });
  const capped = moveInventoryStack(merged.layout, entries, 'item:chaos', 1);
  assert.equal(capped.layout.slots[1].count, 99); assert.equal(capped.layout.slots[2].count, 11);
  assert.deepEqual(sum(capped.layout), sum(view.layout));
});

test('背包拆分: quantities and invalid requests never change ownership or the original placement', () => {
  const entries = [row('chaos', 10)], view = reconcileInventoryLayout(null, entries);
  const before = structuredClone(view.layout);
  const split = splitInventoryStack(view.layout, entries, 'item:chaos', 3);
  assert.equal(split.layout.slots[0].count, 7); assert.equal(split.layout.slots[1].count, 3);
  assert.notEqual(split.key, 'item:chaos'); assert.equal(entries[0].count, 10);
  assert.deepEqual(reconcileInventoryLayout(split.layout, entries).layout, split.layout, 'a split is not automatically merged');
  for (const amount of [0, -1, 10, 11, 1.5, NaN]) assert.ok(splitInventoryStack(view.layout, entries, 'item:chaos', amount).error);
  const gear = [row('gear', 1, { key: 'equipment:gear', kind: 'equipment', instance: true })];
  assert.ok(splitInventoryStack(null, gear, 'equipment:gear', 1).error);
  assert.ok(moveInventoryStack(view.layout, entries, 'missing', 0).error);
  assert.ok(moveInventoryStack(view.layout, entries, 'item:chaos', 72).error);
  assert.deepEqual(view.layout, before);
});

test('全局整理: splitting a full page opens another page; sorting merges and compacts all pages', () => {
  const entries = Array.from({ length: 72 }, (_, i) => row(String(i).padStart(2, '0'), i ? 1 : 10));
  const initial = reconcileInventoryLayout(null, entries);
  const split = splitInventoryStack(initial.layout, entries, 'item:00', 4);
  assert.equal(split.slotIndex, 72);
  const view = reconcileInventoryLayout(split.layout, entries);
  assert.equal(inventoryGrid(view, 1).cells[0].count, 4);
  const moved = moveInventoryStack(view.layout, entries, 'item:01', 143);
  assert.equal(reconcileInventoryLayout(moved.layout, entries).entries.find(item => item.id === '01').slotIndex, 143);
  const organized = organizeInventory(moved.layout, entries);
  assert.equal(organized.layout.slots.length, 72);
  assert.equal(inventoryGrid(reconcileInventoryLayout(organized.layout, entries), 1).pages, 1);
  assert.equal(organized.layout.slots[0].count, 10);
  assert.deepEqual(sum(organized.layout), sum(initial.layout));
  assert.deepEqual(organizeInventory(organized.layout, entries).layout, organized.layout, 'global sorting is stable');
});

test('背包同步: acquisition fills a real gap; consumption, sale and removal preserve unrelated positions', () => {
  let entries = [row('chaos', 10), row('omen', 3)];
  let layout = moveInventoryStack(null, entries, 'item:omen', 50).layout;
  layout = splitInventoryStack(layout, entries, 'item:chaos', 3).layout;
  entries = [row('chaos', 8), row('omen', 3), row('new', 2)];
  const next = reconcileInventoryLayout(layout, entries);
  assert.equal(next.entries.find(item => item.id === 'omen').slotIndex, 50);
  assert.deepEqual(sum(next.layout), { 'item:chaos': 8, 'item:new': 2, 'item:omen': 3 });
  const reduced = reducePlacedStack(next.layout, 'item:chaos');
  const afterSale = reconcileInventoryLayout(reduced, [row('chaos', 7), row('omen', 3), row('new', 2)]);
  assert.equal(afterSale.entries.find(item => item.key === 'item:chaos').count, 6);
  assert.equal(afterSale.entries.find(item => item.key.startsWith('stack:')).count, 1);
  const exhausted = reconcileInventoryLayout(afterSale.layout, [row('omen', 3), row('new', 2)]);
  assert.equal(exhausted.layout.slots[0], null);
  assert.equal(exhausted.entries.find(item => item.id === 'omen').slotIndex, 50);
});

test('背包数量守恒: moves, splits, merges, reloads and global sorting conserve all actual items', () => {
  const entries = [row('a', 200), row('b', 37), row('c', 8)];
  let layout = reconcileInventoryLayout(null, entries).layout;
  const expected = sum(layout);
  for (let i = 0; i < 150; i++) {
    const view = reconcileInventoryLayout(layout, entries), item = view.entries[i % view.entries.length];
    if (i % 7 === 0) layout = organizeInventory(layout, entries).layout;
    else if (item.count > 1 && i % 3 === 0) layout = splitInventoryStack(layout, entries, item.key, Math.floor(item.count / 2)).layout;
    else layout = moveInventoryStack(layout, entries, item.key, i * 17 % 72).layout;
    assert.deepEqual(sum(layout), expected);
    assert.equal(new Set(layout.slots.filter(Boolean).map(slot => slot.key)).size, layout.slots.filter(Boolean).length);
    layout = JSON.parse(JSON.stringify(layout));
    assert.deepEqual(reconcileInventoryLayout(layout, entries).layout, layout);
  }
});

test('背包加工: split currency still uses the actual shared total; crafting consumes one item without duplicating stacks', () => {
  const { library, collections, tags } = checkRuleSet(readBaselineRuleFiles());
  const state = createProgression(collections, library);
  state.owned.item.quad_affix_orb = 10;
  let entries = inventoryEntries(state, collections);
  const split = splitInventoryStack(null, entries, 'item:quad_affix_orb', 3);
  state.bagLayout = moveInventoryStack(split.layout, entries, split.key, 71).layout;
  assert.equal(state.owned.item.quad_affix_orb, 10);
  const result = craftEquipment(state, 'starter_weapon', { currencyId: 'quad_affix_orb', random: equipmentRandom(23) }, collections, library, tags);
  assert.equal(result.error, undefined); assert.equal(state.owned.item.quad_affix_orb, 9);
  entries = inventoryEntries(state, collections);
  const view = reconcileInventoryLayout(state.bagLayout, entries);
  assert.equal(view.entries.find(item => item.key === split.key).count, 2);
  assert.equal(view.entries.find(item => item.key === split.key).slotIndex, 71);
  assert.equal(sum(view.layout)['item:quad_affix_orb'], 9);
  assert.equal(state.instances.starter_weapon.affixes.length, 4);
});

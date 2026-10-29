import test from 'node:test';
import assert from 'node:assert/strict';
import { partitionInventory } from '../public/inventory-compartments.mjs';
import { reconcileInventoryLayout } from '../public/inventory-layout.mjs';

const gear = (id, equipped = false, count = 1) => ({ key: 'equipment:' + id, id, kind: 'equipment', slot: 'weapon', count, equipped, instance: count === 1 });
test('equip, replace, unequip and reload partition ownership without duplicate instances', () => {
  const first = gear('first'), next = gear('next'), material = { key: 'item:orb', kind: 'item', count: 8 };
  const entries = [first, next, material], original = structuredClone(entries);
  let view = partitionInventory(entries);
  let layout = reconcileInventoryLayout(null, view.ordinary).layout;
  first.equipped = true;
  view = partitionInventory(entries); layout = reconcileInventoryLayout(layout, view.ordinary).layout;
  assert.deepEqual(view.equipped.map(x => x.id), ['first']);
  assert.deepEqual(view.ordinary.map(x => x.key), ['equipment:next', 'item:orb']);
  assert.ok(!layout.slots.some(x => x?.ref === 'equipment:first'));
  first.equipped = false; next.equipped = true;
  view = partitionInventory(entries); layout = reconcileInventoryLayout(layout, view.ordinary).layout;
  assert.deepEqual(view.equipped.map(x => x.id), ['next']);
  assert.equal(view.ordinary.find(x => x.id === 'first').count, 1);
  next.equipped = false;
  const reloaded = partitionInventory(JSON.parse(JSON.stringify(entries)));
  assert.equal(reloaded.equipped.length, 0);
  assert.deepEqual(reloaded.ordinary, original);
  assert.equal(reconcileInventoryLayout(layout, reloaded.ordinary).entries.length, 3);
});
test('one worn template copy leaves spare copies in the ordinary bag; equipped skills remain there', () => {
  const stack = gear('template', true, 3), skill = { key: 'skill:ice', kind: 'skill', count: 1, equipped: true };
  const entries = [stack, skill], before = structuredClone(entries), view = partitionInventory(entries);
  assert.equal(view.equipped[0].count, 1); assert.equal(view.ordinary[0].count, 2);
  assert.equal(view.ordinary[0].equipped, false); assert.equal(view.ordinary[1], skill);
  assert.notEqual(view.ordinary[0].key, view.equipped[0].key);
  assert.deepEqual(entries, before);
});

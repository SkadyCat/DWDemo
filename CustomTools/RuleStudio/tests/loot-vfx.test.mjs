import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../public/vendor/three.module.js';
import { createLootMarkers } from '../public/prefabs/loot-markers.mjs';
import { FloorRewards } from '../engine/floor-rewards.mjs';
import { checkRuleSet } from '../engine/index.mjs';
import { readBaselineRuleFiles } from './rule-fixture.mjs';

const drop = { key: 'ground_1', sourceX: 7, sourceZ: -4, x: 7.7, z: -4.2, kind: 'equipment', rarity: 'legendary' };
const mesh = (fx, name) => fx.group.getObjectByName(name);
function position(fx, name, i = 0) {
  const matrix = new T.Matrix4(); mesh(fx, name).getMatrixAt(i, matrix);
  return new T.Vector3().setFromMatrixPosition(matrix);
}

test('actual currency and omen drops keep their grade through rolling and use matching mesh / beam colors distinct from equipment', () => {
  const check = checkRuleSet(readBaselineRuleFiles()); assert.ok(check.ok, check.error);
  const rewards = new FloorRewards(check.collections, check.library, check.catalog, { equipmentChance: 0, itemChance: 1 });
  const ids = ['chaos_orb', 'spirit_stone_mid', 'spirit_stone_high', 'quad_affix_orb', 'omen_proc'];
  const rows = ids.map(id => {
    const doc = check.collections.item.get(id).doc;
    rewards.itemPool = [doc];
    const item = rewards.onKill({ x: 0, y: 0 }).find(row => row.kind === 'item');
    assert.equal(item.category, doc.category); assert.equal(item.currencyGrade, doc.craft?.grade);
    return { ...item, key: id, sourceX: 0, sourceZ: 0, x: 1, z: 1 };
  });
  const fx = createLootMarkers(T), color = new T.Color(), scale = new T.Vector3();
  fx.update([...rows, { ...drop, rarity: 'rare' }], 0); fx.update([...rows, { ...drop, rarity: 'rare' }], 2);
  const colors = [], heights = [];
  for (let i = 0; i < rows.length; i++) {
    mesh(fx, 'Items').getColorAt(i, color); const itemColor = color.getHex(); colors.push(itemColor);
    mesh(fx, 'LootBeams').getColorAt(i, color); assert.equal(color.getHex(), itemColor);
    const matrix = new T.Matrix4(); mesh(fx, 'LootBeams').getMatrixAt(i, matrix);
    heights.push(scale.setFromMatrixScale(matrix).y);
  }
  assert.equal(new Set(colors).size, rows.length, 'three currency grades, special currency and omen have distinct palettes');
  assert.ok(heights[0] < heights[1] && heights[1] < heights[2], 'higher currency grades have taller beams');
  mesh(fx, 'Equipment').getColorAt(0, color); assert.equal(color.getHex(), 0xffd263);
  assert.ok(colors.every(value => value !== color.getHex()), 'material colors are independent of the equipment rarity');
  fx.dispose();
});

test('loot starts at the death position, rises, descends and settles at the actual pickup location before revealing its anchor', () => {
  const fx = createLootMarkers(T), input = structuredClone(drop);
  fx.update([drop], 10);
  const start = position(fx, 'Equipment');
  assert.equal(start.x, drop.sourceX); assert.equal(start.z, drop.sourceZ); assert.ok(start.y > .4);
  assert.equal(fx.anchor(drop.key), null); assert.equal(mesh(fx, 'LootBeams').count, 0);
  fx.update([drop], 10.3); const peak = position(fx, 'Equipment');
  assert.ok(peak.y > start.y + 1); assert.ok(peak.x > start.x && peak.x < drop.x);
  fx.update([drop], 10.65); assert.ok(position(fx, 'Equipment').y < peak.y);
  fx.update([drop], 12); const landed = position(fx, 'Equipment');
  assert.ok(Math.abs(landed.x - drop.x) < 1e-5 && Math.abs(landed.z - drop.z) < 1e-5);
  assert.ok(Math.abs(landed.y - .13) < 1e-5);
  assert.deepEqual(fx.anchor(drop.key), { x: drop.x, y: .2, z: drop.z });
  assert.equal(mesh(fx, 'LootBeams').count, 1); assert.deepEqual(drop, input); fx.dispose();
});

test('each death produces a local upward cluster; currency fragments land and expire without depending on a player position', () => {
  const fx = createLootMarkers(T), burst = { x: 8, z: -6, stones: 2, age: 0 };
  fx.update([], 0, [burst]); const count = mesh(fx, 'CoinBurst').count; assert.ok(count >= 5);
  for (let i = 0; i < count; i++) assert.ok(position(fx, 'CoinBurst', i).distanceTo(new T.Vector3(8, .48, -6)) < 1e-5);
  fx.update([], .25, [{ ...burst, age: .25 }]);
  for (let i = 0; i < count; i++) { const p = position(fx, 'CoinBurst', i); assert.ok(p.y > 1.2); assert.ok(Math.hypot(p.x - 8, p.z + 6) < 1.2); }
  fx.update([], 1.1, [{ ...burst, age: 1.1 }]);
  for (let i = 0; i < count; i++) assert.ok(Math.abs(position(fx, 'CoinBurst', i).y - .045) < 1e-5);
  fx.update([], 1.2, [{ ...burst, age: 1.2 }]); assert.equal(mesh(fx, 'CoinBurst').count, 0); fx.dispose();
});

test('pausing, adding a new drop and removing another do not replay or move an already landed item', () => {
  const fx = createLootMarkers(T), other = { ...drop, key: 'ground_2', kind: 'item', x: 6.5 };
  fx.update([drop], 0); fx.update([drop, other], .3);
  const paused = [...mesh(fx, 'Equipment').instanceMatrix.array]; fx.update([drop, other], .3);
  assert.deepEqual([...mesh(fx, 'Equipment').instanceMatrix.array], paused);
  fx.update([drop, other], 2); const settled = position(fx, 'Items');
  fx.update([other], 2.1); assert.ok(position(fx, 'Items').distanceTo(settled) < 1e-5);
  assert.equal(fx.anchor(drop.key), null); assert.ok(fx.anchor(other.key));
  fx.reset(); assert.equal(fx.anchor(other.key), null);
  fx.update([other], 0); assert.equal(fx.anchor(other.key), null); assert.ok(position(fx, 'Items').y > .4); fx.dispose();
});

test('loot batches stay bounded and finite under dense drops, and every shared resource is released exactly once', () => {
  const fx = createLootMarkers(T, 4), rows = Array.from({ length: 20 }, (_, i) => ({ ...drop, key: `drop_${i}`, kind: i % 2 ? 'item' : 'equipment' }));
  const resources = new Map();
  fx.group.traverse(o => { for (const resource of [o.geometry, o.material].filter(Boolean)) if (!resources.has(resource)) { resources.set(resource, 0); resource.addEventListener('dispose', () => resources.set(resource, resources.get(resource) + 1)); } });
  for (const time of [0, .2, .75, .9, 1, 20]) {
    fx.update(rows, time, Array.from({ length: 300 }, () => ({ x: 0, z: 0, stones: 50, age: .2 })));
    fx.group.traverse(o => { if (o.instanceMatrix) { assert.ok(o.count <= o.instanceMatrix.count); assert.ok(o.instanceMatrix.array.every(Number.isFinite)); } });
  }
  fx.update([], 21); fx.group.traverse(o => { if (o.isInstancedMesh) assert.equal(o.count, 0); });
  fx.dispose(); fx.dispose(); assert.equal(fx.group.children.length, 0);
  for (const times of resources.values()) assert.equal(times, 1);
});

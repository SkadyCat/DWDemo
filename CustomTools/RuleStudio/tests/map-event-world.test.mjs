import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { generateDungeon } from '../public/sim/dungeon.mjs';
import { dungeonMapEvents } from '../public/map-event-locations.mjs';

const source = (await readFile(new URL('../public/prefabs/dungeon-map-events.mjs', import.meta.url), 'utf8'))
  .replace("'/vendor/three.module.js'", JSON.stringify(new URL('../public/vendor/three.module.js', import.meta.url).href));
const { createDungeonMapEvents } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

test('地图奇遇实体与真实小地图描述一一对应，商人继续使用原有模型', () => {
  const scene = createDungeonMapEvents(), kinds = new Set();
  for (let seed = 1; seed <= 50; seed++) {
    const events = dungeonMapEvents(generateDungeon(seed, 3), '1:0');
    scene.update(events, 1);
    assert.deepEqual(scene.group.children.map(o => o.name).sort(), events.filter(e => e.kind !== 'shop').map(e => e.id).sort());
    for (const event of events.filter(e => e.kind !== 'shop')) {
      kinds.add(event.kind);
      const object = scene.group.children.find(o => o.name === event.id);
      assert.equal(object.position.x, event.x * .01); assert.equal(object.position.z, -event.y * .01);
      assert.ok(object.children.some(c => c.isMesh && c.geometry.type === 'CylinderGeometry'), 'has a visible stone pedestal');
    }
  }
  assert.equal(kinds.size, 4); scene.dispose(); assert.equal(scene.group.children.length, 0);
});

test('祭坛完成后实体保留并减弱光效，换图后释放旧实体资源', () => {
  const scene = createDungeonMapEvents(), event = { id: 'test-altar', kind: 'altar', x: 200, y: -400 };
  scene.update([event], 1); const object = scene.group.children[0];
  const gem = object.children.find(c => c.geometry?.type === 'OctahedronGeometry');
  assert.equal(gem.material.emissiveIntensity, .8);
  scene.update([{ ...event, completed: true }], 2);
  assert.equal(scene.group.children[0], object); assert.equal(gem.material.emissiveIntensity, .08);
  let disposed = 0; gem.geometry.addEventListener('dispose', () => disposed++);
  scene.update([{ id: 'merchant', kind: 'shop', x: 0, y: 0 }], 3);
  assert.equal(scene.group.children.length, 0); assert.equal(disposed, 1);
  scene.dispose(); assert.equal(disposed, 1);
});

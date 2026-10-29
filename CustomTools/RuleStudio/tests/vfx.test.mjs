import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../public/vendor/three.module.js';
import { modules, presets } from '../public/vfx/catalog.mjs';
import { createBattleEffects, observeBattle } from '../public/vfx/battle-effects.mjs';
import { Battle } from '../public/sim/battle.mjs';
import { checkRuleSet } from '../engine/index.mjs';
import { readBaselineRuleFiles } from './rule-fixture.mjs';

test('all VFX prefabs construct, update with finite geometry, and dispose idempotently', () => {
  assert.equal(Object.keys(modules).length, 41); assert.equal(presets.length, 56);
  for (const [id, module] of Object.entries(modules)) {
    const fx = module.createEffect(T);
    const resources = new Map();
    for (const element of module.meta.elements ?? [0]) for (const age of [0, .05, .3, .75, 3]) {
      fx.update(age, { element });
      fx.group.updateMatrixWorld(true);
      fx.group.traverse(o => {
        assert.ok(o.matrixWorld.elements.every(Number.isFinite), id);
        if (o.instanceMatrix) assert.ok(o.instanceMatrix.array.every(Number.isFinite), id);
        if (o.geometry) assert.ok(o.geometry.attributes.position.array.every(Number.isFinite), id);
        for (const resource of [o.geometry, o.material].filter(Boolean)) if (!resources.has(resource)) { resources.set(resource, 0); resource.addEventListener('dispose', () => resources.set(resource, resources.get(resource) + 1)); }
      });
    }
    fx.dispose(); fx.dispose(); assert.equal(fx.group.children.length, 0, id);
    for (const times of resources.values()) assert.equal(times, 1, `${id}: resource released exactly once`);
  }
});

test('VFX batches enforce capacity and clear empty inputs', () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({ x: i, y: 0, z: -i, radius: .3, dx: 0, dy: 0, dz: 0, vx: 0, vy: 0 }));
  for (const module of Object.values(modules).filter(m => m.createBatch)) {
    const fx = module.createBatch(T, 3); fx.update(rows, 2);
    fx.group.traverse(o => { if (o.isInstancedMesh) assert.ok(o.count <= o.instanceMatrix.count, module.meta.id); });
    fx.update([], 3); fx.group.traverse(o => { if (o.isInstancedMesh) assert.equal(o.count, 0, module.meta.id); }); fx.dispose();
  }
});

test('presentation observer preserves trace return, isolates errors, restores on detach', () => {
  const events = [], errors = [], original = function(...args) { events.push(args); return 42; }, world = { trace: original }, battle = { host: { world } };
  const detach = observeBattle(battle, () => { throw Error('bad VFX'); }, e => errors.push(e.message));
  assert.equal(world.trace('area', { radius: 2 }), 42); assert.equal(events.length, 1); assert.deepEqual(errors, ['bad VFX']);
  detach(); assert.equal(world.trace, original); detach();
});

test('VFX adapter leaves seeded battle damage, kills, statuses and projectiles unchanged', () => {
  const files = readBaselineRuleFiles(), check = checkRuleSet(files); assert.ok(check.ok, check.error);
  function run(enabled) {
    const battle = new Battle(files, { collections: check.collections, god: true, autoCast: true, seed: 17 });
    battle.setLoadout({ skills: ['frost_lance', 'player_slash', 'sentinel', 'spirit_servant'], equipment: { amulet: 'ember_amulet', ring: 'stormband' }, belt: [] });
    const events = [], prior = battle.host.world.trace;
    const trace = (kind, p) => { if (kind === 'damage') events.push([p.TargetExternalId, p.Amount, p.Element, p.bKilled]); prior(kind, p); };
    battle.host.world.trace = trace;
    const scene = new T.Scene(), fx = enabled ? createBattleEffects(T, scene, { capacity: 24 }) : null;
    fx?.update(battle);
    for (let i = 0; i < 600; i++) { if (i % 150 === 0) battle.select(i / 150); battle.step(1 / 60); fx?.update(battle); if (fx) assert.ok(fx.activeCount <= 24); }
    const snapshot = { events, kills: battle.kills, damage: battle.damageDealt, monsters: battle.monsters.map(m => [m.id, m.health, battle.monsterStatuses(m)]), projectiles: battle.projectiles() };
    assert.ok(events.length > 0);
    fx?.dispose(); fx?.dispose(); assert.equal(battle.host.world.trace, trace); assert.equal(scene.children.length, 0);
    return snapshot;
  }
  assert.deepEqual(run(true), run(false));
});

test('player ailments share the monster VFX and disappear on death or status expiry', () => {
  const files = readBaselineRuleFiles(), check = checkRuleSet(files); assert.ok(check.ok, check.error);
  const battle = new Battle(files, { collections: check.collections, maxMonsters: 0, spawnRate: 0, god: true });
  const fx = createBattleEffects(T, new T.Scene());
  battle.host.applyStatus(battle.heroTargetId, 'chill', 30, .2); fx.update(battle);
  const batch = fx.group.children.find(o => o.name === 'status-chill'); assert.ok(batch);
  assert.ok(batch.children[0].count > 0);
  battle.hero.dead = true; fx.update(battle); assert.equal(batch.children[0].count, 0);
  battle.hero.dead = false; fx.update(battle); assert.ok(batch.children[0].count > 0);
  for (let i = 0; i < 40; i++) battle.step(1 / 60);
  fx.update(battle); assert.equal(batch.children[0].count, 0);
  assert.equal(battle.monsterStatuses({ id: battle.heroTargetId }).length, 0);
  fx.dispose();
});

test('area visuals preserve actual ring/sector/line bounds and direction; switches release the old observer', () => {
  const world = { trace() {} }, original = world.trace;
  const zones = [{ effect: 'test', shape: 'sector', x: 1, y: 2, radius: 2, sectorRadius: 5.5, inner: 1, angle: 1.1, width: 1.7 }];
  const b = { host: { world }, elapsed: 0, projectiles: () => [], summons: () => [], monsters: [], combat: { zones: { zones, view: () => [] } } };
  const scene = new T.Scene(), fx = createBattleEffects(T, scene, { capacity: 4 }); fx.update(b);
  world.trace('area', { x: 1, y: 2, radius: 2, effect: 'test', shape: 'sector', element: 1, dir: .8 }); fx.update(b);
  const sector = fx.group.children.find(o => o.name === 'area-sector'); assert.ok(sector);
  assert.equal(sector.position.x, 1); assert.equal(sector.position.z, -2); assert.equal(sector.rotation.y, .8);
  assert.equal(sector.children[0].scale.x, 5.5); assert.equal(sector.children[0].material.uniforms.angle.value, 1.1);
  zones.push({ effect: 'ring', shape: 'ring', x: 0, y: 0, radius: 2, outer: 3, inner: .8 });
  world.trace('area', { x: 0, y: 0, radius: 2, effect: 'ring', shape: 'ring', element: 2 }); fx.update(b);
  const ring = fx.group.children.find(o => o.name === 'area-ring'); assert.equal(ring.children[0].scale.x, 3); assert.equal(ring.children[0].material.uniforms.inner.value, .8 / 3);
  zones.push({ effect: 'line', shape: 'line', x: 0, y: 0, radius: 1, width: 1.8, inner: 0 });
  world.trace('area', { x: 0, y: 0, radius: .9, length: 8, effect: 'line', shape: 'line', element: 3, dir: 1.2 }); fx.update(b);
  const line = fx.group.children.find(o => o.name === 'area-earth-wave'); assert.equal(line.children[0].scale.x, 8); assert.equal(line.children[0].scale.z, 1.8); assert.equal(line.rotation.y, 1.2);
  for (let i = 0; i < 300; i++) world.trace('area', { x: i, y: 0, radius: 1, element: 0 }); fx.update(b); assert.equal(fx.activeCount, 4);
  b.elapsed = 2; fx.update(b); assert.equal(fx.activeCount, 0);
  const second = { ...b, host: { world: { trace() {} } } }; fx.update(second); assert.equal(world.trace, original); assert.equal(fx.activeCount, 0); fx.dispose();
});

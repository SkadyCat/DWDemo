import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../public/vendor/three.module.js';
import { RuleHost, EEndReason, EOp, checkRuleSet } from '../engine/index.mjs';
import { newMod } from '../engine/combat/runtime.mjs';
import { readRuleFiles } from '../scripts/rule-files.mjs';
import { createBattleEffects } from '../public/vfx/battle-effects.mjs';
import * as hitPrefab from '../public/prefabs/projectile-hit.mjs';

const elements = ['fire', 'frost', 'lightning', 'physical', 'poison', 'void'];
function fixture({ kind = 'ice_lance', element = 'frost', damage = 20, team = 0, actions = null, modifiers = [] } = {}) {
  const host = new RuleHost();
  const loaded = host.loadRuleLibrary([
    { path: 'Traits/impact_test.json', text: JSON.stringify({ id: 'impact_test', modifiers, rules: [{ id: 'cast', event: 'cast',
      actions: actions || [{ op: 'emit', kind, element, speed: 20, lifetime: .5, radius: .2, damage }] }] }) },
    { path: 'Builds/impact_test.json', text: JSON.stringify({ id: 'impact_test', active: 'impact_test', traits: ['impact_test'] }) },
  ]);
  assert.ok(loaded.ok, loaded.error);
  const plan = host.compileNamedBuild('impact_test'); assert.ok(plan.plan >= 0, plan.error);
  const owner = host.registerOwner(111, team), events = [];
  host.world.trace = (type, data) => events.push({ type, ...data });
  const battle = { host, elapsed: 0, monsters: [], projectiles: () => [], summons: () => [] };
  const fx = createBattleEffects(T, new T.Scene(), { impactCapacity: 8 }); fx.update(battle);
  const cast = (target = null) => host.castBuild(plan.plan, owner, { x: 0, y: 0, z: 60 }, { x: 1, y: 0, z: 0 }, 0, null, target);
  function step(frames = 1, targets = [{ x: 300, y: 0, z: 60, id: 99 }]) {
    for (let frame = 0; frame < frames; frame++) {
      host.beginTargets();
      for (const t of targets) host.addTarget(t, 40, t.health ?? 1000, 1 - team, t.id);
      battle.elapsed += 1 / 60; host.stepFrame(1 / 60); fx.update(battle);
    }
  }
  return { host, battle, fx, events, cast, step };
}

test('all authored projectile kinds and six elements render impacts for both factions at the actual swept contact', () => {
  const check = checkRuleSet(readRuleFiles()); assert.ok(check.ok, check.error);
  const kinds = new Set([...check.library.traits.values()].flatMap(t => t.source.rules.flatMap(r => r.actions.filter(a => a.op === EOp.Emit).map(a => a.kind))));
  for (const kind of ['fireball', 'ice_lance', 'monster_bolt', 'poison_flask']) assert.ok(kinds.has(kind));
  for (const kind of [...kinds, 'future_projectile']) for (const [element, name] of elements.entries()) for (const team of [0, 1]) {
    const f = fixture({ kind, element: name, team }); f.cast();
    for (let frame = 0; frame < 30 && !f.fx.impactCount; frame++) f.step();
    const contact = f.events.find(e => e.type === 'projectile_hit'); assert.ok(contact, `${kind} ${name} ${team}`);
    assert.equal(contact.kind, kind); assert.equal(contact.element, element); assert.equal(contact.targetId, 99); assert.equal(contact.ownerId, 111);
    assert.equal(contact.surface, 'unit'); assert.equal(f.fx.impactCount, 1);
    assert.ok(Math.abs(contact.x - 2.4) < .01, 'swept contact is in front of the target center');
    assert.ok(Math.abs(contact.z - .6) < .001);
    const batch = f.fx.group.children.find(g => g.name === 'projectile-hit'), contactMark = batch.children.at(-1);
    const matrix = new T.Matrix4(); contactMark.getMatrixAt(0, matrix);
    assert.ok(Math.abs(matrix.elements[12] - contact.x) < 1e-5);
    assert.ok(Math.abs(matrix.elements[13] - contact.z) < 1e-5);
    assert.ok(Math.abs(matrix.elements[14] + contact.y) < 1e-5);
    assert.equal(contactMark.geometry.getAttribute('impactStyle').getX(0), element);
    assert.ok(!f.fx.group.children.some(g => g.name === 'element-hit'), 'the base projectile damage does not add a duplicate generic flash');
    f.fx.dispose();
  }
});

test('absorbed hits and utility projectiles still flash; evaded contacts do not', () => {
  for (const scenario of ['absorbed', 'zero', 'evaded']) {
    const f = fixture({ damage: scenario === 'zero' ? 0 : 20 });
    if (scenario === 'absorbed') f.host.world.damageHook = () => ({ ...newMod(), adjust: () => 0 });
    if (scenario === 'evaded') f.host.world.damageHook = () => ({ miss: true });
    f.cast(); f.step(12);
    const impacts = f.events.filter(e => e.type === 'projectile_hit');
    assert.equal(impacts.length, scenario === 'evaded' ? 0 : 1, scenario);
    assert.equal(f.fx.impactCount, impacts.length);
    if (impacts.length) assert.equal(impacts[0].amount, 0);
    f.fx.dispose();
  }
});

test('piercing produces an impact at each enemy instead of only when the carrier ends', () => {
  const f = fixture({ modifiers: [{ target: 'projectile', stat: 'pierce', op: 'add', value: 1 }],
    actions: [{ op: 'emit', kind: 'ice_lance', element: 'frost', speed: 20, lifetime: .6, radius: .2, damage: 20 }] });
  f.cast(); f.step(27, [{ x: 300, y: 0, z: 60, id: 99 }, { x: 500, y: 0, z: 60, id: 100 }]);
  assert.deepEqual(f.events.filter(e => e.type === 'projectile_hit').map(e => e.targetId), [99, 100]);
  assert.equal(f.fx.impactCount, 2); f.fx.dispose();
});

test('refracted secondary carriers use the same hit presentation without an authored spawn listener', () => {
  const f = fixture({ modifiers: [
    { target: 'projectile', stat: 'refraction_count', op: 'add', value: 2 },
    { target: 'projectile', stat: 'refraction_angle', op: 'set', value: 40 },
  ] });
  f.cast(); f.step(28, [{ x: 300, y: 0, z: 60, id: 99 }, { x: 500, y: 100, z: 60, id: 100 }, { x: 500, y: -100, z: 60, id: 101 }]);
  const impacts = f.events.filter(e => e.type === 'projectile_hit');
  assert.deepEqual(impacts.map(e => e.targetId).sort((a, b) => a - b), [99, 100, 101]);
  assert.equal(new Set(impacts.map(e => e.id)).size, 3); assert.equal(f.fx.impactCount, 3); f.fx.dispose();
});

test('wall impact and parabolic landing flash without an enemy; normal expiry and capacity cleanup stay silent', () => {
  const wall = fixture(); wall.host.world.sweepObstacle = (sx, sy, ex) => sx < 2 && ex >= 2 ? (2 - sx) / (ex - sx) : -1;
  wall.cast(); wall.step(30, []);
  const wallHits = wall.events.filter(e => e.type === 'projectile_hit'); assert.equal(wallHits.length, 1); assert.equal(wallHits[0].surface, 'wall');
  assert.ok(Math.abs(wallHits[0].x - 2) < .001); wall.fx.dispose();
  const landing = fixture({ actions: [{ op: 'emit', kind: 'poison_flask', element: 'poison', damage: 0,
    trajectory: 'parabolic', arc_height: 1, speed: 10, lifetime: .4, radius: .15 }] });
  landing.cast({ x: 300, y: 0, z: 0 }); landing.step(30, []);
  const ground = landing.events.filter(e => e.type === 'projectile_hit'); assert.equal(ground.length, 1); assert.equal(ground[0].surface, 'ground');
  assert.ok(Math.abs(ground[0].x - 3) < .01); assert.ok(Math.abs(ground[0].z - .15) < .01, 'landing carrier center stays one collision radius above the floor'); assert.ok(landing.fx.impactCount > 0); landing.fx.dispose();
  const expired = fixture(); expired.cast(); expired.step(60, []); assert.equal(expired.events.filter(e => e.type === 'projectile_hit').length, 0); expired.fx.dispose();
  const cleanup = fixture(); cleanup.cast(); cleanup.step(1, []); cleanup.host.world.endProjectile(0, EEndReason.Capacity);
  assert.equal(cleanup.events.filter(e => e.type === 'projectile_hit').length, 0); cleanup.fx.dispose();
});

test('impact positions survive killed-target removal and the batch expires, rebinds and caps dense hits', () => {
  const f = fixture(); f.cast(); f.step(12, [{ x: 300, y: 0, z: 60, id: 99, health: 1 }]); assert.equal(f.fx.impactCount, 1);
  assert.ok(f.events.some(e => e.type === 'damage' && e.bKilled));
  f.host.beginTargets(); f.fx.update(f.battle); assert.equal(f.fx.impactCount, 1, 'no live target lookup needed');
  for (let i = 0; i < 1000; i++) f.host.world.trace('projectile_hit', { id: i, x: i / 100, y: 0, z: .6, dx: 1, dy: 0, dz: 0, element: i % 6, radius: .2, surface: 'unit' });
  f.fx.update(f.battle); assert.equal(f.fx.impactCount, 8);
  f.battle.phase = 'cleared'; f.fx.update(f.battle, f.battle.elapsed); f.fx.update(f.battle, f.battle.elapsed + 1);
  for (let i = 0; i < 6; i++) f.fx.update(f.battle, f.battle.elapsed + 2 + i / 10);
  assert.equal(f.fx.impactCount, 0, 'post-combat tail clears hits while simulation time is frozen');
  const next = fixture(); f.fx.update(next.battle); assert.equal(f.fx.impactCount, 0); f.fx.dispose(); next.fx.dispose();
});

test('six independent impact profiles have finite bounded batches and support arbitrary-time preview', () => {
  const effect = hitPrefab.createBatch(T, 3);
  for (let element = 0; element < 6; element++) for (const age of [0, .04, .15, .4, 1]) {
    effect.update(Array.from({ length: 20 }, (_, i) => ({ x: i, y: .6, z: 0, dx: i % 2 ? -1 : 1, dy: 0, dz: 0, age, element })));
    assert.ok(effect.group.children.at(-1).count <= 3);
    effect.group.traverse(o => { if (o.instanceMatrix) assert.ok(o.instanceMatrix.array.every(Number.isFinite)); });
  }
  effect.update([]); assert.ok(effect.group.children.every(m => m.count === 0)); effect.dispose(); effect.dispose();
});

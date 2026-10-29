import test from 'node:test';
import assert from 'node:assert/strict';
import { RuleHost, readTraitText, compileBuild, newBuild, EEndReason, Projectiles, EOp } from '../engine/index.mjs';
import { describeAction } from '../public/plan-view.mjs';

const dt = 1 / 60;
const near = (a, b) => assert.ok(Math.abs(a - b) < .002, `${a} != ${b}`);
const emit = (props = {}) => ({ op: 'emit', kind: 'generic_lob', trajectory: 'parabolic', arc_height: 1.5,
  lifetime: .573, speed: 12, radius: .16, damage: 8, element: 'fire', ...props });
const document = (actions, modifiers = []) => ({ id: 'generic_throw', modifiers, rules: [{ id: 'launch', event: 'cast', actions }] });
function fixture({ actions = [emit()], modifiers = [], origin = { x: 60, y: 0, z: 60 }, target = { x: 1000, y: 0, z: 0 } } = {}) {
  const host = new RuleHost();
  assert.ok(host.loadRuleLibrary([
    { path: 'Traits/generic_throw.json', text: JSON.stringify(document(actions, modifiers)) },
    { path: 'Builds/generic_throw.json', text: JSON.stringify({ id: 'generic_throw', active: 'generic_throw', traits: ['generic_throw'] }) },
  ]).ok);
  const compiled = host.compileNamedBuild('generic_throw'); assert.ok(compiled.plan >= 0, compiled.error);
  const owner = host.registerOwner(1, 0), ended = [], samples = [], hits = [];
  host.world.endHook = (index, reason) => {
    const c = host.world.carriers;
    ended.push({ x: c.px[index], y: c.py[index], z: c.pz[index], reason, age: c.age[index], kind: c.kind[index] });
    return false;
  };
  const root = host.castBuild(compiled.plan, owner, origin, { x: 1, y: 0, z: 0 }, 0, null, target);
  const tick = (frames = 90, targets = []) => {
    for (let frame = 0; frame < frames; frame++) {
      host.beginTargets();
      for (const t of targets) host.addTarget(t, t.radius ?? 10, 10000, 1, t.id);
      hits.push(...host.stepFrame(dt));
      const c = host.world.carriers;
      for (let i = 0; i < c.num; i++) samples.push({ x: c.px[i], y: c.py[i], z: c.pz[i], kind: c.kind[i], parabolic: !!(c.flags[i] & Projectiles.Parabolic) });
    }
  };
  return { host, root, ended, samples, hits, tick, plan: host.world.plans[compiled.plan] };
}

test('抛物线规则: emit validates trajectory / arc height and the plan exposes the generic configuration', () => {
  for (const action of [emit({ trajectory: 'unknown' }), { ...emit(), op: 'damage_area' }, emit({ trajectory: 'linear' })]) {
    assert.ok(readTraitText(JSON.stringify(document([action]))).error);
  }
  const parsed = readTraitText(JSON.stringify(document([emit()]))); assert.ifError(parsed.error || null);
  const a = compileBuild(newBuild(parsed.trait.id, [parsed.trait])); assert.ok(a.plan, a.error);
  const straight = readTraitText(JSON.stringify(document([{ op: 'emit', kind: 'generic_lob', lifetime: .573, speed: 12, radius: .16, damage: 8, element: 'fire' }]))).trait;
  const b = compileBuild(newBuild(straight.id, [straight]));
  assert.notEqual(a.plan.hash, b.plan.hash, 'linear and parabolic variants must not share a cached plan');
  const view = describeAction(a.plan, a.plan.actions.findIndex(action => action.op === EOp.Emit));
  assert.equal(view.trajectory, 'parabolic'); assert.equal(+view.fields.arc_height, 1.5);
});

test('抛物线规则: generic fire projectiles rise and land exactly on arbitrary selected world points', () => {
  for (const [x, y] of [[300, 150], [1000, -800], [-700, 550], [60, 0]]) {
    const f = fixture({ target: { x, y, z: 0 } }); f.tick();
    assert.equal(f.ended.length, 1); const end = f.ended[0];
    near(end.x, x / 100); near(end.y, y / 100); near(end.z, .16);
    assert.equal(end.reason, EEndReason.Expired);
    assert.ok(Math.max(...f.samples.map(row => row.z)) > 1.8);
    assert.equal(f.host.world.activeRoots(), 0);
  }
});

test('抛物线规则: target coordinates are snapshotted and speed modifiers change duration without moving the landing point', () => {
  const target = { x: 750, y: 250, z: 0 };
  const fast = fixture({ target, modifiers: [{ target: 'projectile', stat: 'speed', op: 'multiply', value: 2 }] });
  target.x = -5000; target.y = 5000;
  fast.tick();
  near(fast.ended[0].x, 7.5); near(fast.ended[0].y, 2.5);
  assert.ok(fast.ended[0].age < .32, 'expiry is observed on the next fixed simulation step');
  const normal = fixture({ target: { x: 750, y: 250, z: 0 } }); normal.tick();
  assert.ok(normal.ended[0].age > .57);
});

test('抛物线规则: real height clears low targets and the last partial step cannot hit beyond the landing point', () => {
  const f = fixture();
  f.tick(90, [{ x: 500, y: 0, z: 60, radius: 35, id: 101 }, { x: 1040, y: 0, z: 16, radius: 10, id: 102 }]);
  assert.equal(f.hits.length, 0);
  near(f.ended[0].x, 10);
  assert.equal(f.ended[0].reason, EEndReason.Expired);
  const impact = fixture({ actions: [emit({ arc_height: 0 })] });
  impact.tick(90, [{ x: 500, y: 0, z: 40, radius: 35, id: 103 }]);
  assert.ok(impact.hits.some(row => row.TargetExternalId === 103 && row.Amount > 0));
  assert.equal(impact.ended[0].reason, EEndReason.Impact);
  assert.ok(impact.ended[0].x < 5, 'impact ends at the contact rather than beyond the target');
});

test('抛物线规则: a wall intercepts the actual arc and unrelated emit actions keep their straight trajectory', () => {
  const wall = fixture(); wall.host.world.sweepObstacle = (sx, sy, ex) => sx < 4 && ex >= 4 ? (4 - sx) / (ex - sx) : -1;
  wall.tick(); near(wall.ended[0].x, 4); assert.ok(wall.ended[0].z > 1);
  assert.equal(wall.ended[0].reason, EEndReason.Impact);
  const mixed = fixture({ actions: [emit(), { op: 'emit', kind: 'ordinary_bolt', speed: 12, lifetime: .573, radius: .16, damage: 1, element: 'frost' }], target: { x: 1000, y: 500, z: 0 } });
  mixed.tick();
  const ordinary = mixed.samples.filter(row => !row.parabolic);
  assert.ok(ordinary.length > 0); assert.ok(ordinary.every(row => Math.abs(row.z - .6) < .001 && Math.abs(row.y) < .001));
  const end = mixed.ended.find(row => row.kind === mixed.plan.findKind('generic_lob'));
  near(end.x, 10); near(end.y, 5);
});

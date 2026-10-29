import test from 'node:test';
import assert from 'node:assert/strict';
import { readBaselineRuleFiles } from './rule-fixture.mjs';
import { RuleHost, aggregate, checkRuleSet, EElement, INDEX_NONE } from '../engine/index.mjs';
import { Battle } from '../public/sim/battle.mjs';

function fixture({ shocked = [1], duration = 10, health = 10, params = {} } = {}) {
  const files = readBaselineRuleFiles();
  const check = checkRuleSet(files); assert.ok(check.ok, check.error);
  const host = new RuleHost(); assert.ok(host.loadRuleLibrary(files).ok);
  const source = aggregate(check.library, 'frost_lance', [{ kind: 'equipment', doc: { traits: [{ id: 'death_lightning', params }] } }]).source;
  const compiled = host.compileSource(source); assert.notEqual(compiled.plan, INDEX_NONE, compiled.error);
  const owner = host.registerOwner(100, 0);
  host.updateOwner(owner, { x: 0, y: 0, z: 60 }, { x: 1, y: 0, z: 0 });
  const targets = [
    { id: 1, x: 400, y: 0, health, team: 1 },
    { id: 2, x: 200, y: 200, health: 200, team: 1 },
    { id: 3, x: 300, y: 200, health: 200, team: 1 },
    { id: 4, x: 800, y: 400, health: 200, team: 1 },
    { id: 5, x: 200, y: 100, health: 200, team: 0 },
  ];
  const rows = [], areas = [], strikes = [];
  host.world.trace = (kind, data) => {
    if (kind === 'area') areas.push({ ...data, time: host.world.clock });
    if (kind === 'storm_target') strikes.push({ ...data, time: host.world.clock });
  };
  for (const id of shocked) host.applyStatus(id, 'shock', 20, duration);
  const cast = () => host.castBuild(compiled.plan, owner, { x: 0, y: 0, z: 60 }, { x: 1, y: 0, z: 0 });
  const step = (frames = 1) => {
    for (let frame = 0; frame < frames; frame++) {
      host.beginTargets();
      for (const t of targets) if (t.health > 0) host.addTarget({ x: t.x, y: t.y, z: 60 }, 20, t.health, t.team, t.id);
      for (const row of host.stepFrame(1 / 60)) {
        rows.push(row);
        const target = targets.find(t => t.id === row.TargetExternalId);
        if (target) target.health -= row.Amount;
      }
      host.drainDamage();
    }
  };
  cast();
  return { host, files, check, owner, targets, rows, areas, strikes, cast, step };
}

test('死亡闪电: shocked kill starts a storm, seeks a live enemy and deals AoE at that target', () => {
  const f = fixture(); f.step(30);
  assert.equal(f.host.world.summons.length, 1);
  assert.equal(f.host.world.summons[0].storm, true);
  assert.equal(f.strikes.length, 1); assert.equal(f.strikes[0].target, 2);
  assert.equal(f.areas.length, 1);
  assert.equal(f.areas[0].x, 2); assert.equal(f.areas[0].y, 2);
  assert.equal(f.areas[0].radius, 1.5); assert.equal(f.areas[0].effect, 'death_lightning');
  assert.deepEqual(f.rows.filter(r => r.Element === EElement.Lightning).map(r => [r.TargetExternalId, r.Amount]), [[2, 30], [3, 30]]);
  assert.ok(!f.rows.some(r => [4, 5].includes(r.TargetExternalId)), 'out-of-range enemies and allies are unaffected');
});

test('死亡闪电: no storm without a shocked kill; no untargeted explosions when the search is empty', () => {
  for (const options of [{ shocked: [] }, { shocked: [2] }, { shocked: [100] }, { duration: 0.05 }, { health: 200 }]) {
    const f = fixture(options); f.step(45);
    assert.equal(f.host.world.summons.length, 0, JSON.stringify(options));
    assert.equal(f.areas.length, 0); assert.equal(f.strikes.length, 0);
  }
  const empty = fixture({ params: { radius: 1 } }); empty.step(45);
  assert.equal(empty.host.world.summons.length, 1, 'storm can wait for an enemy');
  assert.equal(empty.areas.length, 0); assert.equal(empty.strikes.length, 0);
});

test('死亡闪电: reacquires targets, follows the caster, and separates search radius from impact radius', () => {
  const f = fixture({ params: { impact_radius: 0.25, amount: 17 } }); f.step(30);
  assert.deepEqual(f.rows.filter(r => r.Element === EElement.Lightning).map(r => [r.TargetExternalId, r.Amount]), [[2, 17]]);
  f.targets.find(t => t.id === 2).health = 0;
  f.step(25); assert.equal(f.strikes.at(-1).target, 3, 'dead target is not selected again');
  f.host.updateOwner(f.owner, { x: 1500, y: 0, z: 60 }, { x: 1, y: 0, z: 0 });
  f.targets.push({ id: 7, x: 1600, y: -100, health: 200, team: 1 });
  f.step(30);
  assert.equal(f.strikes.at(-1).target, 7);
  assert.equal(f.areas.at(-1).x, 16); assert.equal(f.areas.at(-1).y, -1);
  assert.equal(f.host.world.summons[0].x, 15, 'search center follows the caster rather than the corpse');
});

test('死亡闪电: strikes periodically, refreshes without stacking or resetting cadence, then expires cleanly', () => {
  const f = fixture({ params: { duration: 0.6, interval: 0.2 } });
  f.targets[1].health = f.targets[2].health = 10000;
  f.step(30);
  const expire = f.host.world.summons[0].expire;
  f.targets.push({ id: 8, x: 400, y: 0, health: 10, team: 1 });
  f.host.applyStatus(8, 'shock', 20, 2); f.cast(); f.step(15);
  assert.equal(f.host.world.summons.length, 1);
  assert.ok(f.host.world.summons[0].expire > expire);
  f.step(15); assert.equal(f.host.world.summons.length, 1, 'refreshed storm outlives the original duration');
  f.step(70);
  assert.equal(f.host.world.summons.length, 0); assert.equal(f.host.world.activeRoots(), 0);
  const count = f.strikes.length; f.step(30); assert.equal(f.strikes.length, count);
  assert.ok(count >= 4);
  for (let i = 1; i < count; i++) assert.ok(f.strikes[i].time - f.strikes[i - 1].time >= 0.19, 'refresh preserves the strike interval');
});

test('死亡闪电: real battle damage produces lightning visual events and a visible storm buff', () => {
  const f = fixture();
  const files = [...f.files, { path: 'Builds/test_thunder.json', text: JSON.stringify({ id: 'test_thunder', active: 'create_ice_lance', traits: ['create_ice_lance', 'death_lightning'] }) }];
  const check = checkRuleSet(files); assert.ok(check.ok, check.error);
  const battle = new Battle(files, { collections: check.collections, maxMonsters: 0, spawnRate: 0, god: true });
  battle.setLoadout({ skills: ['test_thunder'] }); battle.spawnMonsters(3);
  for (const [i, m] of battle.monsters.entries()) Object.assign(m, { x: i ? 200 + i * 40 : 400, y: i ? 200 : 0, health: i ? 1000 : 10, maxHealth: 1000, speed: 0, cooldown: 99 });
  battle.host.applyStatus(battle.monsters[0].id, 'shock', 20, 2);
  battle.hero.castClock = 1; battle.hero.casting = true;
  for (let i = 0; i < 30; i++) battle.step(1 / 60);
  assert.ok(battle.lightningStrikes.length > 0, 'actual lightning area impacts reach the renderer');
  assert.ok(battle.lightningStrikes.every(s => s.y > 100 && s.radius === 150), 'visual strike is at a living target and uses the actual AoE radius');
  assert.ok(battle.buffs().some(b => b.label === '死亡闪电' && b.remaining > 0));
});

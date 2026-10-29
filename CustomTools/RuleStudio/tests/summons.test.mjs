import test from 'node:test';
import assert from 'node:assert/strict';
import { RuleHost, checkRuleSet, statusKey, aggregate, compileBuild, markEnabled } from '../engine/index.mjs';
import { readBaselineRuleFiles } from './rule-fixture.mjs';
import { Battle } from '../public/sim/battle.mjs';

// 召唤哨卫: summon_sentinel only places the summon; "哨卫·" traits decide what each attack does.
function fixture(params = {}, modules = null) {
  const files = readBaselineRuleFiles().map(file => {
    if (/Traits[\\/]summon_sentinel\.json$/i.test(file.path)) {
      const doc = JSON.parse(file.text);
      Object.assign(doc.params, params);
      return { ...file, text: JSON.stringify(doc) };
    }
    if (modules && /Builds[\\/]sentinel\.json$/i.test(file.path)) {
      const doc = JSON.parse(file.text);
      doc.traits = ['summon_sentinel', ...modules];
      return { ...file, text: JSON.stringify(doc) };
    }
    return file;
  });
  const h = new RuleHost();
  assert.ok(h.loadRuleLibrary(files).ok, h.lastError);
  const { plan, error } = h.compileNamedBuild('sentinel');
  assert.ok(plan >= 0, error);
  const owner = h.registerOwner(700, 0);
  const events = [];
  h.world.trace = (type, data) => events.push({ type, ...data });
  const cast = (x = 0, y = 0, caster = owner) => h.castBuild(plan, caster, { x, y, z: 60 }, { x: 1, y: 0, z: 0 });
  const tick = (targets = [{ id: 5, x: 300, y: 0, team: 1, health: 10000 }]) => {
    h.beginTargets();
    for (const t of targets) h.addTarget({ x: t.x, y: t.y, z: 60 }, 40, t.health ?? 10000, t.team ?? 1, t.id);
    return h.stepFrame(1 / 60);
  };
  return { h, files, owner, plan, events, cast, tick };
}

const fires = events => events.filter(e => e.type === 'summon_fire').length;

test('召唤哨卫: default skill persists eight seconds and fires ice lances with chill', () => {
  const { h, events, cast, tick } = fixture();
  cast();
  const hits = [];
  let chill = 0;
  for (let i = 0; i < 560; ++i) {
    hits.push(...tick());
    chill = Math.max(chill, h.world.getStatus(5, statusKey('chill')));
  }
  assert.equal(fires(events), 8);
  assert.equal(hits.length, 8);
  assert.ok(hits.every(r => r.Amount === 16 && r.Element === 1 && r.OwnerExternalId === 700));
  assert.equal(chill, 30);
  assert.equal(h.world.summons.length, 0);
  assert.equal(h.world.carriers.num, 0);
  assert.equal(h.world.activeRoots(), 0);
  assert.equal(h.world.owners[0].liveProjectiles, 0);
});

test('召唤哨卫: without attack traits the sentinel locks on but deals nothing', () => {
  const { h, events, cast, tick } = fixture({ duration: 2 }, []);
  cast();
  const hits = [];
  for (let i = 0; i < 150; ++i) hits.push(...tick());
  assert.equal(fires(events), 2);
  assert.equal(hits.length, 0);
  assert.equal(h.world.activeRoots(), 0);
});

test('召唤哨卫: every configured attack trait triggers on each attack', () => {
  const { h, events, cast, tick } = fixture({ duration: 1.5 }, ['sentinel_ice_lance', 'sentinel_lightning', 'sentinel_fire_nova', 'shock']);
  cast(0, 0);
  const hits = [];
  // Target 5 within the nova radius (2.5 m), target 6 only in lock range.
  const targets = [{ id: 5, x: 150, y: 0 }, { id: 6, x: 0, y: 800 }];
  let shock = 0;
  for (let i = 0; i < 100; ++i) { hits.push(...tick(targets)); shock = Math.max(shock, h.world.getStatus(5, statusKey('shock'))); }
  assert.equal(fires(events), 2);
  const by = element => hits.filter(r => r.Element === element);
  // Shock (+20% damage taken) applies from the first strike on, so later hits are larger.
  assert.equal(by(0).length, 2, 'fire nova once per attack on the enemy in radius');
  assert.ok(by(0).every(r => r.TargetExternalId === 5 && r.Amount >= 10 && r.Amount <= 12));
  assert.equal(by(2).length, 2, 'lightning strikes the locked target');
  assert.ok(by(2).every(r => r.TargetExternalId === 5 && r.Amount >= 12 && r.Amount <= 14.4 + 1e-3));
  assert.ok(by(1).length >= 1, 'ice lance fired as well');
  assert.equal(shock, 20, 'sentinel lightning counts as a hit');
});

test('召唤哨卫: attack traits from equipment stack onto the skill; params can be overridden', () => {
  const files = readBaselineRuleFiles();
  const check = checkRuleSet(files);
  assert.ok(check.ok, check.error);
  const result = aggregate(check.library, 'sentinel', [{ kind: 'equipment', doc: { traits: [{ id: 'sentinel_lightning', params: { amount: 40 } }] }, label: 'equipment' }]);
  assert.ok(!result.error, result.error);
  const ids = result.source.traits.map(t => t.id);
  assert.deepEqual(ids, ['summon_sentinel', 'sentinel_ice_lance', 'chill', 'sentinel_lightning']);
  assert.equal(result.source.traits[3].params.get('amount'), 40);
  // On another skill the attack trait has no sentinel parent: compiled out and reported as inactive.
  const other = aggregate(check.library, 'frost_lance', [{ kind: 'equipment', doc: { traits: [{ id: 'sentinel_lightning', params: {}, duration: 0, with: [] }] }, label: 'equipment' }]);
  const compiled = compileBuild(other.source);
  assert.ok(compiled.plan, compiled.error);
  assert.ok(!compiled.plan.traitIds.includes('sentinel_lightning'));
  markEnabled(other.contributions, compiled.plan, check.library);
  assert.equal(other.contributions.find(c => c.traitId === 'sentinel_lightning').status, 'off');
});

test('召唤哨卫: stays at the cast position, ignores allies/dead/outside targets, reacquires the nearest enemy', () => {
  const { h, owner, events, cast, tick } = fixture({ duration: 3 });
  cast(100, 200);
  const ignored = [{ id: 1, x: 150, y: 200, team: 0 }, { id: 2, x: 170, y: 200, health: 0 }, { id: 3, x: 1200, y: 200 }];
  for (let i = 0; i < 30; ++i) tick(ignored);
  assert.equal(fires(events), 0);
  assert.equal(h.world.activeRoots(), 1, 'idle sentinel holds its root');
  h.updateOwner(owner, { x: 5000, y: 5000, z: 60 }, { x: 0, y: 1, z: 0 });
  for (let i = 0; i < 60; ++i) tick([...ignored, { id: 8, x: 400, y: 200 }, { id: 7, x: 400, y: 200 }]);
  const first = events.find(e => e.type === 'summon_fire');
  assert.equal(first.target, 7, 'equal-distance targets use external id');
  assert.equal(first.x, 1); assert.equal(first.y, 2);
  for (let i = 0; i < 60; ++i) tick([{ id: 9, x: 100, y: 500 }]);
  assert.equal(events.filter(e => e.type === 'summon_fire').at(-1).target, 9);
  assert.equal(h.world.summons[0].dx, 0);
  assert.equal(h.world.summons[0].dy, 1);
});

test('召唤哨卫: recasting replaces only this owner’s sentinel, keeps its rhythm and releases the replaced root', () => {
  const { h, events, cast, tick } = fixture({ duration: 0.5 });
  cast(); tick([]);
  const first = h.world.summons[0].id;
  const other = h.registerOwner(800, 0);
  cast(500, 0, other); tick([]);
  assert.equal(h.world.summons.length, 2);
  cast(200, 0); tick([]);
  assert.equal(h.world.summons.length, 2);
  assert.ok(!h.world.summons.some(s => s.id === first));
  assert.equal(h.world.activeRoots(), 2);
  assert.equal(h.world.summons.at(-1).x, 2);
  for (let i = 0; i < 50; ++i) tick([]);
  assert.equal(h.world.activeRoots(), 0);
  assert.equal(h.world.summons.length, 0);

  const spam = fixture({ duration: 8 });
  for (let i = 0; i < 120; ++i) { if (i % 10 === 0) spam.cast(); spam.tick(); }
  assert.equal(fires(spam.events), 2, 'recasting does not speed up attacks');
});

test('召唤哨卫: cap allows several sentinels at once', () => {
  const { h, cast, tick } = fixture({ cap: 3 });
  for (let i = 0; i < 4; ++i) { cast(i * 100, 0); tick([]); }
  assert.equal(h.world.summons.length, 3);
});

test('召唤哨卫: summon input validation and determinism respect existing work budgets', () => {
  for (const params of [{ duration: 0 }, { interval: 0 }, { range: -1 }]) {
    const { h, cast, tick } = fixture(params);
    cast(); tick();
    assert.equal(h.world.summons.length, 0);
    assert.equal(h.world.activeRoots(), 0);
  }
  const run = () => {
    const { h, cast, tick, events } = fixture({ duration: 0.6, interval: 0.001 });
    h.world.config.WorkPerFrame = 1;
    cast();
    const damage = [];
    for (let i = 0; i < 120; ++i) damage.push(...tick());
    assert.equal(h.world.activeRoots(), 0);
    assert.ok(fires(events) <= 12, 'interval is bounded at 50 ms');
    return { hash: h.world.stateHash(), damage };
  };
  assert.deepEqual(run(), run());
});

test('3D 战斗: the sentinel skill compiles in a loadout and exposes summon presentation data', () => {
  const { files } = fixture();
  const check = checkRuleSet(files);
  assert.ok(check.ok, check.error);
  const battle = new Battle(files, { collections: check.collections, god: true, maxMonsters: 0, spawnRate: 0 });
  battle.setLoadout({ skills: ['sentinel'] });
  assert.ok(battle.skills[0].plan >= 0, battle.skills[0].error);
  battle.hero.casting = true;
  for (let i = 0; i < 22; ++i) battle.step(1 / 60);
  battle.hero.casting = false;
  assert.equal(battle.summons().length, 1);
  assert.equal(battle.summons()[0].kind, 'sentinel');
  const position = battle.summons()[0].x;
  battle.hero.x += 300;
  battle.step(1 / 60);
  assert.equal(battle.summons()[0].x, position);
});

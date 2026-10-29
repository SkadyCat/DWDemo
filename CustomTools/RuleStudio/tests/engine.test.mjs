// Port of Plugins/DWRules/.../Tests/DWRuleCoreTests.cpp (DWRules.Core.*) and
// Source/DungeonWorldBeta/Private/Tests/DWBRuleTests.cpp (DWB.Rules.*) to the web interpreter.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  StatBlock, EStat, EModOp, EElement, EElementStat, findStat, elementStatId, compileBuild, newBuild, RuleWorld, RuleLibrary,
  EBuiltinEvent, statusKey, Samples, f,
} from '../engine/index.mjs';
import { readBaselineRuleFiles as readRuleFiles } from './rule-fixture.mjs';

const build = traits => newBuild('ice_lance', traits);
function mustCompile(source) {
  const { plan, error } = compileBuild(source);
  assert.ok(plan, `compile: ${error}`);
  return plan;
}
function lineOfTargets(world, count, health, spacing = 1.5) {
  world.targets.reset();
  for (let i = 0; i < count; ++i) world.targets.add(f(3 + f(spacing * i)), 0, 0, 0.4, health, 1, i + 1);
}
function runCast(world, plan, frames, seed = 7) {
  const owner = world.addOwner(100, 0);
  world.cast(plan, owner, 0, 0, 0, 1, 0, 0, seed);
  let total = 0;
  for (let frame = 0; frame < frames; ++frame) {
    world.step(1 / 60);
    for (const record of world.damageLog) total = f(total + record.Amount);
    world.damageLog = [];
  }
  return total;
}

test('DWRules.Core.StatPartitions', () => {
  const stats = new StatBlock();
  const damage = EStat.ProjectileDamage;
  stats.apply(damage, EModOp.Set, 10);
  stats.apply(damage, EModOp.Add, 5);
  stats.apply(damage, EModOp.IncreasedPercent, 50);
  stats.apply(damage, EModOp.IncreasedPercent, 50);
  stats.apply(damage, EModOp.Multiply, 2);
  stats.finalize();
  assert.equal(stats.get(EStat.ProjectileDamage), 60, 'partitioned damage');
  assert.equal(stats.get(EStat.ProjectileCount), 1, 'untouched default');
  assert.equal(findStat('element.cold.damage_flat'), elementStatId(EElement.Cold, EElementStat.DamageFlat), 'element id');
});

test('DWRules.Core.TargetRefresh: deferred area casts use the latest target export without a substep', () => {
  const library = new RuleLibrary(); assert.ok(library.load(readRuleFiles()).ok);
  const plan = mustCompile(library.namedBuildSource('monster_claw').source);
  const world = new RuleWorld(), index = world.addPlan(plan), owner = world.addOwner(1, 0);
  for (let i = 0; i < 3; ++i) world.targets.add(i * 2, 0, 0, .4, 100, 1, 100 + i);
  world.step(1 / 60);
  world.targets.reset(); world.targets.add(1000, 0, 0, .4, 100, 1, 999);
  world.cast(index, owner, 1000, 0, 0, 1, 0, 0, 1, 10); world.step(0);
  assert.equal(world.damageLog.length, 1); assert.equal(world.damageLog[0].TargetExternalId, 999);
  world.damageLog.length = 0; world.targets.reset();
  world.cast(index, owner, 1000, 0, 0, 1, 0, 0, 2, 10); world.step(0);
  assert.equal(world.damageLog.length, 0);
});

test('DWRules.Core.CompileComposition', () => {
  const orphan = Samples.pierce(3);
  orphan.parentId = 'not_equipped';
  const plan = mustCompile(build([Samples.iceLance(), Samples.multiple(2), orphan]));
  assert.equal(plan.stats.get(EStat.ProjectileCount), 3, 'support stacks count');
  assert.equal(plan.stats.get(EStat.ProjectilePierce), 0, 'orphan child is inactive');
  assert.ok(plan.hasRules(EBuiltinEvent.Cast), 'cast rules indexed');
  const bad = Samples.shatterOnKill();
  bad.params.delete('amount');
  const { plan: rejected, error } = compileBuild(build([Samples.iceLance(), bad]));
  assert.equal(rejected, null, 'unbound parameter rejected');
  assert.match(error, /amount/, 'error names the parameter');
});

test('DWRules.Core.EmitAndPierce', () => {
  const world = new RuleWorld();
  const plan = world.addPlan(mustCompile(build([Samples.iceLance(), Samples.pierce(2)])));
  lineOfTargets(world, 5, 1000);
  runCast(world, plan, 120);
  const damaged = world.targets.health.filter(h => h < 1000).length;
  assert.equal(damaged, 3, 'pierce 2 hits three targets');
  assert.equal(world.carriers.num, 0, 'carriers released');
  assert.equal(world.activeRoots(), 0, 'root released');
});

test('DWRules.Core.StackingMultiplies', () => {
  const measure = source => {
    const world = new RuleWorld();
    const plan = world.addPlan(mustCompile(source));
    world.targets.reset();
    for (let i = 0; i < 40; ++i) {
      const angle = f(i * f(2.399963));
      const distance = f(3 + f(0.25 * i));
      world.targets.add(f(Math.cos(angle) * distance), f(Math.sin(angle) * distance), 0, 0.5, 60, 1, i + 1);
    }
    return runCast(world, plan, 180);
  };
  const single = measure(build([Samples.iceLance()]));
  const stacked = measure(Samples.stackedIceLance());
  assert.ok(single > 0, 'single trait deals damage');
  assert.ok(stacked > single * 5, `stacked traits multiply output (>5x): single=${single} stacked=${stacked}`);
});

test('DWRules.Core.Deterministic', () => {
  const runOnce = parallel => {
    const world = new RuleWorld({ bParallel: parallel, ParallelChunk: 16 });
    const plan = world.addPlan(mustCompile(Samples.stackedIceLance()));
    lineOfTargets(world, 30, 80, 0.7);
    runCast(world, plan, 90, 1234);
    return world.stateHash();
  };
  assert.equal(runOnce(true), runOnce(false));
});

test('DWRules.Core.BudgetDefersInsteadOfFailing', () => {
  const world = new RuleWorld({ WorkPerFrame: 50 });
  const plan = world.addPlan(mustCompile(Samples.stackedIceLance()));
  lineOfTargets(world, 60, 20, 0.5);
  const owner = world.addOwner(1, 0);
  for (let cast = 0; cast < 40; ++cast) world.cast(plan, owner, 0, 0, 0, 1, f(0.02 * cast), 0, cast);
  let maxActions = 0;
  for (let frame = 0; frame < 900; ++frame) {
    world.step(1 / 60);
    maxActions = Math.max(maxActions, world.getStats().Actions);
    world.damageLog = [];
  }
  assert.ok(maxActions <= 50 + 64, `per-frame work respects the cap (${maxActions})`);
  assert.equal(world.activeRoots(), 0, 'everything eventually drains');
});

// ---- DWB.Rules: the real Content/Rules library ----

function loadLibrary() {
  const library = new RuleLibrary();
  const result = library.load(readRuleFiles());
  assert.ok(result.ok, `library loads: ${result.error}`);
  return library;
}
function compileNamed(library, buildId, extra = []) {
  const { source, error } = library.namedBuildSource(buildId, extra);
  assert.ok(source, error);
  return mustCompile(source);
}

// One cast down a lane of 12 targets, 2 m apart, 1.5 s of simulation.
function simulate(plan, health) {
  const world = new RuleWorld();
  const planIndex = world.addPlan(plan);
  const owner = world.addOwner(1, 0);
  world.updateOwner(owner, 0, 0, 0, 1, 0, 0);
  const healthById = new Array(13).fill(f(health));
  const chill = statusKey('chill');
  world.cast(planIndex, owner, 0, 0, 0, 1, 0, 0, 7);
  const run = { damage: 0, kills: 0, chilled: 0, hits: 0 };
  for (let frame = 0; frame < 90; ++frame) {
    world.targets.reset();
    for (let i = 1; i <= 12; ++i) if (healthById[i] > 0) world.targets.add(2 * i, f(((i % 3) - 1) * f(0.6)), 0, 0.45, healthById[i], 1, i);
    world.step(1 / 60);
    for (const record of world.damageLog) {
      healthById[record.TargetExternalId] = f(healthById[record.TargetExternalId] - record.Amount);
      run.damage = f(run.damage + record.Amount);
      run.kills += record.bKilled ? 1 : 0;
      ++run.hits;
    }
    world.damageLog = [];
  }
  for (let i = 1; i <= 12; ++i) run.chilled += world.getStatusRemaining(i, chill) > 0 ? 1 : 0;
  return run;
}

test('DWB.Rules.FrostLanceIsCreatePlusChill', () => {
  const library = loadLibrary();
  const plan = compileNamed(library, 'frost_lance');
  assert.ok(plan.traitIds.includes('create_ice_lance') && plan.traitIds.includes('chill'), 'composed of create_ice_lance + chill');
  const run = simulate(plan, 1000);
  assert.equal(run.hits, 1, 'one lance hits the first target only');
  assert.equal(run.chilled, 1, 'the hit target is chilled');
  const bare = mustCompile(newBuild('create_ice_lance', [library.trait('create_ice_lance').source]));
  assert.equal(simulate(bare, 1000).chilled, 0, 'create_ice_lance alone does not chill');
});

test('DWB.Rules.TraitsStack', () => {
  const library = loadLibrary();
  const all = ['multiple_projectiles', 'pierce', 'ricochet', 'brittle', 'shatter', 'cold_mastery'];
  const base = simulate(compileNamed(library, 'frost_lance'), 60);
  const full = simulate(compileNamed(library, 'frost_lance', all), 60);
  console.log(`frost_lance: damage=${base.damage.toFixed(1)} hits=${base.hits} kills=${base.kills} chilled=${base.chilled} | all traits: damage=${full.damage.toFixed(1)} hits=${full.hits} kills=${full.kills} chilled=${full.chilled} (x${(full.damage / Math.max(1, base.damage)).toFixed(1)})`);
  assert.ok(full.damage > base.damage * 5, 'stacked traits multiply damage at least 5x');
  assert.ok(full.kills > 0, 'stacked traits kill');
  assert.ok(full.chilled > base.chilled, 'stacked traits chill more targets');
  assert.ok(full.hits >= base.hits * 8, 'stacked traits hit many more times');
});

test('Reader rejects unknown fields like the native reader', async () => {
  const { readTraitText } = await import('../engine/reader.mjs');
  assert.equal(readTraitText('{"id":"x","bogus":1}').error, 'trait: unknown field bogus');
  assert.equal(readTraitText('{"id":"x","rules":[{"id":"r","event":"hit","actions":[{"op":"spawn"}]}]}').error,
    'x.rules[0].actions[0]: operator spawn is not implemented in the native runtime yet');
});

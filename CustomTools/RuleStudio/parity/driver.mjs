// Runs parity/scenarios.json through the web interpreter. Exactly mirrors the UE driver
// (Source/DungeonWorldBeta/Private/Tests/DWBWebParityTest.cpp); keep both in sync.
import { RuleWorld, RuleLibrary, compileBuild, newBuild, statusKey, Samples, f, INDEX_NONE } from '../engine/index.mjs';

const STAT_FIELDS = ['Substeps', 'Projectiles', 'Contacts', 'Hits', 'Kills', 'Events', 'Actions', 'Waves', 'Deferred', 'DroppedEvents',
  'BudgetStops', 'DepthBlocked', 'ChainBlocked', 'CapacityDrops', 'StatusApplied', 'Statuses'];

function planSource(library, spec) {
  if (spec.sample === 'stacked') return { source: Samples.stackedIceLance() };
  if (spec.build) return library.namedBuildSource(spec.build, spec.extra || []);
  return library.buildSource(spec.active || '', spec.traits);
}

export function runScenario(library, scenario) {
  const world = new RuleWorld(scenario.config || {});
  world.setStatusDefs(library.statusDefs());
  const plans = {};
  const planHashes = {};
  for (const spec of scenario.plans) {
    const { source, error } = planSource(library, spec);
    if (!source) throw new Error(`${scenario.id}/${spec.key}: ${error}`);
    source.traits = source.traits.map(trait => spec.params?.[trait.id]
      ? { ...trait, params: new Map([...trait.params, ...Object.entries(spec.params[trait.id])]) } : trait);
    const { plan, error: compileError } = compileBuild(source);
    if (!plan) throw new Error(`${scenario.id}/${spec.key}: ${compileError}`);
    plans[spec.key] = world.addPlan(plan);
    planHashes[spec.key] = plan.hash.toString(16).padStart(16, '0');
  }
  const owners = {};
  for (const owner of scenario.owners) {
    owners[owner.key] = world.addOwner(owner.externalId, owner.team);
    world.updateOwner(owners[owner.key], owner.position[0], owner.position[1], owner.position[2], owner.aim[0], owner.aim[1], owner.aim[2]);
    if (owner.statusId !== undefined) world.setOwnerStatusId(owners[owner.key], owner.statusId);
  }
  for (const binding of scenario.defense || []) world.setTargetDefensePlan(binding.targetId, plans[binding.plan]);
  const health = new Map(scenario.targets.map(t => [t.id, f(t.health)]));
  const exportTargets = frame => {
    world.targets.reset();
    const time = f(f(frame) * f(scenario.dt));
    for (const t of scenario.targets) {
      if (scenario.commit && !(health.get(t.id) > 0)) continue;
      const v = t.velocity || [0, 0, 0];
      world.targets.add(f(f(t.position[0]) + f(f(v[0]) * time)), f(f(t.position[1]) + f(f(v[1]) * time)), f(f(t.position[2]) + f(f(v[2]) * time)),
        t.radius, scenario.commit ? health.get(t.id) : t.health, t.team, t.id, t.resistance || null);
    }
  };
  if (!scenario.commit) exportTargets(0);
  const castsByFrame = new Map();
  for (const cast of scenario.casts) {
    if (!castsByFrame.has(cast.frame)) castsByFrame.set(cast.frame, []);
    castsByFrame.get(cast.frame).push(cast);
  }
  const damage = [];
  const frames = [];
  for (let frame = 0; frame < scenario.frames; ++frame) {
    if (scenario.commit) exportTargets(frame);
    for (const cast of castsByFrame.get(frame) || []) {
      const root = world.cast(plans[cast.plan], owners[cast.owner], cast.origin[0], cast.origin[1], cast.origin[2],
        cast.direction[0], cast.direction[1], cast.direction[2], BigInt(cast.seed), cast.power ?? 0);
      if (root === INDEX_NONE) throw new Error(`${scenario.id}: cast rejected at frame ${frame}`);
    }
    world.step(scenario.dt);
    for (const record of world.damageLog) {
      if (scenario.commit) health.set(record.TargetExternalId, f(health.get(record.TargetExternalId) - record.Amount));
      damage.push([frame, record.TargetExternalId, record.OwnerExternalId, record.Amount, record.Element, record.bCritical ? 1 : 0, record.bKilled ? 1 : 0]);
    }
    world.damageLog = [];
    const stats = world.getStats();
    frames.push(STAT_FIELDS.map(field => stats[field]));
  }
  const statuses = {};
  for (const name of scenario.statusQuery || []) {
    statuses[name] = scenario.targets.map(t => [t.id, world.getStatusRemaining(t.id, statusKey(name))]).filter(([, v]) => v > 0);
  }
  return {
    id: scenario.id, planHashes, statFields: STAT_FIELDS, damage, frames, statuses,
    stateHash: world.stateHash().toString(16).padStart(16, '0'), activeRoots: world.activeRoots(), clock: world.getClock(),
  };
}

export function runAll(ruleFiles, scenarios) {
  const library = new RuleLibrary();
  const loaded = library.load(ruleFiles);
  if (!loaded.ok) throw new Error(loaded.error);
  return { engine: 'web', scenarios: scenarios.map(s => runScenario(library, s)) };
}

import fs from 'node:fs';
import path from 'node:path';
import { readRuleFiles, PROJECT_ROOT } from './rule-files.mjs';
import { RuleHost, Character, sourceFromEntry, offenseSource, newBuild, isStitchable, sheetStitchRole, statusKey } from '../engine/index.mjs';
import { CombatRuntime } from '../engine/combat/runtime.mjs';

const files = readRuleFiles();
const inventory = new RuleHost();
const loaded = inventory.loadRuleLibrary(files);
if (!loaded.ok) throw new Error(loaded.error);
const lib = inventory.library;
const all = process.argv.includes('--all');
const basics = ['frost_lance', 'flame_burst', 'earth_wave', 'player_slash', 'sentinel', 'spirit_servant', 'poison_flask'];
const selected = ['poison_chance', 'poison_extra_layers', 'poison_threshold_detonate', 'shock_max_stacks', 'shock_layers_strike', 'ignite_max_stacks', 'freeze_buildup', 'chain_count',
  'area_repeats', 'area_to_ring', 'area_follow_self', 'area_extra_zones', 'area_pulse', 'proj_split_on_hit', 'proj_chain', 'proj_return_at_max', 'proj_orbit', 'proj_homing_range', 'minion_per_cast', 'minion_cap', 'trig_interval', 'trig_hit'];
const cases = basics.filter(id => lib.build(id)).map(skill => ({ id: skill, skill, entries: [] }));
for (const entry of lib.traits.values()) {
  if (!(all ? /^Affixes\//i.test(entry.path) : selected.includes(entry.source.id))) continue;
  const src = entry.source;
  const paths = (src.sheet || []).map(x => x.stat || x.trigger || '').join('|');
  const skill = /minion/.test(paths) ? 'sentinel' : /area\.|area_/.test(paths) ? 'flame_burst' : 'frost_lance';
  const e = { id: src.id };
  if (isStitchable(src)) e.with = [{ id: sheetStitchRole(src) === 'cast' ? 'create_flame_burst' : 'inc_fire' }];
  cases.push({ id: src.id, skill, entries: [e] });
}
const dt = 1 / 60, frames = 180;
function snapshot(R) {
  return {
    time: R.time, life: R.c.life, shield: R.c.shield, mana: R.c.mana, cooldown: R.cooldown,
    charges: R.c.charges, empowered: R.c.pendingEmpower, triggered: R.triggers.fired, recalled: R.projectiles.recalled,
    projectiles: R.world.carriers.num, summons: R.world.summons.length, zones: R.zones.zones.length,
    enemies: R.arena.monsters.map(m => ({ id: m.id, health: m.health, shield: m.shield, x: m.x / 100, y: m.y / 100,
      poison: R.ailments.layers(m.id, 'poison'), erosion: R.ailments.layers(m.id, 'erosion'), shock: R.ailments.shockLayers(m.id), ignite: R.ailments.layers(m.id, 'ignite'),
      statuses: ['poison', 'erosion', 'shock', 'ignite', 'chill', 'freeze'].map(n => R.status(m.id, n)) })),
    minions: R.minions.alive().map(st => ({ id: st.id, life: st.life, shield: st.shield, x: st.summon.x, y: st.summon.y })),
  };
}
for (const test of cases) {
  const host = new RuleHost(); host.loadRuleLibrary(files);
  const c = new Character({ seed: 5 });
  const sources = test.entries.map(e => sourceFromEntry(host.library, e));
  c.setSheet(sources.map(source => ({ source })));
  const hero = { owner: host.registerOwner(1, 0), plan: -1, power: 30, skill: test.skill, x: 0, y: 0, aim: { x: 1, y: 0 }, god: false, casting: false };
  host.setOwnerStatusId(hero.owner, 0x40000000);
  const monsters = [[140, 0], [300, 0], [500, 0], [300, 150], [600, -100]].map(([x, y], i) => ({ id: 100 + i, x, y, radius: 40, health: 10000, maxHealth: 10000, shield: 0, maxShield: 0, sinceHit: 0, elite: false, resistance: [0, 0, 0, 0] }));
  const arena = { host, character: c, hero, monsters, elapsed: 0, moveActor(m, x, y) { m.x = x; m.y = y; } };
  const R = new CombatRuntime(arena, { seed: 7 }).install();
  R.byId = new Map(monsters.map(m => [m.id, m]));
  const base = host.library.namedBuildSource(test.skill).source;
  if (!base) throw new Error(`missing build ${test.skill}`);
  const initial = host.compileSource(newBuild(base.activeId, [...base.traits, ...sources]));
  if (initial.plan < 0) throw new Error(initial.error);
  hero.plan = initial.plan;
  test.rows = []; test.expected = []; test.monsters = monsters.map(m => ({ ...m }));
  for (const m of monsters) {
    for (const [name, value, duration] of [['shock', 20, 3], ['ignite', 12, 4], ['chill', 30, 2]]) host.world.applyStatusKey(m.id, statusKey(name), value, duration, hero.owner);
    R.ailments.applyPoison(m.id, { amount: 30, element: 3 }); R.ailments.applyErosion(m.id, { amount: 30 });
  }
  for (let frame = 0; frame < frames; ++frame) {
    c.tick(dt, { moving: frame % 60 < 30 }); arena.elapsed += dt;
    if (frame % 45 === 0) {
      const pay = c.beforeCast(2, { kind: R.skillKind(), costScale: R.costScale() });
      if (pay.ok) {
        const planSource = R.planSource(host.plan(hero.plan));
        const offense = offenseSource(c.offense(pay), host.plan(hero.plan).stats);
        const compiled = host.compileSource(newBuild(base.activeId, [...base.traits, ...sources, ...[planSource, offense].filter(Boolean)]));
        const root = host.world.cast(compiled.plan, hero.owner, .6, 0, .6, 1, 0, 0, BigInt(100 + frame), 30);
        R.onHeroCast(root, pay);
      }
    }
    host.world.targets.reset();
    for (const m of monsters) if (m.health > 0) host.world.targets.add(m.x / 100, m.y / 100, .6, .4, m.health + m.shield, 1, m.id, m.resistance);
    host.world.targets.add(0, 0, .6, .45, c.life + c.shield, 0, 0x40000000, [0, 0, 0, 0]); R.minions.addTargets(host);
    R.beforeStep(dt); host.world.step(dt);
    if (frame === 120) R.strike(monsters[0].x / 100, monsters[0].y / 100, .01, 20000, 2, { only: monsters[0].id, area: false, effect: 'fixture_kill' });
    for (const row of host.world.damageLog) {
      const m = monsters.find(m => m.id === row.TargetExternalId);
      if (m) { R.damageMonster(m, row); R.onRow(row); }
      else if (row.TargetExternalId === 0x40000000) R.heroRow(row); else R.minionRow(row);
      test.rows.push({ frame, target: row.TargetExternalId, owner: row.OwnerExternalId, amount: row.Amount, element: row.Element, crit: +row.bCritical, killed: +row.bKilled, dot: +(!!row.bDot), strike: row.Info?.strike || '' });
    }
    host.world.damageLog.length = 0;
    if ((frame + 1) % 15 === 0) test.expected.push(snapshot(R));
  }
}
const file = path.join(PROJECT_ROOT, 'Saved/RulesMigration/combat-parity.json');
fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify({ version: 1, dt, frames, cases }));
console.log(`combat parity: ${cases.length} cases, ${cases.reduce((n, t) => n + t.rows.length, 0)} damage rows -> ${file}`);

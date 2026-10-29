// Read-only combat experiments. Explicit manual cast samples, no god mode or modified simulation rules.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRuleFiles, RULES_DIR } from './rule-files.mjs';
import { checkRuleSet } from '../engine/index.mjs';
import { Battle } from '../public/sim/battle.mjs';
import { DungeonBattle } from '../public/sim/dungeon-battle.mjs';
import { readTraitText, newBuild } from '../engine/index.mjs';

export function simulateWhirlwindSwarm(files, collections, preset, { duration = 30, targets = 0, pressure = 0, seed = 18, manual = false, echo = false } = {}) {
  const b = new Battle(files, { collections, maxMonsters: 0, spawnRate: 0, god: false, autoCast: false, seed });
  b.setLoadout(structuredClone(preset)); if (b.hero.plan < 0) throw Error(b.hero.error);
  b.spawnMonsters(targets);
  b.monsters.forEach((m, i) => {
    const angle = i * 2.399963, radius = targets === 1 ? 5 : 3 + 8 * Math.sqrt((i + .5) / targets);
    Object.assign(m, { x: Math.cos(angle) * radius * 100, y: Math.sin(angle) * radius * 100,
      health: 1e9, maxHealth: 1e9, shield: 0, maxShield: 0, speed: 0, cooldown: 9999, attackRange: 0, resistance: [20, 20, 20, 20] });
  });
  const pressurePlans = ['physical', 'fire', 'frost', 'lightning', 'poison'].map(element => {
    if (!pressure) return null;
    const id = `swarm_pressure_${element}`, read = readTraitText(JSON.stringify({ id,
      modifiers: [{ target: 'owner', stat: 'critical_chance', op: 'set', value: 0 }],
      rules: [{ id, event: 'cast', actions: [{ op: 'damage_area', radius: 1, amount: pressure, element, tags: [element, element === 'physical' ? 'melee' : 'spell'] }] }] }));
    return b.host.compileSource(newBuild(id, [read.trait])).plan;
  });
  let spawns = 0, copies = 0, repeats = 0, triggered = 0, peak = 0, minMana = 100, lowestLife = Infinity, total = 0, samples = 0, min = Infinity, max = 0;
  let maxQueue = 0, minSpeed = Infinity, maxSpeed = 0, minLife = Infinity, maxLife = 0, tailDamage = 0;
  const counts = [], coverage = new Set(), victims = new Set(), trace = b.host.world.trace, register = b.combat.register.bind(b.combat);
  b.host.world.trace = (kind, data) => { trace?.(kind, data); if (kind === 'spawn') spawns++; if (kind === 'ground_mirror') copies++; if (kind === 'skill_repeated') repeats++; };
  b.combat.register = (index, data) => { if (data.kind === 'trigger') triggered++; return register(index, data); };
  b.onDamageDealt = row => { victims.add(row.TargetExternalId); if (b.elapsed >= duration * 2 / 3) tailDamage += row.Amount; };
  const start = performance.now();
  for (let frame = 0; frame < duration * 60; frame++) {
    b.hero.casting = false;
    if (echo && frame === 0) { b.select(1); b.hero.castClock = 10; b.hero.casting = true; }
    if (manual && frame === (echo ? 12 : 0)) { b.select(0); b.hero.castClock = 10; b.hero.casting = true; }
    if (pressure && frame > 0 && frame % 60 === 0) b.host.castBuild(pressurePlans[(frame / 60 - 1) % pressurePlans.length], b.monsterOwner,
      { x: b.hero.x, y: b.hero.y, z: 60 }, { x: 1, y: 0, z: 0 });
    b.step(1 / 60);
    const c = b.host.world.carriers; let live = 0;
    for (let i = 0; i < c.num; i++) if (!(c.flags[i] & 1)) {
      live++; const speed = Math.hypot(c.vx[i], c.vy[i]); minSpeed = Math.min(minSpeed, speed); maxSpeed = Math.max(maxSpeed, speed);
      minLife = Math.min(minLife, c.life[i]); maxLife = Math.max(maxLife, c.life[i]);
      if (b.elapsed > 12) coverage.add(`${Math.floor((c.px[i] + 12) / 3)},${Math.floor((c.py[i] + 12) / 3)}`);
    }
    peak = Math.max(peak, live); maxQueue = Math.max(maxQueue, b.combat.triggers.queue.length + b.combat.projectiles.volleys.length);
    if (b.elapsed > 12) { min = Math.min(min, live); max = Math.max(max, live); total += live; samples++; }
    if (frame % 60 === 59) counts.push(live);
    minMana = Math.min(minMana, b.character.mana); lowestLife = Math.min(lowestLife, b.character.life);
    if (b.hero.dead) break;
  }
  return { duration: b.elapsed, targets, pressure, survived: !b.hero.dead, manualCasts: b.hero.casts, triggered, spawns, copies, repeats, peak,
    steady: { min: Number.isFinite(min) ? min : 0, max, average: samples ? total / samples : 0 }, counts,
    minMana, manaEnd: b.character.mana, lowestLife, lifeEnd: b.character.life, maxPlayerLife: b.character.maxLife,
    damage: b.damageDealt, dps: b.damageDealt / b.elapsed, hitTargets: victims.size,
    perTargetDps: b.damageDealt / b.elapsed / Math.max(1, victims.size), tailDps: tailDamage / (duration / 3),
    speed: [Number.isFinite(minSpeed) ? minSpeed : 0, maxSpeed], lifetime: [Number.isFinite(minLife) ? minLife : 0, maxLife],
    visitedCells: coverage.size, maxQueue, simulationMs: performance.now() - start };
}
export function removeSwarmAffixes(preset, ids) {
  const copy = structuredClone(preset); for (const item of Object.values(copy.instances)) item.affixes = item.affixes.filter(a => !ids.includes(a.id)); return copy;
}
export function simulateWhirlwindTower(files, checked, preset, { floor = 10, seed = 18, monsterCount = 20 } = {}) {
  const b = new DungeonBattle(files, { collections: checked.collections, monsterTypes: [...checked.monsters.values()].map(e => e.doc),
    floor, seed, monsterCount, god: false, autoCast: false, timeLimitEnabled: true });
  b.setLoadout(structuredClone(preset));
  let peakWhirlwinds = 0;
  for (let i = 0; i < 30 * 60 && b.phase !== 'cleared' && b.phase !== 'failed'; i++) {
    b.step(1 / 60); peakWhirlwinds = Math.max(peakWhirlwinds, b.projectiles().filter(p => p.kind === 'whirlwind').length);
  }
  return { floor, seed, monsterCount, seconds: b.elapsed, phase: b.phase, kills: b.kills, life: b.character.life,
    manualCasts: b.hero.casts, peakWhirlwinds, god: b.hero.god };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = readRuleFiles(), checked = checkRuleSet(files); if (!checked.ok) throw Error(checked.error);
  const preset = JSON.parse(fs.readFileSync(path.join(RULES_DIR, 'Presets/whirlwind_swarm.json'), 'utf8'));
  const run = (sample, options = {}) => simulateWhirlwindSwarm(files, checked.collections, sample, options);
  const report = { empty: run(preset), single: run(preset, { targets: 1, manual: true }), spread: run(preset, { targets: 20, manual: true }),
    echo: run(preset, { targets: 20, manual: true, echo: true }), pressure: run(preset, { targets: 20, pressure: 1000, manual: true }), ablations: {} };
  for (const [name, ids] of Object.entries({ mirror: ['hit_mirror_ground'], count: ['proj_count'],
    lifeDamage: ['life_added_physical'], lifeScaling: ['damage_per_life'] })) {
    report.ablations[name] = run(removeSwarmAffixes(preset, ids), { targets: 20, manual: true });
  }
  if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}

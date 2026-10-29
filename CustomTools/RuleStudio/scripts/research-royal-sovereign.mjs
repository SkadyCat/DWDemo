// Experiments over the real Battle runtime. Only input and target fixtures are controlled.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRuleFiles, RULES_DIR } from './rule-files.mjs';
import { checkRuleSet } from '../engine/index.mjs';
import { Battle } from '../public/sim/battle.mjs';

export function simulateRoyalSovereign(files, collections, preset, { duration = 8, targets = 12, inputs = [0, .7, 1.4, 2.1], seed = 37, observe = null } = {}) {
  const b = new Battle(files, { collections, maxMonsters: 0, spawnRate: 0, god: false, autoCast: false, seed });
  b.setLoadout(structuredClone(preset)); if (b.hero.plan < 0) throw Error(b.hero.error);
  b.spawnMonsters(targets); b.monsters.forEach((m, i) => {
    const angle = i * 2.399963, radius = targets === 1 ? 8 : 3 + 6 * Math.sqrt((i + .5) / targets);
    Object.assign(m, { x: Math.cos(angle) * radius * 100, y: Math.sin(angle) * radius * 100,
      health: 1e9, maxHealth: 1e9, shield: 0, maxShield: 0, speed: 0, cooldown: 9999, attackRange: 0, resistance: [20,20,20,20] });
  }); b.setAim(1000, 0);
  const levels = [], pulses = [], births = [], hits = new Set(); let nova = 0, consumes = 0, minMana = b.character.mana, peak = 0, input = 0, damage = 0;
  const trace = b.host.world.trace, consume = b.combat.ailments.consumeShock.bind(b.combat.ailments);
  b.combat.ailments.consumeShock = id => { if (b.combat.ailments.shockLayers(id)) ++consumes; return consume(id); };
  b.host.world.trace = (kind, p) => {
    trace?.(kind, p);
    if (kind === 'emitter_pulse') pulses.push({ at: b.elapsed, level: p.level });
    if (kind === 'spawn' && p.plan.kindNames.names[p.kind] === 'treasury_weapon') births.push(b.elapsed);
    if (kind === 'area' && p.effect === 'create_lightning_nova') ++nova;
  };
  b.onDamageDealt = row => { hits.add(row.TargetExternalId); damage += row.Amount; };
  const observations = observe?.(b);
  const start = performance.now();
  for (let frame = 0; frame < Math.round(duration * 60); frame++) {
    b.hero.casting = false; const clicked = input < inputs.length && b.elapsed + 1e-6 >= inputs[input];
    if (clicked) { b.hero.castClock = 10; b.hero.casting = true; ++input; }
    b.step(1 / 60);
    const entry = [...b.host.world.emitters.entries.values()][0]; if (clicked) levels.push(entry?.level || 0);
    minMana = Math.min(minMana, b.character.mana); peak = Math.max(peak, b.projectiles().length);
    if (b.hero.dead) break;
  }
  const fullFrom = 2.2, fullUntil = Math.min(7, duration), fullShots = births.filter(t => t >= fullFrom && t < fullUntil).length;
  return { manualCasts: b.hero.casts, levels, finalLevel: [...b.host.world.emitters.entries.values()][0]?.level || 0,
    pulses: pulses.length, projectiles: births.length, peak, fullRate: fullUntil > fullFrom ? fullShots / (fullUntil - fullFrom) : 0,
    consumes, nova, triggered: b.combat.triggers.fired, damage, dps: damage / b.elapsed,
    hitTargets: hits.size, perTargetDps: damage / b.elapsed / Math.max(1, hits.size), minMana,
    alive: !b.hero.dead, maxLife: b.character.maxLife, seconds: b.elapsed, god: b.hero.god, simulationMs: performance.now() - start,
    ...(observations ? { observations } : {}) };
}
export function withoutSovereignAffixes(preset, ids) {
  const copy = structuredClone(preset); for (const item of Object.values(copy.instances)) item.affixes = item.affixes.filter(line => !ids.includes(line.id)); return copy;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = readRuleFiles(), checked = checkRuleSet(files); if (!checked.ok) throw Error(checked.error);
  const preset = JSON.parse(fs.readFileSync(path.join(RULES_DIR, 'Presets/royal_treasury_sovereign.json'), 'utf8'));
  const run = (sample = preset, options = {}) => simulateRoyalSovereign(files, checked.collections, sample, options);
  const result = { single: run(preset, { targets: 1 }), spread: run(), idle: run(preset, { inputs: [] }),
    noCount: run(withoutSovereignAffixes(preset, ['proj_count'])),
    noConsume: run(withoutSovereignAffixes(preset, ['shock_consume'])),
    noEnchant: run(withoutSovereignAffixes(preset, ['shocking_hits', 'shock_chance'])) };
  if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
}

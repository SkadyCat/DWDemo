// Reproducible acquisition journey. Only real tower kills award loot and money.
// The pilot can inspect acquired gear and buy existing crafting items at actual shop prices.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRuleFiles, PROJECT_ROOT } from './rule-files.mjs';
import { checkRuleSet, createProgression, awardBattleKill, identifyEquipment, progressionLoadout, equipmentRandom, availableSkills, skillSlots, listings, craftEquipment, omenFamily, findStat } from '../engine/index.mjs';
import { Battle } from '../public/sim/battle.mjs';
import { TowerRun } from '../public/sim/dungeon-battle.mjs';
import { TowerPilot, ruleFilesHash } from './test-tower.mjs';
import { HERO_TARGET_ID } from '../public/sim/arena.mjs';

const DT = 1 / 60, round = n => +n.toFixed(3), clone = value => JSON.parse(JSON.stringify(value));
const boundSkills = (state, collections) => {
  const weapon = state.instances[state.loadout.equipment.weapon];
  const choices = availableSkills(state.owned.skill, state.loadout.equipment, collections, state.instances);
  return skillSlots([weapon?.skill, ...choices.map(s => s.id).filter(id => id !== weapon?.skill)]);
};

// A separate, non-rewarding target-range measurement guides gear choices. Its actors never
// enter the journey: three stationary targets at 7.5 m, 40% resistance, 8 seconds of real casts.
function measure(files, check, loadout) {
  const b = new Battle(files, { collections: check.collections, spawnRate: 0, maxMonsters: 0, seed: 18 });
  b.setLoadout(loadout); b.spawnMonsters(3);
  b.monsters.forEach((m, i) => {
    Object.assign(m, { x: 750, y: (i - 1) * 250, health: 1e7, maxHealth: 1e7, lastHealth: 1e7, shield: 0, maxShield: 0, speed: 0, cooldown: 999, attackRange: 0, resistance: [40, 40, 40, 40] });
    m.type = { ...m.type, skills: [] };
  });
  b.setAim(750, 0); b.hero.casting = true;
  for (let frame = 0; frame < 480; frame++) b.step(DT);
  const c = b.character;
  const blocks = c.blockChances({ spell: true }), evades = c.evadeChances({ spell: true });
  const armorFactor = 1 - Math.min(.9, c.armourValue() / (c.armourValue() + 200 * c.base.armourFactor));
  const defense = b.host.world.plans[b.host.world.targetDefensePlans.get(HERO_TARGET_ID)]?.stats;
  const res = ['fire', 'frost', 'lightning'].map(element => defense ? Math.min(defense.from(findStat(`element.${element}.resistance`), 0), defense.get(findStat(`element.${element}.max_resistance`))) : 0);
  const meanTaken = Math.max(.05, (armorFactor + res.reduce((sum, r) => sum + (1 - r / 100), 0)) / 4
    * (1 - (blocks.attack + blocks.spell) / 200) * (1 - (evades.attack + evades.spell) / 200));
  const life = c.maxLife, shield = c.maxShield;
  const ehp = (life + shield) / meanTaken;
  const dps = b.damageDealt / 8;
  if (![dps, ehp, dps * ehp].every(Number.isFinite)) {
    fs.writeFileSync(path.join(PROJECT_ROOT, 'Saved/TowerTests/progression-invalid.json'), JSON.stringify({ loadout, dps, ehp, armorFactor, res, life, shield }, null, 2));
    throw new Error('装备评估出现非有限伤害，见 Saved/TowerTests/progression-invalid.json');
  }
  // A player's ranking heuristic, not a new rule or a claim of optimality.
  return { dps: round(dps), life: round(life), shield: round(shield), ehp: round(ehp), score: dps * ehp, casts: b.hero.casts };
}

export function runProgression({ files, check, seed = 18, monsterCount = 20, attempts = 8, maxFloors = 20, craftsPerAttempt = 6, onEvent = null }) {
  const state = createProgression(check.collections, check.library), random = equipmentRandom(seed ^ 0x4c4f4f54);
  const craftRandom = equipmentRandom(seed ^ 0x43524146), pilot = new TowerPilot({ mode: 'kite' });
  const events = [], runs = [], cache = new Map();
  const emit = entry => { events.push(entry); onEvent?.(entry); };
  const snapshot = item => ({ uid: item.uid, baseId: item.baseId, name: item.name, slot: item.slot, tier: item.tier, rarity: item.rarity, skill: item.skill, bases: clone(item.bases || []), affixes: clone(item.affixes), legendary: clone(item.legendary), ...(item.reforgeTargets ? { reforgeTargets: [...item.reforgeTargets] } : {}) });
  const assess = () => {
    const loadout = progressionLoadout(state, check.collections), key = JSON.stringify(loadout);
    if (!cache.has(key)) cache.set(key, measure(files, check, loadout));
    return cache.get(key);
  };
  const improve = attempt => {
    for (const pending of Object.values(state.instances).filter(item => item.identified === false)) {
      const item = identifyEquipment(pending, check.collections.equipment.get(pending.baseId)?.doc, check.library, { random: craftRandom });
      state.instances[item.uid] = item; emit({ event: 'identify', attempt, item: snapshot(item) });
    }
    let current = assess();
    for (const slot of ['weapon', 'helmet', 'chest', 'gloves', 'boots', 'belt', 'offhand', 'amulet', 'ring']) {
      const previous = state.loadout.equipment[slot];
      let best = previous, bestValue = current;
      for (const item of Object.values(state.instances).filter(i => i.slot === slot && i.uid !== previous && (i.affixes.length || i.legendary || slot === 'weapon'))) {
        state.loadout.equipment[slot] = item.uid; state.loadout.skills = boundSkills(state, check.collections);
        const value = assess();
        if (value.score > bestValue.score * 1.001) { best = item.uid; bestValue = value; }
      }
      if (best) state.loadout.equipment[slot] = best; else delete state.loadout.equipment[slot];
      state.loadout.skills = boundSkills(state, check.collections);
      if (best !== previous) emit({ event: 'equip', attempt, before: previous || null, item: snapshot(state.instances[best]), measurement: bestValue });
      current = bestValue;
    }
    return current;
  };
  const shop = listings(check.collections, check.catalog), currency = shop.find(l => l.kind === 'item' && l.doc.category === 'currency');
  const omens = shop.filter(l => l.kind === 'item' && l.doc.category === 'omen');
  const buy = listing => {
    if (!listing || state.stones < listing.price) return false;
    state.stones -= listing.price; state.stats.spent += listing.price;
    state.owned.item[listing.id] = (state.owned.item[listing.id] || 0) + 1;
    return true;
  };
  const craft = attempt => {
    for (let i = 0; i < craftsPerAttempt && currency && state.stones >= currency.price; i++) {
      const equipped = new Set(Object.values(state.loadout.equipment));
      const candidates = Object.values(state.instances).filter(item => item.affixes.length && item.tier >= 2 && !equipped.has(item.uid));
      if (!candidates.length) break;
      // Craft actual acquired high-tier, many-affix bases, not reconstructed desired items.
      candidates.sort((a, b) => (b.tier * b.affixes.length) - (a.tier * a.affixes.length));
      const item = candidates[i % Math.min(3, candidates.length)];
      const before = snapshot(item);
      const family = i % 3 === 0 ? 'guard' : i % 3 === 1 ? 'ballistic' : 'vitality';
      const omen = omens.find(l => omenFamily(check.tags, l.doc) === family);
      const useOmen = omen && state.stones >= currency.price + omen.price;
      const index = item.reforgeTargets?.[0] ?? 0;
      if (!buy(currency)) break;
      if (useOmen) buy(omen);
      const result = craftEquipment(state, item.uid, { currencyId: currency.id, omenId: useOmen ? omen.id : '', index, random: craftRandom }, check.collections, check.library, check.tags);
      if (result.error) throw new Error(result.error);
      emit({ event: 'craft', attempt, index, cost: currency.price + (useOmen ? omen.price : 0), currency: currency.id, omen: useOmen ? omen.id : null, before, after: snapshot(result.after), stones: state.stones });
    }
  };
  const initial = clone(state), initialMeasurement = assess();
  emit({ event: 'start', state: initial, measurement: initialMeasurement });
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let measurement = improve(attempt);
    if (attempt > 1) { craft(attempt); measurement = improve(attempt); }
    const start = { stones: state.stones, kills: state.stats.kills, drops: state.progression.drops, loadout: clone(state.loadout), measurement };
    const tower = new TowerRun(files, { collections: check.collections, monsterTypes: [...check.monsters.values()].map(e => e.doc), seed: seed + attempt - 1, god: false, autoCast: false, monsterCount, timeLimitEnabled: true,
      onKill: (stones, monster) => {
        const item = awardBattleKill(state, stones, check.collections, check.library, { random, uid: `drop_${state.stats.kills + 1}` });
        if (item) emit({ event: 'drop', attempt, floor: tower.floor, time: round(tower.battle.elapsed), monster: monster.typeId || monster.name, boss: !!monster.boss, item: snapshot(item) });
      } });
    tower.setLoadout(progressionLoadout(state, check.collections)); state.stats.battles++;
    const floors = [];
    while (tower.floor <= maxFloors) {
      const b = tower.battle;
      if (!['cleared', 'failed'].includes(b.phase)) { pilot.update(b); tower.step(DT); }
      if (b.phase === 'cleared') {
        floors.push({ floor: b.floor, result: 'cleared', seconds: round(b.elapsed), killed: b.kills, spawned: b.spawned, wavesCompleted: b.wavesCompleted, bossKilled: b.boss?.health <= 0, life: round(b.character.life), maxLife: round(b.character.maxLife), damage: round(b.damageDealt), incoming: round(b.damageTaken) });
        measurement = improve(attempt); tower.setLoadout(progressionLoadout(state, check.collections));
        if (!tower.advance()) throw new Error('通关后进入下一层失败');
      } else if (b.phase === 'failed') {
        floors.push({ floor: b.floor, result: b.failureReason, seconds: round(b.elapsed), killed: b.kills, spawned: b.spawned, wavesCompleted: b.wavesCompleted, bossLife: b.boss ? round(b.boss.health) : null, bossMaxLife: b.boss ? round(b.boss.maxHealth) : null, life: round(b.character.life), maxLife: round(b.character.maxLife), damage: round(b.damageDealt), incoming: round(b.damageTaken) });
        break;
      }
    }
    const result = { attempt, seed: seed + attempt - 1, start, cleared: floors.filter(f => f.result === 'cleared').length, failedFloor: tower.floor, result: tower.battle.failureReason || 'limit', kills: state.stats.kills - start.kills, drops: state.progression.drops - start.drops, stones: state.stones, floors };
    runs.push(result); emit({ event: 'attempt', ...result });
  }
  return { schema: 1, rulesHash: ruleFilesHash(files), seed, monsterCount, attempts, craftsPerAttempt,
    conditions: { startingWeapon: 'frostthorn_staff', startingRarity: 'common', startingEquipmentTier: 1, startingAffixes: 0, startingMoney: 0, startingMaterials: 0, god: false, autoCast: false, presetGrants: false, floorTimeLimit: 30, rooms: 1, waves: 3,
      equipmentDropChance: .3, equipmentTierRange: [1, 10], affixTierRange: '1..equipment.tier', prices: Object.fromEntries([currency, ...omens].filter(Boolean).map(l => [l.id, l.price])),
      gearChoice: 'Greedy measured DPS × estimated EHP; target range is separate and awards nothing', retry: 'Failed runs restart at floor 1 with acquired gear; cleared floors carry life/shield/mana' },
    initial, initialMeasurement, runs, events, final: clone(state), finalMeasurement: assess() };
}

async function main() {
  const args = process.argv.slice(2), arg = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
  const files = readRuleFiles(), check = checkRuleSet(files); if (!check.ok) throw new Error(check.error);
  const report = runProgression({ files, check, seed: +arg('--seed', 18), monsterCount: +arg('--count', 20), attempts: +arg('--attempts', 8), maxFloors: +arg('--max-floors', 20), craftsPerAttempt: +arg('--crafts', 6),
    onEvent: e => { if (['start', 'equip', 'craft', 'attempt'].includes(e.event)) console.log(JSON.stringify(e.event === 'attempt' ? { event: e.event, attempt: e.attempt, cleared: e.cleared, failedFloor: e.failedFloor, result: e.result, kills: e.kills, drops: e.drops, stones: e.stones } : e)); } });
  const destination = path.resolve(arg('--out', path.join(PROJECT_ROOT, 'Saved/TowerTests/progression.json')));
  fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, JSON.stringify(report, null, 2) + '\n');
  console.log(`REPORT ${destination}`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

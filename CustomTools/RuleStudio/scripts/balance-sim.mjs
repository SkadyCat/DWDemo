// Progression balance probe: real DungeonBattle + the benchmark pilot, sweeping floor × level × gear.
// Usage: node scripts/balance-sim.mjs [floors=1,3,5] [levels=1,5,10] [gear=starter,rare]
import { readRuleFiles } from './rule-files.mjs';
import { checkRuleSet, createProgression, progressionLoadout, equipmentRandom } from '../engine/index.mjs';
import { DungeonBattle } from '../public/sim/dungeon-battle.mjs';
import { registerEquipmentDropLibrary, rollEquipment } from '../public/equipment-generation.mjs';
import { levelPart } from '../public/progression/journey.mjs';
import { TowerPilot } from './test-tower.mjs';

const files = readRuleFiles(), check = checkRuleSet(files); if (!check.ok) throw Error(check.error);
const { library, collections } = check; registerEquipmentDropLibrary(files, library, check.affixCategories);
const arg = (i, d) => (process.argv[i] || d).split(',');
const floors = arg(2, '1,2,3,4,5,6,8,10').map(Number), levels = arg(3, '1,5,10,15,20').map(Number), gears = arg(4, 'starter,magic,rare');
const SLOTS = ['helmet', 'chest', 'gloves', 'boots', 'belt', 'ring', 'amulet', 'offhand'];

export function loadoutFor(level, gear, floor, seed) {
  const p = createProgression(collections, library);
  if (gear !== 'starter') {
    const tier = Math.min(10, floor), random = equipmentRandom(seed);
    const weapon = rollEquipment(collections.equipment.get('frostthorn_staff').doc, library, { rarity: gear, tier, random, uid: 'w' });
    p.instances = { w: weapon }; p.loadout.equipment = { weapon: 'w' };
    for (const slot of SLOTS) {
      const bases = [...collections.equipment.values()].map(e => e.doc).filter(d => d.slot === slot && d.rarity !== 'legendary');
      if (!bases.length) continue;
      const item = rollEquipment(bases[Math.floor(random() * bases.length)], library, { rarity: gear, tier, random, uid: slot });
      p.instances[slot] = item; p.loadout.equipment[slot] = slot;
    }
  }
  const l = progressionLoadout(p, collections), part = levelPart(level);
  return { ...l, passives: part ? [part] : [] };
}

function run(floor, level, gear, seed = 7) {
  const b = new DungeonBattle(files, { collections, monsterTypes: [...check.monsters.values()].map(e => e.doc), floor, seed, monsterCount: 20 });
  b.setLoadout(loadoutFor(level, gear, floor, seed));
  if (b.hero.error) return { error: b.hero.error };
  const pilot = new TowerPilot({ mode: 'kite' }); const dt = 1 / 30;
  let t = 0;
  for (; t < 240 && b.phase !== 'cleared' && b.phase !== 'failed' && !b.hero.dead; t += dt) { pilot.update(b); b.step(dt); }
  return { cleared: b.phase === 'cleared', dead: b.hero.dead, t: Math.round(t), kills: b.kills, life: Math.round(b.character.maxLife) };
}

const rows = [];
if (import.meta.url === `file://${process.argv[1]}`) for (const gear of gears) for (const floor of floors) {
  const line = [gear.padEnd(7), String(floor).padStart(3)];
  for (const level of levels) {
    const r = run(floor, level, gear);
    line.push(r.error ? 'ERR' : `${r.cleared ? '✓' : r.dead ? '✗' : '…'}${String(r.t).padStart(3)}s k${String(r.kills).padStart(2)}`);
  }
  console.log(line.join(' | '));
}
if (import.meta.url === `file://${process.argv[1]}`) console.log('columns: levels', levels.join(','));

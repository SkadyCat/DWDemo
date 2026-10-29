import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readRuleFiles } from '../scripts/rule-files.mjs';
import { checkRuleSet, createProgression, progressionLoadout, availableSkills, validateTraitValueEntry,
  equipmentRandom, rollEquipmentDrop, rerollEquipment, listings } from '../engine/index.mjs';
import { applyBuildPreset } from '../public/build-presets.mjs';
import { Battle } from '../public/sim/battle.mjs';
import { DungeonBattle } from '../public/sim/dungeon-battle.mjs';
import { TowerPilot } from '../scripts/test-tower.mjs';
import { SUMMON_MYRIAD_ID, SUMMON_MYRIAD_PARTS, refreshSummonMyriadPreset } from '../scripts/create-summon-myriad-bd.mjs';
import { iconSrc } from '../public/game-icons.mjs';

const files = readRuleFiles(), checked = checkRuleSet(files);
assert.ok(checked.ok, checked.error);
const preset = JSON.parse(fs.readFileSync(new URL('../../../Content/Rules/Presets/summon_myriad_swords.json', import.meta.url), 'utf8'));
function state() {
  const save = createProgression(checked.collections, checked.library);
  assert.equal(applyBuildPreset(save, preset, checked.collections, checked.library).error, '');
  return save;
}
function battle(save = state(), collections = checked.collections) {
  const b = new Battle(files, { collections, maxMonsters: 0, spawnRate: 0, god: false, seed: 18 });
  b.setLoadout(progressionLoadout(save, collections));
  b.spawnMonsters(1);
  Object.assign(b.monsters[0], { x: 650, y: 0, health: 1e8, maxHealth: 1e8, speed: 0, cooldown: 999, attackRange: 0,
    shield: 0, maxShield: 0, resistance: [0, 0, 0, 0, 0, 0] });
  b.setAim(650, 0);
  return b;
}

test('召唤万剑: five independently obtainable legendaries use existing traits, one fixed line and five random lines', () => {
  const stock = listings(checked.collections, checked.catalog);
  assert.equal(Object.keys(preset.instances).length, 5);
  assert.equal(preset.authored.source, 'generated-existing-traits');
  for (const part of SUMMON_MYRIAD_PARTS) {
    const id = `summon_myriad_${part.slot}`, template = checked.collections.equipment.get(id).doc;
    const item = preset.instances[preset.equipment[part.slot]];
    assert.equal(template.legendary.id, part.legendary); assert.equal(item.baseId, id);
    assert.equal(item.rarity, 'legendary'); assert.equal(item.tier, 10); assert.equal(item.identified, true);
    assert.equal(item.affixes.length, 5); assert.equal(new Set(item.affixes.map(a => a.id)).size, 5);
    assert.deepEqual(item.bases.map(a => a.id), part.bases);
    for (const affix of [...item.bases, item.legendary, ...item.affixes]) {
      const visit = entry => { assert.equal(validateTraitValueEntry(checked.library, entry), '', entry.id); (entry.with || []).forEach(visit); };
      affix.traits.forEach(visit);
    }
    assert.ok(stock.some(row => row.id === id));
    const icon = fs.readFileSync(new URL('../public' + iconSrc('equipment', item), import.meta.url));
    assert.equal(icon.subarray(1, 4).toString(), 'PNG'); assert.equal(icon.readUInt32BE(16), 256);
    for (const tier of [1, 10]) {
      const drop = rollEquipmentDrop({ equipment: new Map([[id, { doc: template }]]) }, checked.library,
        { chance: 1, rarity: 'legendary', tier, maxTier: tier, random: equipmentRandom(17), uid: 'summon_drop' });
      assert.equal(drop.baseId, id); assert.equal(drop.tier, tier); assert.equal(drop.affixes.length, 5);
      const rerolled = rerollEquipment(drop, checked.library, { index: 0, random: equipmentRandom(19) });
      assert.deepEqual(rerolled.bases, drop.bases); assert.deepEqual(rerolled.legendary, drop.legendary);
    }
  }
});

test('召唤万剑: menu application binds the existing sentinel and preserves owned gear and currency on repeat', () => {
  const menu = JSON.parse(fs.readFileSync(new URL('../../../Content/Rules/Presets/index.json', import.meta.url), 'utf8'));
  assert.equal(menu.filter(row => row.id === SUMMON_MYRIAD_ID).length, 1);
  const save = createProgression(checked.collections, checked.library), starter = structuredClone(save.instances.starter_weapon);
  save.stones = 765;
  for (let i = 0; i < 2; i++) assert.equal(applyBuildPreset(save, preset, checked.collections, checked.library).error, '');
  assert.equal(save.stones, 765); assert.deepEqual(save.instances.starter_weapon, starter);
  assert.equal(Object.keys(save.instances).length, 6);
  assert.deepEqual(availableSkills({}, save.loadout.equipment, checked.collections, save.instances).map(row => row.id), ['sentinel']);
  assert.deepEqual(save.loadout.skills, ['sentinel', null, null, null]);
});

const speedTrait = id => ['minion_cast_speed', 'minion_skill_cooldown'].includes(id);
function removeSpeedBases(instances) {
  for (const item of Object.values(instances)) item.bases = item.bases?.filter(base => !speedTrait(base.id));
}

test('召唤万剑: fixed speed refresh also updates previously owned gear without rerolling its affixes', () => {
  const old = structuredClone(preset); removeSpeedBases(old.instances);
  const uid = old.equipment.weapon;
  old.instances[uid] = rerollEquipment(old.instances[uid], checked.library, { index: 0, random: equipmentRandom(81) });
  const snapshot = structuredClone(old), refreshed = refreshSummonMyriadPreset(old, checked.library, checked.collections);
  assert.deepEqual(old, snapshot, 'authoring refresh is pure');
  const save = state(); save.instances = structuredClone(old.instances);
  assert.equal(applyBuildPreset(save, preset, checked.collections, checked.library).error, '');
  const loaded = battle(save); // The same reconciliation used when the web battle receives an owned loadout.
  for (const [id, previous] of Object.entries(snapshot.instances)) {
    for (const current of [refreshed.instances[id], loaded.instances[id]]) {
      assert.deepEqual(current.affixes, previous.affixes); assert.deepEqual(current.legendary, previous.legendary);
      assert.deepEqual(current.bases.filter(base => !speedTrait(base.id)), previous.bases);
      assert.equal(current.bases.filter(base => speedTrait(base.id)).length, 1);
      assert.equal(current.uid, previous.uid);
    }
  }
});

test('召唤万剑: actual autonomous firing is nearly three times faster with no capacity drops', t => {
  const baselineCollections = structuredClone(checked.collections), baselineSave = state();
  removeSpeedBases(baselineSave.instances);
  for (const { slot } of SUMMON_MYRIAD_PARTS) {
    const doc = baselineCollections.equipment.get(`summon_myriad_${slot}`).doc;
    doc.bases = doc.bases.filter(base => !speedTrait(base.id));
  }
  function sample(b) {
    const volleys = new Map(), spawn = b.host.world.spawnProjectile.bind(b.host.world);
    b.host.world.spawnProjectile = (...args) => {
      const index = spawn(...args), minion = b.combat.rootInfo(args[1])?.minion;
      if (index >= 0 && minion) volleys.set(b.host.world.clock, (volleys.get(b.host.world.clock) || 0) + 1);
      return index;
    };
    b.hero.casting = true;
    for (let i = 0; i < 60 && !b.hero.casts; i++) b.step(1 / 60);
    b.hero.casting = false;
    for (let i = 1; i < 360; i++) { b.step(1 / 60); assert.equal(b.host.world.frameStats.CapacityDrops, 0); }
    assert.equal(b.hero.casts, 1); assert.equal(b.combat.minions.alive().length, 1);
    assert.ok([...volleys.values()].every(count => count === 143));
    const times = [...volleys.keys()], intervals = times.slice(1).map((time, i) => time - times[i]);
    return { rounds: times.length, interval: intervals.reduce((sum, n) => sum + n, 0) / intervals.length, intervals };
  }
  const before = sample(battle(baselineSave, baselineCollections)), after = sample(battle());
  const steady = after.intervals.slice(1), steadyInterval = steady.reduce((sum, n) => sum + n, 0) / steady.length;
  t.diagnostic(JSON.stringify({ before: { rounds: before.rounds, interval: before.interval },
    after: { rounds: after.rounds, firstInterval: after.intervals[0], steadyInterval } }));
  assert.ok(Math.abs(before.interval - 1) <= 1 / 60);
  // The first nextFire is scheduled at spawn, before the ordinary minion speed tick.
  assert.ok(Math.abs(after.intervals[0] - before.intervals[0]) < 1e-6);
  for (const interval of steady) assert.ok(interval >= 1 / 2.95 - 1e-6 && interval <= 1 / 2.95 + 1 / 60);
  assert.ok(before.interval / steadyInterval >= 2.8);
});

test('召唤万剑: three real summons each emit 143 actual ice lances, with no projectile capacity drops', () => {
  const b = battle(), births = [], spawn = b.host.world.spawnProjectile.bind(b.host.world);
  b.host.world.spawnProjectile = (...args) => {
    const index = spawn(...args), minion = b.combat.rootInfo(args[1])?.minion;
    if (index >= 0 && minion) births.push({ id: minion.id, clock: b.host.world.clock });
    return index;
  };
  b.hero.casting = true;
  for (let frame = 0; frame < 180; frame++) { b.step(1 / 60); assert.equal(b.host.world.frameStats.CapacityDrops, 0); }
  b.hero.casting = false;
  assert.equal(b.hero.casts, 3); assert.equal(b.combat.minions.controlCap(), 3); assert.equal(b.combat.minions.alive().length, 3);
  assert.ok(b.combat.minions.alive().every(s => s.kind === 'sentinel'));
  const ids = [...new Set(births.map(row => row.id))]; assert.equal(ids.length, 3);
  for (const id of ids) {
    const rows = births.filter(row => row.id === id), first = rows[0].clock;
    assert.equal(rows.filter(row => row.clock === first).length, 143, '13 native projectiles × 11 firing positions');
  }
});

test('召唤万剑: autonomous attacks keep damaging after player input stops; expiration releases roots', () => {
  const b = battle(); b.hero.casting = true; for (let i = 0; i < 180; i++) b.step(1 / 60); b.hero.casting = false;
  const before = b.damageDealt, casts = b.hero.casts;
  for (let i = 0; i < 180; i++) b.step(1 / 60);
  assert.ok(b.damageDealt > before); assert.equal(b.hero.casts, casts); assert.equal(b.hero.casting, false);
  for (const monster of b.monsters) monster.health = 0;
  for (let i = 0; i < 22 * 60; i++) b.step(1 / 60);
  assert.equal(b.combat.minions.alive().length, 0); assert.equal(b.host.world.carriers.num, 0); assert.equal(b.host.world.activeRoots(), 0);
});

for (const floor of [1, 3]) test(`召唤万剑: floor ${floor} clears three waves and Boss inside 30 seconds without god mode`, () => {
  const b = new DungeonBattle(files, { collections: checked.collections, monsterTypes: [...checked.monsters.values()].map(row => row.doc),
    floor, seed: 18, monsterCount: 20, timeLimitEnabled: true, god: false, autoCast: false });
  b.setLoadout(progressionLoadout(state(), checked.collections));
  const pilot = new TowerPilot({ mode: 'kite' });
  for (let frame = 0; frame < 31 * 60 && !['cleared', 'failed'].includes(b.phase); frame++) { pilot.update(b); b.step(1 / 60); }
  assert.equal(b.phase, 'cleared', b.failureReason); assert.equal(b.wavesCompleted, 3); assert.ok(b.boss.health <= 0);
  assert.ok(b.elapsed <= 30); assert.ok(b.hero.health > 0); assert.equal(b.hero.god, false); assert.equal(b.hero.autoCast, false);
});

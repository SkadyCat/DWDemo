import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readRuleFiles } from '../scripts/rule-files.mjs';
import { checkRuleSet, createProgression, progressionLoadout, equipmentAffixPool, equipmentBasePool, validateTraitValueEntry,
  rollEquipmentDrop, rerollEquipment, equipmentRandom, listings, ensureEquipmentInherentTraits } from '../engine/index.mjs';
import { applyBuildPreset } from '../public/build-presets.mjs';
import { Battle } from '../public/sim/battle.mjs';
import { DungeonBattle } from '../public/sim/dungeon-battle.mjs';
import { TowerPilot } from '../scripts/test-tower.mjs';
import { createMyriadSwordsPreset } from '../scripts/create-myriad-swords-bd.mjs';

const files = readRuleFiles(), check = checkRuleSet(files);
assert.ok(check.ok, check.error);
const preset = JSON.parse(fs.readFileSync(new URL('../../../Content/Rules/Presets/myriad_swords.json', import.meta.url), 'utf8'));
const legendaryPreset = JSON.parse(fs.readFileSync(new URL('../../../Content/Rules/Presets/myriad_swords_t1_legendary.json', import.meta.url), 'utf8'));

function appliedState(doc = preset) {
  const state = createProgression(check.collections, check.library);
  assert.equal(applyBuildPreset(state, doc, check.collections, check.library).error, '');
  return state;
}

function arena(doc = preset) {
  const b = new Battle(files, { collections: check.collections, maxMonsters: 0, spawnRate: 0, god: false, seed: 18 });
  b.setLoadout(progressionLoadout(appliedState(doc), check.collections));
  b.setAim(450, 0);
  return b;
}

function castOnce(b) {
  b.hero.casting = true;
  for (let frame = 0; frame < 120 && b.hero.casts < 1; frame++) b.step(1 / 60);
  b.hero.casting = false;
  assert.equal(b.hero.casts, 1);
}

test('万剑归宗: published preset has five current bases, six washable affixes each, and valid saved T10 numbers', () => {
  const index = JSON.parse(fs.readFileSync(new URL('../../../Content/Rules/Presets/index.json', import.meta.url), 'utf8'));
  assert.equal(index.filter(row => row.id === 'myriad_swords').length, 1);
  assert.deepEqual(preset.skills, ['frost_lance', null, null, null]);
  assert.equal(preset.authored.source, 'generated-existing-traits');
  assert.equal(preset.provenance, undefined);
  const pool = new Set(equipmentAffixPool(check.library).map(row => row.id));
  const items = Object.values(preset.instances);
  assert.equal(items.length, 5);
  for (const item of items) {
    const base = check.collections.equipment.get(item.baseId).doc;
    assert.equal(preset.equipment[item.slot], item.uid);
    assert.equal(item.slot, base.slot); assert.equal(item.skill, base.skills[0] || '');
    assert.equal(item.rarity, 'rare'); assert.equal(item.tier, 10); assert.equal(item.identified, true);
    assert.equal(item.legendary, null); assert.equal(item.affixes.length, 6);
    assert.equal(new Set(item.affixes.map(row => row.id)).size, 6);
    assert.ok(item.affixes.every(row => pool.has(row.id)));
    assert.equal(item.bases.length, 2); assert.equal(item.bases[0].id, base.bases[0].id);
    assert.notEqual(item.bases[0].id, item.bases[1].id);
    const basePool = new Set(equipmentBasePool(check.library, item.slot !== 'weapon').map(row => row.id));
    assert.ok(item.bases.every(row => basePool.has(row.id)));
    for (const affix of [...item.bases, ...item.affixes]) for (const trait of affix.traits) {
      assert.ok(check.library.trait(trait.id));
      assert.equal(validateTraitValueEntry(check.library, trait), '', trait.id);
      if (trait.tier !== undefined) assert.equal(trait.tier, 10);
      assert.equal(trait.with.length, 0, 'no stitched trigger or hidden auxiliary skill');
    }
  }
});

test('万剑归宗: repeated one-click application preserves owned inventory, money and the exact published rolls', () => {
  const state = createProgression(check.collections, check.library);
  const starter = structuredClone(state.instances.starter_weapon);
  state.stones = 321; state.owned.item.chaos_orb = 7;
  const owned = structuredClone(state.owned), stats = structuredClone(state.stats);
  for (let repeat = 0; repeat < 2; repeat++) assert.equal(applyBuildPreset(state, preset, check.collections, check.library).error, '');
  assert.equal(Object.keys(state.instances).length, 6);
  assert.deepEqual(state.instances.starter_weapon, starter);
  assert.deepEqual(state.owned, owned); assert.deepEqual(state.stats, stats); assert.equal(state.stones, 321);
  for (const [uid, item] of Object.entries(preset.instances)) assert.deepEqual(state.instances[uid], item);
  assert.deepEqual(state.loadout.skills, preset.skills); assert.deepEqual(state.loadout.equipment, preset.equipment);
});

test('万剑归宗: one normal cast emits 33 per volley, 99 primaries and 792 finite secondaries', () => {
  const b = arena(), world = b.host.world;
  let spawned = 0, peak = 0, drops = 0;
  const spawn = world.spawnProjectile.bind(world);
  world.spawnProjectile = (...args) => { const index = spawn(...args); if (index !== -1) spawned++; return index; };
  castOnce(b); assert.equal(spawned, 33);
  for (let frame = 0; frame < 5; frame++) b.step(1 / 60);
  assert.equal(spawned, 99);
  for (let frame = 0; frame < 180; frame++) {
    b.step(1 / 60); peak = Math.max(peak, world.carriers.num); drops += world.frameStats.CapacityDrops;
  }
  assert.equal(spawned, 891); assert.equal(peak, 792); assert.equal(drops, 0);
  assert.equal(world.carriers.num, 0, 'secondary projectiles finish without spawning another generation');
  assert.equal(b.hero.casts, 1); assert.equal(b.hero.god, false);
});

test('万剑归宗: real projectiles start around a hostile target, converge and deliver actual damage', () => {
  const b = arena(); b.spawnMonsters(1);
  const target = b.monsters[0];
  Object.assign(target, { x: 450, y: 0, health: 1e8, maxHealth: 1e8, speed: 0, cooldown: 999, shield: 0, maxShield: 0, resistance: [0, 0, 0, 0] });
  if (target.skillCooldowns) target.skillCooldowns.fill(999);
  castOnce(b);
  const c = b.host.world.carriers, primaries = Array.from({ length: c.num }, (_, index) => index);
  assert.ok(primaries.some(i => c.px[i] > target.x / 100 && c.vx[i] < 0), 'a sword behind the target flies back toward it');
  assert.ok(primaries.some(i => c.py[i] > 1) && primaries.some(i => c.py[i] < -1), 'swords also start on both sides');
  for (let frame = 0; frame < 120; frame++) b.step(1 / 60);
  assert.ok(b.damageDealt > 0); assert.ok(target.health < target.maxHealth);
  assert.equal(b.hero.casts, 1); assert.equal(b.hero.god, false);
});

test('万剑归宗: normal movement, aim and casting clear three waves and Boss within the existing 30-second limit', () => {
  const b = new DungeonBattle(files, { collections: check.collections, monsterTypes: [...check.monsters.values()].map(row => row.doc),
    floor: 1, seed: 18, monsterCount: 20, timeLimitEnabled: true, god: false, autoCast: false });
  b.setLoadout(progressionLoadout(appliedState(), check.collections));
  const pilot = new TowerPilot({ mode: 'kite' });
  for (let frame = 0; frame < 31 * 60 && !['cleared', 'failed'].includes(b.phase); frame++) { pilot.update(b); b.step(1 / 60); }
  assert.equal(b.phase, 'cleared', b.failureReason);
  assert.equal(b.wavesCompleted, 3); assert.ok(b.boss && b.boss.health <= 0);
  assert.ok(b.elapsed <= 30); assert.ok(b.hero.health > 0);
  assert.equal(b.hero.god, false); assert.equal(b.hero.autoCast, false);
});

test('万剑初成: five legendary T1 designs and instances use existing valid rolls, one fixed line and five washable lines', () => {
  const expected = { weapon: ['multiple_projectiles'], helmet: ['proj_layout_converge'], chest: ['proj_origins'], gloves: ['proj_origins'], boots: ['proj_origins'] };
  const bases = { weapon: ['proj_count','proj_origins'], helmet: ['proj_retarget','proj_homing_range','proj_homing_turn'], chest: ['proj_origins'], gloves: ['proj_count'], boots: ['proj_retarget_on_death'] };
  assert.deepEqual(legendaryPreset, createMyriadSwordsPreset(check.library, check.collections), 'the preview uses actual random drop and identification rolls, without a selected affix list');
  const index = JSON.parse(fs.readFileSync(new URL('../../../Content/Rules/Presets/index.json', import.meta.url), 'utf8'));
  assert.equal(index.filter(row => row.id === 'myriad_swords_t1_legendary').length, 1);
  const pool = new Set(equipmentAffixPool(check.library).map(row => row.id));
  const shop = listings(check.collections, check.catalog);
  const items = Object.values(legendaryPreset.instances);
  assert.equal(items.length, 5);
  for (const item of items) {
    const base = check.collections.equipment.get(item.baseId).doc;
    assert.equal(base.rarity, 'legendary'); assert.equal(item.rarity, 'legendary');
    assert.equal(item.tier, 1); assert.equal(item.identified, true);
    assert.equal(item.name, base.name); assert.match(item.name, /^万剑·/);
    assert.equal(legendaryPreset.equipment[item.slot], item.uid);
    assert.equal(base.legendary.id, expected[item.slot][0]);
    assert.deepEqual(base.traits.map(t => t.id), expected[item.slot]);
    assert.deepEqual(item.legendary.traits.map(t => t.id), expected[item.slot]);
    assert.equal(item.legendary.traits[0].id, base.legendary.id);
    assert.ok(shop.some(row => row.id === base.id && row.rarity === 'legendary'));
    assert.equal(item.affixes.length, 5); assert.equal(new Set(item.affixes.map(a => a.id)).size, 5);
    assert.ok(item.affixes.every(a => pool.has(a.id) && !expected[item.slot].includes(a.id)));
    assert.deepEqual(item.bases.map(b => b.id), bases[item.slot]);
    assert.deepEqual(base.bases.map(b => b.id), bases[item.slot]);
    for (const affix of [...item.bases, item.legendary, ...item.affixes]) for (const trait of affix.traits) {
      assert.equal(validateTraitValueEntry(check.library, trait), '', trait.id);
      if (trait.tier !== undefined) assert.equal(trait.tier, 1);
      assert.equal(trait.with.length, 0);
    }
    for (const options of [{ index: 0 }, {}]) {
      const changed = rerollEquipment(item, check.library, { ...options, random: equipmentRandom(18) });
      assert.deepEqual(changed.legendary, item.legendary); assert.deepEqual(changed.bases, item.bases);
      assert.equal(changed.affixes.length, 5);
    }
    const isolated = { equipment: new Map([[base.id, { doc: base }]]) };
    for (const rarity of ['common', 'magic', 'rare']) assert.equal(rollEquipmentDrop(isolated, check.library, { chance: 1, rarity }), null);
    const identified = rollEquipmentDrop(isolated, check.library, { chance: 1, rarity: 'legendary', maxTier: 1, random: equipmentRandom(18), identified: true });
    assert.equal(identified.rarity, 'legendary'); assert.equal(identified.tier, 1);
    assert.deepEqual(identified.legendary.traits.map(t => t.id), expected[item.slot]); assert.equal(identified.affixes.length, 5);
  }
  assert.equal(items.find(item => item.slot === 'weapon').skill, 'frost_lance');
});

test('万剑初成: repeated one-click application adds five items without spending or replacing owned gear', () => {
  const state = createProgression(check.collections, check.library);
  state.stones = 321; state.owned.item.chaos_orb = 7;
  const before = structuredClone(state);
  for (let repeat = 0; repeat < 2; repeat++) assert.equal(applyBuildPreset(state, legendaryPreset, check.collections, check.library).error, '');
  assert.equal(Object.keys(state.instances).length, Object.keys(before.instances).length + 5);
  assert.deepEqual(state.instances.starter_weapon, before.instances.starter_weapon);
  assert.deepEqual(state.owned, before.owned); assert.equal(state.stones, before.stones);
  for (const [uid, item] of Object.entries(legendaryPreset.instances)) assert.deepEqual(state.instances[uid], item);
  assert.deepEqual(state.loadout.equipment, legendaryPreset.equipment); assert.deepEqual(state.loadout.skills, legendaryPreset.skills);
});

test('万剑初成: one ordinary cast emits thirty projectiles in its first frame, converges and deals damage', () => {
  const b = arena(legendaryPreset), world = b.host.world;
  let count = 0, drops = 0;
  const spawn = world.spawnProjectile.bind(world);
  world.spawnProjectile = (...args) => { const index = spawn(...args); if (index !== -1) count++; return index; };
  castOnce(b); assert.equal(count, 30); assert.equal(world.carriers.num, 30);
  for (let frame = 0; frame < 15; frame++) b.step(1 / 60);
  assert.equal(count, 30, 'the first batch contains all thirty; no later volley is needed');
  for (let frame = 0; frame < 180; frame++) { b.step(1 / 60); drops += world.frameStats.CapacityDrops; }
  assert.equal(count, 30); assert.equal(drops, 0); assert.equal(world.carriers.num, 0);
  assert.equal(b.hero.casts, 1); assert.equal(b.hero.god, false);
  const targeted = arena(legendaryPreset); targeted.spawnMonsters(1);
  const target = targeted.monsters[0];
  Object.assign(target, { x: 450, y: 0, health: 1e8, maxHealth: 1e8, speed: 0, cooldown: 999, shield: 0, maxShield: 0, resistance: [0, 0, 0, 0] });
  if (target.skillCooldowns) target.skillCooldowns.fill(999);
  castOnce(targeted);
  const c = targeted.host.world.carriers;
  assert.ok(Array.from({ length: c.num }, (_, i) => i).some(i => c.px[i] > target.x / 100 && c.vx[i] < 0));
  for (let frame = 0; frame < 120; frame++) targeted.step(1 / 60);
  assert.ok(targeted.damageDealt > 0); assert.ok(target.health < target.maxHealth);
});

test('万剑初成: the five real shop templates and their identified fixed lines both produce thirty without any random affixes', () => {
  const shop = listings(check.collections, check.catalog).filter(row => row.kind === 'equipment' && row.id.startsWith('myriad_swords_t1_'));
  assert.equal(shop.length, 5);
  for (const identified of [false, true]) {
    const equipment = {}, instances = {};
    for (const row of shop) {
      if (!identified) { equipment[row.doc.slot] = row.id; continue; }
      const isolated = { equipment: new Map([[row.id, { doc: row.doc }]]) };
      const item = rollEquipmentDrop(isolated, check.library, { chance: 1, rarity: 'legendary', maxTier: 1, random: equipmentRandom(18), uid: `bought_${row.id}`, identified: true });
      assert.equal(item.affixes.length, 5);
      // Isolate the immutable design: random rolls must not be required to assemble its core.
      item.affixes = []; instances[item.uid] = item; equipment[item.slot] = item.uid;
    }
    const b = new Battle(files, { collections: check.collections, maxMonsters: 0, spawnRate: 0, god: false });
    b.setLoadout({ skills: ['frost_lance'], equipment, instances }); b.setAim(450, 0);
    assert.ok(b.character.stat('proj.homing_range') > 0);
    assert.ok(b.character.stat('proj.homing_turn') > 0);
    assert.ok(b.character.stat('proj.retarget') > 0);
    assert.ok(b.character.stat('proj.retarget_on_death') > 0);
    let count = 0; const spawn = b.host.world.spawnProjectile.bind(b.host.world);
    b.host.world.spawnProjectile = (...args) => { const index = spawn(...args); if (index !== -1) count++; return index; };
    castOnce(b); assert.equal(count, 30);
    for (let frame = 0; frame < 240; frame++) b.step(1 / 60);
    assert.equal(count, 30); assert.equal(b.hero.casts, 1); assert.equal(b.host.world.carriers.num, 0);
  }
});

test('万剑基底: existing identified items gain the authored fixed bases while keeping random rolls, reroll targets and rolled legendary values', () => {
  for (const source of Object.values(legendaryPreset.instances)) {
    const item = structuredClone(source), template = check.collections.equipment.get(item.baseId).doc;
    item.bases = [{ id: 'life_base', traits: [{ id: 'life_base', params: { n: 38 }, with: [], tier: 1 }], tier: 1 }];
    item.legendary.traits.push({ id: 'proj_count', params: { n: 1 }, with: [], tier: 1 });
    item.reforgeTargets = [2, 4];
    const before = structuredClone(item);
    ensureEquipmentInherentTraits(item, template, check.library);
    assert.deepEqual(item.bases.map(b => b.id), template.bases.map(b => b.id));
    assert.deepEqual(item.legendary.traits, [before.legendary.traits[0]]);
    assert.deepEqual(item.affixes, before.affixes); assert.deepEqual(item.reforgeTargets, before.reforgeTargets);
    assert.equal(item.uid, before.uid); assert.equal(item.tier, before.tier);
    const fixed = structuredClone(item); ensureEquipmentInherentTraits(item, template, check.library); assert.deepEqual(item, fixed);
  }
});

test('万剑初成: removing one fixed source reduces the first batch, and old preview UIDs cannot retain an old configuration', () => {
  const state = appliedState(legendaryPreset);
  delete state.loadout.equipment.gloves;
  const b = new Battle(files, { collections: check.collections, maxMonsters: 0, spawnRate: 0, god: false });
  b.setLoadout(progressionLoadout(state, check.collections));
  let count = 0; const spawn = b.host.world.spawnProjectile.bind(b.host.world);
  b.host.world.spawnProjectile = (...args) => { const index = spawn(...args); if (index !== -1) count++; return index; };
  castOnce(b); for (let frame = 0; frame < 240; frame++) b.step(1 / 60);
  assert.equal(count, 20, 'removing the gloves loses one projectile per origin and one origin');
  const saved = createProgression(check.collections, check.library), oldUids = [];
  for (const item of Object.values(legendaryPreset.instances)) {
    const old = structuredClone(item); old.uid = `legendary_myriad_swords_t1_${item.slot}`;
    saved.instances[old.uid] = old; oldUids.push(old.uid);
  }
  const before = structuredClone(saved.instances);
  assert.equal(applyBuildPreset(saved, legendaryPreset, check.collections, check.library).error, '');
  for (const uid of oldUids) assert.deepEqual(saved.instances[uid], before[uid]);
  for (const [slot, uid] of Object.entries(saved.loadout.equipment)) {
    assert.ok(!oldUids.includes(uid)); assert.equal(uid, legendaryPreset.equipment[slot]);
    assert.deepEqual(saved.instances[uid], legendaryPreset.instances[uid]);
  }
});

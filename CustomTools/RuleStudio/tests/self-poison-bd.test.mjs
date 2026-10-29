import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readRuleFiles } from '../scripts/rule-files.mjs';
import { checkRuleSet, createProgression, validateTraitValueEntry } from '../engine/index.mjs';
import { SELF_POISON_BD, createSelfPoisonPreset } from '../scripts/create-self-poison-bd.mjs';
import { applyBuildPreset } from '../public/build-presets.mjs';
import { Battle } from '../public/sim/battle.mjs';

const files = readRuleFiles(), check = checkRuleSet(files);
assert.ok(check.ok, check.error);
const preset = JSON.parse(fs.readFileSync(new URL('../../../Content/Rules/Presets/self_poison_flasks.json', import.meta.url), 'utf8'));
const dt = 1 / 60;

function arena({ range = 600, health = 1e9, selfPoison = true } = {}) {
  const loadout = structuredClone(preset);
  if (!selfPoison) loadout.instances[loadout.equipment.weapon].affixes = loadout.instances[loadout.equipment.weapon].affixes.filter(a => a.id !== 'poison_self');
  const battle = new Battle(files, { collections: check.collections, maxMonsters: 0, spawnRate: 0, god: false, seed: 18 });
  battle.setLoadout(loadout);
  battle.spawnMonsters(1);
  Object.assign(battle.monsters[0], { x: range, y: 0, health, maxHealth: health, speed: 0, cooldown: 999, shield: 0, maxShield: 0, attackRange: 0, resistance: [0, 0, 0, 0] });
  battle.setAim(range, 0);
  const observed = { casts: 0, last: 0, projectiles: 0, hitEvents: 0 };
  const register = battle.combat.register.bind(battle.combat);
  battle.combat.register = (root, info) => {
    if (info.triggered) {
      assert.equal(info.trigger.name, 'trig_life_lost', 'only the authored life-loss trigger starts extra casts');
      const landing = battle.host.world.roots[root].targetPoint;
      assert.ok(landing && Math.abs(landing.x - range / 100) < .001 && Math.abs(landing.y) < .001,
        'generic trigger targeting supplies the selected enemy point to parabolic casts');
      observed.casts++; observed.last = battle.elapsed;
    }
    return register(root, info);
  };
  const spawn = battle.host.world.spawnProjectile.bind(battle.host.world);
  battle.host.world.spawnProjectile = (...args) => { const index = spawn(...args); if (index >= 0) observed.projectiles++; return index; };
  const emit = battle.character.emit.bind(battle.character);
  battle.character.emit = (type, ...args) => { if (type === 'hit_taken') observed.hitEvents++; return emit(type, ...args); };
  const tick = seconds => { for (let i = 0; i < seconds * 60; ++i) battle.step(dt); };
  battle.hero.casting = true;
  for (let i = 0; i < 120 && battle.hero.casts < 1; ++i) battle.step(dt);
  battle.hero.casting = false;
  assert.equal(battle.hero.casts, 1);
  return { battle, observed, tick };
}

test('自毒连投: reproducible five-piece rare equipment uses only existing traits and valid ranked values', () => {
  assert.deepEqual(preset, createSelfPoisonPreset(check.library, check.collections));
  const index = JSON.parse(fs.readFileSync(new URL('../../../Content/Rules/Presets/index.json', import.meta.url), 'utf8'));
  assert.deepEqual(index.find(row => row.id === SELF_POISON_BD.id), SELF_POISON_BD);
  assert.equal(Object.keys(preset.instances).length, 5);
  assert.deepEqual(preset.skills, ['poison_flask', null, null, null]);
  assert.equal(preset.provenance, undefined, 'generated gear must not claim it was earned');
  const validate = (entry, tier) => {
    assert.ok(check.library.trait(entry.id));
    assert.equal(validateTraitValueEntry(check.library, entry), '');
    if (entry.tier) assert.equal(entry.tier, tier, 'all numeric parts of one compound affix share a tier');
    entry.with.forEach(child => validate(child, tier));
  };
  for (const item of Object.values(preset.instances)) {
    assert.equal(item.rarity, 'rare'); assert.equal(item.tier, 10);
    assert.equal(item.affixes.length, 6); assert.equal(item.legendary, null);
    assert.equal(item.slot, check.collections.equipment.get(item.baseId).doc.slot);
    assert.equal(new Set(item.affixes.map(a => a.id)).size, 6);
    item.affixes.forEach(a => a.traits.forEach(t => validate(t, a.tier)));
  }
});

test('自毒连投: one-click application preserves existing gear, resources and earned statistics; applying twice adds no duplicates', () => {
  const save = createProgression(check.collections, check.library);
  save.stones = 123; save.owned.item.chaos_orb = 4; save.stats.kills = 37;
  const starter = structuredClone(save.instances.starter_weapon), stats = structuredClone(save.stats);
  assert.equal(applyBuildPreset(save, preset, check.collections, check.library).error, '');
  assert.equal(applyBuildPreset(save, preset, check.collections, check.library).error, '');
  assert.equal(save.stones, 123); assert.equal(save.owned.item.chaos_orb, 4);
  assert.deepEqual(save.instances.starter_weapon, starter); assert.deepEqual(save.stats, stats);
  assert.equal(Object.keys(save.instances).length, 6);
  assert.deepEqual(save.loadout.equipment, preset.equipment);
});

test('自毒连投: a single manual cast sustains real poison flasks for five minutes without incoming hits or god mode', () => {
  const { battle: b, observed, tick } = arena();
  tick(300);
  assert.equal(b.hero.casts, 1); assert.equal(b.hero.god, false);
  assert.ok(observed.last > 299 && observed.casts > 1000);
  assert.ok(observed.projectiles > 9000);
  assert.ok(b.damageDealt > 100000 && b.character.totals.lifeLost > b.character.maxLife);
  assert.equal(b.damageTaken, 0); assert.equal(observed.hitEvents, 0);
  assert.equal(b.character.dead, false); assert.ok(b.character.mana > 50);
  assert.ok(b.character.selfPoison.length > 0);
});

test('自毒连投: existing target-centered trigger placement sustains nearby and distant targets', () => {
  for (const range of [150, 900, 1500]) {
    const { battle: b, observed, tick } = arena({ range });
    tick(30);
    assert.equal(b.hero.casts, 1); assert.ok(observed.last > 29, `distance ${range} cm`);
    assert.ok(observed.casts > 100 && b.damageDealt > 10000);
    assert.equal(b.character.dead, false); assert.equal(b.damageTaken, 0);
  }
});

test('自毒连投: removing self-poison prevents the loop despite enemy poison damage', () => {
  const { battle: b, observed, tick } = arena({ selfPoison: false });
  tick(30);
  assert.ok(b.damageDealt > 0); assert.equal(observed.casts, 0);
  assert.equal(b.character.selfPoison.length, 0); assert.equal(b.character.totals.lifeLost, 0);
});

test('自毒连投: after the last enemy dies, self-poison expires and automatic casts stop', () => {
  const { battle: b, observed, tick } = arena({ health: 1000 });
  tick(15);
  assert.ok(b.monsters.every(m => m.health <= 0));
  assert.equal(b.character.selfPoison.length, 0);
  const casts = observed.casts;
  tick(15);
  assert.equal(observed.casts, casts); assert.equal(b.hero.casts, 1);
});

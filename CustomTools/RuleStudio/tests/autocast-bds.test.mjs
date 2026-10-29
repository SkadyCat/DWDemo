import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readRuleFiles } from '../scripts/rule-files.mjs';
import { checkRuleSet, createProgression, validateTraitValueEntry } from '../engine/index.mjs';
import { AUTOCAST_BDS, createAutocastPresets } from '../scripts/create-autocast-bds.mjs';
import { applyBuildPreset } from '../public/build-presets.mjs';
import { Battle } from '../public/sim/battle.mjs';

const files = readRuleFiles(), check = checkRuleSet(files);
assert.ok(check.ok, check.error);
const published = config => JSON.parse(fs.readFileSync(new URL(`../../../Content/Rules/Presets/${config.id}.json`, import.meta.url), 'utf8'));

function arena(config, { targets = !!config.needsTarget, health = 1e9 } = {}) {
  const b = new Battle(files, { collections: check.collections, maxMonsters: 0, spawnRate: 0, god: false, seed: 18 });
  b.setLoadout(published(config));
  assert.ok(b.hero.plan >= 0, b.hero.error);
  if (targets) {
    b.spawnMonsters(1);
    Object.assign(b.monsters[0], { x: 600, y: 0, health, maxHealth: health, speed: 0, cooldown: 9999, shield: 0, maxShield: 0, attackRange: 0, resistance: [0, 0, 0, 0] });
  }
  b.setAim(600, 0);
  const observed = { casts: 0, last: 0 };
  const register = b.combat.register.bind(b.combat);
  b.combat.register = (root, info) => {
    if (info.kind === 'trigger') { observed.casts++; observed.last = b.elapsed; }
    return register(root, info);
  };
  if (config.startup) {
    b.hero.casting = true;
    for (let i = 0; i < 1200 && b.hero.casts < config.startup; ++i) b.step(1 / 60);
    b.hero.casting = false;
    assert.equal(b.hero.casts, config.startup);
  }
  let frame = 0;
  const tick = (seconds, moving = !!config.moving) => {
    for (let i = 0; i < seconds * 60; ++i, ++frame) {
      b.hero.move = moving ? { x: Math.cos(frame / 60), y: Math.sin(frame / 60) } : { x: 0, y: 0 };
      b.step(1 / 60);
    }
  };
  return { b, observed, tick };
}

test('自动施法 BD: ten published builds use valid current weapons, six existing affixes per item and reproducible tier values', () => {
  const generated = createAutocastPresets(check.library, check.collections);
  assert.equal(generated.length, 10);
  const index = JSON.parse(fs.readFileSync(new URL('../../../Content/Rules/Presets/index.json', import.meta.url), 'utf8'));
  assert.ok(index.some(c => c.id === 'self_poison_flasks'), 'keep the previous self-poison BD');
  const validate = (trait, tier) => {
    assert.ok(check.library.trait(trait.id));
    assert.equal(validateTraitValueEntry(check.library, trait), '');
    if (trait.tier) assert.equal(trait.tier, tier);
    trait.with.forEach(t => validate(t, tier));
  };
  const allUids = new Set();
  for (const { config, preset } of generated) {
    assert.deepEqual(preset, published(config));
    if (config.id === 'autocast_mana_restored') assert.equal(index.filter(c => c.group === 'embers_echo').length, 5);
    else assert.equal(index.filter(c => c.id === config.id).length, 1);
    assert.equal(preset.provenance, undefined, 'never claim generated items were earned');
    assert.equal(Object.keys(preset.instances).length, 5);
    for (const item of Object.values(preset.instances)) {
      assert.ok(!allUids.has(item.uid)); allUids.add(item.uid);
      const base = check.collections.equipment.get(item.baseId).doc;
      assert.equal(item.slot, base.slot); assert.equal(item.skill, base.skills[0] || '');
      assert.equal(item.rarity, 'rare'); assert.equal(item.tier, 10); assert.equal(item.legendary, null);
      assert.equal(item.affixes.length, 6); assert.equal(new Set(item.affixes.map(a => a.id)).size, 6);
      item.affixes.forEach(a => a.traits.forEach(t => validate(t, a.tier)));
    }
  }
});

test('自动施法 BD: switching all ten through the real application preserves inventory and resources without duplicate grants', () => {
  const save = createProgression(check.collections, check.library);
  save.stones = 321; save.owned.item.chaos_orb = 9; save.stats.kills = 67;
  const starter = structuredClone(save.instances.starter_weapon), stats = structuredClone(save.stats);
  for (const config of AUTOCAST_BDS) {
    const preset = published(config);
    for (let repeat = 0; repeat < 2; repeat++) assert.equal(applyBuildPreset(save, preset, check.collections, check.library).error, '');
    assert.deepEqual(save.loadout.equipment, preset.equipment);
    assert.deepEqual(save.loadout.skills, preset.skills);
  }
  assert.equal(Object.keys(save.instances).length, 51);
  assert.equal(save.stones, 321); assert.equal(save.owned.item.chaos_orb, 9);
  assert.deepEqual(save.instances.starter_weapon, starter); assert.deepEqual(save.stats, stats);
});

for (const config of AUTOCAST_BDS) test(`自动施法 BD: ${config.name} sustains five minutes with its published startup instructions`, () => {
  const { b, observed, tick } = arena(config);
  tick(300);
  assert.equal(b.hero.casts, config.startup);
  assert.ok(observed.casts > 30 && observed.last >= b.elapsed - 10, JSON.stringify(observed));
  assert.equal(b.hero.god, false); assert.equal(b.character.dead, false);
  assert.equal(b.damageTaken, 0); assert.ok(b.character.mana > 50);
  if (config.needsTarget) assert.ok(b.damageDealt > 10000);
});

test('自动施法 BD: all published builds damage a real enemy after releasing manual cast input', () => {
  for (const config of AUTOCAST_BDS) {
    const { b, observed, tick } = arena(config, { targets: true });
    const before = b.damageDealt;
    tick(30);
    assert.ok(observed.casts > 0 && b.damageDealt > before + 100, `${config.name}: ${b.damageDealt - before}`);
    assert.equal(b.hero.casts, config.startup);
  }
});

test('自动施法 BD: standing and moving builds stop and resume with their actual movement condition', () => {
  for (const [id, active] of [['autocast_still', false], ['autocast_moving', true]]) {
    const config = AUTOCAST_BDS.find(c => c.id === id), { observed, tick } = arena(config);
    tick(10, active); const started = observed.casts; assert.ok(started > 5);
    tick(1, !active); const stopped = observed.casts;
    tick(10, !active); assert.equal(observed.casts, stopped);
    tick(10, active); assert.ok(observed.casts > stopped + 5);
  }
});

test('自动施法 BD: flying return survives the last kill, whereas poison and shock require a new target', () => {
  for (const id of ['autocast_return', 'autocast_poison', 'autocast_shock']) {
    const config = AUTOCAST_BDS.find(c => c.id === id), { b, observed, tick } = arena(config, { targets: true, health: 1000 });
    tick(20); assert.ok(b.monsters.every(m => m.health <= 0), config.name);
    const casts = observed.casts;
    tick(20);
    if (id === 'autocast_return') assert.ok(observed.casts > casts + 10 && observed.last > b.elapsed - 2);
    else assert.equal(observed.casts, casts);
    assert.equal(b.hero.casts, config.startup);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readRuleFiles } from '../scripts/rule-files.mjs';
import * as engine from '../engine/index.mjs';
import { GROWTH_BDS, growthTrait, growthStatuses } from '../scripts/growth-bds-data.mjs';
import { growthBuild, growthWeapon, growthIndexRow, createGrowthPreset, growthStageTable } from '../scripts/create-growth-bds.mjs';
import { GROWTH_STAGES } from '../public/progression/growth-stages.mjs';
import { choiceBases } from '../public/progression/quest-chain.mjs';
import { minimumTierPreset } from '../public/build-preset-tier.mjs';
import { applyBuildPreset } from '../public/build-presets.mjs';
import { Battle } from '../public/sim/battle.mjs';

const files = readRuleFiles(), check = engine.checkRuleSet(files);
assert.ok(check.ok, check.error);
const { library, collections } = check;
const rules = new URL('../../../Content/Rules/', import.meta.url);
const readJson = rel => JSON.parse(fs.readFileSync(new URL(rel, rules), 'utf8'));

test('成长型 BD：十一套全新主动技能，其中至少五套近战，文件与生成器一致', () => {
  assert.equal(GROWTH_BDS.length, 11);
  assert.ok(GROWTH_BDS.filter(bd => bd.melee).length >= 5);
  assert.equal(new Set(GROWTH_BDS.map(bd => bd.id)).size, GROWTH_BDS.length);
  for (const bd of GROWTH_BDS) {
    assert.deepEqual(readJson(`${bd.web ? 'WebTraits' : 'Traits'}/${bd.trait}.json`), growthTrait(bd), bd.trait);
    for (const s of growthStatuses(bd)) assert.deepEqual(readJson(`Statuses/${s.id}.json`), s, s.id);
    assert.deepEqual(readJson(`${bd.web ? 'WebBuilds' : 'Builds'}/${bd.id}.json`), growthBuild(bd), bd.id);
    assert.deepEqual(readJson(`Equipment/${bd.weapon.id}.json`), growthWeapon(bd), bd.weapon.id);
    assert.ok(library.build(bd.id), bd.id);
    const doc = collections.equipment.get(bd.weapon.id)?.doc;
    assert.equal(doc.slot, 'weapon'); assert.deepEqual(doc.skills, [bd.id]);
    // Melee skills are attacks: at least one damage action carries the melee tag.
    if (bd.melee) assert.ok(JSON.stringify(growthTrait(bd).rules[0]).includes('"melee"'), bd.id);
  }
  assert.deepEqual(GROWTH_STAGES, growthStageTable());
});

test('成长型 BD：技能特性带施放规则，不会进入装备随机词条池', () => {
  const pool = new Set(engine.equipmentAffixPool(library).flatMap(a => a.traits.map(t => t.id)));
  for (const bd of GROWTH_BDS) assert.ok(!pool.has(bd.trait), bd.trait);
});

test('成长型 BD：预设可复现、装备绑定技能、只用现有词条', () => {
  const index = readJson('Presets/index.json');
  const deps = { ...engine, minimumTierPreset, applyBuildPreset };
  for (const bd of GROWTH_BDS) {
    const preset = readJson(`Presets/growth_${bd.id}.json`);
    assert.deepEqual(preset, createGrowthPreset(bd, library, collections, deps), bd.id);
    assert.deepEqual(index.find(row => row.id === `growth_${bd.id}`), growthIndexRow(bd));
    assert.deepEqual(preset.skills, [bd.id, null, null, null]);
    const save = { owned: { skill: {}, equipment: {}, item: {} }, instances: {}, loadout: {} };
    assert.equal(applyBuildPreset(save, preset, collections, library).error, '', bd.id);
  }
});

test('成长型 BD：主线「第三层」三选一成长武器覆盖全部成长技能', () => {
  const ids = choiceBases('growth', collections).map(d => d.id).sort();
  assert.deepEqual(ids, GROWTH_BDS.map(bd => bd.weapon.id).sort());
});

// Real battle: every build casts, stacks its charge buff, releases a surge and grows to its final stage.
function run(bd, seconds = 24) {
  const preset = readJson(`Presets/growth_${bd.id}.json`);
  const battle = new Battle(files, { collections, maxMonsters: 0, spawnRate: 0, god: true, seed: 11 });
  battle.setLoadout(preset);
  assert.ok(!battle.skills.some(s => s?.error), `${bd.id}: ${battle.skills.map(s => s?.error).filter(Boolean)}`);
  const world = battle.host.world, target = battle.heroTargetId, peak = { charge: 0, surge: 0, growth: 0 };
  let seed = 3;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  battle.setAim(300, 0);
  battle.hero.casting = true;
  for (let i = 0; i < seconds * 60; ++i) {
    if (battle.monsters.filter(m => m.health > 0).length < 8) {
      battle.spawnMonsters(8);
      for (const m of battle.monsters) if (m.health > 0 && !m.placed) {
        const a = rand() * Math.PI * 2, r = 60 + rand() * 160;
        Object.assign(m, { x: 230 + Math.cos(a) * r * .5, y: Math.sin(a) * r * .6, speed: 0, cooldown: 999, health: 120, maxHealth: 120, shield: 0, maxShield: 0, attackRange: 0, placed: true });
      }
    }
    battle.step(1 / 60);
    for (const key of Object.keys(peak)) peak[key] = Math.max(peak[key], world.getStatusStacks(target, `status:${bd.id}_${key}`));
  }
  const growth = world.ownerState.get(`affix:${bd.trait}:growth|o${battle.hero.owner}`) || 0;
  return { battle, peak, growth };
}

for (const bd of GROWTH_BDS) {
  test(`成长型 BD 实战：${bd.name} 施放、蓄势、爆发、成长`, () => {
    const { battle, peak, growth } = run(bd);
    assert.ok(battle.hero.casts > 5, `${bd.id} casts ${battle.hero.casts}`);
    assert.ok(peak.charge >= 1, `${bd.id} charge stacks`);
    assert.equal(peak.surge, 1, `${bd.id} surge released`);
    assert.ok(growth >= GROWTH_STAGES[bd.id].awaken, `${bd.id} reached 觉醒 (${growth})`);
    assert.ok(growth <= GROWTH_STAGES[bd.id].cap);
    assert.equal(peak.growth, growth, 'growth buff mirrors the counter');
  });
}

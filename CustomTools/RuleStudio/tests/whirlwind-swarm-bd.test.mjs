import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../public/vendor/three.module.js';
import { readRuleFiles, RULES_DIR } from '../scripts/rule-files.mjs';
import { checkRuleSet, validateTraitValueEntry, createProgression } from '../engine/index.mjs';
import { registerEquipmentDropLibrary, equipmentDropAffixPool } from '../public/equipment-generation.mjs';
import { applyBuildPreset } from '../public/build-presets.mjs';
import { createWhirlwindSwarm } from '../scripts/create-whirlwind-swarm-bd.mjs';
import { simulateWhirlwindSwarm, removeSwarmAffixes } from '../scripts/research-whirlwind-swarm.mjs';
import { Battle } from '../public/sim/battle.mjs';
import { createBattleEffects } from '../public/vfx/battle-effects.mjs';

const files = readRuleFiles(), checked = checkRuleSet(files);
assert.ok(checked.ok, checked.error);
registerEquipmentDropLibrary(files, checked.library, checked.affixCategories);
const preset = createWhirlwindSwarm(checked.library, checked.collections);
const run = (sample = preset, options = {}) => simulateWhirlwindSwarm(files, checked.collections, sample, options);

test('风暴群预设可重建，九件装备遵守品质、部位池和每层数值阶级', () => {
  assert.deepEqual(preset, JSON.parse(fs.readFileSync(`${RULES_DIR}/Presets/whirlwind_swarm.json`, 'utf8')));
  const items = Object.values(preset.instances);
  assert.equal(items.length, 9); assert.equal(items.reduce((n, i) => n + i.affixes.length, 0), 44);
  assert.equal(items.filter(i => i.rarity === 'rare' && i.affixes.length === 6).length, 7);
  assert.equal(items.filter(i => i.rarity === 'magic' && i.affixes.length === 1).length, 2);
  for (const item of items) {
    const allowed = new Set(equipmentDropAffixPool(checked.library, item.slot).map(a => a.id));
    const walk = t => { assert.equal(validateTraitValueEntry(checked.library, t), ''); (t.with || []).forEach(walk); };
    for (const line of item.affixes) { assert.ok(allowed.has(line.id), `${item.slot}: ${line.id}`); line.traits.forEach(walk); }
  }
  const ids = items.flatMap(i => i.affixes.map(a => a.id));
  assert.ok(ids.includes('hit_mirror_ground')); assert.ok(ids.includes('grant_echo'));
  assert.ok(!ids.includes('interval_whirlwind')); assert.ok(!ids.includes('trigger_repeat'));
  assert.deepEqual(preset.skills.slice(0, 2), ['whirlwind', 'echo']);
});

test('应用装备授予真实主动技能，重复应用保留原背包与通货且不复制装备', () => {
  const save = createProgression(checked.collections, checked.library);
  save.instances.kept = { uid: 'kept', name: '原背包物品' }; save.stones = 12345;
  const before = structuredClone(save.owned), originalItems = structuredClone(save.instances);
  for (let i = 0; i < 2; i++) assert.equal(applyBuildPreset(save, preset, checked.collections, checked.library).error, '');
  assert.equal(Object.keys(save.instances).length, Object.keys(originalItems).length + 9);
  for (const [uid, item] of Object.entries(originalItems)) assert.deepEqual(save.instances[uid], item);
  assert.equal(save.stones, 12345); assert.deepEqual(save.owned, before);
  assert.equal(save.instances[save.loadout.equipment.weapon].skill, 'whirlwind');
});

test('无输入不会自动旋风；空场一次手动产生五枚，两秒后归零', () => {
  const idle = run(); assert.equal(idle.manualCasts, 0); assert.equal(idle.spawns, 0); assert.equal(idle.peak, 0);
  const result = run(preset, { manual: true, duration: 10 });
  assert.equal(result.manualCasts, 1); assert.equal(result.triggered, 0); assert.equal(result.spawns, 5); assert.equal(result.peak, 5);
  assert.equal(result.counts.at(-1), 0); assert.deepEqual(result.lifetime, [2, 2]);
  for (const speed of result.speed) assert.ok(Math.abs(speed - 27) < .001);
});

test('一次手动技能经镜像进出生成复制体，复制体也能复制；不刷新两秒寿命', () => {
  const full = run(preset, { targets: 20, manual: true, duration: 10 });
  const noMirror = run(removeSwarmAffixes(preset, ['hit_mirror_ground']), { targets: 20, manual: true, duration: 10 });
  assert.equal(full.manualCasts, 1); assert.equal(full.triggered, 0); assert.equal(full.peak, 1200);
  assert.equal(full.hitTargets, 20); assert.ok(full.damage > noMirror.damage * 10);
  assert.equal(full.counts.at(-1), 0); assert.equal(noMirror.peak, 5); assert.deepEqual(full.lifetime, [2, 2]);
  const echo = run(preset, { manual: true, echo: true, duration: 10 });
  assert.equal(echo.manualCasts, 2); assert.equal(echo.spawns, 10); assert.equal(echo.peak, 10); assert.equal(echo.counts.at(-1), 0);
});

test('气血点伤沿用真实命中伤害，不给镜像复制另外加伤', () => {
  const noMirror = removeSwarmAffixes(preset, ['hit_mirror_ground']);
  const full = run(noMirror, { targets: 20, manual: true, duration: 10 });
  const without = run(removeSwarmAffixes(noMirror, ['life_added_physical']), { targets: 20, manual: true, duration: 10 });
  assert.ok(full.damage > without.damage * 8); assert.equal(full.survived, true); assert.equal(full.minMana, 98);
});

test('特效仅跟随真实旋风且遵守持续表现容量，不创建载体或伤害', () => {
  const b = new Battle(files, { collections: checked.collections, maxMonsters: 0, spawnRate: 0, god: false, autoCast: false, seed: 18 });
  b.setLoadout(structuredClone(preset)); b.hero.castClock = 10; b.hero.casting = true; b.step(1 / 60); b.hero.casting = false;
  const before = b.host.world.stateHash(), projectiles = b.projectiles(); assert.equal(projectiles.length, 5);
  const scene = new T.Scene(), fx = createBattleEffects(T, scene); fx.update(b);
  const shown = fx.group.children.filter(o => o.name === 'whirlwind'); assert.equal(shown.length, 5);
  for (const p of projectiles) assert.ok(shown.some(o => Math.abs(o.position.x - p.x / 100) < 1e-6 && Math.abs(o.position.z + p.y / 100) < 1e-6));
  assert.equal(b.host.world.stateHash(), before); assert.equal(b.hero.casts, 1); assert.equal(b.damageDealt, 0);
  fx.dispose(); assert.equal(scene.children.length, 0);
});

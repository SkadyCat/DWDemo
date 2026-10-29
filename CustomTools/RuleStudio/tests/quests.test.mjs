import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readRuleFiles, RULES_DIR } from '../scripts/rule-files.mjs';
import { checkRuleSet, createProgression, progressionLoadout, availableSkills, equipmentRandom, validateTraitValueEntry } from '../engine/index.mjs';
import { registerEquipmentDropLibrary, equipmentDropAffixPool } from '../public/equipment-generation.mjs';
import { freshQuests, ensureQuests, questRows, rollQuestWeapons, observeQuestBattle, claimQuestWeapon } from '../public/quests/model.mjs';
import { DungeonBattle } from '../public/sim/dungeon-battle.mjs';
import { TowerPilot } from '../scripts/test-tower.mjs';

const files = readRuleFiles(), checked = checkRuleSet(files); assert.ok(checked.ok, checked.error);
const { library, collections } = checked; registerEquipmentDropLibrary(files, library, checked.affixCategories);
const player = () => ({ ...createProgression(collections, library), quests: freshQuests() });
const clear = { floor: 1, phase: 'cleared', wavesCompleted: 3, boss: { health: 0 }, hero: { dead: false }, character: { dead: false } };
const roll = seed => ({ random: equipmentRandom(seed), makeUid: i => `quest_${seed}_${i}` });

test('任务：新玩家只有现有普通T1冰锥术武器，默认第一槽自动装配冰锥术', () => {
  const p = player(); const [weapon] = Object.values(p.instances);
  assert.equal(weapon.skill, 'frost_lance'); assert.equal(weapon.rarity, 'common'); assert.equal(weapon.tier, 1);
  assert.deepEqual(p.loadout.skills, ['frost_lance', null, null, null]);
  assert.deepEqual(availableSkills(p.owned.skill, p.loadout.equipment, collections, p.instances).map(s => s.id), ['frost_lance']);
  assert.equal(questRows(p)[0].stage, 'active'); assert.equal(questRows(p)[0].objective, '通关第 1 层');
});

test('任务：老存档补任务不重置物品，已完成的任务重载后保持已领取', () => {
  const p = createProgression(collections, library); p.stones = 123; const inventory = JSON.stringify(p.instances);
  ensureQuests(p); assert.equal(p.stones, 123); assert.equal(JSON.stringify(p.instances), inventory);
  const result = observeQuestBattle(p, clear, collections, library, roll(15)); assert.equal(result.changed, true);
  const uid = p.quests.entries.first_floor.choices[1].uid; assert.equal(claimQuestWeapon(p, 'first_floor', uid).error, '');
  const saved = JSON.parse(JSON.stringify(p)); ensureQuests(saved);
  assert.equal(saved.quests.entries.first_floor.stage, 'claimed'); assert.equal(saved.quests.entries.first_floor.claimedUid, uid);
  assert.equal(observeQuestBattle(saved, clear, collections, library).changed, false);
});

test('任务：进入第一层、击杀普通怪、失败、跳层与未击败首领都不完成任务', () => {
  for (const battle of [null, { ...clear, phase: 'waves' }, { ...clear, phase: 'boss' }, { ...clear, phase: 'failed' },
    { ...clear, floor: 2 }, { ...clear, boss: null }, { ...clear, boss: { health: 1 } }, { ...clear, wavesCompleted: 2 },
    { ...clear, hero: { dead: true } }, { ...clear, character: { dead: true } }]) {
    const p = player(); assert.equal(observeQuestBattle(p, battle, collections, library, roll(16)).changed, false);
    assert.equal(p.quests.entries.first_floor.stage, 'active'); assert.equal(p.quests.entries.first_floor.choices.length, 0);
  }
});

test('任务：胜利时生成三把不同武器，遵守既有品质、部位词条池与T1数值', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const choices = rollQuestWeapons(collections, library, roll(seed));
    assert.equal(choices.length, 3); assert.equal(new Set(choices.map(i => i.baseId)).size, 3);
    assert.equal(new Set(choices.map(i => i.uid)).size, 3);
    for (const item of choices) {
      assert.equal(item.slot, 'weapon'); assert.equal(item.tier, 1); assert.equal(item.identified, true); assert.ok(collections.skill.has(item.skill));
      const allowed = new Set(equipmentDropAffixPool(library, 'weapon').map(a => a.id));
      for (const line of item.affixes) assert.ok(allowed.has(line.id), line.id);
      for (const line of [...item.bases, ...item.affixes, ...(item.legendary ? [item.legendary] : [])]) for (const trait of line.traits) assert.equal(validateTraitValueEntry(library, trait), '');
      assert.ok(item.rarity === 'common' ? item.affixes.length === 0 : item.rarity === 'magic' ? item.affixes.length >= 1 && item.affixes.length <= 2 : item.rarity === 'rare' ? item.affixes.length >= 3 && item.affixes.length <= 6 : item.affixes.length === 5 && !!item.legendary);
    }
  }
});

test('任务：候选物品只在真实通关时生成一次，停留/重复通关/刷新不重抽', () => {
  const p = player(); assert.equal(observeQuestBattle(p, clear, collections, library, roll(72)).changed, true);
  const choices = JSON.stringify(p.quests.entries.first_floor.choices), restored = JSON.parse(JSON.stringify(p));
  for (const state of [p, restored]) for (let i = 0; i < 5; i++) {
    assert.equal(observeQuestBattle(state, clear, collections, library, { random: () => { throw Error('重复抽取'); } }).changed, false);
    assert.equal(JSON.stringify(state.quests.entries.first_floor.choices), choices);
  }
});

test('任务：三选一领取完全相同的实例，其余两件不入包，不能连点重复领取或自动替换武器', () => {
  const p = player(), loadout = JSON.stringify(p.loadout);
  assert.match(claimQuestWeapon(p, 'first_floor', 'fake').error, /通关/);
  observeQuestBattle(p, clear, collections, library, roll(91)); const choices = structuredClone(p.quests.entries.first_floor.choices);
  assert.match(claimQuestWeapon(p, 'first_floor', 'fake').error, /本次奖励/);
  const selected = choices[2], result = claimQuestWeapon(p, 'first_floor', selected.uid);
  assert.equal(result.error, ''); assert.deepEqual(p.instances[selected.uid], selected); assert.notEqual(p.instances[selected.uid], selected);
  assert.equal(Object.keys(p.instances).length, 2); for (const other of choices.slice(0, 2)) assert.ok(!p.instances[other.uid]);
  assert.equal(JSON.stringify(p.loadout), loadout); assert.equal(p.quests.entries.first_floor.choices.length, 0);
  for (const choice of choices) assert.match(claimQuestWeapon(p, 'first_floor', choice.uid).error, /已领取/);
  p.loadout.equipment.weapon = selected.uid; p.loadout.skills = [selected.skill, null, null, null];
  const b = new DungeonBattle(files, { collections, maxMonsters: 0, spawnRate: 0, seed: 18 }); b.setLoadout(progressionLoadout(p, collections));
  assert.equal(b.hero.error, ''); assert.equal(b.hero.skill, selected.skill);
});

test('任务：候选生成失败不产生半份奖励或更改背包，修复后可以重试', () => {
  const p = player(), before = JSON.stringify(p), empty = { ...collections, equipment: new Map() };
  const result = observeQuestBattle(p, clear, empty, library, roll(1));
  assert.equal(result.changed, false); assert.ok(result.error); assert.equal(JSON.stringify(p), before);
  assert.equal(observeQuestBattle(p, clear, collections, library, roll(1)).changed, true);
});

test('任务：真实第一层首领胜利会完成任务，领取不修改规则世界或角色属性', () => {
  const preset = JSON.parse(fs.readFileSync(`${RULES_DIR}/Presets/synergy_rime_thunder.json`, 'utf8'));
  const b = new DungeonBattle(files, { collections, monsterTypes: [...checked.monsters.values()].map(e => e.doc), seed: 18, monsterCount: 20, god: false, autoCast: false });
  b.setLoadout(preset); const pilot = new TowerPilot({ mode: 'kite' }), p = player();
  for (let frame = 0; frame < 60 * 60 && !['cleared', 'failed'].includes(b.phase); frame++) { pilot.update(b); b.step(1 / 60); }
  assert.equal(b.phase, 'cleared'); assert.equal(b.completionMode, 'boss'); assert.ok(b.exitPortal); assert.ok(b.boss.health <= 0);
  const before = b.host.world.stateHash(), pools = [b.character.maxLife, b.character.maxMana, b.character.maxShield];
  assert.equal(observeQuestBattle(p, b, collections, library, roll(14)).changed, true);
  assert.equal(claimQuestWeapon(p, 'first_floor', p.quests.entries.first_floor.choices[0].uid).error, '');
  assert.equal(b.host.world.stateHash(), before); assert.deepEqual([b.character.maxLife, b.character.maxMana, b.character.maxShield], pools);
});

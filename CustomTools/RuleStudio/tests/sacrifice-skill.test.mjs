import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readRuleFiles } from '../scripts/rule-files.mjs';
import { checkRuleSet, availableSkills, progressionLoadout, createProgression,
  rollEquipmentAffix, equipmentAffixPool, rerollEquipment, equipmentRandom, readTraitText,
  newBuild, validateSheet, listings } from '../engine/index.mjs';
import { applyBuildPreset } from '../public/build-presets.mjs';
import { Battle } from '../public/sim/battle.mjs';

const files = readRuleFiles(), check = checkRuleSet(files);
assert.ok(check.ok, check.error);
const { library, collections } = check;
const published = JSON.parse(fs.readFileSync(new URL('../../../Content/Rules/Presets/synergy_sacrifice_thunder.json', import.meta.url), 'utf8'));
const tick = (b, seconds, casting = false) => {
  b.hero.casting = casting;
  for (let i = 0; i < Math.round(seconds * 60); i++) b.step(1 / 60);
  b.hero.casting = false;
};
function setup() {
  const save = createProgression(collections, library);
  assert.equal(applyBuildPreset(save, published, collections, library).error, '');
  const b = new Battle(files, { collections, maxMonsters: 0, spawnRate: 0, god: false, seed: 19 });
  b.setLoadout(progressionLoadout(save, collections));
  return { save, b };
}
const grantItem = save => Object.values(save.instances).find(item => item.affixes.some(a => a.id === 'grant_sacrifice'));

test('词条授予主动技能：正常词条池可洗出，无数值不虚构T阶；装备去重且不增加永久所有权', () => {
  const def = equipmentAffixPool(library).find(a => a.id === 'grant_sacrifice');
  assert.ok(def);
  const rolled = rollEquipmentAffix(def, equipmentRandom(9), library, 1);
  assert.equal(rolled.tier, undefined); assert.deepEqual(rolled.traits[0].params, {});
  const { save, b } = setup();
  assert.deepEqual(availableSkills({}, save.loadout.equipment, collections, save.instances).map(s => s.id), ['iron_guard', 'sacrifice']);
  assert.deepEqual(save.owned.skill, {});
  assert.equal(b.skills[1].granted, true);
  assert.equal(b.hero.skill, 'iron_guard');
  assert.ok(!listings(collections, check.catalog).some(row => row.kind === 'skill' && row.id === 'sacrifice'));
  const item = grantItem(save);
  item.affixes.push(structuredClone(rolled));
  assert.equal(availableSkills({}, save.loadout.equipment, collections, save.instances).filter(s => s.id === 'sacrifice').length, 1);
  const other = checkRuleSet([...files, { path: 'Affixes/grant_test_wave.json', text: JSON.stringify({
    id: 'grant_test_wave', name: '授予另一技能', sheet: [{ grant_skill: 'earth_wave' }] }) }]);
  assert.ok(other.ok, other.error);
  item.affixes = [{ id: 'grant_test_wave', traits: [{ id: 'grant_test_wave', params: {}, with: [] }] }];
  const choices = availableSkills({}, save.loadout.equipment, other.collections, save.instances).map(s => s.id);
  assert.ok(choices.includes('earth_wave')); assert.ok(!choices.includes('sacrifice'));
});

test('授予来源变化：卸下、未鉴定或洗掉词条会清除技能；背包物品与缝合触发载荷不授予技能', () => {
  for (const mode of ['unequip', 'unidentified', 'reroll', 'nested', 'timed']) {
    const { save, b } = setup(), item = grantItem(save), index = item.affixes.findIndex(a => a.id === 'grant_sacrifice');
    if (mode === 'unequip') delete save.loadout.equipment[item.slot];
    if (mode === 'unidentified') item.identified = false;
    if (mode === 'reroll') {
      save.instances[item.uid] = rerollEquipment(item, library, { index, random: equipmentRandom(44) });
      assert.ok(!save.instances[item.uid].affixes.some(a => a.id === 'grant_sacrifice'));
    }
    if (mode === 'nested') item.affixes[index].traits = [{ id: 'trig_hit', params: { chance: 100 }, with: [{ id: 'grant_sacrifice', params: {}, with: [] }] }];
    if (mode === 'timed') item.affixes[index].traits[0].duration = 1;
    const loadout = progressionLoadout(save, collections);
    assert.equal(loadout.skills[1], null, mode);
    b.setLoadout({ ...loadout, skills: ['iron_guard', 'sacrifice'] });
    assert.equal(b.skills[1], null, mode + ' cannot bypass acquisition with a stale slot');
  }
});

test('献祭施法：沿用魔力与冷却；持续施放维持真实补召链，松手后不自行献祭', () => {
  const { b } = setup();
  tick(b, .4, true); tick(b, 1);
  assert.equal(b.combat.minions.alive().length, 1);
  b.select(1);
  b.character.mana = 0;
  const before = b.hero.casts;
  tick(b, .1, true);
  assert.equal(b.hero.casts, before); assert.equal(b.combat.minions.sacrificed, 0);
  b.character.mana = b.character.maxMana;
  tick(b, .3, true);
  assert.equal(b.hero.casts, before + 1); assert.equal(b.combat.minions.sacrificed, 1);
  assert.ok(b.character.mana < b.character.maxMana);
  tick(b, .4, true);
  assert.equal(b.combat.minions.sacrificed, 1, 'cooldown prevents casting every frame');
  tick(b, 8, true);
  assert.ok(b.combat.minions.sacrificed >= 8 && b.combat.minions.sacrificed <= 9);
  assert.ok(b.combat.minions.alive().length > 0);
  tick(b, .5); const count = b.combat.minions.sacrificed;
  tick(b, 3); assert.equal(b.combat.minions.sacrificed, count);
  assert.equal(typeof b.sacrifice, 'undefined', 'there is no input-side bypass');
});

test('空场与替换：无单位不产生献祭回复或触发；召唤替换也不是献祭', () => {
  const { b } = setup();
  b.select(1); tick(b, .02); b.character.shield = 0; b.character.sinceDamaged = 0;
  tick(b, 2, true);
  assert.equal(b.combat.minions.sacrificed, 0);
  assert.equal(b.combat.triggers.fired, 0);
  assert.equal(b.character.shield, 0);
  b.select(0); tick(b, 7, true);
  assert.equal(b.combat.minions.sacrificed, 0);
  assert.equal(b.combat.triggers.fired, 0);
});

test('通用献祭动作：支持参数覆盖、kind过滤、数量上限与施法者隔离，不按技能id分支', () => {
  const { b } = setup();
  tick(b, .4, true); tick(b, 1.05); tick(b, .4, true); tick(b, 1.05);
  const w = b.host.world;
  assert.equal(b.combat.minions.alive().length, 2);
  const cast = (kind, count, owner = b.hero.owner) => {
    const { trait, error } = readTraitText(JSON.stringify({ id: 'arbitrary_sacrifice_action', params: { count },
      rules: [{ id: 'consume', event: 'cast', actions: [{ op: 'sacrifice', ...(kind ? { kind } : {}), count: { param: 'count' } }] }] }));
    assert.ok(trait, error);
    const compiled = b.host.compileSource(newBuild(trait.id, [trait]));
    assert.ok(compiled.plan >= 0, compiled.error);
    w.cast(compiled.plan, owner, 0, 0, 0, 1, 0, 0, 1n, 30);
    tick(b, .05);
  };
  cast('ember_hound', 1); assert.equal(b.combat.minions.sacrificed, 0);
  cast('', 100, b.monsterOwner); assert.equal(b.combat.minions.sacrificed, 0);
  cast('', 0); assert.equal(b.combat.minions.sacrificed, 0);
  cast('iron_guard', 100); assert.equal(b.combat.minions.sacrificed, 2);
});

test('声明校验：grant_skill引用必须存在，网页主动能力不能误写进UE共享Builds', () => {
  const bad = files.map(f => f.path === 'Affixes/grant_sacrifice.json' ? { ...f, text: f.text.replace('"grant_skill": "sacrifice"', '"grant_skill": "missing_skill"') } : f);
  assert.match(checkRuleSet(bad).error, /grant_skill unknown player skill/);
  const shared = files.map(f => f.path === 'WebBuilds/sacrifice.json' ? { ...f, path: 'Builds/sacrifice.json' } : f);
  assert.match(checkRuleSet(shared).error, /技能不能引用/);
  assert.match(validateSheet({ id: 'invalid_grant', params: new Map(), sheet: [{ grant_skill: 'sacrifice', stat: 'life.base' }] }), /grant_skill needs/);
});

test('雷暴是效果：献祭动作只消费控制单位，不消耗玩家的持续雷暴', () => {
  const { b } = setup(), w = b.host.world;
  const trait = readTraitText(JSON.stringify({ id: 'test_persistent_storm', rules: [{ id: 'spawn_storm', event: 'cast',
    actions: [{ op: 'storm', kind: 'test_storm', event: 'test_strike', duration: 10, interval: 1, radius: 10 }] }] })).trait;
  const plan = b.host.compileSource(newBuild(trait.id, [trait])).plan;
  w.cast(plan, b.hero.owner, 0, 0, 0, 1, 0, 0, 1n, 30); tick(b, .1);
  assert.equal(w.summons.filter(s => s.storm && !s.dead).length, 1);
  b.select(1); tick(b, 2, true);
  assert.equal(b.combat.minions.sacrificed, 0);
  assert.equal(w.summons.filter(s => s.storm && !s.dead).length, 1);
});

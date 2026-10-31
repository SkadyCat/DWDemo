import test from 'node:test';
import assert from 'node:assert/strict';
import { readRuleFiles } from '../scripts/rule-files.mjs';
import { checkRuleSet, createProgression, equipmentRandom } from '../engine/index.mjs';
import { registerEquipmentDropLibrary } from '../public/equipment-generation.mjs';
import { freshQuests } from '../public/quests/model.mjs';
import { Battle } from '../public/sim/battle.mjs';
import { xpToNext, MAX_LEVEL, talentPointsFor, mapItemId } from '../public/progression/config.mjs';
import { ensureJourney, grantXp, killXp, levelPart, recordKill, recordFloorClear, syncTalentBudget, talentBudget, KillStreak } from '../public/progression/journey.mjs';
import { QUEST_CHAIN, ensureChain, observeChain, chainRows, claimChainQuest, trackedQuest } from '../public/progression/quest-chain.mjs';
import { tutorialView, TUTORIAL_STEPS, ensureTutorial } from '../public/progression/tutorial.mjs';

const files = readRuleFiles(), checked = checkRuleSet(files); assert.ok(checked.ok, checked.error);
const { library, collections } = checked; registerEquipmentDropLibrary(files, library, checked.affixCategories);
const player = () => ({ ...createProgression(collections, library), quests: freshQuests() });

test('等级：经验曲线递增，跨多级升级，满级停止', () => {
  for (let l = 1; l < MAX_LEVEL - 1; l++) assert.ok(xpToNext(l + 1) > xpToNext(l));
  const p = player(); const r = grantXp(p, xpToNext(1) + xpToNext(2) + 5);
  assert.deepEqual(r.levels, [2, 3]); assert.equal(p.journey.level, 3); assert.equal(p.journey.xp, 5);
  grantXp(p, 1e12); assert.equal(p.journey.level, MAX_LEVEL); assert.equal(p.journey.xp, 0);
  assert.equal(grantXp(p, 100).gained, 0);
});

test('等级：击杀经验按稀有度与层数增长，首领最多', () => {
  assert.ok(killXp({ rarity: 'rare' }, 1) > killXp({ rarity: 'magic' }, 1));
  assert.ok(killXp({ rarity: 'common', boss: true }, 1) > killXp({ rarity: 'rare' }, 1));
  assert.ok(killXp({ rarity: 'common' }, 5) > killXp({ rarity: 'common' }, 1));
  const p = player(); const s = new KillStreak();
  for (let i = 0; i < 10; i++) s.hit(i * 0.5);
  assert.equal(s.count, 10); assert.ok(s.bonus() > 0); s.hit(100); assert.equal(s.count, 1);
  const r = recordKill(p, { rarity: 'rare' }, 2, 0.1); assert.equal(p.journey.counters.rareKills, 1); assert.ok(r.gained > r.base);
});

test('等级：等级加成是普通词条，经由现有规则引擎聚合，提高气血与伤害', () => {
  assert.ok(levelPart(1).doc.traits.every(t => !['life_base', 'inc_elemental'].includes(t.id)), '1 级只有天生属性换算');
  const part = levelPart(10);
  for (const trait of part.doc.traits) assert.ok(library.trait(trait.id), trait.id);
  const plain = new Battle(files, { collections, maxMonsters: 0, spawnRate: 0, seed: 3 });
  const leveled = new Battle(files, { collections, maxMonsters: 0, spawnRate: 0, seed: 3 });
  const p = player(), loadout = { skills: p.loadout.skills, equipment: p.loadout.equipment, instances: p.instances };
  plain.setLoadout(loadout); leveled.setLoadout({ ...loadout, passives: [part] });
  assert.equal(leveled.hero.error || '', '');
  assert.ok(leveled.character.maxLife > plain.character.maxLife, `${leveled.character.maxLife} > ${plain.character.maxLife}`);
});

test('天赋点：由等级与任务奖励决定，超额的旧方案整体返还', () => {
  const p = player(); ensureJourney(p);
  assert.equal(talentBudget(p), 0);
  p.journey.level = 4; p.journey.bonusTalentPoints = 1; assert.equal(talentBudget(p), talentPointsFor(4, 1));
  p.talents = { schema: 1, treeId: 'x', revision: 1, budget: 120, allocated: ['a', 'b'], choices: {} };
  assert.deepEqual(syncTalentBudget(p), { changed: true, refunded: false, budget: 7, spent: 2 });
  p.talents.allocated = Array.from({ length: 30 }, (_, i) => 'n' + i);
  const r = syncTalentBudget(p); assert.equal(r.refunded, true); assert.equal(p.talents.allocated.length, 0);
});

test('首通：首次通关奖励经验与下一层地图，重复通关不再给', () => {
  const p = player();
  const first = recordFloorClear(p, 1); assert.equal(first.first, true); assert.equal(p.owned.item[mapItemId(2)], 1); assert.ok(first.xp.gained > 0);
  assert.equal(recordFloorClear(p, 1).first, false); assert.equal(p.owned.item[mapItemId(2)], 1);
  assert.equal(p.journey.maxFloor, 1); assert.equal(p.journey.counters.floorsCleared, 2);
  assert.ok(collections.item.get(mapItemId(16)), '地图物品存在');
});

test('任务链：所有奖励物品存在，按顺序推进，计数从接取时开始', () => {
  for (const q of QUEST_CHAIN) for (const r of q.rewards) if (r.kind === 'item') assert.ok(collections.item.get(r.id), `${q.id}: ${r.id}`);
  const p = player(); ensureJourney(p); p.journey.counters.kills = 50; ensureChain(p);
  assert.equal(trackedQuest(p).id, 'c1_first_blood'); assert.equal(chainRows(p)[1].stage, 'locked');
  assert.deepEqual(observeChain(p), []);
  for (let i = 0; i < 8; i++) recordKill(p, { rarity: 'common' }, 1);
  assert.deepEqual(observeChain(p), ['c1_first_blood']);
  const stones = p.stones, claim = claimChainQuest(p, 'c1_first_blood', collections, library);
  assert.equal(claim.error, ''); assert.equal(p.stones, stones + 60); assert.equal(p.owned.item.healing_draught, 2);
  assert.match(claimChainQuest(p, 'c1_first_blood', collections, library).error, /已领取/);
  assert.equal(trackedQuest(p).id, 'c1_guardian');
});

test('任务链：装备奖励使用正常生成器，品质与阶级符合描述', () => {
  const p = player(); ensureJourney(p); ensureChain(p);
  for (const q of QUEST_CHAIN) p.questChain.entries[q.id] = { stage: 'done', start: 0 };
  for (const q of QUEST_CHAIN.filter(q => q.rewards.some(r => r.kind === 'equipment'))) {
    const r = claimChainQuest(p, q.id, collections, library, { random: equipmentRandom(q.id.length) });
    assert.equal(r.error, '', q.id);
    for (const g of r.granted.filter(g => g.kind === 'equipment')) { assert.equal(g.item.rarity, g.rarity); assert.equal(g.item.tier, g.tier); assert.ok(p.instances[g.item.uid]); }
  }
});

test('新手引导：按真实行为推进，已满足的步骤静默完成', () => {
  const p = player(); ensureTutorial(p);
  const ctx = { moved: 0, damageDealt: 0, kills: 0, pickups: 0, groundLoot: 0, floorsCleared: 0, equips: 0, mapsEntered: 0, unspentTalents: 0, level: 1, lifeRatio: 1, claimableQuests: 0 };
  assert.equal(tutorialView(p, ctx).guide.id, 'move');
  assert.equal(tutorialView(p, { ...ctx, moved: 5 }).guide.id, 'attack');
  const all = { ...ctx, moved: 5, damageDealt: 1, kills: 9, pickups: 2, floorsCleared: 1, firstWeaponClaimed: true, equips: 1, mapsEntered: 1 };
  const v = tutorialView(p, all); assert.equal(v.guide, null); assert.equal(v.finished, true); assert.equal(p.tutorial.completed.length, TUTORIAL_STEPS.length);
  assert.equal(tutorialView(p, { ...all, unspentTalents: 2, level: 2 }).tip.id, 'talent');
});

test('任务链：三选一奖励只生成一次，必须选择其中一件，领取后其余消失', async () => {
  const { prepareChoices, choiceBases } = await import('../public/progression/quest-chain.mjs');
  for (const pool of ['aura', 'skill', 'legendary']) assert.ok(choiceBases(pool, collections).length >= 3, pool);
  const p = player(); ensureJourney(p); ensureChain(p);
  for (const q of QUEST_CHAIN) p.questChain.entries[q.id] = { stage: 'claimed', start: 0 };
  p.questChain.entries.c1_talent = { stage: 'done', start: 0 };
  const choices = prepareChoices(p, 'c1_talent', collections, library, { random: equipmentRandom(5) });
  assert.equal(choices.length, 3); assert.equal(new Set(choices.map(c => c.baseId)).size, 3);
  for (const c of choices) { assert.equal(c.slot, 'ring'); assert.ok(c.skill || collections.equipment.get(c.baseId).doc.skills.length); }
  assert.equal(prepareChoices(p, 'c1_talent', collections, library, { random: () => { throw Error('重复生成'); } }), choices);
  assert.match(claimChainQuest(p, 'c1_talent', collections, library).error, /选择/);
  const picked = choices[1], before = Object.keys(p.instances).length;
  assert.equal(claimChainQuest(p, 'c1_talent', collections, library, { choiceUid: picked.uid }).error, '');
  assert.equal(Object.keys(p.instances).length, before + 1); assert.ok(p.instances[picked.uid]);
  for (const other of [choices[0], choices[2]]) assert.ok(!p.instances[other.uid]);
  assert.equal(p.questChain.entries.c1_talent.stage, 'claimed'); assert.equal(p.questChain.entries.c1_talent.choices, undefined);
});

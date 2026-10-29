import test from 'node:test';
import assert from 'node:assert/strict';
import { readRuleFiles } from '../scripts/rule-files.mjs';
import { checkRuleSet, rollEquipment, rollEquipmentDrop, rerollEquipment, rerollWithCurrency, equipmentRandom, equipmentTier, equipmentAffixPool, rollEquipmentAffix, availableSkills, createProgression, awardBattleKill, progressionLoadout, parseCollection, serializeCollection } from '../engine/index.mjs';
import { DungeonBattle } from '../public/sim/dungeon-battle.mjs';
import { TowerPilot } from '../scripts/test-tower.mjs';
import { runProgression } from '../scripts/test-progression.mjs';

const files = readRuleFiles(), check = checkRuleSet(files);
assert.ok(check.ok, check.error);
const { library, collections, tags } = check;
const template = collections.equipment.get('frostthorn_staff').doc;
const ranks = item => [...(item.legendary ? [item.legendary] : []), ...item.affixes].flatMap(a => a.traits.flatMap(function walk(t) { return [t.tier, ...(t.with || []).flatMap(walk)].filter(v => v !== undefined); }));

test('装备 T1–T10 限制掉落与洗炼词条，每个可用阶级都能随机到', () => {
  const random = equipmentRandom(716);
  const numeric = equipmentAffixPool(library).find(a => a.id === 'life_base');
  for (let tier = 1; tier <= 10; tier++) {
    let item = rollEquipment(template, library, { tier, rarity: 'rare', random });
    for (let i = 0; i < 32; i++) {
      item = i % 2 ? rerollEquipment(item, library, { random }) : rerollWithCurrency(item, library, tags, { random });
      assert.equal(item.tier, tier);
      for (const rank of ranks(item)) assert.ok(rank >= 1 && rank <= tier);
    }
    // Visit every rank bucket directly; a changing affix pool must not make a
    // finite seeded sample's missing bucket look like an unreachable rank.
    const seen = new Set(Array.from({ length: tier }, (_, i) =>
      rollEquipmentAffix(numeric, () => (i + .5) / tier, library, tier).tier));
    assert.deepEqual([...seen].sort((a, b) => a - b), Array.from({ length: tier }, (_, i) => i + 1));
  }
  for (const tier of [0, 11, 1.5]) assert.throws(() => rollEquipment(template, library, { tier }), /T 阶/);
});

test('传奇共六词条；单洗保留固定词条、其他词条、装备阶级与绑定技能', () => {
  const random = equipmentRandom(317);
  const item = rollEquipment(template, library, { tier: 3, rarity: 'legendary', random });
  assert.equal(item.affixes.length, 5); assert.ok(item.legendary);
  assert.ok(ranks(item).every(t => t <= 3));
  const before = structuredClone(item);
  const next = rerollWithCurrency(item, library, tags, { random, family: 'guard', index: 2 });
  assert.deepEqual(item, before);
  assert.deepEqual(next.legendary, item.legendary);
  assert.deepEqual(next.affixes.filter((_, i) => i !== 2), item.affixes.filter((_, i) => i !== 2));
  for (const field of ['tier', 'rarity', 'skill', 'uid']) assert.equal(next[field], item[field]);
  assert.ok(ranks(next).every(t => t <= 3));
});

test('真实掉落默认已鉴定，包含品质数量和具体词条；旧实例不重掷', () => {
  const random = equipmentRandom(613), tiers = new Set(), rarities = new Set();
  for (let i = 0; i < 220; i++) {
    const item = rollEquipmentDrop(collections, library, { chance: 1, random });
    assert.equal(item.identified, true);
    tiers.add(item.tier); rarities.add(item.rarity);
    assert.ok(ranks(item).every(t => t <= item.tier));
    const n = item.affixes.length;
    assert.ok(item.rarity === 'common' ? n === 0 : item.rarity === 'magic' ? n >= 1 && n <= 2 : item.rarity === 'rare' ? n >= 3 && n <= 6 : n === 5 && !!item.legendary);
  }
  assert.equal(tiers.size, 10); assert.equal(rarities.size, 4);
  const legacy = rollEquipment(template, library, { tier: 10, rarity: 'rare', random }); delete legacy.tier;
  const before = structuredClone(legacy);
  assert.equal(equipmentTier(legacy), 10); assert.deepEqual(legacy, before);
  assert.equal(rerollEquipment(legacy, library, { random }).tier, 10);
});

test('装备模板 T 阶可保存和重读，新武器默认为 T1', () => {
  const raw = JSON.parse(serializeCollection('equipment', template));
  assert.equal(raw.tier, 1);
  raw.tier = 6;
  const parsed = parseCollection('equipment', raw);
  assert.ok(parsed.doc, parsed.error);
  assert.equal(JSON.parse(serializeCollection('equipment', parsed.doc)).tier, 6);
  raw.tier = 11; assert.match(parseCollection('equipment', raw).error, /tier/);
});

test('开局只有普通 T1 武器和其一个绑定技能，未装备的掉落不改变战斗聚合', () => {
  const state = createProgression(collections, library);
  assert.equal(state.stones, 0);
  assert.deepEqual(state.owned, { skill: {}, equipment: {}, item: {} });
  const [weapon] = Object.values(state.instances);
  assert.equal(weapon.rarity, 'common'); assert.equal(weapon.tier, 1); assert.equal(weapon.affixes.length, 0);
  assert.deepEqual(availableSkills({}, state.loadout.equipment, collections, state.instances).map(s => s.id), [weapon.skill]);
  const before = progressionLoadout(state, collections);
  const drop = awardBattleKill(state, 7, collections, library, { random: () => .1, uid: 'earned_drop' });
  assert.ok(drop); assert.equal(state.stats.kills, 1); assert.equal(state.stats.earned, 7); assert.equal(state.stones, 7);
  assert.deepEqual(progressionLoadout(state, collections), before);
  state.loadout.equipment[drop.slot] = drop.uid;
  assert.equal(drop.identified, true);
  assert.deepEqual(progressionLoadout(state, collections).instances[drop.uid], drop);
});

test('单武器实战正常击杀才结算灵石与装备，未修改怪物属性或玩家资源', () => {
  const state = createProgression(collections, library), random = equipmentRandom(16);
  let callbacks = 0;
  const battle = new DungeonBattle(files, { collections, monsterTypes: [...check.monsters.values()].map(e => e.doc), seed: 18, monsterCount: 20, god: false, autoCast: false,
    onKill: stones => { callbacks++; awardBattleKill(state, stones, collections, library, { random, uid: `kill_${callbacks}` }); } });
  battle.setLoadout(progressionLoadout(state, collections));
  const pilot = new TowerPilot({ mode: 'kite' });
  for (let i = 0; i < 1801 && !['failed', 'cleared'].includes(battle.phase); i++) { pilot.update(battle); battle.step(1 / 60); }
  assert.ok(callbacks > 0); assert.equal(callbacks, battle.kills);
  assert.equal(state.stats.kills, battle.kills); assert.equal(state.stones, battle.earned);
  assert.equal(Object.keys(state.instances).length, 1 + state.progression.drops);
  assert.equal(Object.keys(state.loadout.equipment).length, 1);
  assert.equal(battle.hero.god, false); assert.equal(battle.hero.autoCast, false);
});

test('成长实测账本：只装备实际获得的实例，洗炼只花击杀灵石且不破坏身上装备', () => {
  // The accounting scenario needs earned drops; keep its original three archetypes. The new
  // T10 lineage encounter difficulty and live spawning are covered by monster-lineages.test.mjs.
  const accountingCheck = { ...check, monsters: new Map([...check.monsters].filter(([id]) => ['claw_beast', 'frost_caster', 'void_caster'].includes(id))) };
  // This seed covers earned upgrades and crafting with values rolled at drop time.
  // The ledger assertions below validate ownership and spending, not the identity of a random roll.
  const report = runProgression({ files, check: accountingCheck, seed: 44, attempts: 2, craftsPerAttempt: 2, maxFloors: 5 });
  const owned = new Map(Object.entries(report.initial.instances));
  const equipped = { ...report.initial.loadout.equipment };
  let spent = 0;
  for (const event of report.events) {
    if (event.event === 'drop') { assert.ok(!owned.has(event.item.uid)); owned.set(event.item.uid, event.item); }
    if (event.event === 'identify') { assert.ok(owned.has(event.item.uid)); owned.set(event.item.uid, event.item); }
    if (event.event === 'equip') { assert.ok(owned.has(event.item.uid)); equipped[event.item.slot] = event.item.uid; }
    if (event.event === 'craft') {
      assert.ok(owned.has(event.before.uid));
      assert.ok(!Object.values(equipped).includes(event.before.uid));
      assert.deepEqual(owned.get(event.before.uid).affixes, event.before.affixes);
      assert.equal(event.before.tier, event.after.tier);
      assert.deepEqual(event.before.legendary, event.after.legendary);
      owned.set(event.after.uid, event.after); spent += event.cost;
    }
  }
  assert.ok(report.events.some(e => e.event === 'equip'));
  assert.ok(report.events.some(e => e.event === 'craft'));
  assert.equal(report.final.stats.spent, spent);
  assert.equal(report.final.stones, report.final.stats.earned - spent);
  assert.equal(report.final.stats.kills, report.runs.reduce((n, run) => n + run.kills, 0));
  assert.equal(Object.keys(report.final.instances).length, 1 + report.final.progression.drops);
  assert.ok(Number.isFinite(report.finalMeasurement.score));
  assert.ok(report.runs.flatMap(r => r.floors).every(f => f.seconds <= 30));
});

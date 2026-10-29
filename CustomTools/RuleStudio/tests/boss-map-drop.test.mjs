import test from 'node:test';
import assert from 'node:assert/strict';
import { checkRuleSet, createProgression, equipmentAffixPool } from '../engine/index.mjs';
import { FloorRewards } from '../engine/floor-rewards.mjs';
import { emptyHunter, hunterAllows } from '../engine/loot-hunter.mjs';
import { DungeonBattle } from '../public/sim/dungeon-battle.mjs';
import { mapEquipmentPanel } from '../public/battle-panels.mjs';
import { readBaselineRuleFiles } from './rule-fixture.mjs';

const files = readBaselineRuleFiles(), check = checkRuleSet(files);
assert.ok(check.ok, check.error);
const { collections, library, catalog } = check;
const boss = { x: 400, y: -200, boss: true };
const rewards = options => new FloorRewards(collections, library, catalog, options);
const maps = r => r.ground.filter(d => d.category === 'map');
const battle = options => new DungeonBattle(files, { collections, seed: 29, god: true, rewards: { catalog }, ...options });

test('地图特性：全部默认核心装配 60%，移除或修改特性直接改变判定概率', () => {
  assert.equal(equipmentAffixPool(library).some(a => a.id === 'map_boss_map_drop_chance'), false);
  for (let tier = 1; tier <= 10; tier++) {
    const id = tier === 1 ? 'map_core_equipment' : `map_core_equipment_t${tier}`;
    const b = battle({ mapEquipment: { map: id } });
    assert.equal(b.rewards.bossMapDropChance, .6);
    assert.ok(mapEquipmentPanel(b).equipment[0].affixes.some(a => a.text === '首领有 60% 概率掉落同级地图'));
  }
  const b = battle();
  b.setMapEquipment({});
  assert.equal(b.rewards.bossMapDropChance, 0);
  b.rewards.mapRandom = () => 0;
  b.rewards.onKill(boss); assert.equal(maps(b.rewards).length, 0);
  const core = structuredClone(collections.equipment.get('map_core_equipment').doc);
  core.traits.find(t => t.id === 'map_boss_map_drop_chance').params.n = 25;
  b.setMapEquipment({ map: core });
  assert.equal(b.rewards.bossMapDropChance, .25);
  b.rewards.mapRandom = () => .25;
  b.rewards.onKill(boss); assert.equal(maps(b.rewards).length, 0);
  b.rewards.mapRandom = () => .249999;
  b.rewards.onKill(boss); assert.equal(maps(b.rewards).length, 1);
});

test('60% 边界：0 至小于 .6 命中，.6 起不掉落，普通怪不消耗地图随机流', () => {
  for (const roll of [0, .599999, .6, .999999]) {
    const r = rewards({ bossMapDropChance: .6 }); let calls = 0;
    r.mapRandom = () => { calls++; return roll; };
    r.onKill({ ...boss, boss: false });
    assert.equal(calls, 0); assert.equal(maps(r).length, 0);
    r.onKill(boss); assert.equal(calls, 1);
    assert.equal(maps(r).length, roll < .6 ? 1 : 0);
  }
  const pool = { ...collections, equipment: new Map(), item: new Map([...collections.item].filter(([, e]) => e.doc.category === 'map')) };
  const r = new FloorRewards(pool, library, catalog, { bossMapDropChance: .6 });
  for (let i = 0; i < 1000; i++) { r.mapRandom = () => i / 1000; r.onKill(boss); }
  assert.equal(maps(r).length, 600);
});

test('同级地图：T1–T16 全部匹配入场等级，装备仍使用原有 T10 上限', () => {
  for (let tier = 1; tier <= 16; tier++) {
    const b = battle({ floor: tier, mapTier: tier });
    assert.equal(b.rewards.mapTier, tier);
    assert.equal(b.rewards.maxTier, Math.min(10, tier));
    b.rewards.mapRandom = () => 0; b.rewards.onKill(boss);
    const [drop] = maps(b.rewards);
    assert.equal(drop.id, `map_t${String(tier).padStart(2, '0')}_common`);
    assert.equal(drop.tier, tier); assert.equal(drop.rarity, 'common');
    assert.equal(drop.count, 1); assert.equal(drop.origin, 'drop');
    const core = structuredClone(collections.equipment.get('map_core_equipment_t10').doc);
    b.setMapEquipment({ map: core });
    assert.equal(b.rewards.mapTier, tier, 'core switching does not overwrite the admitted map tier');
  }
});

test('地图掉落保留原有装备、物品、商人随机结果及实例 ID', () => {
  const opts = { seed: 81, maxTier: 3, mapTier: 3, merchantChance: 1 };
  const active = rewards({ ...opts, bossMapDropChance: 1 }), control = rewards(opts);
  for (let i = 0; i < 20; i++) {
    const monster = { ...boss, boss: i % 5 === 0 };
    active.onKill(monster); control.onKill(monster);
  }
  assert.equal(maps(active).length, 4);
  assert.deepEqual(active.ground.filter(d => d.category !== 'map'), control.ground);
  assert.deepEqual(active.complete(), control.complete());
  const repeat = rewards({ ...opts, bossMapDropChance: 1 });
  for (let i = 0; i < 20; i++) repeat.onKill({ ...boss, boss: i % 5 === 0 });
  assert.deepEqual(active.ground, repeat.ground);
});

test('真实首领击败只结算一次，地图可见、可拾取且不会重复授予', () => {
  const b = battle({ floor: 16, mapTier: 16 });
  b.setLoadout({ skills: [] }); b.rewards.mapRandom = () => 0;
  b.step(1 / 60);
  for (const monster of b.monsters) if (!monster.boss) monster.health = 0;
  b.step(1 / 60); assert.ok(b.boss);
  assert.equal(maps(b.rewards).length, 0, 'ordinary monsters never drop the boss map');
  b.boss.health = 0; b.step(1 / 60);
  assert.equal(b.phase, 'cleared'); assert.equal(b.kills, 20);
  assert.equal(maps(b.rewards).length, 1);
  const [drop] = maps(b.rewards), state = createProgression(collections, library);
  assert.equal(hunterAllows(drop, emptyHunter()), true);
  assert.equal(hunterAllows({ ...drop, category: 'consumable' }, emptyHunter()), false);
  const previous = state.owned.item[drop.id] || 0;
  assert.match(b.rewards.pickup(drop.key, state, { x: drop.x + 1000, y: drop.y }).error, /靠近/);
  assert.ok(b.rewards.pickup(drop.key, state, { x: drop.x, y: drop.y }).drop);
  assert.equal(state.owned.item[drop.id], previous + 1);
  assert.ok(b.rewards.pickup(drop.key, state, { x: drop.x, y: drop.y }).error);
  for (let i = 0; i < 60; i++) b.step(1 / 60);
  assert.equal(maps(b.rewards).length, 1); assert.equal(state.owned.item[drop.id], previous + 1);
});

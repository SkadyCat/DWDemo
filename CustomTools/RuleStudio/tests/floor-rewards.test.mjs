import test from 'node:test';
import assert from 'node:assert/strict';
import { checkRuleSet, createProgression, recordBattleKill } from '../engine/index.mjs';
import { FloorRewards, PICKUP_RADIUS } from '../engine/floor-rewards.mjs';
import { TowerRun, MAX_TOWER_FLOOR } from '../public/sim/dungeon-battle.mjs';
import { readBaselineRuleFiles } from './rule-fixture.mjs';
import { mapEquipmentPanel } from '../public/battle-panels.mjs';

const files = readBaselineRuleFiles(), check = checkRuleSet(files);
assert.ok(check.ok, check.error);
const { collections, library, catalog } = check;
const create = options => new FloorRewards(collections, library, catalog, options);
const monster = { x: 300, y: -200, boss: false };

test('ground loot is rolled at the kill position and enters inventory only on a nearby pickup', () => {
  const rewards = create({ seed: 7, equipmentChance: 1, itemChance: 1 });
  const state = createProgression(collections, library), before = structuredClone(state);
  rewards.onKill(monster);
  assert.equal(rewards.remaining.length, 2); assert.deepEqual(state, before);
  const gear = rewards.remaining.find(d => d.kind === 'equipment'), item = rewards.remaining.find(d => d.kind === 'item');
  assert.equal(gear.sourceX, monster.x); assert.equal(gear.sourceY, monster.y);
  assert.ok(Math.hypot(gear.x - monster.x, gear.y - monster.y) < 100);
  assert.match(rewards.pickup(gear.key, state, { x: 4000, y: 0 }).error, /靠近/); assert.deepEqual(state, before);
  const rolled = structuredClone(gear.item);
  assert.ok(rewards.pickup(gear.key, state, monster).drop);
  assert.deepEqual(state.instances[rolled.uid], rolled); assert.equal(state.progression.drops, 1);
  const after = structuredClone(state);
  assert.ok(rewards.pickup(gear.key, state, monster).error); assert.deepEqual(state, after);
  assert.ok(rewards.pickup(item.key, state, monster).drop); assert.equal(state.owned.item[item.id], item.count);
  assert.equal(rewards.remaining.length, 0);
});

test('separate atlas admissions preserve the dungeon seed but create collectible equipment with fresh instance IDs', () => {
  const state=createProgression(collections,library), ids=new Set();
  const createRun=visit=>new TowerRun(files,{collections,seed:29,rewards:{catalog,visit,merchantChance:1,equipmentChance:1,itemChance:0}});
  let firstMap;
  for(const visit of [1,2,3]){
    const run=createRun(visit),b=run.battle;
    if(firstMap)assert.deepEqual(b.dungeon.cells,firstMap);else firstMap=b.dungeon.cells;
    b.rewards.onKill({...monster,boss:true});
    const gear=b.rewards.remaining.find(d=>d.kind==='equipment');
    assert.ok(!ids.has(gear.id),'a new admission must not reuse already-owned equipment IDs');ids.add(gear.id);
    const rolled=structuredClone(gear.item);
    assert.equal(b.rewards.pickup(gear.key,state,monster).error,undefined);assert.deepEqual(state.instances[gear.id],rolled);
    const merchant=b.rewards.complete();
    for(const offer of merchant.stock.filter(o=>o.kind==='equipment')){assert.ok(!ids.has(offer.id));ids.add(offer.id);}
    const same=createRun(visit);same.battle.rewards.onKill({...monster,boss:true});assert.deepEqual(same.battle.rewards.ground[0].item,rolled,'the same admission remains reproducible');
  }
});

test('a real wall-edge kill drop remains collectible by approaching its reachable birth point', () => {
  const run=new TowerRun(files,{collections,seed:29,rewards:{catalog}}),b=run.battle,map=b.dungeon;
  b.setLoadout({skills:[]});b.phase='cleared';
  const tile=map.tiles.find(t=>!map.walkable(t.x,t.y+1)&&map.walkable(t.x,t.y-1)&&map.walkable(t.x,t.y-2));
  assert.ok(tile);const center=map.tileCenter(tile.x,tile.y);
  Object.assign(b.hero,map.tileCenter(tile.x,tile.y-2));
  const death={x:center.x,y:center.y+54,boss:true};assert.ok(map.sweep(death.x,death.y,death.x,death.y,45)<0);
  b.rewards.onKill(death);const drop=b.rewards.ground.find(d=>d.kind==='equipment'),at=map.tileOf(drop.x,drop.y);
  assert.equal(map.walkable(at.x,at.y),false,'real loot scatter reaches the adjacent wall tile');
  assert.deepEqual(b.directionTo(b.hero,drop),{x:0,y:0},'routing to the wall would leave the hero stuck');
  for(let i=0;i<600&&Math.hypot(drop.x-b.hero.x,drop.y-b.hero.y)>PICKUP_RADIUS;i++){b.hero.move=b.pickupDirection(drop);b.step(1/60);}
  assert.ok(Math.hypot(drop.x-b.hero.x,drop.y-b.hero.y)<=PICKUP_RADIUS);
  const state=createProgression(collections,library);assert.equal(b.rewards.pickup(drop.key,state,b.hero).error,undefined);
  assert.deepEqual(state.instances[drop.id],drop.item);
});

test('no-drop rolls work; Boss drops include equipment and an authored item', () => {
  const rewards = create({ equipmentChance: 0, itemChance: 0 });
  rewards.onKill(monster); assert.equal(rewards.remaining.length, 0);
  rewards.onKill({ ...monster, boss: true }); assert.equal(rewards.remaining.length, 2);
  assert.ok(rewards.remaining.some(d => d.kind === 'equipment'));
  assert.ok(rewards.remaining.some(d => d.kind === 'item' && collections.item.has(d.id)));
});

test('merchant chance is rolled once, stock is finite and independent of kill loot randomness', () => {
  const none = create({ merchantChance: 0 }); assert.equal(none.complete(), null); assert.equal(none.complete(), null);
  const first = create({ seed: 11, merchantChance: 1 }), second = create({ seed: 11, merchantChance: 1 });
  for (let i = 0; i < 20; i++) first.onKill(monster);
  const merchant = first.complete(); assert.equal(first.complete(), merchant);
  const stock = merchant.stock;
  assert.equal(stock.filter(o => o.kind === 'equipment').length, 2); assert.equal(stock.filter(o => o.kind === 'item').length, 4);
  const stable = stock.map(({ key, id, item, ...o }) => ({ ...o, item: item && { ...item, uid: '' } }));
  const other = second.complete().stock.map(({ key, id, item, ...o }) => ({ ...o, item: item && { ...item, uid: '' } }));
  assert.deepEqual(stable, other);
  assert.equal(new Set(stock.filter(o => o.kind === 'item').map(o => o.id)).size, 4);
});

test('流浪商人: every visit guarantees two legendary rolls within the map tier cap', () => {
  for (const maxTier of [1, 3, 10]) for (let seed = 1; seed <= 12; seed++) {
    const rewards = create({ seed, maxTier, merchantChance: 1 });
    const stock = rewards.complete().stock.filter(o => o.kind === 'equipment');
    assert.equal(stock.length, 2);
    assert.equal(new Set(stock.map(o => o.item.baseId)).size, 2, 'different designs when the pool permits');
    for (const offer of stock) {
      assert.equal(offer.rarity, 'legendary'); assert.equal(offer.item.rarity, 'legendary');
      assert.ok(offer.item.legendary); assert.equal(offer.item.affixes.length, 5);
      assert.ok(offer.tier >= 1 && offer.tier <= maxTier);
      if (offer.tier === 1) assert.ok(Number.isInteger(offer.price) && offer.price >= 20 && offer.price <= 50);
      for (const affix of [offer.item.legendary, ...offer.item.affixes]) if (affix.tier) assert.ok(affix.tier <= offer.tier);
    }
    const shown = structuredClone(rewards.merchant);
    rewards.complete(); assert.deepEqual(rewards.merchant, shown, 'reopening does not reroll stock');
  }
});

test('流浪商人: a limited pool still gives two distinct legendary instances without inventing fixed lines', () => {
  const template = collections.equipment.get('frostthorn_staff').doc;
  const blank = { ...template, id: 'blank_weapon', legendary: null, traits: [] };
  const pool = { ...collections, equipment: new Map([[template.id, { doc: template }], [blank.id, { doc: blank }]]) };
  const rewards = new FloorRewards(pool, library, catalog, { merchantChance: 1 });
  const stock = rewards.complete().stock.filter(o => o.kind === 'equipment');
  assert.equal(stock.length, 2); assert.notEqual(stock[0].item.uid, stock[1].item.uid);
  assert.ok(stock.every(o => o.item.baseId === template.id && o.rarity === 'legendary' && o.item.legendary));
});

test('低阶传奇价格: T1 costs 20–50 even for a high-level template with an expensive catalog override', () => {
  const template = { ...collections.equipment.get('myriad_swords_t1_chest').doc, level: 30 };
  const pool = { ...collections, equipment: new Map([[template.id, { doc: template }]]) };
  const expensive = { ...catalog, prices: { ...catalog.prices, [`equipment:${template.id}`]: 1200 } };
  for (const [roll, expected] of [[0, 20], [1 - Number.EPSILON, 50]]) {
    const rewards = new FloorRewards(pool, library, expensive, { merchantChance: 1 });
    rewards.merchantRandom = () => roll;
    const stock = rewards.complete().stock.filter(o => o.kind === 'equipment');
    assert.equal(stock.length, 2);
    for (const offer of stock) {
      assert.equal(offer.tier, 1); assert.equal(offer.price, expected);
      const state = createProgression(collections, library); state.stones = expected;
      const shown = structuredClone(offer.item);
      assert.ok(rewards.buy(offer.key, state).offer); assert.equal(state.stones, 0); assert.equal(state.stats.spent, expected);
      assert.deepEqual(state.instances[shown.uid], shown);
    }
    const shown = structuredClone(rewards.merchant); rewards.complete(); assert.deepEqual(rewards.merchant, shown);
  }
});

test('一级灵石: every actual kill pays 5–10 regardless of monster health, with stable independent randomness', () => {
  const collect = seed => {
    const paid = [], state = createProgression(collections, library);
    const run = new TowerRun(files, { collections, seed, god: true, onKill: stones => { paid.push(stones); recordBattleKill(state, stones); } });
    const b = run.battle; b.step(1 / 60);
    for (let wave = 0; wave < 4; wave++) { for (const m of b.monsters) m.health = 0; b.step(1 / 60); }
    assert.equal(b.phase, 'cleared'); assert.equal(paid.length, 20);
    assert.ok(paid.every(n => Number.isInteger(n) && n >= 5 && n <= 10));
    assert.equal(b.earned, paid.reduce((sum, n) => sum + n, 0)); assert.equal(state.stones, b.earned); assert.equal(state.stats.earned, b.earned);
    b.step(1 / 60); assert.equal(paid.length, 20, 'a dead monster pays once');
    return paid;
  };
  const first = collect(29); assert.deepEqual(first, collect(29));
  assert.ok(new Set(first).size > 1, 'rewards fluctuate per kill'); assert.notDeepEqual(first, collect(30));
});

test('merchant purchase checks funds before mutation and gives the exact displayed item only once', () => {
  const rewards = create({ merchantChance: 1 }), state = createProgression(collections, library);
  const gear = rewards.complete().stock.find(o => o.kind === 'equipment'), rolled = structuredClone(gear.item), before = structuredClone(state);
  assert.match(rewards.buy(gear.key, state).error, /灵石不足/); assert.deepEqual(state, before); assert.equal(gear.claimed, false);
  state.stones = gear.price + 100;
  assert.ok(rewards.buy(gear.key, state).offer); assert.equal(state.stones, 100); assert.equal(state.stats.spent, gear.price);
  assert.deepEqual(state.instances[rolled.uid], rolled); assert.equal(state.progression.drops, 0);
  const bought = structuredClone(state); assert.ok(rewards.buy(gear.key, state).error); assert.deepEqual(state, bought);
  const item = rewards.merchant.stock.find(o => o.kind === 'item'); state.stones = item.price;
  assert.ok(rewards.buy(item.key, state).offer); assert.equal(state.owned.item[item.id], item.count); assert.equal(state.stones, 0);
});

test('full stacks and dead players cannot claim, and a failed purchase never charges currency', () => {
  const rewards = create({ merchantChance: 1, itemChance: 1 }), state = createProgression(collections, library);
  const item = rewards.complete().stock.find(o => o.kind === 'item'); state.owned.item[item.id] = 9999; state.stones = 10000;
  const before = structuredClone(state); assert.ok(rewards.buy(item.key, state).error); assert.deepEqual(state, before); assert.equal(item.claimed, false);
  rewards.onKill({ ...monster, boss: true }); assert.ok(rewards.pickup(rewards.remaining[0].key, state, { ...monster, dead: true }).error);
});

test('tower starts at a chosen floor, waits after clear, and can challenge another chosen floor without free healing', () => {
  const run = new TowerRun(files, { collections, floor: 3, seed: 3, god: false, rewards: { catalog, merchantChance: 1 } });
  run.setLoadout({ skills: ['frost_lance'] }); assert.equal(run.floor, 3); assert.equal(run.battle.floor, 3);
  const first = run.battle; first.phase = 'cleared'; first.character.life = 67; first.character.mana = 23;
  for (let i = 0; i < 400; i++) run.step(1 / 60);
  assert.equal(run.battle, first); assert.equal(run.floor, 3);
  assert.ok(run.advance(7)); assert.equal(run.floor, 7); assert.equal(run.battle.character.life, 67); assert.equal(run.battle.character.mana, 23);
  run.battle.phase = 'cleared'; run.battle.rewards.onKill({ ...monster, boss: true }); const firstId = run.battle.rewards.remaining[0].id;
  assert.ok(run.advance(7)); run.battle.rewards.onKill({ ...monster, boss: true }); assert.notEqual(run.battle.rewards.remaining[0].id, firstId, 'replaying a floor rolls a distinct instance');
  for (const floor of [0, -1, 1.5, MAX_TOWER_FLOOR + 1, NaN]) assert.throws(() => new TowerRun(files, { collections, floor }), /挑战层数/);
});

test('actual encounter callbacks produce ground drops and settle one merchant after the real Boss reward', () => {
  const state = createProgression(collections, library);
  const run = new TowerRun(files, { collections, god: true, seed: 29, onKill: n => recordBattleKill(state, n), rewards: { catalog, merchantChance: 1, equipmentChance: 1, itemChance: 1 } });
  const b = run.battle; b.step(1 / 60);
  for (let wave = 0; wave < 4; wave++) { for (const m of b.monsters) m.health = 0; b.step(1 / 60); }
  assert.equal(b.phase, 'cleared'); assert.equal(b.kills, 20); assert.equal(state.stats.kills, 20);
  assert.equal(b.rewards.remaining.filter(drop => drop.category !== 'map').length, 40);
  assert.ok(b.rewards.remaining.filter(drop => drop.kind === 'equipment').every(drop => drop.item.tier === 1));
  assert.equal(Object.keys(state.instances).length, 1); assert.equal(state.stones, b.earned);
  const merchant = b.rewards.merchant; assert.ok(merchant); b.step(1 / 60); assert.equal(b.rewards.merchant, merchant);
  const x = b.hero.x; b.hero.move = { x: 1, y: 0 }; b.step(.05); assert.ok(b.hero.x > x, 'can approach ground loot after clear');
});

test('地图等阶: normal kills, Boss drops and local merchant stock share the actual map core cap', () => {
  for (const tier of [1, 3, 10]) {
    const core = structuredClone(collections.equipment.get('map_core_equipment').doc); core.tier = tier;
    const run = new TowerRun(files, { collections, floor: 30, seed: 71, mapEquipment: { map: core },
      rewards: { catalog, maxTier: 10, equipmentChance: 1, itemChance: 0, merchantChance: 1 } });
    const b = run.battle;
    assert.equal(b.map.tier, tier); assert.equal(mapEquipmentPanel(b).tier, tier);
    assert.equal(b.rewards.maxTier, tier, 'reward options cannot override the map cap');
    for (let i = 0; i < 40; i++) b.rewards.onKill(monster);
    const boss = b.rewards.onKill({ ...monster, boss: true });
    assert.ok(boss.some(drop => drop.kind === 'equipment'));
    const drops = b.rewards.remaining.filter(drop => drop.kind === 'equipment');
    assert.equal(drops.length, 41);
    assert.ok(drops.every(drop => drop.tier === drop.item.tier && drop.item.tier >= 1 && drop.item.tier <= tier));
    const stock = b.rewards.complete().stock.filter(offer => offer.kind === 'equipment');
    assert.equal(stock.length, 2); assert.ok(stock.every(offer => offer.item.tier <= tier));
    b.phase = 'cleared'; assert.ok(run.advance(31));
    assert.equal(run.battle.rewards.maxTier, tier);
  }
});

test('地图等阶: default and unequipped maps stay T1 even on high tower floors', () => {
  const normal = new TowerRun(files, { collections, floor: 50, seed: 5, rewards: { catalog } });
  assert.equal(normal.battle.map.tier, 1); assert.equal(normal.battle.rewards.maxTier, 1);
  const empty = new TowerRun(files, { collections, mapEquipment: {}, rewards: { catalog } });
  assert.equal(empty.battle.map.tier, 1); assert.equal(empty.battle.rewards.maxTier, 1);
});

// 世界循环：星银和地区物资、天赋花费、商会价格、势力委托、佣兵出征（design/world-loop.md）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { rollEconomyDrops, talentCost, canPay, pay, refund, REFUND, marketPrice, sellMaterial, buyMaterial, refine, marketTick, mapIncome, MATERIAL_IDS, materialInfo, itemPrice } from '../public/game/economy.mjs';
import { refreshBoard, takeContract, contractEvent, deliver, repTier, perks, BOARD_SIZE, MAX_TAKEN } from '../public/game/factions.mjs';
import { mercRoster, hire, sendOut, mercTick, giveGear, successChance, expeditionMaps } from '../public/game/mercs.mjs';
import { TALENT_TREE } from '../core/content/talents.mjs';
import { newSave, migrate } from '../public/game/save.mjs';

let seed = 3; const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const fresh = () => { const s = newSave(); s.unlocked = 6; return s; };

test('掉落：首领一定给星银和本地区物资，T3 起有机会掉星尘；物资档位跟着阶走', () => {
  const boss = rollEconomyDrops(8, 'frost', 'boss', rng);
  assert.ok(boss.some(d => d.type === 'silver' && d.count > 0));
  assert.ok(boss.some(d => d.type === 'material' && d.id === 'frost_1' && d.count >= 3), '霜原 T8 → 精霜晶');
  let dust = 0; for (let i = 0; i < 200; ++i) dust += rollEconomyDrops(10, 'ember', 'boss', rng).some(d => d.id === 'dust') ? 1 : 0;
  assert.ok(dust > 40 && dust < 160, `星尘 ${dust}/200`);
  assert.ok(!rollEconomyDrops(1, 'ember', 'boss', () => 0.01).some(d => d.id === 'dust'), 'T1 不掉星尘');
  for (const id of MATERIAL_IDS) assert.ok(materialInfo(id).name && materialInfo(id).base > 0, id);
});

test('天赋：越往后越贵，按域要对应地区的物资，基石要星尘；付不起不能点，取消返还六成', () => {
  const fire = TALENT_TREE.nodes.find(n => n.domain === 'fire' && n.kind === 'small'), key = TALENT_TREE.nodes.find(n => n.kind === 'keystone' && n.domain === 'cold');
  const a = talentCost(fire, 0), b = talentCost(fire, 60), c = talentCost(fire, 110);
  assert.ok(a.silver < b.silver && b.silver < c.silver);
  assert.deepEqual(Object.keys(a.mats), ['ember_0']); assert.deepEqual(Object.keys(b.mats), ['ember_1']); assert.deepEqual(Object.keys(c.mats), ['ember_2']);
  assert.ok(talentCost(key, 20).mats.dust === 3 && talentCost(key, 20).mats.frost_0 > 0);
  assert.ok(talentCost(fire, 40, 0.2).silver < talentCost(fire, 40).silver, '法师学会打折');
  const s = fresh(); assert.ok(!canPay(s, a));
  s.silver = 1000; s.materials.ember_0 = 5; assert.ok(canPay(s, a));
  pay(s, a); assert.equal(s.silver, 1000 - a.silver); assert.equal(s.materials.ember_0, 5 - a.mats.ember_0);
  refund(s, a); assert.equal(s.silver, 1000 - a.silver + Math.floor(a.silver * REFUND));
});

test('商会：卖得多就便宜，库存每张图往回走；精炼 4 换 1', () => {
  const s = fresh(); s.materials.ember_0 = 40; s.silver = 0;
  const p0 = marketPrice(s, 'ember_0', 'sell');
  const got = sellMaterial(s, 'ember_0', 30);
  assert.ok(got > 0 && s.materials.ember_0 === 10);
  assert.ok(marketPrice(s, 'ember_0', 'sell') < p0, '卖多了跌价');
  for (let i = 0; i < 20; ++i) marketTick(s);
  assert.ok(Math.abs(s.market.stock.ember_0 - 20) <= 1, '库存回到平常');
  assert.ok(marketPrice(s, 'ember_0', 'buy') > marketPrice(s, 'ember_0', 'sell'), '买价高于收购价');
  s.silver = 10000; assert.equal(buyMaterial(s, 'storm_1', 3), 3); assert.equal(s.materials.storm_1, 3);
  s.materials.ember_0 = 8; assert.ok(refine(s, 'ember_0')); assert.equal(s.materials.ember_1, 1); assert.equal(s.materials.ember_0, 4);
  assert.ok(itemPrice({ tier: 5 }, 'rare', 3) > itemPrice({ tier: 5 }, 'rare', 1));
});

test('委托：布告板贴满，最多接三个；打图推进、交货完成，给星银和声望', () => {
  const s = fresh(); s.stats.maps = 0;
  const list = refreshBoard(s);
  assert.equal(list.length, BOARD_SIZE);
  const hunt = list.find(c => c.faction === 'guild'), goods = list.find(c => c.faction === 'merchants');
  assert.ok(takeContract(s, hunt.id) && takeContract(s, goods.id));
  const before = s.silver;
  contractEvent(s, { type: 'clear', tier: hunt.goal.minTier, family: hunt.goal.family, kind: 'normal' });
  assert.equal(hunt.have, 0, '不是首领要塞不算');
  const done = contractEvent(s, { type: 'clear', tier: 16, family: hunt.goal.family, kind: 'boss' });
  assert.equal(done.length, 1); assert.equal(s.silver, before + hunt.reward.silver); assert.equal(s.rep.guild, hunt.reward.rep);
  assert.equal(deliver(s, goods.id), null, '没货不能交');
  s.materials[goods.goal.item] = goods.need; assert.ok(deliver(s, goods.id)); assert.equal(s.materials[goods.goal.item], 0);
  s.rep.mages = 1300; assert.equal(repTier(s, 'mages'), 3); assert.equal(perks(s).talentDiscount, 0.15);
  // three taken at most
  const more = refreshBoard(s).filter(c => c.state === 'open');
  for (const c of more) takeContract(s, c.id);
  assert.equal(s.board.list.filter(c => c.state === 'taken').length, MAX_TAKEN);
});

test('佣兵：雇人、给装备、派去节点，按你打的图数回来；成功带回物资，失败可能会死', () => {
  const s = fresh(), roster = mercRoster();
  assert.ok(roster.length >= 10);
  const bronze = roster.find(r => r.rank === 0), gold = roster.find(r => r.rank === 2);
  assert.equal(hire(s, roster, bronze.id, 1), null, '没钱雇不了');
  s.silver = 100000;
  assert.equal(hire(s, roster, gold.id, 1), null, '声望不够雇不了金牌');
  const m = hire(s, roster, bronze.id, 1); assert.ok(m);
  const sword = { uid: 'x1', slot: 'weapon', base: 'wand', tier: 6, traits: [], lines: [] }; s.inventory.push(sword);
  const p0 = successChance(m, 6); assert.ok(giveGear(s, m.id, sword)); assert.ok(successChance(m, 6) > p0, '给了装备更能打');
  const node = { id: 5, tier: 4, family: 'storm', name: '雷鸣尖塔' };
  assert.ok(sendOut(s, m.id, node)); assert.equal(sendOut(s, m.id, node), null, '出征中不能再派');
  assert.deepEqual(mercTick(s, () => 0), [], '还没到时候');
  s.stats.maps += expeditionMaps(4);
  const lv = m.level, [r] = mercTick(s, () => 0);
  assert.ok(r.ok && s.materials.storm_0 > 0 && m.level === lv + 1);
  sendOut(s, m.id, node); s.stats.maps += 9;
  const [hurt] = mercTick(s, () => 0.99);   // fails, survives: rests a map
  assert.ok(!hurt.ok && !hurt.died && m.restUntil > s.stats.maps - 1);
  s.stats.maps += 2; sendOut(s, m.id, node); s.stats.maps += 9;
  const rolls = [0.99, 0.1], [dead] = mercTick(s, () => rolls.shift());   // fails, then does not make it
  assert.ok(dead.died && s.fallen.some(f => f.id === m.id) && !s.mercs.includes(m));
});

test('旧存档补上钱包；新存档从零开始', () => {
  const old = newSave(); delete old.silver; delete old.materials; delete old.mercs; migrate(old);
  assert.equal(old.silver, 0); assert.deepEqual(old.materials, {}); assert.deepEqual(old.mercs, []);
  assert.ok(mapIncome(10) > mapIncome(5));
});

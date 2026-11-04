// 背包 5 × 12、家里的仓库（通货页 / 传奇页每种 10 件 / 5 个常规页）、经验和等级。
import test from 'node:test';
import assert from 'node:assert/strict';
import { newSave, migrate, placeBag, moveInBag, equip, bagFree, bagFits, deposit, withdraw, depositCurrency, withdrawCurrency, craft, toBag, gainXp, xpToNext,
  BAG_SIZE, PAGE_SIZE, PAGES, LEGEND_CAP } from '../public/game/save.mjs';

// the new-save starter sigils sit in the bag; these tests count cells from empty
const fresh = () => { const s = fresh(); s.scarabs = {}; return s; };
const item = (i, extra = {}) => ({ uid: 'it' + i, slot: 'ring1', base: 'ring', tier: 1, traits: [], lines: [], ...extra });

test('背包是 5 × 12 = 60 格：装备一件一格，通货 20 个一格', () => {
  const s = fresh();
  assert.equal(BAG_SIZE, 60); assert.equal(bagFree(s), 60);
  s.currencies.chaos = 21;                      // two stacks
  for (let i = 0; i < 57; ++i) s.inventory.push(item(i));
  assert.equal(bagFree(s), 1);
  assert.ok(bagFits(s, { type: 'item' }));
  assert.ok(bagFits(s, { type: 'currency', id: 'chaos', count: 19 }), '补满已有的一堆不占新格');
  s.inventory.push(item(99));
  assert.ok(!bagFits(s, { type: 'item' }), '满了');
  assert.ok(!bagFits(s, { type: 'currency', id: 'augment', count: 1 }));
  assert.ok(bagFits(s, { type: 'waystone' }), '路石进地图装置，不占背包');
});

test('仓库：5 个常规页，每页 144 格；传奇进传奇页，每种最多 10 件，多的落到常规页', () => {
  const s = fresh();
  assert.equal(s.stash.pages.length, PAGES); assert.equal(PAGE_SIZE, 144); assert.equal(LEGEND_CAP, 10);
  for (let i = 0; i < 12; ++i) s.inventory.push(item(i, { legend: 'pyre_staff' }));
  s.inventory.push(item(50));
  for (let i = 0; i < 12; ++i) deposit(s, 'it' + i, 2);
  assert.equal(s.stash.legend.pyre_staff.length, 10);
  assert.equal(s.stash.pages[2].length, 2, '第 11、12 件放进选中的常规页');
  assert.equal(deposit(s, 'it50', 4), 'page'); assert.equal(s.stash.pages[4].length, 1);
  assert.ok(withdraw(s, 'it3', { legend: 'pyre_staff' })); assert.equal(s.stash.legend.pyre_staff.length, 9);
  assert.ok(s.inventory.some(it => it.uid === 'it3'));
});

test('通货页：存入全部、按堆取出（受背包空格限制）；在家洗炼背包不够就从仓库扣', () => {
  const s = fresh();
  s.currencies.chaos = 30; s.currencies.augment = 5;
  assert.equal(depositCurrency(s), 35);
  assert.equal(s.currencies.chaos, 0); assert.equal(s.stash.currency.chaos, 30);
  for (let i = 0; i < 59; ++i) s.inventory.push(item(i));
  assert.equal(withdrawCurrency(s, 'chaos', 1e9), 20, '只剩一格：最多取一堆');
  assert.equal(s.stash.currency.chaos, 10);
  // crafting at home falls back to the currency page
  s.currencies.augment = 0;
  const target = { ...item(200), slot: 'weapon', base: 'wand', skill: 'fireball', lines: [] };
  const away = craft(s, target, 'augment', Math.random, undefined, false);
  assert.equal(away.ok, false, '地图里只能用背包里的');
  craft(s, target, 'augment', () => 0.3, undefined, true);
  assert.equal(s.stash.currency.augment, 4);
});

test('背包满时：卸装备被拒、一键流派换下的东西进仓库；旧存档多出来的东西搬进仓库', () => {
  const s = fresh();
  for (let i = 0; i < 60; ++i) s.inventory.push(item(i));
  assert.equal(toBag(s, item(77)), 'stash'); assert.equal(s.stash.pages[0].length, 1);
  const old = { ...newSave(), stash: undefined };
  for (let i = 0; i < 75; ++i) old.inventory.push(item(i));
  old.currencies.chaos = 50;
  migrate(old);
  assert.ok(bagFree(old) >= 0);
  assert.equal(old.inventory.length + old.stash.pages.flat().length, 75);
  assert.equal(old.currencies.chaos + old.stash.currency.chaos, 50);
});

test('经验：升级所需递增，一次给很多能连升', () => {
  const s = fresh();
  assert.equal(s.level, 1);
  assert.ok(xpToNext(10) > xpToNext(2));
  const up = gainXp(s, xpToNext(1) + xpToNext(2) + 5);
  assert.equal(up, 2); assert.equal(s.level, 3); assert.equal(s.xp, 5);
});

test('背包不自动整理：拿走一件，后面的不前移；新东西进第一个空格；可以拖到指定格子', () => {
  const s = fresh();
  for (let i = 0; i < 5; ++i) s.inventory.push(item(i));
  s.currencies.chaos = 5;
  let g = placeBag(s);
  assert.deepEqual(g.slice(0, 5).map(x => x.uid), ['it0', 'it1', 'it2', 'it3', 'it4']);
  assert.ok(g[5].cur, '通货进下一个空格');
  s.inventory.splice(1, 1);                       // it1 taken out
  g = placeBag(s);
  assert.equal(g[1], null, '空出来的格子保持空着');
  assert.equal(g[4].uid, 'it4', '后面的没动');
  s.inventory.push(item(9)); g = placeBag(s);
  assert.equal(g[1].uid, 'it9', '新东西进第一个空格');
  assert.ok(moveInBag(s, s.inventory.find(x => x.uid === 'it9'), 30)); g = placeBag(s);
  assert.equal(g[30].uid, 'it9'); assert.equal(g[1], null);
  s.currencies.chaos = 0; g = placeBag(s);
  assert.equal(g[5], null, '通货用完，格子空出来，装备不前移');
  assert.equal(g[2].uid, 'it2');
  // equipping from the bag: the piece taken off lands in the same cell
  const w = { ...item(50), slot: 'weapon', base: 'wand', skill: 'fireball' }; s.inventory.push(w); g = placeBag(s);
  const at = w.cell; equip(s, w.uid); g = placeBag(s);
  assert.equal(g[at]?.slot, 'weapon', '换下的武器放回原格');
});

test('路石背包 ↔ 玩家背包：路石退回背包占一格，再放回路石背包', async () => {
  const { stoneToBag, stoneToDevice, placeBag, bagUsed } = await import('../public/game/save.mjs');
  const s = fresh(); s.waystones = [{ uid: 'w1', tier: 3, rarity: 'magic', mods: [] }];
  assert.ok(stoneToBag(s, 'w1', 7)); assert.equal(bagUsed(s), 1); assert.equal(placeBag(s)[7].uid, 'w1'); assert.equal(s.waystones.length, 0);
  assert.ok(stoneToDevice(s, 'w1')); assert.equal(bagUsed(s), 0); assert.equal(s.waystones.length, 1);
});

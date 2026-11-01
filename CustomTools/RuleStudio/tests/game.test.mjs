// 游戏层：装备掉落与洗炼、存档与一键流派、地图挑战（无画面跑一局）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { rollItem, rollDrops, applyCurrency, rarityOf, itemAffixes, MAX_LINES, candidates } from '../core/content/items.mjs';
import { family, LAYERS, SLOTS } from '../core/content/families.mjs';
import { newSave, applyArchetype, buildOf, equip, craft } from '../public/game/save.mjs';
import { MapRun } from '../public/game/run.mjs';
import { dungeonRandom } from '../public/game/dungeon.mjs';
import { ARCHETYPES } from '../core/content/archetypes.mjs';

test('掉落：词条按部位和层级门槛出现，同件不重复，T 阶不超过物品上限', () => {
  const rng = dungeonRandom(5);
  for (let i = 0; i < 400; ++i) {
    const it = rollItem(1 + (i % 10), rng);
    assert.ok(it.lines.length <= MAX_LINES);
    const ids = [...it.implicit, ...it.lines].map(l => l.id);
    assert.equal(new Set(ids).size, ids.length, '同件同族不重复');
    for (const l of it.lines) {
      const f = family(l.id);
      assert.ok(f.slots.includes(it.slot), `${l.id} 不能出现在 ${it.slot}`);
      assert.ok(it.tier >= LAYERS[f.layer].minItemTier, `${l.id} 层级门槛`);
      assert.ok(l.tier >= 1 && l.tier <= f.levels);
    }
    assert.ok(itemAffixes(it).length === it.implicit.length + it.lines.length);
  }
  const boss = rollDrops(10, 'boss', rng);
  assert.ok(boss.filter(d => d.type === 'item').length >= 3 && boss.some(d => d.type === 'currency'));
});

test('洗炼：魔晶加、混沌重洗保留封印、灵石升阶、无效删、精华按层加', () => {
  const rng = dungeonRandom(9);
  const it = rollItem(8, rng, 'amulet'); it.lines = [];
  assert.ok(applyCurrency(it, 'augment', rng).ok); assert.equal(it.lines.length, 1);
  while (it.lines.length < 4) applyCurrency(it, 'augment', rng);
  assert.ok(applyCurrency(it, 'seal', rng, 1).ok);
  const sealed = it.lines[1].id;
  assert.ok(applyCurrency(it, 'chaos', rng).ok);
  assert.equal(it.lines.length, 4); assert.ok(it.lines.some(l => l.id === sealed), '封印词条保留');
  const before = it.lines.map(l => l.tier).reduce((a, b) => a + b);
  applyCurrency(it, 'upgrade', rng);
  assert.ok(it.lines.map(l => l.tier).reduce((a, b) => a + b) >= before);
  assert.ok(applyCurrency(it, 'annul', rng).ok); assert.equal(it.lines.length, 3);
  assert.ok(applyCurrency(it, 'essence_core', rng).ok);
  assert.ok(it.lines.some(l => family(l.id).layer === 'core'));
  const low = rollItem(2, rng, 'amulet');
  assert.equal(applyCurrency(low, 'essence_link', rng).ok, false, 'T2 不能加联动词条');
  assert.ok(candidates(rollItem(2, rng, 'weapon')).every(f => f.layer === 'stat' || f.layer === 'form'));
  assert.ok(['普通', '魔法', '稀有', '传世'].includes(rarityOf(it).name));
});

test('存档：一键流派换上 10 件装备、设置技能；装备与洗炼消耗通货', () => {
  const save = newSave();
  applyArchetype(save, 'storm', 2);
  assert.ok(SLOTS.every(s => save.equipped[s]));
  assert.equal(save.skills[0], 'arc');
  const build = buildOf(save);
  assert.ok(build.affixes.length >= 65);
  const it = rollItem(5, dungeonRandom(3), 'boots');
  save.inventory.push(it); equip(save, it.uid);
  assert.equal(save.equipped.boots.uid, it.uid);
  assert.equal(craft(save, save.equipped.boots, 'augment', dungeonRandom(1)).ok, false, '没有通货');
  save.currencies.augment = 1; save.equipped.boots.lines = [];
  assert.ok(craft(save, save.equipped.boots, 'augment', dungeonRandom(1)).ok);
  assert.equal(save.currencies.augment, 0);
});

test('地图挑战：地牢里有怪群和首领，自动战斗能清怪、掉落，并在首领死后通关', () => {
  const a = ARCHETYPES.find(x => x.id === 'flicker');
  const save = newSave(); applyArchetype(save, a.id, 2);
  const run = new MapRun(buildOf(save), { tier: 4, seed: 7 });
  assert.ok(run.total > 30 && run.boss?.boss);
  const h = run.hero; h.brain = 'chase'; h.aggro = 99999;
  for (const sk of run.skills) sk.manual = false;
  for (let t = 0; t < 400 && run.phase === 'running'; t += 1 / 30) run.step(1 / 30);
  assert.equal(run.phase, 'cleared', `击杀 ${run.kills}/${run.total}`);
  assert.ok(run.kills > 20);
  assert.ok(run.collectAll().length > 5, '有掉落');
});

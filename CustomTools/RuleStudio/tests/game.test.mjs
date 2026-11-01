// 游戏层：装备掉落与洗炼、存档与一键流派、地图挑战（无画面跑一局）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { rollItem, rollDrops, applyCurrency, rarityOf, itemAffixes, MAX_LINES, BASE_LINES, ITEM_SKILLS, isTrait } from '../core/content/items.mjs';
import { family, LAYERS, SLOTS } from '../core/content/families.mjs';
import { newSave, applyArchetype, buildOf, equip, unequip, craft } from '../public/game/save.mjs';
import { MapRun } from '../public/game/run.mjs';
import { dungeonRandom } from '../public/game/dungeon.mjs';
import { ARCHETYPES } from '../core/content/archetypes.mjs';

test('掉落：基底 3 条 = 主动技能（可能有）+ 特性；随机词条只出数值；按部位和层级门槛，同件不重复', () => {
  const rng = dungeonRandom(5);
  let skills = 0, cores = 0;
  for (let i = 0; i < 600; ++i) {
    const it = rollItem(1 + (i % 10), rng);
    assert.ok(it.lines.length <= MAX_LINES);
    assert.equal(it.traits.length + (it.skill ? 1 : 0), BASE_LINES, '基底正好 3 条');
    if (it.slot === 'weapon') assert.ok(it.skill, '武器必带主动技能');
    if (it.skill) { skills++; assert.ok(ITEM_SKILLS.includes(it.skill)); }
    const ids = [...it.traits, ...it.lines].map(l => l.id);
    assert.equal(new Set(ids).size, ids.length, '同件同族不重复');
    for (const l of it.traits) { const f = family(l.id); assert.ok(isTrait(l.id), `${l.id} 不是特性`); assert.ok(f.slots.includes(it.slot)); assert.ok(it.tier >= LAYERS[f.layer].minItemTier); if (f.layer === 'core') cores++; }
    for (const l of it.lines) {
      const f = family(l.id);
      assert.equal(f.layer, 'stat', `随机词条 ${l.id} 应是数值层`);
      assert.ok(f.slots.includes(it.slot), `${l.id} 不能出现在 ${it.slot}`);
      assert.ok(l.tier >= 1 && l.tier <= f.levels);
    }
    assert.ok(itemAffixes(it).filter(a => !a.id.startsWith('base:')).length === it.traits.length + it.lines.length);
  }
  assert.ok(skills > 100 && cores > 0, `技能 ${skills} 核心 ${cores}`);
  const boss = rollDrops(10, 'boss', rng);
  assert.ok(boss.filter(d => d.type === 'item').length >= 3 && boss.some(d => d.type === 'currency'));
});

test('洗炼：随机词条用魔晶/混沌/灵石/无效；特性用精华重铸、淬火升阶；技能石换技能；封印保留', () => {
  const rng = dungeonRandom(9);
  const it = rollItem(8, rng, 'amulet'); it.lines = [];
  assert.ok(applyCurrency(it, 'augment', rng).ok); assert.equal(it.lines.length, 1);
  while (it.lines.length < 4) applyCurrency(it, 'augment', rng);
  assert.ok(applyCurrency(it, 'seal', rng, { kind: 'line', index: 1 }).ok);
  const sealed = it.lines[1].id;
  assert.ok(applyCurrency(it, 'chaos', rng).ok);
  assert.equal(it.lines.length, 4); assert.ok(it.lines.some(l => l.id === sealed), '封印词条保留');
  assert.ok(it.lines.every(l => family(l.id).layer === 'stat'));
  assert.ok(applyCurrency(it, 'annul', rng).ok); assert.equal(it.lines.length, 3);
  const n = it.traits.length;
  assert.ok(applyCurrency(it, 'essence_core', rng, { kind: 'trait', index: 0 }).ok);
  assert.equal(it.traits.length, n); assert.equal(family(it.traits[0].id).layer, 'core');
  it.traits[0].tier = 1;
  assert.ok(applyCurrency(it, 'temper', rng, { kind: 'trait', index: 0 }).ok); assert.equal(it.traits[0].tier, 2);
  const low = rollItem(2, rng, 'amulet');
  assert.equal(applyCurrency(low, 'essence_link', rng).ok, false, 'T2 不能重铸为联动特性');
  const w = rollItem(5, rng, 'weapon'), before = w.skill;
  assert.ok(applyCurrency(w, 'skill_gem', rng).ok); assert.notEqual(w.skill, before);
  assert.equal(applyCurrency(rollItem(5, rng, 'belt'), 'skill_gem', rng).ok, false, '腰带不带技能');
  assert.ok(['普通', '魔法', '稀有', '传世'].includes(rarityOf(it).name));
});

test('存档：一键流派换上 10 件装备（20 多条特性）、技能来自武器；技能栏只放身上的技能；洗炼消耗通货', () => {
  const save = newSave();
  assert.equal(save.skills[0], 'fireball', '新角色带火球法杖');
  applyArchetype(save, 'storm', 4);
  assert.ok(SLOTS.every(s => save.equipped[s]));
  assert.equal(save.equipped.weapon.skill, 'arc');
  assert.equal(save.skills[0], 'arc');
  const traits = SLOTS.reduce((n, s) => n + save.equipped[s].traits.length, 0);
  assert.ok(traits >= 20, `特性 ${traits}`);
  const build = buildOf(save);
  assert.ok(build.affixes.length >= 80);
  const it = rollItem(5, dungeonRandom(3), 'boots');
  save.inventory.push(it); equip(save, it.uid);
  assert.equal(save.equipped.boots.uid, it.uid);
  if (it.skill) assert.ok(save.skills.includes(it.skill), '装备带的技能自动进技能栏');
  assert.equal(craft(save, save.equipped.boots, 'augment', dungeonRandom(1)).ok, false, '没有通货');
  save.currencies.augment = 1; save.equipped.boots.lines = [];
  assert.ok(craft(save, save.equipped.boots, 'augment', dungeonRandom(1)).ok);
  assert.equal(save.currencies.augment, 0);
  unequip(save, 'weapon');
  assert.ok(!save.skills.includes('arc'), '卸下武器，技能离开技能栏');
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

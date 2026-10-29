import test from 'node:test';
import assert from 'node:assert/strict';
import { inventoryEntries, filterInventoryEntries, inventoryPage, characterPanel, ItemInspector } from '../public/battle-panels.mjs';
import { readBaselineRuleFiles } from './rule-fixture.mjs';
import { checkRuleSet, statusKey, sourceFromEntry } from '../engine/index.mjs';
import { Battle } from '../public/sim/battle.mjs';
import { HERO_TARGET_ID } from '../public/sim/arena.mjs';
import { affixText, traitText } from '../public/affix-text.mjs';

test('物品词条: show actual rolled values once, preserving signs, units and parameter order', () => {
  const { library } = checkRuleSet(readBaselineRuleFiles());
  assert.equal(traitText({ id: 'trigger_repeat', params: { n: 2 } }, library), '触发技能额外重复 +2');
  assert.equal(traitText({ id: 'trigger_mount', params: { n: 1 } }, library), '可挂载的触发技能数量 +1');
  assert.equal(traitText({ id: 'trigger_chance', params: { n: 20 } }, library), '触发概率 +20%');
  assert.equal(traitText({ id: 'trigger_cooldown_flat', params: { n: .4 } }, library), '触发冷却时间 -0.4s');
  assert.equal(traitText({ id: 'trigger_resource_reduction', params: { n: 37 } }, library), '触发所需累计资源量 -37%');
  assert.equal(traitText({ id: 'trig_life_lost', params: { per: 13 } }, library), '每累计损失最大气血的13%，触发挂载技能');
  assert.equal(traitText({ id: 'lightning_damage', params: { amount: 10 } }, library), '闪电伤害 +10');
  assert.equal(traitText({ id: 'flat_fire', params: { N: 0 } }, library), '基础火焰伤害 +0');
  assert.equal(traitText({ id: 'flat_fire', params: { n: -2.5 } }, library), '基础火焰伤害 -2.5');
  assert.equal(traitText({ id: 'area_per_life', params: { amount: 7, per: 120 } }, library), '每120点最大气血，技能范围面积 +7%');
  assert.equal(traitText({ id: 'flask_life', params: { seconds: 2.5, amount: 75 } }, library), '2.5s内恢复气血 +75');
  const affix = { name: '过时模板 +n', tier: 10, traits: [{ id: 'lightning_damage', params: { amount: 12 } }, { id: 'shock', params: { amount: 25, duration: 4 } }] };
  const before = structuredClone(affix);
  assert.equal(affixText(affix, library), '闪电伤害 +12；感电：受到伤害 +25%，持续4s');
  assert.deepEqual(affix, before);
});

test('战斗背包: only projects actual owned counts, instances and equipped state without mutating the save', () => {
  const player = {
    owned: { equipment: { staff: 2, none: 0 }, item: { potion: 3, exhausted: 0 }, skill: { frost: true, unlearned: false } },
    instances: { rolled: { uid: 'rolled', name: '实际装备', rarity: 'rare', affixes: [{ id: 'chill' }] } },
    loadout: { equipment: { weapon: 'rolled' }, skills: ['frost', null, null, null], belt: ['potion'] },
  };
  const before = structuredClone(player);
  const collections = { equipment: new Map([['staff', { doc: { name: '法杖', rarity: 'magic' } }]]), item: new Map(), skill: new Map() };
  const entries = inventoryEntries(player, collections);
  assert.deepEqual(entries.map(e => [e.id, e.count, e.equipped]), [['staff', 2, false], ['rolled', 1, true], ['potion', 3, true], ['frost', 1, true]]);
  assert.equal(entries[1].affixCount, 1);
  assert.equal(entries[2].name, 'potion', 'missing documents retain the actual id');
  assert.deepEqual(player, before);
  player.owned.item.potion = 2;
  assert.equal(inventoryEntries(player, collections).find(e => e.id === 'potion').count, 2);
});

test('背包搜索: matches names, descriptions and actual fixed / random traits without changing inventory', () => {
  const { library } = checkRuleSet(readBaselineRuleFiles());
  const entries = [
    { name: '寒霜药剂', description: '恢复魔力', traits: [] },
    { name: 'Storm Ring', legendary: { traits: [{ id: 'lightning_damage', params: { amount: 12 } }] }, affixes: [{ traits: [{ id: 'trigger_repeat', params: { n: 2 } }] }] },
    { name: '普通法杖', traits: [{ id: 'cold_mastery' }] },
  ], before = structuredClone(entries);
  assert.equal(filterInventoryEntries(entries, '  ', library), entries);
  for (const text of ['寒霜', '恢复魔力']) assert.deepEqual(filterInventoryEntries(entries, text, library), [entries[0]]);
  for (const text of [' storm ', '闪电伤害 +12', '额外重复 +2']) assert.deepEqual(filterInventoryEntries(entries, text, library), [entries[1]]);
  assert.deepEqual(filterInventoryEntries(entries, '冰霜伤害', library), [entries[2]]);
  assert.deepEqual(filterInventoryEntries(entries, '不存在的物品', library), []);
  assert.equal(inventoryPage(filterInventoryEntries(entries, '寒霜', library), 99).page, 0);
  assert.deepEqual(entries, before);
});

test('战斗背包: every page contains 72 cells and overflow remains reachable', () => {
  assert.equal(inventoryPage([]).cells.length, 72);
  const entries = Array.from({ length: 150 }, (_, id) => ({ id }));
  const first = inventoryPage(entries), last = inventoryPage(entries, 99);
  assert.equal(first.cells.length, 72);
  assert.equal(first.pages, 3);
  assert.equal(last.page, 2);
  assert.deepEqual(last.cells.filter(Boolean).map(e => e.id), [144, 145, 146, 147, 148, 149]);
  assert.equal(inventoryPage(entries, -1).page, 0);
  assert.equal(inventoryPage(entries.slice(0, 2), last.page).page, 0);
});

test('物品详情: Ctrl only pins; repeated pin and transient dismissals preserve it until explicit close', () => {
  const inspector = new ItemInspector(), rect = { left: 280, right: 310, top: 480 };
  inspector.enter('equipment:first', rect, 1280, 720);
  assert.equal(inspector.key, 'equipment:first'); assert.equal(inspector.pinned, false);
  inspector.leave('equipment:first'); assert.equal(inspector.key, '');
  inspector.enter('equipment:first', rect, 1280, 720); inspector.pin();
  const position = [inspector.x, inspector.y];
  inspector.leave('equipment:first'); inspector.enter('equipment:second', { left: 800, right: 830, top: 500 }, 1280, 720);
  assert.equal(inspector.key, 'equipment:first'); assert.equal(inspector.pinned, true);
  assert.deepEqual([inspector.x, inspector.y], position);
  inspector.pin(); inspector.closeHover();
  assert.equal(inspector.key, 'equipment:first'); assert.equal(inspector.pinned, true);
  inspector.close(); assert.equal(inspector.key, ''); assert.equal(inspector.pinned, false);
  inspector.enter('item:small', rect, 320, 300);
  assert.ok(inspector.x >= 12 && inspector.x <= 12); assert.equal(inspector.y, 12);
  inspector.closeHover(); assert.equal(inspector.key, '');
  inspector.pin(); assert.equal(inspector.pinned, false);
});

test('玩家状态: character rows and active effects come from the battle runtime and expire with it', () => {
  const files = readBaselineRuleFiles(), check = checkRuleSet(files);
  assert.ok(check.ok, check.error);
  const battle = new Battle(files, { collections: check.collections, maxMonsters: 0, spawnRate: 0, god: true });
  battle.setLoadout({ skills: ['sentinel'] });
  battle.host.applyStatus(HERO_TARGET_ID, 'chill', 30, 0.2);
  let panel = characterPanel(battle);
  assert.deepEqual(panel.rows, battle.character.panel());
  assert.deepEqual(panel.flags, ['无敌']);
  assert.equal(panel.statuses.find(s => s.id === 'chill').value, 30);
  assert.equal(panel.statuses.find(s => s.id === 'chill').remaining, battle.host.world.getStatusRemaining(HERO_TARGET_ID, statusKey('chill')));
  battle.hero.casting = true;
  for (let i = 0; i < 40; ++i) battle.step(1 / 60);
  panel = characterPanel(battle);
  assert.equal(panel.statuses.length, 0);
  assert.equal(panel.casts, battle.hero.casts);
  assert.ok(panel.casts > 0);
  assert.equal(panel.damageDealt, battle.damageDealt);
  assert.equal(panel.damageTaken, battle.damageTaken);
});

test('玩家状态: attributes, combat speeds, crit, resistances and every held trait follow the loadout', () => {
  const files = [...readBaselineRuleFiles(), { path: 'Equipment/test_void_charm.json', text: JSON.stringify({ id: 'test_void_charm',
    name: '虚空护符', slot: 'amulet', traits: [{ id: 'void_damage', params: { amount: 15 } }] }) }], check = checkRuleSet(files);
  assert.ok(check.ok, check.error);
  const battle = new Battle(files, { collections: check.collections, maxMonsters: 0, spawnRate: 0, god: true });
  battle.setLoadout({ skills: ['frost_lance'], equipment: { weapon: 'test_projectile_weapon', amulet: 'test_void_charm' } });
  battle.step(1 / 60);
  let panel = characterPanel(battle);
  assert.deepEqual(panel.attributes.map(a => a.name), ['力量', '敏捷', '智力', '体质']);
  assert.deepEqual(panel.attributes.map(a => a.value), Object.values(battle.character.attributes).map(v => Math.round(v * 10) / 10));
  const stat = key => panel.combat.find(c => c.key === key);
  // 冰霜精通: cast speed +40%, crit +10; 多重投射 +4.
  assert.equal(stat('cast').value, `${Math.round(battle.hero.castsPerSecond * 100) / 100} 次/秒`);
  assert.equal(stat('cast').value, '4.2 次/秒');
  assert.equal(stat('crit').value, '15%');
  assert.equal(stat('critx').value, '150%');
  assert.equal(stat('move').value, `${Math.round(battle.hero.speed) / 100} m/s`);
  assert.equal(stat('count').value, '5 枚');
  assert.ok(!panel.survival.some(r => r.name.startsWith('力量')));
  const names = group => panel.traits.groups.find(g => g.key === group)?.rows.map(r => r.id) || [];
  assert.deepEqual(names('skill'), ['create_ice_lance', 'chill']);
  assert.deepEqual(names('equipment'), ['cold_mastery', 'multiple_projectiles', 'pierce', 'frost_damage', 'lightning_damage', 'void_damage']);
  assert.equal(panel.traits.groups.find(g => g.key === 'equipment').rows.find(r => r.id === 'frost_damage').name, '冰霜伤害 +6');
  assert.equal(panel.traits.groups.find(g => g.key === 'skill').rows.find(r => r.id === 'create_ice_lance').name, '创建冰锥：伤害 16');

  // Consumable: timed traits appear with their remaining time and raise frost resistance; chill slows movement.
  battle.useItem('frost_tonic');
  battle.host.grantTraits(HERO_TARGET_ID, [{ id: 'flat_lightning', params: { n: 17 } }], 5, '面板测试增益');
  battle.host.applyStatus(HERO_TARGET_ID, 'chill', 30, 5);
  battle.step(1 / 60);
  panel = characterPanel(battle);
  const timed = panel.traits.groups.find(g => g.key === 'timed').rows;
  assert.ok(timed.some(r => r.id === 'flat_lightning' && r.name === '基础闪电伤害 +17' && r.from === '面板测试增益'));
  assert.ok(timed.some(r => r.id === 'frost_resistance' && r.remaining > 9 && r.from === '寒霜药剂'));
  assert.ok(panel.resistances.find(r => r.element === 'frost').value > 0);
  assert.ok(stat('move').delta < 0, 'chill slows the hero');
});

test('玩家点伤: compiled projectile points and on-hit parameter overrides are shown separately from multipliers', () => {
  const files = readBaselineRuleFiles(), check = checkRuleSet(files);
  const battle = new Battle(files, { collections: check.collections, maxMonsters: 0, spawnRate: 0 });
  battle.setLoadout({ skills: ['frost_lance'], equipment: { weapon: 'test_projectile_weapon' } });
  // Use the same character-sheet aggregation as equipment, with a distinct extra element.
  battle.character.setSheet([{ source: sourceFromEntry(check.library, { id: 'flat_fire', params: { n: 12 } }) },
    { source: sourceFromEntry(check.library, { id: 'flat_frost', params: { n: 8 } }) }]);
  battle.host.grantTraits(HERO_TARGET_ID, [{ id: 'brittle', params: { ratio: 2 } }], 5, '条件追加伤害');
  const panel = characterPanel(battle), points = panel.damagePoints;
  assert.equal(points.primary.length, 1);
  assert.equal(points.primary[0].element, 'frost');
  assert.ok(points.added.some(row => row.element === 'frost' && row.amount === 6 && row.source === '冰霜伤害'));
  assert.ok(points.added.some(row => row.element === 'fire' && row.amount === 12 && row.detail === '命中追加'));
  assert.equal(panel.baseDamage.find(row => row.element === 'frost').amount, 14, '6 on-hit + 8 character flat, excluding conditional secondary damage');
  assert.equal(panel.baseDamage.find(row => row.element === 'fire').amount, 12);
  assert.ok(points.added.some(row => row.amount === null && !row.base), 'conditional damage keeps its own context');
  battle.hero.casting = true;
  for (let i = 0; i < 30 && !battle.host.world.carriers.num; i++) battle.step(1 / 60);
  const carriers = battle.host.world.carriers;
  assert.ok(carriers.num > 0);
  assert.ok(Math.abs(points.primary[0].amount - carriers.damage[0]) <= .051, 'display uses the actual per-projectile base, after projectile modifiers');
  battle.setLoadout({ skills: [] });
  assert.deepEqual(characterPanel(battle).damagePoints, { primary: [], added: [] });
  assert.ok(characterPanel(battle).baseDamage.every(row => row.amount === 0));
});

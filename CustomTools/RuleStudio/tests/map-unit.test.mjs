import test from 'node:test';
import assert from 'node:assert/strict';
import { readRuleFiles } from '../scripts/rule-files.mjs';
import { checkRuleSet, MapUnit, MAP_UNIT_ID, pawnEquipmentSlots, createPawnEquipment, equipmentAffixPool,
  emptyMonster, emptyMonsterSkill, EStat, isFixedEquipmentSlot, parseCollection } from '../engine/index.mjs';
import { DungeonBattle, TowerRun } from '../public/sim/dungeon-battle.mjs';
import { mapEquipmentPanel, monsterLineagePanel } from '../public/battle-panels.mjs';

const files = [...readRuleFiles(), { path: 'Traits/map_test_no_crit.json', text: JSON.stringify({ id: 'map_test_no_crit',
  modifiers: [{ target: 'owner', stat: 'critical_chance', op: 'set', value: 0 }] }) }];
const check = checkRuleSet(files);
assert.ok(check.ok, check.error);
const core = () => structuredClone(check.collections.equipment.get('map_core_equipment').doc);
const equipment = (packs = 0, life = 0, damage = 0) => {
  const item = core();
  item.traits.slice(0, 3).forEach((trait, i) => { trait.params.n = [packs, life, damage][i]; });
  return { map: item };
};
const monster = { ...emptyMonster('map_test_beast'), name: '地图测试怪物', speed: 0, traits: ['map_test_no_crit'],
  skills: [{ ...emptyMonsterSkill(), range: 200, cooldown: 99 }] };
const battle = options => new DungeonBattle(files, { collections: check.collections, monsterTypes: [monster], seed: 18, ...options });
const near = (a, b) => assert.ok(Math.abs(a - b) < Math.max(1e-5, Math.abs(b) * 2e-6), `${a} != ${b}`);

test('地图装备: fixed map slot and ordinary gear use the existing equipment pipeline without leaking into player rolls', () => {
  assert.equal(pawnEquipmentSlots('map').length, 10);
  assert.ok(isFixedEquipmentSlot('map'));
  assert.throws(() => createPawnEquipment({ map: core() }, 'player'), /不支持装备槽/);
  assert.throws(() => createPawnEquipment({ character: null }, 'map'), /不支持装备槽/);
  assert.equal(equipmentAffixPool(check.library).some(row => row.id.startsWith('map_')), false);
  const equipped = equipment(100, 50, 25);
  const map = new MapUnit(check.library, check.collections, { equipment: equipped });
  assert.equal(map.character.stat('map.monster_packs'), 100);
  equipped.map.traits[0].params.n = 900;
  assert.equal(map.character.stat('map.monster_packs'), 100);
  assert.equal(map.equipment.map.traits[0].params.n, 100);
  const { doc: gear } = parseCollection('equipment', { id: 'map_ring', name: '地图戒指', slot: 'ring', rarity: 'common', level: 1, skills: [],
    traits: [{ id: 'minion_life', params: { n: 30 } }, { id: 'life_base', params: { n: 999 } }] });
  map.setEquipment({ map: null, ring: gear });
  assert.equal(map.character.stat('minion.life_increased'), 30);
  const b = battle({ mapEquipment: { map: null, ring: gear } }); b.step(1 / 60);
  near(b.monsters[0].maxHealth, b.monsters[0].baseMaxHealth * 1.3);
});

test('怪物群: +100% doubles ordinary dungeon monsters, keeps one boss, clamps total to 300 and leaves defaults unchanged', () => {
  const unchanged = battle(); assert.equal(unchanged.monsterCount, 20);
  assert.deepEqual(unchanged.waveCounts, [19]);
  const b = battle({ mapEquipment: equipment(100) });
  assert.equal(b.baseMonsterCount, 20); assert.equal(b.monsterCount, 39);
  assert.deepEqual(b.waveCounts, [38]);
  assert.equal(battle({ monsterCount: 300, mapEquipment: equipment(100) }).monsterCount, 300);
  assert.equal(battle({ mapEquipment: equipment(-100) }).monsterCount, 1);
  b.step(1 / 60);
  const ordinary = b.monsters.filter(m => !m.boss);
  assert.equal(ordinary.length, 38);
  for (const m of ordinary) m.health = 0;
  b.step(1 / 60);
  assert.equal(b.monsters.length, 1); assert.ok(b.boss);
  assert.equal(b.boss.summonerId, MAP_UNIT_ID);
});

test('地图单位: all created monsters have map summon ownership and independent attack owners; map cannot be attacked', () => {
  const b = battle(); b.step(1 / 60);
  assert.equal(b.map.invulnerable, true);
  for (const m of b.monsters) {
    assert.equal(m.summonerId, b.map.id); assert.equal(m.summonerOwner, b.map.owner);
    assert.notEqual(m.owner, b.map.owner);
  }
  assert.equal(new Set(b.monsters.map(m => m.owner)).size, b.monsters.length);
  assert.equal(b.host.world.targets.externalId.includes(MAP_UNIT_ID), false);
  assert.equal(b.host.world.summons.length, 0, 'map ownership must not duplicate actors in the player-summon AI');
});

test('地图召唤物: life and actual attack damage compose with tower equipment, without compounding on refresh', () => {
  const b = battle({ floor: 2, mapEquipment: equipment(0, 50, 25) });
  b.setLoadout({ skills: [] }); b.step(1 / 60);
  const m = b.monsters[0];
  near(m.maxHealth, m.baseMaxHealth * 2 * 1.5);
  near(b.host.plan(m.traitPlan).stats.get(EStat.OwnerDamageMultiplier), 1.2 * 1.25);
  m.health = m.maxHealth / 2;
  b.refreshMonsterEquipment(m); b.refreshMonsterEquipment(m);
  near(m.maxHealth, m.baseMaxHealth * 3); near(m.health, m.maxHealth / 2);
  for (const other of b.monsters) other.cooldown = 999;
  Object.assign(m, { x: b.hero.x - 100, y: b.hero.y, cooldown: 0, skillCooldowns: [0] });
  const hits = []; b.host.world.trace = (kind, row) => { if (kind === 'damage') hits.push(row); };
  b.step(1 / 60);
  assert.equal(hits.length, 1); near(hits[0].raw, 10 * 1.2 * 1.25);
  assert.equal(b.hero.maxHealth, 400);
  b.map.setEquipment(equipment(0, 20, 50));
  b.refreshMonsterEquipment(m);
  near(m.maxHealth, m.baseMaxHealth * 2 * 1.2);
  near(b.host.plan(m.traitPlan).stats.get(EStat.OwnerDamageMultiplier), 1.2 * 1.5);
  m.cooldown = 0; m.skillCooldowns = [0]; hits.length = 0;
  b.step(1 / 60);
  assert.equal(hits.length, 1); near(hits[0].raw, 10 * 1.2 * 1.5);
});

test('地图装备展示: exact equipped overrides are used; absent gear and empty affixes stay explicit', () => {
  const b = battle({ mapEquipment: equipment(100, 20, 25) });
  assert.deepEqual(mapEquipmentPanel(b).equipment[0].affixes.map(row => row.text),
    ['怪物群 +100%', '地图召唤物气血 +20%', '地图召唤物伤害 +25%', '首领有 60% 概率掉落同级地图']);
  assert.ok(mapEquipmentPanel(b).equipment[0].affixes.every(row => row.active));
  assert.deepEqual(mapEquipmentPanel(battle({ mapEquipment: {} })).equipment, []);
  const item = core(); item.traits = [];
  assert.deepEqual(mapEquipmentPanel(battle({ mapEquipment: { map: item } })).equipment[0].affixes, []);
  const { doc: ring } = parseCollection('equipment', { id: 'map_duplicate_name', name: item.name, slot: 'ring', rarity: 'common', level: 1,
    skills: [], traits: [{ id: 'minion_life', params: { n: 30 } }] });
  const view = mapEquipmentPanel(battle({ mapEquipment: { ...equipment(100), ring } }));
  assert.equal(view.equipment[0].affixes.length, 4);
  assert.deepEqual(view.equipment[1].affixes.map(row => row.text), ['召唤物气血上限 +30%']);
});

test('地图装备: tower floors retain configuration but never share mutable equipment documents', () => {
  const run = new TowerRun(files, { collections: check.collections, monsterTypes: [monster], mapEquipment: equipment(100), seed: 18 });
  const before = run.battle.map.equipment.map;
  run.battle.phase = 'cleared'; assert.equal(run.advance(), true);
  assert.equal(run.battle.monsterCount, 39);
  assert.notEqual(run.battle.map.equipment.map, before);
  before.traits[0].params.n = 900;
  assert.equal(run.battle.map.equipment.map.traits[0].params.n, 100);
});

test('地图谱系: show only the current floor pool, preserve zero-count lineages and include actual living counts', () => {
  const claw = check.monsters.get('claw_beast').doc, frost = check.monsters.get('frost_caster').doc;
  const later = check.monsters.get('glacial_deluge').doc;
  const b = battle({ monsterTypes: [claw, frost, later] });
  let rows = mapEquipmentPanel(b).lineages;
  assert.deepEqual(rows.map(row => row.id), [claw.equipment.lineage, frost.equipment.lineage]);
  assert.ok(rows.every(row => row.count === 0));
  b.step(1 / 60); rows = monsterLineagePanel(b);
  assert.equal(rows.reduce((sum, row) => sum + row.count, 0), b.monsters.length);
  b.monsters[0].health = 0;
  assert.equal(monsterLineagePanel(b).reduce((sum, row) => sum + row.count, 0), b.monsters.length - 1);
  const high = battle({ floor: 11, monsterTypes: [later] });
  const info = monsterLineagePanel(high)[0];
  assert.equal(info.id, later.equipment.lineage);
  assert.equal(info.affixes.length, check.collections.equipment.get(later.equipment.lineage).doc.traits.length);
  assert.ok(info.affixes.some(text => /\d/.test(text)), 'show resolved numbers, not placeholders');
});

test('地图谱系: shared lineages group together; live equipment overrides show their own actual trait values', () => {
  const claw = check.monsters.get('claw_beast').doc;
  const other = { ...claw, id: 'shared_lineage_test', name: '共享谱系怪物' };
  const b = battle({ monsterTypes: [claw, other] }); b.step(1 / 60);
  let rows = monsterLineagePanel(b);
  assert.equal(rows.length, 1); assert.equal(rows[0].count, 20);
  assert.deepEqual(rows[0].monsters, [claw.name, other.name]);
  const originalAffixes = rows[0].affixes;
  const item = structuredClone(check.collections.equipment.get(claw.equipment.lineage).doc);
  item.traits = item.traits.map(entry => entry.id === 'life_base' ? { ...entry, params: { n: 35 } } : entry);
  b.setMonsterEquipment(b.monsters[0], 'lineage', item);
  rows = monsterLineagePanel(b);
  assert.equal(rows.length, 2);
  const override = rows.find(row => row.affixes.some(text => /\+35/.test(text)));
  assert.ok(override); assert.equal(override.count, 1);
  assert.equal(override.affixes.length, item.traits.length);
  const original = rows.find(row => row !== override);
  assert.equal(original.count, 19); assert.deepEqual(original.affixes, originalAffixes);
});

test('地图谱系: Boss ownership and empty lineage configuration are represented accurately', () => {
  const claw = check.monsters.get('claw_beast').doc;
  const b = battle({ monsterTypes: [claw] }); b.step(1 / 60);
  for (const m of b.monsters) if(!m.boss) m.health = 0;
  b.step(1 / 60);
  const row = monsterLineagePanel(b)[0];
  assert.equal(row.count, 1); assert.equal(row.bosses, 1); assert.equal(row.id, claw.equipment.lineage);
  b.boss.health = 0; b.step(1 / 60);
  assert.equal(monsterLineagePanel(b)[0].count, 0);
  const none = battle({ monsterTypes: [{ ...claw, equipment: { ...claw.equipment, lineage: null } }] }); none.step(1 / 60);
  assert.equal(monsterLineagePanel(none)[0].name, '未配置谱系');
  assert.deepEqual(monsterLineagePanel(none)[0].affixes, []);
});

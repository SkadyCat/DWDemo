import test from 'node:test';
import { TOWER_LIFE, TOWER_DAMAGE } from './rule-fixture.mjs';
import assert from 'node:assert/strict';
import { readRuleFiles } from '../scripts/rule-files.mjs';
import {
  checkRuleSet, createPawnEquipment, resolvePawnEquipment, emptyMonster, emptyMonsterSkill, parseMonster,
  PLAYER_FIXED_SLOTS, MONSTER_FIXED_SLOTS, MONSTER_RARITIES, MONSTER_RARITY_EQUIPMENT,
  monsterTowerEquipment, listings, rollEquipmentDrop, equipmentRandom, isFixedEquipmentSlot,
} from '../engine/index.mjs';
import { Battle } from '../public/sim/battle.mjs';
import { DungeonBattle } from '../public/sim/dungeon-battle.mjs';

const files = readRuleFiles(), check = checkRuleSet(files);
assert.ok(check.ok, check.error);
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < Math.max(1e-5, Math.abs(expected) * 2e-6), `${actual} != ${expected}`);
const traitsOn = (entries, replace = []) => files.map(file => {
  const traits = entries[file.path]; if (!traits) return file;
  const doc = JSON.parse(file.text);
  doc.traits = replace.includes(file.path) ? traits : [...doc.traits, ...traits];
  return { ...file, text: JSON.stringify(doc) };
});

test('固定槽: monster has three, player has two plus ordinary gear; roles and slots cannot cross', () => {
  assert.deepEqual(MONSTER_FIXED_SLOTS.map(slot => slot.id), ['lineage', 'rarity', 'tower']);
  assert.deepEqual(PLAYER_FIXED_SLOTS.map(slot => slot.id), ['tower', 'character']);
  assert.deepEqual(createPawnEquipment({}, 'monster'), { lineage: null, rarity: null, tower: null });
  assert.deepEqual(createPawnEquipment({}, 'player'), { tower: null, character: null });
  assert.throws(() => createPawnEquipment({ lineage: null }, 'player'), /不支持装备槽/);
  assert.throws(() => createPawnEquipment({ character: null }, 'monster'), /不支持装备槽/);
  assert.throws(() => resolvePawnEquipment(check.collections, { lineage: 'monster_tower_equipment' }, 'monster'), /装备或槽位无效/);
  assert.match(parseMonster({ ...emptyMonster('wrong_slot'), name: '错槽', equipment: { character: null } }).error, /三个固定槽/);
  for (const entry of check.monsters.values()) {
    assert.equal(entry.doc.equipment.lineage, `monster_lineage_${entry.doc.id}`);
    assert.equal(entry.doc.equipment.tower, 'monster_tower_equipment');
    assert.deepEqual(Object.keys(entry.doc.equipment), ['lineage', 'rarity', 'tower']);
  }
});

test('稀有度固定槽: all four choices spawn and Boss encounter equips the Boss item', () => {
  for (const rarity of MONSTER_RARITIES) {
    const doc = { ...emptyMonster('chosen_rarity'), name: '稀有度测试', equipment: { lineage: null, rarity: MONSTER_RARITY_EQUIPMENT[rarity.id], tower: 'monster_tower_equipment' }, skills: [emptyMonsterSkill()] };
    const b = new DungeonBattle(files, { collections: check.collections, monsterTypes: [doc], floor: 3, seed: 18 });
    b.setLoadout({ skills: [] }); b.step(1 / 60);
    for (const m of b.monsters) {
      assert.equal(m.rarity, rarity.id); assert.equal(m.equipment.rarity.id, MONSTER_RARITY_EQUIPMENT[rarity.id]);
      near(m.maxHealth, m.baseMaxHealth * 4);
      assert.equal(m.baseDamage, rarity.id === 'boss' ? 30 : rarity.id === 'rare' ? 20 : 10);
    }
    for (let wave = 0; wave < 3; wave++) { for (const m of b.monsters) m.health = 0; b.step(1 / 60); }
    assert.ok(b.boss); assert.equal(b.boss.rarity, 'boss');
    assert.equal(b.boss.equipment.rarity.id, MONSTER_RARITY_EQUIPMENT.boss);
    assert.equal(b.boss.equipment.tower.traits[0].params.level, 3);
    assert.equal(b.boss.baseDamage, 30);
  }
});

test('怪物固定装备: all three slots aggregate existing affixes and removing each slot removes its contribution', () => {
  const ownFiles = traitsOn({
    'Equipment/monster_lineage_claw_beast.json': [{ id: 'life_base', params: { n: 10 } }],
    'Equipment/monster_rarity_common.json': [{ id: 'life_base', params: { n: 20 } }, { id: 'flat_fire', params: { n: 8 } }],
    'Equipment/monster_tower_equipment.json': [{ id: 'life_base', params: { n: 30 } }],
  }, ['Equipment/monster_lineage_claw_beast.json']);
  ownFiles.push({ path: 'Traits/fixed_slot_no_crit.json', text: JSON.stringify({ id: 'fixed_slot_no_crit', modifiers: [{ target: 'owner', stat: 'critical_chance', op: 'set', value: 0 }] }) });
  const own = checkRuleSet(ownFiles); assert.ok(own.ok, own.error);
  const doc = { ...emptyMonster('equipped'), name: '聚合测试', speed: 0, equipment: { lineage: 'monster_lineage_claw_beast', rarity: 'monster_rarity_common', tower: 'monster_tower_equipment' }, traits: ['fixed_slot_no_crit'], skills: [{ ...emptyMonsterSkill(), range: 200, cooldown: 99 }] };
  const b = new Battle(ownFiles, { collections: own.collections, monsterTypes: [doc], spawnRate: 0, maxMonsters: 0 });
  b.setLoadout({ skills: [] }); b.spawnMonsters(2);
  const [m, other] = b.monsters;
  b.setMonsterEquipment(m, 'tower', monsterTowerEquipment(own.collections, 2));
  near(m.maxHealth, (m.baseMaxHealth + 60) * TOWER_LIFE);
  for (const slot of MONSTER_FIXED_SLOTS) assert.notEqual(m.equipment[slot.id], other.equipment[slot.id]);
  Object.assign(m, { x: -100, y: 0, cooldown: 99 }); other.cooldown = 99; b.step(1 / 60); m.cooldown = 0;
  const hits = []; b.host.world.trace = (kind, row) => { if (kind === 'damage') hits.push(row); };
  b.step(1 / 60); assert.equal(hits.length, 2); near(hits[0].raw, 7 * TOWER_DAMAGE); near(hits[1].raw, 8 * TOWER_DAMAGE);
  m.health = m.maxHealth / 2;
  b.setMonsterEquipment(m, 'lineage', null); near(m.maxHealth, (m.baseMaxHealth + 50) * TOWER_LIFE); near(m.health, m.maxHealth / 2);
  b.setMonsterEquipment(m, 'rarity', null); near(m.maxHealth, (m.baseMaxHealth + 30) * TOWER_LIFE);
  b.setMonsterEquipment(m, 'tower', null); near(m.maxHealth, m.baseMaxHealth);
});

test('玩家固定装备: both slots aggregate with ordinary weapon and survive loadout changes without compounding', () => {
  const ownFiles = traitsOn({
    'Equipment/player_tower_equipment.json': [{ id: 'life_base', params: { n: 20 } }],
    'Equipment/player_character_equipment.json': [{ id: 'life_base', params: { n: 60 } }],
  });
  const own = checkRuleSet(ownFiles); assert.ok(own.ok, own.error);
  const b = new Battle(ownFiles, { collections: own.collections, spawnRate: 0, maxMonsters: 0 });
  const loadout = { skills: ['frost_lance'], equipment: { weapon: 'frostthorn_staff' } };
  b.setLoadout(loadout); near(b.hero.maxHealth, 480);
  assert.deepEqual(Object.keys(b.hero.equipment), ['tower', 'character', 'weapon']);
  b.setLoadout(loadout); near(b.hero.maxHealth, 480);
  assert.equal(b.skills[0].contributions.filter(row => row.traitId === 'life_base').length, 2);
  b.setLoadout({ skills: [] }); near(b.hero.maxHealth, 480);
  b.setPlayerFixedEquipment('character', null); near(b.hero.maxHealth, 420);
  b.setPlayerFixedEquipment('tower', null); near(b.hero.maxHealth, 400);
  assert.throws(() => b.setPlayerFixedEquipment('rarity', null), /不是玩家固定槽/);
});

test('固定装备: every system slot stays outside shop, random loot and the player bag', () => {
  assert.ok(listings(check.collections, check.catalog).filter(row => row.kind === 'equipment').every(row => !isFixedEquipmentSlot(row.doc.slot)));
  const random = equipmentRandom(239);
  for (let i = 0; i < 100; i++) assert.ok(!isFixedEquipmentSlot(rollEquipmentDrop(check.collections, check.library, { random, chance: 1 }).slot));
  const fixedOnly = { equipment: new Map([...check.collections.equipment].filter(([, entry]) => isFixedEquipmentSlot(entry.doc.slot))) };
  assert.equal(rollEquipmentDrop(fixedOnly, check.library, { chance: 1, random: () => 0 }), null);
});

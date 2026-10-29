import test from 'node:test';
import assert from 'node:assert/strict';
import { readRuleFiles } from '../scripts/rule-files.mjs';
import { checkRuleSet, parseCollection, validateCollection, availableSkills, equipmentSkillIds, equipmentRandom,
  createProgression, progressionLoadout, equipmentDocument, listings } from '../engine/index.mjs';
import { rollEquipment, rollEquipmentDrop, identifyEquipment } from '../public/equipment-generation.mjs';
import { craftEquipment } from '../public/equipment-crafting.mjs';
import { cleanPlayerInventory } from '../public/player-storage.mjs';
import { Battle } from '../public/sim/battle.mjs';

const files = readRuleFiles(), checked = checkRuleSet(files);
assert.ok(checked.ok, checked.error);
const { library, collections, tags } = checked, template = collections.equipment.get('vector_control_ring').doc;
const aura = (state, c = collections) => availableSkills(state.owned.skill, state.loadout.equipment, c, state.instances).filter(s => s.id === 'vector_control');

test('逆矢指环来自普通装备目录：绑定光环，商店与正常掉落可获取，不单独出售光环技能', () => {
  assert.equal(template.name, '逆矢指环'); assert.equal(template.slot, 'ring');
  assert.deepEqual(template.skills, ['vector_control']);
  assert.equal(collections.skill.get('vector_control').type, 'aura');
  assert.equal(validateCollection('equipment', template, library).error, '');
  const stock = listings(collections, checked.catalog);
  assert.ok(stock.some(row => row.kind === 'equipment' && row.id === template.id));
  assert.ok(!stock.some(row => row.kind === 'skill' && row.id === 'vector_control'));
  const drop = rollEquipmentDrop({ equipment: new Map([[template.id, { doc: template }]]) }, library,
    { chance: 1, rarity: 'rare', tier: 4, random: equipmentRandom(123) });
  assert.equal(drop.baseId, template.id); assert.equal(drop.slot, 'ring'); assert.equal(drop.skill, 'vector_control');
});

test('普通、魔法、稀有、传奇与T阶沿用现有生成；只有实际装备且鉴定后才提供光环', () => {
  for (const rarity of ['common', 'magic', 'rare', 'legendary']) for (const tier of [1, 5, 10]) {
    const item = rollEquipment(template, library, { rarity, tier, uid: 'aura_ring', random: equipmentRandom(41 + tier) });
    assert.equal(item.skill, 'vector_control'); assert.equal(item.tier, tier);
    const count = item.affixes.length;
    assert.ok(rarity === 'common' ? count === 0 : rarity === 'magic' ? count >= 1 && count <= 2 : rarity === 'rare' ? count >= 3 && count <= 6 : count === 5 && item.legendary);
    const state = createProgression(collections, library); state.instances[item.uid] = item;
    state.owned.skill.vector_control = true; // A previous standalone purchase cannot bypass equipment.
    assert.equal(aura(state).length, 0, '背包与旧技能所有权不授予');
    state.loadout.equipment.ring = item.uid;
    assert.deepEqual(aura(state), [{ id: 'vector_control', name: '矢量操控', granted: true }]);
    assert.equal(equipmentDocument(item, collections).traits.some(t => t.id === 'projectile_capture'), false, '装备不常驻捕获效果');
    item.identified = false; assert.equal(aura(state).length, 0);
  }
  const pending = rollEquipmentDrop({ equipment: new Map([[template.id, { doc: template }]]) }, library,
    { chance: 1, rarity: 'rare', maxTier: 3, tier: 3, identified: false, random: equipmentRandom(77) });
  const item = identifyEquipment(pending, template, library, { random: equipmentRandom(77) });
  assert.equal(item.skill, 'vector_control'); assert.equal(item.uid, pending.uid); assert.equal(item.tier, 3);
});

test('光环可绑定各非武器玩家装备；武器创作与伪造旧绑定都不能授予或启用光环', () => {
  for (const slot of ['offhand', 'helmet', 'chest', 'gloves', 'boots', 'belt', 'amulet', 'ring', 'weapon']) {
    const doc = parseCollection('equipment', { id: 'aura_slot_probe', name: '测试', slot, skills: ['vector_control'], traits: [] }).doc;
    const c = { ...collections, equipment: new Map([...collections.equipment, [doc.id, { doc }]]) };
    const error = validateCollection('equipment', doc, library).error;
    if (slot === 'weapon') {
      assert.match(error, /光环.*非武器/);
      assert.deepEqual(equipmentSkillIds(doc, c), []);
      assert.ok(!availableSkills({ vector_control: true }, { weapon: doc.id }, c).some(row => row.id === 'vector_control'));
      const b = new Battle(files, { collections: c, maxMonsters: 0, spawnRate: 0 });
      assert.throws(() => b.setLoadout({ skills: [], equipment: { weapon: doc.id }, belt: ['aura:vector_control'], activeAuras: ['vector_control'] }), /光环.*非武器/);
    } else {
      assert.equal(error, '');
      assert.deepEqual(equipmentSkillIds(doc, c), ['vector_control']);
    }
  }
});

test('装备后仍需QEFG启用；卸下立即停止捕获并清除快捷栏，重复授予不叠加', () => {
  const state = createProgression(collections, library), item = rollEquipment(template, library, { uid: 'aura_ring', random: equipmentRandom(15) });
  state.instances[item.uid] = item; state.loadout.equipment.ring = item.uid;
  state.loadout.belt = [null, 'aura:vector_control']; state.loadout.activeAuras = [];
  const b = new Battle(files, { collections, instances: state.instances, maxMonsters: 0, spawnRate: 0 });
  b.setLoadout(progressionLoadout(state, collections));
  assert.equal(b.combat.t('projectile_capture').length, 0);
  state.loadout.activeAuras = ['vector_control'];
  b.setLoadout(progressionLoadout(state, collections));
  assert.equal(b.combat.t('projectile_capture').length, 1);
  const without = { ...b.loadout, equipment: { weapon: state.loadout.equipment.weapon } };
  b.setLoadout(without); assert.equal(b.combat.t('projectile_capture').length, 0, '残留快捷栏不能绕过装备');
  delete state.loadout.equipment.ring;
  cleanPlayerInventory(state, collections, library);
  assert.deepEqual(state.loadout.belt, []); assert.deepEqual(state.loadout.activeAuras, []);
  assert.deepEqual(state.owned.skill, {});
});

test('戒指单条与整件洗炼保持技能绑定、T阶和部位池；QEFG可用性不依赖随机词条', () => {
  const state = createProgression(collections, library), item = rollEquipment(template, library,
    { uid: 'aura_ring', rarity: 'rare', tier: 6, random: equipmentRandom(33) });
  state.instances[item.uid] = item; state.loadout.equipment.ring = item.uid; state.owned.item.chaos_orb = 1;
  const result = craftEquipment(state, item.uid, { currencyId: 'chaos_orb', index: 0, random: equipmentRandom(91) }, collections, library, tags);
  assert.ok(!result.error, result.error);
  const after = state.instances[item.uid];
  assert.equal(after.skill, 'vector_control'); assert.equal(after.tier, 6);
  assert.equal(after.affixes.length, item.affixes.length);
  assert.equal(aura(state).length, 1);
  assert.ok(after.affixes.every(a => checked.affixCategories.categoryOf(a.id, 'affix').category === 'special'));
  state.owned.item.quad_affix_orb = 1;
  const whole = craftEquipment(state, item.uid, { currencyId: 'quad_affix_orb', random: equipmentRandom(92) }, collections, library, tags);
  assert.ok(!whole.error, whole.error); assert.equal(state.instances[item.uid].affixes.length, 4);
  assert.equal(state.instances[item.uid].skill, 'vector_control'); assert.equal(state.instances[item.uid].tier, 6);
  assert.equal(aura(state).length, 1);
});

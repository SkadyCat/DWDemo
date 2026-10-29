import test from 'node:test';
import assert from 'node:assert/strict';
import { readRuleFiles } from '../scripts/rule-files.mjs';
import { checkRuleSet, rollEquipment, equipmentRandom, equipmentBasePool, equipmentDocument,
  rerollEquipment, addEquipmentAffixes, ensureEquipmentBases, parseCollection, serializeCollection,
  validateCollection, validateTraitValueEntry, createProgression, progressionLoadout } from '../engine/index.mjs';
import { Battle } from '../public/sim/battle.mjs';

const files = readRuleFiles(), check = checkRuleSet(files);
assert.ok(check.ok, check.error);
const { library, collections } = check;
const typed = [...collections.equipment.values()].map(e => e.doc).filter(d => d.bases?.length);
const expectedWeapons = { frost_lance:'flat_frost', flame_burst:'flat_fire', earth_wave:'flat_physical',
  player_slash:'flat_physical', whirlwind:'flat_physical', royal_treasury:'flat_physical', sentinel:'flat_frost', spirit_servant:'flat_physical', poison_flask:'flat_poison', iron_guard:'flat_physical', ember_hound:'flat_fire', fire_turret:'flat_fire', storm_totem:'flat_lightning', lightning_nova:'flat_lightning' };

test('基底词缀：普通底材固定点伤与防御类型，传奇底材保留完整固定机制，可保存编辑', () => {
  assert.equal(typed.length, 69);
  for (const doc of typed) {
    if (doc.rarity === 'legendary') assert.equal(new Set(doc.bases.map(b => b.id)).size, doc.bases.length);
    else {
      assert.equal(doc.bases.length, 1);
      assert.equal(doc.slot === 'weapon' ? expectedWeapons[doc.skills[0]] === doc.bases[0].id
        : ['armour','evasion','shield_base'].includes(doc.bases[0].id), true, doc.id);
    }
    const parsed = parseCollection('equipment', serializeCollection('equipment', doc));
    assert.equal(parsed.error, ''); assert.deepEqual(parsed.doc.bases, doc.bases);
    assert.equal(validateCollection('equipment', parsed.doc, library).error, '');
  }
  const legendary = collections.equipment.get('myriad_swords_t1_boots').doc;
  for (const id of ['create_ice_lance', 'block_buff_damage']) {
    const invalid = { ...legendary, bases:[{id, params:{}, with:[]}] };
    assert.notEqual(validateCollection('equipment', invalid, library).error, '', id);
  }
});

test('基底词缀：普通底材两条，传奇底材按配置生成，品质词条数量不受影响，T1–T10 数值有效', () => {
  for (const doc of typed) for (const rarity of ['common','magic','rare','legendary']) for (const tier of [1,5,10]) {
    const item = rollEquipment(doc, library, { rarity, tier, uid:'bases_test', random:equipmentRandom(42) });
    assert.equal(item.bases.length, doc.rarity === 'legendary' ? doc.bases.length : 2); assert.equal(item.bases[0].traits[0].id, doc.bases[0].id);
    assert.equal(new Set(item.bases.map(b => b.id)).size, item.bases.length);
    assert.ok(item.bases.every(b => b.tier === undefined || (b.tier >= 1 && b.tier <= tier)));
    for (const base of item.bases) for (const entry of base.traits) assert.equal(validateTraitValueEntry(library, entry), '');
    const count = item.affixes.length + (item.legendary ? 1 : 0);
    assert.ok(rarity === 'common' ? count === 0 : rarity === 'magic' ? count >= 1 && count <= 2 : rarity === 'rare' ? count >= 3 && count <= 6 : count === 6);
  }
});

test('基础属性：防具随机项来自防御数值池，类型不随重新生成改变', () => {
  const pool = new Set(equipmentBasePool(library, true).map(a => a.id));
  assert.ok(pool.has('armour') && pool.has('evasion') && pool.has('shield_base'));
  for (const id of ['flat_fire','splash','multiple_projectiles','evasion_crit','block_counter','block_reflect_fire']) assert.ok(!pool.has(id), id);
  const seen = new Set(), doc = collections.equipment.get('warden_boots').doc;
  for (let seed = 1; seed <= 100; ++seed) {
    const item = rollEquipment(doc, library, { rarity:'common', random:equipmentRandom(seed) });
    assert.equal(item.bases[0].id, 'evasion'); assert.ok(pool.has(item.bases[1].id)); seen.add(item.bases[1].id);
  }
  assert.ok(seen.size > 10);
});

test('基础属性：单洗、全洗、追加四条只改变品质词条，基础属性保留', () => {
  const doc = collections.equipment.get('frostthorn_staff').doc;
  const item = rollEquipment(doc, library, { rarity:'legendary', tier:7, random:equipmentRandom(92) });
  for (const next of [rerollEquipment(item, library, {index:0, random:equipmentRandom(5)}),
    rerollEquipment(item, library, {random:equipmentRandom(6)}), addEquipmentAffixes(item, library, {count:4, random:equipmentRandom(7)})]) {
    assert.deepEqual(next.bases, item.bases); assert.deepEqual(next.legendary, item.legendary);
  }
});

test('基础属性：旧实例只补齐一次并可 JSON 往返，原词条与传奇不被重洗', () => {
  const doc = collections.equipment.get('emberheart_staff').doc;
  const old = rollEquipment(doc, library, { rarity:'legendary', tier:5, uid:'existing_bases', random:equipmentRandom(9) });
  delete old.bases; const before = structuredClone(old);
  ensureEquipmentBases(old, doc, library); assert.equal(old.bases.length, 2);
  const fresh = structuredClone(before); ensureEquipmentBases(fresh, doc, library);
  assert.deepEqual(fresh.bases, old.bases); assert.deepEqual(old.affixes, before.affixes); assert.deepEqual(old.legendary, before.legendary);
  const restored = JSON.parse(JSON.stringify(old)); ensureEquipmentBases(restored, doc, library); assert.deepEqual(restored, old);
});

test('基础属性：真实战斗与角色面板读取点伤、护甲、闪避、护盾，卸下后失效', () => {
  for (const [id, stat] of [['frostthorn_staff','damage.flat.frost'], ['venomglass_flask','damage.flat.poison'],
    ['bloodthirst_gauntlets','defense.armour'], ['warden_boots','defense.evasion'], ['cinder_guard_chest','shield.base']]) {
    const save = createProgression(collections, library), doc = collections.equipment.get(id).doc;
    const item = rollEquipment(doc, library, { rarity:'common', tier:1, uid:'actual_bases', random:equipmentRandom(11) });
    save.instances[item.uid] = item; save.loadout.equipment[item.slot] = item.uid;
    if (item.skill) save.loadout.skills = [item.skill];
    const battle = new Battle(files, {collections,maxMonsters:0,spawnRate:0});
    battle.setLoadout(progressionLoadout(save, collections));
    const value = () => stat === 'defense.evasion' ? battle.character.evasionValue()
      : stat === 'shield.base' ? battle.character.maxShield : battle.character.stat(stat);
    assert.ok(value() >= item.bases[0].traits[0].params.n, id);
    const source = equipmentDocument(item, collections); assert.equal(source.traits.length, 2);
    delete save.loadout.equipment[item.slot]; battle.setLoadout(progressionLoadout(save, collections));
    assert.equal(value(), 0, id);
  }
});

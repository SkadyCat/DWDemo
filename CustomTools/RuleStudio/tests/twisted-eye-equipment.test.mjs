import test from 'node:test';
import assert from 'node:assert/strict';
import { readRuleFiles } from '../scripts/rule-files.mjs';
import { checkRuleSet, equipmentRandom, equipmentDocument, createProgression, listings, traitTierProfile, ensureEquipmentInherentTraits } from '../engine/index.mjs';
import { rollEquipment, rollEquipmentDrop, identifyEquipment } from '../public/equipment-generation.mjs';
import { craftEquipment } from '../public/equipment-crafting.mjs';
import { affixName } from '../public/affix-text.mjs';
import { Battle } from '../public/sim/battle.mjs';

const files = readRuleFiles(), checked = checkRuleSet(files);
assert.ok(checked.ok, checked.error);
const { library, collections, tags } = checked, template = collections.equipment.get('twisted_eye_amulet').doc;
const eyesTrigger = item => item.legendary.traits.find(t => t.id === 'legendary_twisted_eye');

test('扭曲之瞳在装备商店与传奇掉落中，固定聚合现有施法触发和完整扭曲之眼技能', () => {
  assert.equal(template.slot, 'amulet'); assert.equal(template.rarity, 'legendary');
  assert.ok(listings(collections, checked.catalog).some(row => row.kind === 'equipment' && row.id === template.id));
  for (let tier = 1; tier <= 10; tier++) {
    const item = rollEquipment(template, library, { tier, random: equipmentRandom(71 + tier) });
    assert.equal(item.affixes.length, 5);
    assert.ok(item.affixes.every(a => checked.affixCategories.categoryOf(a.id, 'affix').category === 'special'));
    const trigger = eyesTrigger(item), chanceTier = traitTierProfile(library, 'legendary_twisted_eye').params.chance.tiers[trigger.tier - 1];
    assert.ok(trigger.params.chance >= chanceTier[0] && trigger.params.chance <= chanceTier[1]);
    assert.ok(trigger.params.chance >= 60);
    if (tier === 1) assert.ok(trigger.params.chance <= 64);
    assert.deepEqual(trigger.with.map(t => t.id), ['summon_twisted_eyes']);
    assert.equal(trigger.with[0].params.count, 1); assert.equal(trigger.with[0].params.duration, 5);
    assert.match(affixName(item.legendary, library), /\d+%概率触发召唤扭曲之眼/);
    assert.equal(equipmentDocument(item, collections).traits.filter(t => t.id === 'legendary_twisted_eye' && t.with.some(c => c.id === 'summon_twisted_eyes')).length, 1);
  }
  const pending = rollEquipmentDrop({ equipment: new Map([[template.id, { doc: template }]]) }, library,
    { chance: 1, rarity: 'legendary', tier: 3, identified: false, random: equipmentRandom(51) });
  assert.equal(pending.baseId, template.id);
  const found = identifyEquipment(pending, template, library, { random: equipmentRandom(51) });
  assert.equal(found.uid, pending.uid); assert.equal(found.slot, 'amulet');
  assert.equal(eyesTrigger(found).with[0].params.count, 1);
});

test('已持有的旧扭曲之瞳同步提高概率并改为每次1只，保留随机词缀且重复同步不变', () => {
  const item = rollEquipment(template, library, { uid: 'old_eyes', random: equipmentRandom(52) });
  const old = eyesTrigger(item);
  old.id = 'trig_cast'; old.params.chance = 15; old.with[0].params.count = 10;
  item.reforgeTargets = [2];
  const random = structuredClone({ affixes: item.affixes, bases: item.bases, reforgeTargets: item.reforgeTargets });
  const b = new Battle(files, { collections, instances: { [item.uid]: item }, maxMonsters: 0, spawnRate: 0, god: true });
  b.setLoadout({ skills: ['frost_lance'], equipment: { amulet: item.uid } });
  const trigger = eyesTrigger(item);
  assert.ok(trigger.params.chance >= 60 && trigger.params.chance <= 64);
  assert.equal(trigger.with[0].params.count, 1);
  assert.deepEqual({ affixes: item.affixes, bases: item.bases, reforgeTargets: item.reforgeTargets }, random);
  const live = b.character.triggersNamed('trig_cast').find(t => t.stitched.some(s => s.id === 'summon_twisted_eyes'));
  assert.equal(live.params.chance, trigger.params.chance);
  assert.equal(live.stitched.find(s => s.id === 'summon_twisted_eyes').params.get('count'), 1);
  const once = structuredClone(item);
  ensureEquipmentInherentTraits(item, template, library); assert.deepEqual(item, once);
});

test('单条和整件洗炼保留扭曲之眼传奇触发，随机词缀受项链部位约束', () => {
  const state = createProgression(collections, library), item = rollEquipment(template, library,
    { uid: 'eyes_amulet', tier: 4, random: equipmentRandom(81) });
  state.instances[item.uid] = item; state.loadout.equipment.amulet = item.uid;
  const fixed = structuredClone(item.legendary);
  for (const args of [{ currencyId: 'chaos_orb', index: 0 }, { currencyId: 'quad_affix_orb' }]) {
    state.owned.item[args.currencyId] = 1;
    const result = craftEquipment(state, item.uid, { ...args, random: equipmentRandom(89) }, collections, library, tags);
    assert.ok(!result.error, result.error);
    assert.deepEqual(state.instances[item.uid].legendary, fixed);
    assert.ok(state.instances[item.uid].affixes.every(a => checked.affixCategories.categoryOf(a.id, 'affix').category === 'special'));
  }
});

test('真实T1项链与逆矢指环同时装备，施法触发敌对眼球攻击并被光环捕获；不装备不触发', () => {
  const item = rollEquipment(template, library, { uid: 'eyes_amulet', random: equipmentRandom(52) });
  const b = new Battle(files, { collections, instances: { [item.uid]: item }, maxMonsters: 0, spawnRate: 0, god: true, seed: 47 });
  b.setLoadout({ skills: ['frost_lance'], equipment: { amulet: item.uid, ring: 'vector_control_ring' },
    belt: ['aura:vector_control'], activeAuras: ['vector_control'] });
  assert.equal(b.skills[0].error, '');
  const counts = [], spawn = b.combat.hostileSpawns.spawn.bind(b.combat.hostileSpawns);
  b.combat.hostileSpawns.spawn = request => { counts.push(request.count); return spawn(request); };
  b.hero.casting = true;
  for (let i = 0; i < 1200 && b.monsters.length === 0; i++) b.step(1 / 60);
  b.hero.casting = false;
  assert.equal(b.monsters.length, 1);
  assert.ok(b.monsters.every(m => m.type.id === 'twisted_eye' && m.invulnerable));
  for (let i = 0; i < 240; i++) b.step(1 / 60);
  assert.ok(b.monsterCasts > 0);
  // The actual vector aura has 20% capture chance; exercise further real casts.
  b.hero.casting = true;
  for (let i = 0; i < 600 && b.combat.captures.captured === 0; i++) b.step(1 / 60);
  b.hero.casting = false;
  assert.ok(b.combat.captures.captured > 0);
  assert.ok(counts.length > 0 && counts.every(count => count === 1));
  for (let i = 0; i < 370; i++) b.step(1 / 60);
  assert.equal(b.monsters.length, 0); assert.equal(b.kills, 0);
  const without = new Battle(files, { collections, maxMonsters: 0, spawnRate: 0, god: true, seed: 47 });
  without.setLoadout({ skills: ['frost_lance'], equipment: { ring: 'vector_control_ring' },
    belt: ['aura:vector_control'], activeAuras: ['vector_control'] });
  without.hero.casting = true;
  for (let i = 0; i < 300; i++) without.step(1 / 60);
  assert.equal(without.monsters.length, 0);
});

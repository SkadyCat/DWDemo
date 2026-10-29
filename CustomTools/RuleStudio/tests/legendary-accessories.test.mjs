import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readBaselineRuleFiles } from './rule-fixture.mjs';
import { checkRuleSet, listings, createProgression, equipmentRandom,
  rollEquipment, rollEquipmentDrop, rerollEquipment, rerollWithCurrency, addEquipmentAffixes } from '../engine/index.mjs';
import { FloorRewards } from '../engine/floor-rewards.mjs';
import { cleanPlayerInventory } from '../public/player-storage.mjs';
import { applyBuildPreset } from '../public/build-presets.mjs';
import { EMBERS_ECHO_LEGENDARIES } from '../scripts/create-embers-echo-bds.mjs';
import { SUMMON_MYRIAD_PARTS } from '../scripts/create-summon-myriad-bd.mjs';

const files = readBaselineRuleFiles(), check = checkRuleSet(files);
assert.ok(check.ok, check.error);
const { collections, library, catalog, tags } = check;
const designs = [
  ['myriad_swords_t1_weapon', 'multiple_projectiles'], ['myriad_swords_t1_helmet', 'proj_layout_converge'],
  ['myriad_swords_t1_chest', 'proj_origins'], ['myriad_swords_t1_gloves', 'proj_origins'],
  ['myriad_swords_t1_boots', 'proj_origins'],
];
for (let grade = 1; grade <= 5; grade++) for (const [slot, trait] of Object.entries(EMBERS_ECHO_LEGENDARIES))
  designs.push([`embers_echo_${grade}_${slot}`, trait]);
for (const id of ['iron_guard_command_crown', 'ember_hound_pact_chest', 'fire_turret_clockwork_gloves', 'storm_totem_march_boots'])
  designs.push([id, 'trig_hit']);
for (const part of SUMMON_MYRIAD_PARTS) designs.push([`summon_myriad_${part.slot}`, part.legendary]);
designs.push(['rime_thunder_annihilation_ring', 'legendary_consumed_nova']);
const templates = designs.map(([id]) => collections.equipment.get(id)?.doc);
const retired = ['aegis_of_recharge', 'glacier_heart', 'multishot_ring', 'piercing_ring', 'ricochet_ring', 'returning_amulet', 'stormherald_ring'];

test('传奇装备: 万剑、余烬回响五档和四种命中召唤均可获取，已退役传奇保持移除', () => {
  const shop = listings(collections, catalog);
  assert.deepEqual([...collections.equipment.values()].map(row => row.doc).filter(doc => doc.rarity === 'legendary').map(doc => doc.id).sort(), designs.map(([id]) => id).sort());
  for (const id of retired) {
    assert.equal(collections.equipment.has(id), false);
    assert.equal(shop.some(row => row.id === id && row.kind === 'equipment'), false);
    assert.equal(catalog.prices[`equipment:${id}`], undefined);
  }
  for (const [i, [id, trait]] of designs.entries()) {
    const doc = templates[i]; assert.ok(doc, id);
    assert.equal(doc.rarity, 'legendary'); assert.match(doc.name, /^(万剑|余烬回响|召唤|霜雷)·/);
    assert.equal(doc.legendary.id, trait);
    assert.equal(doc.traits[0].id, trait);
    assert.ok(shop.some(row => row.id === id && row.rarity === 'legendary'));
  }
});

test('传奇装备: one fixed line plus five random lines; single, all, omen rerolls and additions preserve its exact roll', () => {
  const random = equipmentRandom(429);
  for (const template of templates) for (const tier of [1, 5, 10]) {
    const item = rollEquipment(template, library, { tier, random }), original = structuredClone(item);
    assert.equal(item.affixes.length, 5); assert.deepEqual(item.legendary.traits.map(t => t.id), template.traits.map(t => t.id));
    const shape = entry => JSON.stringify([entry.id, (entry.with || []).map(shape)]);
    assert.ok(item.affixes.every(a => a.traits.every(t => shape(t) !== shape(template.legendary))));
    for (const next of [rerollEquipment(item, library, { random, index: 0 }), rerollEquipment(item, library, { random }),
      rerollWithCurrency(item, library, tags, { random }), addEquipmentAffixes(item, library, { random, count: 4 })]) {
      assert.deepEqual(next.legendary, original.legendary); assert.equal(next.uid, item.uid); assert.equal(next.tier, tier);
    }
    assert.deepEqual(item, original);
    assert.throws(() => rerollEquipment(item, library, { index: -1 }), /随机词条/);
  }
});

test('传奇装备: designated legendary designs never drop as ordinary, magic or rare substitutes', () => {
  for (const template of templates) {
    const pool = { equipment: new Map([[template.id, { doc: template }]]) };
    for (const rarity of ['common', 'magic', 'rare']) assert.equal(rollEquipmentDrop(pool, library, { chance: 1, rarity }), null);
    const item = rollEquipmentDrop(pool, library, { chance: 1, rarity: 'legendary', tier: 10, maxTier: 3, random: equipmentRandom(12) });
    assert.equal(item.identified, true);
    assert.equal(item.baseId, template.id); assert.equal(item.rarity, 'legendary'); assert.equal(item.tier, 3);
    assert.equal(item.legendary.traits[0].id, template.legendary.id); assert.equal(item.affixes.length, 5);
  }
});

test('传奇装备: merchant preserves rarity, map tier cap and the exact fixed line through purchase', () => {
  const pool = { ...collections, equipment: new Map(templates.map(doc => [doc.id, { doc }])) };
  const rewards = new FloorRewards(pool, library, catalog, { merchantChance: 1, maxTier: 3 });
  const stock = rewards.complete().stock.filter(o => o.kind === 'equipment'); assert.equal(stock.length, 2);
  const state = createProgression(collections, library); state.stones = 10000;
  for (const offer of stock) {
    assert.equal(offer.rarity, 'legendary'); assert.ok(offer.tier <= 3); assert.equal(offer.item.affixes.length, 5);
    const shown = structuredClone(offer.item), before = state.stones;
    assert.ok(rewards.buy(offer.key, state).offer); assert.equal(state.stones, before - offer.price);
    assert.deepEqual(state.instances[shown.uid], shown);
    assert.ok(rewards.buy(offer.key, state).error); assert.equal(state.stones, before - offer.price);
  }
});

test('传奇移除: saved retired templates and instances are removed without clearing current gear, currency or progress', () => {
  const state = createProgression(collections, library);
  state.stones = 587; state.owned.item.chaos_orb = 7; state.stats.kills = 42;
  const item = rollEquipment(templates[0], library, { uid: 'current_legendary', random: equipmentRandom(12) });
  state.instances[item.uid] = item;
  for (const id of retired) {
    state.owned.equipment[id] = 2;
    state.instances[`old_${id}`] = { ...structuredClone(item), uid: `old_${id}`, baseId: id };
  }
  state.owned.equipment.cinder_guard_boots = 1;
  state.loadout.equipment = { weapon: item.uid, chest: 'old_aegis_of_recharge', ring: 'multishot_ring', boots: 'cinder_guard_boots' };
  const before = structuredClone(state);
  cleanPlayerInventory(state, collections);
  assert.deepEqual(Object.keys(state.instances).sort(), ['current_legendary', 'starter_weapon']);
  assert.deepEqual(state.instances.current_legendary, before.instances.current_legendary);
  assert.deepEqual(state.instances.starter_weapon, before.instances.starter_weapon);
  assert.deepEqual(state.owned.equipment, { cinder_guard_boots: 1 });
  assert.deepEqual(state.loadout.equipment, { weapon: item.uid, boots: 'cinder_guard_boots' });
  for (const field of ['stones', 'stats', 'progression']) assert.deepEqual(state[field], before[field]);
  assert.deepEqual(state.owned.item, before.owned.item); assert.deepEqual(state.loadout.skills, before.loadout.skills);
  const cleaned = structuredClone(state), loadout = state.loadout;
  cleanPlayerInventory(state, collections); assert.deepEqual(state, cleaned); assert.equal(state.loadout, loadout);
});

test('传奇移除: all published BDs still apply using current equipment templates', () => {
  const root = new URL('../../../Content/Rules/Presets/', import.meta.url);
  const index = JSON.parse(fs.readFileSync(new URL('index.json', root), 'utf8'));
  for (const row of index) {
    const preset = JSON.parse(fs.readFileSync(new URL(`${row.id}.json`, root), 'utf8'));
    assert.equal(applyBuildPreset(createProgression(collections, library), preset, collections, library).error, '', row.id);
    for (const item of Object.values(preset.instances || {})) assert.ok(!retired.includes(item.baseId), row.id);
  }
});

test('规则移除: 清掉已不存在的随机及挂载词条，保留有效装备、数值、洗炼目标与资源', () => {
  const state=createProgression(collections,library);
  const item=rollEquipment(templates[0],library,{uid:'kept_after_rule_removal',random:equipmentRandom(12)});
  item.affixes[0]={id:'removed_rule',traits:[{id:'removed_rule',with:[]}]};
  item.affixes[1]={id:'removed_payload',traits:[{id:'trig_mana_restored',with:[{id:'removed_rule',with:[]}]}]};
  item.reforgeTargets=[2,3,4];state.instances[item.uid]=item;state.loadout.equipment.weapon=item.uid;
  state.stones=587;state.owned.item.chaos_orb=7;
  const before=structuredClone(state),expected=structuredClone(item);expected.affixes=expected.affixes.slice(2);expected.reforgeTargets=[0,1,2];
  cleanPlayerInventory(state,collections,library);
  assert.deepEqual(state.instances[item.uid],expected);
  for(const key of ['stones','owned','stats','loadout'])assert.deepEqual(state[key],before[key]);
  const cleaned=structuredClone(state);cleanPlayerInventory(state,collections,library);assert.deepEqual(state,cleaned);
  const invalid=structuredClone(before);invalid.instances[item.uid].reforgeTargets=[0,2,4];
  cleanPlayerInventory(invalid,collections,library);assert.equal(invalid.instances[item.uid].reforgeTargets,undefined);
});

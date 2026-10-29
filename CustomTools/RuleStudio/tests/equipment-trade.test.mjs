import test from 'node:test';
import assert from 'node:assert/strict';
import { readBaselineRuleFiles } from './rule-fixture.mjs';
import { checkRuleSet, createProgression, rollEquipment, equipmentRandom, equipmentSaleQuote, sellEquipment } from '../engine/index.mjs';
import { FloorRewards } from '../engine/floor-rewards.mjs';

const check = checkRuleSet(readBaselineRuleFiles());
assert.ok(check.ok, check.error);
const { collections, library, catalog } = check;
const fresh = () => createProgression(collections, library);
const add = (state, uid = 'spare', baseId = 'frostthorn_staff') => {
  const item = rollEquipment(collections.equipment.get(baseId).doc, library, { uid, rarity: 'common', tier: 3, random: equipmentRandom(7) });
  state.instances[uid] = item;
  return item;
};

test('装备出售: one instance becomes stones exactly once without changing other inventory or equipped stats', () => {
  const state = fresh(); add(state);
  const starter = structuredClone(state.instances.starter_weapon), loadout = structuredClone(state.loadout);
  const quote = equipmentSaleQuote(state, 'spare', collections, catalog);
  const before = structuredClone(state); assert.ok(quote.price > 0); assert.deepEqual(state, before, 'quoting is read-only');
  const result = sellEquipment(state, 'spare', collections, catalog);
  assert.equal(result.error, ''); assert.equal(result.price, quote.price);
  assert.equal(state.stones, quote.price); assert.equal(state.stats.earned, quote.price);
  assert.ok(!state.instances.spare); assert.deepEqual(state.instances.starter_weapon, starter);
  assert.deepEqual(state.loadout, loadout);
  const after = structuredClone(state);
  assert.ok(sellEquipment(state, 'spare', collections, catalog).error); assert.deepEqual(state, after);
});

test('装备出售: an equipped weapon removes only its granted skill; owned skills retain stable positions', () => {
  const state = fresh();
  state.owned.skill.player_slash = true;
  state.loadout.skills = ['frost_lance', null, 'player_slash', null];
  assert.equal(sellEquipment(state, 'starter_weapon', collections, catalog).error, '');
  assert.equal(state.loadout.equipment.weapon, undefined);
  assert.deepEqual(state.loadout.skills, [null, null, 'player_slash', null]);
  const second = fresh(); second.owned.skill.frost_lance = true;
  sellEquipment(second, 'starter_weapon', collections, catalog);
  assert.deepEqual(second.loadout.skills, ['frost_lance', null, null, null]);
});

test('装备出售: stacked templates sell one copy; the last copy clears equipment and granted skill', () => {
  const state = fresh(); delete state.instances.starter_weapon;
  state.owned.equipment.frostthorn_staff = 2;
  state.loadout.equipment.weapon = 'frostthorn_staff';
  assert.equal(sellEquipment(state, 'frostthorn_staff', collections, catalog).error, '');
  assert.equal(state.owned.equipment.frostthorn_staff, 1); assert.equal(state.loadout.equipment.weapon, 'frostthorn_staff');
  assert.equal(state.loadout.skills[0], 'frost_lance');
  sellEquipment(state, 'frostthorn_staff', collections, catalog);
  assert.ok(!state.owned.equipment.frostthorn_staff); assert.ok(!state.loadout.equipment.weapon);
  assert.deepEqual(state.loadout.skills, [null, null, null, null]);
});

test('装备出售: invalid targets, fixed equipment and overflowing wallets fail without mutation', () => {
  const state = fresh();
  state.owned.equipment.player_character_equipment = 1;
  for (const id of ['missing', 'chaos_orb', 'player_character_equipment']) {
    const before = structuredClone(state);
    assert.ok(sellEquipment(state, id, collections, catalog).error); assert.deepEqual(state, before);
  }
  state.stones = Number.MAX_SAFE_INTEGER;
  const before = structuredClone(state);
  assert.match(sellEquipment(state, 'starter_weapon', collections, catalog).error, /上限/); assert.deepEqual(state, before);
});

test('装备出售: quoted prices respect custom/free shop pricing and stay below T1 merchant purchase prices', () => {
  const state = fresh();
  for (const price of [0, 1, 3, 4, 100]) {
    const quote = equipmentSaleQuote(state, 'starter_weapon', collections, { prices: { 'equipment:frostthorn_staff': price } });
    assert.equal(quote.error, ''); assert.ok(quote.price <= Math.floor(price / 4));
  }
  const rewards = new FloorRewards(collections, library, catalog, { merchantChance: 1, maxTier: 1 });
  for (const offer of rewards.complete().stock.filter(offer => offer.kind === 'equipment')) {
    state.instances[offer.item.uid] = offer.item;
    const quote = equipmentSaleQuote(state, offer.item.uid, collections, catalog);
    assert.equal(quote.error, ''); assert.ok(quote.price < offer.price);
  }
});

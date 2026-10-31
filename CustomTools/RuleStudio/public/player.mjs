// Player save (browser localStorage): wallet in 灵石, owned skills/equipment/consumables, loadout.
// Shared by the shop (Vue) and the 3D battle page. Content lives in Content/Rules; this is play state only.
import { reactive, watch } from '/vendor/vue.esm-browser.prod.js';
import { SLOTS, SKILL_SLOTS, skillSlots, availableSkills, validSkillSlots, changeSkillSlot, createProgression, recordBattleKill, ensureEquipmentInherentTraits } from '/engine/index.mjs';
import { craftEquipment } from '/equipment-crafting.mjs';
import { rollEquipment, rollEquipmentDrop, identifyEquipment, awardBattleKill } from '/equipment-generation.mjs';
import { PLAYER_SAVE_KEY as KEY, readPlayerSave, cleanPlayerInventory } from '/player-storage.mjs';
import { sellEquipment } from '/engine/equipment-trade.mjs';
import { reducePlacedStack } from '/inventory-layout.mjs';
import { currentTalentParts } from '/talents/state.mjs';
import { equipmentSkillIds } from '/engine/loadout.mjs';
import { freshQuests, ensureQuests } from '/quests/model.mjs';
import { freshHideout } from '/hideout/model.mjs';
import { auraBinding, auraId, buildSkillType, cleanBelt, cleanActiveAuras } from '/engine/skill-types.mjs';
import { inventoryCounts, updateInventoryNotices } from '/inventory-notices.mjs';
import {eventLocked} from '/map-events-model.mjs';
import { emitGameEvent } from '/progression/events.mjs';
import { ensureJourney, freshJourney } from '/progression/journey.mjs';
import { ensureChain } from '/progression/quest-chain.mjs';
import { ensureTutorial, freshTutorial } from '/progression/tutorial.mjs';

export const BELT_SLOTS = 4;

const fresh = () => ({
  stones: 0, owned: { skill: {}, equipment: {}, item: {} }, instances: {},
  bagLayout: null, hideout: freshHideout(), newInventory: {},
  loadout: { skills: skillSlots(), equipment: {}, belt: [], activeAuras: [] },
  stats: { kills: 0, earned: 0, spent: 0, battles: 0 }, initialized: false, progression: null, talents: null, quests: freshQuests(),
  journey: freshJourney(), questChain: null, tutorial: freshTutorial(),
});

export const player = reactive(fresh());

function load() {
  try {
    const saved = readPlayerSave(localStorage);
    if (saved && typeof saved === 'object') Object.assign(player, fresh(), saved, { owned: { ...fresh().owned, ...saved.owned }, loadout: { ...fresh().loadout, ...saved.loadout }, instances: saved.instances || {} });
  } catch { /* corrupt save: start over */ }
}
load();
updateInventoryNotices(player, inventoryCounts(player));
// Batched with each ownership transaction; equipment edits and HUD frames are not watched.
watch(() => inventoryCounts(player), (current, previous) => updateInventoryNotices(player, current, previous));
let saving = false;
watch(player, () => {
  if (saving) return;
  saving = true;
  queueMicrotask(() => { saving = false; localStorage.setItem(KEY, JSON.stringify(player)); });
}, { deep: true });

const count = (kind, id) => (kind === 'skill' ? (player.owned.skill[id] ? 1 : 0) : player.owned[kind][id] || 0);
export const owns = (kind, id) => count(kind, id) > 0;
export const ownedCount = count;

function give(kind, id, n = 1) {
  if (kind === 'skill') player.owned.skill[id] = true;
  else player.owned[kind][id] = (player.owned[kind][id] || 0) + n;
}

/** First run (or reset): the starter weapon binds and equips Ice Lance in the first skill slot. */
export function ensureStarted(catalog, collections, library) {
  if (!player.initialized) resetPlayer(catalog, collections, library);
  ensureQuests(player);
  ensureJourney(player); ensureChain(player); ensureTutorial(player);
  cleanPlayerInventory(player, collections, library);
  if (library) for (const item of Object.values(player.instances)) ensureEquipmentInherentTraits(item, collections.equipment.get(item.baseId)?.doc, library);
  const skills = validSkillSlots(player.loadout.skills, skillChoices(collections).filter(s => buildSkillType(library, s.id) === 'active'));
  if (JSON.stringify(skills) !== JSON.stringify(player.loadout.skills)) player.loadout.skills = skills;
}

export function resetPlayer(catalog, collections, library) {
  const weaponId = catalog.starter.map(key => key.split(':')).find(([kind, id]) => kind === 'equipment' && collections.equipment.get(id)?.doc?.slot === 'weapon')?.[1];
  Object.assign(player, fresh(), createProgression(collections, library, weaponId ? { weaponId } : {}));
  player.stones = catalog.startingStones;
  for (const key of catalog.starter) {
    const [kind, id] = key.split(':');
    if (kind === 'equipment' && id === player.progression.weaponId) continue;
    if (!collections?.[kind]?.get(id)?.doc) continue;
    give(kind, id, kind === 'item' ? 3 : 1);
    autoEquip(kind, id, collections);
  }
  player.initialized = true;
}

/** Buy one listing. Returns '' or an error message. */
export function buy(listing, stackLimit = 9999, { collections, library } = {}) {
  if (listing.kind === 'skill' && owns('skill', listing.id)) return '已拥有该技能';
  if (listing.kind === 'item' && count('item', listing.id) >= stackLimit) return `最多持有 ${stackLimit} 个`;
  if (player.stones < listing.price) return `灵石不足（还差 ${listing.price - player.stones}）`;
  let drop = null;
  if (listing.kind === 'equipment') {
    const doc = collections?.equipment?.get(listing.id)?.doc;
    if (!doc || !library) return '装备底材不存在或规则尚未加载';
    try {
      drop = rollEquipmentDrop({ equipment: new Map([[doc.id, { doc }]]) }, library,
        { chance: 1, rarity: doc.rarity, maxTier: doc.tier ?? 1, tier: doc.rarity === 'legendary' ? doc.tier ?? null : null });
    } catch (error) { return error.message; }
    if (!drop) return '装备无法生成';
  }
  player.stones -= listing.price;
  player.stats.spent += listing.price;
  if (drop) player.instances[drop.uid] = drop;
  else give(listing.kind, listing.id);
  return '';
}

export function earn(stones) {
  if (!(stones > 0)) return;
  player.stones += stones;
  player.stats.earned += stones;
}

/** Consume one consumable from the inventory. */
export function consume(id) {
  if (!(player.owned.item[id] > 0)) return false;
  player.owned.item[id] -= 1;
  if (player.owned.item[id] <= 0) {
    delete player.owned.item[id];
    player.loadout.belt = cleanBelt(player.loadout.belt.map(x => x === id ? null : x));
  }
  return true;
}

export function autoEquip(kind, id, collections) {
  const L = player.loadout;
  if (kind === 'item' && collections?.item?.get(id)?.doc?.category === 'consumable' && !L.belt.includes(id)) toggleBelt(id);
  if (kind === 'equipment') {
    const slot = collections?.equipment?.get(id)?.doc?.slot;
    if (slot && !L.equipment[slot]) L.equipment[slot] = id;
  }
}

export function skillChoices(collections) {
  const equipment = Object.fromEntries(Object.entries(player.loadout.equipment).filter(([, id]) => owns('equipment', id) || player.instances[id]));
  const choices = availableSkills(player.owned.skill, equipment, collections, player.instances);
  for (const part of currentTalentParts(player.talents).parts) for (const id of equipmentSkillIds(part.doc, collections)) {
    if (!choices.some(row => row.id === id)) choices.push({ id, name: collections.skill.get(id)?.doc.name || id, granted: true });
  }
  return choices;
}

export function setSkillSlot(slot, id, collections, library) {
  const result = changeSkillSlot(player.loadout.skills, slot, id, skillChoices(collections).filter(s => buildSkillType(library, s.id) === 'active'));
  if (!result.error) player.loadout.skills = result.skills;
  return result.error;
}

export function toggleBelt(id, slot = null) {
  const list = player.loadout.belt;
  const i = list.indexOf(id);
  if (Number.isInteger(slot) && slot >= 0 && slot < BELT_SLOTS) {
    const same = list[slot] === id;
    if (i >= 0) list[i] = null;
    list[slot] = same ? null : id;
  } else if (i >= 0) {
    list[i] = null;
  } else {
    const empty = list.findIndex(value => !value);
    if (empty >= 0) list[empty] = id;
    else if (list.length < BELT_SLOTS) list.push(id);
  }
  player.loadout.belt = cleanBelt(list);
  player.loadout.activeAuras = (player.loadout.activeAuras || []).filter(value => player.loadout.belt.includes(auraBinding(value)));
}

export function toggleAura(id, collections, library) {
  if (!player.loadout.belt.includes(auraBinding(id)) || buildSkillType(library, id) !== 'aura' || !skillChoices(collections).some(s => s.id === id)) return false;
  const active = player.loadout.activeAuras || [];
  if (!active.includes(id) && !cleanActiveAuras(library, [...active, id], collections).includes(id)) return false;
  player.loadout.activeAuras = active.includes(id) ? active.filter(value => value !== id) : [...active, id];
  return true;
}

export function equip(slot, id) {
  if(eventLocked(player,id))return '装备已被地图祭坛锁定';
  if (player.instances[id]?.identified === false) return '请先鉴定装备';
  if (player.loadout.equipment[slot] === id) delete player.loadout.equipment[slot];
  else { player.loadout.equipment[slot] = id; emitGameEvent('equip', { slot, id }); }
}

export { SLOTS, SKILL_SLOTS };

// ---------------------------------------------------------------- 洗炼 (rolled equipment instances)
/** Equipment the player can wear: owned template ids or rolled instance uids. */
export const ownsEquipment = id => owns('equipment', id) || !!player.instances[id];

export function sellOwnedEquipment(id, collections, catalog, stackKey = 'equipment:' + id) {
  if(eventLocked(player,id))return {error:'装备已被地图祭坛锁定'};
  const result = sellEquipment(player, id, collections, catalog);
  if (!result.error) emitGameEvent('sell', { id });
  if (!result.error) player.bagLayout = reducePlacedStack(player.bagLayout, stackKey);
  return result;
}

/** Turn one owned copy of an equipment template into a rolled instance (its random affixes can then be rerolled). */
export function identify(baseId, collections, library, stackKey = 'equipment:' + baseId) {
  const pending = player.instances[baseId];
  if (pending) {
    let item;
    try { item = identifyEquipment(pending, collections?.equipment?.get(pending.baseId)?.doc, library); }
    catch (error) { return { error: error.message }; }
    player.instances[baseId] = item;
    emitGameEvent('identify', { item });
    return { item };
  }
  const template = collections?.equipment?.get(baseId)?.doc;
  if (!template) return { error: '未知装备' };
  if (!owns('equipment', baseId)) return { error: '背包里没有这件装备' };
  let item;
  try { item = rollEquipment(template, library); } catch (error) { return { error: error.message }; }
  player.owned.equipment[baseId] -= 1;
  if (player.owned.equipment[baseId] <= 0) {
    delete player.owned.equipment[baseId];
    for (const [slot, id] of Object.entries(player.loadout.equipment)) if (id === baseId) player.loadout.equipment[slot] = item.uid;
  }
  player.instances[item.uid] = item;
  player.bagLayout = reducePlacedStack(player.bagLayout, stackKey);
  emitGameEvent('identify', { item });
  return { item };
}

/**
 * Spend one currency (and one omen if given) using its authored equipment crafting effect.
 * index = null targets the whole item. Both crafting UIs share this transaction.
 */
export function craft(uid, { currencyId, omenId = '', index = null }, collections, library, tags) {
  if(eventLocked(player,uid))return {error:'装备已被地图祭坛锁定'};
  const result = craftEquipment(player, uid, { currencyId, omenId, index }, collections, library, tags);
  if (result && !result.error) emitGameEvent('craft', { uid, currencyId });
  return result;
}

/** Destroy an instance (unequips it). */
export function discard(uid) {
  if(eventLocked(player,uid))return '装备已被地图祭坛锁定';
  delete player.instances[uid];
  for (const [slot, id] of Object.entries(player.loadout.equipment)) if (id === uid) delete player.loadout.equipment[slot];
}

/** Restart with a single weapon. Old saves and retired weapons are not retained. */
export function startProgression(collections, library) {
  const next = createProgression(collections, library);
  Object.assign(player, fresh(), next);
}
export const rewardKill = (stones, collections, library, random) => awardBattleKill(player, stones, collections, library, { random });
export const recordKill = stones => recordBattleKill(player, stones);

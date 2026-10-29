// Inventory transactions only; no combat runtime or browser dependencies.
import { equipmentTier } from './equipment.js';
import { PLAYER_GEAR_SLOTS } from './equipment-slots.js';
import { availableSkills, validSkillSlots } from './loadout.js';

// Conservative resale values keep T1 merchant equipment (20–50 stones) above its sale price.
const SALE_PER_TIER = { common: 1, magic: 2, rare: 4, legendary: 8, unique: 10 };

export function equipmentSaleQuote(state, id, collections, catalog) {
  const instance = state.instances?.[id];
  const item = instance || collections?.equipment?.get(id)?.doc;
  if (!item || (instance ? instance.uid !== id : !(state.owned?.equipment?.[id] > 0))) return { error: '背包里没有这件装备' };
  if (!PLAYER_GEAR_SLOTS.some(slot => slot.id === item.slot)) return { error: '固定装备不能出售' };
  const rate = SALE_PER_TIER[item.rarity];
  if (!rate) return { error: '装备品质无效' };
  let price = rate * equipmentTier(item);
  const configured = catalog?.prices?.[`equipment:${instance ? item.baseId : id}`];
  if (configured !== undefined) {
    if (!Number.isSafeInteger(configured) || configured < 0) return { error: '装备价格无效' };
    price = Math.min(price, Math.floor(configured / 4));
  }
  return { error: '', price, name: item.name || id, instance: !!instance };
}

/** Sell exactly one owned copy. Validate and derive the next loadout before mutating the save. */
export function sellEquipment(state, id, collections, catalog) {
  const quote = equipmentSaleQuote(state, id, collections, catalog);
  if (quote.error) return quote;
  const stones = state.stones + quote.price, earned = (state.stats?.earned || 0) + quote.price;
  if (!Number.isSafeInteger(stones) || !Number.isSafeInteger(earned)) return { error: '灵石数量超出上限' };
  const remaining = quote.instance ? 0 : state.owned.equipment[id] - 1;
  if (!Number.isSafeInteger(remaining) || remaining < 0) return { error: '装备数量无效' };
  const equipment = { ...state.loadout.equipment }, instances = { ...state.instances };
  if (quote.instance) delete instances[id];
  if (!remaining) for (const [slot, equipped] of Object.entries(equipment)) if (equipped === id) delete equipment[slot];
  const skills = validSkillSlots(state.loadout.skills, availableSkills(state.owned.skill, equipment, collections, instances));
  if (quote.instance) delete state.instances[id];
  else if (remaining) state.owned.equipment[id] = remaining;
  else delete state.owned.equipment[id];
  state.loadout.equipment = equipment;
  state.loadout.skills = skills;
  state.stones = stones;
  (state.stats ||= {}).earned = earned;
  return quote;
}

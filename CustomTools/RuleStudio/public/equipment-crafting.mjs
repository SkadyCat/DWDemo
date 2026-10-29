// Website crafting policy: use the same slot table as drops, intersected with the selected omen.
// The inventory transaction and rule runtime do not interpret equipment categories.
import { craftEquipment as transact } from '../engine/crafting.mjs';
import { omenFamily, rerollPool } from '../engine/tags.mjs';
import { equipmentDropAffixPool } from './equipment-generation.mjs';

export function equipmentCraftAffixPool(library, tags, slot, family = '') {
  return equipmentDropAffixPool(library, slot, rerollPool(library, tags, family));
}

export function craftEquipment(state, uid, options, collections, library, tags) {
  const family = omenFamily(tags, collections?.item?.get(options.omenId)?.doc);
  const pool = equipmentCraftAffixPool(library, tags, state.instances[uid]?.slot, family);
  return transact(state, uid, { ...options, pool }, collections, library, tags);
}

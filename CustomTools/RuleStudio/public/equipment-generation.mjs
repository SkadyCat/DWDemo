// Website acquisition layer. This table never becomes a rule, modifier, tag or combat condition.
import table from './data/equipment-drop-categories.json' with { type: 'json' };
import { equipmentAffixPool, rollEquipment as generate, rollEquipmentDrop as drop, identifyEquipment as identify } from '../engine/equipment.mjs';
import { awardBattleKill as rewardKill } from '../engine/progression.mjs';
import { buildAffixCategoryIndex, loadAffixCategoryIndex } from '../engine/affix-categories.mjs';

export const EQUIPMENT_DROP_CATEGORIES = Object.freeze(Object.fromEntries(Object.entries(table.slots).map(([slot, categories]) => [slot, Object.freeze([...categories])])));
const indexes = new WeakMap();

/** The website registers validated authoring metadata for each loaded library. */
export function registerEquipmentDropLibrary(files, library, index = null) {
  if (!index) {
    const loaded = loadAffixCategoryIndex(files, library);
    if (loaded.error) throw new Error(loaded.error);
    index = loaded.index;
  }
  indexes.set(library, { traits: library.traits, builds: library.builds, index });
}

export function equipmentDropCategoryIndex(library) {
  const cached = indexes.get(library);
  if (cached?.traits === library.traits && cached.builds === library.builds) return cached.index;
  const index = buildAffixCategoryIndex(library);
  indexes.set(library, { traits: library.traits, builds: library.builds, index });
  return index;
}

export function equipmentDropAffixPool(library, slot, pool = equipmentAffixPool(library)) {
  const allowed = EQUIPMENT_DROP_CATEGORIES[slot];
  if (!allowed) return pool;
  const categories = equipmentDropCategoryIndex(library);
  return pool.filter(affix => allowed.includes(categories.categoryOf(affix.id, 'affix')?.category));
}

/** Select an input pool before the generic generator rolls any values. */
export function rollEquipment(template, library, options = {}) {
  return generate(template, library, { ...options, pool: equipmentDropAffixPool(library, template.slot, options.pool) });
}
export const rollEquipmentDrop = (collections, library, options = {}) => drop(collections, library, { ...options, createEquipment: rollEquipment });
export const identifyEquipment = (item, template, library, options = {}) => identify(item, template, library, { ...options, createEquipment: rollEquipment });
export const awardBattleKill = (state, stones, collections, library, options = {}) => rewardKill(state, stones, collections, library, { ...options, createEquipment: rollEquipment });

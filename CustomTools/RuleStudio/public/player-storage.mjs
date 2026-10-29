// A new save, with no migration or restore path for the retired weapon catalogue.
export const PLAYER_SAVE_KEY = 'rulestudio.player.v2';
import { cleanBelt, auraId, buildSkillType, cleanActiveAuras } from '../engine/skill-types.mjs';
import { availableSkills } from '../engine/loadout.mjs';
import { normalizeEquipmentRarity } from '../engine/equipment.mjs';

/** Remove unavailable inventory entries and keep only the supported loadout fields. */
export function cleanPlayerInventory(state, collections, library = null) {
  for (const id of Object.keys(state.owned.item)) if (!collections.item.get(id)?.doc) delete state.owned.item[id];
  for (const id of Object.keys(state.owned.equipment)) if (!collections.equipment.get(id)?.doc) delete state.owned.equipment[id];
  for (const [uid, item] of Object.entries(state.instances || {})) if (!collections.equipment.get(item.baseId)?.doc) delete state.instances[uid];
  if (library) {
    const known = entry => !!library.trait(entry.id) && (entry.with || []).every(known);
    for (const item of Object.values(state.instances || {})) {
      if (!Array.isArray(item.affixes)) continue;
      const kept = item.affixes.filter(affix => affix.id !== 'interval_whirlwind' && affix.traits.every(known));
      if (kept.length !== item.affixes.length) {
        // Bound reroll indices refer to the old random-line ordering.
        const retained = new Map(item.affixes.map((affix, index) => [index, kept.indexOf(affix)]));
        if (item.reforgeTargets) {
          const targets = item.reforgeTargets.map(index => retained.get(index));
          if (targets.some(index => !Number.isInteger(index) || index < 0)) delete item.reforgeTargets;
          else item.reforgeTargets = targets;
        }
        item.affixes = kept;
      }
    }
  }
  for (const item of Object.values(state.instances || {})) normalizeEquipmentRarity(item);
  const current = state.loadout;
  const equipment = Object.fromEntries(Object.entries(current.equipment || {}).filter(([, id]) => state.instances?.[id] || collections.equipment.get(id)?.doc));
  const skills = availableSkills(state.owned.skill, equipment, collections, state.instances);
  const belt = cleanBelt(current.belt, binding => {
    const id = auraId(binding);
    return id ? !!library && buildSkillType(library, id) === 'aura' && skills.some(s => s.id === id)
      : state.owned.item[binding] > 0 && collections.item.get(binding)?.doc?.category === 'consumable';
  });
  const activeAuras = cleanActiveAuras(library, (current.activeAuras || []).filter(id => belt.includes(`aura:${id}`)), collections);
  const next = { skills: current.skills, equipment, belt, ...(activeAuras.length || current.activeAuras ? { activeAuras } : {}) };
  if (JSON.stringify(next) !== JSON.stringify(current)) state.loadout = next;
}

export function readPlayerSave(storage) {
  for (let index = storage.length - 1; index >= 0; index--) {
    const key = storage.key(index);
    if (/^rulestudio\.player\.v\d+(?:\.|$)/.test(key) && key !== PLAYER_SAVE_KEY) storage.removeItem(key);
  }
  try { return JSON.parse(storage.getItem(PLAYER_SAVE_KEY) || 'null'); }
  catch { return null; }
}

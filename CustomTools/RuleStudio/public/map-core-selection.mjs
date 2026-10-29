import { MapUnit, MAP_EQUIPMENT } from '../engine/map-unit.mjs';
import { traitText } from './affix-text.mjs';

export const MAP_CORE_SAVE_KEY = 'rulestudio.map-core.v1';

export function mapCoreChoices(collections, library) {
  if (!collections?.equipment || !library) return [];
  return [...collections.equipment.values()].filter(row => row.doc?.slot === 'map' && !row.error).map(({ doc }) => {
    const map = new MapUnit(library, collections, { equipment: { map: doc.id } });
    return { id: doc.id, name: doc.name || doc.id, tier: map.tier, slot: doc.slot,
      packs: map.character.stat('map.monster_packs'),
      affixes: map.contributions.filter(row => row.from === 'map').map(row =>
        traitText({ id: row.traitId, params: row.params }, library)) };
  }).sort((a, b) => a.tier - b.tier || a.id.localeCompare(b.id));
}

export function selectedMapCore(storage, collections) {
  let saved;
  try { saved = storage?.getItem(MAP_CORE_SAVE_KEY); } catch {}
  return collections?.equipment?.get(saved)?.doc?.slot === 'map' ? saved : MAP_EQUIPMENT;
}

export function configureMapCore(tower, id, storage) {
  if (tower?.battle?.collections?.equipment?.get(id)?.doc?.slot !== 'map') throw new Error('请选择有效的地图核心');
  tower.setMapEquipment({ ...tower.battle.map.equipment, map: id });
  try { storage?.setItem(MAP_CORE_SAVE_KEY, id); } catch {}
  return id;
}

// Pawn-owned equipment documents, aggregated through the same collection path as player gear.
import { aggregate, validateCollection } from './collections.js';
import { fixedEquipmentSlots, pawnEquipmentSlots } from './equipment-slots.js';

export const MONSTER_TOWER_EQUIPMENT = 'monster_tower_equipment';
export const PLAYER_FIXED_EQUIPMENT = Object.freeze({ tower: 'player_tower_equipment', character: 'player_character_equipment' });
export const MONSTER_RARITIES = Object.freeze([
  { id: 'common', name: '普通' }, { id: 'magic', name: '魔法' }, { id: 'rare', name: '稀有' }, { id: 'boss', name: 'Boss' },
]);
export const MONSTER_RARITY_EQUIPMENT = Object.freeze(Object.fromEntries(MONSTER_RARITIES.map(row => [row.id, `monster_rarity_${row.id}`])));
export const monsterEquipmentDefaults = () => ({ lineage: null, rarity: null, tower: MONSTER_TOWER_EQUIPMENT });
const copy = value => JSON.parse(JSON.stringify(value));

export function createPawnEquipment(equipment = {}, kind = 'player') {
  const allowed = new Set(pawnEquipmentSlots(kind).map(slot => slot.id));
  for (const slot of Object.keys(equipment)) if (!allowed.has(slot)) throw new Error(`${kind} 不支持装备槽 ${slot}`);
  return { ...Object.fromEntries(fixedEquipmentSlots(kind).map(slot => [slot.id, null])), ...copy(equipment) };
}

export function resolvePawnEquipment(collections, equipment = {}, kind = 'player') {
  return Object.fromEntries(Object.entries(createPawnEquipment(equipment, kind)).map(([slot, item]) => {
    if (!item) return [slot, null];
    const doc = typeof item === 'string' ? collections?.equipment?.get(item)?.doc : item;
    if (!doc || doc.slot !== slot) throw new Error(`装备或槽位无效：${typeof item === 'string' ? item : item.id}`);
    return [slot, copy(doc)];
  }));
}

export function pawnEquipmentSources(library, equipment, labelFor = doc => doc.name || doc.id) {
  const parts = Object.entries(equipment || {}).filter(([, doc]) => doc).map(([slot, doc]) => ({ kind: 'equipment', doc, label: labelFor(doc, slot) }));
  for (const part of parts) {
    const error = validateCollection('equipment', part.doc, library).error;
    if (error) throw new Error(error);
  }
  if (!parts.some(part => part.doc.traits.length || part.doc.bases?.length)) return { sources: [], contributions: [], sheetEntries: [] };
  const result = aggregate(library, null, parts, Infinity);
  if (!result.source) throw new Error(result.error);
  const sheetEntries = result.source.traits.map(source => {
    const row = result.contributions.find(row => row.sourceId === source.id && row.status === 'on');
    return { source, equipment: true, label: row?.from || '', slot: parts.find(part => part.label === row?.from)?.doc.slot || '' };
  });
  return { sources: result.source.traits, contributions: result.contributions, sheetEntries };
}

export function monsterTowerEquipment(collections, level, template = MONSTER_TOWER_EQUIPMENT) {
  const doc = resolvePawnEquipment(collections, { tower: template }, 'monster').tower;
  for (const trait of doc.traits) if (trait.id === 'monster_tower_level') trait.params = { ...trait.params, level };
  return doc;
}

export function monsterEquipmentRarity(item) {
  return MONSTER_RARITIES.find(row => MONSTER_RARITY_EQUIPMENT[row.id] === item?.id)?.id
    || (['common', 'magic', 'rare'].includes(item?.rarity) ? item.rarity : 'common');
}

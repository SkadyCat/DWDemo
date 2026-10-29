// Skill category is declared by its active trait; equipment/support markers cannot change it.
import { equipmentSkillIds } from './loadout.mjs';
import { auraReservationPercent, selectAuraBudget } from './aura-reservation.mjs';
export function skillType(source) {
  const active = source?.traits.find(trait => trait.id.toLowerCase() === source.activeId.toLowerCase());
  const markers = active?.sheet?.map(entry => entry.trigger) || [];
  return markers.includes('aura_skill') ? 'aura' : markers.includes('trigger_skill') ? 'trigger' : 'active';
}

export function equippedAuras(library, ids, collections) {
  return [...new Set(ids.filter(Boolean))].filter(id => skillType(library.namedBuildSource(id).source) === 'aura')
    .map(id => ({ kind: 'skill', doc: collections.skill.get(id).doc, label: library.buildDisplayName(id) }));
}

export const auraBinding = id => `aura:${id}`;
export const auraId = binding => typeof binding === 'string' && binding.startsWith('aura:') ? binding.slice(5) : null;
export const buildSkillType = (library, id) => library?.build(id) ? skillType(library.namedBuildSource(id).source) : 'active';

export function auraManaPercent(library, id, collections) {
  const doc = collections?.skill?.get(id)?.doc;
  const source = library?.namedBuildSource(id)?.source;
  const active = source?.traits.find(trait => trait.id === source.activeId);
  const overrides = doc?.traits.find(trait => trait.id === doc.active)?.params || {};
  return auraReservationPercent({ params: new Map([...(active?.params || []), ...Object.entries(overrides)]) });
}

export function cleanActiveAuras(library, ids = [], collections) {
  return selectAuraBudget(ids.filter(id => buildSkillType(library, id) === 'aura'), id => auraManaPercent(library, id, collections));
}

/** Q/E/F/G bindings are stable positions shared by auras and consumables. */
export function cleanBelt(belt = [], allowed = () => true) {
  const seen = new Set();
  const slots = Array.from(belt.slice(0, 4), binding => {
    if (!binding || seen.has(binding) || !allowed(binding)) return null;
    seen.add(binding);
    return binding;
  });
  while (slots.length && !slots.at(-1)) slots.pop();
  return slots;
}

export function enabledAuras(library, loadout, collections, equipment = []) {
  const equipped = new Set((loadout.belt || []).map(auraId).filter(Boolean));
  const granted = new Set(equipment.filter(part => part.doc.slot !== 'weapon').flatMap(part => equipmentSkillIds(part.doc, collections)));
  const active = cleanActiveAuras(library, (loadout.activeAuras || []).filter(id => equipped.has(id) && granted.has(id)), collections);
  return equippedAuras(library, active, collections);
}

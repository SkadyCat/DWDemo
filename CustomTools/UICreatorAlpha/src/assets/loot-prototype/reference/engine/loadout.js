// Four stable active-skill positions. Empty slots never shift the remaining skills.
import { equipmentDocument } from './equipment.js';
export const SKILL_SLOTS = 4;

export function skillSlots(input) {
  const seen = new Set();
  return Array.from({ length: SKILL_SLOTS }, (_, slot) => {
    const value = Array.isArray(input) ? input[slot] : null;
    const id = typeof value === 'string' && /^[a-z0-9_]+$/i.test(value.trim()) ? value.trim().toLowerCase() : null;
    if (!id || seen.has(id)) return null;
    seen.add(id);
    return id;
  });
}

/** Owned skills and skills granted by equipped items are choices, never extra hotbar slots. */
export function availableSkills(owned, equipment, collections, instances = {}) {
  const choices = new Map();
  const add = (id, granted) => {
    const doc = collections?.skill?.get(id)?.doc;
    if (doc && (granted || !collections.skill.get(id).grantedBy?.length) && !choices.has(id)) choices.set(id, { id, name: doc.name || id, granted });
  };
  for (const [id, count] of Object.entries(owned || {})) if (count) add(id, false);
  for (const id of Object.values(equipment || {})) {
    const item = instances[id];
    if (item?.identified === false) continue;
    for (const skill of equipmentSkillIds(item || id, collections)) add(skill, true);
  }
  return [...choices.values()];
}

/** Only direct, permanent equipped entries grant skills; timed/trigger payloads do not. */
export function equipmentSkillIds(item, collections) {
  const doc = item && !item.uid && Array.isArray(item.traits) ? item : equipmentDocument(item, collections);
  if (!doc) return [];
  const traits = new Set([...(doc.bases || []), ...(doc.legendary ? [doc.legendary] : []), ...(doc.traits || [])]
    .filter(entry => !(entry.duration > 0)).map(entry => entry.id));
  const skills = new Set(doc.skills || []);
  for (const [id, entry] of collections?.skill || []) if (entry.grantedBy?.some(trait => traits.has(trait))) skills.add(id);
  return [...skills];
}

export function validSkillSlots(input, choices) {
  const allowed = new Set(choices.map(s => s.id));
  return skillSlots(input).map(id => allowed.has(id) ? id : null);
}

/** Selecting an already assigned skill moves it to this slot, leaving its old position empty. */
export function changeSkillSlot(input, slot, value, choices) {
  const fail = error => ({ skills: input, error });
  if (!Number.isInteger(slot) || slot < 0 || slot >= SKILL_SLOTS) return fail('主动技能槽必须为 1–4');
  const id = value || null;
  if (id && !choices.some(s => s.id === id)) return fail('请先拥有该技能或装备授予该技能的物品');
  const skills = validSkillSlots(input, choices).map(value => value === id ? null : value);
  skills[slot] = id;
  return { skills, error: '' };
}

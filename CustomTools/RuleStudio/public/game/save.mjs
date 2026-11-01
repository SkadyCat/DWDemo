// 存档：背包、10 个部位的装备、通货、技能栏、已解锁的地图 T 阶。旧存档不迁移（新词条体系）。
// 主动技能来自装备的第 1 条基底：技能栏只能放身上装备带的技能。
import { SLOTS } from '../../core/content/families.mjs';
import { makeItem, itemAffixes, applyCurrency, CURRENCIES } from '../../core/content/items.mjs';
import { ARCHETYPES } from '../../core/content/archetypes.mjs';
import { stageBuild, STAGES } from '../../core/content/builds.mjs';

const KEY = 'dw.core.save.v2';
export const SKILL_BAR = 4;
/** Skills granted by the equipped items (first base line), in slot order. */
export const grantedSkills = save => [...new Set(SLOTS.map(s => save.equipped[s]?.skill).filter(Boolean))];

export function newSave() {
  const save = { version: 2, inventory: [], equipped: Object.fromEntries(SLOTS.map(s => [s, null])), currencies: Object.fromEntries(Object.keys(CURRENCIES).map(k => [k, 0])),
    skills: [null, null, null, null], unlocked: 1, best: {}, archetype: null, bdStage: null, stats: { maps: 0, kills: 0 } };
  // A starter wand with Fireball so a fresh character can play.
  save.equipped.weapon = makeItem('weapon', 'wand', 1, { skill: 'fireball', traits: [{ id: 'proj_count', tier: 1 }, { id: 'proj_pierce', tier: 1 }], lines: [{ id: 'added_fire_spell', tier: 1 }] });
  syncSkillBar(save);
  return save;
}

/** Keep the bar to granted skills: drop ones no longer equipped, fill empty keys with new ones. */
export function syncSkillBar(save) {
  const granted = grantedSkills(save);
  save.skills = save.skills.map(id => (id && granted.includes(id) ? id : null));
  for (const id of granted) if (!save.skills.includes(id)) { const i = save.skills.indexOf(null); if (i >= 0) save.skills[i] = id; }
}

export function loadSave() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw?.version === 2) return { ...newSave(), ...raw, equipped: { ...newSave().equipped, ...raw.equipped }, currencies: { ...newSave().currencies, ...raw.currencies } };
  } catch { /* fresh save */ }
  return newSave();
}
export function writeSave(save) { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* storage unavailable */ } }

export function buildOf(save) {
  const affixes = [];
  for (const s of SLOTS) if (save.equipped[s]) affixes.push(...itemAffixes(save.equipped[s]));
  const arch = ARCHETYPES.find(a => a.id === save.archetype);
  const granted = grantedSkills(save);
  return { skills: save.skills.filter(id => id && granted.includes(id)), affixes, keepDistance: arch?.keepDistance ?? 0 };
}

export function equip(save, uid) {
  const i = save.inventory.findIndex(it => it.uid === uid);
  if (i < 0) return;
  const item = save.inventory[i];
  let slot = item.slot;
  if (slot === 'ring1' || slot === 'ring2') slot = !save.equipped.ring1 ? 'ring1' : !save.equipped.ring2 ? 'ring2' : 'ring1';
  save.inventory.splice(i, 1);
  if (save.equipped[slot]) save.inventory.push(save.equipped[slot]);
  save.equipped[slot] = { ...item, slot };
  syncSkillBar(save);
}
export function unequip(save, slot) { if (save.equipped[slot]) { save.inventory.push(save.equipped[slot]); save.equipped[slot] = null; syncSkillBar(save); } }
/** Salvage: an item turns into a little currency (more lines, more back). */
export function salvage(save, uid, rng) {
  const i = save.inventory.findIndex(it => it.uid === uid);
  if (i < 0) return null;
  const [item] = save.inventory.splice(i, 1);
  const gain = item.traits.some(l => l.id.startsWith('core_')) ? 'essence_link' : item.lines.length >= 4 ? 'chaos' : item.lines.length >= 2 ? 'augment' : rng() < 0.5 ? 'augment' : null;
  if (gain) save.currencies[gain] = (save.currencies[gain] || 0) + 1;
  return gain;
}
export function craft(save, item, currency, rng, index) {
  if (!(save.currencies[currency] > 0)) return { ok: false, message: `没有${CURRENCIES[currency].name}` };
  const r = applyCurrency(item, currency, rng, index);
  if (r.ok) { save.currencies[currency]--; syncSkillBar(save); }
  return r;
}

/**
 * One-click build: the archetype's stage gear replaces the equipped items (the old ones go to the
 * inventory; earlier one-click presets are simply replaced) and the bar gets the build's skill.
 */
export function applyArchetype(save, id, stageIndex) {
  const a = ARCHETYPES.find(x => x.id === id);
  const b = stageBuild(a, stageIndex), tier = STAGES[stageIndex].itemTier;
  for (const slot of SLOTS) {
    const it = b.items[slot];
    const strip = l => ({ id: l.id, tier: l.tier });
    const item = makeItem(slot, it.base, tier, { skill: it.skill, traits: it.traits.map(strip), lines: it.lines.map(strip) });
    item.preset = `${a.name}·${STAGES[stageIndex].name}`;
    if (save.equipped[slot] && !save.equipped[slot].preset) save.inventory.push(save.equipped[slot]);
    save.equipped[slot] = item;
  }
  save.skills = [a.skills[0], null, null, null];
  syncSkillBar(save);
  save.archetype = a.id;
  save.unlocked = Math.max(save.unlocked, STAGES[stageIndex].maps[1]);
}

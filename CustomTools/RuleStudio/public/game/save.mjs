// 存档：背包、10 个部位的装备、通货、技能栏、已解锁的地图 T 阶。旧存档不迁移（新词条体系）。
import { SLOTS } from '../../core/content/families.mjs';
import { makeItem, itemAffixes, applyCurrency, CURRENCIES, baseList } from '../../core/content/items.mjs';
import { ARCHETYPES } from '../../core/content/archetypes.mjs';
import { stageBuild, STAGES } from '../../core/content/builds.mjs';

const KEY = 'dw.core.save.v1';
export const SKILL_BAR = 4;
/** Skills the player can put on the bar. */
export const PLAYABLE_SKILLS = ['fireball', 'ice_nova', 'arc', 'spark', 'frost_bolt', 'flame_wall', 'heavy_strike', 'cleave', 'cyclone', 'falling_thunder', 'flicker_strike', 'viper_knives', 'summon_blades', 'storm_totem_place'];

export function newSave() {
  return { version: 1, inventory: [], equipped: Object.fromEntries(SLOTS.map(s => [s, null])), currencies: Object.fromEntries(Object.keys(CURRENCIES).map(k => [k, 0])),
    skills: ['fireball', null, null, null], unlocked: 1, best: {}, archetype: null, bdStage: null, stats: { maps: 0, kills: 0 } };
}

export function loadSave() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw?.version === 1) return { ...newSave(), ...raw, equipped: { ...newSave().equipped, ...raw.equipped }, currencies: { ...newSave().currencies, ...raw.currencies } };
  } catch { /* fresh save */ }
  return newSave();
}
export function writeSave(save) { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* storage unavailable */ } }

export function buildOf(save) {
  const affixes = [];
  for (const s of SLOTS) if (save.equipped[s]) affixes.push(...itemAffixes(save.equipped[s]));
  const arch = ARCHETYPES.find(a => a.id === save.archetype);
  return { skills: save.skills.filter(Boolean), affixes, keepDistance: arch?.keepDistance ?? 0 };
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
}
export function unequip(save, slot) { if (save.equipped[slot]) { save.inventory.push(save.equipped[slot]); save.equipped[slot] = null; } }
/** Salvage: an item turns into a little currency (more lines, more back). */
export function salvage(save, uid, rng) {
  const i = save.inventory.findIndex(it => it.uid === uid);
  if (i < 0) return null;
  const [item] = save.inventory.splice(i, 1);
  const gain = item.lines.length >= 3 ? 'chaos' : item.lines.length >= 1 ? 'augment' : rng() < 0.5 ? 'augment' : null;
  if (gain) save.currencies[gain] = (save.currencies[gain] || 0) + 1;
  return gain;
}
export function craft(save, item, currency, rng, index) {
  if (!(save.currencies[currency] > 0)) return { ok: false, message: `没有${CURRENCIES[currency].name}` };
  const r = applyCurrency(item, currency, rng, index);
  if (r.ok) save.currencies[currency]--;
  return r;
}

/**
 * One-click build: the archetype's stage gear (the collection list laid out on 10 items) replaces
 * the equipped items; the old ones go to the inventory. The first three lines of each item become
 * its base lines, the rest its random lines.
 */
export function applyArchetype(save, id, stageIndex) {
  const a = ARCHETYPES.find(x => x.id === id);
  const b = stageBuild(a, stageIndex), tier = STAGES[stageIndex].itemTier;
  for (const slot of SLOTS) {
    const lines = b.items[slot].map(l => ({ id: l.id, tier: l.tier }));
    const base = baseList(slot)[0];
    const item = makeItem(slot, base.id, tier);
    item.implicit = lines.slice(0, 3);
    item.lines = lines.slice(3);
    item.preset = `${a.name}·${STAGES[stageIndex].name}`;
    if (save.equipped[slot] && !save.equipped[slot].preset) save.inventory.push(save.equipped[slot]);
    save.equipped[slot] = item;
  }
  save.skills = [a.skills[0], null, null, null];
  save.archetype = a.id;
  save.unlocked = Math.max(save.unlocked, STAGES[stageIndex].maps[1]);
}

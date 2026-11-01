import { skillSlots, availableSkills } from '../engine/loadout.mjs';
import { equipmentDocument, equipmentTier, ensureEquipmentInherentTraits, EQUIPMENT_RARITIES, normalizeEquipmentRarity } from '../engine/equipment.mjs';
import { validateCollection } from '../engine/collections.mjs';
import { minimumTierPreset } from './build-preset-tier.mjs';

/** Apply an authored preview BD to the existing save; keep all previous inventory and currency. */
export function applyBuildPreset(save, preset, collections, library = null) {
  // Preview BDs default to T1; affix-composition stages keep their tier (阶段 = 游玩进度).
  if (library && preset?.authored && !preset.authored.keepTiers && preset?.instances) {
    try { preset = minimumTierPreset(preset, library); } catch (error) { return { error: error.message }; }
  }
  const skills = skillSlots(preset?.skills);
  const equipment = { ...(preset?.equipment || {}) };
  const belt = [...(preset?.belt || [])];
  const requiredItems = new Map();
  const instances = {};
  const fail = error => ({ error });
  if (!skills.some(Boolean)) return fail('BD 没有主动技能');
  for (const id of skills.filter(Boolean)) if (!collections.skill.get(id)?.doc) return fail(`BD 技能不存在：${id}`);
  for (const [slot, id] of Object.entries(equipment)) {
    const item = preset.instances?.[id];
    if (item) {
      if (!library) return fail('随机装备 BD 需要当前规则库校验');
      const base = collections.equipment.get(item.baseId)?.doc;
      if (!base || item.uid !== id || item.slot !== base.slot || item.skill !== (base.skills?.[0] || '')) return fail(`BD 随机装备或绑定技能无效：${id}`);
      if (!Array.isArray(item.affixes)) return fail(`BD 随机词条格式无效：${id}`);
      try { equipmentTier(item); } catch (e) { return fail(e.message); }
      // Crafted counts may exceed drop ranges. Correct stale quality metadata,
      // while still rejecting a declared legendary whose fixed payload is lost.
      if (!EQUIPMENT_RARITIES.includes(item.rarity) || item.rarity === 'legendary' && !item.legendary && !item.extraLegendary?.length) return fail(`BD 装备品质与词条数量不符：${id}`);
      const rankError = t => !t || (t.tier !== undefined && t.tier > equipmentTier(item)) || (t.with || []).some(rankError);
      if ([...(item.legendary ? [item.legendary] : []), ...(item.extraLegendary || []), ...item.affixes].some(a => !a || !Array.isArray(a.traits) || a.traits.some(rankError))) return fail(`BD 装备词条超过装备 T 阶：${id}`);
      const error = validateCollection('equipment', equipmentDocument(item, collections), library).error;
      if (error) return fail(`BD 随机装备 ${id}：${error}`);
      instances[id] = JSON.parse(JSON.stringify(item));
      ensureEquipmentInherentTraits(instances[id], base, library);
      normalizeEquipmentRarity(instances[id]);
    }
    const doc = item ? equipmentDocument(item, collections) : collections.equipment.get(id)?.doc;
    if (!doc || doc.slot !== slot) return fail(`BD 装备或部位无效：${id}`);
  }
  if (Object.keys(instances).length) {
    const bound = new Set(availableSkills({}, equipment, collections, instances).map(s => s.id));
    if (skills.some(id => id && !bound.has(id))) return fail('随机装备 BD 的主动技能必须由实际装备绑定');
  }
  for (const id of belt) {
    if (collections.item.get(id)?.doc?.category !== 'consumable') return fail(`BD 消耗品不存在：${id}`);
    requiredItems.set(id, Math.max(1, requiredItems.get(id) || 0));
  }
  // Validate everything before changing the player. Repeated application never duplicates gear.
  if (!Object.keys(instances).length) for (const id of skills.filter(Boolean)) save.owned.skill[id] = true;
  for (const id of Object.values(equipment)) {
    if (instances[id]) { save.instances ||= {}; normalizeEquipmentRarity(save.instances[id] ||= instances[id]); }
    else save.owned.equipment[id] = Math.max(1, save.owned.equipment[id] || 0);
  }
  for (const [id, count] of requiredItems) save.owned.item[id] = Math.max(count, save.owned.item[id] || 0);
  save.loadout = { skills, equipment, belt };
  return { error: '', selected: skills.findIndex(Boolean) };
}

// Authoring only: royal treasury variants use the same legal item construction path.
import { equipmentAffixPool, equipmentRandom, validateTraitValueEntry } from '../engine/index.mjs';
import { rollEquipment, equipmentDropAffixPool } from '../public/equipment-generation.mjs';
import { materializeHunterAffix } from '../public/bdhunter/analyzer.mjs';
import { applyBuildPreset } from '../public/build-presets.mjs';
import { minimumTierPreset } from '../public/build-preset-tier.mjs';

export function createRoyalEquipmentPreset(library, collections, { family, name, uidPrefix, itemPrefix, names, affixes }) {
  const definitions = new Map(equipmentAffixPool(library).map(row => [row.id, row]));
  const fixedBases = { weapon: 'treasury_sovereign_staff', ring: 'rime_thunder_annihilation_ring' };
  const preset = { skills: ['royal_treasury', null, null, null], equipment: {}, instances: {}, belt: [],
    authored: { source: 'generated-trait-composition', family, revision: 1, name } };
  for (const [slot, ids] of Object.entries(affixes)) {
    const base = fixedBases[slot] ? collections.equipment.get(fixedBases[slot])?.doc
      : [...collections.equipment.values()].find(({ doc }) => doc.slot === slot && doc.rarity !== 'legendary')?.doc;
    if (!base) throw Error(`缺少底材 ${slot}`);
    const uid = `${uidPrefix}_${slot}`, rarity = fixedBases[slot] ? 'legendary' : ids.length <= 2 ? 'magic' : 'rare';
    const item = rollEquipment(base, library, { uid, rarity, tier: 1, random: equipmentRandom(2017) });
    item.name = `${itemPrefix}·${names[slot]}`;
    const allowed = new Set(equipmentDropAffixPool(library, slot).map(a => a.id));
    item.affixes = ids.map(id => {
      if (!allowed.has(id)) throw Error(`${slot}: ${id} 不在部位可洗池`);
      const definition = definitions.get(id); if (!definition) throw Error(`未知词条 ${id}`);
      return materializeHunterAffix(definition, library, 1);
    });
    for (const line of [...item.bases, ...(item.legendary ? [item.legendary] : []), ...item.affixes]) {
      const walk = entry => { const error = validateTraitValueEntry(library, entry); if (error) throw Error(error); (entry.with || []).forEach(walk); };
      line.traits.forEach(walk);
    }
    preset.equipment[slot] = uid; preset.instances[uid] = item;
  }
  const save = { owned: { skill: {}, equipment: {}, item: {} }, instances: {}, loadout: {} };
  const applied = applyBuildPreset(save, preset, collections, library); if (applied.error) throw Error(applied.error);
  return minimumTierPreset(preset, library);
}

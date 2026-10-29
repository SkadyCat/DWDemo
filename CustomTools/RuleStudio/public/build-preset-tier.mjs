// Preview BD policy only. Real drops, crafting and combat still support T1–T10.
import { createTraitValueEntry, validateTraitValueEntry } from '../engine/trait-tiers.mjs';

export const BUILD_PRESET_TIER = 1;
export function minimumTierPreset(preset, library) {
  const copy = JSON.parse(JSON.stringify(preset));
  const entry = raw => {
    const source = library.trait(raw.id)?.source;
    if (!source) throw Error(`未知BD特性 ${raw.id}`);
    const children = (raw.with || []).map(entry);
    if (!source.params.size) { const out = { ...raw, params: {}, with: children }; delete out.tier; return out; }
    const keep = raw.tier === 1 && !validateTraitValueEntry(library, raw);
    return { ...raw, ...(keep ? {} : createTraitValueEntry(library, raw.id, { tier: 1, random: () => .5 })), with: children };
  };
  for (const [uid, item] of Object.entries(copy.instances || {})) {
    const newUid = item.tier > 1 && !uid.endsWith('_bdt1') ? `${uid}_bdt1` : uid;
    item.tier = 1;
    for (const line of [...(item.bases || []), ...(item.legendary ? [item.legendary] : []), ...(item.affixes || [])]) {
      line.traits = line.traits.map(entry);
      if (line.traits.some(t => t.tier)) line.tier = 1; else delete line.tier;
    }
    if (newUid !== uid) {
      item.uid = newUid; delete copy.instances[uid]; copy.instances[newUid] = item;
      for (const slot of Object.keys(copy.equipment || {})) if (copy.equipment[slot] === uid) copy.equipment[slot] = newUid;
    }
  }
  copy.authored = { ...copy.authored, minimumTier: 1 };
  return copy;
}

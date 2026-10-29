import { minimumTierPreset } from '../public/build-preset-tier.mjs';
// A reproducible sample of ordinary T1 drops. All inherent traits come from the live bases.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOL_ROOT, readRuleFiles } from './rule-files.mjs';
import { checkRuleSet, equipmentRandom, rollEquipmentDrop, createProgression } from '../engine/index.mjs';
import { applyBuildPreset } from '../public/build-presets.mjs';
import { referenceAffixPool } from './reference-affix-pool.mjs';

export function createMyriadSwordsPreset(library, collections, seed = 1) {
  const random = equipmentRandom(seed);
  const pool = referenceAffixPool(library);
  const preset = { skills: ['frost_lance', null, null, null], equipment: {}, instances: {}, belt: [],
    authored: { source: 'generated-existing-traits', family: 'projectile', name: '万剑归宗·单击30枚', seed } };
  for (const slot of ['weapon', 'helmet', 'chest', 'gloves', 'boots']) {
    const id = `myriad_swords_t1_${slot}`, template = collections.equipment.get(id)?.doc;
    if (!template || template.slot !== slot) throw new Error(`万剑底材不存在：${id}`);
    const uid = `legendary_myriad_swords_t1_instant_${slot}`;
    const item = rollEquipmentDrop({ equipment: new Map([[id, { doc: template }]]) }, library,
      { chance: 1, rarity: 'legendary', maxTier: 1, uid, random, identified: true, pool });
    preset.instances[uid] = item; preset.equipment[slot] = uid;
  }
  const result = applyBuildPreset(createProgression(collections, library), preset, collections, library);
  if (result.error) throw new Error(result.error);
  return minimumTierPreset(preset, library);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = checkRuleSet(readRuleFiles());
  if (!check.ok) throw new Error(check.error);
  const preset = createMyriadSwordsPreset(check.library, check.collections);
  fs.writeFileSync(path.join(TOOL_ROOT, '../../Content/Rules/Presets/myriad_swords_t1_legendary.json'), JSON.stringify(preset, null, 2) + '\n');
  console.log('万剑：五件正常掉落、鉴定生成的 T1 传奇，每件五条随机词缀。');
}

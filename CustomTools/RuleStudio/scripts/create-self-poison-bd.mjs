import { minimumTierPreset } from '../public/build-preset-tier.mjs';
// Author a preview build from existing equipment, traits and their ten-rank value bands.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOL_ROOT, readRuleFiles } from './rule-files.mjs';
import { checkRuleSet, createTraitValueEntry, equipmentRandom, validateTraitValueEntry } from '../engine/index.mjs';
import { applyBuildPreset } from '../public/build-presets.mjs';

export const SELF_POISON_BD = {
  id: 'self_poison_flasks', name: '自毒连投',
  description: '生成的五件稀有 T1 配装：毒瓶施毒让自身中毒，累计损血后在索敌目标处连投额外毒瓶。先手动命中启动，持续命中可继续循环；无目标后自毒消退，重新命中启动。气血再生与命中回复维持续航。仅使用现有词条，不是掉落或洗炼所得。',
};

export function createSelfPoisonPreset(library, collections, seed = 20261023) {
  const random = equipmentRandom(seed);
  const entry = (id, tier = 10) => createTraitValueEntry(library, id, { tier: library.trait(id)?.source.params.size ? tier : null, random });
  const affix = (id, tier = 10, mounted = []) => {
    const trait = entry(id, tier);
    trait.with = mounted.map(id => entry(id, tier));
    return { id, name: library.traitDisplayName(id), ...(trait.tier ? { tier: trait.tier } : {}), traits: [trait] };
  };
  const lossTrigger = affix('trig_life_lost', 1, ['throw_poison_flask', 'poison_flask_burst', 'poison_flask_poison', 'multiple_projectiles']);
  // A lower threshold is useful here. All values, including the mounted skill, stay in T1.
  lossTrigger.traits[0].params.per = 13;
  const pieces = [
    ['weapon', 'venomglass_flask', '蚀骨琉璃瓶', [
      affix('poison_self'), lossTrigger, affix('trigger_resource_reduction'), affix('trigger_repeat'), affix('proj_origins'), affix('trigger_seek'),
    ]],
    ['chest', 'cinder_guard_chest', '续生衣', [
      affix('trigger_resource_reduction'), affix('trigger_cost'), affix('life_base'), affix('life_increased'), affix('life_regen_percent'), affix('life_regen_speed'),
    ]],
    ['helmet', 'cinder_guard_helmet', '回流冠', [
      affix('trigger_resource_reduction'), affix('life_on_hit'), affix('area_hit_mana'), affix('trigger_store_event'), affix('area_size_more'), affix('poison_base'),
    ]],
    ['gloves', 'bloodthirst_gauntlets', '施毒护手', [
      affix('poison_increased'), affix('poison_more'), affix('poison_per_layer'), affix('poison_duration'), affix('poison_base'), affix('armour'),
    ]],
    ['boots', 'warden_boots', '稳生靴', [
      affix('life_base'), affix('life_increased'), affix('life_regen_percent'), affix('life_regen_speed'), affix('hit_next_reduce'), affix('poison_enemy_weaken'),
    ]],
  ];
  const preset = { skills: ['poison_flask', null, null, null], equipment: {}, instances: {}, belt: [],
    authored: { source: 'generated-existing-traits', seed, name: SELF_POISON_BD.name } };
  const validate = trait => {
    const error = validateTraitValueEntry(library, trait);
    if (error) throw new Error(error);
    trait.with.forEach(validate);
  };
  for (const [slot, baseId, name, affixes] of pieces) {
    const base = collections.equipment.get(baseId)?.doc;
    if (!base || base.slot !== slot) throw new Error(`BD 装备底材无效：${baseId}`);
    const uid = `${SELF_POISON_BD.id}_${slot}`;
    preset.equipment[slot] = uid;
    preset.instances[uid] = { uid, baseId, name: `${SELF_POISON_BD.name}·${name}`, slot, level: base.level,
      rarity: 'rare', tier: 10, skill: base.skills[0] || '', affixes, legendary: null };
    affixes.forEach(a => a.traits.forEach(validate));
  }
  const probe = { owned: { skill: {}, equipment: {}, item: {} }, instances: {}, loadout: {} };
  const result = applyBuildPreset(probe, preset, collections, library);
  if (result.error) throw new Error(result.error);
  return minimumTierPreset(preset, library);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = checkRuleSet(readRuleFiles());
  if (!check.ok) throw new Error(check.error);
  const preset = createSelfPoisonPreset(check.library, check.collections);
  const directory = path.join(TOOL_ROOT, '../../Content/Rules/Presets');
  fs.writeFileSync(path.join(directory, `${SELF_POISON_BD.id}.json`), JSON.stringify(preset, null, 2) + '\n');
  const indexFile = path.join(directory, 'index.json');
  const index = JSON.parse(fs.readFileSync(indexFile, 'utf8')).filter(entry => entry.id !== SELF_POISON_BD.id);
  index.push(SELF_POISON_BD);
  fs.writeFileSync(indexFile, JSON.stringify(index, null, 2) + '\n');
  console.log(`${SELF_POISON_BD.name}: ${Object.keys(preset.instances).length} 件装备，${Object.values(preset.instances).reduce((n, item) => n + item.affixes.length, 0)} 条现有词条`);
}

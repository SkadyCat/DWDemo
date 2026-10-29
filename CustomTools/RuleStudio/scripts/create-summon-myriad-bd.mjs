import { minimumTierPreset } from '../public/build-preset-tier.mjs';
// Summon Myriad: authored inherent traits; the five ordinary affixes are real drop rolls.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOL_ROOT, readRuleFiles } from './rule-files.mjs';
import { checkRuleSet, createTraitValueEntry, equipmentRandom, rollEquipmentDrop, createProgression, ensureEquipmentInherentTraits } from '../engine/index.mjs';
import { applyBuildPreset } from '../public/build-presets.mjs';

export const SUMMON_MYRIAD_ID = 'summon_myriad_swords';
export const SUMMON_MYRIAD_PARTS = Object.freeze([
  { slot: 'weapon', name: '御剑杖', legendary: 'multiple_projectiles', bases: ['proj_count', 'proj_origins', 'minion_flat_frost', 'minion_cast_speed'] },
  { slot: 'helmet', name: '归宗冠', legendary: 'proj_layout_converge', bases: ['proj_retarget', 'proj_homing_range', 'proj_homing_turn', 'shield_base', 'minion_skill_cooldown'] },
  { slot: 'chest', name: '列阵衣', legendary: 'proj_origins', bases: ['control_unit_cap', 'minion_cap_same', 'life_base', 'life_increased', 'minion_skill_cooldown'] },
  { slot: 'gloves', name: '并锋手', legendary: 'proj_origins', bases: ['proj_count', 'minion_damage', 'minion_life', 'minion_cast_speed'] },
  { slot: 'boots', name: '巡剑靴', legendary: 'proj_origins', bases: ['proj_retarget_on_death', 'proj_origins', 'minion_duration', 'life_regen_percent', 'minion_cast_speed'] },
]);

export function createSummonMyriadEquipment(library) {
  const value = id => createTraitValueEntry(library, id, library.trait(id).source.params.size ? { tier: 10, random: () => .5 } : {});
  return SUMMON_MYRIAD_PARTS.map(part => {
    const fixed = value(part.legendary);
    return { id: `summon_myriad_${part.slot}`, name: `召唤·万剑${part.name}`,
      description: '召唤万剑：既有哨卫发射冰锥，多重、发射位置、汇聚与追踪通过原有投射物词条聚合。五件T1固定部分提供3个控制名额、同类上限3，每座首轮143枚冰锥；施法速度与冷却恢复合计+195%，每座约0.34秒一轮。连续召唤三次建立三座哨卫。核心在固定基底与单条传奇，五条品质词缀正常随机，洗炼保留核心。',
      slot: part.slot, rarity: 'legendary', level: 1, tier: 10, tags: ['召唤', '冰霜', '投射物'],
      skills: part.slot === 'weapon' ? ['sentinel'] : [], bases: part.bases.map(value),
      legendary: fixed, traits: [structuredClone(fixed)] };
  });
}

export function createSummonMyriadPreset(library, collections, seed = 20261024) {
  const random = equipmentRandom(seed);
  const preset = { skills: ['sentinel', null, null, null], equipment: {}, instances: {}, belt: [],
    authored: { source: 'generated-existing-traits', family: 'summon_myriad', name: '召唤万剑·三哨卫', seed } };
  for (const { slot } of SUMMON_MYRIAD_PARTS) {
    const id = `summon_myriad_${slot}`, template = collections.equipment.get(id)?.doc;
    if (!template || template.slot !== slot) throw new Error(`召唤万剑底材不存在：${id}`);
    const uid = `legendary_summon_myriad_t10_${slot}`;
    const item = rollEquipmentDrop({ equipment: new Map([[id, { doc: template }]]) }, library,
      { chance: 1, rarity: 'legendary', tier: 10, maxTier: 10, uid, random, identified: true });
    preset.instances[uid] = item; preset.equipment[slot] = uid;
  }
  const applied = applyBuildPreset(createProgression(collections, library), preset, collections, library);
  if (applied.error) throw new Error(applied.error);
  return minimumTierPreset(preset, library);
}

/** Refresh fixed bases through the ordinary loadout path, keeping all owned random rolls. */
export function refreshSummonMyriadPreset(preset, library, collections) {
  const refreshed = structuredClone(preset);
  for (const { slot } of SUMMON_MYRIAD_PARTS) {
    const item = refreshed.instances[refreshed.equipment[slot]], id = `summon_myriad_${slot}`;
    if (item?.baseId !== id) throw new Error(`召唤万剑实例不存在：${id}`);
    ensureEquipmentInherentTraits(item, collections.equipment.get(id)?.doc, library);
  }
  const applied = applyBuildPreset(createProgression(collections, library), refreshed, collections, library);
  if (applied.error) throw new Error(applied.error);
  return refreshed;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let check = checkRuleSet(readRuleFiles());
  if (!check.ok) throw new Error(check.error);
  const rules = path.resolve(TOOL_ROOT, '../../Content/Rules');
  for (const doc of createSummonMyriadEquipment(check.library))
    fs.writeFileSync(path.join(rules, 'Equipment', doc.id + '.json'), JSON.stringify(doc, null, 2) + '\n');
  check = checkRuleSet(readRuleFiles());
  if (!check.ok) throw new Error(check.error);
  const presetFile = path.join(rules, 'Presets', SUMMON_MYRIAD_ID + '.json');
  const preset = process.argv.includes('--refresh-inherent')
    ? refreshSummonMyriadPreset(JSON.parse(fs.readFileSync(presetFile, 'utf8')), check.library, check.collections)
    : createSummonMyriadPreset(check.library, check.collections);
  fs.writeFileSync(presetFile, JSON.stringify(preset, null, 2) + '\n');
  const file = path.join(rules, 'Presets/index.json'), index = JSON.parse(fs.readFileSync(file, 'utf8'));
  const row = { id: SUMMON_MYRIAD_ID, name: '召唤万剑·三哨卫',
    description: '五件传奇T1，武器绑定现有召唤哨卫。固定核心提供3个控制名额与同类上限3；连续召唤三次，每座哨卫首轮143枚冰锥（13枚×11处发射位置），具备目标周围汇聚与追踪。召唤物施法速度+117%、技能冷却恢复速度+78%，每座约0.34秒一轮。核心位于固定基底与一条传奇，下面五条词缀正常掉落随机生成。按住施法可补齐和维持哨卫，伤害来自召唤物，未添加新战斗规则。' };
  const i = index.findIndex(entry => entry.id === row.id); if (i < 0) index.push(row); else index[i] = row;
  fs.writeFileSync(file, JSON.stringify(index, null, 2) + '\n');
  console.log(JSON.stringify({ id: SUMMON_MYRIAD_ID, equipment: Object.values(preset.instances).map(item => ({ name: item.name, slot: item.slot, tier: item.tier, random: item.affixes.map(a => a.id) })) }));
}

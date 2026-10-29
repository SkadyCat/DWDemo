// Alternate equipment composition for exercising all four ground producers.
import fs from 'node:fs';
import path from 'node:path';
import { RULES_DIR, readRuleFiles } from './rule-files.mjs';
import { checkRuleSet, equipmentAffixPool, validateTraitValueEntry } from '../engine/index.mjs';
import { registerEquipmentDropLibrary, equipmentDropAffixPool } from '../public/equipment-generation.mjs';
import { materializeHunterAffix } from '../public/bdhunter/analyzer.mjs';
import { createWhirlwindSwarm } from './create-whirlwind-swarm-bd.mjs';
import { applyBuildPreset } from '../public/build-presets.mjs';
const files = readRuleFiles(), checked = checkRuleSet(files); if (!checked.ok) throw Error(checked.error);
registerEquipmentDropLibrary(files, checked.library, checked.affixCategories);
const preset = createWhirlwindSwarm(checked.library, checked.collections), definitions = new Map(equipmentAffixPool(checked.library).map(a => [a.id, a]));
const swaps = { weapon: ['damage_per_life', 'hit_burning_ground'], gloves: ['damage_per_life', 'hit_chilled_ground'],
  helmet: ['proj_damage', 'hit_shocked_ground'], offhand: ['proj_damage', 'hit_poison_ground'] };
const row = { id: 'whirlwind_grounds', name: '旋风·四色染地', description: '手动旋风每次五个、8秒寿命与27米/秒游走。四件装备命中触发燃烧、冰缓、感电、毒性地面；镜像地面在每次实际进入时复制旋风，复制体也须退出再进才能重触发。第2槽回响冷却5秒，使下一次手动技能额外执行一次并消耗状态。已移除定时自动旋风。旋风接触异常地面后染橙、冰蓝、紫、绿；地面正常结算伤害或异常，词条可洗炼、拆除。' };
const instances = {};
for (const [slot, oldUid] of Object.entries(preset.equipment)) {
  const item = preset.instances[oldUid], uid = `whirlwind_grounds_v2_${slot}`;
  item.uid = uid; item.name = item.name.replace('风暴群·', '染地·');
  if (swaps[slot]) {
    const [oldId, id] = swaps[slot], allowed = equipmentDropAffixPool(checked.library, slot).some(a => a.id === id);
    if (!allowed) throw Error(`${slot} 不允许 ${id}`);
    const affix = materializeHunterAffix(definitions.get(id), checked.library, 1);
    for (const t of affix.traits) { const error = validateTraitValueEntry(checked.library, t); if (error) throw Error(error); }
    item.affixes[item.affixes.findIndex(a => a.id === oldId)] = affix;
  }
  preset.equipment[slot] = uid; instances[uid] = item;
}
preset.instances = instances; preset.authored = { source: 'generated-trait-composition', family: row.id, revision: 2, name: row.name };
const save = { owned: { skill: {}, equipment: {}, item: {} }, instances: {}, loadout: {} };
const applied = applyBuildPreset(save, preset, checked.collections, checked.library); if (applied.error) throw Error(applied.error);
const folder = path.join(RULES_DIR, 'Presets'), indexPath = path.join(folder, 'index.json'), index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
const at = index.findIndex(r => r.id === row.id); if (at < 0) index.push(row); else index[at] = row;
fs.writeFileSync(path.join(folder, `${row.id}.json`), JSON.stringify(preset, null, 2) + '\n');
fs.writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n');
console.log(row.name + '：九件合法装备，四种异常地面均由真实命中触发。');

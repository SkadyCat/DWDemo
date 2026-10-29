import { minimumTierPreset } from '../public/build-preset-tier.mjs';
// Equipment authoring only. Simulation uses existing emit, roaming and trigger rules.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULES_DIR, readRuleFiles } from './rule-files.mjs';
import { checkRuleSet, equipmentAffixPool, equipmentRandom, validateTraitValueEntry } from '../engine/index.mjs';
import { registerEquipmentDropLibrary, equipmentDropAffixPool, rollEquipment } from '../public/equipment-generation.mjs';
import { materializeHunterAffix } from '../public/bdhunter/analyzer.mjs';
import { applyBuildPreset } from '../public/build-presets.mjs';

export const WHIRLWIND_SWARM = Object.freeze({ id: 'whirlwind_swarm', name: '旋风·风暴群',
  description: '手动施放一次创建5个27米/秒、基础持续2秒的游走旋风。命中生成镜像地面，每次实际进入复制一枚；原体和复制体都须退出再进入才能重触发，复制不刷新寿命。第二槽回响独立冷却5秒，先施放回响再施放旋风，可额外执行一次完整技能并消耗状态。数量来自真实进出复制，已移除定时自动旋风。气血点伤、物理/投射物增伤与回复沿用合法装备词条。' });
export const SWARM_AFFIXES = Object.freeze({
  weapon: ['proj_count', 'damage_per_life', 'proj_damage', 'proj_more', 'life_added_physical', 'more_physical'],
  gloves: ['proj_count', 'damage_per_life', 'proj_damage', 'proj_more', 'life_added_physical', 'more_physical'],
  helmet: ['hit_mirror_ground', 'proj_damage', 'proj_more', 'proj_hit_life', 'life_added_physical', 'damage_per_life'],
  offhand: ['proj_damage', 'proj_more', 'life_added_physical', 'more_physical', 'proj_hit_life', 'life_regen_percent'],
  chest: ['life_base', 'life_increased', 'life_more', 'life_regen_percent', 'armour', 'fire_resistance'],
  boots: ['life_base', 'life_increased', 'life_more', 'life_regen_percent', 'frost_resistance', 'lightning_resistance'],
  belt: ['life_base', 'life_increased', 'life_more', 'life_regen_percent', 'poison_resistance', 'armour'],
  ring: ['proj_layout_ring'],
  amulet: ['grant_echo'],
});
const names = { weapon: '回风杖', gloves: '织风手', helmet: '时序冠', offhand: '回响副器', chest: '风壁衣', boots: '踏风履', belt: '回生带', ring: '环风戒', amulet: '连鸣坠' };

export function createWhirlwindSwarm(library, collections) {
  const definitions = new Map(equipmentAffixPool(library).map(row => [row.id, row]));
  const preset = { skills: ['whirlwind', 'echo', null, null], equipment: {}, instances: {}, belt: [],
    authored: { source: 'generated-trait-composition', family: 'whirlwind_swarm', revision: 3, name: WHIRLWIND_SWARM.name } };
  for (const [slot, ids] of Object.entries(SWARM_AFFIXES)) {
    const base = slot === 'weapon' ? collections.equipment.get('gale_spindle')?.doc
      : [...collections.equipment.values()].find(({ doc }) => doc.slot === slot && doc.rarity !== 'legendary')?.doc;
    if (!base) throw new Error(`缺少底材 ${slot}`);
    const allowed = new Set(equipmentDropAffixPool(library, slot).map(row => row.id));
    const uid = `whirlwind_swarm_v3_${slot}`;
    const item = rollEquipment(base, library, { uid, tier: 10, rarity: ids.length <= 2 ? 'magic' : 'rare', random: equipmentRandom(44) });
    item.name = `风暴群·${names[slot]}`;
    item.affixes = ids.map(id => {
      if (!allowed.has(id)) throw new Error(`${slot}: ${id} 不在部位词条池`);
      return materializeHunterAffix(definitions.get(id), library, 10);
    });
    const walk = t => { const error = validateTraitValueEntry(library, t); if (error) throw new Error(error); return [t.id, ...(t.with || []).flatMap(walk)]; };
    const traits = item.affixes.flatMap(a => a.traits.flatMap(walk));
    if (new Set(traits).size !== traits.length) throw new Error(`重复或冲突词条 ${slot}`);
    preset.equipment[slot] = uid; preset.instances[uid] = item;
  }
  const save = { owned: { skill: {}, equipment: {}, item: {} }, instances: {}, loadout: {} };
  const applied = applyBuildPreset(save, preset, collections, library); if (applied.error) throw new Error(applied.error);
  return minimumTierPreset(preset, library);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = readRuleFiles(), checked = checkRuleSet(files); if (!checked.ok) throw new Error(checked.error);
  registerEquipmentDropLibrary(files, checked.library, checked.affixCategories);
  const preset = createWhirlwindSwarm(checked.library, checked.collections), folder = path.join(RULES_DIR, 'Presets');
  const indexPath = path.join(folder, 'index.json'), rows = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const at = rows.findIndex(row => row.id === WHIRLWIND_SWARM.id); if (at < 0) rows.push(WHIRLWIND_SWARM); else rows[at] = WHIRLWIND_SWARM;
  fs.writeFileSync(path.join(folder, `${WHIRLWIND_SWARM.id}.json`), JSON.stringify(preset, null, 2) + '\n');
  fs.writeFileSync(indexPath, JSON.stringify(rows, null, 2) + '\n');
  console.log(JSON.stringify({ name: WHIRLWIND_SWARM.name, items: Object.keys(preset.instances).length,
    lines: Object.values(preset.instances).reduce((n, i) => n + i.affixes.length, 0), bases: Object.values(preset.instances).map(i => [i.slot, i.bases.map(b => b.id)]) }, null, 2));
}

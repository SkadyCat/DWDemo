// Element interactions are composed from existing, independently washable affixes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULES_DIR, readRuleFiles } from './rule-files.mjs';
import { checkRuleSet } from '../engine/index.mjs';
import { registerEquipmentDropLibrary } from '../public/equipment-generation.mjs';
import { createRoyalEquipmentPreset } from './royal-treasury-equipment.mjs';

export const ROYAL_ELEMENTS = Object.freeze({ id: 'royal_treasury_elements', name: '王之宝库·万象熔炉',
  description: '全套最低T1，一次施放加1层启动；累计3次投射命中、暴击、击杀、消耗异常分别通过独立词条补层，自叠至40层并提高出射频率。冰缓延毒、感电增毒、点燃增爆；毒爆或消费感电同时补层并触发雷霆新星，新星继续施毒，形成反应→补层→更多命中的循环。没有实际事件不补层，最后补层5秒后开始衰减。' });

export const ELEMENT_AFFIXES = Object.freeze({
  weapon: ['proj_damage', 'proj_more', 'frost_damage', 'igniting_hits', 'treasury_hit_stock'],
  gloves: ['proj_count', 'proj_pierce', 'proj_batch_cap', 'shocking_hits', 'poison_chance', 'treasury_critical_stock'],
  helmet: ['life_added_physical', 'poison_vs_chill', 'poison_vs_shock', 'poison_detonate_vs_burning', 'poison_extra_layers', 'proj_hit_life'],
  offhand: ['proj_batch_cap', 'poison_detonate_ratio', 'poison_detonate_area', 'treasury_consumed_stock', 'shock_extra_layers', 'proj_hit_mana'],
  ring: ['shock_consume', 'trigger_cost', 'trigger_cooldown_recovery', 'trigger_charges', 'trigger_at_event'],
  amulet: ['trigger_cost', 'treasury_kill_stock', 'poison_from_elemental', 'poison_hit_detonate', 'chill_chance', 'trigger_repeat'],
  chest: ['life_base', 'life_increased', 'life_more', 'armour', 'lightning_resistance', 'life_regen_percent'],
  boots: ['life_base', 'life_increased', 'life_more', 'fire_resistance', 'frost_resistance', 'life_regen_percent'],
  belt: ['life_base', 'life_increased', 'life_more', 'poison_resistance', 'armour', 'life_regen_percent'],
});
const names = { weapon: '天穹之钥', gloves: '百炼手', helmet: '霜疫冠', offhand: '融毒法器', ring: '鸣灭指环', amulet: '回流坠', chest: '熔炉衣', boots: '踏霜履', belt: '续命带' };
export const createRoyalElements = (library, collections) => createRoyalEquipmentPreset(library, collections, {
  family: ROYAL_ELEMENTS.id, name: ROYAL_ELEMENTS.name, uidPrefix: 'royal_elements_v3_t1', itemPrefix: '万象', names, affixes: ELEMENT_AFFIXES,
});

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = readRuleFiles(), checked = checkRuleSet(files); if (!checked.ok) throw Error(checked.error);
  registerEquipmentDropLibrary(files, checked.library, checked.affixCategories);
  const preset = createRoyalElements(checked.library, checked.collections), folder = path.join(RULES_DIR, 'Presets'), indexPath = path.join(folder, 'index.json');
  const rows = JSON.parse(fs.readFileSync(indexPath, 'utf8')), at = rows.findIndex(row => row.id === ROYAL_ELEMENTS.id);
  if (at < 0) rows.push(ROYAL_ELEMENTS); else rows[at] = ROYAL_ELEMENTS;
  fs.writeFileSync(path.join(folder, `${ROYAL_ELEMENTS.id}.json`), JSON.stringify(preset, null, 2) + '\n');
  fs.writeFileSync(indexPath, JSON.stringify(rows, null, 2) + '\n');
  console.log('万象熔炉：冰缓延毒、感电增毒、点燃增爆，消耗异常接续雷霆新星。');
}

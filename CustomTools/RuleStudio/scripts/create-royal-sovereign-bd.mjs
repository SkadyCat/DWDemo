// Upper-layer equipment composition. No casts, modifiers or hidden bonuses live here.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULES_DIR, TOOL_ROOT, readRuleFiles } from './rule-files.mjs';
import { checkRuleSet, createTraitValueEntry } from '../engine/index.mjs';
import { registerEquipmentDropLibrary } from '../public/equipment-generation.mjs';
import { createRoyalEquipmentPreset } from './royal-treasury-equipment.mjs';
import { ICON_ENTRIES, ICON_SHEETS } from '../public/icon-catalog.mjs';

export const ROYAL_SOVEREIGN = Object.freeze({ id: 'royal_treasury_sovereign', name: '王之宝库·雷铸王权',
  description: '全套最低T1：手动一次仅加1层启动。每累计3次投射命中、投射物暴击、击杀或实际消耗异常，独立特性补1层并刷新维持时间；命中越多，层数越高，继续增加出射频率，自叠至40层。闪电感电→消费感电→雷霆新星，消费事件也补层；命中回蓝支持触发消耗。没有目标时停止补层，最后补层5秒后开始衰减。' });

export const SOVEREIGN_AFFIXES = Object.freeze({
  weapon: ['proj_damage', 'proj_more', 'treasury_hit_stock', 'lightning_pen', 'more_physical'],
  gloves: ['proj_count', 'proj_pierce', 'proj_batch_cap', 'shocking_hits', 'shock_extra_layers', 'treasury_critical_stock'],
  helmet: ['lightning_base', 'proj_damage', 'proj_more', 'shock_chance', 'treasury_kill_stock', 'proj_hit_life'],
  offhand: ['proj_batch_cap', 'lightning_pen', 'proj_more', 'shock_chance', 'treasury_consumed_stock', 'proj_hit_mana'],
  ring: ['shock_consume', 'trigger_cost', 'trigger_cooldown_recovery', 'trigger_charges', 'trigger_at_event'],
  amulet: ['trigger_cost', 'trigger_cooldown_recovery'],
  chest: ['life_base', 'life_increased', 'life_more', 'armour', 'lightning_resistance', 'life_regen_percent'],
  boots: ['life_base', 'life_increased', 'life_more', 'fire_resistance', 'frost_resistance', 'life_regen_percent'],
  belt: ['life_base', 'life_increased', 'life_more', 'poison_resistance', 'armour', 'life_regen_percent'],
});
const names = { weapon: '天穹之钥', gloves: '御雷手', helmet: '铸雷冠', offhand: '雷律法器', ring: '鸣灭指环', amulet: '省魔坠', chest: '护国衣', boots: '巡天履', belt: '回生带' };

export function createRoyalSovereign(library, collections) {
  return createRoyalEquipmentPreset(library, collections, { family: ROYAL_SOVEREIGN.id, name: ROYAL_SOVEREIGN.name,
    uidPrefix: 'royal_sovereign_v3_t1', itemPrefix: '王权', names, affixes: SOVEREIGN_AFFIXES });
}

function authorStockTiers() {
  const file = path.join(RULES_DIR, 'Values/trait_tiers.json'), text = fs.readFileSync(file, 'utf8'), catalog = JSON.parse(text);
  const values = { amount: Array(10).fill(1), cap: Array(10).fill(40),
    duration: Array(10).fill(5), decay_interval: Array(10).fill(2), range: Array(10).fill(24), cooldown: Array(10).fill(.65), rate: Array(10).fill(1) };
  const profile = { params: Object.fromEntries(Object.entries(values).map(([name, values]) => [name, { step: name === 'cooldown' ? .01 : 1, tiers: values.map(n => [n, n]) }])) };
  if (catalog.traits.treasury_stock) {
    if (JSON.stringify(catalog.traits.treasury_stock) !== JSON.stringify(profile)) throw Error('宝库分阶已有其它配置，请合并后再生成');
    return;
  }
  fs.writeFileSync(file, text.replace(/"traits":\s*\{/, match => match + '\n    "treasury_stock": ' + JSON.stringify(profile) + ','));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  authorStockTiers();
  let checked = checkRuleSet(readRuleFiles()); if (!checked.ok) throw Error(checked.error);
  const ranked = id => createTraitValueEntry(checked.library, id, { tier: 1, random: () => .5 });
  const weapon = { id: 'treasury_sovereign_staff', name: '王权·天穹之钥',
    description: 'T1即可使用的宝库核心：固定容量40层，主动每次仅加1层，容量与手动加层量在所有阶级保持一致。自动叠层由独立的命中、暴击、击杀、消耗异常特性提供；本固定词条不提供自叠层。五条随机词条正常洗炼，洗掉补层特性会失去相应补层路径。',
    slot: 'weapon', rarity: 'legendary', level: 1, tier: 1, tags: ['物理', '闪电', '法杖'], skills: ['royal_treasury'],
    legendary: ranked('treasury_stock'), bases: [ranked('flat_physical'), ranked('proj_count')], traits: [] };
  fs.writeFileSync(path.join(RULES_DIR, 'Equipment/treasury_sovereign_staff.json'), JSON.stringify(weapon, null, 2) + '\n');
  const icon = ICON_ENTRIES.find(i => i.id === weapon.id && i.kind === 'equipment');
  fs.copyFileSync(path.join(TOOL_ROOT, 'public/assets/icons/warcraft-v1', icon.copyFrom), path.join(TOOL_ROOT, 'public', icon.src));
  const manifestFile = path.join(TOOL_ROOT, 'public/assets/icons/warcraft-v1/manifest.json'), manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  manifest.icons = ICON_ENTRIES; manifest.sheets = ICON_SHEETS; fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
  const files = readRuleFiles(); checked = checkRuleSet(files); if (!checked.ok) throw Error(checked.error);
  registerEquipmentDropLibrary(files, checked.library, checked.affixCategories);
  const preset = createRoyalSovereign(checked.library, checked.collections), folder = path.join(RULES_DIR, 'Presets'), indexPath = path.join(folder, 'index.json');
  const rows = JSON.parse(fs.readFileSync(indexPath, 'utf8')), at = rows.findIndex(row => row.id === ROYAL_SOVEREIGN.id);
  if (at < 0) rows.push(ROYAL_SOVEREIGN); else rows[at] = ROYAL_SOVEREIGN;
  fs.writeFileSync(path.join(folder, `${ROYAL_SOVEREIGN.id}.json`), JSON.stringify(preset, null, 2) + '\n');
  fs.writeFileSync(indexPath, JSON.stringify(rows, null, 2) + '\n');
  console.log('雷铸王权：全T1，一次启动加1层，真实命中/暴击/击杀/异常消费自叠层，上限40。');
}

// Upper-layer acquisition preview. Combat is entirely the skill's aggregated rules.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULES_DIR, TOOL_ROOT, readRuleFiles } from './rule-files.mjs';
import { checkRuleSet, equipmentRandom } from '../engine/index.mjs';
import { rollEquipment, registerEquipmentDropLibrary } from '../public/equipment-generation.mjs';
import { ICON_ENTRIES, ICON_SHEETS } from '../public/icon-catalog.mjs';

export const ROYAL_TREASURY = Object.freeze({ id: 'royal_treasury', name: '王之宝库',
  description: '普通T1王库之钥绑定王之宝库。施放增加1层，上限10层；按每秒期望数量逐枚随机出射，基础1层约2枚/秒、10层约11枚/秒，有疏有密。剑、弓、斧在头顶半球的随机位置穿出，每枚独立撑开朝向射击目标的金色法阵。任意层数停手5秒减第一层，随后每2秒减一层；再次施放加层并刷新等待，不重抽随机时钟。自动出射不续时，归零停止。多重、穿透、返回与地面交互仍由规则聚合，本场重开清空。' });

export function createRoyalTreasury(library, collections) {
  const item = rollEquipment(collections.equipment.get('royal_key').doc, library,
    { uid: 'royal_treasury_v1_weapon', rarity: 'common', tier: 1, random: equipmentRandom(207) });
  return { skills: ['royal_treasury', null, null, null], equipment: { weapon: item.uid }, instances: { [item.uid]: item }, belt: [],
    authored: { source: 'generated-trait-composition', family: 'royal_treasury', name: ROYAL_TREASURY.name, revision: 2 } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rows = { treasury_stock: ['special', 'prefix', '施放时收纳兵器并累计本人宝库库存。'],
    treasury_release: ['attack', 'prefix', '按库存从头顶半球法阵发射瞄准目标的真实物理投射物。'] };
  for (const [file, field, index] of [[path.join(RULES_DIR, 'Tags/affix_categories.json'), 'category', 0],
    [path.join(TOOL_ROOT, 'public/data/affix-positions.json'), 'position', 1]]) {
    const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const [id, row] of Object.entries(rows)) doc.traits[id] = { [field]: row[index], reason: row[2] };
    const lines = key => Object.entries(doc[key]).sort(([a], [b]) => a.localeCompare(b)).map(([id, row]) => `    ${JSON.stringify(id)}: ${JSON.stringify(row)}`).join(',\n');
    fs.writeFileSync(file, `{\n  "version": 1,\n  "traits": {\n${lines('traits')}\n  },\n  "affixes": {\n${lines('affixes')}\n  }\n}\n`);
  }
  for (const icon of ICON_ENTRIES.filter(icon => ['royal_treasury', 'royal_key'].includes(icon.id))) {
    fs.copyFileSync(path.join(TOOL_ROOT, 'public/assets/icons/warcraft-v1', icon.copyFrom), path.join(TOOL_ROOT, 'public', icon.src));
  }
  const manifestFile = path.join(TOOL_ROOT, 'public/assets/icons/warcraft-v1/manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')); manifest.icons = ICON_ENTRIES; manifest.sheets = ICON_SHEETS;
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
  const files = readRuleFiles(), checked = checkRuleSet(files); if (!checked.ok) throw Error(checked.error);
  registerEquipmentDropLibrary(files, checked.library, checked.affixCategories);
  const folder = path.join(RULES_DIR, 'Presets'), indexPath = path.join(folder, 'index.json');
  const presets = JSON.parse(fs.readFileSync(indexPath, 'utf8')), at = presets.findIndex(row => row.id === ROYAL_TREASURY.id);
  if (at < 0) presets.push(ROYAL_TREASURY); else presets[at] = ROYAL_TREASURY;
  fs.writeFileSync(path.join(folder, `${ROYAL_TREASURY.id}.json`), JSON.stringify(createRoyalTreasury(checked.library, checked.collections), null, 2) + '\n');
  fs.writeFileSync(indexPath, JSON.stringify(presets, null, 2) + '\n');
  console.log('王之宝库：10层维护 + 每秒期望逐枚随机出射 + 随机半球起点 + 停手5秒后每2秒衰减。');
}

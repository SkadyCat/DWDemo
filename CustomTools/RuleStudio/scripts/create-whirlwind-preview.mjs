// Authoring only: a plain weapon exposes the aggregated skill without hidden BD bonuses.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULES_DIR, readRuleFiles } from './rule-files.mjs';
import { checkRuleSet, equipmentRandom } from '../engine/index.mjs';
import { registerEquipmentDropLibrary, rollEquipment } from '../public/equipment-generation.mjs';

export const WHIRLWIND_PREVIEW = Object.freeze({ id: 'whirlwind_return', name: '游走旋风',
  description: '普通T1回风之杖绑定「创建旋风 + 投射物随机游走 + 接触地面 + 地面染色」。基础速度27米/秒，约每0.45至0.75秒随机转向，碰壁或到达12米活动边界折返，基础持续2秒。旋风是真实投射物，可聚合多重投射、投射物增伤、飞行速度、存在时间与碰撞半径；命中后继续飞行，同目标基础间隔0.5秒，同批命中上限与衰减仍生效。地面染色只改变外观。' });
export function createWhirlwindPreview(library, collections) {
  const item = rollEquipment(collections.equipment.get('gale_spindle').doc, library,
    { uid: 'whirlwind_return_v1_weapon', tier: 1, rarity: 'common', random: equipmentRandom(44) });
  return { skills: ['whirlwind', null, null, null], equipment: { weapon: item.uid }, instances: { [item.uid]: item }, belt: [],
    authored: { source: 'generated-trait-composition', family: 'whirlwind', name: WHIRLWIND_PREVIEW.name, revision: 4 } };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = readRuleFiles(), checked = checkRuleSet(files);
  if (!checked.ok) throw new Error(checked.error);
  registerEquipmentDropLibrary(files, checked.library, checked.affixCategories);
  const folder = path.join(RULES_DIR, 'Presets'), indexPath = path.join(folder, 'index.json');
  const rows = JSON.parse(fs.readFileSync(indexPath, 'utf8')), at = rows.findIndex(row => row.id === WHIRLWIND_PREVIEW.id);
  if (at < 0) rows.push(WHIRLWIND_PREVIEW); else rows[at] = WHIRLWIND_PREVIEW;
  fs.writeFileSync(path.join(folder, `${WHIRLWIND_PREVIEW.id}.json`), JSON.stringify(createWhirlwindPreview(checked.library, checked.collections), null, 2) + '\n');
  fs.writeFileSync(indexPath, JSON.stringify(rows, null, 2) + '\n');
  console.log('游走旋风：普通T1回风之杖，真实投射物，基础速度27米/秒。');
}

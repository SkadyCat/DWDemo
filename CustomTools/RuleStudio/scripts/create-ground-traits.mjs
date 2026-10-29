// Author only these ground traits and their upper-layer classification rows.
import fs from 'node:fs';
import path from 'node:path';
import { RULES_DIR, TOOL_ROOT, readRuleFiles } from './rule-files.mjs';
import { COMBAT_AFFIXES } from '../engine/combat-catalog.mjs';
import { checkRuleSet } from '../engine/index.mjs';
const rows = {
  hit_burning_ground: ['attack', 'prefix', '命中触发持续火焰伤害地面。'],
  hit_chilled_ground: ['special', 'prefix', '命中触发冰缓控制地面。'],
  hit_shocked_ground: ['special', 'prefix', '命中触发施加感电的地面。'],
  hit_poison_ground: ['attack', 'prefix', '命中触发持续施加中毒的地面。'],
  proj_ground_tint: ['special', 'suffix', '实际接触异常地面后改变投射物外观。'],
  hit_mirror_ground: ['special', 'prefix', '命中触发镜像地面，每次实际进入复制投射物。'],
  proj_ground_contact: ['special', 'suffix', '投射物实际进出地面，触发独立地面交互。'],
};
for (const id of Object.keys(rows)) {
  const [name, , spec, note] = COMBAT_AFFIXES.find(row => row[1] === id);
  fs.writeFileSync(path.join(RULES_DIR, 'Affixes', `${id}.json`), JSON.stringify({ id, name,
    description: `${name}。${note}`, params: spec.params, sheet: spec.sheet }, null, 2) + '\n');
}
for (const [file, field, index] of [[path.join(RULES_DIR, 'Tags/affix_categories.json'), 'category', 0],
  [path.join(TOOL_ROOT, 'public/data/affix-positions.json'), 'position', 1]]) {
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  delete doc.affixes.interval_whirlwind;
  for (const [id, row] of Object.entries(rows)) doc.traits[id] = { [field]: row[index], reason: row[2] };
  for (const [id, reason] of Object.entries({ cast_echo: '主动施加临时回响状态。', echo_once: '消耗状态后额外执行当前技能。', grant_echo: '装备授予回响主动装配资格。' })) doc.traits[id] = { [field]: field === 'category' ? 'special' : 'prefix', reason };
  const lines = key => Object.entries(doc[key]).sort(([a], [b]) => a.localeCompare(b)).map(([id, row]) => `    ${JSON.stringify(id)}: ${JSON.stringify(row)}`).join(',\n');
  fs.writeFileSync(file, `{\n  "version": 1,\n  "traits": {\n${lines('traits')}\n  },\n  "affixes": {\n${lines('affixes')}\n  }\n}\n`);
}
const checked = checkRuleSet(readRuleFiles()); if (!checked.ok) throw Error(checked.error);
console.log('五种命中触发地面与接触、染色特性已生成；数值使用现有十阶结构。');

// Author aura skills and their equipment acquisition using the existing sheet stats.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULES_DIR } from './rule-files.mjs';

const damage = [['fire', '火焰'], ['frost', '冰霜'], ['lightning', '闪电'], ['poison', '毒素'], ['physical', '物理'], ['void', '虚空']];
const resistance = damage.slice(0, 4);
export const auraSpecs = [
  ...damage.map(([element, name]) => ({ id: `aura_${element}`, name: `${name}光环`, slot: 'amulet',
    params: { amount: 8 }, sheet: [{ stat: `damage.flat.${element}`, value: { param: 'amount' } }],
    effect: `启用时，自身基础${name}伤害增加amount点，通过现有基础点伤聚合参与命中伤害。amount单位为点。` })),
  { id: 'aura_evasion', name: '闪避光环', slot: 'ring', params: { amount: 200 }, sheet: [{ stat: 'defense.evasion', value: { param: 'amount' } }],
    effect: '启用时，自身基础闪避值增加amount点，沿用现有闪避率换算与上限。amount单位为点。' },
  ...resistance.map(([element, name]) => ({ id: `aura_resist_${element}`, name: `${name}抗性光环`, slot: 'ring',
    params: { resistance: 25 }, modifiers: [{ target: 'element', element, stat: 'resistance', op: 'add', value: { param: 'resistance' } }],
    effect: `启用时，自身${name}抗性增加resistance个百分点，沿用现有抗性上限。resistance单位为百分点。` })),
  { id: 'aura_resist_all', name: '全抗光环', slot: 'ring', params: { resistance: 10 },
    modifiers: resistance.map(([element]) => ({ target: 'element', element, stat: 'resistance', op: 'add', value: { param: 'resistance' } })),
    effect: '启用时，自身火焰、冰霜、闪电、毒素抗性各增加resistance个百分点，沿用各自抗性上限。物理与虚空没有抗性，不额外创建。resistance单位为百分点。' },
  { id: 'aura_armour', name: '护甲光环', slot: 'ring', params: { amount: 300 }, sheet: [{ stat: 'defense.armour', value: { param: 'amount' } }],
    effect: '启用时，自身基础护甲增加amount点，沿用现有物理命中减伤公式。amount单位为点。' },
  { id: 'aura_shield', name: '护盾光环', slot: 'ring', params: { amount: 60 }, sheet: [{ stat: 'shield.base', value: { param: 'amount' } }],
    effect: '启用时，自身基础护盾增加amount点，沿用护盾增幅和回充；战斗中开启不立即恢复新增护盾。amount单位为点。' },
];
const seal = '光环装配到Q/E/F/G后按键切换，只对自身生效，不占主动槽。启用时封印总魔力上限的reservation_percent%，默认50%；各光环比例相加，超过100%不能开启。关闭或卸下授予装备解除封印，不立即回复魔力。封印不算消耗或恢复，不触发资源事件。reservation_percent单位为百分比，十阶默认固定50%。';
const write = (dir, doc) => fs.writeFileSync(path.join(RULES_DIR, dir, `${doc.id}.json`), JSON.stringify(doc, null, 2) + '\n');
export function createAuras() {
for (const spec of auraSpecs) {
  const effect = spec.effect.split('。')[0].replace(/amount|resistance/g, key => spec.params[key]) + '。';
  write('WebTraits', { id: spec.id, name: spec.name, description: spec.effect + seal,
    params: { ...spec.params, reservation_percent: 50 },
    sheet: [{ trigger: 'aura_skill' }, ...(spec.sheet || [])], ...(spec.modifiers ? { modifiers: spec.modifiers } : {}) });
  write('WebBuilds', { id: spec.id, name: spec.name,
    description: effect + 'Q/E/F/G装配与切换，仅对自身生效。启用封印总魔力上限的50%，关闭解除封印但不立即回复魔力；所有光环封印比例相加，不能超过100%。', active: spec.id, traits: [spec.id] });
  for (const slot of ['ring', 'amulet']) write('Equipment', { id: `${spec.id}_${slot}`, name: `${spec.name.replace('光环', '')}${slot === 'ring' ? '指环' : '护符'}`,
    description: `绑定「${spec.name}」。装备后在Q/E/F/G装配并切换；启用封印50%总魔力。品质与T阶词条正常随机生成；传奇品质固定增加投射物飞行速度。`,
    slot, rarity: 'common', level: 1, tier: 1, tags: [], skills: [spec.id], bases: ['mana_base'], legendary: 'proj_speed', traits: [] });
}
const file = path.join(RULES_DIR, 'WebTraits/vector_control.json'), vector = JSON.parse(fs.readFileSync(file, 'utf8'));
vector.params = { ...vector.params, reservation_percent: 50 };
vector.description = '启用时聚合投射物捕获特性。' + seal;
fs.writeFileSync(file, JSON.stringify(vector, null, 2) + '\n');
const buildFile = path.join(RULES_DIR, 'WebBuilds/vector_control.json'), build = JSON.parse(fs.readFileSync(buildFile, 'utf8'));
build.description = '光环 · Q/E/F/G开关。启用封印50%总魔力，20%概率捕获攻击自己的投射物，使其沿贝塞尔曲线弯曲回返，成为吃玩家投射物增幅的己方投射物。';
fs.writeFileSync(buildFile, JSON.stringify(build, null, 2) + '\n');
console.log(`Created ${auraSpecs.length} aura skills and ${auraSpecs.length * 2} equipment bases; existing vector aura reserves 50%.`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) createAuras();

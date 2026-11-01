// 万毒飞刃：词条组合示范 BD。技能（蝰蛇飞刃）本身只是扇形毒刃；
// 每个阶段只多一两条现有词条，技能形态就发生明显变化，并与伤害、清图效率联动。
// 阶段对应游玩时长：越往后需要的词条越稀有、T 阶越高，因此预设保留各自的 T 阶。
//   node scripts/create-venom-bd.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOL_ROOT, readRuleFiles } from './rule-files.mjs';

export const VENOM_GROUP = { id: 'venom_blades', name: '万毒飞刃' };

// Key lines (the build) vs. survival lines (filler every real item carries).
export const VENOM_STAGES = [
  { stage: 1, tier: 2, gradeName: 'Ⅰ · 连发', title: '开荒：更宽的扇面，连甩两轮',
    form: '扇面多一柄飞刀，每次施放连续甩出两轮。', link: '同一目标短时间内被多柄飞刀命中，中毒层数叠得更快，第一层就能稳定清怪。',
    key: { weapon: ['proj_count', 'proj_volleys'] },
    filler: { weapon: ['poison_chance', 'poison_increased'], boots: ['life_base', 'evasion'], ring: ['life_base'] } },
  { stage: 2, tier: 4, gradeName: 'Ⅱ · 连锁', title: '飞刀在敌人之间弹跳',
    form: '每柄飞刀命中后连锁到下一个敌人，一刀能扫过半个怪群。', link: '「对已中毒敌人额外附加层数」让连锁回来的飞刀不断叠毒：连锁越多，毒层越厚。',
    key: { weapon: ['proj_chain'], gloves: ['poison_extra_on_poisoned'] },
    filler: { gloves: ['life_on_kill', 'armour'], helmet: ['life_base', 'life_on_hit'] } },
  { stage: 3, tier: 6, gradeName: 'Ⅲ · 分裂', title: '飞刀命中即分裂，铺满屏幕',
    form: '每次命中分裂出新的飞刀，新飞刀继续连锁：同屏飞刀从十几柄变成几十柄。', link: '「击败中毒敌人时传播中毒」让没被刀碰到的敌人也开始掉血，清图效率翻倍。',
    key: { weapon: ['proj_split_on_hit'], gloves: ['poison_kill_spread'] },
    filler: { chest: ['life_base', 'life_increased', 'life_regen_percent'] } },
  { stage: 4, tier: 8, gradeName: 'Ⅳ · 引爆', title: '毒层被刀引爆，连环爆炸',
    form: '命中中毒敌人时引爆它身上的毒层，在怪群中炸开。', link: '引爆击杀会把毒层传给附近敌人，被传上毒的敌人又被下一柄飞刀引爆，形成连环反应。',
    key: { chest: ['poison_hit_detonate', 'poison_detonate_spread'] },
    filler: { belt: ['life_base', 'leech_life_all', 'poison_duration'] } },
  { stage: 5, tier: 10, gradeName: 'Ⅴ · 回旋', title: '连锁耗尽后飞刀折返，再扫一遍',
    form: '飞刀连锁打完后飞回身边，返程再次切过沿途所有敌人。', link: '每次返程命中都会再叠毒、再引爆；配合「每层中毒增伤」，毒层越厚伤害越高，毕业形态。',
    key: { helmet: ['proj_return_chain', 'proj_return_rehit'], offhand: ['poison_per_layer', 'poison_more'] },
    filler: { offhand: ['life_base'] } },
];

const BASES = { weapon: 'viperfang_knives', offhand: 'cinder_guard_offhand', helmet: 'cinder_guard_helmet', chest: 'cinder_guard_chest',
  gloves: 'bloodthirst_gauntlets', boots: 'warden_boots', belt: 'cinder_guard_belt', ring: 'aura_poison_ring' };
const SLOT_NAMES = { weapon: '蝰牙飞刀', offhand: '毒囊', helmet: '回旋冠', chest: '引爆衣', gloves: '叠毒护手', boots: '游猎靴', belt: '续命腰带', ring: '剧毒指环' };

/** Every line on every slot up to (and including) a stage; later stages keep earlier lines and raise their tier. */
export function venomLines(stageNumber) {
  const lines = {};
  for (const s of VENOM_STAGES.filter(s => s.stage <= stageNumber))
    for (const part of [s.key, s.filler]) for (const [slot, ids] of Object.entries(part)) for (const id of ids) {
      (lines[slot] ||= []).includes(id) || lines[slot].push(id);
    }
  return lines;
}

export function createVenomPreset(stageNumber, library, collections, deps) {
  const { createTraitValueEntry, validateTraitValueEntry, applyBuildPreset } = deps;
  const stage = VENOM_STAGES[stageNumber - 1];
  const keyIds = new Set(VENOM_STAGES.filter(s => s.stage <= stageNumber).flatMap(s => Object.values(s.key).flat()));
  const preset = { skills: ['viper_knives', null, null, null], equipment: {}, instances: {}, belt: [],
    authored: { source: 'affix-composition', family: VENOM_GROUP.id, name: `${VENOM_GROUP.name}·${stage.gradeName}`, revision: 1, keepTiers: true,
      keyLines: [...keyIds], newLines: Object.values(stage.key).flat() } };
  for (const [slot, ids] of Object.entries(venomLines(stageNumber))) {
    const base = collections.equipment.get(BASES[slot])?.doc;
    if (!base || base.slot !== slot) throw new Error(`万毒飞刃: 底材无效 ${BASES[slot]}`);
    const affixes = ids.map(id => {
      if (!library.trait(id)) throw new Error(`万毒飞刃: 未知词条 ${id}`);
      // Midpoint of the tier's value band: reproducible and representative.
      const entry = createTraitValueEntry(library, id, { tier: library.trait(id).source.params.size ? stage.tier : null, random: () => .5 });
      entry.with = [];
      const error = validateTraitValueEntry(library, entry);
      if (error) throw new Error(`万毒飞刃/${id}: ${error}`);
      return { id, name: library.traitDisplayName(id), ...(entry.tier ? { tier: entry.tier } : {}), traits: [entry] };
    });
    const uid = `venom_blades_${stageNumber}_${slot}`;
    preset.equipment[slot] = uid;
    preset.instances[uid] = { uid, baseId: base.id, name: `${VENOM_GROUP.name}·${SLOT_NAMES[slot]}`, slot, level: base.level, tier: stage.tier,
      rarity: affixes.length === 0 ? 'common' : affixes.length <= 2 ? 'magic' : 'rare', skill: base.skills?.[0] || '', affixes, legendary: null, identified: true };
  }
  const result = applyBuildPreset({ owned: { skill: {}, equipment: {}, item: {} }, instances: {}, loadout: {} }, preset, collections, library);
  if (result.error) throw new Error(`万毒飞刃 ${stage.gradeName}: ${result.error}`);
  return preset;
}

export function venomIndexRows(library) {
  const name = id => library.traitDisplayName(id);
  return VENOM_STAGES.map(s => ({
    id: `venom_blades_${s.stage}`, name: `${VENOM_GROUP.name}·${s.gradeName}`, group: VENOM_GROUP.id, groupName: `${VENOM_GROUP.name}（词条组合）`,
    grade: s.stage, gradeName: s.gradeName, mechanism: `新增：${Object.values(s.key).flat().map(name).join('；')}`,
    description: `${s.title}。形态：${s.form} 联动：${s.link} 装备 T${s.tier}。`,
  }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const engine = await import('../engine/index.mjs');
  const { applyBuildPreset } = await import('../public/build-presets.mjs');
  const check = engine.checkRuleSet(readRuleFiles());
  if (!check.ok) throw new Error(check.error);
  const deps = { ...engine, applyBuildPreset };
  const dir = path.join(TOOL_ROOT, '../../Content/Rules/Presets');
  for (const s of VENOM_STAGES) fs.writeFileSync(path.join(dir, `venom_blades_${s.stage}.json`), JSON.stringify(createVenomPreset(s.stage, check.library, check.collections, deps), null, 2) + '\n');
  const indexFile = path.join(dir, 'index.json');
  const index = JSON.parse(fs.readFileSync(indexFile, 'utf8')).filter(row => row.group !== VENOM_GROUP.id);
  index.unshift(...venomIndexRows(check.library));
  fs.writeFileSync(indexFile, JSON.stringify(index, null, 2) + '\n');
  console.log(`${VENOM_GROUP.name}：${VENOM_STAGES.length} 个阶段`);
}

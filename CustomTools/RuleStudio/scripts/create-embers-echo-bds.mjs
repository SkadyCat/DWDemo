import { minimumTierPreset } from '../public/build-preset-tier.mjs';
// Five strength grades of one legendary family. All combat comes from existing traits.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { referenceAffixPool } from './reference-affix-pool.mjs';
import { TOOL_ROOT, readRuleFiles } from './rule-files.mjs';
import { checkRuleSet, createTraitValueEntry, equipmentRandom, rollEquipmentDrop } from '../engine/index.mjs';
export const EMBERS_ECHO_GRADES = [
  ['回蓝循环', '恢复魔力触发烈焰爆发，减耗与冷却组成持续循环。'],
  ['范围重复', '保留回蓝循环，两条范围重复使每次爆发命中五次。'],
  ['密集穿透', '补齐第三条范围重复与两条间隔缩短，每次爆发密集命中七次，并获得首条30火抗穿透。'],
  ['点伤增幅', '新增三条基础火焰伤害、50%火焰增伤与第二条30火抗穿透。'],
  ['乘区爆发', '补齐触发与范围伤害乘区及触发伤害，形成最终爆发。'],
].map(([mechanism, description], index) => ({
  grade: index + 1, id: `embers_echo_${index + 1}`, name: `余烬回响·${['Ⅰ','Ⅱ','Ⅲ','Ⅳ','Ⅴ'][index]}阶`,
  gradeName: `${['Ⅰ','Ⅱ','Ⅲ','Ⅳ','Ⅴ'][index]}阶`, mechanism, description,
}));
const names = { weapon:'焰核法杖', helmet:'鸣焰冠', chest:'烬织长衣', gloves:'叠焰护手', boots:'疾火靴' };
export const EMBERS_ECHO_LEGENDARIES = { weapon:'trig_mana_restored', helmet:'trigger_resource_reduction', chest:'trigger_resource_reduction', gloves:'life_regen_percent', boots:'armour' };
const fixedBases = {
  weapon: ['flat_fire', 'trigger_cooldown_flat', 'trigger_resource_reduction'],
  helmet: ['shield_base'], chest: ['shield_base'],
  gloves: ['armour', 'life_base', 'life_increased'],
  boots: ['evasion', 'fire_resistance', 'frost_resistance', 'lightning_resistance', 'poison_resistance'],
};
// A grade adds existing trait entries. Reused entries keep identical ranks and values.
const additions = {
  2: { weapon:['area_repeats'], helmet:['area_repeats'] },
  3: { weapon:['area_repeat_interval','area_delay'], helmet:['area_repeat_interval'], chest:['area_repeats'], gloves:['fire_pen'] },
  4: { helmet:['fire_base'], chest:['fire_base'], gloves:['fire_base','inc_fire'], boots:['fire_pen'] },
  5: { helmet:['trigger_more','area_more'], chest:['trigger_more','area_more','trigger_damage'] },
};

export function createEmbersEchoEquipment(library, collections) {
  const value = id => {
    const next = createTraitValueEntry(library, id, { tier: library.trait(id).source.params.size ? 1 : null, random: () => .5 });
    if (id === 'trig_mana_restored') next.with = [createTraitValueEntry(library, 'create_flame_burst', {tier:1,random:()=>0})];
    return next;
  };
  const result = [];
  for (const grade of EMBERS_ECHO_GRADES) for (const slot of Object.keys(names)) {
    const bases = [...fixedBases[slot]];
    if (slot === 'helmet') bases.push('trigger_store_event');
    for (let stage = 2; stage <= grade.grade; stage++) bases.push(...(additions[stage][slot] || []));
    const fixed = value(EMBERS_ECHO_LEGENDARIES[slot]);
    result.push({ id:`embers_echo_${grade.grade}_${slot}`, name:`余烬回响·${names[slot]}·${grade.gradeName}`,
      description:`余烬回响${grade.gradeName}：${grade.mechanism}。${grade.description} 五档装备均为 T1，同名固有词条的数值完全一致，按联动机制逐档补齐。必要词条置于固定基底与单条传奇词缀；下方五条正常随机。每层手动施放两次烈焰爆发启动。`,
      slot, rarity:'legendary', level:1, tier:1, tags:['火焰','范围'], skills:slot==='weapon'?['flame_burst']:[],
      legendary:fixed, traits:[structuredClone(fixed)], bases:bases.map(value) });
  }
  return result;
}

export const EMBERS_ECHO_EXCLUDED_AFFIXES = Object.freeze(['area_to_ring','area_to_sector','area_at_self']);
export const EMBERS_ECHO_STAGE_ROLLS = [
  { rolls:0, seeds:{}, required:[] },
  { rolls:45, seeds:{chest:999}, required:[{slot:'chest',affix:'more_elemental',family:'elemental',expected:45}] },
  { rolls:1099, seeds:{chest:999,weapon:3071,helmet:2179}, required:[{slot:'chest',affix:'more_elemental',family:'elemental',expected:45},{slot:'weapon',affix:'area_hit_mana',family:'offense',expected:279},{slot:'helmet',affix:'trigger_repeat',family:'',expected:775}] },
  { rolls:1331, seeds:{chest:999,weapon:3071,helmet:2179,gloves:1235,boots:712}, required:[{slot:'chest',affix:'more_elemental',family:'elemental',expected:45},{slot:'weapon',affix:'area_hit_mana',family:'offense',expected:279},{slot:'helmet',affix:'trigger_repeat',family:'',expected:775},{slot:'gloves',affix:'life_added_fire',family:'elemental',expected:45},{slot:'boots',affix:'trigger_cooldown_recovery',family:'vitality',expected:187}] },
].map(stage => Object.freeze(stage));
EMBERS_ECHO_STAGE_ROLLS.push(Object.freeze({ ...EMBERS_ECHO_STAGE_ROLLS[3] }));

export function createEmbersEchoPreset(library, collections, grade, seed = null) {
  const pool = referenceAffixPool(library);
  const config = EMBERS_ECHO_GRADES.find(row => row.grade === grade);
  if (!config) throw new Error('余烬回响强度仅有1至5阶');
  const staged = seed === null, stage = EMBERS_ECHO_STAGE_ROLLS[grade - 1];
  const random = equipmentRandom(seed ?? 1), preset = {skills:['flame_burst',null,null,null],equipment:{},instances:{},belt:[],
    authored:{source:'generated-existing-traits',family:'embers_echo',name:config.name,grade,mechanism:config.mechanism,startupCasts:2,seed:staged?{base:1,overrides:{...stage.seeds}}:(seed??1),expectedTargetRolls:staged?stage.rolls:undefined,requiredAffixes:staged?stage.required.map(row=>({...row})):undefined,excludedAffixes:staged?[...EMBERS_ECHO_EXCLUDED_AFFIXES]:undefined,revision:staged?5:2}};
  for (const slot of Object.keys(names)) {
    const id=`embers_echo_${grade}_${slot}`, doc=collections.equipment.get(id)?.doc;
    if (!doc) throw new Error(`缺少传奇底材 ${id}`);
    const uid=`legendary_embers_echo_${staged?'v5':'v2'}_${grade}_${slot}`;
    let item=rollEquipmentDrop({equipment:new Map([[id,{doc}]])},library,{chance:1,rarity:'legendary',tier:10,maxTier:10,random,uid,pool});
    if (staged && stage.seeds[slot] !== undefined) item=rollEquipmentDrop({equipment:new Map([[id,{doc}]])},library,{chance:1,rarity:'legendary',tier:10,maxTier:10,random:equipmentRandom(stage.seeds[slot]),uid,pool});
    preset.equipment[slot]=uid; preset.instances[uid]=item;
  }
  return minimumTierPreset(preset, library);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let check=checkRuleSet(readRuleFiles()); if(!check.ok)throw Error(check.error);
  const rules=path.join(TOOL_ROOT,'../../Content/Rules');
  for(const doc of createEmbersEchoEquipment(check.library,check.collections))fs.writeFileSync(path.join(rules,'Equipment',doc.id+'.json'),JSON.stringify(doc,null,2)+'\n');
  check=checkRuleSet(readRuleFiles()); if(!check.ok)throw Error(check.error);
  const indexPath=path.join(rules,'Presets/index.json'),index=JSON.parse(fs.readFileSync(indexPath,'utf8'));
  const insertion=index.findIndex(row=>row.id==='autocast_mana_restored'||row.group==='embers_echo');
  const retained=index.filter(row=>row.id!=='autocast_mana_restored'&&row.group!=='embers_echo');
  const entries=[];
  for(const config of EMBERS_ECHO_GRADES){
    fs.writeFileSync(path.join(rules,'Presets',config.id+'.json'),JSON.stringify(createEmbersEchoPreset(check.library,check.collections,config.grade),null,2)+'\n');
    entries.push({id:config.id,name:config.name,group:'embers_echo',groupName:'余烬回响',grade:config.grade,gradeName:config.gradeName,mechanism:config.mechanism,
      description:`${config.description} 五档均为 T1，同名固有词条数值相同。每层手动施放两次烈焰爆发启动；只要求累计关键词条，其他随机词条不限。指定单条洗炼累计期望约 ${EMBERS_ECHO_STAGE_ROLLS[config.grade-1].rolls} 次，不含底材、预兆和非关键词条成本。`});
  }
  retained.splice(Math.max(0,insertion),0,...entries);fs.writeFileSync(indexPath,JSON.stringify(retained,null,2)+'\n');
  console.log('余烬回响：5档 × 5件传奇，普通掉落生成器生成随机词缀。');
}

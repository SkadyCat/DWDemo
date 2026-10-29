// Studio authoring catalogue. Creates ordinary equipment and ground loot, never combat rules.
import catalogue from './data/trait-equipment.json' with { type: 'json' };
import { rollEquipment } from './equipment-generation.mjs';
import { equipmentAffixPool } from '../engine/equipment.mjs';

export const TRAIT_EQUIPMENT = Object.freeze(catalogue.map(entry=>Object.freeze({...entry})));
export function createTraitEquipment(id,collections,library,{uid=`trait_${crypto.randomUUID()}`}={}) {
  const entry=TRAIT_EQUIPMENT.find(row=>row.id===id);
  if(!entry)throw Error('未知特质装备');
  const template=collections?.equipment?.get(entry.baseId)?.doc;
  if(!template?.skills?.includes(entry.skill))throw Error('特质装备的底材或绑定技能不可用');
  const affix=equipmentAffixPool(library).find(row=>row.id===entry.affix);
  if(!affix)throw Error('特质装备的固定词缀不可用');
  // These are authored T1 showcase values. A private deterministic roll creates one
  // legal magic affix and normal bases without advancing either battle/drop RNG.
  const item=rollEquipment(template,library,{uid,tier:entry.tier,rarity:entry.rarity,random:()=>0,pool:[affix]});
  item.name=entry.name;
  return item;
}

export function dropTraitEquipment(id,battle,collections,library) {
  const hero=battle?.hero,rewards=battle?.rewards;
  if(!hero||!Array.isArray(rewards?.ground))return {error:'战场尚未准备好'};
  if(hero.dead)return {error:'倒下时无法生成装备'};
  if(!Number.isFinite(hero.x)||!Number.isFinite(hero.y))return {error:'地面位置无效'};
  let item;try{item=createTraitEquipment(id,collections,library);}catch(error){return {error:error.message};}
  const angle=rewards.ground.filter(drop=>drop.origin==='catalogue').length*2.3999632297;
  const drop={key:`catalogue_${item.uid}`,origin:'catalogue',kind:'equipment',item,id:item.uid,
    name:item.name,rarity:item.rarity,tier:item.tier,count:1,claimed:false,
    sourceX:hero.x,sourceY:hero.y,x:hero.x+Math.cos(angle)*100,y:hero.y+Math.sin(angle)*100};
  rewards.ground.push(drop);
  return {drop};
}

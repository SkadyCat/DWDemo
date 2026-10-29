// Studio3D encounter prototype. Acquisition transactions reuse the existing rules.
import { isFixedEquipmentSlot } from '../engine/equipment-slots.mjs';
const copy = value => JSON.parse(JSON.stringify(value));
const locks=new WeakMap();
export const setEventLocks=(state,ids)=>locks.set(state,new Set(ids.filter(Boolean)));
export const eventLocked=(state,uid)=>locks.get(state)?.has(uid)||false;
export const legendaryLines = item => [...(item?.legendary ? [item.legendary] : []), ...(item?.extraLegendary || [])];
export const fusionLines = item => [...legendaryLines(item).map(affix => ({ affix, fixed: true })), ...(item?.affixes || []).map(affix => ({ affix, fixed: false }))];
export function fusionError(state, left, right) {
  if (!left || !right) return '请将两件装备分别放入左右格子';
  if (left === right) return '同一件装备不能重复放入';
  const a=state.instances[left], b=state.instances[right];
  if (!a || !b) return '装备已不在背包中';
  if ([a,b].some(item=>item.identified===false || isFixedEquipmentSlot(item.slot))) return '只能放入已鉴定的角色装备';
  if (Object.values(state.loadout.equipment).some(uid=>uid===left || uid===right)) return '请先卸下正在穿戴的装备';
  if (a.slot!==b.slot) return '左右装备必须属于同一部位';
  return '';
}
function draw(lines,random) {
  const pool=[...lines], count=Math.floor(random()*(pool.length+1)), result=[];
  for(let i=0;i<count;i++) result.push(pool.splice(Math.floor(random()*pool.length),1)[0]);
  return result;
}
export function fuseEquipment(state, left, right, {random=Math.random,uid=()=>`eq_${crypto.randomUUID()}`}={}) {
  const error=fusionError(state,left,right); if(error)return {error};
  const a=state.instances[left],b=state.instances[right];
  const fromLeft=draw(fusionLines(a),random),fromRight=draw(fusionLines(b),random),lines=[...fromLeft,...fromRight];
  const fixed=lines.filter(line=>line.fixed).map(line=>copy(line.affix));
  const result={...copy(a),uid:uid(),synthesized:true,legendary:fixed[0]||null,extraLegendary:fixed.slice(1),affixes:lines.filter(line=>!line.fixed).map(line=>copy(line.affix))};
  delete result.reforgeTargets;
  if(!result.uid || state.instances[result.uid])return {error:'结果标识冲突，请重试'};
  // Commit only after both inputs and the entire output have been validated.
  delete state.instances[left];delete state.instances[right];state.instances[result.uid]=result;
  return {result,fromLeft:fromLeft.length,fromRight:fromRight.length,fixed:fixed.length};
}
// Craft on a private transaction state. Only the resulting equipment is committed;
// the real wallet, currency counts and belt never change.
export function freeAltarCraft(state,uid,currencyId,craft,collections,library,tags,{index=null,random=Math.random}={}) {
  if(!state.instances[uid])return {error:'装备已不在法坛中'};
  const isolated={instances:{[uid]:copy(state.instances[uid])},owned:{item:{[currencyId]:1}},loadout:{belt:[]}};
  const result=craft(isolated,uid,{currencyId,index,random},collections,library,tags);
  if(!result.error)state.instances[uid]=isolated.instances[uid];
  return result;
}

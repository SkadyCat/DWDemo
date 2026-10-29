import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readRuleFiles} from '../scripts/rule-files.mjs';
import {checkRuleSet} from '../engine/index.mjs';
import {rollEquipment,equipmentDocument,ensureEquipmentInherentTraits,equipmentRandom} from '../engine/equipment.mjs';
import {craftEquipment} from '../public/equipment-crafting.mjs';
import {fusionError,fuseEquipment,freeAltarCraft,legendaryLines,setEventLocks,eventLocked} from '../public/map-events-model.mjs';
const loaded=checkRuleSet(readRuleFiles());assert.ok(loaded.ok,loaded.error);
const {collections,library,tags}=loaded;
const templates=[...collections.equipment.values()].map(e=>e.doc).filter(d=>d.slot==='weapon'&&d.rarity==='legendary');
function fixture(){const a=rollEquipment(templates[0],library,{uid:'left',tier:2,random:equipmentRandom(1)}),b=rollEquipment(templates[1],library,{uid:'right',tier:1,random:equipmentRandom(2)});return {instances:{left:a,right:b},owned:{item:{}},loadout:{equipment:{},belt:[]}};}
test('fusion consumes two distinct items atomically, inherits left base, tier and skill, preserves multiple legendary values',()=>{
 const state=fixture(),left=structuredClone(state.instances.left),right=structuredClone(state.instances.right);
 const result=fuseEquipment(state,'left','right',{random:()=>.999,uid:()=> 'new'});
 assert.equal(result.error,undefined);assert.deepEqual(Object.keys(state.instances),['new']);
 for(const key of ['baseId','slot','skill','tier','bases'])assert.deepEqual(result.result[key],left[key]);
 assert.deepEqual(legendaryLines(result.result),[left.legendary,right.legendary]);
 const doc=equipmentDocument(result.result,collections);for(const affix of legendaryLines(result.result))for(const trait of affix.traits)assert.ok(doc.traits.some(t=>t.id===trait.id));
 const reloaded=JSON.parse(JSON.stringify(result.result));ensureEquipmentInherentTraits(reloaded,templates[0],library);assert.deepEqual(reloaded,result.result);
 assert.match(fuseEquipment(state,'left','right').error,/背包/);
});
test('zero drawn affixes stay empty after save and inherent-trait reconciliation',()=>{
 const state=fixture(),result=fuseEquipment(state,'left','right',{random:()=>0,uid:()=> 'empty'}).result;
 assert.equal(result.legendary,null);assert.equal(result.affixes.length,0);
 const saved=JSON.parse(JSON.stringify(result));ensureEquipmentInherentTraits(saved,templates[0],library);assert.deepEqual(saved,result);
});
test('invalid duplicate, equipped, mismatched slot and uid collision never consume input',()=>{
 const state=fixture(),before=JSON.stringify(state);
 assert.ok(fusionError(state,'left','left'));state.loadout.equipment.weapon='left';assert.ok(fusionError(state,'left','right'));delete state.loadout.equipment.weapon;
 state.instances.right.slot='boots';assert.ok(fusionError(state,'left','right'));state.instances.right.slot='weapon';
 assert.ok(fuseEquipment(state,'left','right',{uid:()=> 'left'}).error);assert.equal(JSON.stringify(state),before);
 setEventLocks(state,['left']);assert.ok(eventLocked(state,'left'));setEventLocks(state,[]);assert.equal(eventLocked(state,'left'),false);
});
test('free altar uses existing currency effect repeatedly without changing actual materials or belt',()=>{
 const state=fixture(),currency=[...collections.item.values()].map(e=>e.doc).find(d=>d.craft?.op==='roll_affixes');assert.ok(currency);
 state.owned.item[currency.id]=7;state.loadout.belt=[currency.id];const wallet=JSON.stringify([state.owned,state.loadout]);
 for(let i=0;i<30;i++){const result=freeAltarCraft(state,'left',currency.id,craftEquipment,collections,library,tags,{random:equipmentRandom(i+1)});assert.equal(result.error,undefined);assert.equal(state.instances.left.affixes.length,currency.craft.count);}
 assert.equal(JSON.stringify([state.owned,state.loadout]),wallet);
});
test('prototype layout authors two equipment input buttons and an actual backpack canvas in UICreator',()=>{
 const doc=JSON.parse(fs.readFileSync(new URL('../public/ui/map-events.uialpha.json',import.meta.url)));const all=[];const visit=n=>{all.push(n);n.children?.forEach(visit);};visit(doc.root);
 assert.deepEqual(all.filter(n=>n.action?.op==='slot').map(n=>n.action.value),[0,1]);assert.equal(all.find(n=>n.id==='event-bag').type,'CanvasPanel');
 const bag=all.find(n=>n.id==='event-bag'),backpack=all.find(n=>n.id==='event-backpack'),panel=all.find(n=>n.id==='event-panel');
 assert.ok(backpack.slot.offsets.left+backpack.slot.offsets.right<panel.slot.offsets.left,'backpack is a separate left panel');assert.equal(bag.source.grid.columns,8);
 assert.equal(bag.source.reusedPrefab,'battle-prefab-item-cell');assert.ok(doc.prefabs['battle-prefab-item-cell']);
});
test('multiple inherited legendary affixes survive free crafting with no currency in the actual bag',()=>{
 const state=fixture(),item=fuseEquipment(state,'left','right',{random:()=>.999,uid:()=> 'fused'}).result;
 const fixed=structuredClone(legendaryLines(item));const currency=[...collections.item.values()].map(e=>e.doc).find(d=>d.craft?.op==='roll_affixes');
 const result=freeAltarCraft(state,'fused',currency.id,craftEquipment,collections,library,tags);
 assert.equal(result.error,undefined);assert.deepEqual(legendaryLines(state.instances.fused),fixed);assert.deepEqual(state.owned.item,{});
});

test('single-affix altar fixes the selected line while preserving other lines, legendary and real currency',()=>{
 const state=fixture(),item=state.instances.left;assert.ok(item.affixes.length>1);
 const currency=collections.item.get('chaos_orb').doc;state.owned.item[currency.id]=5;state.loadout.belt=[currency.id];
 const before=structuredClone(item),wallet=JSON.stringify([state.owned,state.loadout]),index=1;
 for(let i=0;i<5;i++){
  const result=freeAltarCraft(state,'left',currency.id,craftEquipment,collections,library,tags,{index,random:equipmentRandom(i+41)});assert.equal(result.error,undefined);
  assert.deepEqual(state.instances.left.legendary,before.legendary);
  for(let k=0;k<item.affixes.length;k++)if(k!==index)assert.deepEqual(state.instances.left.affixes[k],before.affixes[k]);
 }
 const saved=JSON.stringify(state.instances.left);assert.ok(freeAltarCraft(state,'left',currency.id,craftEquipment,collections,library,tags,{index:0}).error);
 assert.equal(JSON.stringify(state.instances.left),saved);assert.equal(JSON.stringify([state.owned,state.loadout]),wallet);
});

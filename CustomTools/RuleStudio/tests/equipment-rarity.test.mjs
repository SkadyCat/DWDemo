import test from 'node:test';
import assert from 'node:assert/strict';
import { readBaselineRuleFiles } from './rule-fixture.mjs';
import { checkRuleSet, createProgression, rollEquipment, equipmentRandom, equipmentRarity, normalizeEquipmentRarity, addEquipmentAffixes, rollEquipmentAffixes, removeEquipmentAffixes, equipmentDocument, craftEquipment, FloorRewards } from '../engine/index.mjs';
import { cleanPlayerInventory } from '../public/player-storage.mjs';
import { inventoryEntries } from '../public/battle-panels.mjs';
import { applyBuildPreset } from '../public/build-presets.mjs';
const checked=checkRuleSet(readBaselineRuleFiles());assert.ok(checked.ok,checked.error);
const {collections,library,tags}=checked,template=collections.equipment.get('gale_spindle').doc;
const make=(rarity='common')=>rollEquipment(template,library,{uid:'rarity_staff',rarity,tier:1,random:equipmentRandom(41)});
const options={random:equipmentRandom(71)};

test('quality follows explicit line count, excludes bases and skills, and counts a composite affix once',()=>{
 const item=make();assert.equal(item.bases.length,2);assert.equal(item.skill,'whirlwind');
 for(const [count,expected] of [[0,'common'],[1,'magic'],[2,'magic'],[3,'rare'],[4,'rare'],[6,'rare'],[8,'rare']]){
  const value={...item,rarity:'common',affixes:Array.from({length:count},(_,i)=>({id:String(i),traits:[{id:'physical_damage'},{id:'chill'}]}))};
  assert.equal(equipmentRarity(value),expected);assert.equal(normalizeEquipmentRarity(value).rarity,expected);
 }
 assert.equal(equipmentRarity({...item,rarity:'legendary'}),'common');
 assert.equal(equipmentRarity({...item,extraLegendary:[{id:'fixed',traits:[]}]}),'legendary');
 assert.equal(equipmentRarity({...item,identified:false,rarity:'rare',affixes:[]}),'rare');
});

test('adding, replacing and removing affixes update quality at every boundary without rerolling bases or identity',()=>{
 let item=make();const bases=structuredClone(item.bases),before=structuredClone(item);
 for(const expected of ['magic','magic','rare']){item=addEquipmentAffixes(item,library,{count:1,...options});assert.equal(item.rarity,expected);assert.deepEqual(item.bases,bases);assert.equal(item.uid,before.uid);}
 item=removeEquipmentAffixes(item,{count:1,...options});assert.equal(item.rarity,'magic');
 item=removeEquipmentAffixes(item,{count:2,...options});assert.equal(item.rarity,'common');
 item=rollEquipmentAffixes(item,library,{count:4,...options});assert.equal(item.rarity,'rare');
 item=rollEquipmentAffixes(item,library,{count:1,...options});assert.equal(item.rarity,'magic');
 assert.deepEqual(item.bases,bases);assert.equal(item.skill,before.skill);assert.equal(before.affixes.length,0);
});

test('fixed legendary payloads retain legendary quality regardless of random line count',()=>{
 let item=make('legendary');const fixed=structuredClone(item.legendary);
 item=removeEquipmentAffixes(item,{count:item.affixes.length,...options});assert.equal(item.rarity,'legendary');assert.deepEqual(item.legendary,fixed);
 item=rollEquipmentAffixes(item,library,{count:1,...options});assert.equal(item.rarity,'legendary');assert.deepEqual(item.legendary,fixed);
});

test('legacy four-affix common equipment is repaired on load without changing its rolled content or loadout',()=>{
 const state=createProgression(collections,library),item=rollEquipmentAffixes(make(),library,{count:4,...options});item.rarity='common';
 state.instances[item.uid]=item;state.loadout.equipment.weapon=item.uid;
 const before=structuredClone(state),saved=JSON.parse(JSON.stringify(state));
 assert.equal(inventoryEntries(state,collections).find(row=>row.id===item.uid).rarity,'rare');assert.equal(item.rarity,'common','read-only projections do not mutate the save');
 cleanPlayerInventory(saved,collections,library);assert.equal(saved.instances[item.uid].rarity,'rare');
 before.instances[item.uid].rarity='rare';assert.deepEqual(saved.instances,before.instances);assert.deepEqual(saved.loadout,before.loadout);
 assert.equal(equipmentDocument(saved.instances[item.uid],collections).rarity,'rare');
});

test('crafting commits the derived quality and failed crafting leaves inventory untouched',()=>{
 const state=createProgression(collections,library);state.instances.rarity_staff=make();state.owned.item.quad_affix_orb=1;
 const result=craftEquipment(state,'rarity_staff',{currencyId:'quad_affix_orb',...options},collections,library,tags);
 assert.equal(result.error,undefined);assert.equal(result.after.rarity,'rare');assert.equal(state.instances.rarity_staff.rarity,'rare');
 const before=structuredClone(state);assert.ok(craftEquipment(state,'rarity_staff',{currencyId:'quad_affix_orb',...options},collections,library,tags).error);assert.deepEqual(state,before);
});

test('legacy preset metadata is corrected transactionally while its actual affixes remain identical',()=>{
 const item=rollEquipmentAffixes(make(),library,{count:4,...options});item.rarity='common';
 const preset={skills:['whirlwind'],equipment:{weapon:item.uid},belt:[],instances:{[item.uid]:item}},state=createProgression(collections,library);
 assert.equal(applyBuildPreset(state,preset,collections,library).error,'');assert.equal(state.instances[item.uid].rarity,'rare');assert.equal(item.rarity,'common');
 assert.deepEqual(state.instances[item.uid].affixes,item.affixes);assert.deepEqual(state.instances[item.uid].bases,item.bases);
});

test('dropping and picking up stale-quality equipment keeps the corrected ground rarity and exact rolled content',()=>{
 const state=createProgression(collections,library),item=rollEquipmentAffixes(make(),library,{count:4,...options});item.rarity='common';
 state.instances[item.uid]=item;const before=structuredClone(item),hero={x:0,y:0,dead:false};
 const rewards=new FloorRewards(collections,library,checked.catalog),result=rewards.dropInventory(state,{kind:'equipment',id:item.uid},hero);
 assert.equal(result.error,undefined);assert.equal(result.drop.rarity,'rare');assert.equal(result.drop.item.rarity,'rare');
 assert.deepEqual(result.drop.item.affixes,before.affixes);assert.deepEqual(result.drop.item.bases,before.bases);
 assert.equal(rewards.pickup(result.drop.key,state,hero).error,undefined);assert.equal(state.instances[item.uid].rarity,'rare');
 assert.deepEqual(state.instances[item.uid].affixes,before.affixes);
});

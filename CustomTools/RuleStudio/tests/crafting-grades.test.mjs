import test from 'node:test';
import assert from 'node:assert/strict';
import {readBaselineRuleFiles} from './rule-fixture.mjs';
import {checkRuleSet,createProgression,rollEquipment,equipmentRandom,craftEquipment,craftTargetError,reforgeTargetGrade,parseCollection,serializeCollection} from '../engine/index.mjs';
import {applyBuildPreset} from '../public/build-presets.mjs';

const check=checkRuleSet(readBaselineRuleFiles());assert.ok(check.ok,check.error);
const {collections,library,tags}=check,ids=['chaos_orb','spirit_stone_mid','spirit_stone_high'];
const clone=v=>JSON.parse(JSON.stringify(v));
const fresh=()=>{const p=createProgression(collections,library);p.instances.starter_weapon=rollEquipment(collections.equipment.get('frostthorn_staff').doc,library,{uid:'starter_weapon',rarity:'legendary',tier:7,random:equipmentRandom(3)});for(const id of [...ids,'quad_affix_orb'])p.owned.item[id]=10;return p};
const craft=(p,grade,index,extra={})=>craftEquipment(p,'starter_weapon',{currencyId:ids[grade-1],index,random:equipmentRandom(34+index),...extra},collections,library,tags);

test('灵石: three grades are authored collection data and schema rejects invalid grades',()=>{
  for(const [i,name] of ['下品灵石','中品灵石','上品灵石'].entries()){
    const d=collections.item.get(ids[i]).doc;assert.equal(d.name,name);assert.deepEqual(d.craft,{op:'reroll',grade:i+1});assert.deepEqual(parseCollection('item',serializeCollection('item',d)).doc,d);
    for(const grade of [0,4,1.5])assert.ok(parseCollection('item',{...d,craft:{op:'reroll',grade}}).error);
  }
});

test('灵石: choose arbitrary lines in order, then each grade only rerolls its own selected line',()=>{
  const p=fresh(),targets=[4,0,3],original=clone(p.instances.starter_weapon);assert.equal(original.affixes.length+1,6);
  for(const [i,index] of targets.entries()){
    const before=clone(p.instances.starter_weapon),r=craft(p,i+1,index);assert.ifError(r.error||null);assert.deepEqual(r.changed,[index]);assert.deepEqual(r.after.reforgeTargets,targets.slice(0,i+1));
    assert.equal(reforgeTargetGrade(r.after,index),i+1);assert.equal(p.owned.item[ids[i]],9);assert.deepEqual(r.after.affixes.filter((_,n)=>n!==index),before.affixes.filter((_,n)=>n!==index));
    assert.deepEqual(r.after.bases,original.bases);assert.deepEqual(r.after.legendary,original.legendary);assert.equal(r.after.tier,original.tier);
  }
  for(const [i,index] of targets.entries()){const r=craft(p,i+1,index);assert.ifError(r.error||null);assert.deepEqual(r.after.reforgeTargets,targets);assert.equal(p.owned.item[ids[i]],8)}
  for(const [i,id] of ids.entries())for(let index=0;index<5;index++)if(index!==targets[i]){
    const before=clone(p);assert.ok(craft(p,i+1,index).error);assert.deepEqual(p,before);assert.ok(craftTargetError(p.instances.starter_weapon,collections.item.get(id).doc,index));
  }
});

test('灵石: cannot skip grades or reroll all; rejected attempts spend neither currency nor omen',()=>{
  const p=fresh();p.owned.item.omen_elemental=1;
  for(const [grade,index] of [[2,3],[3,1],[1,null],[1,-1],[1,5]]){const before=clone(p);assert.ok(craft(p,grade,index,{omenId:'omen_elemental'}).error);assert.deepEqual(p,before)}
  assert.ifError(craft(p,1,2).error||null);const before=clone(p);assert.ok(craft(p,1,1).error);assert.deepEqual(p,before);
});

test('灵石: binding persists through JSON save/load and repeat rerolls never open another line',()=>{
  let p=fresh();assert.ifError(craft(p,1,4).error||null);p=clone(p);assert.ifError(craft(p,1,4).error||null);
  const before=clone(p);assert.ok(craft(p,1,2).error);assert.deepEqual(p,before);assert.ifError(craft(p,2,1).error||null);assert.deepEqual(p.instances.starter_weapon.reforgeTargets,[4,1]);
});

test('灵石: omen applies to one selected line; failed generation does not bind or consume',()=>{
  const p=fresh(),omen=[...collections.item.values()].map(e=>e.doc).find(d=>d.id==='omen_elemental');p.owned.item[omen.id]=1;
  const before=clone(p.instances.starter_weapon),r=craft(p,1,2,{omenId:omen.id});assert.ifError(r.error||null);assert.deepEqual(r.after.reforgeTargets,[2]);assert.equal(p.owned.item[omen.id],undefined);assert.deepEqual(r.after.affixes.filter((_,i)=>i!==2),before.affixes.filter((_,i)=>i!==2));
  const q=fresh();q.owned.item.omen_empty=1;const c={...collections,item:new Map(collections.item)};c.item.set('omen_empty',{doc:{id:'omen_empty',category:'omen',tags:['empty']}});const t={familiesOf:()=>[],collectionFamilies:()=>({families:['empty']}),familyName:()=>''},snapshot=clone(q);
  assert.ok(craftEquipment(q,'starter_weapon',{currencyId:ids[0],index:2,omenId:'omen_empty'},c,library,t).error);assert.deepEqual(q,snapshot);
});

test('陨星石: four fresh random lines clear old bindings and allow three new choices',()=>{
  const p=fresh();for(const [i,index] of [4,0,3].entries())assert.ifError(craft(p,i+1,index).error||null);
  const r=craftEquipment(p,'starter_weapon',{currencyId:'quad_affix_orb',random:equipmentRandom(99)},collections,library,tags);assert.ifError(r.error||null);assert.equal(r.after.affixes.length,4);assert.equal(r.after.reforgeTargets,undefined);
  for(const [i,index] of [3,2,1].entries())assert.ifError(craft(p,i+1,index).error||null);assert.deepEqual(p.instances.starter_weapon.reforgeTargets,[3,2,1]);
});

test('陨星石: a crafted four-affix BD preserves the real item and its grade bindings when applied',()=>{
  const p=fresh();assert.ifError(craftEquipment(p,'starter_weapon',{currencyId:'quad_affix_orb',random:equipmentRandom(99)},collections,library,tags).error||null);
  assert.ifError(craft(p,1,3).error||null);
  const item={...clone(p.instances.starter_weapon),uid:'meteor_saved'},preset={skills:['frost_lance'],equipment:{weapon:item.uid},belt:[],instances:{[item.uid]:item}};
  const target=createProgression(collections,library);assert.equal(applyBuildPreset(target,preset,collections,library).error,'');assert.deepEqual(target.instances[item.uid],item);
  assert.equal(craftTargetError(target.instances[item.uid],collections.item.get(ids[0]).doc,3),'');assert.ok(craftTargetError(target.instances[item.uid],collections.item.get(ids[0]).doc,1));
  const corrupt=clone(preset);corrupt.instances[item.uid].legendary=null;const freshTarget=createProgression(collections,library),before=clone(freshTarget);assert.ok(applyBuildPreset(freshTarget,corrupt,collections,library).error);assert.deepEqual(freshTarget,before);
});

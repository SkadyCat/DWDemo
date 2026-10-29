import test from 'node:test';
import assert from 'node:assert/strict';
import { readBaselineRuleFiles } from './rule-fixture.mjs';
import { checkRuleSet, createProgression, rollEquipment, equipmentRandom, craftEquipment, removeEquipmentAffixes, addEquipmentAffixes, equipmentAffixPool, parseCollection, serializeCollection, listings } from '../engine/index.mjs';

const checked=checkRuleSet(readBaselineRuleFiles());assert.ok(checked.ok,checked.error);
const {collections,library,tags,catalog}=checked,remove='annulment_crystal',add='wish_crystal';
const clone=value=>JSON.parse(JSON.stringify(value));
function fresh(tier=3){
 const p=createProgression(collections,library);
 p.instances.starter_weapon=rollEquipment(collections.equipment.get('frostthorn_staff').doc,library,{uid:'starter_weapon',rarity:'legendary',tier,random:equipmentRandom(43)});
 p.owned.item[remove]=20;p.owned.item[add]=20;p.stones=123;return p;
}
const use=(p,id,options={})=>craftEquipment(p,'starter_weapon',{currencyId:id,random:equipmentRandom(71),...options},collections,library,tags);
const fixed=item=>{const value=clone(item);delete value.affixes;delete value.reforgeTargets;return value;};

test('crystals: both authored currencies round-trip and are shop candidates',()=>{
 for(const [id,op,name] of [[remove,'remove_affixes','无效结晶'],[add,'add_affixes','祈愿结晶']]){
  const doc=collections.item.get(id).doc;assert.equal(doc.name,name);assert.deepEqual(doc.craft,{op,count:1});
  assert.deepEqual(parseCollection('item',serializeCollection('item',doc)).doc,doc);
  assert.ok(listings(collections,catalog).some(row=>row.id===id));
 }
 const doc=collections.item.get(remove).doc;
 for(const craft of [{op:'remove_affixes',count:0},{op:'remove_affixes',count:1.5},{op:'remove_affixes',count:1,grade:1}])assert.ok(parseCollection('item',{...doc,craft}).error);
});

test('annulment: every existing random line can be removed; survivor values and fixed fields stay intact',()=>{
 const item=fresh().instances.starter_weapon;
 for(let index=0;index<item.affixes.length;index++){
  const before=clone(item),after=removeEquipmentAffixes(item,{random:()=> (index+.1)/item.affixes.length});
  assert.deepEqual(item,before);assert.deepEqual(fixed(after),fixed(item));
  assert.deepEqual(after.affixes,item.affixes.filter((_,i)=>i!==index));
 }
});

test('annulment: preserve earlier currency grades and remap surviving indices',()=>{
 const item=fresh().instances.starter_weapon;item.reforgeTargets=[3,1,4];
 for(const [index,expected] of [[0,[2,0,3]],[1,[2]],[3,[]],[4,[3,1]]]){
  const after=removeEquipmentAffixes(item,{random:()=> (index+.1)/5});assert.deepEqual(after.reforgeTargets,expected);
 }
});

test('crystals: paid operations change exactly one line and one charge, keeping equipped UID and spirit stones',()=>{
 const p=fresh(),before=clone(p.instances.starter_weapon),slot=p.loadout.equipment.weapon;
 const removed=use(p,remove);assert.ifError(removed.error||null);assert.equal(removed.removed.length,1);assert.deepEqual(removed.changed,[]);
 assert.equal(p.instances.starter_weapon.affixes.length,before.affixes.length-1);assert.equal(p.owned.item[remove],19);
 const current=clone(p.instances.starter_weapon),added=use(p,add);assert.ifError(added.error||null);
 assert.equal(added.after.affixes.length,current.affixes.length+1);assert.equal(added.changed.length,1);assert.equal(p.owned.item[add],19);
 assert.deepEqual(added.after.affixes.slice(0,current.affixes.length),current.affixes);assert.deepEqual(fixed(added.after),fixed(before));
 assert.equal(p.loadout.equipment.weapon,slot);assert.equal(p.stones,123);
});

test('wish: generated numerical tiers stay between T1 and the equipment tier',()=>{
 for(const tier of [1,3,10])for(let seed=1;seed<=15;seed++){
  const p=fresh(tier),r=use(p,add,{random:equipmentRandom(seed)});assert.ifError(r.error||null);
  const line=r.after.affixes.at(-1);if(line.tier)assert.ok(line.tier>=1&&line.tier<=tier);
 }
});

test('wish: synthesized fixed legendary lines are excluded from new rolls',()=>{
 const item=fresh().instances.starter_weapon,pool=equipmentAffixPool(library).slice(0,2);
 delete item.legendary;item.affixes=[];item.extraLegendary=[pool[0]];
 const after=addEquipmentAffixes(item,library,{count:1,pool,random:()=>0});
 assert.equal(after.affixes[0].id,pool[1].id);assert.deepEqual(after.extraLegendary,item.extraLegendary);
});

test('crystals: empty, unidentified, fixed slots, selected target, omen and exhausted pool fail without spending',()=>{
 for(const mutate of [p=>p.instances.starter_weapon.affixes=[],p=>p.instances.starter_weapon.identified=false,p=>p.instances.starter_weapon.slot='tower',p=>delete p.owned.item[remove]]){
  const p=fresh();mutate(p);const before=clone(p);assert.ok(use(p,remove).error);assert.deepEqual(p,before);
 }
 for(const options of [{index:0},{omenId:'omen_elemental'}]){
  const p=fresh();p.owned.item.omen_elemental=1;const before=clone(p);assert.ok(use(p,remove,options).error);assert.deepEqual(p,before);
 }
 const p=fresh(),before=clone(p);assert.ok(use(p,add,{pool:[]}).error);assert.deepEqual(p,before);
});

test('annulment: repeated uses reach zero and subsequent failure cannot consume a charge',()=>{
 const p=fresh();let left=p.instances.starter_weapon.affixes.length;
 while(left>0){const r=use(p,remove);assert.ifError(r.error||null);assert.equal(r.after.affixes.length,--left);}
 const before=clone(p);assert.ok(use(p,remove).error);assert.deepEqual(p,before);
 const r=use(p,add);assert.ifError(r.error||null);assert.equal(r.after.affixes.length,1);
});

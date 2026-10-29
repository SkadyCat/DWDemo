import test from 'node:test';
import assert from 'node:assert/strict';
import {readBaselineRuleFiles} from './rule-fixture.mjs';
import {checkRuleSet,createProgression,rollEquipment,rollEquipmentAffixes,equipmentRandom,craftEquipment,parseCollection,serializeCollection,listings,omenFamily,affixFamilies,validateTraitValueEntry,equipmentDocument,aggregate,compileBuild} from '../engine/index.mjs';

const check=checkRuleSet(readBaselineRuleFiles());assert.ok(check.ok,check.error);
const {collections,library,tags,catalog}=check,id='quad_affix_orb',template=collections.equipment.get('frostthorn_staff').doc;
const clone=v=>JSON.parse(JSON.stringify(v));
const fresh=()=>{const p=createProgression(collections,library);p.owned.item[id]=3;p.stones=123;return p};
const craft=(p,options={},c=collections,t=tags)=>craftEquipment(p,'starter_weapon',{currencyId:id,random:equipmentRandom(33),...options},c,library,t);

test('陨星石: authored replace-four effect round-trips and is available in the shop',()=>{
  const doc=collections.item.get(id).doc;assert.equal(doc.name,'陨星石');assert.deepEqual(doc.craft,{op:'roll_affixes',count:4});
  assert.deepEqual(parseCollection('item',serializeCollection('item',doc)).doc,doc);
  assert.ok(listings(collections,catalog).some(row=>row.id===id&&row.price>0));
  for(const effect of [{op:'roll_affixes',count:0},{op:'roll_affixes',count:1.5},{op:'roll_affixes',count:4,grade:1},{op:'other',count:4},null])assert.ok(parseCollection('item',{...doc,craft:effect}).error);
});

test('陨星石: four random affixes become rare, while a fixed legendary retains legendary quality and all identity fields',()=>{
  for(const tier of [1,3,10])for(const rarity of ['common','magic','rare','legendary']){
    const item=rollEquipment(template,library,{tier,rarity,random:equipmentRandom(tier*43)}),before=clone(item);
    if(item.affixes.length)item.reforgeTargets=[0];
    const original=clone(item),next=rollEquipmentAffixes(item,library,{count:4,random:equipmentRandom(3)});
    assert.deepEqual(item,original);assert.equal(next.affixes.length,4);assert.equal(next.reforgeTargets,undefined);
    assert.deepEqual(next.legendary,before.legendary);assert.deepEqual(next.bases,before.bases);
    for(const key of ['uid','baseId','name','slot','skill','tier','level'])assert.equal(next[key],before[key]);
    assert.equal(next.rarity,before.legendary?'legendary':'rare');
    const traits=[...next.affixes,...(next.legendary?[next.legendary]:[])].flatMap(a=>a.traits);
    assert.equal(new Set(traits.map(t=>t.id)).size,traits.length);
    for(const t of traits){assert.equal(validateTraitValueEntry(library,t),'');if(t.tier)assert.ok(t.tier>=1&&t.tier<=tier)}
    const plan=aggregate(library,'frost_lance',[{kind:'equipment',doc:equipmentDocument(next,collections)}],Infinity);assert.ok(plan.source,plan.error);assert.ok(compileBuild(plan.source).plan);
  }
});

test('陨星石: repeated use spends one each time and rerolls four rather than appending',()=>{
  const p=fresh();
  for(let use=1;use<=3;use++){
    const r=craft(p,{random:equipmentRandom(use)});assert.ifError(r.error||null);assert.equal(r.operation,'roll_affixes');assert.equal(r.after.affixes.length,4);assert.deepEqual(r.changed,[0,1,2,3]);
    assert.equal(p.owned.item[id]||0,3-use);assert.equal(p.loadout.equipment.weapon,'starter_weapon');assert.equal(p.stones,123);
  }
  const before=clone(p);assert.match(craft(p).error,/通货不足/);assert.deepEqual(p,before);
});

test('陨星石: omen filters all four new affixes and both materials are spent once',()=>{
  const p=fresh(),omen=[...collections.item.values()].map(e=>e.doc).find(d=>omenFamily(tags,d)==='elemental');p.owned.item[omen.id]=1;
  const r=craft(p,{omenId:omen.id});assert.ifError(r.error||null);assert.equal(r.family,'elemental');assert.equal(r.after.affixes.length,4);
  assert.ok(r.after.affixes.every(a=>affixFamilies(tags,a).includes('elemental')));assert.equal(p.owned.item[id],2);assert.equal(p.owned.item[omen.id],undefined);
});

test('陨星石: invalid target, fixed slots and insufficient pool never spend or modify gear',()=>{
  for(const options of [{index:0},{currencyId:'missing'},{omenId:'missing'}]){const p=fresh(),before=clone(p);assert.ok(craft(p,options).error);assert.deepEqual(p,before)}
  const p=fresh();p.owned.item.omen_tiny=1;const c={...collections,item:new Map(collections.item)};c.item.set('omen_tiny',{doc:{id:'omen_tiny',category:'omen',tags:['tiny']}});
  const tiny={familiesOf:key=>key==='life_base'?['tiny']:[],collectionFamilies:()=>({families:['tiny']}),familyName:()=>''},before=clone(p);
  assert.match(craft(p,{omenId:'omen_tiny'},c,tiny).error,/词条不足/);assert.deepEqual(p,before);
  assert.throws(()=>rollEquipmentAffixes({...p.instances.starter_weapon,slot:'tower'},library,{count:4}),/固定装备槽/);
});

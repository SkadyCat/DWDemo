import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyHunter,normalizeHunter,hunterAllows,hunterCurrencyPool} from '../engine/loot-hunter.mjs';
import {checkRuleSet,equipmentAffixPool,rollEquipment,equipmentRandom} from '../engine/index.mjs';
import {readBaselineRuleFiles} from './rule-fixture.mjs';
import {FloorRewards} from '../engine/floor-rewards.mjs';

const checked=checkRuleSet(readBaselineRuleFiles());assert.ok(checked.ok,checked.error);

test('Hunter defaults to enabled; saved toggle and targets are independent of panel visibility',()=>{
 assert.deepEqual(emptyHunter(),{visible:false,enabled:true,targets:[],currencies:[]});
 assert.deepEqual(normalizeHunter({visible:true,targets:['a','a','bad',3],currencies:['coin','coin','bad']},new Set(['a']),new Set(['coin'])),{visible:true,enabled:true,targets:['a'],currencies:['coin']});
 assert.equal(normalizeHunter({enabled:false}).enabled,false);
 const unknown={kind:'item',id:'healing_draught',category:'consumable'};
 assert.equal(hunterAllows(unknown,emptyHunter()),false);
 assert.equal(hunterAllows(unknown,{...emptyHunter(),enabled:false}),true);
});

test('Hunter uses multi-select AND across base, random, composite and attached entries, including while closed',()=>{
 const drop={kind:'equipment',item:{identified:true,bases:[{id:'flat_frost',traits:[{id:'flat_frost'}]}],affixes:[{id:'shocking_hits',traits:[{id:'lightning_damage'},{id:'shock',with:[{id:'duration_bonus'}]}]}],legendary:{id:'legendary:staff',traits:[{id:'death_lightning'}]}}};
 const before=structuredClone(drop),hunter={...emptyHunter(),targets:['flat_frost','shocking_hits','duration_bonus','death_lightning']};
 assert.equal(hunterAllows(drop,hunter),true);
 assert.equal(hunterAllows(drop,{...hunter,visible:true}),true);
 assert.equal(hunterAllows(drop,{...hunter,targets:['flat_frost','absent']}),false);
 assert.equal(hunterAllows(drop,{...hunter,targets:[]}),false);
 assert.equal(hunterAllows({...drop,item:{...drop.item,identified:false}},hunter),false);
 assert.equal(hunterAllows(drop,{...hunter,enabled:false,targets:['absent']}),true);
 assert.deepEqual(drop,before);
});

test('The existing poison weapon matches flat poison; an additional frost condition correctly excludes it',()=>{
 const template=checked.collections.equipment.get('venomglass_flask').doc;
 const item=rollEquipment(template,checked.library,{tier:1,rarity:'common',random:equipmentRandom(7)});
 const drop={kind:'equipment',item},hunter={...emptyHunter(),targets:['flat_poison']};
 assert.ok(item.bases.some(a=>a.id==='flat_poison'));
 assert.equal(hunterAllows(drop,hunter),true);
 assert.equal(hunterAllows(drop,{...hunter,targets:['frost_damage','flat_poison']}),false);
});

test('Currency Hunter reads existing currency documents and permits each selected kind independently',()=>{
 const pool=hunterCurrencyPool(checked.collections);
 assert.deepEqual(pool.map(i=>i.id),[...checked.collections.item.values()].map(e=>e.doc).filter(d=>d.category==='currency').map(d=>d.id));
 assert.ok(pool.length>=2);
 const hunter={...emptyHunter(),currencies:pool.slice(0,2).map(c=>c.id)};
 for(const currency of pool.slice(0,2))assert.equal(hunterAllows({kind:'item',category:'currency',id:currency.id},hunter),true);
 assert.equal(hunterAllows({kind:'item',category:'currency',id:'unselected'},hunter),false);
 assert.equal(hunterAllows({kind:'item',category:'omen',id:pool[0].id},hunter),false);
 assert.equal(hunterAllows({kind:'equipment',item:{identified:true}},hunter),false);
 assert.deepEqual(hunterCurrencyPool(null),[]);
});

test('Equipment and currency targets combine without spending, rerolling or removing hidden loot',()=>{
 const rewards=new FloorRewards(checked.collections,checked.library,checked.catalog,{seed:71,equipmentChance:1,itemChance:1});
 const control=new FloorRewards(checked.collections,checked.library,checked.catalog,{seed:71,equipmentChance:1,itemChance:1});
 for(let i=0;i<30;i++){const mon={x:i*100,y:0,boss:i===29};rewards.onKill(mon);control.onKill(mon);}
 const allowed=new Set(equipmentAffixPool(checked.library).map(a=>a.id));
 const candidate=rewards.ground.find(d=>d.kind==='equipment'&&d.item.affixes.filter(a=>allowed.has(a.id)).length>=2);
 const currency=rewards.ground.find(d=>d.category==='currency');assert.ok(candidate);assert.ok(currency);assert.equal(candidate.item.identified,true);
 const targets=candidate.item.affixes.slice(0,2).map(a=>a.id),hunter={...emptyHunter(),targets,currencies:[currency.id]};
 const before=JSON.stringify(rewards.ground);
 const shown=rewards.ground.filter(d=>hunterAllows(d,hunter));assert.ok(shown.includes(candidate));assert.ok(shown.includes(currency));
 assert.ok(shown.every(d=>d.kind==='item'?d.category==='currency'&&d.id===currency.id:targets.every(id=>d.item.affixes.some(a=>a.id===id))));
 assert.deepEqual(rewards.ground.filter(d=>hunterAllows(d,{...hunter,visible:true})),shown);
 assert.equal(rewards.ground.filter(d=>hunterAllows(d,{...hunter,enabled:false})).length,rewards.ground.length);
 assert.equal(JSON.stringify(rewards.ground),before);
 rewards.onKill({x:9,y:2,boss:true});control.onKill({x:9,y:2,boss:true});assert.deepEqual(rewards.ground,control.ground);
});

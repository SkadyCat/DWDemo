import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readRuleFiles} from '../scripts/rule-files.mjs';
import {checkRuleSet,createProgression,statusKey} from '../engine/index.mjs';
import {equipmentDocument} from '../engine/equipment.mjs';
import {availableSkills} from '../engine/loadout.mjs';
import {FloorRewards,PICKUP_RADIUS} from '../engine/floor-rewards.mjs';
import {Battle} from '../public/sim/battle.mjs';
import {TRAIT_EQUIPMENT,createTraitEquipment,dropTraitEquipment} from '../public/trait-equipment.mjs';
import {createTraitEquipmentDocument,traitEquipmentRow} from '../../UICreatorAlpha/src/assets/rulestudio-hud/trait-equipment.js';
import {validateDocument,indexTree} from '../../UICreatorAlpha/src/core/model.js';
import {computeLayout} from '../../UICreatorAlpha/src/core/layout.js';

const files=readRuleFiles(),checked=checkRuleSet(files);
assert.ok(checked.ok,checked.error);
const {collections,library,catalog}=checked;
const recipe=TRAIT_EQUIPMENT[0];
const make=()=>new FloorRewards(collections,library,catalog,{seed:1729});

test('catalogue creates an independent legal T1 magic staff with the fixed reaction',()=>{
  const first=createTraitEquipment(recipe.id,collections,library),second=createTraitEquipment(recipe.id,collections,library);
  assert.notEqual(first.uid,second.uid);
  assert.equal(first.name,'霜爆法杖');assert.equal(first.baseId,'frostthorn_staff');
  assert.equal(first.rarity,'magic');assert.equal(first.tier,1);assert.equal(first.skill,'frost_lance');
  assert.equal(first.affixes.length,1);assert.equal(first.affixes[0].id,'chill_consume_burst');
  assert.equal(first.legendary,null);
  const doc=equipmentDocument(first,collections);
  assert.deepEqual(doc.skills,['frost_lance']);assert.ok(doc.traits.some(t=>t.id==='chill_consume_burst'));
});

test('clicking creates ground loot; normal pickup grants it once and unlocks the bound skill',()=>{
  const rewards=make(),state=createProgression(collections,library),before=structuredClone(state),hero={x:300,y:-200};
  const {drop,error}=dropTraitEquipment(recipe.id,{hero,rewards},collections,library);
  assert.equal(error,undefined);assert.deepEqual(state,before);
  assert.equal(rewards.remaining.length,1);assert.equal(drop.origin,'catalogue');
  assert.equal(drop.kind,'equipment');assert.equal(drop.claimed,false);
  assert.ok(Math.hypot(drop.x-hero.x,drop.y-hero.y)<PICKUP_RADIUS);
  assert.ok(rewards.pickup(drop.key,state,{x:5000,y:0}).error);assert.deepEqual(state,before);
  assert.equal(rewards.pickup(drop.key,state,hero).drop,drop);
  assert.deepEqual(state.instances[drop.id],drop.item);assert.equal(state.progression.drops,0);
  const after=structuredClone(state);assert.ok(rewards.pickup(drop.key,state,hero).error);assert.deepEqual(state,after);
  state.loadout.equipment.weapon=drop.id;
  assert.ok(availableSkills({},state.loadout.equipment,collections,state.instances).some(s=>s.id==='frost_lance'&&s.granted));
});

test('catalogue clicks do not consume kill-loot RNG or merchant RNG',()=>{
  const a=make(),b=make(),hero={x:0,y:0};
  for(let i=0;i<4;i++)assert.ok(dropTraitEquipment(recipe.id,{hero,rewards:a},collections,library).drop);
  assert.equal(new Set(a.ground.map(d=>d.item.uid)).size,4);
  for(let i=0;i<20;i++){assert.equal(a.random(),b.random());assert.equal(a.merchantRandom(),b.merchantRandom());}
});

test('invalid clicks leave ground loot unchanged',()=>{
  const rewards=make(),hero={x:0,y:0};
  for(const [id,battle]of [[recipe.id,null],[recipe.id,{hero:{...hero,dead:true},rewards}],[recipe.id,{hero:{x:NaN,y:0},rewards}],['missing',{hero,rewards}]]){
    assert.ok(dropTraitEquipment(id,battle,collections,library).error);assert.equal(rewards.ground.length,0);
  }
});

test('the actual equipped staff compiles ice lance and consumes chill into its frost blast',()=>{
  const item=createTraitEquipment(recipe.id,collections,library);
  const battle=new Battle(files,{collections,instances:{[item.uid]:item},maxMonsters:0,spawnRate:0,autoCast:false,seed:18});
  battle.setLoadout({skills:['frost_lance'],equipment:{weapon:item.uid}});
  assert.ok(battle.hero.plan>=0,battle.hero.error);assert.ok(battle.skills[0]?.plan>=0,battle.skills[0]?.error);
  assert.ok(battle.skills[0].contributions.some(c=>c.sourceId==='chill_consume_burst'&&c.status==='on'));
  battle.spawnMonsters(1);const monster=battle.monsters[0];
  Object.assign(monster,{x:500,y:0,speed:0,cooldown:9999,health:1e7,maxHealth:1e7,shield:0,maxShield:0});battle.step(1/60);
  const areas=[],consumed=[];battle.host.world.trace=(kind,payload)=>{if(kind==='area'&&payload.effect==='chill_consume_burst')areas.push({...payload});if(kind==='status_consumed')consumed.push({...payload});};
  battle.host.world.applyStatusKey(monster.id,statusKey('chill'),30,5,battle.hero.owner);
  const root=battle.combat.openRoot();battle.host.world.hostHit(root,monster.id,1,1,5,0);battle.step(1/60);
  assert.equal(areas.length,1);assert.equal(areas[0].radius,1.5);assert.equal(areas[0].element,1);
  assert.ok(consumed.some(event=>event.targetId===monster.id&&event.key===statusKey('chill')&&event.count===1));
});

test('saved UICreator panel is valid, editable, and clones clickable rows within its list',()=>{
  const saved=JSON.parse(fs.readFileSync(new URL('../public/ui/trait-equipment.uialpha.json',import.meta.url)));
  assert.equal(saved.provenance.projectId,'studio-trait-equipment');assert.deepEqual(validateDocument(saved),[]);
  const authored=createTraitEquipmentDocument(),list=indexTree(authored.root).nodes.get('equipment-list');
  list.children=[traitEquipmentRow(authored,recipe,0),traitEquipmentRow(authored,{...recipe,id:'second'},1)];
  assert.deepEqual(validateDocument(authored),[]);
  const layout=computeLayout(authored),one=layout.entries.get('trait-equipment-0-row'),two=layout.entries.get('trait-equipment-1-row');
  assert.equal(one.width,592);assert.equal(one.height,136);assert.equal(two.y-one.y,148);
  assert.equal(one.node.action.value,recipe.id);assert.equal(two.node.action.value,'second');
  assert.equal(indexTree(authored.root).nodes.get('trait-equipment-0-entry-name').text,'霜爆法杖');
});

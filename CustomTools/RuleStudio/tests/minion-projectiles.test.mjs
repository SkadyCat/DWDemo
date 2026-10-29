import test from 'node:test';
import assert from 'node:assert/strict';
import { readRuleFiles } from '../scripts/rule-files.mjs';
import { checkRuleSet, parseCollection, rollEquipment, equipmentRandom } from '../engine/index.mjs';
import { Battle } from '../public/sim/battle.mjs';

const files=readRuleFiles(),checked=checkRuleSet(files);assert.ok(checked.ok,checked.error);
function fixture(traits=[],{trigger=false,skill='fire_turret',targets=[{x:800,y:0}]}={}){
 const build=checked.library.build(skill);
 const entry=trigger?{id:'trig_hit',params:{chance:100},with:build.traits}:null;
 const parsed=parseCollection('equipment',{id:'minion_projectile_probe',slot:'ring',rarity:'unique',traits:[...traits,...(entry?[entry]:[])]});assert.ok(parsed.doc,parsed.error);
 const collections={...checked.collections,equipment:new Map([...checked.collections.equipment,[parsed.doc.id,{doc:parsed.doc}]])};
 const b=new Battle(files,{collections,maxMonsters:0,spawnRate:0,god:true,seed:17});
 b.setLoadout({skills:[trigger?'frost_lance':skill],equipment:{ring:parsed.doc.id}});assert.equal(b.skills[0].error,'');
 b.spawnMonsters(targets.length);b.monsters.forEach((m,i)=>Object.assign(m,{health:1e7,maxHealth:1e7,speed:0,cooldown:999,shield:0,maxShield:0,elite:false,attackRange:0,resistance:[0,0,0,0,0,0]},targets[i]));
 const hits=[],spawns=[],prior=b.host.world.trace;
 b.host.world.trace=(type,p)=>{
  if(type==='damage'&&p.Amount>0){const index=b.host.world.roots.indexOf(p.root);if(b.combat.rootInfo(index)?.minion){const row=b.host.world.damageLog.at(-1);hits.push({target:p.TargetExternalId,amount:p.Amount,kind:row?.Info?.kind,strike:row?.Info?.strike,time:b.elapsed});}}
  if(type==='spawn'&&b.combat.rootInfo(b.host.world.carriers.root[p.index])?.minion)spawns.push(p.id);
  return prior?.(type,p);
 };
 const step=(frames,cast=false)=>{b.hero.casting=cast;for(let i=0;i<frames;i++)b.step(1/60);b.hero.casting=false};
 const carriers=()=>{const c=b.host.world.carriers;return Array.from({length:c.num},(_,i)=>i).filter(i=>!(c.flags[i]&1)&&b.combat.rootInfo(c.root[i])?.minion)};
 const first=()=>{step(20,true);for(let i=0;i<180&&!carriers().length;i++)step(1);assert.ok(carriers().length,'summon must emit a real projectile');return carriers()};
 return{b,step,carriers,first,hits,spawns};
}

for(const trigger of [false,true])for(const skill of ['sentinel','fire_turret']){
 test(`${skill} ${trigger?'hit-triggered':'manual'}: native multishot, sheet count and minion count aggregate once`,()=>{
  const f=fixture([{id:'multiple_projectiles'},{id:'proj_count',params:{n:2}},{id:'minion_proj_count',params:{n:1}}],{trigger,skill});
  assert.equal(f.first().length,8,'1 base + 4 multishot + 2 projectile count + 1 minion count');
 });
 test(`${skill} ${trigger?'hit-triggered':'manual'}: generic and minion speed, lifetime and radius reach the actual carrier`,()=>{
  const f=fixture([{id:'proj_speed',params:{n:25}},{id:'minion_proj_speed',params:{n:20}},{id:'proj_lifetime',params:{n:50}},{id:'proj_radius',params:{n:50}}],{trigger,skill});
  const [i]=f.first(),c=f.b.host.world.carriers;
  const base=skill==='sentinel'?{speed:24,life:.45,radius:.22}:{speed:18,life:.7,radius:.2};
  assert.ok(Math.abs(Math.hypot(c.vx[i],c.vy[i])-base.speed*1.45)<1e-4);
  assert.ok(Math.abs(c.life[i]-base.life*1.5)<1e-5);assert.ok(Math.abs(c.radius[i]-base.radius*1.5)<1e-5);
 });
}

for(const trigger of [false,true]){
 test(`summon ${trigger?'hit-triggered':'manual'}: piercing and ricochet equipment actually hit the next enemy`,()=>{
  for(const [id,targets]of [['pierce',[{x:240,y:0},{x:420,y:0}]],['ricochet',[{x:240,y:0},{x:240,y:240}]]]){
   const f=fixture([{id,params:{count:1}}],{trigger,targets});f.step(20,true);f.step(210);
   assert.equal(new Set(f.hits.filter(h=>h.kind==='projectile').map(h=>h.target)).size,2,id+' must deliver projectile damage to both enemies');
  }
 });
}

test('summon projectile sheet chain, split, homing, return and ring follow the same projectile pipeline',()=>{
 const chain=fixture([{id:'proj_chain',params:{n:1}}],{targets:[{x:240,y:0},{x:240,y:240}]});chain.step(20,true);chain.step(150);
 assert.equal(new Set(chain.hits.filter(h=>h.kind==='projectile').map(h=>h.target)).size,2,'host-side chain');
 const split=fixture([{id:'proj_split_on_hit'}],{targets:[{x:240,y:0}]});split.first();let splitChildren=false;
 for(let i=0;i<30;i++){split.step(1);if(split.carriers().length>=2)splitChildren=true;}assert.ok(splitChildren,'split creates actual summon projectiles');
 const homing=fixture([{id:'proj_homing_range'}],{targets:[{x:650,y:0}]});homing.first();homing.b.monsters[0].y=200;homing.step(4);
 assert.ok(homing.carriers().some(i=>homing.b.host.world.carriers.vy[i]>1),'homing turns toward the moved enemy');
 const back=fixture([{id:'proj_return_at_max'}]);back.first();back.b.monsters[0].x=3000;back.step(160);assert.ok(back.b.combat.projectiles.recalled>0,'expired shot returns and is recalled');
 const ring=fixture([{id:'proj_count',params:{n:3}},{id:'proj_layout_ring'}]);const indices=ring.first(),c=ring.b.host.world.carriers;
 assert.equal(indices.length,4);assert.ok(indices.some(i=>c.vx[i]>1)&&indices.some(i=>c.vx[i]<-1)&&indices.some(i=>c.vy[i]>1)&&indices.some(i=>c.vy[i]<-1),'four directions');
});

test('a real rolled T1 legendary summon inherits equipped projectile supports through the ordinary trigger path',()=>{
 const template=checked.collections.equipment.get('fire_turret_clockwork_gloves').doc;
 const item=rollEquipment(template,checked.library,{tier:1,uid:'rolled_summon',random:equipmentRandom(43)});
 const parsed=parseCollection('equipment',{id:'projectile_support_probe',slot:'ring',rarity:'unique',traits:[{id:'multiple_projectiles',params:{count:4,spread:0,damage_multiplier:1}},{id:'pierce',params:{count:1}}]});assert.ok(parsed.doc,parsed.error);
 const collections={...checked.collections,equipment:new Map([...checked.collections.equipment,[parsed.doc.id,{doc:parsed.doc}]])};
 const b=new Battle(files,{collections,instances:{[item.uid]:item},maxMonsters:0,spawnRate:0,god:true,seed:17});b.setLoadout({skills:['frost_lance'],equipment:{gloves:item.uid,ring:parsed.doc.id}});
 b.spawnMonsters(2);b.monsters.forEach((m,i)=>Object.assign(m,{x:180+i*90,y:0,health:1e8,maxHealth:1e8,speed:0,cooldown:999,shield:0,maxShield:0,attackRange:0,resistance:[0,0,0,0,0,0]}));
 let fired=false,multishot=false;const targets=new Set(),prior=b.host.world.trace;
 b.host.world.trace=(type,p)=>{const c=b.host.world.carriers;if(type==='spawn'&&b.combat.rootInfo(c.root[p.index])?.minion){fired=true;const count=Array.from({length:c.num},(_,i)=>i).filter(i=>c.root[i]===c.root[p.index]&&!(c.flags[i]&1)).length;multishot ||= count>=5;}
  if(type==='damage'){const ri=b.combat.rootInfo(b.host.world.roots.indexOf(p.root));if(ri?.minion&&b.host.world.damageLog.at(-1)?.Info?.kind==='projectile')targets.add(p.TargetExternalId);}return prior?.(type,p)};
 b.hero.casting=true;for(let i=0;i<3600&&!(multishot&&targets.size===2);i++)b.step(1/60);
 assert.ok(fired);assert.ok(multishot,'real legendary summon fires the equipped five-shot support');assert.equal(targets.size,2,'real legendary projectile pierces into the next enemy');
});

test('summon multishot hit caps reset for each attack, and batch-cap equipment increases actual allowed hits',()=>{
 for(const extra of [0,2]){
  const f=fixture([{id:'multiple_projectiles',params:{count:4,spread:0,damage_multiplier:1}},{id:'minion_accuracy',params:{n:20}},...(extra?[{id:'proj_batch_cap',params:{n:extra}}]:[])],{targets:[{x:240,y:0}]});
  f.step(20,true);f.step(130);
  const volleys=new Map();for(const hit of f.hits.filter(h=>h.kind==='projectile')){const key=hit.time.toFixed(3);volleys.set(key,(volleys.get(key)||0)+1)}
  assert.ok(volleys.size>=2,'later attacks still deal damage');assert.ok([...volleys.values()].every(count=>count===3+extra),'same-volley hit limit applies to each attack');
 }
});

test('continuous projectile volleys repeat summon shots without replacing or resummoning the unit',()=>{
 const f=fixture([{id:'proj_volleys',params:{n:2}}]);f.first();const unit=f.b.combat.minions.alive()[0].id;
 const seen=new Set();for(let frame=0;frame<31;frame++){for(const i of f.carriers())seen.add(f.b.host.world.carriers.id[i]);f.step(1)}
 assert.equal(f.b.combat.minions.alive()[0].id,unit,'same control unit');assert.equal(seen.size,3,'one original shot and two delayed volleys');
});

test('summon secondary projectiles and hit fields keep minion attribution and bounded lifetimes',()=>{
 const secondary=fixture([{id:'proj_expire_secondary',params:{n:2}}]);secondary.first();secondary.b.monsters[0].x=3000;let sawSecondary=false;
 for(let i=0;i<80;i++){secondary.step(1);for(const index of secondary.carriers()){
  const c=secondary.b.host.world.carriers,st=secondary.b.combat.projectiles.state.get(c.id[index]);
  if(st.gen===2){sawSecondary=true;assert.equal(secondary.b.host.world.plans[secondary.b.host.world.roots[c.root[index]].plan].kindNames.names[c.kind[index]],'fireball');assert.ok(st.minion);}
 }}assert.ok(sawSecondary);secondary.step(620);assert.equal(secondary.b.host.world.activeRoots(),0);
 const field=fixture([{id:'proj_hit_zone'}],{trigger:true,targets:[{x:240,y:0}]});field.step(20,true);field.step(200);
 assert.ok(field.hits.some(h=>h.strike==='projectile_zone'),'field damage is attributed to the minion');assert.equal(field.b.combat.triggers.fired,1,'derived minion damage cannot retrigger the player summon');
});

test('projectile support inheritance does not inherit the player flat-damage sheet',()=>{
 const f=fixture([{id:'flat_fire',params:{n:500}}],{targets:[{x:240,y:0}]});f.step(20,true);f.step(140);
 const hits=f.hits.filter(h=>h.kind==='projectile');assert.ok(hits.length>0);assert.equal(Math.min(...hits.map(h=>h.amount)),14,'summon still uses its own fireball base damage');
});

test('projectile supports neither create projectiles for direct-hit summons nor apply player bonuses to enemy shots',()=>{
 const direct=fixture([{id:'multiple_projectiles'},{id:'proj_count',params:{n:5}}],{skill:'storm_totem',targets:[{x:240,y:0}]});direct.step(20,true);direct.step(90);
 assert.equal(direct.b.projectiles().length,0);assert.ok(direct.hits.length>0,'direct lightning still hits');
 const enemy=fixture([{id:'proj_count',params:{n:5}},{id:'proj_chain',params:{n:3}}]);
 const {plan,error}=enemy.b.host.compileNamedBuild('frost_lance');assert.ok(plan>=0,error);const owner=enemy.b.host.registerOwner(77,1);
 enemy.b.host.castBuild(plan,owner,{x:800,y:400,z:60},{x:-1,y:0,z:0});enemy.step(1);
 const c=enemy.b.host.world.carriers,indices=Array.from({length:c.num},(_,i)=>i).filter(i=>c.owner[i]===owner&&!(c.flags[i]&1));
 assert.equal(indices.length,1,'enemy gets its own base count');assert.ok(indices.every(i=>!enemy.b.combat.projectiles.state.has(c.id[i])),'hero projectile affixes do not take over an enemy carrier');
});

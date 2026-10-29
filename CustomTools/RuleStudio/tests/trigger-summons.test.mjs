import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../public/vendor/three.module.js';
import {readRuleFiles} from '../scripts/rule-files.mjs';
import {checkRuleSet,parseCollection,RuleHost,aggregate,compileBuild,createTraitValueEntry,traitTierProfile} from '../engine/index.mjs';
import {Battle} from '../public/sim/battle.mjs';
import {createBattleEffects} from '../public/vfx/battle-effects.mjs';
import {summonPresentation} from '../public/vfx/catalog.mjs';

const files=readRuleFiles(),check=checkRuleSet(files);assert.ok(check.ok,check.error);
const specs=[
 {id:'iron_guard',active:'summon_iron_guard',attack:'iron_guard_slash',melee:true,element:3,weapon:'iron_guard_sigil'},
 {id:'ember_hound',active:'summon_ember_hound',attack:'ember_hound_bite',melee:true,element:0,weapon:'emberfang_talisman'},
 {id:'fire_turret',active:'summon_fire_turret',attack:'fire_turret_fireball',melee:false,element:0,weapon:'cinder_turret_staff'},
 {id:'storm_totem',active:'summon_storm_totem',attack:'storm_totem_lightning',melee:false,element:2,weapon:'stormcall_rod'},
];
function create(spec,{trigger=null,extras=[],x=500}={}){
 const traits=[...extras];
 if(trigger)traits.push({id:trigger,params:trigger==='trig_hit'?{chance:100}:{seconds:.5},with:[spec.active,spec.attack]});
 const gear=parseCollection('equipment',{id:'summon_test',name:'测试挂载',slot:'weapon',rarity:'unique',level:1,skills:['frost_lance'],traits});assert.ok(gear.doc,gear.error);
 const collections={...check.collections,equipment:new Map([...check.collections.equipment,['summon_test',{doc:gear.doc}]])};
 const b=new Battle(files,{collections,god:true,maxMonsters:0,spawnRate:0,seed:17});
 b.setLoadout({skills:[trigger?'frost_lance':spec.id],equipment:{weapon:'summon_test'}});assert.ok(b.skills[0].plan>=0,b.skills[0].error);
 b.spawnMonsters(1);Object.assign(b.monsters[0],{x,y:0,health:1e6,maxHealth:1e6,speed:0,cooldown:999,shield:0,maxShield:0,elite:false,attackRange:0,resistance:[0,0,0,0,0,0]});
 const events=[];const trace=b.host.world.trace;b.host.world.trace=(kind,data)=>{events.push({type:kind,...data});return trace?.(kind,data)};
 const step=(frames,cast=false)=>{b.hero.casting=cast;for(let i=0;i<frames;i++)b.step(1/60);b.hero.casting=false;};
 return{b,events,step};
}
const dealt=events=>events.filter(e=>e.type==='damage'&&e.OwnerExternalId===1&&e.Amount>0);

test('four summons have independent rules, bound weapons, attack modules and ten-tier value profiles',()=>{
 for(const spec of specs){
  const build=check.collections.skill.get(spec.id).doc;assert.deepEqual(build.traits.slice(0,2).map(t=>t.id),[spec.active,spec.attack]);
  const weapon=check.collections.equipment.get(spec.weapon).doc;assert.deepEqual(weapon.skills,[spec.id]);
  const active=check.library.trait(spec.active).source;assert.equal(active.rules[0].actions[0].kind,spec.id);
  assert.equal(check.library.trait(spec.attack).source.parentId,spec.active);assert.ok(summonPresentation[spec.id]);
  for(const id of [spec.active,spec.attack]){
   const profile=traitTierProfile(check.library,id);for(const data of Object.values(profile.params))assert.equal(data.tiers.length,10);
   for(let tier=1;tier<=10;tier++)assert.equal(createTraitValueEntry(check.library,id,{tier,random:()=>.5}).tier,tier);
  }
  const isolated=aggregate(check.library,'frost_lance',[{kind:'equipment',doc:{traits:[{id:spec.attack,params:{},with:[]}]}}]);const plan=compileBuild(isolated.source);assert.ok(plan.plan,plan.error);assert.ok(!plan.plan.traitIds.includes(spec.attack),'attack requires its own summon parent');
 }
});
for(const spec of specs){
 test(`${spec.id}: real ${spec.melee?'melee chase':'ranged fixed-position'} behavior and elemental damage`,()=>{
  const{b,events,step}=create(spec);step(20,true);step(15);
  const state=b.combat.minions.alive().find(st=>st.kind===spec.id);assert.ok(state);assert.equal(state.mobile,spec.melee);const placed={x:state.summon.x,y:state.summon.y};
  if(spec.melee)assert.equal(dealt(events).length,0,'cannot attack across five meters');
  step(200);assert.ok(dealt(events).some(e=>e.Element===spec.element),spec.id+' must actually damage');
  if(spec.melee)assert.ok(state.summon.x>2,'approaches enemy');else assert.deepEqual({x:state.summon.x,y:state.summon.y},placed,'stays at summon location');
 });
 test(`${spec.id}: existing hit trigger summons it after the player releases manual input`,()=>{
  const{b,events,step}=create(spec,{trigger:'trig_hit',x:300});step(20,true);step(200);
  assert.ok(events.some(e=>e.type==='summon'&&e.kind===spec.id)||b.host.world.summons.some(s=>s.kindName===spec.id));
  const state=b.combat.minions.alive().find(st=>st.kind===spec.id);assert.ok(state,'mounted summon created');
  assert.equal(b.combat.rootInfo(state.summon.root).triggered,true);
  assert.ok(b.combat.triggers.fired>0);assert.ok(events.some(e=>e.type==='summon_fire'&&e.id===state.id));
  assert.equal(b.hero.casting,false);
 });
}

test('no matching trigger event creates no summon; timer trigger works without manual casting',()=>{
 for(const spec of specs){
  const idle=create(spec,{trigger:'trig_hit'});idle.step(90);assert.equal(idle.b.combat.minions.alive().length,0);
  const timed=create(spec,{trigger:'trig_interval',x:300});timed.step(120);assert.ok(timed.b.combat.minions.alive().some(st=>st.kind===spec.id));
 }
});

test('caps, replacement rhythm, range and parameter overrides remain ordinary summon rules',()=>{
 for(const spec of specs){
  const h=new RuleHost();assert.ok(h.loadRuleLibrary(files).ok);const built=aggregate(check.library,spec.id,[{kind:'equipment',doc:{traits:[{id:spec.active,params:{duration:1.5,interval:.5,range:6,cap:2},with:[]},{id:spec.attack,params:{damage:37},with:[]}]}}]);const{plan,error}=h.compileSource(built.source);assert.ok(plan>=0,error);
  const owner=h.registerOwner(1,0),damage=[];let fires=0;h.world.trace=(kind)=>{if(kind==='summon_fire')fires++};
  const tick=(x=80)=>{h.beginTargets();h.addTarget({x,y:0,z:60},10,1e6,1,7);const rows=h.stepFrame(1/60);damage.push(...rows);return rows};
  const cast=()=>h.castBuild(plan,owner,{x:0,y:0,z:60},{x:1,y:0,z:0});
  cast();tick(700);assert.equal(fires,0,'outside overridden six-meter seek range');
  cast();tick();assert.equal(h.world.summons.length,2);assert.equal(h.world.summons[0].interval,.5);
  const first=h.world.summons[0].id;cast();tick();assert.equal(h.world.summons.length,2);assert.ok(!h.world.summons.some(s=>s.id===first));
  for(let i=0;i<100;i++)tick();assert.ok(damage.some(row=>row.Amount===37&&row.Element===spec.element),spec.id+' attack params must be honored');
  assert.equal(h.world.summons.length,0);assert.equal(h.world.activeRoots(),0);
 }
});

test('all four visual prefabs render actual live summons without changing seeded combat',()=>{
 for(const spec of specs){
  const run=show=>{
   const{b,events,step}=create(spec,{x:150});const fx=show?createBattleEffects(T,new T.Scene()):null;fx?.update(b);step(20,true);step(5);fx?.update(b);
   if(fx)assert.ok(fx.group.children.some(child=>child.name===summonPresentation[spec.id].prefab),'no hidden or placeholder summon');
   step(180);fx?.update(b);fx?.dispose();return dealt(events).map(e=>[e.TargetExternalId,e.Amount,e.Element,e.bKilled]);
  };
  assert.deepEqual(run(true),run(false));
 }
});

test('ranged summons render their moving rule projectiles, including mounted trigger summons',()=>{
 const ranged=[
  {spec:{id:'sentinel',active:'summon_sentinel',attack:'sentinel_ice_lance'},kind:'ice_lance',prefab:'projectile-ice-lance'},
  {spec:specs.find(s=>s.id==='fire_turret'),kind:'fireball',prefab:'projectile-fireball'},
 ];
 for(const {spec,kind,prefab} of ranged)for(const trigger of [null,'trig_hit']){
  const {b}=create(spec,{trigger,x:650});const fx=createBattleEffects(T,new T.Scene());fx.update(b);
  const positions=[];let fired=false,minionHit=false,minionImpact=false,renderedImpact=false;
  const prior=b.host.world.trace;
  b.host.world.trace=(type,p)=>{
   if(type==='summon_fire')fired=true;
   if(type==='damage'&&p.Amount>0){const index=b.host.world.roots.indexOf(p.root);minionHit ||= index>=0&&!!b.combat.rootInfo(index)?.minion;}
   if(type==='projectile_hit'&&p.kind===kind)minionImpact ||= [...b.combat.projectiles.state.entries()].some(([id,s])=>id===p.id&&s.minion);
   return prior?.(type,p);
  };
  for(let frame=0;frame<240;frame++){
   b.hero.casting=frame<20;b.step(1/60);fx.update(b);renderedImpact ||= minionImpact&&fx.impactCount>0;
   const row=b.projectiles().find(p=>p.kind===kind);
   // The mounted fixture also fires the player's ice lance; fireball is unique to its summon.
   if(row&&(!trigger||kind==='fireball')){
    const batch=fx.group.children.find(g=>g.name===prefab);assert.ok(batch,`${spec.id}: missing projectile prefab`);
    const mesh=batch.children.find(m=>m.isInstancedMesh);assert.ok(mesh.count>0);
    const matrix=new T.Matrix4();mesh.getMatrixAt(0,matrix);
    for(const [actual,expected]of [[matrix.elements[12],row.x/100],[matrix.elements[13],row.z/100],[matrix.elements[14],-row.y/100]])assert.ok(Math.abs(actual-expected)<1e-5,'render actual carrier position');
    positions.push(row.x);
   }
  }
  assert.ok(fired,`${spec.id}: actual attack event`);
  if(!trigger||kind==='fireball')assert.ok(positions.some((x,i)=>i&&x>positions[i-1]+1),'projectile must visibly travel');
  assert.ok(!fx.group.children.some(g=>g.name==='lightning-chain'),'projectile attack must not draw an instant lightning connection');
  assert.ok(minionHit,'actual summon projectile reaches and damages the enemy');
  assert.ok(minionImpact&&renderedImpact,'the real summon projectile contact also renders an impact');
  fx.dispose();
 }
});

test('summon attack presentation resolves its kind from the live unit when traces contain only its id',()=>{
 for(const spec of specs){
  const {b,events}=create(spec,{x:80});const fx=createBattleEffects(T,new T.Scene());fx.update(b);
  for(let frame=0;frame<65;frame++){b.hero.casting=frame<20;b.step(1/60);fx.update(b);}
  const fire=events.find(e=>e.type==='summon_fire');assert.ok(fire);assert.equal(fire.kind,undefined,'real attack trace has no kind field');
  if(spec.id==='fire_turret'){assert.ok(events.some(e=>e.type==='damage'&&e.Amount>0));assert.equal(summonPresentation.fire_turret.attack,undefined);fx.dispose();continue;}
  const attackName=spec.id==='storm_totem'?'DeathLightningStrike':summonPresentation[spec.id].attack.id;
  assert.ok(fx.group.children.some(g=>g.name===attackName),`${spec.id}: configured attack effect must be used`);
  assert.ok(!fx.group.children.some(g=>g.name==='lightning-chain'),'no generic lightning fallback');
  if(spec.id==='storm_totem')assert.equal(b.projectiles().length,0,'direct lightning stays a direct hit');
  fx.dispose();
 }
});

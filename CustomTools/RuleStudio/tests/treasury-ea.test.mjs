import test from 'node:test';
import assert from 'node:assert/strict';
import {readRuleFiles} from '../scripts/rule-files.mjs';
import {checkRuleSet,equipmentDocument,equipmentRandom,availableSkills,readTraitText,newBuild,RuleHost,traitTierProfile} from '../engine/index.mjs';
import {rollEquipment} from '../public/equipment-generation.mjs';
import {Battle} from '../public/sim/battle.mjs';
import {createBattleEffects} from '../public/vfx/battle-effects.mjs';
import {createBatch} from '../public/prefabs/royal-treasury/ea.mjs';
import * as T from '../public/vendor/three.module.js';

const files=readRuleFiles(),check=checkRuleSet(files);assert.ok(check.ok,check.error);
const tick=(b,n)=>{for(let i=0;i<n;i++)b.step(1/60);};
const near=(a,b,e=.002)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const stock=b=>b.host.world.ownerState.get(`channel:royal_treasury:weapons|o${b.hero.owner}`)||0;
const cast=b=>{b.hero.castClock=10;b.combat.cooldown=0;b.hero.casting=true;b.step(1/60);b.hero.casting=false;};
function fixture({levels=10,fx=false,weapon='royal_key',target=true}={}){
  const item=rollEquipment(check.collections.equipment.get(weapon).doc,check.library,{uid:'ea_test_weapon',random:equipmentRandom(57)});
  const b=new Battle(files,{collections:check.collections,instances:{[item.uid]:item},maxMonsters:0,spawnRate:0,god:true,seed:63});
  b.setLoadout({skills:['royal_treasury','treasury_enuma_elish'],equipment:{weapon:item.uid}});
  if(target){b.spawnMonsters(1);Object.assign(b.monsters[0],{x:800,y:0,health:1e7,maxHealth:1e7,shield:0,maxShield:0,speed:0,cooldown:999,attackRange:0,resistance:[0,0,0,0]});}
  b.setAim(800,0);for(let i=0;i<levels;i++)cast(b);
  b.select(1);const events=[],rows=[];
  const trace=b.host.world.trace;b.host.world.trace=(kind,p)=>{trace?.(kind,p);events.push({kind,p});};
  b.onDamageDealt=row=>rows.push(row);
  const visual=fx?createBattleEffects(T,new T.Scene()):null;visual?.update(b);
  return {b,events,rows,visual};
}

test('宝库武器仍只绑定一个主技能，由收纳特性授予专属主动；旧实例也能读取',()=>{
  for(const id of ['royal_key','treasury_sovereign_staff']){
    const template=check.collections.equipment.get(id).doc;
    assert.deepEqual(template.skills,['royal_treasury']);
    const item=rollEquipment(template,check.library,{uid:id,random:equipmentRandom(57)});
    assert.deepEqual(equipmentDocument(item,check.collections).skills,['royal_treasury']);
    assert.ok(availableSkills({}, {weapon:id},check.collections,{[id]:item}).some(s=>s.id==='treasury_enuma_elish'));
  }
  assert.ok(!availableSkills({treasury_enuma_elish:true},{},check.collections).some(s=>s.id==='treasury_enuma_elish'));
  for(const spec of Object.values(traitTierProfile(check.library,'treasury_enuma_elish').params))assert.equal(spec.tiers.length,10);
});

test('消耗全部层数形成独立快照，真实巨剑从头顶飞向点击位置；空库存不出剑',()=>{
  const {b}=fixture({levels:10,target:false});assert.equal(stock(b),10);cast(b);assert.equal(stock(b),0);
  const shot=b.projectiles().find(p=>p.kind==='treasury_ea');assert.ok(shot);assert.ok(shot.z>500);
  const c=b.host.world.carriers,index=Array.from({length:c.num},(_,i)=>i).find(i=>c.id[i]===shot.id),root=b.host.world.roots[c.root[index]];
  near(root.damageMultiplier,6);near(root.targetPoint.x,8);near(root.targetPoint.y,0);
  tick(b,60);assert.ok(!b.projectiles().some(p=>p.kind==='treasury_ea'));assert.equal(b.host.world.emitters.entries.size,0);
  cast(b);assert.ok(!b.projectiles().some(p=>p.kind==='treasury_ea'));assert.equal(stock(b),0);
});

test('王权武器的40层能全部消耗；终结技不会先补层，也不会被自己的命中重新启动',()=>{
  const {b}=fixture({levels:40,weapon:'treasury_sovereign_staff'});assert.equal(stock(b),40);cast(b);assert.equal(stock(b),0);
  const c=b.host.world.carriers,index=Array.from({length:c.num},(_,i)=>i).find(i=>b.host.world.plans[b.host.world.roots[c.root[i]].plan].kindNames.names[c.kind[i]]==='treasury_ea');
  assert.notEqual(index,undefined);near(b.host.world.roots[c.root[index]].damageMultiplier,21);
  tick(b,60);assert.equal(stock(b),0);assert.equal(b.host.world.emitters.entries.size,0);
});

test('层数倍率放大基础伤害及装备点伤，消耗后继续独立飞行；表现不改变规则战果',()=>{
  const run=fx=>{const {b,rows,visual}=fixture({levels:10,fx});cast(b);visual?.update(b);
    const id=b.projectiles().find(p=>p.kind==='treasury_ea').id;
    const c=b.host.world.carriers,root=c.root[Array.from({length:c.num},(_,i)=>i).find(i=>c.id[i]===id)];
    for(let i=0;i<65;i++){b.step(1/60);visual?.update(b);}
    const damage=rows.filter(row=>row.Info?.rootIndex===root);
    assert.ok(damage.some(row=>row.Info.sourceId===id&&row.Amount>=32*6));
    assert.ok(damage.filter(row=>row.Info.sourceId!==id).reduce((sum,row)=>sum+row.Amount,0)>=4*6,'装备点伤也放大6倍');
    const result={hash:b.host.world.stateHash(),damage:b.damageDealt,stock:stock(b)};visual?.dispose();return result;};
  assert.deepEqual(run(true),run(false));
});

test('通用 multiply_damage 支持消耗快照，包含附加点伤，根释放后新施法不串倍率',()=>{
  const make=withScale=>readTraitText(JSON.stringify({id:withScale?'scaled':'normal',rules:[{id:'cast',event:'cast',actions:[
    ...(withScale?[{op:'multiply_damage',value:6}]:[]),{op:'damage_area',radius:2,amount:32,element:'physical'}
  ]},{id:'flat',event:'hit',actions:[{op:'damage_target',amount:4,element:'physical',emitEvent:'flat_hit'}]}]})).trait;
  const h=new RuleHost(),owner=h.registerOwner(1,0);
  const scaled=h.compileSource(newBuild('scaled',[make(true)])).plan,normal=h.compileSource(newBuild('normal',[make(false)])).plan;
  h.beginTargets();h.addTarget({x:0,y:0,z:0},45,1e6,1,2);
  h.castBuild(scaled,owner,{x:0,y:0,z:0},{x:1,y:0,z:0});const rows=h.stepFrame(1/60);
  assert.deepEqual(rows.map(r=>r.Amount),[192,24]);
  h.castBuild(normal,owner,{x:0,y:0,z:0},{x:1,y:0,z:0});assert.deepEqual(h.stepFrame(1/60).map(r=>r.Amount),[32,4]);
  assert.equal(h.loadRuleLibrary([{path:'Traits/invalid.json',text:JSON.stringify({id:'invalid',rules:[{id:'cast',event:'cast',actions:[{op:'multiply_damage',value:6}]}]})}]).ok,false);
});

test('巨剑预制体只读真实起点，巨大法阵先撑开，飞剑由阵面逐渐穿出，清理后无残留',()=>{
  const batch=createBatch(T,2),launch={x:0,y:6,z:0,dx:1,dy:-.5,dz:0};
  batch.update([{...launch,radius:.6,launch}],0,[{...launch,age:0}]);
  const [sword,portal]=batch.group.children,matrix=new T.Matrix4();portal.getMatrixAt(0,matrix);const start=new T.Vector3().setFromMatrixScale(matrix).x;
  batch.update([{...launch,x:1,radius:.6,launch}],.06,[{...launch,age:.06}]);
  portal.getMatrixAt(0,matrix);assert.ok(new T.Vector3().setFromMatrixScale(matrix).x>start*30);
  assert.ok(sword.geometry.attributes.emerged.getX(0)>0);batch.update([],1,[]);assert.equal(sword.count,0);assert.equal(portal.count,0);batch.dispose();assert.equal(batch.group.children.length,0);
});

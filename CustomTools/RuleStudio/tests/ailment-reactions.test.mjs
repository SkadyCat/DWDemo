import test from 'node:test';
import assert from 'node:assert/strict';
import { readRuleFiles } from '../scripts/rule-files.mjs';
import { RuleHost, checkRuleSet, readTraitText, newBuild, statusKey, parseCollection,
  equipmentAffixPool, createTraitValueEntry, validateTraitValueEntry } from '../engine/index.mjs';
import { Battle } from '../public/sim/battle.mjs';
import { affixText } from '../public/affix-text.mjs';
import * as THREE from '../public/vendor/three.module.js';
import { createBattleEffects } from '../public/vfx/battle-effects.mjs';

const files=readRuleFiles(), checked=checkRuleSet(files);
assert.ok(checked.ok,checked.error);
const reactions=[
  {id:'chill_consume_burst',key:'chill',element:1,radius:1.5,victims:[1,2]},
  {id:'shock_consume_strike',key:'shock',element:2,radius:3,victims:[1,2,3]},
  {id:'freeze_consume_shards',key:'freeze',element:1,radius:5,victims:[1,2,3,4]},
];
function fixture(ids) {
  const h=new RuleHost();assert.ok(h.loadRuleLibrary(files).ok);
  const probe=readTraitText(JSON.stringify({id:'reaction_probe',rules:[{id:'probe',event:'cast',actions:[{op:'damage_area',element:'physical',radius:.1,amount:1}]}]}));
  assert.ok(probe.trait,probe.error);
  const compiled=h.compileSource(newBuild('reaction_probe',[probe.trait,...ids.map(id=>checked.library.trait(id).source)]));
  assert.ok(compiled.plan>=0,compiled.error);
  const owner=h.registerOwner(100,0),areas=[];
  h.world.trace=(kind,p)=>{if(kind==='area'&&ids.includes(p.effect))areas.push({...p});};
  const targets=[{id:1,y:0,team:1},{id:2,y:125,team:1},{id:3,y:275,team:1},{id:4,y:475,team:1},{id:5,y:650,team:1},{id:6,y:75,team:0}];
  const tick=()=>{h.beginTargets();for(const target of targets)h.addTarget({x:500,y:target.y,z:60},10,100000,target.team,target.id);const rows=h.stepFrame(1/60);h.drainDamage();return rows;};
  tick();
  const apply=(key,id=1,duration=5)=>h.applyStatus(id,key,key==='freeze'?1:30,duration);
  const hit=()=>{h.castBuild(compiled.plan,owner,{x:500,y:0,z:60},{x:1,y:0,z:0});return tick();};
  return {h,areas,apply,hit,tick};
}

for(const reaction of reactions)test(`${reaction.id}: specific status, correct element/radius, no friendly hit or replay`,()=>{
  const f=fixture([reaction.id]);
  for(const key of ['chill','shock','freeze'].filter(key=>key!==reaction.key))f.apply(key);
  f.hit();assert.equal(f.areas.length,0,'other ailments cannot activate it');
  f.apply(reaction.key);const rows=f.hit();
  assert.equal(f.areas.length,1);
  assert.equal(f.areas[0].radius,reaction.radius);assert.equal(f.areas[0].element,reaction.element);
  assert.deepEqual(rows.filter(row=>row.Element===reaction.element).map(row=>row.TargetExternalId).sort(),reaction.victims);
  assert.equal(f.h.world.getStatus(1,statusKey(reaction.key)),0);
  f.hit();assert.equal(f.areas.length,1,'no reactivation until the status is reapplied');
  f.apply(reaction.key);f.hit();assert.equal(f.areas.length,2);
});

test('three reactions compose, consume their own status atomically and cannot recursively consume neighbours',()=>{
  const f=fixture(reactions.map(r=>r.id));
  for(const r of reactions){f.apply(r.key);f.apply(r.key,2);}
  f.hit();assert.equal(f.areas.length,3);
  for(const r of reactions){
    assert.equal(f.h.world.getStatus(1,statusKey(r.key)),0);
    assert.ok(f.h.world.getStatus(2,statusKey(r.key))>0,'secondary blast must leave neighbour statuses available to later real hits');
  }
  for(let i=0;i<90;i++)f.tick();assert.equal(f.areas.length,3);
});

test('actual combat consumes runtime shock layers permanently and emits the existing generic consumption event',()=>{
  const doc=parseCollection('equipment',{id:'reaction_weapon',name:'反应验证',slot:'weapon',rarity:'common',level:1,skills:['player_slash'],traits:reactions.map(r=>({id:r.id}))}).doc;
  const collections={...checked.collections,equipment:new Map([...checked.collections.equipment,[doc.id,{doc}]])};
  const b=new Battle(files,{collections,maxMonsters:0,spawnRate:0,god:false,autoCast:false,seed:18});
  b.setLoadout({skills:['player_slash'],equipment:{weapon:doc.id}});assert.ok(b.hero.plan>=0,b.hero.error);
  b.spawnMonsters(1);const m=b.monsters[0];Object.assign(m,{x:500,y:0,speed:0,cooldown:9999,health:1e7,maxHealth:1e7,shield:0,maxShield:0});b.step(1/60);
  const w=b.host.world,a=b.combat.ailments;let consumed=0;
  const visuals=createBattleEffects(THREE,new THREE.Scene());visuals.update(b);
  const ailment=b.combat.triggers.ailment.bind(b.combat.triggers);
  b.combat.triggers.ailment=(type,...args)=>{if(type==='consumed')consumed++;return ailment(type,...args);};
  a.addShock(m.id,30,5);w.applyStatusKey(m.id,statusKey('chill'),30,5,b.hero.owner);w.applyStatusKey(m.id,statusKey('freeze'),1,5,b.hero.owner);
  const root=b.combat.openRoot();w.hostHit(root,m.id,1,3,5,0);
  b.step(1/60);visuals.update(b);
  const explosions=visuals.group.children.filter(child=>child.name==='element-explosion');
  assert.deepEqual(explosions.map(child=>child.scale.x).sort((a,b)=>a-b),[1.5,5]);
  assert.ok(visuals.group.children.some(child=>child.name==='DeathLightningStrike'&&child.scale.x===3));
  for(let i=0;i<60;i++)b.step(1/60);
  assert.equal(consumed,3);assert.equal(a.shockLayers(m.id),0);
  for(const r of reactions)assert.equal(w.getStatus(m.id,statusKey(r.key)),0);
  visuals.dispose();
});

test('exactly three new passive affixes roll at T1–T10 with stable small/medium/large ranges and numeric descriptions',()=>{
  const pool=equipmentAffixPool(checked.library);
  for(const r of reactions){
    assert.ok(pool.some(a=>a.id===r.id));
    for(let tier=1;tier<=10;tier++){
      const entry=createTraitValueEntry(checked.library,r.id,{tier,random:()=>.5});
      assert.equal(validateTraitValueEntry(checked.library,entry),'');assert.equal(entry.params.radius,r.radius);
      const text=affixText({traits:[entry]},checked.library);assert.ok(text.includes(String(entry.params.damage)),text);assert.ok(text.includes(`${r.radius}米`),text);
    }
  }
});

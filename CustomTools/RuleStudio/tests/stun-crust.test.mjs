import test from 'node:test';
import assert from 'node:assert/strict';
import { readBaselineRuleFiles } from './rule-fixture.mjs';
import { checkRuleSet, equipmentAffixPool, sourceFromEntry } from '../engine/index.mjs';
import { Battle } from '../public/sim/battle.mjs';
import { DungeonBattle } from '../public/sim/dungeon-battle.mjs';

const files=readBaselineRuleFiles(), rules=checkRuleSet(files);
assert.ok(rules.ok,rules.error);
const make=()=>{const b=new Battle(files,{collections:rules.collections,spawnRate:0,maxMonsters:0,stunCrust:true});b.setLoadout({skills:['frost_lance'],equipment:{},belt:[]});b.character.random=()=>.99;return b;};
const hit=(b,amount,dot=false)=>b.combat.heroDamage({amount,element:'physical',dot});
const step=(b,seconds)=>{for(let left=seconds;left>1e-8;){const dt=Math.min(left,1/60);b.step(dt);left-=dt;}};
const near=(a,b)=>assert.ok(Math.abs(a-b)<.025,`${a} != ${b}`);

test('stun overlay grows with buildup over maximum life, independently of integrity and current life',()=>{
 const b=make(),s=b.stunCrust;near(s.snapshot().buildupFraction,0);
 const max=b.character.maxLife;hit(b,max*.1);const snap=s.snapshot();near(snap.amount,max*.1);near(snap.buildupFraction,.1);near(snap.integrity,.5);
 assert.equal(snap.maxLife,max);assert.ok(b.character.life<max);
 step(b,2.5);near(s.snapshot().buildupFraction,.05);hit(b,s.capacity);near(s.snapshot().buildupFraction,.2);
});

test('3D fixed character equipment supplies the composed crust rules without random affixes',()=>{
 const b=make(),s=b.stunCrust.snapshot();assert.equal(s.enabled,true);near(s.capacity,b.character.maxLife*.2);
 assert.equal(b.stunCrust.duration,.5);assert.equal(b.stunCrust.restore,3);assert.equal(b.stunCrust.decay,3);
 assert.ok(!equipmentAffixPool(rules.library).some(a=>a.id.startsWith('player_stun_')));
});
test('resolved hits wear the earth layer; exact empty fractures and interrupts casting for half a second',()=>{
 const b=make(),s=b.stunCrust,limit=s.snapshot().capacity;
 b.hero.casting=true;b.hero.castClock=.25;hit(b,limit/2);near(s.snapshot().integrity,.5);assert.equal(b.hero.casting,true);
 hit(b,limit/2-1);assert.equal(s.phase,'ready');hit(b,1);
 assert.equal(s.phase,'broken');near(s.snapshot().integrity,0);near(b.character.stunned,.5);assert.equal(b.hero.casting,false);assert.equal(b.hero.castClock,0);assert.equal(b.dodge(),false);
 const casts=b.hero.casts;b.hero.casting=true;step(b,.45);assert.equal(b.hero.casts,casts);assert.ok(b.character.stunned>0);
 step(b,.07);assert.equal(b.character.stunned,0);assert.equal(s.phase,'restoring');
});
test('a broken layer waits one hit-free second, recovers in three seconds, and new hits interrupt recovery',()=>{
 const b=make(),s=b.stunCrust;hit(b,s.snapshot().capacity);step(b,1);near(s.snapshot().integrity,0);
 assert.equal(b.character.stunned,0);assert.equal(s.phase,'restoring');step(b,1.5);near(s.snapshot().integrity,.5);
 const life=b.character.life;hit(b,10);assert.ok(b.character.life<life);assert.equal(s.breaks,1);
 const remaining=s.snapshot().remaining;step(b,1);near(s.snapshot().remaining,remaining);
 step(b,3);assert.equal(s.phase,'ready');near(s.snapshot().integrity,1);
 hit(b,s.capacity);assert.equal(s.breaks,2);
});
test('shield-only hits accumulate the full pre-shield damage and can stun at full life',()=>{
 const b=make(),c=b.character,s=b.stunCrust;
 c.setSheet([...b.defenseSheetEntries,...[
  ['shield_base',1000],['shield_bypass',10],['shield_taken_physical',50],
 ].map(([id,n])=>({source:sourceFromEntry(rules.library,{id,params:{n}}),equipment:true}))]);
 c.shield=c.maxShield;
 hit(b,1,true);near(s.amount,0);
 const life=c.life,shield=c.shield,limit=s.snapshot().capacity;
 hit(b,limit/2);near(c.life,life);near(s.amount,limit/2);near(shield-c.shield,limit/4);
 assert.ok(c.shield<shield);near(s.snapshot().integrity,.5);
 hit(b,limit/2);near(c.life,life);assert.equal(s.phase,'broken');near(c.stunned,.5);
 assert.ok(c.shield>0);assert.equal(s.breaks,1);
});
test('unbroken damage holds for one second then recovers over three seconds; DOT does not build the bar',()=>{
 const b=make(),s=b.stunCrust;hit(b,40);hit(b,1,true);near(s.amount,40);step(b,1);near(s.amount,40);step(b,1.5);near(s.amount,20);step(b,1.5);near(s.amount,0);
 hit(b,20);hit(b,10000);assert.equal(b.character.dead,true);assert.equal(s.amount,0);assert.equal(s.phase,'ready');
 b.respawn();near(s.snapshot().integrity,1);
});

test('DOT and zero-damage hits neither deplete the layer nor postpone recovery',()=>{
 const b=make(),s=b.stunCrust;hit(b,40);step(b,.75);hit(b,1,true);hit(b,0);step(b,.25);near(s.amount,40);
 for(let i=0;i<6;i++){hit(b,1,true);step(b,.5);near(s.amount,40*(1-(i+1)/6));}
 near(s.snapshot().remaining,s.capacity);assert.equal(s.breaks,0);
});

test('hits against an empty layer reset recovery delay without repeatedly stunning',()=>{
 const b=make(),s=b.stunCrust;hit(b,s.snapshot().capacity);step(b,.2);
 const stun=b.character.stunned;hit(b,1);near(b.character.stunned,stun);assert.equal(s.breaks,1);
 step(b,.8);near(s.snapshot().integrity,0);assert.equal(b.character.stunned,0);
 step(b,.2);near(s.snapshot().integrity,0);step(b,1.5);near(s.snapshot().integrity,.5);
 hit(b,s.capacity);assert.equal(s.breaks,2);near(b.character.stunned,.5);
});

test('clearing the dungeon keeps stun recovery running without restarting combat or healing resources',()=>{
 for(const broken of [false,true]){
  const b=new DungeonBattle(files,{collections:rules.collections,seed:18,stunCrust:true});
  b.setLoadout({skills:[],equipment:{},belt:[]});b.character.random=()=>.99;b.step(0);
  hit(b,broken?b.stunCrust.snapshot().capacity:40);b.boss.health=0;b.step(0);
  assert.equal(b.phase,'cleared');const c=b.character,life=c.life,shield=c.shield,mana=c.mana,casts=b.hero.casts,kills=b.kills,elapsed=b.elapsed;
  step(b,2.5);near(b.stunCrust.snapshot().integrity,broken?.5:.75);assert.equal(c.stunned,0);assert.equal(b.hero.stunned,false);assert.equal(b.host.getStatus(b.heroTargetId,'stun'),0);
  step(b,1.5);near(b.stunCrust.snapshot().integrity,1);assert.equal(b.stunCrust.phase,'ready');
  assert.deepEqual({life:c.life,shield:c.shield,mana:c.mana,casts:b.hero.casts,kills:b.kills,elapsed:b.elapsed},{life,shield,mana,casts,kills,elapsed});
 }
});

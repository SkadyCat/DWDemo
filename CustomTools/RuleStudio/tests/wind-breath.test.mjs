import test from 'node:test';
import assert from 'node:assert/strict';
import { readBaselineRuleFiles } from './rule-fixture.mjs';
import { checkRuleSet } from '../engine/index.mjs';
import { Battle } from '../public/sim/battle.mjs';
import { buildSkillType } from '../engine/skill-types.mjs';
const files=readBaselineRuleFiles(),rules=checkRuleSet(files);
assert.ok(rules.ok,rules.error);
const near=(a,b)=>assert.ok(Math.abs(a-b)<.002,`${a} != ${b}`);
const step=(b,n=1)=>{for(let i=0;i<n;i++)b.step(1/60);};
function make(enabled=true){
 const b=new Battle(files,{collections:rules.collections,spawnRate:0,maxMonsters:0});
 b.setLoadout({skills:['earth_wave'],equipment:{ring:'wind_breath_ring'},belt:['aura:wind_breath'],activeAuras:enabled?['wind_breath']:[]});
 b.character.random=()=>.99;b.hero.casting=false;return b;
}
test('wind breath is a composable equipment-granted aura with existing reservation',()=>{
 const b=make();assert.equal(buildSkillType(b.host.library,'wind_breath'),'aura');
 assert.equal(b.character.stat('retaliation.hit_percent'),80);assert.equal(b.character.stat('mana.reserved_percent'),50);
 assert.equal(b.combat.retaliation.emitted,0);
});
test('original damage survives mitigation and shield; dot/disabled do not retaliate',()=>{
 const b=make();b.character.maxShield=500;b.character.shield=500;b.character.base.bypass=0;
 const taken=b.combat.heroDamage({amount:20,originalDamage:100,element:'physical'});
 assert.ok(taken.shieldLost>0);near(b.combat.retaliation.waves[0].amount,80);
 b.combat.heroDamage({amount:1,originalDamage:100,element:'physical',dot:true});assert.equal(b.combat.retaliation.emitted,1);
 const off=make(false);off.combat.heroDamage({amount:20,element:'physical'});assert.equal(off.combat.retaliation.emitted,0);
});
test('separate landed attacks create separate wind waves without an invented cooldown',()=>{
 const b=make();b.combat.heroDamage({amount:10,originalDamage:100,element:'physical'});
 b.combat.heroDamage({amount:10,originalDamage:50,element:'physical'});
 assert.equal(b.combat.retaliation.waves.length,2);assert.deepEqual(b.combat.retaliation.waves.map(w=>w.amount),[80,40]);
});
test('wind expands radially, hits each enemy once, excludes outside and cleans up',()=>{
 const b=make();
 for(let i=0;i<4;i++){
  const angle=i*Math.PI/2,r=i===3?8:1+i;
  const id=100+i,x=b.hero.x/100+Math.cos(angle)*r,y=b.hero.y/100+Math.sin(angle)*r;
  const owner=b.host.world.addOwner(id,1);b.host.world.targets.add(x,y,.6,.2,1000,1,id);
  b.monsters.push({id,owner,x:x*100,y:y*100,health:1000,maxHealth:1000,shield:0,maxShield:0,radius:20,speed:0,kind:'monster'});
 }
 step(b);const before=b.monsters.map(m=>m.health);b.combat.heroDamage({amount:10,originalDamage:100,element:'physical'});
 step(b);assert.ok(b.monsters.every((m,i)=>m.health===before[i]),'no instant full-radius hit');
 step(b,40);for(let i=0;i<4;i++)near(before[i]-b.monsters[i].health,i===3?0:80);
 assert.equal(b.combat.retaliation.waves.length,0);step(b,30);for(let i=0;i<4;i++)near(before[i]-b.monsters[i].health,i===3?0:80);
});

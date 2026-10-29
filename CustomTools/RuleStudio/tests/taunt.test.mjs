import test from 'node:test';
import assert from 'node:assert/strict';
import { readBaselineRuleFiles } from './rule-fixture.mjs';
import { checkRuleSet,equipmentAffixPool,readTraitText,newBuild,availableSkills } from '../engine/index.mjs';
import { Battle } from '../public/sim/battle.mjs';
const files=readBaselineRuleFiles(),rules=checkRuleSet(files);
assert.ok(rules.ok,rules.error);
const make=()=>{const b=new Battle(files,{collections:rules.collections,spawnRate:0,maxMonsters:0,stunCrust:true});b.setLoadout({skills:['taunt','frost_lance'],equipment:{},belt:[]});b.character.random=()=>.99;return b;};
const step=(b,seconds)=>{for(let t=0;t<seconds-1e-8;t+=1/60)b.step(Math.min(1/60,seconds-t));};
const cast=b=>{const n=b.hero.casts;b.hero.casting=true;for(let k=0;k<60&&b.hero.casts===n;k++)b.step(1/60);b.hero.casting=false;assert.equal(b.hero.casts,n+1);};
const near=(a,b,e=.04)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
function probe(b,team=1){
 const source=readTraitText(JSON.stringify({id:'taunt_probe',rules:[{id:'emit',event:'cast',actions:[{op:'emit',kind:'probe',element:'void',count:1,speed:5,lifetime:20,radius:.05,damage:10}]}]})).trait;
 const plan=b.host.compileSource(newBuild(source.id,[source])).plan;
 const owner=b.host.registerOwner(9000+team,team),origin={x:b.hero.x+1500,y:b.hero.y+500,z:60},aim={x:0,y:1,z:0};
 b.host.updateOwner(owner,origin,aim);b.host.castBuild(plan,owner,origin,aim,10);
 step(b,1/60);const c=b.host.world.carriers;return c.id[c.num-1];
}
const projectile=(b,id)=>{const c=b.host.world.carriers,i=Array.from(c.id.subarray(0,c.num)).indexOf(id);assert.ok(i>=0);return {i,x:c.px[i],y:c.py[i],vx:c.vx[i],vy:c.vy[i],speed:Math.hypot(c.vx[i],c.vy[i]),life:c.life[i],damage:c.damage[i],owner:c.owner[i]};};
function aimed(b,id){const p=projectile(b,id),dx=b.hero.x/100-p.x,dy=b.hero.y/100-p.y;assert.ok((p.vx*dx+p.vy*dy)/(p.speed*Math.hypot(dx,dy))>.999);return p;}

test('taunt composes self cast, independent recharge and two carried capabilities without random immunity rolls',()=>{
 const b=make();near(b.character.stat('skill.independent_cooldown'),10);assert.equal(b.character.stat('skill.self_target'),1);
 assert.equal(rules.library.trait('create_taunt').source.params.get('duration'),2);
 const excluded=new Set(['self_targeted_cast','independent_skill_cooldown','hostile_projectile_attraction','damage_immunity']);
 assert.ok(!equipmentAffixPool(rules.library).some(a=>excluded.has(a.id)));
 assert.deepEqual(rules.library.statuses.get('taunt').def.traits,['hostile_projectile_attraction','damage_immunity']);
 assert.ok(availableSkills({}, {},rules.collections).some(s=>s.id==='taunt'&&s.granted));
});
test('taunt casts without enemies and grants exact two-second hit/DOT immunity without stun buildup',()=>{
 const b=make();cast(b);near(b.host.getStatus(b.heroTargetId,'taunt'),1);
 const life=b.character.life,shield=b.character.shield;
 b.combat.heroDamage({amount:10000,element:'physical'});b.combat.heroDamage({amount:10000,element:'poison',dot:true});
 near(b.character.life,life);near(b.character.shield,shield);near(b.stunCrust.amount,0);
 step(b,1.9);assert.ok(b.host.getStatus(b.heroTargetId,'taunt')>0);
 step(b,.12);assert.equal(b.host.getStatus(b.heroTargetId,'taunt'),0);
 b.combat.heroDamage({amount:20,element:'physical'});assert.ok(b.character.life<life);near(b.stunCrust.amount,20);
});
test('existing and newborn enemy projectiles home to the caster; allies and delivery metadata stay intact',()=>{
 const b=make(),old=probe(b),friend=probe(b,0),before=projectile(b,old);cast(b);step(b,.05);
 const pulled=aimed(b,old);near(pulled.speed,before.speed);near(pulled.life,before.life);near(pulled.damage,before.damage);assert.equal(pulled.owner,before.owner);
 const ally=projectile(b,friend);near(ally.vx,0);near(ally.vy,5);
 const newborn=probe(b);step(b,.05);aimed(b,newborn);
 step(b,2.1);const after=probe(b);near(projectile(b,after).vx,0);near(projectile(b,after).vy,5);
});
test('ten-second recharge survives slot switches while the other active skill remains usable',()=>{
 const b=make();cast(b);assert.ok(b.combat.cooldown>9.9);
 b.select(1);assert.equal(b.combat.canCast(),true);cast(b);
 b.select(0);assert.equal(b.combat.canCast(),false);const casts=b.hero.casts;b.hero.casting=true;step(b,.4);b.hero.casting=false;assert.equal(b.hero.casts,casts);
 step(b,b.combat.cooldown-.01);assert.equal(b.combat.canCast(),false);step(b,.03);assert.equal(b.combat.canCast(),true);cast(b);assert.ok(b.host.getStatus(b.heroTargetId,'taunt')>0);
});

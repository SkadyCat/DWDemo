import test from 'node:test';
import assert from 'node:assert/strict';
import {readRuleFiles} from '../scripts/rule-files.mjs';
import {checkRuleSet, parseCollection, Projectiles} from '../engine/index.mjs';
import {Battle} from '../public/sim/battle.mjs';

const files=readRuleFiles(),checked=checkRuleSet(files);assert.ok(checked.ok,checked.error);
function fixture({angle=0,speed=24,targets=[{x:0,y:100}],retargets=1,exclude=null}={}){
 const parsed=parseCollection('equipment',{id:'homing_probe',slot:'ring',rarity:'unique',traits:[{id:'proj_retarget',params:{n:retargets}},{id:'proj_homing_turn',params:{n:31}},{id:'proj_homing_range',params:{n:31}}]});assert.ok(parsed.doc,parsed.error);
 const collections={...checked.collections,equipment:new Map([...checked.collections.equipment,[parsed.doc.id,{doc:parsed.doc}]])};
 const b=new Battle(files,{collections,maxMonsters:0,spawnRate:0,god:true,seed:19});
 b.setLoadout({skills:['frost_lance'],equipment:{ring:parsed.doc.id}});
 b.spawnMonsters(targets.length);b.monsters.forEach((m,i)=>Object.assign(m,{health:10000,maxHealth:10000,shield:0,maxShield:0,speed:0,cooldown:999,attackRange:0,radius:10,resistance:[0,0,0,0,0,0]},targets[i]));
 b.step(1/60);
 const p=b.combat.projectiles;
 p.fire({x:0,y:0,dir:angle,speed,life:1.2,radius:.1,damage:10,exclude:exclude===null?null:b.monsters[exclude].id});
 const c=b.host.world.carriers,id=c.id[c.num-1];
 const index=()=>Array.from({length:c.num},(_,i)=>i).find(i=>c.id[i]===id&&!(c.flags[i]&Projectiles.Dead));
 return {b,p,c,id,index,step(dt){b.step(dt);}};
}

for(const fps of [30,60,120])for(const angle of [0,-Math.PI/2])test(`追踪：${fps} FPS、${angle===0?'侧面':'背后'}近距离目标实际命中，不绕圈直到消失`,()=>{
 const f=fixture({angle}),m=f.b.monsters[0];
 const [x,y]=[f.c.px[f.index()],f.c.py[f.index()]];
 f.p.onMotion(f.index(),1/fps);
 assert.deepEqual([f.c.px[f.index()],f.c.py[f.index()]],[x,y],'guidance never teleports the projectile');
 for(let frame=0;frame<fps*1.2&&m.health===m.maxHealth;frame++)f.step(1/fps);
 assert.ok(m.health<m.maxHealth,'must deliver actual swept projectile damage within its original lifetime');
});

test('重新索敌跳过已命中目标，不修改发射位置或重置寿命',()=>{
 const f=fixture({targets:[{x:100,y:0},{x:0,y:150}],exclude:0}),i=f.index(),st=f.p.state.get(f.id);
 const position=[f.c.px[i],f.c.py[i],f.c.pz[i]],origin=[st.x0,st.y0],life=f.c.life[i];
 f.p.onMotion(i,1/60);
 assert.equal(st.target,f.b.monsters[1].id,'do not orbit the excluded/hit target');
 assert.deepEqual([f.c.px[i],f.c.py[i],f.c.pz[i]],position);
 assert.deepEqual([st.x0,st.y0],origin);assert.equal(f.c.life[i],life);
 assert.equal(st.retargets,1,'one initial lock consumes exactly one acquisition');
 f.b.monsters[1].x=1500;f.b.monsters[0].x=100;f.b.monsters[0].y=100;
 f.p.onMotion(i,1/60);
 assert.equal(st.target,-1,'out-of-range lock is released, and old hit cannot be reacquired');
 assert.equal(st.retargets,1,'empty acquisition does not consume the remaining budget');
});

test('近距离拐弯后恢复原飞行速度，转向增益保留，直射不减速',()=>{
 const f=fixture({targets:[{x:0,y:100}]}),i=f.index(),st=f.p.state.get(f.id),dt=1/60;
 f.p.onMotion(i,dt);
 assert.ok(Math.hypot(f.c.vx[i],f.c.vy[i])<24,'brake only while turning too tightly');
 assert.ok(Math.atan2(f.c.vy[i],f.c.vx[i])<=Math.PI*1.31*dt+1e-6,'keep the authored turn-rate limit');
 f.b.monsters[0].x=100;f.b.monsters[0].y=0;f.c.vx[i]=Math.hypot(f.c.vx[i],f.c.vy[i]);f.c.vy[i]=0;
 f.p.onMotion(i,dt);
 assert.ok(Math.abs(Math.hypot(f.c.vx[i],f.c.vy[i])-24)<1e-4,'temporary braking cannot permanently lower speed');
 const straight=fixture({targets:[{x:300,y:0}]}),j=straight.index();straight.p.onMotion(j,dt);
 assert.ok(Math.abs(Math.hypot(straight.c.vx[j],straight.c.vy[j])-24)<1e-4);
 assert.deepEqual([st.x0,st.y0],[0,0]);
});

test('穿透后用剩余一次索敌命中第二个目标，不能绕回第一个目标',()=>{
 const f=fixture({targets:[{x:100,y:0},{x:100,y:100}]}),i=f.index();f.c.pierce[i]=1;
 let switched=false;
 for(let frame=0;frame<72&&f.b.monsters[1].health===10000;frame++){
  f.step(1/60);const st=f.p.state.get(f.id);
  if(st?.target===f.b.monsters[1].id){switched=true;assert.equal(st.retargets,0);assert.deepEqual([st.x0,st.y0],[0,0]);}
 }
 assert.ok(f.b.monsters.every(m=>m.health<10000),'both targets receive real projectile damage');
 assert.ok(switched,'acquire the unhit target after piercing');
});

test('追踪侧向移动的敌人也能命中，不靠传送或延长寿命',()=>{
 const f=fixture(),m=f.b.monsters[0];
 for(let frame=0;frame<72&&m.health===10000;frame++){m.x+=100/60;f.step(1/60);}
 assert.ok(m.health<10000);
});

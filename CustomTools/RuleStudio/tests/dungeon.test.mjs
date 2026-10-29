import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDungeon } from '../public/sim/dungeon.mjs';
import { DungeonBattle, TowerRun } from '../public/sim/dungeon-battle.mjs';
import { readBaselineRuleFiles } from './rule-fixture.mjs';
import { checkRuleSet } from '../engine/index.mjs';
import { TowerPilot } from '../scripts/test-tower.mjs';
const files=readBaselineRuleFiles(), check=checkRuleSet(files);
assert.ok(check.ok,check.error);
const options={seed:18,collections:check.collections,monsterTypes:[...check.monsters.values()].map(e=>e.doc),god:true};
const loadout={skills:['frost_lance'],equipment:{weapon:'test_projectile_weapon'}};
const create=(extra={})=>{const b=new DungeonBattle(files,{...options,...extra});b.setLoadout(loadout);return b;};

test('随机地牢：500 个种子均多房间连通、可复现，首领位于路径最远房间',()=>{
 for(let seed=1;seed<=500;seed++){
  const floor=seed%100+1,m=generateDungeon(seed,floor),all=m.flow(m.entry.x,m.entry.y);
  assert.deepEqual(m.cells,generateDungeon(seed,floor).cells);
  assert.ok(m.rooms.length>=10 && m.rooms.length<=14);
  assert.ok(m.edges.length>=m.rooms.length-1);
  assert.equal(all.filter(n=>n>=0).length,m.tiles.length);
  const d=r=>all[Math.floor(r.centerY)*m.size+Math.floor(r.centerX)];
  assert.equal(d(m.rooms[m.bossRoom]),Math.max(...m.rooms.map(d)));
  assert.notEqual(m.entryRoom,m.bossRoom);
  for(let x=0;x<m.size;x++){assert.equal(m.walkable(x,0),false);assert.equal(m.walkable(x,m.size-1),false);}
 }
 assert.notDeepEqual(generateDungeon(1).cells,generateDungeon(2).cells);
 assert.notDeepEqual(generateDungeon(1,1).cells,generateDungeon(1,2).cells);
});

test('地牢：角色沿墙滑动，投射物真实碰撞墙体',()=>{
 const b=create({seed:13}),map=b.dungeon,from={...map.entry,radius:45};
 for(let i=0;i<500;i++)map.move(from,from.x-20,from.y);
 const stopped=from.x,t=map.tileOf(from.x,from.y);assert.ok(map.walkable(t.x,t.y));
 for(let i=0;i<10;i++)map.move(from,from.x-200,from.y);
 assert.ok(Math.abs(stopped-from.x)<1);assert.ok(map.sweep(from.x,from.y,from.x-500,from.y,22)>=0);
 const plan=b.host.compileNamedBuild('frost_lance').plan,owner=b.hero.owner;
 let total=0;
 function shot(){b.host.castBuild(plan,owner,{x:from.x,y:from.y,z:60},{x:-1,y:0,z:0});for(let i=0;i<100;i++){b.host.beginTargets();b.host.addTarget({x:from.x-600,y:from.y,z:60},40,1000,1,900);for(const row of b.host.stepFrame(1/60))total+=row.Amount;}}
 shot();assert.equal(total,0);assert.equal(b.host.world.carriers.num,0);
 b.host.world.sweepObstacle=null;shot();assert.ok(total>0);
});

test('地牢：20–300 怪一次分布在可行走区域、出生点外10米，只有一个首领',()=>{
 for(const floor of [1,5,12])for(const monsterCount of [20,100,300]){
  // Inspect spawn positions before the 20 m perception range allows movement.
  const b=create({floor,monsterCount});b.step(0);
  assert.equal(b.spawned,monsterCount);assert.equal(b.monsters.length,monsterCount);assert.equal(b.phase,'boss');
  assert.equal(b.monsters.filter(m=>m.boss).length,1);assert.equal(b.boss.roomId,b.dungeon.bossRoom);
  for(const m of b.monsters){assert.ok(Math.hypot(m.x-b.dungeon.entry.x,m.y-b.dungeon.entry.y)>=1000);assert.ok(b.dungeon.sweep(m.x,m.y,m.x,m.y,m.radius)<0);}
  for(let i=0;i<12;i++)b.step(1/60);assert.equal(b.spawned,monsterCount);
 }
 for(const monsterCount of [19,301,20.5])assert.throws(()=>create({monsterCount}),/20–300/);
});

test('地牢：只杀首领即通关，普通怪可存活；传送阵、掉落和奖励仅结算一次',()=>{
 const b=create();b.step(1/60);const boss=b.boss,spot={x:boss.x,y:boss.y};
 let completions=0;b.rewards={onKill(){},complete(){completions++;}};
 boss.health=0;b.step(1/60); // State-machine boundary; real skill kills are exercised below.
 assert.equal(b.phase,'cleared');assert.equal(b.kills,1);assert.equal(b.monsters.length,19);assert.equal(completions,1);
 assert.ok(b.drops.length>0);assert.equal(b.exitPortal.x,spot.x);assert.equal(b.exitPortal.y,spot.y);
 const portal=b.exitPortal,life=b.character.life,elapsed=b.elapsed;b.hero.move={x:1,y:0};const pos=b.hero.x;
 for(let i=0;i<180;i++)b.step(1/60);
 assert.equal(b.exitPortal,portal);assert.equal(completions,1);assert.equal(b.kills,1);assert.equal(b.character.life,life);assert.equal(b.elapsed,elapsed);assert.notEqual(b.hero.x,pos);
});

test('地牢：普通怪全死仍不能通关，死亡/超时都不产生传送阵',()=>{
 const b=create({god:false});b.step(1/60);for(const m of b.monsters)if(!m.boss)m.health=0;b.step(1/60);
 assert.equal(b.kills,19);assert.equal(b.phase,'boss');assert.equal(b.exitPortal,null);
 b.character.takeHit({amount:100000,element:'physical'});b.step(1/60);assert.equal(b.phase,'failed');assert.equal(b.exitPortal,null);
 const timed=create({timeLimitEnabled:true});for(let i=0;i<1800;i++)timed.step(1/60);
 assert.equal(timed.phase,'failed');assert.equal(timed.failureReason,'timeout');assert.equal(timed.exitPortal,null);
 const frozen={elapsed:timed.elapsed,spawned:timed.spawned,life:timed.character.life};timed.step(1/60);
 assert.deepEqual({elapsed:timed.elapsed,spawned:timed.spawned,life:timed.character.life},frozen);
});

test('地牢：导航绕过墙角，沿真实走廊到达所有房间',()=>{
 for(const seed of [3,18,57]){
  const b=create({seed}),h=b.hero;
  for(const room of b.dungeon.rooms){
   const target={x:room.centerX*b.dungeon.tile-b.dungeon.half,y:room.centerY*b.dungeon.tile-b.dungeon.half};
   let i=0;for(;i<6000&&Math.hypot(h.x-target.x,h.y-target.y)>20;i++){const v=b.directionTo(h,target);b.moveActor(h,h.x+v.x*10,h.y+v.y*10);assert.ok(b.dungeon.sweep(h.x,h.y,h.x,h.y,h.radius)<0);}
   assert.ok(i<6000,`seed ${seed} room ${room.id} navigation stuck at ${h.x},${h.y}`);
  }
 }
});

test('爬塔：真实技能击败首领；通关保持当前地图，只能显式旅行到下一张地图',()=>{
 const tower=new TowerRun(files,{...options,autoAdvance:true});tower.setLoadout(loadout);const first=tower.battle,pilot=new TowerPilot();
 for(let i=0;i<22000&&first.phase!=='cleared';i++){pilot.update(first);tower.step(1/60);}
 assert.equal(first.phase,'cleared',`hero ${first.hero.x},${first.hero.y} boss ${first.boss?.health} monsters ${first.monsters.length}`);
 assert.ok(first.damageDealt>0&&first.boss.health<=0&&first.hero.casts>0);assert.ok(first.exitPortal);assert.equal(tower.floor,1);
 for(let i=0;i<200;i++)tower.step(1/60);assert.equal(tower.battle,first);
 tower.options.god=false; first.hero.god=false; first.character.life=123;first.character.mana=17;
 assert.ok(tower.advance());assert.equal(tower.floor,2);assert.equal(tower.battle.exitPortal,null);assert.equal(tower.battle.character.life,123);assert.equal(tower.battle.character.mana,17);
 assert.equal(tower.battle.hero.skill,'frost_lance');assert.equal(tower.battle.host.world.carriers.num,0);assert.notDeepEqual(first.dungeon.cells,tower.battle.dungeon.cells);
});

test('地牢：默认不限时，切换限时保留演员，每张地图有独立倒计时',()=>{
 const tower=new TowerRun(files,options),b=tower.battle;b.step(1/60);const monster=b.monsters[0];
 for(let i=0;i<31*60;i++)tower.step(1/60);assert.equal(b.phase,'boss');assert.equal(b.timeRemaining,Infinity);
 tower.setTimeLimitEnabled(true);assert.ok(Math.abs(b.timeRemaining-30)<1e-6);for(let i=0;i<600;i++)tower.step(1/60);
 tower.setTimeLimitEnabled(true);assert.ok(Math.abs(b.timeRemaining-20)<1e-6);tower.setTimeLimitEnabled(false);
 for(let i=0;i<31*60;i++)tower.step(1/60);assert.equal(b.phase,'boss');assert.equal(b.monsters[0],monster);
 tower.setTimeLimitEnabled(true);b.boss.health=0;tower.step(1/60);assert.ok(tower.advance());assert.equal(tower.battle.timeRemaining,30);
});

test('地牢：最后允许帧的真实致命命中可通关',()=>{
 const b=create({timeLimitEnabled:true});b.step(1/60);
 Object.assign(b.boss,{x:b.hero.x+100,y:b.hero.y,health:1,shield:0});b.hero.aim={x:1,y:0};b.hero.casting=true;b.hero.castClock=1;b.elapsed=30-1/60;
 b.step(1/60);assert.ok(b.damageDealt>0);assert.equal(b.phase,'cleared');assert.equal(b.failureReason,null);assert.equal(b.boss.health,0);assert.ok(b.exitPortal);assert.ok(b.elapsed<=30);
});

test('地牢：基础20米索敌，范围外停止追击与新施法，范围内首领使用真实技能',()=>{
 const b=create(),map=b.dungeon;b.setLoadout({skills:[]});b.step(1/60);
 const boss=b.boss;Object.assign(b.hero,{x:boss.x,y:boss.y+400});
 for(let i=0;i<120;i++)b.step(1/60);
 assert.ok(boss.casts>0);assert.ok(b.canMonsterPursue(boss));
 Object.assign(b.hero,map.entry);assert.equal(b.canMonsterPursue(boss),false);
 const state={x:boss.x,y:boss.y,casts:boss.casts};for(let i=0;i<120;i++)b.step(1/60);
 assert.deepEqual({x:boss.x,y:boss.y,casts:boss.casts},state);
});

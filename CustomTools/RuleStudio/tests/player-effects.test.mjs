import test from 'node:test';
import assert from 'node:assert/strict';
import { RuleHost, statusKey } from '../engine/index.mjs';
import { playerEffects, effectProgress } from '../public/battle-player-effects.mjs';
import { iconSrc } from '../public/game-icons.mjs';

function fixture({layers=false,selfBuff=false}={}) {
  const host = new RuleHost();
  const docs = [
    ['Statuses/poison.json', { id:'poison',name:'中毒',category:'ailment',stacking:'stack',maxStacks:100 }],
    ['Statuses/empower.json', { id:'empower',name:'强化',category:'buff',stacking:'refresh' }],
    ['WebTraits/charge.json', {id:'charge',name:'蓄力',rules:[{id:'add',event:'cast',actions:[layers
      ? {op:'maintain_emitter',key:'charge',channel:'hud',value:1,cap:3,duration:.2,interval:1,decay_interval:.1,event:'pulse',targeting:'aim',radius:0}
      : selfBuff ? {op:'apply_status',key:'empower',origin:'owner',value:1,duration:1}
      : {op:'emit',kind:'probe',count:1,damage:1,speed:0,lifetime:.01}]}]}],
  ];
  const loaded=host.loadRuleLibrary(docs.map(([path,doc])=>({path,text:JSON.stringify(doc)})));assert.ok(loaded.ok,loaded.error);
  const compiled=host.compileTraits('charge',['charge']);assert.ok(compiled.plan>=0,compiled.error);
  const owner=host.registerOwner(1,0);
  const battle={host,heroTargetId:77,hero:{owner},skills:[{id:'charge',name:'蓄力技能',plan:compiled.plan}],
    statusDefs:[{id:'poison',key:statusKey('poison'),name:'中毒',category:'ailment'},{id:'empower',key:statusKey('empower'),name:'强化',category:'buff'}]};
  return {host,battle,owner,plan:compiled.plan,cast:()=>{host.castBuild(compiled.plan,owner,{x:0,y:0,z:0},{x:1,y:0,z:0});host.stepFrame(1/60);}};
}
test('顶部状态只读取玩家异常层数与剩余时间，过期移除且不改变引擎状态',()=>{
  const {host,battle}=fixture();for(let i=0;i<3;i++)host.applyStatus(77,'poison',2,.2);
  host.applyStatus(88,'poison',2,5);const before=host.world.stateHash();
  const [row]=playerEffects(battle);assert.equal(row.label,'中毒');assert.equal(row.stacks,3);assert.equal(row.cap,100);assert.ok(row.remaining>0);
  assert.equal(host.world.stateHash(),before);
  for(let i=0;i<15;i++)host.stepFrame(1/60);assert.deepEqual(playerEffects(battle),[]);
  assert.ok(host.getStatus(88,'poison')>0);
});
test('技能维护层数取玩家所有者，显示衰减倒计时，消耗或衰减完自动移除',t=>{
  if(!fixture().host.world.emitters){t.skip('此引擎版本没有维护层数机制');return;}
  const {host,battle,cast,plan}=fixture({layers:true});cast();cast();cast();
  const enemy=host.registerOwner(2,0);host.castBuild(plan,enemy,{x:0,y:0,z:0},{x:1,y:0,z:0});host.stepFrame(1/60);
  battle.skills[0].id='royal_treasury';
  let rows=playerEffects(battle);assert.equal(rows.length,1);assert.equal(rows[0].label,'蓄力技能');assert.equal(rows[0].stacks,3);assert.equal(rows[0].cap,3);assert.equal(rows[0].timer,'下次减层');
  assert.equal(rows[0].icon,iconSrc('skill','royal_treasury'));assert.equal(rows[0].sourceKind,'技能');assert.ok(rows[0].progress>0&&rows[0].progress<=1);
  const before=host.world.stateHash();playerEffects(battle);assert.equal(host.world.stateHash(),before);
  for(let i=0;i<15;i++)host.stepFrame(1/60);rows=playerEffects(battle);assert.ok(rows[0].stacks<3);assert.ok(rows[0].remaining>=0);
  for(let i=0;i<30;i++)host.stepFrame(1/60);assert.deepEqual(playerEffects(battle),[]);
});
test('倒计时跟随规则时间，暂停保持、刷新重置、过期后重新获得从满圈开始',()=>{
  const {host,battle}=fixture();host.applyStatus(77,'poison',2,1);
  let row=playerEffects(battle)[0];assert.equal(row.progress,1);assert.ok(row.icon.endsWith('/poison.svg'));
  for(let i=0;i<30;i++)host.stepFrame(1/60);row=playerEffects(battle)[0];assert.ok(row.progress>.49&&row.progress<.51);
  assert.equal(playerEffects(battle)[0].progress,row.progress);
  host.applyStatus(77,'poison',2,1);assert.equal(playerEffects(battle)[0].progress,1);
  for(let i=0;i<65;i++)host.stepFrame(1/60);assert.deepEqual(playerEffects(battle),[]);
  host.applyStatus(77,'poison',2,.5);assert.equal(playerEffects(battle)[0].progress,1);
  assert.equal(effectProgress(null,{remaining:.1,duration:.2,expiresAt:1}).progress,.5);
});
test('明确来源的自身技能增益复用技能图标，敌方施加同名状态不误用玩家图标',()=>{
  const {host,battle,cast,owner}=fixture({selfBuff:true});battle.skills[0].id='frost_lance';
  host.world.owners[owner].statusId=77;cast();
  let row=playerEffects(battle)[0];assert.equal(row.icon,iconSrc('skill','frost_lance'));assert.equal(row.sourceName,'蓄力技能');
  const enemy=host.registerOwner(2,0);host.world.applyStatusKey(77,statusKey('empower'),1,1,enemy);
  row=playerEffects(battle)[0];assert.equal(row.icon,'/assets/player-effects/buff.svg');assert.equal(row.sourceKind,'状态');
});
test('临时增益与药剂来源独立显示，相同来源合并，眩晕不重复列出',()=>{
  const {host,battle}=fixture();host.applyStatus(77,'empower',1,2);
  host.grantTraits(77,['charge'],.2,'药剂增益');host.grantTraits(77,['charge'],.3,'药剂增益');
  let rows=playerEffects(battle);assert.equal(rows.length,2);assert.equal(rows.filter(r=>r.label==='药剂增益').length,1);
  assert.ok(rows.find(r=>r.label==='药剂增益').remaining>=.29);
  battle.hero.stunned=true;battle.character={stunned:.5};assert.equal(playerEffects(battle).filter(r=>r.label==='眩晕').length,1);
  for(let i=0;i<20;i++)host.stepFrame(1/60);assert.equal(playerEffects(battle).some(r=>r.label==='药剂增益'),false);
});

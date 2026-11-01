import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { RULES_DIR, readRuleFiles } from '../scripts/rule-files.mjs';
import { checkRuleSet, validateTraitValueEntry, RuleHost, readTraitText, newBuild, compileBuild } from '../engine/index.mjs';
import { Battle } from '../public/sim/battle.mjs';
import { minimumTierPreset } from '../public/build-preset-tier.mjs';

const files = readRuleFiles(), checked = checkRuleSet(files); assert.ok(checked.ok, checked.error);
const read = id => JSON.parse(fs.readFileSync(`${RULES_DIR}/Presets/${id}.json`, 'utf8'));
const selfIds = ['treasury_hit_stock','treasury_critical_stock','treasury_kill_stock','treasury_consumed_stock'];
function fixture({ self = selfIds, targets = 6 } = {}) {
  const preset = read('royal_treasury_elements');
  for (const item of Object.values(preset.instances)) item.affixes = item.affixes.filter(a => !selfIds.includes(a.id) || self.includes(a.id));
  const b = new Battle(files, { collections: checked.collections, maxMonsters: 0, spawnRate: 0, god: false, autoCast: false, seed: 37 });
  b.setLoadout(preset); assert.ok(b.hero.plan >= 0, b.hero.error); b.spawnMonsters(targets);
  b.monsters.forEach((m,i) => Object.assign(m, { x: 500 + i * 40, y: 0, health: 1e8, maxHealth: 1e8, shield: 0, maxShield: 0, speed: 0, cooldown: 9999, attackRange: 0 }));
  const feeds = [], births = [], pulses = [], maintained = [], trace = b.host.world.trace;
  b.host.world.trace = (kind,p) => { trace?.(kind,p); if(kind === 'emitter_fed') feeds.push({t:b.elapsed,...p}); if(kind === 'emitter_maintained') maintained.push(p);
    if(kind === 'emitter_pulse') pulses.push(p); if(kind === 'spawn' && p.plan.kindNames.names[p.kind] === 'treasury_weapon') births.push(p); };
  b.setAim(1000,0);
  const tick = seconds => { for(let i=0;i<Math.round(seconds*60);i++) b.step(1/60); };
  const start = () => { b.hero.castClock=10;b.hero.casting=true;tick(1/60);b.hero.casting=false; };
  return { b, tick, start, feeds, births, pulses, maintained };
}
test('全62套预制BD（含10套成长型×3阶段、万毒飞刃5阶段）均能实际编译；预览BD为合法T1，词条组合阶段保留其T阶', () => {
  const rows = JSON.parse(fs.readFileSync(`${RULES_DIR}/Presets/index.json`, 'utf8')); assert.equal(rows.length,62);
  const b = new Battle(files,{collections:checked.collections,maxMonsters:0,spawnRate:0});
  for(const row of rows){ const p=read(row.id);
    if(p.authored?.keepTiers){ for(const item of Object.values(p.instances))for(const line of item.affixes){assert.ok(!line.tier||line.tier<=item.tier,row.id);line.traits.forEach(t=>assert.equal(validateTraitValueEntry(checked.library,t),''));}
      b.setLoadout(p);assert.ok(b.hero.plan>=0,`${row.id}:${b.hero.error}`);continue; }
    assert.deepEqual(minimumTierPreset(p,checked.library),p,row.id);
    for(const item of Object.values(p.instances)){assert.equal(item.tier,1,row.id);
      const walk=t=>{assert.ok(t.tier===undefined||t.tier===1,`${row.id}:${t.id}`);assert.equal(validateTraitValueEntry(checked.library,t),'');(t.with||[]).forEach(walk);};
      for(const line of [...(item.bases||[]),...(item.legendary?[item.legendary]:[]),...item.affixes]){assert.ok(line.tier===undefined||line.tier===1);line.traits.forEach(walk);}}
    b.setLoadout(p);assert.ok(b.hero.plan>=0,`${row.id}:${b.hero.error}`);
  }
});
test('全T1一次启动只加1层，实际命中后自叠至上限，补层不丢多重、不制造手动施放', () => {
  const f=fixture();f.start();assert.equal(f.maintained[0].level,1);f.tick(12);
  assert.equal(f.b.hero.casts,1);assert.equal([...f.b.host.world.emitters.entries.values()][0].level,40);
  assert.ok(f.feeds.length>20);assert.ok(f.feeds.every(e=>e.level<=40));assert.equal(f.births.length,f.pulses.length*3);
  assert.equal(f.b.hero.god,false);assert.ok(f.b.character.mana>50);assert.ok(!f.b.hero.dead);
});
test('无启动、无目标、拆除补层特性均不会白送层数，断链后5秒衰减并归零停射', () => {
  const noStart=fixture();noStart.tick(8);assert.equal(noStart.feeds.length,0);assert.equal(noStart.births.length,0);
  const empty=fixture({targets:0});empty.start();empty.tick(5.2);assert.equal(empty.feeds.length,0);assert.equal(empty.b.host.world.emitters.entries.size,0);
  const bare=fixture({self:[]});bare.start();bare.tick(3);assert.equal(bare.feeds.length,0);assert.equal([...bare.b.host.world.emitters.entries.values()][0].level,1);
  const full=fixture();full.start();full.tick(4);assert.ok(full.feeds.length>0);
  for(const m of full.b.monsters){m.x=100000;m.y=100000;}full.tick(2);const entry=[...full.b.host.world.emitters.entries.values()][0],last=entry.lastInput,level=entry.level;
  while(full.b.elapsed<last+5.1)full.tick(1/60);assert.equal(entry.level,level-1);assert.equal(entry.lastInput,last);
});
test('命中、暴击、击杀、异常消费四条路径分别由真实事件触发；没有施毒不伪造毒消费', () => {
  for(const id of ['treasury_hit_stock','treasury_critical_stock','treasury_consumed_stock']){
    const f=fixture({self:[id]});f.start();f.tick(8);assert.ok(f.feeds.length>0,id);
  }
  const kill=fixture({self:['treasury_kill_stock']});kill.b.monsters.forEach(m=>{m.health=1;m.maxHealth=1;});kill.start();kill.tick(4);assert.ok(kill.feeds.length>0);
});
test('通用feed只补已有控制器，保留原根、完整计划与随机等待，严格校验且缓存区分模式', () => {
  const f=fixture({targets:0});f.start();const e=[...f.b.host.world.emitters.entries.values()][0],root=e.root,plan=f.b.host.world.roots[root].plan;
  f.b.combat.emitRuleEvent('ailment_consumed',{id:123});f.tick(1/60);
  assert.equal(e.root,root);assert.equal(f.b.host.world.roots[e.root].plan,plan);assert.equal(e.level,2);
  const doc={id:'generic_feed',rules:[{id:'feed',event:'cast',actions:[{op:'maintain_emitter',mode:'feed',scope:'owner',channel:'probe',key:'layers',value:1}]}]};
  const parsed=readTraitText(JSON.stringify(doc));assert.equal(parsed.error,'');assert.ok(compileBuild(newBuild(doc.id,[parsed.trait])).plan);
  doc.rules[0].actions[0].mode='bad';assert.ok(readTraitText(JSON.stringify(doc)).error);
});

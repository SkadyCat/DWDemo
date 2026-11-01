import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readRuleFiles } from '../scripts/rule-files.mjs';
import { checkRuleSet, createProgression, progressionLoadout, equipmentRandom, rollEquipmentDrop, rerollEquipment, validateTraitValueEntry, parseCollection } from '../engine/index.mjs';
import { EMBERS_ECHO_GRADES, createEmbersEchoEquipment, createEmbersEchoPreset } from '../scripts/create-embers-echo-bds.mjs';
import { groupBuildPresets } from '../public/build-preset-menu.mjs';
import { applyBuildPreset } from '../public/build-presets.mjs';
import { Battle } from '../public/sim/battle.mjs';
import { AverageTargetDps } from '../public/sim/damage-meter.mjs';

const files=readRuleFiles(), check=checkRuleSet(files);
assert.ok(check.ok, check.error);
const root=new URL('../../../Content/Rules/Presets/',import.meta.url);
const presets=EMBERS_ECHO_GRADES.map(c=>JSON.parse(fs.readFileSync(new URL(c.id+'.json',root),'utf8')));
const index=JSON.parse(fs.readFileSync(new URL('index.json',root),'utf8'));
const inherent=item=>[...item.bases.flatMap(b=>b.traits),...item.legendary.traits];

test('余烬回响：二级菜单仅分五档，成长型十一套同组，其余流派各保留一档，不改变原始列表',()=>{
  const before=structuredClone(index), groups=groupBuildPresets(index);
  assert.equal(groups.filter(g=>g.id==='embers_echo').length,1);
  for(const group of groups)assert.equal(group.rows.length,group.id==='embers_echo'?5:group.id==='growth'?11:1);
  assert.deepEqual(groups.find(g=>g.id==='embers_echo').rows.map(r=>r.grade),[1,2,3,4,5]);
  const shuffled=groupBuildPresets([...index].reverse().map(r=>({...r,equipped:r.id==='embers_echo_3'})));
  assert.equal(shuffled.find(g=>g.id==='embers_echo').equipped,true);
  assert.deepEqual(shuffled.find(g=>g.id==='embers_echo').rows.map(r=>r.grade),[1,2,3,4,5]);
  assert.deepEqual(index,before);
});

test('余烬回响：五档全部T10，同名固有词条数值完全相同，逐档只补充机制',()=>{
  const values=new Map(), previous=new Map();
  const counts=[];
  for(const [i,preset] of presets.entries()){
    const count=new Map();
    assert.equal(preset.authored.valueTier,undefined);
    for(const item of Object.values(preset.instances)){
      assert.equal(item.tier,10);assert.equal(item.rarity,'legendary');
      assert.equal(item.legendary.traits.length,1);assert.equal(item.affixes.length,5);
      const entries=inherent(item), old=previous.get(item.slot)||[];
      for(const entry of old)assert.ok(entries.some(t=>JSON.stringify(t)===JSON.stringify(entry)),`${i+1} ${entry.id}`);
      previous.set(item.slot,entries);
      for(const entry of entries){
        assert.equal(validateTraitValueEntry(check.library,entry),'');
        const value=JSON.stringify(entry);
        if(values.has(entry.id))assert.equal(value,values.get(entry.id),entry.id);
        values.set(entry.id,value);count.set(entry.id,(count.get(entry.id)||0)+1);
      }
    }
    assert.equal(count.get('trig_mana_restored'),1);
    assert.equal(count.get('trigger_resource_reduction'),3);
    counts.push(count);
  }
  assert.deepEqual(counts.map(c=>c.get('area_repeats')||0),[0,2,3,3,3]);
  assert.deepEqual(counts.map(c=>c.get('area_repeat_interval')||0),[0,0,2,2,2]);
  assert.deepEqual(counts.map(c=>c.get('fire_base')||0),[0,0,0,3,3]);
  assert.deepEqual(counts.map(c=>c.get('fire_pen')||0),[0,0,1,2,2]);
  assert.deepEqual(counts.map(c=>c.get('trigger_more')||0),[0,0,0,0,2]);
});

test('余烬回响：发布装备由真实掉落生成器创建，随机五条不手填，洗炼保持固定核心',()=>{
  for(const doc of createEmbersEchoEquipment(check.library,check.collections))assert.deepEqual(parseCollection('equipment',doc).doc,check.collections.equipment.get(doc.id).doc);
  for(const [i,preset] of presets.entries()){
    assert.deepEqual(preset,createEmbersEchoPreset(check.library,check.collections,i+1));
    for(const item of Object.values(preset.instances)){
      const doc=check.collections.equipment.get(item.baseId).doc;
      assert.deepEqual(item.bases.flatMap(b=>b.traits),doc.bases);
      assert.deepEqual(item.legendary.traits,[doc.legendary]);
      const washed=rerollEquipment(item,check.library,{random:equipmentRandom(81)});
      assert.deepEqual(inherent(washed),inherent(item));
      // Shop and loot both materialize the authored loop threshold at T1, even on T10 equipment.
      for(const seed of [1,37,958]){
        const drop=rollEquipmentDrop({equipment:new Map([[doc.id,{doc}]])},check.library,{chance:1,rarity:'legendary',tier:10,maxTier:10,random:equipmentRandom(seed)});
        assert.deepEqual(inherent(drop),inherent(item));assert.equal(drop.affixes.length,5);
      }
    }
  }
});

function measure(preset,{coreOnly=false,seconds=20}={}){
  const doc=structuredClone(preset);
  if(coreOnly)for(const item of Object.values(doc.instances))item.affixes=[];
  const meter=new AverageTargetDps();let hits=0;
  const battle=new Battle(files,{collections:check.collections,maxMonsters:0,spawnRate:0,god:false,seed:18,
    onDamageDealt:row=>{meter.record(row.TargetExternalId,row.Amount);if(row.Info?.zone!==undefined)hits++;}});
  if(coreOnly)battle.setLoadout(doc); // Ablation fixture; never publishes items without random lines.
  else{
    const save=createProgression(check.collections,check.library);
    assert.equal(applyBuildPreset(save,doc,check.collections,check.library).error,'');
    battle.setLoadout(progressionLoadout(save,check.collections));
  }
  battle.spawnMonsters(1);
  Object.assign(battle.monsters[0],{x:600,y:0,health:1e9,maxHealth:1e9,speed:0,cooldown:9999,shield:0,maxShield:0,attackRange:0,resistance:[75,75,75,75]});
  battle.setAim(600,0);battle.hero.casting=true;
  for(let i=0;i<1200&&battle.hero.casts<2;i++)battle.step(1/60);
  battle.hero.casting=false;assert.equal(battle.hero.casts,2);
  for(let i=0;i<300;i++){meter.advance(1/60);battle.step(1/60);}
  hits=0;let sum=0,minimum=Infinity;
  for(let i=0;i<seconds*60;i++){meter.advance(1/60);battle.step(1/60);sum+=meter.value;minimum=Math.min(minimum,meter.value);}
  assert.equal(battle.hero.casts,2);assert.equal(battle.hero.god,false);
  assert.ok(battle.hero.health>0);assert.ok(battle.hero.mana>90);
  assert.ok(minimum>0,'自动循环必须始终有输出');
  return{dps:sum/(seconds*60),minimum,hitsPerSecond:hits/seconds,life:battle.hero.health,mana:battle.hero.mana};
}

test('余烬回响：同一75火抗目标，五档固定核心与正常随机样品均逐档增强，顶档核心超过4000DPS',()=>{
  for(const coreOnly of [true,false]){
    const rows=presets.map(preset=>measure(preset,{coreOnly}));
    for(let i=1;i<rows.length;i++)assert.ok(rows[i].dps>rows[i-1].dps*1.2,JSON.stringify({coreOnly,rows}));
    if(coreOnly){
      assert.ok(rows[1].hitsPerSecond>rows[0].hitsPerSecond*4);
      assert.ok(rows[2].hitsPerSecond>rows[1].hitsPerSecond*1.3);
    }
    assert.ok(rows[4].dps>=4000);assert.ok(rows[4].minimum>=4000);
    console.log(JSON.stringify({coreOnly,rows}));
  }
});

test('余烬回响：五档两次手动启动后均可持续五分钟',()=>{
  for(const preset of presets)measure(preset,{seconds:300});
});

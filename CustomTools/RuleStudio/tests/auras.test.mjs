import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readRuleFiles } from '../scripts/rule-files.mjs';
import { checkRuleSet, parseCollection, equipmentAffixPool, traitTierProfile, rollEquipment, equipmentRandom,
  availableSkills, validateCollection, listings, sourceFromEntry, Character, findStat, readTraitText, validateSheet } from '../engine/index.mjs';
import { Battle } from '../public/sim/battle.mjs';
import { auraManaPercent, cleanActiveAuras, buildSkillType } from '../engine/skill-types.mjs';
import { cleanPlayerInventory } from '../public/player-storage.mjs';
import { playerEffects } from '../public/battle-player-effects.mjs';
import { iconSrc } from '../public/game-icons.mjs';

const files=readRuleFiles(),checked=checkRuleSet(files);assert.ok(checked.ok,checked.error);
const {library,collections}=checked;
const ids=[...collections.skill.keys()].filter(id=>id.startsWith('aura_'));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
const step=(b,n)=>{for(let i=0;i<n;i++)b.step(1/60);};
function fixture(auras=['aura_fire','aura_evasion','aura_resist_all'],{active=[],traits=[],god=false}={}) {
  const weapon=parseCollection('equipment',{id:'aura_probe_weapon',name:'测试',slot:'weapon',rarity:'common',skills:['frost_lance'],traits}).doc;
  const gear=auras.map((id,i)=>parseCollection('equipment',{id:`aura_probe_${i}`,name:`测试${i}`,slot:['ring','amulet','offhand'][i],rarity:'common',skills:[id],traits:[]}).doc);
  const c={...collections,equipment:new Map([...collections.equipment,[weapon.id,{doc:weapon}],...gear.map(doc=>[doc.id,{doc}])])};
  const b=new Battle(files,{collections:c,maxMonsters:0,spawnRate:0,god,seed:37});
  const loadout={skills:['frost_lance'],equipment:{weapon:weapon.id,...Object.fromEntries(gear.map(doc=>[doc.slot,doc.id]))},belt:auras.map(id=>'aura:'+id),activeAuras:active};
  b.setLoadout(loadout);return {b,c,loadout,set:activeAuras=>b.setLoadout({...loadout,activeAuras})};
}

test('14种新光环与原矢量操控均默认封印50%，十阶不降低封印，不能独立洗出启用后的效果',()=>{
  assert.equal(ids.length,14);
  const pool=equipmentAffixPool(library),stock=listings(collections,checked.catalog);
  for(const id of [...ids,'vector_control']){
    assert.equal(buildSkillType(library,id),'aura');assert.equal(auraManaPercent(library,id,collections),50);
    assert.ok(traitTierProfile(library,id).params.reservation_percent.tiers.every(([a,b])=>a===50&&b===50));
    assert.ok(!pool.some(row=>row.id===id));
    if(id==='vector_control')continue;
    const template=[...collections.equipment.values()].map(row=>row.doc).find(doc=>doc.skills?.includes(id));
    assert.ok(template&&template.slot!=='weapon');assert.equal(validateCollection('equipment',template,library).error,'');
    assert.ok(stock.some(row=>row.kind==='equipment'&&row.id===template.id));
    assert.ok(!stock.some(row=>row.kind==='skill'&&row.id===id));
    assert.ok(existsSync(new URL('../public'+iconSrc('skill',id),import.meta.url)));
  }
});

test('开启按总魔力比例封印，回蓝只到可用上限；开关不产生消耗/恢复事件，也不凭空补魔力',()=>{
  const {b,set}=fixture();step(b,1);b.character.mana=80;
  const flow={...b.character.flow};set(['aura_fire']);
  near(b.character.maxMana,100);near(b.character.reservedMana,50);near(b.character.manaCap,50);near(b.character.mana,50);
  assert.deepEqual(b.character.flow,flow);
  b.character.mana=10;b.character.recover('mana',1000);near(b.character.mana,50);
  const restored=b.character.totals.manaRecovered;set([]);near(b.character.mana,50);near(b.character.manaCap,100);
  near(b.character.totals.manaRecovered,restored);assert.ok(b.character.beforeCast(2,{kind:'spell'}).ok);
  set(['aura_fire']);b.character.mana=5;step(b,600);near(b.character.mana,50);
});

test('两个50%可同时开启，100%封印阻止耗蓝技能；第三个被过滤，禁用和卸装备立即移除效果',()=>{
  const {b,loadout,set}=fixture();step(b,1);set(['aura_fire','aura_evasion','aura_resist_all']);
  assert.deepEqual(b.loadout.activeAuras,['aura_fire','aura_evasion']);near(b.character.manaCap,0);near(b.character.mana,0);
  assert.equal(b.character.beforeCast(2,{kind:'spell'}).ok,false);near(b.character.offense().flat.fire,8);near(b.character.evasionValue(),200);
  assert.deepEqual(cleanActiveAuras(library,['aura_fire','aura_fire','aura_evasion','aura_resist_all'],collections),['aura_fire','aura_evasion']);
  set(['aura_evasion']);near(b.character.offense().flat.fire,0);near(b.character.manaCap,50);near(b.character.mana,0);
  b.setLoadout({...loadout,equipment:{weapon:loadout.equipment.weapon},activeAuras:['aura_evasion']});
  near(b.character.manaCap,100);near(b.character.evasionValue(),0);assert.deepEqual(b.loadout.activeAuras,[]);
  assert.ok(!playerEffects(b).some(row=>row.id.startsWith('aura:')));
});

test('封印比例可声明，缺省50%，非法比例拒绝；按技能文档的实际参数检查总预算',()=>{
  const source=readTraitText(JSON.stringify({id:'test_aura',sheet:[{trigger:'aura_skill'}]})).trait;
  const ch=new Character();ch.setSheet([{source}]);near(ch.reservedMana,50);
  for(const reservation_percent of [-1,0,101]){
    const trait=readTraitText(JSON.stringify({id:'bad_aura',params:{reservation_percent},sheet:[{trigger:'aura_skill'}]})).trait;
    assert.match(validateSheet(trait),/reservation_percent/);
  }
  const modified={...collections,skill:new Map(collections.skill)};
  for(const id of ['aura_fire','aura_evasion','aura_resist_all']){
    const entry=structuredClone(collections.skill.get(id));entry.doc.traits[0].params.reservation_percent=30;modified.skill.set(id,entry);
  }
  assert.equal(auraManaPercent(library,'aura_fire',modified),30);
  assert.equal(cleanActiveAuras(library,['aura_fire','aura_evasion','aura_resist_all'],modified).length,3);
});

test('六种点伤光环沿用实际命中规则，开启增加对应基础点伤，关闭后新攻击没有该增益',()=>{
  for(const element of ['fire','frost','lightning','poison','physical','void']){
    const id='aura_'+element,{b,set}=fixture([id]);step(b,1);
    assert.equal(b.character.offense().flat[element],0);set([id]);near(b.character.offense().flat[element],8);
    const rows=[];b.onDamageDealt=row=>rows.push(row);b.spawnMonsters(1);
    Object.assign(b.monsters[0],{x:500,y:0,health:1e6,maxHealth:1e6,shield:0,maxShield:0,speed:0,cooldown:9999,attackRange:0,resistance:[0,0,0,0,0,0]});
    b.setAim(1000,0);b.hero.castClock=10;b.hero.casting=true;step(b,1);b.hero.casting=false;step(b,55);
    assert.ok(rows.some(row=>row.Element===['fire','frost','lightning','physical','poison','void'].indexOf(element)&&row.Amount>0),element);
    set([]);near(b.character.offense().flat[element],0);
  }
});

test('单抗25、全抗四项各10实际进入防御计划；护甲、闪避、护盾遵守角色属性聚合',()=>{
  for(const element of ['fire','frost','lightning','poison']){
    const id='aura_resist_'+element,{b,set}=fixture([id]);set([id]);
    const plan=b.host.world.plans[b.host.world.targetDefensePlans.get(b.heroTargetId)];
    near(plan.stats.from(findStat('element.'+element+'.resistance'),0),25);
    set([]);assert.ok(!b.auraParts.length);
  }
  const {b,set}=fixture(['aura_resist_all']);set(['aura_resist_all']);
  const plan=b.host.world.plans[b.host.world.targetDefensePlans.get(b.heroTargetId)];
  for(const element of ['fire','frost','lightning','poison'])near(plan.stats.from(findStat('element.'+element+'.resistance'),0),10);
  for(const [id,read,value] of [['aura_armour',b=>b.character.armourValue(),300],['aura_evasion',b=>b.character.evasionValue(),200],['aura_shield',b=>b.character.maxShield,60]]){
    const f=fixture([id]);step(f.b,1);f.set([id]);near(read(f.b),value);if(id==='aura_shield')near(f.b.character.shield,0);
    assert.ok(playerEffects(f.b).some(row=>row.id==='aura:'+id&&row.description.includes('50%')));
  }
});

test('封印按装备增加后的总魔力计算，不减少最大魔力衍生护盾，无敌补充也受可用上限限制',()=>{
  const {b,set}=fixture(['aura_fire'],{traits:[{id:'mana_base',params:{n:100}},{id:'shield_from_mana',params:{n:50}}],god:true});
  near(b.character.maxMana,200);near(b.character.maxShield,100);set(['aura_fire']);
  b.syncHeroPools();near(b.character.manaCap,100);near(b.character.mana,100);near(b.character.maxShield,100);
  assert.ok(b.character.panel().some(row=>row.name==='封印魔力'));
});

test('真实装备可获取光环，同类可选择指环或护符搭配；背包持有不生效，存档超额开关会清理',()=>{
  const template=collections.equipment.get('aura_fire_amulet').doc;
  const item=rollEquipment(template,library,{rarity:'common',tier:1,uid:'aura_test',random:equipmentRandom(7)});
  assert.ok(!availableSkills({}, {},collections,{aura_test:item}).some(row=>row.id==='aura_fire'));
  assert.ok(availableSkills({}, {amulet:item.uid},collections,{aura_test:item}).some(row=>row.id==='aura_fire'));
  const {c,loadout}=fixture();
  const state={owned:{skill:{},equipment:Object.fromEntries(Object.values(loadout.equipment).map(id=>[id,1])),item:{}},instances:{},loadout:{...loadout,activeAuras:['aura_fire','aura_evasion','aura_resist_all']}};
  cleanPlayerInventory(state,c,library);assert.deepEqual(state.loadout.activeAuras,['aura_fire','aura_evasion']);
  for(const id of ids) for(const slot of ['ring','amulet'])assert.deepEqual(collections.equipment.get(`${id}_${slot}`).doc.skills,[id]);
});

test('28个光环底材的四种品质均可真实生成，传奇保留一条固定词缀；T阶不改变技能绑定或封印比例',()=>{
  for(const id of ids) for(const slot of ['ring','amulet']) for(const tier of [1,5,10])for(const rarity of ['common','magic','rare','legendary']){
    const template=collections.equipment.get(`${id}_${slot}`).doc;
    const item=rollEquipment(template,library,{rarity,tier,uid:`${id}_${slot}_${tier}_${rarity}`,random:equipmentRandom(tier+17)});
    assert.equal(item.skill,id);assert.equal(item.tier,tier);assert.equal(item.slot,slot);
    if(rarity==='legendary'){assert.equal(item.affixes.length,5);assert.ok(item.legendary);}
    if(rarity==='common')assert.equal(item.affixes.length,0);
  }
});

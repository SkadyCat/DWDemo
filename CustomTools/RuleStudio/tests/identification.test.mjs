import test from 'node:test';
import assert from 'node:assert/strict';
import { readRuleFiles } from '../scripts/rule-files.mjs';
import { checkRuleSet, rollEquipmentDrop, identifyEquipment, equipmentRandom, ensureEquipmentBases,
  equipmentDocument, availableSkills, createProgression, craftEquipment, progressionLoadout } from '../engine/index.mjs';
import { FloorRewards } from '../engine/floor-rewards.mjs';
import { affixName, affixText } from '../public/affix-text.mjs';

const check = checkRuleSet(readRuleFiles()); assert.ok(check.ok, check.error);
const { collections, library } = check;

test('掉落默认已鉴定，地面生成完整数值，拾取和补齐基础属性不会重掷', () => {
  const state = createProgression(collections, library);
  const rewards = new FloorRewards(collections, library, check.catalog, {equipmentChance:1, itemChance:0});
  rewards.onKill({x:0,y:0});
  const drop = rewards.remaining[0]; assert.equal(drop.item.identified, true);
  assert.ok(drop.item.bases.length > 0);
  const ground = structuredClone(drop.item);
  assert.ok(rewards.pickup(drop.key,state,{x:0,y:0}).drop);
  const before = JSON.parse(JSON.stringify(state.instances[drop.id]));
  assert.deepEqual(before, ground);
  ensureEquipmentBases(state.instances[drop.id],collections.equipment.get(drop.item.baseId).doc,library);
  assert.deepEqual(state.instances[drop.id], before);
});

test('鉴定保留掉落编号、品质和T阶，首次生成完整数值，已鉴定实例不能再鉴定', () => {
  const random = equipmentRandom(93), template = collections.equipment.get('frostthorn_staff').doc;
  const pool = {equipment:new Map([[template.id,{doc:template}]])};
  for (const rarity of ['common','magic','rare','legendary']) {
    const pending=rollEquipmentDrop(pool,library,{chance:1,rarity,tier:7,maxTier:7,uid:rarity,random,identified:false});
    assert.equal(pending.identified,false); assert.deepEqual(pending.bases,[]);
    const item=identifyEquipment(pending,template,library,{random});
    assert.equal(item.uid,pending.uid); assert.equal(item.rarity,rarity); assert.equal(item.tier,7); assert.equal(item.identified,true);
    assert.equal(item.bases.length,2); assert.ok(item.bases.every(base=>base.tier>=1&&base.tier<=7));
    const n=item.affixes.length;
    assert.ok(rarity==='common'?n===0:rarity==='magic'?n>=1&&n<=2:rarity==='rare'?n>=3&&n<=6:n===5&&!!item.legendary);
    for (const affix of [...item.bases,...item.affixes,...(item.legendary?[item.legendary]:[])]) {
      assert.doesNotMatch(affixName(affix,library),/(?<![a-z])n(?![a-z])|\{[a-z_]+\}/i);
      for (const entry of affix.traits) assert.ok(Object.values(entry.params||{}).every(Number.isFinite));
    }
    const restored=JSON.parse(JSON.stringify(item)); assert.deepEqual(restored,item);
    assert.throws(()=>identifyEquipment(restored,template,library),/已鉴定/);
  }
});

test('未鉴定装备不参与聚合、不授予技能，也不能消耗通货洗炼或增缀', () => {
  const state=createProgression(collections,library), item=rollEquipmentDrop(collections,library,{chance:1,random:equipmentRandom(1),identified:false});
  state.instances[item.uid]=item; state.loadout.equipment[item.slot]=item.uid;
  state.owned.item={chaos_orb:2,quad_affix_orb:2}; const before=structuredClone(state);
  assert.equal(equipmentDocument(item,collections),null);
  assert.deepEqual(availableSkills({}, {weapon:item.uid}, collections, state.instances),[]);
  assert.ok(!progressionLoadout(state,collections).instances[item.uid]);
  for (const currencyId of ['chaos_orb','quad_affix_orb']) assert.match(craftEquipment(state,item.uid,{currencyId},collections,library,check.tags).error,/鉴定/);
  assert.deepEqual(state,before);
});

test('装备名称行用实例参数替换占位符，复合词条名称保留，详细说明沿用实际数值', () => {
  for (const [id,n] of [['shield_base',31],['armour',123],['shield_from_life',7]]) {
    const affix={id,name:library.traitDisplayName(id),traits:[{id,params:{n}}]};
    assert.equal(affixName(affix,library),affixText(affix,library));
    assert.ok(affixName(affix,library).includes(String(n)));
    assert.doesNotMatch(affixName(affix,library),/\+n|n%/);
  }
  assert.equal(affixName({name:'闪电感电',traits:[{id:'shock',params:{amount:20,duration:2}}]},library),'闪电感电');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { RULES_DIR, readRuleFiles } from '../scripts/rule-files.mjs';
import { checkRuleSet, validateTraitValueEntry, createProgression } from '../engine/index.mjs';
import { registerEquipmentDropLibrary, equipmentDropAffixPool } from '../public/equipment-generation.mjs';
import { applyBuildPreset } from '../public/build-presets.mjs';
import { createRoyalSovereign } from '../scripts/create-royal-sovereign-bd.mjs';
import { createRoyalElements } from '../scripts/create-royal-elements-bd.mjs';
import { researchRoyalElements } from '../scripts/research-royal-elements.mjs';

const files = readRuleFiles(), checked = checkRuleSet(files); assert.ok(checked.ok, checked.error);
registerEquipmentDropLibrary(files, checked.library, checked.affixCategories);
const preset = createRoyalElements(checked.library, checked.collections);
let measured;
const report = () => measured ||= researchRoyalElements(files, checked.collections, preset);

test('万象熔炉九件装备可重建，所有词条符合部位与十阶，未覆盖旧BD或玩家物品', () => {
  assert.deepEqual(preset, JSON.parse(fs.readFileSync(`${RULES_DIR}/Presets/royal_treasury_elements.json`, 'utf8')));
  const items = Object.values(preset.instances); assert.equal(items.length, 9);
  assert.equal(items.filter(i => i.rarity === 'legendary').length, 2); assert.equal(items.filter(i => i.rarity === 'rare').length, 7);
  for (const item of items) {
    assert.equal(item.affixes.length, item.rarity === 'legendary' ? 5 : 6);
    const allowed = new Set(equipmentDropAffixPool(checked.library, item.slot).map(a => a.id));
    item.affixes.forEach(line => assert.ok(allowed.has(line.id), `${item.slot}:${line.id}`));
    const walk = entry => { assert.equal(validateTraitValueEntry(checked.library, entry), ''); (entry.with || []).forEach(walk); };
    for (const line of [...item.bases, ...(item.legendary ? [item.legendary] : []), ...item.affixes]) line.traits.forEach(walk);
  }
  const save = createProgression(checked.collections, checked.library), old = createRoyalSovereign(checked.library, checked.collections);
  save.stones = 1234; assert.equal(applyBuildPreset(save, old, checked.collections, checked.library).error, '');
  const kept = structuredClone(save.instances), n = Object.keys(kept).length;
  for (let i = 0; i < 2; i++) assert.equal(applyBuildPreset(save, preset, checked.collections, checked.library).error, '');
  assert.equal(Object.keys(save.instances).length, n + 9); assert.equal(save.stones, 1234);
  for (const [id, item] of Object.entries(kept)) assert.deepEqual(save.instances[id], item);
});

test('真实战斗仍四次叠满，冰火雷毒均有伤害，异常消费与新星按资源和衰减规则执行', () => {
  const full = report().full, seen = full.observations;
  assert.deepEqual(full.levels, [10,20,30,40]); assert.equal(full.manualCasts, 4);
  assert.equal(full.projectiles, full.pulses * 5); assert.equal(full.finalLevel, 39);
  assert.equal(full.god, false); assert.ok(full.alive && full.minMana >= 98);
  for (const element of [0,1,2,3,4]) assert.ok(seen.damageByElement[element] > 0, `缺少元素伤害 ${element}`);
  assert.ok(seen.chilledPoisons > 0 && seen.shockedPoisons > 0 && seen.elementalPoisons > 0);
  assert.ok(seen.poisonConsumptions > 0 && seen.burningDetonations > 0 && full.nova > 0);
});

test('冰缓延毒、感电增毒、点燃增爆各自真实提高毒爆，逐项拆除会下降', () => {
  const { full, noColdReaction: cold, noShockReaction: shock, noFireReaction: fire } = report();
  const avg = r => r.observations.poisonDuration / r.observations.poisonLayers;
  assert.ok(avg(full) > avg(cold) * 1.2, '冰缓延长实际毒层持续时间');
  for (const [name, removed] of Object.entries({ cold, shock, fire })) {
    assert.ok(full.observations.poisonBurstDamage > removed.observations.poisonBurstDamage * 1.1, `${name}反应没有增益`);
    assert.ok(full.dps > removed.dps);
  }
});

test('拆施毒、点燃、引爆或全部消费者会分别断掉对应路径；普通钥匙不会携带反应', () => {
  const { noPoison, noIgnition, noDetonation, noConsumers, noEquipment } = report();
  assert.equal(noPoison.observations.poisonApplications, 0); assert.equal(noPoison.observations.detonations, 0);
  assert.equal(noIgnition.observations.ignites, 0); assert.equal(noIgnition.observations.burningDetonations, 0);
  assert.equal(noDetonation.observations.poisonBurstDamage, 0); assert.ok(noDetonation.nova > 0, '感电消费路径仍独立存在');
  assert.equal(noConsumers.nova, 0); assert.equal(noConsumers.consumes, 0); assert.equal(noConsumers.observations.detonations, 0);
  assert.deepEqual(noEquipment.levels, [1,2,3,4]); assert.equal(noEquipment.nova, 0); assert.equal(noEquipment.observations.poisonApplications, 0);
  for (const element of [0,1,2,4]) assert.equal(noEquipment.observations.damageByElement[element] || 0, 0);
});

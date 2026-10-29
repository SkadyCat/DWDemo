import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { RULES_DIR, readRuleFiles } from '../scripts/rule-files.mjs';
import { checkRuleSet, equipmentRandom, validateTraitValueEntry, createProgression, rerollEquipment, equipmentDocument } from '../engine/index.mjs';
import { rollEquipment, registerEquipmentDropLibrary, equipmentDropAffixPool } from '../public/equipment-generation.mjs';
import { applyBuildPreset } from '../public/build-presets.mjs';
import { createRoyalSovereign } from '../scripts/create-royal-sovereign-bd.mjs';
import { simulateRoyalSovereign, withoutSovereignAffixes } from '../scripts/research-royal-sovereign.mjs';
import { Battle } from '../public/sim/battle.mjs';
import { traitText } from '../public/affix-text.mjs';

const files = readRuleFiles(), checked = checkRuleSet(files); assert.ok(checked.ok, checked.error);
registerEquipmentDropLibrary(files, checked.library, checked.affixCategories);
const preset = createRoyalSovereign(checked.library, checked.collections);
const run = (sample = preset, options = {}) => simulateRoyalSovereign(files, checked.collections, sample, options);

test('雷铸王权九件真实装备可重建，遵守品质、部位池和十阶；固有核心不占随机行', () => {
  assert.deepEqual(preset, JSON.parse(fs.readFileSync(`${RULES_DIR}/Presets/royal_treasury_sovereign.json`, 'utf8')));
  const items = Object.values(preset.instances); assert.equal(items.length, 9);
  assert.equal(items.filter(i => i.rarity === 'legendary').length, 2);
  assert.equal(items.filter(i => i.rarity === 'rare').length, 6);
  for (const item of items) {
    assert.equal(item.affixes.length, item.rarity === 'legendary' ? 5 : item.rarity === 'magic' ? 2 : 6);
    const allowed = new Set(equipmentDropAffixPool(checked.library, item.slot).map(a => a.id));
    for (const line of item.affixes) assert.ok(allowed.has(line.id), `${item.slot}:${line.id}`);
    const walk = t => { assert.equal(validateTraitValueEntry(checked.library, t), ''); (t.with || []).forEach(walk); };
    for (const line of [...item.bases, ...(item.legendary ? [item.legendary] : []), ...item.affixes]) line.traits.forEach(walk);
  }
  const weapon = preset.instances[preset.equipment.weapon];
  assert.equal(weapon.legendary.traits[0].id, 'treasury_stock'); assert.equal(weapon.legendary.traits[0].params.amount, 10); assert.equal(weapon.legendary.traits[0].params.cap, 40);
  assert.equal(weapon.bases.find(b => b.id === 'proj_count').traits[0].params.n, 2);
  assert.match(traitText(weapon.legendary.traits[0], checked.library), /10层.*40层/);
});

test('真实获取的新传奇在T1–T10生成对应核心；整件洗炼保留收纳/上限和固定多重', () => {
  const base = checked.collections.equipment.get('treasury_sovereign_staff').doc;
  for (const tier of [1, 5, 10]) {
    const item = rollEquipment(base, checked.library, { tier, rarity: 'legendary', random: equipmentRandom(23), uid: `royal_drop_t${tier}` });
    const tuned = item.legendary.traits[0]; assert.equal(tuned.tier, tier); assert.equal(validateTraitValueEntry(checked.library, tuned), '');
    const washed = rerollEquipment(item, checked.library, { random: equipmentRandom(74), pool: equipmentDropAffixPool(checked.library, 'weapon') });
    assert.deepEqual(washed.legendary, item.legendary); assert.deepEqual(washed.bases, item.bases); assert.equal(washed.affixes.length, 5);
    if (tier === 10) { assert.equal(tuned.params.amount, 10); assert.equal(tuned.params.cap, 40); }
  }
});

test('四次正常输入叠满40层，后续随机出射不算手动施法；无目标也由真实装备持续发射', () => {
  const result = run(preset, { targets: 0 });
  assert.deepEqual(result.levels, [10,20,30,40]); assert.equal(result.manualCasts, 4); assert.equal(result.god, false);
  assert.equal(result.projectiles, result.pulses * 5); assert.equal(result.finalLevel, 39);
  assert.equal(result.nova, 0); assert.equal(result.damage, 0); assert.ok(result.minMana >= 98); assert.ok(result.alive);
  const idle = run(preset, { targets: 0, inputs: [] }); assert.equal(idle.projectiles, 0); assert.equal(idle.manualCasts, 0);
});

test('附魔→感电消费→新星由现有规则实际触发，拆消费或附魔即断链；拆手套多重按5变3', () => {
  const full = run(), noConsume = run(withoutSovereignAffixes(preset, ['shock_consume']));
  const noEnchant = run(withoutSovereignAffixes(preset, ['shocking_hits', 'shock_chance']));
  const lessCount = run(withoutSovereignAffixes(preset, ['proj_count']));
  assert.ok(full.consumes > 0 && full.nova > 0 && full.damage > 0); assert.ok(full.minMana >= 98); assert.equal(full.god, false);
  assert.equal(noConsume.consumes, 0); assert.equal(noConsume.nova, 0);
  assert.equal(noEnchant.consumes, 0); assert.equal(noEnchant.nova, 0); assert.ok(full.damage > noEnchant.damage);
  assert.equal(full.pulses, lessCount.pulses); assert.equal(full.projectiles, full.pulses * 5); assert.equal(lessCount.projectiles, lessCount.pulses * 3);
});

test('更换核心武器恢复原技能1层/10上限，没有预设脚本或持久增益', () => {
  const b = new Battle(files, { collections: checked.collections, maxMonsters: 0, spawnRate: 0, god: false });
  const original = checked.library.trait('treasury_stock').source.params;
  assert.equal(original.get('amount'), 1); assert.equal(original.get('cap'), 10);
  b.setLoadout(structuredClone(preset)); assert.ok(b.hero.plan >= 0, b.hero.error);
  const source = b.host.planSources.get(b.hero.plan); assert.equal(source.traits.find(t => t.id === 'treasury_stock').params.get('cap'), 40);
  b.setLoadout({ skills: ['royal_treasury'], equipment: { weapon: 'royal_key' } });
  const restored = b.host.planSources.get(b.hero.plan).traits.find(t => t.id === 'treasury_stock');
  assert.equal(restored.params.get('amount'), 1); assert.equal(restored.params.get('cap'), 10);
});

test('一键应用保留原存档，装备文档携带全部实际参数，不重复发装备', () => {
  const save = createProgression(checked.collections, checked.library); save.stones = 12345;
  const before = Object.keys(save.instances).length;
  for (let i = 0; i < 2; i++) assert.equal(applyBuildPreset(save, preset, checked.collections, checked.library).error, '');
  assert.equal(save.stones, 12345); assert.equal(Object.keys(save.instances).length, before + 9);
  assert.deepEqual(save.loadout.skills, ['royal_treasury', null, null, null]);
  const doc = equipmentDocument(save.instances[save.loadout.equipment.weapon], checked.collections);
  assert.equal(doc.traits.find(t => t.id === 'treasury_stock').params.amount, 10);
});

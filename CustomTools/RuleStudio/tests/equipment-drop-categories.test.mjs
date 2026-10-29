import test from 'node:test';
import assert from 'node:assert/strict';
import { readRuleFiles } from '../scripts/rule-files.mjs';
import { checkRuleSet, RuleLibrary, equipmentAffixPool, equipmentRandom, fixedEquipmentAffix, rollEquipment as genericEquipment,
  rerollEquipment, rerollPool, AFFIX_CATEGORY_FILE, FloorRewards } from '../engine/index.mjs';
import { equipmentDropAffixPool, EQUIPMENT_DROP_CATEGORIES, rollEquipment, rollEquipmentDrop, identifyEquipment,
  equipmentDropCategoryIndex, registerEquipmentDropLibrary } from '../public/equipment-generation.mjs';

const files = readRuleFiles(), checked = checkRuleSet(files);
assert.ok(checked.ok, checked.error);
const { library, collections, catalog, affixCategories, tags } = checked;
registerEquipmentDropLibrary(files, library, affixCategories);
const pool = equipmentAffixPool(library);
const templateFor = slot => [...collections.equipment.values()].find(({ doc }) => doc.slot === slot && doc.rarity !== 'legendary').doc;
const assertAllowed = item => {
  const allowed = EQUIPMENT_DROP_CATEGORIES[item.slot];
  if (allowed) for (const affix of item.affixes) assert.ok(allowed.includes(affixCategories.categoryOf(affix.id, 'affix')?.category), `${item.slot}: ${affix.id}`);
};

test('掉落部位：随机词缀池取用途分类交集，未指定部位保留完整池', () => {
  assert.deepEqual(EQUIPMENT_DROP_CATEGORIES, { chest: ['defense'], boots: ['defense'], belt: ['defense'],
    gloves: ['attack', 'special'], weapon: ['attack', 'special'], ring: ['special'], amulet: ['special'] });
  for (const [slot, allowed] of Object.entries(EQUIPMENT_DROP_CATEGORIES)) {
    const expected = pool.filter(affix => allowed.includes(affixCategories.categoryOf(affix.id, 'affix').category));
    assert.deepEqual(equipmentDropAffixPool(library, slot), expected);
    assert.ok(expected.length >= 6);
  }
  for (const slot of ['helmet', 'offhand']) assert.deepEqual(equipmentDropAffixPool(library, slot), pool);
});

test('掉落部位：魔法、稀有、传奇在各 T 阶均遵守部位限制，保留品质数量、技能与固定设计', () => {
  const random = equipmentRandom(121);
  for (const slot of Object.keys(EQUIPMENT_DROP_CATEGORIES)) {
    const template = templateFor(slot), before = JSON.stringify(template), seen = new Set();
    for (const tier of [1, 5, 10]) for (const rarity of ['common', 'magic', 'rare', 'legendary']) for (let i = 0; i < 12; i++) {
      const item = rollEquipment(template, library, { tier, rarity, random });
      assertAllowed(item);
      item.affixes.forEach(affix => seen.add(affixCategories.categoryOf(affix.id, 'affix').category));
      assert.equal(item.skill, template.skills[0] || '');
      assert.ok(rarity === 'common' ? item.affixes.length === 0 : rarity === 'magic' ? item.affixes.length >= 1 && item.affixes.length <= 2 : rarity === 'rare' ? item.affixes.length >= 3 && item.affixes.length <= 6 : item.affixes.length === 5);
      assert.ok(item.affixes.every(affix => !affix.tier || affix.tier <= tier));
      if (rarity === 'legendary') assert.equal(item.legendary.id, fixedEquipmentAffix(template, library).id);
    }
    assert.deepEqual([...seen].sort(), [...EQUIPMENT_DROP_CATEGORIES[slot]].sort());
    assert.equal(JSON.stringify(template), before);
  }
  const legendary = collections.equipment.get('myriad_swords_t1_chest').doc;
  const item = rollEquipment(legendary, library, { random });
  assertAllowed(item);
  assert.deepEqual(item.bases.map(base => base.id), legendary.bases.map(base => base.id));
  assert.equal(item.legendary.id, fixedEquipmentAffix(legendary, library).id);
});

test('掉落部位：掉落、商店共用的生成入口和首次鉴定都生效', () => {
  for (const slot of Object.keys(EQUIPMENT_DROP_CATEGORIES)) {
    const template = templateFor(slot), isolated = { ...collections, equipment: new Map([[template.id, { doc: template }]]) };
    for (const rarity of ['magic', 'rare', 'legendary']) {
      const item = rollEquipmentDrop(isolated, library, { chance: 1, rarity, maxTier: 5, random: equipmentRandom(73) });
      assert.equal(item.slot, slot); assertAllowed(item);
    }
    const pending = rollEquipmentDrop(isolated, library, { chance: 1, rarity: 'rare', tier: 3, identified: false, uid: `pending_${slot}`, random: equipmentRandom(51) });
    const item = identifyEquipment(pending, template, library, { random: equipmentRandom(11) });
    assert.equal(item.uid, pending.uid); assert.equal(item.tier, pending.tier); assertAllowed(item);
    assert.equal(pending.identified, false, '鉴定不原地改写输入');
    const rewards = new FloorRewards(isolated, library, catalog, { equipmentChance: 1, itemChance: 0, merchantChance: 1, maxTier: 5, createEquipment: rollEquipment });
    for (let i = 0; i < 12; i++) assertAllowed(rewards.onKill({ x: 0, y: 0 }).find(loot => loot.kind === 'equipment').item);
    for (const offer of rewards.complete().stock.filter(loot => loot.kind === 'equipment')) assertAllowed(offer.item);
  }
});

test('掉落部位：使用保存的人工分类，库重新加载后不会保留旧索引', () => {
  const authored = JSON.parse(files.find(file => file.path === AFFIX_CATEGORY_FILE).text);
  authored.traits.flat_lightning = { category: 'defense', reason: '验证人工用途分类用于掉落。' };
  const custom = checkRuleSet(files.map(file => file.path === AFFIX_CATEGORY_FILE ? { ...file, text: JSON.stringify(authored) } : file));
  assert.ok(custom.ok, custom.error);
  registerEquipmentDropLibrary([], custom.library, custom.affixCategories);
  assert.ok(equipmentDropAffixPool(custom.library, 'chest').some(affix => affix.id === 'flat_lightning'));
  assert.ok(!equipmentDropAffixPool(custom.library, 'weapon').some(affix => affix.id === 'flat_lightning'));
  assert.ok(custom.library.load(files).ok);
  assert.ok(!equipmentDropAffixPool(custom.library, 'chest').some(affix => affix.id === 'flat_lightning'));
  const standalone = new RuleLibrary(); assert.ok(standalone.load(files).ok);
  assert.equal(equipmentDropCategoryIndex(standalone).categoryOf('life_on_crit').category, 'defense');
});

test('掉落部位：调用者传入的参考池也要取交集，不能不足时回退到错误分类', () => {
  const attackOnly = pool.filter(affix => affixCategories.categoryOf(affix.id, 'affix').category === 'attack');
  const template = templateFor('ring');
  assert.deepEqual(equipmentDropAffixPool(library, 'ring', attackOnly), []);
  assert.throws(() => rollEquipment(template, library, { rarity: 'rare', pool: attackOnly }), /可用词条不足/);
  assert.equal(rollEquipment(template, library, { rarity: 'common', pool: attackOnly }).affixes.length, 0);
});

test('上层边界：通用离线洗炼与族池不自行读取网站部位表，也不原地修改装备', () => {
  const item = rollEquipment(templateFor('ring'), library, { rarity: 'rare', random: equipmentRandom(31) }), before = JSON.stringify(item);
  const seen = new Set(), random = equipmentRandom(916);
  for (let i = 0; i < 32; i++) {
    const rerolled = rerollEquipment(item, library, { index: 0, random });
    seen.add(affixCategories.categoryOf(rerolled.affixes[0].id, 'affix').category);
    assert.deepEqual(rerolled.affixes.slice(1), item.affixes.slice(1));
  }
  assert.deepEqual([...seen].sort(), ['attack', 'defense', 'special']);
  assert.equal(JSON.stringify(item), before);
  assert.deepEqual(rerollPool(library, tags), pool);
});

test('上层边界：通用生成器不读取部位表，真实地牢仅在上层掉落流程中接入', async () => {
  const template = templateFor('ring'), specialOnly = new Set(equipmentDropAffixPool(library, 'ring').map(a => a.id));
  const raw = genericEquipment(template, library, { rarity: 'rare', random: equipmentRandom(41) });
  assert.ok(raw.affixes.some(affix => !specialOnly.has(affix.id)), '通用生成器仍使用调用者提供的完整词条池');
  const { DungeonBattle } = await import('../public/sim/dungeon-battle.mjs');
  const dungeon = new DungeonBattle(files, { collections, seed: 4, rewards: { catalog, equipmentChance: 1, itemChance: 0, merchantChance: 1 } });
  for (let i = 0; i < 60; i++) assertAllowed(dungeon.rewards.onKill({ x: 0, y: 0 }).find(loot => loot.kind === 'equipment').item);
  for (const offer of dungeon.rewards.complete().stock.filter(loot => loot.kind === 'equipment')) assertAllowed(offer.item);
});

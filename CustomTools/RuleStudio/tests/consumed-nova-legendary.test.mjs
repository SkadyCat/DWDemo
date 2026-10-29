import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readRuleFiles } from '../scripts/rule-files.mjs';
import { checkRuleSet, rollEquipment, rollEquipmentDrop, equipmentRandom, equipmentAffixPool,
  equipmentDocument, rerollEquipment, validateTraitValueEntry, listings } from '../engine/index.mjs';
import { affixName } from '../public/affix-text.mjs';
import { Battle } from '../public/sim/battle.mjs';

const files = readRuleFiles(), checked = checkRuleSet(files);
assert.ok(checked.ok, checked.error);
const { library, collections, catalog } = checked;
const id = 'rime_thunder_annihilation_ring', traitId = 'legendary_consumed_nova';
const template = collections.equipment.get(id).doc;

test('鸣灭指环：正常传奇掉落，所有装备阶级固定100%，完整新星载荷合法且洗炼不变', () => {
  assert.ok(listings(collections, catalog).some(row => row.id === id && row.rarity === 'legendary'));
  assert.ok(!equipmentAffixPool(library).some(affix => affix.traits.some(t => t.id === traitId)), '专用传奇机制不进入随机词缀池');
  const onlyRing = { equipment: new Map([[id, { doc: template }]]) };
  for (let tier = 1; tier <= 10; tier++) for (const seed of [1, 18, 67]) {
    const random = equipmentRandom(seed);
    const item = rollEquipmentDrop(onlyRing, library, { chance: 1, rarity: 'legendary', tier, random });
    assert.equal(item.baseId, id); assert.equal(item.slot, 'ring'); assert.equal(item.affixes.length, 5);
    const root = item.legendary.traits[0];
    assert.equal(root.id, traitId); assert.equal(root.params.chance, 100);
    assert.equal(affixName(item.legendary, library), '消耗目标异常状态时，有100%概率触发雷霆新星');
    assert.deepEqual(root.with.map(t => t.id), collections.skill.get('lightning_nova').doc.traits.map(t => t.id));
    const validate = entry => {
      assert.equal(validateTraitValueEntry(library, entry), '');
      if (entry.tier) assert.ok(entry.tier <= tier);
      entry.with.forEach(validate);
    };
    validate(root);
    assert.equal(equipmentDocument(item, collections).traits.filter(t => t.id === traitId).length, 1);
    assert.deepEqual(rerollEquipment(item, library, { random }).legendary, item.legendary);
  }
});

function simulate({ equipped = true, consumes = true } = {}) {
  const preset = JSON.parse(fs.readFileSync(new URL('../../../Content/Rules/Presets/synergy_rime_thunder.json', import.meta.url), 'utf8'));
  for (const item of Object.values(preset.instances)) item.affixes = item.affixes.filter(a =>
    a.id !== 'consume_lightning_nova' && (consumes || !['freeze_consume', 'shock_consume'].includes(a.id)));
  const ring = rollEquipment(template, library, { tier: 1, uid: 'normal_drop_ring', random: equipmentRandom(18) });
  preset.instances[ring.uid] = ring; preset.equipment.ring = ring.uid;
  if (!equipped) delete preset.equipment.ring;
  const battle = new Battle(files, { collections, maxMonsters: 0, spawnRate: 0, god: false, seed: 18 });
  battle.setLoadout(preset); assert.equal(battle.skills[0].error, '');
  battle.spawnMonsters(1);
  Object.assign(battle.monsters[0], { x: 300, y: 0, health: 1e8, maxHealth: 1e8,
    speed: 0, cooldown: 9999, shield: 0, maxShield: 0, attackRange: 0, resistance: [0, 0, 0, 0, 0, 0] });
  battle.setAim(300, 0);
  let novas = 0, consumptions = 0;
  const register = battle.combat.register.bind(battle.combat);
  battle.combat.register = (index, data) => {
    if (data.kind === 'trigger' && battle.host.plan(battle.host.world.roots[index].plan).traitIds.includes('create_lightning_nova')) novas++;
    return register(index, data);
  };
  const ailment = battle.combat.triggers.ailment.bind(battle.combat.triggers);
  battle.combat.triggers.ailment = (type, ...args) => { if (type === 'consumed') consumptions++; return ailment(type, ...args); };
  battle.hero.casting = true;
  for (let frame = 0; frame < 1200; frame++) battle.step(1 / 60);
  return { novas, consumptions, mana: battle.character.mana };
}

test('鸣灭指环：真实T1掉落触发新星；仅施加异常或卸掉传奇机制均不触发', () => {
  const full = simulate(), removed = simulate({ equipped: false }), noConsumption = simulate({ consumes: false });
  assert.ok(full.consumptions > 10 && full.novas > 10, JSON.stringify(full));
  assert.ok(full.mana >= 0);
  assert.ok(removed.consumptions > 0); assert.equal(removed.novas, 0);
  assert.equal(noConsumption.consumptions, 0); assert.equal(noConsumption.novas, 0);
});

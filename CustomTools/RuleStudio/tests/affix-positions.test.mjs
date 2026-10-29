import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readRuleFiles } from '../scripts/rule-files.mjs';
import { checkRuleSet, equipmentAffixPool, equipmentRandom, equipmentDocument, aggregate, compileBuild } from '../engine/index.mjs';
import { rollEquipment, registerEquipmentDropLibrary } from '../public/equipment-generation.mjs';
import { buildAffixPositionIndex, AFFIX_POSITIONS } from '../public/affix-positions.mjs';
import { affixCategoryRows } from '../public/affix-category-view.mjs';
import { createAffixPositionCatalog } from '../scripts/classify-affix-positions.mjs';

const files = readRuleFiles(), checked = checkRuleSet(files);
assert.ok(checked.ok, checked.error);
const { library, collections, tags, affixCategories } = checked;
const catalog = JSON.parse(fs.readFileSync(new URL('../public/data/affix-positions.json', import.meta.url), 'utf8'));
const positions = buildAffixPositionIndex(library);

test('前后缀：全库与复合词条每条恰好一种归属，持久化表无遗漏和过期项', () => {
  assert.deepEqual(AFFIX_POSITIONS.map(row => row.name), ['前缀', '后缀']);
  assert.deepEqual(positions.missing, []); assert.deepEqual(positions.stale, []);
  assert.deepEqual(createAffixPositionCatalog(library, catalog), catalog);
  const rows = affixCategoryRows(library, collections, tags, affixCategories, positions);
  const expected = new Set([...library.traits.keys(), ...equipmentAffixPool(library).map(row => row.id)]);
  assert.equal(rows.length, expected.size); assert.deepEqual(new Set(rows.map(row => row.id)), expected);
  assert.equal(rows.filter(row => row.rollable).length, equipmentAffixPool(library).length);
  for (const row of rows) { assert.ok(['prefix', 'suffix'].includes(row.position), row.id); assert.ok(row.positionReason.trim(), row.id); }
  for (const category of ['attack', 'defense', 'special']) for (const position of ['prefix', 'suffix']) assert.ok(rows.some(row => row.category === category && row.position === position), `${category}/${position}`);
});

test('前后缀：能力来源、数值成长和回复量归前缀，运行机制与效率归后缀', () => {
  const cases = {
    flat_frost: 'prefix', inc_fire: 'prefix', armour: 'prefix', life_base: 'prefix', mana_base: 'prefix',
    fire_resistance: 'prefix', multiple_projectiles: 'prefix', proj_count: 'prefix', proj_damage: 'prefix',
    life_on_crit: 'prefix', shield_added_lightning: 'prefix', block_attack_to_spell: 'prefix',
    proj_pierce_damage: 'prefix', minion_empty_damage: 'prefix', legendary_consumed_nova: 'prefix',
    life_regen_flat: 'prefix', trig_hit: 'prefix', minion_more_weaker: 'prefix', extra_as_fire: 'prefix',
    block_reflect_fire: 'suffix', poison_enemy_weaken: 'suffix', area_extra_cast: 'suffix',
    trigger_repeat: 'suffix', proj_layout_converge: 'suffix', poison_eternal: 'suffix',
    trig_interval: 'suffix', trig_hits_count: 'suffix', shield_recharge_on_crit: 'suffix',
    life_regen_speed: 'suffix', poison_vs_leech: 'suffix', poison_crit_spread: 'suffix',
  };
  for (const [id, position] of Object.entries(cases)) assert.equal(positions.positionOf(id)?.position, position, id);
  for (const id of ['consume_lightning_nova', 'shocking_hits', 'hit_summon_fire_turret']) assert.equal(positions.positionOf(id, 'affix')?.position, 'prefix', id);
  assert.equal(positions.positionOf('freezing_hits', 'affix')?.position, 'suffix');
});

test('前后缀：全量目录与实际可洗炼池均接近各半', () => {
  const rows = affixCategoryRows(library, collections, tags, affixCategories, positions);
  for (const scope of [rows, rows.filter(row => row.rollable)]) {
    const prefixes = scope.filter(row => row.position === 'prefix').length, suffixes = scope.length - prefixes;
    assert.ok(Math.abs(prefixes - suffixes) <= Math.ceil(scope.length * .02), `${prefixes} 前缀 / ${suffixes} 后缀`);
  }
});

test('前后缀：校验元数据，新增条目显示建议，补表保留已有人工划分', () => {
  for (const position of ['unknown', '', null]) {
    const bad = structuredClone(catalog); bad.traits.flat_fire.position = position;
    assert.throws(() => buildAffixPositionIndex(library, bad), /有效的 position/);
  }
  const bad = structuredClone(catalog); bad.traits.flat_fire.reason = '';
  assert.throws(() => buildAffixPositionIndex(library, bad), /划分依据/);
  const manual = structuredClone(catalog); manual.traits.flat_fire = { position: 'suffix', reason: '人工调整。' };
  assert.deepEqual(createAffixPositionCatalog(library, manual).traits.flat_fire, manual.traits.flat_fire);
  delete manual.traits.flat_frost;
  const pending = buildAffixPositionIndex(library, manual);
  assert.deepEqual(pending.missing, ['flat_frost']); assert.equal(pending.positionOf('flat_frost').position, 'prefix');
  assert.equal(createAffixPositionCatalog(library, manual).traits.flat_fire.position, 'suffix');
});

test('前后缀：上层归属表不改变装备掉落池、数值或编译结果', () => {
  registerEquipmentDropLibrary(files, library, affixCategories);
  const template = collections.equipment.get('frostthorn_staff').doc;
  const before = rollEquipment(template, library, { uid: 'same_instance', tier: 5, rarity: 'rare', random: equipmentRandom(51) });
  const compile = item => { const source = aggregate(library, 'frost_lance', [{ kind: 'equipment', doc: equipmentDocument(item, collections) }], Infinity); assert.ok(source.source, source.error); return compileBuild(source.source); };
  const beforePlan = compile(before); assert.ok(beforePlan.plan, beforePlan.error);
  const flipped = structuredClone(catalog);
  for (const entries of [flipped.traits, flipped.affixes]) for (const row of Object.values(entries)) row.position = row.position === 'prefix' ? 'suffix' : 'prefix';
  const changed = buildAffixPositionIndex(library, flipped);
  affixCategoryRows(library, collections, tags, affixCategories, changed);
  const after = rollEquipment(template, library, { uid: 'same_instance', tier: 5, rarity: 'rare', random: equipmentRandom(51) });
  assert.deepEqual(after, before); assert.deepEqual(compile(after), beforePlan);
  assert.ok(after.affixes.every(row => row.position === undefined));
});

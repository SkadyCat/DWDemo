import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readRuleFiles } from '../scripts/rule-files.mjs';
import { checkRuleSet, listings, isListedSkill, rollEquipment, rerollEquipment, equipmentRandom,
  createProgression, progressionLoadout, availableSkills, parseCollection, serializeCollection, validateCollection } from '../engine/index.mjs';
import { Battle } from '../public/sim/battle.mjs';
import { buildSkillType } from '../engine/skill-types.mjs';
import { PLAYER_SAVE_KEY, readPlayerSave } from '../public/player-storage.mjs';
import { applyBuildPreset } from '../public/build-presets.mjs';

const files = readRuleFiles(), check = checkRuleSet(files);
assert.ok(check.ok, check.error);
const { library, collections } = check;
const weapons = [...collections.equipment.values()].map(entry => entry.doc).filter(doc => doc.slot === 'weapon' && doc.rarity === 'common');

test('新武器目录: seven player skills have exactly one distinct plain weapon each; retired weapons and presets are absent', () => {
  const skills = [...collections.skill.keys()].filter(id => isListedSkill(id, collections) && buildSkillType(library, id) === 'active').sort();
  assert.equal(weapons.length, skills.length);
  assert.equal(new Set(weapons.map(doc => doc.name)).size, skills.length);
  assert.deepEqual(weapons.map(doc => doc.skills[0]).sort(), skills);
  for (const doc of weapons) {
    assert.equal(doc.skills.length, 1); assert.equal(doc.rarity, 'common');
    assert.equal(doc.tier, 1); assert.equal(doc.bases.length, 1);
    assert.ok(doc.traits.every(t => !library.trait(t.id).source.rules.length), 'direct numeric template edits remain allowed');
    assert.ok(doc.legendary && library.trait(doc.legendary.id));
    assert.deepEqual(parseCollection('equipment', serializeCollection('equipment', doc)).doc, doc);
  }
  for (const id of ['frostwhisper_staff', 'cinder_guard_weapon', 'cinder_surge_staff']) assert.ok(!collections.equipment.has(id));
  const shopWeapons = listings(collections, check.catalog).filter(item => item.kind === 'equipment' && item.doc.slot === 'weapon' && item.rarity === 'common');
  assert.equal(shopWeapons.length, skills.length);
  const presets = JSON.parse(fs.readFileSync(new URL('../../../Content/Rules/Presets/index.json', import.meta.url)));
  assert.ok(presets.every(entry => !['cinder_guard', 'cinder_surge', 'frost_progression'].includes(entry.id)), 'retired weapon presets stay removed');
});

test('武器绑定: equip and cast all seven skills; ordinary weapons have two bases and no quality affixes', () => {
  for (const template of weapons) {
    const save = createProgression(collections, library, { weaponId: template.id });
    const loadout = progressionLoadout(save, collections), item = save.instances.starter_weapon;
    assert.deepEqual(availableSkills({}, loadout.equipment, collections, save.instances).map(row => row.id), template.skills);
    assert.deepEqual(item.affixes, []); assert.equal(item.legendary, null);
    const battle = new Battle(files, { collections, maxMonsters: 0, spawnRate: 0 });
    battle.setLoadout(loadout);
    assert.equal(battle.hero.skill, template.skills[0]);
    assert.equal(item.bases.length, 2);
    assert.deepEqual(battle.host.plan(battle.hero.plan).traitIds.slice().sort(),
      [...collections.skill.get(item.skill).doc.traits.map(trait => trait.id), ...item.bases.flatMap(base => base.traits.map(t => t.id))].sort());
    const effects = [];
    const trace = battle.host.world.trace;
    battle.host.world.trace = (kind, row) => { trace?.(kind, row); if (['spawn', 'area', 'summon'].includes(kind)) effects.push(kind); };
    battle.hero.casting = true;
    for (let frame = 0; frame < 45; frame++) battle.step(1 / 60);
    assert.ok(battle.hero.casts > 0 && effects.length > 0, `${template.id} must actually cast ${item.skill}`);
    assert.deepEqual(availableSkills({}, {}, collections, save.instances), [], 'unequipped weapons grant no skill');
  }
});

test('武器掉落与洗炼: every rarity retains its bound skill and only legendary rolls receive the fixed trait', () => {
  const random = equipmentRandom(942);
  for (const template of weapons) for (const rarity of ['common', 'magic', 'rare', 'legendary']) {
    const item = rollEquipment(template, library, { rarity, tier: 5, random });
    assert.equal(item.skill, template.skills[0]);
    assert.ok(rarity === 'common' ? item.affixes.length === 0 : rarity === 'magic' ? item.affixes.length >= 1 && item.affixes.length <= 2 : rarity === 'rare' ? item.affixes.length >= 3 && item.affixes.length <= 6 : item.affixes.length === 5);
    if (rarity === 'legendary') assert.equal(item.legendary.traits[0].id, template.legendary.id);
    else assert.equal(item.legendary, null);
    if (rarity === 'common') continue;
    for (const index of [0, null]) {
      const changed = rerollEquipment(item, library, { random, index });
      assert.equal(changed.baseId, template.id); assert.equal(changed.skill, item.skill);
      assert.equal(changed.affixes.length, item.affixes.length); assert.equal(changed.tier, 5);
      assert.deepEqual(changed.legendary, item.legendary);
      if (index === 0) assert.deepEqual(changed.affixes.slice(1), item.affixes.slice(1));
    }
  }
  const bad = { ...weapons[0], legendary: { ...weapons[0].legendary, id: 'missing_trait' } };
  assert.match(validateCollection('equipment', bad, library).error, /固定传奇词条.*未知特性/);
  for (const skills of [[], ['frost_lance', 'sentinel'], ['monster_claw']]) assert.match(validateCollection('equipment', { ...weapons[0], skills }, library).error, /仅绑定一个玩家技能/);
});

test('清档: delete all old player saves and backups; preserve only the new save and unrelated settings', () => {
  const map = new Map([['rulestudio.player.v1', '{"instances":{"old_weapon":{}}}'], ['rulestudio.player.v1.before-progression', '{}'],
    ['rulestudio.player.v2.before-progression', '{}'], ['rulestudio.theme', 'dark']]);
  const storage = { get length() { return map.size; }, key: index => [...map.keys()][index], getItem: key => map.get(key), removeItem: key => map.delete(key) };
  assert.equal(readPlayerSave(storage), null);
  assert.deepEqual([...map.keys()], ['rulestudio.theme']);
  const save = createProgression(collections, library);
  map.set(PLAYER_SAVE_KEY, JSON.stringify(save));
  assert.deepEqual(readPlayerSave(storage), save); assert.deepEqual(readPlayerSave(storage), save);
  assert.equal(save.stones, 0); assert.deepEqual(save.owned, { skill: {}, equipment: {}, item: {} });
  assert.equal(Object.keys(save.instances).length, 1); assert.equal(save.instances.starter_weapon.baseId, 'frostthorn_staff');
  assert.equal(check.catalog.startingStones, 0); assert.deepEqual(check.catalog.starter, ['equipment:frostthorn_staff']);
});

test('BD application: current weapon binding works and removed weapons are rejected before mutation', () => {
  const save = createProgression(collections, library);
  for (const weapon of weapons) {
    const result = applyBuildPreset(save, { skills: weapon.skills, equipment: { weapon: weapon.id } }, collections, library);
    assert.equal(result.error, ''); assert.equal(save.loadout.equipment.weapon, weapon.id);
  }
  const before = structuredClone(save);
  assert.match(applyBuildPreset(save, { skills: ['frost_lance'], equipment: { weapon: 'frostwhisper_staff' } }, collections, library).error, /无效/);
  assert.deepEqual(save, before);
});

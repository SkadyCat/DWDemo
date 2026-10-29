import test from 'node:test';
import assert from 'node:assert/strict';
import { readBaselineRuleFiles as readRuleFiles } from './rule-fixture.mjs';
import { checkRuleSet, listings, parseCatalog, serializeCatalog, defaultPrice, isFixedEquipmentSlot, skillSlots, availableSkills, validSkillSlots, changeSkillSlot, INDEX_NONE } from '../engine/index.mjs';
import { Battle } from '../public/sim/battle.mjs';

test('商店: catalog parses, everything is listed, 灵石 is the only currency', () => {
  const check = checkRuleSet(readRuleFiles());
  assert.ok(check.ok, check.error);
  const all = listings(check.collections, check.catalog);
  for (const kind of ['equipment', 'item']) assert.equal(all.filter(l => l.kind === kind).length, [...check.collections[kind].values()].filter(e => !isFixedEquipmentSlot(e.doc.slot)).length, kind);
  assert.ok(!all.some(l => l.id.startsWith('monster_')), 'monster skills are not sold');
  assert.ok(all.every(l => Number.isInteger(l.price) && l.price >= 0));
  assert.deepEqual(parseCatalog(serializeCatalog(check.catalog)).catalog, check.catalog);
  assert.match(parseCatalog('{"currency":{"id":"gold"}}').error, /唯一通货/);
  assert.match(parseCatalog('{"prices":{"item:x":-1}}').error, /非负整数/);
  const staff = check.collections.equipment.get('test_projectile_weapon').doc;
  assert.equal(all.find(l => l.id === 'test_projectile_weapon').price, check.catalog.prices['equipment:test_projectile_weapon'] ?? defaultPrice('equipment', staff));
});

test('3D 战斗: loadout skills with equipment, consumable grants, kills pay 灵石', () => {
  const files = readRuleFiles();
  const check = checkRuleSet(files);
  let stones = 0;
  const b = new Battle(files, { collections: check.collections, god: true, autoCast: true, seed: 3, onKill: s => { stones += s; } });
  b.setLoadout({ skills: ['frost_lance', 'player_slash'], equipment: { amulet: 'ember_amulet', ring: 'stormband', gloves: 'rending_gauntlets' }, belt: ['frost_tonic'] });
  assert.equal(b.skills.length, 4);
  assert.deepEqual(b.skills.slice(2), [null, null]);
  assert.ok(b.skills.filter(Boolean).every(s => s.plan >= 0), b.skills.filter(Boolean).map(s => s.error).join());
  const traits = b.host.world.plans[b.skills[0].plan].traitIds;
  for (const id of ['ignite', 'shock', 'bleed']) assert.ok(traits.includes(id), id);
  const seen = new Set();
  for (let i = 0; i < 900; ++i) {
    if (i === 30) assert.ok(b.useItem('frost_tonic'));
    b.step(1 / 60);
    for (const m of b.monsters) for (const s of b.monsterStatuses(m)) seen.add(s.id);
    if (i === 60) assert.ok(b.buffs().some(x => x.label === '寒霜药剂'));
  }
  for (const id of ['chill', 'ignite', 'shock', 'bleed']) assert.ok(seen.has(id), `status ${id} seen`);
  assert.ok(b.kills > 10 && stones > 0 && stones === b.earned);
  b.select(1);
  assert.equal(b.hero.skill, 'player_slash');
});

test('主动技能槽: migrate old saves, keep gaps, configure / move / clear without shifting', () => {
  const { collections } = checkRuleSet(readRuleFiles());
  const choices = availableSkills({ frost_lance: true, player_slash: true, deleted: true }, {}, collections);
  assert.deepEqual(skillSlots(), [null, null, null, null]);
  assert.deepEqual(validSkillSlots(['frost_lance', 'player_slash'], choices), ['frost_lance', 'player_slash', null, null]);
  assert.deepEqual(validSkillSlots(['deleted', null, 'frost_lance', 'frost_lance', 'player_slash'], choices), [null, null, 'frost_lance', null]);
  const input = ['frost_lance', 'player_slash', null, null];
  const moved = changeSkillSlot(input, 3, 'frost_lance', choices);
  assert.equal(moved.error, '');
  assert.deepEqual(moved.skills, [null, 'player_slash', null, 'frost_lance']);
  assert.deepEqual(input, ['frost_lance', 'player_slash', null, null]);
  const restored = JSON.parse(JSON.stringify(moved.skills));
  const cleared = changeSkillSlot(restored, 1, '', choices);
  assert.deepEqual(cleared.skills, [null, null, null, 'frost_lance']);
  assert.match(changeSkillSlot(cleared.skills, 4, 'player_slash', choices).error, /1–4/);
  assert.match(changeSkillSlot(cleared.skills, 0, 'monster_bolt', choices).error, /拥有/);
});

test('主动技能槽: equipment grants a configurable choice and never fills an empty slot', () => {
  const files = readRuleFiles();
  const { collections } = checkRuleSet(files);
  // Keep the grant prerequisite local: editing the staff in the studio is valid.
  collections.equipment.get('test_projectile_weapon').doc.skills = ['frost_lance'];
  const equipment = { weapon: 'test_projectile_weapon' };
  const choices = availableSkills({}, equipment, collections);
  assert.ok(choices.some(s => s.id === 'frost_lance' && s.granted));
  const battle = new Battle(files, { collections, god: true, autoCast: true, maxMonsters: 0, spawnRate: 0 });
  battle.setLoadout({ skills: [], equipment });
  assert.deepEqual(battle.skills, [null, null, null, null]);
  assert.equal(battle.hero.plan, INDEX_NONE);
  const skills = changeSkillSlot([], 3, 'frost_lance', choices).skills;
  battle.setLoadout({ skills, equipment });
  battle.select(3);
  assert.equal(battle.hero.skill, 'frost_lance');
  assert.equal(battle.skills[3].granted, true);
  const removed = validSkillSlots(skills, availableSkills({}, {}, collections));
  assert.deepEqual(removed, [null, null, null, null], 'removing the granting equipment clears that slot');
});

test('主动技能槽: slot 4 casts, empty slots stop casting but keep movement, selection stays put', () => {
  const files = readRuleFiles();
  const { collections } = checkRuleSet(files);
  const battle = new Battle(files, { collections, god: true, autoCast: true, maxMonsters: 0, spawnRate: 0 });
  const loadout = { skills: [null, 'player_slash', null, 'frost_lance'], equipment: {} };
  battle.setLoadout(loadout);
  battle.hero.move = { x: 1, y: 0 };
  const startX = battle.hero.x;
  for (let i = 0; i < 60; i++) battle.step(1 / 60);
  assert.ok(battle.hero.x > startX, 'empty active slot still permits movement');
  assert.equal(battle.hero.casts, 0);
  assert.equal(battle.hero.skill, '');
  battle.select(3);
  for (let i = 0; i < 60; i++) battle.step(1 / 60);
  assert.equal(battle.hero.skill, 'frost_lance');
  assert.ok(battle.hero.casts > 0);
  const casts = battle.hero.casts;
  loadout.skills[3] = null;
  battle.setLoadout(loadout);
  assert.equal(battle.selected, 3, 'clearing the current slot does not select another skill');
  assert.equal(battle.hero.plan, INDEX_NONE);
  assert.equal(battle.skills[1].id, 'player_slash', 'other skills keep their shortcut number');
  for (let i = 0; i < 60; i++) battle.step(1 / 60);
  assert.equal(battle.hero.casts, casts, 'no stale or fallback skill is cast');
  battle.select(1);
  assert.equal(battle.hero.skill, 'player_slash');
});

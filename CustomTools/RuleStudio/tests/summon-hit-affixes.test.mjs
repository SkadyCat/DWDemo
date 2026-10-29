import test from 'node:test';
import assert from 'node:assert/strict';
import { readRuleFiles } from '../scripts/rule-files.mjs';
import { checkRuleSet, parseCollection, validateCollection, validateTraitValueEntry, equipmentAffixPool,
  rollEquipmentAffix, sampleEquipmentAffixes, rollEquipment, equipmentRandom, rerollPool } from '../engine/index.mjs';
import { SUMMON_HIT_AFFIXES } from '../engine/summon-hit-affixes.mjs';
import { emptyHunter, hunterAllows } from '../engine/loot-hunter.mjs';
import { affixName, affixText } from '../public/affix-text.mjs';
import { Battle } from '../public/sim/battle.mjs';

const files = readRuleFiles(), checked = checkRuleSet(files);
assert.ok(checked.ok, checked.error);
const { library, collections, tags: tagIndex } = checked;
const pool = equipmentAffixPool(library);
const definitions = SUMMON_HIT_AFFIXES.map(spec => pool.find(affix => affix.id === spec.id));
const copy = value => structuredClone(value);

function battle(definition, { chance = 100, extras = [] } = {}) {
  const traits = copy(definition.traits); traits[0].params.chance = chance;
  const parsed = parseCollection('equipment', { id: 'summon_hit_probe', name: definition.name,
    slot: 'ring', rarity: 'magic', traits: [...traits, ...extras] });
  assert.ok(parsed.doc, parsed.error);
  assert.equal(validateCollection('equipment', parsed.doc, library).error, '');
  const equipped = { ...collections, equipment: new Map([...collections.equipment, [parsed.doc.id, { doc: parsed.doc }]]) };
  const b = new Battle(files, { collections: equipped, maxMonsters: 0, spawnRate: 0, god: true, seed: 17 });
  b.setLoadout({ skills: ['frost_lance'], equipment: { ring: parsed.doc.id } });
  assert.equal(b.skills[0].error, '');
  b.spawnMonsters(1);
  Object.assign(b.monsters[0], { x: 300, y: 0, health: 1e6, maxHealth: 1e6, speed: 0, cooldown: 999,
    shield: 0, maxShield: 0, elite: false, attackRange: 0, resistance: [0, 0, 0, 0, 0, 0] });
  const events = [], trace = b.host.world.trace;
  b.host.world.trace = (type, data) => {
    const index = data.root ? b.host.world.roots.indexOf(data.root) : -1;
    events.push({ ...data, type, minion: !!b.combat.rootInfo(index)?.minion }); trace?.(type, data);
  };
  const step = (frames, cast = false) => { b.hero.casting = cast; for (let i = 0; i < frames; i++) b.step(1 / 60); b.hero.casting = false; };
  return { b, events, step };
}

test('four concrete summon-on-hit affixes include complete existing skills and show actual chance without manual stitching', () => {
  assert.equal(definitions.length, 4);
  for (const [i, definition] of definitions.entries()) {
    const spec = SUMMON_HIT_AFFIXES[i]; assert.ok(definition, spec.id);
    assert.equal(definition.traits.length, 1);
    const root = definition.traits[0]; assert.equal(root.id, 'trig_hit');
    assert.deepEqual(root.params, Object.fromEntries(library.trait('trig_hit').source.params));
    assert.deepEqual(root.with.map(entry => entry.id), library.build(spec.skill).traits);
    const actual = copy(definition); actual.traits[0].params.chance = 17;
    assert.equal(affixName(actual, library), spec.name.replace('n%', '17%'));
    assert.equal(affixText(actual, library), spec.name.replace('n%', '17%'));
    assert.ok(rerollPool(library, tagIndex, 'proc').some(entry => entry.id === spec.id));
  }
});

test('existing ten-tier equipment rolls save chance and every mounted parameter at the same permitted tier', () => {
  const random = equipmentRandom(27), before = JSON.stringify(definitions);
  for (let maxTier = 1; maxTier <= 10; maxTier++) for (const definition of definitions) {
    const rolled = rollEquipmentAffix(definition, random, library, maxTier);
    assert.ok(rolled.tier >= 1 && rolled.tier <= maxTier);
    const walk = entry => {
      assert.equal(validateTraitValueEntry(library, entry), '');
      if (library.trait(entry.id).source.params.size) assert.equal(entry.tier, rolled.tier);
      entry.with.forEach(walk);
    };
    rolled.traits.forEach(walk);
    assert.doesNotMatch(affixText(rolled, library), /n%|挂载技能/);
  }
  assert.equal(JSON.stringify(definitions), before, 'rolling must not mutate the shared definitions');
});

test('normal equipment acquisition rolls each as one quality affix, with distinct Hunter targets', () => {
  const template = collections.equipment.get('frostthorn_staff').doc;
  for (const definition of definitions) {
    let draw = 0;
    const index = pool.findIndex(affix => affix.id === definition.id);
    const random = () => ++draw === 1 ? 0 : draw === 2 ? (index + .5) / pool.length : .5;
    const item = rollEquipment(template, library, { rarity: 'magic', tier: 3, random });
    assert.equal(item.affixes.length, 1); assert.equal(item.affixes[0].id, definition.id);
    assert.ok(item.affixes[0].traits[0].with.length >= 2);
    assert.equal(hunterAllows({ kind: 'equipment', item }, { ...emptyHunter(), targets: [definition.id] }), true);
    const other = definitions.find(affix => affix.id !== definition.id);
    assert.equal(hunterAllows({ kind: 'equipment', item }, { ...emptyHunter(), targets: [other.id] }), false);
  }
});

for (const [index, spec] of SUMMON_HIT_AFFIXES.entries()) test(`${spec.skill}: concrete affix summons and attacks from a real hit, obeying chance and no-recursion rules`, () => {
  const idle = battle(definitions[index]); idle.step(90);
  assert.equal(idle.b.combat.minions.alive().length, 0);
  const failed = battle(definitions[index], { chance: 0 }); failed.step(20, true); failed.step(240);
  assert.equal(failed.b.combat.minions.alive().length, 0);
  const active = battle(definitions[index]); active.step(20, true); active.step(240);
  const summon = active.b.combat.minions.alive().find(state => state.kind === spec.skill);
  assert.ok(summon, spec.id); assert.equal(active.b.hero.casting, false);
  assert.equal(active.b.combat.rootInfo(summon.summon.root).triggered, true);
  assert.ok(active.events.some(event => event.type === 'summon_fire' && event.id === summon.id));
  assert.ok(active.events.some(event => event.type === 'damage' && event.OwnerExternalId === 1 && event.Amount > 0 && event.minion));
  assert.equal(active.b.combat.triggers.fired, 1, 'summon damage must not recursively trigger more summons');
});

test('different mounted summons can coexist; existing per-event limits still determine how many fire', () => {
  const rolled = sampleEquipmentAffixes(definitions, 4, equipmentRandom(8), [], library, 3);
  assert.equal(new Set(rolled.map(affix => affix.id)).size, 4);
  const all = { name: '四种命中召唤', traits: definitions.flatMap(definition => copy(definition.traits)) };
  for (const entry of all.traits) entry.params.chance = 100;
  const limited = battle(all); limited.step(20, true); limited.step(240);
  assert.equal(limited.b.combat.triggers.fired, 1);
  const expanded = battle(all, { extras: [{ id: 'trigger_per_event', params: { n: 3 } }, { id: 'control_unit_cap', params: { n: 3 } }] });
  expanded.step(20, true); expanded.step(240);
  assert.equal(expanded.b.combat.triggers.fired, 4);
  assert.deepEqual(new Set(expanded.b.combat.minions.alive().map(state => state.kind)), new Set(SUMMON_HIT_AFFIXES.map(spec => spec.skill)));
});

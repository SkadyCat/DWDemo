import test from 'node:test';
import assert from 'node:assert/strict';
import { readRuleFiles } from '../scripts/rule-files.mjs';
import { checkRuleSet, rollEquipment, equipmentRandom, equipmentDocument } from '../engine/index.mjs';
import { emptyHunter, hunterAllows } from '../engine/loot-hunter.mjs';
import { affixName } from '../public/affix-text.mjs';
import { Battle } from '../public/sim/battle.mjs';

const files = readRuleFiles(), checked = checkRuleSet(files);
assert.ok(checked.ok, checked.error);
const designs = [
  ['iron_guard_command_crown', 'iron_guard'], ['ember_hound_pact_chest', 'ember_hound'],
  ['fire_turret_clockwork_gloves', 'fire_turret'], ['storm_totem_march_boots', 'storm_totem'],
];
const templates = designs.map(([id]) => checked.collections.equipment.get(id).doc);

test('four legendary fixed summons match the existing concrete Hunter targets, with concrete chance text and five random lines', () => {
  for (const [i, [id, kind]] of designs.entries()) for (const tier of [1, 5, 10]) {
    const item = rollEquipment(templates[i], checked.library, { tier, uid: id, random: equipmentRandom(17) });
    assert.equal(item.legendary.id, 'hit_summon_' + kind);
    assert.equal(item.affixes.length, 5);
    assert.equal(hunterAllows({ kind: 'equipment', item }, { ...emptyHunter(), targets: ['hit_summon_' + kind] }), true);
    assert.equal(hunterAllows({ kind: 'equipment', item }, { ...emptyHunter(), targets: ['absent'] }), false);
    const text = affixName(item.legendary, checked.library);
    assert.ok(text.includes(item.legendary.traits[0].params.chance + '%'));
    assert.doesNotMatch(text, /n%|挂载技能/);
    assert.equal(equipmentDocument(item, checked.collections).traits.filter(entry => entry.id === 'trig_hit' &&
      entry.with.some(child => child.id === 'summon_' + kind)).length, 1, 'fixed trait is aggregated once');
  }
});

test('four real T1 legendary rolls work together: existing caps and ordinary hits create all four attacking summons', () => {
  const instances = {}, equipment = {};
  for (const [i, template] of templates.entries()) {
    const item = rollEquipment(template, checked.library, { uid: 'summon_legendary_' + i, tier: 1, random: equipmentRandom(41 + i) });
    instances[item.uid] = item; equipment[item.slot] = item.uid;
  }
  const b = new Battle(files, { collections: checked.collections, instances, maxMonsters: 0, spawnRate: 0, god: true, seed: 17 });
  b.setLoadout({ skills: ['frost_lance'], equipment, instances });
  assert.equal(b.skills[0].error, '');
  assert.ok(b.combat.minions.controlCap() >= 4);
  assert.ok(b.combat.s('trigger.per_event') >= 3);
  b.spawnMonsters(1);
  Object.assign(b.monsters[0], { x: 300, y: 0, health: 1e8, maxHealth: 1e8, speed: 0, cooldown: 999,
    shield: 0, maxShield: 0, attackRange: 0, resistance: [0, 0, 0, 0, 0, 0] });
  const seen = new Set(), attacking = new Set(), trace = b.host.world.trace;
  b.host.world.trace = (type, data) => {
    if (type === 'summon') seen.add(data.kind);
    if (type === 'summon_fire') {
      const state = b.combat.minions.states.get(data.id); if (state) attacking.add(state.kind);
    }
    trace?.(type, data);
  };
  let together = false;
  b.hero.casting = true;
  for (let frame = 0; frame < 7200 && !(together && attacking.size === 4); frame++) {
    b.step(1 / 60);
    const kinds = new Set(b.combat.minions.alive().map(state => state.kind));
    if (designs.every(([, kind]) => kinds.has(kind))) together = true;
    assert.ok(b.combat.minions.alive().length <= b.combat.minions.controlCap());
  }
  b.hero.casting = false;
  for (const [, kind] of designs) { assert.ok(seen.has(kind), kind + ' must be summoned'); assert.ok(attacking.has(kind), kind + ' must attack'); }
  assert.ok(together, 'four fixed legendary effects must actually coexist using only existing control and trigger rules');
  assert.ok(b.damageDealt > 0);
});

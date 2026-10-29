import test from 'node:test';
import assert from 'node:assert/strict';
import { readRuleFiles } from '../scripts/rule-files.mjs';
import { checkRuleSet, parseCollection, equipmentAffixPool, rollEquipmentAffix, equipmentRandom, validateTraitValueEntry } from '../engine/index.mjs';
import { Battle } from '../public/sim/battle.mjs';
import { characterPanel } from '../public/battle-panels.mjs';
import { affixText } from '../public/affix-text.mjs';
import { HERO_TARGET_ID } from '../public/sim/arena.mjs';

const files = readRuleFiles(), checked = checkRuleSet(files);
assert.ok(checked.ok, checked.error);
const kinds = ['iron_guard', 'ember_hound', 'fire_turret', 'storm_totem'];
function create(traits = []) {
  const { doc, error } = parseCollection('equipment', { id: 'control_probe', slot: 'ring', name: '控制上限测试', rarity: 'rare', traits });
  assert.ok(doc, error);
  const collections = { ...checked.collections, equipment: new Map([...checked.collections.equipment, [doc.id, { doc }]]) };
  const b = new Battle(files, { collections, god: true, maxMonsters: 0, spawnRate: 0, seed: 17 });
  b.setLoadout({ skills: kinds, equipment: { ring: doc.id } });
  const step = (frames = 1) => { for (let i = 0; i < frames; i++) b.step(1 / 60); };
  const cast = (kind, owner = b.hero.owner) => {
    const plan = b.skills.find(skill => skill.id === kind).plan;
    b.host.castBuild(plan, owner, { x: 0, y: 0, z: 60 }, { x: 1, y: 0, z: 0 }); step();
    return b.combat.minions.alive().at(-1);
  };
  return { b, step, cast };
}

test('player defaults to one shared controlled unit across all four summon kinds and replacements retain attack rhythm', () => {
  const { b, cast } = create();
  assert.equal(b.combat.minions.controlCap(), 1);
  let previous;
  for (const kind of kinds) {
    const incoming = cast(kind);
    assert.equal(b.combat.minions.alive().length, 1);
    assert.equal(incoming.kind, kind);
    if (previous) {
      assert.equal(previous.dead, true);
      assert.equal(previous.summon.replaced, true);
      assert.ok(incoming.summon.nextFire >= previous.summon.nextFire);
    }
    previous = incoming;
  }
  assert.equal(b.summons().length, 1);
  const row = characterPanel(b).combat.find(row => row.key === 'controlUnits');
  assert.equal(row.value, '1 / 1');
});

test('control-unit affix raises the shared limit, stacks from multiple entries and retires oldest units', () => {
  const { b, cast, step } = create([{ id: 'control_unit_cap', params: { n: 1 } }]);
  b.host.grantTraits(HERO_TARGET_ID, [{ id: 'control_unit_cap', params: { n: 1 } }], 10, '额外控制名额'); step();
  assert.equal(b.combat.minions.controlCap(), 3);
  const first = cast(kinds[0]); cast(kinds[1]); cast(kinds[2]);
  assert.equal(b.combat.minions.alive().length, 3);
  cast(kinds[3]); assert.equal(first.dead, true);
  assert.deepEqual(b.combat.minions.alive().map(unit => unit.kind), kinds.slice(1));
  assert.equal(characterPanel(b).combat.find(row => row.key === 'controlUnits').value, '3 / 3');
});

test('same-kind limits remain separate; raising them alone cannot bypass the global control budget', () => {
  const limited = create([{ id: 'minion_cap', params: { n: 8 } }]);
  for (let i = 0; i < 4; i++) limited.cast('iron_guard');
  assert.equal(limited.b.combat.minions.alive().length, 1);
  const expanded = create([{ id: 'control_unit_cap', params: { n: 2 } }, { id: 'minion_cap', params: { n: 2 } }]);
  for (let i = 0; i < 4; i++) expanded.cast('iron_guard');
  assert.equal(expanded.b.combat.minions.alive().length, 3);
});

test('per-cast extras, temporary copies and empowered copies all obey the control limit', () => {
  for (const n of [0, 2]) {
    const { b, cast } = create([{ id: 'control_unit_cap', params: { n } }, { id: 'minion_per_cast', params: { n: 4 } }]);
    let current = cast('iron_guard');
    assert.equal(b.combat.minions.alive().length, 1 + n);
    current = b.combat.minions.copy(current.summon, { temp: true, duration: 4 });
    assert.ok(current.temp); assert.equal(b.combat.minions.alive().length, 1 + n);
    current = b.combat.minions.copy(current.summon, { empowered: true, duration: 4 });
    assert.ok(current.empowered); assert.equal(b.combat.minions.alive().length, 1 + n);
  }
});

test('removing equipment or expiring a held control-cap bonus trims excess units on the next frame', () => {
  const { b, cast, step } = create([{ id: 'control_unit_cap', params: { n: 3 } }]);
  kinds.forEach(kind => cast(kind));
  b.setLoadout({ skills: kinds, equipment: {} }); step();
  assert.equal(b.combat.minions.alive().length, 1);
  assert.equal(b.combat.minions.alive()[0].kind, 'storm_totem');
  b.host.grantTraits(HERO_TARGET_ID, [{ id: 'control_unit_cap', params: { n: 2 } }], .3, '控制名额增益');
  step(); cast('iron_guard'); cast('ember_hound');
  assert.equal(b.combat.minions.alive().length, 3);
  step(30); assert.equal(b.combat.minions.alive().length, 1);
});

test('other owners and storm effects do not consume player-controlled unit slots', () => {
  const { b, cast, step } = create(['death_lightning']);
  const other = b.host.registerOwner(712, 1);
  cast('fire_turret', other); cast('iron_guard');
  b.spawnMonsters(1);
  Object.assign(b.monsters[0], { x: 300, y: 0, health: 1, maxHealth: 1000, speed: 0, cooldown: 999,
    shield: 0, maxShield: 0, attackRange: 0, resistance: [0, 0, 0, 0, 0, 0] });
  b.host.applyStatus(b.monsters[0].id, 'shock', 20, 5);
  cast('storm_totem'); step(120);
  assert.equal(b.combat.minions.alive().length, 1);
  assert.equal(b.host.world.summons.filter(summon => b.host.world.roots[summon.root].owner === other).length, 1);
  assert.equal(b.host.world.summons.filter(summon => summon.storm).length, 1, 'an actual shocked kill creates a storm alongside the controlled unit');
});

test('repeated cross-kind replacement and later expiration release every summon root', () => {
  const { b, cast, step } = create();
  for (let i = 0; i < 150; i++) { cast(kinds[i % kinds.length]); assert.equal(b.combat.minions.alive().length, 1); }
  step(700);
  assert.equal(b.combat.minions.alive().length, 0);
  assert.equal(b.host.world.summons.length, 0);
  assert.equal(b.host.world.activeRoots(), 0);
});

test('control-cap line is in the ordinary equipment pool, with ten-tier rolls and concrete player-facing values', () => {
  const definition = equipmentAffixPool(checked.library).find(affix => affix.id === 'control_unit_cap');
  assert.ok(definition);
  const random = equipmentRandom(8);
  for (let maxTier = 1; maxTier <= 10; maxTier++) {
    const rolled = rollEquipmentAffix(definition, random, checked.library, maxTier);
    assert.ok(rolled.tier >= 1 && rolled.tier <= maxTier);
    assert.equal(validateTraitValueEntry(checked.library, rolled.traits[0]), '');
    assert.equal(affixText(rolled, checked.library), `控制单位上限 +${rolled.traits[0].params.n}`);
  }
});

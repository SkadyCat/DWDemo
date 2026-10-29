import test from 'node:test';
import assert from 'node:assert/strict';
import { readRuleFiles } from '../scripts/rule-files.mjs';
import { checkRuleSet, equipmentAffixPool } from '../engine/index.mjs';
import { Battle } from '../public/sim/battle.mjs';
import { DungeonBattle } from '../public/sim/dungeon-battle.mjs';

const files = readRuleFiles(), checked = checkRuleSet(files);
assert.ok(checked.ok, checked.error);
const range = n => ({ id: 'monster_seek_range', params: { n } });
function monsterBattle(ctor = Battle, traits = [range(4)]) {
  const doc = { ...checked.monsters.get('claw_beast').doc, traits, speed: 300,
    skills: [{ id: 'monster_nova', enabled: true, range: 2000, cooldown: .2, power: 1 }] };
  const b = new ctor(files, { collections: checked.collections, monsterTypes: [doc], maxMonsters: 0, spawnRate: 0, god: true, seed: 18 });
  b.setLoadout({ skills: [] });
  b.spawnMonsters(1);
  const m = b.monsters[0]; Object.assign(m, { x: b.hero.x + 600, y: b.hero.y, cooldown: 0 });
  return { b, m };
}

test('monster range is per unit, gates real movement/casting, and refreshes without rebuilding the battle', () => {
  const { b, m } = monsterBattle();
  for (let i = 0; i < 60; i++) b.step(1 / 60);
  assert.equal(m.x, 600); assert.equal(m.casts, 0);
  b.spawnMonsters(1); const other = b.monsters[1]; Object.assign(other, { x: 600, y: 0 });
  b.setMonsterTraits(m, [range(8)]);
  assert.equal(b.canMonsterPursue(m), true); assert.equal(b.canMonsterPursue(other), false);
  for (let i = 0; i < 30; i++) b.step(1 / 60);
  assert.ok(m.x < 600); assert.ok(m.casts > 0);
  b.setMonsterTraits(m, [range(0)]); Object.assign(m, { x: b.hero.x, y: b.hero.y });
  assert.equal(b.canMonsterPursue(m), false, 'explicit zero never falls back');
  b.setMonsterTraits(m, [range(-4)]); assert.equal(b.canMonsterPursue(m), false);
});

test('dungeon keeps legacy fallback, uses meters, aggregates ordinary traits, and stops after clear', () => {
  const { b, m } = monsterBattle(DungeonBattle, []);
  assert.equal(b.monsterSeekRange(m), 20);
  Object.assign(m, { x: b.hero.x + 2000, y: b.hero.y });
  assert.equal(b.canMonsterPursue(m), true, '20 m boundary acquires');
  m.x += .01; assert.equal(b.canMonsterPursue(m), false, 'outside 20 m does not acquire');
  m.x = b.hero.x + 600;
  b.monsterSettings.aggroRadiusMeters = 3; assert.equal(b.canMonsterPursue(m), false);
  const gear = { ...checked.collections.equipment.get('monster_lineage_claw_beast').doc, traits: [{ ...range(2), with: [] }] };
  b.collections.equipment.set(gear.id, { doc: gear });
  b.setMonsterEquipment(m, 'lineage', gear.id);
  b.setMonsterTraits(m, [range(4)]);
  assert.equal(b.monsterSeekRange(m), 6); assert.equal(b.canMonsterPursue(m), true);
  m.x += .01; assert.equal(b.canMonsterPursue(m), false);
  b.phase = 'cleared'; m.x = b.hero.x; assert.equal(b.canMonsterPursue(m), false);
  assert.ok([...checked.monsters.values()].every(({ doc }) => doc.traits.some(t => t.id === 'monster_seek_range' && t.params.n === 20)), 'production monsters declare the 20 metre base range as a trait');
});

function summonBattle(traits) {
  const gear = { id: 'seek_probe', slot: 'ring', rarity: 'unique', traits };
  const source = [...files, { path: 'Equipment/seek_probe.json', text: JSON.stringify(gear) }];
  const check = checkRuleSet(source); assert.ok(check.ok, check.error);
  const b = new Battle(source, { collections: check.collections, maxMonsters: 0, spawnRate: 0, god: true });
  b.setLoadout({ skills: ['sentinel'], equipment: { ring: gear.id } });
  b.hero.casting = true; for (let i = 0; i < 20; i++) b.step(1 / 60); b.hero.casting = false;
  const st = b.combat.minions.alive()[0]; assert.ok(st, 'real summoned unit');
  b.spawnMonsters(1); const m = b.monsters[0];
  Object.assign(m, { x: st.summon.x * 100 + 600, y: st.summon.y * 100, radius: 0, speed: 0, cooldown: 999 });
  b.step(1 / 60);
  return { b, st, m, select: () => b.combat.minions.target(st.summon, -1) };
}

test('summon range trait overrides base and composes with the existing percentage, including explicit zero', () => {
  for (const [traits, expected, acquires] of [
    [[], 10, true],
    [[{ id: 'minion_seek', params: { n: 50 } }], 15, true],
    [[{ id: 'minion_seek_range', params: { n: 4 } }], 4, false],
    [[{ id: 'minion_seek_range', params: { n: 4 } }, { id: 'minion_seek', params: { n: 50 } }], 6, true],
    [[{ id: 'minion_seek_range', params: { n: 0 } }], 0, false],
  ]) {
    const f = summonBattle(traits); const pick = f.select();
    assert.equal(f.st.summon.range, expected); assert.equal(pick >= 0, acquires);
    if (acquires) assert.equal(f.st.targetId, f.m.id);
    else assert.equal(f.st.targetId, 0);
  }
});

test('intrinsic base-range settings never become random equipment affixes', () => {
  const ids = equipmentAffixPool(checked.library).map(a => a.id);
  assert.ok(!ids.includes('monster_seek_range')); assert.ok(!ids.includes('minion_seek_range'));
  assert.ok(ids.includes('minion_seek'), 'existing percentage affix stays available');
});

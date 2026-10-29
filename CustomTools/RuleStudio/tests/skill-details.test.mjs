import test from 'node:test';
import assert from 'node:assert/strict';
import { checkRuleSet } from '../engine/index.mjs';
import { Battle } from '../public/sim/battle.mjs';
import { HERO_TARGET_ID } from '../public/sim/arena.mjs';
import { skillDetails } from '../public/skill-details.mjs';
import { readBaselineRuleFiles } from './rule-fixture.mjs';

const files = [...readBaselineRuleFiles(),
  { path: 'Traits/preview_no_crit.json', text: JSON.stringify({ id: 'preview_no_crit', modifiers: [{ target: 'owner', stat: 'critical_chance', op: 'set', value: 0 }] }) },
  { path: 'Equipment/preview_weapon.json', text: JSON.stringify({ id: 'preview_weapon', name: '悬停测试武器', slot: 'weapon', skills: ['frost_lance'], traits: [
    { id: 'flat_frost', params: { n: 10 } }, { id: 'inc_frost', params: { n: 100 } }, { id: 'more_frost', params: { n: 50 } },
    { id: 'proj_damage', params: { n: 20 } }, { id: 'area_damage', params: { n: 200 } }, { id: 'minion_damage', params: { n: 90 } }, 'preview_no_crit',
  ] }) },
];
const check = checkRuleSet(files); assert.ok(check.ok, check.error);
function create() {
  const b = new Battle(files, { collections: check.collections, maxMonsters: 0, spawnRate: 0, god: true, seed: 5 });
  b.setLoadout({ skills: ['frost_lance', 'player_slash', 'sentinel'], equipment: { weapon: 'preview_weapon' } });
  b.refreshSheet(); return b;
}
const characterState = c => { const { random, ...state } = c; return structuredClone(state); };

test('skill hover damage matches actual noncritical projectile + flat hit rows and filters unrelated families', () => {
  const b = create(), detail = skillDetails(b, 0);
  assert.equal(detail.hits[0].amount, 128);
  assert.ok(detail.traits.some(row => row.id === 'flat_frost' && row.name === '基础冰霜伤害 +10' && row.from === '悬停测试武器'));
  assert.ok(detail.traits.some(row => row.id === 'proj_damage'));
  assert.ok(!detail.traits.some(row => ['area_damage', 'minion_damage'].includes(row.id)));
  b.spawnMonsters(1);
  Object.assign(b.monsters[0], { x: 300, y: 0, health: 10000, maxHealth: 10000, speed: 0, cooldown: 999, shield: 0, maxShield: 0, elite: false, resistance: [0, 0, 0, 0] });
  const rows = [], trace = b.host.world.trace;
  b.host.world.trace = (kind, data) => { if (kind === 'damage' && data.OwnerExternalId === 1) rows.push(data); trace(kind, data); };
  b.hero.casting = true;
  for (let i = 0; i < 90 && !rows.length; i++) b.step(1 / 60);
  assert.ok(rows.length >= 2); assert.ok(rows.every(row => !row.bCritical));
  assert.equal(+rows.reduce((sum, row) => sum + row.raw, 0).toFixed(1), detail.hits[0].amount);
});

test('hovering another slot does not select, spend, cast or alter live sheet / state; summon offense stays separate', () => {
  const b = create(), before = characterState(b.character), hero = structuredClone(b.hero), roots = b.host.world.roots.length;
  const other = skillDetails(b, 1), summon = skillDetails(b, 2);
  assert.equal(other.id, 'player_slash'); assert.ok(other.traits.some(row => row.id === 'area_damage'));
  assert.ok(!other.traits.some(row => row.id === 'proj_damage'));
  assert.equal(summon.summon, true); assert.equal(summon.hits.length, 0);
  assert.ok(summon.traits.some(row => row.id === 'minion_damage'));
  assert.ok(!summon.traits.some(row => row.id === 'flat_frost'));
  assert.deepEqual(characterState(b.character), before); assert.deepEqual(b.hero, hero);
  assert.equal(b.selected, 0); assert.equal(b.host.world.roots.length, roots);
  b.select(1); b.refreshSheet(); assert.deepEqual(skillDetails(b, 1).hits, other.hits);
  assert.equal(skillDetails(b, 3), null);
});

test('timed grants update hover damage and actual values, then disappear on expiry', () => {
  const b = create(), base = skillDetails(b, 0).hits[0].amount;
  b.host.grantTraits(HERO_TARGET_ID, [{ id: 'flat_frost', params: { n: 17 } }], .2, '实时伤害增益'); b.refreshSheet();
  const buffed = skillDetails(b, 0);
  assert.ok(buffed.hits[0].amount > base);
  assert.ok(buffed.traits.some(row => row.name === '基础冰霜伤害 +17' && row.from === '实时伤害增益' && row.remaining > 0));
  for (let i = 0; i < 30; i++) b.step(1 / 60);
  const expired = skillDetails(b, 0);
  assert.equal(expired.hits[0].amount, base); assert.ok(!expired.traits.some(row => row.from === '实时伤害增益'));
});

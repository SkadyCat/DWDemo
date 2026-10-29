import test from 'node:test';
import assert from 'node:assert/strict';
import {readRuleFiles} from '../scripts/rule-files.mjs';
import {checkRuleSet, parseCollection} from '../engine/index.mjs';
import {Battle} from '../public/sim/battle.mjs';
import {auraDetails} from '../public/skill-details.mjs';

const files = readRuleFiles(), checked = checkRuleSet(files);
assert.ok(checked.ok, checked.error);
function fixture(activeAuras = []) {
  const gear = ['aura_fire', 'vector_control', 'aura_evasion'].map((id, i) => parseCollection('equipment', {
    id: 'hover_aura_' + i, name: '光环测试装备' + i, slot: ['ring', 'amulet', 'gloves'][i], skills: [id], traits: [],
  }).doc);
  const collections = {...checked.collections, equipment: new Map([...checked.collections.equipment, ...gear.map(doc => [doc.id, {doc}])])};
  const b = new Battle(files, {collections, maxMonsters: 0, spawnRate: 0, seed: 45});
  b.setLoadout({skills: ['frost_lance'], equipment: Object.fromEntries(gear.map(doc => [doc.slot, doc.id])),
    belt: ['aura:aura_fire', 'aura:vector_control', 'aura:aura_evasion'], activeAuras});
  return b;
}

test('belt aura hover works while off and includes effects, reservation and equipment source', () => {
  const b = fixture(), detail = auraDetails(b, 'vector_control');
  assert.equal(detail.name, '矢量操控'); assert.equal(detail.kind, 'aura'); assert.equal(detail.enabled, false);
  assert.equal(detail.reservation, 50); assert.match(detail.description, /捕获/);
  assert.ok(detail.traits.some(row => row.id === 'projectile_capture'));
  assert.ok(detail.stats.some(row => row.name === '授予装备' && row.value === '光环测试装备1'));
  assert.ok(!detail.description.includes('Q/E/F/G'));
  assert.equal(auraDetails(b, 'frost_lance'), null); assert.equal(auraDetails(b, null), null);
  assert.equal(auraDetails(null, 'vector_control'), null);
});

test('aura state follows actual runtime enablement, budget rejection, off and removal', () => {
  const b = fixture(['aura_fire', 'vector_control', 'aura_evasion']);
  assert.equal(auraDetails(b, 'aura_fire').enabled, true);
  assert.equal(auraDetails(b, 'vector_control').enabled, true);
  assert.equal(auraDetails(b, 'aura_evasion').enabled, false, 'third requested aura exceeds the actual budget');
  assert.equal(b.character.reservedMana, b.character.maxMana);
  b.setLoadout({...b.loadout, activeAuras: []});
  assert.equal(auraDetails(b, 'aura_fire').enabled, false); assert.equal(b.character.reservedMana, 0);
  b.setLoadout({...b.loadout, belt: []}); assert.equal(auraDetails(b, 'aura_fire'), null);
});

test('repeated aura hovers do not select, cast, reserve mana, compile or alter combat state', () => {
  const b = fixture(['aura_fire']);
  const state = () => JSON.stringify({selected: b.selected, hero: b.hero, loadout: b.loadout,
    mana: b.character.mana, reserved: b.character.reservedMana, plans: b.host.world.plans.length,
    roots: b.host.world.roots.length, clock: b.host.world.clock, effects: b.auraParts});
  const before = state();
  for (let i = 0; i < 20; i++) for (const id of ['aura_fire', 'vector_control', 'aura_evasion']) assert.ok(auraDetails(b, id));
  assert.equal(state(), before);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readBaselineRuleFiles as readRuleFiles } from './rule-fixture.mjs';
import { Arena } from '../public/sim/arena.mjs';
import { runCombat } from '../public/combat.mjs';
import { describePlan } from '../public/plan-view.mjs';

test('基础战斗: frost_lance single cast hits once and chills', () => {
  const result = runCombat(readRuleFiles(), { build: 'frost_lance', layout: 'lane', count: 12, health: 60 });
  assert.ifError(result.error);
  assert.equal(result.total.hits, 1);
  assert.equal(result.remaining.chill, 1);
  assert.ok(result.trace.some(e => e.kind === 'rule' && e.rule === 'chill/chill_on_cold_hit'), 'chill rule fired');
  assert.ok(result.trace.some(e => e.kind === 'status'), 'status applied');
});

test('基础战斗: all traits match the UE parity numbers (damage 202, 16 hits, 3 kills)', () => {
  const result = runCombat(readRuleFiles(), { build: 'frost_lance', extra: ['multiple_projectiles', 'pierce', 'ricochet', 'brittle', 'shatter', 'cold_mastery'], layout: 'lane', count: 12, health: 60 });
  assert.ifError(result.error);
  assert.equal(Math.round(result.total.damage), 202);
  assert.equal(result.total.hits, 16);
  assert.equal(result.total.kills, 3);
});

test('规则引擎: plan view decodes every event of the full build', () => {
  const result = runCombat(readRuleFiles(), { build: 'frost_lance', extra: ['ricochet', 'brittle', 'shatter'], count: 1 });
  const view = describePlan(result.plan);
  const events = view.events.map(e => e.event);
  for (const event of ['cast', 'hit', 'kill']) assert.ok(events.includes(event), event);
  assert.ok(view.stats.some(s => s.name === 'projectile.speed' && s.value === 24));
});

test('模拟: 30 s arena with all traits, god mode, auto cast', () => {
  const arena = new Arena(readRuleFiles(), { allTraits: true, god: true, autoCast: true, seed: 3 });
  let peak = 0, worst = 0;
  for (let i = 0; i < 30 * 60; ++i) {
    arena.step(1 / 60);
    peak = Math.max(peak, arena.report.Projectiles);
    worst = Math.max(worst, arena.report.TotalMs);
  }
  console.log(`arena 30s: casts=${arena.hero.casts} kills=${arena.kills} alive=${arena.monsters.length} dealt=${Math.round(arena.damageDealt)} taken=${Math.round(arena.damageTaken)} peakProjectiles=${peak} worstRulesMs=${worst.toFixed(2)}`);
  assert.ok(arena.hero.casts > 100, 'hero cast');
  assert.ok(arena.kills > 50, 'monsters died to rules');
  assert.equal(arena.hero.dead, false, 'god mode');
});

test('模拟: without god mode monsters can kill the hero (no casting)', () => {
  const arena = new Arena(readRuleFiles(), { seed: 5 });
  for (let i = 0; i < 60 * 60 && !arena.hero.dead; ++i) arena.step(1 / 60);
  assert.equal(arena.hero.dead, true);
});

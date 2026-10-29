import test from 'node:test';
import assert from 'node:assert/strict';
import { readBaselineRuleFiles as readRuleFiles } from './rule-fixture.mjs';
import { RuleHost, checkRuleSet, aggregate, parseCollection, serializeCollection, statusKey, readStatusText, timedBoundaries } from '../engine/index.mjs';
import { runCombat } from '../public/combat.mjs';

const extraStatus = { path: 'Statuses/t_empower.json', text: JSON.stringify({ id: 't_empower', category: 'buff', traits: ['frost_damage'] }) };

function host(files = readRuleFiles()) {
  const h = new RuleHost();
  assert.ok(h.loadRuleLibrary(files).ok, h.lastError);
  const hero = h.registerOwner(1, 0);
  h.setOwnerStatusId(hero, 77);
  const plan = h.compileNamedBuild('frost_lance').plan;
  const second = () => {
    let damage = 0;
    for (let frame = 0; frame < 60; ++frame) {
      h.beginTargets();
      h.addTarget({ x: 300, y: 0, z: 0 }, 45, 1e6, 1, 5);
      if (frame === 0) h.castBuild(plan, hero, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
      for (const row of h.stepFrame(1 / 60)) damage += row.Amount;
    }
    return damage;
  };
  return { h, second };
}

test('持续时间: timed trait grant on the caster applies, then expires', () => {
  const { h, second } = host();
  const base = second();
  h.grantTraits(77, [{ id: 'frost_damage', params: { amount: 30 } }], 0.5);
  assert.equal(second(), base + 30);
  assert.equal(second(), base);
});

test('持续时间: status with traits grants them while live (caster and target defense)', () => {
  const { h, second } = host([...readRuleFiles(), extraStatus]);
  const base = second();
  h.applyStatus(77, 't_empower', 1, 0.5);
  assert.ok(second() > base);
  assert.equal(second(), base);
  h.grantTraits(5, ['frost_resistance'], 0.5);
  assert.ok(second() < base, 'timed resistance on the target');
  assert.equal(second(), base);
});

test('持续时间: item entries round-trip and aggregate by time since use', () => {
  const check = checkRuleSet(readRuleFiles());
  assert.ok(check.ok, check.error);
  const tonic = check.collections.item.get('frost_tonic').doc;
  assert.deepEqual(parseCollection('item', serializeCollection('item', tonic)).doc, tonic);
  const part = { kind: 'item', doc: tonic, label: tonic.name };
  assert.deepEqual(timedBoundaries([part]), [6, 10]);
  const ids = t => aggregate(check.library, 'frost_lance', [part], t).source.traits.map(x => x.id);
  assert.ok(ids(0).includes('frost_damage') && ids(0).includes('frost_resistance'));
  assert.ok(!ids(7).includes('frost_damage') && ids(7).includes('frost_resistance'));
  assert.ok(!ids(11).includes('frost_resistance'));
  assert.match(parseCollection('item', '{"id":"x","name":"x","traits":[{"id":"chill","duration":-1}]}').error, /duration/);
  assert.match(parseCollection('skill', '{"id":"x","traits":[{"id":"chill","duration":3}]}').error, /持续时间/);
});

test('持续时间: combat timeline drops damage after the timed entries expire', () => {
  const check = checkRuleSet(readRuleFiles());
  const tonic = check.collections.item.get('frost_tonic').doc;
  const part = { kind: 'item', doc: tonic, label: tonic.name };
  const run = runCombat([], { sourceAt: t => aggregate(check.library, 'frost_lance', [part], t).source, statusDefs: check.library.statusDefs(), layout: 'pack', count: 15, health: 1e7, casts: 10, castInterval: 60, frames: 700, seed: 11 });
  assert.ifError(run.error || null);
  const sum = (a, b) => run.rows.filter(r => r.frame >= a * 60 && r.frame < b * 60).reduce((n, r) => n + r.amount, 0);
  assert.ok(sum(0, 6) / 6 > sum(6, 10) / 4, 'held window stronger than expired window');
});

test('异常: status files load; ignite and bleed tick, shock amplifies, stacking caps', () => {
  const files = readRuleFiles();
  for (const f of files.filter(f => f.path.startsWith('Statuses/'))) assert.ok(readStatusText(f.text).def, f.path);
  assert.match(readStatusText('{"id":"x","effects":[{"type":"damage_over_time"}]}').error, /element/);
  const h = new RuleHost();
  h.loadRuleLibrary(files);
  const w = h.world;
  const tick = () => { h.beginTargets(); h.addTarget({ x: 0, y: 0, z: 0 }, 45, 1e6, 1, 9); return h.stepFrame(1 / 60); };
  tick();
  h.applyStatus(9, 'ignite', 10, 2);
  let dot = 0;
  for (let i = 0; i < 150; ++i) dot += tick().reduce((n, r) => n + r.Amount, 0);
  assert.ok(Math.abs(dot - 20) < 0.01, `ignite 10/s for 2s = ${dot}`);
  for (let i = 0; i < 8; ++i) h.applyStatus(9, 'slow', 30, 5);
  assert.equal(w.getStatusStacks(9, statusKey('slow')), 3);
  assert.equal(w.getStatus(9, statusKey('slow')), 60, 'slow capped at 60');
  h.applyStatus(9, 'shock', 20, 5);
  h.applyStatus(9, 'bleed', 10, 1);
  let shocked = 0;
  for (let i = 0; i < 90; ++i) shocked += tick().reduce((n, r) => n + r.Amount, 0);
  assert.ok(Math.abs(shocked - 12) < 0.01, `bleed 10/s for 1s × 1.2 shock = ${shocked}`);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { AverageTargetDps } from '../public/sim/damage-meter.mjs';
import { Battle } from '../public/sim/battle.mjs';
import { readBaselineRuleFiles } from './rule-fixture.mjs';

test('单体秒伤：同一目标多次命中只算一个，群攻按实际受击目标取均值', () => {
  const meter = new AverageTargetDps();
  meter.record(1, 80); meter.record(1, 20); meter.record(2, 300);
  assert.equal(meter.targets, 2); assert.equal(meter.value, 200);
  for (const amount of [0, -10, NaN, Infinity]) meter.record(3, amount);
  assert.equal(meter.targets, 2); assert.equal(meter.value, 200);
});

test('单体秒伤：精确滑动一秒，跨帧受击目标直到最后一帧到期才移除', () => {
  const meter = new AverageTargetDps();
  meter.record(1, 100); meter.record(2, 300);
  meter.advance(.6); meter.record(1, 60);
  meter.advance(.4);
  assert.equal(meter.targets, 1); assert.equal(meter.value, 60);
  meter.advance(.6);
  assert.equal(meter.targets, 0); assert.equal(meter.value, 0);
});

test('单体秒伤：均匀伤害不按瞬间时长放大，暂停不推进，重开清零', () => {
  const meter = new AverageTargetDps();
  for (let i = 0; i < 20; i++) { meter.advance(.05); meter.record(1, 5); meter.record(2, 15); }
  assert.equal(meter.value, 200);
  meter.advance(0); assert.equal(meter.value, 200);
  for (let i = 0; i < 20; i++) { meter.advance(.05); meter.record(1, 5); meter.record(2, 15); }
  assert.equal(meter.value, 200);
  meter.reset(); assert.equal(meter.value, 0); assert.equal(meter.targets, 0);
  meter.record(1, 10); assert.equal(meter.value, 10);
});

test('单体秒伤：密集命中按帧合并，长时间统计不保留历史命中记录', () => {
  const meter = new AverageTargetDps();
  for (let i = 0; i < 100000; i++) meter.record(i % 300, 1);
  assert.equal(meter.frames.length, 1); assert.equal(meter.frames[0].targets.size, 300);
  assert.equal(meter.total, 100000);
  for (let i = 0; i < 3600; i++) { meter.advance(1 / 60); meter.record(i % 300, 1); }
  assert.ok(meter.frames.length < 128, 'only the live window and a small compacting prefix remain');
  assert.ok(meter.pool.length <= 61);
  meter.advance(1); assert.equal(meter.total, 0); assert.equal(meter.targets, 0);
});

test('单体秒伤：旁听实际玩家伤害，包含持续伤害；统计不影响伤害、承伤或击杀', () => {
  const files = readBaselineRuleFiles();
  const meter = new AverageTargetDps();
  let observed = 0, dot = 0;
  const options = { god: true, autoCast: true, seed: 3, maxMonsters: 20 };
  const control = new Battle(files, options);
  const measured = new Battle(files, { ...options, onDamageDealt: row => {
    assert.equal(row.OwnerExternalId, 1);
    assert.notEqual(row.TargetExternalId, measured.heroTargetId);
    observed += row.Amount;
    if (row.bDot) dot += row.Amount;
    meter.record(row.TargetExternalId, row.Amount);
  } });
  const loadout = { skills: ['frost_lance'], equipment: { amulet: 'ember_amulet', ring: 'stormband' } };
  for (const battle of [control, measured]) battle.setLoadout(loadout);
  for (let i = 0; i < 240; i++) { meter.advance(1 / 60); control.step(1 / 60); measured.step(1 / 60); }
  assert.ok(observed > 0); assert.ok(dot > 0);
  assert.equal(observed, measured.damageDealt);
  assert.deepEqual([measured.damageDealt, measured.damageTaken, measured.kills, measured.hero.casts],
    [control.damageDealt, control.damageTaken, control.kills, control.hero.casts]);
  meter.advance(1); assert.equal(meter.value, 0);
});

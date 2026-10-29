import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle } from '../public/sim/battle.mjs';
import { readBaselineRuleFiles } from './rule-fixture.mjs';

test('伤害飘字：普通与元素、持续伤害按目标和帧合计，保留暴击且不改结算', () => {
  const battle = new Battle(readBaselineRuleFiles(), { god: true, seed: 3, spawnRate: 0, maxMonsters: 20 });
  battle.setLoadout({ skills: ['frost_lance'], equipment: { weapon: 'test_projectile_weapon', amulet: 'ember_amulet', ring: 'stormband' } });
  battle.spawnMonsters(2, { position: { x: battle.hero.x + 600, y: battle.hero.y } });
  for (const monster of battle.monsters) { monster.health = monster.maxHealth = 100000; monster.speed = 0; }
  battle.hero.casting = true;
  battle.setAim(battle.hero.x + 1000, battle.hero.y);
  const onRow = battle.combat.onRow.bind(battle.combat);
  let rows = [];
  battle.combat.onRow = row => { rows.push({ ...row }); onRow(row); };
  let mixed = false, multipleTargets = false, repeatedTarget = false, observed = 0;
  const seen = new Set(), dt = 1 / 60;
  for (let frame = 0; frame < 360; frame++) {
    rows = [];
    battle.step(dt);
    const expected = new Map(), elements = new Map();
    for (const row of rows) if (row.Amount > 0) {
      const id = row.TargetExternalId;
      const total = expected.get(id) || { amount: 0, critical: false };
      total.amount += row.Amount; total.critical ||= row.bCritical;
      expected.set(id, total);
      if (!elements.has(id)) elements.set(id, new Set());
      elements.get(id).add(row.Element);
      observed += row.Amount;
    }
    const floats = battle.flashes.filter(f => !f.hero && Math.abs(f.age - dt) < 1e-8);
    assert.equal(floats.length, expected.size, 'one number per damaged target in the frame');
    for (const flash of floats) {
      assert.deepEqual({ amount: flash.amount, critical: flash.critical }, expected.get(flash.targetId));
      mixed ||= elements.get(flash.targetId).size > 1;
      repeatedTarget ||= seen.has(flash.targetId);
      seen.add(flash.targetId);
    }
    multipleTargets ||= expected.size > 1;
  }
  assert.ok(mixed, 'real mixed-element damage was combined');
  assert.ok(multipleTargets, 'different monsters retained separate totals');
  assert.ok(repeatedTarget, 'later attacks on the same monster produced new numbers');
  assert.ok(observed > 0);
  assert.ok(Math.abs(observed - battle.damageDealt) < 1e-6, 'display totals match actual settled damage');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../public/vendor/three.module.js';
import { readRuleFiles } from '../scripts/rule-files.mjs';
import { checkRuleSet, parseCollection, EEndReason } from '../engine/index.mjs';
import { DungeonBattle } from '../public/sim/dungeon-battle.mjs';
import { createBattleEffects } from '../public/vfx/battle-effects.mjs';

const files = readRuleFiles(), checked = checkRuleSet(files);
assert.ok(checked.ok, checked.error);

function dungeonCast({ skill = 'whirlwind', traits = [], discardMovement = false } = {}) {
  const doc = parseCollection('equipment', { id: 'wind_duration_probe', name: '持续时间验收', slot: 'weapon', rarity: 'common', level: 1, skills: [skill], traits }).doc;
  const collections = { ...checked.collections, equipment: new Map([...checked.collections.equipment, [doc.id, { doc }]]) };
  const b = new DungeonBattle(files, { collections, seed: 7, monsterCount: 20, god: true, autoCast: false });
  b.setLoadout({ skills: [skill], equipment: { weapon: doc.id } });
  assert.ok(b.hero.plan >= 0, b.hero.error);
  if (discardMovement) {
    // Reproduce the former host-adapter regression without changing the rule VM.
    const movement = b.host.world.motionHook;
    b.host.world.motionHook = (index, dt) => { movement(index, dt); };
  }
  const scene = new T.Scene(), fx = createBattleEffects(T, scene), ended = [], hits = [];
  const w = b.host.world, c = w.carriers, end = w.endHook, trace = w.trace;
  w.endHook = (index, reason) => {
    if (w.roots[c.root[index]].owner === b.hero.owner)
      ended.push({ id: c.id[index], reason, age: c.age[index], life: c.life[index] });
    return end(index, reason);
  };
  w.trace = (kind, data) => { trace?.(kind, data); if (kind === 'projectile_hit') hits.push(data); };
  b.setAim(b.hero.x + 1000, b.hero.y);
  b.hero.castClock = 1 / 3; b.hero.casting = true; b.step(1 / 60); b.hero.casting = false;
  assert.equal(b.hero.casts, 1);
  for (const m of b.monsters) Object.assign(m, { health: 1e8, maxHealth: 1e8, shield: 0, maxShield: 0, speed: 0, cooldown: 9999, attackRange: 0 });
  Object.assign(b.monsters[0], { x: b.hero.x + 250, y: b.hero.y });
  return { b, fx, ended, hits, scene };
}

test('实际地牢复现：丢失运动结果时旋风不足半秒撞墙结束', () => {
  const { b, fx, ended } = dungeonCast({ discardMovement: true });
  try {
    for (let frame = 0; frame < 120 && !ended.length; frame++) b.step(1 / 60);
    assert.equal(ended[0]?.reason, EEndReason.Impact);
    assert.ok(ended[0].age < .5, JSON.stringify(ended));
    assert.equal(ended[0].life, 2);
  } finally { fx.dispose(); }
});

for (const [name, traits, lifetime] of [
  ['基础两秒', [], 2],
  ['扩大碰撞半径', [{ id: 'proj_radius', params: { n: 100 } }], 2],
  ['存在时间增加50%', [{ id: 'proj_lifetime', params: { n: 50 } }], 3],
]) test(`实际地牢旋风${name}：命中怪物、转向和贴墙后仍持续到期，特效跟随载体`, () => {
  const { b, fx, ended, hits, scene } = dungeonCast({ traits });
  try {
    for (let frame = 1; frame < lifetime * 60 - 1; frame++) {
      b.step(1 / 60); fx.update(b);
      assert.equal(ended.length, 0, JSON.stringify(ended));
      assert.equal(b.projectiles().filter(p => p.kind === 'whirlwind').length, 1);
      assert.equal(fx.group.children.filter(o => o.name === 'whirlwind' && o.visible).length, 1);
    }
    assert.ok(hits.some(hit => hit.surface === 'unit'), 'must hit a real monster');
    assert.ok(b.damageDealt > 0);
    for (let frame = 0; frame < 4; frame++) { b.step(1 / 60); fx.update(b); }
    assert.equal(ended.length, 1);
    assert.equal(ended[0].reason, EEndReason.Expired);
    assert.equal(ended[0].life, lifetime);
    assert.ok(ended[0].age >= lifetime - .001 && ended[0].age < lifetime + .04);
    assert.equal(b.projectiles().filter(p => p.kind === 'whirlwind').length, 0);
    assert.equal(fx.group.children.filter(o => o.name === 'whirlwind').length, 0);
  } finally { fx.dispose(); assert.equal(scene.children.length, 0); }
});

test('普通冰锥仍按原有碰撞命中结束，不获得旋风的持续行为', () => {
  const { b, fx, ended, hits } = dungeonCast({ skill: 'frost_lance' });
  try {
    for (let frame = 0; frame < 120 && !ended.length; frame++) b.step(1 / 60);
    assert.equal(ended[0]?.reason, EEndReason.Impact);
    assert.ok(ended[0].age < ended[0].life);
    assert.ok(hits.length > 0);
  } finally { fx.dispose(); }
});

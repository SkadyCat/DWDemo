import test from 'node:test';
import assert from 'node:assert/strict';
import { readRuleFiles } from '../scripts/rule-files.mjs';
import { checkRuleSet, parseMonster, emptyMonster, Projectiles } from '../engine/index.mjs';
import { Battle } from '../public/sim/battle.mjs';
import { DungeonBattle } from '../public/sim/dungeon-battle.mjs';
import { createTwistedEyes } from '../public/prefabs/monster-twisted-eye.mjs';
import * as THREE from '../public/vendor/three.module.js';

const files = readRuleFiles(), checked = checkRuleSet(files);
assert.ok(checked.ok, checked.error);
const step = (battle, frames) => { for (let i = 0; i < frames; i++) battle.step(1 / 60); };
const near = (a, b, tolerance = .001) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
function fixture(count = 10, dungeon = false) {
  const Type = dungeon ? DungeonBattle : Battle;
  const b = new Type(files, { collections: checked.collections, maxMonsters: 0, spawnRate: 0, god: true, seed: 47 });
  b.setLoadout({ skills: [] });
  b.combat.hostileSpawns.spawn({ owner: b.hero.owner, kind: 'twisted_eye', count, duration: 5, radius: 5, x: b.hero.x / 100, y: b.hero.y / 100, invulnerable: true });
  return b;
}

test('体型和后方跟随配置有默认值，并拒绝无效数值', () => {
  const base = { ...emptyMonster('probe'), name: '测试' };
  const { scale, followDistance, ...old } = base;
  assert.equal(parseMonster(old).doc.scale, 1);
  assert.equal(parseMonster(old).doc.followDistance, 0);
  for (const value of [0, -1, 11, null, '0.25']) assert.match(parseMonster({ ...base, scale: value }).error, /体型倍率/);
  for (const value of [-1, 5001, null, '240']) assert.match(parseMonster({ ...base, followDistance: value }).error, /后方跟随距离/);
});

test('眼球模型与碰撞体缩小到1/4，追随移动和转向后的玩家后方，移动中继续攻击', () => {
  const b = fixture();
  assert.ok(b.monsters.every(m => m.radius === (m.elite ? 60 : 45) / 4));
  step(b, 100);
  assert.ok(b.monsters.every(m => m.x < b.hero.x - 170 && Math.abs(m.y - b.hero.y) < 100));
  b.hero.move = { x: 1, y: 0 }; step(b, 60);
  assert.ok(b.monsters.every(m => m.x < b.hero.x - 170 && b.hero.x - m.x < 400));
  const before = b.monsterCasts;
  b.hero.move = { x: 0, y: 1 }; step(b, 60);
  assert.ok(b.monsters.every(m => m.y < b.hero.y - 170 && b.hero.y - m.y < 400));
  assert.ok(b.monsterCasts > before, '移动中也会按原技能冷却攻击');
  const fx = createTwistedEyes(THREE), matrix = new THREE.Matrix4(), position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
  fx.update(b.monsters, b.elapsed, b.hero);
  for (const mesh of fx.group.children) {
    assert.equal(mesh.count, 10); mesh.getMatrixAt(0, matrix); matrix.decompose(position, rotation, scale);
    near(scale.x, .25); near(scale.y, .25); near(scale.z, .25);
  }
  fx.dispose();
  step(b, 90); assert.equal(b.monsters.length, 0); assert.equal(b.kills, 0);
});

test('跟随仍受冻结与地牢墙体约束，不直接瞬移到玩家身后', () => {
  const b = fixture(1, true), m = b.monsters[0];
  b.host.applyStatus(m.id, 'freeze', 1, 1);
  const start = { x: m.x, y: m.y };
  b.hero.move = { x: 1, y: 0 }; step(b, 30);
  near(m.x, start.x); near(m.y, start.y);
  step(b, 90); assert.notEqual(m.x, start.x);
  b.hero.move = { x: -1, y: 0 }; step(b, 60);
  for (const eye of b.monsters.filter(m => m.type?.id === 'twisted_eye')) {
    const tile = b.dungeon.tileOf(eye.x, eye.y);
    assert.ok(b.dungeon.walkable(tile.x, tile.y));
  }
});

test('眼球飞弹读取自身谱系追踪移动目标；卸下谱系后保持直线，不继承玩家追踪', () => {
  const run = tracking => {
    const b = fixture(1), m = b.monsters[0];
    if (!tracking) b.setMonsterEquipment(m, 'lineage', null);
    m.type = { ...m.type, followDistance: 0 };
    Object.assign(m, { x: -400, y: 0, speed: 0, cooldown: 0, attackRange: 5000, skillCooldowns: [0] });
    step(b, 1); m.skillCooldowns[0] = 999;
    const c = b.host.world.carriers;
    const index = Array.from({ length: c.num }, (_, i) => i).find(i => !(c.flags[i] & Projectiles.Dead) && b.host.world.roots[c.root[i]].owner === m.owner);
    assert.notEqual(index, undefined);
    const id = c.id[index];
    b.character.stats.set('proj.homing_range', 500);
    b.character.stats.set('proj.homing_turn', 500);
    b.hero.y = 200; step(b, 4);
    const live = Array.from({ length: c.num }, (_, i) => i).find(i => c.id[i] === id);
    assert.notEqual(live, undefined);
    near(Math.hypot(c.vx[live], c.vy[live]), 12, .01);
    return c.vy[live];
  };
  assert.ok(run(true) > 1, '玩家侧移后，敌弹真实转向');
  near(run(false), 0, .001);
});

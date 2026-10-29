import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../public/vendor/three.module.js';
import { readRuleFiles } from '../scripts/rule-files.mjs';
import { checkRuleSet, parseCollection, createProgression, traitTierProfile, readTraitText, newBuild } from '../engine/index.mjs';
import { Battle } from '../public/sim/battle.mjs';
import { generateDungeon } from '../public/sim/dungeon.mjs';
import { createAreaRoaming, stepAreaRoaming } from '../engine/combat/area-roaming.mjs';
import { createBattleEffects } from '../public/vfx/battle-effects.mjs';
import { applyBuildPreset } from '../public/build-presets.mjs';

const files = readRuleFiles(), checked = checkRuleSet(files);
assert.ok(checked.ok, checked.error);
function arena(skill = 'whirlwind', traits = [], enemies = []) {
  const doc = parseCollection('equipment', { id: 'route_test', name: '测试', slot: 'weapon', rarity: 'unique', level: 1, skills: [skill], traits }).doc;
  const collections = { ...checked.collections, equipment: new Map([...checked.collections.equipment, ['route_test', { doc }]]) };
  const b = new Battle(files, { collections, maxMonsters: 0, spawnRate: 0, god: false, autoCast: false, seed: 47 });
  b.setLoadout({ skills: [skill], equipment: { weapon: 'route_test' } }); assert.ok(b.hero.plan >= 0, b.hero.error);
  b.spawnMonsters(enemies.length);
  b.monsters.forEach((m, i) => Object.assign(m, { x: 300, y: 0, health: 1e6, maxHealth: 1e6, shield: 0, maxShield: 0,
    speed: 0, cooldown: 9999, attackRange: 0, resistance: [0, 0, 0, 0] }, enemies[i]));
  b.setAim(1000, 0); b.hero.castClock = 1 / 3; b.hero.casting = true; b.step(1 / 60); b.hero.casting = false;
  return b;
}
const step = (b, frames, observe = () => {}) => { for (let i = 0; i < frames; i++) { b.step(1 / 60); observe(); } };
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} ≠ ${expected}`);

test('Opus旋风：普通武器绑定真实投射物与游走特性，所有数值有十阶', () => {
  assert.deepEqual(checked.collections.skill.get('whirlwind').doc.traits.map(t => t.id), ['create_whirlwind', 'proj_roam', 'proj_ground_contact', 'proj_ground_tint']);
  const preset = JSON.parse(fs.readFileSync(new URL('../../../Content/Rules/Presets/whirlwind_return.json', import.meta.url)));
  const save = createProgression(checked.collections, checked.library);
  assert.equal(applyBuildPreset(save, preset, checked.collections, checked.library).error, '');
  const item = save.instances[save.loadout.equipment.weapon];
  assert.equal(item.rarity, 'common'); assert.equal(item.skill, 'whirlwind'); assert.equal(item.affixes.length, 0);
  for (const param of ['range', 'interval']) assert.equal(traitTierProfile(checked.library, 'proj_roam').params[param].tiers.length, 10);
  for (const param of ['count', 'speed', 'lifetime', 'radius', 'damage']) assert.equal(traitTierProfile(checked.library, 'create_whirlwind').params[param].tiers.length, 10);
  const b = arena(); assert.equal(b.combat.skillFamily().projectile, true); assert.equal(b.combat.skillFamily().area, false);
});

test('旋风不附加技能冷却，施法间隔由现有动作与输入流程决定', () => {
  const b = arena();
  assert.equal(checked.library.trait('create_whirlwind').source.params.has('cooldown'), false);
  close(b.combat.cooldownFor(), 0);
  close(b.combat.cooldown, 0);
});

test('旋风投射物以27米/秒游走、频繁转向，玩家速度不变，两秒结束释放', () => {
  const b = arena(), c = b.host.world.carriers, st = b.combat.projectiles.state.get(c.id[0]);
  close(Math.hypot(c.vx[0], c.vy[0]), 27); close(c.life[0], 2); assert.equal(b.combat.zones.zones.length, 0);
  const positions = [], directions = new Set(); let walked = 0, last = [c.px[0], c.py[0]];
  step(b, 118, () => {
    walked += Math.hypot(c.px[0] - last[0], c.py[0] - last[1]); last = [c.px[0], c.py[0]]; positions.push(last);
    directions.add(st.roaming.dir.toFixed(4)); assert.ok(Math.hypot(c.px[0] - st.roaming.originX, c.py[0] - st.roaming.originY) <= 12 + 1e-5);
    assert.ok(Math.abs(Math.hypot(c.vx[0], c.vy[0]) - 27) < .001);
  });
  assert.ok(walked > 45); assert.ok(directions.size >= 2);
  for (const axis of [0, 1]) assert.ok(Math.max(...positions.map(p => p[axis])) - Math.min(...positions.map(p => p[axis])) > 4);
  close(b.hero.x, 0); close(b.hero.y, 0); close(b.character.moveSpeed(), 0);
  step(b, 3); assert.equal(b.projectiles().length, 0); assert.equal(b.combat.projectiles.state.size, 0);
  assert.ok(b.host.world.roots.every(root => !root.active && root.live === 0));
});

test('游走是通用范围词条，移速与时间正常聚合，复制区域拥有独立路径，次级区域不继承路径', () => {
  const b = arena('flame_burst', [{ id: 'area_roam', params: { speed: 9, range: 12, duration: 4, interval: .6 } },
    { id: 'area_at_self' }, { id: 'area_move_speed', params: { n: 100 } }, { id: 'area_duration', params: { n: 50 } }]);
  const z = b.combat.zones.zones[0]; close(z.life, 6); close(z.roaming.speed, 18);
  step(b, 30); close(z.x, 4.5);
  const copy = b.combat.zones.spawn({ ...z, x: 10, y: 4, delay: 0 });
  close(copy.roaming.originX, 10); close(copy.roaming.originY, 4); assert.notEqual(copy.roaming.seed, z.roaming.seed);
  const child = b.combat.zones.spawn({ ...z, x: 3, y: 3, persistent: false, primary: false, life: 0 });
  assert.equal(child.roaming, undefined);
});

test('游走碰到真实地牢墙壁折返，长帧保持有限位置，同种子轨迹可复现', () => {
  function run() {
    const dungeon = generateDungeon(7), positions = [];
    const m = createAreaRoaming({ speed: 27, range: 12, interval: .6 }, 14, 14, Math.PI / 4, 9);
    const probe = { x: 1400, y: 1400, radius: 50 };
    const move = (x, y) => { dungeon.move(probe, x * 100, y * 100); return { x: probe.x / 100, y: probe.y / 100 }; };
    for (let i = 0; i < 60; i++) {
      stepAreaRoaming(m, i === 10 ? 2.3 : .1, move); positions.push([m.x, m.y]);
      assert.ok(Math.abs(m.x) <= 14.49 + 1e-5 && Math.abs(m.y) <= 14.49 + 1e-5);
      assert.ok(Math.hypot(m.x - 14, m.y - 14) <= 12 + 1e-6);
    }
    assert.ok(positions.some(([x, y]) => x < 12 && y < 12)); return positions;
  }
  assert.deepEqual(run(), run());
});

test('伤害来自真实投射物碰撞，预制体只显示实际载体，不改变轨迹、伤害或随机', () => {
  function run(visuals) {
    const enemies = Array.from({ length: 20 }, (_, i) => ({ x: (i % 5 - 2) * 250, y: (Math.floor(i / 5) - 2) * 250 }));
    enemies.push({ x: 5000, y: 5000 });
    const b = arena('whirlwind', [], enemies), c = b.host.world.carriers, st = b.combat.projectiles.state.get(c.id[0]), trace = b.host.world.trace, contacts = [];
    b.host.world.trace = (kind, data) => { trace?.(kind, data); if (kind === 'area') assert.fail('旋风不能由区域伤害模拟'); if (kind === 'projectile_hit' && data.surface === 'unit') contacts.push([data.targetId, data.x, data.y, data.amount]); };
    const scene = new T.Scene(), fx = visuals ? createBattleEffects(T, scene) : null; let visible = 0;
    step(b, 510, () => {
      fx?.update(b); const mesh = fx?.group.children.find(o => o.name === 'whirlwind');
      if (mesh) { const p = b.projectiles()[0]; assert.ok(p); close(mesh.position.x, p.x * .01); close(mesh.position.z, -p.y * .01); visible++; }
    });
    assert.ok(b.damageDealt > 0); assert.equal(b.monsters.at(-1).health, 1e6);
    assert.ok(contacts.length > 0); assert.equal(b.combat.zones.zones.length, 0);
    if (fx) { assert.ok(visible > 100); assert.ok(!fx.group.children.some(o => o.name === 'whirlwind')); }
    fx?.dispose(); assert.equal(scene.children.length, 0);
    return { contacts, damage: b.damageDealt, health: b.monsters.map(m => m.health), seed: st.roaming.seed, hash: b.host.world.stateHash() };
  }
  assert.deepEqual(run(true), run(false));
});

test('多重、投射物速度、存在时间与碰撞半径都改变实际旋风载体，连续发射追加载体', () => {
  const b = arena('whirlwind', [{ id: 'proj_count', params: { n: 2 } }, { id: 'proj_speed', params: { n: 100 } },
    { id: 'proj_lifetime', params: { n: 50 } }, { id: 'proj_radius', params: { n: 100 } }, { id: 'proj_volleys', params: { n: 1 } }]);
  assert.equal(b.projectiles().length, 3);
  for (const p of b.projectiles()) { assert.ok(Math.abs(Math.hypot(p.vx, p.vy) - 54) < .001); close(p.lifetime, 3); assert.ok(Math.abs(p.radius - 280) < .001); }
  step(b, 12); assert.equal(b.projectiles().length, 6);
  const seeds = [...b.combat.projectiles.state.values()].map(st => st.roaming?.seed); assert.equal(new Set(seeds).size, 6);
});

test('投射物增伤实际放大旋风命中伤害', () => {
  const base = arena('whirlwind', [], [{ x: 250, y: 0 }]);
  const more = arena('whirlwind', [{ id: 'proj_damage', params: { n: 100 } }], [{ x: 250, y: 0 }]);
  step(base, 12); step(more, 12); assert.ok(base.damageDealt > 0); close(more.damageDealt / base.damageDealt, 2);
});

test('规则copy创建的旋风同样进入投射物游走流程，独立转向并保持27米/秒', () => {
  const b = arena(), source = b.host.planSources.get(b.hero.plan);
  const probe = readTraitText(JSON.stringify({ id: 'copy_probe', rules: [{ id: 'copy_on_spawn', event: 'spawn', chain: { maxDepth: 1 }, actions: [{ op: 'copy', count: 1, spread: 90 }] }] }));
  const compiled = b.host.compileSource(newBuild(source.activeId, [...source.traits, probe.trait]));
  assert.ok(compiled.plan >= 0, compiled.error);
  const root = b.host.world.cast(compiled.plan, b.hero.owner, 0, 0, .6, 1, 0, 0, 27n, 40);
  b.combat.register(root, { kind: 'cast' }); step(b, 2);
  assert.equal(b.projectiles().length, 3);
  for (const p of b.projectiles()) { assert.ok(b.combat.projectiles.state.get(p.id)?.roaming); assert.ok(Math.abs(Math.hypot(p.vx, p.vy) - 27) < .001); }
});

test('二十个重叠目标含溢出记录仍按每目标0.5秒间隔命中，超过同批上限后不继续增伤', () => {
  const b = arena('whirlwind', [{ id: 'proj_speed', params: { n: -100 } }], Array.from({ length: 20 }, () => ({ x: 60, y: 0 })));
  const times = new Map(), trace = b.host.world.trace;
  b.host.world.trace = (kind, data) => { trace?.(kind, data); if (kind === 'projectile_hit' && data.surface === 'unit') { const list = times.get(data.targetId) || []; list.push(b.combat.time); times.set(data.targetId, list); } };
  step(b, 80); assert.equal(times.size, 20);
  for (const list of times.values()) { assert.equal(list.length, 2); assert.ok(list[1] - list[0] >= .5 - 1e-6); }
  const damage = b.damageDealt; step(b, 100); close(b.damageDealt, damage); assert.equal(b.projectiles().length, 0);
});

test('投射物游走通过真实地牢碰撞折返，碰墙和命中均不提前结束', () => {
  const b = arena(), dungeon = generateDungeon(7), c = b.host.world.carriers;
  c.px[0] = 14; c.py[0] = 14; c.vx[0] = c.vy[0] = 27 / Math.sqrt(2);
  const st = b.combat.projectiles.state.get(c.id[0]); st.roaming = null;
  b.moveActor = (actor, x, y) => dungeon.move(actor, x, y);
  b.host.world.sweepObstacle = (sx, sy, ex, ey, radius) => dungeon.sweep(sx * 100, sy * 100, ex * 100, ey * 100, radius * 100);
  step(b, 118, () => { assert.equal(b.projectiles().length, 1); assert.ok(Math.abs(c.px[0]) <= 14.49 + 1e-4 && Math.abs(c.py[0]) <= 14.49 + 1e-4); });
  step(b, 3); assert.equal(b.projectiles().length, 0);
});

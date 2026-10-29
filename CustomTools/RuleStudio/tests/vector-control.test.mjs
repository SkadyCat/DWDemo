import test from 'node:test';
import assert from 'node:assert/strict';
import { readRuleFiles } from '../scripts/rule-files.mjs';
import { checkRuleSet, parseCollection, readTraitText, newBuild, compileBuild, EOp, Projectiles, equipmentAffixPool, traitTierProfile, progressionLoadout } from '../engine/index.mjs';
import { Battle } from '../public/sim/battle.mjs';
import { auraId, cleanBelt, buildSkillType } from '../engine/skill-types.mjs';
import { cleanPlayerInventory } from '../public/player-storage.mjs';
import { bezierPoint } from '../engine/combat/projectile-capture.mjs';
import { createTwistedEyes } from '../public/prefabs/monster-twisted-eye.mjs';
import * as THREE from '../public/vendor/three.module.js';

const files = readRuleFiles(), checked = checkRuleSet(files);
assert.ok(checked.ok, checked.error);
const step = (b, n) => { for (let i = 0; i < n; i++) b.step(1 / 60); };
const near = (a, b, tolerance = .001) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);

function fixture({ chance = 20, traits = [], active = true, god = true } = {}) {
  const gear = parseCollection('equipment', { id: 'vector_probe', name: '测试', slot: 'weapon', rarity: 'unique', level: 1, skills: ['frost_lance'], traits });
  assert.ok(gear.doc, gear.error);
  const aura = structuredClone(checked.collections.skill.get('vector_control').doc);
  aura.traits.find(t => t.id === 'projectile_capture').params.chance = chance;
  const collections = { ...checked.collections,
    skill: new Map([...checked.collections.skill, ['vector_control', { ...checked.collections.skill.get('vector_control'), doc: aura }]]),
    equipment: new Map([...checked.collections.equipment, ['vector_probe', { doc: gear.doc }]]) };
  const b = new Battle(files, { collections, maxMonsters: 0, spawnRate: 0, god, seed: 47 });
  b.setLoadout({ skills: ['frost_lance'], equipment: { weapon: 'vector_probe', ring: 'vector_control_ring' }, belt: ['aura:vector_control'], activeAuras: active ? ['vector_control'] : [] });
  return b;
}
function shooter(b) {
  b.spawnMonsters(1);
  const m = b.monsters[0];
  Object.assign(m, { x: 500, y: 0, health: 1e6, maxHealth: 1e6, speed: 0, cooldown: 999, attackRange: 0,
    type: null, shield: 0, maxShield: 0, resistance: [0, 0, 0, 0, 0, 0] });
  step(b, 1);
  return m;
}
function fire(b, m, { speed = 12, life = 2, damage = 10, kind = 'probe_bolt' } = {}) {
  const trait = readTraitText(JSON.stringify({ id: `probe_${kind}`, params: { speed, life, damage }, rules: [{ id: 'fire', event: 'cast', actions: [
    { op: 'emit', kind, element: 'void', tags: ['void', 'spell'], speed: { param: 'speed' }, lifetime: { param: 'life' }, radius: .15, damage: { param: 'damage' } },
  ] }] })).trait;
  const plan = b.host.compileSource(newBuild(trait.id, [trait])).plan;
  return b.host.castBuild(plan, m.owner, { x: m.x - 60, y: 0, z: 60 }, { x: -1, y: 0, z: 0 }, 0);
}
const capturedIndices = b => {
  const c = b.host.world.carriers;
  return Array.from({ length: c.num }, (_, i) => i).filter(i => !(c.flags[i] & Projectiles.Dead) && b.combat.rootInfo(c.root[i])?.capture);
};

test('光环类型仅由主动特性声明；QEFG绑定稳定、启用才聚合，不进入1–4', () => {
  assert.equal(buildSkillType(checked.library, 'vector_control'), 'aura');
  assert.equal(buildSkillType(checked.library, 'summon_twisted_eyes'), 'trigger');
  assert.equal(buildSkillType(checked.library, 'frost_lance'), 'active');
  assert.ok(equipmentAffixPool(checked.library).every(entry => !['vector_control', 'projectile_capture'].includes(entry.id)), '固有光环效果不会随机洗出而绕过开关');
  for (const id of ['projectile_capture', 'summon_twisted_eyes', 'twisted_eye_projectile'])
    for (const spec of Object.values(traitTierProfile(checked.library, id).params)) assert.equal(spec.tiers.length, 10);
  assert.equal(auraId(null), null);
  assert.deepEqual(cleanBelt(['aura:vector_control', null, 'aura:vector_control', 'bad'], id => id !== 'bad'), ['aura:vector_control']);
  const b = fixture({ active: false });
  assert.equal(b.combat.t('projectile_capture').length, 0);
  b.setLoadout({ ...b.loadout, activeAuras: ['vector_control'] });
  assert.equal(b.combat.t('projectile_capture')[0].params.chance, 20);
  b.setLoadout({ ...b.loadout, skills: ['vector_control', 'summon_twisted_eyes'], activeAuras: [] });
  assert.deepEqual(b.skills, [null, null, null, null]);
  assert.equal(b.combat.t('projectile_capture').length, 0);
  b.setLoadout({ ...b.loadout, skills: ['frost_lance'], belt: [] , activeAuras: ['vector_control'] });
  assert.equal(b.combat.t('projectile_capture').length, 0);
});

test('存档保留装备光环位置与开关；卸下授予装备时移除绑定，即使旧存档拥有该技能', () => {
  const state = { owned: { skill: { vector_control: true }, equipment: { vector_control_ring: 1 }, item: {} }, instances: {},
    loadout: { skills: [], equipment: { ring: 'vector_control_ring' }, belt: [null, 'aura:vector_control'], activeAuras: ['vector_control'] } };
  cleanPlayerInventory(state, checked.collections, checked.library);
  assert.deepEqual(state.loadout.belt, [null, 'aura:vector_control']);
  assert.deepEqual(state.loadout.activeAuras, ['vector_control']);
  assert.deepEqual(progressionLoadout(state, checked.collections).activeAuras, ['vector_control']);
  delete state.loadout.equipment.ring;
  cleanPlayerInventory(state, checked.collections, checked.library);
  assert.deepEqual(state.loadout.belt, []);
  assert.deepEqual(state.loadout.activeAuras, []);
});

test('真实敌弹在命中前捕获，回返有真实贝塞尔曲线并伤害攻击源', () => {
  const b = fixture({ chance: 100, god: false }), m = shooter(b), health = b.hero.health, rows = [];
  b.onDamageDealt = row => rows.push(row);
  fire(b, m);
  let curve = null, start = null, first = null;
  for (let i = 0; i < 30; i++) {
    step(b, 1);
    const index = capturedIndices(b)[0];
    if (index !== undefined) {
      const c = b.host.world.carriers, st = b.combat.projectiles.state.get(c.id[index]);
      curve = st.captureCurve; start = curve.points[0]; first = { x: c.px[index], y: c.py[index] }; break;
    }
  }
  assert.ok(curve);
  assert.ok(first.x < start.x, '先沿敌弹方向弯曲，再掉头');
  assert.notEqual(bezierPoint(curve.points, .5).y, start.y, '真实横向弯曲');
  assert.equal(b.combat.captures.captured, 1);
  near(b.hero.health, health);
  step(b, 100);
  assert.ok(rows.some(row => row.TargetExternalId === m.id && row.Amount > 0));
  assert.equal(b.hero.casts, 0, '捕获不伪造手动施法');
  step(b, 100);
  assert.equal(b.host.world.activeRoots(), 0);
  assert.equal(b.projectiles().length, 0);
});

test('回返弹聚合玩家数量、速度、寿命、半径、穿透、连锁和点伤；不同敌弹不串缓存', () => {
  const b = fixture({ chance: 100, traits: [
    { id: 'proj_count', params: { n: 2 } }, { id: 'proj_speed', params: { n: 100 } },
    { id: 'proj_lifetime', params: { n: 50 } }, { id: 'proj_radius', params: { n: 100 } },
    { id: 'proj_pierce', params: { n: 3 } }, { id: 'proj_chain', params: { n: 2 } },
    { id: 'proj_damage', params: { n: 100 } },
  ] }), m = shooter(b);
  fire(b, m);
  for (let i = 0; i < 30 && !capturedIndices(b).length; i++) step(b, 1);
  const indices = capturedIndices(b), c = b.host.world.carriers;
  assert.equal(indices.length, 3);
  for (const i of indices) {
    const st = b.combat.projectiles.state.get(c.id[i]);
    near(st.speed0, 24); near(c.life[i], 3); near(c.radius[i], .3);
    assert.ok(c.pierce[i] >= 3); assert.equal(st.chainsLeft, 2);
  }
  step(b, 220);
  fire(b, m, { speed: 6, life: 4, kind: 'slow_bolt' });
  for (let i = 0; i < 60 && !capturedIndices(b).length; i++) step(b, 1);
  const second = capturedIndices(b)[0]; assert.notEqual(second, undefined);
  near(b.combat.projectiles.state.get(c.id[second]).speed0, 12); near(c.life[second], 6);
});

test('关闭光环敌弹正常命中；20%概率使用确定性随机且不全反射', () => {
  const off = fixture({ active: false, god: false }), m = shooter(off), health = off.hero.health;
  fire(off, m); step(off, 60);
  assert.ok(off.hero.health < health); assert.equal(off.combat.captures.captured, 0);
  const run = () => {
    const b = fixture(), m = shooter(b);
    for (let i = 0; i < 100; i++) fire(b, m);
    step(b, 120); return b.combat.captures.captured;
  };
  const count = run(); assert.equal(count, run()); assert.ok(count > 5 && count < 40, `captured ${count}/100`);
});

test('捕获实际伤害吃玩家投射物增伤与基础点伤，原敌弹命中及结束规则不触发', () => {
  const run = traits => {
    const b = fixture({ chance: 100, traits }), m = shooter(b), rows = [];
    b.onDamageDealt = row => rows.push(row);
    const incoming = readTraitText(JSON.stringify({ id: 'enemy_impact_probe', rules: [
      { id: 'cast', event: 'cast', actions: [{ op: 'emit', kind: 'probe', speed: 12, lifetime: 2, radius: .15, damage: 10, element: 'void' }] },
      ...['hit', 'projectile_end'].map(event => ({ id: event, event, actions: [{ op: 'counter', key: 'enemy_impact', scope: 'owner', value: 1 }] })),
    ] })).trait;
    const plan = b.host.compileSource(newBuild(incoming.id, [incoming])).plan;
    b.host.castBuild(plan, m.owner, { x: 440, y: 0, z: 60 }, { x: -1, y: 0, z: 0 }, 0);
    step(b, 180);
    assert.equal(b.host.world.ownerState.size, 0, '原弹不再结算命中或结束特性');
    return rows.filter(row => row.TargetExternalId === m.id).reduce((n, row) => n + row.Amount, 0);
  };
  const base = run([]), stronger = run([{ id: 'proj_damage', params: { n: 100 } }, { id: 'flat_void', params: { n: 50 } }]);
  assert.ok(base > 0); assert.ok(stronger > base * 4, `${base} -> ${stronger}`);
});

test('挂载现有施法触发每次生成1只真实敌对眼球，投射物攻击、无敌，到5秒移除不计击杀', () => {
  const b = fixture({ chance: 100, traits: [{ id: 'trig_cast', params: { chance: 100 }, with: ['summon_twisted_eyes'] }] });
  b.hero.castClock = 10; b.hero.casting = true; step(b, 1); b.hero.casting = false; step(b, 8);
  assert.equal(b.monsters.length, 1);
  for (const m of b.monsters) {
    assert.equal(m.type.id, 'twisted_eye'); assert.equal(m.invulnerable, true);
    assert.equal(b.host.world.owners[m.owner].team, 1);
  }
  const expires = b.monsters[0].expiresAt;
  step(b, 1);
  const world = b.host.world, m = b.monsters[0], before = m.health;
  assert.equal(world.hostDot(b.hero.owner, m.id, 1e6, 0), null);
  b.combat.hit(m.id, 1e6, 0); step(b, 1); near(m.health, before);
  b.host.applyStatus(m.id, 'ignite', 1e6, 1, b.hero.owner); step(b, 35); near(m.health, before);
  step(b, 180);
  assert.ok(b.monsterCasts >= 2); assert.ok(b.combat.captures.captured > 0);
  const fx = createTwistedEyes(THREE); fx.update(b.monsters, b.elapsed, b.hero);
  assert.equal(fx.group.children[0].count, 1); fx.dispose();
  while (b.elapsed + 1 / 60 < expires - 1e-7) step(b, 1);
  assert.equal(b.monsters.length, 1);
  step(b, 2); assert.equal(b.monsters.length, 0); assert.equal(b.kills, 0); assert.equal(b.earned, 0);
});

test('spawn_monster为web动作；无敌布尔值验证，计划缓存区分怪物类型与免疫标记', () => {
  const source = invulnerable => readTraitText(JSON.stringify({ id: 'spawn_probe', rules: [{ id: 'spawn', event: 'cast', actions: [
    { op: 'spawn_monster', kind: 'twisted_eye', count: 10, duration: 5, radius: 5, invulnerable },
  ] }] }));
  const a = source(true), b = source(false);
  assert.equal(a.trait.rules[0].actions[0].op, EOp.SpawnMonster);
  assert.notEqual(compileBuild(newBuild('spawn_probe', [a.trait])).plan.hash, compileBuild(newBuild('spawn_probe', [b.trait])).plan.hash);
  assert.ok(source('yes').error);
  const native = checkRuleSet([...files, { path: 'Traits/native_spawn_probe.json', text: JSON.stringify({ id: 'native_spawn_probe', rules: [{ id: 'spawn', event: 'cast', actions: [{ op: 'spawn_monster', kind: 'twisted_eye', count: 1, duration: 5, radius: 5 }] }] }) }]);
  assert.equal(native.ok, false);
  const missing = checkRuleSet([...files, { path: 'WebTraits/missing_spawn.json', text: JSON.stringify({ id: 'missing_spawn', rules: [{ id: 'spawn', event: 'cast', actions: [{ op: 'spawn_monster', kind: 'absent_monster', count: 1, duration: 5, radius: 5 }] }] }) }]);
  assert.match(missing.error, /未知怪物 absent_monster/);
});

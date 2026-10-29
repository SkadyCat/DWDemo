import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../public/vendor/three.module.js';
import { readRuleFiles, RULES_DIR } from '../scripts/rule-files.mjs';
import { checkRuleSet, parseCollection, traitTierProfile, equipmentAffixPool } from '../engine/index.mjs';
import { Battle } from '../public/sim/battle.mjs';
import { groundContact, GROUND_TYPES, GROUND_CAPACITY } from '../engine/combat/ground-fields.mjs';
import { createBattleEffects } from '../public/vfx/battle-effects.mjs';
import { createEffect } from '../public/prefabs/whirlwind.mjs';

const files = readRuleFiles(), checked = checkRuleSet(files); assert.ok(checked.ok, checked.error);
const step = (b, frames) => { for (let i = 0; i < frames; i++) b.step(1 / 60); };
function arena(traits = [], targets = 1) {
  const doc = parseCollection('equipment', { id: 'ground_test', name: '测试', slot: 'weapon', rarity: 'unique', level: 1, skills: ['whirlwind'], traits }).doc;
  const collections = { ...checked.collections, equipment: new Map([...checked.collections.equipment, [doc.id, { doc }]]) };
  const b = new Battle(files, { collections, seed: 18, maxMonsters: 0, spawnRate: 0, god: false, autoCast: false });
  b.damageRows = []; b.onDamageDealt = row => b.damageRows.push({ amount: row.Amount, element: row.Element, dot: !!row.bDot });
  b.setLoadout({ skills: ['whirlwind'], equipment: { weapon: doc.id } }); assert.ok(b.hero.plan >= 0, b.hero.error);
  b.spawnMonsters(targets);
  b.monsters.forEach((m, i) => Object.assign(m, { x: 300 + i * 300, y: 0, health: 1e7, maxHealth: 1e7,
    shield: 0, maxShield: 0, speed: 0, cooldown: 9999, attackRange: 0, resistance: [0, 0, 0, 0] }));
  b.setAim(1000, 0); b.hero.castClock = 10; return b;
}
function cast(b) { b.hero.casting = true; b.step(1 / 60); b.hero.casting = false; }
const trigger = (id, params = {}) => ({ id, params: { chance: 100, radius: 2, duration: 2, cooldown: 10, ...(id === 'hit_mirror_ground' ? {} : { amount: 20 }), ...params } });

test('五种地面是独立可洗词条，所有数值有十阶，接触与染色是无数值机制特性', () => {
  const pool = new Set(equipmentAffixPool(checked.library).map(a => a.id));
  for (const { trigger: id } of GROUND_TYPES) {
    assert.ok(pool.has(id)); const profile = traitTierProfile(checked.library, id);
    for (const p of Object.keys(profile.params)) assert.equal(profile.params[p].tiers.length, 10);
    assert.ok(checked.affixCategories.categoryOf(id));
  }
  assert.equal(traitTierProfile(checked.library, 'proj_ground_tint'), null);
});

test('真实投射物命中分别生成四类地面，站在地面会受持续伤害、中毒、冰缓或感电', () => {
  for (const spec of GROUND_TYPES.filter(s => s.type !== 'mirror')) {
    const b = arena([trigger(spec.trigger)]); cast(b); step(b, 11);
    assert.equal(b.combat.grounds.fields.length, 1); const f = b.combat.grounds.fields[0];
    assert.equal(f.type, spec.type); assert.equal(f.x, 3); assert.equal(f.y, 0);
    step(b, 35);
    if (spec.type === 'burn') { assert.ok(b.damageRows.some(r => r.dot && r.element === 0)); assert.equal(b.combat.ailments.isBurning(b.monsters[0].id), true); }
    else if (spec.type === 'poison') assert.ok(b.combat.ailments.layers(b.monsters[0].id, 'poison') > 0);
    else assert.ok(b.combat.status(b.monsters[0].id, spec.type) > 0);
    assert.equal(b.combat.grounds.fields.length, 1, '地面结算不会递归产出新地面');
    assert.ok(b.projectiles().some(p => p.groundTint === spec.element));
  }
});

test('未命中、零概率、持续伤害与召唤物命中不会偷偷生成地面；冷却按词条共用', () => {
  const empty = arena(GROUND_TYPES.map(s => trigger(s.trigger)), 0); cast(empty); step(empty, 90); assert.equal(empty.combat.grounds.fields.length, 0);
  const zero = arena([trigger('hit_burning_ground', { chance: 0 })]); cast(zero); step(zero, 90); assert.equal(zero.combat.grounds.fields.length, 0);
  const b = arena([trigger('hit_burning_ground')], 2); cast(b); step(b, 30); assert.equal(b.combat.grounds.fields.length, 1);
  b.combat.grounds.onHit({ dot: true, amount: 100, m: b.monsters[0] });
  b.combat.grounds.onHit({ minion: true, amount: 100, m: b.monsters[0] }); assert.equal(b.combat.grounds.fields.length, 1);
});

test('高速扫掠、半径相切与高度均按实际载体判断，不能隔空染色', () => {
  const f = { x: 0, y: 0, radius: .1 };
  assert.ok(groundContact({ x: -5, y: 0, z: .2 }, { x: 5, y: 0, z: .2 }, .1, f) > 0);
  assert.equal(groundContact({ x: -5, y: 0, z: 5 }, { x: 5, y: 0, z: 5 }, .1, f), null);
  assert.equal(groundContact({ x: -5, y: 2, z: .2 }, { x: 5, y: 2, z: .2 }, .1, f), null);
  assert.equal(groundContact({ x: .2, y: 0, z: .2 }, { x: .2, y: 0, z: .2 }, .1, f), 0);
  assert.ok(groundContact({ x: 0, y: 0, z: 5 }, { x: 0, y: 0, z: 0 }, .1, f) > .9);
});

test('旋风离开保留颜色，触新地面覆盖，重叠地面不闪色；兼容既有毒池和区域', () => {
  const b = arena([], 0); cast(b); const c = b.host.world.carriers, st = b.combat.projectiles.state.get(c.id[0]);
  const contact = (x, element) => b.combat.grounds.fields.push({ x, y: 0, radius: 1, element, left: 3 });
  contact(c.px[0], 0); b.combat.grounds.onProjectilesMoved(); assert.equal(st.groundTint, 0);
  c.px[0] += 10; b.combat.grounds.onProjectilesMoved(); assert.equal(st.groundTint, 0);
  contact(c.px[0], 1); contact(c.px[0], 2); b.combat.grounds.onProjectilesMoved(); assert.equal(st.groundTint, 2);
  for (let i = 0; i < 5; i++) { b.combat.grounds.onProjectilesMoved(); assert.equal(st.groundTint, 2); }
  b.combat.grounds.fields.length = 0;
  b.combat.ailments.fields.push({ type: 'poison', x: c.px[0], y: 0, radius: 2, left: 1 });
  b.combat.grounds.onProjectilesMoved(); assert.equal(st.groundTint, 4);
  b.combat.ailments.fields.length = 0;
  b.combat.zones.zones.push({ shape: 'circle', ground: true, element: 0, x: c.px[0], y: 0, radius: 2, life: 2, t: 1, nextAt: 0 });
  b.combat.grounds.onProjectilesMoved(); assert.equal(st.groundTint, 0);
  st.groundTintEnabled = false; st.groundTint = null; b.combat.grounds.onProjectilesMoved(); assert.equal(st.groundTint, null);
});

test('地面到期清理，染色不延长旋风寿命且新施放的载体不继承旧色', () => {
  const b = arena([trigger('hit_burning_ground', { duration: 1 })]); cast(b); step(b, 80);
  assert.equal(b.combat.grounds.fields.length, 0); assert.equal(b.projectiles()[0].groundTint, 0);
  b.monsters.length = 0; step(b, 410); assert.equal(b.projectiles().length, 0);
  cast(b); assert.equal(b.projectiles()[0].groundTint, null);
});

test('新地面数量有界，超出时替换最早地面', () => {
  const b = arena([trigger('hit_burning_ground', { cooldown: .05 })]);
  for (let i = 0; i < GROUND_CAPACITY + 10; i++) {
    b.combat.time = i; b.combat.grounds.onHit({ amount: 1, m: b.monsters[0] });
  }
  assert.equal(b.combat.grounds.fields.length, GROUND_CAPACITY);
});

test('染色与显示都不改变伤害元素、载体伤害、轨迹或随机；四种着色共享原有网格', () => {
  function run(dye, visuals) {
    const b = arena([trigger('hit_burning_ground')]); cast(b);
    if (!dye) for (const st of b.combat.projectiles.state.values()) st.groundTintEnabled = false;
    const scene = new T.Scene(), fx = visuals ? createBattleEffects(T, scene) : null;
    for (let i = 0; i < 120; i++) { b.step(1 / 60); fx?.update(b); }
    const result = { hash: b.host.world.stateHash(), damage: b.damageDealt,
      rows: b.damageRows, health: b.monsters[0].health };
    fx?.dispose(); return result;
  }
  assert.deepEqual(run(true, true), run(false, false));
  const fx = createEffect(T), mesh = fx.group.children[0], material = mesh.material, colors = new Set();
  for (const element of [0, 1, 2, 4]) { fx.update(1, { groundTint: element }); assert.equal(fx.group.children[0], mesh); assert.equal(mesh.material, material); colors.add(material.uniforms.brightTint.value.getHex()); }
  assert.equal(colors.size, 4); fx.update(1, { groundTint: null }); assert.equal(fx.group.userData.groundTint, null); fx.dispose();
});

test('四色预设手动启动后可产生镜像与四种染色，额外数量不来自定时施法', () => {
  const preset = JSON.parse(fs.readFileSync(`${RULES_DIR}/Presets/whirlwind_grounds.json`, 'utf8'));
  const b = new Battle(files, { collections: checked.collections, maxMonsters: 0, spawnRate: 0, god: false, autoCast: false, seed: 18 });
  b.setLoadout(preset); b.spawnMonsters(20);
  b.monsters.forEach((m, i) => Object.assign(m, { x: Math.cos(i * 2.4) * (400 + i * 25), y: Math.sin(i * 2.4) * (400 + i * 25),
    health: 1e8, maxHealth: 1e8, shield: 0, maxShield: 0, speed: 0, cooldown: 9999, attackRange: 0 }));
  // Seed one input interval. A ten-second backlog emitted four casts after the
  // separately authorized removal of the whirlwind skill cooldown.
  b.hero.castClock = 1 / b.hero.castsPerSecond; const colors = new Set(), types = new Set();
  for (let i = 0; i < 20 * 60; i++) {
    b.hero.casting = i === 0; b.step(1 / 60); for (const p of b.projectiles()) if (p.groundTint != null) colors.add(p.groundTint);
    for (const f of b.combat.grounds.fields) types.add(f.type);
  }
  assert.deepEqual([...colors].sort(), [0, 1, 2, 4]); assert.deepEqual([...types].sort(), ['burn', 'chill', 'mirror', 'poison', 'shock']);
  assert.equal(b.hero.casts, 1); assert.equal(b.hero.dead, false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../public/vendor/three.module.js';
import { readRuleFiles } from '../scripts/rule-files.mjs';
import { checkRuleSet, parseCollection, readTraitText, newBuild, compileBuild, RuleHost, traitTierProfile, equipmentAffixPool, createProgression } from '../engine/index.mjs';
import { Battle } from '../public/sim/battle.mjs';
import { createBattleEffects } from '../public/vfx/battle-effects.mjs';
import { createRoyalTreasury } from '../scripts/create-royal-treasury.mjs';
import { applyBuildPreset } from '../public/build-presets.mjs';
import { describeAction } from '../public/plan-view.mjs';
import { createEffect as createGate } from '../public/prefabs/royal-treasury/gate.mjs';
import { createBatch as createWeapons } from '../public/prefabs/royal-treasury/projectiles.mjs';

const files = readRuleFiles(), checked = checkRuleSet(files); assert.ok(checked.ok, checked.error);
const near = (a, b) => assert.ok(Math.abs(a - b) < .0001, `${a} != ${b}`);
const tick = (b, frames, observe = () => {}) => { for (let i = 0; i < frames; i++) { b.step(1 / 60); observe(); } };
const stock = b => b.host.world.ownerState.get(`channel:royal_treasury:weapons|o${b.hero.owner}`) || 0;
function fixture(traits = [], enemies = []) {
  const doc = parseCollection('equipment', { id: 'treasury_test', name: '测试宝库', slot: 'weapon', rarity: 'common', level: 1, skills: ['royal_treasury'], traits }).doc;
  const ring = parseCollection('equipment', { id: 'treasury_test_ring', name: '测试技能戒指', slot: 'ring', rarity: 'common', level: 1, skills: ['frost_lance'], traits: [] }).doc;
  const collections = { ...checked.collections, equipment: new Map([...checked.collections.equipment, ['treasury_test', { doc }], ['treasury_test_ring', { doc: ring }]]) };
  const b = new Battle(files, { collections, maxMonsters: 0, spawnRate: 0, god: true, seed: 37 });
  b.setLoadout({ skills: ['royal_treasury', 'frost_lance'], equipment: { weapon: 'treasury_test', ring: 'treasury_test_ring' } }); assert.ok(b.hero.plan >= 0, b.hero.error);
  b.spawnMonsters(enemies.length);
  b.monsters.forEach((m, i) => Object.assign(m, { x: 300, y: 0, health: 1e6, maxHealth: 1e6, shield: 0, maxShield: 0,
    speed: 0, cooldown: 9999, attackRange: 0, resistance: [0, 0, 0, 0] }, enemies[i]));
  const spawns = [], pulses = [], pulseRoots = new Map(), previous = b.host.world.trace;
  b.host.world.trace = (kind, p) => {
    previous?.(kind, p);
    if (kind === 'emitter_pulse') { const pulse = { time: b.host.world.clock, level: p.level, owner: p.owner, shots: [] }; pulses.push(pulse); pulseRoots.set(p.root, pulse); }
    if (kind === 'spawn' && p.plan.kindNames.names[p.kind] === 'treasury_weapon') {
      const c = b.host.world.carriers, i = p.index;
      const shot = { id: p.id, time: b.elapsed, root: c.root[i], x: c.px[i], y: c.py[i], z: c.pz[i], vx: c.vx[i], vy: c.vy[i], vz: c.vz[i], radius: c.radius[i], life: c.life[i], damage: c.damage[i], pierce: c.pierce[i], visualSeed: b.combat.projectiles.state.get(p.id)?.visualSeed };
      spawns.push(shot); pulseRoots.get(c.root[i])?.shots.push(shot);
    }
  };
  b.setAim(1000, 0); return { b, spawns, pulses };
}
function cast(b) { b.hero.castClock = 10; b.combat.cooldown = 0; b.hero.casting = true; b.step(1 / 60); b.hero.casting = false; }
function until(b, predicate, observe = () => {}) { for (let i = 0; i < 300 && !predicate(); i++) tick(b, 1, observe); assert.ok(predicate(), '等待真实随机出射'); }

test('王之宝库由收纳、齐射、接触地面聚合；普通武器与预设无隐藏加成，数值沿用十阶', () => {
  assert.deepEqual(checked.collections.skill.get('royal_treasury').doc.traits.map(t => t.id), ['treasury_stock', 'treasury_release', 'proj_ground_contact']);
  const preset = createRoyalTreasury(checked.library, checked.collections), save = createProgression(checked.collections, checked.library);
  assert.equal(applyBuildPreset(save, preset, checked.collections, checked.library).error, '');
  const item = save.instances[save.loadout.equipment.weapon]; assert.equal(item.baseId, 'royal_key'); assert.equal(item.skill, 'royal_treasury');
  assert.equal(item.rarity, 'common'); assert.equal(item.affixes.length, 0);
  for (const id of ['treasury_stock', 'treasury_release']) for (const param of Object.values(traitTierProfile(checked.library, id).params)) assert.equal(param.tiers.length, 10);
  assert.ok(!equipmentAffixPool(checked.library).some(a => ['treasury_stock', 'treasury_release'].includes(a.id)), '技能内部片段不单独进入随机词条池');
});

test('施放只加层，不立刻出射；随机自动发射不额外施法，连续施放保留随机时钟，上限10层', () => {
  const { b, spawns, pulses } = fixture(); assert.equal(b.combat.skillFamily().projectile, true); assert.equal(b.combat.skillFamily().summon, false);
  cast(b); assert.equal(stock(b), 1); assert.equal(spawns.length, 0);
  until(b, () => pulses.length > 0); assert.equal(spawns.length, pulses.length);
  const inputCasts = b.hero.casts; tick(b, 60); assert.ok(pulses.length >= 2); assert.equal(b.hero.casts, inputCasts);
  const controller = [...b.host.world.emitters.entries.values()][0], seed = controller.scheduleSeed, born = controller.born;
  for (let i = 0; i < 16; i++) cast(b);
  assert.equal(stock(b), 10); assert.equal(b.host.world.emitters.entries.size, 1); assert.equal(controller.scheduleSeed, seed); near(controller.born, born);
  tick(b, 270); assert.equal(stock(b), 10); tick(b, 40); assert.equal(stock(b), 9);
  assert.equal(b.combat.zones.zones.length, 0); assert.equal(fixture().b.host.world.emitters.entries.size, 0);
});

test('任意未满层停手也会衰减：5秒等待后每2秒减一层，自动出射不续时，归零释放根', () => {
  const { b, pulses } = fixture(); for (let i = 0; i < 3; i++) cast(b);
  const controller = [...b.host.world.emitters.entries.values()][0], inputTime = controller.lastInput;
  tick(b, 294); assert.equal(stock(b), 3); assert.ok(pulses.length >= 9); near(controller.lastInput, inputTime);
  tick(b, 12); assert.equal(stock(b), 2); tick(b, 120); assert.equal(stock(b), 1); tick(b, 120); assert.equal(stock(b), 0);
  assert.equal(b.host.world.emitters.entries.size, 0); const ended = pulses.length;
  tick(b, 90); assert.equal(pulses.length, ended); assert.equal(b.projectiles().length, 0); assert.ok(b.host.world.roots.every(r => !r.active));
});

test('部分层数已衰减时再次输入加一层并重置5秒等待，维持同一个控制器与出射节奏', () => {
  const { b } = fixture(); for (let i = 0; i < 3; i++) cast(b); tick(b, 310); assert.equal(stock(b), 2);
  const controller = [...b.host.world.emitters.entries.values()][0], born = controller.born, seed = controller.scheduleSeed;
  cast(b); assert.equal(stock(b), 3); assert.equal([...b.host.world.emitters.entries.values()][0], controller); near(controller.born, born); assert.equal(controller.scheduleSeed, seed);
  tick(b, 294); assert.equal(stock(b), 3); tick(b, 12); assert.equal(stock(b), 2);
});

test('基础兵器逐枚随机出射；间隔、形状和半球位置各自随机，同种子可复现', () => {
  function run() { const { b, pulses } = fixture(); for (let i = 0; i < 10; i++) cast(b); tick(b, 300); return pulses.map(p => ({ time: p.time, level: p.level, shots: p.shots })); }
  const pulses = run(); assert.deepEqual(pulses, run()); assert.ok(pulses.length >= 10);
  assert.ok(pulses.every(p => p.shots.length === 1));
  assert.ok(new Set(pulses.slice(1).map((p, i) => (p.time - pulses[i].time).toFixed(3))).size >= 5);
  assert.ok(new Set(pulses.map(p => Math.floor(p.time * 2))).size > 5);
  assert.ok(new Set(pulses.flatMap(p => p.shots.map(s => `${s.y.toFixed(3)}:${s.z.toFixed(3)}`))).size >= 10);
  assert.equal(new Set(pulses.flatMap(p => p.shots.map(s => (Math.imul(s.visualSeed, 1103515245) >>> 0) % 3))).size, 3);
});

test('库存属于施法者并跨聚合计划保留，切换其它技能不额外增加宝库库存', () => {
  const { b, pulses } = fixture(); cast(b); const inputTime = [...b.host.world.emitters.entries.values()][0].lastInput;
  b.select(1); cast(b); assert.equal(stock(b), 1); near([...b.host.world.emitters.entries.values()][0].lastInput, inputTime);
  tick(b, 60); assert.ok(pulses.length >= 2); b.select(0); cast(b); assert.equal(stock(b), 2);
  b.setLoadout({ skills: ['royal_treasury'], equipment: { weapon: 'treasury_test' } }); cast(b); assert.equal(stock(b), 3);
  const host = b.host, other = host.registerOwner(999, 0); host.castBuild(b.hero.plan, other, { x: 60, y: 0, z: 60 }, { x: 1, y: 0, z: 0 });
  b.step(1 / 60); assert.equal(stock(b), 3); assert.equal(host.world.ownerState.get(`channel:royal_treasury:weapons|o${other}`), 1);
});

test('真实起点随机散在头顶半球面，数量/速度/寿命/半径/穿透均正常聚合', () => {
  const { b, spawns } = fixture([{ id: 'proj_count', params: { n: 3 } }, { id: 'proj_speed', params: { n: 100 } },
    { id: 'proj_lifetime', params: { n: 50 } }, { id: 'proj_radius', params: { n: 100 } }, { id: 'pierce', params: { count: 2 } }, { id: 'proj_layout_ring' }]);
  b.setAim(0, 1000); cast(b); until(b, () => spawns.length > 0); assert.equal(spawns.length, 4); const headings = new Set();
  for (const p of spawns) { near(Math.hypot(p.x, p.y, p.z - 2), 1.8); assert.ok(p.z > 2 && p.z < 3.8); near(Math.hypot(p.vx, p.vy, p.vz), 44); near(p.life, 1.8); near(p.radius, .4); assert.equal(p.pierce, 2); headings.add(Math.atan2(p.vy, p.vx).toFixed(3)); }
  assert.equal(headings.size, 4, '环形词条只应用一次，不把方向旋转两遍造成重叠'); assert.equal(stock(b), 1);
});

test('伤害仅由真实投射物碰撞产生，投射物增伤与穿透会实际改变战果', () => {
  // A descending 3D ray aimed at the first body must still intersect the rear body.
  // The larger rear collider keeps this a pierce check across seeded muzzle changes.
  function run(traits) { const { b } = fixture(traits, [{ x: 900 }, { x: 1100, radius: 110 }, { x: 5000, y: 5000 }]); cast(b); tick(b, 75); return b; }
  const base = run([]), boosted = run([{ id: 'proj_damage', params: { n: 100 } }]), piercing = run([{ id: 'pierce', params: { count: 2 } }]);
  assert.ok(base.damageDealt > 0); near(boosted.damageDealt / base.damageDealt, 2);
  assert.equal(base.monsters[1].health, 1e6); assert.ok(piercing.monsters[1].health < 1e6); assert.equal(piercing.monsters[2].health, 1e6);
});

test('宝库兵器接入镜像地面；复制不增加宝库库存，兵器种类与剩余寿命沿用原载体', () => {
  const { b } = fixture([{ id: 'pierce', params: { count: 2 } }], [{ x: 400 }]); let mirrored;
  const previous = b.host.world.trace; b.host.world.trace = (kind, p) => { previous?.(kind, p); if (kind === 'ground_mirror') mirrored = p; }; cast(b);
  b.combat.grounds.fields.push({ type: 'mirror', element: null, x: 4, y: 0, radius: 3, left: 5, tick: 0, inside: new Set() });
  until(b, () => !!mirrored); assert.equal(stock(b), 1); assert.ok(b.damageDealt > 0);
  const p = b.projectiles().filter(p => [mirrored.source, mirrored.copy].includes(p.id)); assert.equal(p.length, 2);
  assert.ok(p.every(x => x.kind === 'treasury_weapon' && x.ordinal === p[0].ordinal));
  for (const x of p) near(x.lifetime - x.age, p[0].lifetime - p[0].age);
});

test('到达最大距离返回仍使用同一兵器载体，回收到角色后释放，库存不消耗', () => {
  const { b } = fixture([{ id: 'proj_return_at_max' }]); cast(b); until(b, () => b.projectiles().length > 0);
  const id = b.projectiles()[0].id; let returning = false, comingBack = false, last = -Infinity;
  tick(b, 180, () => {
    const p = b.projectiles().find(p => p.id === id); if (!p) return;
    if (b.combat.projectiles.state.get(id)?.returning) { returning = true; if (p.x < last) comingBack = true; }
    last = p.x;
  });
  assert.equal(returning, true); assert.equal(comingBack, true); assert.ok(!b.projectiles().some(p => p.id === id));
  assert.ok(b.combat.projectiles.recalled >= 1); assert.equal(stock(b), 1);
});

test('每枚出射才弹开独立法阵，固定在真实起点并及时消失；VFX 不改变战果与随机结果', () => {
  function run(enabled) {
    const { b, spawns } = fixture([], [{ x: 300 }]), scene = new T.Scene(), fx = enabled ? createBattleEffects(T, scene) : null;
    fx?.update(b); cast(b); fx?.update(b);
    if (fx) assert.ok(!fx.group.children.some(o => o.name === 'royal-treasury-gate'), '加层时没有常驻阵');
    b.hero.x = 200; b.hero.y = 100; b.setAim(200, 1100); b.select(1); until(b, () => spawns.length > 0, () => fx?.update(b));
    let launchMatrix;
    if (fx) {
      const gate = fx.group.children.find(o => o.name === 'royal-treasury-gate').children[0]; assert.equal(gate.count, spawns.length);
      launchMatrix = new T.Matrix4(); gate.getMatrixAt(0, launchMatrix);
      const position = new T.Vector3().setFromMatrixPosition(launchMatrix), shot = spawns[0];
      near(position.x, shot.x); near(position.y, shot.z); near(position.z, -shot.y);
      const normal = new T.Vector3(0, 0, 1).transformDirection(launchMatrix), direction = new T.Vector3(shot.vx, shot.vz, -shot.vy).normalize();
      near(normal.dot(direction), 1);
    }
    b.hero.x = -500; b.hero.y = -500; b.step(1 / 60); fx?.update(b);
    if (fx) { const matrix = new T.Matrix4(); fx.group.children.find(o => o.name === 'royal-treasury-gate').children[0].getMatrixAt(0, matrix); near(matrix.elements[12], launchMatrix.elements[12]); near(matrix.elements[13], launchMatrix.elements[13]); near(matrix.elements[14], launchMatrix.elements[14]); }
    tick(b, 20, () => fx?.update(b)); assert.equal(stock(b), 1);
    if (fx) assert.equal(fx.group.children.find(o => o.name === 'royal-treasury-gate').children[0].count,
      spawns.filter(s => b.elapsed - s.time < .32).length, '只显示仍在0.32秒寿命内的独立出射法阵');
    tick(b, 800, () => fx?.update(b)); assert.equal(stock(b), 0);
    if (fx) assert.equal(fx.group.children.find(o => o.name === 'royal-treasury-gate').children[0].count, 0);
    const result = { damage: b.damageDealt, hash: b.host.world.stateHash(), stock: stock(b), health: b.monsters.map(m => m.health) };
    fx?.dispose(); assert.equal(scene.children.length, 0); return result;
  }
  assert.deepEqual(run(true), run(false));
});

test('30枚兵器对应30个头顶法阵，各阵心等于真实起点，法阵与兵器共同瞄准实际目标', () => {
  const { b, spawns } = fixture([{ id: 'proj_count', params: { n: 29 } }], [{ x: 700, y: -400 }]);
  const fx = createBattleEffects(T, new T.Scene()); fx.update(b); cast(b); until(b, () => spawns.length > 0, () => fx.update(b));
  assert.equal(spawns.length, 30); const mesh = fx.group.children.find(o => o.name === 'royal-treasury-gate').children[0]; assert.equal(mesh.count, 30);
  const w = b.host.world, targetIndex = w.targetIndexOf(b.monsters[0].id), target = new T.Vector3(w.targets.px[targetIndex], w.targets.pz[targetIndex], -w.targets.py[targetIndex]);
  const centers = new Set();
  for (let i = 0; i < 30; i++) {
    const shot = spawns[i], matrix = new T.Matrix4(); mesh.getMatrixAt(i, matrix);
    const position = new T.Vector3().setFromMatrixPosition(matrix), normal = new T.Vector3(0, 0, 1).transformDirection(matrix), direction = target.clone().sub(position).normalize();
    near(position.x, shot.x); near(position.y, shot.z); near(position.z, -shot.y); near(position.distanceTo(new T.Vector3(0, 2, 0)), 1.8);
    assert.ok(position.y > 2); near(normal.dot(direction), 1); near(new T.Vector3(shot.vx, shot.vz, -shot.vy).normalize().dot(direction), 1);
    centers.add(position.toArray().map(v => v.toFixed(4)).join(','));
  }
  assert.equal(centers.size, 30); fx.dispose();
});

test('法阵0.035秒瞬间撑开，0.32秒内收束，库存不使旧阵复活', () => {
  const fx = createGate(T), mesh = fx.group.children[0], matrix = new T.Matrix4(), size = () => { mesh.getMatrixAt(0, matrix); return new T.Vector3().setFromMatrixScale(matrix).x; };
  fx.update(0); const opening = size(); assert.equal(mesh.count, 1);
  fx.update(.035); const expanded = size(); assert.ok(expanded > opening * 30);
  fx.update(.25); assert.ok(size() < expanded * .6); assert.equal(fx.group.children.length, 1);
  fx.update(.32, { stock: 10 }); assert.equal(mesh.count, 0); fx.update(2, { stock: 10 }); assert.equal(mesh.count, 0); fx.dispose();
});

test('兵器尖端跟随真实载体，仍在法阵背面的部分被裁剪，飞出后完整显示', () => {
  const fx = createWeapons(T, 3), launch = { x: -1, y: 1.2, z: .3, dx: 1, dy: 0, dz: 0 };
  const row = { ...launch, dx: 22, age: 0, radius: .2, ordinal: 0, launch };
  const sword = fx.group.children[0].children[0]; fx.update([row]);
  near(sword.geometry.attributes.emergeDistance.getX(0), 0);
  sword.geometry.computeBoundingBox(); near(sword.geometry.boundingBox.max.z, 0); assert.ok(sword.geometry.boundingBox.min.z < -1);
  fx.update([{ ...row, x: -.78, age: .01 }]); near(sword.geometry.attributes.emergeDistance.getX(0), .22 / .6);
  fx.update([{ ...row, x: 3.4, age: .2 }]); assert.ok(sword.geometry.attributes.emergeDistance.getX(0) > 1000);
  fx.update([]); assert.equal(sword.count, 0); fx.dispose();
});

test('通用 emit.offset 支持表达式、局部方向、计划展示与缓存隔离；共享 UE 特性拒绝网页扩展', () => {
  const trait = offset => ({ id: 'offset_probe', params: { back: -2 }, rules: [{ id: 'launch', event: 'cast', actions: [{ op: 'emit', kind: 'probe', speed: 0, lifetime: 1, ...(offset == null ? {} : { offset }) }] }] });
  const parse = doc => { const result = readTraitText(JSON.stringify(doc)); assert.equal(result.error, ''); return result.trait; };
  const source = trait({ forward: { param: 'back' }, left: 1, up: .4 });
  const a = compileBuild(newBuild('offset_probe', [parse(source)])), b = compileBuild(newBuild('offset_probe', [parse(trait(null))]));
  assert.ok(a.plan, a.error); assert.notEqual(a.plan.hash, b.plan.hash);
  assert.deepEqual(describeAction(a.plan, 0).offset, { forward: '-2', left: '1', up: '0.4' });
  const host = new RuleHost(); assert.equal(host.loadRuleLibrary([{ path: 'Traits/offset_probe.json', text: JSON.stringify(source) }]).ok, false);
  assert.ok(host.loadRuleLibrary([{ path: 'WebTraits/offset_probe.json', text: JSON.stringify(source) }]).ok);
  const plan = host.compileTraits('offset_probe', ['offset_probe']).plan, owner = host.registerOwner(5, 0);
  host.castBuild(plan, owner, { x: 1000, y: 2000, z: 50 }, { x: 0, y: 1, z: 0 }); host.stepFrame(1 / 60);
  near(host.world.carriers.px[0], 9); near(host.world.carriers.py[0], 18); near(host.world.carriers.pz[0], .9);
  for (const offset of [null, [], { sideways: 1 }, { forward: 'invalid' }]) {
    const invalid = trait(null); invalid.rules[0].actions[0].offset = offset;
    assert.ok(readTraitText(JSON.stringify(invalid)).error);
  }
  const invalid = trait({ forward: 1 }); invalid.rules[0].actions[0].op = 'copy'; assert.ok(readTraitText(JSON.stringify(invalid)).error);
});

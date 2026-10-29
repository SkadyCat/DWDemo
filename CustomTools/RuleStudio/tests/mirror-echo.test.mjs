import test from 'node:test';
import assert from 'node:assert/strict';
import { readRuleFiles } from '../scripts/rule-files.mjs';
import { RuleHost, checkRuleSet, newBuild, readTraitText, statusKey, parseCollection } from '../engine/index.mjs';
import { Battle } from '../public/sim/battle.mjs';
import { HERO_TARGET_ID } from '../public/sim/arena.mjs';
import { cleanPlayerInventory } from '../public/player-storage.mjs';

const files = readRuleFiles(), checked = checkRuleSet(files); assert.ok(checked.ok, checked.error);
const step = (b, n) => { for (let i = 0; i < n; i++) b.step(1 / 60); };
function arena(skill = 'whirlwind', traits = []) {
  const doc = parseCollection('equipment', { id: 'mirror_test', name: '测试', slot: 'weapon', rarity: 'unique', level: 1,
    skills: [skill], traits: [{ id: 'grant_echo' }, ...traits] }).doc;
  const collections = { ...checked.collections, equipment: new Map([...checked.collections.equipment, [doc.id, { doc }]]) };
  const b = new Battle(files, { collections, maxMonsters: 0, spawnRate: 0, god: false, autoCast: false, seed: 18 });
  b.setLoadout({ skills: [skill, 'echo'], equipment: { weapon: doc.id } }); assert.ok(b.hero.plan >= 0, b.hero.error);
  b.setAim(900, 300); return b;
}
function cast(b, slot = 0) { b.select(slot); b.hero.castClock = 10; b.hero.casting = true; b.step(1 / 60); b.hero.casting = false; }
function source(id, actions) { const r = readTraitText(JSON.stringify({ id, rules: [{ id, event: 'cast', actions }] })); assert.ok(r.trait, r.error); return newBuild(id, [r.trait]); }

test('consume_status扣真实状态层数；不足不扣且不执行后续，consume计数器与状态隔离', () => {
  const h = new RuleHost(); assert.ok(h.loadRuleLibrary([...files, { path: 'WebStatuses/test_charge.json', text: JSON.stringify({ id: 'test_charge', stacking: 'stack', maxStacks: 5, category: 'buff', traits: ['frost_damage'] }) }]).ok);
  const owner = h.registerOwner(1, 0); h.setOwnerStatusId(owner, 77);
  const action = { op: 'consume_status', key: 'test_charge', origin: 'owner', value: 2,
    then: [{ op: 'apply_status', key: 'bleed', origin: 'owner', value: { event: 'stored_value' }, duration: 5 }] };
  const plan = h.compileSource(source('test_consume', [action])).plan;
  const fire = () => { h.castBuild(plan, owner, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }); h.stepFrame(0); };
  for (let i = 0; i < 3; i++) h.applyStatus(77, 'test_charge', 1, 5);
  const key = statusKey('test_charge'), expire = h.world.statuses.get(`77|${key}`).expire;
  fire(); assert.equal(h.world.getStatusStacks(77, key), 1); assert.equal(h.world.getStatus(77, statusKey('bleed')), 2);
  assert.ok(h.heldSources(77).some(t => t.id === 'frost_damage'));
  assert.equal(h.world.statuses.get(`77|${key}`).expire, expire);
  h.world.consumeStatusKey(77, statusKey('bleed'), 1, true);
  fire(); assert.equal(h.world.getStatusStacks(77, key), 1); assert.equal(h.world.getStatus(77, statusKey('bleed')), 0);
  const counter = h.compileSource(source('counter_only', [{ op: 'consume', key: 'test_charge', value: 'all' }])).plan;
  h.castBuild(counter, owner, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }); h.stepFrame(0);
  assert.equal(h.world.getStatusStacks(77, key), 1);
  assert.equal(h.world.consumeStatusKey(77, key, 1, true), 1); assert.equal(h.world.getStatus(77, key), 0);
  assert.equal(h.world.statuses.has(`77|${key}`), false);
  assert.ok(!h.heldSources(77).some(t => t.id === 'frost_damage'));
});

test('消耗异常同步运行时层数，感电与中毒不会在下一帧重新出现', () => {
  const b = arena('whirlwind', [{ id: 'shock_max_stacks', params: { n: 3 } }]);
  b.spawnMonsters(1); const m = b.monsters[0]; Object.assign(m, { x: 900, y: 0, speed: 0, cooldown: 9999, health: 1e7, maxHealth: 1e7 });
  step(b, 1); const a = b.combat.ailments, w = b.host.world;
  a.addShock(m.id, 20, 5); a.addShock(m.id, 30, 5); a.addShock(m.id, 40, 5);
  assert.equal(w.consumeStatusKey(m.id, statusKey('shock'), 1), 1); assert.equal(a.shockLayers(m.id), 2);
  a.applyPoison(m.id, { amount: 100, element: 4, layers: 3, duration: 5 });
  assert.equal(w.consumeStatusKey(m.id, statusKey('poison'), 1), 1); assert.equal(a.layers(m.id, 'poison'), 2);
  for (const name of ['shock', 'poison']) assert.equal(w.consumeStatusKey(m.id, statusKey(name), 1, true), 2);
  step(b, 35);
  for (const name of ['shock', 'poison']) { assert.equal(a.layers(m.id, name), 0); assert.equal(w.getStatus(m.id, statusKey(name)), 0); }
});

test('回响独立5秒冷却，下一次完整旋风只复施一次，消耗真实状态且不额外支付资源', () => {
  const b = arena(), trace = []; b.host.world.trace = (kind, data) => trace.push({ kind, data });
  cast(b, 1); assert.equal(b.host.world.getStatus(HERO_TARGET_ID, statusKey('echo')), 1);
  assert.ok(b.buffs().some(row => row.label === '回响')); assert.ok(b.combat.cooldown > 4.9);
  let payments = 0; const beforeCast = b.character.beforeCast.bind(b.character);
  b.character.beforeCast = (...args) => { payments++; return beforeCast(...args); };
  b.select(0); assert.equal(b.combat.cooldown, 0); cast(b); step(b, 1);
  assert.equal(b.projectiles().length, 2); assert.equal(b.hero.casts, 2);
  assert.equal(trace.filter(e => e.kind === 'skill_repeated').length, 1);
  assert.equal(b.host.world.getStatus(HERO_TARGET_ID, statusKey('echo')), 0);
  assert.equal(payments, 1);
  b.select(1); assert.ok(b.combat.cooldown > 4.9); cast(b, 1); assert.equal(b.hero.casts, 2);
  step(b, 305); assert.equal(b.combat.cooldown, 0);
});

test('回响复施保留点击落点和抛物线；不使用时状态到期不会偷偷施法', () => {
  const b = arena('poison_flask'); cast(b, 1); cast(b); step(b, 1);
  const c = b.host.world.carriers; assert.equal(c.num, 2);
  for (const name of ['vx', 'vy', 'gravity', 'life', 'damage', 'flags']) assert.equal(c[name][0], c[name][1], name);
  assert.ok(Math.abs((c.vz[0] - c.gravity[0] * c.age[0]) - (c.vz[1] - c.gravity[1] * c.age[1])) < 1e-5);
  const roots = [b.host.world.roots[c.root[0]], b.host.world.roots[c.root[1]]];
  assert.deepEqual(roots[0].targetPoint, roots[1].targetPoint);
  const unused = arena(); cast(unused, 1); step(unused, 305);
  assert.equal(unused.host.world.getStatus(HERO_TARGET_ID, statusKey('echo')), 0); assert.equal(unused.hero.casts, 1); assert.equal(unused.projectiles().length, 0);
});

test('回响也复施连续发射词条，仍只记录一次手动技能与一次状态消耗', () => {
  const b = arena('whirlwind', [{ id: 'proj_volleys', params: { n: 2 } }]);
  cast(b, 1); cast(b); step(b, 25);
  assert.equal(b.projectiles().length, 6); assert.equal(b.hero.casts, 2);
  assert.equal(b.host.world.getStatus(HERO_TARGET_ID, statusKey('echo')), 0);
});

test('回响只供下一次手动技能使用，先前技能的延后连续发射不能消耗它', () => {
  const b = arena('whirlwind', [{ id: 'proj_volleys', params: { n: 2 } }]);
  cast(b); cast(b, 1); step(b, 25);
  assert.equal(b.projectiles().length, 3); assert.equal(b.hero.casts, 2);
  assert.equal(b.host.world.getStatus(HERO_TARGET_ID, statusKey('echo')), 1);
});

function mirrorArena() {
  const b = arena(); cast(b); const c = b.host.world.carriers;
  c.px[0] = -5; c.py[0] = 0; c.pz[0] = .2;
  b.combat.projectiles.state.get(c.id[0]).groundPosition = { x: -5, y: 0, z: .2 };
  b.combat.grounds.fields.push({ type: 'mirror', x: 0, y: 0, radius: 1, element: null, left: 5 });
  const move = (i, x, z = .2) => { c.px[i] = x; c.pz[i] = z; b.combat.grounds.onProjectilesMoved(); };
  return { b, c, move };
}

test('镜像只认实际进入，停留不复制；原体和复制体退出再进入都能继续复制', () => {
  const { b, c, move } = mirrorArena(); move(0, 0); assert.equal(c.num, 2);
  for (let i = 0; i < 5; i++) b.combat.grounds.onProjectilesMoved(); assert.equal(c.num, 2);
  move(0, 5); move(0, 0); assert.equal(c.num, 3);
  move(1, 5); move(1, 0); assert.equal(c.num, 4);
  assert.equal(b.hero.casts, 1);
});

test('镜像扫掠识别高速穿过与高度；复制继承年龄、伤害、寿命和接触能力，出生不递归', () => {
  const { b, c, move } = mirrorArena(); c.age[0] = 3;
  move(0, 5); assert.equal(c.num, 2, '两端都在外侧也识别一次进入');
  assert.ok(c.px[1] < 0 && c.px[1] > -3, '复制发生在实际进入点');
  for (const name of ['age', 'damage', 'element', 'life', 'radius', 'kind']) assert.equal(c[name][1], c[name][0], name);
  assert.ok(b.combat.projectiles.state.get(c.id[1]).groundContactEnabled);
  b.combat.grounds.onProjectilesMoved(); assert.equal(c.num, 2);
  const high = mirrorArena(); high.move(0, -5, 10); high.move(0, 5, 10); assert.equal(high.c.num, 1);
  const disabled = mirrorArena(); disabled.b.combat.projectiles.state.get(disabled.c.id[0]).groundContactEnabled = false;
  disabled.move(0, 0); assert.equal(disabled.c.num, 1);
});

test('切换到回响后，已有旋风与镜像复制仍保留游走和地面能力', () => {
  const { b, c, move } = mirrorArena(); b.select(1); move(0, 0); assert.equal(c.num, 2);
  const st = b.combat.projectiles.state.get(c.id[1]); assert.ok(st.roamingSpec); assert.ok(st.groundContactEnabled);
  step(b, 15); assert.ok(Math.abs(Math.hypot(c.vx[1], c.vy[1]) - 27) < .001);
});

test('存档清理只移除旧旋风定时组合，保留物品及合法词条并修正洗炼索引', () => {
  const b = arena(), item = { baseId: 'mirror_test', affixes: [
    { id: 'interval_whirlwind', traits: [{ id: 'trig_interval' }] }, { id: 'proj_count', traits: [{ id: 'proj_count' }] }
  ], reforgeTargets: [1] };
  const save = { owned: { item: {}, equipment: {} }, instances: { old: item }, loadout: { skills: [], equipment: { weapon: 'old' } } };
  cleanPlayerInventory(save, b.collections, checked.library);
  assert.deepEqual(item.affixes.map(a => a.id), ['proj_count']); assert.deepEqual(item.reforgeTargets, [0]); assert.equal(save.loadout.equipment.weapon, 'old');
});

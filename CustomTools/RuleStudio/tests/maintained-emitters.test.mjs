import test from 'node:test';
import assert from 'node:assert/strict';
import { RuleHost, readTraitText, compileBuild, newBuild } from '../engine/index.mjs';
import { describeAction } from '../public/plan-view.mjs';

const stockKey = 'channel:generic:charge|o0';
const source = () => ({ id: 'generic_charge', rules: [
  { id: 'add', event: 'cast', actions: [{ op: 'maintain_emitter', key: 'charge', channel: 'generic', value: 1,
    cap: 3, duration: .2, interval: .05, decay_interval: .1, event: 'generic_pulse', targeting: 'aim', radius: 0 }] },
  { id: 'release', event: 'generic_pulse', actions: [{ op: 'emit', kind: 'generic_probe', speed: 0, lifetime: .04, damage: 1,
    count: { random_int: [1, { event: 'amount' }] }, scatter: { left: { random: [-1, 1] } } }] },
  { id: 'spend', event: 'spend_charge', actions: [{ op: 'consume', key: 'charge', channel: 'generic', value: 'all' }] },
] });
const step = (host, frames) => { for (let i = 0; i < frames; i++) host.stepFrame(1 / 60); };
function fixture(doc = source()) {
  const host = new RuleHost(), rows = [], pulses = [], ended = [];
  const loaded = host.loadRuleLibrary([{ path: 'WebTraits/generic_charge.json', text: JSON.stringify(doc) }]); assert.ok(loaded.ok, loaded.error);
  const compiled = host.compileTraits('generic_charge', ['generic_charge']); assert.ok(compiled.plan >= 0, compiled.error);
  const owner = host.registerOwner(55, 0), cast = () => host.castBuild(compiled.plan, owner, { x: 0, y: 0, z: 50 }, { x: 1, y: 0, z: 0 });
  host.world.trace = (kind, p) => {
    if (kind === 'spawn') rows.push([host.world.carriers.py[p.index], p.id]);
    if (kind === 'emitter_pulse') pulses.push(host.world.clock);
    if (kind === 'emitter_end') ended.push(p);
  };
  return { host, owner, cast, rows, pulses, ended, plan: host.plan(compiled.plan) };
}

test('通用维护发射器不依赖技能id：加层、独立节奏、任意层闲置衰减、无召唤物、根资源归还', () => {
  const { host, cast, pulses, ended } = fixture(); cast(); step(host, 1); cast(); step(host, 1);
  assert.equal(host.world.ownerState.get(stockKey), 2); assert.equal(host.world.emitters.entries.size, 1);
  step(host, 9); assert.ok(pulses.length >= 3); assert.equal(host.world.ownerState.get(stockKey), 2);
  step(host, 3); assert.equal(host.world.ownerState.get(stockKey), 1); step(host, 6); assert.equal(host.world.emitters.entries.size, 0);
  step(host, 10); assert.ok(host.world.roots.every(r => !r.active)); assert.equal(ended.length, 1); assert.equal(host.world.summons.length, 0);
  const n = pulses.length; step(host, 30); assert.equal(pulses.length, n);
});

test('普通consume与维护层数共享同一规则状态，消耗全部后停射；层数计时进入状态哈希', () => {
  const { host, cast, plan } = fixture(); cast(); step(host, 1); const entry = [...host.world.emitters.entries.values()][0];
  const before = host.world.stateHash(); entry.decayAt += 1; assert.notEqual(host.world.stateHash(), before);
  const root = host.world.roots[entry.root];
  host.world.pushEvent({ type: plan.findEvent('spend_charge'), root: entry.root, sequence: root.nextSequence++, generation: 0, lineage: 0, tags: 0n });
  step(host, 2); assert.equal(host.world.ownerState.get(stockKey), 0); assert.equal(host.world.emitters.entries.size, 0);
});

test('随机表达式只由种子、事件和载体次序决定，每枚独立取样并可查看；禁止用于静态修饰', () => {
  function run() { const { host, cast, rows, plan } = fixture(); cast(); cast(); cast(); step(host, 11); return { rows, plan }; }
  const a = run(), b = run(); assert.deepEqual(a.rows, b.rows); assert.ok(new Set(a.rows.map(r => r[0])).size >= 3);
  const maintain = describeAction(a.plan, 0); assert.equal(maintain.op, 'maintain_emitter'); assert.equal(maintain.decayInterval, '0.1');
  const emit = a.plan.actions.findIndex(a => a.scatter); assert.ok(describeAction(a.plan, emit).fields.count.includes('random_int'));
  assert.ok(describeAction(a.plan, emit).scatter.left.includes('random'));
  const invalid = readTraitText(JSON.stringify({ id: 'bad_random_modifier', modifiers: [{ target: 'projectile', stat: 'count', op: 'add', value: { random_int: [1, 3] } }] }));
  assert.equal(invalid.error, ''); assert.match(compileBuild(newBuild('bad_random_modifier', [invalid.trait])).error, /constant/);
});

test('新维护/随机字段严格校验，网页机制不能进入UE共享特性目录', () => {
  const doc = source();
  const host = new RuleHost(); assert.equal(host.loadRuleLibrary([{ path: 'Traits/generic_charge.json', text: JSON.stringify(doc) }]).ok, false);
  for (const change of [a => delete a.key, a => delete a.event, a => delete a.decay_interval, a => { a.scope = 'cast'; }]) {
    const changed = source(); change(changed.rules[0].actions[0]); const parsed = readTraitText(JSON.stringify(changed));
    assert.ok(parsed.error || compileBuild(newBuild('generic_charge', [parsed.trait])).error);
  }
  for (const change of [a => { a.targeting = 'invalid'; }, a => { a.aim = 'back'; }, a => { a.scatter = { sideways: 1 }; }]) {
    const changed = source(); change(changed.rules[0].actions[0]); assert.ok(readTraitText(JSON.stringify(changed)).error);
  }
  const invalidArity = source(); invalidArity.rules[1].actions[0].count = { random_int: [1] };
  const parsed = readTraitText(JSON.stringify(invalidArity)); assert.match(compileBuild(newBuild('generic_charge', [parsed.trait])).error, /exactly 2/);
});

test('通用上半球发射分布不依赖技能：等面积分层、种子旋转、真实起点、表达式半径及缓存隔离', () => {
  const source = radius => ({ id: 'dome_probe', params: { size: 2 }, rules: [{ id: 'emit', event: 'cast', actions: [{ op: 'emit', kind: 'probe', count: 64, speed: 0, lifetime: 1,
    scatter: { shape: 'hemisphere', radius }, offset: { up: 2 } }] }] });
  const compile = doc => { const parsed = readTraitText(JSON.stringify(doc)); assert.equal(parsed.error, ''); const built = compileBuild(newBuild('dome_probe', [parsed.trait])); assert.ok(built.plan, built.error); return built.plan; };
  const plan = compile(source({ param: 'size' })); assert.notEqual(plan.hash, compile(source(3)).hash);
  assert.deepEqual(describeAction(plan, 0).scatter, { shape: 'hemisphere', radius: '2' });
  function run() {
    const host = new RuleHost(), doc = source({ param: 'size' }), file = { path: 'WebTraits/dome_probe.json', text: JSON.stringify(doc) };
    assert.equal(host.loadRuleLibrary([{ ...file, path: 'Traits/dome_probe.json' }]).ok, false);
    assert.ok(host.loadRuleLibrary([file]).ok); const p = host.compileTraits('dome_probe', ['dome_probe']).plan, owner = host.registerOwner(55, 0), rows = [];
    host.world.trace = (kind, payload) => { if (kind !== 'spawn') return; const c = host.world.carriers, i = payload.index; rows.push([c.px[i], c.py[i], c.pz[i]]); };
    host.castBuild(p, owner, { x: 100, y: 200, z: 50 }, { x: 0, y: 1, z: 0 }); host.stepFrame(1 / 60); return rows;
  }
  const rows = run(); assert.deepEqual(rows, run()); assert.equal(rows.length, 64);
  for (const [i, [x, y, z]] of rows.entries()) { assert.ok(Math.abs(Math.hypot(x - 1, y - 2, z - 2.5) - 2) < 1e-5); assert.ok(Math.abs(z - 2.5 - 2 * (i + .5) / 64) < 1e-5); }
  assert.equal(new Set(rows.map(row => row.join(','))).size, 64);
  for (const scatter of [{ shape: 'sphere', radius: 2 }, { shape: 'hemisphere' }, { shape: 'hemisphere', radius: 2, left: 1 }, { radius: 2 }]) {
    const invalid = source(2); invalid.rules[0].actions[0].scatter = scatter; assert.ok(readTraitText(JSON.stringify(invalid)).error);
  }
});

test('通用rate时钟按每秒期望量随机出射，有疏有密；不同帧步同种子重现，固定interval行为保留', () => {
  function run(rate, seed = 0, frame = 1 / 60) {
    const doc = source(), action = doc.rules[0].actions[0]; delete action.interval;
    action.rate = rate; action.duration = 1000; doc.rules[1].actions[0].count = 1;
    const f = fixture(doc); f.host.castCounter = BigInt(seed); f.cast(); f.host.stepFrame(0);
    for (let i = 0; i < Math.round(60 / frame); i++) f.host.stepFrame(frame);
    return f;
  }
  const a = run(11), b = run(11); assert.deepEqual(a.pulses, b.pulses);
  assert.ok(Math.abs(a.pulses.length / 60 - 11) < 1.2);
  const gaps = a.pulses.slice(1).map((t, i) => t - a.pulses[i]), mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const cv = Math.sqrt(gaps.reduce((a, x) => a + (x - mean) ** 2, 0) / gaps.length) / mean;
  assert.ok(cv > .65 && cv < 1.35, `间隔应有自然疏密而非等距：${cv}`);
  assert.ok(gaps.some(x => x < .025) && gaps.some(x => x > .25));
  assert.deepEqual(a.pulses, run(11, 0, 1 / 30).pulses);
  assert.ok(!a.pulses.every(t => Math.abs(t * 2 - Math.round(t * 2)) < .001));
  for (const rate of [2, 11]) {
    let count = 0; for (let seed = 0; seed < 8; seed++) count += run(rate, seed * 101).pulses.length;
    assert.ok(Math.abs(count / 480 - rate) < rate * .1, `实测平均 ${count / 480} 应接近期望 ${rate}`);
  }
  assert.equal(describeAction(a.plan, 0).rate, '11');
});

test('rate读取当前层数，刷新不重抽等待；零速率暂停、消耗和衰减停止、随机时钟进入哈希', () => {
  const doc = source(), action = doc.rules[0].actions[0]; delete action.interval;
  action.rate = { mul: [{ state: 'multiplier', channel: 'generic' }, { event: 'amount' }] }; action.duration = 20;
  const { host, cast, pulses } = fixture(doc); cast(); host.stepFrame(0); const entry = [...host.world.emitters.entries.values()][0];
  const hazard = entry.hazard, seed = entry.scheduleSeed, sample = entry.sample;
  step(host, 60); assert.equal(pulses.length, 0); assert.equal(entry.hazard, hazard);
  cast(); host.stepFrame(0); assert.equal(entry.hazard, hazard); assert.equal(entry.scheduleSeed, seed); assert.equal(entry.sample, sample);
  host.world.ownerState.set('channel:generic:multiplier|o0', 10); step(host, 120); assert.ok(pulses.length > 10);
  const before = host.world.stateHash(); entry.hazard += .1; assert.notEqual(host.world.stateHash(), before);
  host.world.ownerState.set(stockKey, 0); step(host, 1); assert.equal(host.world.emitters.entries.size, 0);
  step(host, 100); assert.ok(host.world.roots.every(r => !r.active));
  const invalid = source(); invalid.rules[0].actions[0].rate = 10; assert.ok(readTraitText(JSON.stringify(invalid)).error);
  const emit = source(); emit.rules[1].actions[0].rate = 10; assert.ok(readTraitText(JSON.stringify(emit)).error);
});

test('半球random分布逐枚随机采样，单枚也覆盖不同高度，多重不再按等距网格出现', () => {
  const doc = source(); doc.rules[0].actions[0].duration = 100; const emit = doc.rules[1].actions[0];
  emit.count = 1; emit.scatter = { shape: 'hemisphere', radius: 2, distribution: 'random' };
  const f = fixture(doc), heights = []; const previous = f.host.world.trace;
  f.host.world.trace = (kind, payload) => { previous?.(kind, payload); if (kind === 'spawn') { const c = f.host.world.carriers, i = payload.index; heights.push(c.pz[i]); assert.ok(Math.abs(Math.hypot(c.px[i], c.py[i], c.pz[i]) - 2) < 1e-5); } };
  f.cast(); step(f.host, 240); assert.ok(heights.some(h => h < .4) && heights.some(h => h > 1.6)); assert.ok(new Set(heights.map(h => h.toFixed(4))).size > 50);
  const changed = source(); changed.rules[1].actions[0].scatter = { ...emit.scatter, distribution: 'grid' }; assert.ok(readTraitText(JSON.stringify(changed)).error);
});

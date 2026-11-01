// 新引擎底层积木的单元测试：属性与修正、条件与缩放、状态、资源、伤害管线、事件预算。
import test from 'node:test';
import assert from 'node:assert/strict';
import { compileContent, createWorld, BASE, convert, armourReduction, hit } from '../core/index.mjs';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${a} ≈ ${b}`);
const world = (pack = {}, seed = 1) => createWorld(compileContent(BASE, pack), { seed });
const hero = (w, mods = [], o = {}) => w.spawnActor({ kind: 'hero', team: 0, mods: [{ stat: 'life', value: 1000 }, { stat: 'mana', value: 200 }, ...mods], ...o });
const dummy = (w, mods = [], o = {}) => w.spawnActor({ team: 1, x: 100, brain: 'none', mods: [{ stat: 'life', value: 1e6 }, ...mods], ...o });

test('修正：base × (1+Σinc) × Πmore，标签过滤与 notTags', () => {
  const w = world();
  const a = hero(w, [
    { stat: 'damage', op: 'inc', value: 50 }, { stat: 'damage', op: 'inc', value: 50, tags: ['fire'] },
    { stat: 'damage', op: 'more', value: 20 }, { stat: 'damage', op: 'more', value: 50, tags: ['spell'], notTags: ['fire'] },
  ]);
  near(w.scaled(a, 'damage', 100, new Set(['fire'])), 100 * 2 * 1.2);
  near(w.scaled(a, 'damage', 100, new Set(['spell'])), 100 * 1.5 * 1.2 * 1.5);
  near(w.scaled(a, 'damage', 100, new Set(['spell', 'fire'])), 100 * 2 * 1.2);
});

test('修正：编译期拒绝未知属性、错误运算与未知字段', () => {
  assert.throws(() => compileContent(BASE, { affixes: [{ id: 'x', mods: [{ stat: 'nope', value: 1 }] }] }), /未知属性/);
  assert.throws(() => compileContent(BASE, { affixes: [{ id: 'x', mods: [{ stat: 'chaosBypassEs', op: 'inc', value: 1 }] }] }), /开关属性/);
  assert.throws(() => compileContent(BASE, { affixes: [{ id: 'x', mods: [{ stat: 'damage', value: 1, iff: {} }] }] }), /未知字段/);
  assert.throws(() => compileContent(BASE, { affixes: [{ id: 'x', mods: [{ stat: 'damage', value: 1, when: { res: 'power', status: 'x' } }] }] }), /只能有一个来源/);
});

test('条件与缩放在求值时读取实时状态：每个充能、低血、对感电目标', () => {
  const w = world();
  const a = hero(w, [
    { stat: 'damage', op: 'more', value: 10, per: { res: 'power' } },
    { stat: 'damage', op: 'inc', value: 100, when: { pct: 'life', lte: 50 } },
    { stat: 'damage', op: 'more', value: 30, when: { status: 'shocked', of: 'target' } },
  ]);
  const t = dummy(w);
  const v = () => w.scaled(a, 'damage', 100, new Set(), { world: w, self: a, target: t, tags: new Set() });
  near(v(), 100);
  w.gain(a, 'power', 2); near(v(), 100 * 1.2, 1e-9);
  w.gain(a, 'power', 5); assert.equal(a.resource('power'), 3, '能量球上限 3');
  a.life = 400; near(v(), 100 * 2 * 1.3);
  w.applyStatus(t, 'shocked', { magnitude: 0.2 }); near(v(), 100 * 2 * 1.3 * 1.3);
});

test('召唤物继承拥有者的 minion 修正，嵌套拥有者链同样生效', () => {
  const w = world({ minions: [{ id: 'zombie', life: 100 }] });
  const a = hero(w, [{ stat: 'life', op: 'inc', value: 50, scope: 'minion' }, { stat: 'damage', op: 'more', value: 100, scope: 'minion' }]);
  const m = w.spawnFromTemplate('zombie', { owner: a, team: 0 });
  near(m.max.life, 150);
  near(a.max.life, 1000, 1e-9);
  const mm = w.spawnFromTemplate('zombie', { owner: m, team: 0 });
  near(w.scaled(mm, 'damage', 10), 20);
  assert.equal(mm.root, a);
});

test('状态：refresh 取强、stack 叠层、instances 各自计时、strongest 只生效最强', () => {
  const w = world({ statuses: [{ id: 'buff', stacking: 'stack', max: 5, duration: 3, mods: [{ stat: 'damage', op: 'inc', value: 10 }] }] });
  const a = hero(w), t = dummy(w);
  for (let i = 0; i < 7; ++i) w.applyStatus(a, 'buff');
  assert.equal(a.statusStacks('buff'), 5);
  near(w.scaled(a, 'damage', 100), 150);
  w.applyStatus(t, 'poisoned', { dps: 10, duration: 1 }); w.applyStatus(t, 'poisoned', { dps: 10, duration: 2 });
  assert.equal(t.statusStacks('poisoned'), 2);
  w.applyStatus(t, 'ignited', { dps: 5 }); w.applyStatus(t, 'ignited', { dps: 50 });
  const before = t.life;
  for (let i = 0; i < 60; ++i) w.step(1 / 60);
  // 1 s: two poisons (20 chaos) + strongest ignite (50 fire), no resistances.
  near(before - t.life, 70, 1e-3);
  for (let i = 0; i < 62; ++i) w.step(1 / 60);
  assert.equal(t.statusStacks('poisoned'), 0, '两层毒分别在 1 s 与 2 s 到期');
});

test('持续伤害产生 dotTick 事件，DoT 击杀归施加者', () => {
  const w = world();
  const a = hero(w), t = dummy(w, [{ stat: 'life', op: 'set', value: 30 }]);
  w.refreshPools(t, true);
  const seen = []; w.listeners.push(e => seen.push(e));
  w.applyStatus(t, 'ignited', { source: a, dps: 40, duration: 4 });
  for (let i = 0; i < 90; ++i) w.step(1 / 60);
  assert.ok(seen.some(e => e.type === 'dotTick' && e.source === a));
  const k = seen.find(e => e.type === 'kill');
  assert.ok(k && k.source === a && k.dot === 'ignited');
});

test('伤害管线：转化顺序、血统标签、额外获得、转化超过 100% 等比缩放', () => {
  const w = world();
  const a = hero(w, [
    { stat: 'conv.physical.lightning', value: 50 }, { stat: 'conv.lightning.cold', value: 50 },
    { stat: 'extra.physical.fire', value: 10 },
  ]);
  const chunks = convert(w, a, { physical: 100 }, new Set(), null);
  const sum = t => chunks.filter(c => c.type === t).reduce((s, c) => s + c.amount, 0);
  near(sum('physical'), 50); near(sum('lightning'), 25); near(sum('cold'), 25); near(sum('fire'), 10);
  const cold = chunks.find(c => c.type === 'cold');
  assert.deepEqual([...cold.lineage].sort(), ['cold', 'lightning', 'physical']);
  const b = hero(w, [{ stat: 'conv.physical.fire', value: 80 }, { stat: 'conv.physical.cold', value: 80 }]);
  const c2 = convert(w, b, { physical: 100 }, new Set(), null);
  near(c2.find(c => c.type === 'fire').amount, 50); assert.ok(!c2.some(c => c.type === 'physical'));
});

test('伤害管线：抗性上限、穿透、曝露、护甲公式与能量护盾吸收', () => {
  const w = world();
  const a = hero(w, [{ stat: 'pen.fire', value: 20 }]);
  const t = dummy(w, [{ stat: 'res.fire', value: 90 }, { stat: 'armour', value: 1000 }]);
  let r = hit(w, { source: a, target: t, base: { fire: 100 }, tags: new Set() });
  near(r.byType.fire, 100 * (1 - 0.55));
  // Over-capped resistance soaks the first 15 points of scorch.
  w.applyStatus(t, 'scorched', { magnitude: 0.1 });
  r = hit(w, { source: a, target: t, base: { fire: 100 }, tags: new Set() });
  near(r.byType.fire, 100 * (1 - 0.55));
  w.applyStatus(t, 'scorched', { magnitude: 0.3 });
  r = hit(w, { source: a, target: t, base: { fire: 100 }, tags: new Set() });
  near(r.byType.fire, 100 * (1 - 0.40));
  r = hit(w, { source: a, target: t, base: { physical: 100 }, tags: new Set() });
  near(r.byType.physical, 100 * (1 - armourReduction(1000, 100)));
  const s = dummy(w, [{ stat: 'life', op: 'set', value: 100 }, { stat: 'es', value: 50 }]);
  w.refreshPools(s, true);
  hit(w, { source: a, target: s, base: { physical: 80 }, tags: new Set() });
  assert.equal(s.es, 0); near(s.life, 70);
});

test('伤害管线：暴击、易碎加暴击率、幸运暴击、格挡与闪避', () => {
  const w = world({}, 5);
  const a = hero(w, [{ stat: 'crit.bonus', value: 50 }]);
  const t = dummy(w);
  let crits = 0;
  for (let i = 0; i < 2000; ++i) if (hit(w, { source: a, target: t, base: { physical: 10 }, crit: 25, tags: new Set() }).crit) ++crits;
  assert.ok(crits > 420 && crits < 580, `crit ${crits}`);
  const r = (() => { for (;;) { const x = hit(w, { source: a, target: t, base: { physical: 10 }, crit: 50, tags: new Set() }); if (x.crit) return x; } })();
  near(r.byType.physical, 25);
  w.applyStatus(t, 'brittle', { magnitude: 1, duration: 99 });
  near(w.stat(t, 'crit.taken'), 100);
  const b = dummy(w, [{ stat: 'block', value: 50 }]);
  let blocked = 0;
  for (let i = 0; i < 1000; ++i) if (hit(w, { source: a, target: b, base: { physical: 1 }, tags: new Set() }).reason === 'blocked') ++blocked;
  assert.ok(blocked > 430 && blocked < 570, `block ${blocked}`);
  const e = dummy(w, [{ stat: 'evasion', value: 20000 }]);
  let evaded = 0;
  for (let i = 0; i < 1000; ++i) if (hit(w, { source: a, target: e, base: { physical: 1 }, attack: true, tags: new Set() }).reason === 'evaded') ++evaded;
  assert.ok(evaded > 300, `evade ${evaded}`);
  for (let i = 0; i < 100; ++i) assert.notEqual(hit(w, { source: a, target: e, base: { physical: 1 }, attack: false, tags: new Set() }).reason, 'evaded', '法术不能被闪避');
});

test('异常：点燃用命中前伤害快照，转化来的火伤也按血统可流血', () => {
  const w = world();
  const a = hero(w, [{ stat: 'chance.ignite', value: 100 }, { stat: 'chance.bleed', value: 100 }, { stat: 'conv.physical.fire', value: 100 }, { stat: 'ailmentDamage', op: 'inc', value: 100, tags: ['ignite'] }]);
  const t = dummy(w, [{ stat: 'res.fire', value: 75 }]);
  hit(w, { source: a, target: t, base: { physical: 100 }, tags: new Set() });
  const ign = t.statuses.find(s => s.def.id === 'ignited'), bleed = t.statuses.find(s => s.def.id === 'bleeding');
  near(ign.dps, 100 * 0.2 * 2);
  near(bleed.dps, 100 * 0.15);
});

test('事件预算：自我触发的规则被深度上限和每帧预算截断，不会死循环', () => {
  const w = createWorld(compileContent(BASE, { affixes: [{ id: 'loop', rules: [{ on: 'hit', chain: true, do: [{ do: 'damage', damage: { fire: 1 } }] }] }] }), { eventBudget: 5000, maxDepth: 6 });
  const a = hero(w, [], { affixes: ['loop'] }), t = dummy(w);
  hit(w, { source: a, target: t, base: { fire: 1 }, tags: new Set() });
  w.step(1 / 60);
  assert.ok(w.stats.dropped > 0);
  assert.ok(w.stats.events <= 5000);
});

test('确定性：同一种子两次模拟逐事件一致', () => {
  const pack = { skills: [{ id: 'bolt', tags: ['spell', 'projectile', 'lightning'], time: .3, crit: 30, damage: { lightning: 30 }, actions: [{ do: 'projectile', speed: 1500, chain: 3 }] }] };
  const trace = seed => {
    const w = world(pack, seed);
    hero(w, [{ stat: 'chance.shock', value: 50 }, { stat: 'mana.regen', value: 50 }], { brain: 'turret', skills: ['bolt'] });
    for (let i = 0; i < 6; ++i) dummy(w, [{ stat: 'life', op: 'set', value: 200 }], { x: 300 + i * 40, y: (i % 2) * 80 });
    const log = []; w.listeners.push(e => log.push(`${e.type}:${e.target?.id ?? ''}:${(e.amount ?? 0).toFixed(3)}`));
    for (let i = 0; i < 300; ++i) w.step(1 / 60);
    return log.join('|');
  };
  assert.equal(trace(9), trace(9));
  assert.notEqual(trace(9), trace(10));
});

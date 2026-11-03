// 索敌：范围（actor.aggro × 属性 aggro）、墙挡视线（贴得很近能「听到」）、追击的拴绳、被打就锁定攻击者并让同伴警觉。
import test from 'node:test';
import assert from 'node:assert/strict';
import { compileContent, createWorld, BASE } from '../core/index.mjs';
import { MAP_PACK } from '../core/content/maps.mjs';
import { hit } from '../core/damage.mjs';

// A wall along x = wallX (all y): sight lines crossing it are blocked.
const wallAt = wallX => ({
  size: 1, sweep: (sx, sy, ex, ey) => ((sx - wallX) * (ex - wallX) < 0 ? 0.5 : -1),
  move: (a, x, y) => { if ((a.x - wallX) * (x - wallX) >= 0) { a.x = x; a.y = y; } }, tileOf: () => ({ x: 0, y: 0 }), flow: () => [0],
});

function setup({ terrain = null, mobMods = [], mobAt = [0, 0], heroAt = [800, 0], extra = [] } = {}) {
  const content = compileContent(BASE, MAP_PACK);
  const w = createWorld(content, { seed: 3, terrain });
  const hero = w.spawnActor({ kind: 'hero', team: 0, brain: 'none', x: heroAt[0], y: heroAt[1], mods: [{ stat: 'life', value: 1e6 }] });
  const still = [{ stat: 'cannotMove', op: 'flag' }];
  const mob = w.spawnActor({ team: 1, x: mobAt[0], y: mobAt[1], aggro: 600, mods: [{ stat: 'life', value: 1e6 }, ...still, ...mobMods], affixes: ['mob_instinct'] });
  const others = extra.map(([x, y]) => w.spawnActor({ team: 1, x, y, aggro: 600, mods: [{ stat: 'life', value: 1e6 }, ...still], affixes: ['mob_instinct'] }));
  const log = []; w.listeners.push(e => log.push(e));
  const run = s => { for (let i = 0; i < Math.round(s * 30); ++i) w.step(1 / 30); };
  return { w, hero, mob, others, log, run };
}

test('索敌范围：600 外看不见，走进来才发现（发一次 aggro 事件）；追上以后拴绳是范围的 1.6 倍', () => {
  const t = setup({ heroAt: [800, 0] });
  t.run(1);
  assert.equal(t.mob.brainTarget ?? null, null, '800 远：没发现');
  t.hero.x = 500; t.run(0.5);
  assert.equal(t.mob.brainTarget, t.hero);
  assert.equal(t.log.filter(e => e.type === 'aggro').length, 1);
  t.hero.x = 900; t.run(1);
  assert.equal(t.mob.brainTarget, t.hero, '900（< 960）：还在追');
  t.hero.x = 1100; t.run(1);
  assert.equal(t.mob.brainTarget ?? null, null, '1100：甩掉了');
});

test('墙挡视线：墙后 500 远发现不了；贴近到「听得到」的距离（范围的 30%）才会发现', () => {
  const t = setup({ terrain: wallAt(100), heroAt: [500, 0] });
  t.run(1);
  assert.equal(t.mob.brainTarget ?? null, null, '隔墙看不见');
  t.hero.x = 160; t.run(0.5);
  assert.equal(t.mob.brainTarget, t.hero, '160 < 180：听到了');
});

test('规则可以扩大索敌：aggro 属性（更多 +100%）让范围翻倍', () => {
  const t = setup({ heroAt: [1000, 0], mobMods: [{ stat: 'aggro', op: 'more', value: 100 }] });
  t.run(0.5);
  assert.equal(t.mob.brainTarget, t.hero, '1000 < 1200');
});

test('被打：锁定攻击者（再远也追），自己和 450 内的同伴进入警觉（范围 ×2.5），远处的同伴不受影响', () => {
  const t = setup({ heroAt: [1400, 0], extra: [[0, 400], [0, 900]] });
  t.run(0.5);
  assert.equal(t.mob.brainTarget ?? null, null);
  hit(t.w, { source: t.hero, target: t.mob, base: { physical: 10 }, tags: new Set(['attack']) });
  t.run(0.1);
  assert.equal(t.mob.brainTarget, t.hero, '被打就盯上');
  assert.ok(t.log.some(e => e.type === 'aggro' && e.provoked));
  assert.ok(t.mob.hasStatus('alerted') && t.others[0].hasStatus('alerted'), '自己和身边同伴警觉');
  assert.ok(!t.others[1].hasStatus('alerted'), '900 外的同伴没被惊动');
  t.run(2);
  assert.equal(t.mob.brainTarget, t.hero, '警觉期间 1400 远仍在追（1500 范围）');
  assert.equal(t.others[0].brainTarget, t.hero, '被惊动的同伴也发现了');
});

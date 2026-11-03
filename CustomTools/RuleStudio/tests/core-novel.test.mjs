// 「点一下，后面的事自己发生」的几种新机制：引信连环（fuse）、延时回声（delay + from:'recorded'）、
// 奇点被喂大（feedZones）、抽死的怪站起来当仆从（dominate）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { gameContent } from '../core/content/game.mjs';
import { createWorld } from '../core/index.mjs';
import { affixLine } from '../core/content/families.mjs';

const content = gameContent();
function setup(fids = [], skill = 'fuse_bolt', mobs = [[300, 0]]) {
  const w = createWorld(content, { seed: 4 });
  const affixes = fids.map(([id, t]) => affixLine(id, t ?? 1));
  const hero = w.spawnActor({ kind: 'hero', team: 0, brain: 'none', x: 0, y: 0, mods: [{ stat: 'life', value: 1e6 }, { stat: 'mana', value: 1e4 }], affixes, skills: [skill] });
  const still = [{ stat: 'cannotMove', op: 'flag' }, { stat: 'cannotAct', op: 'flag' }];
  const list = mobs.map(([x, y, life = 1e6]) => w.spawnActor({ team: 1, x, y, mods: [{ stat: 'life', value: life }, ...still] }));
  const log = []; w.listeners.push(e => log.push(e));
  const run = s => { for (let i = 0; i < Math.round(s * 30); ++i) w.step(1 / 30); };
  const cast = (x, y) => w.cast(hero, hero.skills[0], { aim: { x, y } });
  return { w, hero, list, log, run, cast };
}

test('引信弹：命中的怪被点上引信，约 0.9 秒后原地引爆', () => {
  const t = setup();
  t.cast(300, 0); t.run(0.4);
  assert.ok(t.list[0].hasStatus('primed'));
  assert.equal(t.log.filter(e => e.type === 'cast' && e.skill?.def.id === 'fuse_blast').length, 0);
  t.run(1);
  assert.equal(t.log.filter(e => e.type === 'cast' && e.skill?.def.id === 'fuse_blast').length, 1);
});

test('多米诺：引爆炸到的怪也被点上引信、接着炸，一排怪一个传一个；刚炸过的不会马上又被点上', () => {
  const row = Array.from({ length: 6 }, (_, i) => [300 + i * 140, 0]);
  const t = setup([['domino_chain', 5], ['core_domino', 1]], 'fuse_bolt', row);
  t.cast(300, 0); t.run(8);
  const blasts = t.log.filter(e => e.type === 'cast' && e.skill?.def.id === 'fuse_blast');
  assert.ok(blasts.length >= 5, `只炸了 ${blasts.length} 次`);
  assert.ok(Math.max(...blasts.map(e => e.x)) > 900, '传到了最远的那只');
  const at300 = blasts.filter(e => Math.abs(e.x - 300) < 1 && e.depth > 0 && e.skill?.def.id === 'fuse_blast');
  assert.ok(at300.length <= 2, `第一只来回被炸了 ${at300.length} 次`);
});

test('回声：施法 2 秒后从当时站的位置朝当时的方向重放，人走开也一样', () => {
  const t = setup([['echo_ghost', 5]], 'rime_lance', [[400, 0]]);
  t.cast(400, 0);
  t.hero.x = -600; t.hero.y = 500;        // walked away
  t.run(1.5);
  assert.equal(t.log.filter(e => e.type === 'remoteCast').length, 0);
  t.run(1);
  const echo = t.log.find(e => e.type === 'remoteCast');
  assert.ok(echo, '有回声');
  assert.ok(Math.hypot(echo.x, echo.y) < 1, '从原来的位置（0,0）放出');
  assert.ok(t.log.some(e => e.type === 'hit' && e.target === t.list[0] && e.depth > 0), '回声打中了原来方向上的怪');
});

test('吞噬 + 坍缩：死在奇点里的怪喂大奇点，奇点结束时坍缩，吞得越多炸得越狠', () => {
  const pack = Array.from({ length: 8 }, (_, i) => [400 + Math.cos(i) * 60, Math.sin(i) * 60, 1]);
  const t = setup([['singularity_feed', 5], ['collapse_link', 1]], 'singularity', pack);
  t.cast(400, 0); t.run(1);
  const z = t.w.carriers.zones.find(x => x.kind === 'singularity');
  assert.ok(z && z.fed >= 6 && z.radius > z.base, `喂了 ${z?.fed} 次`);
  t.run(6);
  const end = t.log.find(e => e.type === 'zoneEnd' && e.kind === 'singularity');
  assert.ok(end.fed >= 6);
  assert.ok(t.log.some(e => e.type === 'cast' && e.skill?.def.id === 'collapse'), '坍缩了');
});

test('统御：鞭子抽死的怪站起来变成你的仆从（带着它的技能和词缀），超过上限时最老的倒下', () => {
  const pack = Array.from({ length: 6 }, (_, i) => [150, -100 + i * 40, 1]);
  const t = setup([['core_legion', 1]], 'dominion_lash', pack);
  t.list[0].eliteMods = ['hasted'];
  t.cast(150, 0); t.run(0.2);
  const thralls = [...t.hero.minions].filter(m => m.alive && m.template === 'thrall');
  assert.ok(thralls.length >= 4, `只站起来 ${thralls.length} 个`);
  assert.ok(thralls.every(m => m.team === 0 && m.owner === t.hero));
  assert.ok(thralls.some(m => m.eliteMods.includes('hasted')), '保留精英词缀');
});

test('宝库之门：身后打开一排门，跟着人走，门里一件接一件射向点的位置附近的敌人', () => {
  const t = setup([['gate_more', 6]], 'gate_of_treasures', [[600, 0], [640, 60]]);
  t.cast(600, 0); t.run(0.05);
  const gates = t.w.carriers.zones.filter(z => z.kind === 'gate' && z.alive);
  assert.equal(gates.length, 6);
  assert.ok(gates.every(z => z.x < 60) && gates.reduce((n, z) => n + z.x, 0) < 0, '都在身后和两侧（背对点的方向）');
  t.hero.y = 200; t.run(0.1);
  assert.ok(gates.every(z => Math.abs(z.y - z.dy - 200) < 1), '跟着人走');
  t.run(1.8);
  const shots = t.log.filter(e => e.type === 'projectileHit' && e.skill?.def.id === 'gate_of_treasures');
  assert.ok(shots.length >= 18, `只射中 ${shots.length} 次`);
  assert.ok(t.list.every(m => shots.some(e => e.target === m)), '分着打附近的几只');
});

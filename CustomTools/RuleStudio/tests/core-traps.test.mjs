// 陷阱的底层积木：布设时间、踩中触发、多次触发、上限、远程引爆（springTraps）与陷阱之间的连线（eachTrap）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { compileContent, createWorld, BASE } from '../core/index.mjs';

function setup(pack, { heroMods = [], heroAffixes = [], monsters = [] } = {}) {
  const content = compileContent(BASE, pack);
  const w = createWorld(content, { seed: 5 });
  const hero = w.spawnActor({ kind: 'hero', team: 0, brain: 'none', mods: [{ stat: 'life', value: 5000 }, { stat: 'mana', value: 1000 }, ...heroMods], affixes: heroAffixes });
  const mobs = monsters.map(([x, y, life = 1e6]) => w.spawnActor({ team: 1, brain: 'none', x, y, mods: [{ stat: 'life', value: life }] }));
  const log = []; w.listeners.push(e => log.push(e));
  const run = s => { for (let i = 0; i < Math.round(s * 60); ++i) w.step(1 / 60); };
  return { w, hero, mobs, log, run };
}
const boom = { do: 'area', at: 'aim', radius: 100 };
const trapSkill = (extra = {}) => ({ id: 'mine', tags: ['spell', 'trap'], time: 0.3, damage: { fire: 10 }, range: 900,
  actions: [{ do: 'trap', kind: 'mine', at: 'aim', arm: 0.5, trigger: 60, onTrigger: [boom], ...extra }] });

test('陷阱：布设完成前不响；有敌人进入触发范围才触发，炸完就消失', () => {
  const t = setup({ skills: [trapSkill()] }, { monsters: [[600, 0]] });
  const sk = t.w.addSkill(t.hero, 'mine', { manual: true });
  t.w.cast(t.hero, sk, { aim: { x: 300, y: 0 } }); t.run(1);
  assert.equal(t.w.carriers.traps.length, 1, '没人踩：陷阱一直在');
  assert.equal(t.log.filter(e => e.type === 'trapTrigger').length, 0);
  t.mobs[0].x = 320; t.run(0.1);
  const trig = t.log.filter(e => e.type === 'trapTrigger');
  assert.equal(trig.length, 1); assert.equal(trig[0].target, t.mobs[0]); assert.equal(trig[0].key, 'mine');
  assert.ok(t.log.some(e => e.type === 'hit' && e.target === t.mobs[0]), '在陷阱处炸开');
  assert.equal(t.w.carriers.traps.length, 0, '用掉了');

  const u = setup({ skills: [trapSkill()] }, { monsters: [[300, 0]] });
  u.w.cast(u.hero, u.w.addSkill(u.hero, 'mine', { manual: true }), { aim: { x: 300, y: 0 } });
  u.run(0.3); assert.equal(u.log.filter(e => e.type === 'trapTrigger').length, 0, '0.5 秒布设期内不响');
  u.run(0.4); assert.equal(u.log.filter(e => e.type === 'trapTrigger').length, 1);
});

test('陷阱：trap.count 一次扔一圈、trap.limit 顶掉最老的、trap.uses 让一颗陷阱响好几次', () => {
  const t = setup({ skills: [trapSkill({ limit: 5 })] }, { heroMods: [{ stat: 'trap.count', value: 3 }] });
  const sk = t.w.addSkill(t.hero, 'mine', { manual: true });
  t.w.cast(t.hero, sk, { aim: { x: 400, y: 0 } }); t.run(0.05);
  assert.equal(t.w.carriers.traps.length, 4, '1 + 3 颗');
  t.w.cast(t.hero, sk, { aim: { x: -400, y: 0 } }); t.run(0.05);
  assert.equal(t.w.carriers.traps.length, 5, '上限 5：最老的被顶掉');

  const u = setup({ skills: [trapSkill({ rearm: 0.3 })] }, { heroMods: [{ stat: 'trap.uses', value: 2 }], monsters: [[300, 0]] });
  u.w.cast(u.hero, u.w.addSkill(u.hero, 'mine', { manual: true }), { aim: { x: 300, y: 0 } }); u.run(3);
  assert.equal(u.log.filter(e => e.type === 'trapTrigger').length, 3, '1 + 2 次');
  assert.ok(u.log.filter(e => e.type === 'trapTrigger').at(-1).last, '最后一次标记 last');
  assert.equal(u.w.carriers.traps.length, 0);
});

test('殉爆：springTraps 依次引爆附近已布好的陷阱（深度 +1，链式往外传，还在布设的不受影响），eachTrap 在陷阱之间拉线', () => {
  const pack = {
    skills: [trapSkill()],
    affixes: [
      { id: 'chain', rules: [{ on: 'trapTrigger', at: 'event', chain: true, do: [{ do: 'springTraps', at: 'event', radius: 250 }] }] },
      { id: 'web', rules: [{ on: 'trapTrigger', at: 'event', do: [{ do: 'eachTrap', at: 'event', radius: 500, onEach: [{ do: 'area', shape: 'line', at: 'origin', radius: { var: 'dist' }, width: 40 }] }] }] },
    ],
  };
  const t = setup(pack, { heroAffixes: ['chain'], monsters: [[200, 900], [1200, 600]] });
  const sk = t.w.addSkill(t.hero, 'mine', { manual: true });
  for (const x of [200, 400, 600, 800]) { t.w.cast(t.hero, sk, { aim: { x, y: 0 } }); t.run(0.02); }
  t.run(1); t.mobs[0].y = 0; t.run(1.5);
  const trig = t.log.filter(e => e.type === 'trapTrigger');
  assert.equal(trig.length, 4, '踩中一颗，四颗依次响');
  assert.equal(trig[0].depth, 0); assert.ok(trig.slice(1).every(e => e.depth > 0), '被引爆的算连锁');
  assert.ok(trig[1].x < trig[2].x && trig[2].x < trig[3].x, '由近及远传出去');

  const v = setup(pack, { heroAffixes: ['chain'], monsters: [[200, 0]] });
  const sk3 = v.w.addSkill(v.hero, 'mine', { manual: true });
  v.w.cast(v.hero, sk3, { aim: { x: 200, y: 0 } }); v.run(0.45);
  v.w.cast(v.hero, sk3, { aim: { x: 350, y: 0 } }); v.run(0.1);
  assert.equal(v.log.filter(e => e.type === 'trapTrigger').length, 1, '第二颗还没布好：不被引爆');
  assert.equal(v.w.carriers.traps.length, 1);

  const u = setup(pack, { heroAffixes: ['web'], monsters: [[200, 0], [400, 4], [400, 200]] });
  const sk2 = u.w.addSkill(u.hero, 'mine', { manual: true });
  u.w.cast(u.hero, sk2, { aim: { x: 600, y: 0 } }); u.run(0.02);
  u.w.cast(u.hero, sk2, { aim: { x: 200, y: 0 } }); u.run(1);
  const hits = new Set(u.log.filter(e => e.type === 'hit').map(e => e.target));
  assert.ok(hits.has(u.mobs[1]), '两颗陷阱之间的怪被电线打到');
  assert.ok(!hits.has(u.mobs[2]), '线外的没有');
});

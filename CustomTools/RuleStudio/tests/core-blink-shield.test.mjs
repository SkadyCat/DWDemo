// 闪现与炸盾的底层积木：落地事件（blinkLand）、路径直线、起点、能量护盾当燃料、破盾 / 满盾事件、召唤物模板键。
import test from 'node:test';
import assert from 'node:assert/strict';
import { compileContent, createWorld, BASE } from '../core/index.mjs';
import { hit } from '../core/damage.mjs';

function setup(pack, { heroMods = [], heroAffixes = [], heroSkills = [], monsters = [] } = {}) {
  const content = compileContent(BASE, pack);
  const w = createWorld(content, { seed: 5 });
  const hero = w.spawnActor({ kind: 'hero', team: 0, brain: 'none', mods: [{ stat: 'life', value: 5000 }, { stat: 'mana', value: 1000 }, ...heroMods], affixes: heroAffixes, skills: heroSkills });
  const mobs = monsters.map(([x, y, life = 1e6]) => w.spawnActor({ team: 1, brain: 'none', x, y, mods: [{ stat: 'life', value: life }] }));
  const log = []; w.listeners.push(e => log.push(e));
  const run = s => { for (let i = 0; i < Math.round(s * 60); ++i) w.step(1 / 60); };
  return { w, hero, mobs, log, run };
}

test('闪现：飞向一点不超出射程；落地后发 blinkLand（含起点和距离），路径上的直线区域只打路线上的敌人', () => {
  const pack = {
    skills: [
      { id: 'dash', tags: ['spell', 'movement'], time: 0.3, range: 400, actions: [{ do: 'blink', to: 'aim', range: 400 }] },
      { id: 'trail', tags: ['spell', 'area', 'triggered_only'], time: 0.3, damage: { cold: 10 }, actions: [{ do: 'area', shape: 'line', at: 'eventFrom', radius: { event: 'amount' }, width: 80 }] },
    ],
    affixes: [{ id: 'trail_on_land', rules: [{ on: 'blinkLand', at: 'self', do: [{ do: 'cast', skill: 'trail', at: 'self' }] }] }],
  };
  const t = setup(pack, { heroAffixes: ['trail_on_land'], monsters: [[200, 0], [350, 10], [200, 300]] });
  const sk = t.w.addSkill(t.hero, 'dash', { manual: true });
  t.w.cast(t.hero, sk, { aim: { x: 1000, y: 0 } });
  t.run(0.2);
  assert.ok(Math.abs(t.hero.x - 400) < 1e-6 && Math.abs(t.hero.y) < 1e-6, `落点 ${t.hero.x},${t.hero.y}`);
  const land = t.log.find(e => e.type === 'blinkLand');
  assert.ok(land && land.fromX === 0 && Math.abs(land.amount - 400) < 1e-6);
  const hit = new Set(t.log.filter(e => e.type === 'hit').map(e => e.target));
  assert.ok(hit.has(t.mobs[0]) && hit.has(t.mobs[1]) && !hit.has(t.mobs[2]), '路线上的两只被打到，路线外的没有');
});

test('炸盾：spendPool 按当前护盾的百分比消耗、把消耗量交给伤害，且不打断充能', () => {
  const pack = { skills: [{ id: 'burst', tags: ['spell', 'area'], time: 0.3, range: 500, actions: [{ do: 'spendPool', pool: 'es', pct: 50, as: 'n' }, { do: 'area', at: 'self', radius: 300, damage: { physical: { var: 'n', mul: 1 } } }] }] };
  const t = setup(pack, { heroMods: [{ stat: 'es', value: 400 }, { stat: 'es.rechargeRate', value: 50 }], monsters: [[100, 0]] });
  t.run(0.1);
  const sk = t.w.addSkill(t.hero, 'burst', { manual: true });
  t.w.cast(t.hero, sk, { target: t.mobs[0] }); t.run(0.05);
  const spent = t.log.find(e => e.type === 'poolSpent'), hit = t.log.find(e => e.type === 'hit');
  assert.ok(Math.abs(spent.amount - 200) < 1, `消耗 ${spent.amount}`);
  assert.ok(Math.abs(hit.amount - 200) < 5, `伤害来自消耗量 ${hit.amount}`);
  t.run(0.5);
  assert.ok(t.hero.es > 230, `消耗后立即开始充能：${t.hero.es.toFixed(0)}`);
});

test('破盾 / 满盾：护盾被打空时发一次 shieldBreak，充满时发 shieldFull（只在有规则监听时）', () => {
  const pack = { affixes: [{ id: 'listen', rules: [{ id: 'on_full', on: 'shieldFull', at: 'self', do: [{ do: 'gain', res: 'rage', amount: 1 }] }] }] };
  const t = setup(pack, { heroAffixes: ['listen'], heroMods: [{ stat: 'es', value: 100 }, { stat: 'es.rechargeRate', value: 100 }], monsters: [[100, 0]] });
  t.run(0.1);
  t.log.length = 0;
  const smack = () => { hit(t.w, { source: t.mobs[0], target: t.hero, base: { physical: 60 }, tags: new Set(['hit']) }); t.run(0.02); };
  smack();
  assert.equal(t.log.filter(e => e.type === 'shieldBreak').length, 0, '还剩 40 点护盾');
  smack(); smack();
  const breaks = t.log.filter(e => e.type === 'shieldBreak');
  assert.equal(breaks.length, 1, '打空那一下发一次，之后打在生命上不再发');
  assert.equal(breaks[0].source, t.hero); assert.equal(breaks[0].target, t.mobs[0]);
  t.run(4);
  assert.ok(t.log.some(e => e.type === 'shieldFull'), '充能延迟过后充满');
  assert.ok(t.log.some(e => e.type === 'trigger' && e.key === 'on_full'), '满盾规则触发');
});

test('召唤物死亡事件带模板键：残影到时消散 / 被打死都能按 key 过滤', () => {
  const pack = {
    minions: [{ id: 'decoy', life: 10, radius: 20, brain: 'none', skills: [], duration: 0.5 }],
    skills: [{ id: 'drop_decoy', tags: ['spell', 'minion'], time: 0.3, range: 300, actions: [{ do: 'summon', minion: 'decoy', at: 'self', count: 1, limit: 5 }] }],
    affixes: [{ id: 'pop', mods: [{ stat: 'summon.count', value: 1, tags: ['minion'] }], rules: [{ id: 'on_decoy', on: 'death', role: 'minion', filter: { key: 'decoy' }, at: 'event', chain: true, do: [{ do: 'gain', res: 'rage', amount: 1 }] }] }],
  };
  const t = setup(pack, { heroAffixes: ['pop'] });
  const sk = t.w.addSkill(t.hero, 'drop_decoy', { manual: true });
  t.w.cast(t.hero, sk, {}); t.run(0.1);
  assert.equal([...t.hero.minions].filter(m => m.alive).length, 2, 'summon.count 多召唤一个');
  t.run(1);
  const deaths = t.log.filter(e => e.type === 'death' && e.key === 'decoy');
  assert.equal(deaths.length, 2); assert.ok(deaths.every(e => e.expired));
  assert.equal(t.log.filter(e => e.type === 'trigger' && e.key === 'on_decoy').length, 2, '按模板键过滤的规则各触发一次');
});

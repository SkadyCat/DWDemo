// 验收流派：设计文档里 16 个流放/火炬流派，每个只用数据（技能 + 词条）拼出来，在新引擎里跑通机制链。
// 这里不比数值，只验证「机制链成立」：该触发的触发、该缩放的缩放、该截断的截断。
import test from 'node:test';
import assert from 'node:assert/strict';
import { compileContent, createWorld, BASE } from '../core/index.mjs';

function setup(pack, { seed = 7, heroMods = [], heroAffixes = [], heroSkills = [], brain = 'turret', monsters = 0, monsterLife = 100, spread = 60, at = 250, monsterMods = [] } = {}) {
  const content = compileContent(BASE, pack);
  const w = createWorld(content, { seed });
  const hero = w.spawnActor({ kind: 'hero', team: 0, brain, mods: [{ stat: 'life', value: 5000 }, { stat: 'mana', value: 1000 }, { stat: 'mana.regen', value: 200 }, ...heroMods], affixes: heroAffixes, skills: heroSkills });
  const mobs = [];
  for (let i = 0; i < monsters; ++i) {
    const a = (i / Math.max(1, monsters)) * Math.PI * 2, r = spread * Math.sqrt((i % 7 + 1) / 7);
    mobs.push(w.spawnActor({ team: 1, brain: 'none', x: at + Math.cos(a) * r, y: Math.sin(a) * r, mods: [{ stat: 'life', value: monsterLife }, ...monsterMods] }));
  }
  const log = []; w.listeners.push(e => log.push(e));
  const run = (seconds) => { for (let i = 0; i < Math.round(seconds * 60); ++i) w.step(1 / 60); };
  const count = (type, pred = () => true) => log.filter(e => e.type === type && pred(e)).length;
  return { w, hero, mobs, log, run, count, content };
}
const tagged = t => e => e.tags?.includes(t);

test('冰电捷：攻击→落雷冰冻→击碎爆炸感电→击杀感电再充落雷，循环自转且两条传令不会自我递归', () => {
  const pack = {
    statuses: [{ id: 'thunder_ready', stacking: 'stack', max: 3, duration: 8 }],
    skills: [{ id: 'mace_strike', tags: ['attack', 'melee', 'strike'], time: 0.5, damage: { physical: 25 }, range: 400, actions: [{ do: 'strike', range: 400 }] }],
    affixes: [
      { id: 'herald_ice', rules: [{ on: 'shatter', role: 'owned', chain: true, filter: { notTags: ['herald_ice'] }, at: 'target',
        do: [{ do: 'area', at: 'target', radius: 130, damage: { lightning: { pool: 'life', of: 'target', mul: 0.6 } }, tags: ['herald_ice', 'lightning'], fx: 'ice_burst' }] }] },
      { id: 'herald_thunder', rules: [
        { on: 'kill', role: 'owned', chain: true, filter: { notTags: ['herald_thunder'], cond: { status: 'shocked', of: 'target' } }, at: 'self', do: [{ do: 'status', on: 'self', status: 'thunder_ready', stacks: 3 }] },
        { on: 'hit', filter: { tags: ['attack'], notTags: ['herald_ice', 'herald_thunder'], cond: { status: 'thunder_ready' } },
          do: [{ do: 'removeStatus', on: 'self', status: 'thunder_ready', stacks: 1 }, { do: 'area', at: 'target', radius: 120, damage: { cold: 60 }, tags: ['herald_thunder', 'cold'] }] },
      ] },
    ],
  };
  const t = setup(pack, { heroSkills: ['mace_strike'], heroAffixes: ['herald_ice', 'herald_thunder'], heroMods: [{ stat: 'chance.freeze', value: 100 }, { stat: 'chance.shock', value: 100 }], monsters: 40, spread: 260, monsterLife: 140 });
  t.w.applyStatus(t.hero, 'thunder_ready', { stacks: 3, duration: 8 });
  t.run(12);
  const shatters = t.count('shatter'), iceBursts = t.count('area', tagged('herald_ice')), bolts = t.count('area', tagged('herald_thunder'));
  assert.ok(bolts >= 3, `落雷 ${bolts}`);
  assert.ok(shatters >= 3 && iceBursts >= 3, `击碎 ${shatters} / 冰爆 ${iceBursts}`);
  assert.ok(t.count('statusApplied', e => e.key === 'thunder_ready' && e.depth > 0) >= 1, '冰爆击杀感电敌人后重新充能落雷');
  assert.equal(t.count('area', e => e.tags.includes('herald_ice') && e.depth > t.w.maxDepth), 0);
  assert.equal(t.w.stats.dropped, 0, '不依赖预算截断就能收敛');
});

const fallingThunder = {
  skills: [{ id: 'falling_thunder', tags: ['attack', 'melee', 'slam', 'lightning'], time: 0.6, damage: { physical: 20, lightning: 20 }, range: 300,
    actions: [
      { do: 'consume', res: 'power', as: 'n' },
      { do: 'more', value: { var: 'n', mul: 50 } },
      { do: 'area', shape: 'cone', angle: 90, radius: 250, fx: 'slam' },
      { do: 'if', cond: { var: 'n', gt: 0 }, then: [{ do: 'projectile', count: { var: 'n', mul: 3 }, spread: 40, speed: 2000, pierce: 99, tags: ['projectile'], kind: 'bolt' }] },
    ] }],
};

test('崩雷鸣：一锤消耗全部能量球，每球 +50% 更多伤害、+3 发穿透闪电；0 球不发射', () => {
  const t = setup(fallingThunder, { heroSkills: [], monsters: 1, monsterLife: 1e7, at: 200, spread: 0 });
  const sk = t.w.addSkill(t.hero, 'falling_thunder', { manual: true });
  const cast = () => { const before = t.log.length; t.w.cast(t.hero, sk, { target: t.mobs[0] }); t.run(0.5); return t.log.slice(before); };
  const zero = cast();
  assert.equal(zero.filter(e => e.type === 'projectileSpawn').length, 0);
  const slam0 = zero.find(e => e.type === 'hit' && !e.tags.includes('projectile')).amount;
  t.w.gain(t.hero, 'power', 3);
  sk.readyAt = 0;
  const three = cast();
  assert.equal(three.filter(e => e.type === 'projectileSpawn').length, 9);
  assert.equal(t.hero.resource('power'), 0);
  const slam3 = three.find(e => e.type === 'hit' && !e.tags.includes('projectile')).amount;
  assert.ok(Math.abs(slam3 / slam0 - 2.5) < 1e-6, `${slam3 / slam0}`);
  assert.ok(three.filter(e => e.type === 'hit' && e.tags.includes('projectile')).length >= 1, '闪电命中');
});

test('无限球崩雷鸣：①100% 几率不移除充能，仍按消耗数结算；②触发引擎补球快于消耗', () => {
  const keep = setup({ ...fallingThunder, affixes: [{ id: 'endless', mods: [{ stat: 'consumeKeep', value: 100, tags: ['power'] }] }] }, { heroAffixes: ['endless'], monsters: 1, monsterLife: 1e7, spread: 0, at: 200 });
  const sk = keep.w.addSkill(keep.hero, 'falling_thunder');
  keep.w.gain(keep.hero, 'power', 3);
  keep.run(5);
  assert.equal(keep.hero.resource('power'), 3);
  const casts = keep.count('cast');
  assert.ok(casts >= 6);
  assert.equal(keep.count('projectileSpawn'), casts * 9, '每一锤都按 3 球结算');
  // ②: every lightning hit has a chance to grant a power charge — refills faster than one slam spends.
  const engine = setup({ ...fallingThunder, affixes: [{ id: 'charge_engine', rules: [{ on: 'hit', filter: { tags: ['lightning'] }, accumulate: { kind: 'chance', pct: 50 }, chain: true, at: 'self', do: [{ do: 'gain', res: 'power', amount: 1 }] }] }] },
    { heroAffixes: ['charge_engine'], monsters: 6, monsterLife: 1e7, spread: 30, at: 200 });
  engine.w.addSkill(engine.hero, 'falling_thunder');
  engine.run(6);
  const spawnsPerCast = engine.log.filter(e => e.type === 'cast').length;
  assert.ok(engine.count('projectileSpawn') >= (spawnsPerCast - 2) * 9 * 0.8, `${engine.count('projectileSpawn')} / ${spawnsPerCast}`);
});

const spells = {
  skills: [
    { id: 'ice_nova', tags: ['spell', 'area', 'cold', 'nova'], time: 0.7, cost: 10, crit: 10, damage: { cold: 30 }, actions: [{ do: 'area', at: 'self', radius: 220 }] },
    { id: 'arc', tags: ['spell', 'lightning', 'chaining'], time: 0.6, cost: 8, crit: 10, damage: { lightning: 20 }, actions: [{ do: 'projectile', speed: 4000, chain: 4 }] },
    { id: 'fast_strike', tags: ['attack', 'melee', 'strike'], time: 0.1, crit: 50, damage: { physical: 10 }, range: 300, actions: [{ do: 'strike', range: 300 }] },
  ],
};

test('Cast on Critical（流放 2）：暴击按伤害占比积累能量，满 100% 一次施放全部挂载法术', () => {
  const pack = { ...spells, affixes: [{ id: 'coc2', grants: { skills: [{ skill: 'ice_nova', groups: ['coc'] }, { skill: 'arc', groups: ['coc'] }] },
    rules: [{ on: 'crit', filter: { tags: ['attack'] }, accumulate: { kind: 'meter', amount: { div: [{ event: 'amount' }, { pool: 'life', of: 'target' }], mul: 100 }, threshold: 100 }, do: [{ do: 'castGroup', group: 'coc' }] }] }] };
  const t = setup(pack, { heroSkills: ['fast_strike'], heroAffixes: ['coc2'], monsters: 3, monsterLife: 100, monsterMods: [{ stat: 'life.regen', value: 1e5 }], spread: 20, at: 200 });
  t.run(4);
  const critPct = t.log.filter(e => e.type === 'crit' && !e.tags.includes('triggered')).reduce((s, e) => s + e.amount / e.target.max.life * 100, 0);
  const novas = t.count('cast', e => e.skill.def.id === 'ice_nova'), arcs = t.count('cast', e => e.skill.def.id === 'arc');
  assert.ok(novas >= 2, `nova ${novas}`);
  assert.equal(novas, arcs, '一次触发两个挂载法术');
  assert.equal(novas, Math.floor(critPct / 100 + 1e-9));
});

test('Cast on Shock：施加感电积累，满了触发', () => {
  const pack = { ...spells, affixes: [{ id: 'cos', grants: { skills: [{ skill: 'ice_nova', groups: ['cos'] }] },
    rules: [{ on: 'ailment', filter: { key: 'shock' }, accumulate: { kind: 'count', n: 3 }, do: [{ do: 'castGroup', group: 'cos' }] }] }] };
  const t = setup(pack, { heroSkills: ['arc'], heroAffixes: ['cos'], heroMods: [{ stat: 'chance.shock', value: 100 }], monsters: 5, monsterLife: 1e6 });
  t.run(3);
  const shocks = t.count('ailment', e => e.key === 'shock' && e.depth === 0);
  assert.equal(t.count('cast', e => e.skill.def.id === 'ice_nova'), Math.floor(shocks / 3));
});

test('CoC 冰新星（流放 1）：攻击暴击触发法术，触发冷却 0.15 秒，在被击中目标处施放', () => {
  const pack = { ...spells, affixes: [{ id: 'coc', rules: [{ on: 'crit', filter: { tags: ['attack'] }, limit: { cooldown: 0.15 }, do: [{ do: 'cast', skill: 'ice_nova', at: 'target' }] }] }] };
  const t = setup(pack, { heroSkills: ['fast_strike'], heroAffixes: ['coc'], heroMods: [{ stat: 'speed', op: 'inc', value: 200, tags: ['attack'] }], monsters: 3, monsterLife: 1e6, spread: 20, at: 200 });
  t.run(3);
  const novas = t.log.filter(e => e.type === 'cast' && e.skill.def.id === 'ice_nova');
  assert.ok(novas.length >= 10 && novas.length <= 3 / 0.15 + 1, `${novas.length}`);
  for (let i = 1; i < novas.length; ++i) assert.ok(novas[i].time - novas[i - 1].time >= 0.15 - 1e-9);
  assert.ok(novas.every(e => e.tags.includes('triggered')));
  assert.ok(novas.every(e => Math.abs(e.x - 200) < 40), '在目标处施放');
});

test('CWC 旋风：引导期间每 0.35 秒触发法术，停止引导就停', () => {
  const pack = { ...spells,
    skills: [...spells.skills, { id: 'cyclone', tags: ['attack', 'melee', 'area', 'channel'], channel: 0.2, damage: { physical: 5 }, range: 400, actions: [{ do: 'area', at: 'self', radius: 200 }] }],
    affixes: [{ id: 'cwc', grants: { skills: [{ skill: 'ice_nova', groups: ['cwc'] }] }, rules: [{ on: 'channel', limit: { cooldown: 0.35 }, do: [{ do: 'castGroup', group: 'cwc' }] }] }] };
  const t = setup(pack, { heroAffixes: ['cwc'], monsters: 3, monsterLife: 1e6, at: 100, spread: 20 });
  const cy = t.w.addSkill(t.hero, 'cyclone', { manual: true });
  t.w.cast(t.hero, cy, {});
  t.run(3.5);
  const during = t.count('cast', e => e.skill.def.id === 'ice_nova');
  assert.ok(during >= 9 && during <= 11, `${during}`);
  assert.ok(t.count('channel') >= 15);
  t.w.stopChannel(t.hero);
  t.run(2);
  assert.equal(t.count('cast', e => e.skill.def.id === 'ice_nova'), during);
});

test('法术投掷：预留魔力，非触发的投射物攻击触发全部挂载法术', () => {
  const pack = { ...spells,
    statuses: [{ id: 'spellslinger', duration: 1e9 }],
    skills: [...spells.skills,
      { id: 'wand_shot', tags: ['attack', 'projectile'], time: 0.3, damage: { physical: 5 }, actions: [{ do: 'projectile', speed: 2000 }] },
      { id: 'spellslinger', tags: ['buff', 'persistent'], reserve: 15, status: 'spellslinger', actions: [] }],
    affixes: [{ id: 'slinger', grants: { skills: [{ skill: 'arc', groups: ['sling'] }, { skill: 'ice_nova', groups: ['sling'] }] },
      rules: [{ on: 'cast', filter: { tags: ['attack', 'projectile'], notTags: ['triggered'], cond: { status: 'spellslinger' } }, limit: { cooldown: 0.5 }, do: [{ do: 'castGroup', group: 'sling' }] }] }] };
  const t = setup(pack, { heroSkills: ['wand_shot', 'spellslinger'], heroAffixes: ['slinger'], monsters: 4, monsterLife: 1e6 });
  t.run(3);
  assert.ok(Math.abs(t.hero.reserved - 15) < 1e-9);
  assert.ok(t.hero.mana <= t.hero.max.mana * 0.85 + 1e-6);
  const arcs = t.count('cast', e => e.skill.def.id === 'arc');
  assert.ok(arcs >= 5 && arcs <= 7, `${arcs}`);
  assert.equal(arcs, t.count('cast', e => e.skill.def.id === 'ice_nova'));
});

test('Winter Orb：引导叠层、层数提高发射频率；冷 DoT 只吃持续伤害加成', () => {
  const pack = {
    stats: [{ key: 'stage.max', base: 10, min: 0 }], resources: [{ id: 'stage', maxStat: 'stage.max' }],
    statuses: [{ id: 'frostbite', stacking: 'strongest', duration: 2, tags: ['dot', 'cold'], dot: { type: 'cold' } }],
    skills: [
      { id: 'winter_orb', tags: ['spell', 'channel', 'cold'], channel: 0.25, actions: [{ do: 'gain', res: 'stage', amount: 1 }] },
      { id: 'orb_shard', tags: ['spell', 'projectile', 'cold'], damage: { cold: 10 }, actions: [{ do: 'projectile', speed: 1500, onHit: [{ do: 'status', status: 'frostbite', dps: 40 }] }] }],
    affixes: [{ id: 'orb', rules: [
      { on: 'tick', accumulate: { kind: 'periodic', interval: { div: [0.8, { res: 'stage', mul: 0.5, add: 1 }] } }, at: 'nearest', do: [{ do: 'if', cond: { res: 'stage', gt: 0 }, then: [{ do: 'cast', skill: 'orb_shard' }] }] },
      { on: 'channelEnd', at: 'self', do: [{ do: 'consume', res: 'stage', amount: 'all' }] }] }],
  };
  const t = setup(pack, { heroAffixes: ['orb'], monsters: 2, monsterLife: 1e6, heroMods: [{ stat: 'damage', op: 'inc', value: 1000 }, { stat: 'dotDamage', op: 'inc', value: 100 }] });
  const orb = t.w.addSkill(t.hero, 'winter_orb', { manual: true });
  t.w.cast(t.hero, orb, {});
  t.run(1); const early = t.count('cast', e => e.skill.def.id === 'orb_shard');
  t.run(3); const mid = t.count('cast', e => e.skill.def.id === 'orb_shard') - early;
  t.run(1); const late = t.count('cast', e => e.skill.def.id === 'orb_shard') - early - mid;
  assert.equal(t.hero.resource('stage'), 10);
  assert.ok(late * 3 > mid * 0.9 && late > early, `${early} ${mid} ${late}`);
  const tick = t.log.find(e => e.type === 'dotTick' && e.key === 'frostbite');
  assert.ok(tick && Math.abs(tick.amount - 40 * 2 * 0.5) < 2, `DoT 只被 dotDamage 放大：${tick?.amount}`);
  t.w.stopChannel(t.hero); t.run(0.1);
  assert.equal(t.hero.resource('stage'), 0);
});

test('毒叠层：每层独立实例、独立计时、按施加者快照；地面毒囊持续施毒', () => {
  const pack = { skills: [
    { id: 'toxic_rain', tags: ['attack', 'projectile', 'chaos'], time: 0.2, crit: 0, damage: { physical: 10, chaos: 10 }, actions: [
      { do: 'projectile', speed: 3000, onHit: [{ do: 'zone', kind: 'pod', at: 'target', radius: 80, duration: 2, interval: 0.5, damage: { chaos: 2 } }] }] }] };
  const t = setup(pack, { heroSkills: ['toxic_rain'], heroMods: [{ stat: 'chance.poison', value: 100 }], monsters: 1, monsterLife: 1e7, spread: 0 });
  t.run(4);
  const target = t.mobs[0];
  const stacks = target.statusStacks('poisoned');
  assert.ok(stacks >= 25, `stacks ${stacks}`);
  const times = new Set(target.statuses.filter(s => s.def.id === 'poisoned').map(s => s.remaining.toFixed(3)));
  assert.ok(times.size > 5, '各层剩余时间不同');
  const dps = target.statuses.filter(s => s.def.id === 'poisoned').reduce((s, x) => s + x.dps, 0);
  assert.ok(target.statuses.filter(s => s.def.id === 'poisoned').every(s => Math.abs(s.dps - 4) < 1e-9 || Math.abs(s.dps - 0.4) < 1e-9), '每层按施加时的命中快照（飞箭 4/s、毒囊 0.4/s）');
  assert.ok(target.statuses.filter(s => s.def.id === 'poisoned' && s.dps === 4).length >= 8 && dps > 40, `${dps}`);
  assert.ok(t.count('zoneSpawn') >= 15);
});

test('点燃扩散：只保留最强实例，击杀时把点燃传给附近敌人', () => {
  const pack = {
    skills: [{ id: 'fire_bolt', tags: ['spell', 'projectile', 'fire'], time: 0.5, damage: { fire: 30 }, actions: [{ do: 'projectile', speed: 2000 }] }],
    affixes: [{ id: 'proliferate', rules: [{ on: 'kill', filter: { cond: { status: 'ignited', of: 'target' } }, do: [{ do: 'spread', status: 'ignited', radius: 300 }] }] }],
  };
  const t = setup(pack, { heroAffixes: ['proliferate'], heroMods: [{ stat: 'chance.ignite', value: 100 }], monsters: 0 });
  const first = t.w.spawnActor({ team: 1, brain: 'none', x: 200, mods: [{ stat: 'life', value: 60 }] });
  const others = [0, 1, 2].map(i => t.w.spawnActor({ team: 1, brain: 'none', x: 400, y: (i - 1) * 60, mods: [{ stat: 'life', value: 1e6 }] }));
  t.w.applyStatus(first, 'ignited', { source: t.hero, dps: 10 }); t.w.applyStatus(first, 'ignited', { source: t.hero, dps: 25 });
  const fb = t.w.addSkill(t.hero, 'fire_bolt', { manual: true });
  t.w.cast(t.hero, fb, { target: first });
  t.run(2.5);
  assert.ok(!first.alive);
  for (const o of others) assert.ok(o.hasStatus('ignited'), '附近敌人被点燃');
  t.w.applyStatus(others[0], 'ignited', { source: t.hero, dps: 5 });
  const before = others[0].life; t.run(1);
  const lost = before - others[0].life;
  const strongest = Math.max(...others[0].statuses.filter(s => s.def.id === 'ignited').map(s => s.dps));
  assert.ok(Math.abs(lost - strongest) < 1, `只有最强一层生效 ${lost} vs ${strongest}`);
});

test('召唤：召唤物是独立单位，命中归自己，属性继承拥有者的召唤物修正，击杀记到拥有者链', () => {
  const pack = {
    skills: [
      { id: 'raise_skeletons', tags: ['spell', 'minion'], time: 0.5, actions: [{ do: 'summon', minion: 'skeleton', count: 3, limit: 6 }] },
      { id: 'bone_slash', tags: ['attack', 'melee'], time: 0.5, crit: 0, damage: { physical: 10 }, range: 120, actions: [{ do: 'strike', range: 120 }] }],
    minions: [{ id: 'skeleton', life: 50, skills: ['bone_slash'] }],
    affixes: [
      { id: 'minion_power', mods: [{ stat: 'damage', op: 'more', value: 100, scope: 'minion' }] },
      { id: 'feast', rules: [{ on: 'kill', role: 'minion', at: 'self', do: [{ do: 'gain', res: 'frenzy', amount: 1 }] }] }],
  };
  const t = setup(pack, { heroSkills: ['raise_skeletons'], heroAffixes: ['minion_power', 'feast'], monsters: 12, monsterLife: 60, at: 500, spread: 150 });
  t.run(10);
  const minions = [...t.hero.minions];
  assert.ok(minions.length >= 3 && minions.length <= 6, `${minions.length}`);
  const mh = t.log.filter(e => e.type === 'hit' && e.source.kind === 'minion');
  assert.ok(mh.length > 0 && mh.every(e => e.root === t.hero));
  assert.ok(mh.every(e => Math.abs(e.byType.physical - 20) < 1e-6), '召唤物伤害吃到拥有者的 100% 更多');
  assert.equal(t.count('hit', e => e.source === t.hero), 0, '英雄自己没有命中');
  assert.ok(t.hero.resource('frenzy') >= 1, '召唤物击杀给拥有者狂怒球');
});

test('图腾 / 地雷：图腾代理使用技能且有放置上限；地雷手动引爆，引爆由地雷自己结算', () => {
  const pack = {
    skills: [
      { id: 'place_totem', tags: ['spell', 'totem'], time: 0.3, actions: [{ do: 'summon', minion: 'ballista', at: 'aim', count: 1, limit: 2 }] },
      { id: 'ballista_shot', tags: ['attack', 'projectile'], time: 0.4, damage: { physical: 8 }, actions: [{ do: 'projectile', speed: 2000 }] },
      { id: 'throw_mine', tags: ['spell', 'mine'], time: 0.2, actions: [{ do: 'summon', minion: 'mine', at: 'aim', count: 1, limit: 5 }] },
      { id: 'detonate_mines', tags: ['spell'], time: 0.1, actions: [{ do: 'emit', event: 'detonate' }] }],
    minions: [
      { id: 'ballista', life: 200, brain: 'turret', skills: ['ballista_shot'] },
      { id: 'mine', life: 10, brain: 'none', affixes: ['mine_charge'] }],
    affixes: [{ id: 'mine_charge', rules: [{ on: 'detonate', role: 'owner', at: 'self', do: [{ do: 'area', at: 'self', radius: 150, damage: { fire: 30 } }, { do: 'die' }] }] }],
  };
  const t = setup(pack, { monsters: 5, monsterLife: 1e6, at: 400, spread: 40 });
  const totem = t.w.addSkill(t.hero, 'place_totem', { manual: true });
  for (let i = 0; i < 4; ++i) { totem.readyAt = 0; t.w.cast(t.hero, totem, { aim: { x: 100, y: i * 30 } }); }
  t.run(0.1);
  assert.equal([...t.hero.minions].filter(m => m.template === 'ballista' && m.alive).length, 2);
  t.run(2);
  const th = t.log.filter(e => e.type === 'hit' && e.source.template === 'ballista');
  assert.ok(th.length > 3 && th.every(e => e.root === t.hero));
  const mine = t.w.addSkill(t.hero, 'throw_mine', { manual: true }), det = t.w.addSkill(t.hero, 'detonate_mines', { manual: true });
  for (let i = 0; i < 3; ++i) { mine.readyAt = 0; t.w.cast(t.hero, mine, { aim: { x: 400, y: (i - 1) * 20 } }); }
  t.run(0.1);
  assert.equal(t.count('hit', e => e.source.template === 'mine'), 0, '未引爆不造成伤害');
  t.w.cast(t.hero, det, {});
  t.run(0.1);
  assert.equal(t.count('area', e => e.source.template === 'mine'), 3);
  assert.equal([...t.hero.minions].filter(m => m.template === 'mine').length, 0);
});

test('Penance Brand：附着在敌人身上跟随移动，能量逐跳积累，伤害越跳越高', () => {
  const pack = { skills: [{ id: 'penance_brand', tags: ['spell', 'brand', 'physical'], time: 0.5, damage: { physical: 10 }, actions: [
    { do: 'zone', kind: 'brand', follow: 'target', radius: 10, duration: 3.1, interval: 0.5, delayFirst: true, onPulse: [
      { do: 'set', var: 'energy', value: { var: 'energy', add: 1 } },
      { do: 'area', at: 'origin', radius: 150, mult: { var: 'energy', mul: 25, add: 75 } }] }] }] };
  const t = setup(pack, { monsters: 0 });
  const mob = t.w.spawnActor({ team: 1, brain: 'none', x: 300, mods: [{ stat: 'life', value: 1e6 }] });
  const sk = t.w.addSkill(t.hero, 'penance_brand', { manual: true });
  t.w.cast(t.hero, sk, { target: mob });
  t.run(1.1); mob.x = 900; mob.y = 200; t.run(2.2);
  const hits = t.log.filter(e => e.type === 'hit');
  assert.equal(hits.length, 6);
  for (let i = 1; i < hits.length; ++i) assert.ok(hits[i].amount > hits[i - 1].amount);
  assert.ok(Math.abs(hits[5].amount / hits[0].amount - 2.25) < 1e-6, '能量 1→6：100% → 225%');
  const areas = t.log.filter(e => e.type === 'area');
  assert.equal(areas.at(-1).x, 900, '烙印跟着敌人走');
});

test('Blade Fall + Blade Blast：地面留下刀刃，另一个技能引爆范围内全部刀刃', () => {
  const pack = { skills: [
    { id: 'blade_fall', tags: ['spell', 'area', 'physical'], time: 0.3, damage: { physical: 10 }, actions: [
      { do: 'area', at: 'aim', radius: 200 },
      { do: 'repeat', times: 4, actions: [{ do: 'zone', kind: 'blade', at: 'aim', radius: 30, duration: 8, interval: 99, hit: false }] }] },
    { id: 'blade_blast', tags: ['spell', 'area', 'physical'], time: 0.3, damage: { physical: 15 }, actions: [
      { do: 'detonate', kind: 'blade', at: 'aim', radius: 300, onEach: [{ do: 'area', at: 'origin', radius: 120 }] }] }] };
  const t = setup(pack, { monsters: 3, monsterLife: 1e6, at: 300, spread: 20 });
  const fall = t.w.addSkill(t.hero, 'blade_fall', { manual: true }), blast = t.w.addSkill(t.hero, 'blade_blast', { manual: true });
  t.w.cast(t.hero, fall, { aim: { x: 300, y: 0 } }); fall.readyAt = 0; t.w.cast(t.hero, fall, { aim: { x: 300, y: 0 } });
  t.w.cast(t.hero, fall, { aim: { x: 2000, y: 0 } });
  t.run(0.4);
  assert.equal(t.w.carriers.zones.filter(z => z.kind === 'blade').length, 12);
  t.w.cast(t.hero, blast, { aim: { x: 300, y: 0 } });
  t.run(0.1);
  assert.equal(t.count('area', e => e.skill?.def.id === 'blade_blast'), 8, '只引爆范围内的 8 把');
  assert.equal(t.w.carriers.zones.filter(z => z.kind === 'blade').length, 4);
});

test('多重打击（火炬）：每 100% 重复一次、余数按几率，重复逐次增伤；法术迸发：积攒次数，下一个法术一次释放', () => {
  const pack = {
    skills: [{ id: 'chop', tags: ['attack', 'melee'], time: 0.5, crit: 0, damage: { physical: 100 }, range: 300, actions: [{ do: 'strike', range: 300 }],
      mods: [{ stat: 'damage', op: 'more', value: 20, per: { var: 'repeat' } }] }],
    affixes: [{ id: 'multistrike', mods: [{ stat: 'repeat', value: 1.5, tags: ['melee'] }] }],
  };
  const t = setup(pack, { heroSkills: ['chop'], heroAffixes: ['multistrike'], monsters: 1, monsterLife: 1e9, spread: 0, at: 150 });
  t.run(20);
  const casts = t.count('cast'), hits = t.log.filter(e => e.type === 'hit');
  const ratio = hits.length / casts;
  assert.ok(ratio > 2.3 && ratio < 2.7, `平均 ${ratio} 次`);
  const amounts = [...new Set(hits.map(e => Math.round(e.amount)))].sort((a, b) => a - b);
  assert.deepEqual(amounts, [100, 120, 140]);

  const burst = setup({
    ...spells, stats: [{ key: 'burst.max', base: 4, min: 0 }], resources: [{ id: 'burst', maxStat: 'burst.max' }],
    affixes: [{ id: 'spell_burst', rules: [
      { on: 'tick', accumulate: { kind: 'periodic', interval: 0.5 }, at: 'self', do: [{ do: 'gain', res: 'burst', amount: 1 }] },
      { on: 'cast', filter: { tags: ['spell'], notTags: ['triggered'] }, at: 'self', do: [{ do: 'consume', res: 'burst', as: 'n' }, { do: 'repeat', times: { var: 'n' }, interval: 0.1, actions: [{ do: 'cast', skill: '$event', at: 'self' }] }] }] }],
  }, { heroAffixes: ['spell_burst'], monsters: 1, monsterLife: 1e9, spread: 0, at: 100 });
  const nova = burst.w.addSkill(burst.hero, 'ice_nova', { manual: true });
  burst.run(3);
  assert.equal(burst.hero.resource('burst'), 4);
  burst.w.cast(burst.hero, nova, {});
  burst.run(1);
  assert.equal(burst.count('cast', e => e.skill === nova), 5, '1 次手动 + 4 次迸发');
  assert.equal(burst.hero.resource('burst'), 2);
});

test('自走（火炬激活媒介）：暴击发出指令，接收方每 0.6 秒对最近敌人施放，按收到的指令叠伤；手动使用 -80%', () => {
  const pack = {
    ...spells, stats: [{ key: 'instruction.max', base: 9, min: 0 }], resources: [{ id: 'instruction', maxStat: 'instruction.max' }],
    skills: [...spells.skills, { id: 'thunder_spike', tags: ['spell', 'lightning'], time: 0.4, damage: { lightning: 100 }, range: 2000,
      mods: [{ stat: 'damage', op: 'more', value: -80, notTags: ['triggered'] }],
      actions: [{ do: 'more', value: { var: 'n', mul: 6 } }, { do: 'damage' }] }],
    affixes: [
      { id: 'medium_crit', rules: [{ on: 'crit', filter: { notTags: ['triggered'] }, at: 'self', do: [{ do: 'gain', res: 'instruction', amount: 2 }] }] },
      { id: 'medium_receiver', grants: { skills: [{ skill: 'thunder_spike', groups: ['medium'] }] },
        rules: [{ on: 'tick', accumulate: { kind: 'periodic', interval: 0.6 }, at: 'nearest', range: 2000, do: [{ do: 'consume', res: 'instruction', as: 'n' }, { do: 'cast', skill: 'thunder_spike', passVars: true }] }] }],
  };
  const t = setup(pack, { heroSkills: ['fast_strike'], heroAffixes: ['medium_crit', 'medium_receiver'], monsters: 1, monsterLife: 1e9, spread: 0, at: 200 });
  t.run(6);
  const auto = t.log.filter(e => e.type === 'hit' && e.skill?.def.id === 'thunder_spike');
  assert.ok(auto.length >= 9 && auto.length <= 10, `${auto.length}`);
  assert.ok(auto.some(e => e.amount > 100 * 1.3), '收到指令的周期伤害更高');
  const spike = t.hero.skills.find(s => s.def.id === 'thunder_spike');
  spike.readyAt = 0;
  const before = t.log.length;
  t.w.cast(t.hero, spike, { target: t.mobs[0] }); t.w.flush();
  const manual = t.log.slice(before).find(e => e.type === 'hit');
  assert.ok(Math.abs(manual.amount - 20) < 1e-6, `手动 ${manual.amount}`);
});

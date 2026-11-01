// 配装分析：本图要求是否达标、每条词条是否在发挥作用（冗余率）。
// 输出给「本图要求」面板和流派测试：玩家卡关时一眼看出该补哪一类，毕业配装应有约九成词条在起作用。
import { createWorld } from './index.mjs';
import { mapProfile, mapRequirements } from './content/maps.mjs';
import { HERO_BASE } from './sim.mjs';
import { RESISTS, ELEMENTS } from './registry.mjs';
import { armourReduction } from './damage.mjs';

function heroIn(content, build, profile, seed = 1) {
  const world = createWorld(content, { seed });
  const hero = world.spawnActor({
    kind: 'hero', team: 0, brain: 'turret', radius: 30,
    mods: [...HERO_BASE, ...(build.mods ?? []), ...RESISTS.map(e => ({ stat: `res.${e}`, value: -profile.resistPenalty }))],
    affixes: build.affixes ?? [], skills: build.skills ?? [],
  });
  return { world, hero };
}

/** Defensive summary against a map: resists after penalty, pools, the biggest hit survivable, sustain. */
export function defenceReport(content, build, tier, family = 'ruin') {
  const profile = mapProfile(tier, family), req = mapRequirements(profile);
  const { world, hero } = heroIn(content, build, profile);
  const res = {};
  for (const e of RESISTS) res[e] = Math.min(world.stat(hero, `res.max.${e}`), world.stat(hero, `res.${e}`));
  const pool = hero.max.life + hero.max.es;
  const taken = world.scaled(hero, 'damageTaken', 100) / 100 * world.scaled(hero, 'damageTaken.hit', 100) / 100;
  // Mitigation of one boss slam of the map's main element mix.
  const slam = req.bigHit * 2;
  let after = 0;
  for (const [type, w] of Object.entries(profile.mix)) {
    const part = slam * w;
    if (type === 'physical') after += part * (1 - armourReduction(world.stat(hero, 'armour'), part));
    else after += part * (1 - Math.max(-200, res[type] ?? 0) / 100);
  }
  after *= taken;
  const regen = world.stat(hero, 'life.regen');
  // Expected share of a typical monster hit that lands, after evasion (attacks), block, armour and resists.
  const typical = profile.monsterDamage;
  const accuracy = profile.monsterAccuracy, evasion = world.stat(hero, 'evasion');
  const hitChance = evasion <= 0 ? 1 : Math.min(1, Math.max(0.05, 1.25 * accuracy / (accuracy + Math.pow(evasion * 0.2, 0.9))));
  const blockChance = Math.min(world.stat(hero, 'block.max'), world.stat(hero, 'block')) / 100;
  let mitig = 0;
  for (const [type, w] of Object.entries(profile.mix)) {
    const part = typical * w;
    mitig += type === 'physical' ? part * (1 - armourReduction(world.stat(hero, 'armour'), part)) : part * (1 - Math.max(-200, res[type] ?? 0) / 100);
  }
  const avgTaken = (mitig / typical) * taken * (0.7 * hitChance + 0.3) * (1 - blockChance); // ~70 % of monster damage are attacks
  return {
    tier, resists: res, resistOk: ELEMENTS.every(e => res[e] >= 75 - 1e-9), chaosRes: res.chaos,
    pool, bigHit: Math.round(after), bigHitRatio: after / pool, bigHitOk: after < pool,
    armour: world.stat(hero, 'armour'), evasion: world.stat(hero, 'evasion'), block: world.stat(hero, 'block'),
    regen, leech: world.stat(hero, 'leech.life'), onHit: world.stat(hero, 'life.onHit'), onKill: world.stat(hero, 'life.onKill'),
    avoidAilment: world.stat(hero, 'avoid.ailment'), avgTaken,
    freezeOk: !req.freezeImmune || world.stat(hero, 'avoid.ailment') >= 40,
  };
}

/**
 * Damage probe: the build fights a fixed pack of training dummies with the map's defences for a few
 * seconds; returns damage per second and kills. Deterministic for a seed.
 */
export function offenceProbe(content, build, tier, { seconds = 8, seed = 2, pack = 7, immortal = false } = {}) {
  const profile = mapProfile(tier);
  const { world, hero } = heroIn(content, build, profile, seed);
  hero.brain = 'chase'; hero.keepDistance = build.keepDistance ?? 0;
  let dealt = 0;
  world.listeners.push(e => { if ((e.type === 'hit' || e.type === 'dotTick') && e.target?.team === 1 && e.source?.root === hero) dealt += e.amount; });
  // Real map-tier monsters (elite life) so soft ailments, on-kill rules and overkill behave as in a map.
  // `immortal` keeps the same pack standing: no kill timing noise, pure damage throughput.
  let kills = 0;
  world.listeners.push(e => { if (e.type === 'kill' && e.target.team === 1) kills++; });
  const spawn = () => {
    let alive = 0;
    for (const a of world.actors.values()) if (a.team === 1 && a.alive) ++alive;
    for (let i = alive; i < pack; ++i) {
      const a = i / pack * Math.PI * 2 + world.roll('spawn') * 0.5, r = 60 + world.roll('spawn') * 120;
      world.spawnActor({ team: 1, brain: 'none', x: hero.x + 300 + Math.cos(a) * r, y: hero.y + Math.sin(a) * r, radius: 28,
        mods: [{ stat: 'life', value: profile.monsterLife * 3 }, ...(immortal ? [{ stat: 'immortal', op: 'flag' }, { stat: 'life.regen', value: profile.monsterLife * 3 }] : []),
          ...['fire', 'cold', 'lightning'].map(e => ({ stat: `res.${e}`, value: profile.monsterResist })), { stat: 'armour', value: profile.monsterArmour }, { stat: 'evasion', value: profile.monsterEvasion }] });
    }
  };
  for (let i = 0; i < seconds * 30; ++i) {
    spawn();
    world.step(1 / 30);
    hero.life = hero.max.life;
  }
  return { dps: dealt / seconds, kills };
}

/** Probe averaged over several seeds: a single run is too noisy to judge a 2 % change. */
export function offenceAverage(content, build, tier, { seconds = 5, seeds = [2, 3, 5, 7] } = {}) {
  // Throughput against a standing pack (stable), plus kills against a dying pack (on-kill mechanics).
  const dps = offenceProbe(content, build, tier, { seconds, seed: seeds[0], immortal: true }).dps;
  let kills = 0;
  for (const seed of seeds) kills += offenceProbe(content, build, tier, { seconds, seed }).kills;
  return { dps, kills: kills / seeds.length };
}

export function lineUsefulness(content, build, tier, { threshold = 0.02, seconds = 5, seeds } = {}) {
  const base = { off: offenceAverage(content, build, tier, { seconds, seeds }), def: defenceReport(content, build, tier) };
  const out = [];
  for (let i = 0; i < build.affixes.length; ++i) {
    const reduced = { ...build, affixes: build.affixes.filter((_, j) => j !== i) };
    const def = defenceReport(content, reduced, tier);
    const reasons = [];
    for (const e of RESISTS) if (def.resists[e] < base.def.resists[e] - 1e-9 && def.resists[e] < 75) reasons.push(`抗性 ${e}`);
    if (def.pool < base.def.pool * (1 - threshold)) reasons.push('生命池');
    if (def.bigHit > base.def.bigHit * (1 + threshold)) reasons.push('重击承受');
    if (def.avoidAilment < base.def.avoidAilment - 1e-9) reasons.push('异常规避');
    if (def.regen < base.def.regen * (1 - threshold) || def.leech < base.def.leech - 1e-9 || def.onHit < base.def.onHit - 1e-9 || def.onKill < base.def.onKill - 1e-9) reasons.push('续航');
    if (def.avgTaken > base.def.avgTaken * (1 + threshold)) reasons.push('减伤');
    if (!reasons.length) {
      const off = offenceAverage(content, reduced, tier, { seconds, seeds });
      if (off.dps < base.off.dps * (1 - threshold)) reasons.push(`输出 −${((1 - off.dps / base.off.dps) * 100).toFixed(1)}%`);
      else if (off.kills < base.off.kills * (1 - threshold * 2.5)) reasons.push('清怪');
    }
    out.push({ line: build.affixes[i].name, id: build.affixes[i].id, useful: reasons.length > 0, reasons });
  }
  const useful = out.filter(l => l.useful).length;
  return { lines: out, useful, total: out.length, ratio: useful / Math.max(1, out.length), base };
}

// ================================================================== 两种专项评估：攻坚、速刷
// 攻坚 = 对单体的持续伤害（首领战）；速刷 = 走完一段铺满怪群的路线要多久。两项都只看输出：
// 英雄每帧回满生命，防守好坏不影响结果（防守由地图模拟和 defenceReport 单独评估）。

/**
 * 攻坚：一个不会死的首领木桩（首领的生命池、抗性、护甲、闪避），站着让构筑打 `seconds` 秒。
 * 返回单体 DPS 与「击杀本 T 阶首领要几秒」。生命池决定异常强度，所以用真实首领生命。
 */
export function bossingProbe(content, build, tier, { seconds = 15, seed = 4 } = {}) {
  const profile = mapProfile(tier);
  const { world, hero } = heroIn(content, build, profile, seed);
  hero.brain = 'chase'; hero.keepDistance = build.keepDistance ?? 0;
  const boss = world.spawnActor({ team: 1, kind: 'boss', brain: 'none', x: 400, y: 0, radius: 70,
    mods: [{ stat: 'life', value: profile.bossLife }, { stat: 'immortal', op: 'flag' }, { stat: 'life.regen', value: profile.bossLife },
      ...['fire', 'cold', 'lightning'].map(e => ({ stat: `res.${e}`, value: profile.monsterResist })), { stat: 'res.chaos', value: profile.monsterResist / 2 },
      { stat: 'armour', value: profile.monsterArmour * 2 }, { stat: 'evasion', value: profile.monsterEvasion }] });
  let dealt = 0;
  world.listeners.push(e => { if ((e.type === 'hit' || e.type === 'dotTick') && e.target === boss && e.source?.root === hero) dealt += e.amount; });
  // Warm-up (charges, stacks, triggers ramp) is part of the fight; measured from the first frame.
  for (let i = 0; i < seconds * 30; ++i) { world.step(1 / 30); hero.life = hero.max.life; }
  const dps = dealt / seconds;
  return { dps, ttk: dps > 0 ? profile.bossLife / dps : Infinity, enrage: profile.bossEnrage };
}

/**
 * 速刷：一条路线上依次摆 `packs` 群怪（每群 `size` 只，本 T 阶普通怪），间隔 650。
 * 英雄自己找最近的怪推进；返回清完全部的秒数和每秒击杀。超时按已清数量折算。
 */
export function clearingProbe(content, build, tier, { packs = 8, size = 10, limit = 60, seed = 6 } = {}) {
  const profile = mapProfile(tier);
  const { world, hero } = heroIn(content, build, profile, seed);
  hero.brain = 'chase'; hero.keepDistance = build.keepDistance ?? 0; hero.aggro = 5000;
  if (hero.keepDistance > 0) hero.kite = hero.keepDistance * 0.45;
  const total = packs * size;
  for (let p = 0; p < packs; ++p) for (let i = 0; i < size; ++i) {
    const a = world.roll('spawn') * Math.PI * 2, r = 30 + world.roll('spawn') * 130;
    world.spawnActor({ team: 1, brain: 'none', x: 500 + p * 650 + Math.cos(a) * r, y: (p % 2 ? 1 : -1) * 120 + Math.sin(a) * r, radius: 28,
      mods: [{ stat: 'life', value: profile.monsterLife }, ...['fire', 'cold', 'lightning'].map(e => ({ stat: `res.${e}`, value: profile.monsterResist })),
        { stat: 'res.chaos', value: profile.monsterResist / 2 }, { stat: 'armour', value: profile.monsterArmour }, { stat: 'evasion', value: profile.monsterEvasion }] });
  }
  let kills = 0;
  world.listeners.push(e => { if (e.type === 'kill' && e.target.team === 1) kills++; });
  let t = 0;
  for (; t < limit && kills < total; t += 1 / 30) { world.step(1 / 30); hero.life = hero.max.life; }
  const time = kills >= total ? t : limit * total / Math.max(1, kills);
  return { time, kps: total / time, cleared: kills, total };
}

/**
 * 两项评级。攻坚以首领狂暴时间为基准（狂暴前击杀 = 1.0），速刷以本图清图奖励线为基准。
 * 分数 ≥ 1 表示达标；倾向 = 速刷分 / 攻坚分（>1.5 偏速刷，<0.67 偏攻坚）。
 */
export function roleReport(content, build, tier) {
  const profile = mapProfile(tier);
  const b = bossingProbe(content, build, tier), c = clearingProbe(content, build, tier);
  const bossing = profile.bossEnrage / b.ttk, clearing = c.kps / profile.clearTarget;
  const lean = clearing / bossing;
  return { tier, bossing, clearing, ttk: b.ttk, dps: b.dps, clearTime: c.time, kps: c.kps,
    lean: lean > 1.5 ? '速刷型' : lean < 0.67 ? '攻坚型' : '均衡' };
}

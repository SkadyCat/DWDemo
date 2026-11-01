// 地图模拟器：把一套配装放进 T 阶地图跑一段时间，量出清图效率、死亡、最大单次受伤、首领用时。
// 流派阶段测试、「本图要求」面板和词条价值评估都用它。
import { createWorld } from './index.mjs';
import { mapProfile, ELITE_MODS, MAP_FAMILIES } from './content/maps.mjs';
import { RESISTS } from './registry.mjs';

/** Base character before gear: what a level-appropriate hero has with nothing equipped. */
export const HERO_BASE = Object.freeze([
  { stat: 'life', value: 450 }, { stat: 'life.regen', value: 4 }, { stat: 'mana', value: 150 }, { stat: 'mana.regen', value: 20 }, { stat: 'accuracy', value: 600 },
]);

function pickType(mix, r) {
  let acc = 0;
  for (const [t, w] of Object.entries(mix)) { acc += w; if (r < acc) return t; }
  return Object.keys(mix)[0];
}

export function spawnMonster(world, profile, x, y, { elite = false, boss = false, mods: fixedMods = null } = {}) {
  const r = () => world.roll('spawn'), type = pickType(profile.mix, r());
  const ranged = !boss && r() < 0.3;
  const mods = [
    { stat: 'life', value: boss ? profile.bossLife : profile.monsterLife * (elite ? 3 : 1) },
    { stat: `added.${type}`, value: profile.monsterDamage * (boss ? 2 : elite ? 1.5 : 1) },
    { stat: 'armour', value: profile.monsterArmour }, { stat: 'evasion', value: profile.monsterEvasion }, { stat: 'accuracy', value: profile.monsterAccuracy },
    ...['fire', 'cold', 'lightning'].map(e => ({ stat: `res.${e}`, value: profile.monsterResist })),
    { stat: 'res.chaos', value: profile.monsterResist / 2 },
  ];
  if (profile.ailmentChance) for (const [a, from] of [['ignite', 'fire'], ['shock', 'lightning'], ['freeze', 'cold'], ['poison', 'chaos']]) if (type === from) mods.push({ stat: `chance.${a}`, value: profile.ailmentChance });
  const names = [...(fixedMods ?? [])];
  for (const k of names) mods.push(...ELITE_MODS[k].mods);
  if (elite || boss) {
    const keys = Object.keys(ELITE_MODS);
    for (let i = 0; i < (fixedMods ? 0 : profile.eliteMods); ++i) {
      const k = keys[Math.floor(r() * keys.length)];
      if (names.includes(k)) continue;
      names.push(k); mods.push(...ELITE_MODS[k].mods);
    }
  }
  const skills = boss ? ['mob_strike', 'boss_slam', 'boss_nova'] : [ranged ? 'mob_bolt' : 'mob_strike'];
  const m = world.spawnActor({ team: 1, kind: boss ? 'boss' : elite ? 'elite' : 'monster', x, y, radius: boss ? 70 : elite ? 40 : 28, mods, skills, aggro: 2500 });
  if (names.includes('shielded')) { m.max.es = m.max.life * ELITE_MODS.shielded.esFromLife; m.es = m.max.es; }
  if (ranged) m.keepDistance = 450;
  m.eliteMods = names;
  return m;
}

/**
 * build: { skills:[id], affixes:[affix|id], mods:[mod] }
 * opts: { tier, family, seconds, seed, boss (also fight the boss), onWorld(world, hero) }
 * Returns { kills, kps, deaths, maxHit, damageTaken, bossTime, bossEnraged, events }.
 */
export function runMap(content, build, opts = {}) {
  const profile = mapProfile(opts.tier ?? 1, opts.family ?? 'ruin');
  const world = createWorld(content, { seed: opts.seed ?? 1 });
  const hero = world.spawnActor({
    kind: 'hero', team: 0, brain: 'chase', radius: 30,
    mods: [...HERO_BASE, ...(build.mods ?? []), ...RESISTS.slice(0, 3).map(e => ({ stat: `res.${e}`, value: -profile.resistPenalty })), { stat: 'res.chaos', value: -profile.resistPenalty }],
    affixes: build.affixes ?? [], skills: build.skills ?? [],
  });
  hero.keepDistance = build.keepDistance ?? 0;
  if (hero.keepDistance > 0) hero.kite = hero.keepDistance * 0.45;
  opts.onWorld?.(world, hero);
  const res = { profile, kills: 0, deaths: 0, maxHit: 0, damageTaken: 0, bossTime: null, bossEnraged: false, events: 0, casts: 0 };
  world.listeners.push(e => {
    if (e.type === 'kill' && e.target.team === 1 && e.root === hero) res.kills++;
    if (e.type === 'hit' && e.target === hero) { res.maxHit = Math.max(res.maxHit, e.amount); res.damageTaken += e.amount; }
    if (e.type === 'cast' && e.source === hero && !e.tags.includes('triggered')) res.casts++;
  });
  const dt = 1 / 30, seconds = opts.seconds ?? 30;
  const spawnRing = () => { const a = world.roll('spawn') * Math.PI * 2, d = 350 + world.roll('spawn') * 500; return [hero.x + Math.cos(a) * d, hero.y + Math.sin(a) * d]; };
  const revive = () => {
    res.deaths++;
    hero.alive = true; hero.statuses = []; world.refreshPools(hero, true);
    world.actors.set(hero.id, hero);
  };
  for (let i = 0; i < seconds / dt; ++i) {
    let alive = 0;
    for (const a of world.actors.values()) if (a.alive && a.team === 1) ++alive;
    for (; alive < profile.density; ++alive) { const [x, y] = spawnRing(); spawnMonster(world, profile, x, y, { elite: world.roll('spawn') < profile.eliteChance }); }
    world.step(dt);
    if (!hero.alive || hero.life <= 0) revive();
  }
  res.kps = res.kills / seconds;
  res.mapDeaths = res.deaths;
  if (opts.boss) {
    for (const a of world.actors.values()) if (a.team === 1) a.alive = false;
    world.step(dt);
    // opts.bossMods: fixed elite modifiers for the boss (e.g. [] for a pure damage check).
    const boss = spawnMonster(world, profile, hero.x + 400, hero.y, { boss: true, mods: opts.bossMods ?? null });
    const t0 = world.time, deathsBefore = res.deaths;
    while (boss.alive && world.time - t0 < profile.bossEnrage * 2) {
      if (!res.bossEnraged && world.time - t0 >= profile.bossEnrage) { world.applyStatus(boss, 'enraged', {}); res.bossEnraged = true; }
      world.step(dt);
      if (!hero.alive || hero.life <= 0) revive();
    }
    res.bossTime = boss.alive ? Infinity : world.time - t0;
    res.bossDeaths = res.deaths - deathsBefore;
  }
  res.events = world.stats.events;
  res.world = world; res.hero = hero;
  return res;
}

export { MAP_FAMILIES };

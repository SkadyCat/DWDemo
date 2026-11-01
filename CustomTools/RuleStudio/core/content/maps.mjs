// 地图压力：T 阶 → 怪物强度、元素构成、全抗惩罚、致命一击、异常、精英词缀、首领狂暴。
// 每一类压力对应一组必须的防守/攻击词条，高阶地图同时施加全部压力，逼玩家把约九成词条用在刀刃上。
//
// Curves (from the design doc): monster life ×1.22 per tier to T10, then ×1.15; damage grows a bit
// slower so defence lines keep mattering without one-shots becoming the only failure mode.

import { patchList, patchMap } from './overrides.mjs';

export const MAP_TIERS = 16;
/** Normal monsters have this share of the tier's life curve; elites ×3, bosses ×(25 + 4t). */
export const TRASH_LIFE = 0.4;

const lifeCurve = t => 120 * (t <= 10 ? 1.22 ** (t - 1) : 1.22 ** 9 * 1.2 ** (t - 10));
const damageCurve = t => 5 * (t <= 10 ? 1.2 ** (t - 1) : 1.2 ** 9 * 1.17 ** (t - 10));
/** All-resistance penalty applied to the hero inside the map. */
export const resistPenalty = t => (t >= 14 ? 70 : t >= 11 ? 50 : t >= 7 ? 30 : t >= 4 ? 10 : 0);

/** Map families decide the element mix of monster damage (each pack picks one by weight). */
export const MAP_FAMILIES = Object.freeze(patchMap('mapFamilies', {
  ember: { name: '余烬', mix: { fire: 0.6, physical: 0.3, chaos: 0.1 } },
  frost: { name: '霜原', mix: { cold: 0.6, physical: 0.3, lightning: 0.1 } },
  storm: { name: '雷暴', mix: { lightning: 0.6, physical: 0.2, cold: 0.2 } },
  blight: { name: '腐沼', mix: { chaos: 0.5, physical: 0.4, fire: 0.1 } },
  ruin: { name: '废墟', mix: { physical: 0.5, fire: 0.2, cold: 0.15, lightning: 0.15 } },
}));

/** Elite modifiers: each one asks for a different answer from the build. */
export const ELITE_MODS = Object.freeze(patchMap('elites', {
  hasted: { name: '迅捷', mods: [{ stat: 'speed', op: 'more', value: 40 }, { stat: 'moveSpeed', op: 'more', value: 40 }] },
  armoured: { name: '重甲', mods: [{ stat: 'damageTaken', op: 'more', value: -40, tags: ['physical'] }, { stat: 'armour', op: 'base', value: 3000 }] },
  warded: { name: '元素护佑', mods: [{ stat: 'res.fire', value: 40 }, { stat: 'res.cold', value: 40 }, { stat: 'res.lightning', value: 40 }] },
  shielded: { name: '能量护盾', mods: [{ stat: 'es', op: 'base', value: 0 }, { stat: 'life', op: 'more', value: -30 }, { stat: 'es.rechargeRate', value: 30 }], esFromLife: 1.2 },
  venomous: { name: '剧毒', mods: [{ stat: 'chance.poison', value: 60 }, { stat: 'conv.physical.chaos', value: 30 }] },
  frenzied: { name: '狂暴', mods: [{ stat: 'damage', op: 'more', value: 35 }] },
  unstoppable: { name: '不屈', mods: [{ stat: 'avoid.ailment', value: 100 }] },
  vampiric: { name: '吸血', mods: [{ stat: 'leech.life', value: 15 }, { stat: 'leech.max', value: 30 }] },
}));

/**
 * Monster types in a map. Life and damage come from the tier curves (mapProfile); these multiply them.
 * `share` is how often a trash monster is this type; elites and the boss pick their own row.
 */
export const MONSTER_TYPES = Object.freeze(patchMap('monsters', {
  melee: { name: '掠食者', role: '近战杂兵：贴身扑咬', share: 0.7, radius: 28, life: 1, damage: 1, skills: ['mob_strike'], aggro: 750 },
  ranged: { name: '投弹手', role: '远程杂兵：保持距离投掷', share: 0.3, radius: 28, life: 1, damage: 1, skills: ['mob_bolt'], aggro: 750, keepDistance: 420 },
  elite: { name: '精英', role: '带 1–3 条精英词缀，生命为杂兵的 7.5 倍', radius: 40, life: 1, damage: 1.5, aggro: 750 },
  boss: { name: '首领', role: '地图终点；60 秒后狂暴', radius: 70, life: 1, damage: 2, skills: ['mob_strike', 'boss_slam', 'boss_nova'], aggro: 900 },
}));

/** Monster skills. Damage numbers are per point of tier damage; spawn scales them by `added.*`. */
export const MAP_PACK = Object.freeze({
  skills: patchList('monsterSkills', [
    { id: 'mob_strike', tags: ['attack', 'melee', 'monster'], time: 1.4, crit: 5, range: 90, actions: [{ do: 'strike', range: 90 }] },
    { id: 'mob_bolt', tags: ['spell', 'projectile', 'monster'], time: 2, crit: 5, range: 700, actions: [{ do: 'projectile', speed: 900, radius: 18 }] },
    // Telegraphed big hit: lands 1.2 s later where the target stood. The pressure is "can you take it".
    { id: 'boss_slam', tags: ['attack', 'area', 'monster', 'telegraph'], time: 3.5, cooldown: 4, crit: 0, range: 600, effectiveness: 100,
      actions: [{ do: 'area', at: 'target', radius: 160, delay: 1.2, mult: 900, fx: 'telegraph' }] },
    { id: 'boss_nova', tags: ['spell', 'area', 'monster'], time: 2, cooldown: 6, crit: 0, range: 500, actions: [{ do: 'area', at: 'self', radius: 420, mult: 300 }] },
  ]),
  statuses: [{ id: 'enraged', name: '狂暴', duration: 1e9, mods: [{ stat: 'damage', op: 'more', value: 200 }, { stat: 'speed', op: 'more', value: 50 }] }],
});

/**
 * Everything the simulator and the 「本图要求」 panel need to know about a map tier.
 */
export function mapProfile(tier, family = 'ruin') {
  const t = Math.max(1, Math.min(MAP_TIERS, tier));
  const fam = MAP_FAMILIES[family];
  return {
    tier: t, family, name: `${fam.name} T${t}`, mix: fam.mix,
    // 杂兵很脆、成群出现（清屏靠的是覆盖面和连锁）；精英和首领才是单体检验。
    monsterLife: lifeCurve(t) * TRASH_LIFE, eliteLife: lifeCurve(t) * 3, monsterDamage: damageCurve(t),
    monsterResist: Math.min(40, (t - 1) * 3), monsterArmour: 60 * t, monsterEvasion: 80 * t, monsterAccuracy: 200 + 60 * t,
    resistPenalty: resistPenalty(t),
    density: 8 + Math.floor(t * 1.2),                     // monsters alive at once (simulator)
    packSize: 16 + t,                                      // monsters per room in a real map
    eliteChance: Math.min(0.35, 0.04 + t * 0.02), eliteMods: t >= 11 ? 3 : t >= 7 ? 2 : 1,
    ailmentChance: t >= 4 ? Math.min(40, 5 + t * 2.5) : 0, // monsters' elemental ailment chance
    bossLife: lifeCurve(t) * (25 + 4 * t) * (t > 12 ? 1.25 ** (t - 12) : 1), bossEnrage: 60, // seconds until enrage; red maps grow tankier bosses
    clearTarget: 0.6 + t * 0.15,                            // kills per second for the bonus chest
  };
}

/** What the map demands from a character, for the requirements panel. */
export function mapRequirements(profile) {
  return {
    resist: 75,
    resistPenalty: profile.resistPenalty,
    bigHit: profile.monsterDamage * 9 * 1.0,   // boss_slam: 900 % of a monster hit
    sustain: profile.monsterDamage * profile.density * 0.25,
    freezeImmune: profile.tier >= 7,
    bossDps: profile.bossLife / profile.bossEnrage,
    clearTarget: profile.clearTarget,
  };
}

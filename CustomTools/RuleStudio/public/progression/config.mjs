// Character growth tuning. Upper layer only: these numbers become ordinary affix
// lines on a synthetic "character level" passive part, so the rule engine
// aggregates them exactly like talents or equipment and needs no special case.

export const MAX_LEVEL = 60;

/** Experience needed to go from `level` to `level + 1`. */
export function xpToNext(level) {
  if (level >= MAX_LEVEL) return Infinity;
  return Math.round(30 * level ** 1.9 + 20 * level);
}

/** Base kill experience by monster rarity; scaled by floor. */
export const KILL_XP = Object.freeze({ common: 6, normal: 6, magic: 15, rare: 40, boss: 200 });
export const FLOOR_XP_GROWTH = 1.24;

/** Kill streaks: kills chained within this window add bonus experience. */
export const STREAK_WINDOW = 2.6;
export const STREAK_BONUS_PER_KILL = 0.01;
export const STREAK_BONUS_CAP = 0.5;

/** Stat growth per level above 1, expressed as existing affixes. */
export const LEVEL_GROWTH = Object.freeze([
  Object.freeze({ id: 'life_base', perLevel: 12, label: '基础气血' }),
  Object.freeze({ id: 'life_increased', perLevel: 1, label: '气血上限 %' }),
  Object.freeze({ id: 'mana_base', perLevel: 3, label: '魔力上限' }),
  Object.freeze({ id: 'inc_physical', perLevel: 5, label: '物理伤害 %' }),
  Object.freeze({ id: 'inc_elemental', perLevel: 5, label: '元素伤害 %' }),
  Object.freeze({ id: 'inc_void', perLevel: 5, label: '虚空伤害 %' }),
]);

/**
 * Innate attribute conversions every character has (like a class base): they
 * make constellation attribute points matter on their own. Existing affixes.
 */
export const INNATE_ATTRIBUTES = Object.freeze([
  Object.freeze({ id: 'life_per_strength', params: { per: 1, amount: 2 }, label: '每点力量 +2 基础气血' }),
  Object.freeze({ id: 'life_per_constitution', params: { per: 1, amount: 3 }, label: '每点体质 +3 基础气血' }),
  Object.freeze({ id: 'evasion_per_dexterity', params: { per: 1, n: 6 }, label: '每点敏捷 +6 基础闪避' }),
  Object.freeze({ id: 'shield_per_intelligence', params: { per: 1, amount: 2 }, label: '每点智力 +2 基础护盾' }),
]);

/** Talent points: two per level gained plus quest bonuses, capped by the constellation. */
export const TALENT_POINTS_PER_LEVEL = 2;
export const TALENT_POINT_CAP = 120;
export const talentPointsFor = (level, bonus = 0) => Math.min(TALENT_POINT_CAP, Math.max(0, (level - 1) * TALENT_POINTS_PER_LEVEL + bonus));

/** First clear of a map tier always hands out a way forward: the next tier's map. */
export const FIRST_CLEAR_XP = floor => Math.round(80 * FLOOR_XP_GROWTH ** (floor - 1));
export const MAX_MAP_TIER = 16;
export const mapItemId = (tier, rarity = 'common') => `map_t${String(tier).padStart(2, '0')}_${rarity}`;

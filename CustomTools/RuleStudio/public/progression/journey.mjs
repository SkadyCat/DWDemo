// Character journey: level, experience, lifetime counters and first clears.
// Pure state transitions over the player save; no DOM, no combat rules.
import { MAX_LEVEL, xpToNext, KILL_XP, FLOOR_XP_GROWTH, LEVEL_GROWTH, INNATE_ATTRIBUTES, talentPointsFor, FIRST_CLEAR_XP, MAX_MAP_TIER, mapItemId,
  STREAK_WINDOW, STREAK_BONUS_PER_KILL, STREAK_BONUS_CAP } from './config.mjs';

export const JOURNEY_VERSION = 1;
export const COUNTERS = Object.freeze(['kills', 'magicKills', 'rareKills', 'bossKills', 'floorsCleared', 'pickups', 'equipmentPickups', 'rarePickups',
  'crafts', 'identifies', 'equips', 'potions', 'mapsEntered', 'sold', 'deaths', 'bestStreak']);

export const freshJourney = () => ({
  version: JOURNEY_VERSION, level: 1, xp: 0, totalXp: 0, bonusTalentPoints: 0,
  counters: Object.fromEntries(COUNTERS.map(key => [key, 0])), maxFloor: 0, firstClears: {},
});

export function ensureJourney(player) {
  const j = player.journey;
  if (!j || typeof j !== 'object' || j.version !== JOURNEY_VERSION) { player.journey = freshJourney(); return player.journey; }
  const fresh = freshJourney();
  for (const key of Object.keys(fresh)) if (j[key] === undefined) j[key] = fresh[key];
  for (const key of COUNTERS) if (!Number.isFinite(j.counters[key])) j.counters[key] = 0;
  j.level = Math.max(1, Math.min(MAX_LEVEL, Math.trunc(j.level) || 1));
  j.xp = Math.max(0, Number(j.xp) || 0);
  return j;
}

/**
 * The character's own passive part: innate attribute conversions plus level
 * growth, as ordinary affix lines the engine already understands.
 */
export function levelPart(level) {
  const gained = Math.max(0, Math.min(MAX_LEVEL, level) - 1);
  const traits = INNATE_ATTRIBUTES.map(a => ({ id: a.id, params: { ...a.params }, with: [] }));
  if (gained) traits.push(...LEVEL_GROWTH.map(g => ({ id: g.id, params: { n: g.perLevel * gained }, with: [] })));
  return { kind: 'level', label: `角色等级 ${level}`, doc: { id: `character_level_${level}`, name: `角色等级 ${level}`, traits, bases: [] } };
}

export function levelBonusRows(level) {
  const gained = Math.max(0, level - 1);
  return LEVEL_GROWTH.map(g => ({ ...g, value: g.perLevel * gained }));
}

export const talentBudget = player => talentPointsFor(player.journey?.level ?? 1, player.journey?.bonusTalentPoints ?? 0);

export function killXp(monster, floor = 1) {
  const rarity = monster?.boss ? 'boss' : monster?.rarity;
  const base = KILL_XP[rarity] ?? KILL_XP.common;
  return Math.max(1, Math.round(base * FLOOR_XP_GROWTH ** (Math.max(1, floor) - 1)));
}

/** Add experience, possibly crossing several levels. Returns the levels reached. */
export function grantXp(player, amount) {
  const j = ensureJourney(player);
  const gained = Math.max(0, Math.round(amount) || 0);
  const from = j.level, levels = [];
  if (!gained || j.level >= MAX_LEVEL) return { gained: 0, from, to: from, levels };
  j.xp += gained; j.totalXp += gained;
  while (j.level < MAX_LEVEL && j.xp >= xpToNext(j.level)) { j.xp -= xpToNext(j.level); j.level++; levels.push(j.level); }
  if (j.level >= MAX_LEVEL) j.xp = 0;
  return { gained, from, to: j.level, levels };
}

export function xpProgress(journey) {
  const need = xpToNext(journey.level);
  return { level: journey.level, xp: journey.xp, need, ratio: Number.isFinite(need) ? Math.min(1, journey.xp / need) : 1 };
}

export function bump(player, key, n = 1) {
  const j = ensureJourney(player);
  if (!(key in j.counters)) j.counters[key] = 0;
  j.counters[key] += n;
  return j.counters[key];
}

/** Kill streak tracker. Lives in memory only (per page), keyed on battle clock. */
export class KillStreak {
  constructor() { this.count = 0; this.lastAt = -Infinity; this.best = 0; }
  hit(time) {
    this.count = time - this.lastAt <= STREAK_WINDOW ? this.count + 1 : 1;
    this.lastAt = time; this.best = Math.max(this.best, this.count);
    return this.count;
  }
  active(time) { return time - this.lastAt <= STREAK_WINDOW ? this.count : 0; }
  bonus(count = this.count) { return Math.min(STREAK_BONUS_CAP, Math.max(0, count - 1) * STREAK_BONUS_PER_KILL); }
  reset() { this.count = 0; this.lastAt = -Infinity; }
}

/** Monster killed: counters and experience. */
export function recordKill(player, monster, floor, streakBonus = 0) {
  bump(player, 'kills');
  if (monster?.boss) bump(player, 'bossKills');
  else if (monster?.rarity === 'rare') bump(player, 'rareKills');
  else if (monster?.rarity === 'magic') bump(player, 'magicKills');
  const base = killXp(monster, floor);
  return { base, ...grantXp(player, base * (1 + streakBonus)) };
}

/**
 * A live floor clear. The first clear of a tier pays bonus experience and the
 * next tier's map so the atlas can never dead-end for want of a ticket.
 */
export function recordFloorClear(player, floor) {
  const j = ensureJourney(player);
  bump(player, 'floorsCleared');
  j.maxFloor = Math.max(j.maxFloor, floor);
  if (j.firstClears[floor]) return { first: false };
  j.firstClears[floor] = true;
  const xp = grantXp(player, FIRST_CLEAR_XP(floor));
  const rewards = [];
  if (floor < MAX_MAP_TIER) {
    const id = mapItemId(floor + 1);
    player.owned.item[id] = (player.owned.item[id] || 0) + 1;
    rewards.push({ kind: 'item', id, count: 1 });
  }
  return { first: true, xp, rewards };
}

/**
 * Keep the talent allocation inside the level budget. An allocation that no
 * longer fits (older saves used a free 120-point planner) is refunded whole,
 * because trimming nodes could disconnect the remaining path.
 */
export function syncTalentBudget(player) {
  const t = player.talents;
  if (!t || typeof t !== 'object') return { changed: false };
  const budget = talentBudget(player);
  const spent = Array.isArray(t.allocated) ? t.allocated.length : 0;
  let refunded = false;
  if (spent > budget) { t.allocated = []; t.choices = {}; refunded = true; }
  const changed = t.budget !== budget || refunded;
  if (t.budget !== budget) t.budget = budget;
  return { changed, refunded, budget, spent: refunded ? 0 : spent };
}

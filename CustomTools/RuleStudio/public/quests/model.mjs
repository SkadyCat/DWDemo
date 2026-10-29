// Player progression only. Quests observe combat results and use the existing loot generator.
import { rollEquipmentDrop } from '../equipment-generation.mjs';

export const QUESTS = Object.freeze([
  Object.freeze({ id: 'first_floor', name: '初入高塔', objective: '通关第 1 层', floor: 1,
    description: '探索随机地牢，使用冰锥术击败第一层守卫。',
    reward: Object.freeze({ slot: 'weapon', choices: 3, picks: 1, tier: 1 }) }),
]);
const copy = value => JSON.parse(JSON.stringify(value));
const freshEntry = () => ({ stage: 'active', choices: [], claimedUid: '', claimedName: '' });
export const freshQuests = () => ({ version: 1, entries: Object.fromEntries(QUESTS.map(q => [q.id, freshEntry()])) });

/** Add quests to existing saves without changing their inventory or completed rewards. */
export function ensureQuests(player) {
  if (!player.quests || player.quests.version !== 1 || !player.quests.entries) player.quests = freshQuests();
  for (const q of QUESTS) {
    const entry = player.quests.entries[q.id];
    if (!entry || !['active', 'reward', 'claimed'].includes(entry.stage)) player.quests.entries[q.id] = freshEntry();
  }
  return player.quests;
}

export function questRows(player) {
  return QUESTS.map(q => ({ ...q, ...(player.quests?.entries?.[q.id] || freshEntry()) }));
}

/** Three distinct weapon bases, using normal rarity, affix count, slot pools and T1 values. */
export function rollQuestWeapons(collections, library, { random = Math.random, makeUid } = {}) {
  const remaining = new Map([...collections.equipment].filter(([, { doc }]) => doc?.slot === 'weapon' && doc.skills?.length));
  const choices = [];
  for (let i = 0; i < QUESTS[0].reward.choices; i++) {
    const item = rollEquipmentDrop({ ...collections, equipment: remaining }, library, {
      chance: 1, maxTier: 1, random, ...(makeUid ? { uid: makeUid(i) } : {}),
    });
    if (!item || choices.some(previous => previous.uid === item.uid)) throw Error('任务奖励需要三个可用的不同武器');
    choices.push(item); remaining.delete(item.baseId);
  }
  return choices;
}

/** A live first-floor victory is the only completion source; visiting a floor or losing is insufficient. */
export function observeQuestBattle(player, battle, collections, library, options = {}) {
  ensureQuests(player);
  const q = QUESTS[0], entry = player.quests.entries[q.id];
  if (entry.stage !== 'active' || battle?.floor !== q.floor || battle.phase !== 'cleared'
      || battle.hero?.dead || battle.character?.dead || (battle.completionMode !== 'boss' && battle.wavesCompleted !== 3) || !(battle.boss?.health <= 0)) return { changed: false };
  let choices;
  try { choices = rollQuestWeapons(collections, library, options); }
  catch (error) { return { changed: false, error: error.message }; }
  entry.choices = choices;
  entry.stage = 'reward';
  return { changed: true, id: q.id };
}

/** A single synchronous claim inserts the exact rolled instance. The other two never enter the bag. */
export function claimQuestWeapon(player, questId, uid) {
  ensureQuests(player);
  const entry = player.quests.entries[questId];
  if (!entry) return { error: '任务不存在' };
  if (entry.stage === 'claimed') return { error: '任务奖励已领取' };
  if (entry.stage !== 'reward') return { error: '请先通关第一层' };
  const item = entry.choices.find(candidate => candidate.uid === uid);
  if (!item || item.slot !== 'weapon') return { error: '请选择本次奖励中的一把武器' };
  if (player.instances[uid]) return { error: '奖励物品已在背包中' };
  const owned = copy(item);
  player.instances[uid] = owned;
  entry.stage = 'claimed'; entry.claimedUid = uid; entry.claimedName = item.name; entry.choices = [];
  return { error: '', item: owned };
}

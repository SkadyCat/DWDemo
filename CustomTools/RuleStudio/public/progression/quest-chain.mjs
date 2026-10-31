// Story quest chain. Data-driven; objectives read the journey counters, so the
// chain observes play instead of hooking into combat. Rewards use the existing
// item catalogue and the normal equipment generator.
import { rollEquipmentDrop, rollEquipment } from '../equipment-generation.mjs';
import { ensureJourney, grantXp } from './journey.mjs';
import { mapItemId } from './config.mjs';

/**
 * Objective kinds:
 *  counter  — journey counter increases by `target` after the quest starts
 *  maxFloor — highest cleared floor reaches `target`
 *  level    — character level reaches `target`
 *  talents  — allocated talent points reach `target`
 *  legacy   — the original first-floor weapon quest has been claimed
 */
export const CHAPTERS = Object.freeze([
  { id: 'c1', name: '第一章 · 初入高塔', blurb: '学会战斗，击败第一位守卫，获得属于自己的武器。' },
  { id: 'c2', name: '第二章 · 灵石之道', blurb: '拾取、鉴定与洗炼。装备决定你的流派。' },
  { id: 'c3', name: '第三章 · 高塔深处', blurb: '更强的守卫与精英怪。成长你的构筑，挑战第 10 层。' },
  { id: 'c4', name: '第四章 · 异界裂隙', blurb: '第 11 层以后，异界怪物现身。征服全部 16 层地图。' },
]);

const R = Object.freeze;
export const QUEST_CHAIN = R([
  // ---------------------------------------------------------------- Chapter 1
  R({ id: 'c1_first_blood', chapter: 'c1', name: '初次交锋', objective: { kind: 'counter', key: 'kills', target: 8 },
    text: '击杀 8 个怪物', hint: '鼠标瞄准敌人，左键施放冰锥术。击杀获得经验与灵石。',
    rewards: [{ kind: 'stones', count: 60 }, { kind: 'item', id: 'healing_draught', count: 2 }] }),
  R({ id: 'c1_guardian', chapter: 'c1', name: '第一层守卫', objective: { kind: 'legacy' },
    text: '击败第 1 层守卫并领取武器', hint: '沿小地图找到首领房间。击败后按 J 从三把武器中选一把。',
    rewards: [{ kind: 'xp', count: 150 }, { kind: 'item', id: mapItemId(1), count: 2 }] }),
  R({ id: 'c1_gear', chapter: 'c1', name: '武装自己', objective: { kind: 'counter', key: 'equips', target: 2 },
    text: '穿戴 2 次装备', hint: '按 B 打开背包，把装备拖到角色栏，或右键选择「装备」。',
    rewards: [{ kind: 'item', id: 'chaos_orb', count: 2 }, { kind: 'stones', count: 80 }] }),
  R({ id: 'c1_talent', chapter: 'c1', name: '星盘初启', objective: { kind: 'talents', target: 2 },
    text: '在天赋星盘分配 2 点', hint: '每升一级获得 2 个天赋点。按 P 打开星盘，从中心沿连线点亮。',
    rewards: [{ kind: 'talent', count: 1 }, { kind: 'choice', pool: 'aura', rarity: 'magic', tier: 2, label: '三选一 · 光环饰品' }] }),
  // ---------------------------------------------------------------- Chapter 2
  R({ id: 'c2_scavenger', chapter: 'c2', name: '拾荒者', objective: { kind: 'counter', key: 'pickups', target: 12 },
    text: '拾取 12 件掉落', hint: '按 Z 显示地面掉落名称，点击或靠近即可拾取。',
    rewards: [{ kind: 'item', id: 'chaos_orb', count: 3 }, { kind: 'item', id: 'annulment_crystal', count: 1 }] }),
  R({ id: 'c2_map', chapter: 'c2', name: '地图之门', objective: { kind: 'counter', key: 'mapsEntered', target: 1 },
    text: '使用地图进入新区域', hint: '按 M 打开世界地图，把地图放入中央槽，选择相邻区域进入。地图层级就是挑战层数。',
    rewards: [{ kind: 'item', id: mapItemId(2), count: 2 }, { kind: 'stones', count: 120 }] }),
  R({ id: 'c2_craft', chapter: 'c2', name: '初试洗炼', objective: { kind: 'counter', key: 'crafts', target: 3 },
    text: '洗炼装备 3 次', hint: '在背包中按住 Ctrl 固定装备详情，选择灵石对词条洗炼。灵石来自掉落与任务。',
    rewards: [{ kind: 'item', id: 'spirit_stone_mid', count: 2 }, { kind: 'item', id: 'quad_affix_orb', count: 1 }] }),
  R({ id: 'c2_floor3', chapter: 'c2', name: '第三层', objective: { kind: 'maxFloor', target: 3 },
    text: '通关第 3 层', hint: '首次通关某层会额外奖励下一层的地图。',
    rewards: [{ kind: 'equipment', rarity: 'rare', tier: 3 }, { kind: 'xp', count: 400 }] }),
  // ---------------------------------------------------------------- Chapter 3
  R({ id: 'c3_elites', chapter: 'c3', name: '精英猎手', objective: { kind: 'counter', key: 'rareKills', target: 6 },
    text: '击杀 6 个稀有怪物', hint: '金色名字的怪物是稀有怪，掉落更好、经验更多。',
    rewards: [{ kind: 'item', id: 'omen_offense', count: 1 }, { kind: 'item', id: 'spirit_stone_mid', count: 2 }] }),
  R({ id: 'c3_level10', chapter: 'c3', name: '历练', objective: { kind: 'level', target: 10 },
    text: '角色达到 10 级', hint: '高层怪物经验更多；连杀可额外获得最多 50% 经验。',
    rewards: [{ kind: 'talent', count: 2 }, { kind: 'choice', pool: 'skill', rarity: 'rare', tier: 5, label: '三选一 · 技能饰品' }] }),
  R({ id: 'c3_floor5', chapter: 'c3', name: '第五层', objective: { kind: 'maxFloor', target: 5 },
    text: '通关第 5 层', hint: '怪物气血每层翻倍。记得更新装备并洗炼核心词条。',
    rewards: [{ kind: 'item', id: mapItemId(5, 'magic'), count: 2 }, { kind: 'item', id: 'spirit_stone_high', count: 1 }] }),
  R({ id: 'c3_slayer', chapter: 'c3', name: '守卫屠戮者', objective: { kind: 'counter', key: 'bossKills', target: 5 },
    text: '击败 5 位守卫', hint: '守卫必定掉落装备与物品，并有概率掉落地图。',
    rewards: [{ kind: 'item', id: 'wish_crystal', count: 1 }, { kind: 'xp', count: 900 }] }),
  R({ id: 'c3_floor10', chapter: 'c3', name: '第十层', objective: { kind: 'maxFloor', target: 10 },
    text: '通关第 10 层', hint: '第 11 层起会出现更危险的异界怪物。',
    rewards: [{ kind: 'choice', pool: 'legendary', rarity: 'legendary', tier: 8, label: '三选一 · 传奇装备' }, { kind: 'talent', count: 3 }] }),
  // ---------------------------------------------------------------- Chapter 4
  R({ id: 'c4_rift', chapter: 'c4', name: '异界裂隙', objective: { kind: 'maxFloor', target: 11 },
    text: '通关第 11 层', hint: '异界怪物会施放强力技能；注意躲避（Shift）与药剂。',
    rewards: [{ kind: 'item', id: 'spirit_stone_high', count: 2 }, { kind: 'item', id: 'quad_affix_orb', count: 2 }] }),
  R({ id: 'c4_level25', chapter: 'c4', name: '强者之路', objective: { kind: 'level', target: 25 },
    text: '角色达到 25 级', hint: '星盘上的传奇节点能改变流派，值得规划路线。',
    rewards: [{ kind: 'talent', count: 3 }, { kind: 'choice', pool: 'legendary', rarity: 'legendary', tier: 10, label: '三选一 · 传奇装备' }] }),
  R({ id: 'c4_summit', chapter: 'c4', name: '登顶', objective: { kind: 'maxFloor', target: 16 },
    text: '通关第 16 层', hint: '全部地图层级的最高处。',
    rewards: [{ kind: 'equipment', rarity: 'legendary', tier: 10 }, { kind: 'item', id: 'wish_crystal', count: 3 }, { kind: 'xp', count: 20000 }] }),
]);

export const CHAIN_VERSION = 1;
const freshChain = () => ({ version: CHAIN_VERSION, entries: {} });

export function ensureChain(player) {
  if (!player.questChain || player.questChain.version !== CHAIN_VERSION || typeof player.questChain.entries !== 'object') player.questChain = freshChain();
  const entries = player.questChain.entries;
  // Sequential: the first not-yet-claimed quest is active. Older entries are kept.
  for (const quest of QUEST_CHAIN) {
    const entry = entries[quest.id];
    if (entry && ['active', 'done', 'claimed'].includes(entry.stage)) { if (entry.stage !== 'claimed') break; continue; }
    entries[quest.id] = { stage: 'active', start: startValue(player, quest) };
    break;
  }
  return player.questChain;
}

function startValue(player, quest) {
  const j = ensureJourney(player);
  return quest.objective.kind === 'counter' ? j.counters[quest.objective.key] || 0 : 0;
}

function talentSpent(player) { return Array.isArray(player.talents?.allocated) ? player.talents.allocated.length : 0; }

export function questProgress(player, quest, entry = player.questChain?.entries?.[quest.id]) {
  const j = ensureJourney(player), o = quest.objective;
  let current = 0, target = o.target ?? 1;
  if (o.kind === 'counter') current = (j.counters[o.key] || 0) - (entry?.start || 0);
  else if (o.kind === 'maxFloor') current = j.maxFloor;
  else if (o.kind === 'level') current = j.level;
  else if (o.kind === 'talents') current = talentSpent(player);
  else if (o.kind === 'legacy') current = player.quests?.entries?.first_floor?.stage === 'claimed' ? 1 : 0;
  if (entry && entry.stage !== 'active') current = target;
  return { current: Math.max(0, Math.min(target, current)), target, done: current >= target };
}

/** Mark finished quests as done. Returns the ids that just completed. */
export function observeChain(player) {
  ensureChain(player);
  const completed = [];
  for (const quest of QUEST_CHAIN) {
    const entry = player.questChain.entries[quest.id];
    if (!entry || entry.stage !== 'active') continue;
    if (questProgress(player, quest, entry).done) { entry.stage = 'done'; completed.push(quest.id); }
  }
  return completed;
}

export function chainRows(player) {
  ensureChain(player);
  return QUEST_CHAIN.map((quest, index) => {
    const entry = player.questChain.entries[quest.id];
    const stage = entry?.stage || 'locked';
    return { ...quest, index, stage, choices: entry?.choices || [], progress: entry ? questProgress(player, quest, entry) : { current: 0, target: quest.objective.target ?? 1, done: false } };
  });
}

/** The quest the tracker should show: a claimable one first, otherwise the active one. */
export function trackedQuest(player) {
  const rows = chainRows(player);
  return rows.find(r => r.stage === 'done') || rows.find(r => r.stage === 'active') || null;
}

function rollRewardEquipment(reward, collections, library, random) {
  const pool = new Map([...collections.equipment].filter(([, { doc }]) => doc && (reward.rarity === 'legendary' ? doc.rarity === 'legendary' : doc.rarity !== 'legendary')
    && (!reward.slot || doc.slot === reward.slot) && !['map', 'tower', 'lineage', 'rarity', 'character'].includes(doc.slot)));
  if (!pool.size) throw Error('奖励装备池为空');
  const item = rollEquipmentDrop({ ...collections, equipment: pool }, library, { chance: 1, rarity: reward.rarity, tier: reward.tier, maxTier: reward.tier, random });
  if (!item) throw Error('奖励装备生成失败');
  return item;
}

const SKILL_JEWELRY = ['cinder_guard_amulet', 'cinder_guard_ring', 'vector_control_ring', 'wind_breath_amulet', 'wind_breath_ring'];
/** Bases a choice reward draws from: three distinct ones are offered. */
export function choiceBases(pool, collections) {
  const docs = [...collections.equipment.values()].map(e => e.doc).filter(Boolean);
  if (pool === 'aura') return docs.filter(d => d.slot === 'ring' && d.id.startsWith('aura_') && !d.id.startsWith('aura_resist_'));
  if (pool === 'skill') return docs.filter(d => SKILL_JEWELRY.includes(d.id));
  if (pool === 'legendary') return docs.filter(d => d.rarity === 'legendary' && !['map', 'tower', 'lineage', 'rarity', 'character'].includes(d.slot) && !/^embers_echo_[2-5]_|_t\d+_/.test(d.id));
  return [];
}

/** Roll a completed quest's choice once; the rolled items are stored so reloading never rerolls. */
export function prepareChoices(player, id, collections, library, { random = Math.random } = {}) {
  const quest = QUEST_CHAIN.find(q => q.id === id), entry = player.questChain?.entries?.[id];
  const reward = quest?.rewards.find(r => r.kind === 'choice');
  if (!reward || !entry || entry.stage !== 'done' || entry.choices?.length) return entry?.choices || [];
  const bases = [...choiceBases(reward.pool, collections)];
  const picks = [];
  while (picks.length < 3 && bases.length) picks.push(bases.splice(Math.floor(random() * bases.length), 1)[0]);
  entry.choices = picks.map((base, i) => rollEquipment(base, library, { rarity: base.rarity === 'legendary' ? 'legendary' : reward.rarity, tier: reward.tier, random, uid: `quest_${id}_${i}_${Date.now().toString(36)}` }));
  return entry.choices;
}

/**
 * Claim one completed quest. All rewards are created before anything is
 * granted, so a failed equipment roll leaves the save untouched.
 */
export function claimChainQuest(player, id, collections, library, { random = Math.random, choiceUid = '' } = {}) {
  ensureChain(player);
  const quest = QUEST_CHAIN.find(q => q.id === id), entry = player.questChain.entries[id];
  if (!quest || !entry) return { error: '任务不存在' };
  if (entry.stage === 'claimed') return { error: '奖励已领取' };
  if (entry.stage !== 'done') return { error: '任务尚未完成' };
  const granted = [];
  try {
    for (const reward of quest.rewards) {
      if (reward.kind === 'choice') {
        const item = (entry.choices || []).find(c => c.uid === choiceUid);
        if (!item) throw Error('请先从三件奖励中选择一件');
        granted.push({ ...reward, kind: 'equipment', item: JSON.parse(JSON.stringify(item)) });
      } else if (reward.kind === 'equipment') granted.push({ ...reward, item: rollRewardEquipment(reward, collections, library, random) });
      else if (reward.kind === 'item' && !collections.item?.get(reward.id)?.doc) throw Error(`奖励物品不存在：${reward.id}`);
      else granted.push(reward);
    }
  } catch (error) { return { error: error.message }; }
  let xp = null;
  for (const reward of granted) {
    if (reward.kind === 'stones') { player.stones += reward.count; player.stats.earned += reward.count; }
    else if (reward.kind === 'item') player.owned.item[reward.id] = (player.owned.item[reward.id] || 0) + reward.count;
    else if (reward.kind === 'talent') ensureJourney(player).bonusTalentPoints += reward.count;
    else if (reward.kind === 'xp') xp = grantXp(player, reward.count);
    else if (reward.kind === 'equipment') player.instances[reward.item.uid] = reward.item;
  }
  entry.stage = 'claimed'; delete entry.choices;
  ensureChain(player);
  return { error: '', quest, granted, xp };
}

export function rewardLabel(reward, collections) {
  if (reward.kind === 'stones') return `${reward.count} 灵石`;
  if (reward.kind === 'xp') return `${reward.count} 经验`;
  if (reward.kind === 'talent') return `天赋点 +${reward.count}`;
  if (reward.kind === 'item') return `${collections?.item?.get(reward.id)?.doc?.name || reward.id} ×${reward.count}`;
  if (reward.kind === 'equipment') return reward.item ? reward.item.name : `${{ magic: '魔法', rare: '稀有', legendary: '传奇' }[reward.rarity] || ''} T${reward.tier} 装备`;
  if (reward.kind === 'choice') return `${reward.label} T${reward.tier}`;
  return '';
}

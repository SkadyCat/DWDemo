// New-player coach. Each step shows one short instruction and finishes when the
// player actually does it, read from a small context snapshot built by the HUD.
// Situational tips (low life, unspent talents) appear once when they apply.

export const TUTORIAL_VERSION = 1;

/** Ordered guided steps. `done(ctx)` is checked every few frames. */
export const TUTORIAL_STEPS = Object.freeze([
  { id: 'move', title: '移动', text: '使用 W A S D 移动角色。', keys: ['W', 'A', 'S', 'D'], done: c => c.moved >= 3 },
  { id: 'attack', title: '施法', text: '鼠标对准敌人，按住左键施放冰锥术。', keys: ['左键'], done: c => c.damageDealt > 0 },
  { id: 'kill', title: '击杀', text: '击杀怪物获得经验与灵石。经验条在技能栏上方。', keys: [], done: c => c.kills >= 3 },
  { id: 'loot', title: '拾取', text: '怪物会掉落装备与通货。按 Z 显示名称，点击地上的物品拾取。', keys: ['Z'], done: c => c.pickups >= 1, when: c => c.groundLoot > 0 || c.pickups > 0 },
  { id: 'boss', title: '首领', text: '沿右上角小地图探索，找到并击败本层守卫。', keys: ['Tab'], done: c => c.floorsCleared >= 1 },
  { id: 'reward', title: '任务奖励', text: '按 J 打开任务，从三把武器中选择一把。', keys: ['J'], done: c => c.firstWeaponClaimed, when: c => c.firstWeaponReady || c.firstWeaponClaimed },
  { id: 'equip', title: '换装', text: '按 B 打开背包，右键装备选择「装备」，或拖到角色栏。', keys: ['B'], done: c => c.equips >= 1 },
  { id: 'atlas', title: '世界地图', text: '进入守卫倒下处的传送阵，或按 M 打开世界地图。把地图放进中央槽，选择相邻区域继续挑战。', keys: ['M'], done: c => c.mapsEntered >= 1 },
]);

/** One-off contextual tips, shown when relevant after (or during) the guide. */
export const TUTORIAL_TIPS = Object.freeze([
  { id: 'talent', title: '天赋点', text: '你有未分配的天赋点。按 P 打开天赋星盘，从中心沿连线点亮。', keys: ['P'], when: c => c.unspentTalents > 0 && c.level >= 2, done: c => c.unspentTalents === 0 },
  { id: 'potion', title: '药剂', text: '气血偏低！按 Q 使用药剂槽中的药剂，Shift 可以闪避。', keys: ['Q', 'Shift'], when: c => c.lifeRatio > 0 && c.lifeRatio < 0.4 && c.hasPotion, done: c => c.potions >= 1 },
  { id: 'quest', title: '任务完成', text: '有任务奖励可以领取。点击左侧任务卡的「领取」，或按 J。', keys: ['J'], when: c => c.claimableQuests > 0, done: c => c.claimableQuests === 0 },
  { id: 'craft', title: '洗炼', text: '你获得了灵石。悬停装备后按住 Ctrl 固定详情，即可选择灵石洗炼词条。', keys: ['Ctrl'], when: c => c.hasCurrency && c.crafts === 0 && c.floorsCleared >= 1, done: c => c.crafts >= 1 },
]);

export const freshTutorial = () => ({ version: TUTORIAL_VERSION, completed: [], tipsShown: [], skipped: false });

export function ensureTutorial(player) {
  const t = player.tutorial;
  if (!t || t.version !== TUTORIAL_VERSION || !Array.isArray(t.completed) || !Array.isArray(t.tipsShown)) player.tutorial = freshTutorial();
  return player.tutorial;
}

/**
 * Advance and pick what to show. Steps that are already satisfied are marked
 * complete silently, so a returning player is never told to do something twice.
 */
export function tutorialView(player, ctx) {
  const t = ensureTutorial(player);
  const completedNow = [];
  for (const step of TUTORIAL_STEPS) {
    if (t.completed.includes(step.id)) continue;
    if (step.done(ctx)) { t.completed.push(step.id); completedNow.push(step.id); }
  }
  const guide = t.skipped ? null : TUTORIAL_STEPS.find(step => !t.completed.includes(step.id) && (!step.when || step.when(ctx))) || null;
  // A tip that was on screen and has now been acted on is retired for good.
  if (t.activeTip && TUTORIAL_TIPS.find(row => row.id === t.activeTip)?.done(ctx)) { dismissTip(player, t.activeTip); t.activeTip = ''; }
  const tip = TUTORIAL_TIPS.find(row => !t.tipsShown.includes(row.id) && row.when(ctx) && !row.done(ctx)) || null;
  if (tip) t.activeTip = tip.id;
  const index = guide ? TUTORIAL_STEPS.indexOf(guide) : -1;
  return { guide, tip, completedNow, index, total: TUTORIAL_STEPS.length, finished: t.completed.length >= TUTORIAL_STEPS.length };
}

export function dismissTip(player, id) {
  const t = ensureTutorial(player);
  if (!t.tipsShown.includes(id)) t.tipsShown.push(id);
}

export function skipTutorial(player, skipped = true) { ensureTutorial(player).skipped = skipped; }

// 主线任务「星烬纪」：魔法文明阿斯特拉的最后岁月。虚空之外的「无名之潮」正在吞没世界，
// 主角从最后的据点「星环营地」出发，穿过五个地区，寻找能封住虚空之门的五枚源印。
// 八章，约 5 小时（大约 110 张地图）：每章跟着图集往外推两阶，章内的目标可以按任意顺序完成。
//
// 只管数据和判定：任务状态存在 save.quests；页面在游戏事件发生时调用 questEvent()，
// 在存档变化后调用 questTick()，两者都返回需要提示给玩家的通知。
import { baseLinesOf } from '../../core/content/items.mjs';
import { rollWaystone } from './waystones.mjs';

/**
 * Goal types
 *   clear   { count, family?, kind?, minTier? }  — finish maps (event: a map's boss dies)
 *   kills   { count }                            — monsters killed (event, counted when a map ends)
 *   pickup  { count, baseLines?, legend? }       — equipment picked up (event)
 *   equip   { count }                            — pieces equipped (event)
 *   craft   { count }                            — currency used on equipment (event)
 *   tier    { value }                            — the highest open map tier is at least value (state)
 *   talent  { value }                            — talent points allocated (state)
 *   skills  { value }                            — skills on the bar (state)
 *   legendary {}                                 — own a legendary item (state)
 */
export const CHAPTERS = Object.freeze([
  {
    id: 'c1', title: '余火', sub: '星环营地', tiers: 'T1–T2',
    intro: [
      '阿斯特拉的天空已经碎了七年。',
      '起初只是星图上的一个空洞：观星塔的学者说，那里本该有一颗星。后来空洞开始扩大，从里面涌出的东西没有名字、没有形状——人们只好叫它「无名之潮」。潮水所过之处，法术熄灭，城市失声，连记忆都会被抹去。',
      '九座法师城邦如今只剩下这一处营地。守灯人维斯塔把你从冰冷的传送阵里拖出来时，你只记得一件事：你是最后一批被派出去的寻径者。',
      '「先站起来，」她说，「营地外面的废墟里还有东西在动。我们得知道，这座营地还能撑多久。」',
    ],
    outro: [
      '你带回了废墟里拾来的残破法器和一块刻着古老纹路的路石。维斯塔把路石放在地图装置上，星图亮起了一角——那是通往旧王时代档案馆的路。',
      '「还有人留下了路，」她轻声说，「那就还有希望。」',
    ],
    steps: [
      { text: '走出营地，打通第一张地图', goal: { type: 'clear', count: 1 } },
      { text: '捡起一件掉落的装备', goal: { type: 'pickup', count: 1 } },
      { text: '换上一件更好的装备', goal: { type: 'equip', count: 1 } },
      { text: '清理营地周围：打通 4 张地图', goal: { type: 'clear', count: 4 } },
      { text: '打开 T3 的地图（打通一张 T2 地图）', goal: { type: 'tier', value: 3 } },
    ],
    reward: { currencies: { augment: 6, upgrade: 3, chaos: 1 }, waystones: [[3, 'normal'], [3, 'magic']] },
  },
  {
    id: 'c2', title: '残碑与回声', sub: '废墟之域', tiers: 'T2–T4',
    intro: [
      '旧王的档案馆埋在废墟之域的断碑之下。维斯塔说，那里记录着阿斯特拉建国之初的一次「封门」——在比王朝更古老的年代，虚空曾经被关上过一次。',
      '「如果那是真的，就一定有方法。」',
      '废墟里游荡着被潮水改写过的守卫，它们仍然穿着王国的铠甲，只是不再记得为谁而战。去试炼场磨一磨你的法术，再学会用通货改造手里的装备——寻径者的路从来都靠自己铺。',
    ],
    outro: [
      '档案馆最深处的石碑只剩半截。你拼出了残文：「五地各藏一印，五印合鸣，门可再闭。」',
      '维斯塔沉默了很久，然后指向星图的东南方：「余烬之域。熔炉城的最后一位炉主，曾经说过他守着一样不能熄灭的东西。」',
    ],
    steps: [
      { text: '在废墟之域打通 3 张地图', goal: { type: 'clear', count: 3, family: 'ruin' } },
      { text: '完成一次试炼', goal: { type: 'clear', count: 1, kind: 'trial' } },
      { text: '用通货改造装备 3 次（悬停装备按 Ctrl 钉住提示）', goal: { type: 'craft', count: 3 } },
      { text: '在天赋盘点 2 个天赋', goal: { type: 'talent', value: 2 } },
      { text: '打开 T5 的地图', goal: { type: 'tier', value: 5 } },
    ],
    reward: { currencies: { chaos: 3, seal: 1, upgrade: 4 }, waystones: [[5, 'normal'], [5, 'magic']] },
  },
  {
    id: 'c3', title: '余烬熔炉', sub: '余烬之域', tiers: 'T4–T6',
    intro: [
      '余烬之域曾是阿斯特拉的工坊。熔炉城的火焰烧了三百年，连星辰都曾在这里被锻成法杖的芯。',
      '如今熔炉被潮水浸透，火焰变成了暗红色，像是在流血。炉主的要塞孤零零地立在熔岩河中央，大门紧闭——但门后传来锤击声，一下，又一下，从未停止。',
      '在这里找一件真正称手的装备：那种基底被完整锻造过的东西，三条基底词条，一条不缺。',
    ],
    outro: [
      '炉主早已死去。锤击声来自他留下的傀儡，它一遍遍锻打着同一块铁——铁里封着第一枚源印，「炉心之印」。',
      '当你取下源印，傀儡停了下来，像是终于可以休息了。印的背面刻着一行小字：「雷鸣信标仍在呼唤，别让它孤单。」',
    ],
    steps: [
      { text: '在余烬之域打通 4 张 T4 及以上的地图', goal: { type: 'clear', count: 4, family: 'ember', minTier: 4 } },
      { text: '清除 1500 只怪物', goal: { type: 'kills', count: 1500 } },
      { text: '找到一件基底词条 ◆◆◆ 的装备', goal: { type: 'pickup', count: 1, baseLines: 3 } },
      { text: '技能栏放上 2 个技能', goal: { type: 'skills', value: 2 } },
      { text: '攻下余烬之域的首领要塞，取得炉心之印', goal: { type: 'clear', count: 1, family: 'ember', kind: 'boss' } },
    ],
    reward: { currencies: { essence_form: 2, temper: 2, chaos: 3 }, waystones: [[7, 'normal'], [7, 'rare']] },
  },
  {
    id: 'c4', title: '雷鸣信标', sub: '雷暴之域', tiers: 'T6–T8',
    intro: [
      '雷暴之域的尖塔群曾经把阿斯特拉的声音送到群星之间。最高的那座叫「信标」，它会在灾难来临时自动点亮，向所有幸存者报出方位。',
      '七年来，信标一直亮着。没有人回应。',
      '维斯塔想知道，是没有人听见，还是——已经没有人能回答。去信标所在的首领要塞，顺路看看那些被封存的宝库：城邦覆灭前，学者们把能带走的都藏了起来。',
    ],
    outro: [
      '信标的守护者是一团被雷电拴住的风暴，它守了七年，不让任何东西靠近。你打散它的时候，信标里落下第二枚源印，「回响之印」。',
      '借着源印，你第一次听见了信标收到的回应——很微弱，来自北方的冰原：「……书库……还有人……」',
    ],
    steps: [
      { text: '在雷暴之域打通 4 张 T6 及以上的地图', goal: { type: 'clear', count: 4, family: 'storm', minTier: 6 } },
      { text: '打开一座宝库', goal: { type: 'clear', count: 1, kind: 'vault' } },
      { text: '用通货改造装备 10 次', goal: { type: 'craft', count: 10 } },
      { text: '攻下雷暴之域的首领要塞，取得回响之印', goal: { type: 'clear', count: 1, family: 'storm', kind: 'boss' } },
      { text: '打开 T9 的地图', goal: { type: 'tier', value: 9 } },
    ],
    reward: { currencies: { skill_gem: 1, essence_link: 1, augment: 8, seal: 2 }, waystones: [[9, 'normal'], [9, 'magic']] },
  },
  {
    id: 'c5', title: '冰封书库', sub: '霜原之域', tiers: 'T8–T10',
    intro: [
      '霜原之域的书库被冻在一整块冰川里。冰层下面有灯光，还有人影在书架间缓慢移动。',
      '那是最后的书记官们。他们把自己和书一起冻住，用极慢的时间等待救援——在冰里的一天，外面已经是一年。',
      '书库里藏着关于「第一次接触」的记录：七年前那个空洞出现的那一夜，观星塔究竟看见了什么。只是通往书库的路已经被潮水腐化，你得先穿过那些扭曲的土地。',
    ],
    outro: [
      '老书记官隔着冰对你说话，声音像从很远的地方传来：「潮水不是从外面来的。是我们打开的门。」',
      '阿斯特拉最伟大的一次法术，原本想要触碰群星之外的知识。门开了，外面的东西也看见了我们。',
      '他把第三枚源印，「霜誓之印」，推出冰面：「去腐沼。潮水在那里扎了根，它的心在那里跳。」',
    ],
    steps: [
      { text: '在霜原之域打通 4 张 T8 及以上的地图', goal: { type: 'clear', count: 4, family: 'frost', minTier: 8 } },
      { text: '穿过一张腐化的地图', goal: { type: 'clear', count: 1, kind: 'corrupt' } },
      { text: '点满 8 个天赋', goal: { type: 'talent', value: 8 } },
      { text: '攻下霜原之域的首领要塞，取得霜誓之印', goal: { type: 'clear', count: 1, family: 'frost', kind: 'boss' } },
      { text: '打开 T11 的地图', goal: { type: 'tier', value: 11 } },
    ],
    reward: { currencies: { essence_form: 2, essence_link: 1, temper: 3, chaos: 5 }, waystones: [[11, 'magic'], [11, 'rare']] },
  },
  {
    id: 'c6', title: '腐沼之心', sub: '腐沼之域', tiers: 'T10–T12',
    intro: [
      '腐沼之域原本是阿斯特拉的药园。现在整片沼泽都在呼吸——慢、深、规律，像一颗巨大的心脏。',
      '潮水在这里扎了根。越往深处，地图越扭曲，怪物越不像怪物，更像是某种东西在模仿生命的样子。',
      '维斯塔第一次跟你一起走出了营地。她说她想亲眼看看：「我们亲手打开的门，到底让什么进来了。」',
    ],
    outro: [
      '沼泽的心脏里没有怪物，只有一面镜子。镜子里是阿斯特拉七年前的样子：灯火通明，星辰低垂。',
      '你打碎了镜子，第四枚源印「根须之印」从碎片里浮起。维斯塔捂住了眼睛——她在镜子里看见了自己的城邦。',
      '「还差最后一枚，」她说，「在王座那里。在一切开始的地方。」',
    ],
    steps: [
      { text: '在腐沼之域打通 4 张 T10 及以上的地图', goal: { type: 'clear', count: 4, family: 'blight', minTier: 10 } },
      { text: '穿过 2 张 T10 及以上的腐化地图', goal: { type: 'clear', count: 2, kind: 'corrupt', minTier: 10 } },
      { text: '清除 6000 只怪物', goal: { type: 'kills', count: 6000 } },
      { text: '攻下腐沼之域 T10 以上的首领要塞，取得根须之印', goal: { type: 'clear', count: 1, family: 'blight', kind: 'boss', minTier: 10 } },
      { text: '打开 T13 的地图', goal: { type: 'tier', value: 13 } },
    ],
    reward: { currencies: { essence_core: 1, skill_gem: 2, chaos: 6, upgrade: 8 }, waystones: [[13, 'magic'], [13, 'rare']] },
  },
  {
    id: 'c7', title: '五印合鸣', sub: '星图边缘', tiers: 'T11–T14',
    intro: [
      '四枚源印在营地的地图装置上转动，彼此之间牵出细细的光线，像在寻找缺失的那一枚。',
      '星图的边缘，五个地区的第二座要塞同时亮了起来——那是潮水最浓的地方，也是源印共鸣最强的地方。最后一枚印不在某一处，它散落在所有地方。',
      '寻径者，现在你得带着整个阿斯特拉剩下的东西往外走：最好的装备、传说中的器物、你学会的一切。',
    ],
    outro: [
      '当第三座要塞倒下，散落的光点终于汇聚成第五枚源印，「星烬之印」。五印合鸣的那一刻，营地上空的空洞第一次停止了扩大。',
      '维斯塔望着星图最外圈：「门就在那里。旧王的王座。我们打开它的地方，也是我们关上它的地方。」',
    ],
    steps: [
      { text: '攻下 3 座 T11 及以上的首领要塞', goal: { type: 'clear', count: 3, kind: 'boss', minTier: 11 } },
      { text: '得到一件传奇装备', goal: { type: 'legendary' } },
      { text: '打通 6 张 T12 及以上的地图', goal: { type: 'clear', count: 6, minTier: 12 } },
      { text: '打开 T15 的地图', goal: { type: 'tier', value: 15 } },
    ],
    reward: { currencies: { essence_core: 2, seal: 3, chaos: 8, temper: 4 }, waystones: [[15, 'rare'], [15, 'rare']] },
  },
  {
    id: 'c8', title: '虚空之门', sub: '旧王王座', tiers: 'T15–T16',
    intro: [
      '星图的最外圈没有星星。',
      '那里是阿斯特拉七年前施法的地方，旧王站在王座上，向群星之外伸出了手。门就在王座后面，像一道竖着的伤口。',
      '五枚源印在你身边环绕。维斯塔留在营地，守着最后的灯。「去吧，」她说，「如果你回不来，我会一直点着它。」',
    ],
    outro: [
      '你把五枚源印按进门框。门的另一边，无名之潮第一次退缩了——不是被击败，而是被关在了外面。',
      '阿斯特拉回不到从前了。九座城邦只剩一座营地，群星也不会再低垂。但空洞不再扩大，冰里的书记官可以醒来，信标终于收到了第二个回应。',
      '维斯塔的灯还亮着。你回来的时候，她什么也没说，只是把灯往你这边推了推。',
      '——星烬纪 · 完——',
    ],
    steps: [
      { text: '打通 4 张 T15 及以上的地图', goal: { type: 'clear', count: 4, minTier: 15 } },
      { text: '攻下 2 座 T15 及以上的首领要塞', goal: { type: 'clear', count: 2, kind: 'boss', minTier: 15 } },
      { text: '登上旧王王座：攻下废墟之域最外圈的首领要塞', goal: { type: 'clear', count: 1, kind: 'boss', family: 'ruin', minTier: 15 } },
    ],
    reward: { currencies: { essence_core: 3, chaos: 10, skill_gem: 3 }, waystones: [[16, 'rare'], [16, 'rare'], [16, 'rare']] },
  },
]);

export const newQuestState = () => ({ chapter: 0, progress: {}, done: {}, introSeen: -1, claimed: [] });

const ownedItems = save => [...save.inventory, ...Object.values(save.equipped).filter(Boolean)];
/** Current value of a state goal. */
function stateValue(save, g) {
  switch (g.type) {
    case 'tier': return save.unlocked ?? 1;
    case 'talent': return save.talents?.allocated?.length ?? 0;
    case 'skills': return (save.skills ?? []).filter(Boolean).length;
    case 'legendary': return ownedItems(save).some(it => it.legend) ? 1 : 0;
    default: return null;
  }
}
const need = g => g.count ?? g.value ?? 1;
const key = (c, i) => `${c}.${i}`;

/** The chapter the player is on, with every step's progress. null when the story is finished. */
export function questView(save) {
  const q = save.quests ?? newQuestState();
  const ch = CHAPTERS[q.chapter];
  if (!ch) return null;
  const steps = ch.steps.map((s, i) => {
    const k = key(q.chapter, i), sv = stateValue(save, s.goal), n = need(s.goal);
    const have = q.done[k] ? n : sv ?? (q.progress[k] ?? 0);
    return { ...s, have: Math.min(have, n), need: n, done: !!q.done[k] || have >= n };
  });
  return { index: q.chapter, chapter: ch, steps, complete: steps.every(s => s.done), claimed: q.claimed.includes(q.chapter) };
}

function matches(g, ev) {
  switch (g.type) {
    case 'clear': return ev.type === 'clear' && (!g.family || ev.family === g.family) && (!g.kind || ev.kind === g.kind) && (!g.minTier || ev.tier >= g.minTier) ? 1 : 0;
    case 'kills': return ev.type === 'kills' ? ev.n : 0;
    case 'pickup': return ev.type === 'pickup' && (!g.baseLines || baseLinesOf(ev.item) >= g.baseLines) && (!g.legend || ev.item.legend) ? 1 : 0;
    case 'equip': return ev.type === 'equip' ? 1 : 0;
    case 'craft': return ev.type === 'craft' ? 1 : 0;
    default: return 0;
  }
}

/** Mark finished steps (state goals included). Returns [{ type:'step', text } | { type:'chapter', index }]. */
export function questTick(save) {
  save.quests ??= newQuestState();
  const q = save.quests, out = [], v = questView(save);
  if (!v) return out;
  for (const [i, s] of v.steps.entries()) {
    const k = key(q.chapter, i);
    if (s.done && !q.done[k]) { q.done[k] = true; out.push({ type: 'step', text: s.text }); }
  }
  if (v.complete && !v.claimed && !q.ready) { q.ready = true; out.push({ type: 'chapter', index: q.chapter }); }
  return out;
}

/** A game event for the active chapter: { type:'clear', tier, family, kind } · { type:'kills', n } · { type:'pickup', item } · { type:'equip' } · { type:'craft' }. */
export function questEvent(save, ev) {
  save.quests ??= newQuestState();
  const q = save.quests, ch = CHAPTERS[q.chapter];
  if (!ch) return [];
  ch.steps.forEach((s, i) => {
    const k = key(q.chapter, i);
    if (q.done[k] || stateValue(save, s.goal) !== null) return;
    const add = matches(s.goal, ev);
    if (add) q.progress[k] = Math.min(need(s.goal), (q.progress[k] ?? 0) + add);
  });
  return questTick(save);
}

/** Hand out the finished chapter's reward and move to the next chapter. Returns the reward given. */
export function claimChapter(save, rng = Math.random) {
  const q = save.quests, v = questView(save);
  if (!v || !v.complete || v.claimed) return null;
  const r = v.chapter.reward, stones = (r.waystones ?? []).map(([t, rarity]) => rollWaystone(t, rng, rarity));
  for (const [id, n] of Object.entries(r.currencies ?? {})) save.currencies[id] = (save.currencies[id] || 0) + n;
  save.waystones.push(...stones);
  q.claimed.push(q.chapter); q.chapter++; q.ready = false;
  return { currencies: r.currencies ?? {}, waystones: stones };
}

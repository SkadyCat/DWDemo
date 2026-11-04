// 主线「星烬纪」六章（正文在 design/novel/）：你从夜阙醒来，替灯井去外面捡路石，一章一个人的故事，
// 拿回五枚印，最后在旧王的王座前把门关上。每章跟着图集往外推两三阶，章内目标可以按任意顺序完成。
// 支线：「引导」带你把仓库、洗炼、流派、星象、星契、传送门、传奇来历都用一遍；「镇上的事」是夜阙的人托你的小事。
// 支线跟着主线章节解锁，第一步总是去找给任务的人说话（他头上有「！」），做完自动发奖励。
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
 *   talk    { who }                              — talked to a townsperson / NPC (event: who = folk id or station id)
 *   deposit · bd · sigil · portal · lore {}      — put something in the stash · applied a build · opened a map with a 星契 slotted ·
 *                                                  went home through the town portal · read a legendary's story (events)
 *   tier    { value }                            — the highest open map tier is at least value (state)
 *   talent  { value }                            — talent points allocated (state)
 *   skills  { value }                            — skills on the bar (state)
 *   legendary {}                                 — own a legendary item (state)
 */
export const CHAPTERS = Object.freeze([
  {
    id: 'c1', title: '余火', sub: '星冠城城门', tiers: 'T1–T3', who: 'chronicler',
    intro: [
      '你醒来时，背底下是凉的金砖。旁边有人在数路石：「四十二，四十三。」',
      '她叫诺娅，以前在王都管档案。这里是夜阙，王都底下的地下城，住着八百来号人。城中间那口井里烧的是星光，靠路石续着，潮水进不来。',
      '「一天烧一块，省着点，够一个月。」她把账本合上，「你是寻径者，上面的路石得你去捡。先去城门看看。看见穿铠甲的，别跟它讲道理。」',
    ],
    outro: [
      '城门底下那副空铠甲跪下了，戟还横着，里面只有灰在往外漏。布鲁说那是守卫长老霍。',
      '你带回来几块路石，有一块边上烧过。诺娅接过去看了一眼，冲铁匠巷那边喊了一声：「赛琳。」',
      '打了七年的锤子停了。',
    ],
    steps: [
      { text: '去金殿找诺娅（地图仪旁边）', goal: { type: 'talk', who: 'chronicler' } },
      { text: '走出营地之门，打通第一张地图', goal: { type: 'clear', count: 1 } },
      { text: '换上一件捡到的装备', goal: { type: 'equip', count: 1 } },
      { text: '清理城门一带：打通 4 张地图', goal: { type: 'clear', count: 4 } },
      { text: '打开 T3 的地图（打通一张 T2 地图）', goal: { type: 'tier', value: 3 } },
    ],
    reward: { currencies: { augment: 6, upgrade: 3, chaos: 1 }, waystones: [[3, 'normal'], [3, 'magic']] },
  },
  {
    id: 'c2', title: '炉心', sub: '赤铁城 · 余烬之域', tiers: 'T3–T6', who: 'smith',
    intro: [
      '赛琳盯着那块烧过的路石，炉子里的火暗下去一截。「赤铁城，」她说，「我家在那儿。」',
      '后来你从诺娅那儿听说，城破那天晚上，赛琳的父亲把自己关进了最大的那座炉子，说手里的活还没干完。锤子声一直响到天亮。',
      '「去看看。要是他还在锻，就让他停下来。」她把一块混沌石拍在你手里，「洗之前先想清楚你要什么，不然洗到天亮也是白洗。」',
    ],
    outro: [
      '要塞最里面，魔像还在打铁，每一锤都砸在同一个地方。它转过身来，你看清了它的脸。回去以后你没跟赛琳说那张脸长什么样，她也没问。',
      '魔像手里那块铁裂了，里面有一枚印，还是烫的。赛琳把它翻过来：「我爸的字。写的是：信标还亮着。」',
      '「意思是他早知道会这样。」她把印塞回你手里，「去问卡罗吧，信标是他们那边的。」',
    ],
    steps: [
      { text: '去铁匠巷找赛琳', goal: { type: 'talk', who: 'smith' } },
      { text: '用通货洗炼装备 3 次（悬停装备按 Ctrl 钉住提示）', goal: { type: 'craft', count: 3 } },
      { text: '在余烬之域打通 4 张地图', goal: { type: 'clear', count: 4, family: 'ember' } },
      { text: '打完一次试炼：赤铁城的锻造场', goal: { type: 'clear', count: 1, kind: 'trial' } },
      { text: '找到一件基底词条 ◆◆◆ 的装备', goal: { type: 'pickup', count: 1, baseLines: 3 } },
      { text: '攻下余烬之域的首领要塞，取回炉心之印', goal: { type: 'clear', count: 1, family: 'ember', kind: 'boss' } },
      { text: '打开 T6 的地图', goal: { type: 'tier', value: 6 } },
    ],
    reward: { currencies: { essence_form: 2, temper: 2, chaos: 3, seal: 1 }, waystones: [[6, 'normal'], [6, 'rare']] },
  },
  {
    id: 'c3', title: '信标', sub: '鸣金城 · 雷暴之域', tiers: 'T6–T8', who: 'mentor',
    intro: [
      '卡罗听到「信标」两个字，把杯子里剩下的酒一口喝了。「不去。」过了一会儿又说：「你去。我教你点东西，省得你死在那儿。」',
      '他教的是流派。九座城打架的路子都不一样：熔炉城的人不躲，尖塔的人从来不站在原地，书库那帮人最阴，等你自己冻死。',
      '「挑一个，练到别人一看就知道你是哪儿来的。」',
    ],
    outro: [
      '信标顶上缠着的东西有九个头，每个头叫的都是同一句话。离近了你才听清，是在报方位。你把它打散了。',
      '回到酒馆，卡罗没看你：「七年前信标收到过回音，北边的书库，说还有人活着。我把它关了。那东西会顺着声音找过去。」',
      '你把回响之印嵌进他当年拆下来的听筒里。杂音很大，有个女人在念书号，一个接一个，念得很慢。一直坐在最里面那张桌子的伊芙站了起来。',
    ],
    steps: [
      { text: '去半盏灯酒馆找卡罗', goal: { type: 'talk', who: 'mentor' } },
      { text: '技能栏放上 2 个技能', goal: { type: 'skills', value: 2 } },
      { text: '在雷暴之域打通 4 张 T6 及以上的地图', goal: { type: 'clear', count: 4, family: 'storm', minTier: 6 } },
      { text: '打开一座宝库：尖塔的学者连午饭都要上锁', goal: { type: 'clear', count: 1, kind: 'vault' } },
      { text: '攻下雷暴之域的首领要塞，取回回响之印', goal: { type: 'clear', count: 1, family: 'storm', kind: 'boss' } },
      { text: '打开 T9 的地图', goal: { type: 'tier', value: 9 } },
    ],
    reward: { currencies: { skill_gem: 1, essence_link: 1, augment: 8, seal: 2 }, waystones: [[9, 'normal'], [9, 'magic']] },
  },
  {
    id: 'c4', title: '冰封书库', sub: '白卷城 · 霜原之域', tiers: 'T8–T11', who: 'astrologer',
    intro: [
      '「是我老师，」伊芙说，「她念书号就这个调子。」',
      '七年前那天晚上是伊芙值夜。星图上一颗星不见了，她跑去叫醒老师，老师看了一眼，让她马上离开书库。她走了，书库就冻上了。',
      '「冰里面时间走得慢，外面七年，里面也就几天。她可能还以为我刚出门。」她在星图上给你点了几颗星，「这样路上好走一点。」',
    ],
    outro: [
      '老师在冰里，离冰面很近，嘴唇在动，声音要过好一会儿才传出来。她先问伊芙有没有好好吃饭，然后才说正事。',
      '「门是我们开的，旧王开的。他想看看外面有什么，外面的东西也想看看我们。它吃记忆，吃完了照着做。做得不像，它自己也知道。」她把霜誓之印从冰里推出来，推了差不多一顿饭的工夫。「去南边沼泽，它在那儿待得最久。」',
      '你回去转述，伊芙只问了一句：「她瘦了没有？」',
    ],
    steps: [
      { text: '去观星阁找伊芙', goal: { type: 'talk', who: 'astrologer' } },
      { text: '在星图上点满 8 个天赋', goal: { type: 'talent', value: 8 } },
      { text: '在霜原之域打通 4 张 T8 及以上的地图', goal: { type: 'clear', count: 4, family: 'frost', minTier: 8 } },
      { text: '穿过一张腐化的地图：通往书库的路烂掉了', goal: { type: 'clear', count: 1, kind: 'corrupt' } },
      { text: '攻下霜原之域的首领要塞，取回霜誓之印', goal: { type: 'clear', count: 1, family: 'frost', kind: 'boss' } },
      { text: '打开 T11 的地图', goal: { type: 'tier', value: 11 } },
    ],
    reward: { currencies: { essence_form: 2, essence_link: 1, temper: 3, chaos: 5 }, waystones: [[11, 'magic'], [11, 'rare']] },
  },
  {
    id: 'c5', title: '腐沼之心', sub: '青苔园 · 腐沼之域', tiers: 'T11–T13', who: 'collector',
    intro: [
      '沼泽是维克的地方，他在那儿种了四十年药。',
      '他打开库房最里面那一格给你看：几十件传奇擦得锃亮，一件挨一件，每件底下压一张纸条。「人被吃了，东西吃不掉。东西上还留着一点人。等门关了，我挨个给他们送回去。」',
      '「送到哪儿？」「还没想好。」他从兜里掏出几枚小符片：「星契。药园的人埋在药草底下，长得好。你搁在地图仪边上，那张图也长得好。」',
    ],
    outro: [
      '沼泽最深处有一棵蘑菇古树，树心里嵌着一面镜子。镜子里是七年前的王都，灯全亮着，街上有人。你把镜子砸了，根须之印从碎片里浮出来。',
      '回到夜阙，诺娅把笔放下了。这是你第一次看见她手里没在写东西。',
      '「最后一枚在王座，」她说，「那天晚上咒是我念的。我站在他左边。」',
    ],
    steps: [
      { text: '去库房找维克', goal: { type: 'talk', who: 'collector' } },
      { text: '在地图仪的法阵槽里放一枚星契，再开图', goal: { type: 'sigil' } },
      { text: '在腐沼之域打通 4 张 T11 及以上的地图', goal: { type: 'clear', count: 4, family: 'blight', minTier: 11 } },
      { text: '穿过 2 张 T11 及以上的腐化地图', goal: { type: 'clear', count: 2, kind: 'corrupt', minTier: 11 } },
      { text: '得到一件传奇装备', goal: { type: 'legendary' } },
      { text: '攻下腐沼之域的首领要塞，取回根须之印', goal: { type: 'clear', count: 1, family: 'blight', kind: 'boss', minTier: 11 } },
      { text: '打开 T13 的地图', goal: { type: 'tier', value: 13 } },
    ],
    reward: { currencies: { essence_core: 2, skill_gem: 2, chaos: 8, upgrade: 8 }, waystones: [[13, 'magic'], [13, 'rare']] },
  },
  {
    id: 'c6', title: '旧王的宝库', sub: '五域最远的要塞 · 王座', tiers: 'T13–T16', who: 'chronicler',
    intro: [
      '诺娅说旧王没什么坏心，就是收东西收上了瘾。九座城最好的兵器、盔甲、法器，他全搬进了自己的库房，夜阙就是库房的门厅。',
      '「门一开，它先吃的就是他。现在王座上坐着的，是照着他做的。他的库房它也记得。」最后一枚印碎成了五块，散在五个地区最远的要塞里。',
      '去王座之前，诺娅把灯递给你，想了想又拿了回去：「算了，我在这儿点着，你回来好找路。」',
    ],
    outro: [
      '王座上那个人很客气。他请你看他的收藏，身后一扇接一扇金色的门打开，每扇门里伸出一件兵器，对准你。打到一半，他问你为什么要关门。你没回答，他也没再问。',
      '你把五枚印按进门框。门那边的东西往后退了一点，又退了一点，然后就不动了。',
      '第二天，灯井第一次不用续路石。诺娅在账本上写：今天没续。灯旁边放着一把钥匙，不知道是谁搁的。',
      '——星烬纪 · 完——',
    ],
    steps: [
      { text: '去金殿找诺娅', goal: { type: 'talk', who: 'chronicler' } },
      { text: '攻下 5 座 T13 及以上的首领要塞，拿回五块碎印', goal: { type: 'clear', count: 5, kind: 'boss', minTier: 13 } },
      { text: '打通 6 张 T15 及以上的地图', goal: { type: 'clear', count: 6, minTier: 15 } },
      { text: '登上旧王的王座：攻下废墟之域最外圈的首领要塞', goal: { type: 'clear', count: 1, kind: 'boss', family: 'ruin', minTier: 15 } },
    ],
    reward: { currencies: { essence_core: 3, chaos: 10, skill_gem: 3, seal: 3 }, waystones: [[16, 'rare'], [16, 'rare'], [16, 'rare']] },
  },
]);

/**
 * Side quests. after: the main chapter (index) from which it is offered. giver: who gives it (the first step talks to them).
 * kind: 'guide' (learn a system) or 'town' (somebody in 夜阙 asks you something). ask: what they say when you take it; done: when you finish.
 */
export const SIDE_QUESTS = Object.freeze([
  // ---- 引导 ----
  { id: 'g_stash', kind: 'guide', after: 0, giver: 'torg', giverName: '托格', title: '库房的规矩', ask: '东西别都揣身上。库房里有你一个箱子，用不着的放进去。',
    steps: [{ text: '去库房找托格', goal: { type: 'talk', who: 'torg' } }, { text: '把一件装备存进仓库（库房门前的宝箱，或背包里 Ctrl + 左键）', goal: { type: 'deposit' } }],
    done: '存进去的东西丢不了。封门那边的就别想了。', reward: { currencies: { augment: 3, upgrade: 2 } } },
  { id: 'g_portal', kind: 'guide', after: 0, giver: 'grey', giverName: '格雷', title: '回家的路', ask: '出去别一口气走到底。打不动了就开个门回来，地图给你留着。',
    steps: [{ text: '在酒馆后院找格雷', goal: { type: 'talk', who: 'grey' } }, { text: '在地图里用传送门回家一趟（T），地图不会关', goal: { type: 'portal' } }],
    done: '拾荒队没这本事。我们出去一趟，回来就得重新走。', reward: { currencies: { upgrade: 3, chaos: 1 } } },
  { id: 'g_bd', kind: 'guide', after: 1, giver: 'mentor', giverName: '卡罗', title: '换条路走', ask: '你那打法谁教的？没人教？那我教你几套。',
    steps: [{ text: '去半盏灯酒馆门口找卡罗', goal: { type: 'talk', who: 'mentor' } }, { text: '在流派面板（B）换上一套流派', goal: { type: 'bd' } }],
    done: '先把一样东西练到极致，再谈别的。', reward: { currencies: { chaos: 2, augment: 4 } } },
  { id: 'g_talent', kind: 'guide', after: 1, giver: 'astrologer', giverName: '伊芙', title: '星图上的第一颗', ask: '你打通的那些地方，星图上会亮回来。来，我给你点一颗。',
    steps: [{ text: '去观星阁找伊芙', goal: { type: 'talk', who: 'astrologer' } }, { text: '在星图（P）上点 2 个天赋', goal: { type: 'talent', value: 2 } }],
    done: '亮起来了。看见没有，就那一颗。', reward: { currencies: { upgrade: 3, augment: 3 } } },
  { id: 'g_lore', kind: 'guide', after: 2, giver: 'collector', giverName: '维克', title: '纸条', ask: '每件东西底下我都压了一张纸条。你去图鉴里看看，看一件就行。',
    steps: [{ text: '去库房找维克', goal: { type: 'talk', who: 'collector' } }, { text: '在传奇图鉴（L）里读一件传奇的来历', goal: { type: 'lore' } }],
    done: '每张纸条我都写了名字。有几张写不出来，就写了城。', reward: { currencies: { chaos: 2, temper: 1 } } },
  { id: 'g_sigil', kind: 'guide', after: 2, giver: 'collector', giverName: '维克', title: '埋在药草底下的', ask: '拿着。放在地图仪边上那几个槽里，再开图试试。',
    steps: [{ text: '再去找维克', goal: { type: 'talk', who: 'collector' } }, { text: '从背包把一枚星契拖进地图仪的法阵槽，开一张图', goal: { type: 'sigil' } }],
    done: '长得好吧？药园的人就是这么种东西的。', reward: { currencies: { chaos: 2 }, scarabs: { bounty_1: 2, swarm_1: 1 } } },
  // ---- 镇上的事 ----
  { id: 't_bread', kind: 'town', after: 0, giver: 'rosa', giverName: '罗莎', title: '绿面包', ask: '苔藓粉快没了。城门边上长了一片，拾荒队不敢去，怪太多。',
    steps: [{ text: '去集市街的面包摊找罗莎', goal: { type: 'talk', who: 'rosa' } }, { text: '出去清掉 300 只怪，拾荒队才敢去城门边上摘苔藓', goal: { type: 'kills', count: 300 } }],
    done: '苔藓摘回来了。明天的面包还是绿的，不过是新鲜的绿。', reward: { currencies: { augment: 4, upgrade: 2 } } },
  { id: 't_xiaodou', kind: 'town', after: 0, giver: 'xiaodou', giverName: '小豆', title: '会走的蘑菇', ask: '你下回出去，回来给我讲讲上面什么样。要讲三张图的！',
    steps: [{ text: '在灯井边找小豆', goal: { type: 'talk', who: 'xiaodou' } }, { text: '打通 3 张地图，回来讲给他听', goal: { type: 'clear', count: 3 } }],
    done: '蘑菇真的有脚？几只脚？你数了没有？', reward: { currencies: { upgrade: 3, chaos: 1 } } },
  { id: 't_chestnut', kind: 'town', after: 1, giver: 'helen', giverName: '海伦', title: '栗子', ask: '你去赤铁城的时候帮我看看。看见一个爱偷栗子的小子，回来告诉我一声。算了，看看就行。',
    steps: [{ text: '去棚户区的公共灶台找海伦', goal: { type: 'talk', who: 'helen' } }, { text: '在余烬之域打通 3 张地图', goal: { type: 'clear', count: 3, family: 'ember' } }],
    done: '没看见他就好。没看见，就还能想着他在哪儿偷栗子。', reward: { currencies: { chaos: 2, temper: 1 } } },
  { id: 't_board', kind: 'town', after: 2, giver: 'mati', giverName: '玛蒂', title: '留言墙', ask: '留言墙上那些纸条，都是找人的。宝库里要是有谁的东西，给我带回来。',
    steps: [{ text: '去半盏灯酒馆门口找玛蒂', goal: { type: 'talk', who: 'mati' } }, { text: '打通 2 座宝库，看看有没有谁的东西', goal: { type: 'clear', count: 2, kind: 'vault' } }],
    done: '这枚戒指我认得，是墙上第三张纸条那家的。我去给他们送过去。', reward: { currencies: { chaos: 3, essence_link: 1 } } },
  { id: 't_crow', kind: 'town', after: 3, giver: 'lia', giverName: '莉亚', title: '老九', ask: '老九想出去，我们不放心。你先去北边替它看看路。',
    steps: [{ text: '去观星阁楼下找莉亚和莉娜', goal: { type: 'talk', who: 'lia' } }, { text: '在霜原之域打通 3 张地图，替老九探探路', goal: { type: 'clear', count: 3, family: 'frost' } }],
    done: '老九今天飞到穹顶缝那儿又回来了。它说上面冷。', reward: { currencies: { temper: 2, augment: 4 } } },
  { id: 't_shoe', kind: 'town', after: 3, giver: 'owen', giverName: '欧文', title: '红鞋', ask: '渡鸦湾那边，你去的时候留神。穿红衣服的小姑娘，别打她。',
    steps: [{ text: '去集市街的修鞋摊找欧文', goal: { type: 'talk', who: 'owen' } }, { text: '在废墟之域打通 4 张 T8 及以上的地图：渡鸦湾在那边', goal: { type: 'clear', count: 4, family: 'ruin', minTier: 8 } }],
    done: '鞋我补好了，放在这儿。她来了就穿得上。', reward: { currencies: { chaos: 3, essence_form: 1 } } },
  { id: 't_boat', kind: 'town', after: 4, giver: 'xu', giverName: '老许', title: '漂下来的鞋', ask: '水道那头以前通渡鸦湾。你往外走远一点，看看水那头有没有光。',
    steps: [{ text: '去暗河码头找老许', goal: { type: 'talk', who: 'xu' } }, { text: '打通 5 张 T11 及以上的地图', goal: { type: 'clear', count: 5, minTier: 11 } }],
    done: '水道那头有光了。我不去，我就看看。', reward: { currencies: { chaos: 4, essence_link: 1 } } },
  { id: 't_guard', kind: 'town', after: 5, giver: 'bru', giverName: '布鲁', title: '王座边上的岗', ask: '王座那边的要塞，你先去敲两座。我当年就站在那儿。',
    steps: [{ text: '在灯井广场找布鲁', goal: { type: 'talk', who: 'bru' } }, { text: '攻下 2 座 T14 及以上的首领要塞', goal: { type: 'clear', count: 2, kind: 'boss', minTier: 14 } }],
    done: '他要是问你吃了没有，别答。', reward: { currencies: { essence_core: 1, chaos: 5 } } },
  { id: 't_key', kind: 'town', after: 6, giver: 'torg', giverName: '托格', title: '托格的钥匙', ask: '门关上了？那封门的钥匙，我也该交了。你再去最远的地方转一圈。',
    steps: [{ text: '去库房找托格', goal: { type: 'talk', who: 'torg' } }, { text: '打通 3 张 T16 的地图', goal: { type: 'clear', count: 3, minTier: 16 } }],
    done: '封门可以开了。开了也没什么，里面都是灰。', reward: { currencies: { essence_core: 2, seal: 2 } } },
]);

// saves from the eight-chapter story: where each old chapter lands in the six-chapter one
const OLD_EIGHT = [0, 1, 1, 2, 3, 4, 5, 5, 6];
export const newQuestState = () => ({ v: 2, chapter: 0, progress: {}, done: {}, introSeen: -1, claimed: [], side: { progress: {}, done: {}, claimed: [] } });
/** Bring a save's quest state up to date (old eight-chapter saves move to the matching new chapter). */
export function migrateQuests(save) {
  const q = save.quests;
  if (!q) { save.quests = newQuestState(); return save.quests; }
  if (q.v !== 2) {
    const ch = OLD_EIGHT[Math.min(8, q.chapter ?? 0)];
    save.quests = { ...newQuestState(), chapter: ch, introSeen: ch - 1, claimed: [...Array(ch).keys()] };
  }
  save.quests.side ??= { progress: {}, done: {}, claimed: [] };
  return save.quests;
}

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
/** Steps with progress; store = { progress, done } of the main story or the side quests. */
function stepsOf(save, steps, prefix, store) {
  return steps.map((s, i) => {
    const k = key(prefix, i), sv = stateValue(save, s.goal), n = need(s.goal);
    const have = store.done[k] ? n : sv ?? (store.progress[k] ?? 0);
    return { ...s, have: Math.min(have, n), need: n, done: !!store.done[k] || have >= n };
  });
}

/** The chapter the player is on, with every step's progress. null when the story is finished. */
export function questView(save) {
  const q = migrateQuests(save), ch = CHAPTERS[q.chapter];
  if (!ch) return null;
  const steps = stepsOf(save, ch.steps, q.chapter, q);
  return { index: q.chapter, chapter: ch, steps, complete: steps.every(s => s.done), claimed: q.claimed.includes(q.chapter) };
}

/** Side quests offered so far: { quest, steps, state: 'offer' (talk to the giver) | 'active' | 'done' }. */
export function sideView(save) {
  const q = migrateQuests(save), s = q.side;
  return SIDE_QUESTS.filter(x => q.chapter >= x.after).map(x => {
    const steps = stepsOf(save, x.steps, x.id, s), claimed = s.claimed.includes(x.id);
    return { quest: x, steps, state: claimed ? 'done' : steps[0].done ? 'active' : 'offer' };
  });
}
/** Who has something for you right now (a 「！」 over their head): ids of townsfolk / stations. */
export function questGivers(save) {
  const out = new Set(), v = questView(save);
  if (v) { const st = v.steps[0]; if (st.goal.type === 'talk' && !st.done) out.add(st.goal.who); }
  for (const x of sideView(save)) if (x.state === 'offer') out.add(x.quest.giver);
  return out;
}

function matches(g, ev) {
  switch (g.type) {
    case 'clear': return ev.type === 'clear' && (!g.family || ev.family === g.family) && (!g.kind || ev.kind === g.kind) && (!g.minTier || ev.tier >= g.minTier) ? 1 : 0;
    case 'kills': return ev.type === 'kills' ? ev.n : 0;
    case 'pickup': return ev.type === 'pickup' && (!g.baseLines || baseLinesOf(ev.item) >= g.baseLines) && (!g.legend || ev.item.legend) ? 1 : 0;
    case 'talk': return ev.type === 'talk' && ev.who === g.who ? 1 : 0;
    case 'equip': case 'craft': case 'deposit': case 'bd': case 'sigil': case 'portal': case 'lore': return ev.type === g.type ? 1 : 0;
    default: return 0;
  }
}
function advance(save, steps, prefix, store, ev, gate = true) {
  steps.forEach((s, i) => {
    const k = key(prefix, i);
    if (store.done[k] || stateValue(save, s.goal) !== null) return;
    // the first step of a side quest is taking it: nothing else counts before you have talked to the giver
    if (!gate && i > 0) return;
    const add = matches(s.goal, ev);
    if (add) store.progress[k] = Math.min(need(s.goal), (store.progress[k] ?? 0) + add);
  });
}

/** Mark finished steps (state goals included), pay out finished side quests.
 *  Returns [{ type:'step', text } | { type:'chapter', index } | { type:'side', quest, reward }]. */
export function questTick(save) {
  const q = migrateQuests(save), out = [], v = questView(save);
  if (v) {
    for (const [i, s] of v.steps.entries()) {
      const k = key(q.chapter, i);
      if (s.done && !q.done[k]) { q.done[k] = true; out.push({ type: 'step', text: s.text }); }
    }
    if (v.complete && !v.claimed && !q.ready) { q.ready = true; out.push({ type: 'chapter', index: q.chapter }); }
  }
  for (const x of sideView(save)) {
    if (x.state === 'done') continue;
    for (const [i, s] of x.steps.entries()) {
      const k = key(x.quest.id, i);
      if (s.done && !q.side.done[k]) { q.side.done[k] = true; if (i === 0) out.push({ type: 'take', quest: x.quest }); else if (i < x.steps.length - 1) out.push({ type: 'step', text: s.text }); }
    }
    if (x.steps.every(s => s.done)) {
      const r = x.quest.reward ?? {};
      for (const [id, n] of Object.entries(r.currencies ?? {})) save.currencies[id] = (save.currencies[id] || 0) + n;
      if (r.scarabs) { save.scarabs ??= {}; for (const [id, n] of Object.entries(r.scarabs)) save.scarabs[id] = (save.scarabs[id] || 0) + n; }
      q.side.claimed.push(x.quest.id);
      out.push({ type: 'side', quest: x.quest, reward: r });
    }
  }
  return out;
}

/** A game event: { type:'clear', tier, family, kind } · { type:'kills', n } · { type:'pickup', item } · { type:'equip' } · { type:'craft' } ·
 *  { type:'talk', who } · { type:'deposit' | 'bd' | 'sigil' | 'portal' | 'lore' }. Counts for the chapter and every side quest on offer. */
export function questEvent(save, ev) {
  const q = migrateQuests(save), ch = CHAPTERS[q.chapter];
  if (ch) advance(save, ch.steps, q.chapter, q, ev);
  for (const x of sideView(save)) if (x.state !== 'done') advance(save, x.quest.steps, x.quest.id, q.side, ev, x.state === 'active');
  return questTick(save);
}

/** Hand out the finished chapter's reward and move to the next chapter. Returns the reward given. */
export function claimChapter(save, rng = Math.random) {
  const q = migrateQuests(save), v = questView(save);
  if (!v || !v.complete || v.claimed) return null;
  const r = v.chapter.reward, stones = (r.waystones ?? []).map(([t, rarity]) => rollWaystone(t, rng, rarity));
  for (const [id, n] of Object.entries(r.currencies ?? {})) save.currencies[id] = (save.currencies[id] || 0) + n;
  save.waystones.push(...stones);
  q.claimed.push(q.chapter); q.chapter++; q.ready = false;
  return { currencies: r.currencies ?? {}, waystones: stones };
}

// Where a step sends you at home: a person, a station, or out through the map device.
const STEP_PLACE = { deposit: 'stash', bd: 'mentor', lore: 'collector', talent: 'astrologer', craft: 'smith', sigil: 'device' };
/**
 * What the tracker follows: the chapter by default, or the side quest `trackId` while it is open.
 * Returns { title, text, who? } — who: a townsperson / station id to walk to at home ('device' = go out into a map);
 * no who: nothing to walk to (claim the chapter reward from the tracker).
 */
export function trackHint(save, trackId = null) {
  const side = trackId ? sideView(save).find(x => x.quest.id === trackId && x.state !== 'done') : null;
  if (side) {
    const st = side.steps.find(s => !s.done) ?? side.steps[0];
    return { id: side.quest.id, title: side.quest.title, text: st.text, who: st.goal.type === 'talk' ? st.goal.who : STEP_PLACE[st.goal.type] ?? 'device' };
  }
  const v = questView(save);
  if (!v) return null;
  const st = v.steps.find(s => !s.done);
  if (!st) return { id: null, title: v.chapter.title, text: '本章完成 · 点任务栏领取奖励' };
  return { id: null, title: v.chapter.title, text: st.text, who: st.goal.type === 'talk' ? st.goal.who : STEP_PLACE[st.goal.type] ?? 'device' };
}

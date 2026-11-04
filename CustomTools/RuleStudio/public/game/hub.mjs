// 家：夜阙城（王都底下的地下城，见 town.mjs 和 design/novel/设定集.md）。诺娅在北面金殿的地图仪旁，赛琳在东边铁匠巷，
// 卡罗在西边半盏灯酒馆门口，伊芙在西北观星阁，维克和仓库宝箱在东北库房。
// 没有怪物；点 NPC / 仓库 / 地图仪，英雄走过去，到了就打开对应的界面。镇上的其他人见 town.mjs。

// The home is the town of 夜阙 now (town.mjs): its districts are the rooms below.
import { TOWN_LAYOUT } from './town.mjs';
export const HUB_LAYOUT = TOWN_LAYOUT;

/** room: which room; at: tile offset from the room centre. panel: what opens when you talk to them. */
export const NPCS = [
  { id: 'smith', name: '赛琳', title: '铁匠', skin: 'Pyromancer', panel: 'craft', room: 2, at: [-1, -3],
    lines: ['炉子一直热着。拿来吧，看看能把它洗成什么样。', '好兵器靠的不是运气——好吧，大半是运气。', '封印符省着用，洗坏了别来哭。'] },
  { id: 'mentor', name: '卡罗', title: '流派导师', skin: 'Warlock', panel: 'bd', room: 3, at: [2, -2],
    lines: ['每一种打法都是一条路。想换条路走走？', '先把一样东西练到极致，再谈别的。', '核心那件装备，才是一套流派的心脏。'] },
  { id: 'chronicler', name: '诺娅', title: '史官', skin: 'Wizard', panel: 'quest', room: 1, at: [-4, -2],
    lines: ['星烬纪还没写完，下一页该你了。', '外面的地图一张比一张深，记得活着回来。', '打通的每一个节点，我都记在这里。'] },
  { id: 'collector', name: '维克', title: '传奇收藏家', skin: 'Druid', panel: 'codex', room: 8, at: [-1, -3],
    lines: ['传奇不会自己找上门，可它们总会出现在首领身边。', '每一件传奇都改写一种打法。你见过几件了？', '仓库里专门留了放传奇的格子，每种十件。'] },
  { id: 'astrologer', name: '伊芙', title: '星象师', skin: 'Frost', panel: 'talents', room: 7, at: [1, -2],
    lines: ['星图上亮起的每一颗，都是你打通的地图。', '天赋点不够？去外面多打通几个节点。', '星象不会骗人，只是有点难懂。'] },
];

/** Stations that are not people: the stash chest and the map device. */
export const STATIONS = [
  { id: 'stash', name: '仓库', title: '存放物品', panel: 'vault', room: 8, at: [-4, -3] },   // 库房门前
  { id: 'device', name: '地图仪', title: '放入路石 · 打开图集', panel: 'atlas', room: 1, at: [0, -2] },   // 金殿台阶前
  // the world loop (design/world-loop.md): buy and sell, contracts, hired hands
  { id: 'shop', name: '商会', title: '买卖物资 · 出售装备', panel: 'shop', room: 4, at: [1, -4] },        // 集市街南头
  { id: 'board', name: '布告板', title: '委托 · 势力声望', panel: 'board', room: 0, at: [4, -4] },        // 灯井广场东南角
  { id: 'guild', name: '冒险者公会', title: '雇佣兵 · 派出征', panel: 'guild', room: 3, at: [-3, -2] },  // 半盏灯酒馆门口
];

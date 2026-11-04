// 家：初始地牢。一座安全的小地牢——大厅里站着几位 NPC，仓库宝箱就在大厅西侧，北面圣所里是地图仪，西厢是星象台。
// 没有怪物；点 NPC / 仓库 / 地图仪，英雄走过去，到了就打开对应的界面。

// Rooms in tiles (MAP_SIZE 45; +y is up on screen). The first room is where you arrive.
export const HUB_LAYOUT = {
  rooms: [
    { x: 16, y: 15, w: 13, h: 11, kind: 'home' },      // 0 大厅
    { x: 19, y: 28, w: 7, h: 6, kind: 'sanctum' },     // 1 北：地图仪
    { x: 8, y: 17, w: 6, h: 7, kind: 'home' },         // 2 西：星象台
  ],
  links: [[0, 1], [0, 2]],
};

/** room: which room; at: tile offset from the room centre. panel: what opens when you talk to them. */
export const NPCS = [
  { id: 'smith', name: '赛琳', title: '铁匠', skin: 'Pyromancer', panel: 'craft', room: 0, at: [-3, 2],
    lines: ['炉子一直热着。拿来吧，看看能把它洗成什么样。', '好兵器靠的不是运气——好吧，大半是运气。', '封印符省着用，洗坏了别来哭。'] },
  { id: 'mentor', name: '卡罗', title: '流派导师', skin: 'Warlock', panel: 'bd', room: 0, at: [3, 2],
    lines: ['每一种打法都是一条路。想换条路走走？', '先把一样东西练到极致，再谈别的。', '核心那件装备，才是一套流派的心脏。'] },
  { id: 'chronicler', name: '诺娅', title: '史官', skin: 'Wizard', panel: 'quest', room: 0, at: [-3, -2],
    lines: ['星烬纪还没写完，下一页该你了。', '外面的地图一张比一张深，记得活着回来。', '打通的每一个节点，我都记在这里。'] },
  { id: 'collector', name: '维克', title: '传奇收藏家', skin: 'Druid', panel: 'codex', room: 0, at: [3, -2],
    lines: ['传奇不会自己找上门，可它们总会出现在首领身边。', '每一件传奇都改写一种打法。你见过几件了？', '仓库里专门留了放传奇的格子，每种十件。'] },
  { id: 'astrologer', name: '伊芙', title: '星象师', skin: 'Frost', panel: 'talents', room: 2, at: [0, 1],
    lines: ['星图上亮起的每一颗，都是你打通的地图。', '天赋点不够？去外面多打通几个节点。', '星象不会骗人，只是有点难懂。'] },
];

/** Stations that are not people: the stash chest and the map device. */
export const STATIONS = [
  { id: 'stash', name: '仓库', title: '存放物品', panel: 'vault', room: 0, at: [-4, 0] },   // 大厅西侧，和英雄同一高度，一进门就看得见
  { id: 'device', name: '地图仪', title: '放入路石 · 打开图集', panel: 'atlas', room: 1, at: [0, 0] },
];

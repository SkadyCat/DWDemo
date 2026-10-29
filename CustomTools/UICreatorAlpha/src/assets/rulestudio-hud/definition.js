// Presentation contract copied from RuleStudio's battle-functions.mjs and loadout.mjs.
// No battle engine, player storage or UE dependency is loaded by this UI project.
export const BATTLE_FUNCTIONS = [
  ['inventory', '背包', 'B', 'M7 8V6a5 5 0 0 1 10 0v2M5 8h14l2 13H3L5 8Zm3 5h8v5H8z'],
  ['character', '属性与特性', 'C', 'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM4 21v-3a8 8 0 0 1 16 0v3H4Z'],
  ['skills', '技能装配', '', 'M3 4h7l2 2 2-2h7v16h-7l-2 2-2-2H3V4Zm12 2v16M6 8h3M6 12h3m6-4h3m-3 4h3'],
  ['equipment', '装备配置', '', 'm8 3-5 4 3 5 3-2v11h6V10l3 2 3-5-5-4-4 3-4-3Z'],
  ['belt', '消耗品', '', 'M9 2h6v4l-1 2 5 6a5 5 0 0 1-4 8H9a5 5 0 0 1-4-8l5-6-1-2V2Zm-2 13h10M9 5h6'],
  ['bd', '可用 BD', '', 'm12 2 10 6-10 6L2 8l10-6ZM2 12l10 6 10-6M2 16l10 6 10-6'],
  ['hunter', '掉落 Hunter', '', 'M12 2v4m0 12v4M2 12h4m12 0h4M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm0 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z'],
  ['map', '地图装备', '', 'm3 5 6-3 6 3 6-3v17l-6 3-6-3-6 3V5Zm6-3v17m6-14v17'],
  ['lineage', '怪物谱系', '', 'm5 8-2-5 6 3h6l6-3-2 5v8l-7 6-7-6V8Zm3 3h2m4 0h2m-7 5 3 2 3-2'],
  ['settings', '战场设置', '', 'M12 3v3m0 12v3M3 12h3m12 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2M12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12Zm0 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z'],
  ['shop', '商店', '', 'M3 9h18L19 3H5L3 9Zm1 0v12h16V9M8 21v-7h8v7M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0'],
  ['craft', '洗炼', '', 'm3 5 4-3 7 7-4 4-7-8Zm8 7 8 9 3-3-9-8M2 22h8M5 18v4'],
].map(([id, name, key, path]) => ({ id, name, key, path }));

export const SAMPLE_SKILLS = [
  { id: 'flame_burst', name: '烈焰爆发', granted: true, icon: 'hud-svg-flame-glyph', description: '以自身为中心释放烈焰，对周围敌人造成火焰伤害。' },
  { id: 'frost_lance', name: '冰锥术', granted: false, icon: 'rs-svg-frost', description: '朝瞄准方向发射冰锥，命中时施加冰缓。' },
  { id: 'sentinel', name: '召唤哨卫', granted: false, icon: 'rs-svg-sentinel', description: '召唤哨卫协同战斗，受召唤数量与控制上限限制。' },
  { id: 'poison_flask', name: '毒瓶', granted: true, icon: 'rs-svg-poison', iconMode: 'tile', description: '投掷毒瓶，命中时造成毒素伤害并施加中毒。' },
];
export const REFERENCE_SKILL_IDS = ['poison_flask'];
export const EQUIPMENT_SLOTS = ['武器', '副手', '头盔', '胸甲', '手套', '鞋子', '腰带', '护符', '戒指'];
export const SAMPLE_ITEMS = ['燎火权杖', '守望者之靴', '气血药剂', '寒霜药剂', '下品灵石', '陨星石', '上品灵石', '中品灵石'];
export const SAMPLE_BDS = ['燎原攻守', '余烬回响', '万剑归宗', '召唤万剑', '自毒流', '赤焰战犬'];

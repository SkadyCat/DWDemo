// Slot ownership is structural metadata; it does not add rule-engine stats or actions.
export const SLOTS = Object.freeze([
  { id: 'lineage', name: '谱系', system: true, pawns: ['monster'] },
  { id: 'rarity', name: '稀有度', system: true, pawns: ['monster'] },
  { id: 'tower', name: '塔地图属性', system: true, pawns: ['monster', 'player'] },
  { id: 'character', name: '角色', system: true, pawns: ['player'] },
  { id: 'default', name: '默认装备', system: true, pawns: ['summon'] },
  { id: 'map', name: '地图', system: true, pawns: ['map'] },
  ...[
    ['weapon', '武器'], ['offhand', '副手'], ['helmet', '头盔'], ['chest', '胸甲'],
    ['gloves', '手套'], ['boots', '鞋子'], ['belt', '腰带'], ['amulet', '护符'], ['ring', '戒指'],
  ].map(([id, name]) => ({ id, name, pawns: ['player', 'map'] })),
]);
export const isFixedEquipmentSlot = id => SLOTS.some(slot => slot.id === id && slot.system);
export const pawnEquipmentSlots = kind => SLOTS.filter(slot => slot.pawns.includes(kind));
export const fixedEquipmentSlots = kind => pawnEquipmentSlots(kind).filter(slot => slot.system);
export const PLAYER_GEAR_SLOTS = Object.freeze(pawnEquipmentSlots('player').filter(slot => !slot.system));
export const MONSTER_FIXED_SLOTS = Object.freeze(fixedEquipmentSlots('monster'));
export const PLAYER_FIXED_SLOTS = Object.freeze(fixedEquipmentSlots('player'));

// Saved ownership containers only; these never participate in combat aggregation.
import { PLAYER_GEAR_SLOTS } from '../../engine/equipment-slots.mjs';
import { cleanBelt } from '../../engine/skill-types.mjs';
import { inventoryEntries } from '../battle-panels.mjs';
import { partitionInventory } from '../inventory-compartments.mjs';
import { INVENTORY_PAGE_SIZE, reconcileInventoryLayout, reducePlacedStack } from '../inventory-layout.mjs';

const emptyStorage = () => ({ instances: {}, owned: { equipment: {}, item: {}, skill: {} },
  loadout: { equipment: {}, skills: [], belt: [] }, bagLayout: null });
export const freshHideout = () => ({ version: 2, stash: emptyStorage(), merchant: { inventory: emptyStorage() } });

// The player's shared bag uses the same unworn copies as the battle backpack.
// Including worn copies here makes the two layout watchers undo each other forever.
export function hideoutInventoryEntries(containers,collections){
  return Object.fromEntries(Object.entries(containers).map(([side,state])=>{
    const rows=state?inventoryEntries(state,collections):[];
    return [side,side==='bag'?partitionInventory(rows).ordinary:rows];
  }));
}

/** Keep existing stash and player goods; the former generated NPC stock was never player property. */
export function ensureHideout(player) {
  if (!player.hideout) player.hideout = freshHideout();
  player.hideout.version = 2;
  player.hideout.stash ||= emptyStorage();
  if (!player.hideout.merchant?.inventory) player.hideout.merchant = { inventory: emptyStorage() };
  return player.hideout;
}

/** Transfer ownership, preserving the original UID, tier, affixes and crafting selections. */
function transferItem(player, collections, storage, { direction, kind, id, count = 1, stackKey, targetIndex } = {}) {
  if (!storage) return { error: '物品容器尚未打开' };
  if (!['deposit', 'withdraw'].includes(direction)) return { error: '无效的转移操作' };
  if (!['equipment', 'item'].includes(kind)) return { error: '只有装备与道具可以转移' };
  if (typeof id !== 'string' || !id) return { error: '物品不存在' };
  if (!Number.isSafeInteger(count) || count < 1) return { error: '物品数量无效' };
  const depositing = direction === 'deposit', source = depositing ? player : storage, target = depositing ? storage : player;
  const instance = kind === 'equipment' && Object.hasOwn(source.instances, id) ? source.instances[id] : null;
  const doc = instance || collections[kind]?.get(id)?.doc;
  if (!doc) return { error: '物品不存在' };
  if (kind === 'equipment' && !PLAYER_GEAR_SLOTS.some(slot => slot.id === doc.slot)) return { error: '固定装备不能转移' };
  if (depositing && kind === 'equipment' && Object.values(player.loadout.equipment).includes(id)) return { error: '请先卸下这件装备' };
  const available = instance ? 1 : source.owned[kind][id] || 0;
  if (!Number.isSafeInteger(available) || count > available || (instance && instance.uid !== id)) return { error: '物品数量不足' };
  if (instance && (count !== 1 || target.instances[id])) return { error: '装备实例无效或已存在' };
  const next = instance ? 1 : (target.owned[kind][id] || 0) + count;
  if (!Number.isSafeInteger(next) || next > 9999) return { error: '该物品数量已达上限' };
  const placed = source.bagLayout?.slots?.find(slot => slot?.key === stackKey);
  if (stackKey && !placed) return { error: '选中的物品堆已不存在' };
  if (placed && (placed.ref !== `${kind}:${id}` || count > placed.count)) return { error: '选中物品堆的数量不足' };

  // Plan destination placement before changing either owner. Dropping onto other goods cannot overwrite them.
  let targetLayout;
  if (targetIndex !== undefined) {
    const view = reconcileInventoryLayout(target.bagLayout, inventoryEntries(target, collections));
    const capacity = Math.max(INVENTORY_PAGE_SIZE, Math.ceil(view.layout.slots.length / INVENTORY_PAGE_SIZE) * INVENTORY_PAGE_SIZE);
    if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= capacity) return { error: '无效的物品位置' };
    const ref = `${kind}:${id}`, slot = view.layout.slots[targetIndex], maxStack = instance ? 1 : kind === 'item' ? doc.stack || 9999 : 9999;
    if (slot && slot.ref !== ref) return { error: '请拖到空格或同类物品上' };
    if ((slot?.count || 0) + count > maxStack) return { error: '这个格子的物品已达堆叠上限' };
    if (slot) slot.count += count;
    else {
      const used = new Set(view.layout.slots.filter(Boolean).map(s => s.key));
      let key = ref;
      while (used.has(key)) key = 'stack:' + view.layout.nextKey++;
      while (view.layout.slots.length <= targetIndex) view.layout.slots.push(null);
      view.layout.slots[targetIndex] = { key, ref, count };
    }
    targetLayout = view.layout;
  }
  if (instance) { target.instances[id] = instance; delete source.instances[id]; }
  else { target.owned[kind][id] = next; if (available === count) delete source.owned[kind][id]; else source.owned[kind][id] = available - count; }
  source.bagLayout = reducePlacedStack(source.bagLayout, stackKey || `${kind}:${id}`, count);
  if (targetLayout) target.bagLayout = targetLayout;
  if (depositing && kind === 'item' && available === count) player.loadout.belt = cleanBelt(player.loadout.belt.map(value => value === id ? null : value));
  return { error: '', name: doc.name || id, count };
}

export function transferStoredItem(player, collections, request) {
  return transferItem(player, collections, player.hideout?.stash, request);
}

/** Listing moves the actual item out of the bag; delisting returns that same item. */
export function transferMerchantItem(player, collections, request) {
  return transferItem(player, collections, player.hideout?.merchant?.inventory, request);
}

// Persistent placement and stack views. Ownership totals remain in the existing inventory.
export const INVENTORY_PAGE_SIZE = 72;
const trim = slots => { while (slots.length && !slots.at(-1)) slots.pop(); return slots; };
const total = entry => Number.isSafeInteger(entry.count) && entry.count > 0 ? entry.count : 0;
const limit = entry => entry.instance || entry.kind === 'skill' ? 1 : Math.max(1, Math.trunc(entry.maxStack || 9999));
export const canSplitStack = entry => !!entry && !entry.instance && entry.kind !== 'skill' && entry.count > 1;

/** Heal stale placement after acquisition, consumption, identification or sale without moving other cells. */
export function reconcileInventoryLayout(saved, entries) {
  const byRef = new Map(entries.map(entry => [entry.key, entry]));
  const remaining = new Map(entries.map(entry => [entry.key, total(entry)]));
  const slots = [], keys = new Set();
  let nextKey = Number.isSafeInteger(saved?.nextKey) && saved.nextKey > 0 ? saved.nextKey : 1;
  const keyFor = preferred => {
    if (preferred && !keys.has(preferred)) { keys.add(preferred); return preferred; }
    let key;
    do { key = 'stack:' + nextKey++; } while (keys.has(key));
    keys.add(key); return key;
  };
  for (const slot of Array.isArray(saved?.slots) ? saved.slots : []) {
    const entry = byRef.get(slot?.ref), left = remaining.get(slot?.ref) || 0;
    if (!entry || !left || !Number.isSafeInteger(slot.count) || slot.count < 1) { slots.push(null); continue; }
    const count = Math.min(slot.count, left, limit(entry));
    slots.push({ key: keyFor(typeof slot.key === 'string' ? slot.key : entry.key), ref: entry.key, count });
    remaining.set(entry.key, left - count);
  }
  for (const entry of entries) {
    let left = remaining.get(entry.key);
    // New acquisitions top up an existing stack. Deliberately split stacks stay split otherwise.
    for (const slot of slots) if (left && slot?.ref === entry.key) {
      const add = Math.min(left, limit(entry) - slot.count);
      slot.count += add; left -= add;
    }
    while (left > 0) {
      const count = Math.min(left, limit(entry));
      let index = slots.indexOf(null); if (index < 0) index = slots.length;
      slots[index] = { key: keyFor(entry.key), ref: entry.key, count }; left -= count;
    }
  }
  trim(slots);
  const seenEquipped = new Set(), placed = [];
  slots.forEach((slot, slotIndex) => {
    if (!slot) return;
    const entry = byRef.get(slot.ref);
    const equipped = entry.equipped && (entry.kind !== 'equipment' || !seenEquipped.has(slot.ref));
    if (equipped) seenEquipped.add(slot.ref);
    placed.push({ ...entry, key: slot.key, sourceKey: slot.ref, count: slot.count, slotIndex, equipped });
  });
  return { layout: { slots, nextKey }, entries: placed };
}

export function inventoryGrid(view, requestedPage = 0) {
  const pages = Math.max(1, Math.ceil(view.layout.slots.length / INVENTORY_PAGE_SIZE));
  const page = Math.max(0, Math.min(pages - 1, Math.trunc(requestedPage) || 0));
  const bySlot = new Map(view.entries.map(entry => [entry.slotIndex, entry]));
  return { page, pages, cells: Array.from({ length: INVENTORY_PAGE_SIZE }, (_, i) => bySlot.get(page * INVENTORY_PAGE_SIZE + i) || null) };
}

/** Filter occupied cells without turning hidden items into apparent empty drop targets. */
export function characterInventoryGrid(view, visibleEntries, minimumCells = 36) {
  const visible = new Map(visibleEntries.map(entry => [entry.key, entry]));
  const occupied = new Map(view.entries.map(entry => [entry.slotIndex, entry]));
  const cells = [];
  for (let index = 0; index < view.layout.slots.length; index++) {
    const entry = occupied.get(index);
    if (entry && !visible.has(entry.key)) continue;
    cells.push({ index, item: entry ? visible.get(entry.key) : null });
  }
  const length = Math.max(minimumCells, Math.ceil(cells.length / 4) * 4);
  for (let index = view.layout.slots.length; cells.length < length; index++) cells.push({ index, item: null });
  return cells;
}

/** Empty cell: move. Other item: swap. Same stackable item: merge up to its authored limit. */
export function moveInventoryStack(saved, entries, key, targetIndex, { minimumCapacity = 0 } = {}) {
  const view = reconcileInventoryLayout(saved, entries), { slots } = view.layout;
  const from = slots.findIndex(slot => slot?.key === key);
  const currentCapacity = Math.max(INVENTORY_PAGE_SIZE, Math.ceil(slots.length / INVENTORY_PAGE_SIZE) * INVENTORY_PAGE_SIZE);
  const capacity = Number.isSafeInteger(minimumCapacity) ? Math.max(currentCapacity, Math.min(currentCapacity + INVENTORY_PAGE_SIZE, minimumCapacity)) : currentCapacity;
  if (from < 0 || !Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= capacity) return { error: '无效的背包位置' };
  if (from === targetIndex) return { layout: view.layout, error: '' };
  const source = slots[from], target = slots[targetIndex];
  const entry = entries.find(entry => entry.key === source.ref);
  if (target?.ref === source.ref && limit(entry) > target.count) {
    const moved = Math.min(source.count, limit(entry) - target.count);
    target.count += moved; source.count -= moved;
    if (!source.count) slots[from] = null;
  } else { slots[targetIndex] = source; slots[from] = target || null; }
  // JSON roundtrips use explicit null cells, never array holes.
  for (let i = 0; i < slots.length; i++) if (!slots[i]) slots[i] = null;
  trim(slots);
  return { layout: view.layout, error: '' };
}

export function splitInventoryStack(saved, entries, key, amount) {
  const view = reconcileInventoryLayout(saved, entries), { slots } = view.layout;
  const index = slots.findIndex(slot => slot?.key === key), entry = view.entries.find(entry => entry.key === key);
  if (!canSplitStack(entry)) return { error: '此物品不能拆分' };
  if (!Number.isSafeInteger(amount) || amount < 1 || amount >= entry.count) return { error: `拆分数量必须为 1–${entry.count - 1}` };
  const used = new Set(slots.filter(Boolean).map(slot => slot.key));
  let newKey;
  do { newKey = 'stack:' + view.layout.nextKey++; } while (used.has(newKey));
  const slot = slots[index];
  slot.count -= amount;
  let target = slots.findIndex((cell, i) => i > index && !cell);
  if (target < 0) target = slots.indexOf(null);
  if (target < 0) target = slots.length;
  slots[target] = { key: newKey, ref: slot.ref, count: amount };
  return { layout: view.layout, key: newKey, slotIndex: target, error: '' };
}

/** Call after a targeted sale/identification so the clicked pile loses the copy, not another pile. */
export function reducePlacedStack(saved, key, amount = 1) {
  if (!saved?.slots) return saved;
  return { ...saved, slots: trim(saved.slots.map(slot => !slot || slot.key !== key ? slot : slot.count > amount ? { ...slot, count: slot.count - amount } : null)) };
}

const kindOrder = { equipment: 0, item: 1, skill: 2 };
const rarityOrder = { unique: 0, legendary: 1, rare: 2, magic: 3, common: 4 };
const slotOrder = ['weapon', 'offhand', 'helmet', 'chest', 'gloves', 'boots', 'belt', 'amulet', 'ring'];
export function organizeInventory(saved, entries) {
  const view = reconcileInventoryLayout(saved, entries), keysByRef = new Map();
  for (const slot of view.layout.slots) if (slot) {
    if (!keysByRef.has(slot.ref)) keysByRef.set(slot.ref, []);
    keysByRef.get(slot.ref).push(slot.key);
  }
  const sorted = [...entries].sort((a, b) => (kindOrder[a.kind] ?? 3) - (kindOrder[b.kind] ?? 3)
    || (a.kind === 'equipment' ? slotOrder.indexOf(a.slot) - slotOrder.indexOf(b.slot) : String(a.category || '').localeCompare(b.category || ''))
    || (rarityOrder[a.rarity] ?? 5) - (rarityOrder[b.rarity] ?? 5) || (b.tier || 0) - (a.tier || 0)
    || a.name.localeCompare(b.name, 'zh-CN') || a.key.localeCompare(b.key));
  const slots = [];
  for (const entry of sorted) {
    let left = total(entry);
    while (left > 0) {
      const count = Math.min(left, limit(entry));
      const key = keysByRef.get(entry.key)?.shift() || 'stack:' + view.layout.nextKey++;
      slots.push({ key, ref: entry.key, count }); left -= count;
    }
  }
  return { layout: { slots, nextKey: view.layout.nextKey }, error: '' };
}

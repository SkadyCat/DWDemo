// Player-facing unread loot only. No combat rules, timers or item-stat dependencies.
export function inventoryCounts(state) {
  const counts = {}, instances = new Set();
  const containers = [state, state.hideout?.stash, state.hideout?.merchant?.inventory];
  for (const container of containers) {
    if (!container) continue;
    for (const kind of ['equipment', 'item']) for (const [id, count] of Object.entries(container.owned?.[kind] || {})) {
      if (Number.isSafeInteger(count) && count > 0) counts[`${kind}:${id}`] = (counts[`${kind}:${id}`] || 0) + count;
    }
    for (const uid of Object.keys(container.instances || {})) instances.add(uid);
  }
  for (const uid of instances) counts[`equipment:${uid}`] = 1;
  return counts;
}

/** Compare batched ownership totals so stash/merchant transfers never become new loot. */
export function updateInventoryNotices(state, current, previous = current) {
  const pending = state.newInventory ||= {};
  for (const key of Object.keys(pending)) if (!current[key]) delete pending[key];
  for (const [key, count] of Object.entries(current)) if (count > (previous[key] || 0)) pending[key] = true;
}

const refOf = item => item && ['equipment', 'item'].includes(item.kind) ? item.sourceKey || `${item.kind}:${item.id}` : '';
export const isInventoryNew = (state, item) => !!state.newInventory?.[refOf(item)];
export function seeInventoryItem(state, item) {
  const key = refOf(item);
  if (state.newInventory?.[key]) delete state.newInventory[key];
}

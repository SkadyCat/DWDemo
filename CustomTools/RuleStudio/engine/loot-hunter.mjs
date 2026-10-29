// Display preference only: reads the affixes that were already rolled on a drop.
// It never changes rewards, items, combat, crafting or random streams.
export const emptyHunter = () => ({ visible: false, enabled: true, targets: [], currencies: [] });

export function normalizeHunter(value, allowed = null, currencyAllowed = null) {
  const ids = (values, pool) => [...new Set((Array.isArray(values) ? values : [])
    .filter(id => typeof id === 'string' && id && (!pool || pool.has(id))))];
  return { visible: value?.visible === true, enabled: value?.enabled !== false,
    targets: ids(value?.targets, allowed), currencies: ids(value?.currencies, currencyAllowed) };
}

export function hunterCurrencyPool(collections) {
  return [...(collections?.item?.values() || [])].map(entry => entry.doc)
    .filter(doc => doc?.category === 'currency')
    .map(doc => ({ id: doc.id, name: doc.name || doc.id, description: doc.description || '' }));
}

export function hunterAllows(drop, hunter) {
  if (!hunter || hunter.enabled === false) return true;
  if (drop?.kind === 'item') return drop.category === 'map' || (drop.category === 'currency' && (hunter.currencies || []).includes(drop.id));
  const item = drop?.kind === 'equipment' ? drop.item : null;
  if (!item || item.identified === false || !hunter.targets?.length) return false;
  const ids = new Set();
  function entry(e) { if (!e) return; ids.add(e.id); for (const child of e.with || []) entry(child); }
  for (const affix of [...(item.bases || []), ...(item.affixes || []), ...(item.legendary ? [item.legendary] : [])]) {
    ids.add(affix.id); for (const e of affix.traits || []) entry(e);
  }
  return hunter.targets.every(id => ids.has(id));
}

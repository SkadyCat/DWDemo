// Presentation views only: ownership and the authoritative loadout stay intact.
export function partitionInventory(entries) {
  const ordinary = [], equipped = [];
  const slots = new Set(['weapon','offhand','helmet','chest','gloves','boots','belt','amulet','ring']);
  for (const entry of entries) {
    if (entry.kind !== 'equipment' || !entry.equipped || !slots.has(entry.slot)) { ordinary.push(entry); continue; }
    equipped.push({ ...entry, key: 'equipped:' + entry.key, sourceKey: entry.key, count: 1, equippedEntry: true });
    if (entry.count > 1) ordinary.push({ ...entry, count: entry.count - 1, equipped: false });
  }
  return { ordinary, equipped };
}

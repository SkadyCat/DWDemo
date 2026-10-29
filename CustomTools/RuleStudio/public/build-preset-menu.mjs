// Menu grouping only; strength metadata never participates in combat.
export function groupBuildPresets(rows) {
  const groups = new Map();
  for (const row of rows) {
    const id = row.group || row.id;
    if (!groups.has(id)) groups.set(id, { id, name: row.groupName || row.name, rows: [], equipped: false });
    const group = groups.get(id);
    group.rows.push(row);
    group.equipped ||= !!row.equipped;
  }
  return [...groups.values()].map(group => ({ ...group, rows: group.rows.sort((a, b) => (a.grade || 1) - (b.grade || 1)) }));
}

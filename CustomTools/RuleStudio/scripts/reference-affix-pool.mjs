// Freeze the catalogue used to author published seeded examples. Normal drops and
// rerolls keep the live pool; adding content must not silently reroll old examples.
import fs from 'node:fs';
import { equipmentAffixPool } from '../engine/equipment.mjs';
const ids = JSON.parse(fs.readFileSync(new URL('./reference-affix-pool.json', import.meta.url), 'utf8'));
export function referenceAffixPool(library) {
  const live = new Map(equipmentAffixPool(library).map(row => [row.id, row]));
  return ids.map(id => {
    const row = live.get(id);
    if (!row) throw new Error(`参考词条池的特性已删除：${id}`);
    return row;
  });
}

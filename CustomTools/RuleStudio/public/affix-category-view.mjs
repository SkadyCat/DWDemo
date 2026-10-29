// Read-only category rows, shared by the editor tab and its coverage checks.
import { equipmentAffixPool } from '../engine/equipment.mjs';
import { affixFamilies } from '../engine/tags.mjs';
import { isStitchable } from '../engine/library.mjs';
import { buildAffixPositionIndex } from './affix-positions.mjs';

export function affixCategoryRows(library, collections, tagIndex, categoryIndex, positionIndex = null) {
  if (!library || !categoryIndex) return [];
  const positions = positionIndex || buildAffixPositionIndex(library);
  const positionOf = (id, kind = 'trait') => { const row = positions.positionOf(id, kind); return { position: row.position, positionReason: row.reason }; };
  const pool = new Map(equipmentAffixPool(library).map(row => [row.id, row]));
  const fixed = new Set();
  for (const { doc } of collections?.equipment?.values() || []) if (doc?.rarity === 'legendary' && doc.legendary) fixed.add(doc.legendary.id);
  const references = entries => entries.flatMap(function walk(entry) { return [{ id: entry.id, name: library.traitDisplayName(entry.id), depth: 0 }, ...(entry.with || []).flatMap(walk).map(row => ({ ...row, depth: row.depth + 1 }))]; });
  const rows = [...library.traits.values()].map(entry => {
    const id = entry.source.id;
    const scope = /^(monster_|map_)/.test(id) ? '怪物 / 地图' : pool.has(id) ? '可洗炼词条' : fixed.has(id) ? '固定传奇' : isStitchable(entry.source) ? '挂载 / 限时包装' : entry.source.rules.some(rule => rule.event === 'cast') ? '主动特性' : '技能辅助';
    return { id, name: entry.displayName || id, description: entry.description || '', path: entry.path,
      ...categoryIndex.traits.get(id), ...positionOf(id), kind: 'trait', scope, rollable: pool.has(id), legendary: fixed.has(id),
      families: tagIndex?.familiesOf(id) || [], references: references(pool.get(id)?.traits || [{ id }]) };
  });
  for (const definition of pool.values()) if (!library.trait(definition.id)) rows.push({
    id: definition.id, name: definition.name, description: definition.traits.map(entry => library.traitDisplayName(entry.id)).join(' + '),
    path: '词条聚合', ...categoryIndex.affixes.get(definition.id), ...positionOf(definition.id, 'affix'), kind: 'compound', scope: '复合词条', rollable: true, legendary: false,
    families: tagIndex ? affixFamilies(tagIndex, definition) : [], references: references(definition.traits),
  });
  return rows.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN') || a.id.localeCompare(b.id));
}

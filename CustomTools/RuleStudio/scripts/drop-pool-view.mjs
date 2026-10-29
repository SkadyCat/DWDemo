// Read-only view of the same candidate catalogue and overrides used by TradeBackend.
// This lists templates; it does not roll rewards, change weights, or publish pools.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

const fixedSlots = new Set(['lineage', 'rarity', 'tower', 'character', 'default', 'map']);
const itemCategories = new Set(['consumable', 'currency', 'omen', 'material']);

export async function readMapDropPools(rulesRoot, configFile) {
  const version = createHash('sha1'), entries = [], maps = [], byId = new Map();
  for (const group of ['Equipment', 'Items']) {
    const folder = path.join(rulesRoot, group);
    const files = (await fs.readdir(folder)).filter(name => name.endsWith('.json')).sort();
    if (!files.length) throw Error('掉落目录为空：' + group);
    for (const file of files) {
      const bytes = await fs.readFile(path.join(folder, file)), doc = JSON.parse(bytes.toString('utf8'));
      version.update(group + '/' + file).update('\0').update(bytes).update('\0');
      if (!doc.id || !doc.name || byId.has(doc.id)) throw Error('掉落目录 ID 无效或重复：' + file);
      const kind = group === 'Equipment' ? 'equipment' : 'item';
      const entry = {...doc, kind}; byId.set(doc.id, entry);
      if (kind === 'equipment' && doc.slot === 'map') maps.push(entry);
      if (kind === 'equipment' ? !fixedSlots.has(doc.slot) : itemCategories.has(doc.category)) entries.push(entry);
    }
  }
  const config = JSON.parse(await fs.readFile(configFile, 'utf8'));
  const overrides = config.maps ?? {};
  if (typeof overrides !== 'object' || Array.isArray(overrides)) throw Error('地图掉落池配置无效');
  for (const id of Object.keys(overrides)) if (!maps.some(map => map.id === id)) throw Error('未知地图掉落池：' + id);
  const defaults = kind => entries.filter(entry => entry.kind === kind).map(entry => entry.id);
  function candidates(override, field, kind, mapId) {
    const ids = override[field] ?? defaults(kind);
    if (!Array.isArray(ids)) throw Error('地图掉落候选必须是数组：' + mapId);
    const seen = new Set();
    for (const id of ids) {
      const entry = byId.get(id);
      if (!entry || entry.kind !== kind || seen.has(id) || !entries.includes(entry)) throw Error('地图掉落候选无效：' + mapId + ' / ' + id);
      seen.add(id);
    }
    return [...ids].sort();
  }
  const pools = maps.map(map => {
    const tier = map.tier || 1, override = overrides[map.id] ?? {};
    if (!Number.isInteger(tier) || tier < 1 || tier > 10) throw Error('地图核心阶级无效：' + map.id);
    if (typeof override !== 'object' || Array.isArray(override)) throw Error('地图掉落池配置无效：' + map.id);
    return {id: map.id, name: map.name, maxTier: tier,
      customized: override.equipmentIds != null || override.itemIds != null,
      equipmentIds: candidates(override, 'equipmentIds', 'equipment', map.id),
      itemIds: candidates(override, 'itemIds', 'item', map.id)};
  }).sort((a, b) => a.maxTier - b.maxTier || a.id.localeCompare(b.id));
  return {schemaVersion: 1, catalogVersion: version.digest('hex'), maps: pools, entries};
}

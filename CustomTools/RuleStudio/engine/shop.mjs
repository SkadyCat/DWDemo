// Shop catalog (Content/Rules/Shop/catalog.json). 灵石 (spirit stone) is the only currency.
//   { "currency": { "id": "spirit_stone", "name": "灵石" },
//     "startingStones": 300,
//     "starter": ["skill:frost_lance"],            granted free to a new save
//     "prices": { "equipment:cinder_guard_chest": 900 }, overrides; everything else uses defaultPrice()
//     "hidden": ["skill:some_internal_skill"] }     not listed
// Standalone player skills, equipment and items are listed automatically; auras come from equipment.
import { isFixedEquipmentSlot } from './equipment-slots.mjs';
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const KEY_PATTERN = /^(skill|equipment|item):[a-z0-9_]+$/;

export const CURRENCY = Object.freeze({ id: 'spirit_stone', name: '灵石' });
export const SHOP_TABS = Object.freeze([
  { id: 'skill', name: '技能' },
  { id: 'equipment', name: '装备' },
  { id: 'item', name: '物品' },
]);

export const defaultCatalog = () => ({ currency: { ...CURRENCY }, startingStones: 0, starter: ['equipment:frostthorn_staff'], prices: {}, hidden: [] });

/** Returns {catalog, error}. */
export function parseCatalog(text) {
  let root;
  try { root = JSON.parse(String(text).replace(/^\uFEFF/, '')); } catch (error) { return { catalog: null, error: `不是有效的 JSON：${error.message}` }; }
  if (!isObject(root)) return { catalog: null, error: '根节点必须是对象' };
  const allowed = ['currency', 'startingStones', 'starter', 'prices', 'hidden'];
  const unknown = Object.keys(root).filter(k => !allowed.includes(k));
  if (unknown.length) return { catalog: null, error: `未知字段：${unknown.join(', ')}` };
  const catalog = defaultCatalog();
  if (root.currency !== undefined) {
    if (!isObject(root.currency) || root.currency.id !== CURRENCY.id) return { catalog: null, error: `currency 只能是 ${CURRENCY.id}（灵石是唯一通货）` };
    catalog.currency = { id: CURRENCY.id, name: typeof root.currency.name === 'string' && root.currency.name ? root.currency.name : CURRENCY.name };
  }
  if (root.startingStones !== undefined) {
    if (!Number.isInteger(root.startingStones) || root.startingStones < 0) return { catalog: null, error: 'startingStones 必须是非负整数' };
    catalog.startingStones = root.startingStones;
  }
  for (const field of ['starter', 'hidden']) {
    if (root[field] === undefined) continue;
    if (!Array.isArray(root[field]) || root[field].some(k => typeof k !== 'string' || !KEY_PATTERN.test(k))) return { catalog: null, error: `${field} 必须是 "skill:id" / "equipment:id" / "item:id" 列表` };
    catalog[field] = [...new Set(root[field])];
  }
  if (root.prices !== undefined) {
    if (!isObject(root.prices)) return { catalog: null, error: 'prices 必须是对象' };
    for (const [key, value] of Object.entries(root.prices)) {
      if (!KEY_PATTERN.test(key)) return { catalog: null, error: `prices.${key}：键必须是 "skill:id" / "equipment:id" / "item:id"` };
      if (!Number.isInteger(value) || value < 0) return { catalog: null, error: `prices.${key} 必须是非负整数（灵石）` };
      catalog.prices[key] = value;
    }
  }
  return { catalog, error: '' };
}

export function serializeCatalog(catalog) {
  const prices = Object.fromEntries(Object.entries(catalog.prices).sort(([a], [b]) => a.localeCompare(b)));
  return `${JSON.stringify({ currency: catalog.currency, startingStones: catalog.startingStones, starter: catalog.starter, prices, hidden: catalog.hidden }, null, 2)}\n`;
}

const RARITY_PRICE = { common: 40, magic: 120, rare: 320, legendary: 900, unique: 1500 };
const ITEM_FACTOR = { consumable: 0.25, material: 0.15, quest: 0, currency: 0 };

/** Default price in 灵石 when the catalog has no override. */
export function defaultPrice(kind, doc) {
  const traits = doc.traits.length;
  if (kind === 'skill') return 100 + 80 * Math.max(0, traits - 1);
  const base = RARITY_PRICE[doc.rarity] ?? 100;
  if (kind === 'equipment') return Math.round((base * (1 + (doc.level || 1) / 20) + 25 * traits) / 5) * 5;
  return Math.max(5, Math.round((base * (ITEM_FACTOR[doc.category] ?? 0.5) + 10 * traits) / 5) * 5);
}

export const isListedSkill = (id, collections) => !/^monster_/.test(id) && collections?.skill?.get(id)?.type !== 'aura' && !collections?.skill?.get(id)?.grantedBy?.length;

/** All shop listings: [{key, kind, id, name, description, rarity, price, custom, doc}]. */
export function listings(collections, catalog) {
  const out = [];
  const hidden = new Set(catalog.hidden);
  for (const kind of ['skill', 'equipment', 'item']) {
    for (const [, entry] of collections?.[kind] || []) {
      const doc = entry.doc;
      if (!doc || (kind === 'skill' && !isListedSkill(doc.id, collections))) continue;
      if (kind === 'equipment' && isFixedEquipmentSlot(doc.slot)) continue;
      const key = `${kind}:${doc.id}`;
      if (hidden.has(key)) continue;
      const custom = Object.prototype.hasOwnProperty.call(catalog.prices, key);
      out.push({ key, kind, id: doc.id, name: doc.name || doc.id, description: doc.description || '', rarity: doc.rarity || 'skill', price: custom ? catalog.prices[key] : defaultPrice(kind, doc), custom, doc });
    }
  }
  return out;
}

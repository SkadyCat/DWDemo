// Tags, tag families (族) and affix rerolling (洗炼).
//   Content/Rules/Tags/families.json (web-only):
//   { "families": [ { "id": "elemental", "name": "元素" } ],          every family is also a tag ("族 tag")
//     "tags": { "fire": { "name": "火焰", "family": "elemental" } },  every tag belongs to exactly one family
//     "traits": { "trait_id": ["extra_tag"] } }                        optional extra tags per trait
// Trait tags are derived from what a trait does (elements, projectiles, areas, ailments, sheet pools ...)
// plus the extra list; collection tags (equipment/item "tags") match a tag id or its display name.
// Currency items reroll an equipment's rolled affixes into any trait with any value; an omen (预兆)
// item limits that pool to one family.
import { EOp } from './types.js';
import { equipmentAffixPool, sampleEquipmentAffixes } from './equipment.js';

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const lower = s => String(s).toLowerCase();
const ID = /^[a-z0-9_]+$/;

export const DEFAULT_TAG_FILE = 'Tags/families.json';
/** Rolled affixes per equipment rarity. */
export const ROLL_COUNT = Object.freeze({ common: 1, magic: 2, rare: 3, legendary: 4, unique: 5 });

/** Returns {doc:{families, tags, traits}, error}. */
export function parseTagFile(text) {
  let root;
  try { root = JSON.parse(String(text).replace(/^\uFEFF/, '')); } catch (error) { return { doc: null, error: `不是有效的 JSON：${error.message}` }; }
  if (!isObject(root)) return { doc: null, error: '根节点必须是对象' };
  const unknown = Object.keys(root).filter(k => !['families', 'tags', 'traits'].includes(k));
  if (unknown.length) return { doc: null, error: `未知字段：${unknown.join(', ')}` };
  if (!Array.isArray(root.families) || !root.families.length) return { doc: null, error: 'families 必须是非空数组' };
  const families = [];
  for (const [i, f] of root.families.entries()) {
    if (!isObject(f) || typeof f.id !== 'string' || !ID.test(f.id)) return { doc: null, error: `families[${i}] 需要 id（小写字母、数字、下划线）` };
    if (Object.keys(f).some(k => !['id', 'name', 'description'].includes(k))) return { doc: null, error: `families[${i}] 只能有 id、name、description` };
    if (families.some(x => x.id === f.id)) return { doc: null, error: `族 ${f.id} 重复` };
    families.push({ id: f.id, name: typeof f.name === 'string' && f.name ? f.name : f.id, description: typeof f.description === 'string' ? f.description : '' });
  }
  const tags = new Map();
  if (!isObject(root.tags)) return { doc: null, error: 'tags 必须是对象 {tag: {name, family}}' };
  for (const [id, t] of Object.entries(root.tags)) {
    if (!ID.test(id)) return { doc: null, error: `tag ${id}：只能包含小写字母、数字、下划线` };
    if (families.some(f => f.id === id)) return { doc: null, error: `tag ${id} 与族同名（族本身就是 tag）` };
    if (!isObject(t) || typeof t.family !== 'string') return { doc: null, error: `tag ${id} 需要 family` };
    if (Object.keys(t).some(k => !['name', 'family'].includes(k))) return { doc: null, error: `tag ${id} 只能有 name、family` };
    if (!families.some(f => f.id === t.family)) return { doc: null, error: `tag ${id}：未知族 ${t.family}` };
    tags.set(id, { id, name: typeof t.name === 'string' && t.name ? t.name : id, family: t.family });
  }
  const traits = new Map();
  if (root.traits !== undefined) {
    if (!isObject(root.traits)) return { doc: null, error: 'traits 必须是对象 {trait_id: [tags]}' };
    for (const [id, list] of Object.entries(root.traits)) {
      if (!Array.isArray(list) || list.some(t => typeof t !== 'string')) return { doc: null, error: `traits.${id} 必须是 tag 数组` };
      traits.set(lower(id), list.map(lower));
    }
  }
  return { doc: { families, tags, traits }, error: '' };
}

// ---------------------------------------------------------------- derivation
const ELEMENT_TAGS = { fire: 'fire', frost: 'frost', cold: 'frost', lightning: 'lightning', physical: 'physical', poison: 'poison', void: 'void' };
const ELEMENTAL = ['fire', 'frost', 'lightning', 'void'];
const ELEMENT_INDEX = ['fire', 'frost', 'lightning', 'physical', 'poison', 'void'];

function* actionsOf(trait) {
  const walk = function* (list) { for (const a of list) { yield a; yield* walk(a.then || []); } };
  for (const rule of trait.rules) yield* walk(rule.actions);
}

function sheetTags(path, add) {
  const [head, second, third] = path.split('.');
  const element = ELEMENT_TAGS[path.split('.').pop()];
  if (/^(shield|threshold)/.test(path) || /shield/.test(path)) add('shield');
  if (/^(life|heal|flask)/.test(path) || /life/.test(path)) add('life');
  if (head === 'leech') { add('leech'); add(second === 'shield' ? 'shield' : 'life'); }
  if (head === 'recoup') { add('recovery'); add(second === 'shield' ? 'shield' : 'life'); }
  if (/regen|on_|recharge|recover|flask|heal/.test(path)) add('recovery');
  if (head === 'mana') add('mana');
  if (head === 'attr') add('attribute');
  if (head === 'defense') add('defense');
  if (/damage_taken|taken_|bypass|threshold/.test(path)) add('defense');
  if (head === 'cost' || /cost/.test(path)) add('cost');
  if (head === 'damage' || /damage$|\.damage\b/.test(path)) add('damage');
  if (head === 'damage' && third === 'elemental') ELEMENTAL.forEach(add);
  if (head === 'damage' && element) add(element);
  if (head === 'area' || /area/.test(path)) add('area');
  if (/critical|crit/.test(path)) add('critical');
  if (/kill/.test(path)) add('kill');
  if (/speed/.test(path) && !/regen|recharge|leech|flask|recoup/.test(path)) add('speed');
}

/** Tags a trait has because of what it does (lower-case ids, sorted). */
export function deriveTraitTags(trait) {
  const out = new Set();
  const add = t => out.add(t);
  for (const m of trait.modifiers) {
    const parts = lower(m.stat).split('.');
    if (parts[0] === 'element') {
      if (ELEMENT_TAGS[parts[1]]) add(ELEMENT_TAGS[parts[1]]);
      if (/resistance|penetration/.test(parts[2])) add('defense'); else add('damage');
    }
    if (parts[0] === 'projectile') {
      add('projectile');
      if (/ricochet|reflection|return|refraction|pierce/.test(parts[1])) add('chain');
      if (parts[1] === 'damage') add('damage');
    }
    if (parts[0] === 'area' || parts[0] === 'explosion') add('area');
    if (/critical/.test(parts[1] || '')) add('critical');
    if (/speed/.test(parts[1] || '') && parts[0] === 'cast') add('speed');
  }
  for (const rule of trait.rules) {
    if (rule.event === 'critical') add('critical');
    if (rule.event === 'kill') add('kill');
    for (const c of rule.conditions) if (c.tag && ELEMENT_TAGS[lower(c.tag)]) add(ELEMENT_TAGS[lower(c.tag)]);
    for (const c of rule.conditions) if (lower(c.tag) === 'projectile') add('projectile');
  }
  for (const a of actionsOf(trait)) {
    for (const t of a.tags || []) {
      const key = lower(t);
      if (ELEMENT_TAGS[key]) add(ELEMENT_TAGS[key]);
      else if (key === 'melee' || key === 'spell') add(key);
      else if (key === 'shatter') add('ailment');
    }
    if (a.element >= 0 && ELEMENT_INDEX[a.element]) add(ELEMENT_INDEX[a.element]);
    if (a.op === EOp.DamageArea) { add('area'); add('damage'); }
    if (a.op === EOp.DamageTarget) add('damage');
    if (a.op === EOp.Emit || a.op === EOp.Copy) add('projectile');
    if (a.op === EOp.Redirect) { add('projectile'); add('chain'); }
    if (a.op === EOp.ApplyStatus) add('ailment');
    if (a.op === EOp.GrantTraits) { add('duration'); add('trigger'); }
  }
  for (const entry of trait.sheet || []) {
    if (entry.stat) sheetTags(lower(entry.stat), add);
    if (entry.trigger) {
      add('trigger');
      sheetTags(lower(entry.trigger), add);
      if (/empower/.test(entry.trigger)) add('damage');
      if (/guard|cheat/.test(entry.trigger)) add('defense');
      if (/buff|guard/.test(entry.trigger)) add('duration');
    }
  }
  return [...out].sort();
}

/**
 * Index over a loaded library: traitTags/traitFamilies per trait, tag lookup by id or display name,
 * and the tags nobody assigned a family to ("unmapped").
 */
export function buildTagIndex(library, doc) {
  const families = new Map(doc.families.map(f => [f.id, f]));
  const byName = new Map();
  for (const t of doc.tags.values()) { byName.set(lower(t.id), t); byName.set(lower(t.name), t); }
  for (const f of doc.families) { byName.set(lower(f.id), { id: f.id, name: `${f.name}族`, family: f.id }); byName.set(`${lower(f.name)}族`, { id: f.id, name: `${f.name}族`, family: f.id }); }
  const traitTags = new Map();
  const traitFamilies = new Map();
  const unmapped = new Map();
  for (const entry of library.traits.values()) {
    const id = lower(entry.source.id);
    const tags = [...new Set([...deriveTraitTags(entry.source), ...(doc.traits.get(id) || [])])].sort();
    const fams = new Set();
    for (const tag of tags) {
      const t = byName.get(tag);
      if (t) fams.add(t.family); else { if (!unmapped.has(tag)) unmapped.set(tag, []); unmapped.get(tag).push(entry.source.id); }
    }
    traitTags.set(id, tags);
    traitFamilies.set(id, [...fams].sort());
  }
  return {
    doc, families, traitTags, traitFamilies, unmapped,
    tag: name => byName.get(lower(name)) || null,
    tagsOf: traitId => traitTags.get(lower(traitId)) || [],
    familiesOf: traitId => traitFamilies.get(lower(traitId)) || [],
    familyName: id => (families.get(id)?.name ? `${families.get(id).name}族` : id),
    /** Collection tags ("冰霜", "frost", "元素族") → families; unknown names in .unknown. */
    collectionFamilies(tags) {
      const out = new Set(); const unknown = [];
      for (const t of tags || []) { const hit = byName.get(lower(t)); if (hit) out.add(hit.family); else unknown.push(t); }
      return { families: [...out], unknown };
    },
  };
}

/** Whole-set check of a tag index: every derived trait tag must have a family. Returns '' or error. */
export function checkTagIndex(index) {
  if (!index.unmapped.size) return '';
  const [tag, users] = [...index.unmapped][0];
  return `${DEFAULT_TAG_FILE}: tag ${tag}（${users.slice(0, 3).join('、')}${users.length > 3 ? ' 等' : ''} 使用）没有分配族${index.unmapped.size > 1 ? `，另有 ${index.unmapped.size - 1} 个 tag 未分配` : ''}`;
}

// ---------------------------------------------------------------- rerolling (洗炼)
// Built on the rolled equipment instances of engine/equipment.mjs: the same pool and no-duplicate rule,
// with the pool optionally limited to one family (omen) and "any value": every param 50%–200% of default.

/** Families of a pool definition (union over the traits it grants, including stitched ones). */
export function affixFamilies(index, definition) {
  const ids = definition.traits.flatMap(function walk(t) { return [t.id, ...(t.with || []).flatMap(walk)]; });
  return [...new Set(ids.flatMap(id => index.familiesOf(id)))].sort();
}

/** The reroll pool, optionally limited to one family. */
export function rerollPool(library, index, family = '') {
  const pool = equipmentAffixPool(library);
  return family ? pool.filter(def => affixFamilies(index, def).includes(family)) : pool;
}

/** Any value: 50%–200% of the authored default (chance/percent capped at 100; integers stay integers; 0 stays 0). */
export function rollValue(name, base, random) {
  if (!Number.isFinite(base) || base === 0) return base;
  let v = base * (0.5 + random() * 1.5);
  if (/chance|percent|slow/.test(lower(name))) v = Math.min(100, v);
  if (Number.isInteger(base)) v = Math.round(v) || Math.sign(base);
  else v = Math.round(v * 100) / 100 || Math.sign(base) * 0.01;
  return v;
}

const anyValues = (definition, random) => {
  const out = JSON.parse(JSON.stringify(definition));
  const vary = entry => {
    for (const [key, value] of Object.entries(entry.params || {})) entry.params[key] = rollValue(key, value, random);
    (entry.with || []).forEach(vary);
  };
  out.traits.forEach(vary);
  return out;
};

/**
 * Reroll an equipment instance with one currency (and optionally an omen family).
 * index = null rerolls every random affix; a number rerolls that one. The fixed legendary line stays.
 * Returns the new instance; throws with a readable message when impossible.
 */
export function rerollWithCurrency(item, library, tagIndex, { family = '', index = null, random = Math.random, pool } = {}) {
  if (!Array.isArray(item?.affixes)) throw new Error('装备实例无效');
  if (!item.affixes.length) throw new Error('普通装备没有可洗炼的词条');
  if (index !== null && (!Number.isInteger(index) || index < 0 || index >= item.affixes.length)) throw new Error('只能洗炼随机词条');
  pool ??= rerollPool(library, tagIndex, family);
  const excluded = [...(item.legendary ? [item.legendary] : []), ...(index === null ? [] : item.affixes.filter((_, i) => i !== index))];
  const need = index === null ? item.affixes.length : 1;
  let picked;
  try { picked = sampleEquipmentAffixes(pool, need, random, excluded); } catch {
    throw new Error(family ? `${tagIndex.familyName(family)}的词条不够洗出 ${need} 条` : '可用词条不足');
  }
  const next = JSON.parse(JSON.stringify(item));
  const rolled = picked.map(def => anyValues(pool.find(p => p.id === def.id) || def, random));
  if (index === null) next.affixes = rolled; else next.affixes[index] = rolled[0];
  return next;
}

/** Family of an omen item doc ('' when the doc is not a valid omen). */
export function omenFamily(tagIndex, doc) {
  if (doc?.category !== 'omen' || !tagIndex) return '';
  const { families } = tagIndex.collectionFamilies(doc.tags);
  return families.length === 1 ? families[0] : '';
}

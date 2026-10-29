// Collections: skills, equipment and items are named sets of traits.
//   skill      Content/Rules/Builds/<id>.json     (UE format, loaded by UDWRuleWorldSubsystem)
//   equipment  Content/Rules/Equipment/<id>.json  (tool-side; UE does not load this folder yet)
//   item       Content/Rules/Items/<id>.json      (tool-side; UE does not load this folder yet)
// Equipment and item trait entries may override trait params and/or be timed:
//   "chill" | {"id":"chill","params":{"slow":40}} | {"id":"frost_damage","duration":8}
// An entry with duration is held for that many seconds after the item is used / the effect triggers
// (RuleHost.grantTraits); without duration it is permanent while equipped.
// "附带持续时间" wrappers (Content/Rules/Timed, grant_traits "stitched") carry any other traits:
//   {"id":"timed_on_kill","params":{"duration":4},"with":["fire_damage",{"id":"chill","params":{"slow":50}}]}
// When the wrapper's trigger fires, the stitched traits are held for `duration` seconds (nesting allowed).
// aggregate() folds a skill plus any number of collections into one build source for compileBuild().
import { newBuild } from './reader.js';
import { RuleLibrary, sourceFromEntry, resolveParamKeys, isStitchable, stitchTarget } from './library.js';
import { sheetGroup } from './character.js';
import { MaxStitchDepth } from './types.js';
import { parseCatalog, defaultCatalog } from './shop.js';
import { readMonsters } from './monsters.js';
import { loadTraitTierCatalog, validateTraitValueEntry } from './trait-tiers.js';
import { DEFAULT_TAG_FILE, parseTagFile, buildTagIndex, checkTagIndex } from './tags.js';
import { AFFIX_CATEGORY_FILE, loadAffixCategoryIndex } from './affix-categories.js';
import { SLOTS } from './equipment-slots.js';
export { SLOTS } from './equipment-slots.js';

export const RARITIES = Object.freeze([
  { id: 'common', name: '普通' },
  { id: 'magic', name: '魔法' },
  { id: 'rare', name: '稀有' },
  { id: 'legendary', name: '传奇' },
  { id: 'unique', name: '独特' },
]);

export const ITEM_CATEGORIES = Object.freeze([
  { id: 'consumable', name: '消耗品' },
  { id: 'material', name: '材料' },
  { id: 'quest', name: '任务物品' },
  { id: 'currency', name: '货币' },
  { id: 'omen', name: '预兆' },
]);

export const COLLECTION_KINDS = Object.freeze({
  skill: { dir: 'Builds', label: '技能', fields: ['id', 'name', 'description', 'active', 'traits'] },
  equipment: { dir: 'Equipment', label: '装备', fields: ['id', 'name', 'description', 'slot', 'rarity', 'level', 'tier', 'tags', 'skills', 'legendary', 'bases', 'traits'] },
  item: { dir: 'Items', label: '物品', fields: ['id', 'name', 'description', 'category', 'rarity', 'stack', 'tags', 'skill', 'traits', 'craft'] },
});

export const ID_PATTERN = /^[a-z0-9_]+$/;
export const MAX_DURATION = 3600;
const lower = text => String(text).toLowerCase();
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const inList = (list, id) => list.some(entry => entry.id === id);

export function kindOfPath(path) {
  const dir = String(path).split(/[\\/]/)[0].toLowerCase();
  if (dir === 'webbuilds') return 'skill';
  return Object.keys(COLLECTION_KINDS).find(kind => COLLECTION_KINDS[kind].dir.toLowerCase() === dir) || null;
}

export function emptyCollection(kind, id = '') {
  if (kind === 'skill') return { id, name: '', description: '', active: '', traits: [] };
  if (kind === 'equipment') return { id, name: '', description: '', slot: 'weapon', rarity: 'magic', level: 1, tags: [], skills: [], traits: [] };
  if (kind === 'item') return { id, name: '', description: '', category: 'consumable', rarity: 'magic', stack: 1, tags: [], skill: '', traits: [] };
  throw new Error(`unknown collection kind ${kind}`);
}

/**
 * One trait entry: "id" | {id, params, duration, with}. Nested ("with") entries cannot have their own
 * duration (the wrapper's duration param applies). Returns {entry:{id, params, duration, with}, error}.
 */
function parseEntry(raw, path, depth) {
  if (typeof raw === 'string' && raw) return { entry: { id: raw, params: {}, duration: 0, with: [] }, error: '' };
  if (!isObject(raw) || typeof raw.id !== 'string' || !raw.id) return { entry: null, error: `${path} 需要特性 id 或 {"id","params","duration","with"}` };
  const allowed = depth === 0 ? ['id', 'params', 'duration', 'with', 'tier'] : ['id', 'params', 'with', 'tier'];
  const extra = Object.keys(raw).filter(key => !allowed.includes(key));
  if (extra.length) return { entry: null, error: `${path} 未知字段：${extra.join(', ')}${depth > 0 && extra.includes('duration') ? '（缝合的特性跟随外层的持续时间）' : ''}` };
  if (raw.tier !== undefined && (!Number.isInteger(raw.tier) || raw.tier < 1 || raw.tier > 10)) return { entry: null, error: `${path}.tier 必须是 1–10 的整数` };
  const params = {};
  if (raw.params !== undefined) {
    if (!isObject(raw.params)) return { entry: null, error: `${path}.params 必须是对象` };
    for (const [key, value] of Object.entries(raw.params)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return { entry: null, error: `${path}.params.${key} 必须是数字` };
      params[key] = value;
    }
  }
  let duration = 0;
  if (raw.duration !== undefined) {
    if (typeof raw.duration !== 'number' || !(raw.duration > 0) || !(raw.duration <= MAX_DURATION)) return { entry: null, error: `${path}.duration 必须是 0–${MAX_DURATION} 秒之间的正数` };
    duration = raw.duration;
  }
  const stitched = [];
  if (raw.with !== undefined) {
    if (!Array.isArray(raw.with)) return { entry: null, error: `${path}.with 必须是数组` };
    if (raw.with.length && depth + 1 > MaxStitchDepth) return { entry: null, error: `${path}.with：缝合最多嵌套 ${MaxStitchDepth} 层` };
    for (let i = 0; i < raw.with.length; ++i) {
      const child = parseEntry(raw.with[i], `${path}.with[${i}]`, depth + 1);
      if (child.error) return child;
      stitched.push(child.entry);
    }
    const duplicate = findDuplicate(stitched);
    if (duplicate) return { entry: null, error: `${path}.with：特性 ${duplicate} 重复` };
  }
  return { entry: { id: raw.id, params, duration, with: stitched, ...(raw.tier !== undefined ? { tier: raw.tier } : {}) }, error: '' };
}

// Same trait twice in one list is an error, except wrappers that carry stitched traits (each is its own effect).
function findDuplicate(entries) {
  const seen = new Set();
  for (const entry of entries) {
    if (entry.with.length) continue;
    if (seen.has(lower(entry.id))) return entry.id;
    seen.add(lower(entry.id));
  }
  return '';
}

/** JSON text or object -> normalized doc. Structural checks only (no library). Returns {doc, error}. */
export function parseCollection(kind, input) {
  const spec = COLLECTION_KINDS[kind];
  if (!spec) return { doc: null, error: `unknown collection kind ${kind}` };
  let root = input;
  if (typeof input === 'string') {
    try { root = JSON.parse(input.replace(/^\uFEFF/, '')); } catch (error) { return { doc: null, error: `不是有效的 JSON：${error.message}` }; }
  }
  if (!isObject(root)) return { doc: null, error: '根节点必须是对象' };
  const unknown = Object.keys(root).filter(key => !spec.fields.includes(key));
  if (unknown.length) return { doc: null, error: `未知字段：${unknown.join(', ')}（允许：${spec.fields.join(', ')}）` };
  const doc = emptyCollection(kind);
  const str = key => (root[key] === undefined ? '' : String(root[key]));
  doc.id = str('id');
  doc.name = str('name');
  doc.description = str('description');
  if (!ID_PATTERN.test(doc.id)) return { doc: null, error: `id 只能包含小写字母、数字和下划线：「${doc.id}」` };
  if (root.traits !== undefined && !Array.isArray(root.traits)) return { doc: null, error: 'traits 必须是数组' };
  const traits = root.traits || [];
  for (let i = 0; i < traits.length; ++i) {
    if (kind === 'skill' && typeof traits[i] !== 'string') return { doc: null, error: `traits[${i}]：技能只能引用特性 id（UE 技能格式不支持参数覆盖、持续时间和缝合）` };
    const { entry, error } = parseEntry(traits[i], `traits[${i}]`, 0);
    if (error) return { doc: null, error };
    doc.traits.push(entry);
  }
  const duplicate = findDuplicate(doc.traits);
  if (duplicate) return { doc: null, error: `特性 ${duplicate} 重复` };
  const seen = new Set(doc.traits.map(entry => lower(entry.id)));
  const tags = root.tags === undefined ? [] : root.tags;
  if (kind !== 'skill') {
    if (!Array.isArray(tags) || tags.some(tag => typeof tag !== 'string')) return { doc: null, error: 'tags 必须是字符串数组' };
    doc.tags = [...new Set(tags.map(tag => tag.trim()).filter(Boolean))];
  }
  if (kind === 'skill') {
    doc.active = str('active') || (doc.traits[0]?.id ?? '');
    if (!doc.traits.length) return { doc: null, error: '技能至少需要一个特性' };
    if (!seen.has(lower(doc.active))) return { doc: null, error: `主动特性 ${doc.active} 必须在 traits 里` };
  } else if (kind === 'equipment') {
    doc.slot = str('slot') || 'weapon';
    doc.rarity = str('rarity') || 'magic';
    doc.level = root.level === undefined ? 1 : root.level;
    if (root.tier !== undefined) {
      if (!Number.isInteger(root.tier) || root.tier < 1 || root.tier > 10) return { doc: null, error: '装备 tier 必须是 1–10 的整数' };
      doc.tier = root.tier;
    }
    if (!inList(SLOTS, doc.slot)) return { doc: null, error: `未知部位 ${doc.slot}` };
    if (!inList(RARITIES, doc.rarity)) return { doc: null, error: `未知稀有度 ${doc.rarity}` };
    if (!Number.isInteger(doc.level) || doc.level < 1 || doc.level > 100) return { doc: null, error: 'level 必须是 1–100 的整数' };
    if (root.skills !== undefined && (!Array.isArray(root.skills) || root.skills.some(id => typeof id !== 'string'))) return { doc: null, error: 'skills 必须是技能 id 数组' };
    doc.skills = [...new Set(root.skills || [])];
    if (root.bases !== undefined) {
      if (!Array.isArray(root.bases) || !root.bases.length || (doc.rarity !== 'legendary' && root.bases.length !== 1)) return { doc: null, error: '普通底材需要一条基础类型；传奇底材可配置多条固定基底词缀' };
      doc.bases = [];
      for (const [index, raw] of root.bases.entries()) {
        const parsed = parseEntry(raw, `bases[${index}]`, 0);
        if (parsed.error) return { doc: null, error: parsed.error };
        if (parsed.entry.duration || parsed.entry.with.length) return { doc: null, error: '基础属性不能配置持续时间或缝合' };
        if (doc.bases.some(entry => entry.id === parsed.entry.id)) return { doc: null, error: '固定基底词缀不能重复' };
        doc.bases.push(parsed.entry);
      }
    }
    if (root.legendary !== undefined) {
      const parsed = parseEntry(root.legendary, 'legendary', 0);
      if (parsed.error) return { doc: null, error: parsed.error };
      doc.legendary = parsed.entry;
    }
  } else {
    doc.category = str('category') || 'consumable';
    doc.rarity = str('rarity') || 'magic';
    doc.stack = root.stack === undefined ? 1 : root.stack;
    doc.skill = str('skill');
    if (!inList(ITEM_CATEGORIES, doc.category)) return { doc: null, error: `未知物品类别 ${doc.category}` };
    if (!inList(RARITIES, doc.rarity)) return { doc: null, error: `未知稀有度 ${doc.rarity}` };
    if (!Number.isInteger(doc.stack) || doc.stack < 1 || doc.stack > 9999) return { doc: null, error: 'stack 必须是 1–9999 的整数' };
    if (root.craft !== undefined) {
      const effect = root.craft;
      if (doc.category !== 'currency' || !isObject(effect) || Object.keys(effect).some(key => !['op', 'count', 'grade'].includes(key)) || !['reroll', 'roll_affixes', 'add_affixes'].includes(effect.op)) return { doc: null, error: 'craft 必须为通货的 reroll / roll_affixes / add_affixes 效果' };
      if (effect.op !== 'reroll' && (!Number.isSafeInteger(effect.count) || effect.count < 1)) return { doc: null, error: 'craft.count 必须是正整数' };
      if (effect.op === 'reroll' && effect.count !== undefined) return { doc: null, error: 'reroll 不能配置 craft.count' };
      if (effect.grade !== undefined && (effect.op !== 'reroll' || !Number.isInteger(effect.grade) || effect.grade < 1 || effect.grade > 3)) return { doc: null, error: 'craft.grade 仅适用于洗炼通货，必须为1–3' };
      doc.craft = { ...effect };
    }
  }
  return { doc, error: '' };
}

/** Reference checks against a loaded RuleLibrary. Returns {error, warnings}. */
export function validateCollection(kind, doc, library) {
  const warnings = [];
  if (!doc.name) warnings.push('没有显示名称');
  const granted = [...(doc.skills || []), ...(doc.skill ? [doc.skill] : [])].flatMap(id => library.build(id)?.traits || []);
  // Known trait, known params, "with" only on wrappers; recursive through stitched entries.
  const checkEntry = (entry, where) => {
    const trait = library.trait(entry.id);
    if (!trait) return `${where}未知特性 ${entry.id}`;
    if (kind === 'skill' && trait.webOnly && !library.build(doc.id)?.webOnly) return `技能不能使用 ${library.traitDisplayName(entry.id)}（网页专用技能请放在 WebBuilds/）`;
    for (const key of Object.keys(entry.params)) {
      if (![...trait.source.params.keys()].some(name => lower(name) === lower(key))) return `${where}特性 ${entry.id} 没有参数 ${key}`;
    }
    // Existing concrete rolls remain valid when the author edits future generation bands.
    const tierError = validateTraitValueEntry(library, entry, { checkRange: false });
    if (tierError) return `${where}${tierError}`;
    const stitchable = isStitchable(trait.source);
    if (entry.with.length && !stitchable) return `${where}${library.traitDisplayName(entry.id)} 不能缝合其他特性（只有“附带持续时间”类特性可以）`;
    if (stitchable && !entry.with.length && kind !== 'skill') warnings.push(`${library.traitDisplayName(entry.id)} 还没有缝合任何特性，触发时不会有效果`);
    for (const child of entry.with) {
      const error = checkEntry(child, `${where}${library.traitDisplayName(entry.id)} › `);
      if (error) return error;
    }
    return '';
  };
  for (const entry of doc.traits) {
    const error = checkEntry(entry, '');
    if (error) return { error, warnings };
    const trait = library.trait(entry.id);
    const parent = trait.source.parentId;
    if (parent && !doc.traits.some(other => lower(other.id) === lower(parent)) && !granted.some(id => lower(id) === lower(parent))) {
      warnings.push(`${library.traitDisplayName(entry.id)} 依赖父特性 ${library.traitDisplayName(trait.source.parentId)}，只有搭配含该特性的技能时才生效`);
    }
  }
  for (const entry of doc.bases || []) {
    const error = checkEntry(entry, '基础属性：');
    if (error) return { error, warnings };
    const source = library.trait(entry.id).source;
    if (source.rules.length || (source.sheet || []).some(row => row.trigger) || (doc.rarity !== 'legendary' && !source.params.size))
      return { error: '基础属性必须是已有被动属性，普通底材须有数值，不能是触发或主动特性', warnings };
  }
  if (kind === 'skill' && !library.trait(doc.active)) return { error: `未知主动特性 ${doc.active}`, warnings };
  if (kind === 'equipment') for (const id of doc.skills) if (!library.build(id)) return { error: `未知技能 ${id}`, warnings };
  if (kind === 'equipment' && doc.slot === 'weapon' && (doc.skills.length !== 1 || /^monster_/.test(doc.skills[0]))) return { error: '武器必须绑定且仅绑定一个玩家技能', warnings };
  if (kind === 'equipment' && doc.legendary) {
    const error = checkEntry(doc.legendary, '固定传奇词条：');
    if (error) return { error, warnings };
  }
  if (kind === 'item' && doc.skill && !library.build(doc.skill)) return { error: `未知技能 ${doc.skill}`, warnings };
  if (!doc.traits.length && kind !== 'skill' && !(doc.skills?.length) && !doc.skill) warnings.push('没有任何特性或技能');
  return { error: '', warnings };
}

/** Stable, readable file text. Entries without overrides are written as plain ids. */
export function serializeCollection(kind, doc) {
  const entryOut = entry => {
    const hasParams = Object.keys(entry.params || {}).length > 0;
    const stitched = entry.with || [];
    if (kind === 'skill' || (!hasParams && entry.tier === undefined && !(entry.duration > 0) && !stitched.length)) return entry.id;
    return {
      id: entry.id,
      ...(entry.tier !== undefined ? { tier: entry.tier } : {}),
      ...(hasParams ? { params: entry.params } : {}),
      ...(entry.duration > 0 ? { duration: entry.duration } : {}),
      ...(stitched.length ? { with: stitched.map(entryOut) } : {}),
    };
  };
  const entries = doc.traits.map(entryOut);
  const out = { id: doc.id, name: doc.name };
  if (doc.description) out.description = doc.description;
  if (kind === 'skill') Object.assign(out, { active: doc.active, traits: entries });
  else if (kind === 'equipment') Object.assign(out, { slot: doc.slot, rarity: doc.rarity, level: doc.level, ...(doc.tier !== undefined ? { tier: doc.tier } : {}), ...(doc.tags.length ? { tags: doc.tags } : {}), ...(doc.skills.length ? { skills: doc.skills } : {}), traits: entries });
  else Object.assign(out, { category: doc.category, rarity: doc.rarity, stack: doc.stack, ...(doc.tags.length ? { tags: doc.tags } : {}), ...(doc.skill ? { skill: doc.skill } : {}), traits: entries });
  if (kind === 'item' && doc.craft) out.craft = { ...doc.craft };
  if (kind === 'equipment' && doc.legendary) out.legendary = entryOut(doc.legendary);
  if (kind === 'equipment' && doc.bases?.length) out.bases = doc.bases.map(entryOut);
  const inline = value => {
    if (Array.isArray(value)) return `[${value.map(inline).join(', ')}]`;
    if (isObject(value)) return `{ ${Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${inline(v)}`).join(', ')} }`;
    return JSON.stringify(value);
  };
  const body = Object.entries(out).map(([key, value]) => {
    if (key === 'traits' && value.length) return `  "traits": [\n${value.map(entry => `    ${inline(entry)}`).join(',\n')}\n  ]`;
    return `  ${JSON.stringify(key)}: ${inline(value)}`;
  });
  return `{\n${body.join(',\n')}\n}\n`;
}

/** Rule-library files under Builds/Equipment/Items -> {skill, equipment, item: Map(lowerId -> {doc, path, error})}. */
export function readCollections(files) {
  const out = { skill: new Map(), equipment: new Map(), item: new Map() };
  for (const file of files) {
    const kind = kindOfPath(file.path);
    if (!kind) continue;
    const { doc, error } = parseCollection(kind, file.text);
    const id = doc ? doc.id : String(file.path).split('/').pop().replace(/\.json$/i, '');
    out[kind].set(lower(id), { doc, path: file.path, error });
  }
  // Skill acquisition is indexed from declarative equipment traits. No skill ids
  // are registered in UI code, and the index never becomes player ownership.
  for (const file of files.filter(file => /^affixes[\\/]/i.test(file.path))) {
    let trait;
    try { trait = JSON.parse(file.text.replace(/^\uFEFF/, '')); } catch { continue; }
    for (const row of Array.isArray(trait?.sheet) ? trait.sheet : []) {
      const skill = out.skill.get(row?.grant_skill);
      if (skill && typeof trait.id === 'string') (skill.grantedBy ||= []).push(trait.id);
    }
  }
  return out;
}

/** Trait summary for pickers and cards. */
export function describeTrait(entry) {
  const source = entry.source;
  const events = [...new Set(source.rules.map(rule => rule.event))];
  const id = source.id;
  const stitchable = isStitchable(source);
  const affix = !!source.sheet?.length;
  const kind = /^monster_/.test(id) ? 'monster' : affix ? 'affix' : stitchable ? 'timed' : events.includes('cast') ? 'active' : source.rules.length ? 'rule' : 'stat';
  return {
    id, name: entry.displayName || id, description: entry.description || '', parent: source.parentId || '',
    params: Object.fromEntries(source.params), events, modifiers: source.modifiers.length, rules: source.rules.length, kind,
    stitchable, stitchTarget: stitchable ? stitchTarget(source) : '', webOnly: !!entry.webOnly,
    group: affix ? sheetGroup(source) : '',
  };
}

export const TRAIT_KIND_NAMES = Object.freeze({ active: '主动', affix: '角色词条', timed: '附带持续时间', rule: '触发', stat: '属性', monster: '怪物' });

const cloneTrait = (source, id, params) => ({ ...source, id, params: new Map([...source.params, ...Object.entries(params)]) });

/**
 * skillId: build id (or an unsaved skill doc) that provides the active trait. parts: [{kind, doc, label}].
 * at: seconds since use; timed entries (duration) are held only while at < duration (default 0 = just used).
 * Same trait from several parts: stat-only traits stack (cloned as id~n); traits with rules keep the first copy.
 * Wrappers with stitched traits ("with") are separate effects: every one is kept (id~n when repeated).
 * Returns {source, contributions:[{traitId, sourceId, from, params, overridden, status, note, duration, stitched}], timed, warnings, error}.
 */
export function aggregate(library, skillId, parts = [], at = 0) {
  const warnings = [];
  const contributions = [];
  const traits = [];
  const used = new Set();
  const build = skillId && typeof skillId === 'object'
    ? { id: skillId.id, displayName: skillId.name, activeId: skillId.active, traits: skillId.traits.map(t => t.id) }
    : skillId ? library.build(skillId) : null;
  if (skillId && !build) return { source: null, contributions, warnings, error: `未知技能 ${skillId}` };
  const add = (traitId, from, params, kind, withEntries = [], tier) => {
    const entry = library.trait(traitId);
    if (!entry) { warnings.push(`${from}：未知特性 ${traitId}`); return; }
    const overrides = resolveParamKeys(entry.source, params);
    const overridden = Object.keys(overrides).length > 0;
    const stitched = withEntries.length > 0;
    let id = entry.source.id;
    const row = { traitId: entry.source.id, sourceId: id, from, kind, params: { ...Object.fromEntries(entry.source.params), ...overrides }, overridden, status: 'on', note: '', stitched: describeStitched(library, withEntries), ...(tier !== undefined ? { tier } : {}) };
    if (used.has(lower(id))) {
      if (entry.source.rules.length && !stitched) {
        // One copy of a rule trait; a later source with overrides re-tunes that copy.
        if (!overridden) { contributions.push({ ...row, status: 'merged', note: '已由前面的来源提供，不重复触发' }); return; }
        const index = traits.findIndex(t => lower(t.id) === lower(id));
        const previous = contributions.find(r => r.status === 'on' && lower(r.sourceId) === lower(id));
        const merged = { ...Object.fromEntries(traits[index].params), ...overrides };
        traits[index] = cloneTrait(entry.source, id, merged);
        if (previous) { previous.status = 'merged'; previous.note = `参数被「${from}」覆盖`; }
        contributions.push({ ...row, params: merged, note: previous ? `覆盖「${previous.from}」的参数` : '' });
        return;
      }
      let n = 2;
      while (used.has(lower(`${entry.source.id}~${n}`))) ++n;
      id = `${entry.source.id}~${n}`;
      row.sourceId = id;
      row.note = stitched ? '另一份缝合效果' : '属性特性叠加';
    }
    used.add(lower(id));
    traits.push(sourceFromEntry(library, { id: traitId, params: overrides, with: withEntries }, id));
    contributions.push(row);
  };
  if (build) for (const id of build.traits) add(id, build.displayName || build.id, {}, 'skill');
  const timed = [];
  for (const part of parts) {
    const from = part.label || part.doc.name || part.doc.id;
    for (const entry of [...(part.doc.bases || []), ...part.doc.traits]) {
      if (entry.duration > 0) {
        timed.push({ id: entry.id, from, duration: entry.duration });
        // At time t only entries whose duration has not run out are held (t = Infinity: permanent only).
        if (!(at < entry.duration)) {
          contributions.push({ traitId: entry.id, sourceId: entry.id, from, kind: part.kind, params: {}, overridden: false, status: 'expired', note: `限时 ${entry.duration}s，已过期`, duration: entry.duration });
          continue;
        }
      }
      const before = contributions.length;
      add(entry.id, from, entry.params, part.kind, entry.with || [], entry.tier);
      for (let i = before; i < contributions.length; ++i) contributions[i].duration = entry.duration || 0;
    }
  }
  const activeId = build ? build.activeId : traits.find(t => t.rules.some(rule => rule.event === 'cast'))?.id || traits[0]?.id;
  if (!activeId) return { source: null, contributions, warnings, timed, error: '没有主动特性：请选择一个技能来测试这些特性' };
  return { source: newBuild(activeId, traits), contributions, warnings, timed, error: '' };
}

/** Stitched entries for display: [{id, name, params (overrides), with:[...]}]. */
export function describeStitched(library, entries = []) {
  return entries.map(entry => ({ id: entry.id, name: library.traitDisplayName(entry.id), params: { ...entry.params }, with: describeStitched(library, entry.with || []), ...(entry.tier !== undefined ? { tier: entry.tier } : {}) }));
}

/** Distinct times (seconds) at which the held set of timed entries changes, ascending. */
export function timedBoundaries(parts) {
  const out = new Set();
  for (const part of parts) for (const entry of part.doc.traits) if (entry.duration > 0) out.add(entry.duration);
  return [...out].sort((a, b) => a - b);
}

/** Marks contributions whose trait did not survive parent composition in the compiled plan. */
export function markEnabled(contributions, plan, library) {
  const enabled = new Set((plan?.traitIds || []).map(lower));
  for (const row of contributions) {
    if (row.status !== 'on' || enabled.has(lower(row.sourceId))) continue;
    const parent = library.trait(row.traitId)?.source.parentId;
    row.status = 'off';
    row.note = parent ? `需要父特性「${library.traitDisplayName(parent)}」，当前技能没有` : '未启用';
  }
  return contributions;
}

/**
 * Whole rule set check (what the server enforces before writing): the UE library load
 * (Traits + Builds) plus every Equipment/Items collection, and file name == id.
 * Returns {ok, error, library, collections}.
 */
export function checkRuleSet(files) {
  const library = new RuleLibrary();
  const loaded = library.load(files);
  if (!loaded.ok) return { ok: false, error: loaded.error, library: null, collections: null };
  const tierResult = loadTraitTierCatalog(files, library);
  if (tierResult.error) return { ok: false, error: tierResult.error, library, collections: null };
  const collections = readCollections(files);
  for (const kind of Object.keys(collections)) {
    for (const [, entry] of collections[kind]) {
      const name = entry.path.split('/').pop();
      if (!entry.doc) return { ok: false, error: `${name}: ${entry.error}`, library, collections };
      if (lower(name) !== `${lower(entry.doc.id)}.json`) return { ok: false, error: `${name}: 文件名必须是 ${entry.doc.id}.json`, library, collections };
      const { error } = validateCollection(kind, entry.doc, library);
      if (error) return { ok: false, error: `${name}: ${error}`, library, collections };
    }
  }
  let catalog = defaultCatalog();
  for (const file of files.filter(f => /^shop[\\/]/i.test(f.path))) {
    if (!/[\\/]catalog\.json$/i.test(file.path)) return { ok: false, error: `${file.path}: 商店目录只能是 Shop/catalog.json`, library, collections };
    const parsed = parseCatalog(file.text);
    if (!parsed.catalog) return { ok: false, error: `catalog.json: ${parsed.error}`, library, collections };
    catalog = parsed.catalog;
  }
  const monsters = readMonsters(files, library, collections);
  for (const entry of monsters.values()) if (entry.error) return { ok: false, error: `${entry.path}: ${entry.error}`, library, collections, catalog, monsters };
  // Tag families (Tags/families.json): every trait tag needs a family; an omen names exactly one family.
  let tags = null;
  const tagFile = files.find(f => lower(f.path) === lower(DEFAULT_TAG_FILE));
  for (const file of files.filter(f => /^tags[\\/]/i.test(f.path))) {
    if (file !== tagFile && lower(file.path.replaceAll('\\', '/')) !== lower(AFFIX_CATEGORY_FILE)) return { ok: false, error: `${file.path}: 标签目录只支持 ${DEFAULT_TAG_FILE} 与 ${AFFIX_CATEGORY_FILE}`, library, collections, catalog, monsters };
  }
  if (tagFile) {
    const parsed = parseTagFile(tagFile.text);
    if (!parsed.doc) return { ok: false, error: `families.json: ${parsed.error}`, library, collections, catalog, monsters };
    tags = buildTagIndex(library, parsed.doc);
    const tagError = checkTagIndex(tags);
    if (tagError) return { ok: false, error: tagError, library, collections, catalog, monsters, tags };
    for (const [, entry] of collections.item) {
      if (entry.doc.category !== 'omen') continue;
      const { families } = tags.collectionFamilies(entry.doc.tags);
      if (families.length !== 1) return { ok: false, error: `${entry.path.split('/').pop()}: 预兆需要恰好一个族 tag（例如“元素族”），现在是 ${families.length} 个`, library, collections, catalog, monsters, tags };
    }
  }
  const categories = loadAffixCategoryIndex(files, library);
  if (categories.error) return { ok: false, error: categories.error, library, collections, catalog, monsters, tags };
  return { ok: true, error: '', library, collections, catalog, monsters, tags, affixCategories: categories.index, traitTiers: tierResult.index };
}

/** Collections that reference a skill or trait id (for delete guards and "used by" lists). */
export function referencesTo(collections, id) {
  const key = lower(id);
  const out = [];
  for (const kind of Object.keys(collections)) {
    for (const [, entry] of collections[kind]) {
      const doc = entry.doc;
      if (!doc) continue;
      const usesTrait = [...(doc.bases || []), ...(doc.legendary ? [doc.legendary] : []), ...doc.traits].some(function uses(t) { return lower(t.id) === key || (t.with || []).some(uses); });
      const usesSkill = (doc.skills || []).some(s => lower(s) === key) || lower(doc.skill || '') === key;
      if (usesTrait || usesSkill) out.push({ kind, id: doc.id, name: doc.name, as: usesSkill ? 'skill' : 'trait' });
    }
  }
  return out;
}

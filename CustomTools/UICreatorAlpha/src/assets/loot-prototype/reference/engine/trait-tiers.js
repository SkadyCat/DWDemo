// Collection value authoring. Rank metadata ends here: the rule engine receives ordinary params.
// No compiler, VM, combat-world or persistence dependency.
export const TRAIT_TIER_COUNT = 10;
export const TRAIT_TIERS_FILE = 'Values/trait_tiers.json';
const indexes = new WeakMap();
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const lower = value => String(value).toLowerCase();
const unit = random => Math.min(1 - Number.EPSILON, Math.max(0, Number(random()) || 0));
const clean = value => +value.toFixed(8);
const validTier = tier => Number.isInteger(tier) && tier >= 1 && tier <= TRAIT_TIER_COUNT;
export const randomTraitTier = (random = Math.random) => 1 + Math.floor(unit(random) * TRAIT_TIER_COUNT);

// Existing sheet triggers encode selection as numbers; these are identities, not magnitudes.
const selectorParam = (source, name) => {
  const triggers = (source.sheet || []).map(entry => entry.trigger);
  return (['source', 'element'].includes(name) && triggers.some(t => ['extra_damage', 'convert_damage'].includes(t)))
    || (name === 'status' && triggers.some(t => ['proj_prefer_status', 'minion_prefer_status'].includes(t)));
};

// Preserve the existing currency range, integer precision, hundredths and percentage caps.
function endpoint(name, base, factor, step) {
  if (base === 0) return 0;
  let value = base * factor;
  if (/chance|percent|slow/.test(lower(name))) value = Math.min(100, value);
  value = Math.round(value / step) * step;
  return clean(value || Math.sign(base) * step);
}

export function defaultTraitTierProfile(source) {
  const params = {};
  for (const [name, base] of source.params) {
    const step = Number.isInteger(base) ? 1 : .01;
    if (selectorParam(source, name)) {
      params[name] = { step, tiers: Array.from({ length: TRAIT_TIER_COUNT }, () => [base, base]) };
      continue;
    }
    const first = endpoint(name, base, .5, step), last = endpoint(name, base, 2, step);
    const direction = last < first ? -1 : 1;
    const count = Math.round(Math.abs(last - first) / step) + 1;
    params[name] = { step, tiers: Array.from({ length: TRAIT_TIER_COUNT }, (_, i) => {
      // Partition the available values, rather than sharing rounded endpoints between ranks.
      // Small integer ranges necessarily repeat; do not invent extra values beyond the old range.
      const start = count >= TRAIT_TIER_COUNT ? Math.floor(i * count / TRAIT_TIER_COUNT) : Math.floor(i * (count - 1) / (TRAIT_TIER_COUNT - 1));
      const end = count >= TRAIT_TIER_COUNT ? Math.floor((i + 1) * count / TRAIT_TIER_COUNT) - 1 : start;
      const a = clean(first + direction * start * step), b = clean(first + direction * end * step);
      return [Math.min(a, b), Math.max(a, b)];
    }) };
  }
  return { params };
}

/** Optional authored overrides; missing numeric traits/params get the same ten default bands. */
export function parseTraitTierCatalog(input) {
  let doc = input;
  const fail = error => ({ doc: null, error });
  if (typeof input === 'string') {
    try { doc = JSON.parse(input.replace(/^\uFEFF/, '')); } catch (e) { return fail(`数值分阶不是有效 JSON：${e.message}`); }
  }
  if (!object(doc) || Object.keys(doc).some(k => !['version', 'tiers', 'traits'].includes(k))) return fail('数值分阶需要 version、tiers、traits');
  if (doc.version !== 1 || doc.tiers !== TRAIT_TIER_COUNT || !object(doc.traits)) return fail('数值分阶 version 必须为 1，tiers 必须为 10，traits 必须是对象');
  for (const [id, profile] of Object.entries(doc.traits)) {
    if (!/^[a-z0-9_]+$/.test(id) || !object(profile) || Object.keys(profile).some(k => k !== 'params') || !object(profile.params)) return fail(`数值分阶 ${id} 需要 params`);
    for (const [name, spec] of Object.entries(profile.params)) {
      const where = `数值分阶 ${id}.${name}`;
      if (!object(spec) || Object.keys(spec).some(k => !['step', 'tiers'].includes(k)) || !Number.isFinite(spec.step) || spec.step <= 0) return fail(`${where}.step 必须是正数`);
      if (!Array.isArray(spec.tiers) || spec.tiers.length !== TRAIT_TIER_COUNT) return fail(`${where} 必须恰好有 10 阶`);
      for (const [i, band] of spec.tiers.entries()) {
        if (!Array.isArray(band) || band.length !== 2 || band.some(n => !Number.isFinite(n)) || band[0] > band[1]) return fail(`${where} 第 ${i + 1} 阶需要 [最小值, 最大值]`);
        if (band.some(n => Math.abs(n / spec.step - Math.round(n / spec.step)) > 1e-6)) return fail(`${where} 第 ${i + 1} 阶不符合 step 精度`);
      }
    }
  }
  return { doc: JSON.parse(JSON.stringify(doc)), error: '' };
}

/** Build the upper-layer index without modifying the RuleLibrary or trait source objects. */
export function buildTraitTierIndex(library, catalog = { version: 1, tiers: 10, traits: {} }) {
  const parsed = parseTraitTierCatalog(catalog);
  if (parsed.error) return { index: null, error: parsed.error };
  const index = new Map();
  for (const trait of library.traits.values()) if (trait.source.params.size) index.set(lower(trait.source.id), defaultTraitTierProfile(trait.source));
  for (const [id, profile] of Object.entries(parsed.doc.traits)) {
    const trait = library.trait(id);
    if (!trait) return { index: null, error: `数值分阶引用未知特性 ${id}` };
    if (!trait.source.params.size) return { index: null, error: `${id} 没有数值参数，不需要分阶` };
    for (const [name, spec] of Object.entries(profile.params)) {
      const key = [...trait.source.params.keys()].find(k => lower(k) === lower(name));
      if (!key) return { index: null, error: `数值分阶 ${id} 没有参数 ${name}` };
      if (selectorParam(trait.source, key) && spec.tiers.some(([min, max]) => min !== trait.source.params.get(key) || max !== min)) return { index: null, error: `数值分阶 ${id}.${key} 是机制编号，必须保持原值` };
      index.get(lower(id)).params[key] = spec;
    }
  }
  return { index, error: '' };
}

export function loadTraitTierCatalog(files, library) {
  const values = files.filter(f => /^values[\\/]/i.test(f.path));
  if (values.some(f => lower(f.path.replaceAll('\\', '/')) !== lower(TRAIT_TIERS_FILE))) return { index: null, error: `数值分阶只能写在 ${TRAIT_TIERS_FILE}` };
  if (values.length > 1) return { index: null, error: `${TRAIT_TIERS_FILE} 重复` };
  const parsed = values.length ? parseTraitTierCatalog(values[0].text) : { doc: undefined, error: '' };
  if (parsed.error) return { index: null, error: parsed.error };
  const result = buildTraitTierIndex(library, parsed.doc);
  if (result.index) indexes.set(library, result.index);
  return result;
}

export function traitTierProfile(library, id) {
  const source = library.trait(id)?.source;
  if (!source?.params.size) return null;
  return indexes.get(library)?.get(lower(id)) || defaultTraitTierProfile(source);
}

/** Numeric values are generated once, then saved with the collection entry, including nested traits. */
export function createTraitValueEntry(library, id, { tier = null, random = Math.random } = {}) {
  const source = library.trait(id)?.source;
  if (!source) throw new Error(`未知特性 ${id}`);
  const entry = { id: source.id, params: {}, with: [] };
  const profile = traitTierProfile(library, id);
  if (!profile) {
    if (tier !== null) throw new Error(`${id} 没有数值参数，不需要分阶`);
    return entry;
  }
  tier ??= randomTraitTier(random);
  if (!validTier(tier)) throw new Error('特性阶级必须是 1–10 的整数');
  entry.tier = tier;
  entry.params = rollTraitTierParams(profile, tier, random);
  return entry;
}

export function rollTraitTierParams(profile, tier, random = Math.random) {
  if (!validTier(tier)) throw new Error('特性阶级必须是 1–10 的整数');
  const params = {};
  for (const [name, spec] of Object.entries(profile.params)) {
    const [min, max] = spec.tiers[tier - 1];
    const steps = Math.round((max - min) / spec.step);
    params[name] = clean(min + Math.floor(unit(random) * (steps + 1)) * spec.step);
  }
  return params;
}

/** A ranked entry must save complete concrete values; runtime aggregation never rolls numbers. */
export function validateTraitValueEntry(library, entry, { checkRange = true } = {}) {
  if (entry.tier === undefined) return '';
  if (!validTier(entry.tier)) return '特性阶级必须是 1–10 的整数';
  const profile = traitTierProfile(library, entry.id);
  if (!profile) return `${entry.id} 没有数值参数，不需要分阶`;
  for (const [name, spec] of Object.entries(profile.params)) {
    const key = Object.keys(entry.params || {}).find(k => lower(k) === lower(name));
    const value = entry.params?.[key], [min, max] = spec.tiers[entry.tier - 1];
    if (!Number.isFinite(value)) return `${entry.id} 第 ${entry.tier} 阶缺少实际参数 ${name}`;
    if (checkRange && (value < min - 1e-8 || value > max + 1e-8 || Math.abs(value / spec.step - Math.round(value / spec.step)) > 1e-6)) return `${entry.id}.${name} 第 ${entry.tier} 阶范围为 ${min}–${max}，步长 ${spec.step}`;
  }
  return '';
}

/** A compact, editable catalogue: each trait has one line; each numeric parameter has ten bands. */
export function serializeTraitTierCatalog(index) {
  const entries = [...index].sort(([a], [b]) => a.localeCompare(b));
  return '{\n  "version": 1,\n  "tiers": 10,\n  "traits": {\n' + entries.map(([id, value]) => `    ${JSON.stringify(id)}: ${JSON.stringify(value)}`).join(',\n') + '\n  }\n}\n';
}

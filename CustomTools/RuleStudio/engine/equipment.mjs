// Rolled equipment instances. Affixes reference existing rule-library traits only.
// This module has no persistence, UI, or combat-world dependency.
import { isStitchable } from './library.mjs';
import { isFixedEquipmentSlot } from './equipment-slots.mjs';
import { hashName } from './types.mjs';
import { TRAIT_TIER_COUNT, defaultTraitTierProfile, traitTierProfile, rollTraitTierParams, createTraitValueEntry } from './trait-tiers.mjs';
import { SUMMON_HIT_AFFIXES } from './summon-hit-affixes.mjs';
import { TRIGGER_SKILL_AFFIXES } from './trigger-skill-affixes.mjs';

export const EQUIPMENT_RARITIES = Object.freeze(['common', 'magic', 'rare', 'legendary']);
export const EQUIPMENT_RARITY_NAMES = Object.freeze({ common: '普通', magic: '魔法', rare: '稀有', legendary: '传奇' });
// Quality follows explicit affixes, excluding bases and the bound skill. A
// composed affix counts once. Pending identification keeps its drop quality.
export function equipmentRarity(item) {
  if (!item || item.identified === false || !Array.isArray(item.affixes)) return item?.rarity || 'common';
  if (item.legendary || item.extraLegendary?.length) return 'legendary';
  return item.affixes.length === 0 ? 'common' : item.affixes.length <= 2 ? 'magic' : 'rare';
}
export function normalizeEquipmentRarity(item) {
  if (item && item.identified !== false && Array.isArray(item.affixes)) item.rarity = equipmentRarity(item);
  return item;
}
const copy = value => JSON.parse(JSON.stringify(value));
const roll = random => Math.min(1 - Number.EPSILON, Math.max(0, Number(random()) || 0));
const integer = (random, min, max) => min + Math.floor(roll(random) * (max - min + 1));
// Distinct mounted skills may share the same trigger wrapper. Conflicts are in
// their payloads; the affix id already prevents rolling the identical line twice.
const entryIds = entry => entry.with?.length ? entry.with.flatMap(entryIds) : [entry.id];
const normalized = entry => typeof entry === 'string' ? { id: entry, params: {}, duration: 0, with: [] } : { params: {}, duration: 0, with: [], ...copy(entry) };

/** Legacy instances retain their values; their next wash uses the old unrestricted T10 cap. */
export function equipmentTier(item) {
  const tier = item.tier ?? TRAIT_TIER_COUNT;
  if (!Number.isInteger(tier) || tier < 1 || tier > TRAIT_TIER_COUNT) throw new Error('装备 T 阶必须是 1–10 的整数');
  return tier;
}

/** Separate stream: item rolls must not change monster movement/spawn randomness. */
export function equipmentRandom(seed = 1) {
  let state = (seed >>> 0) || 1;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}

/** Named compound affixes compose existing traits and complete mounted skills. */
export function equipmentAffixPool(library) {
  const combinations = [
    ['shocking_hits', '闪电感电', ['lightning_damage', 'shock']],
    ['igniting_hits', '火焰点燃', ['fire_damage', 'ignite']],
    ['bleeding_hits', '物理流血', ['physical_damage', 'bleed']],
    ['freezing_hits', '冰缓冻结', ['chill', 'freeze']],
    ['brittle_hits', '冰缓易碎', ['chill', 'brittle']],
    ['shattering_kills', '冰缓碎裂', ['chill', 'shatter']],
  ];
  const standaloneExcluded = new Set(['hit_retaliation_nova', 'shock', 'ignite', 'bleed', 'freeze', 'brittle', 'shatter', 'flask_life', 'treasury_release', 'minion_seek_range', 'player_stun_buildup', 'player_stun_threshold', 'player_stun_recovery',
    'vector_control', 'projectile_capture', 'self_targeted_cast', 'independent_skill_cooldown', 'hostile_projectile_attraction', 'damage_immunity']); // Intrinsic capability traits never roll independently.
  const pool = [];
  for (const entry of library.traits.values()) {
    const source = entry.source;
    if (/^(monster_|map_)/.test(source.id) || source.rules.some(r => r.event === 'cast') || source.sheet?.some(row => row.trigger === 'aura_skill') || isStitchable(source) || standaloneExcluded.has(source.id)) continue;
    pool.push({ id: source.id, name: entry.displayName || source.id, traits: [{ id: source.id, params: Object.fromEntries(source.params), with: [] }] });
  }
  for (const [id, name, ids] of combinations) {
    if (ids.every(key => library.trait(key))) pool.push({ id, name, traits: ids.map(key => ({ id: key, params: Object.fromEntries(library.trait(key).source.params), with: [] })) });
  }
  for (const { id, name, skill } of SUMMON_HIT_AFFIXES) {
    const build = library.build(skill), trigger = library.trait('trig_hit');
    if (!build || !trigger || !build.traits.every(key => library.trait(key))) continue;
    pool.push({ id, name, traits: [{
      id: 'trig_hit', params: Object.fromEntries(trigger.source.params),
      with: build.traits.map(key => ({ id: key, params: Object.fromEntries(library.trait(key).source.params), with: [] })),
    }] });
  }
  for (const { id, name, trigger, skills } of TRIGGER_SKILL_AFFIXES) {
    const wrapper = library.trait(trigger);
    const builds = skills.map(id => library.build(id));
    if (!wrapper || builds.some(b => !b || !b.traits.every(id => library.trait(id)))) continue;
    const payload = [...new Set(builds.flatMap(b => b.traits))];
    pool.push({ id, name, traits: [{ id: trigger, params: Object.fromEntries(wrapper.source.params),
      with: payload.map(id => ({ id, params: Object.fromEntries(library.trait(id).source.params), with: [] })) }] });
  }
  return pool;
}

const conflict = (a, b) => {
  const ids = new Set(a.traits.flatMap(entryIds));
  return b.traits.some(entry => entryIds(entry).some(id => ids.has(id)));
};

/** Numeric variance uses only parameters that already exist on the authored trait. */
export function rollEquipmentAffix(definition, random = Math.random, library = null, maxTier = TRAIT_TIER_COUNT) {
  equipmentTier({ tier: maxTier });
  const affix = copy(definition);
  const profileOf = entry => (library && traitTierProfile(library, entry.id)) || defaultTraitTierProfile({ params: new Map(Object.entries(entry.params || {})) });
  const numeric = entry => Object.keys(profileOf(entry).params).length > 0 || (entry.with || []).some(numeric);
  const tier = affix.traits.some(numeric) ? integer(random, 1, maxTier) : null;
  if (tier !== null) affix.tier = tier;
  const vary = entry => {
    const profile = profileOf(entry);
    if (Object.keys(profile.params).length) {
      entry.tier = tier;
      entry.params = rollTraitTierParams(profile, tier, random);
    }
    (entry.with || []).forEach(vary);
  };
  affix.traits.forEach(vary);
  return affix;
}

// Concrete ranked inherent entries are authored collection values, not washable
// random lines. Keep their rank/params; lower-tier drops still obey the item cap.
function rollInherentAffix(definition, random, library, maxTier) {
  // Preserve the ordinary acquisition random stream, including existing BD seeds.
  const varied = rollEquipmentAffix(definition, random, library, maxTier);
  const ranked = entry => (!library.trait(entry.id)?.source.params.size || entry.tier !== undefined)
    && (entry.with || []).every(ranked);
  if (!definition.traits.every(ranked)) return varied;
  const fixed = copy(definition);
  const materialize = entry => {
    if (entry.tier > maxTier) Object.assign(entry, createTraitValueEntry(library, entry.id, { tier: maxTier, random }), { with: entry.with || [] });
    (entry.with || []).forEach(materialize);
  };
  fixed.traits.forEach(materialize);
  const tiers = entry => [entry.tier || 0, ...(entry.with || []).flatMap(tiers)];
  const tier = Math.max(0, ...fixed.traits.flatMap(tiers));
  if (tier) fixed.tier = tier;
  return fixed;
}

export function sampleEquipmentAffixes(pool, count, random = Math.random, excluded = [], library = null, maxTier = TRAIT_TIER_COUNT) {
  const chosen = [];
  for (let i = 0; i < count; ++i) {
    const available = pool.filter(def => ![...excluded, ...chosen].some(other => other.id === def.id || conflict(def, other)));
    if (!available.length) throw new Error('可用词条不足，无法生成指定数量且不重复的词条');
    chosen.push(rollEquipmentAffix(available[integer(random, 0, available.length - 1)], random, library, maxTier));
  }
  return chosen;
}

// Item creation only. Both bases remain ordinary trait entries when aggregated.
export function equipmentBasePool(library, defensive = false) {
  const defense = path => /^(defense|armour|evasion|shield|life|resistance|block|evade|recoup|leech|heal)\./.test(path)
    && !/damage|critical|\.crit|counter|reflect|attack_speed|cast_speed|added|overflow/.test(path);
  return equipmentAffixPool(library).filter(affix => affix.traits.length === 1 && (() => {
    const source = library.trait(affix.traits[0].id).source;
    const sheet = source.sheet || [];
    if (source.rules.length || !source.params.size || sheet.some(row => row.trigger)) return false;
    if (!defensive) return true;
    return (sheet.length > 0 || source.modifiers.length > 0)
      && sheet.every(row => row.stat && defense(row.stat))
      && source.modifiers.every(row => /^(element\.[^.]+\.(resistance|max_resistance)|owner\.max_(life|mana))$/.test(row.stat));
  })()).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function rollEquipmentBases(template, library, tier, random = Math.random) {
  if (!template.bases?.length) return [];
  if (template.rarity === 'legendary') return template.bases.map(raw => {
    const entry = normalized(raw);
    return rollInherentAffix({ id: entry.id, name: library.traitDisplayName(entry.id), traits: [entry] }, random, library, tier);
  });
  if (template.bases.length !== 1) throw new Error('底材必须锁定一条基础属性');
  const entry = normalized(template.bases[0]);
  const fixed = rollEquipmentAffix({ id: entry.id, name: library.traitDisplayName(entry.id), traits: [entry] }, random, library, tier);
  const second = sampleEquipmentAffixes(equipmentBasePool(library, template.slot !== 'weapon'), 1, random, [fixed], library, tier)[0];
  return [fixed, second];
}

/** Add bases once to existing instances; never reroll held explicit/legendary affixes. */
export function ensureEquipmentBases(item, template, library) {
  if (item?.synthesized) return item;
  if (!item || item.identified === false || !template?.bases?.length) return item;
  if (template.rarity === 'legendary') {
    if (JSON.stringify((item.bases || []).map(base => base.id)) === JSON.stringify(template.bases.map(base => base.id))) return item;
  } else if (item.bases?.length) return item;
  const random = equipmentRandom(Number(hashName(`bases:${item.uid}`) & 0xffffffffn));
  item.bases = rollEquipmentBases(template, library, equipmentTier(item), random);
  return item;
}

/** Reconcile authored fixed slots without touching owned random rolls or reroll bindings. */
export function ensureEquipmentInherentTraits(item, template, library) {
  if (item?.synthesized) return item;
  ensureEquipmentBases(item, template, library);
  if (!item || item.identified === false || item.rarity !== 'legendary' || template?.rarity !== 'legendary') return item;
  const definition = fixedEquipmentAffix(template, library);
  if (!definition) return item;
  if (JSON.stringify(item.legendary?.traits?.map(t => t.id)) === JSON.stringify(definition.traits.map(t => t.id))) return item;
  const random = equipmentRandom(Number(hashName(`legendary:${item.uid}`) & 0xffffffffn));
  const fixed = rollInherentAffix(definition, random, library, equipmentTier(item));
  fixed.traits = fixed.traits.map(entry => copy(item.legendary?.traits?.find(old => old.id === entry.id) || entry));
  item.legendary = fixed;
  return item;
}

/** Legendary: six total lines, one fixed and five random. */
export function equipmentAffixCount(rarity, random = Math.random, policy = {}) {
  if (rarity === 'common') return 0;
  if (rarity === 'magic') return integer(random, 1, 2);
  if (rarity === 'rare') return integer(random, 3, 6);
  if (rarity === 'legendary') return 5;
  throw new Error(`未知装备品质：${rarity}`);
}

export function fixedEquipmentAffix(template, library) {
  const raw = template.legendary || template.traits?.find(t => t.with?.length) || template.traits?.find(t => library.trait(t.id)?.source.rules.length) || template.traits?.[0];
  if (!raw) return null;
  const entry = normalized(raw);
  // The same mounted composition keeps its named affix identity when fixed on a
  // legendary item. Hunter can then match the existing concrete trigger choice.
  if (entry.with.length) {
    const shape = t => JSON.stringify([t.id, (t.with || []).map(shape)]);
    const key = shape(entry);
    const composition = equipmentAffixPool(library).find(def => def.traits.length === 1 && shape(def.traits[0]) === key);
    if (composition) return { id: composition.id, name: composition.name, traits: [entry] };
  }
  return { id: `legendary:${template.id}`, name: library.traitDisplayName(entry.id), traits: [entry] };
}

export function rollEquipment(template, library, { random = Math.random, rarity = template.rarity, tier = template.tier ?? 1, policy = {}, uid, pool = equipmentAffixPool(library) } = {}) {
  equipmentTier({ tier });
  if (!EQUIPMENT_RARITIES.includes(rarity)) throw new Error(`未知装备品质：${rarity}`);
  const fixedDefinition = rarity === 'legendary' ? fixedEquipmentAffix(template, library) : null;
  const fixed = fixedDefinition ? (template.rarity === 'legendary' ? rollInherentAffix : rollEquipmentAffix)(fixedDefinition, random, library, tier) : null;
  if (rarity === 'legendary' && !fixed) throw new Error(`${template.name || template.id} 没有可用的固定传奇词条`);
  const count = equipmentAffixCount(rarity, random, policy);
  const affixes = sampleEquipmentAffixes(pool, count, random, fixed ? [fixed] : [], library, tier);
  return normalizeEquipmentRarity({
    uid: uid || `eq_${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`}`,
    baseId: template.id, name: template.name || template.id, slot: template.slot, level: template.level || 1, rarity, tier,
    skill: (template.skills || [])[0] || '', affixes, legendary: fixed, identified: true,
    bases: rollEquipmentBases(template, library, tier, random),
  });
}

/** Identification creates values once, preserving the dropped item's identity, rarity and T cap. */
export function identifyEquipment(item, template, library, { random = Math.random, createEquipment = rollEquipment } = {}) {
  if (item?.identified !== false) throw new Error('装备已鉴定');
  if (!template || template.id !== item.baseId) throw new Error('未知装备底材');
  return createEquipment(template, library, { uid: item.uid, rarity: item.rarity, tier: equipmentTier(item), random });
}

/** Keep the exact count, identity, bound skill and fixed legendary line when rerolling. */
export function rerollEquipment(item, library, { random = Math.random, index = null } = {}) {
  if (item.identified === false) throw new Error('请先鉴定装备');
  if (!Array.isArray(item.affixes)) throw new Error('装备实例无效');
  if (item.affixes.length === 0) throw new Error('普通装备没有可洗练的词条');
  if (index !== null && (!Number.isInteger(index) || index < 0 || index >= item.affixes.length)) throw new Error('只能洗练随机词条');
  const pool = equipmentAffixPool(library);
  const excluded = [...(item.legendary ? [item.legendary] : []), ...(item.extraLegendary || [])];
  const next = copy(item);
  next.tier = equipmentTier(item);
  if (index === null) next.affixes = sampleEquipmentAffixes(pool, item.affixes.length, random, excluded, library, next.tier);
  else {
    const others = [...excluded, ...item.affixes.filter((_, i) => i !== index)];
    next.affixes[index] = sampleEquipmentAffixes(pool, 1, random, others, library, next.tier)[0];
  }
  return normalizeEquipmentRarity(next);
}

/** Replace random lines; identity, bases and the fixed legendary line stay intact. */
export function rollEquipmentAffixes(item, library, { count, random = Math.random, pool = equipmentAffixPool(library) } = {}) {
  if (item?.identified === false) throw new Error('请先鉴定装备');
  if (!item?.uid || !Array.isArray(item.affixes)) throw new Error('装备实例无效');
  if (isFixedEquipmentSlot(item.slot)) throw new Error('固定装备槽不能加工词条');
  if (!Number.isSafeInteger(count) || count < 1) throw new Error('随机词缀数量必须是正整数');
  const tier = equipmentTier(item);
  const affixes = sampleEquipmentAffixes(pool, count, random, [...(item.legendary ? [item.legendary] : []), ...(item.extraLegendary || [])], library, tier);
  const next = copy(item);
  next.tier = tier;
  next.affixes = affixes;
  delete next.reforgeTargets;
  return normalizeEquipmentRarity(next);
}

/** Append rolls from the existing pool; drop rarity counts are not a crafting cap. */
export function addEquipmentAffixes(item, library, { count, random = Math.random, pool = equipmentAffixPool(library) } = {}) {
  if (item?.identified === false) throw new Error('请先鉴定装备');
  if (!item?.uid || !Array.isArray(item.affixes)) throw new Error('装备实例无效');
  if (isFixedEquipmentSlot(item.slot)) throw new Error('固定装备槽不能使用增缀道具');
  if (!Number.isSafeInteger(count) || count < 1) throw new Error('追加词条数量必须是正整数');
  const tier = equipmentTier(item), excluded = [...item.affixes, ...(item.legendary ? [item.legendary] : []), ...(item.extraLegendary || [])];
  const added = sampleEquipmentAffixes(pool, count, random, excluded, library, tier);
  const next = copy(item);
  next.tier = tier;
  next.affixes.push(...added);
  return normalizeEquipmentRarity(next);
}

/** Remove random lines only, preserving the currency grades of earlier bound lines. */
export function removeEquipmentAffixes(item, { count = 1, random = Math.random } = {}) {
  if (!item?.uid || item.identified === false || !Array.isArray(item.affixes) || isFixedEquipmentSlot(item.slot)
    || !Number.isSafeInteger(count) || count < 1 || count > item.affixes.length) throw new Error('没有足够的可移除随机词缀');
  const targets = item.reforgeTargets || [];
  if (!Array.isArray(targets) || targets.length > 3 || new Set(targets).size !== targets.length
    || targets.some(index => !Number.isInteger(index) || index < 0 || index >= item.affixes.length)) throw new Error('装备洗炼记录无效');
  const next = copy(item);
  for (let n = 0; n < count; n++) {
    const index = Math.min(next.affixes.length - 1, Math.max(0, Math.floor(random() * next.affixes.length)));
    if (next.reforgeTargets) {
      const grade = next.reforgeTargets.indexOf(index);
      next.reforgeTargets = (grade < 0 ? next.reforgeTargets : next.reforgeTargets.slice(0, grade)).map(value => value > index ? value - 1 : value);
    }
    next.affixes.splice(index, 1);
  }
  return normalizeEquipmentRarity(next);
}

export function equipmentDocument(item, collections) {
  if (item?.identified === false) return null;
  if (typeof item === 'string') return collections?.equipment?.get(item)?.doc || null;
  if (!item?.uid || !Array.isArray(item.affixes)) return null;
  return {
    id: item.uid, name: item.name, description: '', slot: item.slot, rarity: equipmentRarity(item), level: item.level, tier: equipmentTier(item),
    tags: [], skills: item.skill ? [item.skill] : [],
    traits: [...(item.bases || []), ...(item.legendary ? [item.legendary] : []), ...(item.extraLegendary || []), ...item.affixes].flatMap(affix => affix.traits.map(normalized)),
  };
}

export function randomEquipmentRarity(random = Math.random) {
  const value = roll(random);
  return value < 0.5 ? 'common' : value < 0.8 ? 'magic' : value < 0.98 ? 'rare' : 'legendary';
}

/** Drops roll their values once by default; an explicit pending item can still be identified later. */
export function rollEquipmentDrop(collections, library, { random = Math.random, chance = 0.3, rarity = null, tier = null, maxTier = TRAIT_TIER_COUNT, policy = {}, uid, identified = true, pool, createEquipment = rollEquipment } = {}) {
  maxTier = equipmentTier({ tier: maxTier });
  if (tier !== null) tier = equipmentTier({ tier });
  if (rarity !== null && !EQUIPMENT_RARITIES.includes(rarity)) throw new Error(`未知装备品质：${rarity}`);
  if (roll(random) >= chance) return null;
  // Keep the acquisition rarity roll independent of how many legendary designs are authored.
  const selection = roll(random), quality = rarity ?? randomEquipmentRarity(random);
  const templates = [...(collections?.equipment?.values() || [])].map(entry => entry.doc).filter(doc => doc && !isFixedEquipmentSlot(doc.slot) && (doc.rarity !== 'legendary' || quality === 'legendary'));
  if (!templates.length) return null;
  const template = templates[Math.floor(selection * templates.length)];
  const itemTier = tier === null ? integer(random, 1, maxTier) : Math.min(tier, maxTier);
  if (identified) return createEquipment(template, library, { random, rarity: quality, tier: itemTier, policy, uid, pool });
  return { uid: uid || `eq_${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`}`,
    baseId: template.id, name: template.name || template.id, slot: template.slot, level: template.level || 1,
    rarity: quality, tier: itemTier, identified: false, skill: '', affixes: [], bases: [], legendary: null };
}

// Tool-side monster archetypes. Skills reference the same Builds/ used by the rule engine.
import { compileBuild } from './compiler.js';
import { EBuiltinEvent } from './types.js';
import { newBuild } from './reader.js';
import { sourceFromEntry, withHeld } from './library.js';
import { validateTraitValueEntry } from './trait-tiers.js';
import { resolvePawnEquipment, pawnEquipmentSources, monsterEquipmentDefaults } from './pawn-equipment.js';
import { MONSTER_FIXED_SLOTS } from './equipment-slots.js';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const idPattern = /^[a-z0-9_]+$/;
export const emptyMonster = (id = '') => ({ id, name: '', description: '', enabled: true, weight: 1, minFloor: 1, health: 80, speed: 300, stopDistance: 130, color: '#a82e32', equipment: monsterEquipmentDefaults(), traits: [], skills: [] });
export const emptyMonsterSkill = (id = 'monster_claw') => ({ id, enabled: true, range: 150, cooldown: 1.2, power: 10 });
export const serializeMonster = doc => JSON.stringify(doc, null, 2) + '\n';

export function parseMonsterTraits(raw = []) {
  if (!Array.isArray(raw)) return { entries: null, error: '怪物词条 traits 必须是数组' };
  const entries = [], seen = new Set();
  for (const value of raw) {
    const entry = typeof value === 'string' ? { id: value } : value;
    if (!object(entry) || typeof entry.id !== 'string' || !idPattern.test(entry.id)) return { entries: null, error: '怪物词条需要有效的特性 id' };
    if (Object.keys(entry).some(k => !['id', 'params', 'tier'].includes(k))) return { entries: null, error: `怪物词条 ${entry.id} 只能有 id、params、tier` };
    if (entry.tier !== undefined && (!Number.isInteger(entry.tier) || entry.tier < 1 || entry.tier > 10)) return { entries: null, error: `怪物词条 ${entry.id} 的 tier 必须是 1–10 的整数` };
    if (seen.has(entry.id)) return { entries: null, error: `怪物词条 ${entry.id} 重复` };
    if (entry.params !== undefined && (!object(entry.params) || Object.values(entry.params).some(v => !Number.isFinite(v)))) return { entries: null, error: `怪物词条 ${entry.id} 的参数必须是有限数字` };
    seen.add(entry.id); entries.push({ id: entry.id, params: { ...entry.params }, ...(entry.tier !== undefined ? { tier: entry.tier } : {}) });
  }
  return { entries, error: '' };
}

/** Monster affixes use ordinary trait sources and parameter overrides, shared with equipment. */
export function monsterTraitSources(library, entries) {
  const parsed = parseMonsterTraits(entries);
  if (parsed.error) return { sources: null, error: parsed.error };
  const sources = [];
  for (const entry of parsed.entries) {
    if (entry.id === 'monster_tower_level') return { sources: null, error: '塔层级必须来自塔地图属性槽装备，不能直接配置为怪物特性' };
    const trait = library.trait(entry.id);
    if (!trait) return { sources: null, error: `未知怪物特性 ${entry.id}` };
    for (const key of Object.keys(entry.params)) {
      if (![...trait.source.params.keys()].some(k => k.toLowerCase() === key.toLowerCase())) return { sources: null, error: `特性 ${entry.id} 没有参数 ${key}` };
    }
    const tierError = validateTraitValueEntry(library, entry, { checkRange: false });
    if (tierError) return { sources: null, error: tierError };
    sources.push(sourceFromEntry(library, entry));
  }
  return { sources, error: '' };
}

export function parseMonster(input) {
  const fail = error => ({ doc: null, error });
  let root = input;
  if (typeof input === 'string') {
    try { root = JSON.parse(input.replace(/^\uFEFF/, '')); } catch (e) { return fail(`不是有效的 JSON：${e.message}`); }
  }
  if (!object(root)) return fail('怪物配置必须是对象');
  const doc = { ...emptyMonster(), ...root };
  const unknown = Object.keys(root).filter(k => !Object.hasOwn(emptyMonster(), k));
  if (unknown.length) return fail(`未知怪物字段：${unknown.join('、')}`);
  if (typeof doc.id !== 'string' || !idPattern.test(doc.id)) return fail('怪物 id 只能包含小写字母、数字和下划线');
  if (typeof doc.name !== 'string' || !doc.name.trim()) return fail('请填写怪物名称');
  if (typeof doc.description !== 'string') return fail('描述必须是文字');
  if (typeof doc.enabled !== 'boolean') return fail('启用必须是布尔值');
  if (!Number.isSafeInteger(doc.minFloor) || doc.minFloor < 1) return fail('开始出现层数必须是大于等于 1 的整数');
  for (const [key, name, min, max] of [['weight', '刷新权重', 0, 10000], ['health', '生命', 1, 1000000], ['speed', '移动速度', 0, 3000], ['stopDistance', '停步距离', 0, 5000]]) {
    if (!Number.isFinite(doc[key]) || doc[key] < min || doc[key] > max) return fail(`${name}必须在 ${min}–${max} 之间`);
  }
  if (typeof doc.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(doc.color)) return fail('颜色必须为 #RRGGBB');
  const traits = parseMonsterTraits(doc.traits);
  if (traits.error) return fail(traits.error);
  if (!object(doc.equipment) || Object.values(doc.equipment).some(id => id !== null && (typeof id !== 'string' || !idPattern.test(id)))) return fail('怪物装备必须是槽位到装备 id 的映射');
  if (Object.keys(doc.equipment).some(slot => !MONSTER_FIXED_SLOTS.some(row => row.id === slot))) return fail('怪物只支持谱系、稀有度、塔地图属性三个固定槽');
  doc.equipment = { lineage: null, rarity: null, tower: null, ...doc.equipment };
  if (!Array.isArray(doc.skills) || doc.skills.length > 8) return fail('每种怪物最多配置 8 个技能');
  const seen = new Set();
  const skills = [];
  for (let i = 0; i < doc.skills.length; i++) {
    const raw = doc.skills[i];
    if (!object(raw)) return fail(`技能 ${i + 1} 必须是对象`);
    const extra = Object.keys(raw).filter(k => !Object.hasOwn(emptyMonsterSkill(), k));
    if (extra.length) return fail(`技能 ${i + 1} 未知字段：${extra.join('、')}`);
    const skill = { ...emptyMonsterSkill(), ...raw };
    if (typeof skill.id !== 'string' || !idPattern.test(skill.id)) return fail(`技能 ${i + 1} 需要有效的技能 id`);
    if (seen.has(skill.id)) return fail(`技能 ${skill.id} 重复`);
    seen.add(skill.id);
    if (typeof skill.enabled !== 'boolean') return fail(`技能 ${i + 1} 启用必须是布尔值`);
    for (const [key, name, min, max] of [['range', '释放距离', 1, 5000], ['cooldown', '冷却', 0.1, 120], ['power', '威力', 0, 100000]]) {
      if (!Number.isFinite(skill[key]) || skill[key] < min || skill[key] > max) return fail(`技能 ${i + 1} ${name}必须在 ${min}–${max} 之间`);
    }
    skills.push(skill);
  }
  return { doc: { ...doc, traits: traits.entries, skills }, error: '' };
}

export function validateMonster(doc, library, collections = null) {
  const parsed = parseMonster(doc);
  if (parsed.error) return parsed.error;
  const traits = monsterTraitSources(library, parsed.doc.traits);
  if (traits.error) return traits.error;
  if (collections) {
    try { traits.sources.push(...pawnEquipmentSources(library, resolvePawnEquipment(collections, parsed.doc.equipment, 'monster')).sources); }
    catch (error) { return error.message; }
  }
  if (traits.sources.length) {
    const result = compileBuild(newBuild(traits.sources[0].id, traits.sources));
    if (!result.plan) return `怪物词条无法编译：${result.error}`;
  }
  for (const skill of parsed.doc.skills) {
    const build = library?.build(skill.id);
    if (!build) return `未知技能 ${skill.id}`;
    const source = library.namedBuildSource(skill.id);
    const result = source.source ? compileBuild({ ...source.source, traits: withHeld(source.source.traits, traits.sources) }) : source;
    if (!result.plan) return `技能 ${skill.id} 无法编译：${result.error}`;
    if (!result.plan.rules.some(rule => rule.event === EBuiltinEvent.Cast)) return `技能 ${skill.id} 没有主动施法规则`;
  }
  return '';
}

export function readMonsters(files, library, collections = null) {
  const monsters = new Map();
  for (const file of files.filter(f => /^monsters[\\/]/i.test(f.path))) {
    const parsed = parseMonster(file.text);
    const id = parsed.doc?.id || file.path.split(/[\\/]/).pop().replace(/\.json$/i, '');
    let error = parsed.error;
    if (!error && file.path.split(/[\\/]/).pop() !== `${id}.json`) error = `文件名必须是 ${id}.json`;
    if (!error && monsters.has(id)) error = `怪物 id ${id} 重复`;
    if (!error && library) error = validateMonster(parsed.doc, library, collections);
    monsters.set(error && monsters.has(id) ? file.path : id, { path: file.path, doc: parsed.doc, error });
  }
  return monsters;
}

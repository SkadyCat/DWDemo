// Authoring metadata only. These labels do not enter plans, tag families or reroll selection.
import { EOp } from './types.mjs';
import { isStitchable } from './library.mjs';
import { equipmentAffixPool } from './equipment.mjs';

export const AFFIX_CATEGORY_FILE = 'Tags/affix_categories.json';
export const AFFIX_CATEGORIES = Object.freeze([
  { id: 'attack', name: '攻击型', description: '直接提高伤害、暴击、输出速度、命中数量、范围或异常伤害。' },
  { id: 'defense', name: '防御型', description: '提供气血、护盾、抗性、减伤、格挡、闪避、治疗或生存回复。' },
  { id: 'special', name: '特殊型', description: '触发装配、技能授予、资源与状态转换、控制、移动、行为改变或攻防混合。' },
]);
const ids = new Set(AFFIX_CATEGORIES.map(row => row.id));

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const result = (category, reason) => ({ category, reason });

function statCategory(path) {
  if (/^(cost|mana|attr|map)\.|\.cost$|\.repeat_cost$|\.recall_mana$|\.per_hit_mana$|\.hit_mana$|\.kill_mana$/.test(path)) return result('special', '改变魔力、施法费用、基础属性或地图机制。');
  if (/^cast\.(current_life|max_life|max_shield)_cost/.test(path)) return result('special', '消耗气血或护盾换取技能收益。');
  if (/^trigger\./.test(path)) return /\.(damage|more|area|effect)$/.test(path)
    ? result('attack', '直接放大已触发技能的伤害、范围或效果。') : result('special', '改变触发概率、冷却、次数、装配、顺序或资源机制。');
  if (/move_speed|^minion\.(chase|command_response|control_cap|cap|cap_same|duration|spirit|replace_transfer|revive|resummon_chance|kill_temp_chance|per_cast|summon_speed|prefer_|seek)/.test(path)) return result('special', '改变移动、召唤管理、索敌或单位行为。');
  if (/^proj\.(layout_|prefer_|retarget|curve|wave|orbit|return_at_max|return_chain_done|return_pierce_done|secondary_inherit)/.test(path)
    || /^area\.(at_|follow_|move_forward|to_ring|to_sector|ring_around_target|sequence_line|pull|push)/.test(path)) return result('special', '改变技能形态、施放位置、轨迹、目标选择或控制行为。');
  if (/^freeze\.consume$|^poison\.(self|merge|single_layer|unlimited|replace_lowest|to_void|from_)|^block\.(attack_to_spell|to_counter)$/.test(path)) return result('special', '改变状态消费、叠层或属性转换机制。');
  if (/^poison\.enemy_(slow|weaken)$/.test(path)) return result('defense', '降低敌人的行动或伤害，缓解承伤压力。');
  if (/^(life|shield)\.(on_|recharge_|regen_|from_|missing\.(regen|leech))|^execute\.life$/.test(path)) return result('defense', '提供气血或护盾容量、持续回复或事件回复。');
  if (/^minion\.crit_your_mana$/.test(path)) return result('special', '召唤物暴击为主人回复魔力资源。');
  if (/^area\.consume_remaining$|^poison\.burst_end$/.test(path)) return result('special', '改变持续伤害的剩余时间消费与一次性结算方式。');
  if (/^block\.taken_|^shield\..*damage_taken|^life\..*damage_taken|^minion\.(taken|you_take)/.test(path)) return result('defense', '降低自己或召唤物受到的伤害。');
  if (/^chill\.(cap|chance|duration|effect)$|^freeze\.(buildup|duration|threshold|elite|residual_chill)$/.test(path)) return result('special', '强化冰缓、冻结的控制条件、强度或持续时间。');
  if (/^poison\.(kill_life|kill_shield|vs_leech)$|^proj\.hit_(life|shield)$|^area\.per_hit_life$/.test(path)) return result('defense', '命中或击杀提供气血、护盾与偷取续航。');
  if (/damage|critical|crit|attack_speed|cast_speed|counter|reflect|^element\.[^.]+\.penetration$/.test(path)) return result('attack', '直接提高输出伤害、暴击、攻击/施法速度、穿透或反击伤害。');
  if (/^element\.[^.]+\.(resistance|max_resistance)$|^owner\.max_(life|mana)$/.test(path)) return path.endsWith('max_mana')
    ? result('special', '提高魔力资源容量。') : result('defense', '提高抗性上限、抗性或生存资源容量。');
  if (/^(defense|block|evade|evasion|shield|life|heal|flask|leech|recoup|threshold)\./.test(path)) return result('defense', '提高血盾、回复、护甲、闪避、格挡、抗性或减伤能力。');
  if (/^minion\.(armour|block_|death_heal|empty_life|evasion|flask_share|heal_received|hit_your_shield|immune|inherit_(armour|evasion|life|shield)|kill_your_life|leech|life_|marked_leech|recovery_share|regen_|resistance|sacrifice_(life|shield)|shield_|spawn_heal|take_for_you|taken|you_hit_heal|you_take)/.test(path)) return result('defense', '提高召唤物或主人的血盾、防护与回复。');
  if (/^(damage|projectile|proj|area|explosion|chain|burn|chill|collapse|erosion|execute|fire|freeze|frost|ignite|lightning|minion|poison|shatter|shock|void|cast)\./.test(path)) return result('attack', '提高攻击载体、异常施加、伤害覆盖、频率或持续输出。');
  return result('special', '改变通用机制或条件行为。');
}

function triggerCategory(name) {
  if (/^(trig_|cast_on_|buff_on_)/.test(name)) return result('special', '提供触发入口或挂载特性，最终效果由载荷决定。');
  if (/^(convert_damage|empower_|minion_merge|minion_fewer_|minion_more_weaker|minion_sacrifice_|poison_eternal|poison_no_damage|poison_threshold_detonate|poison_(hit|crit)_detonate|poison_detonate_spread|shock_consume|erosion_consume|ignite_consume)/.test(name)) return result('special', '改变资源代价、状态消费、伤害转换、单位数量取舍或合并机制。');
  if (name === 'freeze_end_zone') return result('special', '冻结结束后生成新的冰缓控制区域。');
  if (/next_cost|buff_move|minion_command_move|minion_teleport|prefer_status/.test(name)) return result('special', '改变费用、移动、传送或目标选择。');
  if (/^(guard_|cheat_death|block_buff_armour|block_recoup_life|evade_fail_bonus|minion_nearby_guard|minion_fewer_life|minion_kill_life|flask_life)/.test(name)) return result('defense', '通过条件触发提供防护、回复或保命。');
  return result('attack', '通过命中、状态、召唤物或条件事件增加伤害与攻击收益。');
}

/** Initial authoring suggestion. Published assignments in JSON remain the source of truth. */
export function classifyTrait(source) {
  if (isStitchable(source)) return result('special', '承载、触发或临时授予其他特性，效果由挂载内容决定。');
  const effects = [];
  for (const entry of source.sheet || []) {
    if (entry.grant_skill) effects.push(result('special', '授予可装配的主动技能。'));
    if (entry.stat) effects.push(statCategory(entry.stat));
    if (entry.trigger) effects.push(triggerCategory(entry.trigger));
  }
  for (const modifier of source.modifiers) effects.push(statCategory(modifier.stat));
  const walk = actions => { for (const action of actions) {
    if ([EOp.Summon, EOp.Storm, EOp.Sacrifice, EOp.GrantTraits].includes(action.op)) effects.push(result('special', '创建、管理、牺牲召唤单位，或授予其他特性。'));
    else if ([EOp.Emit, EOp.Copy, EOp.DamageArea, EOp.DamageTarget, EOp.Counter, EOp.Redirect].includes(action.op)) effects.push(result('attack', '创建攻击载体、追加伤害或增加攻击命中机会。'));
    else if (action.op === EOp.ApplyStatus) effects.push(['chill', 'freeze', 'slow', 'stun'].includes(action.key)
      ? result('special', '施加冰缓、冻结、减速或眩晕等控制状态。') : result('attack', '施加伤害、易伤或进攻异常状态。'));
    walk(action.then || []);
  } };
  source.rules.forEach(rule => walk(rule.actions));
  const kinds = new Set(effects.map(row => row.category));
  if (kinds.has('attack') && kinds.has('defense')) return result('special', '同时具有进攻与生存收益，属于攻防混合特性。');
  if (kinds.has('special')) return effects.find(row => row.category === 'special');
  return effects[0] || result('special', '提供状态、条件或通用机制。');
}

function classifyAffix(definition, traits) {
  const entries = definition.traits.flatMap(function walk(entry) { return [entry, ...(entry.with || []).flatMap(walk)]; });
  const categories = new Set(entries.map(entry => traits.get(entry.id)?.category));
  if (categories.size === 1 && !categories.has(undefined)) return result([...categories][0], '沿用组成特性的用途分类。');
  return result('special', '聚合多种用途或将触发入口与技能载荷组合。');
}

export function buildAffixCategoryIndex(library, catalog = { version: 1, traits: {}, affixes: {} }) {
  if (!object(catalog) || catalog.version !== 1 || Object.keys(catalog).some(key => !['version', 'traits', 'affixes'].includes(key)) || !object(catalog.traits) || !object(catalog.affixes)) throw new Error('词缀分类需要 version: 1、traits 与 affixes');
  for (const field of ['traits', 'affixes']) for (const [id, row] of Object.entries(catalog[field])) {
    if (!/^[a-z0-9_]+$/.test(id) || !object(row) || Object.keys(row).some(key => !['category', 'reason'].includes(key)) || !ids.has(row.category) || typeof row.reason !== 'string' || !row.reason.trim()) throw new Error(`词缀分类 ${field}.${id} 需要有效的 category 与分类依据 reason`);
  }
  const traits = new Map(), affixes = new Map(), missing = [];
  for (const entry of library.traits.values()) {
    const id = entry.source.id, authored = catalog.traits[id];
    traits.set(id, authored ? { ...authored } : classifyTrait(entry.source));
    if (!authored) missing.push(id);
  }
  const pool = equipmentAffixPool(library);
  for (const definition of pool) affixes.set(definition.id, catalog.affixes[definition.id] ? { ...catalog.affixes[definition.id] }
    : traits.has(definition.id) ? { ...traits.get(definition.id) } : classifyAffix(definition, traits));
  for (const definition of pool) if (!traits.has(definition.id) && !catalog.affixes[definition.id]) missing.push(definition.id);
  const stale = [...Object.keys(catalog.traits).filter(id => !traits.has(id)), ...Object.keys(catalog.affixes).filter(id => !affixes.has(id))];
  return { traits, affixes, missing, stale, categories: AFFIX_CATEGORIES, categoryOf: (id, kind = 'trait') => (kind === 'affix' ? affixes : traits).get(id) || null };
}

export function loadAffixCategoryIndex(files, library) {
  const matches = files.filter(file => file.path.replaceAll('\\', '/').toLowerCase() === AFFIX_CATEGORY_FILE.toLowerCase());
  if (matches.length > 1) return { error: `${AFFIX_CATEGORY_FILE} 重复` };
  try {
    const catalog = matches.length ? JSON.parse(matches[0].text.replace(/^\uFEFF/, '')) : undefined;
    return { index: buildAffixCategoryIndex(library, catalog), error: '' };
  } catch (error) { return { error: `${AFFIX_CATEGORY_FILE}: ${error.message}` }; }
}

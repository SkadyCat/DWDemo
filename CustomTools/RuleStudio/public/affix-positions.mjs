// Authoring metadata only. Prefix/suffix labels are never sent to the compiler or combat runtime.
import saved from './data/affix-positions.json' with { type: 'json' };
import { isStitchable } from '../engine/library.mjs';
import { equipmentAffixPool } from '../engine/equipment.mjs';

export const AFFIX_POSITIONS = Object.freeze([
  { id: 'prefix', name: '前缀', description: '能力来源与收益：基础属性、条件成长、直接回复量和直接事件触发。' },
  { id: 'suffix', name: '后缀', description: '运行方式与效率：触发编排、回复效率、资源支付、控制及弹道行为。' },
]);
const result = (position, reason) => ({ position, reason });
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const directTriggerEvents = new Set([
  'hit', 'crit', 'kill', 'cast', 'cast_attack', 'cast_spell', 'block', 'evade', 'taken_hit', 'taken_crit',
  'dodge', 'freeze', 'poison', 'shock', 'ignite', 'erosion', 'pierce', 'chain', 'return',
  'summon_spawn', 'summon_crit', 'summon_death', 'sacrifice', 'execute', 'shield_broken', 'life_full',
  'shield_full', 'enter_low', 'ailment_consumed',
].map(id => `trig_${id}`));
const stackingPower = new Set(['area_per_enemy', 'area_stay', 'burn_timer', 'erosion_per_layer', 'shock_per_layer',
  'poison_per_layer', 'slow_frost', 'minion_per_minion_damage', 'minion_per_same_speed', 'minion_age_damage', 'minion_ending_damage']);

/** Suggestions for new content. Persisted per-id assignments always take precedence. */
export function classifyTraitPosition(source, name = '') {
  const sheet = source.sheet || [], stats = [...sheet.flatMap(row => row.stat ? [row.stat] : []), ...source.modifiers.map(row => row.stat)];
  if (sheet.some(row => directTriggerEvents.has(row.trigger))) return result('prefix', '提供命中、暴击、击杀或状态变化等直接事件触发入口。');
  if (sheet.some(row => row.grant_skill)) return result('prefix', '授予可装配的主动技能，提供新的能力来源。');
  if (sheet.some(row => row.trigger === 'extra_damage')) return result('prefix', '按已有伤害规模获得额外伤害，属于输出数值成长。');
  if (sheet.some(row => ['minion_fewer_damage', 'minion_fewer_life', 'minion_more_weaker'].includes(row.trigger))) return result('prefix', '调整召唤数量与单体属性的数值取舍，决定召唤物规模和强度。');
  if (sheet.some(row => stackingPower.has(row.trigger))) return result('prefix', '按目标层数、数量或持续时间增长伤害与速度收益。');
  if (stats.some(stat => /^(damage\.(from_life|from_shield|per_life|per_shield)|area\.per_(life|shield)$|life\.per_constitution|shield\.(from_(life|mana)_percent|per_(intelligence|strength))|evasion\.(per_dexterity|attack_speed_per|crit_per|shield_per)|block\.(damage_per_attack|shield_per_spell|counter_per_overcap|attack_to_spell)|minion\.(inherit_|death_damage$)|burn\.explode_life$)/.test(stat))) return result('prefix', '按资源与属性规模增长伤害、防护或技能覆盖，属于数值收益。');
  if (stats.some(stat => /^(life|shield|mana)\.(on_|regen_flat$|regen_percent$)|^(proj\.hit_(life|shield|mana)$|area\.per_hit_(life|mana)$|execute\.life$|poison\.kill_(life|shield|mana)$|minion\.(death_heal|spawn_heal|life_on_hit|kill_your_life|hit_your_shield|you_hit_heal))/.test(stat))) return result('prefix', '直接增加每次事件或每秒恢复的气血、护盾、魔力量。');
  if (stats.some(stat => /^(life|shield)\.(full|low|missing|overflow)\.(damage|critical_chance|attack_speed|cast_speed)$|^damage\.per_|^minion\.(empty_(damage|life)|marked_damage)$|^(fire|area)\.(center_damage|edge_damage)$|^proj\.(near_damage|far_damage|per_hit_damage|pierce_damage|chain_damage|bounce_damage)$|^(ignite\.crit|poison\.crit_damage|shock\.crit_effect)$/.test(stat)
    || /^(burn|chill|freeze|poison|shock|void)\.vs_/.test(stat) && stat !== 'poison.vs_leech')) return result('prefix', '在资源、目标或命中条件满足时，直接提高伤害、暴击或输出速度等数值收益。');
  if (isStitchable(source)) return result('suffix', '承载触发或限时挂载内容，属于联动机制。');
  if (sheet.some(row => row.trigger)) return result('suffix', '通过事件、累计条件或资源转换产生收益。');
  if (/恢复|回充|回蓝|再生|偷取|治疗|回复/.test(name)
    || stats.some(stat => /^(heal|leech|recoup|flask)\.|^(life|mana|shield)\.(on_|regen|recharge|sustain|from_.*regen)|\.(hit|kill|recall|per_hit)_(life|shield|mana)$/.test(stat))) return result('suffix', '提供续航、回复或回复流程的强化。');
  if (/转化|转换|相当于|计入|消耗|支付|返还|溢出|同时应用于|替.+承担|延迟.+扣除|每n点|每n个百分点/.test(name)
    || stats.some(stat => /^(cost|mana\.cost)\.|\.(from_life|from_shield|from_mana|per_life|per_shield|per_strength|per_intelligence|per_dexterity|per_constitution|to_armour|to_void)/.test(stat))) return result('suffix', '把资源或属性转为另一种收益，或改变资源支付方式。');
  if (/概率|近期|最近|首次|期间|满血|低血|满护盾|低护盾|剩余|连续|下(?:一|次)|附近每|每空缺|仅有一个|对.+敌人|越.+越|时[，,]|后[，,]|每(?:次)?(?:命中|穿透|连锁|重复|扩散)|暴击施加|(?:命中|施法|施放|暴击|格挡|闪避|击败|击杀|死亡|收回|受伤|伤害|技能结束|结束|自然结束|耗尽)时|(?:成功|命中|穿透|连锁|重复|结束|死亡|解除冻结|引爆|收回|生成|被命中)后/.test(name)
    || stats.some(stat => /(?:^|\.)(vs_|per_|on_|full\.|low\.|missing\.|recently_|not_recently_|moving|still|leeching|recharging|consecutive|single_target|center_damage|edge_damage|near_damage|far_damage|overlap|damage_per_|shield_per_|attack_speed_per|crit_per|to_counter)/.test(stat))) return result('suffix', '收益取决于目标、事件、位置、资源状态或累计条件。');
  if (/冰缓|冻结|眩晕|晕眩|减速|缓速|牵引|推开/.test(name)
    || stats.some(stat => /^(chill|freeze)\.|^threshold\.|enemy_(slow|weaken|regen|recharge|shield_regen)/.test(stat))) return result('suffix', '改变控制、敌人削弱或异常门槛机制。');
  if (/追踪|索敌|转向|移动速度|传送|合并|优先|替换|刷新|重置|传播|复制|保留|不再|无法|无层数|没有其他|跟随|环绕|沿曲线|波浪|交替|排列|依次释放|变为|再次命中|引发|留下|消失时|反射|回归|弹射$|分裂$|溅射$|碎裂$/.test(name)
    || stats.some(stat => /^(proj\.(layout_|prefer_|retarget|homing|curve|wave|orbit|return_at|return_chain|return_pierce|return_rehit|secondary_inherit|split_on_hit|explode_on_expire|hit_zone|bounce_retarget|chain_rehit)|area\.(at_|follow_|to_|move_forward|multi_direction|sequence|ring_around|pulse|leave_ground|end_explosion|no_rehit|focus|widen)|minion\.(inherit_|replace_|revive|resummon|prefer_|seek|command|chase|spirit|take_for_you|you_take|immune|death_damage)|poison\.(self|merge|single|unlimited|replace|refresh|burst_end)|chain\.(rehit|overflow))/.test(stat))) return result('suffix', '改变弹道、技能形态、目标选择、状态流转或召唤行为。');
  if (stats.some(stat => /^trigger\./.test(stat) && !/^trigger\.(damage|more|area|effect|duration)$/.test(stat))) return result('suffix', '调整触发频率、门槛、装配数量、顺序或资源机制。');
  if (source.rules.length) {
    if (source.rules.some(rule => rule.event === 'cast')
      || /^(?:create_|monster_(?:bolt|claw|nova|strike)$|player_slash$|summon_|throw_poison_flask$|sentinel_|spirit_claw$|iron_guard_slash$|ember_hound_bite$|fire_turret_fireball$|storm_totem_lightning$|poison_flask_burst$)/.test(source.id)) return result('prefix', '构成技能或召唤物的基础攻击载体。');
    if (/^(fire|frost|lightning|physical|poison|void)_damage$/.test(source.id)) return result('prefix', '为命中提供基础元素或物理伤害。');
    return result('suffix', '在命中、击杀、投射物或状态事件中追加效果。');
  }
  if (stats.some(stat => /^(life|shield|defense|block|evade|evasion|element\.[^.]+\.(resistance|max_resistance)|owner\.max_life)/.test(stat))) return result('prefix', '直接增加血盾、防护、抗性或承伤能力。');
  if (stats.some(stat => /^(attr|mana\.base|mana\.increased|mana\.more|owner\.max_mana)/.test(stat))) return result('prefix', '直接提高基础属性或资源容量。');
  if (stats.length) return result('prefix', '直接强化伤害、暴击、速度、数量、持续时间或覆盖范围。');
  return result('suffix', '提供通用机制或行为能力。');
}

export function buildAffixPositionIndex(library, catalog = saved) {
  if (!object(catalog) || catalog.version !== 1 || Object.keys(catalog).some(key => !['version', 'traits', 'affixes'].includes(key)) || !object(catalog.traits) || !object(catalog.affixes)) throw new Error('前后缀表需要 version: 1、traits 与 affixes');
  for (const field of ['traits', 'affixes']) for (const [id, row] of Object.entries(catalog[field])) {
    if (!/^[a-z0-9_]+$/.test(id) || !object(row) || Object.keys(row).some(key => !['position', 'reason'].includes(key)) || !['prefix', 'suffix'].includes(row.position) || typeof row.reason !== 'string' || !row.reason.trim()) throw new Error(`前后缀 ${field}.${id} 需要有效的 position 与划分依据 reason`);
  }
  const traits = new Map(), affixes = new Map(), missing = [];
  for (const [id, entry] of library.traits) {
    traits.set(id, { ...(catalog.traits[id] || classifyTraitPosition(entry.source, entry.displayName)) });
    if (!catalog.traits[id]) missing.push(id);
  }
  for (const definition of equipmentAffixPool(library)) {
    let row = catalog.affixes[definition.id] || traits.get(definition.id);
    if (!row) {
      const positions = definition.traits.flatMap(function walk(entry) { return [traits.get(entry.id)?.position, ...(entry.with || []).flatMap(walk)]; });
      row = positions.includes('prefix') ? result('prefix', '聚合中包含主要伤害、召唤或直接触发入口，整体提供能力来源。') : result('suffix', '组成特性以控制或行为机制为主，整体归后缀。');
      missing.push(definition.id);
    }
    affixes.set(definition.id, { ...row });
  }
  return { traits, affixes, missing, stale: [...Object.keys(catalog.traits).filter(id => !traits.has(id)), ...Object.keys(catalog.affixes).filter(id => !affixes.has(id))],
    positionOf: (id, kind = 'trait') => (kind === 'affix' ? affixes : traits).get(id) || null };
}

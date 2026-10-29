// Generates Content/Rules/Affixes/*.json — one trait per affix line, name = the affix text (n = params).
// node scripts/make-affixes.mjs   (overwrites the generated files; hand-edited files with other ids are kept)
import fs from 'node:fs';
import path from 'node:path';
import { RULES_DIR } from './rule-files.mjs';

const P = name => ({ param: name });
const RATIO = { div: [P('amount'), P('per')] };
// [id, name, params, sheet entries, note]; 'stat' = {stat, value: n}; ['stat', expr]; {trigger}
const S = (stat, value = P('n')) => ({ stat, value });
const T = trigger => ({ trigger });
const STITCH_CAST = '缝合一个主动特性（以及任意辅助特性）作为被触发的辅助技能。';
const STITCH_GRANT = '缝合任意特性作为增益内容。';

const AFFIXES = [
  // ---- 属性
  ['attr_strength', '力量 +n', { n: 10 }, [S('attr.strength')]],
  ['attr_dexterity', '敏捷 +n', { n: 10 }, [S('attr.dexterity')], '目前没有词条按敏捷换算；数值会显示在角色面板里。'],
  ['attr_intelligence', '智力 +n', { n: 10 }, [S('attr.intelligence')]],
  ['attr_constitution', '体质 +n', { n: 10 }, [S('attr.constitution')], '补充词条：“每n点体质获得基础气血”需要体质来源。'],
  // ---- 点伤 / 增伤 / 额外
  ['flat_physical', '基础物理伤害 +n', { n: 8 }, [S('damage.flat.physical')], '每次命中追加 n 点物理伤害。'],
  ['flat_lightning', '基础闪电伤害 +n', { n: 8 }, [S('damage.flat.lightning')], '每次命中追加 n 点闪电伤害。'],
  ['flat_fire', '基础火焰伤害 +n', { n: 8 }, [S('damage.flat.fire')], '每次命中追加 n 点火焰伤害。'],
  ['flat_frost', '基础冰霜伤害 +n', { n: 8 }, [S('damage.flat.frost')], '每次命中追加 n 点冰霜伤害。'],
  ['flat_void', '基础虚空伤害 +n', { n: 8 }, [S('damage.flat.void')], '每次命中追加 n 点虚空伤害。'],
  ['inc_elemental', '元素增伤 +n%', { n: 20 }, [S('damage.increased.elemental')], '火焰、冰霜、闪电、虚空伤害提高（与其他增伤相加）。'],
  ['inc_lightning', '闪电增伤 +n%', { n: 25 }, [S('damage.increased.lightning')]],
  ['inc_frost', '冰霜增伤 +n%', { n: 25 }, [S('damage.increased.frost')]],
  ['inc_void', '虚空增伤 +n%', { n: 25 }, [S('damage.increased.void')]],
  ['inc_physical', '物理伤害增加 +n%', { n: 25 }, [S('damage.increased.physical')]],
  ['more_lightning', '额外闪电元素 +n%', { n: 10 }, [S('damage.more.lightning')], '独立乘区：与增伤相乘，多条之间也相乘。'],
  ['more_fire', '额外火焰元素 +n%', { n: 10 }, [S('damage.more.fire')], '独立乘区。'],
  ['more_frost', '额外冰霜元素 +n%', { n: 10 }, [S('damage.more.frost')], '独立乘区。'],
  ['more_void', '额外虚空元素 +n%', { n: 10 }, [S('damage.more.void')], '独立乘区。'],
  ['more_physical', '额外物理伤害 +n%', { n: 10 }, [S('damage.more.physical')], '独立乘区。'],
  // ---- 护盾：上限
  ['shield_base', '基础护盾 +n点', { n: 60 }, [S('shield.base')], '装备上的基础护盾还会被“装备提供的护盾 +n%”放大。'],
  ['shield_increased', '护盾上限 +n%', { n: 30 }, [S('shield.increased')]],
  ['shield_more', '护盾上限额外提高 +n%', { n: 10 }, [S('shield.more')], '独立乘区。'],
  ['shield_from_equipment', '装备提供的护盾 +n%', { n: 30 }, [S('shield.equipment_increased')], '只放大装备上“基础护盾 +n点”提供的部分。'],
  ['shield_per_intelligence', '每n点智力获得基础护盾 +n点', { per: 5, amount: 2 }, [S('shield.per_intelligence', RATIO)]],
  ['shield_per_strength', '每n点力量获得基础护盾 +n点', { per: 5, amount: 1 }, [S('shield.per_strength', RATIO)]],
  ['shield_from_life', '最大生命的n%获得为额外基础护盾', { n: 15 }, [S('shield.from_life_percent')]],
  ['shield_from_mana', '最大魔力的n%获得为额外基础护盾', { n: 20 }, [S('shield.from_mana_percent')]],
  // ---- 护盾：回充
  ['shield_recharge_rate', '护盾回充速度 +n%', { n: 30 }, [S('shield.recharge_rate')], '基础回充：每秒最大护盾的 20%。'],
  ['shield_recharge_start', '护盾回充启动速度 +n%', { n: 30 }, [S('shield.recharge_start')], '基础延迟 2 秒，延迟 ÷ (1 + n%)。'],
  ['shield_recharge_delay', '护盾回充延迟 -n秒', { n: 0.5 }, [S('shield.recharge_delay_reduction')]],
  ['shield_recharge_grace', '护盾回充启动后，n秒内不被伤害打断', { n: 1 }, [S('shield.recharge_grace')]],
  ['shield_recharge_on_damaged', '受到伤害时，有n%概率立即开始护盾回充', { n: 10 }, [S('shield.recharge_on_damaged')]],
  ['shield_recharge_on_kill', '击败敌人时，有n%概率立即开始护盾回充', { n: 20 }, [S('shield.recharge_on_kill')]],
  ['shield_recharge_on_crit', '暴击时，有n%概率立即开始护盾回充', { n: 20 }, [S('shield.recharge_on_crit')]],
  // ---- 护盾：再生
  ['shield_regen_flat', '每秒恢复护盾 +n点', { n: 5 }, [S('shield.regen_flat')]],
  ['shield_regen_percent', '每秒恢复最大护盾的n%', { n: 2 }, [S('shield.regen_percent')]],
  ['shield_regen_speed', '护盾再生速度 +n%', { n: 30 }, [S('shield.regen_speed')]],
  ['shield_sustain_efficiency', '护盾持续恢复效率 +n%', { n: 20 }, [S('shield.sustain_efficiency')], '护盾再生量额外乘 (1 + n%)。'],
  ['shield_regen_still', '静止时，每秒恢复最大护盾的n%', { n: 3 }, [S('shield.regen_still_percent')]],
  ['shield_regen_moving', '移动时，每秒恢复最大护盾的n%', { n: 1.5 }, [S('shield.regen_moving_percent')]],
  ['shield_regen_low', '低护盾时，护盾再生速度 +n%', { n: 50 }, [S('shield.regen_low_speed')], '低护盾：护盾不高于最大值的 35%。'],
  // ---- 护盾：偷取
  ['leech_shield_all', '伤害的n%偷取为护盾', { n: 1 }, [S('leech.shield.all')], '命中伤害的 n% 以偷取实例恢复：每个实例每秒最大护盾的 2%，总计每秒不超过 10%。'],
  ['leech_shield_physical', '物理伤害的n%偷取为护盾', { n: 2 }, [S('leech.shield.physical')]],
  ['leech_shield_elemental', '元素伤害的n%偷取为护盾', { n: 2 }, [S('leech.shield.elemental')]],
  ['leech_shield_speed', '护盾偷取速度 +n%', { n: 30 }, [S('leech.shield.speed')]],
  ['leech_shield_cap', '护盾每秒偷取上限 +n%', { n: 30 }, [S('leech.shield.cap')]],
  ['leech_shield_duration', '护盾偷取持续时间 +n%', { n: 30 }, [S('leech.shield.duration')], '每个偷取实例以相同速度多持续 n%（总量 ×(1+n%)）。'],
  ['leech_shield_instant', '护盾偷取量的n%立即恢复', { n: 20 }, [S('leech.shield.instant')]],
  ['leech_shield_keep_full', '护盾达到上限时，偷取效果继续保留', {}, [S('leech.shield.keep_full', 1)]],
  // ---- 护盾：事件恢复
  ['shield_on_hit', '命中时恢复护盾 +n点', { n: 2 }, [S('shield.on_hit')]],
  ['shield_on_crit', '暴击时恢复护盾 +n点', { n: 8 }, [S('shield.on_crit')]],
  ['shield_on_kill', '击败敌人时恢复护盾 +n点', { n: 10 }, [S('shield.on_kill')]],
  ['shield_on_kill_percent', '击败敌人时恢复最大护盾的n%', { n: 3 }, [S('shield.on_kill_percent')]],
  ['shield_on_block', '格挡时恢复护盾 +n点', { n: 20 }, [S('shield.on_block')]],
  ['shield_on_block_percent', '格挡时恢复最大护盾的n%', { n: 5 }, [S('shield.on_block_percent')]],
  ['shield_on_evade', '闪避成功时恢复护盾 +n点', { n: 15 }, [S('shield.on_evade')]],
  ['shield_recoup', '受到伤害的n%在接下来n秒内恢复为护盾', { percent: 10, seconds: 4 }, [S('recoup.shield.percent', P('percent')), S('recoup.shield.seconds', P('seconds'))]],
  ['shield_on_block_armour', '格挡时，恢复相当于护甲n%的护盾', { n: 5 }, [S('shield.on_block_armour_percent')]],
  ['shield_on_hit_taken_evasion', '受到命中时，恢复相当于闪避值n%的护盾', { n: 2 }, [S('shield.on_hit_taken_evasion_percent')]],
  ['shield_recoup_prevented_physical', '阻止的物理伤害的n%在接下来n秒内恢复为护盾', { percent: 30, seconds: 3 },
    [S('recoup.shield.prevented_physical_percent', P('percent')), S('recoup.shield.prevented_physical_seconds', P('seconds'))], '阻止 = 格挡掉的物理伤害 + 护甲减免的物理伤害。'],
  ['shield_from_life_regen', '生命再生的n%同时用于恢复护盾', { n: 50 }, [S('shield.from_life_regen_percent')]],
  ['shield_from_overflow_life_regen', '满生命时，溢出的生命再生的n%用于恢复护盾', { n: 100 }, [S('shield.from_overflow_life_regen_percent')]],
  // ---- 护盾：承伤
  ['shield_taken_physical', '护盾承受的物理伤害 -n%', { n: 15 }, [S('shield.taken_physical_reduction')], '同样的伤害，护盾少掉 n%。'],
  ['shield_taken_elemental', '护盾承受的元素伤害 -n%', { n: 15 }, [S('shield.taken_elemental_reduction')]],
  ['shield_taken_dot', '护盾承受的持续伤害 -n%', { n: 20 }, [S('shield.taken_dot_reduction')]],
  ['shield_bypass', '绕过护盾的伤害比例 -n%', { n: 50 }, [S('shield.bypass_reduction')], '基础有 10% 的伤害绕过护盾直接扣气血；该比例降低 n%。'],
  ['stun_threshold_shield', '最大护盾的n%计入晕眩门槛', { n: 50 }, [S('threshold.stun_shield_percent')], '晕眩门槛 = 最大气血 + 最大护盾×n%；单次命中 ≥ 门槛的 25% 时晕眩 0.4 秒。'],
  ['ailment_threshold_shield', '最大护盾的n%计入异常状态门槛', { n: 50 }, [S('threshold.ailment_shield_percent')], '异常门槛 = 最大气血 + 最大护盾×n%；施加到自己身上的异常强度 × 最大气血/门槛。'],
  // ---- 护盾：条件
  ['full_shield_damage', '满护盾时，伤害 +n%', { n: 20 }, [S('shield.full.damage')]],
  ['full_shield_crit', '满护盾时，暴击率 +n%', { n: 5 }, [S('shield.full.critical_chance')]],
  ['full_shield_move', '满护盾时，移动速度 +n%', { n: 10 }, [S('shield.full.move_speed')]],
  ['shield_damage_taken', '拥有护盾时，受到的伤害 -n%', { n: 8 }, [S('shield.any.damage_taken_reduction')]],
  ['recharging_cast_speed', '护盾回充期间，施法速度 +n%', { n: 15 }, [S('shield.recharging.cast_speed')]],
  ['shield_leech_attack_speed', '护盾偷取期间，攻击速度 +n%', { n: 10 }, [S('shield.leeching.attack_speed')], '当前引擎不区分攻击和法术，攻击速度与施法速度都作用于出手频率。'],
  ['missing_shield_damage', '每损失n%护盾，伤害 +n%', { per: 10, amount: 4 }, [S('shield.missing.damage', RATIO)]],
  ['missing_shield_regen', '每损失n%护盾，护盾再生速度 +n%', { per: 10, amount: 10 }, [S('shield.missing.regen_speed', RATIO)]],
  // ---- 护盾：转伤害
  ['shield_added_physical', '获得相当于最大护盾n%的附加物理伤害', { n: 3 }, [S('damage.from_shield.physical')], '每次命中追加。'],
  ['shield_added_lightning', '获得相当于最大护盾n%的附加闪电伤害', { n: 3 }, [S('damage.from_shield.lightning')]],
  ['shield_added_fire', '获得相当于最大护盾n%的附加火焰伤害', { n: 3 }, [S('damage.from_shield.fire')]],
  ['shield_added_frost', '获得相当于最大护盾n%的附加冰霜伤害', { n: 3 }, [S('damage.from_shield.frost')]],
  ['shield_added_void', '获得相当于最大护盾n%的附加虚空伤害', { n: 3 }, [S('damage.from_shield.void')]],
  ['damage_per_shield', '每n点最大护盾，伤害 +n%', { per: 100, amount: 5 }, [S('damage.per_shield', RATIO)]],
  ['area_per_shield', '每n点最大护盾，技能范围 +n%', { per: 100, amount: 3 }, [S('area.per_shield', RATIO)]],
  // ---- 护盾：消耗
  ['cost_from_shield', '技能消耗的n%由护盾支付', { n: 50 }, [S('cost.shield_percent')], '技能基础消耗 2 魔力。'],
  ['cost_shield_reduction', '技能护盾消耗 -n%', { n: 30 }, [S('cost.shield_reduction')]],
  ['cast_consume_max_shield', '施放技能时，消耗最大护盾的n%，该次技能伤害额外提高n%', { percent: 5, damage: 20 },
    [S('cast.max_shield_cost_percent', P('percent')), S('cast.max_shield_cost_damage', P('damage'))], '护盾不够时不消耗，也不加伤害。'],
  ['empower_on_shield_spent', '每累计消耗n点护盾，强化下一次技能', { per: 100, bonus: 50 }, [T('empower_on_shield_spent')], '强化：下一次技能伤害额外提高 bonus%。'],
  ['cast_on_shield_restored', '每累计恢复n点护盾，触发一次辅助技能', { per: 200 }, [T('cast_on_shield_restored')], STITCH_CAST],
  ['buff_on_full_shield', '达到满护盾时，获得持续n秒的增益', { duration: 4 }, [T('buff_on_full_shield')], STITCH_GRANT],
  ['cast_on_shield_broken', '护盾被敌人击破时，触发一次辅助技能，冷却n秒', { cooldown: 5 }, [T('cast_on_shield_broken')], STITCH_CAST],
  // ---- 护盾：溢出
  ['shield_overflow', '护盾恢复允许溢出上限的n%', { n: 20 }, [S('shield.overflow_percent')], '回充和偷取不会溢出；再生、事件恢复、伤害回收等可以溢出到上限的 (100+n)%。溢出部分每秒衰减 20%。'],
  ['shield_overflow_decay', '溢出护盾衰减速度 -n%', { n: 50 }, [S('shield.overflow_decay_reduction')]],
  ['shield_overflow_damage', '溢出护盾存在时，伤害 +n%', { n: 15 }, [S('shield.overflow.damage')]],
  ['empower_from_overflow', '消耗溢出护盾的n%，强化下一次技能', { percent: 50, bonus: 30 }, [T('empower_from_overflow')], '施法时若有溢出护盾，消耗其 percent%，下一次技能伤害额外提高 bonus%。'],
  // ---- 气血：上限
  ['life_base', '基础气血 +n点', { n: 60 }, [S('life.base')], '基础气血 400。'],
  ['life_increased', '气血上限 +n%', { n: 20 }, [S('life.increased')]],
  ['life_more', '气血上限额外提高 +n%', { n: 10 }, [S('life.more')], '独立乘区。'],
  ['life_per_strength', '每n点力量获得基础气血 +n点', { per: 2, amount: 1 }, [S('life.per_strength', RATIO)]],
  ['life_per_constitution', '每n点体质获得基础气血 +n点', { per: 1, amount: 2 }, [S('life.per_constitution', RATIO)]],
  ['life_from_equipment', '装备提供的气血 +n%', { n: 30 }, [S('life.equipment_increased')], '只放大装备上“基础气血 +n点”提供的部分。'],
  // ---- 气血：再生
  ['life_regen_flat', '每秒恢复气血 +n点', { n: 5 }, [S('life.regen_flat')], '基础每秒 3 点。'],
  ['life_regen_percent', '每秒恢复最大气血的n%', { n: 1 }, [S('life.regen_percent')]],
  ['life_regen_speed', '气血再生速度 +n%', { n: 30 }, [S('life.regen_speed')]],
  ['life_regen_low', '低血时，气血再生速度 +n%', { n: 100 }, [S('life.regen_low_speed')], '低血：气血不高于最大值的 35%（可被阈值词条调整）。'],
  ['life_regen_still', '静止时，每秒恢复最大气血的n%', { n: 2 }, [S('life.regen_still_percent')]],
  ['life_regen_moving', '移动时，每秒恢复最大气血的n%', { n: 1 }, [S('life.regen_moving_percent')]],
  ['life_regen_recently_hit', '近期受到伤害时，每秒恢复最大气血的n%', { n: 2 }, [S('life.regen_recent_hit_percent')], '近期 = 4 秒内。'],
  ['life_regen_not_recently_hit', '近期未受到伤害时，每秒恢复最大气血的n%', { n: 2 }, [S('life.regen_no_recent_hit_percent')]],
  // ---- 气血：事件恢复
  ['life_on_hit', '命中时恢复气血 +n点', { n: 3 }, [S('life.on_hit')]],
  ['life_on_crit', '暴击时恢复气血 +n点', { n: 10 }, [S('life.on_crit')]],
  ['life_on_kill', '击败敌人时恢复气血 +n点', { n: 12 }, [S('life.on_kill')]],
  ['life_on_kill_percent', '击败敌人时恢复最大气血的n%', { n: 2 }, [S('life.on_kill_percent')]],
  ['life_on_block', '格挡时恢复气血 +n点', { n: 20 }, [S('life.on_block')]],
  ['life_on_evade', '闪避成功时恢复气血 +n点', { n: 15 }, [S('life.on_evade')]],
  ['life_on_cast', '施放技能时恢复气血 +n点', { n: 2 }, [S('life.on_cast')]],
  ['life_from_mana_spent', '消耗魔力的n%恢复为气血', { n: 50 }, [S('life.from_mana_spent_percent')]],
  // ---- 气血：偷取
  ['leech_life_all', '伤害的n%偷取为气血', { n: 1 }, [S('leech.life.all')], '命中伤害的 n% 以偷取实例恢复：每个实例每秒最大气血的 2%，总计每秒不超过 10%。'],
  ['leech_life_physical', '物理伤害的n%偷取为气血', { n: 2 }, [S('leech.life.physical')]],
  ['leech_life_elemental', '元素伤害的n%偷取为气血', { n: 2 }, [S('leech.life.elemental')]],
  ['leech_life_speed', '气血偷取速度 +n%', { n: 30 }, [S('leech.life.speed')]],
  ['leech_life_cap', '气血每秒偷取上限 +n%', { n: 30 }, [S('leech.life.cap')]],
  ['leech_life_duration', '气血偷取持续时间 +n%', { n: 30 }, [S('leech.life.duration')], '每个偷取实例以相同速度多持续 n%（总量 ×(1+n%)）。'],
  ['leech_life_instant', '气血偷取量的n%立即恢复', { n: 20 }, [S('leech.life.instant')]],
  ['leech_life_keep_full', '达到满血时，气血偷取效果继续保留', {}, [S('leech.life.keep_full', 1)]],
  // ---- 气血：伤害回收
  ['life_recoup', '受到命中伤害的n%在接下来n秒内恢复为气血', { percent: 10, seconds: 4 }, [S('recoup.life.all', P('percent')), S('recoup.life.seconds', P('seconds'))]],
  ['life_recoup_physical', '受到物理命中伤害的n%在接下来n秒内恢复为气血', { percent: 15, seconds: 4 }, [S('recoup.life.physical', P('percent')), S('recoup.life.seconds', P('seconds'))]],
  ['life_recoup_elemental', '受到元素命中伤害的n%在接下来n秒内恢复为气血', { percent: 15, seconds: 4 }, [S('recoup.life.elemental', P('percent')), S('recoup.life.seconds', P('seconds'))]],
  ['life_recoup_speed', '气血伤害回收速度 +n%', { n: 30 }, [S('recoup.life.speed')], '回收时间 ÷ (1 + n%)。'],
  ['life_loss_deferred', '气血损失的n%延迟至接下来n秒内扣除', { percent: 20, seconds: 4 }, [S('life.deferred_percent', P('percent')), S('life.deferred_seconds', P('seconds'))]],
  // ---- 气血：药剂与治疗
  ['flask_life', '药剂：n秒内恢复气血 +n点', { amount: 150, seconds: 3 }, [T('flask_life')], '补充词条：放在消耗品上，使用时开始恢复；下面的药剂词条作用于它。'],
  ['flask_life_amount', '药剂气血恢复量 +n%', { n: 30 }, [S('flask.life.amount')]],
  ['flask_life_speed', '药剂气血恢复速度 +n%', { n: 30 }, [S('flask.life.speed')]],
  ['flask_life_instant', '药剂气血恢复量的n%立即恢复', { n: 25 }, [S('flask.life.instant')]],
  ['heal_received', '受到的治疗效果 +n%', { n: 15 }, [S('heal.received')], '作用于所有气血恢复。'],
  ['heal_received_low', '低血时，受到的治疗效果 +n%', { n: 30 }, [S('heal.received_low')]],
  ['heal_overflow_to_shield', '溢出治疗的n%转化为护盾', { n: 50 }, [S('heal.overflow_to_shield')]],
  // ---- 气血：条件
  ['full_life_damage', '满血时，伤害 +n%', { n: 20 }, [S('life.full.damage')]],
  ['full_life_crit', '满血时，暴击率 +n%', { n: 5 }, [S('life.full.critical_chance')]],
  ['full_life_move', '满血时，移动速度 +n%', { n: 10 }, [S('life.full.move_speed')]],
  ['low_life_damage', '低血时，伤害 +n%', { n: 30 }, [S('life.low.damage')]],
  ['low_life_attack_speed', '低血时，攻击速度 +n%', { n: 15 }, [S('life.low.attack_speed')], '当前引擎不区分攻击和法术，攻击速度与施法速度都作用于出手频率。'],
  ['low_life_cast_speed', '低血时，施法速度 +n%', { n: 15 }, [S('life.low.cast_speed')]],
  ['low_life_damage_taken', '低血时，受到的伤害 -n%', { n: 10 }, [S('life.low.damage_taken_reduction')]],
  ['missing_life_damage', '每损失n%气血，伤害 +n%', { per: 10, amount: 3 }, [S('life.missing.damage', RATIO)]],
  ['missing_life_leech_speed', '每损失n%气血，气血偷取速度 +n%', { per: 10, amount: 10 }, [S('life.missing.leech_speed', RATIO)]],
  ['low_life_threshold', '低血状态的判定阈值 +n个百分点', { n: 15 }, [S('life.low_threshold')], '基础 35%。'],
  // ---- 气血：消耗
  ['cost_from_life', '技能消耗的n%由气血支付', { n: 50 }, [S('cost.life_percent')], '技能基础消耗 2 魔力。'],
  ['cost_life_reduction', '技能气血消耗 -n%', { n: 30 }, [S('cost.life_reduction')]],
  ['cast_consume_current_life', '施放技能时，消耗当前气血的n%，该次技能伤害额外提高n%', { percent: 5, damage: 20 },
    [S('cast.current_life_cost_percent', P('percent')), S('cast.current_life_cost_damage', P('damage'))], '消耗后气血不足 1 时不消耗，也不加伤害。'],
  ['cast_consume_max_life', '施放技能时，消耗最大气血的n%，该次技能范围 +n%', { percent: 3, area: 20 },
    [S('cast.max_life_cost_percent', P('percent')), S('cast.max_life_cost_area', P('area'))]],
  ['empower_on_life_spent', '每累计消耗n点气血，强化下一次技能', { per: 100, bonus: 50 }, [T('empower_on_life_spent')], '强化：下一次技能伤害额外提高 bonus%。'],
  ['cast_on_life_restored', '每累计恢复n点气血，触发一次辅助技能', { per: 200 }, [T('cast_on_life_restored')], STITCH_CAST],
  // ---- 气血：转伤害
  ['life_added_physical', '获得相当于最大气血n%的附加物理伤害', { n: 2 }, [S('damage.from_life.physical')], '每次命中追加。'],
  ['life_added_fire', '获得相当于最大气血n%的附加火焰伤害', { n: 2 }, [S('damage.from_life.fire')]],
  ['life_added_void', '获得相当于最大气血n%的附加虚空伤害', { n: 2 }, [S('damage.from_life.void')]],
  ['damage_per_life', '每n点最大气血，伤害 +n%', { per: 100, amount: 4 }, [S('damage.per_life', RATIO)]],
  ['area_per_life', '每n点最大气血，技能范围 +n%', { per: 100, amount: 2 }, [S('area.per_life', RATIO)]],
  // ---- 气血：保命
  ['cheat_death_keep', '受到致命伤害时，保留1点气血，冷却n秒', { cooldown: 60 }, [T('cheat_death_keep')]],
  ['cheat_death_heal', '受到致命伤害时，恢复最大气血的n%，冷却n秒', { percent: 30, cooldown: 90 }, [T('cheat_death_heal')], '与“保留1点气血”同时可用时优先触发这一条。'],
  ['guard_on_low_life', '首次进入低血状态时，获得持续n秒的减伤，冷却n秒', { duration: 4, reduction: 30, cooldown: 20 }, [T('guard_on_low_life')], 'reduction = 减伤百分比。'],
  ['buff_on_full_life', '从低血恢复至满血时，获得持续n秒的增益，冷却n秒', { duration: 5, cooldown: 15 }, [T('buff_on_full_life')], STITCH_GRANT],
  // ---- 补充：让格挡、闪避、护甲、魔力类词条有来源
  ['block_chance', '格挡率 +n%', { n: 15 }, [S('defense.block_chance')], '补充词条：格挡完全挡下一次命中（上限 75%）。'],
  ['evade_chance', '闪避率 +n%', { n: 10 }, [S('defense.evade_chance')], '补充词条：闪避完全躲开一次命中（上限 75%）。'],
  ['armour', '护甲 +n', { n: 200 }, [S('defense.armour')], '补充词条：物理命中减免 = 护甲/(护甲 + 5×伤害)，上限 90%。'],
  ['evasion', '闪避值 +n', { n: 200 }, [S('defense.evasion')], '补充词条：供“受到命中时恢复相当于闪避值n%的护盾”使用。'],
  ['mana_base', '魔力上限 +n', { n: 50 }, [S('mana.base')], '补充词条：基础魔力 100，每秒恢复 8。'],
];

const dir = path.join(RULES_DIR, 'Affixes');
fs.mkdirSync(dir, { recursive: true });
const ids = new Set();
for (const [id, name, params, sheet, note = ''] of AFFIXES) {
  if (ids.has(id)) throw new Error(`duplicate affix ${id}`);
  ids.add(id);
  const doc = { id, name, description: `角色词条：${name}${note ? `。${note}` : ''}`, ...(Object.keys(params).length ? { params } : {}), sheet };
  const inline = value => (Array.isArray(value) ? `[${value.map(inline).join(', ')}]`
    : value && typeof value === 'object' ? `{ ${Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${inline(v)}`).join(', ')} }` : JSON.stringify(value));
  const text = `{\n${Object.entries(doc).map(([k, v]) => (k === 'sheet' ? `  "sheet": [\n${v.map(e => `    ${inline(e)}`).join(',\n')}\n  ]` : `  ${JSON.stringify(k)}: ${inline(v)}`)).join(',\n')}\n}\n`;
  fs.writeFileSync(path.join(dir, `${id}.json`), text);
}
console.log(`wrote ${AFFIXES.length} affixes to ${dir}`);

// Authoring only. Re-layout the frozen catalogue by default; source extraction is explicit.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULES_DIR } from './rule-files.mjs';
import { scatterConstellation } from '../public/talents/layout.mjs';

const sectors = [
  ['embers', '焰心回响', 'attack', '#ec9d64', '消耗与恢复，驱动烈焰', ['embers_echo', 'mana_echo', 'ignite_consume', 'burn_ground', 'burn_timer']],
  ['froststorm', '霜雷共鸣', 'attack', '#9fbde9', '冻结与感电接力', ['rime_thunder', 'frozen_spikes', 'freeze_end_zone', 'shock_layers_strike', 'shock_kill_spread']],
  ['plague', '毒潮引爆', 'attack', '#a4c58b', '中毒改变伤害形态', ['plague_tide', 'poison_crit_detonate', 'poison_eternal', 'poison_no_damage', 'poison_death_copy']],
  ['blood', '血毒献法', 'special', '#d7869b', '让损血与血量成为输出资源', ['self_poison', 'cost_from_life', 'empower_on_life_spent', 'poison_layers_empower', 'life_added_physical']],
  ['blades', '剑雨飞返', 'attack', '#8ad0e8', '汇聚、连锁、穿透和回归', ['myriad_blades', 'returning_flame', 'proj_chain_secondary', 'proj_pierce_secondary', 'proj_return_secondary']],
  ['fracture', '裂变轨迹', 'attack', '#9caee8', '改变投射物的生命周期', ['proj_split_distance_trigger', 'proj_split_time_trigger', 'proj_expire_secondary', 'proj_orbit', 'proj_recall_empower']],
  ['tempest', '风暴地脉', 'attack', '#89c7b1', '游走风暴与四种异常地面', ['storm_swarm', 'chromatic_ground', 'area_roam', 'area_consume_remaining', 'area_stay']],
  ['conversion', '元素转化', 'attack', '#d2a2cf', '重塑伤害类型与乘区', ['fire_convert_physical', 'frost_convert_physical', 'lightning_convert_physical', 'void_convert_elemental', 'extra_as_void']],
  ['summons', '召唤契约', 'special', '#b7a1ed', '数量、合体和主动献祭', ['sentinel_blades', 'sacrifice_thunder', 'minion_merge', 'minion_more_weaker', 'minion_fewer_damage']],
  ['rebirth', '召唤回路', 'special', '#baa6da', '以召唤物的生灭驱动战斗', ['summon_echo', 'minion_sacrifice_elite', 'minion_death_explode', 'minion_spawn_blast', 'minion_nearby_guard']],
  ['shield', '护盾循环', 'defense', '#88bddd', '气血、魔力和再生汇入护盾', ['overflow_cast', 'shield_from_life', 'shield_from_mana', 'shield_from_life_regen', 'empower_from_overflow']],
  ['recoup', '伤害回收', 'defense', '#9ab9cc', '把瞬间伤害转为时间与恢复', ['life_loss_deferred', 'life_recoup', 'shield_recoup', 'shield_recoup_prevented_physical', 'shield_from_overflow_life_regen']],
  ['survival', '绝境续命', 'defense', '#d9b67f', '致命抵抗与持续恢复', ['cheat_death_keep', 'cheat_death_heal', 'guard_on_low_life', 'heal_overflow_to_shield', 'leech_life_keep_full']],
  ['block', '格挡反制', 'defense', '#d0b796', '格挡事件转成施法与反击', ['block_spell', 'block_count_cast', 'block_recoup_life', 'block_buff_armour', 'block_next_attack_more']],
  ['evade', '闪避反制', 'defense', '#a3c7a4', '失败补偿、反击和节奏增益', ['evade_fail_bonus', 'evade_counter', 'evade_count_cast', 'evade_next_attack_crit', 'evade_buff_move']],
  ['recovery', '逆境回响', 'defense', '#9eb5df', '恢复、破盾和绝境转为主动回路', ['cast_on_life_restored', 'cast_on_shield_broken', 'trig_recharge_start', 'trig_enter_low', 'trig_lethal']],
  ['rhythm', '行止节律', 'special', '#d6c78f', '以动作和位置掌握施法节奏', ['moving_cast', 'still_cast', 'trig_distance', 'trig_dodge', 'trig_channel']],
  ['weave', '触发编织', 'special', '#c4a0d5', '让施法接续、轮转并改变落点', ['trig_cast', 'trig_multi_hit', 'trigger_order_rotate', 'trigger_at_event', 'trigger_streak']],
  ['erosion', '侵蚀坍缩', 'attack', '#bb93dc', '积层、消耗与终结传播', ['erosion_collapse', 'erosion_consume_all', 'erosion_consume_layers', 'void_execute', 'execute_spread']],
  ['resource', '资源重构', 'special', '#8fc7bf', '替代支付、返还与瞬时偷取', ['cost_from_shield', 'empower_on_shield_spent', 'trigger_resource_reduction', 'trigger_refund', 'leech_life_instant']],
].map(([id, name, category, color, description, legends], i) => ({ id, name, category, color, description, legends, angle: -90 + Math.floor(i / 2) * 36, ring: i % 2 }));

// [preset, slot, affix id]. A legendary is a mechanism, not a copy of all thirty BD affixes.
const definitions = [
  ['embers_echo', '余烬回响', 'embers_echo_1', 'flame_burst', '恢复魔力 → 烈焰爆发',
    '每累计恢复30点魔力，触发一次烈焰爆发。', '需要持续恢复魔力；原BD的减耗、回蓝和冷却词条仍由装备提供。',
    [['weapon', 'legendary:embers_echo_1_weapon']]],
  ['mana_echo', '耗蓝连焰', 'autocast_mana_refund', 'flame_burst', '消耗魔力 → 连锁施法',
    '每累计消耗20点魔力，触发烈焰爆发。', '按当前BD实例提取，阈值为20；返还、重复与减耗需要继续配装。',
    [['weapon', 'trig_mana_spent']]],
  ['rime_thunder', '霜雷交响', 'synergy_rime_thunder', 'frost_lance', '冻结 → 消耗异常 → 雷霆',
    '命中施加冰缓与冻结；消耗冻结强化伤害，并触发附带感电的雷霆新星。', '需要命中目标；无目标时链条停止。',
    [['weapon', 'freezing_hits'], ['weapon', 'freeze_consume'], ['weapon', 'consume_lightning_nova']]],
  ['plague_tide', '瘟疫回潮', 'synergy_plague_tide', 'poison_flask', '中毒达到门槛 → 引爆 → 再投',
    '中毒达到5层时引爆；消耗异常后触发附带中毒的毒瓶。', '需要毒层来源与命中；无目标、断毒后需要重新启动。',
    [['weapon', 'poison_threshold_detonate'], ['weapon', 'consume_poison_flask']]],
  ['self_poison', '自毒连投', 'self_poison_flasks', 'poison_flask', '自身中毒 → 损血 → 连投',
    '施毒同时向自身施加中毒；累计损血后，在目标方向触发多重毒瓶。', '需要先命中启动，也需要气血恢复和魔力续航；自身中毒会实际损血。',
    [['weapon', 'poison_self'], ['weapon', 'trig_life_lost']]],
  ['overflow_cast', '溢盾施法', 'autocast_shield', 'flame_burst', '溢盾衰减 → 恢复护盾 → 施法',
    '护盾可溢出40%；每累计实际恢复75点护盾，触发烈焰爆发。', '需要护盾上限和护盾再生；没有恢复量便不会触发。',
    [['weapon', 'trig_shield_restored'], ['weapon', 'shield_overflow']]],
  ['myriad_blades', '万剑汇流', 'myriad_swords_t1_legendary', 'frost_lance', '多重投射 → 目标周围汇聚',
    '额外投射物从多个发射位置向目标周围汇聚。', '提取万剑归宗的形态核心；增加发射位置和投射物数量仍可由装备提供。',
    [['weapon', 'legendary:myriad_swords_t1_weapon'], ['helmet', 'legendary:myriad_swords_t1_helmet'], ['chest', 'legendary:myriad_swords_t1_chest']]],
  ['returning_flame', '飞返连焰', 'autocast_return', 'frost_lance', '飞返 → 冰锥与烈焰再发',
    '投射物达到最大距离返回；返回时有60%概率续发冰锥和烈焰爆发。', '需要投射物；触发概率和冷却沿用原机制，装备可继续补齐。',
    [['weapon', 'trig_return'], ['weapon', 'proj_return_at_max'], ['weapon', 'proj_return_pierce']]],
  ['sentinel_blades', '哨卫剑雨', 'summon_myriad_swords', 'sentinel', '三哨卫 → 多重汇聚剑雨',
    '控制单位上限与同类召唤上限各+2；哨卫继承多重投射与目标汇聚。', '需要装备绑定召唤哨卫；实际数量、攻速和投射物仍按原规则结算。',
    [['weapon', 'legendary:summon_myriad_weapon'], ['helmet', 'legendary:summon_myriad_helmet'], ['chest', 'control_unit_cap'], ['chest', 'minion_cap_same']]],
  ['sacrifice_thunder', '献祭雷铸', 'synergy_sacrifice_thunder', 'iron_guard', '献祭 → 雷霆新星 → 铁卫重生',
    '获得献祭技能；献祭召唤物时释放附带感电的雷霆新星，并补召铁卫。', '先召唤再主动献祭；自然死亡和到期不算献祭。恢复与护盾转化仍由装备提供。',
    [['weapon', 'sacrifice_thunder_guard'], ['gloves', 'grant_sacrifice']]],
  ['moving_cast', '行走焰爆', 'autocast_moving', 'flame_burst', '持续移动 → 周期施法',
    '持续移动时，每满1秒触发烈焰爆发。', '停止移动就停止此触发；仍需支付触发施法的实际消耗。',
    [['weapon', 'trig_moving']]],
  ['still_cast', '静止焰爆', 'autocast_still', 'flame_burst', '保持静止 → 周期施法',
    '保持静止时，每满1秒触发烈焰爆发。', '移动会打断静止计时；仍需支付触发施法的实际消耗。',
    [['weapon', 'trig_still']]],
  ['storm_swarm', '游走风暴', 'whirlwind_swarm', 'whirlwind', '命中 → 镜像地面 → 退出再进入复制',
    '命中生成镜像地面；原投射物和复制体每次实际进入都会复制。获得回响，使下一次手动技能额外执行一次。', '需要装备绑定旋风并手动启动；镜像需接触地面，复制不刷新寿命。回响独立冷却5秒。',
    [['helmet', 'hit_mirror_ground'], ['amulet', 'grant_echo']]],
  ['chromatic_ground', '四色染地', 'whirlwind_grounds', 'whirlwind', '命中 → 四色地面 → 接触染色',
    '命中有机会生成燃烧、冰缓、感电和毒性地面；投射物接触地面后染色。', '各地面独立结算和冷却；染色只改变外观，不额外改变伤害。',
    [['weapon', 'hit_burning_ground'], ['gloves', 'hit_chilled_ground'], ['helmet', 'hit_shocked_ground'], ['offhand', 'hit_poison_ground']]],
  ['summon_echo', '召唤连焰', 'autocast_summon', 'sentinel', '召唤物生成 → 续召与烈焰',
    '召唤物生成时，触发下一次召唤与烈焰爆发。', '需要先召唤启动；召唤数量上限和触发实际消耗继续生效。', [['weapon', 'trig_summon_spawn']]],
];

// Curated mechanical changes. Values come from the original trait defaults, not a new balance table.
const important = [
  ['ignite_consume', '余烬收割', '消耗点燃，把剩余持续伤害提前结算。'],
  ['burn_ground', '焚尸余火', '燃烧敌人死亡后留下地面，让击杀延伸成区域伤害。'],
  ['burn_timer', '灼烧升温', '持续燃烧逐步提高目标受到的火焰伤害，奖励长时间燃烧。'],
  ['frozen_spikes', '冻体迸刺', '命中冻结目标时额外发射冰刺，把控制转成额外投射。'],
  ['freeze_end_zone', '霜痕遗留', '冻结结束后留下冰缓区域，延长控制影响。'],
  ['shock_layers_strike', '积电落雷', '累计施加感电层数后落雷，把高频异常转成额外打击。'],
  ['shock_kill_spread', '电殛传染', '击杀感电敌人后向附近传播，使清群接续感电。'],
  ['poison_crit_detonate', '毒性暴击', '暴击有机会引爆毒层，让持续伤害转成爆发。'],
  ['poison_eternal', '永恒之毒', '中毒不再自然结束，代价是降低毒层上限。'],
  ['poison_no_damage', '无伤之毒', '中毒不再直接造成伤害，改为放大目标受到的命中伤害。'],
  ['poison_death_copy', '疫体接种', '中毒敌人死亡后复制毒层，改变毒伤的清群方式。'],
  ['cost_from_life', '以血代蓝', '让部分技能消耗由气血承担，与耗血强化和恢复联动。'],
  ['empower_on_life_spent', '献血蓄势', '累计消耗气血强化下一次技能，把支付行为转成伤害。'],
  ['poison_layers_empower', '万毒蓄势', '累计施加毒层强化下一次技能，连接异常频率与爆发。'],
  ['life_added_physical', '血铸锋刃', '最大气血提供物理点伤，允许生存投入转成输出。'],
  ['proj_chain_secondary', '连锁繁生', '每次连锁生成次级投射物，改变清群扩散方式。'],
  ['proj_pierce_secondary', '贯穿繁生', '累计穿透生成次级投射物，使密集敌人成为增殖条件。'],
  ['proj_return_secondary', '归途散射', '返回途中释放次级投射物，为回归轨迹增加伤害来源。'],
  ['proj_split_distance_trigger', '远距裂变', '按飞行距离触发分裂，构筑可以围绕距离阈值配置。'],
  ['proj_split_time_trigger', '定时裂变', '按存在时间触发分裂，改变投射物密度和起爆节奏。'],
  ['proj_expire_secondary', '终末繁生', '投射物消失时向周围发射次级投射物。'],
  ['proj_orbit', '环身星卫', '投射物环绕角色飞行，形成随身移动的命中区域。'],
  ['proj_recall_empower', '万流归一', '回收投射物积累下一次技能强化，连接回归和爆发。'],
  ['area_roam', '游走领域', '范围技能随机游走，使区域伤害不再固定在原落点。'],
  ['area_consume_remaining', '余响归爆', '提前结算范围技能的剩余效果，改变持续与爆发的取舍。'],
  ['area_stay', '久留惩戒', '目标在范围内停留越久，受到该技能的伤害越高。'],
  ['fire_convert_physical', '熔铁为焰', '物理伤害转化为火焰，重组可受益的增伤与异常。'],
  ['frost_convert_physical', '寒铁凝霜', '物理伤害转化为冰霜，连接物理底伤与冰霜机制。'],
  ['lightning_convert_physical', '铁鸣化电', '物理伤害转化为闪电，连接物理底伤与感电机制。'],
  ['void_convert_elemental', '万象归虚', '元素伤害转化为虚空，重塑伤害类型与侵蚀方向。'],
  ['extra_as_void', '虚空映照', '基于已有命中伤害获得额外虚空伤害，形成跨类型收益。'],
  ['minion_merge', '万灵合体', '同类召唤物合并，数量转化为单体气血与伤害。'],
  ['minion_more_weaker', '众生军团', '提高召唤数量上限，代价是单个召唤物伤害降低。'],
  ['minion_fewer_damage', '独尊之灵', '降低召唤数量上限，换取单个召唤物的独立伤害增幅。'],
  ['minion_sacrifice_elite', '献祭升格', '累计主动牺牲召唤物，生成强化召唤物。'],
  ['minion_death_explode', '亡灵爆裂', '召唤物死亡触发爆炸，让生灭本身成为攻击方式。'],
  ['minion_spawn_blast', '降临震荡', '召唤物生成时释放范围攻击，鼓励不断召唤与替换。'],
  ['minion_nearby_guard', '群灵护主', '附近召唤物数量提供减伤，把召唤布局转成生存。'],
  ['shield_from_life', '血肉成盾', '以最大气血获得额外护盾，令气血投入支持双资源防御。'],
  ['shield_from_mana', '心智屏障', '以最大魔力获得额外护盾，令魔力投入兼顾防御。'],
  ['shield_from_life_regen', '双池再生', '气血再生同时恢复护盾，重用同一再生来源。'],
  ['empower_from_overflow', '溢能释放', '消耗溢出护盾强化下一次技能，把多余防御转为爆发。'],
  ['life_loss_deferred', '迟伤缓释', '将部分气血损失延后扣除，给恢复留出时间。'],
  ['life_recoup', '血伤回收', '把受到的命中伤害分期恢复为气血，与延迟损血形成配合。'],
  ['shield_recoup', '伤转护盾', '把受到的命中伤害分期恢复为护盾。'],
  ['shield_recoup_prevented_physical', '铁壁回收', '被阻止的物理命中伤害也成为护盾恢复来源。'],
  ['shield_from_overflow_life_regen', '满血余泽', '满血后的溢出气血再生用于恢复护盾，减少恢复浪费。'],
  ['cheat_death_keep', '一息不灭', '在冷却允许时抵挡致命伤害并保留气血。'],
  ['cheat_death_heal', '绝命复苏', '遭受致命伤害时恢复最大气血的一部分。'],
  ['guard_on_low_life', '危命护持', '首次进入低血状态获得临时减伤，为低血构筑提供窗口。'],
  ['heal_overflow_to_shield', '盈血化盾', '溢出治疗转成护盾，使满血治疗仍有价值。'],
  ['leech_life_keep_full', '不息血契', '满血后保留气血偷取，使后续受伤时仍有恢复。'],
  ['block_spell', '法术盾壁', '让格挡覆盖法术命中，扩大格挡机制的适用场景。'],
  ['block_count_cast', '盾鸣施法', '累计格挡触发挂载雷霆新星，使防御频率转成施法。', 'create_lightning_nova'],
  ['block_recoup_life', '格挡回生', '格挡阻止的伤害分期恢复为气血，防御行为产生续航。'],
  ['block_buff_armour', '越战越坚', '成功格挡后获得临时护甲，提高连续承伤能力。'],
  ['block_next_attack_more', '盾后重击', '成功格挡后强化下一次攻击，形成防守反击节奏。'],
  ['evade_fail_bonus', '失手补偿', '连续闪避失败提高后续闪避概率，成功后重置。'],
  ['evade_counter', '掠影反击', '成功闪避后有机会触发反击，把回避转为输出。'],
  ['evade_count_cast', '影步施法', '累计闪避触发挂载雷霆新星，围绕回避构建触发链。', 'create_lightning_nova'],
  ['evade_next_attack_crit', '影袭必争', '成功闪避后提高下一次攻击暴击率，联动暴击构筑。'],
  ['evade_buff_move', '避实流转', '成功闪避后加速，帮助重新站位并持续触发移动机制。'],
  ['cast_on_life_restored', '回生施法', '累计恢复气血触发挂载烈焰爆发，把恢复量转为施法频率。', 'create_flame_burst'],
  ['cast_on_shield_broken', '破盾反震', '护盾被敌人击破时触发挂载雷霆新星。', 'create_lightning_nova'],
  ['trig_recharge_start', '回充启鸣', '护盾开始回充时触发挂载烈焰爆发，让回充节奏参与攻击。', 'create_flame_burst'],
  ['trig_enter_low', '危血雷鸣', '进入低血状态时触发挂载雷霆新星。', 'create_lightning_nova'],
  ['trig_lethal', '绝境回声', '抵挡致命伤害后触发挂载烈焰爆发，可与续命机制联动。', 'create_flame_burst'],
  ['trig_distance', '步步生焰', '每累计移动一定距离触发挂载烈焰爆发。', 'create_flame_burst'],
  ['trig_dodge', '闪身雷震', '完成主动闪避动作后有机会触发挂载雷霆新星。', 'create_lightning_nova'],
  ['trig_channel', '引导回响', '持续引导达到时间门槛后触发挂载烈焰爆发。', 'create_flame_burst'],
  ['trig_cast', '施法连奏', '主动施法时有机会触发挂载雷霆新星，形成双技能节奏。', 'create_lightning_nova'],
  ['trig_multi_hit', '群击共振', '单次技能命中足够敌人后触发挂载烈焰爆发。', 'create_flame_burst'],
  ['trigger_order_rotate', '轮转星序', '多个挂载技能轮换触发，改变多技能消耗与施放顺序。'],
  ['trigger_at_event', '因果落点', '触发技能在事件发生位置释放，改变索敌和覆盖方式。'],
  ['trigger_streak', '连奏渐强', '连续触发同一技能逐步增伤，鼓励维持触发链。'],
  ['erosion_collapse', '侵蚀坍缩', '侵蚀达到层数门槛后坍缩，将积层转成额外爆发。'],
  ['erosion_consume_all', '虚蚀终结', '消耗全部侵蚀，立即结算剩余伤害的一部分。'],
  ['erosion_consume_layers', '蚀层献祭', '消耗侵蚀层数强化当前虚空伤害。'],
  ['void_execute', '虚空处决', '虚空技能直接终结气血低于阈值的普通敌人。'],
  ['execute_spread', '终结传蚀', '终结敌人后传播侵蚀，连接处决与清群。'],
  ['cost_from_shield', '护盾代偿', '让部分技能消耗由护盾支付，连接护盾恢复与施法。'],
  ['empower_on_shield_spent', '盾耗蓄势', '累计消耗护盾强化下一次技能，与护盾代偿形成循环。'],
  ['trigger_resource_reduction', '低耗共鸣', '降低触发技能的资源消耗，使高频触发更容易维持续航。'],
  ['trigger_refund', '施法返还', '返还触发技能消耗，改变资源循环的可持续性。'],
  ['leech_life_instant', '瞬时汲取', '一部分气血偷取立即恢复，把延迟续航转为即时恢复。'],
];

const point = (r, a) => ({ x: Math.round(Math.cos(a * Math.PI / 180) * r), y: Math.round(Math.sin(a * Math.PI / 180) * r) });

export function createTalentConstellation(rulesDir = RULES_DIR) {
  const index = JSON.parse(fs.readFileSync(path.join(rulesDir, 'Presets/index.json'), 'utf8'));
  const nodes = [{ id: 'origin', kind: 'origin', name: '启明星', x: 0, y: 0, cost: 0 }], edges = [];
  const link = (a, b) => edges.push([a, b]);
  const attribute = (id, sector, r, angle) => { nodes.push({ id, sector, kind: 'attribute', name: '自由属性', cost: 1, ...point(r, angle) }); return id; };
  const ruleDocs = new Map();
  for (const dir of ['Affixes', 'Traits', 'WebTraits', 'Timed']) for (const file of fs.readdirSync(path.join(rulesDir, dir)).filter(f => f.endsWith('.json'))) {
    const doc = JSON.parse(fs.readFileSync(path.join(rulesDir, dir, file), 'utf8')); ruleDocs.set(doc.id, { path: `${dir}/${file}`, doc });
  }
  const defaultSource = id => {
    const found = ruleDocs.get(id); if (!found) throw Error(`Unknown important trait: ${id}`);
    return { path: found.path, traits: [{ id, params: structuredClone(found.doc.params || {}), with: [] }] };
  };
  for (const sector of sectors) {
    const center = point(sector.ring ? 1620 : 900, sector.angle);
    Object.assign(sector, center);
    const hub = `${sector.id}_hub`;
    nodes.push({ id: hub, sector: sector.id, kind: 'attribute', name: '自由属性', cost: 1, ...center });
    sector.legends.forEach((id, i) => {
      const angle = sector.angle + 18 + i * 72;
      let previous = hub;
      [32, 58, 84, 110, 136, 162, 188].forEach((r, j) => {
        const local = point(r, angle), attrId = `${sector.id}_arm_${i + 1}_${j + 1}`;
        nodes.push({ id: attrId, sector: sector.id, kind: 'attribute', name: '自由属性', cost: 1, x: center.x + local.x, y: center.y + local.y }); link(previous, attrId); previous = attrId;
      });
      link(previous, id);
      const definition = definitions.find(row => row[0] === id);
      let legend;
      if (definition) {
        const [, name, presetId, skill, loop, description, requirement, selections] = definition;
        const preset = JSON.parse(fs.readFileSync(path.join(rulesDir, 'Presets', `${presetId}.json`), 'utf8'));
        const sources = selections.map(([slot, affixId]) => {
        const item = preset.instances?.[preset.equipment[slot]];
        if (!item) throw Error(`${presetId}/${slot}: missing BD instance`);
        const affix = [...(item.bases || []), ...(item.legendary ? [item.legendary] : []), ...item.affixes].find(row => row.id === affixId);
        if (!affix) throw Error(`${presetId}/${slot}: missing affix ${affixId}`);
        return { preset: presetId, slot, affix: affixId, traits: structuredClone(affix.traits) };
        });
        if (id === 'chromatic_ground') {
        sources.push(defaultSource('proj_ground_contact'), defaultSource('proj_ground_tint'));
        }
        legend = { name, skill, loop, description, requirement, sourceBuild: { id: presetId, name: index.find(row => row.id === presetId)?.name || presetId }, sources };
      } else {
        const row = important.find(row => row[0] === id); if (!row) throw Error(`Missing important trait: ${id}`);
        const [, name, description, mount] = row, sources = [defaultSource(id)];
        if (mount) { const payload = defaultSource(mount); sources[0].traits[0].with = structuredClone(payload.traits); sources.push({ ...payload, mounted: true }); }
        const skill = mount === 'create_lightning_nova' ? 'lightning_nova' : mount ? 'flame_burst' : /poison/.test(id) ? 'poison_flask' : /minion/.test(id) ? 'sentinel' : /void|erosion/.test(id) ? 'lightning_nova' : 'frost_lance';
        legend = { name, description, loop: description, skill, requirement: mount ? '需满足事件条件；挂载技能沿用现有规则默认参数、实际消耗与冷却。' : '需要对应技能、异常、资源或防御事件；具体数值沿用现有特性默认值。', sources };
      }
      const local = point(235, angle);
      nodes.push({ id, sector: sector.id, category: sector.category, kind: 'legendary', cost: 1, ...legend,
        traits: legend.sources.filter(s => !s.mounted).flatMap(source => source.traits), x: center.x + local.x, y: center.y + local.y });
    });
    for (let j = 0; j < 4; j++) {
      const local = point(95, sector.angle + 18 + j * 72 + 36), id = `${sector.id}_cross_${j + 1}`;
      nodes.push({ id, sector: sector.id, kind: 'attribute', name: '自由属性', cost: 1, x: center.x + local.x, y: center.y + local.y });
      link(`${sector.id}_arm_${j + 1}_4`, id); link(id, `${sector.id}_arm_${j + 2}_4`);
    }
  }
  for (let i = 0; i < 10; i++) {
    const inner = sectors[i * 2], outer = sectors[i * 2 + 1]; let previous = 'origin';
    [160, 340, 520, 700].forEach((r, j) => { const id = attribute(`${inner.id}_route_${j + 1}`, inner.id, r, inner.angle); link(previous, id); previous = id; });
    link(previous, `${inner.id}_hub`); previous = `${inner.id}_hub`;
    [1050, 1200, 1350, 1500].forEach((r, j) => { const id = attribute(`${outer.id}_route_${j + 1}`, outer.id, r, outer.angle); link(previous, id); previous = id; });
    link(previous, `${outer.id}_hub`);
    const next = sectors[((i + 1) % 10) * 2 + 1]; previous = `${outer.id}_hub`;
    const angles = i === 9 ? [18] : [12, 24];
    angles.forEach((offset, j) => { const id = attribute(`${outer.id}_bridge_${j + 1}`, outer.id, 1620, outer.angle + offset); link(previous, id); previous = id; });
    link(previous, `${next.id}_hub`);
  }
  if (nodes.length !== 1000 || nodes.filter(n => n.kind === 'legendary').length !== 100) throw Error('Expected exactly 1000 nodes and 100 legendaries');
  return scatterConstellation({ schema: 1, id: 'opus_constellation', revision: 2, name: '启明星盘', defaultBudget: 120, root: 'origin',
    attributes: [
      { id: 'strength', name: '力量', glyph: '力', color: '#dc8d82', value: 10, traits: [{ id: 'attr_strength', params: { n: 10 }, with: [] }] },
      { id: 'dexterity', name: '敏捷', glyph: '敏', color: '#8dc69f', value: 10, traits: [{ id: 'attr_dexterity', params: { n: 10 }, with: [] }] },
      { id: 'intelligence', name: '智力', glyph: '智', color: '#8bbcdf', value: 10, traits: [{ id: 'attr_intelligence', params: { n: 10 }, with: [] }] },
      { id: 'constitution', name: '体质', glyph: '体', color: '#d4ba7e', value: 10, traits: [{ id: 'attr_constitution', params: { n: 10 }, with: [] }] },
    ], sectors: structuredClone(sectors), nodes, edges });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = path.join(RULES_DIR, 'Talents'); fs.mkdirSync(dir, { recursive: true });
  const snapshot=path.join(dir,'constellation.json');
  if(process.argv.includes('--layout-only')&&!fs.existsSync(snapshot))throw Error('缺少已提取的星盘快照，无法仅重建布局');
  const tree = fs.existsSync(snapshot)&&!process.argv.includes('--refresh-sources')
    ? scatterConstellation(JSON.parse(fs.readFileSync(snapshot, 'utf8')))
    : createTalentConstellation();
  fs.writeFileSync(path.join(dir, 'constellation.json'), JSON.stringify(tree, null, 2) + '\n');
  console.log(`${tree.name}: ${tree.nodes.length} nodes, ${tree.nodes.filter(n => n.kind === 'legendary').length} legendary, ${tree.edges.length} edges`);
}

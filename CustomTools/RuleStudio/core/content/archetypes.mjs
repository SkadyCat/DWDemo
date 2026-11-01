// 十一个示范流派：纯元素 ×3、元素反应 ×2、近战 ×3、触发 ×1、投射物持续伤害 ×1、持续区域 ×1。
// 每个流派 = 一个朴素技能 + 五级「质变」阶梯（每阶段拿到的关键词条和它带来的玩法变化）+ 数值放大优先级 + 防守优先级。
// 阶段 0–4 = 起步 / 成型 / 卡关 / 突破 / 毕业。
const RES = ['res_fire', 'res_cold', 'res_lightning'];
const DEF_LIFE = [...RES, 'life', ...RES, 'life', 'life_inc', 'res_chaos', 'life', 'reduced_hit', 'avoid_ailment', 'life', 'res_all', 'life_inc', 'res_chaos', 'life_regen', 'life', 'res_max'];
const ARMOUR = ['armour', 'armour_inc', 'armour', 'block'];
const EVASION = ['evasion', 'evasion_inc', 'evasion'];
const ES = ['es', 'es_inc', 'es', 'es_inc'];
const interleave = (a, b) => { const out = []; for (let i = 0; i < Math.max(a.length, b.length); ++i) { if (a[i]) out.push(a[i]); if (b[i]) out.push(b[i]); } return out; };

// ladder：五个阶段各自的「质变」——这一阶段新拿到的关键词条，以及它让玩法变成什么样。
// key（旧格式 [族, 起始阶段, 槽位]）由 ladder 展开得到，配装生成器和测试都用它。
const A = def => ({ ...def, key: def.ladder.flatMap((st, i) => st.keys.map(([fid, slot]) => slot ? [fid, i, slot] : [fid, i])) });

export const ARCHETYPES = Object.freeze([
  A({
    id: 'inferno', name: '烈焰法师', style: '纯元素·火', skills: ['fireball'], keepDistance: 380,
    summary: '火球点燃 → 尸爆 → 爆炸再点燃 → 被点燃者死亡从尸体重放火球：一颗火种烧穿整屏。',
    ladder: [
      { title: '火种', text: '火球命中点燃，敌人在火里慢慢倒下。', keys: [['chance_ignite'], ['proj_count', 'weapon']] },
      { title: '一列烧穿', text: '火球穿透，一发烧穿整列怪。', keys: [['proj_pierce']] },
      { title: '尸爆', text: '击杀的敌人爆炸，爆炸再炸死旁边的——怪群开始连环倒下。', keys: [['kill_explode'], ['ignite_spread']] },
      { title: '燎原', text: '爆炸会点燃，被点燃的尸体继续爆炸，火势自己往外蔓延。', keys: [['explode_ignite'], ['pen_fire']] },
      { title: '焚天', text: '被点燃的敌人死亡时从尸体重放你的主技能——火球从一具具尸体里喷向下一群，又点燃、又炸，整屏自燃。', keys: [['core_firestorm', 'amulet']] },
    ],
    traits: ['proj_explode', 'spell_echo', 'area_cascade', 'proliferate', 'kill_recast', 'vs_ailing', 'extra_fire_chaos', 'core_avatar_fire', 'core_point_blank', 'proj_count', 'proj_nova', 'proj_chain', 'proj_fork', 'core_elemental_overload', 'kill_onslaught'],
    amp: ['dmg_fire', 'added_fire_spell', 'cast_speed', 'dmg_spell', 'dmg_projectile', 'dmg_elemental', 'added_fire_spell', 'cast_speed', 'dmg_fire', 'ailment_ignite', 'mana_regen', 'pen_fire'],
    defence: interleave(DEF_LIFE, ES),
  }),
  A({
    id: 'glacier', name: '冰川行者', style: '纯元素·冰', skills: ['ice_nova'], keepDistance: 0,
    summary: '冰霜新星冻住一圈 → 击碎爆出寒霜冻住下一圈 → 绝对零度让每次击碎再掀寒潮：冻结、爆破、再冻结。',
    ladder: [
      { title: '冻土', text: '贴身新星冻住身边的怪。', keys: [['chance_freeze']] },
      { title: '寒域', text: '新星范围大一圈，冻住的怪受到更多伤害。', keys: [['area_more'], ['frozen_bonus']] },
      { title: '碎冰', text: '击碎冰冻的敌人爆出寒霜，冻住周围——下一圈被冻住，再被击碎。', keys: [['shatter_nova']] },
      { title: '回响', text: '每次施法打两轮，第二轮正好击碎第一轮冻住的怪。', keys: [['spell_echo'], ['chance_brittle'], ['pen_cold']] },
      { title: '绝对零度', text: '每次击碎都在原地掀起寒潮：冻结 → 爆破 → 冻结，一路推平。', keys: [['core_absolute_zero', 'offhand']] },
    ],
    traits: ['area_cascade', 'move_trigger', 'proliferate', 'kill_recast', 'vs_ailing', 'core_spell_burst', 'kill_onslaught', 'extra_cold_lightning', 'area_more', 'frozen_bonus', 'core_elemental_overload', 'kill_minion', 'shatter_burst', 'react_superconduct'],
    amp: ['dmg_cold', 'added_cold_spell', 'cast_speed', 'dmg_area', 'dmg_spell', 'crit_chance', 'effect_chill', 'added_cold_spell', 'cast_speed', 'dmg_elemental', 'mana_regen', 'crit_bonus'],
    defence: interleave(DEF_LIFE, ARMOUR),
  }),
  A({
    id: 'storm', name: '雷暴使徒', style: '纯元素·电', skills: ['arc'], keepDistance: 350,
    summary: '电弧连锁感电 → 感电扩散 → 落雷 → 感电者死亡再放电弧：一道电弧在整群怪里自己跳完。',
    ladder: [
      { title: '电弧', text: '电弧在怪之间连锁，命中感电。', keys: [['chain_any', 'weapon'], ['chance_shock']] },
      { title: '导电', text: '击杀感电敌人时感电扩散到周围。', keys: [['shock_spread']] },
      { title: '天雷', text: '每施加几次感电就在目标处落雷。', keys: [['cast_on_shock'], ['effect_shock']] },
      { title: '雷链', text: '感电的敌人死亡时从尸体再放一道电弧——电弧开始自己繁殖。', keys: [['kill_arc'], ['pen_lightning']] },
      { title: '风暴之心', text: '被触发的电弧和落雷伤害大增且必定感电，雷链永不熄灭。', keys: [['core_storm_heart', 'amulet']] },
    ],
    traits: ['proj_explode', 'spell_echo', 'area_cascade', 'proliferate', 'kill_recast', 'shock_bonus', 'vs_ailing', 'extra_lightning_fire', 'proj_count', 'chain_any', 'proj_fork', 'core_elemental_overload', 'kill_onslaught', 'kill_minion'],
    amp: ['dmg_lightning', 'added_lightning_spell', 'cast_speed', 'crit_chance', 'dmg_spell', 'crit_bonus', 'dmg_elemental', 'added_lightning_spell', 'cast_speed', 'crit_chance', 'mana_regen'],
    defence: interleave(DEF_LIFE, ES),
  }),
  A({
    id: 'triad', name: '三相术士', style: '元素反应', skills: ['spark'], keepDistance: 330,
    summary: '电花附火点燃 → 闪电引爆点燃（超载）→ 超载顺着点燃的怪群一路引爆 → 反应爆炸再上感电冰缓。',
    ladder: [
      { title: '双元素', text: '电花带上火焰，命中感电。', keys: [['extra_lightning_fire', 'weapon'], ['chance_shock']] },
      { title: '超载', text: '点燃后被闪电命中会爆炸，造成剩余点燃伤害。', keys: [['chance_ignite'], ['react_overload']] },
      { title: '融化', text: '一部分闪电转为冰霜，火焰打冰缓的怪伤害暴涨。', keys: [['conv_lightning_cold'], ['react_melt']] },
      { title: '引信', text: '超载爆炸引爆范围内其他被点燃的怪——点燃的整群像引信一样一路炸开；冰霜打感电再上超导。', keys: [['overload_fuse'], ['react_superconduct']] },
      { title: '元素共鸣', text: '反应爆炸给周围上感电和冰缓，下一发又是新的反应。', keys: [['core_resonance', 'amulet']] },
    ],
    traits: ['proj_count', 'proj_chain', 'proliferate', 'vs_ailing', 'spell_echo', 'kill_recast', 'proj_explode', 'area_cascade', 'core_trinity', 'proj_pierce', 'proj_fork', 'kill_onslaught', 'react_vaporize'],
    amp: ['dmg_elemental', 'added_lightning_spell', 'cast_speed', 'dmg_spell', 'dmg_projectile', 'added_fire_spell', 'ailment_ignite', 'cast_speed', 'dmg_elemental', 'mana_regen', 'proj_count'],
    defence: interleave(DEF_LIFE, ES),
  }),
  A({
    id: 'heralds', name: '冰电传令', style: '元素反应·近战', skills: ['cleave'], keepDistance: 0,
    summary: '劈砍冰冻 → 击碎爆出闪电 → 感电者死亡召来冰霜落雷 → 落雷冻住下一群：两道传令互相喂养。',
    ladder: [
      { title: '寒刃', text: '劈砍转冰霜，冻住一扇面的怪。', keys: [['conv_phys_cold', 'weapon'], ['chance_freeze'], ['area_more', 'helmet']] },
      { title: '冰之传令', text: '击碎冰冻的敌人爆出闪电，炸到的怪感电。', keys: [['chance_shock'], ['shatter_burst'], ['frozen_bonus']] },
      { title: '雷之传令', text: '击杀感电敌人后，接下来的攻击召来冰霜落雷，落雷又冻住新的一群。', keys: [['thunder_herald'], ['conv_phys_lightning', 'gloves'], ['vs_ailing']] },
      { title: '连斩', text: '一次劈砍砍两三刀，传令循环转得更快。', keys: [['multistrike']] },
      { title: '元素超载', text: '异常状态的怪受到的元素伤害暴涨，整屏一刀一片。', keys: [['core_elemental_overload', 'amulet']] },
    ],
    traits: ['shatter_nova', 'area_cascade', 'proliferate', 'kill_recast', 'hit_fortify', 'kill_onslaught', 'react_superconduct', 'area_more', 'frozen_bonus', 'vs_ailing', 'kill_minion', 'cast_on_shock'],
    amp: ['added_cold_attack', 'dmg_elemental', 'attack_speed', 'dmg_melee', 'added_lightning_attack', 'dmg_area', 'dmg_cold', 'attack_speed', 'leech', 'dmg_lightning', 'area_inc'],
    defence: interleave(DEF_LIFE, ARMOUR),
  }),
  A({
    id: 'thunderslam', name: '崩雷战神', style: '近战·充能', skills: ['falling_thunder'], keepDistance: 0,
    summary: '暴击攒能量球，一锤全打出 → 感电的怪死在雷里再落一道雷：一锤之后雷声不停。',
    ladder: [
      { title: '崩雷', text: '重锤暴击，砸出一扇面闪电。', keys: [['crit_base', 'weapon'], ['crit_chance']] },
      { title: '蓄能', text: '暴击攒能量球，一锤全部打出：每球更多伤害、多三道穿透闪电。', keys: [['crit_power', 'weapon'], ['per_power'], ['conv_phys_lightning']] },
      { title: '满蓄', text: '球上限提高，闪电感电。', keys: [['charge_max'], ['chance_shock']] },
      { title: '雷葬', text: '感电的怪死亡时在尸体处落雷，落雷再炸死感电的邻居。', keys: [['kill_thunder'], ['shock_bonus']] },
      { title: '无尽', text: '消耗能量球有几率不移除——每一锤都是满球，落地还有余震连砸。', keys: [['core_endless_charges', 'helmet'], ['area_cascade']] },
    ],
    traits: ['area_more', 'area_cascade', 'shock_bonus', 'crit_explode', 'proliferate', 'hit_fortify', 'multistrike', 'kill_recast', 'per_power', 'kill_onslaught', 'strike_splash', 'proliferate', 'kill_minion', 'charge_max'],
    amp: ['crit_chance', 'added_lightning_attack', 'attack_speed', 'crit_bonus', 'dmg_melee', 'dmg_lightning', 'area_inc', 'added_physical_attack', 'crit_chance', 'leech', 'attack_speed'],
    defence: interleave(DEF_LIFE, ARMOUR),
  }),
  A({
    id: 'whirlwind', name: '炎风剑舞', style: '近战·引导触发', skills: ['cyclone'], keepDistance: 0,
    summary: '旋风斩钻进怪堆 → 引导中连放炎爆 → 尸爆点燃 → 被点燃的尸体继续炸：转到哪里炸到哪里。',
    ladder: [
      { title: '旋风', text: '贴身旋风斩，偷取扛住包围。', keys: [['area_more'], ['leech']] },
      { title: '炎风', text: '引导时周期施放炎爆。', keys: [['cast_while_channel']] },
      { title: '烈刃', text: '物理转火，命中获得护体。', keys: [['conv_phys_fire'], ['hit_fortify']] },
      { title: '尸爆', text: '击杀的敌人爆炸，点燃扩散，怪堆从中间炸开。', keys: [['kill_explode'], ['chance_ignite'], ['ignite_spread']] },
      { title: '爆燃', text: '爆炸会点燃，被点燃的尸体继续爆炸；坚毅让你在怪堆中心站得住。', keys: [['explode_ignite'], ['core_resolute', 'chest']] },
    ],
    traits: ['area_cascade', 'proliferate', 'kill_recast', 'core_avatar_fire', 'vs_ailing', 'kill_onslaught', 'area_more', 'conv_phys_fire', 'hit_fortify', 'kill_minion', 'crit_explode', 'cast_on_crit', 'move_trigger', 'bleed_explode'],
    amp: ['added_physical_attack', 'attack_speed', 'dmg_melee', 'dmg_area', 'added_fire_attack', 'dmg_fire', 'attack_speed', 'dmg_spell', 'area_inc', 'ailment_ignite', 'dmg_physical'],
    defence: interleave(DEF_LIFE, ARMOUR),
  }),
  A({
    id: 'flicker', name: '影闪刺客', style: '近战·位移', skills: ['flicker_strike'], keepDistance: 0,
    summary: '击杀攒狂怒，狂怒重置闪现 → 每次落地冲击一圈 → 狂怒越多越快：在怪群间不停瞬移，落到哪清到哪。',
    ladder: [
      { title: '闪现', text: '瞬移到怪身边，一次砍多个、砍多刀。', keys: [['multistrike', 'weapon'], ['strike_targets', 'gloves']] },
      { title: '无间', text: '击杀攒狂怒，狂怒立即重置闪现冷却：连续瞬移。', keys: [['kill_frenzy', 'weapon'], ['flicker_reset', 'boots']] },
      { title: '落地冲击', text: '每次闪现落地冲击周围一圈，瞬移变成范围清怪。', keys: [['blink_slam'], ['per_frenzy']] },
      { title: '猛攻', text: '击杀获得猛攻，球上限提高，闪得更快。', keys: [['kill_onslaught'], ['charge_max']] },
      { title: '疾风', text: '狂怒球越多攻击和移动越快：在怪群里连闪不停，落点一圈接一圈。', keys: [['core_gale', 'helmet']] },
    ],
    traits: ['strike_splash', 'area_more', 'area_cascade', 'crit_explode', 'bleed_explode', 'proliferate', 'kill_recast', 'hit_fortify', 'multistrike', 'strike_targets', 'per_frenzy', 'kill_minion', 'kill_explode'],
    amp: ['added_physical_attack', 'attack_speed', 'dmg_melee', 'chance_bleed', 'crit_chance', 'dmg_physical', 'crit_bonus', 'leech', 'attack_speed', 'ailment_bleed', 'added_physical_attack', 'life_on_kill', 'dmg_area'],
    defence: interleave(DEF_LIFE, EVASION),
  }),
  A({
    id: 'critengine', name: '冰晶自走', style: '触发', skills: ['heavy_strike'], keepDistance: 0,
    summary: '重击暴击触发冰刺爆发 → 冰冻 → 击碎爆出寒霜 → 被触发的暴击再触发：一刀下去自己停不下来。',
    ladder: [
      { title: '重击', text: '专注暴击的重击，一次命中多个。', keys: [['crit_base', 'weapon'], ['strike_targets', 'weapon']] },
      { title: '冰刺', text: '攻击暴击时施放冰刺爆发。', keys: [['cast_on_crit', 'gloves'], ['multistrike']] },
      { title: '冻结', text: '暴击攒能量球、冰冻；冰冻的怪受到更多伤害。', keys: [['crit_power'], ['per_power'], ['frozen_bonus'], ['chance_freeze']] },
      { title: '碎冰', text: '击碎冰冻的敌人爆出寒霜冻住周围，下一次冰刺正好击碎。', keys: [['shatter_nova'], ['charge_max'], ['chance_brittle']] },
      { title: '连锁反应', text: '被触发的冰刺暴击还能再触发冰刺：自走清屏。', keys: [['core_chain_reaction', 'amulet']] },
    ],
    traits: ['strike_splash', 'area_more', 'area_cascade', 'crit_explode', 'proliferate', 'kill_recast', 'hit_fortify', 'core_absolute_zero', 'frozen_bonus', 'strike_targets', 'multistrike', 'kill_onslaught', 'kill_minion', 'shatter_burst'],
    amp: ['crit_chance', 'added_cold_spell', 'crit_bonus', 'dmg_cold', 'attack_speed', 'dmg_spell', 'crit_chance', 'dmg_area', 'crit_bonus', 'dmg_elemental', 'leech'],
    defence: interleave(DEF_LIFE, EVASION),
  }),
  A({
    id: 'venom', name: '万毒飞刃', style: '投射物·持续伤害', skills: ['viper_knives'], keepDistance: 320, defenceShare: 0.56,
    summary: '飞刃上毒连锁 → 毒层扩散 → 中毒者死亡爆出毒雾 → 尸体重放飞刃：毒在怪群里自己传开。',
    ladder: [
      { title: '淬毒', text: '飞刃命中上毒。', keys: [['chance_poison', 'weapon']] },
      { title: '连锁', text: '飞刃在怪之间连锁。', keys: [['proj_chain']] },
      { title: '扩散', text: '击杀中毒敌人时毒层扩散，飞刃命中分裂。', keys: [['poison_spread'], ['proj_split']] },
      { title: '毒爆', text: '中毒敌人死亡爆出毒雾，炸到的怪全部中毒——毒开始自己传染。', keys: [['poison_burst'], ['vs_ailing']] },
      { title: '瘟疫', text: '中毒敌人死亡时毒层转给周围、并从尸体重放飞刃：一具尸体变成下一轮齐射。', keys: [['core_plague', 'amulet'], ['proj_return']] },
    ],
    traits: ['proj_count', 'proj_pierce', 'proj_fork', 'proj_explode', 'proliferate', 'kill_recast', 'core_point_blank', 'extra_physical_chaos', 'proj_chain', 'vs_ailing', 'kill_onslaught', 'kill_minion', 'bleed_explode'],
    amp: ['ailment_poison', 'added_chaos_attack', 'attack_speed', 'dot_inc', 'dmg_projectile', 'ailment_poison', 'added_physical_attack', 'attack_speed', 'dmg_chaos', 'chance_poison', 'dot_inc'],
    defence: interleave(DEF_LIFE, EVASION),
  }),
  A({
    id: 'tempest', name: '风暴龙卷', style: '持续区域·追猎', skills: ['tornado'], keepDistance: 340,
    summary: '龙卷风把怪吸进风眼 → 一次卷起一群 → 风里劈下落雷 → 被卷死的怪再卷起龙卷风 → 风暴眼越转越大，散场时整片炸开。',
    ladder: [
      { title: '风眼', text: '龙卷风追着怪跑，把周围的怪吸进风眼里一起绞。', keys: [['zone_pull', 'weapon']] },
      { title: '风暴群', text: '每次施放卷起一群龙卷风，扇形扫过整个房间。', keys: [['zone_count']] },
      { title: '雷旋', text: '风里劈下落雷：龙卷风的每次命中都可能引雷。', keys: [['zone_thunder']] },
      { title: '风生', text: '被卷死的怪从尸体卷起新的龙卷风，龙卷风越转越大——风暴开始自己繁殖。', keys: [['zone_spawn'], ['zone_growth']] },
      { title: '风暴眼', text: '龙卷风持续更久、不断膨胀，散场时整片爆裂：一场风暴清空一个房间。', keys: [['core_maelstrom', 'amulet']] },
    ],
    traits: ['zone_count', 'zone_pull', 'area_more', 'spell_echo', 'kill_recast', 'zone_growth', 'conv_phys_lightning', 'kill_onslaught', 'vs_ailing', 'proliferate', 'kill_minion', 'cast_on_shock'],
    amp: ['added_physical_spell', 'cast_speed', 'dmg_area', 'dmg_spell', 'dmg_physical', 'cast_speed', 'added_lightning_spell', 'dmg_lightning', 'area_inc', 'duration', 'crit_chance'],
    defence: interleave(DEF_LIFE, ES),
  }),
]);

export const archetype = id => { const a = ARCHETYPES.find(x => x.id === id); if (!a) throw new Error(`未知流派 ${id}`); return a; };

// 十个示范流派：纯元素 ×3、元素反应 ×2、近战 ×3、触发 ×1、投射物持续伤害 ×1。
// 每个流派 = 一个朴素技能 + 一张「关键词条」时间线（第几阶段拿到）+ 数值放大优先级 + 防守优先级。
// 阶段 0–4 = 起步 / 成型 / 卡关 / 突破 / 毕业。
const RES = ['res_fire', 'res_cold', 'res_lightning'];
const DEF_LIFE = [...RES, 'life', ...RES, 'life', 'life_inc', 'res_chaos', 'life', 'reduced_hit', 'avoid_ailment', 'life', 'res_all', 'life_inc', 'res_chaos', 'life_regen', 'life', 'res_max'];
const ARMOUR = ['armour', 'armour_inc', 'armour', 'block'];
const EVASION = ['evasion', 'evasion_inc', 'evasion'];
const ES = ['es', 'es_inc', 'es', 'es_inc'];
const interleave = (a, b) => { const out = []; for (let i = 0; i < Math.max(a.length, b.length); ++i) { if (a[i]) out.push(a[i]); if (b[i]) out.push(b[i]); } return out; };

export const ARCHETYPES = Object.freeze([
  {
    id: 'inferno', name: '烈焰法师', style: '纯元素·火', skills: ['fireball'], keepDistance: 380,
    summary: '火球命中点燃，击杀扩散点燃并引发尸爆，穿透让一发火球烧穿整列怪。',
    key: [['proj_count', 0, 'weapon'], ['chance_ignite', 0], ['proj_pierce', 1], ['ignite_spread', 2], ['kill_explode', 2], ['pen_fire', 3], ['chance_scorch', 3], ['core_elemental_overload', 4, 'amulet']],
    amp: ['dmg_fire', 'added_fire_spell', 'cast_speed', 'dmg_spell', 'dmg_projectile', 'dmg_elemental', 'added_fire_spell', 'cast_speed', 'dmg_fire', 'ailment_ignite', 'mana_regen', 'pen_fire'],
    defence: interleave(DEF_LIFE, ES),
  },
  {
    id: 'glacier', name: '冰川行者', style: '纯元素·冰', skills: ['ice_nova'], keepDistance: 0,
    summary: '贴身冰霜新星，冰冻控场；冰冻敌人受到更多伤害，法术重复让每次施法打两轮。',
    key: [['chance_freeze', 0], ['area_more', 1], ['frozen_bonus', 1], ['spell_echo', 2], ['chance_brittle', 3], ['pen_cold', 3], ['core_spell_burst', 4, 'offhand']],
    amp: ['dmg_cold', 'added_cold_spell', 'cast_speed', 'dmg_area', 'dmg_spell', 'crit_chance', 'effect_chill', 'added_cold_spell', 'cast_speed', 'dmg_elemental', 'mana_regen', 'crit_bonus'],
    defence: interleave(DEF_LIFE, ARMOUR),
  },
  {
    id: 'storm', name: '雷暴使徒', style: '纯元素·电', skills: ['arc'], keepDistance: 350,
    summary: '电弧在怪群里来回连锁，感电扩散整群；每几次感电召下一道落雷。',
    key: [['chain_any', 0, 'weapon'], ['chance_shock', 0], ['shock_spread', 1], ['effect_shock', 2], ['cast_on_shock', 2], ['shock_bonus', 2], ['pen_lightning', 3], ['spell_echo', 4]],
    amp: ['dmg_lightning', 'added_lightning_spell', 'cast_speed', 'crit_chance', 'dmg_spell', 'crit_bonus', 'dmg_elemental', 'added_lightning_spell', 'cast_speed', 'crit_chance', 'mana_regen'],
    defence: interleave(DEF_LIFE, ES),
  },
  {
    id: 'triad', name: '三相术士', style: '元素反应', skills: ['spark'], keepDistance: 330,
    summary: '电花带上火与冰：感电、点燃、冰缓轮流被下一发引爆——超载、融化、超导，三相齐聚时全面增伤。',
    key: [['extra_lightning_fire', 0, 'weapon'], ['chance_shock', 0], ['chance_ignite', 1], ['react_overload', 1], ['conv_lightning_cold', 2], ['react_melt', 2], ['react_superconduct', 3], ['core_trinity', 4, 'amulet']],
    amp: ['dmg_elemental', 'added_lightning_spell', 'cast_speed', 'dmg_spell', 'dmg_projectile', 'added_fire_spell', 'ailment_ignite', 'cast_speed', 'dmg_elemental', 'mana_regen', 'proj_count'],
    defence: interleave(DEF_LIFE, ES),
  },
  {
    id: 'heralds', name: '冰电传令', style: '元素反应·近战', skills: ['cleave'], keepDistance: 0,
    summary: '劈砍转冰电：击碎冰冻爆出闪电，击杀感电召来冰霜落雷，两道传令互相喂养，自转清屏。',
    key: [['conv_phys_cold', 0, 'weapon'], ['chance_freeze', 0], ['area_more', 0, 'helmet'], ['chance_shock', 1], ['shatter_burst', 1], ['frozen_bonus', 1], ['thunder_herald', 2], ['conv_phys_lightning', 2, 'gloves'], ['vs_ailing', 2], ['multistrike', 3], ['core_elemental_overload', 4, 'amulet']],
    amp: ['added_cold_attack', 'dmg_elemental', 'attack_speed', 'dmg_melee', 'added_lightning_attack', 'dmg_area', 'dmg_cold', 'attack_speed', 'leech', 'dmg_lightning', 'area_inc'],
    defence: interleave(DEF_LIFE, ARMOUR),
  },
  {
    id: 'thunderslam', name: '崩雷战神', style: '近战·充能', skills: ['falling_thunder'], keepDistance: 0,
    summary: '暴击攒能量球，一锤全部打出：每球更多伤害、多三道穿透闪电；无尽核心让球永不耗尽。',
    key: [['crit_base', 0, 'weapon'], ['crit_chance', 0], ['crit_power', 1, 'weapon'], ['per_power', 1], ['conv_phys_lightning', 1], ['charge_max', 2], ['chance_shock', 2], ['shock_bonus', 3], ['core_endless_charges', 4, 'helmet']],
    amp: ['crit_chance', 'added_lightning_attack', 'attack_speed', 'crit_bonus', 'dmg_melee', 'dmg_lightning', 'area_inc', 'added_physical_attack', 'crit_chance', 'leech', 'attack_speed'],
    defence: interleave(DEF_LIFE, ARMOUR),
  },
  {
    id: 'whirlwind', name: '炎风剑舞', style: '近战·引导触发', skills: ['cyclone'], keepDistance: 0,
    summary: '旋风斩贴身引导，引导中周期施放炎爆；转火点燃，护体与偷取扛住包围。',
    key: [['area_more', 0], ['leech', 0], ['cast_while_channel', 1], ['conv_phys_fire', 2], ['hit_fortify', 2], ['chance_ignite', 3], ['ignite_spread', 3], ['core_resolute', 4, 'chest']],
    amp: ['added_physical_attack', 'attack_speed', 'dmg_melee', 'dmg_area', 'added_fire_attack', 'dmg_fire', 'attack_speed', 'dmg_spell', 'area_inc', 'ailment_ignite', 'dmg_physical'],
    defence: interleave(DEF_LIFE, ARMOUR),
  },
  {
    id: 'flicker', name: '影闪刺客', style: '近战·位移', skills: ['flicker_strike'], keepDistance: 0,
    summary: '击杀攒狂怒，狂怒重置闪现：在怪群间连续瞬移斩击，多重打击让每次落地砍三刀。',
    key: [['multistrike', 0, 'weapon'], ['strike_targets', 0, 'gloves'], ['kill_frenzy', 1, 'weapon'], ['flicker_reset', 1, 'boots'], ['per_frenzy', 2], ['kill_onslaught', 3], ['charge_max', 3], ['core_endless_charges', 4, 'helmet']],
    amp: ['added_physical_attack', 'attack_speed', 'dmg_melee', 'crit_chance', 'dmg_physical', 'crit_bonus', 'leech', 'attack_speed', 'added_physical_attack', 'life_on_kill'],
    defence: interleave(DEF_LIFE, EVASION),
  },
  {
    id: 'critengine', name: '冰晶自走', style: '触发', skills: ['heavy_strike'], keepDistance: 0,
    summary: '重击专注暴击，暴击触发冰刺爆发；核心「连锁反应」让爆发的暴击再次触发，自走清屏。',
    key: [['crit_base', 0, 'weapon'], ['strike_targets', 0, 'weapon'], ['cast_on_crit', 1, 'gloves'], ['multistrike', 1], ['crit_power', 2], ['per_power', 2], ['frozen_bonus', 2], ['chance_freeze', 2], ['charge_max', 3], ['chance_brittle', 3], ['core_chain_reaction', 4, 'amulet']],
    amp: ['crit_chance', 'added_cold_spell', 'crit_bonus', 'dmg_cold', 'attack_speed', 'dmg_spell', 'crit_chance', 'dmg_area', 'crit_bonus', 'dmg_elemental', 'leech'],
    defence: interleave(DEF_LIFE, EVASION),
  },
  {
    id: 'venom', name: '万毒飞刃', style: '投射物·持续伤害', skills: ['viper_knives'], keepDistance: 320,
    summary: '飞刃上毒、在怪群间连锁，命中分裂、耗尽折返；击杀扩散毒层，异常越多伤害越高。', defenceShare: 0.56,
    key: [['chance_poison', 0, 'weapon'], ['proj_chain', 1], ['poison_spread', 2], ['proj_split', 2], ['vs_ailing', 3], ['proj_return', 3], ['core_point_blank', 4, 'weapon']],
    amp: ['ailment_poison', 'added_chaos_attack', 'attack_speed', 'dot_inc', 'dmg_projectile', 'ailment_poison', 'added_physical_attack', 'attack_speed', 'dmg_chaos', 'chance_poison', 'dot_inc'],
    defence: interleave(DEF_LIFE, EVASION),
  },
]);

export const archetype = id => { const a = ARCHETYPES.find(x => x.id === id); if (!a) throw new Error(`未知流派 ${id}`); return a; };

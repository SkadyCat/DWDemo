// Ten growth builds (成长型 BD). Pure data: every mechanic is an existing rule op
// (counter / apply_status / damage_area / emit / summon) inside the skill's own trait,
// so nothing here rolls as a random equipment affix and the rule engine is untouched.
//
// Shared rhythm for every build (three layers of positive feedback):
//   蓄势  hits or kills feed a counter; every N grants one stack of a timed buff;
//   爆发  every M stacks gained releases a burst and a short surge buff;
//   成长  kills on this floor grow a permanent stack (damage) and unlock two stages:
//         觉醒 at `awaken_at` kills, 极境 at `ultimate_at` kills.

const amount = (mult = 1, base = 'damage') => {
  const core = { max: [{ param: base }, { event: 'amount' }] };
  return mult === 1 ? core : { mul: [core, mult] };
};
const stage = key => ({ op: 'state', key: 'growth', compare: 'gte', value: { param: key } });
const status = key => ({ op: 'status', key, compare: 'gte', value: 1 });
const area = (element, tags, radius, mult, extra = {}) => ({ op: 'damage_area', element, tags, radius, amount: amount(mult), ...extra });

/** Common growth parameters. Individual builds override cadence where it matters. */
const GROWTH = { growth_cap: 40, growth_bonus: 1, awaken_at: 15, ultimate_at: 40, charge_duration: 6, surge_duration: 5 };

function growthRules(bd) {
  const { id, feed } = bd;
  const chargeKey = `${id}_charge`, surgeKey = `${id}_surge`, growthKey = `${id}_growth`;
  const charge = [
    { op: 'apply_status', key: chargeKey, origin: 'owner', value: { param: 'charge_bonus' }, duration: { param: 'charge_duration' } },
    { op: 'counter', key: 'surge', value: 1, threshold: { param: 'surge_every' }, then: [
      { op: 'apply_status', key: surgeKey, origin: 'owner', value: { param: 'surge_power' }, duration: { param: 'surge_duration' } },
      ...bd.burst,
    ] },
  ];
  return [
    { id: `${id}_feed`, event: feed.event, chain: { maxDepth: 3 }, conditions: feed.conditions || [],
      actions: [{ op: 'counter', key: 'feed', value: 1, threshold: { param: 'charge_every' }, then: charge }] },
    { id: `${id}_grow`, event: 'kill', chain: { maxDepth: 4 }, actions: [
      { op: 'counter', key: 'growth', value: 1, cap: { param: 'growth_cap' } },
      { op: 'apply_status', key: growthKey, origin: 'owner', value: { param: 'growth_bonus' }, duration: 900 },
    ] },
  ];
}

function trait(bd) {
  const rules = [
    { id: `${bd.id}_cast`, event: 'cast', actions: bd.cast },
    ...growthRules(bd),
    ...bd.awaken.map((rule, i) => ({ ...rule, id: `${bd.id}_awaken_${i + 1}`, conditions: [stage('awaken_at'), ...(rule.conditions || [])] })),
    ...bd.ultimate.map((rule, i) => ({ ...rule, id: `${bd.id}_ultimate_${i + 1}`, conditions: [stage('ultimate_at'), ...(rule.conditions || [])] })),
  ];
  return { id: bd.trait, name: bd.name, description: bd.traitText, params: { ...bd.params, ...GROWTH, ...bd.growth }, ...(bd.sheet ? { sheet: bd.sheet } : {}), rules };
}

function statuses(bd) {
  const s = bd.statuses;
  return [
    { id: `${bd.id}_charge`, name: s.charge[0], description: s.charge[1], category: 'buff', stacking: 'stack', maxStacks: s.charge[2],
      effects: s.charge[3] || [{ type: 'damage_dealt', scale: 1 }] },
    { id: `${bd.id}_surge`, name: s.surge[0], description: s.surge[1], category: 'buff', stacking: 'refresh', effects: s.surge[2] },
    { id: `${bd.id}_growth`, name: s.growth[0], description: s.growth[1], category: 'buff', stacking: 'stack', maxStacks: 40,
      effects: [{ type: 'damage_dealt', scale: 1 }] },
  ];
}

const speedSurge = (dealt = 0.8, extra = []) => [{ type: 'action_speed', scale: 1 }, { type: 'damage_dealt', scale: dealt }, ...extra];
const MELEE_P = ['physical', 'melee'];

export const GROWTH_BDS = [
  {
    id: 'rage_cleave', trait: 'create_rage_cleave', name: '怒焰劈斩', melee: true, element: 'physical',
    description: '近战劈斩。命中积攒怒意，怒意满溢时进入狂暴并放出冲击波；击杀越多，劈斩越带出烈焰余波。',
    traitText: '向前方劈斩，对 radius 米内敌人造成 damage 点物理伤害（技能威力更高时取技能威力）。每命中 charge_every 次获得一层怒意（每层伤害 +charge_bonus%）；每获得 surge_every 层怒意进入狂暴（攻速 +surge_power%）并在命中点放出冲击波。本层击杀成长：每次击杀伤害 +1%（上限 40）；15 杀觉醒：劈斩附带烈焰余波；40 杀极境：再追加一圈烈焰旋斩。',
    params: { damage: 30, radius: 2.6, cooldown: 0.45, charge_every: 3, charge_bonus: 4, surge_every: 8, surge_power: 35 },
    growth: {},
    feed: { event: 'hit' },
    cast: [area('physical', MELEE_P, { param: 'radius' }, 1)],
    burst: [area('physical', ['physical', 'melee', 'shockwave'], 4.5, 2)],
    awaken: [{ event: 'cast', actions: [area('fire', ['fire', 'melee'], 3.6, 0.6)] }],
    ultimate: [{ event: 'cast', actions: [area('fire', ['fire', 'melee'], 5.4, 0.9)] }],
    statuses: {
      charge: ['怒意', '怒焰劈斩：每层造成伤害提高。', 10],
      surge: ['狂暴', '怒焰劈斩：攻速与伤害大幅提高。', speedSurge()],
      growth: ['战意', '怒焰劈斩：本层每次击杀伤害 +1%，最多 40 层。'],
    },
    weapon: { id: 'wrathfire_axe', name: '怒焰战斧', tags: ['物理', '近战', '斧'], base: 'flat_physical', legendary: 'area_more', icon: 'equipment/sundering_maul.png', hue: 0.02 },
    icon: { from: 'skill/player_slash.png', hue: 0.02 },
    stages: ['蓄怒：命中 3 次得 1 层怒意（+4% 伤害，最多 10 层）', '狂暴：每 8 层怒意放出冲击波，攻速 +35%', '觉醒 15 杀：劈斩附带烈焰余波', '极境 40 杀：追加烈焰旋斩'],
    gear: {
      weapon: ['flat_physical', 'inc_physical', 'more_physical', 'area_more', 'area_cast_speed', 'leech_life_physical'],
      helmet: ['life_base', 'life_increased', 'area_size', 'inc_physical', 'life_on_hit', 'armour'],
      chest: ['life_base', 'life_increased', 'armour', 'life_regen_percent', 'block_chance', 'leech_life_all'],
      gloves: ['flat_physical', 'flat_fire', 'inc_fire', 'area_damage', 'life_on_kill', 'armour'],
      boots: ['life_base', 'full_life_move', 'armour', 'life_increased', 'low_life_damage', 'inc_physical'],
    },
    aura: 'aura_physical_ring',
  },
  {
    id: 'thunder_strike', trait: 'create_thunder_strike', name: '雷击三连', melee: true, element: 'lightning',
    description: '近战雷击。每第三击落下雷霆；感电敌人被击中积攒静电，静电满溢化为雷神之怒。',
    traitText: '向前方雷击，对 radius 米内敌人造成 damage 点闪电伤害并感电。每第 3 击在命中点落下一道 combo_radius 米的雷霆（2.5 倍伤害）。命中感电敌人每 charge_every 次获得一层静电（伤害 +charge_bonus%）；每 surge_every 层静电化为雷神之怒（攻速 +surge_power%，暴击率提高）并引发雷爆。本层击杀成长：15 杀觉醒每击追加连锁落雷，40 杀极境第三击化为雷暴。',
    params: { damage: 26, radius: 2.2, cooldown: 0.4, combo_radius: 3.6, charge_every: 3, charge_bonus: 5, surge_every: 8, surge_power: 30 },
    growth: {},
    feed: { event: 'hit', conditions: [status('shock')] },
    cast: [area('lightning', ['lightning', 'melee'], { param: 'radius' }, 1)],
    extraRules: [{ id: 'thunder_strike_combo', event: 'cast', actions: [
      { op: 'counter', key: 'combo', value: 1, threshold: 3, then: [area('lightning', ['lightning', 'melee', 'thunder'], { param: 'combo_radius' }, 2.5)] }] }],
    burst: [area('lightning', ['lightning', 'spell'], 5, 2.2)],
    awaken: [{ event: 'hit', chain: { maxDepth: 1 }, conditions: [{ op: 'chance', value: 35 }], actions: [area('lightning', ['lightning', 'spell'], 2.4, 0.6)] }],
    ultimate: [{ event: 'cast', actions: [{ op: 'counter', key: 'storm', value: 1, threshold: 3, then: [area('lightning', ['lightning', 'spell'], 6, 2)] }] }],
    statuses: {
      charge: ['静电', '雷击三连：每层造成伤害提高。', 8],
      surge: ['雷神之怒', '雷击三连：攻速、伤害与暴击率提高。', speedSurge(0.7, [{ type: 'critical_chance', scale: 0.5 }])],
      growth: ['雷魄', '雷击三连：本层每次击杀伤害 +1%，最多 40 层。'],
    },
    extraTraits: ['shock'],
    weapon: { id: 'stormbreaker_hammer', name: '碎雷战锤', tags: ['闪电', '近战', '锤'], base: 'flat_lightning', legendary: 'more_lightning', icon: 'equipment/thunderheart_scepter.png', hue: 0.55 },
    icon: { from: 'skill/lightning_nova.png', hue: 0.08 },
    stages: ['三连：每第 3 击落雷（2.5 倍伤害）', '静电：命中感电敌人叠层，满 8 层化为雷神之怒', '觉醒 15 杀：命中 35% 追加连锁落雷', '极境 40 杀：每第 3 击引发雷暴'],
    gear: {
      weapon: ['flat_lightning', 'inc_lightning', 'more_lightning', 'shock_effect', 'area_cast_speed', 'lightning_crit'],
      helmet: ['life_base', 'life_increased', 'shock_duration', 'inc_lightning', 'life_on_hit', 'evasion'],
      chest: ['life_base', 'life_increased', 'evasion', 'shield_base', 'leech_life_elemental', 'life_regen_percent'],
      gloves: ['flat_lightning', 'shock_chance', 'shock_per_layer', 'area_damage', 'life_on_kill', 'evasion'],
      boots: ['life_base', 'full_life_move', 'evasion', 'life_increased', 'shock_max_stacks', 'inc_elemental'],
    },
    aura: 'aura_lightning_ring',
  },
  {
    id: 'ground_slam', trait: 'create_ground_slam', name: '震地猛击', melee: true, element: 'physical',
    description: '沉重的近战猛击。击杀震出放射地裂，地脉之力满溢时山崩地裂。',
    traitText: '重击地面，对 radius 米内敌人造成 damage 点物理伤害。每击杀 charge_every 名敌人获得一层地脉（伤害 +charge_bonus%）并从尸体处震出 fissures 道放射地裂；每 surge_every 层地脉引发山崩（伤害与移速提高）与大范围余震。本层击杀成长：15 杀觉醒每次猛击震出放射地裂，40 杀极境追加余震。',
    params: { damage: 40, radius: 3.0, cooldown: 0.8, fissures: 6, charge_every: 2, charge_bonus: 6, surge_every: 6, surge_power: 25 },
    growth: {},
    feed: { event: 'kill' },
    cast: [area('physical', ['physical', 'melee', 'slam'], { param: 'radius' }, 1)],
    burst: [area('physical', ['physical', 'melee', 'quake'], 6, 3)],
    extraFeed: [{ op: 'emit', kind: 'fissure', origin: 'event', layout: 'radial', element: 'physical', tags: ['physical', 'melee', 'projectile'], count: { param: 'fissures' }, speed: 14, lifetime: 0.55, radius: 0.7, pierce: 20, damage: amount(0.6) }],
    awaken: [{ event: 'cast', actions: [{ op: 'emit', kind: 'fissure', origin: 'owner', layout: 'radial', element: 'physical', tags: ['physical', 'melee', 'projectile'], count: 4, speed: 14, lifetime: 0.6, radius: 0.7, pierce: 20, damage: amount(0.5) }] }],
    ultimate: [{ event: 'cast', actions: [area('physical', ['physical', 'melee', 'quake'], 4.8, 1)] }],
    statuses: {
      charge: ['地脉', '震地猛击：每层造成伤害提高。', 6],
      surge: ['山崩', '震地猛击：伤害与移动速度提高。', [{ type: 'damage_dealt', scale: 1.2 }, { type: 'move_speed', scale: 0.8 }]],
      growth: ['撼地', '震地猛击：本层每次击杀伤害 +1%，最多 40 层。'],
    },
    weapon: { id: 'earthshaker_maul', name: '撼地巨槌', tags: ['物理', '近战', '重锤'], base: 'flat_physical', legendary: 'area_size_more', icon: 'equipment/sundering_maul.png', hue: 0.1 },
    icon: { from: 'skill/earth_wave.png', hue: 0.06 },
    stages: ['地脉：每 2 杀叠一层并震出 6 道地裂', '山崩：每 6 层地脉引发大范围余震', '觉醒 15 杀：每次猛击震出 4 道地裂', '极境 40 杀：每次猛击追加余震'],
    gear: {
      weapon: ['flat_physical', 'inc_physical', 'more_physical', 'area_size_more', 'area_damage', 'life_on_kill'],
      helmet: ['life_base', 'life_increased', 'area_size', 'armour', 'life_on_hit', 'inc_physical'],
      chest: ['life_base', 'life_increased', 'armour', 'life_more', 'block_chance', 'life_regen_percent'],
      gloves: ['flat_physical', 'area_more', 'area_damage', 'proj_damage', 'life_on_kill', 'armour'],
      boots: ['life_base', 'full_life_move', 'armour', 'life_increased', 'inc_physical', 'life_regen_flat'],
    },
    aura: 'aura_armour_ring',
  },
  {
    id: 'blade_dance', trait: 'create_blade_dance', name: '刃舞', melee: true, element: 'physical',
    description: '召出环绕自身的飞刃，靠近敌人切割。刃势满溢掀起剑刃风暴，击杀越多飞刃越多。',
    traitText: '放出 count 柄环绕自身飞行的刀刃，每柄造成 damage 点物理伤害。本层每 10 次击杀额外多 1 柄（最多 +4）。刀刃每命中 charge_every 次获得一层刃势（伤害 +charge_bonus%）；每 surge_every 层刃势掀起剑刃风暴（攻速 +surge_power%）并向四周甩出 8 柄飞刃。15 杀觉醒：命中追加 30% 伤害的切割；40 杀极境：击杀时从尸体甩出飞刃。',
    params: { damage: 20, count: 3, cooldown: 0.9, charge_every: 6, charge_bonus: 3, surge_every: 10, surge_power: 35 },
    growth: {},
    feed: { event: 'hit' },
    cast: [{ op: 'emit', kind: 'dance_blade', origin: 'owner', layout: 'radial', element: 'physical', tags: ['physical', 'melee', 'projectile'],
      count: { add: [{ param: 'count' }, { min: [4, { div: [{ state: 'growth' }, 10] }] }] }, speed: 9, lifetime: 2.6, radius: 0.6, pierce: 99, damage: amount() }],
    burst: [{ op: 'emit', kind: 'dance_blade', origin: 'owner', layout: 'radial', element: 'physical', tags: ['physical', 'melee', 'projectile'], count: 8, speed: 12, lifetime: 1.4, radius: 0.6, pierce: 99, damage: amount() }],
    awaken: [{ event: 'hit', chain: { maxDepth: 1 }, actions: [{ op: 'damage_target', element: 'physical', tags: ['physical', 'melee'], amount: { mul: [{ event: 'amount' }, 0.3] } }] }],
    ultimate: [{ event: 'kill', chain: { maxDepth: 2 }, actions: [{ op: 'emit', kind: 'dance_blade', origin: 'event', layout: 'radial', element: 'physical', tags: ['physical', 'melee', 'projectile'], count: 2, speed: 12, lifetime: 1, radius: 0.6, pierce: 99, damage: amount(0.6) }] }],
    statuses: {
      charge: ['刃势', '刃舞：每层造成伤害提高。', 12],
      surge: ['剑刃风暴', '刃舞：攻速与伤害提高。', speedSurge(0.6)],
      growth: ['刃心', '刃舞：本层每次击杀伤害 +1%，最多 40 层；每 10 层多 1 柄飞刃。'],
    },
    extraTraits: ['proj_orbit'],
    weapon: { id: 'twin_moon_blades', name: '双月刃', tags: ['物理', '近战', '双刃'], base: 'flat_physical', legendary: 'proj_more', icon: 'equipment/crescent_saber.png', hue: 0.5 },
    icon: { from: 'skill/whirlwind.png', hue: 0.85 },
    stages: ['环刃：3 柄飞刃环绕切割，每 10 杀多 1 柄', '剑刃风暴：每 10 层刃势甩出 8 柄飞刃', '觉醒 15 杀：命中追加 30% 切割', '极境 40 杀：击杀时从尸体甩出飞刃'],
    gear: {
      weapon: ['flat_physical', 'inc_physical', 'proj_more', 'proj_damage', 'area_cast_speed', 'leech_life_physical'],
      helmet: ['life_base', 'evasion', 'proj_damage', 'inc_physical', 'life_on_hit', 'life_increased'],
      chest: ['life_base', 'life_increased', 'evasion', 'evasion_increased', 'leech_life_all', 'life_regen_percent'],
      gloves: ['flat_physical', 'proj_damage', 'more_physical', 'proj_crit', 'life_on_kill', 'evasion'],
      boots: ['life_base', 'full_life_move', 'evasion', 'life_increased', 'inc_physical', 'evade_chance'],
    },
    aura: 'aura_evasion_ring',
  },
  {
    id: 'shield_slam', trait: 'create_shield_slam', name: '盾击', melee: true, element: 'physical',
    description: '以盾猛击。命中堆叠壁垒减伤，壁垒满溢化为不动如山并震荡四周——越打越硬。',
    traitText: '以盾猛击 radius 米内敌人，造成 damage 点物理伤害。每命中 charge_every 次获得一层壁垒（承受伤害 -charge_bonus%）；每 surge_every 层壁垒化为不动如山（承受伤害大幅降低、伤害提高）并震荡周围。本层击杀成长：15 杀觉醒猛击附带一圈盾震，40 杀极境命中时连环余震。',
    params: { damage: 26, radius: 2.4, cooldown: 0.5, charge_every: 2, charge_bonus: 4, surge_every: 10, surge_power: 30 },
    growth: {},
    feed: { event: 'hit' },
    cast: [area('physical', ['physical', 'melee', 'shield'], { param: 'radius' }, 1)],
    burst: [area('physical', ['physical', 'melee', 'shockwave'], 5, 3)],
    awaken: [{ event: 'cast', actions: [area('physical', ['physical', 'melee', 'shockwave'], 4, 0.8)] }],
    ultimate: [{ event: 'hit', chain: { maxDepth: 1 }, actions: [{ op: 'counter', key: 'tremor', value: 1, threshold: 5, then: [area('physical', ['physical', 'melee', 'shockwave'], 3, 1.2)] }] }],
    statuses: {
      charge: ['壁垒', '盾击：每层承受伤害降低。', 10, [{ type: 'damage_taken', scale: -1 }]],
      surge: ['不动如山', '盾击：承受伤害大幅降低，造成伤害提高。', [{ type: 'damage_taken', scale: -1 }, { type: 'damage_dealt', scale: 1.3 }]],
      growth: ['坚守', '盾击：本层每次击杀伤害 +1%，最多 40 层。'],
    },
    weapon: { id: 'bulwark_mace', name: '壁垒钉锤', tags: ['物理', '近战', '盾锤'], base: 'flat_physical', legendary: 'more_physical', icon: 'equipment/sundering_maul.png', hue: 0.6 },
    icon: { from: 'skill/taunt.png', hue: 0.1 },
    stages: ['壁垒：每 2 次命中叠一层（-4% 承伤，最多 10 层）', '不动如山：每 10 层壁垒震荡四周', '觉醒 15 杀：猛击附带一圈盾震', '极境 40 杀：每 5 次命中连环余震'],
    gear: {
      weapon: ['flat_physical', 'inc_physical', 'more_physical', 'area_damage', 'block_chance', 'life_on_hit'],
      helmet: ['life_base', 'life_increased', 'armour', 'block_chance', 'life_on_hit', 'block_life'],
      chest: ['life_base', 'life_increased', 'armour', 'life_more', 'block_reduction', 'life_regen_percent'],
      gloves: ['flat_physical', 'block_buff_damage', 'area_damage', 'armour', 'life_on_kill', 'block_counter'],
      boots: ['life_base', 'full_life_move', 'armour', 'life_increased', 'block_recovery', 'life_regen_flat'],
    },
    aura: 'aura_armour_ring',
  },
  {
    id: 'meteor', trait: 'create_meteor', name: '天火陨星', melee: false, element: 'fire',
    description: '召下陨星轰击落点。击杀积攒星火，星火满溢时陨火向四周迸裂；击杀越多，陨星越多。',
    traitText: '在落点召下陨星，对 radius 米内敌人造成 damage 点火焰伤害并点燃。每击杀 charge_every 名敌人获得一层星火（伤害 +charge_bonus%）；每 surge_every 层星火进入星陨（施法速度 +surge_power%）并从尸体向四周迸裂 8 枚火球。15 杀觉醒：每次施法额外射出 3 枚火球；40 杀极境：每 5 次命中引发余烬爆炸。',
    params: { damage: 44, radius: 3.0, cooldown: 0.9, charge_every: 2, charge_bonus: 5, surge_every: 8, surge_power: 30 },
    growth: {},
    feed: { event: 'kill' },
    cast: [area('fire', ['fire', 'spell', 'meteor'], { param: 'radius' }, 1)],
    burst: [{ op: 'emit', kind: 'fireball', origin: 'event', layout: 'radial', element: 'fire', tags: ['fire', 'spell', 'projectile'], count: 8, speed: 16, lifetime: 0.6, radius: 0.4, damage: amount(0.8) }],
    awaken: [{ event: 'cast', actions: [{ op: 'emit', kind: 'fireball', origin: 'owner', element: 'fire', tags: ['fire', 'spell', 'projectile'], count: 3, spread: 30, speed: 20, lifetime: 0.9, radius: 0.4, damage: amount(0.5) }] }],
    ultimate: [{ event: 'hit', chain: { maxDepth: 1 }, actions: [{ op: 'counter', key: 'ember', value: 1, threshold: 5, then: [area('fire', ['fire', 'spell'], 2.6, 1)] }] }],
    statuses: {
      charge: ['星火', '天火陨星：每层造成伤害提高。', 8],
      surge: ['星陨', '天火陨星：施法速度与伤害提高。', speedSurge()],
      growth: ['焚天', '天火陨星：本层每次击杀伤害 +1%，最多 40 层。'],
    },
    extraTraits: ['ignite'],
    weapon: { id: 'starfall_staff', name: '陨星法杖', tags: ['火焰', '法术', '法杖'], base: 'flat_fire', legendary: 'more_fire', icon: 'equipment/emberheart_staff.png', hue: 0.95 },
    icon: { from: 'skill/flame_burst.png', hue: 0.93 },
    stages: ['星火：每 2 杀叠一层（+5% 伤害，最多 8 层）', '星陨：每 8 层星火从尸体迸裂 8 枚火球', '觉醒 15 杀：每次施法额外 3 枚火球', '极境 40 杀：每 5 次命中余烬爆炸'],
    gear: {
      weapon: ['flat_fire', 'inc_fire', 'more_fire', 'area_more', 'area_cast_speed', 'ignite_chance'],
      helmet: ['life_base', 'shield_base', 'area_size', 'inc_fire', 'life_on_hit', 'life_increased'],
      chest: ['life_base', 'life_increased', 'shield_base', 'shield_increased', 'life_regen_percent', 'fire_resistance'],
      gloves: ['flat_fire', 'ignite_damage', 'area_damage', 'proj_damage', 'life_on_kill', 'shield_base'],
      boots: ['life_base', 'full_life_move', 'shield_base', 'life_increased', 'inc_elemental', 'ignite_duration'],
    },
    aura: 'aura_fire_ring',
  },
  {
    id: 'frost_ring', trait: 'create_frost_ring', name: '霜环', melee: false, element: 'frost',
    description: '以自身为中心爆开寒霜之环。击杀冰缓敌人积攒霜寒，满溢时冰封新星席卷四周。',
    traitText: '以自身为中心爆开寒霜，对 radius 米内敌人造成 damage 点冰霜伤害并冰缓。每击杀 charge_every 名冰缓敌人获得一层霜寒（伤害 +charge_bonus%）；每 surge_every 层霜寒引发冰封新星（大范围 3 倍伤害，施法速度提高）。15 杀觉醒：每次施法向四周射出 6 枚冰锥；40 杀极境：击杀冰缓敌人时原地碎冰爆炸。',
    params: { damage: 24, radius: 3.6, cooldown: 0.7, charge_every: 2, charge_bonus: 5, surge_every: 8, surge_power: 25 },
    growth: {},
    feed: { event: 'kill', conditions: [status('chill')] },
    cast: [area('frost', ['cold', 'spell', 'nova'], { param: 'radius' }, 1)],
    burst: [area('frost', ['cold', 'spell', 'nova'], 7, 3)],
    awaken: [{ event: 'cast', actions: [{ op: 'emit', kind: 'ice_lance', origin: 'owner', layout: 'radial', element: 'frost', tags: ['cold', 'spell', 'projectile'], count: 6, speed: 22, lifetime: 0.8, radius: 0.3, damage: amount(0.5) }] }],
    ultimate: [{ event: 'kill', chain: { maxDepth: 2 }, conditions: [status('chill')], actions: [area('frost', ['cold', 'spell'], 3, 1)] }],
    statuses: {
      charge: ['霜寒', '霜环：每层造成伤害提高。', 10],
      surge: ['冰封', '霜环：施法速度与伤害提高。', speedSurge()],
      growth: ['凛冬', '霜环：本层每次击杀伤害 +1%，最多 40 层。'],
    },
    extraTraits: ['chill'],
    selfArea: true,
    weapon: { id: 'rimeheart_wand', name: '凛心法环', tags: ['冰霜', '法术', '法环'], base: 'flat_frost', legendary: 'more_frost', icon: 'equipment/frostthorn_staff.png', hue: 0.08 },
    icon: { from: 'skill/aura_frost.png', hue: 0.05 },
    stages: ['霜寒：每击杀 2 名冰缓敌人叠一层', '冰封新星：每 8 层霜寒大范围 3 倍伤害', '觉醒 15 杀：每次施法射出 6 枚冰锥', '极境 40 杀：冰缓敌人死亡时碎冰爆炸'],
    gear: {
      weapon: ['flat_frost', 'inc_frost', 'more_frost', 'area_more', 'area_cast_speed', 'chill_effect'],
      helmet: ['life_base', 'shield_base', 'area_size', 'inc_frost', 'life_on_hit', 'life_increased'],
      chest: ['life_base', 'life_increased', 'shield_base', 'shield_increased', 'life_regen_percent', 'frost_resistance'],
      gloves: ['flat_frost', 'chill_duration', 'area_damage', 'proj_damage', 'life_on_kill', 'shield_base'],
      boots: ['life_base', 'full_life_move', 'shield_base', 'life_increased', 'inc_elemental', 'freeze_buildup'],
    },
    aura: 'aura_frost_ring',
  },
  {
    id: 'viper_knives', trait: 'create_viper_knives', name: '蝰蛇飞刃', melee: false, element: 'poison',
    description: '扇形甩出淬毒飞刀。中毒敌人死亡积攒毒蚀，满溢时万蛇齐出；击杀越多，飞刀越多。',
    traitText: '向前方扇形甩出 count 柄飞刀，每柄造成 damage 点毒素伤害并施加中毒（命中伤害的 poison_ratio 倍每秒）。本层每 8 次击杀多 1 柄（最多 +5）。每击杀 charge_every 名中毒敌人获得一层毒蚀（伤害 +charge_bonus%）；每 surge_every 层毒蚀进入万蛇（攻速 +surge_power%）并向四周甩出 10 柄飞刀。15 杀觉醒：中毒敌人死亡时毒爆；40 杀极境：命中 25% 从目标分裂 2 柄飞刀。',
    params: { damage: 12, count: 3, cooldown: 0.35, poison_ratio: 0.4, poison_duration: 3, charge_every: 3, charge_bonus: 4, surge_every: 10, surge_power: 30 },
    growth: {},
    feed: { event: 'kill', conditions: [status('poison')] },
    cast: [{ op: 'emit', kind: 'viper_knife', origin: 'owner', element: 'poison', tags: ['poison', 'physical', 'projectile', 'attack'],
      count: { add: [{ param: 'count' }, { min: [5, { div: [{ state: 'growth' }, 8] }] }] }, spread: 34, speed: 26, lifetime: 0.7, radius: 0.28, damage: amount() }],
    extraRules: [{ id: 'viper_knives_poison', event: 'hit', chain: { maxDepth: 3 }, conditions: [{ op: 'tag', tag: 'poison' }],
      actions: [{ op: 'apply_status', key: 'poison', value: { mul: [{ event: 'amount' }, { param: 'poison_ratio' }] }, duration: { param: 'poison_duration' } }] }],
    burst: [{ op: 'emit', kind: 'viper_knife', origin: 'owner', layout: 'radial', element: 'poison', tags: ['poison', 'projectile', 'attack'], count: 10, speed: 24, lifetime: 0.8, radius: 0.28, damage: amount() }],
    awaken: [{ event: 'kill', chain: { maxDepth: 2 }, conditions: [status('poison')], actions: [area('poison', ['poison', 'attack'], 2.6, 1)] }],
    ultimate: [{ event: 'hit', chain: { maxDepth: 1 }, conditions: [{ op: 'chance', value: 25 }], actions: [{ op: 'emit', kind: 'viper_knife', origin: 'event', element: 'poison', tags: ['poison', 'projectile', 'attack'], count: 2, spread: 60, speed: 22, lifetime: 0.5, radius: 0.28, damage: amount(0.6) }] }],
    statuses: {
      charge: ['毒蚀', '蝰蛇飞刃：每层造成伤害提高。', 10],
      surge: ['万蛇', '蝰蛇飞刃：攻速与伤害提高。', speedSurge(0.6)],
      growth: ['蛇噬', '蝰蛇飞刃：本层每次击杀伤害 +1%，最多 40 层；每 8 层多 1 柄飞刀。'],
    },
    weapon: { id: 'viperfang_knives', name: '蝰牙飞刀', tags: ['毒素', '投掷', '飞刀'], base: 'flat_poison', legendary: 'poison_more', icon: 'equipment/venomglass_flask.png', hue: 0.3 },
    icon: { from: 'skill/poison_flask.png', hue: 0.2 },
    stages: ['扇刃：3 柄淬毒飞刀，每 8 杀多 1 柄', '万蛇：每 10 层毒蚀甩出 10 柄飞刀', '觉醒 15 杀：中毒敌人死亡毒爆', '极境 40 杀：命中 25% 分裂飞刀'],
    gear: {
      weapon: ['flat_poison', 'poison_increased', 'poison_more', 'proj_damage', 'proj_count', 'poison_duration'],
      helmet: ['life_base', 'evasion', 'proj_damage', 'poison_per_layer', 'life_on_hit', 'life_increased'],
      chest: ['life_base', 'life_increased', 'evasion', 'evasion_increased', 'life_regen_percent', 'poison_resistance'],
      gloves: ['flat_poison', 'poison_chance', 'proj_more', 'poison_base', 'life_on_kill', 'evasion'],
      boots: ['life_base', 'full_life_move', 'evasion', 'life_increased', 'poison_max_stacks', 'evade_chance'],
    },
    aura: 'aura_poison_ring',
  },
  {
    id: 'soul_reap', trait: 'create_soul_reap', name: '灵魂收割', melee: true, element: 'void',
    description: '挥镰收割。击杀攫取灵魂，魂火满溢化为死神降临；觉醒后亡魂会为你作战。',
    traitText: '挥镰横扫 radius 米内敌人，造成 damage 点虚空伤害。每击杀 charge_every 名敌人获得一层魂火（伤害 +charge_bonus%）；每 surge_every 层魂火化为死神降临（攻速与移速提高）并在击杀点掀起灵魂风暴。15 杀觉醒：击杀时唤出亡魂（最多 3 只）追击敌人；40 杀极境：每次挥镰附带死神之握。',
    params: { damage: 30, radius: 3.0, cooldown: 0.5, wraith_damage: 18, charge_every: 1, charge_bonus: 2, surge_every: 15, surge_power: 30 },
    growth: {},
    feed: { event: 'kill' },
    cast: [area('void', ['void', 'melee', 'reap'], { param: 'radius' }, 1)],
    burst: [area('void', ['void', 'spell', 'soul_storm'], 7, 3.5)],
    awaken: [{ event: 'kill', chain: { maxDepth: 2 }, actions: [{ op: 'summon', kind: 'spirit', event: 'soul_wraith_attack', tags: ['summon', 'melee'], duration: 8, interval: 0.7, radius: 9, cap: 3 }] }],
    ultimate: [{ event: 'cast', actions: [area('void', ['void', 'melee'], 5, 0.6)] }],
    extraRules: [{ id: 'soul_reap_wraith', event: 'soul_wraith_attack', actions: [{ op: 'damage_target', element: 'void', tags: ['void', 'melee'], amount: amount(1, 'wraith_damage') }] }],
    statuses: {
      charge: ['魂火', '灵魂收割：每层造成伤害提高。', 20],
      surge: ['死神降临', '灵魂收割：攻速、移速与伤害提高。', speedSurge(0.8, [{ type: 'move_speed', scale: 0.6 }])],
      growth: ['噬魂', '灵魂收割：本层每次击杀伤害 +1%，最多 40 层。'],
    },
    weapon: { id: 'soulreaver_scythe', name: '噬魂长镰', tags: ['虚空', '近战', '长镰'], base: 'flat_void', legendary: 'more_void', icon: 'equipment/crescent_saber.png', hue: 0.75 },
    icon: { from: 'skill/sacrifice.png', hue: 0.0 },
    stages: ['魂火：每杀叠一层（+2% 伤害，最多 20 层）', '死神降临：每 15 层魂火掀起灵魂风暴', '觉醒 15 杀：击杀唤出亡魂作战', '极境 40 杀：每次挥镰附带死神之握'],
    gear: {
      weapon: ['flat_void', 'inc_void', 'more_void', 'area_more', 'area_cast_speed', 'leech_life_all'],
      helmet: ['life_base', 'life_increased', 'area_size', 'inc_void', 'life_on_hit', 'shield_base'],
      chest: ['life_base', 'life_increased', 'shield_base', 'life_more', 'leech_life_all', 'life_regen_percent'],
      gloves: ['flat_void', 'void_area', 'area_damage', 'minion_damage', 'life_on_kill', 'shield_base'],
      boots: ['life_base', 'full_life_move', 'shield_base', 'life_increased', 'void_vs_low', 'life_regen_flat'],
    },
    aura: 'aura_void_ring',
  },
  {
    id: 'ball_lightning', trait: 'create_ball_lightning', name: '球状闪电', melee: false, element: 'lightning',
    description: '缓慢推进、贯穿敌群的雷球。命中感电敌人积攒电荷，满溢时雷球四散；觉醒后雷球放出电弧。',
    traitText: '向前方放出缓慢推进的雷球，贯穿沿途敌人，造成 damage 点闪电伤害并感电。每命中 charge_every 次感电敌人获得一层电荷（伤害 +charge_bonus%）；每 surge_every 层电荷进入雷暴（施法速度 +surge_power%）并向四周放出 6 颗雷球。15 杀觉醒：雷球命中时放出电弧；40 杀极境：每次施放 2 颗雷球。',
    params: { damage: 18, count: 1, cooldown: 0.6, charge_every: 4, charge_bonus: 4, surge_every: 10, surge_power: 25 },
    growth: {},
    feed: { event: 'hit', conditions: [status('shock')] },
    cast: [{ op: 'emit', kind: 'ball_lightning', origin: 'owner', element: 'lightning', tags: ['lightning', 'spell', 'projectile'],
      count: { add: [{ param: 'count' }, { min: [1, { div: [{ state: 'growth' }, { param: 'ultimate_at' }] }] }] }, spread: 18, speed: 7, lifetime: 2.4, radius: 0.8, pierce: 99, damage: amount() }],
    burst: [{ op: 'emit', kind: 'ball_lightning', origin: 'owner', layout: 'radial', element: 'lightning', tags: ['lightning', 'spell', 'projectile'], count: 6, speed: 8, lifetime: 1.6, radius: 0.8, pierce: 99, damage: amount() }],
    awaken: [{ event: 'hit', chain: { maxDepth: 1 }, actions: [area('lightning', ['lightning', 'spell', 'arc'], 2.2, 0.5)] }],
    ultimate: [],
    statuses: {
      charge: ['电荷', '球状闪电：每层造成伤害提高。', 10],
      surge: ['雷暴', '球状闪电：施法速度与伤害提高。', speedSurge()],
      growth: ['雷心', '球状闪电：本层每次击杀伤害 +1%，最多 40 层。'],
    },
    extraTraits: ['shock'],
    weapon: { id: 'stormorb_scepter', name: '雷珠权杖', tags: ['闪电', '法术', '权杖'], base: 'flat_lightning', legendary: 'shock_effect', icon: 'equipment/thunderheart_scepter.png', hue: 0.15 },
    icon: { from: 'skill/storm_totem.png', hue: 0.6 },
    stages: ['电荷：命中感电敌人 4 次叠一层', '雷暴：每 10 层电荷放出 6 颗雷球', '觉醒 15 杀：雷球命中放出电弧', '极境 40 杀：每次施放 2 颗雷球'],
    gear: {
      weapon: ['flat_lightning', 'inc_lightning', 'more_lightning', 'proj_damage', 'lightning_cast_speed', 'shock_effect'],
      helmet: ['life_base', 'shield_base', 'proj_damage', 'inc_lightning', 'life_on_hit', 'life_increased'],
      chest: ['life_base', 'life_increased', 'shield_base', 'shield_increased', 'life_regen_percent', 'lightning_resistance'],
      gloves: ['flat_lightning', 'shock_chance', 'proj_more', 'shock_per_layer', 'life_on_kill', 'shield_base'],
      boots: ['life_base', 'full_life_move', 'shield_base', 'life_increased', 'inc_elemental', 'shock_duration'],
    },
    aura: 'aura_lightning_ring',
  },
  {
    // 流放之路 · 闪现打击（Flicker Strike）：瞬移到附近的敌人身边攻击，连续施放在敌群中来回闪击。
    id: 'flicker_strike', trait: 'create_flicker_strike', name: '闪现打击', melee: true, element: 'physical', web: true,
    description: '瞬移到附近的敌人身边并攻击，连续施放在敌群中来回闪击。击杀积攒狂怒，狂怒满溢时化为无影。',
    traitText: '瞬移到 range 米内的一名敌人身边（优先瞄准方向、轮换目标），对 radius 米内敌人造成 damage 点物理伤害；附近没有敌人时无法施放。每击杀 charge_every 名敌人获得一层狂怒（伤害与攻速提高，停手后消退）；每 surge_every 层狂怒化为无影（攻速 +surge_power%）并在击杀点爆发残影。本层击杀成长：15 杀觉醒每次闪击附带余震，40 杀极境每第 3 次闪击落下无影斩。',
    params: { damage: 34, radius: 2.1, range: 9, cooldown: 0.32, charge_every: 1, charge_bonus: 3, surge_every: 12, surge_power: 50 },
    growth: { charge_duration: 4 },
    sheet: [{ stat: 'skill.flicker_range', value: { param: 'range' } }],
    feed: { event: 'kill' },
    cast: [area('physical', ['physical', 'melee', 'flicker'], { param: 'radius' }, 1)],
    burst: [area('physical', ['physical', 'melee', 'afterimage'], 4.5, 3)],
    awaken: [{ event: 'cast', actions: [area('physical', ['physical', 'melee', 'aftershock'], 3.4, 0.6)] }],
    ultimate: [{ event: 'cast', actions: [{ op: 'counter', key: 'shadow', value: 1, threshold: 3, then: [area('physical', ['physical', 'melee', 'shadow'], 5, 2)] }] }],
    statuses: {
      charge: ['狂怒', '闪现打击：每层造成伤害与攻速提高，停手后消退。', 10, [{ type: 'damage_dealt', scale: 1 }, { type: 'action_speed', scale: 1 }]],
      surge: ['无影', '闪现打击：攻速与伤害大幅提高。', speedSurge(0.6)],
      growth: ['杀意', '闪现打击：本层每次击杀伤害 +1%，最多 40 层。'],
    },
    weapon: { id: 'phantom_blade', name: '幻影长剑', tags: ['物理', '近战', '剑'], base: 'flat_physical', legendary: 'more_physical', icon: 'equipment/crescent_saber.png', hue: 0.42 },
    icon: { from: 'skill/player_slash.png', hue: 0.5 },
    stages: ['闪击：瞬移到敌人身边攻击，每杀 1 层狂怒（+3% 伤害与攻速）', '无影：每 12 层狂怒爆发残影，攻速 +50%', '觉醒 15 杀：每次闪击附带余震', '极境 40 杀：每第 3 次闪击落下无影斩'],
    gear: {
      weapon: ['flat_physical', 'inc_physical', 'more_physical', 'area_cast_speed', 'leech_life_physical', 'life_on_kill'],
      helmet: ['life_base', 'life_increased', 'evasion', 'inc_physical', 'life_on_hit', 'area_damage'],
      chest: ['life_base', 'life_increased', 'evasion', 'evasion_increased', 'leech_life_all', 'life_regen_percent'],
      gloves: ['flat_physical', 'more_physical', 'area_damage', 'life_on_kill', 'evasion', 'evade_chance'],
      boots: ['life_base', 'full_life_move', 'evasion', 'life_increased', 'inc_physical', 'evade_chance'],
    },
    aura: 'aura_physical_ring',
  },
];

export function growthTrait(bd) {
  const out = trait(bd);
  if (bd.extraFeed) out.rules[1].actions[0].then[0] && out.rules[1].actions[0].then.push(...bd.extraFeed);
  if (bd.extraRules) out.rules.push(...bd.extraRules);
  return out;
}
export const growthStatuses = statuses;

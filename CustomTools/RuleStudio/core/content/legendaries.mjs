// 传奇装备：每件有一条固定的「传奇特性」，改写技能规则或打开新的连锁，足以撑起一个 BD。
// 传奇的其余部分照常随机：基底里另有特性（或主动技能），随机词条照常洗炼。
// 传奇特性只用引擎已有的积木（规则、动作、修正），和普通特性一样可以被测试和组合。
import { compileAffix } from '../content.mjs';
import { gameContent } from './game.mjs';
import { patchList } from './overrides.mjs';

const trig = (on, filter, doList, extra = {}) => ({ on, filter, do: doList, ...extra });

/**
 * { id, name, slot, base, skill?, legend: { text, mods?, rules? }, flavor, theme }
 * slot/base follow items.mjs; `skill` (weapons, some off-slots) is the item's first base line.
 */
export const LEGENDARIES = Object.freeze(patchList('legendaries', [
  // ---------------------------------------------------------------- weapons
  { id: 'pyre_staff', name: '焚城之杖', slot: 'weapon', base: 'war_staff', skill: 'fireball', theme: 'fire',
    legend: { text: '火球命中时 30% 几率从命中处再射出一发火球（每秒最多 6 次）',
      rules: [trig('hit', { skill: 'fireball' }, [{ do: 'cast', skill: '$primary', from: 'event', range: 700 }], { accumulate: { kind: 'chance', pct: 30 }, chain: true, at: 'event', limit: { perSecond: 6 } })] },
    flavor: '城墙烧塌的那一夜，火焰学会了自己找路。' },
  { id: 'rime_wand', name: '霜语', slot: 'weapon', base: 'wand', skill: 'frost_bolt', theme: 'cold',
    legend: { text: '寒冰弹穿透所有敌人，命中必定冰冻，冰冻时间翻倍',
      mods: [{ stat: 'proj.pierce', op: 'base', value: 99 }, { stat: 'chance.freeze', op: 'base', value: 100 }, { stat: 'ailmentDuration.freeze', op: 'inc', value: 100 }] },
    flavor: '它说的每一个字，都会在空气里结霜。' },
  { id: 'thunder_maul', name: '雷鸣之锤', slot: 'weapon', base: 'maul', skill: 'falling_thunder', theme: 'lightning',
    legend: { text: '每 2 秒获得 1 个能量球；能量球上限 +2；崩雷鸣的闪电感电',
      mods: [{ stat: 'charge.max.power', op: 'base', value: 2 }, { stat: 'chance.shock', op: 'base', value: 50 }],
      rules: [trig('tick', {}, [{ do: 'gain', res: 'power', amount: 1 }], { accumulate: { kind: 'periodic', interval: 2 }, at: 'self' })] },
    flavor: '锤落之处，天空记得回响。' },
  { id: 'shadow_fang', name: '影牙', slot: 'weapon', base: 'dagger', skill: 'flicker_strike', theme: 'phys',
    legend: { text: '位移技能没有冷却；每次闪现落地召唤一把灵刃（最多 8 把）',
      mods: [{ stat: 'cooldown', op: 'more', value: -100, tags: ['movement'] }],
      rules: [trig('blink', {}, [{ do: 'summon', minion: 'spirit_blade', at: 'self', count: 1, limit: 8 }], { at: 'self', limit: { perSecond: 4 } })] },
    flavor: '你看见它的时候，它已经在你身后了。' },
  { id: 'gale_cleaver', name: '狂岚', slot: 'weapon', base: 'maul', skill: 'cyclone', theme: 'phys',
    legend: { text: '引导时每 0.5 秒向四周掷出一圈 8 道刀锋',
      rules: [trig('channel', {}, [{ do: 'cast', skill: 'blade_ring', at: 'self' }], { at: 'self', limit: { cooldown: 0.5 } })] },
    flavor: '风暴的中心最安静，安静得只剩刀声。' },
  { id: 'storm_scepter', name: '天穹权杖', slot: 'weapon', base: 'war_staff', skill: 'arc', theme: 'lightning',
    legend: { text: '电弧连锁 +5 次，每次连锁 +1 次分叉',
      mods: [{ stat: 'proj.chain', op: 'base', value: 5, tags: ['chaining'] }, { stat: 'proj.fork', op: 'base', value: 1, tags: ['chaining'] }] },
    flavor: '握住它，就是握住一整片雷雨。' },
  { id: 'eye_of_storm', name: '风暴之眼', slot: 'weapon', base: 'war_staff', skill: 'tornado', theme: 'phys',
    legend: { text: '龙卷风 +1 道；龙卷风命中时 20% 几率在命中处分裂出一道新的龙卷风（每秒最多 3 次）',
      mods: [{ stat: 'zone.count', op: 'base', value: 1, tags: ['vortex'] }],
      rules: [trig('hit', { skill: 'tornado', tags: ['zone'] }, [{ do: 'cast', skill: 'tornado', from: 'event', range: 600 }], { accumulate: { kind: 'chance', pct: 20 }, chain: true, at: 'event', limit: { perSecond: 3 } })] },
    flavor: '风暴的中心最安静——直到它决定换个地方。' },
  // ---------------------------------------------------------------- offhand
  { id: 'glacier_wall', name: '冰川之壁', slot: 'offhand', base: 'tower_shield', theme: 'cold',
    legend: { text: '+12% 格挡几率；格挡时在身边掀起寒潮（冷却 0.4 秒）',
      mods: [{ stat: 'block', op: 'base', value: 12 }],
      rules: [trig('block', {}, [{ do: 'cast', skill: 'glacial_burst', at: 'self' }], { at: 'self', limit: { cooldown: 0.4 } })] },
    flavor: '万年不化的冰，挡得住一切，也冻得住一切。' },
  { id: 'legion_focus', name: '万象', slot: 'offhand', base: 'focus', skill: 'summon_blades', theme: 'phys',
    legend: { text: '召唤物上限 +4；召唤物死亡时爆炸，造成其最大生命 120% 的物理伤害',
      mods: [{ stat: 'minion.limit', op: 'base', value: 4 }],
      rules: [trig('death', {}, [{ do: 'area', at: 'event', radius: 200, damage: { physical: { pool: 'life', of: 'target', mul: 1.2 } }, crit: 0, fx: 'explode' }], { role: 'minion', at: 'event', chain: true })] },
    flavor: '一即是万，万归于一。' },
  // ---------------------------------------------------------------- helmets
  { id: 'mad_crown', name: '狂王之冠', slot: 'helmet', base: 'iron_helm', theme: 'fire',
    legend: { text: '狂怒球上限 +3；击杀时获得狂怒球；每个狂怒球使范围扩大 6%',
      mods: [{ stat: 'charge.max.frenzy', op: 'base', value: 3 }, { stat: 'area', op: 'inc', value: 6, per: { res: 'frenzy' } }],
      rules: [trig('kill', {}, [{ do: 'gain', res: 'frenzy', amount: 1 }], { role: 'owned', at: 'self', limit: { perSecond: 4 } })] },
    flavor: '王冠越重，杀意越轻。' },
  { id: 'thousand_faces', name: '千面', slot: 'helmet', base: 'silk_hood', theme: 'cold',
    legend: { text: '法术额外重复 1 次；施法速度降低 15%（更多）',
      mods: [{ stat: 'repeat', op: 'base', value: 1, tags: ['spell'], notTags: ['triggered'] }, { stat: 'speed', op: 'more', value: -15, tags: ['spell'] }] },
    flavor: '每一张脸都在念同一句咒。' },
  // ---------------------------------------------------------------- chests
  { id: 'undying_plate', name: '不灭之铠', slot: 'chest', base: 'plate', theme: 'phys',
    legend: { text: '生命低于 40% 时被击中，获得护体与猛攻并回复 25% 生命（冷却 8 秒）',
      rules: [trig('struck', { cond: { pct: 'life', lte: 40 } }, [{ do: 'status', on: 'self', status: 'fortify', duration: 6 }, { do: 'status', on: 'self', status: 'onslaught', duration: 6 }, { do: 'heal', pct: 25 }], { at: 'self', limit: { cooldown: 8 } })] },
    flavor: '它被打穿过一百次，每一次都自己合上了。' },
  { id: 'starweave_robe', name: '星辰法袍', slot: 'chest', base: 'robe', theme: 'cold',
    legend: { text: '能量护盾提高 60%；能量护盾全满时法术伤害提高 30%（更多）',
      mods: [{ stat: 'es', op: 'inc', value: 60 }, { stat: 'damage', op: 'more', value: 30, tags: ['spell'], when: { pct: 'es', gte: 99 } }] },
    flavor: '把夜空穿在身上的人，不怕任何一颗星落下。' },
  { id: 'nightveil', name: '夜幕', slot: 'chest', base: 'leather', theme: 'chaos',
    legend: { text: '闪避提高 80%；闪避攻击时向攻击者掷出蝰蛇飞刃',
      mods: [{ stat: 'evasion', op: 'inc', value: 80 }],
      rules: [trig('evade', {}, [{ do: 'cast', skill: 'viper_knives', at: 'target' }], { limit: { perSecond: 3 } })] },
    flavor: '黑暗不躲闪。是你看不见它。' },
  // ---------------------------------------------------------------- gloves
  { id: 'stormcaller', name: '引雷之手', slot: 'gloves', base: 'gauntlets', theme: 'lightning',
    legend: { text: '攻击命中感电敌人时在其头顶落雷（冷却 0.25 秒）',
      rules: [trig('hit', { tags: ['attack'], notTags: ['triggered'], cond: { status: 'shocked', of: 'target' } }, [{ do: 'cast', skill: 'thunder_fall', at: 'target' }], { limit: { cooldown: 0.25 } })] },
    flavor: '举起手，雷就落下。' },
  { id: 'alchemist', name: '炼金之手', slot: 'gloves', base: 'silk_gloves', theme: 'chaos',
    legend: { text: '中毒敌人死亡时，全部毒层以双倍强度扩散到 3 个附近敌人',
      rules: [trig('kill', { cond: { status: 'poisoned', of: 'target' } }, [{ do: 'spread', status: 'poisoned', radius: 300, max: 3, effect: 200 }], { role: 'owned', chain: true, at: 'event' })] },
    flavor: '毒不会消失，只会换个主人，变得更浓。' },
  { id: 'bonebreaker', name: '碎骨', slot: 'gloves', base: 'wraps', theme: 'phys',
    legend: { text: '打击技能额外命中 3 个敌人，并溅射周围 160 范围',
      mods: [{ stat: 'strike.targets', op: 'base', value: 3 }, { stat: 'strike.splash', op: 'base', value: 160 }] },
    flavor: '一拳下去，碎的从来不止一个。' },
  // ---------------------------------------------------------------- boots
  { id: 'windstride', name: '疾风之靴', slot: 'boots', base: 'treads', theme: 'phys',
    legend: { text: '移动速度提高 30%；每移动 4 米向最近的敌人施放你的主技能',
      mods: [{ stat: 'moveSpeed', op: 'inc', value: 30 }],
      rules: [trig('move', {}, [{ do: 'cast', skill: '$primary', at: 'target' }], { accumulate: { kind: 'meter', amount: { event: 'amount' }, threshold: 400 }, at: 'nearest', range: 800 })] },
    flavor: '跑起来，剩下的交给风。' },
  { id: 'frostwalker', name: '霜行者', slot: 'boots', base: 'slippers', theme: 'cold',
    legend: { text: '每移动 1.5 米在脚下掀起寒潮',
      rules: [trig('move', {}, [{ do: 'cast', skill: 'glacial_burst', at: 'self' }], { accumulate: { kind: 'meter', amount: { event: 'amount' }, threshold: 150 }, at: 'self', limit: { perSecond: 4 } })] },
    flavor: '她走过的地方，春天要晚来一个月。' },
  // ---------------------------------------------------------------- belts
  { id: 'warlord_belt', name: '战神腰带', slot: 'belt', base: 'heavy_belt', theme: 'fire',
    legend: { text: '击杀获得 3 点杀意（最多 30，脱战消退）；每点杀意使伤害提高 2%（更多）',
      mods: [{ stat: 'damage', op: 'more', value: 2, per: { res: 'rage' } }],
      rules: [trig('kill', {}, [{ do: 'gain', res: 'rage', amount: 3 }], { role: 'owned', at: 'self' })] },
    flavor: '杀得越多，手越稳。' },
  { id: 'iron_chain', name: '铁链', slot: 'belt', base: 'chain_belt', theme: 'phys',
    legend: { text: '被击中时获得耐力球；每个耐力球使护甲提高 25%，受到伤害降低 3%',
      mods: [{ stat: 'armour', op: 'inc', value: 25, per: { res: 'endurance' } }, { stat: 'damageTaken', op: 'more', value: -3, per: { res: 'endurance' } }],
      rules: [trig('struck', {}, [{ do: 'gain', res: 'endurance', amount: 1 }], { at: 'self', limit: { cooldown: 0.5 } })] },
    flavor: '锁住的不是身体，是退路。' },
  // ---------------------------------------------------------------- amulets
  { id: 'heart_of_winter', name: '永冬之心', slot: 'amulet', base: 'onyx_amulet', theme: 'cold',
    legend: { text: '击碎冰冻的敌人时在原地掀起寒潮，寒潮必定冰冻（首领只冻一瞬）',
      mods: [{ stat: 'chance.freeze', op: 'base', value: 100, tags: ['triggered', 'cold'] }],
      rules: [trig('shatter', {}, [{ do: 'cast', skill: 'glacial_burst', from: 'event', range: 400, needTarget: false }], { role: 'owned', chain: true, at: 'event', limit: { perSecond: 15 } })] },
    flavor: '「冬天从不进攻。它只是等，等你的心跳慢下来。」' },
  { id: 'eye_of_three', name: '三相之眼', slot: 'amulet', base: 'jade_amulet', theme: 'lightning',
    legend: { text: '你施加的任何元素异常同时附带感电与冰缓',
      rules: [trig('ailment', { anyTags: ['fire', 'cold', 'lightning'] }, [{ do: 'status', status: 'shocked', magnitude: 0.25, duration: 3 }, { do: 'status', status: 'chilled', magnitude: 0.25, duration: 2 }], { limit: { perSecond: 40 } })] },
    flavor: '一只眼看见火，一只看见冰，第三只看见雷。' },
  // ---------------------------------------------------------------- rings
  { id: 'echo_ring', name: '回响之戒', slot: 'ring1', base: 'sapphire_ring', theme: 'cold',
    legend: { text: '击杀时 20% 几率从尸体重放你的主技能（每秒最多 5 次）',
      rules: [trig('kill', {}, [{ do: 'cast', skill: '$primary', from: 'event', range: 700 }], { role: 'owned', chain: true, at: 'event', accumulate: { kind: 'chance', pct: 20 }, limit: { perSecond: 5 } })] },
    flavor: '每一声倒地，都是下一声的开始。' },
  { id: 'ember_ring', name: '余烬之戒', slot: 'ring1', base: 'ruby_ring', theme: 'fire',
    legend: { text: '你的爆炸范围扩大 40% 并必定点燃',
      mods: [{ stat: 'area', op: 'more', value: 40, tags: ['explosion'] }, { stat: 'chance.ignite', op: 'base', value: 100, tags: ['explosion'] }] },
    flavor: '火不会熄，只会睡着。' },
  { id: 'thunder_ring', name: '雷环', slot: 'ring1', base: 'topaz_ring', theme: 'lightning',
    legend: { text: '感电效果提高 50%；感电敌人死亡时向附近放出 3 道电弧（每秒最多 4 次）',
      mods: [{ stat: 'effect.shock', op: 'inc', value: 50 }],
      rules: [trig('kill', { cond: { status: 'shocked', of: 'target' } }, [{ do: 'repeat', times: 3, actions: [{ do: 'cast', skill: 'arc', from: 'event', range: 600 }] }], { role: 'owned', chain: true, at: 'event', limit: { perSecond: 4 } })] },
    flavor: '雷声从一个死人传到下一个。' },
]));

export const legendary = id => LEGENDARIES.find(l => l.id === id) ?? null;

const CACHE = new Map();
/** The compiled legendary trait (one per legendary, no tiers). */
export function legendAffix(id) {
  if (!CACHE.has(id)) {
    gameContent();
    const L = legendary(id);
    if (!L) throw new Error(`未知传奇 ${id}`);
    CACHE.set(id, compileAffix({ id: `legend:${id}`, name: `传奇·${L.name}：${L.legend.text}`, tags: ['legendary'], mods: L.legend.mods, rules: L.legend.rules }));
  }
  return CACHE.get(id);
}

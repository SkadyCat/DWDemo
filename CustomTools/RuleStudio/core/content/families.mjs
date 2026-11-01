// 词条族：一族 = 一种效果 × 若干 T 阶。四层稀有度：
//   数值 stat（权重 100，T1–T10）  形态 form（30，T1–T6，改变技能形状）
//   联动 link（8，T1–T5，物品 T3+，规则/触发）  核心 core（1.5，T1–T3，物品 T6+，改写规则的关键词）
// 族的 make(v) 返回 { mods, rules, grants }；affixLine(族, T) 生成可装备的具体词条。
import { compileAffix } from '../content.mjs';
import { gameContent } from './game.mjs';
import { patchOne } from './overrides.mjs';

export const SLOTS = Object.freeze(['weapon', 'offhand', 'helmet', 'chest', 'gloves', 'boots', 'belt', 'amulet', 'ring1', 'ring2']);
const JEWELRY = ['amulet', 'ring1', 'ring2'];
const ARMOUR = ['helmet', 'chest', 'gloves', 'boots', 'offhand'];
const ANY = SLOTS;
export const LAYERS = Object.freeze({
  stat: { name: '数值', weight: 100, tiers: 10, minItemTier: 1 },
  form: { name: '形态', weight: 30, tiers: 6, minItemTier: 1 },
  link: { name: '联动', weight: 8, tiers: 5, minItemTier: 3 },
  core: { name: '核心', weight: 1.5, tiers: 3, minItemTier: 6 },
});

const geo = (a, b, n) => Array.from({ length: n }, (_, i) => (n === 1 ? b : a * (b / a) ** (i / (n - 1))));
const lin = (a, b, n) => Array.from({ length: n }, (_, i) => (n === 1 ? b : a + (b - a) * i / (n - 1)));
const round = (v, step) => Math.max(step, Math.round(v / step) * step);

const FAMILIES = new Map();
function fam(def) {
  def = patchOne('families', def);
  const layer = LAYERS[def.layer ?? 'stat'];
  const n = def.levels ?? layer.tiers;
  const values = (def.values ?? (def.curve === 'lin' ? lin : geo)(def.from, def.to, n)).map(v => round(v, def.step ?? 1));
  // Form and link traits are base lines: they can roll on any slot (the build decides where it wants them).
  const slots = def.layer === 'form' || def.layer === 'link' ? ANY : def.slots ?? ANY;
  const f = Object.freeze({ layer: 'stat', tags: [], ...def, slots, values: Object.freeze(values), levels: values.length });
  if (FAMILIES.has(f.id)) throw new Error(`词条族重复：${f.id}`);
  FAMILIES.set(f.id, f);
  return f;
}
const M = (stat, op, extra = {}) => v => ({ mods: [{ stat, op, value: v, ...extra }] });

// ================================================================== 防守：数值层
fam({ id: 'life', name: '+{v} 最大生命', from: 20, to: 140, slots: ANY, tags: ['defence', 'life'], make: M('life', 'base') });
fam({ id: 'life_inc', name: '最大生命提高 {v}%', from: 4, to: 14, slots: ['chest', 'belt', 'amulet', 'helmet'], tags: ['defence', 'life'], make: M('life', 'inc') });
fam({ id: 'es', name: '+{v} 能量护盾', from: 15, to: 110, slots: ARMOUR.concat(JEWELRY), tags: ['defence', 'es'], make: M('es', 'base') });
fam({ id: 'es_inc', name: '能量护盾提高 {v}%', from: 6, to: 22, slots: ARMOUR, tags: ['defence', 'es'], make: M('es', 'inc') });
fam({ id: 'armour', name: '+{v} 护甲', from: 60, to: 600, step: 5, slots: ARMOUR.concat(['belt']), tags: ['defence', 'armour'], make: M('armour', 'base') });
fam({ id: 'armour_inc', name: '护甲提高 {v}%', from: 10, to: 45, slots: ARMOUR, tags: ['defence', 'armour'], make: M('armour', 'inc') });
fam({ id: 'evasion', name: '+{v} 闪避', from: 60, to: 650, step: 5, slots: ARMOUR.concat(['ring1', 'ring2']), tags: ['defence', 'evasion'], make: M('evasion', 'base') });
fam({ id: 'evasion_inc', name: '闪避提高 {v}%', from: 10, to: 45, slots: ARMOUR, tags: ['defence', 'evasion'], make: M('evasion', 'inc') });
for (const [el, n] of [['fire', '火焰'], ['cold', '冰霜'], ['lightning', '闪电']])
  fam({ id: `res_${el}`, name: `+{v}% ${n}抗性`, from: 12, to: 46, slots: ANY, tags: ['defence', 'resist', el], make: M(`res.${el}`, 'base') });
fam({ id: 'res_chaos', name: '+{v}% 混沌抗性', from: 6, to: 30, slots: ANY, tags: ['defence', 'resist', 'chaos'], make: M('res.chaos', 'base') });
fam({ id: 'res_all', name: '+{v}% 全元素抗性', from: 6, to: 18, slots: JEWELRY.concat(['offhand']), tags: ['defence', 'resist'],
  make: v => ({ mods: ['fire', 'cold', 'lightning'].map(e => ({ stat: `res.${e}`, op: 'base', value: v })) }) });
fam({ id: 'res_max', name: '+{v}% 全元素抗性上限', layer: 'link', levels: 3, values: [1, 2, 3], slots: ['offhand', 'chest', 'amulet'], tags: ['defence', 'resist'],
  make: v => ({ mods: ['fire', 'cold', 'lightning'].map(e => ({ stat: `res.max.${e}`, op: 'base', value: v })) }) });
fam({ id: 'block', name: '+{v}% 格挡几率', from: 3, to: 12, slots: ['offhand'], tags: ['defence', 'block'], make: M('block', 'base') });
fam({ id: 'life_regen', name: '每秒回复 {v} 生命', from: 2, to: 40, slots: ['belt', 'chest', 'amulet', 'ring1', 'ring2', 'helmet'], tags: ['defence', 'sustain'], make: M('life.regen', 'base') });
fam({ id: 'leech', name: '{v}% 伤害转为生命偷取', from: 0.4, to: 2.4, step: 0.1, slots: ['weapon', 'gloves', 'ring1', 'ring2', 'amulet'], tags: ['defence', 'sustain'], make: M('leech.life', 'base') });
fam({ id: 'life_on_hit', name: '每次命中回复 {v} 生命', from: 2, to: 14, slots: ['weapon', 'gloves', 'ring1', 'ring2'], tags: ['defence', 'sustain'], make: M('life.onHit', 'base') });
fam({ id: 'life_on_kill', name: '击杀回复 {v} 生命', from: 6, to: 60, slots: ['weapon', 'gloves', 'boots', 'ring1', 'ring2'], tags: ['defence', 'sustain'], make: M('life.onKill', 'base') });
fam({ id: 'reduced_hit', name: '受到的击中伤害降低 {v}%', from: 2, to: 8, slots: ['chest', 'helmet', 'belt', 'offhand'], tags: ['defence'], make: v => ({ mods: [{ stat: 'damageTaken.hit', op: 'more', value: -v }] }) });
fam({ id: 'avoid_ailment', name: '{v}% 几率免疫异常', from: 8, to: 40, slots: ['boots', 'helmet', 'belt', 'amulet'], tags: ['defence', 'ailment'], make: M('avoid.ailment', 'base') });
fam({ id: 'mana', name: '+{v} 最大魔力', maxPerBuild: 2, from: 10, to: 80, slots: ['helmet', 'amulet', 'ring1', 'ring2', 'belt', 'offhand'], tags: ['mana'], make: M('mana', 'base') });
fam({ id: 'mana_regen', name: '每秒回复 {v} 魔力', maxPerBuild: 2, from: 2, to: 16, slots: ['amulet', 'ring1', 'ring2', 'offhand', 'helmet'], tags: ['mana'], make: M('mana.regen', 'base') });
fam({ id: 'move_speed', name: '移动速度提高 {v}%', maxPerBuild: 1, from: 6, to: 30, slots: ['boots'], tags: ['utility'], make: M('moveSpeed', 'inc') });

// ================================================================== 攻击：数值层
const DMG_TAGS = { fire: '火焰', cold: '冰霜', lightning: '闪电', physical: '物理', chaos: '混沌', elemental: '元素', spell: '法术', attack: '攻击', melee: '近战', projectile: '投射物', area: '范围', minion: '召唤物' };
for (const [tag, n] of Object.entries(DMG_TAGS))
  fam({ id: `dmg_${tag}`, name: `${n}伤害提高 {v}%`, from: 8, to: 45, slots: ['weapon', 'offhand', 'amulet', 'ring1', 'ring2', 'gloves', 'helmet', 'belt'], tags: ['offence', tag],
    make: tag === 'minion' ? v => ({ mods: [{ stat: 'damage', op: 'inc', value: v, scope: 'minion' }] }) : M('damage', 'inc', { tags: [tag] }) });
for (const [type, n] of [['physical', '物理'], ['fire', '火焰'], ['cold', '冰霜'], ['lightning', '闪电'], ['chaos', '混沌']]) {
  fam({ id: `added_${type}_attack`, name: `攻击附加 {v} ${n}伤害`, from: 2, to: 12, slots: ['weapon', 'gloves', 'ring1', 'ring2', 'amulet'], tags: ['offence', type, 'attack'], make: M(`added.${type}`, 'base', { tags: ['attack'] }) });
  fam({ id: `added_${type}_spell`, name: `法术附加 {v} ${n}伤害`, from: 2, to: 10, slots: ['weapon', 'offhand', 'ring1', 'ring2', 'amulet'], tags: ['offence', type, 'spell'], make: M(`added.${type}`, 'base', { tags: ['spell'] }) });
}
fam({ id: 'crit_chance', name: '暴击率提高 {v}%', from: 15, to: 90, slots: ['weapon', 'helmet', 'amulet', 'ring1', 'ring2', 'gloves'], tags: ['offence', 'crit'], make: M('crit.chance', 'inc') });
fam({ id: 'crit_base', name: '+{v}% 基础暴击率', from: 0.5, to: 3, step: 0.1, slots: ['weapon'], tags: ['offence', 'crit'], make: M('crit.chance', 'base') });
fam({ id: 'crit_bonus', name: '+{v}% 暴击伤害加成', from: 8, to: 45, slots: ['weapon', 'amulet', 'gloves', 'ring1', 'ring2'], tags: ['offence', 'crit'], make: M('crit.bonus', 'base') });
fam({ id: 'attack_speed', name: '攻击速度提高 {v}%', from: 4, to: 18, slots: ['weapon', 'gloves', 'ring1', 'ring2', 'amulet'], tags: ['offence', 'speed', 'attack'], make: M('speed', 'inc', { tags: ['attack'] }) });
fam({ id: 'cast_speed', name: '施法速度提高 {v}%', from: 4, to: 18, slots: ['weapon', 'offhand', 'ring1', 'ring2', 'amulet', 'gloves'], tags: ['offence', 'speed', 'spell'], make: M('speed', 'inc', { tags: ['spell'] }) });
fam({ id: 'area_inc', name: '范围效果扩大 {v}%', from: 6, to: 30, slots: ['helmet', 'gloves', 'amulet', 'belt'], tags: ['offence', 'area'], make: M('area', 'inc') });
fam({ id: 'proj_speed', name: '投射物速度提高 {v}%', from: 8, to: 35, slots: ['weapon', 'gloves', 'boots', 'helmet'], tags: ['offence', 'projectile'], make: M('proj.speed', 'inc') });
fam({ id: 'duration', name: '技能持续时间延长 {v}%', from: 6, to: 30, slots: ['helmet', 'belt', 'amulet', 'offhand'], tags: ['offence', 'duration'], make: M('duration', 'inc') });
for (const [el, n] of [['fire', '火焰'], ['cold', '冰霜'], ['lightning', '闪电'], ['chaos', '混沌']])
  fam({ id: `pen_${el}`, name: `${n}伤害穿透 {v}% 抗性`, from: 3, to: 15, slots: ['weapon', 'amulet', 'gloves', 'helmet'], tags: ['offence', el, 'penetration'], make: M(`pen.${el}`, 'base') });
for (const [a, n, from] of [['ignite', '点燃', 10], ['shock', '感电', 10], ['freeze', '冰冻', 8], ['poison', '中毒', 10], ['bleed', '流血', 10], ['scorch', '烧灼', 10], ['brittle', '易碎', 10], ['sap', '精疲力尽', 10]])
  fam({ id: `chance_${a}`, name: `{v}% ${n}几率`, from, to: from * 4, slots: ['weapon', 'gloves', 'ring1', 'ring2', 'amulet', 'helmet'], tags: ['offence', 'ailment', a], make: M(`chance.${a}`, 'base') });
for (const [a, n] of [['shock', '感电'], ['chill', '冰缓'], ['scorch', '烧灼']])
  fam({ id: `effect_${a}`, name: `${n}效果提高 {v}%`, from: 8, to: 40, slots: ['amulet', 'ring1', 'ring2', 'helmet', 'gloves'], tags: ['offence', 'ailment', a], make: M(`effect.${a}`, 'inc') });
for (const [a, n] of [['ignite', '点燃'], ['poison', '中毒'], ['bleed', '流血']])
  fam({ id: `ailment_${a}`, name: `${n}伤害提高 {v}%`, from: 10, to: 60, slots: ['weapon', 'amulet', 'ring1', 'ring2', 'gloves', 'belt'], tags: ['offence', 'ailment', a], make: M('ailmentDamage', 'inc', { tags: [a] }) });
fam({ id: 'dot_inc', name: '持续伤害提高 {v}%', from: 8, to: 40, slots: ['weapon', 'amulet', 'belt', 'helmet'], tags: ['offence', 'dot'], make: M('dotDamage', 'inc') });
fam({ id: 'cost_less', name: '技能魔力消耗降低 {v}%', from: 5, to: 25, slots: ['helmet', 'amulet', 'ring1', 'ring2'], tags: ['mana'], make: v => ({ mods: [{ stat: 'cost', op: 'inc', value: -v }] }) });
fam({ id: 'minion_life', name: '召唤物生命提高 {v}%', from: 10, to: 50, slots: ['offhand', 'helmet', 'chest', 'amulet'], tags: ['offence', 'minion'], make: v => ({ mods: [{ stat: 'life', op: 'inc', value: v, scope: 'minion' }] }) });
fam({ id: 'minion_speed', name: '召唤物攻击与施法速度提高 {v}%', from: 5, to: 25, slots: ['offhand', 'gloves', 'amulet'], tags: ['offence', 'minion', 'speed'], make: v => ({ mods: [{ stat: 'speed', op: 'inc', value: v, scope: 'minion' }] }) });

// ================================================================== 形态层：改变技能形状
fam({ id: 'proj_count', name: '+{v} 投射物数量', layer: 'form', values: [1, 1, 1, 2, 2, 3], slots: ['weapon', 'offhand', 'gloves', 'helmet'], tags: ['form', 'projectile'], make: M('proj.count', 'base') });
fam({ id: 'proj_chain', name: '投射物连锁 +{v} 次', layer: 'form', values: [1, 1, 2, 2, 3, 4], slots: ['weapon', 'gloves', 'helmet', 'amulet'], tags: ['form', 'projectile', 'chain'], make: M('proj.chain', 'base') });
fam({ id: 'proj_pierce', name: '投射物穿透 +{v} 个目标', layer: 'form', values: [1, 2, 2, 3, 4, 5], slots: ['weapon', 'gloves', 'boots', 'helmet'], tags: ['form', 'projectile'], make: M('proj.pierce', 'base') });
fam({ id: 'proj_fork', name: '投射物分叉 +{v} 次', layer: 'form', values: [1, 1, 1, 2, 2, 3], slots: ['weapon', 'gloves', 'amulet'], tags: ['form', 'projectile'], make: M('proj.fork', 'base') });
fam({ id: 'proj_split', name: '投射物命中后分裂为 {v} 个', layer: 'form', values: [1, 2, 2, 3, 3, 4], slots: ['weapon', 'offhand', 'amulet'], tags: ['form', 'projectile'], make: M('proj.split', 'base') });
fam({ id: 'proj_return', name: '投射物耗尽后折返 {v} 次', layer: 'form', values: [1, 1, 1, 1, 2, 2], slots: ['weapon', 'helmet', 'amulet'], tags: ['form', 'projectile'], make: M('proj.return', 'base') });
fam({ id: 'chain_any', name: '连锁类技能 +{v} 次连锁', layer: 'form', values: [1, 2, 2, 3, 3, 4], slots: ['weapon', 'offhand', 'ring1', 'ring2'], tags: ['form', 'chain'], make: M('proj.chain', 'base', { tags: ['chaining'] }) });
fam({ id: 'area_more', name: '范围技能的范围扩大 {v}%（更多）', layer: 'form', values: [15, 20, 25, 30, 40, 50], slots: ['weapon', 'helmet', 'gloves', 'chest'], tags: ['form', 'area'], make: M('area', 'more') });
fam({ id: 'multistrike', name: '近战攻击额外重复 {v}%', layer: 'form', unique: true, values: [30, 50, 70, 90, 120, 150], slots: ['weapon', 'gloves', 'ring1', 'ring2'], tags: ['form', 'melee', 'repeat'], make: v => ({ mods: [{ stat: 'repeat', op: 'base', value: v / 100, tags: ['melee'] }] }) });
fam({ id: 'spell_echo', name: '法术额外重复 {v}%', layer: 'form', unique: true, values: [25, 40, 55, 70, 85, 100], slots: ['weapon', 'offhand', 'amulet'], tags: ['form', 'spell', 'repeat'], make: v => ({ mods: [{ stat: 'repeat', op: 'base', value: v / 100, tags: ['spell'], notTags: ['triggered'] }] }) });
fam({ id: 'strike_targets', name: '打击技能额外命中 {v} 个敌人', layer: 'form', values: [1, 1, 2, 2, 3, 4], slots: ['weapon', 'gloves'], tags: ['form', 'melee', 'strike'], make: M('strike.targets', 'base') });
fam({ id: 'minion_count', name: '+{v} 召唤物上限', layer: 'form', values: [1, 1, 2, 2, 3, 4], slots: ['offhand', 'helmet', 'amulet', 'chest'], tags: ['form', 'minion'], make: M('minion.limit', 'base') });
fam({ id: 'conv_phys_fire', name: '{v}% 物理伤害转为火焰', layer: 'form', values: [20, 30, 40, 50, 60, 70], slots: ['weapon', 'gloves', 'amulet'], tags: ['form', 'conversion', 'fire'], make: M('conv.physical.fire', 'base') });
fam({ id: 'conv_phys_cold', name: '{v}% 物理伤害转为冰霜', layer: 'form', values: [20, 30, 40, 50, 60, 70], slots: ['weapon', 'gloves', 'amulet'], tags: ['form', 'conversion', 'cold'], make: M('conv.physical.cold', 'base') });
fam({ id: 'conv_phys_lightning', name: '{v}% 物理伤害转为闪电', layer: 'form', values: [20, 30, 40, 50, 60, 70], slots: ['weapon', 'gloves', 'amulet'], tags: ['form', 'conversion', 'lightning'], make: M('conv.physical.lightning', 'base') });
fam({ id: 'conv_lightning_cold', name: '{v}% 闪电伤害转为冰霜', layer: 'form', values: [20, 30, 40, 50, 60, 70], slots: ['weapon', 'gloves', 'amulet', 'ring1', 'ring2'], tags: ['form', 'conversion', 'cold'], make: M('conv.lightning.cold', 'base') });
fam({ id: 'conv_cold_fire', name: '{v}% 冰霜伤害转为火焰', layer: 'form', values: [20, 30, 40, 50, 60, 70], slots: ['weapon', 'gloves', 'amulet', 'ring1', 'ring2'], tags: ['form', 'conversion', 'fire'], make: M('conv.cold.fire', 'base') });
for (const [from, to, n] of [['physical', 'fire', '物理→火焰'], ['physical', 'lightning', '物理→闪电'], ['physical', 'chaos', '物理→混沌'], ['cold', 'lightning', '冰霜→闪电'], ['fire', 'chaos', '火焰→混沌'], ['lightning', 'fire', '闪电→火焰']])
  fam({ id: `extra_${from}_${to}`, name: `获得 {v}% ${n.split('→')[0]}伤害作为额外${n.split('→')[1]}伤害`, layer: 'form', values: [6, 9, 12, 15, 20, 25], slots: ['weapon', 'amulet', 'gloves', 'offhand'], tags: ['form', 'extra', to], make: M(`extra.${from}.${to}`, 'base') });

fam({ id: 'proj_nova', name: '投射物改为环形齐射，+{v} 投射物', layer: 'form', unique: true, values: [2, 3, 3, 4, 5, 6], slots: ['weapon', 'offhand', 'helmet', 'amulet'], tags: ['form', 'projectile'],
  make: v => ({ mods: [{ stat: 'proj.nova', op: 'base', value: 1 }, { stat: 'proj.count', op: 'base', value: v }] }) });
fam({ id: 'proj_explode', name: '投射物命中时爆炸（半径 {v}，35% 伤害）', layer: 'form', unique: true, values: [80, 100, 120, 140, 165, 190], slots: ['weapon', 'offhand', 'gloves', 'amulet'], tags: ['form', 'projectile', 'explosion'],
  make: M('proj.explode', 'base') });
fam({ id: 'area_cascade', name: '范围技能余震 +{v} 次（在周围落下，60% 伤害）', layer: 'form', values: [1, 1, 2, 2, 3, 4], slots: ['weapon', 'helmet', 'gloves', 'amulet', 'offhand'], tags: ['form', 'area'],
  make: M('area.cascade', 'base') });
fam({ id: 'strike_splash', name: '打击命中时溅射周围 {v} 范围（50% 伤害）', layer: 'form', values: [80, 100, 120, 140, 170, 200], slots: ['weapon', 'gloves', 'amulet'], tags: ['form', 'melee', 'strike'],
  make: M('strike.splash', 'base') });

// ================================================================== 联动层：规则与触发
const trig = (on, filter, doList, extra = {}) => ({ on, filter, do: doList, ...extra });
fam({ id: 'crit_power', name: '暴击时 {v}% 几率获得 1 个能量球', layer: 'link', values: [15, 20, 25, 35, 50], slots: ['weapon', 'gloves', 'amulet', 'helmet'], tags: ['link', 'crit', 'charge'],
  make: v => ({ rules: [trig('crit', { notTags: ['triggered'] }, [{ do: 'gain', res: 'power', amount: 1 }], { accumulate: { kind: 'chance', pct: v }, at: 'self' })] }) });
fam({ id: 'kill_frenzy', name: '击杀时 {v}% 几率获得 1 个狂怒球', layer: 'link', values: [20, 30, 40, 50, 70], slots: ['weapon', 'gloves', 'boots', 'ring1', 'ring2'], tags: ['link', 'kill', 'charge'],
  make: v => ({ rules: [trig('kill', {}, [{ do: 'gain', res: 'frenzy', amount: 1 }], { role: 'owned', accumulate: { kind: 'chance', pct: v }, at: 'self' })] }) });
fam({ id: 'struck_endurance', name: '被击中时 {v}% 几率获得 1 个耐力球', layer: 'link', values: [15, 20, 30, 40, 50], slots: ['chest', 'helmet', 'belt', 'offhand'], tags: ['link', 'defence', 'charge'],
  make: v => ({ rules: [trig('struck', {}, [{ do: 'gain', res: 'endurance', amount: 1 }], { accumulate: { kind: 'chance', pct: v }, at: 'self' })] }) });
fam({ id: 'per_power', name: '每个能量球使暴击率提高 {v}%', layer: 'link', values: [15, 20, 25, 30, 40], slots: ['amulet', 'helmet', 'ring1', 'ring2'], tags: ['link', 'charge', 'crit'], make: M('crit.chance', 'inc', { per: { res: 'power' } }) });
fam({ id: 'per_frenzy', name: '每个狂怒球使伤害提高 {v}%（更多）', layer: 'link', values: [3, 4, 5, 6, 8], slots: ['gloves', 'amulet', 'ring1', 'ring2', 'weapon'], tags: ['link', 'charge'], make: M('damage', 'more', { per: { res: 'frenzy' } }) });
fam({ id: 'per_endurance', name: '每个耐力球使受到伤害降低 {v}%', layer: 'link', values: [2, 3, 3, 4, 5], slots: ['chest', 'belt', 'offhand'], tags: ['link', 'charge', 'defence'], make: v => ({ mods: [{ stat: 'damageTaken', op: 'more', value: -v, per: { res: 'endurance' } }] }) });
fam({ id: 'charge_max', name: '+1 能量/狂怒/耐力球上限', layer: 'link', values: [1, 1, 1, 1, 1], slots: ['amulet', 'chest', 'helmet'], tags: ['link', 'charge'],
  make: v => ({ mods: ['power', 'frenzy', 'endurance'].map(c => ({ stat: `charge.max.${c}`, op: 'base', value: v })) }) });
fam({ id: 'cast_on_crit', name: '攻击暴击时施放冰刺爆发（冷却 {v} 秒）', layer: 'link', values: [0.4, 0.3, 0.25, 0.2, 0.15], step: 0.05, slots: ['weapon', 'gloves', 'amulet'], tags: ['link', 'crit', 'trigger', 'cold'],
  make: v => ({ rules: [trig('crit', { tags: ['attack'], notTags: ['triggered'] }, [{ do: 'cast', skill: 'ice_spike_burst', at: 'target' }], { limit: { cooldown: v } })] }) });
fam({ id: 'cast_on_shock', name: '每施加 {v} 次感电，在目标处落雷', layer: 'link', values: [5, 4, 4, 3, 2], slots: ['weapon', 'gloves', 'amulet', 'ring1', 'ring2'], tags: ['link', 'trigger', 'lightning', 'shock'],
  make: v => ({ rules: [trig('ailment', { key: 'shock', notTags: ['triggered'] }, [{ do: 'cast', skill: 'thunder_fall', at: 'target' }], { accumulate: { kind: 'count', n: v } })] }) });
fam({ id: 'cast_while_channel', name: '引导时每 {v} 秒施放炎爆', layer: 'link', values: [0.6, 0.5, 0.45, 0.4, 0.35], step: 0.05, slots: ['weapon', 'gloves', 'amulet', 'chest'], tags: ['link', 'trigger', 'channel', 'fire'],
  make: v => ({ rules: [trig('channel', {}, [{ do: 'cast', skill: 'flame_burst', at: 'nearest' }], { limit: { cooldown: v }, at: 'nearest', range: 500 })] }) });
fam({ id: 'move_trigger', name: '每移动 {v} 米在身边施放冰霜新星', layer: 'link', values: [6, 5, 4, 3.5, 3], step: 0.5, slots: ['boots', 'belt'], tags: ['link', 'trigger', 'movement', 'cold'],
  make: v => ({ rules: [trig('move', {}, [{ do: 'cast', skill: 'ice_nova', at: 'self' }], { accumulate: { kind: 'meter', amount: { event: 'amount' }, threshold: v * 100 }, at: 'self' })] }) });
fam({ id: 'kill_explode', name: '击杀的敌人爆炸，造成其最大生命 {v}% 的火焰伤害', layer: 'link', values: [6, 8, 10, 12, 15], slots: ['weapon', 'gloves', 'chest', 'amulet'], tags: ['link', 'kill', 'fire', 'area'],
  make: v => ({ rules: [trig('kill', { notTags: ['explosion'] }, [{ do: 'explode', pct: v, type: 'fire', radius: 180, tags: ['explosion'] }], { role: 'owned', chain: true })] }) });
fam({ id: 'ignite_spread', name: '击杀被点燃的敌人时，点燃扩散到 {v} 个附近敌人', layer: 'link', values: [2, 3, 4, 5, 6], slots: ['weapon', 'gloves', 'amulet', 'helmet'], tags: ['link', 'ignite', 'fire'],
  make: v => ({ rules: [trig('kill', { cond: { status: 'ignited', of: 'target' } }, [{ do: 'spread', status: 'ignited', radius: 300, max: v }], { role: 'owned', chain: true })] }) });
fam({ id: 'poison_spread', name: '击杀中毒敌人时，毒层扩散到 {v} 个附近敌人', layer: 'link', values: [2, 3, 4, 5, 6], slots: ['weapon', 'gloves', 'amulet', 'ring1', 'ring2'], tags: ['link', 'poison'],
  make: v => ({ rules: [trig('kill', { cond: { status: 'poisoned', of: 'target' } }, [{ do: 'spread', status: 'poisoned', radius: 260, max: v }], { role: 'owned', chain: true })] }) });
fam({ id: 'shock_spread', name: '击杀感电敌人时，感电扩散到附近敌人（范围 {v}）', layer: 'link', values: [150, 200, 250, 300, 350], step: 10, slots: ['weapon', 'gloves', 'ring1', 'ring2'], tags: ['link', 'shock', 'lightning'],
  make: v => ({ rules: [trig('kill', { cond: { status: 'shocked', of: 'target' } }, [{ do: 'spread', status: 'shocked', radius: v }], { role: 'owned', chain: true })] }) });
fam({ id: 'shatter_burst', name: '击碎冰冻敌人时爆炸，造成其最大生命 {v}% 的闪电伤害', layer: 'link', values: [20, 30, 40, 50, 60], slots: ['weapon', 'helmet', 'amulet', 'chest'], tags: ['link', 'cold', 'lightning', 'herald'],
  make: v => ({ rules: [trig('shatter', { notTags: ['herald_ice'] }, [{ do: 'area', at: 'target', radius: 170, damage: { lightning: { pool: 'life', of: 'target', mul: v / 100 } }, crit: 0, tags: ['herald_ice', 'lightning'], fx: 'ice_burst' }], { role: 'owned', chain: true })] }) });
fam({ id: 'thunder_herald', name: '击杀感电敌人后，接下来 3 次攻击召唤落雷（造成该次命中 {v}% 的冰霜伤害）', layer: 'link', values: [60, 75, 90, 110, 130], slots: ['weapon', 'gloves', 'chest', 'amulet'], tags: ['link', 'cold', 'lightning', 'herald'],
  make: v => ({ rules: [
    trig('kill', { notTags: ['herald_thunder'], cond: { status: 'shocked', of: 'target' } }, [{ do: 'status', on: 'self', status: 'thunder_ready', stacks: 3 }], { role: 'owned', chain: true, at: 'self' }),
    trig('hit', { tags: ['attack'], notTags: ['herald_ice', 'herald_thunder', 'triggered'], cond: { status: 'thunder_ready' } }, [{ do: 'removeStatus', on: 'self', status: 'thunder_ready', stacks: 1 }, { do: 'area', at: 'target', radius: 140, damage: { cold: { event: 'amount', mul: v / 100 } }, crit: 5, tags: ['herald_thunder', 'cold'], fx: 'thunder' }], { limit: { cooldown: 0.1 } }),
  ] }) });
// Elemental reactions (元素反应): the second element consumes the first ailment for a burst effect.
fam({ id: 'react_melt', name: '融化：火焰命中冰缓敌人时消耗冰缓，本次伤害提高 {v}%（更多）', layer: 'link', values: [25, 35, 45, 55, 70], slots: ['weapon', 'amulet', 'gloves', 'ring1', 'ring2'], tags: ['link', 'reaction', 'fire', 'cold'],
  make: v => ({ mods: [{ stat: 'damage', op: 'more', value: v, tags: ['fire', 'hit'], when: { status: 'chilled', of: 'target' } }],
    rules: [trig('hit', { tags: ['fire'], cond: { status: 'chilled', of: 'target' } }, [{ do: 'removeStatus', status: 'chilled' }], { chain: true })] }) });
fam({ id: 'react_overload', name: '超载：闪电命中点燃敌人时引爆点燃，造成剩余点燃伤害 {v}% 的范围火焰伤害', layer: 'link', values: [40, 55, 75, 100, 125], slots: ['weapon', 'amulet', 'gloves', 'ring1', 'ring2'], tags: ['link', 'reaction', 'fire', 'lightning'],
  make: v => ({ rules: [trig('hit', { tags: ['lightning'], notTags: ['reaction'], cond: { status: 'ignited', of: 'target' } },
    [{ do: 'consumeStatus', status: 'ignited', as: 'ign' }, { do: 'area', at: 'target', radius: 200, damage: { fire: { var: 'ignDamage', mul: v / 100 } }, unscaled: true, crit: 0, ailments: false, tags: ['reaction', 'overload'], fx: 'overload' }], { chain: true })] }) });
fam({ id: 'react_superconduct', name: '超导：冰霜命中感电敌人时消耗感电，使其元素曝露 {v}%', layer: 'link', values: [5, 8, 10, 12, 15], slots: ['weapon', 'amulet', 'gloves', 'ring1', 'ring2'], tags: ['link', 'reaction', 'cold', 'lightning'],
  make: v => ({ rules: [trig('hit', { tags: ['cold'], notTags: ['reaction'], cond: { status: 'shocked', of: 'target' } },
    [{ do: 'removeStatus', status: 'shocked' }, { do: 'status', status: 'superconduct', magnitude: v / 25, duration: 4 }], { chain: true })] }) });
fam({ id: 'react_vaporize', name: '蒸发：冰霜命中点燃敌人时消耗点燃，本次伤害提高 {v}%（更多）', layer: 'link', values: [25, 35, 45, 55, 70], slots: ['weapon', 'amulet', 'gloves', 'ring1', 'ring2'], tags: ['link', 'reaction', 'fire', 'cold'],
  make: v => ({ mods: [{ stat: 'damage', op: 'more', value: v, tags: ['cold', 'hit'], when: { status: 'ignited', of: 'target' } }],
    rules: [trig('hit', { tags: ['cold'], cond: { status: 'ignited', of: 'target' } }, [{ do: 'removeStatus', status: 'ignited' }], { chain: true })] }) });
fam({ id: 'vs_ailing', name: '对每种处于异常状态的敌人伤害提高 {v}%（更多）', layer: 'link', values: [6, 8, 10, 12, 15], slots: ['amulet', 'ring1', 'ring2', 'gloves', 'helmet'], tags: ['link', 'ailment'],
  make: M('damage', 'more', { per: { statusTag: 'ailment', of: 'target' } }) });
fam({ id: 'shock_bonus', name: '对感电敌人的暴击率提高 {v}%', layer: 'link', values: [40, 60, 80, 100, 140], slots: ['weapon', 'amulet', 'gloves', 'ring1', 'ring2'], tags: ['link', 'shock', 'crit'],
  make: M('crit.chance', 'inc', { when: { status: 'shocked', of: 'target' } }) });
fam({ id: 'frozen_bonus', name: '对冰冻或冰缓敌人伤害提高 {v}%（更多）', layer: 'link', values: [10, 15, 20, 25, 30], slots: ['weapon', 'amulet', 'gloves', 'ring1', 'ring2'], tags: ['link', 'cold'],
  make: M('damage', 'more', { when: { any: [{ status: 'frozen', of: 'target' }, { status: 'chilled', of: 'target' }] } }) });
fam({ id: 'kill_onslaught', name: '击杀时 {v}% 几率获得猛攻', layer: 'link', values: [15, 20, 30, 40, 60], slots: ['boots', 'gloves', 'weapon'], tags: ['link', 'speed', 'kill'],
  make: v => ({ rules: [trig('kill', {}, [{ do: 'status', on: 'self', status: 'onslaught' }], { role: 'owned', accumulate: { kind: 'chance', pct: v }, at: 'self' })] }) });
fam({ id: 'hit_fortify', name: '近战命中时获得护体（冷却 {v} 秒）', layer: 'link', values: [3, 2.5, 2, 1.5, 1], step: 0.5, slots: ['chest', 'helmet', 'belt', 'gloves'], tags: ['link', 'melee', 'defence'],
  make: v => ({ rules: [trig('hit', { tags: ['melee'] }, [{ do: 'status', on: 'self', status: 'fortify' }], { limit: { cooldown: v }, at: 'self' })] }) });
fam({ id: 'flicker_reset', name: '消耗 1 个狂怒球立即重置位移技能冷却（{v}% 几率不消耗）', layer: 'link', values: [0, 10, 20, 35, 50], slots: ['weapon', 'gloves', 'boots'], tags: ['link', 'movement', 'charge'],
  make: v => ({ mods: [{ stat: 'cooldown', op: 'more', value: -100, tags: ['movement'], when: { res: 'frenzy', gte: 1 } }],
    rules: [trig('cast', { tags: ['movement'], notTags: ['triggered'], cond: { res: 'frenzy', gte: 1 } }, [{ do: 'consume', res: 'frenzy', amount: 1, chance: 100 - v }], { at: 'self' })] }) });
fam({ id: 'minion_explode', name: '召唤物死亡时爆炸，造成其最大生命 {v}% 的物理伤害', layer: 'link', values: [20, 30, 45, 60, 80], slots: ['offhand', 'amulet', 'helmet'], tags: ['link', 'minion'],
  make: v => ({ rules: [trig('death', {}, [{ do: 'area', at: 'event', radius: 180, damage: { physical: { pool: 'life', of: 'target', mul: v / 100 } }, crit: 0 }], { role: 'minion', at: 'event', chain: true })] }) });

// ---- 连环（清屏用）：击杀/击碎/爆炸再触发下一次，一片怪像多米诺一样倒下
fam({ id: 'explode_ignite', name: '你的爆炸有 {v}% 几率点燃', layer: 'link', values: [30, 45, 60, 80, 100], slots: ['weapon', 'gloves', 'amulet', 'helmet', 'chest'], tags: ['link', 'ignite', 'fire', 'explosion'],
  make: M('chance.ignite', 'base', { tags: ['explosion'] }) });
fam({ id: 'shatter_nova', name: '碎冰：击碎冰冻敌人时爆出寒霜，造成其最大生命 {v}% 的冰霜伤害并冰冻周围', layer: 'link', values: [25, 35, 45, 55, 70], slots: ['weapon', 'helmet', 'amulet', 'chest', 'gloves'], tags: ['link', 'cold', 'freeze', 'shatter'],
  make: v => ({ mods: [{ stat: 'chance.freeze', op: 'base', value: 100, tags: ['shatter_nova'] }],
    rules: [trig('shatter', {}, [{ do: 'area', at: 'event', radius: 210, damage: { cold: { pool: 'life', of: 'target', mul: v / 100 } }, crit: 0, tags: ['shatter_nova', 'cold', 'area'], fx: 'ice_burst' }], { role: 'owned', chain: true, at: 'event', limit: { perSecond: 40 } })] }) });
fam({ id: 'kill_arc', name: '雷链：感电敌人死亡时从尸体放出一道电弧（每秒最多 {v} 次）', layer: 'link', values: [6, 8, 10, 12, 15], slots: ['weapon', 'gloves', 'amulet', 'ring1', 'ring2'], tags: ['link', 'lightning', 'shock', 'trigger'],
  make: v => ({ rules: [trig('kill', { cond: { status: 'shocked', of: 'target' } }, [{ do: 'cast', skill: 'arc', from: 'event', range: 600 }], { role: 'owned', chain: true, at: 'event', limit: { perSecond: v } })] }) });
fam({ id: 'kill_thunder', name: '雷葬：击杀感电敌人时在尸体处落雷（每秒最多 {v} 次）', layer: 'link', values: [5, 7, 9, 11, 14], slots: ['weapon', 'gloves', 'helmet', 'chest'], tags: ['link', 'lightning', 'shock', 'trigger'],
  make: v => ({ rules: [trig('kill', { cond: { status: 'shocked', of: 'target' } }, [{ do: 'cast', skill: 'thunder_fall', at: 'event' }], { role: 'owned', chain: true, at: 'event', limit: { perSecond: v } })] }) });
fam({ id: 'overload_fuse', name: '超载引信：超载爆炸也会引爆范围内其他被点燃的敌人（造成 {v}% 剩余点燃伤害）', layer: 'link', values: [50, 70, 90, 110, 130], slots: ['weapon', 'amulet', 'gloves', 'helmet'], tags: ['link', 'reaction', 'fire', 'lightning'],
  make: v => ({ rules: [trig('hit', { tags: ['overload'], cond: { status: 'ignited', of: 'target' } },
    [{ do: 'consumeStatus', status: 'ignited', as: 'ign' }, { do: 'area', at: 'target', radius: 200, damage: { fire: { var: 'ignDamage', mul: v / 100 } }, unscaled: true, crit: 0, ailments: false, tags: ['reaction', 'overload'], fx: 'overload' }], { chain: true })] }) });
fam({ id: 'blink_slam', name: '闪现落地时冲击周围（落地冲击，每秒最多 {v} 次）', layer: 'link', values: [3, 4, 5, 6, 8], slots: ['boots', 'gloves', 'weapon', 'chest'], tags: ['link', 'movement', 'area', 'melee'],
  make: v => ({ rules: [trig('blink', {}, [{ do: 'cast', skill: 'ground_slam', at: 'self' }], { at: 'self', limit: { perSecond: v } })] }) });
fam({ id: 'poison_burst', name: '毒爆：中毒敌人死亡时爆出毒雾，造成其最大生命 {v}% 的混沌伤害并使周围中毒', layer: 'link', values: [15, 20, 25, 32, 40], slots: ['weapon', 'gloves', 'amulet', 'chest', 'helmet'], tags: ['link', 'poison', 'chaos', 'explosion'],
  make: v => ({ mods: [{ stat: 'chance.poison', op: 'base', value: 100, tags: ['poison_burst'] }],
    rules: [trig('kill', { cond: { status: 'poisoned', of: 'target' } }, [{ do: 'explode', pct: v, type: 'chaos', radius: 200, fx: 'poison', tags: ['explosion', 'poison_burst'] }], { role: 'owned', chain: true, at: 'event', limit: { perSecond: 30 } })] }) });

// ---- 持续区域（火墙、龙卷风…）：形态与联动
fam({ id: 'zone_pull', name: '风眼：持续区域把附近敌人往中心吸（每秒 {v}）', layer: 'form', values: [70, 100, 130, 160, 200, 250], slots: ['weapon', 'helmet', 'gloves', 'boots', 'amulet'], tags: ['form', 'area', 'duration'],
  make: M('zone.pull', 'base') });
fam({ id: 'zone_count', name: '风暴群：持续区域技能每次额外生成 {v} 个（向两侧散开）', layer: 'form', values: [1, 1, 1, 2, 2, 3], slots: ['weapon', 'offhand', 'helmet', 'gloves'], tags: ['form', 'area', 'duration'],
  make: M('zone.count', 'base') });
fam({ id: 'zone_growth', name: '膨胀：持续区域每秒扩大 {v}%', layer: 'form', values: [10, 15, 20, 25, 32, 40], slots: ['weapon', 'helmet', 'chest', 'amulet'], tags: ['form', 'area', 'duration'],
  make: M('zone.growth', 'base') });
fam({ id: 'zone_thunder', name: '雷旋：持续区域的命中有 {v}% 几率在目标处落雷（每秒最多 10 次）', layer: 'link', values: [5, 7, 9, 11, 14], slots: ['weapon', 'gloves', 'amulet', 'helmet', 'chest'], tags: ['link', 'lightning', 'trigger', 'area'],
  make: v => ({ rules: [trig('hit', { tags: ['zone'] }, [{ do: 'cast', skill: 'thunder_fall' }], { accumulate: { kind: 'chance', pct: v }, limit: { perSecond: 10 } })] }) });
fam({ id: 'zone_spawn', name: '风生：被持续区域击杀的敌人有 {v}% 几率从尸体卷起你的主技能（每秒最多 4 次）', layer: 'link', values: [12, 16, 20, 25, 30], slots: ['weapon', 'gloves', 'amulet', 'ring1', 'ring2'], tags: ['link', 'kill', 'trigger', 'area'],
  make: v => ({ rules: [trig('kill', { tags: ['zone'] }, [{ do: 'cast', skill: '$primary', from: 'event', range: 700 }], { role: 'owned', chain: true, at: 'event', accumulate: { kind: 'chance', pct: v }, limit: { perSecond: 4 } })] }) });

// ---- 通用联动：任何技能都成立
fam({ id: 'proliferate', name: '传染：你施加的异常有 {v}% 几率传染给附近 1 个敌人', layer: 'link', values: [25, 35, 45, 60, 75], slots: ['weapon', 'gloves', 'amulet', 'ring1', 'ring2', 'helmet'], tags: ['link', 'ailment'],
  make: v => ({ rules: [trig('ailment', {}, [{ do: 'proliferate', radius: 240, max: 1 }], { accumulate: { kind: 'chance', pct: v }, chain: true, limit: { perSecond: 60 } })] }) });
fam({ id: 'kill_recast', name: '回响：击杀时 {v}% 几率从尸体重放你的主技能（每秒最多 4 次）', layer: 'link', values: [8, 12, 16, 20, 25], slots: ['weapon', 'gloves', 'amulet', 'ring1', 'ring2'], tags: ['link', 'kill', 'trigger'],
  make: v => ({ rules: [trig('kill', {}, [{ do: 'cast', skill: '$primary', from: 'event', range: 700 }], { role: 'owned', chain: true, at: 'event', accumulate: { kind: 'chance', pct: v }, limit: { perSecond: 4 } })] }) });
fam({ id: 'bleed_explode', name: '血爆：流血的敌人死亡时爆炸，造成其最大生命 {v}% 的物理伤害', layer: 'link', values: [15, 20, 25, 32, 40], slots: ['weapon', 'gloves', 'amulet', 'chest'], tags: ['link', 'bleed', 'physical', 'explosion'],
  make: v => ({ rules: [trig('kill', { cond: { status: 'bleeding', of: 'target' } }, [{ do: 'explode', pct: v, type: 'physical', radius: 190, fx: 'explode', tags: ['explosion'] }], { role: 'owned', chain: true, at: 'event', limit: { perSecond: 30 } })] }) });
fam({ id: 'crit_explode', name: '暴击击杀的敌人爆炸，造成其最大生命 {v}% 的物理伤害', layer: 'link', values: [15, 20, 25, 32, 40], slots: ['weapon', 'gloves', 'amulet', 'ring1', 'ring2'], tags: ['link', 'crit', 'explosion'],
  make: v => ({ rules: [trig('kill', { cond: { event: 'crit' } }, [{ do: 'explode', pct: v, type: 'physical', radius: 180, fx: 'explode', tags: ['explosion'] }], { role: 'owned', chain: true, at: 'event', limit: { perSecond: 30 } })] }) });
fam({ id: 'struck_nova', name: '反击：被击中时 {v}% 几率在身边掀起寒潮（冷却 0.5 秒）', layer: 'link', values: [20, 30, 40, 55, 70], slots: ['chest', 'helmet', 'belt', 'offhand', 'boots'], tags: ['link', 'defence', 'cold', 'trigger'],
  make: v => ({ rules: [trig('struck', {}, [{ do: 'cast', skill: 'glacial_burst', at: 'self' }], { at: 'self', accumulate: { kind: 'chance', pct: v }, limit: { cooldown: 0.5 } })] }) });
fam({ id: 'kill_minion', name: '击杀时 {v}% 几率召唤一把灵刃（最多 6 把，持续 12 秒）', layer: 'link', values: [10, 15, 20, 28, 36], slots: ['weapon', 'offhand', 'amulet', 'helmet'], tags: ['link', 'minion', 'kill'],
  make: v => ({ rules: [trig('kill', {}, [{ do: 'summon', minion: 'spirit_blade', at: 'self', count: 1, limit: 6 }], { role: 'source', at: 'self', accumulate: { kind: 'chance', pct: v }, limit: { perSecond: 3 } })] }) });

// ================================================================== 核心层：改写规则
fam({ id: 'core_endless_charges', name: '核心·无尽：消耗充能时 {v}% 几率不移除，仍按消耗数结算', layer: 'core', values: [30, 45, 60], slots: ['amulet', 'helmet', 'chest'], tags: ['core', 'charge'],
  make: v => ({ mods: ['power', 'frenzy', 'endurance'].map(c => ({ stat: 'consumeKeep', op: 'base', value: v, tags: [c] })) }) });
fam({ id: 'core_chain_reaction', name: '核心·连锁反应：被触发的技能也能触发联动（冷却 {v} 秒）', layer: 'core', values: [0.5, 0.35, 0.25], step: 0.05, slots: ['amulet', 'chest'], tags: ['core', 'trigger'],
  make: v => ({ rules: [trig('crit', { tags: ['triggered'] }, [{ do: 'cast', skill: 'ice_spike_burst', at: 'target' }], { chain: true, limit: { cooldown: v } })] }) });
fam({ id: 'core_elemental_overload', name: '核心·元素超载：异常状态敌人受到的元素伤害提高 {v}%（更多），但不能暴击', layer: 'core', values: [40, 55, 70], slots: ['amulet', 'chest', 'helmet'], tags: ['core', 'ailment'],
  make: v => ({ mods: [{ stat: 'damage', op: 'more', value: v, tags: ['elemental'], when: { statusTag: 'ailment', of: 'target' } }, { stat: 'crit.chance', op: 'set', value: 0 }] }) });
fam({ id: 'core_trinity', name: '核心·三相：感电、冰缓、点燃同时存在时元素伤害提高 {v}%（更多）', layer: 'core', values: [30, 40, 50], slots: ['amulet', 'chest'], tags: ['core', 'reaction'],
  make: v => ({ mods: [{ stat: 'damage', op: 'more', value: v, tags: ['elemental'], when: { all: [{ status: 'shocked', of: 'target' }, { status: 'chilled', of: 'target' }, { status: 'ignited', of: 'target' }] } }] }) });
fam({ id: 'core_resolute', name: '核心·坚毅：不会被暴击，护甲提高 {v}%', layer: 'core', values: [30, 50, 70], slots: ['chest', 'offhand'], tags: ['core', 'defence'],
  make: v => ({ mods: [{ stat: 'cannotBeCrit', op: 'flag' }, { stat: 'armour', op: 'inc', value: v }] }) });
fam({ id: 'core_mind_over_matter', name: '核心·心胜于物：{v}% 受到的伤害由魔力承担', layer: 'core', values: [20, 30, 40], slots: ['amulet', 'helmet', 'chest'], tags: ['core', 'defence', 'mana'], make: M('mindOverMatter', 'base') });
fam({ id: 'core_point_blank', name: '核心·近距：投射物伤害提高 {v}%（更多），但投射物速度降低 30%', layer: 'core', values: [25, 35, 45], slots: ['weapon', 'amulet'], tags: ['core', 'projectile'],
  make: v => ({ mods: [{ stat: 'damage', op: 'more', value: v, tags: ['projectile'] }, { stat: 'proj.speed', op: 'more', value: -30 }] }) });
fam({ id: 'core_spell_burst', name: '核心·法术迸发：每 {v} 秒积攒 1 次，下一个手动法术按积攒次数重复', layer: 'core', values: [2, 1.6, 1.2], step: 0.1, slots: ['weapon', 'offhand', 'amulet'], tags: ['core', 'spell', 'repeat'],
  make: v => ({ mods: [{ stat: 'burst.max', op: 'base', value: 4 }],
    rules: [
      trig('tick', {}, [{ do: 'gain', res: 'burst', amount: 1 }], { accumulate: { kind: 'periodic', interval: v }, at: 'self' }),
      trig('cast', { tags: ['spell'], notTags: ['triggered'] }, [{ do: 'consume', res: 'burst', as: 'n' }, { do: 'repeat', times: { var: 'n' }, interval: 0.12, actions: [{ do: 'cast', skill: '$event', at: 'target' }] }], {}),
    ] }) });

fam({ id: 'core_firestorm', name: '核心·焚天：被点燃的敌人死亡时从尸体重放你的主技能（每秒最多 {v} 次）', layer: 'core', values: [6, 9, 12], slots: ['amulet', 'chest', 'helmet'], tags: ['core', 'fire', 'trigger'],
  make: v => ({ rules: [trig('kill', { cond: { status: 'ignited', of: 'target' } }, [{ do: 'cast', skill: '$primary', from: 'event', range: 800 }], { role: 'owned', chain: true, at: 'event', limit: { perSecond: v } })] }) });
fam({ id: 'core_absolute_zero', name: '核心·绝对零度：每次击碎都在原地掀起寒潮；对冰冻敌人的冰霜伤害提高 {v}%（更多）', layer: 'core', values: [30, 45, 60], slots: ['amulet', 'chest', 'offhand'], tags: ['core', 'cold', 'freeze', 'shatter'],
  make: v => ({ mods: [{ stat: 'damage', op: 'more', value: v, tags: ['cold'], when: { status: 'frozen', of: 'target' } }, { stat: 'chance.freeze', op: 'base', value: 50, tags: ['triggered'] }],
    rules: [trig('shatter', {}, [{ do: 'cast', skill: 'glacial_burst', from: 'event', range: 400, needTarget: false }], { role: 'owned', chain: true, at: 'event', limit: { perSecond: 20 } })] }) });
fam({ id: 'core_storm_heart', name: '核心·风暴之心：被触发的闪电技能伤害提高 {v}%（更多）并必定感电', layer: 'core', values: [40, 60, 80], slots: ['amulet', 'chest', 'helmet'], tags: ['core', 'lightning', 'trigger'],
  make: v => ({ mods: [{ stat: 'damage', op: 'more', value: v, tags: ['lightning', 'triggered'] }, { stat: 'chance.shock', op: 'base', value: 100, tags: ['triggered'] }] }) });
fam({ id: 'core_plague', name: '核心·瘟疫：中毒敌人死亡时毒层全部转给附近敌人，且从尸体重放你的主技能（每秒最多 {v} 次）', layer: 'core', values: [5, 7, 9], slots: ['amulet', 'chest', 'helmet'], tags: ['core', 'poison', 'trigger'],
  make: v => ({ rules: [trig('kill', { cond: { status: 'poisoned', of: 'target' } }, [{ do: 'spread', status: 'poisoned', radius: 260, max: 3 }], { role: 'owned', chain: true, at: 'event' }),
    trig('kill', { cond: { status: 'poisoned', of: 'target' } }, [{ do: 'cast', skill: '$primary', from: 'event', range: 700 }], { role: 'owned', chain: true, at: 'event', limit: { perSecond: v } })] }) });
fam({ id: 'core_resonance', name: '核心·元素共鸣：反应爆炸使命中的敌人感电并冰缓，反应爆炸范围扩大 {v}%', layer: 'core', values: [60, 90, 120], slots: ['amulet', 'chest'], tags: ['core', 'reaction'],
  make: v => ({ mods: [{ stat: 'area', op: 'more', value: v, tags: ['reaction'] }],
    rules: [trig('hit', { tags: ['reaction'] }, [{ do: 'status', status: 'shocked', magnitude: 0.3, duration: 3 }, { do: 'status', status: 'chilled', magnitude: 0.3, duration: 2 }], { chain: true })] }) });

fam({ id: 'core_avatar_fire', name: '核心·火之化身：全部物理、冰霜、闪电伤害转为火焰，火焰伤害提高 {v}%（更多）', layer: 'core', values: [15, 25, 35], slots: ['amulet', 'chest', 'helmet'], tags: ['core', 'fire', 'conversion'],
  make: v => ({ mods: [{ stat: 'conv.physical.fire', op: 'base', value: 100 }, { stat: 'conv.cold.fire', op: 'base', value: 100 }, { stat: 'conv.lightning.fire', op: 'base', value: 100 }, { stat: 'damage', op: 'more', value: v, tags: ['fire'] }] }) });

fam({ id: 'core_gale', name: '核心·疾风：每个狂怒球使攻击与移动速度提高 {v}%（更多）', layer: 'core', values: [4, 5, 6], slots: ['amulet', 'helmet', 'boots', 'gloves'], tags: ['core', 'charge', 'speed'],
  make: v => ({ mods: [{ stat: 'speed', op: 'more', value: v, tags: ['attack'], per: { res: 'frenzy' } }, { stat: 'moveSpeed', op: 'more', value: v, per: { res: 'frenzy' } }] }) });

fam({ id: 'core_maelstrom', name: '核心·风暴眼：持续区域每秒扩大 25%、持续时间延长 {v}%，结束时爆裂造成 300% 伤害', layer: 'core', values: [30, 45, 60], slots: ['amulet', 'chest', 'helmet'], tags: ['core', 'area', 'duration'],
  make: v => ({ mods: [{ stat: 'zone.growth', op: 'base', value: 25 }, { stat: 'duration', op: 'inc', value: v, tags: ['duration'] }, { stat: 'zone.burst', op: 'base', value: 300 }] }) });

// ================================================================== API
export const families = () => [...FAMILIES.values()];
export const family = id => { const f = FAMILIES.get(id); if (!f) throw new Error(`未知词条族 ${id}`); return f; };

const LINE_CACHE = new Map();
/** A concrete, equippable affix: family at tier t (1-based, clamped to the family's tiers). */
export function affixLine(id, tier) {
  const f = family(id), t = Math.max(1, Math.min(f.levels, tier));
  const key = `${id}#T${t}`;
  let line = LINE_CACHE.get(key);
  if (!line) {
    gameContent(); // registers content-defined stats (burst.max, stage.max…) before compiling
    const v = f.values[t - 1];
    const made = f.make(v);
    line = compileAffix({ id: key, name: f.name.replace('{v}', String(+v.toFixed(2))), tags: [...f.tags, f.layer], mods: made.mods, rules: made.rules, grants: made.grants });
    LINE_CACHE.set(key, line);
  }
  return line;
}

/** Map an item tier (1–10) to the tier a line of this family can have on it. */
export function lineTierFor(id, itemTier) {
  const f = family(id), L = LAYERS[f.layer];
  if (itemTier < L.minItemTier) return 0;
  return Math.max(1, Math.min(f.levels, Math.ceil((itemTier - L.minItemTier + 1) / (11 - L.minItemTier) * f.levels)));
}

/** Total number of distinct lines (family × tier). */
export const lineCount = () => families().reduce((s, f) => s + f.levels, 0);

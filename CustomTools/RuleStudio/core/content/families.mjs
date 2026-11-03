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
const DMG_TAGS = { fire: '火焰', cold: '冰霜', lightning: '闪电', physical: '物理', chaos: '混沌', elemental: '元素', spell: '法术', attack: '攻击', melee: '近战', projectile: '投射物', area: '范围', minion: '召唤物', trap: '陷阱' };
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

// ================================================================== 闪现体系：跳过去 → 落地（blinkLand）触发 → 连锁
// 五种走法：雷闪（落点放电）· 霜刃（路径冻结，击碎再突进）· 残影（起点留下会爆的分身）· 星刃（落点刀环，狂怒越多刀越多）· 虚空（起点撕开裂隙，裂隙杀怪再跃迁）
fam({ id: 'blink_arc', name: '雷迹：闪现落地时放出 {v} 道迹电（每秒最多 8 次）', layer: 'link', values: [1, 1, 2, 2, 3], tags: ['link', 'movement', 'lightning', 'trigger'],
  make: v => ({ rules: [trig('blinkLand', {}, [{ do: 'repeat', times: v, actions: [{ do: 'cast', skill: 'step_arc' }] }], { at: 'nearest', range: 750, chain: true, limit: { perSecond: 8 } })] }) });
fam({ id: 'blink_trail', name: '冰痕：闪现划过的路径凝成冰刃，造成冰痕伤害（{v}%，每秒最多 6 次）', layer: 'link', values: [60, 75, 90, 110, 130], tags: ['link', 'movement', 'cold', 'area', 'trigger'],
  make: v => ({ rules: [trig('blinkLand', {}, [{ do: 'cast', skill: 'frost_trail', at: 'self', mult: v }], { at: 'self', chain: true, limit: { perSecond: 6 } })] }) });
fam({ id: 'shatter_dash', name: '碎冰追击：击碎冰冻敌人时 {v}% 几率立即再施放一次主技能（每秒最多 5 次）', layer: 'link', values: [25, 35, 45, 55, 70], tags: ['link', 'movement', 'cold', 'shatter', 'trigger'],
  make: v => ({ rules: [trig('shatter', {}, [{ do: 'cast', skill: '$primary', at: 'self' }], { role: 'owned', chain: true, at: 'self', accumulate: { kind: 'chance', pct: v }, limit: { perSecond: 5 } })] }) });
fam({ id: 'phantom_count', name: '残影 +{v}：每次闪现额外留下 {v} 个残影', layer: 'form', values: [1, 1, 1, 2, 2, 3], tags: ['form', 'movement', 'minion'],
  make: v => ({ mods: [{ stat: 'summon.count', op: 'base', value: v, tags: ['movement'] }, { stat: 'minion.limit', op: 'base', value: v * 2, tags: ['movement'] }] }) });
fam({ id: 'phantom_corpse', name: '余烬残影：被残影爆炸击杀的敌人 {v}% 几率在尸体处再留下一个残影（每秒最多 6 个）', layer: 'link', values: [45, 55, 65, 75, 90], tags: ['link', 'minion', 'fire', 'trigger'],
  make: v => ({ rules: [trig('kill', { tags: ['phantom'] }, [{ do: 'summon', minion: 'phantom', at: 'event', count: 1, limit: 10 }], { role: 'owned', chain: true, at: 'event', accumulate: { kind: 'chance', pct: v }, limit: { perSecond: 10 } })] }) });
fam({ id: 'blink_knives', name: '落刃：闪现落地时射出一圈刀锋环（{v}% 伤害，每秒最多 6 次）', layer: 'link', values: [60, 75, 90, 110, 130], tags: ['link', 'movement', 'projectile', 'trigger'],
  make: v => ({ rules: [trig('blinkLand', {}, [{ do: 'cast', skill: 'blade_ring', at: 'self', mult: v }], { at: 'self', chain: true, limit: { perSecond: 6 } })] }) });
fam({ id: 'blink_rift', name: '裂隙：闪现起点撕开虚空裂隙，持续吞噬附近敌人（{v}% 伤害，每秒最多 3 个）', layer: 'link', values: [45, 55, 70, 85, 100], tags: ['link', 'movement', 'chaos', 'area', 'trigger'],
  make: v => ({ rules: [trig('blinkLand', {}, [{ do: 'cast', skill: 'void_rift', at: 'self', mult: v }], { at: 'self', chain: true, limit: { perSecond: 3 } })] }) });
fam({ id: 'rift_leap', name: '跃迁回响：被裂隙击杀的敌人 {v}% 几率让你立即再施放一次主技能（每秒最多 4 次）', layer: 'link', values: [12, 16, 20, 25, 30], tags: ['link', 'movement', 'chaos', 'trigger'],
  make: v => ({ rules: [trig('kill', { tags: ['rift'] }, [{ do: 'cast', skill: '$primary', at: 'self' }], { role: 'owned', chain: true, at: 'self', accumulate: { kind: 'chance', pct: v }, limit: { perSecond: 4 } })] }) });
fam({ id: 'core_glacial_rush', name: '核心·冰川疾驰：突进与冰痕必定冰冻，对冰冻敌人的伤害提高 {v}%（更多）', layer: 'core', values: [30, 45, 60], slots: ['amulet', 'chest', 'helmet'], tags: ['core', 'movement', 'cold'],
  make: v => ({ mods: [{ stat: 'chance.freeze', op: 'base', value: 100, tags: ['cold'] }, { stat: 'damage', op: 'more', value: v, when: { status: 'frozen', of: 'target' } }] }) });
fam({ id: 'core_phantom_legion', name: '核心·残影军团：残影爆炸伤害提高 {v}%（更多）并必定点燃，0.4 秒后原地再爆一次', layer: 'core', values: [30, 45, 60], slots: ['amulet', 'chest', 'helmet'], tags: ['core', 'minion', 'fire'],
  make: v => ({ mods: [{ stat: 'damage', op: 'more', value: v, tags: ['phantom'] }, { stat: 'chance.ignite', op: 'base', value: 100, tags: ['phantom'] }],
    rules: [trig('death', { key: 'phantom' }, [{ do: 'area', at: 'event', delay: 0.4, radius: 180, damage: { fire: 30 }, fx: 'flame_burst', tags: ['phantom', 'explosion', 'area', 'fire'] }], { role: 'minion', at: 'event', chain: true, limit: { perSecond: 8 } })] }) });
fam({ id: 'core_shadow_dance', name: '核心·影舞：每个狂怒球使刀锋环 +1 投射物；刀锋环伤害提高 {v}%（更多）并必定中毒', layer: 'core', values: [50, 80, 120], slots: ['amulet', 'helmet', 'gloves'], tags: ['core', 'charge', 'projectile'],
  make: v => ({ mods: [{ stat: 'proj.count', op: 'base', value: 1, tags: ['triggered', 'projectile'], per: { res: 'frenzy' } }, { stat: 'damage', op: 'more', value: v, tags: ['triggered', 'projectile'] },
    { stat: 'chance.poison', op: 'base', value: 100, tags: ['triggered', 'projectile'] }] }) });
fam({ id: 'core_event_horizon', name: '核心·事件视界：裂隙把敌人吸向中心，结束时坍缩造成 300% 伤害；混沌伤害提高 {v}%（更多）', layer: 'core', values: [25, 35, 45], slots: ['amulet', 'chest', 'helmet'], tags: ['core', 'chaos', 'area', 'duration'],
  make: v => ({ mods: [{ stat: 'zone.pull', op: 'base', value: 260, tags: ['rift'] }, { stat: 'zone.burst', op: 'base', value: 300, tags: ['rift'] }, { stat: 'damage', op: 'more', value: v, tags: ['chaos'] }] }) });

// ================================================================== 炸盾体系：能量护盾当燃料
// 三种玩法：盾爆骑士（主动消耗护盾，越满越痛）· 碎盾反击（被打破、充满时自动爆发）· 盾刃弹幕（消耗护盾射刃，命中回盾，循环）
fam({ id: 'es_recharge', name: '能量护盾充能速度提高 {v}%', from: 10, to: 60, slots: ['helmet', 'chest', 'gloves', 'boots', 'offhand', 'amulet', 'belt'], tags: ['defence', 'es'], make: M('es.rechargeRate', 'inc') });
fam({ id: 'es_quick', name: '急充：能量护盾充能延迟缩短 {v}%', layer: 'form', values: [15, 20, 25, 30, 40, 50], tags: ['form', 'defence', 'es'],
  make: v => ({ mods: [{ stat: 'es.rechargeDelay', op: 'more', value: -v }] }) });
fam({ id: 'shield_break_nova', name: '碎盾：能量护盾被打破时掀起碎盾寒潮（{v}% 伤害，冷却 0.4 秒）', layer: 'link', values: [70, 90, 110, 135, 160], tags: ['link', 'es', 'cold', 'trigger', 'defence'],
  make: v => ({ rules: [trig('shieldBreak', {}, [{ do: 'cast', skill: 'shield_shatter', at: 'self', mult: v }], { at: 'self', limit: { cooldown: 0.4 } })] }) });
fam({ id: 'shield_full_pulse', name: '满盾：能量护盾充满时放出满盾电涌（{v}% 伤害）', layer: 'link', values: [70, 90, 110, 135, 160], tags: ['link', 'es', 'lightning', 'trigger'],
  make: v => ({ rules: [trig('shieldFull', {}, [{ do: 'cast', skill: 'shield_pulse', at: 'self', mult: v }], { at: 'self', limit: { cooldown: 0.3 } })] }) });
fam({ id: 'kill_es', name: '汲盾：击杀时回复 {v}% 能量护盾', layer: 'link', values: [1, 1.5, 2, 3, 4], step: 0.5, tags: ['link', 'es', 'kill', 'defence'],
  make: v => ({ rules: [trig('kill', {}, [{ do: 'heal', pool: 'es', pct: v }], { role: 'owned', at: 'self', chain: true, limit: { perSecond: 30 } })] }) });
fam({ id: 'shard_es', name: '回流：消耗护盾的投射物命中时回复 {v} 点能量护盾', layer: 'link', values: [4, 6, 8, 11, 15], tags: ['link', 'es', 'projectile', 'defence'],
  make: v => ({ rules: [trig('hit', { tags: ['shield', 'projectile'] }, [{ do: 'heal', pool: 'es', amount: v }], { at: 'self', chain: true, limit: { perSecond: 40 } })] }) });
fam({ id: 'spend_thunder', name: '盾能外泄：每消耗 {v} 点能量护盾，在附近敌人身上落雷', layer: 'link', values: [120, 100, 80, 65, 50], tags: ['link', 'es', 'lightning', 'trigger'],
  make: v => ({ rules: [trig('poolSpent', { key: 'es' }, [{ do: 'cast', skill: 'thunder_fall' }], { at: 'nearest', range: 600, chain: true, accumulate: { kind: 'meter', amount: { event: 'amount' }, threshold: v }, limit: { perSecond: 12 } })] }) });
fam({ id: 'core_overcharge', name: '核心·过载护盾：能量护盾充能不会被打断；消耗护盾的技能伤害提高 {v}%（更多）', layer: 'core', values: [30, 45, 60], slots: ['amulet', 'chest', 'helmet'], tags: ['core', 'es'],
  make: v => ({ mods: [{ stat: 'es.rechargeDelay', op: 'more', value: -100 }, { stat: 'damage', op: 'more', value: v, tags: ['shield'] }] }) });
fam({ id: 'core_shatterguard', name: '核心·碎盾不息：护盾打破后几乎立刻重新充能，碎盾技能必定冰冻、余震 +2，伤害提高 {v}%（更多）', layer: 'core', values: [30, 45, 60], slots: ['chest', 'offhand', 'amulet'], tags: ['core', 'es', 'cold'],
  make: v => ({ mods: [{ stat: 'es.rechargeDelay', op: 'more', value: -85 }, { stat: 'chance.freeze', op: 'base', value: 100, tags: ['shield'] }, { stat: 'area.cascade', op: 'base', value: 2, tags: ['shield'] }, { stat: 'damage', op: 'more', value: v, tags: ['shield'] }] }) });
fam({ id: 'core_aegis_storm', name: '核心·盾刃风暴：消耗护盾的投射物 +{v} 个、连锁 +1 次', layer: 'core', values: [2, 3, 4], slots: ['amulet', 'chest', 'helmet'], tags: ['core', 'es', 'projectile'],
  make: v => ({ mods: [{ stat: 'proj.count', op: 'base', value: v, tags: ['shield'] }, { stat: 'proj.chain', op: 'base', value: 1, tags: ['shield'] }] }) });

// ================================================================== 召唤体系：十种召唤物，十种走法
// 召唤物只吃 scope:'minion' 的修正（主人身上的修正不会直接加到召唤物身上），所以这里有一组专门给召唤物的数值词条。
const MSLOTS = ['offhand', 'helmet', 'chest', 'amulet', 'gloves', 'ring1', 'ring2', 'belt'];
fam({ id: 'minion_crit', name: '召唤物暴击率提高 {v}%', from: 15, to: 90, slots: MSLOTS, tags: ['offence', 'minion', 'crit'], make: v => ({ mods: [{ stat: 'crit.chance', op: 'inc', value: v, scope: 'minion' }] }) });
fam({ id: 'minion_crit_bonus', name: '召唤物 +{v}% 暴击伤害加成', from: 8, to: 45, slots: MSLOTS, tags: ['offence', 'minion', 'crit'], make: v => ({ mods: [{ stat: 'crit.bonus', op: 'base', value: v, scope: 'minion' }] }) });
for (const [a, n, from] of [['bleed', '流血', 10], ['poison', '中毒', 10], ['ignite', '点燃', 10], ['shock', '感电', 10], ['freeze', '冰冻', 8]])
  fam({ id: `minion_${a}`, name: `召唤物 {v}% ${n}几率`, from, to: from * 4, slots: MSLOTS, tags: ['offence', 'minion', 'ailment', a], make: v => ({ mods: [{ stat: `chance.${a}`, op: 'base', value: v, scope: 'minion' }] }) });
fam({ id: 'minion_dot', name: '召唤物造成的异常伤害提高 {v}%', from: 10, to: 60, slots: MSLOTS, tags: ['offence', 'minion', 'ailment'], make: v => ({ mods: [{ stat: 'ailmentDamage', op: 'inc', value: v, scope: 'minion' }] }) });
fam({ id: 'summon_more', name: '群召：召唤技能每次额外召唤 {v} 个', layer: 'form', values: [1, 1, 1, 2, 2, 3], tags: ['form', 'minion'],
  make: v => ({ mods: [{ stat: 'summon.count', op: 'base', value: v, tags: ['minion', 'spell'] }, { stat: 'minion.limit', op: 'base', value: v * 2, tags: ['minion', 'spell'] }] }) });
fam({ id: 'minion_volley', name: '齐射：召唤物的投射物 +{v}', layer: 'form', values: [1, 1, 2, 2, 3, 3], tags: ['form', 'minion', 'projectile'],
  make: v => ({ mods: [{ stat: 'proj.count', op: 'base', value: v, scope: 'minion' }] }) });
fam({ id: 'minion_pierce', name: '召唤物的投射物穿透 +{v} 个目标', layer: 'form', values: [1, 2, 2, 3, 4, 5], tags: ['form', 'minion', 'projectile'],
  make: v => ({ mods: [{ stat: 'proj.pierce', op: 'base', value: v, scope: 'minion' }] }) });
fam({ id: 'minion_quake', name: '震地：召唤物的范围技能余震 +{v} 次', layer: 'form', values: [1, 1, 1, 2, 2, 3], tags: ['form', 'minion', 'area'],
  make: v => ({ mods: [{ stat: 'area.cascade', op: 'base', value: v, scope: 'minion' }] }) });
fam({ id: 'minion_area', name: '召唤物的范围扩大 {v}%（更多）', layer: 'form', values: [15, 20, 25, 30, 40, 50], tags: ['form', 'minion', 'area'],
  make: v => ({ mods: [{ stat: 'area', op: 'more', value: v, scope: 'minion' }] }) });
fam({ id: 'minion_splash', name: '召唤物打击时溅射周围 {v} 范围', layer: 'form', values: [80, 100, 120, 140, 160, 190], step: 10, tags: ['form', 'minion', 'melee'],
  make: v => ({ mods: [{ stat: 'strike.splash', op: 'base', value: v, scope: 'minion' }] }) });

// 1 灵刃军势：灵刃击杀时分裂出新的灵刃
fam({ id: 'blade_split', name: '分刃：灵刃击杀时 {v}% 几率分裂出一把新灵刃（每秒最多 6 把）', layer: 'link', values: [30, 40, 50, 60, 75], tags: ['link', 'minion', 'kill', 'trigger'],
  make: v => ({ rules: [trig('kill', { skill: 'spirit_slash' }, [{ do: 'summon', minion: 'spirit_blade', at: 'event', count: 1, limit: 14, duration: 8 }], { role: 'minion', chain: true, at: 'event', accumulate: { kind: 'chance', pct: v }, limit: { perSecond: 6 } })] }) });
// 2 风暴图腾阵：图腾的雷击再从目标放出电弧
fam({ id: 'totem_relay', name: '雷网：图腾的雷击命中时 {v}% 几率从目标再放出一道迹电（每秒最多 10 次）', layer: 'link', values: [25, 35, 45, 55, 70], tags: ['link', 'minion', 'lightning', 'trigger'],
  make: v => ({ rules: [trig('hit', { skill: 'totem_bolt' }, [{ do: 'cast', skill: 'step_arc', from: 'event', range: 600 }], { role: 'minion', chain: true, at: 'event', accumulate: { kind: 'chance', pct: v }, limit: { perSecond: 10 } })] }) });
// 3 骸骨大军：骷髅倒下时炸出骨片，被骨片炸死的怪站起来变成骷髅
fam({ id: 'bone_nova', name: '骨爆：骷髅死亡或消散时炸出骨片（{v}% 伤害，每秒最多 10 次）', layer: 'link', values: [70, 90, 110, 135, 160], tags: ['link', 'minion', 'physical', 'trigger'],
  make: v => ({ rules: [trig('death', { key: 'skeleton' }, [{ do: 'cast', skill: 'bone_burst', from: 'event', range: 260, mult: v }], { role: 'minion', chain: true, at: 'event', limit: { perSecond: 60 } })] }) });
// 4 熔火魔像：魔像倒下 / 被换掉时引爆
fam({ id: 'golem_core', name: '熔核：魔像倒下或被重新召唤替换时爆炸，造成其最大生命 {v}% 的火焰伤害', layer: 'link', values: [40, 55, 70, 80, 90], tags: ['link', 'minion', 'fire', 'explosion'],
  make: v => ({ rules: [trig('death', { key: 'flame_golem' }, [{ do: 'area', at: 'event', radius: 380, damage: { fire: { pool: 'life', of: 'target', mul: v / 100 } }, crit: 0, fx: 'flame_burst', tags: ['explosion', 'fire', 'golem'] }], { role: 'minion', at: 'event', chain: true })] }) });
// 6 毒蛛巢母：中毒的敌人死时孵出蜘蛛
fam({ id: 'spider_brood', name: '孵化：中毒敌人死亡时 {v}% 几率孵出一只毒蛛（每秒最多 8 只）', layer: 'link', values: [30, 40, 50, 60, 75], tags: ['link', 'minion', 'poison', 'trigger'],
  make: v => ({ rules: [trig('kill', { cond: { status: 'poisoned', of: 'target' } }, [{ do: 'summon', minion: 'spider', at: 'event', count: 1, limit: 20, duration: 6 }], { role: 'owned', chain: true, at: 'event', accumulate: { kind: 'chance', pct: v }, limit: { perSecond: 8 } })] }) });
// 8 狼群：召唤物击杀叠狼嚎，狼嚎让整群更快更痛
fam({ id: 'pack_howl', name: '狼嚎：召唤物击杀时叠 1 层狼嚎，每层使召唤物伤害与速度提高 {v}%（更多）', layer: 'link', values: [2, 2.5, 3, 3.5, 4], step: 0.5, tags: ['link', 'minion', 'kill', 'speed'],
  make: v => ({ mods: [{ stat: 'damage', op: 'more', value: v, scope: 'minion', per: { res: 'howl', of: 'owner' } }, { stat: 'speed', op: 'more', value: v, scope: 'minion', per: { res: 'howl', of: 'owner' } }],
    rules: [trig('kill', {}, [{ do: 'gain', res: 'howl', amount: 1 }], { role: 'minion', at: 'self', chain: true })] }) });
// 9 血契：召唤物击杀让你回血；你掉的血越多召唤物越凶
fam({ id: 'blood_feast', name: '血宴：召唤物击杀时你回复 {v}% 生命', layer: 'link', values: [1, 1.5, 2, 2.5, 3], step: 0.5, tags: ['link', 'minion', 'kill', 'defence'],
  make: v => ({ rules: [trig('kill', {}, [{ do: 'heal', pct: v }], { role: 'minion', at: 'self', chain: true, limit: { perSecond: 20 } })] }) });
// 10 收魂者：收割击杀从尸体升起怨灵
fam({ id: 'reap_wraith', name: '收魂：你亲手击杀的敌人 {v}% 几率从尸体升起一只怨灵（每秒最多 6 只）', layer: 'link', values: [25, 35, 45, 55, 70], tags: ['link', 'minion', 'chaos', 'trigger'],
  make: v => ({ rules: [trig('kill', {}, [{ do: 'summon', minion: 'wraith', at: 'event', count: 1, limit: 12, duration: 10 }], { role: 'source', chain: true, at: 'event', accumulate: { kind: 'chance', pct: v }, limit: { perSecond: 6 } })] }) });

fam({ id: 'core_blade_storm', name: '核心·剑阵：灵刃上限 +6、更快，溅射周围、伤害提高 {v}%（更多），斩杀的敌人爆出剑气', layer: 'core', values: [60, 90, 120], slots: ['amulet', 'offhand', 'helmet'], tags: ['core', 'minion'],
  make: v => ({ mods: [{ stat: 'speed', op: 'more', value: 40, scope: 'minion' }, { stat: 'moveSpeed', op: 'inc', value: 50, scope: 'minion' }, { stat: 'minion.limit', op: 'base', value: 6 }, { stat: 'strike.splash', op: 'base', value: 170, scope: 'minion' }, { stat: 'damage', op: 'more', value: v, scope: 'minion' }],
    rules: [trig('kill', { anyTags: ['minion', 'blade_wave'] }, [{ do: 'explode', pct: 90, type: 'physical', radius: 210, fx: 'cleave', tags: ['blade_wave'] }], { role: 'owned', chain: true, at: 'event', limit: { perSecond: 80 } })] }) });
fam({ id: 'core_storm_grid', name: '核心·雷阵：+2 图腾上限，图腾雷击连锁 +2，被触发的闪电伤害提高 {v}%（更多），图腾自己的雷击减弱、每一击都引来落雷', layer: 'core', values: [80, 100, 120], slots: ['amulet', 'offhand', 'chest'], tags: ['core', 'minion', 'lightning'],
  make: v => ({ mods: [{ stat: 'minion.limit', op: 'base', value: 2 }, { stat: 'proj.chain', op: 'base', value: 2, scope: 'minion' }, { stat: 'damage', op: 'more', value: v, tags: ['lightning', 'triggered'] }, { stat: 'damage', op: 'more', value: -40, scope: 'minion' }],
    rules: [trig('hit', { skill: 'totem_bolt' }, [{ do: 'cast', skill: 'thunder_fall', from: 'event', range: 300 }], { role: 'minion', chain: true, at: 'event', limit: { perSecond: 16 } })] }) });
fam({ id: 'core_bone_tide', name: '核心·骨潮：被骨爆炸死的敌人站起来成为你的骷髅；骷髅更快，骨爆伤害提高 {v}%（更多）', layer: 'core', values: [70, 100, 130], slots: ['amulet', 'chest', 'helmet'], tags: ['core', 'minion', 'physical'],
  make: v => ({ mods: [{ stat: 'speed', op: 'more', value: 40, scope: 'minion' }, { stat: 'moveSpeed', op: 'inc', value: 50, scope: 'minion' }, { stat: 'damage', op: 'more', value: v, tags: ['bone'] }],
    rules: [trig('kill', { tags: ['bone'] }, [{ do: 'summon', minion: 'skeleton', at: 'event', count: 1, limit: 30, duration: 6 }], { role: 'owned', chain: true, at: 'event', limit: { perSecond: 30 } })] }) });
fam({ id: 'core_molten_heart', name: '核心·熔心：魔像更快，重击必定点燃，魔像击杀的敌人爆炸（其最大生命 70% 火焰）且连环；魔像伤害提高 {v}%（更多）', layer: 'core', values: [60, 80, 100], slots: ['amulet', 'chest', 'offhand'], tags: ['core', 'minion', 'fire'],
  make: v => ({ mods: [{ stat: 'speed', op: 'more', value: 40, scope: 'minion' }, { stat: 'moveSpeed', op: 'inc', value: 50, scope: 'minion' }, { stat: 'chance.ignite', op: 'base', value: 100, scope: 'minion' }, { stat: 'damage', op: 'more', value: v, scope: 'minion' }],
    // Golem kills explode, and the explosions' kills explode again (they carry the 'golem' tag).
    rules: [trig('kill', { tags: ['golem'] }, [{ do: 'explode', pct: 70, type: 'fire', radius: 340, tags: ['explosion', 'golem'] }], { role: 'owned', chain: true, at: 'event', limit: { perSecond: 80 } })] }) });
fam({ id: 'core_phantom_barrage', name: '核心·幽魂弹幕：召唤物的投射物命中时爆炸并连锁 +1，召唤物伤害提高 {v}%（更多）', layer: 'core', values: [25, 35, 45], slots: ['amulet', 'offhand', 'helmet'], tags: ['core', 'minion', 'projectile'],
  make: v => ({ mods: [{ stat: 'proj.explode', op: 'base', value: 130, scope: 'minion' }, { stat: 'proj.chain', op: 'base', value: 1, scope: 'minion' }, { stat: 'damage', op: 'more', value: v, scope: 'minion' }] }) });
fam({ id: 'core_brood_queen', name: '核心·蛛后：毒蛛上限 +10，召唤物必定中毒、中毒伤害提高 {v}%（更多），中毒敌人死时毒层转给附近 5 个敌人', layer: 'core', values: [150, 200, 250], slots: ['amulet', 'chest', 'helmet'], tags: ['core', 'minion', 'poison'],
  make: v => ({ mods: [{ stat: 'minion.limit', op: 'base', value: 10 }, { stat: 'ailmentDamage', op: 'more', value: v, scope: 'minion', tags: ['poison'] }, { stat: 'chance.poison', op: 'base', value: 100, scope: 'minion' }],
    rules: [trig('kill', { cond: { status: 'poisoned', of: 'target' } }, [{ do: 'spread', status: 'poisoned', radius: 280, max: 5 }], { role: 'owned', chain: true, at: 'event' })] }) });
fam({ id: 'core_endless_frost', name: '核心·永冬：击碎冰冻敌人时从碎冰里飞出一只霜灵（每秒最多 14 只）；霜灵伤害提高 {v}%（更多）', layer: 'core', values: [100, 130, 160], slots: ['amulet', 'chest', 'offhand'], tags: ['core', 'minion', 'cold'],
  make: v => ({ mods: [{ stat: 'damage', op: 'more', value: v, scope: 'minion' }],
    rules: [trig('shatter', {}, [{ do: 'summon', minion: 'frost_wisp', at: 'event', count: 1, limit: 24, duration: 4 }], { role: 'owned', chain: true, at: 'event', limit: { perSecond: 14 } })] }) });
fam({ id: 'core_alpha', name: '核心·头狼：狼嚎上限 +20，狼群更快；召唤物击杀时撕开伤口（伤口伤害提高 {v}%，更多），周围敌人流血', layer: 'core', values: [45, 60, 75], slots: ['amulet', 'helmet', 'gloves'], tags: ['core', 'minion', 'bleed'],
  make: v => ({ mods: [{ stat: 'speed', op: 'more', value: 40, scope: 'minion' }, { stat: 'moveSpeed', op: 'inc', value: 50, scope: 'minion' }, { stat: 'howl.max', op: 'base', value: 20 }, { stat: 'damage', op: 'more', value: v, tags: ['bleed_howl'] }],
    rules: [trig('kill', { anyTags: ['minion', 'bleed_howl'] }, [{ do: 'area', at: 'event', radius: 280, damage: { physical: 150 }, crit: 0, fx: 'cleave', tags: ['bleed_howl'] }, { do: 'spread', status: 'bleeding', radius: 200, max: 2 }], { role: 'owned', chain: true, at: 'event', limit: { perSecond: 60 } })] }) });
fam({ id: 'core_blood_rite', name: '核心·血祭：血魔更快、伤害提高 {v}%（更多），血魔击杀时 55% 几率从尸体再召出一只血魔，血魔死亡时爆炸', layer: 'core', values: [60, 85, 110], slots: ['amulet', 'chest', 'helmet'], tags: ['core', 'minion', 'blood'],
  make: v => ({ mods: [{ stat: 'speed', op: 'more', value: 40, scope: 'minion' }, { stat: 'moveSpeed', op: 'inc', value: 50, scope: 'minion' }, { stat: 'damage', op: 'more', value: v, scope: 'minion' }],
    rules: [trig('kill', { skill: 'fiend_claw' }, [{ do: 'summon', minion: 'blood_fiend', at: 'event', count: 1, limit: 12, duration: 8 }], { role: 'minion', chain: true, at: 'event', accumulate: { kind: 'chance', pct: 55 }, limit: { perSecond: 10 } }),trig('death', { key: 'blood_fiend' }, [{ do: 'area', at: 'event', radius: 260, damage: { physical: { pool: 'life', of: 'target', mul: 1.5 } }, crit: 0, fx: 'explode', tags: ['explosion', 'blood'] }], { role: 'minion', at: 'event', chain: true })] }) });
fam({ id: 'core_soul_harvest', name: '核心·灵魂收割：怨灵消散或被打死时，从那里重放你的主技能（每秒最多 {v} 次）', layer: 'core', values: [4, 6, 8], slots: ['amulet', 'chest', 'helmet'], tags: ['core', 'minion', 'chaos', 'trigger'],
  make: v => ({ rules: [trig('death', { key: 'wraith' }, [{ do: 'cast', skill: '$primary', from: 'event', range: 400 }], { role: 'minion', at: 'event', chain: true, limit: { perSecond: v } })] }) });

// ================================================================== 陷阱体系：扔出去、等敌人踩
// 陷阱的伤害都带 'trap' 标签；陷阱触发是 trapTrigger 事件（key = 陷阱种类），远程引爆用 springTraps。
const TSLOTS = ['weapon', 'gloves', 'helmet', 'amulet', 'belt', 'ring1', 'ring2'];
fam({ id: 'trap_speed', name: '陷阱投掷与布设速度提高 {v}%', from: 6, to: 30, slots: TSLOTS, tags: ['offence', 'trap', 'speed'],
  make: v => ({ mods: [{ stat: 'speed', op: 'inc', value: v, tags: ['trap'] }, { stat: 'trap.armSpeed', op: 'inc', value: v * 2 }] }) });
fam({ id: 'trap_reach', name: '陷阱触发范围扩大 {v}%', from: 10, to: 50, slots: TSLOTS, tags: ['offence', 'trap'], make: M('trap.trigger', 'inc') });
fam({ id: 'trap_more', name: '布雷：每次额外扔出 {v} 个陷阱', layer: 'form', values: [1, 1, 2, 2, 3, 3], tags: ['form', 'trap'],
  make: v => ({ mods: [{ stat: 'trap.count', op: 'base', value: v }, { stat: 'trap.limit', op: 'base', value: v * 4 }] }) });
fam({ id: 'trap_rearm', name: '机括：每个陷阱可多触发 {v} 次', layer: 'form', values: [1, 1, 1, 2, 2, 3], tags: ['form', 'trap'], make: M('trap.uses', 'base') });
fam({ id: 'trap_field', name: '雷区：+{v} 陷阱上限，陷阱持续更久', layer: 'form', values: [4, 5, 6, 8, 10, 12], tags: ['form', 'trap', 'duration'],
  make: v => ({ mods: [{ stat: 'trap.limit', op: 'base', value: v }, { stat: 'duration', op: 'inc', value: v * 5, tags: ['trap'] }] }) });

// 1 连爆工兵：一个陷阱炸开，引爆周围的陷阱
fam({ id: 'trap_chain', name: '殉爆：陷阱触发时引爆 {v} 范围内你已布好的其他陷阱（殉爆的威力为 60%）', layer: 'link', values: [200, 240, 280, 320, 380], step: 10, tags: ['link', 'trap', 'trigger'],
  make: v => ({ rules: [trig('trapTrigger', {}, [{ do: 'springTraps', at: 'event', radius: v, mult: 60 }], { role: 'source', at: 'event', chain: true, limit: { perSecond: 40 } })] }) });
// 2 霜冻雷区：击碎的冰块变成新的陷阱
fam({ id: 'shatter_trap', name: '冰雷：击碎冰冻敌人时 {v}% 几率在原地布下一个你的主陷阱（每秒最多 10 个）', layer: 'link', values: [30, 40, 50, 60, 75], tags: ['link', 'trap', 'cold', 'shatter'],
  make: v => ({ rules: [trig('shatter', {}, [{ do: 'cast', skill: '$primary', at: 'event' }], { role: 'source', at: 'event', chain: true, accumulate: { kind: 'chance', pct: v }, limit: { perSecond: 10 } })] }) });
// 3 刃轮绞场：刃轮停转时甩出刀片
fam({ id: 'whirl_shrapnel', name: '崩刃：刃轮停转时向四周甩出刀片（{v}% 伤害）', layer: 'link', values: [45, 55, 70, 85, 100], tags: ['link', 'trap', 'physical', 'projectile'],
  make: v => ({ rules: [trig('zoneEnd', { key: 'blade_whirl' }, [{ do: 'cast', skill: 'blade_shrapnel', from: 'event', range: 500, needTarget: false, mult: v }], { role: 'source', at: 'event', chain: true, limit: { perSecond: 12 } })] }) });
// 4 陷阱猎手：捕兽夹合上时射出一圈弩箭
fam({ id: 'trap_volley', name: '机括连弩：陷阱触发时向四周射出一圈弩箭（{v}% 伤害，每秒最多 12 次）', layer: 'link', values: [80, 100, 120, 140, 170], tags: ['link', 'trap', 'projectile'],
  make: v => ({ rules: [trig('trapTrigger', {}, [{ do: 'cast', skill: 'snare_volley', from: 'event', range: 500, needTarget: false, mult: v }], { role: 'source', at: 'event', chain: true, limit: { perSecond: 12 } })] }) });
// 5 机关师：弩塔散架时就地重新布下机关
fam({ id: 'turret_rebuild', name: '回收：弩塔散架或被毁时 {v}% 几率在原地重新布下一个机关陷阱', layer: 'link', values: [25, 35, 45, 55, 70], tags: ['link', 'trap', 'minion'],
  make: v => ({ rules: [trig('death', { key: 'ballista' }, [{ do: 'cast', skill: '$primary', at: 'event' }], { role: 'minion', at: 'event', chain: true, accumulate: { kind: 'chance', pct: v }, limit: { perSecond: 8 } })] }) });
// 6 雷网织者：陷阱之间拉电弧
fam({ id: 'trap_web', name: '电网：陷阱触发时与 {v} 范围内你的每个陷阱之间拉出一道电弧', layer: 'link', values: [320, 360, 400, 450, 500], step: 10, tags: ['link', 'trap', 'lightning'],
  make: v => ({ rules: [trig('trapTrigger', {}, [{ do: 'eachTrap', at: 'event', radius: v, max: 8, onEach: [{ do: 'area', shape: 'line', at: 'origin', radius: { var: 'dist' }, width: 80, mult: 80, fx: 'lightning_line', tags: ['web'] }] }],
    { role: 'source', at: 'event', chain: true, limit: { perSecond: 30 } })] }) });

fam({ id: 'core_powder_keg', name: '核心·火药桶：每次多扔 2 个陷阱、上限 +12；陷阱伤害提高 {v}%（更多），每次爆炸再向四周抛出 2 个子雷', layer: 'core', values: [50, 70, 90], slots: ['amulet', 'gloves', 'helmet'], tags: ['core', 'trap', 'fire'],
  make: v => ({ mods: [{ stat: 'trap.count', op: 'base', value: 2 }, { stat: 'trap.limit', op: 'base', value: 12 }, { stat: 'damage', op: 'more', value: v, tags: ['trap'] }],
    rules: [trig('trapTrigger', { key: 'fire_trap' }, [{ do: 'cast', skill: '$primary', at: 'event' }, { do: 'cast', skill: '$primary', at: 'event' }], { role: 'source', at: 'event', chain: true, limit: { perSecond: 14 } })] }) });
fam({ id: 'core_permafrost', name: '核心·永冻雷区：陷阱必定冰冻；击碎冰冻敌人时必定再布一颗陷阱；冰霜伤害提高 {v}%（更多）', layer: 'core', values: [50, 70, 90], slots: ['amulet', 'helmet', 'chest'], tags: ['core', 'trap', 'cold'],
  make: v => ({ mods: [{ stat: 'chance.freeze', op: 'base', value: 100, tags: ['trap'] }, { stat: 'damage', op: 'more', value: v, tags: ['cold'] }],
    rules: [trig('shatter', {}, [{ do: 'cast', skill: '$primary', at: 'event' }], { role: 'source', at: 'event', chain: true, limit: { perSecond: 20 } })] }) });
fam({ id: 'core_meat_grinder', name: '核心·绞肉场：刃轮把周围的怪拽进来，绞死的怪崩出一圈刀片，停转时在原地重新布下刃轮陷阱；陷阱伤害提高 {v}%（更多），刀片再翻倍', layer: 'core', values: [40, 60, 80], slots: ['amulet', 'gloves', 'chest'], tags: ['core', 'trap', 'physical'],
  make: v => ({ mods: [{ stat: 'zone.pull', op: 'base', value: 180, tags: ['trap'] }, { stat: 'damage', op: 'more', value: v, tags: ['trap'] }, { stat: 'damage', op: 'more', value: 100, tags: ['trap', 'projectile'] }],
    rules: [trig('zoneEnd', { key: 'blade_whirl' }, [{ do: 'cast', skill: '$primary', at: 'event' }], { role: 'source', at: 'event', chain: true, limit: { perSecond: 10 } }),
      trig('kill', { tags: ['trap', 'physical'] }, [{ do: 'cast', skill: 'blade_shrapnel', from: 'event', range: 400, mult: 150 }], { role: 'source', at: 'event', chain: true, limit: { perSecond: 60 } })] }) });
fam({ id: 'core_hunting_ground', name: '核心·猎场：陷阱触发时朝最近的敌人重放你的主技能（每秒最多 {v} 次），陷阱更快布好', layer: 'core', values: [10, 13, 16], slots: ['amulet', 'gloves', 'helmet'], tags: ['core', 'trap', 'trigger'],
  make: v => ({ mods: [{ stat: 'trap.armSpeed', op: 'more', value: 100 }],
    rules: [trig('trapTrigger', {}, [{ do: 'cast', skill: '$primary', from: 'event', range: 700 }], { role: 'source', at: 'event', chain: true, limit: { perSecond: v } })] }) });
fam({ id: 'core_siege_works', name: '核心·攻城机关：弩塔上限 +6，弩塔射死的怪炸开（其最大生命 60% 物理）并原地变成机关陷阱；弩塔伤害提高 {v}%（更多）', layer: 'core', values: [60, 80, 100], slots: ['amulet', 'chest', 'helmet'], tags: ['core', 'trap', 'minion'],
  make: v => ({ mods: [{ stat: 'minion.limit', op: 'base', value: 6 }, { stat: 'damage', op: 'more', value: v, scope: 'minion' }],
    rules: [trig('kill', { skill: 'ballista_bolt' }, [{ do: 'cast', skill: '$primary', at: 'event' }], { role: 'minion', at: 'event', chain: true, limit: { perSecond: 8 } }),
      trig('kill', { anyTags: ['minion', 'siege'] }, [{ do: 'explode', pct: 60, type: 'physical', radius: 230, tags: ['siege'] }], { role: 'owned', at: 'event', chain: true, limit: { perSecond: 60 } })] }) });
fam({ id: 'core_tesla_grid', name: '核心·特斯拉阵：每次多扔 2 个陷阱、上限 +10、范围扩大 30%，陷阱不再被踩坏（+4 次触发、重新布设更快），感电的敌人死时引爆最近的一颗陷阱；电网电弧必定感电，陷阱伤害提高 {v}%（更多）', layer: 'core', values: [180, 220, 260], slots: ['amulet', 'chest', 'gloves'], tags: ['core', 'trap', 'lightning'],
  make: v => ({ mods: [{ stat: 'trap.count', op: 'base', value: 2 }, { stat: 'trap.limit', op: 'base', value: 10 }, { stat: 'area', op: 'more', value: 30, tags: ['trap'] }, { stat: 'trap.uses', op: 'base', value: 4 }, { stat: 'trap.armSpeed', op: 'more', value: 60 }, { stat: 'chance.shock', op: 'base', value: 100, tags: ['web'] }, { stat: 'damage', op: 'more', value: v, tags: ['trap'] }],
    rules: [trig('kill', { cond: { status: 'shocked', of: 'target' } }, [{ do: 'springTraps', at: 'event', radius: 400, max: 2, delay: 0.05 }], { role: 'source', at: 'event', chain: true, limit: { perSecond: 20 } })] }) });

// ================================================================== 新机制：点一下，后面的事自己发生
// 1 多米诺：引信 → 引爆 → 炸到的怪再被点上引信
fam({ id: 'fuse_quick', name: '短引信：引信燃烧速度提高 {v}%', layer: 'form', values: [15, 20, 25, 30, 40, 50], tags: ['form', 'fire', 'domino'], make: M('fuse.speed', 'inc') });
fam({ id: 'domino_chain', name: '多米诺：引爆命中的敌人 {v}% 几率被点上引信，接着炸开（每秒最多 50 次）', layer: 'link', values: [35, 45, 55, 65, 80], tags: ['link', 'fire', 'trigger', 'domino'],
  make: v => ({ rules: [trig('hit', { skill: 'fuse_blast', cond: { not: { status: 'primed', of: 'target' } } }, [{ do: 'fuse', status: 'primed', time: 0.8, then: [{ do: 'cast', skill: 'fuse_blast', at: 'aim' }] }], { role: 'source', chain: true, accumulate: { kind: 'chance', pct: v }, limit: { perSecond: 50 } })] }) });
fam({ id: 'primed_death', name: '殉爆：带引信的敌人被打死时立刻炸开（{v}% 伤害，每秒最多 30 次）', layer: 'link', values: [70, 85, 100, 120, 140], tags: ['link', 'fire', 'kill', 'domino'],
  make: v => ({ rules: [trig('kill', { cond: { status: 'primed', of: 'target' } }, [{ do: 'cast', skill: 'fuse_blast', at: 'event', mult: v }], { role: 'owned', chain: true, at: 'event', limit: { perSecond: 30 } })] }) });
fam({ id: 'core_domino', name: '核心·连环爆破：引爆必定点上引信，引信快 50%，引爆伤害提高 {v}%（更多）；每次引爆向最近的两个敌人射出引信弹', layer: 'core', values: [60, 80, 100], slots: ['amulet', 'gloves', 'helmet'], tags: ['core', 'fire', 'domino'],
  make: v => ({ mods: [{ stat: 'fuse.speed', op: 'more', value: 50 }, { stat: 'damage', op: 'more', value: v, tags: ['domino'] }],
    rules: [trig('hit', { skill: 'fuse_blast', cond: { not: { status: 'primed', of: 'target' } } }, [{ do: 'fuse', status: 'primed', time: 0.8, then: [{ do: 'cast', skill: 'fuse_blast', at: 'aim' }] }], { role: 'source', chain: true, limit: { perSecond: 80 } }),
      trig('cast', { skill: 'fuse_blast' }, [{ do: 'cast', skill: 'fuse_bolt', from: 'event', range: 600 }, { do: 'cast', skill: 'fuse_bolt', from: 'event', range: 600 }], { role: 'source', chain: true, at: 'event', limit: { perSecond: 8 } })] }) });

// 2 林地：种子长成树，树打死的怪原地发芽，树越打越大
fam({ id: 'seed_spread', name: '播撒：荆棘树击杀时 {v}% 几率在尸体处长出一棵新树（每秒最多 6 棵）', layer: 'link', values: [20, 28, 36, 45, 55], tags: ['link', 'minion', 'kill', 'trigger'],
  make: v => ({ rules: [trig('kill', { skill: 'thorn_volley' }, [{ do: 'summon', minion: 'treant', at: 'event', count: 1, limit: 3, duration: 8 }], { role: 'minion', chain: true, at: 'event', accumulate: { kind: 'chance', pct: v }, limit: { perSecond: 6 } })] }) });
fam({ id: 'overgrowth', name: '疯长：荆棘树每击杀一个敌人叠一层疯长（每层伤害提高 10%（更多）、范围与速度提高；最多 12 层），召唤物伤害提高 {v}%', layer: 'link', values: [10, 15, 20, 25, 30], tags: ['link', 'minion', 'kill'],
  make: v => ({ mods: [{ stat: 'damage', op: 'inc', value: v, scope: 'minion' }], rules: [trig('kill', { skill: 'thorn_volley' }, [{ do: 'status', status: 'overgrown', on: 'eventSource' }], { role: 'minion', chain: true })] }) });
fam({ id: 'thorn_burst', name: '荆爆：荆棘打死的敌人爆出一圈荆刺（{v}% 伤害，每秒最多 30 次）', layer: 'link', values: [80, 100, 120, 145, 170], tags: ['link', 'minion', 'physical', 'kill'],
  make: v => ({ rules: [trig('kill', { anyTags: ['thorn'] }, [{ do: 'cast', skill: 'thorn_ring', from: 'event', range: 500, needTarget: false, mult: v }], { role: 'owned', chain: true, at: 'event', limit: { perSecond: 30 } })] }) });
fam({ id: 'core_world_tree', name: '核心·万木林：荆棘树上限 +5，树倒下或枯萎时向四周撒下 2 颗种子；荆棘必定中毒、毒伤与荆爆伤害提高 {v}%（更多），树自己的荆棘减弱', layer: 'core', values: [100, 130, 160], slots: ['amulet', 'chest', 'helmet'], tags: ['core', 'minion', 'physical'],
  make: v => ({ mods: [{ stat: 'minion.limit', op: 'base', value: 5 }, { stat: 'damage', op: 'more', value: -35, scope: 'minion' }, { stat: 'chance.poison', op: 'base', value: 100, scope: 'minion' }, { stat: 'ailmentDamage', op: 'more', value: v, scope: 'minion' }, { stat: 'damage', op: 'more', value: v, tags: ['thorn', 'triggered'] }],
    rules: [trig('death', { key: 'treant' }, [{ do: 'summon', minion: 'treant', at: 'event', count: 2, limit: 3, duration: 6 }], { role: 'minion', chain: true, at: 'event', limit: { perSecond: 3 } })] }) });

// 3 引力奇点：吞下的怪越多，奇点越大越久，坍缩越狠
fam({ id: 'singularity_feed', name: '吞噬：在奇点里死掉的敌人让奇点变大、多撑 0.25 秒、坍缩伤害提高 {v}%', layer: 'link', values: [4, 5, 6, 7, 8], tags: ['link', 'chaos', 'area', 'kill'],
  make: v => ({ rules: [trig('kill', { skill: 'singularity' }, [{ do: 'feedZones', kind: 'singularity', at: 'event', grow: 10, extend: 0.25, maxTime: 6, burst: v }], { role: 'source', chain: true, at: 'event' })] }) });
fam({ id: 'collapse_link', name: '坍缩：奇点消失时向内坍缩爆开（{v}% 伤害，吞下的每个敌人再 +12%）', layer: 'link', values: [50, 60, 70, 80, 95], tags: ['link', 'chaos', 'area', 'trigger'],
  make: v => ({ rules: [trig('zoneEnd', { key: 'singularity' }, [{ do: 'cast', skill: 'collapse', at: 'event', mult: v }], { role: 'source', chain: true, at: 'event', limit: { perSecond: 10 } })] }) });
fam({ id: 'core_black_hole', name: '核心·黑洞：奇点吸力翻倍；坍缩伤害提高 {v}%（更多），坍缩的地方再撕开一个小奇点（每秒最多 2 次）', layer: 'core', values: [60, 80, 100], slots: ['amulet', 'gloves', 'helmet'], tags: ['core', 'chaos', 'area'],
  make: v => ({ mods: [{ stat: 'zone.pull', op: 'more', value: 100 }, { stat: 'damage', op: 'more', value: v, tags: ['triggered', 'chaos'] }],
    rules: [trig('zoneEnd', { key: 'singularity' }, [{ do: 'cast', skill: 'singularity', at: 'event' }], { role: 'source', chain: true, at: 'event', limit: { perSecond: 2 } })] }) });

// 4 统御：抽死的怪站起来为你作战，带着它原本的精英词缀
fam({ id: 'dominate_kill', name: '统御：统御之鞭打死的敌人 {v}% 几率站起来成为你的仆从（带着它原本的精英词缀；最多 4 个）', layer: 'link', values: [25, 35, 45, 55, 70], tags: ['link', 'minion', 'kill', 'chaos'],
  make: v => ({ rules: [trig('kill', { skill: 'dominion_lash' }, [{ do: 'dominate', limit: 4, life: 150 }], { role: 'source', chain: true, accumulate: { kind: 'chance', pct: v }, limit: { perSecond: 8 } })] }) });
fam({ id: 'thrall_rally', name: '号令：仆从打死的敌人 {v}% 几率也站起来成为仆从（每秒最多 4 个）', layer: 'link', values: [20, 28, 36, 45, 55], tags: ['link', 'minion', 'kill'],
  make: v => ({ rules: [trig('kill', {}, [{ do: 'dominate', limit: 4, life: 120 }], { role: 'minion', chain: true, accumulate: { kind: 'chance', pct: v }, limit: { perSecond: 4 } })] }) });
fam({ id: 'core_legion', name: '核心·万军之主：仆从上限 +8，统御之鞭打死的必定站起来；仆从更快，伤害提高 {v}%（更多），仆从打死的怪爆炸（其最大生命 40%）且连环', layer: 'core', values: [80, 110, 140], slots: ['amulet', 'chest', 'helmet'], tags: ['core', 'minion', 'chaos'],
  make: v => ({ mods: [{ stat: 'minion.limit', op: 'base', value: 8 }, { stat: 'speed', op: 'more', value: 30, scope: 'minion' }, { stat: 'moveSpeed', op: 'inc', value: 40, scope: 'minion' }, { stat: 'damage', op: 'more', value: v, scope: 'minion' }],
    rules: [trig('kill', { skill: 'dominion_lash' }, [{ do: 'dominate', limit: 4, life: 150 }], { role: 'source', chain: true, limit: { perSecond: 10 } }),
      trig('kill', {}, [{ do: 'explode', pct: 55, type: 'chaos', radius: 320, tags: ['explosion', 'legion'] }], { role: 'minion', chain: true, at: 'event', limit: { perSecond: 80 } }),
      trig('kill', { tags: ['legion'] }, [{ do: 'explode', pct: 55, type: 'chaos', radius: 320, tags: ['explosion', 'legion'] }], { role: 'source', chain: true, at: 'event', limit: { perSecond: 80 } })] }) });

// 5 雷云：雷云打死的怪分裂出小雷云
fam({ id: 'cloud_split', name: '分云：雷云击杀时 {v}% 几率分裂出一朵新雷云（每秒最多 5 朵）', layer: 'link', values: [25, 35, 45, 55, 70], tags: ['link', 'minion', 'lightning', 'kill'],
  make: v => ({ rules: [trig('kill', { skill: 'cloud_bolt' }, [{ do: 'summon', minion: 'thundercloud', at: 'event', count: 1, limit: 3, duration: 5 }], { role: 'minion', chain: true, at: 'event', accumulate: { kind: 'chance', pct: v }, limit: { perSecond: 5 } })] }) });
fam({ id: 'cloud_chain', name: '云间电弧：雷云的落雷命中感电敌人时从那里弹出电弧（{v}% 伤害，每秒最多 14 次）', layer: 'link', values: [70, 85, 100, 120, 140], tags: ['link', 'minion', 'lightning', 'trigger'],
  make: v => ({ rules: [trig('hit', { skill: 'cloud_bolt', cond: { status: 'shocked', of: 'target' } }, [{ do: 'cast', skill: 'cloud_arc', from: 'event', range: 600, mult: v }], { role: 'minion', chain: true, at: 'event', limit: { perSecond: 14 } })] }) });
fam({ id: 'core_storm_court', name: '核心·雷霆天庭：雷云上限 +5，击杀必定分裂，落雷必定感电，感电的怪死时引来两道落雷；引来的落雷伤害提高 {v}%（更多），雷云自己的落雷减弱，散去时落下一道巨雷', layer: 'core', values: [150, 190, 230], slots: ['amulet', 'chest', 'helmet'], tags: ['core', 'minion', 'lightning'],
  make: v => ({ mods: [{ stat: 'minion.limit', op: 'base', value: 5 }, { stat: 'damage', op: 'more', value: -25, scope: 'minion' }, { stat: 'chance.shock', op: 'base', value: 100, scope: 'minion' }, { stat: 'chance.shock', op: 'base', value: 100, tags: ['lightning', 'triggered'] }, { stat: 'speed', op: 'more', value: 40, scope: 'minion' }, { stat: 'moveSpeed', op: 'inc', value: 40, scope: 'minion' }, { stat: 'damage', op: 'more', value: v, tags: ['lightning', 'triggered'] }, { stat: 'area', op: 'more', value: 50, tags: ['lightning', 'triggered'] }],
    rules: [trig('kill', { skill: 'cloud_bolt' }, [{ do: 'summon', minion: 'thundercloud', at: 'event', count: 1, limit: 3, duration: 5 }], { role: 'minion', chain: true, at: 'event', limit: { perSecond: 8 } }),
      trig('kill', { skill: 'cloud_bolt' }, [{ do: 'cast', skill: 'thunder_fall', from: 'event', range: 300 }], { role: 'minion', chain: true, at: 'event', limit: { perSecond: 60 } }),
      trig('kill', { cond: { status: 'shocked', of: 'target' } }, [{ do: 'cast', skill: 'thunder_fall', from: 'event', range: 300 }, { do: 'cast', skill: 'thunder_fall', from: 'event', range: 450 }], { role: 'owned', chain: true, at: 'event', limit: { perSecond: 80 } }),
      trig('death', { key: 'thundercloud' }, [{ do: 'cast', skill: 'thunder_fall', from: 'event', range: 300, needTarget: false }], { role: 'minion', chain: true, at: 'event', limit: { perSecond: 6 } })] }) });

// 6 回声：你 2 秒前站的地方，幽影把你的施法再来一遍
fam({ id: 'echo_ghost', name: '回声：你的每次施法在 2 秒后从你当时的位置重放一次（{v}% 伤害）', layer: 'link', values: [60, 70, 80, 90, 100], tags: ['link', 'spell', 'echo', 'trigger'],
  make: v => ({ rules: [trig('cast', { notTags: ['triggered'], tags: ['spell'] }, [{ do: 'delay', time: 2, then: [{ do: 'cast', skill: '$event', from: 'recorded', mult: v }] }], { role: 'source', chain: true, limit: { perSecond: 6 } })] }) });
fam({ id: 'echo_second', name: '二重回声：每次施法在 4 秒后再从当时的位置重放一次（{v}% 伤害）', layer: 'link', values: [50, 60, 70, 80, 90], tags: ['link', 'spell', 'echo', 'trigger'],
  make: v => ({ rules: [trig('cast', { notTags: ['triggered'], tags: ['spell'] }, [{ do: 'delay', time: 4, then: [{ do: 'cast', skill: '$event', from: 'recorded', mult: v }] }], { role: 'source', chain: true, limit: { perSecond: 6 } })] }) });
fam({ id: 'core_echo_hall', name: '核心·回声长廊：每次施法在 6 秒后再重放一次；回声伤害提高 {v}%（更多），每个回声出现时在幽影脚下炸开一圈寒环', layer: 'core', values: [50, 70, 90], slots: ['amulet', 'gloves', 'helmet'], tags: ['core', 'spell', 'echo', 'cold'],
  make: v => ({ mods: [{ stat: 'damage', op: 'more', value: v, tags: ['triggered', 'cold'] }],
    rules: [trig('cast', { notTags: ['triggered'], tags: ['spell'] }, [{ do: 'delay', time: 6, then: [{ do: 'cast', skill: '$event', from: 'recorded' }] }], { role: 'source', chain: true, limit: { perSecond: 6 } }),
      trig('remoteCast', { skill: 'rime_lance' }, [{ do: 'cast', skill: 'echo_nova', at: 'event' }], { role: 'source', chain: true, at: 'event', limit: { perSecond: 8 } })] }) });

// ================================================================== 宝库：身后的门射出无数兵器
fam({ id: 'gate_more', name: '开库：宝库之门 +{v} 扇', layer: 'form', values: [1, 1, 2, 2, 3, 3], tags: ['form', 'projectile', 'gate'], make: M('gate.count', 'base') });
fam({ id: 'gate_rate', name: '连射：门里射出兵器的速度提高 {v}%', layer: 'form', values: [15, 20, 25, 30, 40, 50], tags: ['form', 'projectile', 'gate', 'speed'], make: M('gate.rate', 'inc') });
fam({ id: 'treasure_recall', name: '回收：宝具击杀时 {v}% 几率从尸体上空打开一扇门，射向最近的敌人（每秒最多 14 次）', layer: 'link', values: [30, 40, 50, 60, 75], tags: ['link', 'projectile', 'kill', 'trigger'],
  make: v => ({ rules: [trig('kill', { anyTags: ['gate', 'treasure'] }, [{ do: 'cast', skill: 'treasure_shot', from: 'event', range: 600 }], { role: 'source', chain: true, at: 'event', accumulate: { kind: 'chance', pct: v }, limit: { perSecond: 14 } })] }) });
fam({ id: 'heaven_chain', name: '天之锁：宝具命中时 {v}% 几率用锁链锁住敌人 2 秒（不能移动，受到的伤害提高 25%）', layer: 'link', values: [10, 14, 18, 22, 28], tags: ['link', 'projectile', 'gate'],
  make: v => ({ rules: [trig('hit', { anyTags: ['gate', 'treasure'] }, [{ do: 'status', status: 'chained' }], { role: 'source', chain: true, accumulate: { kind: 'chance', pct: v }, limit: { perSecond: 30 } })] }) });
fam({ id: 'treasure_rain', name: '倾泻：宝具每命中 {v} 次，就在被命中的敌人头顶落下一把（每秒最多 20 次）', layer: 'link', values: [6, 5, 4, 4, 3], tags: ['link', 'area', 'gate', 'trigger'],
  make: v => ({ rules: [trig('hit', { anyTags: ['gate', 'treasure'], notTags: ['area'] }, [{ do: 'cast', skill: 'treasure_fall', at: 'target' }], { role: 'source', chain: true, accumulate: { kind: 'count', n: v }, limit: { perSecond: 20 } })] }) });
fam({ id: 'core_sundering', name: '核心·开天：+2 扇门；每施放 4 次宝库之门，从正中打开乖离之门，放出一道贯穿整屏的开天之光；宝具伤害提高 {v}%（更多）', layer: 'core', values: [40, 55, 70], slots: ['amulet', 'gloves', 'helmet'], tags: ['core', 'physical', 'gate'],
  make: v => ({ mods: [{ stat: 'gate.count', op: 'base', value: 2 }, { stat: 'damage', op: 'more', value: v, tags: ['physical'] }],
    rules: [trig('cast', { skill: 'gate_of_treasures', notTags: ['triggered'] }, [{ do: 'cast', skill: 'sundering_star', at: 'event' }], { role: 'source', at: 'event', accumulate: { kind: 'count', n: 4 } })] }) });

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

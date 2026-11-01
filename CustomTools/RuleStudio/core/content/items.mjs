// 装备：10 个部位 × 底材。基底 3 条：第 1 条可能是主动技能，其余是从特性池（形态/联动/核心）随机的特性；
// 随机词条至多 6 条，只出攻击与防御数值。分层掉落；洗炼通货。
// 一切随机都走传入的 rng，存档里只存 { 底材, T 阶, 技能, 词条族 + 词条 T 阶 }，词条效果由 families.mjs 现算。
import { SLOTS, LAYERS, families, family, affixLine, lineTierFor } from './families.mjs';
import { compileAffix } from '../content.mjs';
import { LEGENDARIES, legendary, legendAffix } from './legendaries.mjs';
import { patchList, patchMap } from './overrides.mjs';

export const SLOT_NAMES = Object.freeze({ weapon: '武器', offhand: '副手', helmet: '头盔', chest: '胸甲', gloves: '手套', boots: '鞋子', belt: '腰带', amulet: '项链', ring1: '戒指', ring2: '戒指' });
export const RARITY = Object.freeze([
  { id: 'normal', name: '普通', color: '#c8c8c8' }, { id: 'magic', name: '魔法', color: '#7aa8ff' },
  { id: 'rare', name: '稀有', color: '#ffd75e' }, { id: 'exalted', name: '传世', color: '#ff9a4d' },
  { id: 'legendary', name: '传奇', color: '#ff7a2a' },
]);
export const MAX_LINES = 6;
/** Every item has three base lines: an active skill (weapons always, other slots sometimes) and traits. */
export const BASE_LINES = 3;
export const TRAIT_LAYERS = Object.freeze(['form', 'link', 'core']);
export const isTrait = fid => TRAIT_LAYERS.includes(family(fid).layer);

const SPELLS = ['fireball', 'ice_nova', 'arc', 'spark', 'frost_bolt', 'flame_wall', 'summon_blades', 'storm_totem_place'];
const ATTACKS = ['heavy_strike', 'cleave', 'cyclone', 'falling_thunder', 'flicker_strike', 'viper_knives'];
/** Skills that can appear as an item's first base line. */
export const ITEM_SKILLS = Object.freeze([...SPELLS, ...ATTACKS]);
/** Chance that a non-weapon item of this slot carries an active skill. */
const SKILL_CHANCE = { weapon: 1, offhand: 0.45, helmet: 0.3, gloves: 0.3, boots: 0.25, amulet: 0.3 };

/** Bases per slot: a name and the skills its first base line can roll. */
const RAW_BASES = {
  weapon: [
    { id: 'war_staff', name: '战杖', skills: ['ice_nova', 'arc', 'flame_wall', 'storm_totem_place', 'fireball'] },
    { id: 'wand', name: '法杖', skills: ['fireball', 'spark', 'frost_bolt', 'arc'] },
    { id: 'maul', name: '重锤', skills: ['heavy_strike', 'falling_thunder', 'cleave', 'cyclone'] },
    { id: 'dagger', name: '匕首', skills: ['flicker_strike', 'viper_knives', 'cyclone', 'heavy_strike'] },
  ],
  offhand: [
    { id: 'tower_shield', name: '塔盾', def: 'armour', skills: ATTACKS }, { id: 'focus', name: '法器', def: 'es', skills: SPELLS }, { id: 'quiver', name: '箭袋', def: 'evasion', skills: ['viper_knives', 'spark', 'fireball'] },
  ],
  helmet: [{ id: 'iron_helm', name: '铁盔', def: 'armour', skills: ITEM_SKILLS }, { id: 'silk_hood', name: '丝帽', def: 'es', skills: SPELLS }, { id: 'leather_cap', name: '皮帽', def: 'evasion', skills: ATTACKS }],
  chest: [{ id: 'plate', name: '板甲', def: 'armour', skills: [] }, { id: 'robe', name: '法袍', def: 'es', skills: [] }, { id: 'leather', name: '皮衣', def: 'evasion', skills: [] }],
  gloves: [{ id: 'gauntlets', name: '铁手', def: 'armour', skills: ATTACKS }, { id: 'silk_gloves', name: '丝手', def: 'es', skills: SPELLS }, { id: 'wraps', name: '缠手', def: 'evasion', skills: ITEM_SKILLS }],
  boots: [{ id: 'greaves', name: '铁靴', def: 'armour', skills: ['flicker_strike', 'cyclone'] }, { id: 'slippers', name: '丝靴', def: 'es', skills: ['ice_nova', 'flame_wall'] }, { id: 'treads', name: '皮靴', def: 'evasion', skills: ['flicker_strike', 'viper_knives'] }],
  belt: [{ id: 'heavy_belt', name: '重带', def: 'life', skills: [] }, { id: 'chain_belt', name: '链带', def: 'life', skills: [] }],
  amulet: [{ id: 'jade_amulet', name: '玉坠', skills: SPELLS }, { id: 'onyx_amulet', name: '玛瑙坠', skills: ITEM_SKILLS }],
  ring1: [{ id: 'ruby_ring', name: '红玉戒', skills: [] }, { id: 'sapphire_ring', name: '蓝玉戒', skills: [] }, { id: 'topaz_ring', name: '黄玉戒', skills: [] }],
};
/** Edited per slot (the editor's 「装备基底」 shows one card per base). */
export const BASES = Object.freeze(Object.fromEntries(Object.entries(RAW_BASES).map(([slot, list]) => [slot, patchList(`bases.${slot}`, list)])));
/** Base defences (not lines): every armour piece protects by its base type and item tier, and adds some life. */
const BASE_DEF = { armour: ['armour', 32, '护甲'], evasion: ['evasion', 32, '闪避'], es: ['es', 10, '能量护盾'], life: ['life', 14, '最大生命'] };
const BIG_SLOT = { chest: 2, offhand: 1.2 };
export function baseDefence(item) {
  const kind = baseOf(item.slot, item.base)?.def;
  if (!kind) return [];
  const k = BIG_SLOT[item.slot] ?? 1, [stat, per, name] = BASE_DEF[kind];
  const out = [{ stat, name, value: Math.round(per * item.tier * k) }];
  if (kind !== 'life') out.push({ stat: 'life', name: '最大生命', value: Math.round(8 * item.tier * k) });
  return out;
}
const BASE_CACHE = new Map();
function baseAffix(item) {
  const d = baseDefence(item);
  if (!d.length) return null;
  const key = `base:${d.map(x => `${x.stat}${x.value}`).join(':')}`;
  if (!BASE_CACHE.has(key)) BASE_CACHE.set(key, compileAffix({ id: key, name: `底材：${d.map(x => `+${x.value} ${x.name}`).join('，')}`, tags: ['base'], mods: d.map(x => ({ stat: x.stat, op: 'base', value: x.value })) }));
  return BASE_CACHE.get(key);
}
/** The base of a slot for a preset: one that can carry the skill, else one with the wanted defence. */
export function presetBase(slot, skill, defKind) {
  const list = baseList(slot);
  return (skill && list.find(b => b.skills.includes(skill))) || list.find(b => b.def === defKind) || list[0];
}

// The second ring slot uses the same bases.
export const baseList = slot => BASES[slot === 'ring2' ? 'ring1' : slot];
export const baseOf = (slot, id) => baseList(slot).find(b => b.id === id) ?? null;
/** A base of this slot whose skill pool has the skill (for presets). */
export const baseForSkill = (slot, skill) => baseList(slot).find(b => b.skills.includes(skill)) ?? baseList(slot)[0];

/** Currencies (洗炼): what each one does to an item. */
export const CURRENCIES = Object.freeze(patchMap('currencies', {
  augment: { name: '魔晶', desc: '添加一条随机词条（不足 6 条时）', weight: 40 },
  chaos: { name: '混沌石', desc: '重洗全部随机词条（未封印的），条数不变', weight: 18 },
  upgrade: { name: '灵石', desc: '随机一条随机词条 T 阶 +1', weight: 22 },
  annul: { name: '无效石', desc: '随机移除一条未封印的随机词条', weight: 10 },
  seal: { name: '封印符', desc: '封印选中的词条或特性：重洗不会动它', weight: 6 },
  temper: { name: '淬火石', desc: '选中的特性 T 阶 +1（不超过本件上限）', weight: 6 },
  essence_form: { name: '形态精华', desc: '把选中的特性重铸为随机形态特性', weight: 5 },
  essence_link: { name: '联动精华', desc: '把选中的特性重铸为随机联动特性（物品 T3+）', weight: 2.5 },
  essence_core: { name: '核心精华', desc: '把选中的特性重铸为随机核心特性（物品 T6+）', weight: 0.5 },
  skill_gem: { name: '技能石', desc: '重铸装备上的主动技能（同底材技能池）', weight: 3 },
}));

let uidSeq = 0;
const uid = () => `it${Date.now().toString(36)}${(uidSeq++).toString(36)}`;

/** Line tier roll: the item's top tier is rarest-common; each lower tier ×1/0.72 more likely. */
function rollLineTier(fid, itemTier, rng) {
  const top = lineTierFor(fid, itemTier);
  if (!top) return 0;
  const w = []; let sum = 0;
  for (let t = 1; t <= top; ++t) { const x = 0.72 ** (top - t); w.push(x); sum += x; }
  let r = rng() * sum;
  for (let t = 1; t <= top; ++t) { r -= w[t - 1]; if (r <= 0) return t; }
  return top;
}

const taken = item => new Set([...item.traits.map(l => l.id), ...item.lines.map(l => l.id)]);
/** Families that may roll on this item: random lines are stat-layer, base traits are form/link/core. */
export function candidates(item, { layer = null, trait = false } = {}) {
  const used = taken(item);
  return families().filter(f => f.slots.includes(item.slot) && !used.has(f.id) && !f.noDrop
    && (trait ? TRAIT_LAYERS.includes(f.layer) : f.layer === 'stat') && (!layer || f.layer === layer)
    && item.tier >= LAYERS[f.layer].minItemTier);
}

function pickFamily(pool, rng) {
  if (!pool.length) return null;
  let sum = 0;
  for (const f of pool) sum += LAYERS[f.layer].weight;
  let r = rng() * sum;
  for (const f of pool) { r -= LAYERS[f.layer].weight; if (r <= 0) return f; }
  return pool[pool.length - 1];
}
export function rollLine(item, rng, opts = {}) {
  const f = pickFamily(candidates(item, opts), rng);
  return f ? { id: f.id, tier: rollLineTier(f.id, item.tier, rng) } : null;
}
export const rollTrait = (item, rng, layer = null) => rollLine(item, rng, { trait: true, layer });
/** Base lines left for traits: the skill and a legendary trait each take one. */
export const traitSlots = item => BASE_LINES - (item.skill ? 1 : 0) - (item.legend ? 1 : 0);

/** item: { uid, slot, base, tier, skill, traits:[{id,tier}], lines:[{id,tier}] } */
export function makeItem(slot, baseId, tier, { skill = null, traits = [], lines = [] } = {}) {
  const base = baseOf(slot, baseId);
  if (!base) throw new Error(`未知底材 ${slot}/${baseId}`);
  return { uid: uid(), slot, base: base.id, tier, skill, traits: traits.map(l => ({ ...l })), lines: lines.map(l => ({ ...l })) };
}

/** A dropped item: random base, maybe a skill, base traits, and 0–6 random lines. */
export function rollItem(itemTier, rng, slot = SLOTS[Math.floor(rng() * SLOTS.length)]) {
  const bases = baseList(slot), base = bases[Math.floor(rng() * bases.length)];
  const item = makeItem(slot, base.id, itemTier);
  if (base.skills.length && rng() < (SKILL_CHANCE[slot] ?? 0)) item.skill = base.skills[Math.floor(rng() * base.skills.length)];
  while (item.traits.length < traitSlots(item)) { const l = rollTrait(item, rng); if (!l) break; item.traits.push(l); }
  const r = rng();
  const count = r < 0.3 ? 1 : r < 0.65 ? 2 + Math.floor(rng() * 2) : 4 + Math.floor(rng() * Math.min(3, 1 + itemTier / 4));
  for (let i = 0; i < Math.min(MAX_LINES, count); ++i) { const l = rollLine(item, rng); if (l) item.lines.push(l); }
  return item;
}

/** A legendary item: its fixed legendary trait, the base's skill line if any, the rest rolled as usual. */
export function rollLegendary(id, itemTier, rng) {
  const L = legendary(id);
  const item = makeItem(L.slot, L.base, Math.max(itemTier, 1), { skill: L.skill ?? null });
  item.legend = id;
  while (item.traits.length < traitSlots(item)) { const l = rollTrait(item, rng); if (!l) break; item.traits.push(l); }
  const count = 3 + Math.floor(rng() * 4);
  for (let i = 0; i < count; ++i) { const l = rollLine(item, rng); if (l) item.lines.push(l); }
  return item;
}
export { LEGENDARIES };

export function rarityOf(item) {
  if (item.legend) return RARITY[4];
  const n = item.lines.length;
  if (item.traits.some(l => family(l.id).layer === 'core')) return RARITY[3];
  return n <= 1 ? RARITY[0] : n <= 3 ? RARITY[1] : RARITY[2];
}
export function itemName(item) {
  if (item.legend) return legendary(item.legend).name;
  const base = baseOf(item.slot, item.base);
  return `T${item.tier} ${base?.name ?? item.base}`;
}
/** Compiled affixes for the engine (base defence + base traits + random lines). The skill line is a grant, not an affix. */
export const itemAffixes = item => [baseAffix(item), item.legend ? legendAffix(item.legend) : null, ...[...item.traits, ...item.lines].map(l => affixLine(l.id, l.tier))].filter(Boolean);
export const lineText = l => affixLine(l.id, l.tier).name;

/**
 * Apply a currency. Returns { ok, message }. Mutates the item on success.
 * `sel` = { kind: 'trait' | 'line', index } picks a line for targeted currencies.
 */
export function applyCurrency(item, currency, rng, sel = null) {
  const free = () => item.lines.map((l, i) => i).filter(i => !item.lines[i].sealed);
  const pickedTrait = () => {
    if (sel?.kind === 'trait' && item.traits[sel.index]) return sel.index;
    const f = item.traits.map((l, i) => i).filter(i => !item.traits[i].sealed);
    return f.length ? f[Math.floor(rng() * f.length)] : -1;
  };
  switch (currency) {
    case 'augment': {
      if (item.lines.length >= MAX_LINES) return { ok: false, message: '已有 6 条随机词条' };
      const l = rollLine(item, rng); if (!l) return { ok: false, message: '没有可添加的词条' };
      item.lines.push(l); return { ok: true, message: `添加：${lineText(l)}` };
    }
    case 'chaos': {
      const keep = item.lines.filter(l => l.sealed), n = Math.max(1, item.lines.length);
      item.lines = keep.map(l => ({ ...l, sealed: false }));
      while (item.lines.length < n) { const l = rollLine(item, rng); if (!l) break; item.lines.push(l); }
      return { ok: true, message: `重洗为 ${item.lines.length} 条` };
    }
    case 'upgrade': {
      const can = item.lines.map((l, i) => i).filter(i => item.lines[i].tier < lineTierFor(item.lines[i].id, item.tier));
      if (!can.length) return { ok: false, message: '所有随机词条都已到本件 T 阶上限' };
      const l = item.lines[can[Math.floor(rng() * can.length)]]; l.tier++;
      return { ok: true, message: `提升：${lineText(l)}` };
    }
    case 'annul': {
      const f = free(); if (!f.length) return { ok: false, message: '没有可移除的词条' };
      const [l] = item.lines.splice(f[Math.floor(rng() * f.length)], 1);
      return { ok: true, message: `移除：${lineText(l)}` };
    }
    case 'seal': {
      const l = sel?.kind === 'trait' ? item.traits[sel.index] : item.lines[sel?.index ?? -1];
      if (!l) return { ok: false, message: '先选中一条词条或特性' };
      if (l.sealed) return { ok: false, message: '这条已经封印' };
      l.sealed = true; return { ok: true, message: `封印：${lineText(l)}` };
    }
    case 'temper': {
      const i = sel?.kind === 'trait' ? sel.index : -1, l = item.traits[i];
      if (!l) return { ok: false, message: '先选中一条特性' };
      if (l.tier >= lineTierFor(l.id, item.tier)) return { ok: false, message: '已到本件 T 阶上限' };
      l.tier++; return { ok: true, message: `淬火：${lineText(l)}` };
    }
    case 'essence_form': case 'essence_link': case 'essence_core': {
      const layer = currency.slice(8);
      if (item.tier < LAYERS[layer].minItemTier) return { ok: false, message: `需要 T${LAYERS[layer].minItemTier} 以上的装备` };
      const i = pickedTrait();
      if (i < 0) return { ok: false, message: '特性全部封印' };
      const old = item.traits[i];
      item.traits.splice(i, 1);
      const l = rollTrait(item, rng, layer);
      if (!l) { item.traits.splice(i, 0, old); return { ok: false, message: '这个部位没有该层特性' }; }
      item.traits.splice(i, 0, l); return { ok: true, message: `重铸为${LAYERS[layer].name}特性：${lineText(l)}` };
    }
    case 'skill_gem': {
      const pool = (baseOf(item.slot, item.base)?.skills ?? []).filter(s => s !== item.skill);
      if (!pool.length) return { ok: false, message: '这件底材不能带主动技能' };
      if (!item.skill) {
        if (item.traits.length >= BASE_LINES && item.traits.every(l => l.sealed)) return { ok: false, message: '特性全部封印' };
        if (item.traits.length >= BASE_LINES) { const f = item.traits.map((l, i) => i).filter(i => !item.traits[i].sealed); item.traits.splice(f[f.length - 1], 1); }
      }
      item.skill = pool[Math.floor(rng() * pool.length)];
      return { ok: true, message: `主动技能：${item.skill}` };
    }
  }
  return { ok: false, message: '未知通货' };
}

/** Drops for one kill. kind: 'monster' | 'elite' | 'boss'. Returns [{ type:'item', item } | { type:'currency', id, count }]. */
export function rollDrops(mapTier, kind, rng, { quantity = 1, legend = 1 } = {}) {
  const out = [];
  const itemTier = () => Math.max(1, Math.min(10, Math.round(mapTier * 10 / 16 + (rng() - 0.5) * 2)));
  const items = kind === 'boss' ? 3 + Math.floor(rng() * 2) : (rng() < (kind === 'elite' ? 0.35 : 0.045) * quantity ? 1 : 0);
  for (let i = 0; i < items; ++i) out.push({ type: 'item', item: rollItem(Math.min(10, itemTier() + (kind === 'boss' ? 1 : 0)), rng) });
  // Legendaries: a boss drops one a third of the time, elites rarely, from map tier 3 up.
  const legendChance = mapTier < 3 ? 0 : kind === 'boss' ? 0.35 : kind === 'elite' ? 0.02 : 0.0008;
  if (rng() < legendChance * quantity * legend) out.push({ type: 'item', item: rollLegendary(LEGENDARIES[Math.floor(rng() * LEGENDARIES.length)].id, Math.min(10, itemTier() + 1), rng) });
  const currencyRolls = kind === 'boss' ? 6 : kind === 'elite' ? 2 : rng() < 0.12 * quantity ? 1 : 0;
  const entries = Object.entries(CURRENCIES);
  const total = entries.reduce((s, [, c]) => s + c.weight, 0);
  for (let i = 0; i < currencyRolls; ++i) {
    let r = rng() * total;
    for (const [id, c] of entries) { r -= c.weight; if (r <= 0) { out.push({ type: 'currency', id, count: 1 }); break; } }
  }
  return out;
}

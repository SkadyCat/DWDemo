// 装备：10 个部位 × 底材（3 条固定基础词条）+ 至多 6 条随机词条；分层掉落；洗炼通货。
// 一切随机都走传入的 rng，存档里只存 { 底材, T 阶, 词条族 + 词条 T 阶 }，词条效果由 families.mjs 现算。
import { SLOTS, LAYERS, families, family, affixLine, lineTierFor } from './families.mjs';

export const SLOT_NAMES = Object.freeze({ weapon: '武器', offhand: '副手', helmet: '头盔', chest: '胸甲', gloves: '手套', boots: '鞋子', belt: '腰带', amulet: '项链', ring1: '戒指', ring2: '戒指' });
export const RARITY = Object.freeze([
  { id: 'normal', name: '普通', color: '#c8c8c8' }, { id: 'magic', name: '魔法', color: '#7aa8ff' },
  { id: 'rare', name: '稀有', color: '#ffd75e' }, { id: 'exalted', name: '传世', color: '#ff9a4d' },
]);
export const MAX_LINES = 6;

/** Bases per slot. `implicit` = the three fixed base lines (grow with the item tier). */
export const BASES = Object.freeze({
  weapon: [
    { id: 'war_staff', name: '战杖', implicit: ['crit_base', 'dmg_spell', 'cast_speed'] },
    { id: 'maul', name: '重锤', implicit: ['added_physical_attack', 'crit_base', 'attack_speed'] },
    { id: 'dagger', name: '匕首', implicit: ['crit_chance', 'attack_speed', 'added_physical_attack'] },
    { id: 'wand', name: '法杖', implicit: ['dmg_elemental', 'cast_speed', 'crit_chance'] },
  ],
  offhand: [
    { id: 'tower_shield', name: '塔盾', implicit: ['block', 'armour', 'life'] },
    { id: 'focus', name: '法器', implicit: ['es', 'mana', 'dmg_spell'] },
    { id: 'quiver', name: '箭袋', implicit: ['dmg_projectile', 'life', 'res_all'] },
  ],
  helmet: [
    { id: 'iron_helm', name: '铁盔', implicit: ['armour', 'life', 'res_cold'] },
    { id: 'silk_hood', name: '丝帽', implicit: ['es', 'mana', 'res_lightning'] },
    { id: 'leather_cap', name: '皮帽', implicit: ['evasion', 'life', 'res_fire'] },
  ],
  chest: [
    { id: 'plate', name: '板甲', implicit: ['armour', 'armour_inc', 'life'] },
    { id: 'robe', name: '法袍', implicit: ['es', 'es_inc', 'life'] },
    { id: 'leather', name: '皮衣', implicit: ['evasion', 'evasion_inc', 'life'] },
  ],
  gloves: [
    { id: 'gauntlets', name: '铁手', implicit: ['armour', 'attack_speed', 'life'] },
    { id: 'silk_gloves', name: '丝手', implicit: ['es', 'cast_speed', 'mana'] },
    { id: 'wraps', name: '缠手', implicit: ['evasion', 'crit_chance', 'life'] },
  ],
  boots: [
    { id: 'greaves', name: '铁靴', implicit: ['armour', 'move_speed', 'life'] },
    { id: 'slippers', name: '丝靴', implicit: ['es', 'move_speed', 'res_cold'] },
    { id: 'treads', name: '皮靴', implicit: ['evasion', 'move_speed', 'life'] },
  ],
  belt: [
    { id: 'heavy_belt', name: '重带', implicit: ['life', 'armour', 'res_fire'] },
    { id: 'chain_belt', name: '链带', implicit: ['life', 'life_regen', 'res_cold'] },
  ],
  amulet: [
    { id: 'jade_amulet', name: '玉坠', implicit: ['res_all', 'life', 'mana'] },
    { id: 'onyx_amulet', name: '玛瑙坠', implicit: ['res_all', 'dmg_elemental', 'life_regen'] },
  ],
  ring1: [
    { id: 'ruby_ring', name: '红玉戒', implicit: ['res_fire', 'life', 'mana'] },
    { id: 'sapphire_ring', name: '蓝玉戒', implicit: ['res_cold', 'life', 'mana_regen'] },
    { id: 'topaz_ring', name: '黄玉戒', implicit: ['res_lightning', 'life', 'evasion'] },
  ],
});
// The second ring slot uses the same bases.
export const baseList = slot => BASES[slot === 'ring2' ? 'ring1' : slot];
export const baseOf = (slot, id) => baseList(slot).find(b => b.id === id) ?? null;

/** Currencies (洗炼): what each one does to an item. */
export const CURRENCIES = Object.freeze({
  augment: { name: '魔晶', desc: '添加一条随机词条（不足 6 条时）', weight: 40 },
  chaos: { name: '混沌石', desc: '重洗全部随机词条（未封印的），条数不变', weight: 18 },
  upgrade: { name: '灵石', desc: '随机一条词条 T 阶 +1（不超过本件 T 阶上限）', weight: 22 },
  annul: { name: '无效石', desc: '随机移除一条未封印的词条', weight: 10 },
  seal: { name: '封印符', desc: '封印选中的词条：下一次混沌/无效不会动它', weight: 6 },
  essence_form: { name: '形态精华', desc: '添加一条形态层词条', weight: 4 },
  essence_link: { name: '联动精华', desc: '添加一条联动层词条（物品 T3+）', weight: 2 },
  essence_core: { name: '核心精华', desc: '添加一条核心层词条（物品 T6+）', weight: 0.4 },
});

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

/** Families that may roll as a random line on this item (slot, layer gates, no duplicates). */
export function candidates(item, { layer = null } = {}) {
  const taken = new Set([...item.implicit.map(l => l.id), ...item.lines.map(l => l.id)]);
  return families().filter(f => f.slots.includes(item.slot) && !taken.has(f.id) && (!layer || f.layer === layer)
    && item.tier >= LAYERS[f.layer].minItemTier && !f.noDrop);
}

export function rollLine(item, rng, opts = {}) {
  const pool = candidates(item, opts);
  if (!pool.length) return null;
  let sum = 0;
  for (const f of pool) sum += LAYERS[f.layer].weight;
  let r = rng() * sum;
  for (const f of pool) { r -= LAYERS[f.layer].weight; if (r <= 0) return { id: f.id, tier: rollLineTier(f.id, item.tier, rng) }; }
  const f = pool[pool.length - 1];
  return { id: f.id, tier: rollLineTier(f.id, item.tier, rng) };
}

export function makeItem(slot, baseId, tier, lines = []) {
  const base = baseOf(slot, baseId);
  if (!base) throw new Error(`未知底材 ${slot}/${baseId}`);
  return { uid: uid(), slot, base: base.id, tier,
    implicit: base.implicit.map(id => ({ id, tier: Math.max(1, lineTierFor(id, tier)) })), lines: lines.map(l => ({ ...l })) };
}

/** A dropped item: random base, rarity by line count (more lines rarer, higher tiers a bit richer). */
export function rollItem(itemTier, rng, slot = SLOTS[Math.floor(rng() * SLOTS.length)]) {
  const bases = baseList(slot), base = bases[Math.floor(rng() * bases.length)];
  const item = makeItem(slot, base.id, itemTier);
  const r = rng();
  const count = r < 0.35 ? 0 : r < 0.7 ? 1 + Math.floor(rng() * 2) : 3 + Math.floor(rng() * Math.min(4, 1 + itemTier / 3));
  for (let i = 0; i < Math.min(MAX_LINES, count); ++i) { const l = rollLine(item, rng); if (l) item.lines.push(l); }
  return item;
}

export function rarityOf(item) {
  const n = item.lines.length;
  if (n >= MAX_LINES && item.lines.some(l => family(l.id).layer === 'core')) return RARITY[3];
  return n === 0 ? RARITY[0] : n <= 2 ? RARITY[1] : RARITY[2];
}
export function itemName(item) {
  const base = baseOf(item.slot, item.base);
  return `T${item.tier} ${base?.name ?? item.base}`;
}
/** Compiled affixes for the engine (base lines + random lines). */
export const itemAffixes = item => [...item.implicit, ...item.lines].map(l => affixLine(l.id, l.tier));
export const lineText = l => affixLine(l.id, l.tier).name;

/**
 * Apply a currency. Returns { ok, message }. Mutates the item on success.
 * `index` selects a line for targeted currencies (seal).
 */
export function applyCurrency(item, currency, rng, index = -1) {
  const free = () => item.lines.map((l, i) => i).filter(i => !item.lines[i].sealed);
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
      if (!can.length) return { ok: false, message: '所有词条都已到本件 T 阶上限' };
      const l = item.lines[can[Math.floor(rng() * can.length)]]; l.tier++;
      return { ok: true, message: `提升：${lineText(l)}` };
    }
    case 'annul': {
      const f = free(); if (!f.length) return { ok: false, message: '没有可移除的词条' };
      const [l] = item.lines.splice(f[Math.floor(rng() * f.length)], 1);
      return { ok: true, message: `移除：${lineText(l)}` };
    }
    case 'seal': {
      const l = item.lines[index]; if (!l) return { ok: false, message: '先选中一条词条' };
      if (l.sealed) return { ok: false, message: '这条已经封印' };
      l.sealed = true; return { ok: true, message: `封印：${lineText(l)}` };
    }
    case 'essence_form': case 'essence_link': case 'essence_core': {
      const layer = currency.slice(8);
      if (item.tier < LAYERS[layer].minItemTier) return { ok: false, message: `需要 T${LAYERS[layer].minItemTier} 以上的装备` };
      if (item.lines.length >= MAX_LINES) {
        const f = free(); if (!f.length) return { ok: false, message: '词条已满且全部封印' };
        item.lines.splice(f[Math.floor(rng() * f.length)], 1);
      }
      const l = rollLine(item, rng, { layer }); if (!l) return { ok: false, message: '这个部位没有该层词条' };
      item.lines.push(l); return { ok: true, message: `添加${LAYERS[layer].name}词条：${lineText(l)}` };
    }
  }
  return { ok: false, message: '未知通货' };
}

/** Drops for one kill. kind: 'monster' | 'elite' | 'boss'. Returns [{ type:'item', item } | { type:'currency', id, count }]. */
export function rollDrops(mapTier, kind, rng, { quantity = 1 } = {}) {
  const out = [];
  const itemTier = () => Math.max(1, Math.min(10, Math.round(mapTier * 10 / 16 + (rng() - 0.5) * 2)));
  const items = kind === 'boss' ? 3 + Math.floor(rng() * 2) : (rng() < (kind === 'elite' ? 0.35 : 0.045) * quantity ? 1 : 0);
  for (let i = 0; i < items; ++i) out.push({ type: 'item', item: rollItem(Math.min(10, itemTier() + (kind === 'boss' ? 1 : 0)), rng) });
  const currencyRolls = kind === 'boss' ? 6 : kind === 'elite' ? 2 : rng() < 0.12 * quantity ? 1 : 0;
  const entries = Object.entries(CURRENCIES);
  const total = entries.reduce((s, [, c]) => s + c.weight, 0);
  for (let i = 0; i < currencyRolls; ++i) {
    let r = rng() * total;
    for (const [id, c] of entries) { r -= c.weight; if (r <= 0) { out.push({ type: 'currency', id, count: 1 }); break; } }
  }
  return out;
}

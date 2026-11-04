// 存档：背包、10 个部位的装备、通货、技能栏、已解锁的地图 T 阶。旧存档不迁移（新词条体系）。
// 主动技能来自装备的第 1 条基底：技能栏只能放身上装备带的技能。
import { talentAffixes } from '../../core/content/talents.mjs';
import { SLOTS } from '../../core/content/families.mjs';
import { makeItem, itemAffixes, applyCurrency, CURRENCIES } from '../../core/content/items.mjs';
import { ARCHETYPES } from '../../core/content/archetypes.mjs';
import { SCARAB_IDS } from './scarabs.mjs';
import { stageBuild, STAGES } from '../../core/content/builds.mjs';

const KEY = 'dw.core.save.v2';
export const SKILL_BAR = 4;

// ---- bag & stash ------------------------------------------------------------------------------
// 背包 5 行 × 12 列：装备每件占一格，通货每 20 个占一格。仓库在家里：通货页（每种通货一个固定格，不限数量）、
// 传奇页（每种传奇一个格子，最多放 10 件）、5 个常规页（每页 12 × 12）。
export const BAG_COLS = 12, BAG_ROWS = 5, BAG_SIZE = BAG_COLS * BAG_ROWS;
export const STACK = 20, PAGE_COLS = 12, PAGE_SIZE = 144, PAGES = 5, LEGEND_CAP = 10;
export const newStash = () => ({ currency: Object.fromEntries(Object.keys(CURRENCIES).map(k => [k, 0])), legend: {}, pages: Array.from({ length: PAGES }, () => []) });
/** Currency in the bag as stacks of 20, in CURRENCIES order. */
export const currencyStacks = save => Object.keys(CURRENCIES).flatMap(id => { const n = save.currencies[id] || 0, out = []; for (let left = n; left > 0; left -= STACK) out.push({ id, n: Math.min(STACK, left) }); return out; });
/** 星契 (map-device sigils, save.scarabs) also sit in the bag, 10 to a cell. */
export const SIGIL_STACK = 10;
export const sigilStacks = save => SCARAB_IDS.flatMap(id => { const n = save.scarabs?.[id] || 0, out = []; for (let left = n; left > 0; left -= SIGIL_STACK) out.push({ id, n: Math.min(SIGIL_STACK, left) }); return out; });
/** Every stackable in the bag: currency (20 a cell) then sigils (10 a cell); key = where its cells are kept in save.curCells. */
const stackables = save => [
  ...Object.keys(CURRENCIES).map(id => ({ key: id, id, n: save.currencies[id] || 0, size: STACK, sigil: false })),
  ...SCARAB_IDS.map(id => ({ key: 'sg:' + id, id, n: save.scarabs?.[id] || 0, size: SIGIL_STACK, sigil: true })),
];
export const bagUsed = save => save.inventory.length + currencyStacks(save).length + sigilStacks(save).length;
export const bagFree = save => BAG_SIZE - bagUsed(save);
/** Can this drop go into the bag? Currency fits when it tops up a stack or there is a free cell. */
export function bagFits(save, drop) {
  if (drop.type === 'waystone') return true;   // waystones go to the map device, not the bag
  if (drop.type === 'item') return bagFree(save) > 0;
  if (drop.type === 'scarab') { const have = save.scarabs?.[drop.id] || 0; return have % SIGIL_STACK !== 0 || bagFree(save) > 0; }
  const have = save.currencies[drop.id] || 0, room = (STACK - (have % STACK)) % STACK;
  return drop.count <= room || bagFree(save) >= Math.ceil((drop.count - room) / STACK);
}

/**
 * Fixed cells (no auto-sort): every item keeps `cell` where it was put, currency stacks keep theirs in
 * save.curCells. Things without a cell yet (new pickups) take the first free one. Returns the grid as an array.
 */
export function placeGrid(items, size, taken = new Set()) {
  const grid = new Array(size).fill(null);
  for (const c of taken) grid[c] = 'taken';
  const ok = c => Number.isInteger(c) && c >= 0 && c < size && grid[c] === null;
  const loose = [];
  for (const it of items) { if (ok(it.cell)) grid[it.cell] = it; else loose.push(it); }
  for (const it of loose) { const c = grid.indexOf(null); if (c < 0) { grid.push(it); it.cell = grid.length - 1; } else { it.cell = c; grid[c] = it; } }
  return grid;
}
export function placeBag(save) {
  const cc = (save.curCells ??= {}), used = new Set(), list = stackables(save);
  // stacks keep their cells first; extra stacks take free cells after the items are placed
  for (const st of list) {
    cc[st.key] = (cc[st.key] ?? []).filter(c => Number.isInteger(c) && c >= 0 && c < BAG_SIZE && !used.has(c)).slice(0, Math.ceil(st.n / st.size));
    cc[st.key].forEach(c => used.add(c));
  }
  const grid = placeGrid(save.inventory, BAG_SIZE, used);
  for (const st of list) while (cc[st.key].length < Math.ceil(st.n / st.size)) { let c = grid.indexOf(null); if (c < 0) { c = grid.length; grid.push(null); } cc[st.key].push(c); grid[c] = 'taken'; }
  for (const st of list) cc[st.key].forEach((c, k) => { grid[c] = { cur: true, sigil: st.sigil, key: st.key, id: st.id, n: Math.min(st.size, st.n - k * st.size) }; });
  return grid.map(x => (x === 'taken' ? null : x));
}
/** Move a bag item to cell `to` (swapping with whatever is there). */
export function moveInBag(save, it, to) {
  if (!save.inventory.includes(it) || to < 0 || to >= BAG_SIZE) return false;
  const grid = placeBag(save), there = grid[to], from = it.cell;
  if (there === it) return false;
  if (there?.cur) { const cc = save.curCells[there.key]; cc[cc.indexOf(to)] = from; }
  else if (there) there.cell = from;
  it.cell = to; return true;
}

/** Bag → stash. Legendaries go to the legendary page while their slot has room, everything else to `page`. */
export function deposit(save, uid, page = 0) {
  const i = save.inventory.findIndex(it => it.uid === uid); if (i < 0) return null;
  const it = save.inventory[i];
  if (it.legend) {
    const list = (save.stash.legend[it.legend] ??= []);
    if (list.length < LEGEND_CAP) { save.inventory.splice(i, 1); delete it.cell; list.push(it); return 'legend'; }
  }
  const pg = save.stash.pages[page];
  if (!pg || pg.length >= PAGE_SIZE) return null;
  save.inventory.splice(i, 1); delete it.cell; pg.push(it); return 'page';
}
/** Stash → bag. where: { page } or { legend }. */
export function withdraw(save, uid, where) {
  if (bagFree(save) <= 0) return false;
  const list = where.legend ? save.stash.legend[where.legend] : save.stash.pages[where.page];
  const i = list?.findIndex(it => it.uid === uid) ?? -1; if (i < 0) return false;
  const it = list.splice(i, 1)[0]; delete it.cell; save.inventory.push(it); return true;
}
/** Bag currency → the currency page (all of one kind, or every kind when id is null). */
export function depositCurrency(save, id = null) {
  let moved = 0;
  for (const k of id ? [id] : Object.keys(CURRENCIES)) { const n = save.currencies[k] || 0; save.stash.currency[k] = (save.stash.currency[k] || 0) + n; save.currencies[k] = 0; moved += n; }
  return moved;
}
/** Currency page → bag: up to `n` (default one stack), limited by the room in the bag. */
export function withdrawCurrency(save, id, n = STACK) {
  const have = save.stash.currency[id] || 0, cur = save.currencies[id] || 0;
  const room = (STACK - (cur % STACK)) % STACK + bagFree(save) * STACK;
  const take = Math.min(have, n, room); if (take <= 0) return 0;
  save.stash.currency[id] = have - take; save.currencies[id] = cur + take; return take;
}

// ---- experience -----------------------------------------------------------------------------------
export const MAX_LEVEL = 100;
/** Experience needed to go from `level` to the next one. */
export const xpToNext = level => Math.round(40 * level ** 1.75 + 60);
/** Experience for one kill in a tier-T map (elites ×4, bosses ×25). */
export const killXp = (tier, rank = 'normal') => Math.round((4 + tier * 1.6) * (rank === 'boss' ? 25 : rank === 'elite' ? 4 : 1));
/** Add experience; returns the number of levels gained. */
export function gainXp(save, n) {
  let up = 0; save.xp = (save.xp || 0) + n;
  while (save.level < MAX_LEVEL && save.xp >= xpToNext(save.level)) { save.xp -= xpToNext(save.level); save.level++; up++; }
  if (save.level >= MAX_LEVEL) save.xp = 0;
  return up;
}
/** Skills granted by the equipped items (first base line), in slot order. */
export const grantedSkills = save => [...new Set(SLOTS.map(s => save.equipped[s]?.skill).filter(Boolean))];

export function newSave() {
  const save = { version: 2, inventory: [], equipped: Object.fromEntries(SLOTS.map(s => [s, null])), currencies: Object.fromEntries(Object.keys(CURRENCIES).map(k => [k, 0])),
    skills: [null, null, null, null], talents: { allocated: [] }, unlocked: 1, best: {}, archetype: null, bdStage: null, stats: { maps: 0, kills: 0 },
    stash: newStash(), level: 1, xp: 0, scarabs: { bounty_0: 2, coin_0: 1 }, deviceSlots: [null, null, null, null, null] };
  // A starter wand with Fireball so a fresh character can play.
  save.equipped.weapon = makeItem('weapon', 'wand', 1, { skill: 'fireball', traits: [{ id: 'proj_count', tier: 1 }, { id: 'proj_pierce', tier: 1 }], lines: [{ id: 'added_fire_spell', tier: 1 }] });
  syncSkillBar(save);
  return save;
}

/** Keep the bar to granted skills: drop ones no longer equipped, fill empty keys with new ones. */
export function syncSkillBar(save) {
  const granted = grantedSkills(save);
  save.skills = save.skills.map(id => (id && granted.includes(id) ? id : null));
  for (const id of granted) if (!save.skills.includes(id)) { const i = save.skills.indexOf(null); if (i >= 0) save.skills[i] = id; }
}

export function loadSave() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw?.version === 2) return migrate({ ...newSave(), ...raw, equipped: { ...newSave().equipped, ...raw.equipped }, currencies: { ...newSave().currencies, ...raw.currencies } });
  } catch { /* fresh save */ }
  return newSave();
}
/** Older saves: fill the stash, and move whatever no longer fits in the 5 × 12 bag into it. */
export function migrate(save) {
  const base = newStash(), st = save.stash ?? {};
  save.stash = { currency: { ...base.currency, ...st.currency }, legend: { ...st.legend }, pages: base.pages.map((p, i) => st.pages?.[i] ?? p) };
  save.level = Math.max(1, save.level | 0 || 1); save.xp = Math.max(0, save.xp || 0);
  if (!save.scarabs || typeof save.scarabs !== 'object') save.scarabs = { bounty_0: 2, coin_0: 1 };
  if (!Array.isArray(save.deviceSlots) || save.deviceSlots.length !== 5) save.deviceSlots = [null, null, null, null, null];
  // Currency first: anything past what the bag can hold waits in the currency page.
  for (const id of Object.keys(CURRENCIES)) {
    const cap = Math.max(0, BAG_SIZE - save.inventory.length) * STACK;   // rough: the bag cannot hold more than this
    if ((save.currencies[id] || 0) > cap) { save.stash.currency[id] += save.currencies[id] - cap; save.currencies[id] = cap; }
  }
  while (bagFree(save) < 0 && save.inventory.length) {
    const it = save.inventory.pop();
    const pg = save.stash.pages.find(p => p.length < PAGE_SIZE) ?? save.stash.pages[0]; pg.push(it);
  }
  while (bagFree(save) < 0) { const id = Object.keys(CURRENCIES).find(k => save.currencies[k] > 0); const n = Math.min(STACK, save.currencies[id]); save.currencies[id] -= n; save.stash.currency[id] += n; }
  return save;
}
let sink = null;
/** Accounts: every write is also handed to the account sync (accounts.mjs). */
export const setSaveSink = fn => { sink = fn; };
export const SAVE_KEY = KEY;
export function writeSave(save) { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* storage unavailable */ } sink?.(save); }

export function buildOf(save) {
  const affixes = [];
  for (const s of SLOTS) if (save.equipped[s]) affixes.push(...itemAffixes(save.equipped[s]));
  // The talent board's nodes are ordinary affixes too.
  affixes.push(...talentAffixes(save.talents?.allocated ?? []));
  const arch = ARCHETYPES.find(a => a.id === save.archetype);
  const granted = grantedSkills(save);
  return { skills: save.skills.filter(id => id && granted.includes(id)), affixes, keepDistance: arch?.keepDistance ?? 0 };
}

/** Equip an item from the bag (onto `slot` when given and it fits: either ring slot takes a ring). */
export function equip(save, uid, slot = null) {
  const i = save.inventory.findIndex(it => it.uid === uid);
  if (i < 0) return false;
  const item = save.inventory[i];
  const ring = s => s === 'ring1' || s === 'ring2';
  if (slot && !(slot === item.slot || (ring(slot) && ring(item.slot)))) return false;
  if (!slot) slot = ring(item.slot) ? (!save.equipped.ring1 ? 'ring1' : !save.equipped.ring2 ? 'ring2' : 'ring1') : item.slot;
  // The piece taken off lands in the bag cell the new one came from (a swap, not a reshuffle).
  if (save.equipped[slot]) { save.equipped[slot].cell = item.cell; save.inventory.splice(i, 1, save.equipped[slot]); } else save.inventory.splice(i, 1);
  save.equipped[slot] = { ...item, slot };
  syncSkillBar(save);
  return true;
}
export function unequip(save, slot) { if (!save.equipped[slot] || bagFree(save) <= 0) return false; const it = save.equipped[slot]; delete it.cell; save.inventory.push(it); save.equipped[slot] = null; syncSkillBar(save); return true; }
/** Into the bag, or the first stash page with room when the bag is full. Returns where it went. */
export function toBag(save, it) {
  if (bagFree(save) > 0) { save.inventory.push(it); return 'bag'; }
  (save.stash.pages.find(p => p.length < PAGE_SIZE) ?? save.stash.pages[0]).push(it); return 'stash';
}
/** Salvage: an item turns into a little currency (more lines, more back). */
export function salvage(save, uid, rng) {
  const i = save.inventory.findIndex(it => it.uid === uid);
  if (i < 0) return null;
  const [item] = save.inventory.splice(i, 1);
  const gain = item.traits.some(l => l.id.startsWith('core_')) ? 'essence_link' : item.lines.length >= 4 ? 'chaos' : item.lines.length >= 2 ? 'augment' : rng() < 0.5 ? 'augment' : null;
  if (gain) save.currencies[gain] = (save.currencies[gain] || 0) + 1;
  return gain;
}
/** Currency on hand: the bag, plus the currency page while at home. */
export const curHave = (save, id, home = false) => (save.currencies[id] || 0) + (home ? save.stash?.currency[id] || 0 : 0);
export function craft(save, item, currency, rng, index, home = false) {
  if (!(curHave(save, currency, home) > 0)) return { ok: false, message: `没有${CURRENCIES[currency].name}` };
  const r = applyCurrency(item, currency, rng, index);
  if (r.ok) { if (save.currencies[currency] > 0) save.currencies[currency]--; else save.stash.currency[currency]--; syncSkillBar(save); }
  return r;
}

/**
 * One-click build: the archetype's stage gear replaces the equipped items (the old ones go to the
 * inventory; earlier one-click presets are simply replaced) and the bar gets the build's skill.
 */
/**
 * 空白流派: take everything off. Your own items go back to the bag, one-click build items are discarded,
 * and a plain starter wand (Fireball) goes on so maps can still be opened.
 */
export function clearArchetype(save) {
  for (const slot of SLOTS) {
    const it = save.equipped[slot];
    if (it && !it.preset) toBag(save, it);
    save.equipped[slot] = null;
  }
  save.equipped.weapon = makeItem('weapon', 'wand', 1, { skill: 'fireball', traits: [], lines: [] });
  save.skills = ['fireball', null, null, null];
  syncSkillBar(save);
  save.archetype = null; save.bdStage = null;
}

export function applyArchetype(save, id, stageIndex) {
  const a = ARCHETYPES.find(x => x.id === id);
  const b = stageBuild(a, stageIndex), tier = STAGES[stageIndex].itemTier;
  for (const slot of SLOTS) {
    const it = b.items[slot];
    const strip = l => ({ id: l.id, tier: l.tier });
    const item = makeItem(slot, it.base, tier, { skill: it.skill, traits: it.traits.map(strip), lines: it.lines.map(strip) });
    item.preset = `${a.name}·${STAGES[stageIndex].name}`;
    if (save.equipped[slot] && !save.equipped[slot].preset) toBag(save, save.equipped[slot]);
    save.equipped[slot] = item;
  }
  save.skills = [a.skills[0], null, null, null];
  syncSkillBar(save);
  save.archetype = a.id;
  save.unlocked = Math.max(save.unlocked, STAGES[stageIndex].maps[1]);
}

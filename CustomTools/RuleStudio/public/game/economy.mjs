// 经济：星银（钱）和地区物资。设计见 design/world-loop.md。
//   刷图 → 星银 + 地区物资 → 点天赋（资格来自打通的图集节点，花费是星银和物资）→ 更强 → 更高阶的图 → 更值钱的物资。
//   五个地区各产一种物资，分三档（粗 T1–5 / 精 T6–10 / 纯 T11–16）；星砂哪儿都有一点；星尘只有首领掉。
//   天赋按「第几点」指数涨价，按天赋所在的域要对应地区的物资；商会收购、出售物资，价格随库存浮动。
// 只管数据和规则，不碰界面。

/** Regions → the material they yield, and the talent domain that needs it. */
export const REGION_MATERIAL = Object.freeze({
  ember: { name: '余烬铁心', domain: 'fire', color: '#ff8a3d' },
  frost: { name: '霜晶', domain: 'cold', color: '#8fd8ff' },
  storm: { name: '雷鸣铜', domain: 'lightning', color: '#ffe066' },
  blight: { name: '孢核', domain: 'venom', color: '#9fe07a' },
  ruin: { name: '王都残金', domain: 'blade', color: '#d8c39a' },
});
export const GRADES = Object.freeze(['粗', '精', '纯']);
export const gradeOfTier = tier => tier <= 5 ? 0 : tier <= 10 ? 1 : 2;
/** Every material id: `${region}_${grade}`, plus 星砂 (sand, from anywhere) and 星尘 (dust, bosses only). */
export const MATERIAL_IDS = Object.freeze([...Object.keys(REGION_MATERIAL).flatMap(r => [0, 1, 2].map(g => `${r}_${g}`)), 'sand', 'dust']);
export function materialInfo(id) {
  if (id === 'sand') return { id, name: '星砂', color: '#c8b8ff', grade: null, region: null, text: '星光碎成的沙，哪儿都能捡到一点。中圈的天赋和风域用它。', base: 18 };
  if (id === 'dust') return { id, name: '星尘', color: '#fff1c0', grade: null, region: null, text: '首领倒下时散出来的光。基石天赋要用。只有首领掉。', base: 240 };
  const [region, g] = id.split('_'), m = REGION_MATERIAL[region], grade = +g;
  return { id, name: GRADES[grade] + m.name, color: m.color, grade, region, domain: m.domain,
    text: `${{ ember: '余烬', frost: '霜原', storm: '雷暴', blight: '腐沼', ruin: '废墟' }[region]}之域的物资（${['T1–5', 'T6–10', 'T11–16'][grade]}）。${{ fire: '焰域', cold: '霜域', lightning: '雷域', venom: '毒域', blade: '刃域' }[m.domain]}的天赋用它。`,
    base: [14, 60, 220][grade] };
}
export const materialName = id => materialInfo(id).name;

/** About how much silver a map of this tier pays when you clear it (kills + boss, before selling gear). */
export const mapIncome = tier => Math.round(60 * Math.pow(tier, 1.25));

/** Silver and materials from one kill (added to the run's loot, picked up by walking over it). */
export function rollEconomyDrops(tier, family, kind, rng, { quantity = 1, materials = 1 } = {}) {
  const out = [], I = mapIncome(tier), region = REGION_MATERIAL[family] ? family : 'ruin', mat = `${region}_${gradeOfTier(tier)}`;
  const silver = (chance, amount) => { if (rng() < chance * quantity) out.push({ type: 'silver', count: Math.max(1, Math.round(amount * (0.6 + rng() * 0.8))) }); };
  const give = (id, n) => { if (n > 0) out.push({ type: 'material', id, count: n }); };
  if (kind === 'boss') {
    out.push({ type: 'silver', count: Math.round(I * 0.35) });
    give(mat, Math.round((3 + Math.floor(tier / 4)) * materials));
    give('sand', 1 + (rng() < 0.5 ? 1 : 0));
    if (tier >= 3 && rng() < 0.35 + tier * 0.02) give('dust', 1);
  } else if (kind === 'elite') {
    silver(0.6, I / 12);
    if (rng() < 0.2 * quantity * materials) give(mat, 1);
    if (rng() < 0.08 * quantity) give('sand', 1);
  } else {
    silver(0.08, I / 30);
    if (rng() < 0.01 * quantity * materials) give(mat, 1);
  }
  return out;
}

// ------------------------------------------------------------------ talents
const KIND_MULT = { small: 1, notable: 1.6, trait: 1.6, keystone: 3, start: 0 };
/**
 * What the n-th talent point (n = how many you already have) costs on this node.
 * Domain nodes want their region's material at the grade for n; the inner ring and the wind domain want 星砂;
 * keystones also want 星尘 (bridge keystones more).
 */
export function talentCost(node, n, discount = 0) {
  const k = KIND_MULT[node.kind] ?? 1;
  const silver = Math.round(80 * Math.pow(1.045, n) * k * (1 - discount));
  const grade = n < 30 ? 0 : n < 75 ? 1 : 2, count = Math.round((1 + Math.floor(n / 12)) * k);
  const region = Object.entries(REGION_MATERIAL).find(([, m]) => m.domain === node.domain)?.[0];
  const mats = {};
  if (region) mats[`${region}_${grade}`] = count; else mats.sand = Math.max(1, Math.round(count * 0.8));
  if (node.kind === 'keystone') mats.dust = node.domain ? 3 : 5;
  return { silver, mats };
}
export const canPay = (save, cost) => (save.silver ?? 0) >= cost.silver && Object.entries(cost.mats).every(([id, n]) => (save.materials?.[id] ?? 0) >= n);
export function pay(save, cost) {
  save.silver -= cost.silver;
  for (const [id, n] of Object.entries(cost.mats)) save.materials[id] -= n;
}
/** Taking a point back returns most of what it cost. */
export const REFUND = 0.6;
export function refund(save, paid) {
  if (!paid) return;
  save.silver = (save.silver ?? 0) + Math.floor(paid.silver * REFUND);
  for (const [id, n] of Object.entries(paid.mats)) save.materials[id] = (save.materials[id] ?? 0) + Math.floor(n * REFUND);
}

// ------------------------------------------------------------------ selling gear, the merchants' prices
const RARITY_PRICE = { normal: [2, 1], magic: [5, 2], rare: [12, 4], exalted: [30, 8], legendary: [80, 12] };
/** What 商会 pays for a piece of equipment (rarity, item tier, how many base lines). */
export function itemPrice(item, rarityId, baseLines = 1, bonus = 0) {
  const [a, b] = RARITY_PRICE[rarityId] ?? RARITY_PRICE.normal;
  return Math.round((a + b * (item.tier ?? 1)) * (1 + 0.5 * (baseLines - 1)) * (1 + bonus));
}
/** The merchants' stock drifts back to normal as maps get cleared; selling a lot of one thing makes it cheaper. */
export const newMarket = () => ({ stock: Object.fromEntries(MATERIAL_IDS.map(id => [id, 20])) });
export function marketPrice(save, id, side = 'buy', bonus = 0) {
  const m = save.market ??= newMarket(), s = m.stock[id] ?? 20, base = materialInfo(id).base;
  const swing = Math.max(0.55, Math.min(1.8, Math.pow(20 / Math.max(4, s), 0.5)));   // scarce: dearer, glut: cheaper
  return Math.max(1, Math.round(base * swing * (side === 'buy' ? 1.35 * (1 - bonus) : 0.75 * (1 + bonus))));
}
export function sellMaterial(save, id, n, bonus = 0) {
  n = Math.min(n, save.materials?.[id] ?? 0); if (n <= 0) return 0;
  let got = 0;
  for (let i = 0; i < n; ++i) { got += marketPrice(save, id, 'sell', bonus); save.market.stock[id] = (save.market.stock[id] ?? 20) + 1; }
  save.materials[id] -= n; save.silver = (save.silver ?? 0) + got;
  return got;
}
export function buyMaterial(save, id, n, bonus = 0) {
  let spent = 0, k = 0;
  for (; k < n; ++k) { const p = marketPrice(save, id, 'buy', bonus); if ((save.silver ?? 0) - spent < p || (save.market.stock[id] ?? 0) <= 0) break; spent += p; save.market.stock[id]--; }
  save.silver -= spent; save.materials[id] = (save.materials[id] ?? 0) + k;
  return k;
}
/** Four of a grade make one of the next (a small fee, waived for friends of 商会). */
export const REFINE = 4;
export const refineFee = (id, free = false) => free ? 0 : Math.round(materialInfo(id).base * 1.5);
export function refine(save, id, free = false) {
  const { region, grade } = materialInfo(id);
  if (region == null || grade >= 2) return false;
  const fee = refineFee(id, free);
  if ((save.materials[id] ?? 0) < REFINE || (save.silver ?? 0) < fee) return false;
  save.materials[id] -= REFINE; save.silver -= fee;
  const up = `${region}_${grade + 1}`; save.materials[up] = (save.materials[up] ?? 0) + 1;
  return true;
}
/** Each cleared map: the market's stock drifts a fifth of the way back to 20. */
export function marketTick(save) {
  const m = save.market ??= newMarket();
  for (const id of MATERIAL_IDS) { const v = m.stock[id] ?? 20, d = 20 - v; m.stock[id] = v + (Math.round(d * 0.2) || Math.sign(d)); }
}

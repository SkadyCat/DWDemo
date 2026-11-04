// 星契：放进地图仪法阵周围的 5 个槽，开图时一起消耗，强化这张图的掉落和怪群（参考流放之路的圣甲虫）。
// 每种三个品阶：黯淡 / 明亮 / 辉煌。放在背包里（10 个一格），从背包拖进槽里。

export const SCARAB_TIERS = ['黯淡', '明亮', '辉煌'];
export const SCARAB_SLOTS = 5;

/** kind → name, colour, the three tiers' values, what they do to the map (atlas.mjs nodeMods keys). */
export const SCARAB_KINDS = {
  bounty: { name: '丰饶', color: '#f2d27a', vals: [15, 30, 50], text: v => `物品数量 +${v}%`, mod: v => ({ quantity: v / 100 }) },
  legend: { name: '传奇', color: '#ffad5a', vals: [1.3, 1.6, 2], text: v => `传奇几率 ×${v}`, mod: v => ({ legend: v }) },
  swarm: { name: '群聚', color: '#d8584f', vals: [20, 40, 70], text: v => `怪群规模 +${v}%（怪更多，掉落也更多）`, mod: v => ({ pack: 1 + v / 100 }) },
  elite: { name: '精英', color: '#ffd75e', vals: [50, 100, 200], text: v => `精英数量 +${v}%`, mod: v => ({ elite: 1 + v / 100 }) },
  coin: { name: '财富', color: '#e6d8ac', vals: [30, 60, 100], text: v => `通货掉落 +${v}%`, mod: v => ({ currency: 1 + v / 100 }) },
  path: { name: '寻路', color: '#9fd8ff', vals: [30, 60, 100], text: v => `路石掉落 +${v}%`, mod: v => ({ stones: 1 + v / 100 }) },
  brood: { name: '繁衍', color: '#b98cff', vals: [40, 80, 150], text: v => `星契掉落 +${v}%`, mod: v => ({ scarabs: 1 + v / 100 }) },
};

export const scarabId = (kind, tier) => `${kind}_${tier}`;
export const parseScarab = id => { const i = id.lastIndexOf('_'); return { kind: id.slice(0, i), tier: +id.slice(i + 1) }; };
export const scarabName = id => { const { kind, tier } = parseScarab(id); return `${SCARAB_TIERS[tier]}${SCARAB_KINDS[kind].name}星契`; };
export const scarabText = id => { const { kind, tier } = parseScarab(id); const k = SCARAB_KINDS[kind]; return k.text(k.vals[tier]); };
export const scarabColor = id => SCARAB_KINDS[parseScarab(id).kind].color;
/** All ids, kind by kind, low tier first (for sorting the inventory). */
export const SCARAB_IDS = Object.keys(SCARAB_KINDS).flatMap(k => [0, 1, 2].map(t => scarabId(k, t)));

/** The mods of the slotted scarabs, in the shape nodeMods returns (quantity adds, the rest multiply). */
export function applyScarabs(mods, ids) {
  const out = { currency: 1, stones: 1, scarabs: 1, ...mods };
  for (const id of ids) {
    if (!id) continue;
    const { kind, tier } = parseScarab(id), k = SCARAB_KINDS[kind];
    for (const [key, v] of Object.entries(k.mod(k.vals[tier]))) { if (key === 'quantity') out.quantity += v; else out[key] = (out[key] ?? 1) * v; }
  }
  return out;
}

/** 星契 from a kill: bosses usually drop one, elites sometimes. The tier follows the map tier. */
export function rollScarabDrops(mapTier, kind, rng, mult = 1) {
  const chance = (kind === 'boss' ? 0.6 : kind === 'elite' ? 0.06 : 0.0015) * mult, out = [];
  let n = Math.floor(chance) + (rng() < chance - Math.floor(chance) ? 1 : 0);
  if (kind === 'boss' && rng() < 0.25 * mult) n++;
  const kinds = Object.keys(SCARAB_KINDS);
  for (let i = 0; i < n; ++i) {
    let tier = mapTier >= 12 ? 2 : mapTier >= 6 ? 1 : 0;
    const r = rng(); if (r < 0.2) tier = Math.max(0, tier - 1); else if (r > 0.9) tier = Math.min(2, tier + 1);
    out.push({ type: 'scarab', id: scarabId(kinds[Math.floor(rng() * kinds.length)], tier) });
  }
  return out;
}

// 路石：开启图集节点的钥匙（参考流放 2）。每块路石有 T 阶和稀有度，魔法 / 稀有路石带地图词缀。
// 节点要求 T 阶不低于它的路石，开图时消耗；路石阶高于节点时按路石的阶来打。营地旁的 T1 节点不需要路石。
import { MAP_TIERS } from '../../core/content/maps.mjs';
import { NODE_MODS } from './atlas.mjs';

export const WAYSTONE_RARITY = Object.freeze({
  normal: { name: '普通', mods: [0, 0] },
  magic: { name: '魔法', mods: [1, 2] },
  rare: { name: '稀有', mods: [3, 4] },
});
/** Nodes at or below this tier open without a waystone, so a run of bad luck can never lock the atlas. */
export const FREE_TIER = 1;

let seq = 0;
export function makeWaystone(tier, rarity = 'normal', mods = []) {
  return { uid: `ws${Date.now().toString(36)}${(seq++).toString(36)}`, tier: Math.max(1, Math.min(MAP_TIERS, tier)), rarity, mods: [...mods] };
}

export function rollWaystone(tier, rng, rarity = null) {
  const r = rng();
  rarity ??= r < 0.1 ? 'rare' : r < 0.42 ? 'magic' : 'normal';
  const [lo, hi] = WAYSTONE_RARITY[rarity].mods, want = lo + Math.floor(rng() * (hi - lo + 1));
  const keys = Object.keys(NODE_MODS), mods = [];
  while (mods.length < want) { const k = keys[Math.floor(rng() * keys.length)]; if (!mods.includes(k)) mods.push(k); }
  return makeWaystone(tier, rarity, mods);
}

export const waystoneName = w => `${WAYSTONE_RARITY[w.rarity].name}路石 · T${w.tier}`;

/**
 * Waystones that drop from a kill in a map of `mapTier`: the boss always leaves one at the map's tier
 * and often one a tier higher (that is how the atlas pushes outward); elites sometimes, trash rarely.
 */
export function rollWaystoneDrops(mapTier, kind, rng, quantity = 1) {
  const out = [];
  const near = () => mapTier + (rng() < 0.25 ? -1 : rng() < 0.3 ? 1 : 0);
  if (kind === 'boss') {
    out.push(rollWaystone(mapTier, rng));
    if (rng() < 0.6) out.push(rollWaystone(mapTier + 1, rng));
  } else if (rng() < (kind === 'elite' ? 0.15 : 0.005) * quantity) out.push(rollWaystone(near(), rng));
  return out;
}

/** Waystones a save starts with: three T1–T2 stones, or for a veteran save two for each tier it can reach. */
export function starterWaystones(tiers, rng) {
  const list = tiers.length ? tiers.flatMap(t => [rollWaystone(t, rng, 'normal'), rollWaystone(t, rng)]) : [];
  if (!list.length) list.push(makeWaystone(2), makeWaystone(2), rollWaystone(2, rng, 'magic'));
  return list;
}

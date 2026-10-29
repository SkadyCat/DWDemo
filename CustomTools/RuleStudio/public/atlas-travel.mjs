// Map admission belongs to the host inventory, not the combat rules or the UI.
import { reducePlacedStack } from './inventory-layout.mjs';

export function mapTicketAccess(node, items, slots = {}) {
  if (!node) return { ok: false, error: '区域不存在' };
  const key = slots.map;
  const item = items.find(item => item.key === key);
  if (!item || item.kind !== 'item' || item.category !== 'map' || !Number.isSafeInteger(item.count) || item.count < 1) {
    if (node.id === '0:0') return { ok: true, free: true, tier: 1, hint: '起始地图 T1 无需地图票' };
    return { ok: false, error: '请在中央地图槽放入地图' };
  }
  const tier = item.tier;
  if (!Number.isSafeInteger(tier) || tier < 1 || tier > 16) return { ok: false, error: '地图层级必须为 T1–T16' };
  return { ok: true, free: false, key, id: item.id, tier, hint: `进入消耗 1 张 T${tier} 地图 · 第 ${tier} 层` };
}

// Pending maps preview their own tier. A live battle keeps its admitted tier
// after the socket clears or the next map is placed. Geometry never sets tier.
export function atlasRegionTier(state, node, items, slots = {}) {
  if (!node) return null;
  if (state.activeNodeId === node.id) return state.mapTiers?.[node.id] ?? node.floor ?? null;
  const quote = mapTicketAccess(node, items, slots);
  return quote.ok ? quote.tier : state.mapTiers?.[node.id] ?? (node.id === '0:0' ? 1 : null);
}

export function quoteMapTicket(player, collections, node) {
  const key = player.mapDeviceSlots?.map;
  // A socket is a reservation only. Rebuild its entry from the real catalogue
  // and ownership totals, never from an icon, saved socket or caller's count.
  const id = typeof key === 'string' && key.startsWith('item:') ? key.slice(5) : '';
  const doc = collections.item?.get(id)?.doc;
  const items = doc ? [{ key, id, kind: 'item', category: doc.category, tier: doc.tier, count: player.owned.item[id] }] : [];
  return mapTicketAccess(node, items, player.mapDeviceSlots);
}

function ticketChanges(player, quote) {
  if (quote.free) return null;
  const count = player.owned.item[quote.id] - 1;
  const placed = player.bagLayout?.slots?.find(slot => slot?.ref === `item:${quote.id}`);
  const bagLayout = placed ? reducePlacedStack(player.bagLayout, placed.key) : player.bagLayout;
  const mapDeviceSlots = { ...player.mapDeviceSlots }; delete mapDeviceSlots.map;
  return { count, bagLayout, mapDeviceSlots };
}

/** Validate before construction, publish the battle and charge exactly once on success. */
export function travelAtlas(session, player, collections, id, createBattle, { retry = false } = {}) {
  if (session.travelling) throw new Error('正在进入地图，请勿重复操作');
  session.travelling = true;
  try {
    const node = session.state.nodes.find(node => node.id === id);
    const quote = quoteMapTicket(player, collections, node);
    if (!quote.ok) throw new Error(quote.error);
    const prepared = session.prepare(id, { revisit: retry, restart: retry, floor: quote.tier });
    const battle = createBattle(prepared);
    if (!battle || battle.floor !== prepared.options.floor) throw new Error('地图创建失败，未消耗地图票');
    const current = quoteMapTicket(player, collections, node);
    if (!current.ok || current.id !== quote.id || current.key !== quote.key || current.tier !== quote.tier) throw new Error(current.error || '地图票已变化，请重新装入');
    const changes = ticketChanges(player, quote);
    // bind validates the battle before committing; storage errors are handled by
    // AtlasSession. Everything below is synchronous and cannot interleave clicks.
    session.bind(prepared, battle);
    if (changes) {
      if (changes.count) player.owned.item[quote.id] = changes.count;
      else delete player.owned.item[quote.id];
      player.bagLayout = changes.bagLayout;
      player.mapDeviceSlots = changes.mapDeviceSlots;
    }
    return { prepared, battle, ticket: quote };
  } finally { session.travelling = false; }
}

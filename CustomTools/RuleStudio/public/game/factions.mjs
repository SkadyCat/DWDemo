// 势力和委托：夜阙城里的几伙人，各有各的委托和好处。声望到一定档位解锁折扣、商品、更强的佣兵。
// 委托贴在灯井广场的布告板上，一次最多接三个；每打通三张图，没人接的委托换一批。设计见 design/world-loop.md。
import { mapIncome, gradeOfTier, REGION_MATERIAL, materialName } from './economy.mjs';
import { REGION_NAME, NODE_KINDS } from './atlas.mjs';

export const FACTIONS = Object.freeze({
  guild: { name: '冒险者公会', who: '玛蒂', where: '半盏灯酒馆', color: '#ffb060', text: '酒馆兼着公会。接讨伐委托，雇佣兵也在这儿登记。',
    perks: ['可以雇铜牌佣兵', '佣兵出征费 -10%', '可以雇银牌佣兵', '可以雇金牌佣兵', '佣兵出征费 -25%'] },
  mages: { name: '法师学会', who: '伊芙', where: '观星阁', color: '#9fc8ff', text: '九城学派剩下的人凑在观星阁。替他们去试炼场、腐化的地方看看。',
    perks: ['', '天赋花费 -5%', '天赋花费 -10%', '天赋花费 -15%', '天赋花费 -20%'] },
  merchants: { name: '商会', who: '商会柜台', where: '集市街', color: '#e6d8ac', text: '收物资、卖物资。替他们收一批货，价钱好商量。',
    perks: ['', '买卖价格优惠 5%', '买卖价格优惠 10%，精炼不收手续费', '买卖价格优惠 15%', '买卖价格优惠 20%'] },
  keepers: { name: '守灯会', who: '诺娅', where: '金殿', color: '#ffd27a', text: '灯井靠路石续着。给他们送路石，他们拿星契换。',
    perks: ['', '委托多给一枚星契', '地图物品数量 +5%', '地图物品数量 +10%', '地图物品数量 +15%'] },
  scavengers: { name: '拾荒队', who: '格雷', where: '酒馆后院', color: '#c8a070', text: '格雷带的拾荒队，替他们清掉路上的怪，他们告诉你哪儿东西多。',
    perks: ['', '地区物资掉落 +10%', '地区物资掉落 +20%', '地区物资掉落 +30%', '地区物资掉落 +40%'] },
});
export const REP_TIERS = Object.freeze([{ at: 0, name: '陌生' }, { at: 100, name: '认识' }, { at: 400, name: '信任' }, { at: 1200, name: '尊敬' }, { at: 3000, name: '崇敬' }]);
export const repTier = (save, f) => { const v = save.rep?.[f] ?? 0; let t = 0; REP_TIERS.forEach((r, i) => { if (v >= r.at) t = i; }); return t; };
/** What the reputations are worth right now. */
export function perks(save) {
  const t = f => repTier(save, f);
  return {
    talentDiscount: [0, 0.05, 0.1, 0.15, 0.2][t('mages')],
    trade: [0, 0.05, 0.1, 0.15, 0.2][t('merchants')], freeRefine: t('merchants') >= 2,
    mercRank: [1, 1, 2, 3, 3][t('guild')], mercFee: t('guild') >= 4 ? 0.75 : t('guild') >= 1 ? 0.9 : 1,
    quantity: [0, 0, 0.05, 0.1, 0.15][t('keepers')], extraSigil: t('keepers') >= 1,
    materials: [0, 0.1, 0.2, 0.3, 0.4][t('scavengers')],
  };
}
export function addRep(save, f, n) { save.rep ??= {}; const before = repTier(save, f); save.rep[f] = (save.rep[f] ?? 0) + n; return repTier(save, f) > before; }

// ------------------------------------------------------------------ contracts
/**
 * A contract: { id, faction, title, text, goal, need, have, reward: { silver, rep, materials?, scarabs? }, state: 'open' | 'taken' | 'done' }
 * goal: { type: 'clear', family?, kind?, minTier? } (counted by questEvent-style events) · { type: 'deliver', item: material id | 'waystone', minTier? }
 */
const rand = seed => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const FAMS = Object.keys(REGION_MATERIAL);
function makeContract(rng, save, faction, n) {
  const top = Math.max(1, save.unlocked ?? 1), tier = Math.max(1, top - Math.floor(rng() * 3)), fam = FAMS[Math.floor(rng() * FAMS.length)], I = mapIncome(tier), R = REGION_NAME[fam];
  const id = `k${Date.now().toString(36)}${n}${Math.floor(rng() * 1e6).toString(36)}`;
  const base = { id, faction, state: 'open', have: 0, tier };
  switch (faction) {
    case 'guild': return { ...base, title: `讨伐：${R}的首领`, text: `攻下一座${R} T${tier} 及以上的首领要塞。`, goal: { type: 'clear', family: fam, kind: 'boss', minTier: tier }, need: 1, reward: { silver: Math.round(I * 2.2), rep: 70 } };
    case 'scavengers': { const k = 3; return { ...base, title: `清路：${R}`, text: `在${R}打通 ${k} 张 T${tier} 及以上的地图，拾荒队才敢过去。`, goal: { type: 'clear', family: fam, minTier: tier }, need: k, reward: { silver: Math.round(I * 1.6), rep: 50, materials: { [`${fam}_${gradeOfTier(tier)}`]: 3 } } }; }
    case 'merchants': { const mat = `${fam}_${gradeOfTier(tier)}`, k = 6 + Math.floor(rng() * 5); return { ...base, title: `收货：${materialName(mat)}`, text: `给商会送 ${k} 份${materialName(mat)}（在布告板交货）。`, goal: { type: 'deliver', item: mat }, need: k, reward: { silver: Math.round(k * [14, 60, 220][gradeOfTier(tier)] * 1.9), rep: 50 } }; }
    case 'keepers': return { ...base, title: '续灯：送一块路石', text: `给守灯会送一块 T${tier} 及以上的路石（在布告板交货）。`, goal: { type: 'deliver', item: 'waystone', minTier: tier }, need: 1, reward: { silver: Math.round(I * 0.8), rep: 70, scarabs: 1 } };
    default: { const kind = ['trial', 'vault', 'corrupt'][Math.floor(rng() * 3)]; return { ...base, title: `考察：${NODE_KINDS[kind].name}`, text: `替法师学会穿过一张 T${tier} 及以上的${NODE_KINDS[kind].name}地图。`, goal: { type: 'clear', kind, minTier: tier }, need: 1, reward: { silver: Math.round(I * 1.8), rep: 70, materials: { sand: 3 } } }; }
  }
}
export const BOARD_SIZE = 5, MAX_TAKEN = 3, REFRESH_MAPS = 3;
/** Keep the board full: open contracts are replaced every few maps; taken ones stay until done. */
export function refreshBoard(save, force = false) {
  const b = save.board ??= { list: [], mapsAt: -99, seed: 1 };
  const maps = save.stats?.maps ?? 0;
  if (force || maps - b.mapsAt >= REFRESH_MAPS) { b.list = b.list.filter(c => c.state === 'taken'); b.mapsAt = maps; }
  const rng = rand((b.seed = (b.seed * 48271 + maps + 7) % 2147483647));
  const order = ['guild', 'scavengers', 'merchants', 'keepers', 'mages'];
  for (let i = 0; b.list.length < BOARD_SIZE + b.list.filter(c => c.state === 'taken').length && i < 20; ++i) {
    const f = order[(b.list.length + i) % order.length];
    if (b.list.filter(c => c.state === 'open' && c.faction === f).length >= 2) continue;
    b.list.push(makeContract(rng, save, f, i));
  }
  return b.list;
}
export function takeContract(save, id) {
  const c = save.board?.list.find(x => x.id === id);
  if (!c || c.state !== 'open' || save.board.list.filter(x => x.state === 'taken').length >= MAX_TAKEN) return false;
  c.state = 'taken'; return true;
}
export function dropContract(save, id) { const b = save.board; if (!b) return; b.list = b.list.filter(c => c.id !== id || c.state !== 'taken'); }
/** Map events advance taken clear-contracts. Returns the contracts that just finished (their rewards are paid). */
export function contractEvent(save, ev) {
  const done = [];
  for (const c of save.board?.list ?? []) {
    if (c.state !== 'taken' || c.goal.type !== 'clear' || ev.type !== 'clear') continue;
    const g = c.goal;
    if ((g.family && ev.family !== g.family) || (g.kind && ev.kind !== g.kind) || (g.minTier && ev.tier < g.minTier)) continue;
    if (++c.have >= c.need) done.push(finish(save, c));
  }
  return done;
}
/** Hand in a delivery at the board: materials or a waystone come out of your things. */
export function deliver(save, id) {
  const c = save.board?.list.find(x => x.id === id);
  if (!c || c.state !== 'taken' || c.goal.type !== 'deliver') return null;
  if (c.goal.item === 'waystone') {
    const pool = [...save.waystones, ...(save.bagStones ?? [])], w = pool.filter(s => s.tier >= (c.goal.minTier ?? 1)).sort((a, b) => a.tier - b.tier)[0];
    if (!w) return null;
    for (const list of [save.waystones, save.bagStones ?? []]) { const i = list.indexOf(w); if (i >= 0) list.splice(i, 1); }
    c.have = 1;
  } else {
    if ((save.materials?.[c.goal.item] ?? 0) < c.need) return null;
    save.materials[c.goal.item] -= c.need; c.have = c.need;
  }
  return finish(save, c);
}
function finish(save, c) {
  c.state = 'done';
  const r = c.reward, p = perks(save);
  save.silver = (save.silver ?? 0) + r.silver;
  for (const [id, n] of Object.entries(r.materials ?? {})) save.materials[id] = (save.materials[id] ?? 0) + n;
  const sigils = (r.scarabs ?? 0) + (c.faction === 'keepers' && p.extraSigil ? 1 : 0);
  if (sigils) { save.scarabs ??= {}; const id = ['bounty', 'coin', 'path', 'swarm'][Math.floor(Math.random() * 4)] + '_' + Math.min(2, gradeOfTier(c.tier)); save.scarabs[id] = (save.scarabs[id] ?? 0) + sigils; c.sigil = { id, n: sigils }; }
  const up = addRep(save, c.faction, r.rep);
  save.board.list = save.board.list.filter(x => x !== c);
  return { contract: c, rankUp: up };
}

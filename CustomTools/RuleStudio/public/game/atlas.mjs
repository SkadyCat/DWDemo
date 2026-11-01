// 地图图集：一张由种子生成的星图。起点在中心（T1），越往外 T 阶越高；五个地区按扇区分布；
// 节点之间用不交叉的路连起来（最小生成树保证连通，再补近邻路成网）。打通一个节点，与它相连的节点就开放。
// 只管数据：生成、可达性、节点修正；画面在 page.mjs。
import { dungeonRandom } from './dungeon.mjs';
import { MAP_TIERS } from '../../core/content/maps.mjs';
import { patchMap } from '../../core/content/overrides.mjs';

export const ATLAS_RADIUS = 1150;
const FAMILY_ORDER = ['ember', 'storm', 'frost', 'blight', 'ruin'];
export const FAMILY_HUE = { ember: '#ff8a3d', frost: '#8fd8ff', storm: '#ffe066', blight: '#9fe07a', ruin: '#d8c39a' };
export const REGION_NAME = { ember: '余烬之域', frost: '霜原之域', storm: '雷暴之域', blight: '腐沼之域', ruin: '废墟之域' };

export const NODE_KINDS = Object.freeze({
  normal: { name: '地图', icon: null, text: '' },
  boss: { name: '首领要塞', icon: 'crowned-skull', text: '首领更强（生命 +50%），传奇几率 ×2.5，物品数量 +50%。' },
  vault: { name: '宝库', icon: 'locked-chest', text: '怪少一些，物品数量 ×2，传奇几率 ×3。' },
  corrupt: { name: '腐化', icon: 'evil-moon', text: '怪物生命 +35%、伤害 +30%；物品数量 +60%，传奇几率 ×2。' },
  trial: { name: '试炼', icon: 'crossed-swords', text: '怪群规模 ×1.8，精英更多。清屏的地方。' },
});

/** Map modifiers a node can carry (rolled once with the atlas). */
export const NODE_MODS = Object.freeze(patchMap('nodeMods', {
  dense: { text: '怪群规模 +40%', pack: 1.4, quantity: 0.15 },
  elite: { text: '精英几率 +60%', elite: 1.6, quantity: 0.1 },
  hardy: { text: '怪物生命 +30%', life: 1.3, quantity: 0.12 },
  brutal: { text: '怪物伤害 +25%', damage: 1.25, quantity: 0.12 },
  rich: { text: '物品数量 +30%', quantity: 0.3 },
  relic: { text: '传奇几率 ×2', legend: 2 },
}));
const KIND_MODS = {
  boss: { bossLife: 1.5, legend: 2.5, quantity: 0.5 },
  vault: { pack: 0.8, quantity: 1, legend: 3 },
  corrupt: { life: 1.35, damage: 1.3, quantity: 0.6, legend: 2 },
  trial: { pack: 1.8, elite: 1.3, quantity: 0.3 },
};

const PREFIX = {
  ember: ['灰烬', '焚风', '熔岩', '赤焰', '炭火', '燎原'], frost: ['霜冢', '冰湖', '寒鸦', '雪葬', '凛风', '白骨'],
  storm: ['雷鸣', '风暴', '惊雷', '天穹', '电光', '鸣金'], blight: ['瘴林', '毒沼', '腐根', '蛛巢', '疫井', '苔原'],
  ruin: ['废都', '石像', '断碑', '旧王', '残垣', '古道'],
};
const SUFFIX = ['回廊', '祭坛', '深渊', '王座', '荒原', '渡口', '坟场', '尖塔', '裂谷', '圣所', '矿坑', '城郭', '港湾', '迷宫', '神殿', '营垒'];

function segmentsCross(a, b, c, d) {
  if (a === c || a === d || b === c || b === d) return false;
  const o = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

/** Build the atlas for a seed. Pure: the same seed always gives the same atlas. */
export function generateAtlas(seed, { count = 130, radius = ATLAS_RADIUS } = {}) {
  const rng = dungeonRandom((seed ^ 0xa71a5) >>> 0);
  const turn = rng() * Math.PI * 2;                      // where the first region starts
  const pts = [{ x: 0, y: 0 }];
  const minDist = radius * 0.083;
  for (let tries = 0; pts.length < count && tries < 20000; ++tries) {
    const r = Math.sqrt(rng()) * radius, a = rng() * Math.PI * 2;
    const p = { x: Math.cos(a) * r, y: Math.sin(a) * r };
    if (Math.hypot(p.x, p.y) < minDist * 1.1) continue;
    if (pts.every(q => Math.hypot(q.x - p.x, q.y - p.y) >= minDist)) pts.push(p);
  }
  const sector = p => {
    const a = ((Math.atan2(p.y, p.x) - turn) % (Math.PI * 2) + Math.PI * 4) % (Math.PI * 2);
    return Math.floor(a / (Math.PI * 2) * FAMILY_ORDER.length) % FAMILY_ORDER.length;
  };
  const used = new Set();
  // Tier follows how far out a node is by rank, so every tier gets about the same number of maps.
  const rank = new Map([...pts.keys()].sort((a, b) => Math.hypot(pts[a].x, pts[a].y) - Math.hypot(pts[b].x, pts[b].y)).map((id, i) => [id, i]));
  const nodes = pts.map((p, id) => {
    const u = rank.get(id) / pts.length;
    const tier = id === 0 ? 1 : Math.max(1, Math.min(MAP_TIERS, Math.floor(1 + u * MAP_TIERS + (rng() - 0.5) * 0.9)));
    const family = id === 0 ? 'ruin' : FAMILY_ORDER[sector(p)];
    let name = '';
    for (let k = 0; k < 8 && (!name || used.has(name)); ++k) name = PREFIX[family][Math.floor(rng() * 6)] + SUFFIX[Math.floor(rng() * SUFFIX.length)];
    used.add(name);
    return { id, x: Math.round(p.x), y: Math.round(p.y), tier, family, kind: 'normal', name: id === 0 ? '营地之门' : name, mods: [] };
  });

  // Roads: a minimum spanning tree (never crosses itself) plus short neighbour roads that do not cross.
  const n = nodes.length, dist = (a, b) => Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y);
  const edges = [], inTree = new Set([0]), best = new Map();
  for (let i = 1; i < n; ++i) best.set(i, { d: dist(0, i), from: 0 });
  while (inTree.size < n) {
    let pick = -1, pd = Infinity;
    for (const [i, b] of best) if (b.d < pd) { pd = b.d; pick = i; }
    edges.push([best.get(pick).from, pick]); inTree.add(pick); best.delete(pick);
    for (const [i, b] of best) { const d = dist(pick, i); if (d < b.d) best.set(i, { d, from: pick }); }
  }
  const mean = edges.reduce((s, [a, b]) => s + dist(a, b), 0) / edges.length;
  const has = (a, b) => edges.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  const candidates = [];
  for (let a = 0; a < n; ++a) {
    const near = [...Array(n).keys()].filter(b => b !== a).sort((p, q) => dist(a, p) - dist(a, q)).slice(0, 4);
    for (const b of near) if (a < b && dist(a, b) < mean * 1.55) candidates.push([a, b]);
  }
  candidates.sort((p, q) => dist(...p) - dist(...q));
  for (const [a, b] of candidates) {
    if (has(a, b)) continue;
    if (edges.some(([c, d]) => segmentsCross(nodes[a], nodes[b], nodes[c], nodes[d]))) continue;
    if (rng() < 0.82) edges.push([a, b]);
  }

  // Special nodes: three citadels per region (around T6, T11, T16), then vaults, corruptions and trials.
  for (const [fi, fam] of FAMILY_ORDER.entries()) {
    const centre = turn + (fi + 0.5) / FAMILY_ORDER.length * Math.PI * 2;
    for (const target of [6, 11, 16]) {
      let pick = null, score = Infinity;
      for (const nd of nodes) {
        if (nd.family !== fam || nd.kind !== 'normal' || nd.id === 0) continue;
        const da = Math.abs(((Math.atan2(nd.y, nd.x) - centre + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        const s = Math.abs(nd.tier - target) * 2 + da * 6;
        if (s < score) { score = s; pick = nd; }
      }
      if (pick) pick.kind = 'boss';
    }
  }
  for (const nd of nodes) {
    if (nd.id === 0 || nd.kind !== 'normal') continue;
    const r = rng();
    if (r < 0.07) nd.kind = 'vault';
    else if (r < 0.15 && nd.tier >= 4) nd.kind = 'corrupt';
    else if (r < 0.21 && nd.tier >= 2) nd.kind = 'trial';
    const keys = Object.keys(NODE_MODS);
    const want = nd.kind === 'corrupt' ? 1 + Math.floor(rng() * 2) : nd.tier >= 3 ? Math.floor(rng() * 2.6) : 0;
    while (nd.mods.length < want) { const k = keys[Math.floor(rng() * keys.length)]; if (!nd.mods.includes(k)) nd.mods.push(k); }
  }
  const links = nodes.map(() => []);
  for (const [a, b] of edges) { links[a].push(b); links[b].push(a); }
  return { seed, nodes, edges, links, radius };
}

/** Everything a run on this node changes: monster counts, toughness and loot. */
export function nodeMods(node) {
  const out = { quantity: 1, pack: 1, elite: 1, legend: 1, life: 1, damage: 1, bossLife: 1 };
  const add = m => {
    if (!m) return;
    for (const [k, v] of Object.entries(m)) { if (k === 'text') continue; if (k === 'quantity') out.quantity += v; else out[k] *= v; }
  };
  add(KIND_MODS[node.kind]);
  for (const id of node.mods) add(NODE_MODS[id]);
  return out;
}

/** Fresh atlas progress. An old save that had unlocked tiers keeps that progress: nodes below it count as done. */
export function newAtlasState(seed, unlocked = 1) {
  const atlas = generateAtlas(seed);
  const done = atlas.nodes.filter(n => n.id === 0 || n.tier < unlocked).map(n => n.id);
  return { seed, done, at: 0 };
}

/** done → open (one road away) → seen (two roads away, under thin fog) → hidden. */
export function atlasView(atlas, state) {
  const done = new Set(state.done), open = new Set(), seen = new Set();
  for (const id of done) for (const b of atlas.links[id]) if (!done.has(b)) open.add(b);
  if (!done.size) open.add(0);
  for (const id of open) for (const b of atlas.links[id]) if (!done.has(b) && !open.has(b)) seen.add(b);
  const status = id => done.has(id) ? 'done' : open.has(id) ? 'open' : seen.has(id) ? 'seen' : 'hidden';
  return { done, open, seen, status };
}

/** Mark a node cleared; returns how many nodes it newly opened. */
export function completeNode(atlas, state, id) {
  const before = atlasView(atlas, state).open.size + state.done.length;
  if (!state.done.includes(id)) state.done.push(id);
  state.at = id;
  const v = atlasView(atlas, state);
  return Math.max(0, v.open.size + state.done.length - before);
}

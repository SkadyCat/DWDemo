import { validateFloor } from './sim/dungeon-battle.mjs';

// Navigation and presentation only. Battles still use the existing Tower floor rules.
export const ATLAS_VERSION = 1;
export const ATLAS_ORIGIN = '0:0';
const INITIAL_RADIUS = 10;
const DIRECTIONS = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
const BIOMES = ['forest', 'marsh', 'ruins', 'desert', 'snow', 'coast'];
const REGION_NAMES = {
  forest: ['苍翠林地', '暮色深林', '古木之境', '幽影密林'],
  marsh: ['雾隐泽地', '沉寂泥沼', '苔痕湿地', '灰雾浅滩'],
  ruins: ['失落遗迹', '断壁回廊', '古城残垣', '寂静庭院'],
  desert: ['金砂荒原', '风蚀丘陵', '落日沙海', '赤岩旷野'],
  snow: ['寒霜山麓', '银白冻原', '雪落高地', '冰封峡谷'],
  coast: ['潮汐海岸', '碎礁湾', '静水长滩', '苍蓝群岛'],
};

function hash(...parts) {
  const input = parts.join('|');
  let value = 2166136261;
  for (let i = 0; i < input.length; i++) { value ^= input.charCodeAt(i); value = Math.imul(value, 16777619); }
  value ^= value >>> 16; value = Math.imul(value, 0x7feb352d); value ^= value >>> 15;
  return value >>> 0;
}
function canonicalSeed(seed) {
  if (typeof seed === 'string' && seed.length > 0 && seed.length <= 128) return hash('atlas', seed);
  if (Number.isSafeInteger(seed) && seed >= 0 && seed <= 0xffffffff) return seed >>> 0;
  throw new Error('星图种子必须是有效整数或非空字符串');
}
function ring(q, r) { return Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)); }
function coordinates(id) {
  if (typeof id !== 'string' || !/^-?(?:0|[1-9]\d*):-?(?:0|[1-9]\d*)$/.test(id)) throw new Error('无效的星图区域编号');
  const [q, r] = id.split(':').map(Number);
  if (!Number.isSafeInteger(q) || !Number.isSafeInteger(r) || `${q}:${r}` !== id) throw new Error('无效的星图区域编号');
  return { q, r };
}
function parentId(seed, q, r) {
  const depth = ring(q, r);
  if (depth === 0) return null;
  const parents = DIRECTIONS.map(([dq, dr]) => [q + dq, r + dr]).filter(([x, y]) => ring(x, y) === depth - 1);
  const [x, y] = parents[hash(seed, q, r, 'parent') % parents.length];
  return `${x}:${y}`;
}
function connected(seed, q, r, x, y) {
  const a = `${q}:${r}`, b = `${x}:${y}`;
  return parentId(seed, q, r) === b || parentId(seed, x, y) === a || hash(seed, ...[a, b].sort(), 'link') % 100 < 32;
}
function neighborIds(seed, q, r) {
  return DIRECTIONS.filter(([dq, dr]) => connected(seed, q, r, q + dq, r + dr)).map(([dq, dr]) => `${q + dq}:${r + dr}`);
}
function describe(seed, q, r) {
  const id = `${q}:${r}`, depth = ring(q, r);
  // Smooth regional fields keep nearby locations visually related without changing encounters.
  const region = `${Math.floor(q / 4)}:${Math.floor(r / 4)}`;
  const biome = BIOMES[hash(seed, region, 'biome') % BIOMES.length];
  const name = depth === 0 ? '初始界域' : REGION_NAMES[biome][hash(seed, id, 'name') % REGION_NAMES[biome].length];
  const jitterX = (hash(seed, id, 'x') / 0x100000000 - .5) * 68;
  const jitterY = (hash(seed, id, 'y') / 0x100000000 - .5) * 68;
  return { id, x: q * 142 + r * 71 + jitterX, y: r * 123 + jitterY, depth, floor: id === ATLAS_ORIGIN ? 1 : null, name, biome };
}
function build(seed, completedIds = [], attempts = {}, selectedId = ATLAS_ORIGIN, activeNodeId = null, currentNodeId = activeNodeId ?? completedIds.at(-1) ?? ATLAS_ORIGIN, mapTiers = {}) {
  const locations = new Set(), completed = new Set(completedIds);
  const addRegion = (cq, cr, radius) => {
    for (let q = -radius; q <= radius; q++) {
      for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) locations.add(`${cq + q}:${cr + r}`);
    }
  };
  addRegion(0, 0, INITIAL_RADIUS);
  // Generate around the explored route, rather than allocating an entire ever-growing disk.
  // Every neighbor of a completed location is present, so a finite route always has a frontier.
  for (const id of completedIds) { const { q, r } = coordinates(id); addRegion(q, r, 4); }
  let nodes = [];
  for (const id of locations) {
    const { q, r } = coordinates(id);
    const node = describe(seed, q, r);
    if (mapTiers[id] != null) node.floor = mapTiers[id];
    nodes.push(node);
  }
  nodes.sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id, 'en'));
  const byId = new Map(nodes.map(node => [node.id, node]));
  for (const node of nodes) {
    const { q, r } = coordinates(node.id);
    node.neighbors = neighborIds(seed, q, r).filter(id => byId.has(id));
    node.status = 'hidden';
  }
  // Fringe islands are kept in the fog until a connecting route has been generated.
  const connectedIds = new Set([ATLAS_ORIGIN]), connectedQueue = [ATLAS_ORIGIN];
  for (let i = 0; i < connectedQueue.length; i++) for (const id of byId.get(connectedQueue[i]).neighbors) {
    if (!connectedIds.has(id)) { connectedIds.add(id); connectedQueue.push(id); }
  }
  nodes = nodes.filter(node => connectedIds.has(node.id));
  for (const node of nodes) node.neighbors = node.neighbors.filter(id => connectedIds.has(id));
  // A little unexplored terrain is visible from the start; clearing reveals two more hops.
  const revealed = new Set(), queue = [{ id: ATLAS_ORIGIN, remaining: 3 }, ...completedIds.map(id => ({ id, remaining: 2 }))];
  const seen = new Map();
  for (let i = 0; i < queue.length; i++) {
    const { id, remaining } = queue[i];
    if ((seen.get(id) ?? -1) >= remaining) continue;
    seen.set(id, remaining); revealed.add(id);
    if (remaining > 0) for (const neighbor of byId.get(id)?.neighbors ?? []) queue.push({ id: neighbor, remaining: remaining - 1 });
  }
  for (const node of nodes) {
    const available = completed.size === 0 ? node.id === ATLAS_ORIGIN : node.neighbors.some(id => completed.has(id));
    node.status = node.id === activeNodeId ? 'active' : completed.has(node.id) ? 'cleared' : available ? attempts[node.id] > 0 ? 'failed' : 'available' : revealed.has(node.id) ? 'locked' : 'hidden';
  }
  const selected = byId.get(selectedId);
  if (!selected || selected.status === 'hidden') selectedId = activeNodeId ?? nodes.find(node => ['available', 'failed'].includes(node.status))?.id ?? ATLAS_ORIGIN;
  if (!nodes.some(n => n.id === currentNodeId && n.status !== 'hidden')) currentNodeId = activeNodeId ?? completedIds.at(-1) ?? ATLAS_ORIGIN;
  return { version: ATLAS_VERSION, seed, radius: nodes.reduce((max, node) => Math.max(max, node.depth), 0), nodes, selectedId, currentNodeId, activeNodeId, completedIds: [...completedIds], attempts: { ...attempts }, mapTiers: { ...mapTiers } };
}

export function createAtlas(seed = 1) { return build(canonicalSeed(seed)); }

// A viewport is a disposable projection, not exploration progress. Its size
// depends on the screen, never on how far the player has dragged from origin.
const projectionContexts = new WeakMap();
function projectionContext(state) {
  let context = projectionContexts.get(state);
  if (context) return context;
  const known = new Map(state.nodes.map(node => [node.id, node]));
  const completed = new Set(state.completedIds), revealed = new Set();
  const queue = [{ id: ATLAS_ORIGIN, remaining: 3 }, ...state.completedIds.map(id => ({ id, remaining: 2 }))], seen = new Map();
  for (let i = 0; i < queue.length; i++) {
    const { id, remaining } = queue[i];
    if ((seen.get(id) ?? -1) >= remaining) continue;
    seen.set(id, remaining); revealed.add(id);
    if (remaining > 0) { const { q, r } = coordinates(id); for (const neighbor of neighborIds(state.seed, q, r)) queue.push({ id: neighbor, remaining: remaining - 1 }); }
  }
  context = { known, completed, revealed }; projectionContexts.set(state, context); return context;
}
export function atlasNodeAt(state, id) {
  const { q, r } = coordinates(id), { known, completed, revealed } = projectionContext(state);
  const node = { ...describe(state.seed, q, r), ...known.get(id), neighbors: neighborIds(state.seed, q, r) };
  if (state.mapTiers[id] != null) node.floor = state.mapTiers[id];
  const available = completed.size === 0 ? id === ATLAS_ORIGIN : node.neighbors.some(id => completed.has(id));
  node.status = id === state.activeNodeId ? 'active' : completed.has(id) ? 'cleared' : available ? state.attempts[id] > 0 ? 'failed' : 'available' : revealed.has(id) ? 'locked' : 'hidden';
  return node;
}
export function atlasNodesInBounds(state, bounds) {
  const { minX, minY, maxX, maxY } = bounds;
  if (![minX, minY, maxX, maxY].every(Number.isFinite) || minX > maxX || minY > maxY) throw new Error('无效的星图视野');
  const r0 = Math.floor((minY - 34) / 123), r1 = Math.ceil((maxY + 34) / 123);
  if ((r1 - r0 + 1) * (Math.ceil((maxX - minX + 68) / 142) + 3) > 20000) throw new Error('星图视野过大');
  const nodes = [];
  for (let r = r0; r <= r1; r++) {
    const q0 = Math.floor((minX - r * 71 - 34) / 142), q1 = Math.ceil((maxX - r * 71 + 34) / 142);
    for (let q = q0; q <= q1; q++) {
      const node = atlasNodeAt(state, `${q}:${r}`);
      if (node.x >= minX && node.x <= maxX && node.y >= minY && node.y <= maxY) nodes.push(node);
    }
  }
  return nodes;
}

// Saved geometry and status are never trusted: regenerate them from the seed and valid progress.
// An interrupted battle becomes retryable; loading a save never awards a completion.
export function normalizeAtlas(raw) {
  if (!raw || typeof raw !== 'object' || raw.version !== ATLAS_VERSION) throw new Error('不支持的星图存档版本');
  const seed = canonicalSeed(raw.seed);
  if (!Array.isArray(raw.completedIds) || raw.completedIds.length > 100000) throw new Error('无效的星图探索进度');
  const completedIds = [...new Set(raw.completedIds)], completed = new Set(completedIds);
  for (const id of completedIds) coordinates(id);
  if (completed.size) {
    if (!completed.has(ATLAS_ORIGIN)) throw new Error('星图探索进度未连接起点');
    const visited = new Set([ATLAS_ORIGIN]), queue = [ATLAS_ORIGIN];
    for (let i = 0; i < queue.length; i++) {
      const { q, r } = coordinates(queue[i]);
      for (const id of neighborIds(seed, q, r)) if (completed.has(id) && !visited.has(id)) { visited.add(id); queue.push(id); }
    }
    if (visited.size !== completed.size) throw new Error('星图探索进度包含未连接区域');
  }
  const attempts = {};
  if (raw.attempts != null && (typeof raw.attempts !== 'object' || Array.isArray(raw.attempts))) throw new Error('无效的星图挑战记录');
  for (const [id, count] of Object.entries(raw.attempts ?? {})) {
    coordinates(id);
    if (!Number.isSafeInteger(count) || count < 1) throw new Error('无效的星图挑战次数');
    attempts[id] = count;
  }
  const mapTiers = {};
  if (raw.mapTiers != null && (typeof raw.mapTiers !== 'object' || Array.isArray(raw.mapTiers))) throw new Error('无效的地图层级记录');
  for (const [id, tier] of Object.entries(raw.mapTiers ?? {})) {
    coordinates(id);
    if (!Number.isSafeInteger(tier) || tier < 1 || tier > 16 || !attempts[id]) throw new Error('无效的地图层级记录');
    mapTiers[id] = tier;
  }
  const state = build(seed, completedIds, attempts, raw.selectedId, null, raw.currentNodeId ?? raw.activeNodeId ?? completedIds.at(-1) ?? ATLAS_ORIGIN, mapTiers);
  if (raw.activeNodeId != null) {
    const node = state.nodes.find(node => node.id === raw.activeNodeId);
    const revisiting = node?.status === 'cleared' && raw.currentNodeId === node.id && attempts[node.id] >= 2;
    if (!node || (!['available', 'failed'].includes(node.status) && !revisiting)) throw new Error('星图存档包含无效的进行中区域');
    attempts[node.id] = Math.max(attempts[node.id] ?? 0, 1);
    return build(seed, completedIds, attempts, node.id, null, node.id, mapTiers);
  }
  return state;
}

export function visibleAtlas(state) {
  const nodes = state.nodes.filter(node => node.status !== 'hidden'), ids = new Set(nodes.map(node => node.id));
  const edges = [];
  for (const node of nodes) for (const id of node.neighbors) if (ids.has(id) && node.id < id) edges.push({ source: node.id, target: id });
  const bounds = nodes.reduce((box, node) => ({ minX: Math.min(box.minX, node.x), minY: Math.min(box.minY, node.y), maxX: Math.max(box.maxX, node.x), maxY: Math.max(box.maxY, node.y) }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  return { nodes, edges, bounds,
    availableCount: nodes.filter(node => node.status === 'available' || node.status === 'failed').length, completedCount: state.completedIds.length };
}
function getNode(state, id) {
  const node = state.nodes.find(node => node.id === id);
  if (!node) throw new Error('星图区域不存在');
  return node;
}
export function selectAtlasNode(state, id) {
  const node = getNode(state, id);
  if (node.status === 'hidden') throw new Error('该区域仍在迷雾中');
  return { ...state, selectedId: id };
}
export function enterAtlasNode(state, id = state.selectedId, { revisit = false, floor } = {}) {
  if (state.activeNodeId != null) throw new Error('已有正在进行的区域挑战');
  const node = getNode(state, id);
  if (!['available', 'failed'].includes(node.status) && !(revisit && node.status === 'cleared')) throw new Error('只能挑战与已通关区域连接的前沿');
  const tier = validateFloor(floor ?? state.mapTiers?.[id] ?? 1);
  if (tier > 16) throw new Error('地图层级必须为 T1–T16');
  return build(state.seed, state.completedIds, { ...state.attempts, [id]: (state.attempts[id] ?? 0) + 1 }, id, id, id, { ...state.mapTiers, [id]: tier });
}
export function completeAtlasNode(state, id = state.activeNodeId) {
  if (state.activeNodeId == null && state.completedIds.includes(id)) return state;
  if (id == null || id !== state.activeNodeId || getNode(state, id).status !== 'active') throw new Error('只能完成正在进行的区域挑战');
  return build(state.seed, [...new Set([...state.completedIds, id])], state.attempts, id, null, id, state.mapTiers);
}
export function failAtlasNode(state, id = state.activeNodeId) {
  if (id == null || id !== state.activeNodeId || getNode(state, id).status !== 'active') throw new Error('只能结算正在进行的区域挑战');
  return build(state.seed, state.completedIds, state.attempts, id, null, id, state.mapTiers);
}
export function atlasBattleOptions(state, id = state.selectedId) {
  const node = getNode(state, id);
  const floor = validateFloor(state.mapTiers?.[id] ?? node.floor ?? 1);
  return { floor, mapTier: floor, seed: hash(state.seed, id, 'battle') };
}

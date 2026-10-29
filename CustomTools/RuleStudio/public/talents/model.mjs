// Allocation/collection host layer. The existing rule compiler and combat semantics are unchanged.
const clone = value => JSON.parse(JSON.stringify(value));
export const freshAllocation = tree => ({ schema: 1, treeId: tree.id, revision: tree.revision, budget: tree.defaultBudget, allocated: [], choices: {} });
export const spentPoints = (tree, state) => (state.allocated || []).reduce((sum, id) => sum + (tree.nodes.find(n => n.id === id)?.cost || 0), 0);
export function adjacency(tree) {
  const graph = new Map(tree.nodes.map(node => [node.id, []]));
  for (const [a, b] of tree.edges) { graph.get(a)?.push(b); graph.get(b)?.push(a); }
  return graph;
}
function reachable(tree, ids) {
  const graph = adjacency(tree), allowed = new Set([tree.root, ...ids]), seen = new Set([tree.root]), queue = [tree.root];
  for (const id of queue) for (const next of graph.get(id) || []) if (allowed.has(next) && !seen.has(next)) { seen.add(next); queue.push(next); }
  return seen;
}
export function validateTree(tree, library = null) {
  if (tree?.schema !== 1 || !Array.isArray(tree.nodes) || !Array.isArray(tree.edges) || !Array.isArray(tree.attributes) || !tree.attributes.length) return '星盘数据格式无效';
  const ids = new Set(tree.nodes.map(n => n.id));
  if (ids.size !== tree.nodes.length || !ids.has(tree.root)) return '星盘节点重复或缺少起点';
  if (tree.nodes.filter(n => n.kind === 'origin').length !== 1 || tree.nodes.find(n => n.id === tree.root)?.kind !== 'origin') return '星盘起点无效';
  const edges = new Set();
  for (const edge of tree.edges) {
    if (!Array.isArray(edge) || edge.length !== 2 || edge[0] === edge[1] || edge.some(id => !ids.has(id))) return '星盘连线无效';
    const key = [...edge].sort().join(':'); if (edges.has(key)) return '星盘连线重复'; edges.add(key);
  }
  if (reachable(tree, [...ids]).size !== ids.size) return '星盘存在无法到达的节点';
  for (const node of tree.nodes) if (!['origin', 'attribute', 'legendary'].includes(node.kind) || !Number.isFinite(node.x) || !Number.isFinite(node.y) || node.cost !== (node.kind === 'origin' ? 0 : 1)) return `节点无效：${node.id}`;
  if (new Set(tree.attributes.map(a => a.id)).size !== tree.attributes.length) return '属性选项重复';
  const checkEntries = entries => {
    if (!Array.isArray(entries) || !entries.length) return '缺少特性';
    for (const entry of entries) {
      if (!entry || typeof entry.id !== 'string' || !entry.params || !Array.isArray(entry.with)) return '特性格式无效';
      const source = library?.trait(entry.id)?.source;
      if (library && !source) return `未知特性：${entry.id}`;
      if (source && Object.keys(entry.params).some(key => ![...source.params.keys()].some(p => p.toLowerCase() === key.toLowerCase()))) return `未知特性参数：${entry.id}`;
      if (Object.values(entry.params).some(n => !Number.isFinite(n))) return `特性数值无效：${entry.id}`;
      if (entry.with.length) { const error = checkEntries(entry.with); if (error) return error; }
    }
    return '';
  };
  for (const row of [...tree.attributes, ...tree.nodes.filter(n => n.kind === 'legendary')]) { const error = checkEntries(row.traits); if (error) return `${row.id}: ${error}`; }
  return '';
}
export function validateAllocation(tree, state) {
  if (!state || state.schema !== 1 || state.treeId !== tree.id || state.revision !== tree.revision || !Array.isArray(state.allocated) || !state.choices || typeof state.choices !== 'object' || Array.isArray(state.choices)) return '天赋方案版本或格式无效';
  if (!Number.isInteger(state.budget) || state.budget < 0 || state.budget > tree.nodes.length - 1) return '规划点数超出范围';
  const ids = new Set(state.allocated), nodes = new Map(tree.nodes.map(n => [n.id, n]));
  if (ids.size !== state.allocated.length || ids.has(tree.root) || [...ids].some(id => !nodes.has(id))) return '天赋方案包含重复或未知节点';
  if (spentPoints(tree, state) > state.budget) return '规划点数不足';
  for (const [id, choice] of Object.entries(state.choices)) if (nodes.get(id)?.kind !== 'attribute' || !tree.attributes.some(a => a.id === choice)) return '属性选择无效';
  for (const id of ids) if (nodes.get(id).kind === 'attribute' && !state.choices[id]) return '属性节点尚未选择属性';
  if (reachable(tree, [...ids]).size !== ids.size + 1) return '天赋路径未连接启明星';
  return '';
}
export function upgradeAllocation(tree, state) {
  if (!validateAllocation(tree,state)) return {state:clone(state),legacy:null};
  const fresh=freshAllocation(tree);
  if (!state || state.schema!==1 || state.treeId!==tree.id || !Number.isInteger(state.revision) || state.revision>=tree.revision) return {state:fresh,legacy:null};
  if(Number.isInteger(state.budget)&&state.budget>=0&&state.budget<tree.nodes.length)fresh.budget=state.budget;
  const upgraded={...clone(state),revision:tree.revision};
  if(!validateAllocation(tree,upgraded))return{state:upgraded,legacy:null};
  return{state:fresh,legacy:Array.isArray(state.allocated)&&state.allocated.length?clone(state):null};
}
export function pathTo(tree, state, target) {
  const graph = adjacency(tree), kinds = new Map(tree.nodes.map(n=>[n.id,n.kind]));
  if (!graph.has(target)) return [];
  const starts = [tree.root, ...state.allocated], previous = new Map(starts.map(id => [id, null])), queue = [...starts];
  for (const id of queue) {
    if (id === target) break;
    for (const next of graph.get(id)) if (!previous.has(next) && (next===target || kinds.get(next)!=='legendary')) { previous.set(next, id); queue.push(next); }
  }
  if (!previous.has(target)) return [];
  const route = []; let id = target;
  while (previous.get(id) !== null) { route.unshift(id); id = previous.get(id); }
  return route;
}
export function allocateNode(tree, state, target, attribute = 'intelligence', connect = false) {
  const fail = error => ({ state, error });
  const before = validateAllocation(tree, state); if (before) return fail(before);
  const node = tree.nodes.find(n => n.id === target);
  if (!node || node.kind === 'origin') return fail('请选择属性或传奇节点');
  if (state.allocated.includes(target)) return fail('节点已点亮');
  if (!tree.attributes.some(a => a.id === attribute)) return fail('未知属性');
  const route = pathTo(tree, state, target);
  if (!connect && route.length !== 1) return fail('请先接通前置属性节点');
  const next = clone(state);
  for (const id of route) {
    next.allocated.push(id);
    if (tree.nodes.find(n => n.id === id).kind === 'attribute') next.choices[id] ||= attribute;
  }
  const error = validateAllocation(tree, next); return error ? fail(error) : { state: next, error: '' };
}
export function changeAttribute(tree, state, id, attribute) {
  const next = clone(state); next.choices[id] = attribute;
  const error = validateAllocation(tree, next); return { state: error ? state : next, error };
}
// One icon click either allocates an adjacent point or replaces its existing attribute.
export function chooseNodeAttribute(tree, state, id, attribute) {
  if (tree.nodes.find(node => node.id === id)?.kind !== 'attribute') return { state, error: '请选择属性节点' };
  if (state.allocated.includes(id)) return changeAttribute(tree, state, id, attribute);
  const allocated = allocateNode(tree, state, id, attribute, false);
  return allocated.error ? allocated : changeAttribute(tree, allocated.state, id, attribute);
}
export function refundNode(tree, state, id) {
  if (!state.allocated.includes(id)) return { state, error: '节点尚未点亮' };
  const next = clone(state); next.allocated = next.allocated.filter(value => value !== id);
  const error = validateAllocation(tree, next);
  return { state: error ? state : next, error: error === '天赋路径未连接启明星' ? '退还此点会断开后续天赋，请先退还后续节点' : error };
}
export function talentParts(tree, state) {
  if (!tree || !state) return { parts: [], error: '' };
  const error = validateAllocation(tree, state); if (error) return { parts: [], error };
  // Canonical catalogue order makes compilation stable regardless of allocation click order.
  const selected = new Set(state.allocated);
  const parts = tree.nodes.filter(n => selected.has(n.id)).map(node => {
    const attribute = tree.attributes.find(a => a.id === state.choices[node.id]);
    const name = node.kind === 'attribute' ? `${attribute.name} +${attribute.value}` : node.name;
    return { kind: 'talent', label: `星盘 · ${name}`, doc: { id: `talent_${node.id}`, name, traits: clone(attribute ? attribute.traits : node.traits), bases: [] } };
  });
  return { parts, error: '' };
}
export function attributeTotals(tree, state) {
  return tree.attributes.map(a => ({ ...a, total: state.allocated.filter(id => state.choices[id] === a.id).length * a.value }));
}

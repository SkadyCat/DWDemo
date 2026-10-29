import test from 'node:test';
import assert from 'node:assert/strict';
import { ATLAS_ORIGIN, createAtlas, normalizeAtlas, visibleAtlas, selectAtlasNode, enterAtlasNode, completeAtlasNode, failAtlasNode, atlasBattleOptions } from '../public/atlas-state.mjs';

const available = state => state.nodes.filter(node => node.status === 'available' || node.status === 'failed');
const nodeAt = (state, id) => state.nodes.find(node => node.id === id);
const win = (state, id) => completeAtlasNode(enterAtlasNode(state, id));

test('星图：同一世界可重建，初始数百个节点全部连通且路径互相对应', () => {
  for (const seed of [0, 1, 20261024, '暮色边境']) {
    const state = createAtlas(seed);
    assert.deepEqual(state, createAtlas(seed));
    assert.ok(state.nodes.length >= 300);
    assert.notDeepEqual(state.nodes.map(node => [node.x, node.y]), createAtlas('另一片边境').nodes.map(node => [node.x, node.y]));
    const visited = new Set([ATLAS_ORIGIN]), queue = [ATLAS_ORIGIN];
    for (let i = 0; i < queue.length; i++) {
      const node = nodeAt(state, queue[i]);
      assert.equal(node.neighbors.length, new Set(node.neighbors).size);
      assert.equal(node.floor, node.id === ATLAS_ORIGIN ? 1 : null, 'unentered regions have no distance-derived tier');
      assert.ok(Number.isFinite(node.x) && Number.isFinite(node.y));
      for (const id of node.neighbors) {
        assert.ok(nodeAt(state, id).neighbors.includes(node.id), `${node.id} → ${id} must be bidirectional`);
        if (!visited.has(id)) { visited.add(id); queue.push(id); }
      }
    }
    assert.equal(visited.size, state.nodes.length);
  }
});

test('星图：选中不改变进度，锁定和迷雾不能挑战，只有实际进行中的区域可通关', () => {
  const state = createAtlas(76), before = JSON.stringify(state);
  assert.deepEqual(available(state).map(node => node.id), [ATLAS_ORIGIN]);
  const locked = state.nodes.find(node => node.status === 'locked'), hidden = state.nodes.find(node => node.status === 'hidden');
  const selected = selectAtlasNode(state, locked.id);
  assert.equal(selected.selectedId, locked.id);
  assert.deepEqual(selected.completedIds, []);
  assert.throws(() => enterAtlasNode(selected), /前沿/);
  assert.throws(() => enterAtlasNode(state, hidden.id), /前沿/);
  assert.throws(() => selectAtlasNode(state, hidden.id), /迷雾/);
  assert.throws(() => completeAtlasNode(state, ATLAS_ORIGIN), /正在进行/);
  const active = enterAtlasNode(state, ATLAS_ORIGIN);
  assert.equal(active.activeNodeId, ATLAS_ORIGIN);
  assert.equal(nodeAt(active, ATLAS_ORIGIN).status, 'active');
  assert.deepEqual(active.completedIds, []);
  assert.throws(() => enterAtlasNode(active, ATLAS_ORIGIN), /已有/);
  assert.throws(() => completeAtlasNode(active, locked.id), /正在进行/);
  const cleared = completeAtlasNode(active);
  assert.deepEqual(cleared.completedIds, [ATLAS_ORIGIN]);
  assert.equal(cleared.activeNodeId, null);
  assert.deepEqual(new Set(available(cleared).map(node => node.id)), new Set(nodeAt(cleared, ATLAS_ORIGIN).neighbors));
  assert.equal(completeAtlasNode(cleared, ATLAS_ORIGIN), cleared, 'duplicate settlement cannot award or unlock twice');
  assert.equal(JSON.stringify(state), before, 'navigation never mutates the previous state');
});

test('星图：失败与刷新均保留前沿，重试沿用同一战斗种子，不凭保存获得胜利', () => {
  let state = win(createAtlas(900), ATLAS_ORIGIN);
  const id = available(state)[0].id, options = atlasBattleOptions(state, id), progress = [...state.completedIds];
  state = enterAtlasNode(state, id);
  assert.equal(state.attempts[id], 1);
  const failed = failAtlasNode(state);
  assert.equal(nodeAt(failed, id).status, 'failed');
  assert.deepEqual(failed.completedIds, progress);
  assert.deepEqual(atlasBattleOptions(failed, id), options);
  const retry = enterAtlasNode(failed, id);
  assert.equal(retry.attempts[id], 2);
  const recovered = normalizeAtlas(JSON.parse(JSON.stringify(retry)));
  assert.equal(recovered.activeNodeId, null);
  assert.equal(nodeAt(recovered, id).status, 'failed');
  assert.deepEqual(recovered.completedIds, progress);
  assert.equal(recovered.attempts[id], 2);
  assert.deepEqual(atlasBattleOptions(recovered, id), options);
  assert.deepEqual(completeAtlasNode(enterAtlasNode(recovered, id)).completedIds, [...progress, id]);
});

test('星图：持续探索向外扩展，旧位置不跳动、旧路径不消失、视野逐步增加', () => {
  let state = createAtlas(41);
  const original = state.nodes.map(({ id, x, y, floor, name, biome, neighbors }) => ({ id, x, y, floor, name, biome, neighbors }));
  const initialCount = state.nodes.length, initialVisible = visibleAtlas(state).nodes.length;
  for (let i = 0; i < 20; i++) {
    const frontier = available(state).sort((a, b) => b.depth - a.depth || a.id.localeCompare(b.id))[0];
    assert.ok(frontier, `exploration must not terminate at step ${i}`);
    state = win(state, frontier.id);
  }
  assert.ok(state.nodes.length > initialCount);
  assert.ok(state.completedIds.some(id => nodeAt(state, id).depth > 10));
  assert.ok(visibleAtlas(state).nodes.length > initialVisible);
  for (const old of original) {
    const current = nodeAt(state, old.id);
    for (const key of ['x', 'y', 'name', 'biome']) assert.equal(current[key], old[key], `${old.id}.${key} must remain stable`);
    for (const neighbor of old.neighbors) assert.ok(current.neighbors.includes(neighbor), 'expansion must preserve existing routes');
  }
  const visible = visibleAtlas(state), ids = new Set(visible.nodes.map(node => node.id));
  assert.ok(visible.edges.every(edge => ids.has(edge.source) && ids.has(edge.target)));
  assert.equal(visible.edges.length, new Set(visible.edges.map(edge => [edge.source, edge.target].sort().join('/'))).size);
  assert.ok(visible.nodes.every(node => node.status !== 'hidden'));
  assert.deepEqual(normalizeAtlas(JSON.parse(JSON.stringify(state))), state);
});

test('星图：保存数据验证连通性与挑战状态，重新生成几何而不信任伪造的节点属性', () => {
  const state = win(createAtlas(17), ATLAS_ORIGIN), raw = JSON.parse(JSON.stringify(state));
  raw.nodes[0].floor = 999999; raw.nodes[0].status = 'cleared'; raw.nodes[0].x = Infinity;
  raw.radius = 10000000;
  assert.deepEqual(normalizeAtlas(raw), state);
  assert.throws(() => normalizeAtlas({ ...raw, version: 99 }), /版本/);
  assert.throws(() => normalizeAtlas({ ...raw, completedIds: ['1:0'] }), /起点/);
  assert.throws(() => normalizeAtlas({ ...raw, completedIds: [ATLAS_ORIGIN, '9:0'] }), /未连接/);
  assert.throws(() => normalizeAtlas({ ...raw, completedIds: [ATLAS_ORIGIN, '9007199254740992:0'] }), /编号/);
  assert.throws(() => normalizeAtlas({ ...raw, attempts: { '1:0': -1 } }), /次数/);
  assert.throws(() => normalizeAtlas({ ...raw, activeNodeId: ATLAS_ORIGIN }), /进行中/);
  assert.throws(() => normalizeAtlas({ ...raw, activeNodeId: '9:0' }), /进行中/);
});

test('星图：遥远路线仅生成周边地图，深度不决定地图层级', () => {
  const raw = createAtlas(3);
  raw.completedIds = Array.from({ length: 1001 }, (_, q) => `${q}:0`);
  const state = normalizeAtlas(raw);
  assert.ok(state.nodes.length < 15000, 'a long explored route must grow linearly, not allocate a million-node disk');
  assert.ok(state.radius > 1000);
  const beyond = available(state).find(node => node.depth > 1000);
  assert.ok(beyond, 'there remains a real frontier beyond the known route');
  assert.equal(beyond.floor, null);
  const admitted = enterAtlasNode(state, beyond.id, {floor:3});
  assert.equal(atlasBattleOptions(admitted, beyond.id).floor, 3);
  assert.deepEqual(normalizeAtlas(JSON.parse(JSON.stringify(state))), state);
});

test('星图：当前位置不随选择改变，通关后仍保留，显式重访不会重复进度',()=>{
 let state=win(createAtlas(45),ATLAS_ORIGIN),next=available(state)[0].id;
 state=selectAtlasNode(state,next);assert.equal(state.currentNodeId,ATLAS_ORIGIN);
 state=enterAtlasNode(state,next);assert.equal(state.currentNodeId,next);
 state=completeAtlasNode(state);assert.equal(state.currentNodeId,next);
 assert.equal(normalizeAtlas(JSON.parse(JSON.stringify(state))).currentNodeId,next);
 const revisited=enterAtlasNode(state,next,{revisit:true});assert.equal(nodeAt(revisited,next).status,'active');
 const loaded=normalizeAtlas(JSON.parse(JSON.stringify(revisited)));assert.equal(loaded.currentNodeId,next);assert.equal(loaded.activeNodeId,null);
 assert.deepEqual(completeAtlasNode(revisited).completedIds,state.completedIds);
});

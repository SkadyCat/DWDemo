import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { RULES_DIR, readRuleFiles } from '../scripts/rule-files.mjs';
import { checkRuleSet } from '../engine/index.mjs';
import { freshAllocation, validateTree, validateAllocation, pathTo, allocateNode, refundNode, talentParts, spentPoints, attributeTotals, adjacency, upgradeAllocation } from '../public/talents/model.mjs';
import { Battle } from '../public/sim/battle.mjs';
import { TowerRun } from '../public/sim/dungeon-battle.mjs';

const tree = JSON.parse(fs.readFileSync(path.join(RULES_DIR, 'Talents/constellation.json'), 'utf8'));
const files = readRuleFiles(), check = checkRuleSet(files);
assert.ok(check.ok, check.error);
const byId = new Map(tree.nodes.map(n => [n.id, n]));
const plan = ids => {
  let state = { ...freshAllocation(tree), budget: tree.nodes.length - 1 };
  for (const id of ids) { if (state.allocated.includes(id)) continue; const result = allocateNode(tree, state, id, 'intelligence', true); assert.equal(result.error, '', id); state = result.state; }
  return state;
};
const loadout = (state, skills = ['frost_lance']) => ({ skills, equipment: {}, belt: [], passives: talentParts(tree, state).parts });
const battle = state => { const b = new Battle(files, { collections: check.collections, maxMonsters: 0, spawnRate: 0, seed: 3 }); b.setLoadout(loadout(state)); return b; };

test('六域星盘：结构完整，全部节点由现有词条组成，并能从启明到达', () => {
  assert.equal(validateTree(tree, check.library), '');
  const kinds = tree.nodes.reduce((m, n) => ({ ...m, [n.kind]: (m[n.kind] || 0) + 1 }), {});
  assert.equal(kinds.origin, 1); assert.equal(kinds.keystone, 12); assert.equal(kinds.notable, 30);
  assert.ok(tree.nodes.length >= 300 && tree.nodes.length <= 400, `${tree.nodes.length} 个节点`);
  for (const n of tree.nodes) if (n.kind !== 'origin') { assert.ok(n.traits.length, n.id); assert.ok(n.name, n.id); }
  const domains = tree.sectors.filter(s => s.glyph);
  assert.equal(domains.length, 6);
  for (const d of domains) assert.equal(tree.nodes.filter(n => n.sector === d.id && n.kind === 'keystone').length, 2, d.id);
});

test('六域星盘：每个基石都有收益和明确代价', () => {
  for (const k of tree.nodes.filter(n => n.kind === 'keystone')) {
    assert.ok(k.description, k.id);
    const drawback = k.traits.some(t => Object.values(t.params || {}).some(v => v < 0) || t.id === 'cost_from_life');
    assert.ok(drawback, `${k.name} 需要代价`);
    assert.ok(k.traits.some(t => !Object.values(t.params || {}).some(v => v < 0)), `${k.name} 需要收益`);
  }
});

test('六域星盘：布局无交叉连线、无重叠节点', () => {
  const segs = tree.edges.map(([a, b]) => [byId.get(a), byId.get(b)]);
  const o = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
    const [a, b] = segs[i], [c, d] = segs[j];
    if ([a, b].some(p => p === c || p === d)) continue;
    assert.ok(!(o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0), `${tree.edges[i]} × ${tree.edges[j]}`);
  }
  for (let i = 0; i < tree.nodes.length; i++) for (let j = i + 1; j < tree.nodes.length; j++) {
    const a = tree.nodes[i], b = tree.nodes[j];
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 34, `${a.id} / ${b.id}`);
  }
});

test('六域星盘：全盘点亮后与各类技能一起正常编译', () => {
  const all = plan(tree.nodes.filter(n => n.kind !== 'origin').map(n => n.id));
  assert.equal(all.allocated.length, tree.nodes.length - 1);
  for (const skill of ['frost_lance', 'sentinel']) {
    const b = new Battle(files, { collections: check.collections, maxMonsters: 0, spawnRate: 0, seed: 3 });
    b.setLoadout(loadout(all, [skill]));
    assert.equal(b.hero.error || '', '', skill);
    assert.ok(b.character.maxLife > 0);
  }
});

test('点亮：单点只能点相邻节点；路线点亮按实际路径扣点，且不会穿过基石', () => {
  const fresh = freshAllocation(tree);
  assert.equal(allocateNode(tree, { ...fresh, budget: 10 }, 'frost_s0', 'intelligence', false).error, '请先接通前置属性节点');
  const route = pathTo(tree, fresh, 'frost_a_n');
  assert.equal(route[0], 'frost_gate'); assert.equal(route.at(-1), 'frost_a_n');
  const bought = allocateNode(tree, { ...fresh, budget: 30 }, 'frost_a_n', 'intelligence', true);
  assert.equal(bought.error, ''); assert.equal(spentPoints(tree, bought.state), route.length);
  assert.match(allocateNode(tree, { ...fresh, budget: route.length - 1 }, 'frost_a_n', 'intelligence', true).error, /点数不足/);
  for (const k of tree.nodes.filter(n => n.kind === 'keystone')) {
    const graph = adjacency(tree);
    assert.equal(graph.get(k.id).length, 1, `${k.name} 是终点`);
  }
});

test('退点：断开后续节点会被拒绝，叶子节点可以退还；旧版星盘方案换新盘时重置', () => {
  const state = plan(['frost_s1']);
  assert.match(refundNode(tree, state, 'frost_s0').error, /断开/);
  const leaf = refundNode(tree, state, 'frost_s1'); assert.equal(leaf.error, ''); assert.ok(!leaf.state.allocated.includes('frost_s1'));
  const legacy = { schema: 1, treeId: 'organic-network-v5', revision: 3, budget: 120, allocated: ['a'], choices: {} };
  assert.notEqual(validateAllocation(tree, legacy), '');
  const upgraded = upgradeAllocation(tree, legacy).state;
  assert.equal(upgraded.treeId, tree.id); assert.deepEqual(upgraded.allocated, []);
});

test('属性合计：读取节点上的属性词条', () => {
  const state = plan(['frost_gate', 'flame_gate']);
  const totals = Object.fromEntries(attributeTotals(tree, state).map(a => [a.id, a.total]));
  assert.equal(totals.intelligence, 10); assert.equal(totals.strength, 10); assert.equal(totals.dexterity, 0);
});

test('战斗：天赋加成只生效一次，退点后消失，点亮顺序不影响结果', () => {
  const base = battle(freshAllocation(tree)).character.maxLife;
  const ironLife = plan(['iron_s0']);
  const withLife = battle(ironLife).character.maxLife;
  assert.ok(withLife > base, `${withLife} > ${base}`);
  const refunded = refundNode(tree, ironLife, 'iron_s0').state;
  assert.equal(battle(refunded).character.maxLife, battle(plan(['iron_gate'])).character.maxLife);
  const a = plan(['frost_a_n', 'iron_s2']), b = plan(['iron_s2', 'frost_a_n']);
  assert.deepEqual(talentParts(tree, a).parts.map(p => p.doc.id), talentParts(tree, b).parts.map(p => p.doc.id));
});

test('战斗：基石的代价真实生效（不灭之躯失去护盾、气血大幅提高）', () => {
  const route = plan(['iron_left_k']);
  const before = refundNode(tree, route, 'iron_left_k').state;
  const off = battle(before).character, on = battle(route).character;
  assert.ok(on.maxLife > off.maxLife * 1.2, `${on.maxLife} vs ${off.maxLife}`);
  assert.equal(on.maxShield, 0);
});

test('战斗：天赋在空技能栏和换层后依然生效', () => {
  const state = plan(['iron_s0']);
  const tower = new TowerRun(files, { collections: check.collections, monsterTypes: [check.monsters.get('claw_beast').doc], seed: 5 });
  tower.setLoadout({ ...loadout(state), skills: [] });
  const life = tower.battle.character.maxLife;
  assert.ok(life > battle(freshAllocation(tree)).character.maxLife);
  tower.battle.phase = 'cleared'; tower.advance();
  assert.equal(tower.battle.character.maxLife, life);
});

// 天赋盘：连通、六域齐全、特性与基石都在盘上、每个点都是可编译的词条；点亮/取消的连通规则；点亮的效果真的进战斗。
import test from 'node:test';
import assert from 'node:assert/strict';
import { TALENT_TREE, talentAffixes, canAllocate, canRefund, talentPoints, talentLines } from '../core/content/talents.mjs';
import { family } from '../core/content/families.mjs';
import { gameContent } from '../core/content/game.mjs';
import { defenceReport } from '../core/analysis.mjs';

const T = TALENT_TREE;

test('星盘：两百多个点全部连通，六域各有主干特性与外缘基石', () => {
  assert.ok(T.nodes.length >= 220, `${T.nodes.length}`);
  const seen = new Set([T.start]), q = [T.start];
  while (q.length) for (const n of T.adj[q.shift()]) if (!seen.has(n)) { seen.add(n); q.push(n); }
  assert.equal(seen.size, T.nodes.length);
  for (const d of T.domains) {
    const own = T.nodes.filter(n => n.domain === d.id);
    assert.ok(own.filter(n => n.kind === 'trait').length >= 4, d.name);
    assert.ok(own.some(n => n.kind === 'keystone' && family(n.lines[0].id).layer === 'core'), d.name);
  }
  assert.ok(T.nodes.filter(n => n.kind === 'keystone').length >= 12);
  for (const n of T.nodes) for (const t of talentLines(n)) assert.ok(t.length > 0);
  for (const n of T.nodes.filter(n => n.kind === 'trait')) assert.ok(['form', 'link'].includes(family(n.lines[0].id).layer));
});

test('点亮必须相连，取消不能把别的点断开', () => {
  const ring = T.adj[T.start][0], next = T.adj[ring].find(n => n !== T.start && !T.adj[T.start].includes(n));
  assert.ok(canAllocate([], ring));
  assert.ok(!canAllocate([], next));
  assert.ok(canAllocate([ring], next));
  assert.ok(!canRefund([ring, next], ring), 'ring carries next');
  assert.ok(canRefund([ring, next], next));
  assert.equal(talentPoints([{ id: 0, kind: 'normal' }, { id: 3, kind: 'normal' }, { id: 9, kind: 'boss' }]), 3);
});

test('点亮的天赋就是词条：防御点让生命池变大', () => {
  const lifeNode = T.nodes.find(n => n.kind === 'notable' && n.lines.some(l => l.id === 'life'));
  const path = [], prev = new Map([[T.start, null]]), q = [T.start];
  while (q.length) { const c = q.shift(); if (c === lifeNode.id) break; for (const n of T.adj[c]) if (!prev.has(n)) { prev.set(n, c); q.push(n); } }
  for (let c = lifeNode.id; c !== T.start; c = prev.get(c)) path.unshift(c);
  const content = gameContent(), base = { skills: ['fireball'], affixes: [] };
  const before = defenceReport(content, base, 1).pool, after = defenceReport(content, { ...base, affixes: talentAffixes(path) }, 1).pool;
  assert.ok(after > before + 30, `${before} → ${after}`);
});

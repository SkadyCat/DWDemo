import test from 'node:test';
import assert from 'node:assert/strict';
import { generateAtlas, newAtlasState, atlasView, completeNode, nodeMods } from '../public/game/atlas.mjs';
import { MapRun } from '../public/game/run.mjs';

test('the atlas is seeded, connected, and its roads never cross', () => {
  for (const seed of [1, 42, 9001]) {
    const a = generateAtlas(seed), b = generateAtlas(seed);
    assert.deepEqual(a.edges, b.edges);
    assert.ok(a.nodes.length >= 120);
    const seen = new Set([0]), queue = [0];
    while (queue.length) for (const n of a.links[queue.shift()]) if (!seen.has(n)) { seen.add(n); queue.push(n); }
    assert.equal(seen.size, a.nodes.length, 'every node reachable from the camp');
    const P = i => a.nodes[i], o = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
    for (const [i, j] of a.edges) for (const [k, l] of a.edges) {
      if (new Set([i, j, k, l]).size < 4) continue;
      assert.ok(!(o(P(i), P(j), P(k)) * o(P(i), P(j), P(l)) < 0 && o(P(k), P(l), P(i)) * o(P(k), P(l), P(j)) < 0), 'roads cross');
    }
    for (let t = 1; t <= 16; ++t) assert.ok(a.nodes.some(n => n.tier === t), `tier ${t} present`);
    assert.ok(a.links[0].every(n => a.nodes[n].tier <= 2), 'the camp opens onto low tiers');
    assert.ok(a.nodes.filter(n => n.kind === 'boss').length >= 10);
  }
});

test('clearing a node opens its neighbours; old saves keep their progress', () => {
  const a = generateAtlas(7), s = newAtlasState(7, 1);
  const v = atlasView(a, s);
  assert.deepEqual([...v.open].sort(), [...a.links[0]].sort());
  const next = [...v.open][0];
  const opened = completeNode(a, s, next);
  assert.equal(atlasView(a, s).status(next), 'done');
  assert.ok(opened >= 0 && atlasView(a, s).open.size >= v.open.size - 1);
  const veteran = newAtlasState(7, 9);
  assert.ok(veteran.done.length > 40 && atlasView(a, veteran).open.size > 0);
});

test('node modifiers change the run: trials are crowded, vaults pay', () => {
  const build = { skills: ['fireball'], affixes: [] };
  const plain = new MapRun(build, { tier: 5, seed: 3 }), trial = new MapRun(build, { tier: 5, seed: 3, mods: nodeMods({ kind: 'trial', mods: [] }) });
  assert.ok(trial.total > plain.total * 1.4, `${trial.total} vs ${plain.total}`);
  const vault = nodeMods({ kind: 'vault', mods: ['rich'] });
  assert.ok(vault.quantity > 2 && vault.legend >= 3);
});

test('waystones: bosses always drop one, rarer stones carry map modifiers', async () => {
  const { rollWaystoneDrops, rollWaystone, starterWaystones } = await import('../public/game/waystones.mjs');
  const { dungeonRandom } = await import('../public/game/dungeon.mjs');
  const rng = dungeonRandom(5);
  for (let i = 0; i < 50; ++i) { const d = rollWaystoneDrops(7, 'boss', rng); assert.ok(d.length >= 1 && d.every(w => w.tier >= 7)); }
  let trash = 0; for (let i = 0; i < 4000; ++i) trash += rollWaystoneDrops(7, 'monster', rng).length;
  assert.ok(trash > 5 && trash < 60, `trash drops ${trash}`);
  assert.equal(rollWaystone(3, rng, 'normal').mods.length, 0);
  assert.ok(rollWaystone(3, rng, 'rare').mods.length >= 3);
  assert.ok(starterWaystones([], rng).length >= 3);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {MAP_EVENT_CONFIG} from '../public/data/map-events-config.mjs';
import {mapEventPlan, dungeonMapEvents} from '../public/map-event-locations.mjs';
import {atlasMapEvents} from '../public/atlas-map-events.mjs';
import {createAtlas, atlasBattleOptions} from '../public/atlas-state.mjs';
import {generateDungeon} from '../public/sim/dungeon.mjs';
import {createMapEventMarkerProject, MAP_EVENT_INFO} from '../../UICreatorAlpha/src/assets/rulestudio-hud/map-event-markers.js';
import {validateDocument} from '../../UICreatorAlpha/src/core/model.js';

test('map-event display configuration comes from the existing event catalog', async () => {
  const config = JSON.parse(await fs.readFile(new URL('../../../Content/MapEvents/events.json', import.meta.url)));
  assert.deepEqual(MAP_EVENT_CONFIG, config);
  assert.ok(config.definitions.every(event => MAP_EVENT_INFO[event.kind]));
});

test('atlas previews and actual dungeon descriptors agree at all placed-map tiers', () => {
  for (const tier of [1, 3, 10, 16]) for (let seed = 1; seed <= 12; seed++) {
    const state = createAtlas(seed);
    for (const node of state.nodes.filter(node => node.status !== 'hidden')) {
      state.mapTiers[node.id] = tier;
      const options = atlasBattleOptions(state, node.id), dungeon = generateDungeon(options.seed, tier);
      const before = JSON.stringify(dungeon.rooms), placed = dungeonMapEvents(dungeon, node.id);
      const preview = atlasMapEvents(state, node);
      assert.deepEqual(placed.map(event => event.id), preview.map(event => event.id), `${seed}/${node.id}/T${tier}`);
      assert.equal(JSON.stringify(dungeon.rooms), before);
      for (const event of placed) {
        const tile = dungeon.tileOf(event.x, event.y);
        assert.ok(dungeon.walkable(tile.x, tile.y));
        assert.ok(dungeon.flow(dungeon.entry.x, dungeon.entry.y)[tile.y * dungeon.size + tile.x] >= 0);
      }
    }
  }
});

test('plans are repeatable, distinct, honor configuration and never mutate source data', () => {
  const original = JSON.stringify(MAP_EVENT_CONFIG);
  const kinds = new Set();
  for (let seed = 1; seed <= 300; seed++) {
    const plan = mapEventPlan(seed, 1);
    assert.deepEqual(plan, mapEventPlan(seed, 1));
    assert.equal(new Set(plan.map(event => event.kind)).size, plan.length);
    assert.ok(plan.length <= MAP_EVENT_CONFIG.maxEvents);
    plan.forEach(event => kinds.add(event.kind));
  }
  assert.equal(kinds.size, 4);
  assert.deepEqual(mapEventPlan(9, 1, {...MAP_EVENT_CONFIG, chancePercent: 0}), []);
  assert.deepEqual(mapEventPlan(9, 0, {...MAP_EVENT_CONFIG, chancePercent: 100}), []);
  assert.equal(JSON.stringify(MAP_EVENT_CONFIG), original);
});

test('hidden regions reveal no events; completion is read from this actual map instance', () => {
  const state = createAtlas(41), origin = state.nodes.find(node => node.id === '0:0');
  const hidden = state.nodes.find(node => node.status === 'hidden');
  assert.deepEqual(atlasMapEvents(state, hidden), []);
  const current = [{id: 'reforge_altar', kind: 'altar', completed: true, x: 200, y: 300}];
  assert.equal(atlasMapEvents(state, origin, origin.id, current), current);
  assert.deepEqual(atlasMapEvents(state, origin, origin.id, []), []);
  assert.equal(atlasMapEvents(state, origin)[0].kind, 'shop');
});

test('UICreator owns complete and unfinished artwork for every event kind', () => {
  const doc = createMapEventMarkerProject();
  assert.deepEqual(validateDocument(doc), []);
  assert.equal(doc.root.children.length, 5);
  for (const kind of Object.keys(MAP_EVENT_INFO)) {
    assert.ok(doc.assets['map-event-' + kind]);
    assert.ok(doc.assets['map-event-' + kind + '-completed']);
  }
});

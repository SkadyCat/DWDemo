import {MAP_EVENT_CONFIG} from './data/map-events-config.mjs';
import {dungeonRandom} from './sim/dungeon.mjs';
import {outpostMerchantLocation} from './outpost-merchant-model.mjs';

// A separate, deterministic stream: reading the atlas must never draw combat,
// item-roll or reward RNG. Both map views read the same encounter descriptors.
function eventSeed(seed, salt) {
  let value = seed ^ salt;
  value = Math.imul(value ^ value >>> 16, 0x7feb352d);
  value = Math.imul(value ^ value >>> 15, 0x846ca68b);
  return (value ^ value >>> 16) >>> 0;
}
export function mapEventPlan(seed, tier = 1, config = MAP_EVENT_CONFIG) {
  const random = dungeonRandom(eventSeed(seed, 0x45564e54));
  if (random() * 100 >= config.chancePercent) return [];
  const eligible = config.definitions.filter(event => event.minFloor <= tier && event.weight > 0);
  const count = Math.min(eligible.length, config.minEvents + Math.floor(random() * (config.maxEvents - config.minEvents + 1)));
  const result = [];
  for (let index = 0; index < count; index++) {
    let at = random() * eligible.reduce((sum, event) => sum + event.weight, 0);
    let choice = eligible.findIndex(event => (at -= event.weight) < 0);
    if (choice < 0) choice = eligible.length - 1;
    const event = eligible.splice(choice, 1)[0];
    result.push({id: event.id, kind: event.kind, name: event.name, completed: false});
  }
  return result;
}

export function dungeonMapEvents(dungeon, regionId) {
  const merchant = outpostMerchantLocation(dungeon, regionId);
  const events = merchant ? [{...merchant, kind: 'shop', completed: false}] : [];
  const random = dungeonRandom(eventSeed(dungeon.seed, 0x504c4143));
  const candidates = dungeon.tiles.map(tile => dungeon.tileCenter(tile.x, tile.y))
    .filter(point => Math.hypot(point.x - dungeon.entry.x, point.y - dungeon.entry.y) > 300 && dungeon.sweep(point.x, point.y, point.x, point.y, 95) < 0);
  for (const event of mapEventPlan(dungeon.seed, dungeon.floor)) {
    const available = candidates.filter(point => events.every(other => Math.hypot(point.x - other.x, point.y - other.y) >= 650));
    if (!available.length) continue;
    events.push({...event, ...available[Math.floor(random() * available.length)]});
  }
  return events;
}


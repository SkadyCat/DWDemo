import {atlasBattleOptions} from './atlas-state.mjs';
import {mapEventPlan} from './map-event-locations.mjs';

export function atlasMapEvents(state, node, currentId = '', currentEvents) {
  if (!node || node.status === 'hidden') return [];
  if (node.id === currentId && currentEvents) return currentEvents;
  const {seed, floor} = atlasBattleOptions(state, node.id), events = mapEventPlan(seed, floor);
  if (node.id === '0:0') events.unshift({id: 'outpost-merchant', kind: 'shop', name: '拓荒商人', completed: false});
  return events;
}

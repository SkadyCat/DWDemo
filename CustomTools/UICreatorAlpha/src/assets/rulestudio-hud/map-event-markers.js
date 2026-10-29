import {createDocument, createNode} from '../../core/model.js';

// Shared artwork for atlas regions, local-map pins and their legends.
export const MAP_EVENT_INFO = Object.freeze({
  shop: {name: '商店', color: '#e9c57b', glyph: '<path d="M-6-1v6H6v-6M-7-1l2-5H5l2 5M-7-1q1.8 3 3.5 0Q-1.7 2 0-1q1.7 3 3.5 0Q5.2 2 7-1M-2 5V1H2v4"/>'},
  altar: {name: '百炼法坛', color: '#81dccb', glyph: '<path d="M-6 6H6M-5 3H5M-3 0H3L2 3H-2ZM0-7C-6-3-1-3-2 0 4-1 4-4 0-7Z"/>'},
  fusion: {name: '合成祭坛', color: '#c4a1ef', glyph: '<path d="m-4-6 3 3-3 3-3-3Zm8 0 3 3-3 3-3-3ZM-4 0l4 4 4-4M0 4v3M-4 7H4"/>'},
  choice: {name: '遗珍神龛', color: '#f0cc83', glyph: '<path d="M-6 6V-2L0-7 6-2v8ZM-7 6H7M0-4l2 4-2 3-2-3Z"/>'},
  vault: {name: '封印宝库', color: '#e6ad7d', glyph: '<path d="M-6-1v6H6v-6ZM-6-1v-3q6-5 12 0v3M-6 0H6M-1-1h2v4h-2Z"/>'},
});

export function mapEventArtwork(kind, completed = false) {
  const info = MAP_EVENT_INFO[kind]; if (!info) return '';
  return `<circle r="10" fill="#0c1b24" stroke="${completed ? '#637773' : info.color}" stroke-width="1"/><g fill="none" stroke="${info.color}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" opacity="${completed ? '.38' : '1'}">${info.glyph}</g>${completed ? '<circle cx="7" cy="6" r="4" fill="#17362c"/><path d="m4.8 6 1.5 1.5 3-3" fill="none" stroke="#a9d7b4" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>' : ''}`;
}

export function createMapEventMarkerProject(events = Object.keys(MAP_EVENT_INFO).map(kind => ({kind}))) {
  const doc = createDocument('地图事件 · 商店、祭坛与宝库标记');
  doc.id = 'opus-map-event-markers'; doc.sounds = {}; doc.motions = {};
  const width = Math.max(26, events.length * 26);
  doc.viewport = {width, height: 26, background: 'transparent'};
  doc.root = createNode('CanvasPanel', {id: 'map-event-badges', layout: {width, height: 26}, children: []});
  for (const [kind, info] of Object.entries(MAP_EVENT_INFO)) for (const completed of [false, true]) {
    const id = `map-event-${kind}${completed ? '-completed' : ''}`;
    doc.assets[id] = {id, name: info.name + (completed ? ' · 已完成' : ''), viewBox: [0, 0, 26, 26], scaleMode: 'stretch',
      source: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 26"><g transform="translate(13 13)">${mapEventArtwork(kind, completed)}</g></svg>`};
  }
  doc.root.children = events.filter(event => MAP_EVENT_INFO[event.kind]).map((event, index) => createNode('Svg', {
    id: 'map-event-badge-' + index, name: MAP_EVENT_INFO[event.kind].name + (event.completed ? ' · 已完成' : ''),
    svgAsset: `map-event-${event.kind}${event.completed ? '-completed' : ''}`,
    slot: {offsets: {left: index * 26, top: 0, right: 26, bottom: 26}}, layout: {width: 26, height: 26},
  }));
  doc.root.source = {purpose: 'map-event-identification', kinds: Object.keys(MAP_EVENT_INFO)};
  return doc;
}

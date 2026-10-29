import {createDocument, createNode} from '../../core/model.js';
import {MAP_EVENT_INFO, mapEventArtwork} from './map-event-markers.js';

// UICreator owns the frames, controls, legend, clipping and marker artwork.
export const DUNGEON_MAP = {
  mini: {width: 176, height: 222, viewport: {x: 12, y: 26, width: 152, height: 152}},
  panel: {width: 1000, height: 680, viewport: {x: 24, y: 112, width: 724, height: 504}},
};
export const MAP_COLORS = {floor: '#263442', room: '#485b70', roomEdge: '#708397', visited: '#346c65',
  visitedEdge: '#76b5a3', bossRoom: '#663d48', boss: '#ed9294', hero: '#ffe2a1', entry: '#92b8d0', portal: '#76e5cc'};
export const MAP_MARKERS = {
  hero: '<circle r="7" fill="#ffe2a1" fill-opacity=".14"/><path d="M0-7 5 5 0 3-5 5Z" fill="#ffe2a1" stroke="#0a131c" stroke-width="1.2"/>',
  entry: '<path d="m0-6 6 6-6 6-6-6Z" fill="#121f2b" stroke="#92b8d0" stroke-width="1.5"/><circle r="1.5" fill="#92b8d0"/>',
  boss: '<path d="m-6-4 3 2 3-4 3 4 3-2-1 8H-5Z" fill="#361e2a" stroke="#ed9294" stroke-width="1.4"/><path d="M-3 6H3" stroke="#ed9294" stroke-width="1.4"/>',
  portal: '<circle r="6" fill="#12302d" stroke="#76e5cc" stroke-width="1.4"/><path d="m0-4 3 4-3 4-3-4Z" fill="none" stroke="#76e5cc"/>',
  ...Object.fromEntries(Object.keys(MAP_EVENT_INFO).map(kind => [kind, mapEventArtwork(kind)])),
};
const n = (type, id, x, y, w, h, props = {}) => { const node = createNode(type, {id, name: id, locked: type !== 'Button',
  slot: {offsets: {left: x, top: y, right: w, bottom: h}}, layout: {width: w, height: h},
  motion: {preset: 'none'}, ...props}); node.audio = {enabled: false, volume: 1, pitch: 1, events: {}}; return node; };
const label = (id, text, x, y, w, h, size = 12, color = '#9aaeba', extra = {}) => n('TextBlock', id, x, y, w, h,
  {text, style: {fontSize: size, color, wrap: false, textOverflow: 'shrink', ...extra}});
const box = (id, x, y, w, h, fill, stroke = 'transparent', radius = 0) => n('Border', id, x, y, w, h,
  {style: {fill, stroke, strokeWidth: stroke === 'transparent' ? 0 : 1, radius}});
function button(id, text, x, y, w, h, op, title = text) {
  return n('Button', id, x, y, w, h, {name: title, action: {type: 'dungeon-map', op},
    brushes: {normal: 'map-button', hovered: 'map-button-hover', pressed: 'map-button-press', disabled: 'map-button-disabled'},
    children: [n('CanvasPanel', id + '-body', 0, 0, w, h, {children: [label(id + '-label', text, 3, 0, w - 6, h, 12, '#d3d2be', {textAlign: 'center'})]})]});
}
const graphic = (id, asset, x, y, w, h) => n('Svg', id, x, y, w, h, {svgAsset: asset});
function viewport(mode) {
  const v = DUNGEON_MAP[mode].viewport;
  return n('CanvasPanel', 'dmap-' + mode + '-viewport', v.x, v.y, v.width, v.height,
    {binding: 'dungeon-map-surface', style: {fill: '#0a141d', clip: true, radius: mode === 'mini' ? v.width / 2 : 8},
      children: [graphic('dmap-' + mode + '-preview', 'map-preview', 0, 0, v.width, v.height)]});
}
function mini() {
  const root = n('CanvasPanel', 'dmap-mini', 0, 0, 176, 222, {locked: false});
  root.children = [label('dmap-mini-floor', '第 1 层', 10, 0, 90, 20, 11, '#d5bf8e'),
    label('dmap-mini-hint', '地牢', 112, 0, 54, 20, 9, '#809492', {textAlign: 'right'}),
    viewport('mini'), graphic('dmap-mini-compass', 'map-compass', 4, 18, 168, 168),
    n('Button', 'dmap-mini-open', 12, 26, 152, 152, {name: '展开地牢地图', action: {type: 'dungeon-map', op: 'open'},
      style: {fill: 'transparent', radius: 76, clip: true}, brushes: {normal: '', hovered: '', pressed: '', disabled: ''}}),
    button('dmap-mini-zoom-out', '−', 12, 187, 27, 26, 'out', '缩小小地图'),
    label('dmap-mini-zoom', '100%', 41, 187, 46, 26, 10, '#adc0c0', {textAlign: 'center'}),
    button('dmap-mini-zoom-in', '+', 89, 187, 27, 26, 'in', '放大小地图'),
    button('dmap-mini-expand', '↗', 128, 187, 36, 26, 'open', '展开地牢地图')];
  return root;
}
function panel() {
  const root = n('CanvasPanel', 'dmap-panel', 0, 0, 1000, 680, {locked: false});
  root.children = [box('dmap-panel-frame', .5, .5, 999, 679, '#0c141ff5', '#536457', 12),
    label('dmap-panel-overline', 'D U N G E O N   /   地牢探索', 26, 18, 680, 18, 10, '#8b9b8b'),
    label('dmap-panel-title', '地牢地图', 24, 40, 600, 40, 25, '#edcf97'),
    label('dmap-panel-subtitle', '第 1 层 · 当前位置', 26, 82, 690, 20, 11),
    button('dmap-panel-close', '×', 940, 22, 34, 34, 'close', '关闭地牢地图'),
    viewport('panel'), graphic('dmap-panel-compass', 'map-north', 688, 126, 44, 44),
    label('dmap-panel-heading', '本层目标', 774, 119, 200, 24, 10, '#8b9b8b'),
    label('dmap-panel-objective', '寻找并击败首领', 772, 150, 202, 32, 17, '#e1cb9f'),
    label('dmap-panel-objective-note', '击败首领，开启传送阵', 774, 190, 200, 25, 11),
    box('dmap-panel-separator', 774, 237, 200, 1, '#2a3940'),
    label('dmap-panel-progress-label', '房间探索', 774, 254, 160, 22, 11),
    label('dmap-panel-progress', '1 / 14', 772, 282, 202, 33, 24, '#9ed8c0'),
    label('dmap-panel-status', '首领尚未击败', 774, 325, 200, 24, 11, '#bd9fa0'),
    box('dmap-panel-legend-line', 774, 369, 200, 1, '#2a3940'),
    label('dmap-panel-legend-title', '地图标记', 774, 384, 190, 22, 10, '#8b9b8b'),
    ...[['hero','当前位置'], ['entry','地牢入口'], ['boss','首领'], ['portal','传送阵'],
      ...Object.entries(MAP_EVENT_INFO).map(([id, info]) => [id, info.name])].flatMap(([id, title], i) => [
      graphic('dmap-legend-' + id, 'map-marker-' + id, 777 + i % 2 * 104, 420 + Math.floor(i / 2) * 30, 20, 20),
      label('dmap-legend-' + id + '-text', title, 801 + i % 2 * 104, 418 + Math.floor(i / 2) * 30, 72, 24, 10)]),
    box('dmap-legend-visited', 779, 585, 11, 11, MAP_COLORS.visited, MAP_COLORS.visitedEdge, 2),
    label('dmap-legend-visited-text', '已探索', 799, 579, 70, 24, 10),
    box('dmap-legend-unknown', 884, 585, 11, 11, MAP_COLORS.room, MAP_COLORS.roomEdge, 2),
    label('dmap-legend-unknown-text', '未探索', 904, 579, 70, 24, 10),
    button('dmap-panel-out', '−', 24, 635, 34, 30, 'out', '缩小地牢地图'),
    label('dmap-panel-zoom', '100%', 61, 635, 58, 30, 11, '#c6d2c8', {textAlign: 'center'}),
    button('dmap-panel-in', '+', 122, 635, 34, 30, 'in', '放大地牢地图'),
    button('dmap-panel-fit', '全图', 170, 635, 66, 30, 'fit', '显示完整地牢'),
    button('dmap-panel-locate', '定位角色', 246, 635, 90, 30, 'locate', '定位当前角色'),
    label('dmap-panel-help', '拖动平移 · 滚轮缩放 · F 定位 · Esc 返回', 354, 635, 620, 30, 10, '#8ca19c', {textAlign: 'right'})];
  return root;
}
export function createDungeonMapProject() {
  const doc = createDocument('地牢地图 · 圆形小地图与展开界面');
  doc.id = 'opus-dungeon-map'; doc.viewport = {width: 1000, height: 680, background: 'transparent'};
  doc.root = panel(); doc.sounds = {}; doc.motions = {};
  const m = mini(); doc.prefabs = {'dungeon-minimap': {id: 'dungeon-minimap', name: '圆形小地图', width: 176, height: 222, root: m}};
  const asset = (id, source, size = [96, 96]) => {doc.assets[id] = {id, name: id, source, viewBox: [0, 0, ...size], scaleMode: 'stretch'};};
  for (const [id, fill, stroke] of [['map-button','#17262d','#3c5054'], ['map-button-hover','#253b3f','#a5b496'],
    ['map-button-press','#2d4948','#a9dcc6'], ['map-button-disabled','#111d23','#25353c']])
    asset(id, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect x="1" y="1" width="94" height="94" rx="10" fill="${fill}" stroke="${stroke}"/></svg>`);
  asset('map-compass', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 168 168"><circle cx="84" cy="84" r="80.5" fill="none" stroke="#8e8662" stroke-width="1.2"/><circle cx="84" cy="84" r="77.5" fill="none" stroke="#233d44" stroke-width="1"/><path d="M84 7v5M84 156v5M7 84h5M156 84h5" stroke="#b2ad85"/><text x="84" y="7" text-anchor="middle" fill="#c5bd98" font-size="8" font-family="sans-serif">N</text></svg>', [168, 168]);
  asset('map-north', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 44"><text x="22" y="9" fill="#9aa995" text-anchor="middle" font-size="9" font-family="sans-serif">N</text><path d="m22 14 6 19-6-4-6 4Z" fill="#b8bb98" fill-opacity=".75"/></svg>', [44, 44]);
  for (const [id, source] of Object.entries(MAP_MARKERS)) asset('map-marker-' + id,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 22"><g transform="translate(11 11)">${source}</g></svg>`, [22, 22]);
  asset('map-preview', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 45"><rect width="60" height="45" fill="#0a141d"/><path d="M10 10H33V30H48M20 10V35H40" fill="none" stroke="#263442" stroke-width="3"/><g fill="#485b70" stroke="#708397" stroke-width=".15"><rect x="8" y="6" width="10" height="9"/><rect x="28" y="8" width="12" height="10"/><rect x="15" y="28" width="10" height="9"/><rect x="33" y="26" width="10" height="12"/><rect x="44" y="24" width="9" height="9"/></g><rect x="8" y="6" width="10" height="9" fill="#346c65"/><rect x="44" y="24" width="9" height="9" fill="#663d48"/><circle cx="13" cy="11" r="1" fill="#ffe2a1"/></svg>', [60, 45]);
  return doc;
}

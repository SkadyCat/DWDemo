import {UIRuntime} from '/uicreator/runtime/runtime.js';
import {createDungeonMapProject, DUNGEON_MAP, MAP_COLORS, MAP_MARKERS} from '/uicreator/assets/rulestudio-hud/dungeon-map.js';
import {DungeonMapCamera, mapHeroPoint, mapWorldPoint} from '/dungeon-map-model.mjs';
import {MAP_EVENT_INFO, mapEventArtwork} from '/uicreator/assets/rulestudio-hud/map-event-markers.js';

const NS = 'http://www.w3.org/2000/svg';
const element = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const [key, value] of Object.entries(attrs)) e.setAttribute(key, value); return e; };
export class DungeonMapView {
  constructor(svg, {mini = false, onAction = () => {}} = {}) {
    this.svg = svg; this.mode = mini ? 'mini' : 'panel'; this.spec = DUNGEON_MAP[this.mode]; this.events = new AbortController();
    this.ui = new UIRuntime(svg, createDungeonMapProject(), {prefabId: mini ? 'dungeon-minimap' : null, sound: false, motion: false});
    svg.setAttribute('role', 'group'); svg.querySelector('defs')?.setAttribute('aria-hidden', 'true');
    this.surface = this.ui.renderer.groups.get('dmap-' + this.mode + '-viewport').children;
    this.projection = element('g', {'data-dungeon-projection': this.mode, 'pointer-events': 'none'});
    this.world = element('g'); this.geometry = element('g'); this.world.append(this.geometry);
    this.projection.append(this.world); this.surface.append(this.projection);
    this.eventLayer = element('g', {'data-map-events': this.mode}); this.projection.append(this.eventLayer); this.eventMarkers = new Map();
    this.markers = Object.fromEntries(Object.entries(MAP_MARKERS).filter(([id]) => !MAP_EVENT_INFO[id]).map(([id, source]) => {
      const mark = element('g', {'data-map-marker': id}); mark.innerHTML = source; this.projection.append(mark); return [id, mark];
    }));
    this.projection.append(this.markers.hero);
    this.roomRects = new Map();
    this.ui.set('dmap-' + this.mode + '-preview', {visibility: 'collapsed'});
    this.ui.addEventListener('activate', e => {
      const op = e.detail.node.action?.op;
      if (op === 'in' || op === 'out') this.zoomBy(op === 'in' ? 1.25 : 1 / 1.25);
      else if (op === 'fit') this.fit();
      else if (op === 'locate') this.locate();
      else onAction(op);
    }, {signal: this.events.signal});
  }
  update(map, hud) {
    if (!map || !hud) return;
    this.hud = hud;
    if (this.map !== map) {
      this.stopRebound();
      this.map = map; this.camera = new DungeonMapCamera(map, this.spec.viewport, this.mode === 'mini'); this.rebuild();
    }
    if (this.camera.follow) this.camera.locate(mapHeroPoint(map, hud));
    this.paint();
  }
  rebuild() {
    const map = this.map;
    this.geometry.replaceChildren(); this.roomRects.clear();
    this.geometry.setAttribute('transform', `translate(0 ${map.size}) scale(1 -1)`);
    this.geometry.append(element('path', {d: map.mapPath, fill: MAP_COLORS.floor}));
    for (const room of map.rooms) {
      const rect = element('rect', {x: room.x, y: room.y, width: room.w, height: room.h, rx: .3, 'stroke-width': .12});
      this.roomRects.set(room.id, rect); this.geometry.append(rect);
    }
  }
  paint() {
    if (!this.map || !this.hud) return;
    const map = this.map, hud = this.hud, cam = this.camera, v = this.spec.viewport;
    this.world.setAttribute('transform', `translate(${v.width / 2 - cam.x * cam.scale} ${v.height / 2 - cam.y * cam.scale}) scale(${cam.scale})`);
    for (const room of map.rooms) {
      const visited = hud.rooms?.[room.id]?.visited, boss = room.kind === 'boss' && hud.phase !== 'cleared';
      const rect = this.roomRects.get(room.id);
      rect.setAttribute('fill', boss ? MAP_COLORS.bossRoom : visited ? MAP_COLORS.visited : MAP_COLORS.room);
      rect.setAttribute('stroke', boss ? '#ae6c78' : visited ? MAP_COLORS.visitedEdge : MAP_COLORS.roomEdge);
    }
    const marker = (id, point, visible = true, rotate = 0) => {
      const mark = this.markers[id]; mark.setAttribute('display', visible ? '' : 'none');
      if (visible) { const p = cam.project(point); mark.setAttribute('transform', `translate(${p.x} ${p.y}) rotate(${rotate})`); }
    };
    marker('hero', mapHeroPoint(map, hud), true, hud.heroHeading || 0);
    marker('entry', {x: map.rooms[map.entryRoom].centerX, y: map.size - map.rooms[map.entryRoom].centerY});
    const boss = map.rooms[map.bossRoom];
    marker('boss', hud.bossPoint || {x: boss.centerX, y: map.size - boss.centerY}, hud.phase !== 'cleared');
    marker('portal', hud.portal ? mapWorldPoint(map, hud.portal.x, hud.portal.y) : {x: 0, y: 0}, !!hud.portal);
    const activeEvents = new Set();
    for (const event of hud.events || []) {
      if (!MAP_EVENT_INFO[event.kind] || !Number.isFinite(event.x) || !Number.isFinite(event.y)) continue;
      const id = event.id; activeEvents.add(id);
      let mark = this.eventMarkers.get(id);
      if (!mark) { mark = element('g', {'data-map-event': id, 'data-event-kind': event.kind}); this.eventLayer.append(mark); this.eventMarkers.set(id, mark); }
      const state = event.kind + ':' + !!event.completed;
      if (mark.getAttribute('data-state') !== state) {
        mark.innerHTML = mapEventArtwork(event.kind, event.completed); mark.setAttribute('data-state', state);
        const title = element('title'); title.textContent = (event.name || MAP_EVENT_INFO[event.kind].name) + (event.completed ? ' · 已完成' : ''); mark.append(title);
      }
      const point = cam.project(mapWorldPoint(map, event.x, event.y));
      mark.setAttribute('transform', `translate(${point.x} ${point.y}) scale(${this.mode === 'mini' ? .8 : 1.1})`);
      mark.setAttribute('data-completed', String(!!event.completed));
    }
    for (const [id, mark] of this.eventMarkers) if (!activeEvents.has(id)) { mark.remove(); this.eventMarkers.delete(id); }
    const percent = Math.round(cam.zoom * 100) + '%', prefix = 'dmap-' + this.mode;
    const labels = this.mode === 'mini' ? [[prefix + '-floor', `第 ${hud.floor} 层`], [prefix + '-zoom', percent]] : [
      [prefix + '-zoom', percent], [prefix + '-subtitle', `第 ${hud.floor} 层 · ${cam.follow ? '跟随角色' : '全图探索'} · 战斗已暂停`],
      [prefix + '-progress', `${hud.visitedRooms} / ${hud.totalRooms}`],
      [prefix + '-objective', hud.phase === 'cleared' ? '首领已击败' : '寻找并击败首领'],
      [prefix + '-objective-note', hud.portal ? '传送阵已开启，前往下一区域' : '击败首领，开启传送阵'],
      [prefix + '-status', hud.phase === 'cleared' ? '本层已通关' : '首领尚未击败']];
    const updates = labels.filter(([id, text]) => this.ui.nodes.get(id)?.text !== text).map(([id, text]) => [id, {text}]);
    const buttons = this.mode === 'mini' ? [prefix + '-zoom-out', prefix + '-zoom-in'] : [prefix + '-out', prefix + '-in'];
    for (const [i, id] of buttons.entries()) {
      const enabled = i === 0 ? cam.zoom > (this.mode === 'mini' ? 1 : .75) + .001 : cam.zoom < 3.999;
      if (this.ui.nodes.get(id).interactable !== enabled) updates.push([id, {interactable: enabled}]);
    }
    if (updates.length) this.ui.setMany(updates);
    this.svg.setAttribute('data-map-zoom', percent); this.svg.setAttribute('data-map-follow', String(cam.follow));
  }
  stopRebound() { cancelAnimationFrame(this.reboundFrame || 0); this.reboundFrame = 0; this.svg.setAttribute('data-map-motion', 'idle'); }
  fit() { if (!this.camera) return; this.stopRebound(); this.camera.fit(); this.paint(); }
  zoomBy(factor, anchor) { if (!this.camera) return; this.stopRebound(); this.camera.zoomBy(factor, anchor); this.paint(); }
  locate() { if (!this.camera || !this.hud) return; this.stopRebound(); this.camera.locate(mapHeroPoint(this.map, this.hud)); this.paint(); }
  pan(dx, dy) { if (!this.camera) return; this.stopRebound(); this.camera.pan(dx, dy); this.paint(); }
  beginDrag() { if (!this.camera) return; this.stopRebound(); this.camera.beginDrag(); this.svg.setAttribute('data-map-motion', 'dragging'); }
  dragBy(dx, dy) { this.camera?.dragBy(dx, dy); this.paint(); }
  endDrag() {
    if (!this.camera?.drag) return;
    this.stopRebound();
    const camera = this.camera, target = camera.endDrag(), start = {x: camera.x, y: camera.y};
    if (Math.hypot(target.x - start.x, target.y - start.y) * camera.scale < .15 || globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      Object.assign(camera, target); this.paint(); return;
    }
    this.svg.setAttribute('data-map-motion', 'rebound');
    const started = performance.now();
    const step = now => {
      const t = Math.min(1, (now - started) / 260), eased = 1 - (1 - t) ** 3;
      camera.x = start.x + (target.x - start.x) * eased; camera.y = start.y + (target.y - start.y) * eased;
      this.paint();
      if (t < 1) this.reboundFrame = requestAnimationFrame(step);
      else { this.reboundFrame = 0; this.svg.setAttribute('data-map-motion', 'idle'); }
    };
    this.reboundFrame = requestAnimationFrame(step);
  }
  point(event) {
    const rect = this.svg.getBoundingClientRect(), scale = this.spec.width / rect.width;
    return {x: (event.clientX - rect.left) * scale - this.spec.viewport.x, y: (event.clientY - rect.top) * scale - this.spec.viewport.y};
  }
  inside(point) { const v = this.spec.viewport; return point.x >= 0 && point.y >= 0 && point.x <= v.width && point.y <= v.height; }
  destroy() { this.stopRebound(); this.events.abort(); this.ui.destroy(); this.projection.remove(); this.roomRects.clear(); this.eventMarkers.clear(); }
}

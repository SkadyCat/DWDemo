// A presentation-only atlas. Progression and challenge eligibility belong to atlas-state.mjs.
import { ref, shallowRef, computed, watch, nextTick, onMounted, onBeforeUnmount } from '/vendor/vue.esm-browser.prod.js';
import { visibleAtlas, atlasNodesInBounds } from './atlas-state.mjs';
import { createAtlasTerrain } from './atlas-terrain.mjs';
import { atlasMapEvents } from './atlas-map-events.mjs';
import { MapEventBadges } from './map-event-badges.mjs';
import { BattleWindow } from './battle-window.mjs';
import { BattleMapDevice } from './battle-map-device.mjs';
import { mapTicketAccess, atlasRegionTier } from './atlas-travel.mjs';
import { AtlasEntryButton } from './atlas-entry-button.mjs';
import { AtlasPlayerMarker } from './atlas-player-marker.mjs';

const TONES = { hidden: '#495f5b', locked: '#79847a', available: '#d8b570', active: '#8de1d1', cleared: '#c4ddaa', failed: '#d78970' };
const LABELS = { hidden: '未探索', locked: '尚未连通', available: '可以探索', active: '正在挑战', cleared: '已通关', failed: '挑战失败' };
const BIOMES = { forest: '幽林', ruins: '遗迹', desert: '荒漠', marsh: '湿地', coast: '海岸', mountain: '群山', snow: '冻原', tundra: '冻原', wasteland: '荒原', volcanic: '熔火之地' };
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
function hash(value) { let n = 2166136261; for (const c of String(value)) n = Math.imul(n ^ c.charCodeAt(0), 16777619); return n >>> 0; }
function createFog(nodes, bounds) {
  const canvas = document.createElement('canvas'), scale = 768 / Math.max(bounds.width, bounds.height);
  canvas.width = Math.ceil(bounds.width * scale); canvas.height = Math.ceil(bounds.height * scale);
  const context = canvas.getContext('2d');
  context.fillStyle = 'rgba(2,10,13,.85)'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.globalCompositeOperation = 'destination-out';
  for (const node of nodes) {
    if (node.status === 'hidden') continue;
    const x = (node.x - bounds.x) * scale, y = (node.y - bounds.y) * scale, radius = (node.status === 'locked' ? 120 : 195) * scale;
    const glow = context.createRadialGradient(x, y, radius * .3, x, y, radius);
    glow.addColorStop(0, node.status === 'locked' ? 'rgba(0,0,0,.6)' : '#000'); glow.addColorStop(1, 'transparent');
    context.fillStyle = glow; context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  return { canvas, bounds };
}

function nodeGlyph(context, node, radius, tone) {
  context.strokeStyle = tone; context.lineWidth = 1.3;
  const kind = hash(node.biome || node.id) % 4;
  context.beginPath();
  if (kind === 0) { context.moveTo(-radius * .5, radius * .35); context.lineTo(0, -radius * .55); context.lineTo(radius * .5, radius * .35); context.closePath(); context.moveTo(0, -radius * .55); context.lineTo(0, radius * .55); }
  else if (kind === 1) { context.rect(-radius * .4, -radius * .3, radius * .8, radius * .7); context.moveTo(-radius * .5, -radius * .3); context.lineTo(0, -radius * .65); context.lineTo(radius * .5, -radius * .3); context.moveTo(0, radius * .4); context.lineTo(0, 0); }
  else if (kind === 2) { context.moveTo(-radius * .55, radius * .3); context.lineTo(-radius * .1, -radius * .5); context.lineTo(radius * .15, -.1 * radius); context.lineTo(radius * .35, -radius * .3); context.lineTo(radius * .6, radius * .3); }
  else { context.arc(0, 0, radius * .35, 0, Math.PI * 2); context.moveTo(0, -radius * .65); context.lineTo(0, radius * .65); context.moveTo(-radius * .65, 0); context.lineTo(radius * .65, 0); }
  context.stroke();
}

export const AtlasMap = {
  name: 'AtlasMap',
  components: { BattleWindow, BattleMapDevice, AtlasEntryButton, AtlasPlayerMarker, MapEventBadges },
  props: { state: { type: Object, required: true }, currentNodeId: { type: String, default: '' }, activeNodeId: { type: String, default: '' }, currentEvents: Array, paused: Boolean, deviceItems: { type:Array, default:()=>[] }, deviceSlots: { type:Object, default:()=>({}) } },
  emits: ['challenge', 'close', 'select', 'device-change'],
  setup(props, { emit }) {
    const viewport = ref(null), canvas = ref(null), hoverId = ref(''), selectedId = ref(props.state.selectedId || props.state.activeNodeId || '0:0');
    const view = computed(() => visibleAtlas(props.state));
    const stateNodes = computed(() => Array.isArray(props.state.nodes) ? props.state.nodes : Object.values(props.state.nodes || {}));
    const allNodes = shallowRef([]), loadedWindow = ref({ key: '', nodes: 0, depth: 0 }), terrainTiles = ref(0);
    const currentId = computed(() => props.currentNodeId || props.state.currentNodeId || props.state.activeNodeId || '0:0');
    const currentNode = computed(() => stateNodes.value.find(n => n.id === currentId.value));
    const regionEvents = computed(() => new Map(allNodes.value.filter(node => node.status !== 'hidden')
      .map(node => [node.id, atlasMapEvents(props.state, node, currentId.value, props.currentEvents)])));
    const eventPositions = ref([]);
    const eventsFor = node => regionEvents.value.get(node?.id) || [];
    const playerPosition = ref({ x: 0, y: 0, visible: false });
    const ticketAccess = node => mapTicketAccess(node, props.deviceItems, props.deviceSlots);
    const destinations = computed(() => props.activeNodeId || props.state.activeNodeId ? [] : stateNodes.value.filter(n => (['available','failed'].includes(n.status) || n.id === '0:0' && n.status === 'cleared') && ticketAccess(n).ok));
    const destinationIds = computed(() => new Set(destinations.value.map(n => n.id)));
    const selected = computed(() => stateNodes.value.find(n => n.id === selectedId.value) || view.value.nodes[0] || null);
    const hovered = computed(() => allNodes.value.find(n => n.id === hoverId.value));
    const revealed = computed(() => allNodes.value.filter(n => n.status !== 'hidden'));
    const eligible = computed(() => selected.value && (selected.value.status === 'active' || (['available', 'failed'].includes(selected.value.status) || selected.value.id === '0:0' && selected.value.status === 'cleared') && !props.activeNodeId && !props.state.activeNodeId));
    const admission = computed(() => selected.value?.status === 'active' ? {ok:true,hint:'返回当前战斗不消耗地图票'} : ticketAccess(selected.value));
    const canEnter = computed(() => eligible.value && admission.value.ok);
    const entryActive = computed(() => canEnter.value && selected.value?.status !== 'active' && admission.value.free === false);
    const zoomText = ref('100'), hoverPosition = ref({ x: 0, y: 0 }), dragging = ref(false);
    const biomeName = node => BIOMES[node?.biome] || node?.biome || '未知地域';
    const statusName = node => (node?.id === currentId.value ? '你在这里 · ' : '') + (LABELS[node?.status] || '未探索');
    const tierLabel = node => { const tier = atlasRegionTier(props.state, node, props.deviceItems, props.deviceSlots); return tier == null ? '层级由放入的地图决定' : `T${tier} · 第 ${tier} 层`; };
    const entryLabel = computed(() => selected.value?.status === 'active' ? '返回当前战斗' : eligible.value && !admission.value.ok ? admission.value.error : canEnter.value ? (selected.value.id === '0:0' && selected.value.status === 'cleared' ? '返回起始地图' : selected.value.status === 'failed' ? '重新挑战' : '进入区域') : props.activeNodeId || props.state.activeNodeId ? '请先完成当前挑战' : selected.value?.status === 'cleared' ? '区域已通关' : '尚未连通');
    let width = 1, height = 1, dpr = 1, frame = 0, observer, media, terrain, fog, nodeMap = new Map(), edges = [], lastTime = 0, disposed = false, dirty = true;
    const camera = { x: 0, y: 0, zoom: .7, tx: 0, ty: 0, tz: .7 };
    let draggingPointer = null, down = null, pinch = null;
    const pointers = new Map();
    function refreshWindow(force = false) {
      const unit = 512, pad = 224;
      const minX = Math.floor((camera.x - width / (2 * camera.zoom) - pad) / unit) * unit, maxX = Math.ceil((camera.x + width / (2 * camera.zoom) + pad) / unit) * unit;
      const minY = Math.floor((camera.y - height / (2 * camera.zoom) - pad) / unit) * unit, maxY = Math.ceil((camera.y + height / (2 * camera.zoom) + pad) / unit) * unit;
      const key = `${minX}:${minY}:${maxX}:${maxY}`;
      if (!force && loadedWindow.value.key === key) return;
      allNodes.value = atlasNodesInBounds(props.state, { minX, minY, maxX, maxY });
      nodeMap = new Map(allNodes.value.map(n => [n.id, n]));
      const pairs = new Set(); edges = [];
      for (const n of allNodes.value) for (const id of n.neighbors || []) {
        const b = nodeMap.get(id); if (!b) continue; const key = [n.id, id].sort().join('|'); if (pairs.has(key)) continue; pairs.add(key); edges.push([n, b]);
      }
      fog = createFog(allNodes.value, { x: minX, y: minY, width: maxX - minX, height: maxY - minY });
      loadedWindow.value = { key, nodes: allNodes.value.length, depth: allNodes.value.reduce((max, node) => Math.max(max, node.depth), 0) };
      dirty = true;
    }
    function rebuild() {
      if (!terrain || terrain.seed !== props.state.seed) { terrain?.dispose(); terrain = createAtlasTerrain(props.state.seed); terrainTiles.value = 0; }
      refreshWindow(true);
    }
    function choose(node, focus = false) {
      if (!node || node.status === 'hidden') return;
      selectedId.value = node.id; emit('select', node.id); if (focus) { camera.tx = node.x; camera.ty = node.y; } dirty = true;
    }
    function center() {
      const n = currentNode.value || nodeMap.get('0:0');
      if (n) { camera.tx = n.x; camera.ty = n.y; choose(n); } dirty = true;
    }
    function updatePlayerPosition() {
      const n = currentNode.value;
      if (!n) { if (playerPosition.value.visible) playerPosition.value = { x: 0, y: 0, visible: false }; return; }
      const x = width / 2 + (n.x - camera.x) * camera.zoom, y = height / 2 + (n.y - camera.y) * camera.zoom;
      const visible = x > -20 && x < width + 20 && y > -20 && y < height + 20;
      const previous = playerPosition.value;
      if (Math.abs(x - previous.x) > .1 || Math.abs(y - previous.y) > .1 || visible !== previous.visible) playerPosition.value = { x, y, visible };
      const positions = [];
      for (const node of allNodes.value) {
        const events = eventsFor(node); if (!events.length) continue;
        const current = node.id === currentId.value;
        const x = width / 2 + (node.x - camera.x) * camera.zoom, y = height / 2 + (node.y - camera.y) * camera.zoom + (current ? 44 : 0);
        if (x < -60 || x > width + 60 || y < -26 || y > height + 26) continue;
        positions.push({id: node.id, x, y, events, current});
      }
      const previousEvents = eventPositions.value;
      if (positions.length !== previousEvents.length || positions.some((pin, i) => pin.id !== previousEvents[i].id || pin.events !== previousEvents[i].events || Math.abs(pin.x - previousEvents[i].x) > .1 || Math.abs(pin.y - previousEvents[i].y) > .1)) eventPositions.value = positions;
    }
    function zoomBy(factor, px = width / 2, py = height / 2) {
      const next = clamp(camera.tz * factor, .28, 2.4), worldX = camera.tx + (px - width / 2) / camera.tz, worldY = camera.ty + (py - height / 2) / camera.tz;
      camera.tx = worldX - (px - width / 2) / next; camera.ty = worldY - (py - height / 2) / next; camera.tz = next; dirty = true;
    }
    function local(event) { const rect = viewport.value.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; }
    function pick(x, y) {
      const wx = camera.x + (x - width / 2) / camera.zoom, wy = camera.y + (y - height / 2) / camera.zoom;
      let closest = null, distance = Math.max(16 / camera.zoom, 22);
      for (const n of revealed.value) { const d = Math.hypot(wx - n.x, wy - n.y); if (d < distance) { closest = n; distance = d; } }
      return closest;
    }
    function pointerDown(event) {
      if (event.button !== 0) return;
      viewport.value.focus({ preventScroll: true }); viewport.value.setPointerCapture(event.pointerId);
      const p = local(event); pointers.set(event.pointerId, p);
      if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom: camera.tz }; down = null; dragging.value = true; return; }
      draggingPointer = event.pointerId; down = { ...p, cx: camera.tx, cy: camera.ty, moved: false }; hoverId.value = '';
    }
    function pointerMove(event) {
      if (event.pointerType === 'mouse' && !(event.buttons & 1) && pointers.has(event.pointerId)) { cancelPointers(); return; }
      const p = local(event);
      if (pointers.has(event.pointerId)) pointers.set(event.pointerId, p);
      if (pinch && pointers.size === 2) { const [a, b] = [...pointers.values()]; const next = clamp(pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, pinch.distance), .28, 2.4); zoomBy(next / camera.tz, (a.x + b.x) / 2, (a.y + b.y) / 2); return; }
      if (down && draggingPointer === event.pointerId) { const dx = p.x - down.x, dy = p.y - down.y; down.moved ||= Math.hypot(dx, dy) > 5; if (!down.moved) return; dragging.value = true; camera.tx = down.cx - dx / camera.zoom; camera.ty = down.cy - dy / camera.zoom; dirty = true; return; }
      hoverPosition.value = { x: Math.min(p.x + 22, width - 185), y: Math.min(p.y + 22, height - 70) }; hoverId.value = pick(p.x, p.y)?.id || ''; dirty = true;
    }
    function pointerUp(event) {
      try {
        if (event.type !== 'pointercancel' && down && draggingPointer === event.pointerId && !down.moved && !pinch) { const p = local(event); choose(pick(p.x, p.y)); }
      } finally { cancelPointers(); }
    }
    function cancelPointers() {
      const captured = [...pointers.keys()]; pointers.clear();
      down = null; draggingPointer = null; pinch = null; dragging.value = false;
      for (const id of captured) if (viewport.value?.hasPointerCapture(id)) viewport.value.releasePointerCapture(id);
    }
    function wheel(event) { const p = local(event); zoomBy(Math.exp(-clamp(event.deltaY, -180, 180) * .0015), p.x, p.y); }
    function keydown(event) {
      // The shared backpack window owns Tab focus containment.
      if (event.key === 'Tab' || (event.code === 'KeyJ' && !/^(SELECT|INPUT|TEXTAREA)$/.test(event.target.tagName))) return;
      event.stopPropagation();
      if (event.key === 'Escape' || event.key.toLowerCase() === 'm') { event.preventDefault(); if (!event.repeat) emit('close'); return; }
      if (/^(SELECT|INPUT|TEXTAREA)$/.test(event.target.tagName)) return;
      if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomBy(1.2); }
      else if (event.key === '-') { event.preventDefault(); zoomBy(1 / 1.2); }
      else if (event.key.toLowerCase() === 'f' || event.key === 'Home') { event.preventDefault(); center(); }
      else if (event.key.startsWith('Arrow')) { event.preventDefault(); const amount = 95 / camera.tz; camera.tx += event.key === 'ArrowLeft' ? -amount : event.key === 'ArrowRight' ? amount : 0; camera.ty += event.key === 'ArrowUp' ? -amount : event.key === 'ArrowDown' ? amount : 0; dirty = true; }
    }
    function draw(time) {
      const context = canvas.value?.getContext('2d'); if (!context || !terrain) return;
      context.setTransform(dpr, 0, 0, dpr, 0, 0); context.clearRect(0, 0, width, height); context.fillStyle = '#071418'; context.fillRect(0, 0, width, height);
      context.save(); context.translate(width / 2, height / 2); context.scale(camera.zoom, camera.zoom); context.translate(-camera.x, -camera.y);
      const minX = camera.x - width / (2 * camera.zoom) - 80, maxX = camera.x + width / (2 * camera.zoom) + 80, minY = camera.y - height / (2 * camera.zoom) - 80, maxY = camera.y + height / (2 * camera.zoom) + 80;
      terrain.draw(context, { minX, minY, maxX, maxY }); terrainTiles.value = terrain.size;
      if (fog) { const b = fog.bounds; context.drawImage(fog.canvas, b.x, b.y, b.width, b.height); }
      for (const [a, n] of edges) {
        if (Math.max(a.x, n.x) < minX || Math.min(a.x, n.x) > maxX || Math.max(a.y, n.y) < minY || Math.min(a.y, n.y) > maxY) continue;
        const hidden = a.status === 'hidden' || n.status === 'hidden', cleared = a.status === 'cleared' && n.status === 'cleared', open = ['available', 'active', 'failed', 'cleared'].includes(a.status) && ['available', 'active', 'failed', 'cleared'].includes(n.status);
        const curve = (hash(a.id + n.id) % 21 - 10) * .9, dx = n.x - a.x, dy = n.y - a.y;
        context.beginPath(); context.moveTo(a.x, a.y); context.quadraticCurveTo((a.x + n.x) / 2 - dy / 140 * curve, (a.y + n.y) / 2 + dx / 140 * curve, n.x, n.y);
        context.lineWidth = (open ? 1.5 : .8) / camera.zoom; context.strokeStyle = hidden ? 'rgba(120,152,136,.115)' : cleared ? '#8ea889' : open ? 'rgba(205,174,108,.65)' : 'rgba(121,143,123,.3)'; context.setLineDash(hidden ? [2 / camera.zoom, 6 / camera.zoom] : []); context.stroke();
      }
      context.setLineDash([]);
      for (const node of allNodes.value) {
        if (node.x < minX || node.x > maxX || node.y < minY || node.y > maxY) continue;
        // The authored UICreator player pin replaces this region's terrain glyph.
        if (node.id === currentId.value) continue;
        const hidden = node.status === 'hidden', selectedNode = node.id === selectedId.value, hover = node.id === hoverId.value, isActive = node.status === 'active' || node.id === currentId.value, reachable = destinationIds.value.has(node.id);
        const radius = (hidden ? 3 : selectedNode || isActive ? 17 : reachable ? 15 : node.status === 'locked' ? 9 : 13) / Math.sqrt(camera.zoom), tone = isActive ? '#8de1d1' : TONES[node.status] || TONES.locked;
        context.save(); context.translate(node.x, node.y);
        if (hidden) { context.fillStyle = 'rgba(112,148,126,.3)'; context.beginPath(); context.arc(0, 0, radius, 0, Math.PI * 2); context.fill(); context.restore(); continue; }
        if (selectedNode || hover || isActive || reachable) {
          const glow = context.createRadialGradient(0, 0, radius * .4, 0, 0, radius * 3.2); glow.addColorStop(0, isActive ? 'rgba(104,230,204,.32)' : 'rgba(231,184,94,.3)'); glow.addColorStop(1, 'transparent'); context.fillStyle = glow; context.fillRect(-radius * 3.2, -radius * 3.2, radius * 6.4, radius * 6.4);
          context.strokeStyle = isActive ? '#9ae9d8' : '#e3c083'; context.lineWidth = 1 / camera.zoom; context.beginPath(); context.arc(0, 0, radius + 6 / camera.zoom, 0, Math.PI * 2); context.stroke();
          const pulse = media?.matches ? 0 : Math.sin(time * .0018) * .12 + .12;
          context.globalAlpha = .35 + pulse; context.beginPath(); context.arc(0, 0, radius + 10 / camera.zoom, -.7, .9); context.arc(0, 0, radius + 10 / camera.zoom, Math.PI - .7, Math.PI + .9); context.stroke(); context.globalAlpha = 1;
        }
        context.fillStyle = node.status === 'locked' ? '#172623' : '#152a25'; context.strokeStyle = tone; context.lineWidth = (selectedNode ? 2 : 1) / camera.zoom;
        context.beginPath(); context.arc(0, 0, radius, 0, Math.PI * 2); context.fill(); context.stroke();
        if (eventsFor(node).length) { /* Authored event pins replace the generic region glyph. */ }
        else if (node.status === 'cleared') { context.strokeStyle = tone; context.lineWidth = 1.8 / camera.zoom; context.beginPath(); context.moveTo(-radius * .4, 0); context.lineTo(-radius * .1, radius * .3); context.lineTo(radius * .45, -radius * .35); context.stroke(); }
        else if (node.status === 'locked') { context.fillStyle = tone; context.beginPath(); context.arc(0, 0, 2 / camera.zoom, 0, Math.PI * 2); context.fill(); }
        else nodeGlyph(context, node, radius * .8, tone);
        if (selectedNode || hover || isActive || (camera.zoom > .82 && node.status !== 'locked')) {
          context.font = `${11 / camera.zoom}px "Microsoft YaHei",sans-serif`; context.textAlign = 'center'; context.textBaseline = 'top'; const label = node.name || '未知地域', labelY = radius + 13 / camera.zoom;
          const textWidth = context.measureText(label).width; context.fillStyle = 'rgba(6,17,19,.87)'; context.fillRect(-textWidth / 2 - 8 / camera.zoom, labelY - 4 / camera.zoom, textWidth + 16 / camera.zoom, 20 / camera.zoom); context.fillStyle = selectedNode ? '#e6d7b1' : '#adbcb0'; context.fillText(label, 0, labelY);
        }
        context.restore();
      }
      context.restore();
      const vignette = context.createRadialGradient(width * .5, height * .5, Math.min(width, height) * .24, width * .5, height * .5, Math.max(width, height) * .66); vignette.addColorStop(0, 'transparent'); vignette.addColorStop(1, 'rgba(1,8,11,.66)'); context.fillStyle = vignette; context.fillRect(0, 0, width, height);
    }
    function animate(time) {
      if (disposed) return;
      const delta = Math.min(64, time - lastTime || 16); lastTime = time; const easing = 1 - Math.exp(-delta / 62);
      const moving = Math.abs(camera.tx - camera.x) + Math.abs(camera.ty - camera.y) + Math.abs(camera.tz - camera.zoom) * 100 > .03;
      camera.x += (camera.tx - camera.x) * easing; camera.y += (camera.ty - camera.y) * easing; camera.zoom += (camera.tz - camera.zoom) * easing;
      refreshWindow();
      updatePlayerPosition();
      // Static map at rest is capped at 30 fps for its small selection pulse, no combat tick.
      if (dirty || moving || terrain?.pending || (!media?.matches && time - (animate.drawnAt || 0) > 33)) { draw(time); animate.drawnAt = time; dirty = false; zoomText.value = Math.round(camera.zoom * 100).toString(); }
      frame = document.hidden ? 0 : requestAnimationFrame(animate);
    }
    function visibility() { if (document.hidden) { cancelPointers(); cancelAnimationFrame(frame); frame = 0; } else if (!frame && !disposed) frame = requestAnimationFrame(animate); }
    function resize() { if (!viewport.value || !canvas.value) return; width = viewport.value.clientWidth || 1; height = viewport.value.clientHeight || 1; dpr = Math.min(window.devicePixelRatio || 1, 2); canvas.value.width = Math.round(width * dpr); canvas.value.height = Math.round(height * dpr); dirty = true; }
    watch(() => [props.state.seed, props.state.nodes], rebuild);
    watch(() => props.state.selectedId, id => { if (id && nodeMap.has(id)) { selectedId.value = id; dirty = true; } });
    watch(destinationIds, () => { dirty = true; });
    watch(currentId, center);
    onMounted(() => { media = window.matchMedia('(prefers-reduced-motion: reduce)'); rebuild(); observer = new ResizeObserver(resize); observer.observe(viewport.value); resize(); camera.zoom = camera.tz = clamp(width / 1850, .48, .78); center(); camera.x = camera.tx; camera.y = camera.ty; nextTick(() => { if (!disposed) viewport.value?.focus({ preventScroll: true }); }); document.addEventListener('visibilitychange', visibility); window.addEventListener('blur', cancelPointers); frame = requestAnimationFrame(animate); });
    onBeforeUnmount(() => { disposed = true; cancelPointers(); cancelAnimationFrame(frame); observer?.disconnect(); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('blur', cancelPointers); terrain?.dispose(); terrain = null; fog = null; nodeMap.clear(); edges = []; });
    return { viewport, canvas, selected, selectedId, hovered, hoverPosition, dragging, zoomText, view, currentId, currentNode, playerPosition, eventPositions, eventsFor, destinations, loadedWindow, terrainTiles, biomeName, statusName, tierLabel, canEnter, entryActive, admission, entryLabel, choose, center, zoomBy, pointerDown, pointerMove, pointerUp, cancelPointers, wheel, keydown, clearHover: () => { hoverId.value = ''; dirty = true; }, challenge: () => { if (canEnter.value) emit('challenge', selected.value.id); } };
  },
  template: /* html */ `<BattleWindow title="世界地图" kind="atlas" @close="$emit('close')">
  <div class="atlas-map" @pointerdown.stop @click.stop @contextmenu.prevent.stop @wheel.stop @keydown="keydown" @keyup.stop>
    <header class="atlas-toolbar">
      <div class="atlas-summary"><span>玩家位置：<b>{{ currentNode?.name }}</b></span><i></i><span><b>{{ destinations.length }}</b> 处可前往 · 金色高亮</span></div>
      <span class="atlas-toolbar-hint">战斗已暂停 · <kbd>M</kbd> / <kbd>Esc</kbd> 返回</span>
    </header>
    <div class="atlas-main">
      <div ref="viewport" class="atlas-viewport" :class="{ dragging }" :data-current-node="currentId" :data-destination-count="destinations.length" :data-atlas-window="loadedWindow.key" :data-loaded-nodes="loadedWindow.nodes" :data-max-depth="loadedWindow.depth" :data-terrain-tiles="terrainTiles" tabindex="0" aria-label="拖动世界地图，滚轮缩放；方向键移动，F 定位当前位置" @pointerdown.prevent.stop="pointerDown" @pointermove.stop="pointerMove" @pointerup.stop="pointerUp" @pointercancel.stop="pointerUp" @lostpointercapture="cancelPointers" @pointerleave="clearHover" @wheel.prevent.stop="wheel">
        <canvas ref="canvas" class="atlas-map-canvas" aria-hidden="true"></canvas>
        <AtlasPlayerMarker :name="currentNode?.name" :node-id="currentId" :x="playerPosition.x" :y="playerPosition.y" :visible="playerPosition.visible" />
        <div v-for="pin in eventPositions" :key="pin.id" class="atlas-event-pin" :class="{'is-current':pin.current}" :data-event-region="pin.id" :style="{left:pin.x+'px',top:pin.y+'px'}"><MapEventBadges :events="pin.events" /></div>
        <div class="atlas-map-caption"><span class="atlas-overline">无尽疆域</span><h3>迷雾之外，群星相连</h3><p>沿已连通的道路，探索下一片地域。</p></div>
        <div class="atlas-compass" aria-hidden="true"><svg viewBox="0 0 90 90"><circle cx="45" cy="45" r="29"/><circle cx="45" cy="45" r="26" stroke-dasharray="1 5"/><path d="m45 12 5 28 28 5-28 5-5 28-5-28-28-5 28-5z"/><path d="m45 20 0 25-6-6z" fill="currentColor"/><text x="45" y="8">N</text><text x="45" y="89">S</text><text x="4" y="48">W</text><text x="86" y="48">E</text></svg></div>
        <div v-if="hovered && !dragging" class="atlas-hover" :style="{ left:hoverPosition.x+'px', top:hoverPosition.y+'px' }"><b>{{ hovered.name }}</b><span>{{ tierLabel(hovered) }} · {{ statusName(hovered) }}</span><span v-if="eventsFor(hovered).length">{{ eventsFor(hovered).map(event=>event.name+(event.completed?'（已完成）':'')).join(' · ') }}</span></div>
        <div class="atlas-map-controls" @pointerdown.stop @pointermove.stop @pointerup.stop @wheel.stop><button class="atlas-locate" type="button" title="定位当前位置 (F)" aria-label="定位当前位置" @click="center"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="1.5"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/></svg></button><span class="atlas-control-divider"></span><button class="atlas-zoom-out" type="button" aria-label="缩小地图" @click="zoomBy(1/1.25)">−</button><output>{{ zoomText }}%</output><button class="atlas-zoom-in" type="button" aria-label="放大地图" @click="zoomBy(1.25)">+</button></div>
        <div class="atlas-coordinates" v-if="selected">{{ selected.x.toFixed(0) }} <span>·</span> {{ selected.y.toFixed(0) }}<small>已选区域坐标</small></div>
      </div>
      <aside class="atlas-details" v-if="selected">
        <div class="atlas-detail-scroll">
        <div class="atlas-detail-heading"><span>区域详情</span></div>
        <BattleMapDevice :items="deviceItems" :slots="deviceSlots" @change="$emit('device-change',$event)" @close="$emit('close')"><div class="atlas-region-title"><small>{{ biomeName(selected) }}</small><h3>{{ selected.name }}</h3><p>{{ tierLabel(selected) }}</p></div>
          <section v-if="eventsFor(selected).length" class="atlas-region-events" aria-label="区域特殊事件"><h4>特殊事件</h4><div v-for="event in eventsFor(selected)" :key="event.id"><MapEventBadges :events="[event]" /><span>{{ event.name }}<small v-if="event.completed">已完成</small></span></div></section>
        </BattleMapDevice>
        </div><div class="atlas-detail-bottom"><AtlasEntryButton :enabled="!!canEnter" :active="!!entryActive" :label="entryLabel+' →'" @activate="challenge" /><small class="atlas-entry-hint" v-if="canEnter">{{ admission.hint }}</small><button v-else class="atlas-back-link" type="button" @click="$emit('close')">返回战场 →</button></div>
      </aside>
    </div>
    <footer class="atlas-footer"><div class="atlas-legend"><span><i class="available"></i>可探索</span><span><i class="active"></i>挑战中</span><span><i class="cleared"></i>已通关</span><span><i class="locked"></i>未连通</span><span><i class="hidden"></i>迷雾</span></div><div class="atlas-instructions"><span>拖动平移</span><i>·</i><span>滚轮缩放</span><i>·</i><span><kbd>F</kbd> 定位</span><i>·</i><span><kbd>Esc</kbd> 返回</span></div></footer>
  </div></BattleWindow>`,
};

export default AtlasMap;

import { $, toast } from './dom.js';
import { svgElement as el } from '../assets/svg.js';
import { slotForRect } from '../core/layout.js';
import { clone } from '../core/model.js';
import { screenFromPoints, resizeScreen } from './screen-frame.js';

export class Stage {
  constructor(app) {
    this.app = app; this.viewport = $('#viewport'); this.zoom = .6; this.pan = { x: 0, y: 0 }; this.hand = false; this.space = false; this.snap = false; this.showAnchors = true; this.gesture = null;
    this.overlay = el('g', { 'data-editor-overlay': '', 'pointer-events': 'none' });
    this.screenTool = false;
    for (const [handle, x, y] of [['nw', 0, 0], ['n', .5, 0], ['ne', 1, 0], ['e', 1, .5], ['se', 1, 1], ['s', .5, 1], ['sw', 0, 1], ['w', 0, .5]]) {
      const grip = document.createElement('button'); grip.className = 'screen-grip'; grip.dataset.screenResize = handle;
      grip.style.cssText = `left:${x * 100}%;top:${y * 100}%;cursor:${handle}-resize`;
      grip.setAttribute('aria-label', `调整屏幕 ${handle} 边界`); grip.title = '拖动改变屏幕尺寸，控件按锚点重新布局';
      $('#screen-frame').append(grip);
    }
    $('#screen-tool').onclick = () => this.setScreenTool(!this.screenTool);
    for (const [event, method] of [['pointerdown', 'down'], ['pointermove', 'move'], ['pointerup', 'up']]) {
      this.viewport.addEventListener(event, e => {
        if (!this.screenTool && !this.isScreenGesture() && !(event === 'pointerdown' && e.target.closest?.('[data-screen-resize]'))) return;
        e.stopImmediatePropagation(); this[method](e);
      }, true);
    }
    this.viewport.addEventListener('pointerdown', e => this.down(e));
    this.viewport.addEventListener('pointermove', e => this.move(e));
    this.viewport.addEventListener('pointerup', e => this.up(e));
    this.viewport.addEventListener('pointercancel', () => this.cancel());
    this.viewport.addEventListener('wheel', e => {
      e.preventDefault();
      if (this.isScreenGesture()) return;
      if (app.playing && !e.ctrlKey && !e.metaKey) {
        if (app.previewRuntime) return;
        const group = e.target.closest?.('[data-node-type="ScrollBox"]');
        const node = app.layout.entries.get(group?.getAttribute('data-node-id'))?.node;
        if (node) { app.runtimeScroll.set(node.id, Math.max(0, (app.runtimeScroll.get(node.id) || node.layout.scrollOffset) + e.deltaY)); app.renderScene(); return; }
      }
      const r = this.viewport.getBoundingClientRect(); this.setZoom(this.zoom * Math.exp(-e.deltaY * .0015), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    this.viewport.addEventListener('dblclick', e => { if (app.playing) return; const node = app.layout.entries.get(e.target.closest('[data-node-id]')?.getAttribute('data-node-id'))?.node; if (node?.type === 'PrefabInstance') app.openPrefab(node.prefabId); });
    this.viewport.addEventListener('pointerover', e => {
      if (!app.playing || app.previewRuntime) return; const id = this.buttonAt(e.target); if (id && app.layout.entries.get(id)?.node.interactable) { app.runtimeStates.set(id, this.pressed === id ? 'pressed' : 'hovered'); app.paintScene(); }
    });
    this.viewport.addEventListener('pointerout', e => {
      if (!app.playing || app.previewRuntime) return; const id = this.buttonAt(e.target), next = this.buttonAt(e.relatedTarget); if (id && id !== next) { app.runtimeStates.delete(id); app.paintScene(); }
    });
    new ResizeObserver(() => { if (!this.gesture) this.fit(); }).observe(this.viewport);
    $('#fit').onclick = () => this.fit(); $('#zoom-in').onclick = () => this.setZoom(this.zoom * 1.2); $('#zoom-out').onclick = () => this.setZoom(this.zoom / 1.2); $('#zoom-value').onclick = () => this.setZoom(1);
    $('#grid').onclick = e => { const on = !$('#grid').classList.contains('active'); $('#grid').classList.toggle('active', on); this.viewport.classList.toggle('grid', on); };
    $('#snap').onclick = () => { this.snap = !this.snap; $('#snap').classList.toggle('active', this.snap); };
    $('#anchors').onclick = () => { this.showAnchors = !this.showAnchors; $('#anchors').classList.toggle('active', this.showAnchors); this.selection(); };
    $('#select-tool').onclick = () => this.setHand(false); $('#pan-tool').onclick = () => this.setHand(true);
  }
  buttonAt(target) { return target?.closest?.('[data-node-type="Button"]')?.getAttribute('data-node-id'); }
  setHand(value) { this.setScreenTool(false); this.hand = value; this.viewport.classList.toggle('hand', value || this.space); $('#pan-tool').classList.toggle('active', value); $('#select-tool').classList.toggle('active', !value); }
  isScreenGesture() { return this.gesture?.type === 'screen-draw' || this.gesture?.type === 'screen-resize'; }
  setScreenTool(enabled) {
    if (enabled) this.setHand(false);
    this.screenTool = enabled; this.viewport.classList.toggle('screen-drawing', enabled);
    $('#screen-tool').classList.toggle('active', enabled); $('#screen-tool').setAttribute('aria-pressed', String(enabled));
    if (enabled) this.app.setStatus('拖出一个矩形作为屏幕；边框可继续调整宽高。Esc 取消。');
  }
  workspacePoint(event) { const rect = this.viewport.getBoundingClientRect(); return { x: (event.clientX - rect.left) / this.zoom, y: (event.clientY - rect.top) / this.zoom }; }
  screen() {
    if (!this.app.layout) return;
    const { width, height } = this.app.layout, frame = $('#screen-frame');
    Object.assign(frame.style, { left: `${this.pan.x}px`, top: `${this.pan.y}px`, width: `${width * this.zoom}px`, height: `${height * this.zoom}px` });
    $('#screen-frame-label').textContent = `屏幕 · ${width} × ${height} · 原点 0, 0`;
    const selected = this.app.selectedEntry(), readout = $('#screen-selection');
    readout.hidden = !selected || this.app.playing;
    if (selected) {
      const { globalX: x, globalY: y, globalWidth: w, globalHeight: h } = selected, number = n => Number(n.toFixed(1));
      readout.textContent = `${selected.node.name}  ·  X ${number(x)}  Y ${number(y)}  ·  W ${number(w)}  H ${number(h)}  ·  距右 ${number(width - x - w)}  距下 ${number(height - y - h)}`;
      readout.classList.toggle('out-of-screen', x < 0 || y < 0 || x + w > width + .01 || y + h > height + .01);
    }
  }
  previewScreen(event) {
    const gesture = this.gesture, point = this.workspacePoint(event);
    const rect = gesture.type === 'screen-draw' ? screenFromPoints(gesture.start, point) : resizeScreen(gesture.rect, gesture.handle, point.x - gesture.start.x, point.y - gesture.start.y);
    this.pan = { x: rect.x * this.zoom, y: rect.y * this.zoom };
    this.app.setPreviewSize(rect.width, rect.height, { fit: false }); this.updateTransform();
  }
  fit() {
    if (!this.app.layout) return;
    const r = this.viewport.getBoundingClientRect(), { width, height } = this.app.layout;
    const expanded=$('#app').classList.contains('expanded-preview');
    this.zoom = Math.max(.03, Math.min(expanded&&this.app.playing?1:1.3, (r.width - (expanded?24:88)) / width, (r.height - (expanded?24:115)) / height));
    this.pan = { x: (r.width - width * this.zoom) / 2, y: (r.height - height * this.zoom) / 2 }; this.updateTransform();
  }
  frameBounds(bounds, maximumZoom = 1) {
    const r = this.viewport.getBoundingClientRect();
    this.zoom = Math.max(.03, Math.min(maximumZoom, (r.width - 64) / bounds.width, (r.height - 90) / bounds.height));
    this.pan = { x: (r.width - bounds.width * this.zoom) / 2 - bounds.x * this.zoom, y: (r.height - bounds.height * this.zoom) / 2 - bounds.y * this.zoom }; this.updateTransform();
  }
  setZoom(value, x = this.viewport.clientWidth / 2, y = this.viewport.clientHeight / 2) {
    const next = Math.max(.03, Math.min(5, value)), ratio = next / this.zoom;
    this.pan = { x: x - (x - this.pan.x) * ratio, y: y - (y - this.pan.y) * ratio }; this.zoom = next; this.updateTransform();
  }
  updateTransform() {
    $('#artboard').style.transform = `translate(${this.pan.x}px,${this.pan.y}px) scale(${this.zoom})`;
    $('#zoom-value').textContent = `${Math.round(this.zoom * 100)}%`; this.selection();
  }
  point(event) { const r = this.viewport.getBoundingClientRect(); return { x: (event.clientX - r.left - this.pan.x) / this.zoom, y: (event.clientY - r.top - this.pan.y) / this.zoom }; }
  selection() {
    this.screen();
    const app = this.app, svg = $('#scene'); if (this.overlay.parentNode !== svg) svg.append(this.overlay); this.overlay.replaceChildren();
    if (app.playing || !app.layout) return;
    const entry = app.selectedEntry(); if (!entry || !entry.visible) return;
    const { globalX: x, globalY: y, globalWidth: w, globalHeight: h } = entry;
    const line = 1 / this.zoom, size = 6 / this.zoom;
    const border = el('rect', { x, y, width: w, height: h, fill: 'none', stroke: '#8ed4b5', 'stroke-width': line }); this.overlay.append(border);
    const parent = app.selectedParent();
    if (!app.inheritedSelection && parent?.type === 'CanvasPanel' && !entry.node.locked) {
      for (const [handle, hx, hy] of [['nw', 0, 0], ['n', .5, 0], ['ne', 1, 0], ['e', 1, .5], ['se', 1, 1], ['s', .5, 1], ['sw', 0, 1], ['w', 0, .5]]) this.overlay.append(el('rect', { x: x + w * hx - size / 2, y: y + h * hy - size / 2, width: size, height: size, fill: '#172821', stroke: '#a4dfc1', 'stroke-width': line, 'pointer-events': 'all', 'data-resize': handle, style: `cursor:${handle}-resize` }));
      if (this.showAnchors) {
        const p = app.layout.entries.get(entry.parentId), padding = p.node.layout.padding, a = entry.node.slot.anchors;
        const iw = p.width - padding.left - padding.right, ih = p.height - padding.top - padding.bottom;
        const points = [[p.globalX + (padding.left + a.minX * iw) * p.scale, p.globalY + (padding.top + a.minY * ih) * p.scale], [p.globalX + (padding.left + a.maxX * iw) * p.scale, p.globalY + (padding.top + a.maxY * ih) * p.scale]];
        this.overlay.prepend(el('path', { d: `M${points[0][0]} ${points[0][1]}L${x} ${y}M${points[1][0]} ${points[1][1]}L${x + w} ${y + h}`, stroke: '#d5b977', 'stroke-width': line, 'stroke-dasharray': `${3 / this.zoom} ${4 / this.zoom}`, opacity: .7 }));
        points.forEach(([ax, ay]) => this.overlay.append(el('path', { d: `M${ax - size} ${ay}h${size * 2}M${ax} ${ay - size}v${size * 2}`, stroke: '#e2c785', 'stroke-width': line * 1.5 })));
      }
    }
  }
  down(e) {
    if (e.button > 1) return;
    const app = this.app;
    const screenHandle = e.target.closest?.('[data-screen-resize]')?.dataset.screenResize;
    if (e.button === 0 && (this.screenTool || screenHandle)) {
      e.preventDefault(); this.viewport.focus(); this.viewport.setPointerCapture(e.pointerId);
      this.gesture = { type: screenHandle ? 'screen-resize' : 'screen-draw', handle: screenHandle, start: this.workspacePoint(e), rect: { x: this.pan.x / this.zoom, y: this.pan.y / this.zoom, ...app.previewSize }, previous: { size: { ...app.previewSize }, pan: { ...this.pan } } };
      return;
    }
    if (app.playing && app.previewRuntime) return;
    if (app.playing && e.button === 0) { this.pressed = this.buttonAt(e.target); if (this.pressed) { app.runtimeStates.set(this.pressed, 'pressed'); app.paintScene(); this.viewport.setPointerCapture(e.pointerId); } return; }
    e.preventDefault(); this.viewport.focus(); this.viewport.setPointerCapture(e.pointerId);
    if (this.hand || this.space || e.button === 1) { this.gesture = { type: 'pan', clientX: e.clientX, clientY: e.clientY, pan: { ...this.pan } }; this.viewport.classList.add('panning'); return; }
    const handle = e.target.dataset?.resize;
    const renderId = e.target.closest('[data-node-id]')?.getAttribute('data-node-id');
    if (!handle && renderId) app.selectRendered(renderId);
    const node = app.selectedNode(), entry = app.selectedEntry(), parent = app.selectedParent();
    if (!handle && !renderId) { app.inheritedSelection = null; app.store.select(app.store.editRoot.id); return; }
    if (!node || node.locked || app.inheritedSelection || parent?.type !== 'CanvasPanel') return;
    const parentEntry = app.layout.entries.get(entry.parentId);
    this.gesture = { type: handle ? 'resize' : 'move', handle, start: this.point(e), rect: { x: entry.x, y: entry.y, width: entry.width, height: entry.height }, nodeId: node.id, slot: clone(node.slot), parent: parentEntry };
    app.store.beginGesture(handle ? '缩放控件' : '移动控件');
  }
  move(e) {
    const point = this.point(e); $('#pointer-position').textContent = `${Math.round(point.x)}, ${Math.round(point.y)}`;
    const g = this.gesture; if (!g) return;
    if (this.isScreenGesture()) {
      this.screenEvent = { clientX: e.clientX, clientY: e.clientY };
      if (!this.screenFrame) this.screenFrame = requestAnimationFrame(() => { this.screenFrame = null; if (this.isScreenGesture()) this.previewScreen(this.screenEvent); });
      return;
    }
    if (g.type === 'pan') { this.pan = { x: g.pan.x + e.clientX - g.clientX, y: g.pan.y + e.clientY - g.clientY }; this.updateTransform(); return; }
    const dx = (point.x - g.start.x) / g.parent.scale, dy = (point.y - g.start.y) / g.parent.scale, r = { ...g.rect };
    if (g.type === 'move') { r.x += dx; r.y += dy; }
    else {
      if (g.handle.includes('e')) r.width = Math.max(1, r.width + dx);
      if (g.handle.includes('s')) r.height = Math.max(1, r.height + dy);
      if (g.handle.includes('w')) { const right = r.x + r.width; r.x = Math.min(right - 1, r.x + dx); r.width = right - r.x; }
      if (g.handle.includes('n')) { const bottom = r.y + r.height; r.y = Math.min(bottom - 1, r.y + dy); r.height = bottom - r.y; }
    }
    if (this.snap && !e.altKey) for (const key of g.type === 'move' ? ['x', 'y'] : ['x', 'y', 'width', 'height']) r[key] = Math.round(r[key] / 8) * 8;
    const p = g.parent.node.layout.padding;
    r.x -= p.left; r.y -= p.top;
    const offsets = slotForRect(g.slot, r, g.parent.width - p.left - p.right, g.parent.height - p.top - p.bottom);
    this.app.store.preview(() => { const node = this.app.store.nodes.get(g.nodeId); node.slot.offsets = offsets; if (g.type === 'resize') node.slot.autoSize = false; });
  }
  up(e) {
    const app = this.app;
    if (this.isScreenGesture()) {
      if (this.screenFrame) cancelAnimationFrame(this.screenFrame); this.screenFrame = null;
      this.previewScreen(e); this.gesture = null; this.setScreenTool(false);
      if (this.viewport.hasPointerCapture(e.pointerId)) this.viewport.releasePointerCapture(e.pointerId);
      app.renderChrome();
      app.setStatus(`模拟屏幕 ${app.previewSize.width} × ${app.previewSize.height}；控件已按锚点重新布局，工程设计尺寸未变。`); return;
    }
    if (app.playing && app.previewRuntime) return;
    if (app.playing && this.pressed) {
      const rect = this.viewport.getBoundingClientRect();
      const target = document.elementFromPoint(e.clientX, e.clientY), over = this.buttonAt(target), pressed = this.pressed; this.pressed = null;
      app.runtimeStates.set(pressed, over === pressed ? 'hovered' : 'normal'); app.paintScene();
      if (over === pressed && app.layout.entries.get(pressed)?.node.interactable) app.setStatus(`触发按钮：${app.layout.entries.get(pressed).node.name}`);
    }
    if (this.gesture?.type !== 'pan') app.store.endGesture(); this.gesture = null; this.viewport.classList.remove('panning');
    if (this.viewport.hasPointerCapture(e.pointerId)) this.viewport.releasePointerCapture(e.pointerId);
  }
  cancel() {
    if (this.screenFrame) cancelAnimationFrame(this.screenFrame); this.screenFrame = null;
    if (this.isScreenGesture()) {
      const previous = this.gesture.previous; this.gesture = null; this.pan = previous.pan;
      this.app.setPreviewSize(previous.size.width, previous.size.height, { fit: false }); this.updateTransform(); this.app.renderChrome();
    } else if (this.gesture?.type !== 'pan') this.app.store.endGesture(true);
    this.setScreenTool(false); this.gesture = null; this.viewport.classList.remove('panning'); this.pressed = null;
  }
}

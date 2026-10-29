import { createNode, clone, merge, uid, walk, canAdd, canContain, isAncestor, indexTree, validateDocument } from '../core/model.js';
import { EditorStore } from '../core/store.js';
import { expandDocument, createPrefabFromNode, detachInstance, applyInstanceOverrides } from '../core/prefabs.js';
import { computeLayout, slotForRect } from '../core/layout.js';
import { SvgRenderer, measureText } from '../render/svg-renderer.js';
import { starterProject } from '../assets/starter.js';
import { makeSvgAsset } from '../assets/svg.js';
import { importTree } from '../io/adapters.js';
import { importHtml } from '../io/html-import.js';
import { saveProject, loadProject } from '../io/project.js';
import { $, $$, toast } from './dom.js';
import { Stage } from './stage.js';
import { Library } from './library.js';
import { renderInspector } from './inspector.js';
import { UIRuntime } from '../runtime/runtime.js';
import { attachPresentation } from '../runtime/battle-hud.js';
import { UiAudioPlayer } from '../runtime/audio.js';
import { showAssetEditor, showImport, showExport, showProjects, showHelp, showDiagnostics } from './dialogs.js';

class Editor {
  constructor() {
    this.store = new EditorStore(starterProject()); this.renderer = new SvgRenderer($('#scene'));
    this.revision = 0; this.dirty = false; this.saving = false; this.inheritedSelection = null;
    this.playing = false; this.runtimeStates = new Map(); this.runtimeScroll = new Map(); this.forcedState = 'normal';
    this.audioPlayer = new UiAudioPlayer({ onPlay: cue => { this.setStatus(`♪ ${cue.name} · ${cue.event}`); this.renderAudioState(); $('#audio-toggle').dataset.lastSound = cue.id; }, onError: error => this.notify(`音效播放失败：${error.message}`, true) });
    const savedAudioVolume = Number(localStorage.getItem('uialpha-audio-volume') ?? .8);
    this.audioPlayer.volume = Number.isFinite(savedAudioVolume) ? Math.max(0, Math.min(1, savedAudioVolume)) : .8; this.audioPlayer.muted = localStorage.getItem('uialpha-audio-muted') === '1';
    $('#audio-master-volume').value = this.audioPlayer.volume * 100;
    $('#audio-master-volume').oninput = e => { this.audioPlayer.volume = Number(e.target.value) / 100; localStorage.setItem('uialpha-audio-volume', this.audioPlayer.volume); };
    $('#audio-toggle').onclick = async () => { if (this.audioPlayer.muted || this.audioPlayer.context?.state !== 'running') { this.audioPlayer.setMuted(false); await this.audioPlayer.unlock(); } else this.audioPlayer.setMuted(true); localStorage.setItem('uialpha-audio-muted', this.audioPlayer.muted ? '1' : '0'); this.renderAudioState(); };
    this.renderAudioState();
    this.stage = new Stage(this); this.library = new Library(this);
    this.previewSize = { ...this.store.document.viewport }; this.renderScene(); this.renderChrome();
    this.store.addEventListener('change', e => this.changed(e.detail));
    this.bind(); this.restoreLast();
  }
  notify(message, error = false) { toast(message, error); this.setStatus(message); }
  renderAudioState() { const ready = this.audioPlayer.context?.state === 'running' && !this.audioPlayer.muted; $('#audio-toggle').textContent = this.audioPlayer.muted ? '♪ 音效关' : ready ? '♪ 音效开' : '♪ 开启音效'; $('#audio-toggle').setAttribute('aria-pressed', String(ready)); }
  setStatus(message) { $('#status-message').textContent = message; }
  selectedEntry() { return this.layout?.entries.get(this.inheritedSelection?.renderId || this.store.selected); }
  selectedNode() { return this.inheritedSelection ? this.selectedEntry()?.node : this.store.nodes.get(this.store.selected); }
  selectedParent() { const entry = this.selectedEntry(); return entry?.parentId ? this.layout.entries.get(entry.parentId)?.node : null; }
  changed({ kind, label }) {
    if (kind === 'preview') {
      if (!this.renderFrame) this.renderFrame = requestAnimationFrame(() => { this.renderFrame = null; this.renderScene(); });
      return;
    }
    if (kind === 'selection') { this.forcedState = 'normal'; this.library.render(); renderInspector(this); this.stage.selection(); return; }
    if (kind === 'context' || kind === 'replace') {
      this.inheritedSelection = null; this.previewSize = { ...this.store.viewDocument.viewport }; this.runtimeStates.clear(); this.runtimeScroll.clear(); this.forcedState = 'normal';
    }
    if (this.inheritedSelection && !this.store.nodes.has(this.inheritedSelection.instanceId)) this.inheritedSelection = null;
    this.renderScene(); this.renderChrome();
    if (kind === 'context' || kind === 'replace') this.stage.fit();
    if (kind === 'document') {
      this.dirty = true; this.updateSaveStatus(); if (label) this.setStatus(label);
      try { localStorage.setItem('uialpha-recovery', JSON.stringify({ document: this.store.document, revision: this.revision, dirty: true })); } catch { this.setStatus('本地恢复缓存已满，请保存工程到磁盘'); }
    }
  }
  renderScene() {
    const start = performance.now();
    if (this.previewRuntime) {
      this.previewRuntime.render(this.previewSize.width, this.previewSize.height); this.syncRuntime(); return;
    }
    this.expanded = expandDocument(this.store.viewDocument);
    const scrollNodes = this.runtimeScroll.size ? indexTree(this.expanded.document.root).nodes : null;
    for (const [id, offset] of this.runtimeScroll) { const node = scrollNodes.get(id); if (node) node.layout.scrollOffset = offset; }
    this.layout = computeLayout(this.expanded.document, { width: this.previewSize.width, height: this.previewSize.height, measureText });
    this.paintScene();
    $('#artboard').style.width = `${this.layout.width}px`; $('#artboard').style.height = `${this.layout.height}px`;
    $('#node-count').textContent = `${this.layout.entries.size} 节点 · ${Object.keys(this.store.document.assets).length} SVG`;
    $('#render-time').textContent = `${(performance.now() - start).toFixed(1)} ms`;
  }
  paintScene() {
    const states = new Map(this.runtimeStates);
    if (!this.playing && this.forcedState !== 'normal') states.set(this.inheritedSelection?.renderId || this.store.selected, this.forcedState);
    this.renderer.render(this.expanded.document, this.layout, { states, motion: this.playing || this.forcedState !== 'normal' });
    this.stage.selection();
    const warnings = this.diagnostics(); $('#warning-count').textContent = warnings.length; $('#diagnostics').classList.toggle('has-warnings', !!warnings.length);
  }
  renderChrome() {
    $('#project-name').textContent = this.store.document.name;
    const prefab = this.store.document.prefabs[this.store.editingPrefabId];
    $('#breadcrumb').textContent = prefab ? `Prefabs / ${prefab.name}` : `Scenes / ${this.store.document.name}`;
    $('#canvas-label').textContent = this.store.editRoot.name; $('#exit-prefab').hidden = !prefab; $('#isolation-badge').hidden = !prefab;
    this.renderPreviewSize();
    $('#undo').disabled = !this.store.undoStack.length; $('#redo').disabled = !this.store.redoStack.length;
    this.library.render(); renderInspector(this); this.updateSaveStatus();
    $('#presentation-state').hidden = this.store.document.presentation?.controller !== 'rulestudio-battle-hud';
    const catalog=this.store.document.interfaceCatalog;
    if(catalog&&this.catalogSignature!==JSON.stringify(catalog)){
      const select=$('#presentation-state');select.replaceChildren();
      for(const entry of catalog){const option=document.createElement('option');option.value=entry.id;option.textContent=entry.title;select.append(option);}
      this.catalogSignature=JSON.stringify(catalog);
    }
    if(catalog){const screen=catalog.find(p=>p.prefabId===this.store.editingPrefabId);$('#presentation-state').value=screen?.id||'normal';}
  }
  renderPreviewSize() {
    $('#viewport-width').value = this.previewSize.width; $('#viewport-height').value = this.previewSize.height;
    const key = `${this.previewSize.width},${this.previewSize.height}`;
    $('#viewport-preset').value = [...$('#viewport-preset').options].some(option => option.value === key) ? key : 'custom';
  }
  setPreviewSize(width, height, { fit = true } = {}) {
    if (![width, height].every(value => Number.isFinite(value) && value >= 16 && value <= 16384)) {
      this.renderPreviewSize(); this.notify('屏幕尺寸必须为 16–16384', true); return false;
    }
    this.previewSize = { ...this.previewSize, width: Math.round(width), height: Math.round(height) };
    this.renderScene(); this.renderPreviewSize();
    if (fit) { this.stage.fit(); renderInspector(this); }
    return true;
  }
  diagnostics() { return [...(this.store.document.provenance?.warnings || []), ...(this.layout?.warnings || []), ...this.renderer.textWarnings]; }
  updateSaveStatus() { const target = $('#save-status'); target.innerHTML = '<i></i>'; target.append(document.createTextNode(this.saving ? '保存中…' : this.dirty ? '有未保存修改' : this.revision ? '已保存到本地' : '示例 / 未保存')); }
  selectRendered(id) {
    const origin = this.expanded.origins.get(id); if (!origin) return;
    this.inheritedSelection = origin.inherited ? { ...origin, renderId: id } : null;
    this.store.select(origin.inherited ? origin.instanceId : origin.sourceId);
  }
  patchSelection(patch, label = '修改属性') {
    try {
      if (this.inheritedSelection) {
        const { instanceId, path } = this.inheritedSelection;
        this.store.transaction('修改实例覆盖', () => { const instance = this.store.nodes.get(instanceId); instance.overrides[path] = merge(instance.overrides[path] || {}, patch); });
      } else this.store.patch(this.store.selected, patch, label);
    } catch (error) { this.notify(error.message, true); renderInspector(this); }
  }
  applyAnchor([name, minX, minY, maxX, maxY]) {
    const node = this.selectedNode(), entry = this.selectedEntry(), parent = this.layout.entries.get(entry.parentId);
    if (parent?.node.type !== 'CanvasPanel') return;
    const p = parent.node.layout.padding, slot = clone(node.slot);
    slot.anchors = { minX, minY, maxX, maxY }; slot.alignment = { x: minX === maxX ? minX : 0, y: minY === maxY ? minY : 0 };
    slot.offsets = slotForRect(slot, { x: entry.x - p.left, y: entry.y - p.top, width: entry.width, height: entry.height }, parent.width - p.left - p.right, parent.height - p.top - p.bottom);
    this.patchSelection({ slot }, `锚点：${name}`);
  }
  setDesignViewport(key, value) {
    try {
      this.store.transaction('修改设计画布', project => {
        if (this.store.editingPrefabId && ['width', 'height'].includes(key)) project.prefabs[this.store.editingPrefabId][key] = value;
        else if (!this.store.editingPrefabId) project.viewport[key] = value;
      });
      this.previewSize = { ...this.store.viewDocument.viewport }; this.renderScene(); this.renderChrome(); this.stage.fit();
    } catch (e) { this.notify(e.message, true); }
  }
  insertionParent() {
    let target = this.store.nodes.get(this.store.selected);
    while (target && !canAdd(target)) target = this.store.parents.get(target.id);
    return target || this.store.editRoot;
  }
  addNode(node) {
    const parent = this.insertionParent();
    if (!canAdd(parent)) return this.notify('当前容器不能再添加子控件', true);
    try {
      this.inheritedSelection = null;
      this.store.transaction('添加控件', project => {
        if (node.type === 'Button' && !node.children.length) {
          for (const [state, color, stroke] of [['normal', '#315a4c', '#75b99c'], ['hovered', '#467d65', '#a9e2c1'], ['pressed', '#254538', '#649e84'], ['disabled', '#2b343b', '#4f5e68']]) {
            const asset = makeSvgAsset(`Button / ${state}`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect x="1" y="1" width="94" height="94" rx="10" fill="${color}" stroke="${stroke}" stroke-width="2"/></svg>`, { scaleMode: 'nine-slice' });
            project.assets[asset.id] = asset; node.brushes[state] = asset.id;
          }
          node.slot.offsets.right = 200; node.slot.offsets.bottom = 48; node.layout.width = 200; node.layout.height = 48;
          node.children = [createNode('TextBlock', { name: `${node.name}_Label`, text: '按钮', style: { textAlign: 'center', textPadding: 12, textOverflow: 'shrink', wrap: false } })];
        }
        if (parent.type === 'CanvasPanel') {
          const entry = this.layout.entries.get(parent.id); node.slot.offsets.left = Math.max(16, Math.round((entry.width - node.slot.offsets.right) / 2)); node.slot.offsets.top = Math.max(16, Math.round((entry.height - node.slot.offsets.bottom) / 2));
        }
        parent.children.push(node); this.store.selected = node.id;
      });
      this.library.setTab('hierarchy');
    } catch (e) { this.notify(e.message, true); }
  }
  instantiate(prefabId) {
    const prefab = this.store.document.prefabs[prefabId];
    this.addNode(createNode('PrefabInstance', { name: `${prefab.name}_Instance`, prefabId, slot: { offsets: { left: 0, top: 0, right: prefab.width, bottom: prefab.height } }, layout: { width: prefab.width, height: prefab.height } }));
  }
  openPrefab(id) { this.inheritedSelection = null; this.setPlaying(false); this.store.editPrefab(id); }
  openInterface(id, preview = true) {
    const entry=this.store.document.interfaceCatalog?.find(p=>p.id===id);if(!entry)return;
    if(this.previewController)this.interfaceSession={hud:this.previewController.state,suite:this.previewController.suite?.state};
    this.interfaceSession?.hud.close();if(this.interfaceSession?.suite)this.interfaceSession.suite.overlays=[];
    this.openPrefab(['normal','boss','skills'].includes(id)?null:entry.prefabId);
    if(preview){this.setPlaying(true);if(id==='boss')this.previewController.state.phase='boss';if(id==='skills')this.previewController.state.open('skills');this.previewController.refresh();}
    $('#presentation-state').value=id;this.stage.fit();
    const url=new URL(location.href);url.searchParams.set('project',this.store.document.id);url.searchParams.set('interface',id);url.searchParams.delete('preview');url.searchParams.delete('focus');history.replaceState(null,'',url);
    this.setStatus(`${entry.title} · ${preview?'交互预览':'独立界面编辑'}`);
  }
  makePrefab() {
    const node = this.store.nodes.get(this.store.selected), entry = this.layout.entries.get(node.id), parent = this.store.parents.get(node.id);
    if (this.inheritedSelection) return this.notify('先选择一个源控件或实例根节点', true);
    if (!parent && this.store.editingPrefabId) return this.notify('当前已在预制体根部，选择内部控件创建嵌套预制体', true);
    try {
      this.store.transaction('创建界面预制体', project => {
        const instance = createPrefabFromNode(project, node, entry.width, entry.height);
        project.prefabs[instance.prefabId].folderId = this.library.currentFolder.prefabs;
        if (parent) parent.children.splice(parent.children.indexOf(node), 1, instance);
        else {
          instance.slot.anchors.maxX = instance.slot.anchors.maxY = 1; instance.slot.offsets = { left: 0, top: 0, right: 0, bottom: 0 };
          project.root = createNode('CanvasPanel', { name: 'SceneRoot', children: [instance] });
        }
        this.store.selected = instance.id;
      });
      this.notify('已创建预制体，原控件已替换为关联实例'); this.library.setTab('prefabs');
    } catch (e) { this.notify(e.message, true); }
  }
  detach() {
    const node = this.store.nodes.get(this.store.selected), parent = this.store.parents.get(node.id); if (!parent || node.type !== 'PrefabInstance') return;
    this.inheritedSelection = null;
    this.store.transaction('解除预制体关联', project => { parent.children.splice(parent.children.indexOf(node), 1, detachInstance(node, project)); });
  }
  revertOverrides(path = null) {
    const node = this.store.nodes.get(this.store.selected); if (node.type !== 'PrefabInstance') return;
    this.store.transaction('还原实例覆盖', () => { if (path) delete node.overrides[path]; else node.overrides = {}; });
  }
  applyOverrides() {
    const node = this.store.nodes.get(this.store.selected); if (node.type !== 'PrefabInstance') return;
    try { this.store.transaction('应用覆盖到预制体', project => applyInstanceOverrides(project, node)); this.notify('局部覆盖已应用到共享预制体'); }
    catch (e) { this.notify(e.message, true); }
  }
  duplicate() {
    if (this.inheritedSelection) return this.notify('继承节点请在预制体中编辑，或先解除实例关联', true);
    const node = this.store.nodes.get(this.store.selected), parent = this.store.parents.get(node.id); if (!parent || !canAdd(parent)) return this.notify('父容器不允许复制子控件', true);
    this.store.transaction('复制控件', () => { const copy = clone(node); walk(copy, n => { n.id = uid(); }); copy.name += '_Copy'; if (parent.type === 'CanvasPanel') { copy.slot.offsets.left += 24; copy.slot.offsets.top += 24; } parent.children.splice(parent.children.indexOf(node) + 1, 0, copy); this.store.selected = copy.id; });
  }
  deleteNode() {
    if (this.inheritedSelection) return this.notify('继承结构在预制体隔离模式中编辑', true);
    const node = this.store.nodes.get(this.store.selected), parent = this.store.parents.get(node.id); if (!parent) return;
    this.store.transaction('删除控件', () => { parent.children.splice(parent.children.indexOf(node), 1); this.store.selected = parent.id; });
  }
  reorder(delta) {
    if (this.inheritedSelection) return;
    const node = this.store.nodes.get(this.store.selected), parent = this.store.parents.get(node.id); if (!parent) return;
    const from = parent.children.indexOf(node), to = Math.max(0, Math.min(parent.children.length - 1, from + delta)); if (from === to) return;
    this.store.transaction('调整层级顺序', () => { parent.children.splice(from, 1); parent.children.splice(to, 0, node); });
  }
  reparent(sourceId, parentId) {
    const source = this.store.nodes.get(sourceId), parent = this.store.nodes.get(parentId), previous = this.store.parents.get(sourceId);
    if (!source || !parent || !previous || previous === parent) return;
    if (!canAdd(parent) || isAncestor(source, parent, this.store.parents)) return this.notify('此挂接不符合容器规则，或会产生循环', true);
    const rect = this.layout.entries.get(sourceId), target = this.layout.entries.get(parentId);
    this.store.transaction('重新挂接层级', () => {
      previous.children.splice(previous.children.indexOf(source), 1); parent.children.push(source);
      if (parent.type === 'CanvasPanel') {
        const p = parent.layout.padding; source.slot.offsets = slotForRect(source.slot, { x: (rect.globalX - target.globalX) / target.scale - p.left, y: (rect.globalY - target.globalY) / target.scale - p.top, width: rect.globalWidth / target.scale, height: rect.globalHeight / target.scale }, target.width - p.left - p.right, target.height - p.top - p.bottom);
      }
      this.inheritedSelection = null; this.store.selected = sourceId;
    });
  }
  async save() {
    if (this.saving) return;
    this.saving = true; this.updateSaveStatus(); const generation = this.store.generation, project = clone(this.store.document);
    try {
      const result = await saveProject(project, this.revision);
      if (this.store.document.id === project.id) {
        this.revision = result.revision; this.dirty = this.store.generation !== generation;
        localStorage.setItem('uialpha-last', project.id); localStorage.setItem('uialpha-recovery', JSON.stringify({ document: this.store.document, revision: this.revision, dirty: this.dirty }));
      }
      this.notify(`已保存 ${project.name} · revision ${result.revision}`);
    } catch (e) { this.notify(e.message, true); }
    finally { this.saving = false; this.updateSaveStatus(); }
  }
  replaceProject(document, revision = 0) {
    this.interfaceSession=null;
    const errors = validateDocument(document); if (errors.length) throw new Error(errors.slice(0, 5).join('\n'));
    if (this.dirty) try { localStorage.setItem('uialpha-recovery', JSON.stringify({ document: this.store.document, revision: this.revision, dirty: true })); } catch {}
    this.revision = revision; this.dirty = false; this.inheritedSelection = null; this.setPlaying(false); this.store.replace(document); this.library.resetFolded(); this.library.render();
  }
  openDemo() { this.replaceProject(starterProject()); }
  async restoreLast() {
    try {
      const id = new URLSearchParams(location.search).get('project') || localStorage.getItem('uialpha-last'); if (!id) { this.stage.fit(); return; }
      const record = await loadProject(id);
      if (!this.dirty) {
        this.replaceProject(record.document, record.revision);
        const params = new URLSearchParams(location.search), preview = params.get('preview');
        if(params.get('immersive')==='1'){$('#app').classList.add('expanded-preview');$('#focus-preview').textContent='收起';$('#focus-preview').classList.add('active');}
        if(params.get('interface')&&record.document.interfaceCatalog?.some(p=>p.id===params.get('interface'))){this.openInterface(params.get('interface'),params.get('mode')!=='design');this.library.setTab('screens');return;}
        if (record.document.presentation?.controller === 'rulestudio-battle-hud' && ['normal', 'skills', 'inventory', 'character', 'equipment', 'hunter', 'settings', 'completion', 'death'].includes(preview)) {
          this.setPlaying(true);
          if (preview !== 'normal') { this.previewController.state.open(preview); this.previewController.refresh(); }
          if (params.get('focus') === 'hotbar') {
            const entries = [...this.layout.entries.values()].filter(e => e.visible && (e.node.id.endsWith('rs-hotbar') || e.node.binding === 'picker'));
            if (entries.length) {
              const x = Math.min(...entries.map(e => e.globalX)), y = Math.min(...entries.map(e => e.globalY)), right = Math.max(...entries.map(e => e.globalX + e.globalWidth)), bottom = Math.max(...entries.map(e => e.globalY + e.globalHeight));
              this.stage.frameBounds({ x, y, width: right - x, height: bottom - y + 22 });
            }
          }
        }
      }
    } catch { this.stage.fit(); }
  }
  pickFile(accept, callback) {
    const input = $('#file-input'); input.accept = accept; input.value = '';
    input.onchange = async () => { if (input.files[0]) try { await callback(input.files[0]); } catch (e) { this.notify(e.message, true); } }; input.click();
  }
  async importFile(file) {
    const source = await file.text();
    if (/\.svg$/i.test(file.name)) { showAssetEditor(this, null, source, file.name.replace(/\.svg$/i, '')); return; }
    if (/\.html?$/i.test(file.name)) { await this.importHtmlSource(source, { name: file.name.replace(/\.html?$/i, '') }); return; }
    const result = importTree(JSON.parse(source));
    // Legacy SVG image data becomes first-class vector assets on import.
    walk(result.document.root, node => {
      if (/^data:image\/svg\+xml/i.test(node.src)) {
        try {
          const [header, data] = [node.src.slice(0, node.src.indexOf(',')), node.src.slice(node.src.indexOf(',') + 1)];
          const raw = /;base64/i.test(header) ? new TextDecoder().decode(Uint8Array.from(atob(data), c => c.charCodeAt(0))) : decodeURIComponent(data);
          const asset = makeSvgAsset(node.name, raw); result.document.assets[asset.id] = asset; node.svgAsset = asset.id; node.src = '';
        } catch (e) { result.warnings.push(`${node.name}: ${e.message}`); }
      }
    });
    this.replaceProject(result.document); $('#modal').close(); this.notify(`已导入 ${file.name}${result.warnings.length ? ` · ${result.warnings.length} 项提示` : ''}`);
  }
  async importHtmlSource(source, options = {}) { const result = await importHtml(source, options); this.replaceProject(result.document); this.notify(`HTML 已转换为 ${this.layout.entries.size} 个 SVG 控件 · ${result.warnings.length} 项导入说明`); }
  editAsset(id) { showAssetEditor(this, id); }
  setPlaying(value) {
    this.previewController?.destroy(); this.previewController = null;
    if (this.previewRuntime) { this.previewRuntime.destroy(); this.previewRuntime = null; this.renderer = new SvgRenderer($('#scene')); }
    this.playing = value; this.runtimeStates.clear(); this.runtimeScroll.clear(); this.forcedState = 'normal';
    $('#play').classList.toggle('active', value); $('#play').textContent = value ? '■ 停止' : '▷ 预览'; $('#preview-banner').hidden = !value;
    if (value) {
      this.previewRuntime = new UIRuntime($('#scene'), this.store.viewDocument, { width: this.previewSize.width, height: this.previewSize.height, audioPlayer: this.audioPlayer });
      this.previewRuntime.addEventListener('navigate',e=>queueMicrotask(()=>this.openInterface(e.detail.id)));
      this.previewRuntime.addEventListener('activate', e => { if (!e.detail.node.action) this.setStatus(`触发按钮：${e.detail.node.name}`); });
      this.previewController = attachPresentation(this.previewRuntime, { onStatus: text => this.setStatus(text), onRender: () => this.syncRuntime(), session:this.interfaceSession });
      this.syncRuntime();
    } else if (this.layout) this.renderScene();
    renderInspector(this);
  }
  syncRuntime() {
    if (!this.previewRuntime) return;
    this.expanded = this.previewRuntime.expanded; this.layout = this.previewRuntime.layout;
    $('#artboard').style.width = `${this.layout.width}px`; $('#artboard').style.height = `${this.layout.height}px`;
    $('#node-count').textContent = `${this.layout.entries.size} 节点 · 预览`;
    this.stage.selection();
  }
  bind() {
    $('#focus-preview').onclick=()=>{const expanded=$('#app').classList.toggle('expanded-preview');$('#focus-preview').textContent=expanded?'收起':'展开';$('#focus-preview').classList.toggle('active',expanded);this.stage.fit();};
    $('#save').onclick = () => this.save(); $('#project-menu').onclick = () => showProjects(this); $('#help').onclick = showHelp; $('#import').onclick = () => showImport(this); $('#export').onclick = () => showExport(this); $('#diagnostics').onclick = () => showDiagnostics(this);
    $('#undo').onclick = () => { this.inheritedSelection = null; this.store.undo(); }; $('#redo').onclick = () => { this.inheritedSelection = null; this.store.redo(); };
    $('#exit-prefab').onclick = () => this.openPrefab(null); $('#play').onclick = () => this.setPlaying(!this.playing); $('#stop-preview').onclick = () => this.setPlaying(false);
    $('#presentation-state').onchange = e => {
      if(this.store.document.interfaceCatalog){this.openInterface(e.target.value);return;}
      if (!this.playing) this.setPlaying(true);
      const controller = this.previewController; if (!controller) return;
      controller.state.close(); controller.state.phase = e.target.value === 'boss' ? 'boss' : 'waves';
      if (!['normal', 'boss'].includes(e.target.value)) controller.state.open(e.target.value);
      controller.refresh(); this.stage.fit();
    };
    const viewport = () => {
      this.setPreviewSize(Number($('#viewport-width').value), Number($('#viewport-height').value));
    };
    $('#reset-screen').onclick = () => { const size = this.store.viewDocument.viewport; this.setPreviewSize(size.width, size.height); this.setStatus('屏幕预览已恢复工程设计尺寸'); };
    $('#viewport-width').onchange = viewport; $('#viewport-height').onchange = viewport;
    $('#viewport-preset').onchange = e => { if (e.target.value === 'custom') return; const [w, h] = e.target.value.split(','); $('#viewport-width').value = w; $('#viewport-height').value = h; viewport(); };
    document.addEventListener('keydown', e => this.keydown(e));
    document.addEventListener('keyup', e => {
      if (e.code === 'Space') { this.stage.space = false; this.stage.setHand(this.stage.hand); }
      if (this.playing && !this.previewRuntime && ['Enter', ' '].includes(e.key)) { const id = this.stage.buttonAt(e.target); if (id) { this.runtimeStates.set(id, 'hovered'); this.renderScene(); } }
    });
    window.addEventListener('blur', () => { this.stage.space = false; this.stage.cancel(); this.stage.setHand(this.stage.hand); if (this.playing && !this.previewRuntime) { this.runtimeStates.clear(); this.renderScene(); } });
    window.addEventListener('beforeunload', e => { if (this.dirty) { e.preventDefault(); e.returnValue = ''; } });
    $('#viewport').addEventListener('dragover', e => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); });
    $('#viewport').addEventListener('drop', async e => { if (!e.dataTransfer.files.length) return; e.preventDefault(); try { await this.importFile(e.dataTransfer.files[0]); } catch (error) { this.notify(error.message, true); } });
  }
  keydown(e) {
    if (e.defaultPrevented) return;
    if ($('#modal').open) return;
    const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName);
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key.toLowerCase() === 's') { e.preventDefault(); this.save(); return; }
    if (editing) return;
    if (e.key === 'Escape') { const screen = this.stage.screenTool || this.stage.isScreenGesture(); this.stage.cancel(); if (screen) { e.preventDefault(); return; } if (this.playing) this.setPlaying(false); else if (this.store.editingPrefabId) this.openPrefab(null); return; }
    if (this.playing) {
      if (this.previewRuntime) return;
      if (['Enter', ' '].includes(e.key)) { const id = this.stage.buttonAt(e.target); if (id) { e.preventDefault(); this.runtimeStates.set(id, 'pressed'); this.renderScene(); this.setStatus(`触发按钮：${this.layout.entries.get(id).node.name}`); } } return;
    }
    if (ctrl && e.key.toLowerCase() === 'z') { e.preventDefault(); this.inheritedSelection = null; if (e.shiftKey) this.store.redo(); else this.store.undo(); }
    else if (ctrl && e.key.toLowerCase() === 'y') { e.preventDefault(); this.store.redo(); }
    else if (ctrl && e.key.toLowerCase() === 'd') { e.preventDefault(); this.duplicate(); }
    else if (e.code === 'Space') { e.preventDefault(); this.stage.space = true; this.stage.setHand(this.stage.hand); }
    else if (e.key.toLowerCase() === 'h') this.stage.setHand(true);
    else if (e.key.toLowerCase() === 'v') this.stage.setHand(false);
    else if (e.key.toLowerCase() === 'f') this.stage.fit();
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); this.deleteNode(); }
    else if (e.key === '?') showHelp();
    else if (e.key === '/') { e.preventDefault(); $('#library-search').focus(); }
    else if (e.key.startsWith('Arrow') && !this.inheritedSelection && this.selectedParent()?.type === 'CanvasPanel') {
      e.preventDefault(); const node = this.selectedNode(), d = e.shiftKey ? 10 : 1; if (node.locked) return;
      const offsets = { ...node.slot.offsets };
      if (e.key === 'ArrowLeft') offsets.left -= d; if (e.key === 'ArrowRight') offsets.left += d; if (e.key === 'ArrowUp') offsets.top -= d; if (e.key === 'ArrowDown') offsets.top += d;
      if (node.slot.anchors.minX !== node.slot.anchors.maxX) offsets.right += node.slot.offsets.left - offsets.left;
      if (node.slot.anchors.minY !== node.slot.anchors.maxY) offsets.bottom += node.slot.offsets.top - offsets.top;
      this.patchSelection({ slot: { offsets } }, '微调位置');
    }
  }
}

try { new Editor(); } catch (error) { toast(`初始化失败：${error.message}`, true); console.error(error); }

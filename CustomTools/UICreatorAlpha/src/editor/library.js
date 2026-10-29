import { $, $$, escapeHtml as esc, modal, toast, selectField } from './dom.js';
import { TYPES, createNode, walk } from '../core/model.js';
import { svgElement, scopedSvgContent, assetGraphic } from '../assets/svg.js';
import { expandDocument } from '../core/prefabs.js';
import { computeLayout } from '../core/layout.js';
import { SvgRenderer, measureText } from '../render/svg-renderer.js';
import { folderPath, folderOptions, createFolder, deleteEmptyFolder } from '../core/folders.js';
import { showMotionEditor } from './motion-editor.js';
import { showSoundEditor, importSounds } from './sound-editor.js';
import { AUDIO_EVENTS } from '../core/audio.js';
const folderTab = kind => ({ svg: 'assets', prefab: 'prefabs', motion: 'motions', sound: 'sounds' })[kind];
const folderRecords = (project, kind) => project[folderTab(kind)];

export class Library {
  constructor(app) {
    this.app = app; this.tab = 'hierarchy'; this.folded = new Set(); this.query = ''; this.currentFolder = { assets: '', prefabs: '', motions: '', sounds: '' }; this.resetFolded();
    $$('.panel-tabs button').forEach(button => { button.onclick = () => this.setTab(button.dataset.tab); });
    $('#library-search').oninput = e => { this.query = e.target.value.trim().toLowerCase(); this.render(); };
    $('#add-node').onclick = () => this.showPalette();
    $('#new-asset').onclick = () => app.editAsset(); $('#create-prefab').onclick = () => app.makePrefab();
    $('#new-svg-folder').onclick = () => this.editFolder(null, 'svg'); $('#new-prefab-folder').onclick = () => this.editFolder(null, 'prefab');
    $('#new-motion').onclick = () => showMotionEditor(app); $('#new-motion-folder').onclick = () => this.editFolder(null, 'motion');
    $('#new-sound-folder').onclick = () => this.editFolder(null, 'sound'); $('#new-sound').onclick = () => $('#sound-file-input').click();
    $('#sound-file-input').onchange = async e => { await importSounds(app, [...e.target.files]); e.target.value = ''; };
    $('#tree').addEventListener('click', e => {
      const row = e.target.closest('[data-render-id]'); if (!row) return;
      if (e.target.closest('[data-fold]')) {
        const id = row.dataset.renderId; if (this.folded.has(id)) this.folded.delete(id); else this.folded.add(id); this.renderTree(); return;
      }
      this.app.selectRendered(row.dataset.renderId);
      if (e.target.closest('[data-visibility]') && !row.classList.contains('inherited')) {
        const node = app.selectedNode(); app.patchSelection({ visibility: node.visibility === 'visible' ? 'hidden' : 'visible' });
      }
    });
    $('#tree').addEventListener('dblclick', e => { const row = e.target.closest('[data-render-id]'); const node = app.layout.entries.get(row?.dataset.renderId)?.node; if (node?.type === 'PrefabInstance') app.openPrefab(node.prefabId); });
    $('#tree').addEventListener('dragstart', e => {
      const row = e.target.closest('[data-render-id]');
      if (!row || row.classList.contains('inherited')) { e.preventDefault(); return; }
      e.dataTransfer.setData('application/uialpha-node', row.dataset.renderId); e.dataTransfer.effectAllowed = 'move';
    });
    $('#tree').addEventListener('dragover', e => { if (e.dataTransfer.types.includes('application/uialpha-node')) { e.preventDefault(); e.target.closest('.tree-row')?.classList.add('drag-over'); } });
    $('#tree').addEventListener('dragleave', e => e.target.closest('.tree-row')?.classList.remove('drag-over'));
    $('#tree').addEventListener('drop', e => {
      e.preventDefault(); $$('.tree-row.drag-over').forEach(el => el.classList.remove('drag-over'));
      const row = e.target.closest('[data-render-id]'); if (!row || row.classList.contains('inherited')) return;
      app.reparent(e.dataTransfer.getData('application/uialpha-node'), row.dataset.renderId);
    });
  }
  resetFolded() { this.folded.clear(); walk(this.app.store.editRoot, node => { if (node.type === 'PrefabInstance') this.folded.add(node.id); }); }
  setTab(tab) {
    this.tab = tab; this.query = ''; $('#library-search').value = '';
    $$('.panel-tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    for (const key of ['hierarchy', 'assets', 'prefabs', 'screens', 'motions', 'sounds']) $(`#${key}-panel`).hidden = key !== tab;
    $('#context-label').textContent = tab === 'hierarchy' ? '界面层级' : tab === 'assets' ? '共享矢量资产' : '界面与控件预制体';
    $('#library-search').placeholder = tab === 'hierarchy' ? '搜索层级…' : tab === 'assets' ? '搜索 SVG 资产…' : '搜索预制体…';
    if (tab === 'motions') { $('#context-label').textContent = '共享动效资产'; $('#library-search').placeholder = '搜索动效…'; }
    if (tab === 'sounds') { $('#context-label').textContent = '共享 UI 音效'; $('#library-search').placeholder = '搜索音效…'; }
    this.render();
  }
  render() { if (this.tab === 'hierarchy') this.renderTree(); else if (this.tab === 'assets') this.renderAssets(); else if (this.tab === 'sounds') this.renderSounds(); else if (this.tab === 'motions') this.renderMotions(); else if(this.tab==='screens')this.renderScreens();else this.renderPrefabs(); }
  renderSounds() {
    this.renderFolders('sound', $('#sound-folders')); const assets = Object.values(this.app.store.document.sounds || {}), list = $('#sound-list'); list.replaceChildren();
    const current = assets.filter(a => this.query ? a.name.toLowerCase().includes(this.query) : (a.folderId || '') === this.currentFolder.sounds);
    $('#sound-count').textContent = `${assets.length} 个音效 · 当前 ${current.length}`;
    for (const asset of current) {
      const card = document.createElement('div'); card.className = 'sound-card'; card.innerHTML = `<div class="sound-card-title"><strong>♪ ${esc(asset.name)}</strong><small>${Math.round(asset.duration * 1000)} ms · WAV</small></div><div class="sound-card-actions"><button data-audition>试听</button><button data-edit-sound>编辑</button><select aria-label="应用音效事件">${Object.entries(AUDIO_EVENTS).map(([key, name]) => `<option value="${key}" ${key === 'clicked' ? 'selected' : ''}>${name}</option>`).join('')}</select><button data-apply-sound>应用</button></div>`;
      card.querySelector('[data-edit-sound]').onclick = () => showSoundEditor(this.app, asset.id);
      card.querySelector('[data-audition]').onclick = async () => { await this.app.audioPlayer.unlock(); await this.app.audioPlayer.play({ type: 'Button', audio: { enabled: true, volume: 1, pitch: 1, events: { preview: asset.id } } }, 'preview', this.app.store.document.sounds); };
      card.querySelector('[data-apply-sound]').onclick = () => { const event = card.querySelector('select').value; this.app.patchSelection({ audio: { enabled: true, events: { [event]: asset.id } } }); this.app.notify(`已绑定 ${AUDIO_EVENTS[event]} → ${asset.name}`); };
      this.draggable(card, { kind: 'sound', id: asset.id }); list.append(card);
    }
  }
  renderMotions() {
    this.renderFolders('motion', $('#motion-folders')); const assets = Object.values(this.app.store.document.motions || {});
    const current = assets.filter(a => this.query ? a.name.toLowerCase().includes(this.query) : (a.folderId || '') === this.currentFolder.motions);
    $('#motion-count').textContent = `${assets.length} 个动效 · 当前 ${current.length}`; const list = $('#motion-list'); list.replaceChildren();
    for (const asset of current) {
      const card = document.createElement('div'); card.className = 'prefab-card';
      card.innerHTML = `<div class="prefab-meta"><div><strong>◈ ${esc(asset.name)}</strong><small>${Object.keys(asset.clips).length} 个时间轴片段 · UE 通用动效</small></div><button data-edit-motion>编辑</button><button data-apply-motion>应用</button></div>`;
      card.querySelector('[data-edit-motion]').onclick = () => showMotionEditor(this.app, asset.id);
      card.querySelector('[data-apply-motion]').onclick = () => { this.app.patchSelection({ motion: { preset: 'auto', assetId: asset.id } }); this.app.notify(`已引用动效：${asset.name}`); };
      this.draggable(card, { kind: 'motion', id: asset.id }); list.append(card);
    }
  }
  renderScreens(){
    const list=$('#screen-list');list.replaceChildren();const all=this.app.store.document.interfaceCatalog||[];
    $('#screen-count').textContent=`${all.length} 个界面 · 独立编辑 / 交互预览`;
    for(const group of [...new Set(all.map(p=>p.group))]){
      const entries=all.filter(p=>p.group===group&&(!this.query||`${p.title} ${p.id}`.toLowerCase().includes(this.query)));if(!entries.length)continue;
      const heading=document.createElement('div');heading.className='screen-group';heading.textContent=group;list.append(heading);
      for(const entry of entries){const card=document.createElement('div');card.className='screen-card';const label=document.createElement('button');label.className='screen-open';label.textContent=entry.title;label.title=`${entry.source} · 点击预览`;label.onclick=()=>this.app.openInterface(entry.id);const edit=document.createElement('button');edit.className='text-button';edit.textContent='编辑';edit.setAttribute('aria-label',`编辑界面 ${entry.title}`);edit.onclick=()=>this.app.openInterface(entry.id,false);card.append(label,edit);list.append(card);}
    }
    $('#context-label').textContent='界面目录';$('#library-search').placeholder='搜索界面…';
  }
  renderTree() {
    const app = this.app, selected = app.inheritedSelection?.renderId || app.store.selected;
    const render = (node, depth = 0) => {
      const origin = app.expanded.origins.get(node.id), inherited = !!origin?.inherited;
      const matches = !this.query || node.name.toLowerCase().includes(this.query) || node.type.toLowerCase().includes(this.query);
      const children = node.children.map(c => render(c, depth + 1)).join('');
      if (!matches && !children) return '';
      const folded = this.folded.has(node.id) && !this.query;
      return `<div role="treeitem" aria-selected="${node.id === selected}" ${node.children.length ? `aria-expanded="${!folded}"` : ''}><div class="tree-row ${node.type === 'PrefabInstance' ? 'instance' : ''} ${inherited ? 'inherited' : ''} ${node.id === selected ? 'selected' : ''} ${node.visibility !== 'visible' ? 'dim' : ''}" data-render-id="${esc(node.id)}" draggable="${!inherited && node.id !== app.store.editRoot.id}" style="padding-left:${10 + depth * 13}px" title="${esc(node.type + ' / ' + node.name)}"><button class="tree-chevron" data-fold>${node.children.length ? folded ? '▸' : '▾' : ''}</button><span class="tree-icon">${TYPES[node.type]?.[1] || '□'}</span><span class="tree-name">${esc(node.name)}</span>${inherited ? '<span style="font-size:9px">↗</span>' : '<button class="tree-visibility" data-visibility title="切换可见">◉</button>'}</div>${!folded || this.query ? children : ''}</div>`;
    };
    const target = $('#tree'), scroll = target.parentElement.scrollTop;
    target.innerHTML = render(app.expanded.document.root); target.parentElement.scrollTop = scroll;
  }
  renderAssets() {
    this.renderFolders('svg', $('#asset-folders'));
    const assets = Object.values(this.app.store.document.assets).filter(a => this.query ? a.name.toLowerCase().includes(this.query) : (a.folderId || '') === this.currentFolder.assets);
    $('#asset-count').textContent = `${Object.keys(this.app.store.document.assets).length} 个 SVG · 当前 ${assets.length}`;
    const list = $('#asset-list'); list.replaceChildren();
    for (const asset of assets) {
      const card = document.createElement('button'); card.className = 'asset-card'; card.title = `${asset.name} · 点击编辑`;
      card.innerHTML = `<div class="asset-thumb"></div><strong>${esc(asset.name)}</strong><small>${asset.scaleMode === 'nine-slice' ? '9 Slice' : asset.scaleMode} · ${asset.viewBox[2]} × ${asset.viewBox[3]}</small>`;
      try {
        const svg = svgElement('svg', { viewBox: '0 0 110 60', width: 110, height: 60 }), defs = svgElement('defs'); defs.append(scopedSvgContent(asset, 'library_').group); svg.append(defs, assetGraphic(asset, 110, 60, 'library_')); card.querySelector('.asset-thumb').append(svg);
      } catch { card.querySelector('.asset-thumb').textContent = 'SVG 无效'; }
      card.onclick = () => this.app.editAsset(asset.id); this.draggable(card, { kind: 'svg', id: asset.id }); list.append(card);
    }
  }
  renderPrefabs() {
    this.renderFolders('prefab', $('#prefab-folders'));
    const app = this.app, prefabs = Object.values(app.store.document.prefabs).filter(p => this.query ? p.name.toLowerCase().includes(this.query) : (p.folderId || '') === this.currentFolder.prefabs);
    $('#prefab-count').textContent = `${Object.keys(app.store.document.prefabs).length} 个预制体 · 当前 ${prefabs.length}`;
    const list = $('#prefab-list'); list.replaceChildren();
    for (const prefab of prefabs) {
      const card = document.createElement('div'); card.className = 'prefab-card';
      card.innerHTML = `<div class="prefab-thumb" title="插入实例"><svg></svg></div><div class="prefab-meta"><div><strong>⬡ ${esc(prefab.name)}</strong><small>${Math.round(prefab.width)} × ${Math.round(prefab.height)} · 嵌套可复用</small></div><button data-edit>编辑 ↗</button><button data-options title="重命名 / 移动 / 删除">⋯</button></div>`;
      const svg = card.querySelector('svg');
      try {
        const project = { ...app.store.document, root: prefab.root, viewport: { width: prefab.width, height: prefab.height, background: 'transparent' } };
        const expanded = expandDocument(project).document, layout = computeLayout(expanded, { measureText });
        new SvgRenderer(svg).render(expanded, layout); svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      } catch (e) { card.querySelector('.prefab-thumb').textContent = e.message; }
      card.querySelector('.prefab-thumb').onclick = () => app.instantiate(prefab.id);
      card.querySelector('[data-edit]').onclick = () => app.openPrefab(prefab.id); card.querySelector('[data-options]').onclick = () => this.editPrefabMetadata(prefab.id); this.draggable(card, { kind: 'prefab', id: prefab.id }); list.append(card);
    }
  }
  renderFolders(kind, host) {
    const project = this.app.store.document, tab = folderTab(kind), folders = project.folders || {};
    let current = this.currentFolder[tab]; if (current && !folders[current]) current = this.currentFolder[tab] = '';
    const crumbs = []; for (let id = current; id && folders[id]; id = folders[id].parentId) crumbs.unshift(folders[id]);
    const children = Object.values(folders).filter(f => f.kind === kind && (this.query ? f.name.toLowerCase().includes(this.query) : (f.parentId || '') === current));
    host.innerHTML = `<div class="folder-breadcrumb"><button data-folder-nav="" title="根目录 · 可拖入资源">${kind === 'svg' ? 'SVG' : kind === 'motion' ? '动效' : kind === 'sound' ? '音效' : 'Prefabs'}</button>${crumbs.map(f => `<span>›</span><button data-folder-nav="${f.id}">${esc(f.name)}</button>`).join('')}${this.query ? '<span>· 搜索全部</span>' : ''}</div>${children.map(f => `<div class="folder-row" data-folder="${f.id}"><span class="folder-icon">▱</span><span class="folder-name">${esc(f.name)}</span><button data-folder-edit="${f.id}" title="重命名 / 移动文件夹">⋯</button><span class="folder-arrow">›</span></div>`).join('')}`;
    for (const button of host.querySelectorAll('[data-folder-nav]')) { button.onclick = () => { this.currentFolder[tab] = button.dataset.folderNav; this.query = ''; $('#library-search').value = ''; this.render(); }; this.dropTarget(button, kind, button.dataset.folderNav); }
    for (const row of host.querySelectorAll('[data-folder]')) {
      row.onclick = e => { if (e.target.closest('[data-folder-edit]')) return; this.currentFolder[tab] = row.dataset.folder; this.query = ''; $('#library-search').value = ''; this.render(); };
      this.draggable(row, { kind: 'folder', id: row.dataset.folder }); this.dropTarget(row, kind, row.dataset.folder);
    }
    for (const button of host.querySelectorAll('[data-folder-edit]')) button.onclick = e => { e.stopPropagation(); this.editFolder(button.dataset.folderEdit, kind); };
  }
  draggable(element, item) {
    element.draggable = true; element.addEventListener('dragstart', e => { e.stopPropagation(); e.dataTransfer.setData('application/uialpha-library', JSON.stringify(item)); e.dataTransfer.effectAllowed = 'move'; });
  }
  dropTarget(element, kind, folderId) {
    element.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('application/uialpha-library')) { e.preventDefault(); e.stopPropagation(); element.classList.add('drag-over'); } });
    element.addEventListener('dragleave', () => element.classList.remove('drag-over'));
    element.addEventListener('drop', e => {
      element.classList.remove('drag-over'); const data = e.dataTransfer.getData('application/uialpha-library'); if (!data) return; e.preventDefault(); e.stopPropagation();
      try {
        const item = JSON.parse(data), project = this.app.store.document;
        if (item.kind === 'folder') {
          if (project.folders[item.id]?.kind !== kind) throw new Error('各类资产使用各自的分类目录');
          this.app.store.transaction('移动文件夹', () => { project.folders[item.id].parentId = folderId; });
        } else {
          if (item.kind !== kind) throw new Error('资源类型与文件夹不匹配');
          this.app.store.transaction('移动资源到文件夹', () => { folderRecords(project, kind)[item.id].folderId = folderId; });
        }
        this.app.notify('已归类，资源 ID 与引用保持稳定');
      } catch (error) { this.app.notify(error.message, true); }
    });
  }
  editFolder(id, kind) {
    const project = this.app.store.document, folder = project.folders?.[id], tab = folderTab(kind);
    modal(folder ? '编辑文件夹' : `新建${kind === 'svg' ? ' SVG ' : kind === 'motion' ? '动效' : kind === 'sound' ? '音效' : '预制体'}文件夹`, `<p class="modal-description">文件夹支持多级嵌套。移动或重命名只修改组织信息，不改变资源 ID。</p><div class="field"><label>名称</label><input id="folder-name" value="${esc(folder?.name || '')}" placeholder="例如：按钮 / 面板 / 图标"></div>${selectField('父文件夹', folder?.parentId || this.currentFolder[tab], '_parent', folderOptions(project, kind, id))}`, `${folder ? '<button id="folder-delete" class="quiet">删除空文件夹</button>' : ''}<button data-close class="quiet">取消</button><button id="folder-save" class="primary">${folder ? '保存' : '创建文件夹'}</button>`);
    $('#folder-save').onclick = () => {
      const name = $('#folder-name').value.trim(), parentId = $('#modal [data-field="_parent"]').value;
      try {
        this.app.store.transaction(folder ? '编辑文件夹' : '创建文件夹', doc => {
          if (!folder) createFolder(doc, name, kind, parentId);
          else {
            if (!name || name.length > 100 || /[\\/]/.test(name)) throw new Error('请输入有效文件夹名称');
            if (Object.values(doc.folders).some(f => f.id !== id && f.kind === kind && f.parentId === parentId && f.name === name)) throw new Error('此位置已有同名文件夹');
            doc.folders[id].name = name; doc.folders[id].parentId = parentId;
          }
        });
        $('#modal').close(); this.app.notify(folder ? '文件夹已保存' : '文件夹已创建');
      } catch (error) { toast(error.message, true); }
    };
    if (folder) $('#folder-delete').onclick = () => { try { this.app.store.transaction('删除空文件夹', doc => deleteEmptyFolder(doc, id)); $('#modal').close(); } catch (e) { toast(e.message, true); } };
  }
  editPrefabMetadata(id) {
    const project = this.app.store.document, prefab = project.prefabs[id];
    modal('预制体属性与分类', `<div class="field"><label>名称</label><input id="prefab-name" value="${esc(prefab.name)}"></div>${selectField('文件夹', prefab.folderId || '', '_folder', folderOptions(project, 'prefab'))}<p class="property-hint">所有界面实例通过 ID 引用此预制体。改名或归类不会断开关联。</p>`, '<button id="prefab-delete" class="quiet">删除未引用预制体</button><button data-close class="quiet">取消</button><button id="prefab-meta-save" class="primary">保存</button>');
    $('#prefab-meta-save').onclick = () => { const name = $('#prefab-name').value.trim(); if (!name) return toast('请输入预制体名称', true); this.app.store.transaction('修改预制体属性', () => { prefab.name = name; prefab.folderId = $('#modal [data-field="_folder"]').value; }); $('#modal').close(); };
    $('#prefab-delete').onclick = () => {
      let references = 0; const check = root => walk(root, n => { if (n.prefabId === id) references++; }); check(project.root); Object.values(project.prefabs).forEach(p => { if (p.id !== id) check(p.root); });
      references+=(project.interfaceCatalog||[]).filter(p=>p.prefabId===id).length;
      if (references || this.app.store.editingPrefabId === id) return toast(`预制体被 ${references} 处实例引用或正在编辑，请先解除关联`, true);
      this.app.store.transaction('删除预制体', () => { delete project.prefabs[id]; }); $('#modal').close();
    };
  }
  showPalette() {
    const app = this.app;
    modal('添加通用控件', `<p class="modal-description">添加到当前选择的可用容器。布局由父级面板及子控件 Slot 决定。</p><div class="import-options">${Object.entries(TYPES).filter(([type]) => type !== 'PrefabInstance').map(([type, [name, icon]]) => `<button class="option-card" style="min-height:100px;padding:14px" data-add-type="${type}"><span class="option-icon" style="margin-bottom:10px">${icon}</span><strong>${name}</strong><p>${type}</p></button>`).join('')}</div>`);
    $('#modal').querySelectorAll('[data-add-type]').forEach(button => { button.onclick = () => { app.addNode(createNode(button.dataset.addType)); $('#modal').close(); }; });
  }
}

import { $, escapeHtml as esc, modal, toast, field, selectField, numberField } from './dom.js';
import { makeSvgAsset, parseSvg, scopedSvgContent, svgElement, assetGraphic } from '../assets/svg.js';
import { allReferences, exportWbpContract } from '../io/adapters.js';
import { listProjects, loadProject, download } from '../io/project.js';
import { createDocument, clone, walk, createNode } from '../core/model.js';
import { folderOptions } from '../core/folders.js';

export function showAssetEditor(app, id, suppliedSource = null, suppliedName = 'New SVG') {
  const original = app.store.document.assets[id];
  const fallback = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">\n  <rect x="1" y="1" width="94" height="94" rx="12" fill="#243c39" stroke="#8ed4b5" stroke-width="2"/>\n</svg>';
  let draft = original ? clone(original) : makeSvgAsset(suppliedName, suppliedSource || fallback, { scaleMode: 'nine-slice', folderId: app.library.currentFolder.assets });
  const users = original ? allReferences(app.store.document, original.id) : [];
  modal(original ? '编辑 SVG 资产' : '创建 SVG 资产', `<div class="asset-editor"><div><div class="field"><label>资产名称</label><input id="asset-name" value="${esc(draft.name)}"></div><textarea id="asset-source" spellcheck="false" aria-label="SVG 源码">${esc(draft.source)}</textarea><div id="asset-message" class="asset-message"></div></div><div><p class="modal-description">矢量资产是共享的绘制定义。控件引用资产 ID，位置、大小和交互属于控件。</p>${selectField('文件夹', draft.folderId || '', '_folder', folderOptions(app.store.document, 'svg'))}<div id="asset-preview" class="asset-preview"></div><div class="field"><label>缩放策略</label><select id="asset-scale"><option value="stretch">Stretch · 拉伸</option><option value="contain">Contain · 等比</option><option value="nine-slice">9 Slice · 固定边角</option></select></div><div class="field-grid">${['left', 'top', 'right', 'bottom'].map((key, i) => numberField(['左', '上', '右', '下'][i], draft.slice[key], `slice.${key}`, 'min="0"')).join('')}</div><p class="property-hint">九宫格边距使用 SVG viewBox 单位。预览按 300 × 150 绘制。</p><p class="property-hint">引用 ${users.length} 处${users.length ? '<br>' + users.slice(0, 5).map(esc).join('<br>') : ''}</p></div></div>`, `<span class="muted">支持原生 paths、渐变、蒙版与矢量滤镜</span>${original ? '<button id="asset-delete" class="quiet">删除</button><button id="asset-download" class="quiet">导出 SVG</button>' : ''}<button data-close class="quiet">取消</button><button id="asset-save" class="primary">保存资产</button>`);
  $('#asset-scale').value = draft.scaleMode;
  let valid = true, timer;
  const refresh = () => {
    try {
      const parsed = parseSvg($('#asset-source').value);
      draft.source = parsed.source; draft.viewBox = parsed.viewBox; draft.name = $('#asset-name').value.trim() || 'SVG'; draft.scaleMode = $('#asset-scale').value;
      for (const input of $('#modal').querySelectorAll('[data-field^="slice."]')) draft.slice[input.dataset.field.split('.')[1]] = Number(input.value);
      draft.folderId = $('#modal [data-field="_folder"]').value;
      const preview = svgElement('svg', { viewBox: '0 0 300 150', width: 300, height: 150 });
      const defs = svgElement('defs'); defs.append(scopedSvgContent(draft, 'asset_preview_').group); preview.append(defs, assetGraphic(draft, 300, 150, 'asset_preview_'));
      $('#asset-preview').replaceChildren(preview); $('#asset-message').textContent = `${parsed.viewBox[2]} × ${parsed.viewBox[3]} · ${parsed.removed ? `已移除 ${parsed.removed} 个不支持 / 可执行属性或元素` : 'SVG 有效 · 原生矢量渲染'}`;
      $('#asset-message').classList.remove('error'); valid = true;
    } catch (error) { $('#asset-message').textContent = error.message; $('#asset-message').classList.add('error'); valid = false; }
    $('#asset-save').disabled = !valid;
  };
  for (const input of $('#modal').querySelectorAll('input,select,textarea')) input.oninput = () => { clearTimeout(timer); timer = setTimeout(refresh, 180); };
  refresh();
  $('#asset-save').onclick = () => {
    clearTimeout(timer); refresh(); if (!valid) return;
    app.store.transaction('保存 SVG 资产', project => { project.assets[draft.id] = clone(draft); }); $('#modal').close(); toast('SVG 资产已保存，所有引用已同步');
  };
  if (original) {
    $('#asset-download').onclick = () => download(`${draft.name.replaceAll('/', '-')}.svg`, draft.source, 'image/svg+xml');
    $('#asset-delete').onclick = () => {
      if (users.length) return toast(`仍被 ${users.length} 处控件引用，请先解除引用`, true);
      app.store.transaction('删除 SVG 资产', project => { delete project.assets[original.id]; }); $('#modal').close();
    };
  }
}

export function showImport(app) {
  modal('导入到 UI 工程', `<p class="modal-description">SVG 导入为共享核心资产；HTML 和控件树导入为可编辑的新工程。</p><div class="import-options"><button class="option-card" id="import-svg"><span class="option-icon">◇</span><strong>SVG 资产</strong><p>导入矢量源文件，配置缩放与九宫格，供按钮四态或任意控件复用。</p></button><button class="option-card" id="import-html"><span class="option-icon">&lt;/&gt;</span><strong>HTML → SVG</strong><p>测量内联 HTML / CSS，转换为独立控件树及 SVG 绘制。保留可编辑层级。</p></button><button class="option-card" id="import-project"><span class="option-icon">▧</span><strong>工程 / WBP 树</strong><p>支持 Alpha 工程、旧版 Frame JSON 和声明式 WBP root / slot 结构。</p></button></div>`);
  $('#import-svg').onclick = () => app.pickFile('.svg', async file => { showAssetEditor(app, null, await file.text(), file.name.replace(/\.svg$/i, '')); });
  $('#import-project').onclick = () => app.pickFile('.json,.uialpha', file => app.importFile(file));
  $('#import-html').onclick = () => showHtmlInput(app);
}
export function showHtmlInput(app) {
  modal('HTML → 可编辑 SVG 界面', `<p class="modal-description">粘贴带内联 CSS 的 HTML。脚本和外部网络资源不会执行；不支持的样式会记录在诊断中。</p><textarea id="html-source" class="source-input" spellcheck="false" placeholder="&lt;style&gt;...&lt;/style&gt; &lt;main&gt;...&lt;/main&gt;"></textarea><div class="field-grid">${numberField('W', 1440, 'width', 'min="16" max="16384"')}${numberField('H', 900, 'height', 'min="16" max="16384"')}</div>`, `<button id="html-file" class="quiet">从文件选择</button><button id="html-example" class="quiet">载入示例</button><button data-close class="quiet">取消</button><button id="html-convert" class="primary">生成 SVG 控件树</button>`);
  $('#html-file').onclick = () => app.pickFile('.html,.htm', async file => { $('#html-source').value = await file.text(); });
  $('#html-example').onclick = async () => { $('#html-source').value = await (await fetch('/examples/import.html')).text(); };
  $('#html-convert').onclick = async () => {
    if (!$('#html-source').value.trim()) return toast('请输入 HTML', true);
    const width = Number($('#modal [data-field="width"]').value), height = Number($('#modal [data-field="height"]').value);
    if (![width, height].every(n => Number.isFinite(n) && n >= 16 && n <= 16384)) return toast('测量尺寸必须为 16–16384', true);
    const button = $('#html-convert'); button.disabled = true; button.textContent = '正在测量布局…';
    try { await app.importHtmlSource($('#html-source').value, { width, height }); $('#modal').close(); }
    catch (error) { toast(error.message, true); button.disabled = false; button.textContent = '生成 SVG 控件树'; }
  };
}
export function showExport(app) {
  const name = app.store.document.name.replace(/[^\w\u4e00-\u9fff-]+/g, '-');
  modal('导出界面与资产', `<p class="modal-description">工程文件保留 SVG 原始资产、预制体、嵌套引用、实例覆盖和场景。其他导出使用当前预览尺寸。</p><div class="export-options"><button id="export-project" class="option-card"><span class="option-icon">⬡</span><strong>完整工程</strong><p>可再次打开的 JSON，包含资产和预制体源数据。</p></button><button id="export-svg" class="option-card"><span class="option-icon">◇</span><strong>独立 SVG</strong><p>原生可编辑矢量，无编辑辅助线、无 foreignObject。</p></button><button id="export-html" class="option-card"><span class="option-icon">&lt;/&gt;</span><strong>独立 HTML</strong><p>内嵌 SVG、工程源及按钮四态，下载后即可离线预览。</p></button><button id="export-wbp" class="option-card"><span class="option-icon">▧</span><strong>WBP 布局契约</strong><p>展开嵌套预制体，保留 Slot、稳定路径和 SVG 引用。</p></button><button id="export-native-wbp" class="option-card"><span class="option-icon">▧</span><strong>UE · SVG 转 PNG</strong><p>冻结当前画布，逐控件转换透明 PNG，供 SvgCanvasBridge 导入原生 WBP。</p></button></div><p class="property-hint">原生 WBP 使用独立插件 SvgCanvasBridge。源 SVG、层级、锚点与按钮四态保留在导入包中。</p>`);
  $('#export-native-wbp').onclick = async () => {
    const button = $('#export-native-wbp'); button.disabled = true;
    try {
      const job = `wbp-${crypto.randomUUID()}`;
      const entries = [...app.layout.entries].map(([id, e]) => [id, { ...e, node: clone(e.node) }]);
      const response = await fetch(`/api/native-wbp/${job}/source`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        project: app.store.document, svg: app.renderer.exportSvg(),
        context: { width: app.layout.width, height: app.layout.height, name: app.store.document.name, entries, expandedRoot: app.expanded.document.root }
      }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      const link = document.createElement('a'); link.href = result.url; link.target = '_blank'; link.rel = 'noopener'; link.textContent = '打开 SVG → PNG → WBP 导入包';
      button.replaceWith(link); link.click();
    } catch (error) { toast(error.message, true); button.disabled = false; }
  };
  $('#export-project').onclick = () => download(`${name}.uialpha.json`, JSON.stringify(app.store.document, null, 2));
  $('#export-svg').onclick = () => download(`${name}.svg`, app.renderer.exportSvg(), 'image/svg+xml');
  $('#export-html').onclick = () => download(`${name}.html`, portableHtml(app), 'text/html');
  $('#export-wbp').onclick = () => download(`${name}.wbp.json`, JSON.stringify(exportWbpContract(app.store.document, app.expanded.document, app.layout), null, 2));
}

export function portableHtml(app) {
  const svg = new DOMParser().parseFromString(app.renderer.exportSvg(), 'image/svg+xml').documentElement;
  for (const entry of app.layout.entries.values()) {
    const node = entry.node; if (node.type !== 'Button') continue;
    const group = [...svg.querySelectorAll('[data-node-id]')].find(g => g.getAttribute('data-node-id') === node.id), visual = group?.firstElementChild;
    if (!visual) continue;
    for (const state of ['normal', 'hovered', 'pressed', 'disabled']) {
      const asset = app.store.document.assets[node.brushes[state] || node.brushes.normal];
      const layer = asset ? assetGraphic(asset, entry.width, entry.height, app.renderer.namespace, { x: entry.globalX, y: entry.globalY, scale: entry.scale || 1 }) : visual.cloneNode(true);
      layer.setAttribute('data-state', state); layer.style.display = state === (node.interactable === false ? 'disabled' : 'normal') ? '' : 'none'; visual.parentNode.insertBefore(layer, visual);
    }
    visual.remove(); group.setAttribute('role', 'button'); group.setAttribute('tabindex', '0'); group.setAttribute('aria-disabled', node.interactable === false ? 'true' : 'false'); group.style.cursor = node.interactable === false ? 'default' : 'pointer';
  }
  const source = JSON.stringify(app.store.document).replaceAll('<', '\\u003c');
  const title = esc(app.store.document.name);
  return `<!DOCTYPE html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{margin:0;background:#111820;min-height:100vh;display:grid;place-items:center}body>svg{max-width:100vw;max-height:100vh;width:100%;height:auto}g[role=button]:focus-visible{outline:1px solid #9bd7b7}</style>${new XMLSerializer().serializeToString(svg)}<script id="uicreator-source" type="application/json">${source}</script><script>
const buttons=[...document.querySelectorAll('g[role="button"]')];
function state(b,s){if(b.getAttribute('aria-disabled')==='true')s='disabled';for(const g of b.children)if(g.hasAttribute('data-state'))g.style.display=g.getAttribute('data-state')===s?'':'none';}
for(const b of buttons){b.addEventListener('pointerenter',()=>state(b,'hovered'));b.addEventListener('pointerleave',()=>state(b,'normal'));b.addEventListener('pointerdown',()=>state(b,'pressed'));b.addEventListener('pointerup',()=>state(b,'hovered'));b.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();state(b,'pressed');}});b.addEventListener('keyup',e=>{if(e.key==='Enter'||e.key===' '){state(b,'hovered');b.click();}});}
window.addEventListener('pointerup',()=>buttons.forEach(b=>state(b,b.matches(':hover')?'hovered':'normal')));
</script></html>`;
}

export async function showProjects(app) {
  let projects = [];
  try { projects = await listProjects(); } catch (e) { toast(e.message, true); }
  modal('工程', `<div class="field"><label>当前名称</label><input id="rename-project" value="${esc(app.store.document.name)}"><button id="rename-project-save" class="quiet">重命名</button></div><p class="modal-description">本地文件保存在 UICreatorAlpha/data/projects，独立于旧工具数据。</p><div class="project-list">${projects.length ? projects.map(p => `<button data-project="${esc(p.id)}"><span>${esc(p.name)}</span><small>revision ${p.revision} · ${new Date(p.updatedAt).toLocaleString()}</small></button>`).join('') : '<p class="empty">尚未保存工程。编辑后点击右上角“保存工程”。</p>'}</div>`, `<button id="recover-project" class="quiet">恢复最近工作</button><button id="new-project" class="quiet">新建空工程</button><button id="demo-project" class="primary">打开示例工程</button>`);
  $('#rename-project-save').onclick = () => { const name = $('#rename-project').value.trim(); if (name) app.store.transaction('重命名工程', project => { project.name = name.slice(0, 240); }); $('#modal').close(); };
  for (const button of $('#modal').querySelectorAll('[data-project]')) button.onclick = async () => {
    try { const record = await loadProject(button.dataset.project); app.replaceProject(record.document, record.revision); $('#modal').close(); } catch (e) { toast(e.message, true); }
  };
  $('#new-project').onclick = () => { app.replaceProject(createDocument('Untitled')); $('#modal').close(); };
  $('#demo-project').onclick = () => { app.openDemo(); $('#modal').close(); };
  $('#recover-project').onclick = () => { try { const recovery = JSON.parse(localStorage.getItem('uialpha-recovery')); if (!recovery) throw new Error('没有恢复记录'); app.replaceProject(recovery.document, recovery.revision); $('#modal').close(); } catch (error) { toast(error.message, true); } };
}
export function showHelp() {
  modal('SVG UI 系统 · 使用指南', `<div class="help-grid"><div><h3>资产 → 预制体 → 界面实例</h3><p>SVG 资产只定义绘制，可复用到按钮 Normal / Hover / Pressed / Disabled。预制体保存布局和控件树，并可嵌套其他预制体。</p><p>从层级中选择控件，点击“保存为预制体”。在预制体库点击缩略图插入，点击“编辑”进入隔离编辑。</p><h3>实例覆盖</h3><p>展开实例并选中继承节点，在检查器修改文字、资产或布局，会生成局部覆盖。可还原单个节点、还原全部，或应用到预制体。解除关联会展开为独立控件。</p></div><div><h3>锚点与容器</h3><p>Canvas Slot 在固定轴使用位置和尺寸；在拉伸轴使用左右 / 上下边距。切换预设时保持当前矩形。HorizontalBox / VerticalBox 使用 Auto 或 Fill 权重布局。</p><h3>快捷操作</h3><ul><li>滚轮缩放，Space / H 平移，F 适应，V 选择</li><li>Ctrl S 保存，Ctrl Z 撤销，Ctrl Shift Z 重做</li><li>Ctrl D 复制，Delete 删除，方向键移动</li><li>拖动选择框的八个手柄缩放</li><li>拖动层级重新挂接；双击实例进入预制体</li></ul></div></div><p class="property-hint">HTML 导入是当前视口的测量快照，不支持的 CSS 会显示诊断。UE 可导出逐控件透明 PNG，由 SvgCanvasBridge 生成可编辑 WBP。PNG 按导出尺寸烘焙，游戏逻辑需接入项目。</p>`);
}
export function showDiagnostics(app) {
  const warnings = app.diagnostics();
  modal('布局与导入诊断', `<p class="modal-description">检查当前展开后的布局与导入能力缺口。SVG 渲染器不会用强制裁剪掩盖文字越界。</p>${warnings.length ? `<ul class="diagnostic-list">${warnings.map(w => `<li>${esc(w.message || w)}</li>`).join('')}</ul>` : '<div class="empty">✓ 当前视口未发现文本安全区域溢出或导入缺口。</div>'}<p class="property-hint">当前 ${app.layout.width} × ${app.layout.height} · ${app.layout.entries.size} 个展开节点 · ${Object.keys(app.store.document.assets).length} 个 SVG 资产 · ${Object.keys(app.store.document.prefabs).length} 个预制体</p>`);
}

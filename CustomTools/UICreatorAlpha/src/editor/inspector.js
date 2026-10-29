import { TYPES } from '../core/model.js';
import { motionAssetId } from '../core/motion.js';
import { showMotionEditor } from './motion-editor.js';
import { AUDIO_EVENTS, defaultAudio } from '../core/audio.js';
import { $, escapeHtml as esc, field, numberField as num, selectField as select, section, pathPatch } from './dom.js';

export const ANCHOR_PRESETS = [
  ['左上', 0, 0, 0, 0], ['上中', .5, 0, .5, 0], ['右上', 1, 0, 1, 0], ['横向拉伸', 0, 0, 1, 0],
  ['左中', 0, .5, 0, .5], ['中心', .5, .5, .5, .5], ['右中', 1, .5, 1, .5], ['横向居中拉伸', 0, .5, 1, .5],
  ['左下', 0, 1, 0, 1], ['下中', .5, 1, .5, 1], ['右下', 1, 1, 1, 1], ['全向拉伸', 0, 0, 1, 1],
];
const alignH = [['fill', '填满'], ['left', '左'], ['center', '居中'], ['right', '右']];
const alignV = [['fill', '填满'], ['top', '上'], ['center', '居中'], ['bottom', '下']];
const bool = (label, value, path) => `<label><input type="checkbox" data-field="${path}" ${value ? 'checked' : ''}>${label}</label>`;
function insetsFields(value, path) { return `<div class="field-grid">${num('左', value.left, `${path}.left`)}${num('上', value.top, `${path}.top`)}${num('右', value.right, `${path}.right`)}${num('下', value.bottom, `${path}.bottom`)}</div>`; }

export function renderInspector(app) {
  const node = app.selectedNode(), root = app.store.editRoot, inherited = app.inheritedSelection;
  if (!node) return;
  const parent = app.selectedParent(), entry = app.selectedEntry();
  const s = node.slot, style = node.style, l = node.layout;
  const assetOptions = [['', '无 · 使用基础绘制'], ...Object.values(app.store.document.assets).map(a => [a.id, a.name])];
  $('#selection-type').textContent = node.type;
  let html = `<div class="inspector-identity">${inherited ? `<div class="inherited-notice">⬡ 继承节点 · 修改将保存为实例覆盖<br><span class="muted">${esc(node.name)}</span><button id="revert-node-overrides" class="text-button">还原此节点</button></div>` : ''}<div class="type-label">${esc(TYPES[node.type]?.[0] || node.type)}</div><input aria-label="控件名称" data-field="name" value="${esc(node.name)}"><div class="check-row">${bool('锁定', node.locked, 'locked')}${bool('可见', node.visibility === 'visible', '_visible')}</div></div>`;
  if (node.id === root.id && !inherited) {
    const vp = app.store.viewDocument.viewport;
    html += section(app.store.editingPrefabId ? '预制体画布' : '场景画布', `<div class="field-grid">${num('W', vp.width, '_viewport.width', 'min="16" max="16384"')}${num('H', vp.height, '_viewport.height', 'min="16" max="16384"')}</div>${field('背景', vp.background, '_viewport.background')}<p class="property-hint">预览尺寸只影响视口。画布尺寸保存在工程中。</p>`);
  } else if (parent?.type === 'CanvasPanel') {
    const a = s.anchors, sx = a.minX !== a.maxX, sy = a.minY !== a.maxY;
    const presets = ANCHOR_PRESETS.map(([name, x1, y1, x2, y2], i) => `<button class="anchor-preset ${a.minX === x1 && a.minY === y1 && a.maxX === x2 && a.maxY === y2 ? 'active' : ''}" data-anchor-preset="${i}" title="${name} · 保持当前矩形"><svg viewBox="0 0 30 24"><rect x="3" y="3" width="24" height="18" fill="none" stroke="currentColor" opacity=".3"/><path d="M${3 + x1 * 24} ${3 + y1 * 18}L${3 + x2 * 24} ${3 + y2 * 18}" stroke="currentColor" stroke-width="2"/><rect x="${1.5 + x1 * 24}" y="${1.5 + y1 * 18}" width="3" height="3" fill="currentColor"/>${x1 !== x2 || y1 !== y2 ? `<rect x="${1.5 + x2 * 24}" y="${1.5 + y2 * 18}" width="3" height="3" fill="currentColor"/>` : ''}</svg></button>`).join('');
    html += section('Canvas Slot', `<div class="anchor-presets">${presets}</div><div class="field-grid">${num(sx ? '左' : 'X', s.offsets.left, 'slot.offsets.left')}${num(sy ? '上' : 'Y', s.offsets.top, 'slot.offsets.top')}${num(sx ? '右' : 'W', s.offsets.right, 'slot.offsets.right')}${num(sy ? '下' : 'H', s.offsets.bottom, 'slot.offsets.bottom')}</div><div class="field-grid">${num('AX', s.alignment.x, 'slot.alignment.x')}${num('AY', s.alignment.y, 'slot.alignment.y')}</div><div class="check-row">${bool('适应内容 AutoSize', s.autoSize, 'slot.autoSize')}</div>${num('Z', s.zOrder, 'slot.zOrder')}<p class="property-hint">${sx || sy ? '拉伸轴：右 / 下为边距；固定轴：W / H 为尺寸。' : '固定锚点：位置相对锚点，Alignment 为自身对齐点。'}</p>`, '锚点 · 偏移');
    html += section('自定义锚点', `<div class="field-grid">${num('MinX', a.minX, 'slot.anchors.minX', 'min="0" max="1" step="0.01"')}${num('MinY', a.minY, 'slot.anchors.minY', 'min="0" max="1" step="0.01"')}${num('MaxX', a.maxX, 'slot.anchors.maxX', 'min="0" max="1" step="0.01"')}${num('MaxY', a.maxY, 'slot.anchors.maxY', 'min="0" max="1" step="0.01"')}</div>`);
  } else {
    html += section(`${esc(parent?.type || 'Panel')} Slot`, select('水平对齐', s.horizontalAlignment, 'slot.horizontalAlignment', alignH) + select('垂直对齐', s.verticalAlignment, 'slot.verticalAlignment', alignV) + (['HorizontalBox', 'VerticalBox', 'ScrollBox'].includes(parent?.type) ? select('尺寸规则', s.sizeRule, 'slot.sizeRule', [['auto', 'Auto · 期望尺寸'], ['fill', 'Fill · 按权重填充']]) + num('权重', s.fill, 'slot.fill', 'min="0"') : '') + insetsFields(s.padding, 'slot.padding'), 'Padding');
  }
  if (node.type === 'PrefabInstance') {
    const prefab = app.store.document.prefabs[node.prefabId], count = Object.keys(node.overrides).length;
    html += section('预制体实例', `<div class="reference-chip">⬡ ${esc(prefab.name)}<button id="edit-prefab">编辑 ↗</button></div>${inherited ? '<p class="property-hint">嵌套预制体。点击编辑进入它的独立界面。</p>' : `<p class="property-hint">${count} 个节点有局部覆盖。展开层级后选择继承节点修改。</p><div class="property-actions"><button id="revert-overrides">还原全部覆盖</button><button id="apply-overrides">应用到预制体</button><button id="detach-prefab">解除关联</button></div>`}`, 'LINKED');
  }
  if (node.type === 'Button') {
    html += section('SVG 状态', [['normal', 'Normal'], ['hovered', 'Hover'], ['pressed', 'Pressed'], ['disabled', 'Disabled']].map(([state, label]) => `<div class="field state-row"><label>${label}</label><select aria-label="${label} SVG" data-field="brushes.${state}">${assetOptions.map(([id, name]) => `<option value="${esc(id)}" ${node.brushes[state] === id ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select><button data-edit-brush="${state}" title="编辑共享 SVG">↗</button></div>`).join('') + `<div class="check-row">${bool('可交互', node.interactable, 'interactable')}</div><div class="field"><label>状态预览</label><select id="button-preview-state">${[['normal', '正常'], ['hovered', '悬停'], ['pressed', '按下'], ['disabled', '禁用']].map(([id, name]) => `<option value="${id}" ${app.forcedState === id ? 'selected' : ''}>${name}</option>`).join('')}</select></div><p class="property-hint">四态只切换 SVG 引用，不改变控件尺寸。空状态继承 Normal。</p>`);
  } else if (['Svg', 'Image', 'Border'].includes(node.type)) {
    html += section('SVG 资产', select('预制 SVG', node.svgAsset, 'svgAsset', assetOptions) + `<div class="property-actions"><button id="edit-node-asset">编辑 SVG 资产 ↗</button></div><p class="property-hint">资产拥有绘制与缩放方式；实例拥有位置与尺寸。</p>`);
  }
  if (node.type === 'TextBlock') html += section('文字内容', `<div class="field"><textarea data-field="text" aria-label="文本内容">${esc(node.text)}</textarea></div><div class="field-grid">${num('字号', style.fontSize, 'style.fontSize', 'min="1"')}${num('字重', style.fontWeight, 'style.fontWeight', 'min="100" max="900" step="100"')}</div>${field('字体', style.fontFamily, 'style.fontFamily')}${field('文字颜色', style.color, 'style.color')}${select('水平对齐', style.textAlign, 'style.textAlign', [['left', '左'], ['center', '居中'], ['right', '右']])}${select('垂直对齐', style.verticalAlign, 'style.verticalAlign', [['top', '上'], ['center', '居中'], ['bottom', '下']])}${select('超出处理', style.textOverflow || '', 'style.textOverflow', [['', '显示并报告溢出'], ['shrink', '缩小文字'], ['ellipsis', '省略号']])}${num('内边距', style.textPadding, 'style.textPadding', 'min="0"')}<div class="check-row">${bool('自动换行', style.wrap, 'style.wrap')}</div>`);
  html += section('动效', select('共享资产', motionAssetId(node), '_motionAsset', [['', '无动效'], ...Object.values(app.store.document.motions || {}).map(a => [a.id, a.name])]) + bool('启用动效', node.motion?.enabled !== false, 'motion.enabled') + (app.store.document.motions?.[motionAssetId(node)]?.target === 'edge' ? field('实例流光颜色',node.motion?.tint || '#ffffff','motion.tint') : '') + '<div class="property-actions"><button id="edit-node-motion">编辑时间轴 ↗</button><button id="new-node-motion">新建动效</button></div><p class="property-hint">通过 ID 引用共享动效；可在预制体实例中覆盖。关键帧与触发事件一起导入 UE。只移动视觉层。</p>');
  const audio = node.audio || defaultAudio(node.type, node.binding), soundOptions = [['', '无音效'], ...Object.values(app.store.document.sounds || {}).map(a => [a.id, a.name])];
  html += section('UI 音效', `<div class="check-row">${bool('启用事件音效', audio.enabled, 'audio.enabled')}</div>${Object.entries(AUDIO_EVENTS).filter(([event]) => node.type === 'Button' || ['opened', 'closed'].includes(event)).map(([event, label]) => select(label, audio.events[event] || '', `audio.events.${event}`, soundOptions)).join('')}<div class="field-grid">${num('音量', audio.volume, 'audio.volume', 'min="0" max="1" step="0.05"')}${num('音高', audio.pitch, 'audio.pitch', 'min="0.25" max="4" step="0.05"')}</div><p class="property-hint">事件引用共享 WAV，支持实例覆盖。仅交互预览播放；顶部开关控制总音量。选中事件可由运行时 playSound / UE Play Ui Sound 触发。</p>`);
  if (node.type === 'ProgressBar') html += section('进度条', `${num('进度', node.value, 'value', 'min="0" max="1" step="0.01"')}${field('填充颜色', style.color, 'style.color')}`);
  if(app.store.document.motions?.[motionAssetId(node)]?.target==='edge')html+=section('提示生命周期',bool('悬停后消除，重新启用可再提示',!!node.motion?.dismissOnHover,'motion.dismissOnHover'));
  if (['VerticalBox', 'HorizontalBox', 'ScrollBox', 'CanvasPanel', 'Overlay', 'Border', 'Button', 'SizeBox', 'ScaleBox', 'PrefabInstance'].includes(node.type)) html += section('布局容器', `<div class="field-grid">${num('W', l.width, 'layout.width', 'min="0"')}${num('H', l.height, 'layout.height', 'min="0"')}</div>${['HorizontalBox', 'VerticalBox', 'ScrollBox'].includes(node.type) ? num('间距', l.gap, 'layout.gap', 'min="0"') : ''}${node.type !== 'PrefabInstance' ? insetsFields(l.padding, 'layout.padding') : ''}${node.type === 'ScaleBox' ? select('缩放方式', l.stretch, 'layout.stretch', [['fit', '等比适应'], ['fill', '等比填满'], ['down', '只缩小'], ['user', '指定倍率']]) + num('倍率', l.scale, 'layout.scale', 'min="0.01"') : ''}${node.type === 'SizeBox' ? `<div class="field-grid">${num('锁宽', l.widthOverride ?? l.width, 'layout.widthOverride')}${num('锁高', l.heightOverride ?? l.height, 'layout.heightOverride')}</div>` : ''}${node.type === 'ScrollBox' ? select('方向', l.orientation, 'layout.orientation', [['vertical', '垂直'], ['horizontal', '水平']]) + num('滚动', l.scrollOffset, 'layout.scrollOffset', 'min="0"') : ''}<p class="property-hint">W / H 为面板期望尺寸；实际尺寸由父级 Slot 决定。</p>`);
  html += section('基础绘制', `${field('背景颜色', style.fill, 'style.fill')}${field('边框颜色', style.stroke, 'style.stroke')}<div class="field-grid">${num('边框', style.strokeWidth, 'style.strokeWidth', 'min="0"')}${num('圆角', style.radius, 'style.radius', 'min="0"')}${num('透明', style.opacity, 'style.opacity', 'min="0" max="1" step="0.05"')}</div><div class="check-row">${bool('裁剪子级', style.clip, 'style.clip')}</div>`);
  if (entry) html += section('实际布局', `<div class="field"><label>位置</label><span class="value-text">${entry.globalX.toFixed(1)}, ${entry.globalY.toFixed(1)}</span></div><div class="field"><label>尺寸</label><span class="value-text">${entry.globalWidth.toFixed(1)} × ${entry.globalHeight.toFixed(1)}</span></div><div class="field"><label>稳定 ID</label><span class="value-text">${esc(node.id)}</span></div>`, '只读');
  if (node.id !== root.id && !inherited) html += section('控件操作', `<div class="property-actions"><button id="make-prefab">保存为预制体</button><button id="duplicate-node">复制控件</button><button id="delete-node">删除</button><button id="move-up">上移层级</button><button id="move-down">下移层级</button></div>`);
  const target = $('#inspector'), scroll = target.scrollTop; target.innerHTML = html; target.scrollTop = scroll;
  target.querySelectorAll('[data-field]').forEach(input => input.addEventListener('change', () => {
    let value = input.type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value) : input.value;
    if (input.type === 'number' && (!Number.isFinite(value) || !input.checkValidity())) { app.notify('请输入范围内的数值', true); return renderInspector(app); }
    let key = input.dataset.field;
    if (key === '_visible') { key = 'visibility'; value = value ? 'visible' : 'hidden'; }
    if (key.startsWith('_viewport.')) app.setDesignViewport(key.slice(10), value);
    else if (key === '_motionAsset') app.patchSelection({ motion: { assetId: value, preset: value ? 'auto' : 'none' } });
    else app.patchSelection(pathPatch(key, value));
  }));
  target.querySelectorAll('[data-anchor-preset]').forEach(button => { button.onclick = () => app.applyAnchor(ANCHOR_PRESETS[Number(button.dataset.anchorPreset)]); });
  target.querySelectorAll('[data-edit-brush]').forEach(button => { button.onclick = () => app.editAsset(node.brushes[button.dataset.editBrush]); });
  const on = (id, action) => { const e = target.querySelector(`#${id}`); if (e) e.onclick = action; };
  on('edit-node-asset', () => app.editAsset(node.svgAsset)); on('make-prefab', () => app.makePrefab()); on('duplicate-node', () => app.duplicate()); on('delete-node', () => app.deleteNode());
  on('edit-node-motion', () => showMotionEditor(app, motionAssetId(node) || null)); on('new-node-motion', () => showMotionEditor(app));
  on('edit-prefab', () => app.openPrefab(node.prefabId)); on('detach-prefab', () => app.detach()); on('revert-overrides', () => app.revertOverrides()); on('revert-node-overrides', () => app.revertOverrides(inherited.path));
  on('apply-overrides', () => app.applyOverrides());
  on('move-up', () => app.reorder(-1)); on('move-down', () => app.reorder(1));
  const preview = target.querySelector('#button-preview-state'); if (preview) preview.onchange = () => { app.forcedState = preview.value; app.renderScene(); };
}

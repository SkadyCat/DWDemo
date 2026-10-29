import { $, escapeHtml as esc, modal, toast, selectField } from './dom.js';
import { uid, createDocument, createNode, walk } from '../core/model.js';
import { createMotionAsset, validateMotionAsset, MOTION_CHANNELS, MOTION_EASINGS, motionFrame, sampleMotion } from '../core/motion.js';
import { folderOptions } from '../core/folders.js';
import { UIRuntime } from '../runtime/runtime.js';
import { edgeMotionLayer, removeEdgeMotion } from '../render/edge-motion.js';

export function showMotionEditor(app, id = null) {
  const original = app.store.document.motions?.[id], draft = original ? structuredClone(original) : createMotionAsset(uid());
  draft.folderId ||= app.library.currentFolder.motions || '';
  let selected = Object.keys(draft.clips)[0], preview;
  modal(original ? '编辑共享动效' : '创建动效资产', `<div class="motion-editor"><p class="modal-description">控件通过稳定 ID 引用此资产。时间轴、事件与关键帧会一起导入 UE，无需为新动效写代码。</p><div class="field"><label>资产名称</label><input id="motion-name" value="${esc(draft.name)}"></div>${selectField('文件夹', draft.folderId, '_motion-folder', folderOptions(app.store.document, 'motion'))}${selectField('影响图层', draft.target, '_motion-target', [['content', '外观与内容'], ['visual', '仅外观 · 例如选中光圈']])}<div class="motion-workspace"><div><svg id="motion-asset-preview" aria-label="动效资产预览"></svg><button id="motion-play" class="primary">播放片段</button><label class="motion-scrub">预览时间 <input id="motion-scrub" type="range" min="0" max="1000" value="0"><output id="motion-time">0 ms</output></label></div><div><div class="field"><label>时间轴片段</label><select id="motion-clip"></select><button id="motion-add-clip" class="quiet">＋</button><button id="motion-remove-clip" class="quiet">删除</button></div><div id="motion-clip-settings"></div></div></div><div class="motion-keyframes"><table><thead><tr>${['时间 %', 'X px', 'Y px', '缩放 X', '缩放 Y', '旋转 °', '透明度', ''].map(t => `<th>${t}</th>`).join('')}</tr></thead><tbody id="motion-frames"></tbody></table><button id="motion-add-frame" class="quiet">＋ 关键帧</button></div><h3>触发事件 → 时间轴片段</h3><div id="motion-bindings"></div><button id="motion-add-event" class="quiet">＋ 自定义触发事件</button><p class="property-hint">normal：显示 / 移出；hovered：悬停；pressed：按下；disabled：禁用。pressed&gt;hovered 可单独定义松开反馈。自定义事件可由 UE 蓝图的 Play Motion 调用。</p></div>`, `${original ? '<button id="motion-delete" class="quiet">删除未引用资产</button><button id="motion-duplicate" class="quiet">另存副本</button>' : ''}<button data-close class="quiet">取消</button><button id="motion-save" class="primary">保存动效</button>`);
  const targetSelect = $('[data-field="_motion-target"]');
  targetSelect.insertAdjacentHTML('beforeend', '<option value="edge">边缘流光 · 保留背景与内容</option>'); targetSelect.value = draft.target;
  const edgeDefaults = { width: 1.5, radius: 9, color: '#ffffff' };
  $('.motion-editor').insertAdjacentHTML('beforeend', `<div id="motion-edge-settings"><h3>边缘外观</h3>${['width', 'radius', 'color'].map(key => `<div class="field"><label>${({width:'边宽 px',radius:'圆角 px',color:'流光颜色'})[key]}</label><input data-edge-field="${key}" type="${key === 'color' ? 'color' : 'number'}" step=".1" value="${draft.edge?.[key] ?? edgeDefaults[key]}"></div>`).join('')}<p class="property-hint">旋转通道控制流光相位，透明度控制亮度；只绘制边缘，不改变原背景、图标、布局和点击范围。</p></div>`);
  $('#motion-edge-settings').hidden = draft.target !== 'edge';
  const scene = createDocument('动效资产预览'); scene.viewport = { width: 320, height: 170, background: '#101925' }; scene.motions[draft.id] = draft;
  scene.root.children.push(createNode('Button', { id: 'motion-preview-button', name: '动效预览', text: 'SVG UI', motion: { assetId: draft.id }, slot: { offsets: { left: 110, top: 45, right: 100, bottom: 80 } }, style: { fill: '#193a48', stroke: '#59cbed', strokeWidth: 2, radius: 12, textAlign: 'center', fontSize: 19 } }));
  preview = new UIRuntime($('#motion-asset-preview'), scene, { motion: false, sound: false });
  $('#modal').addEventListener('close', () => preview.destroy(), { once: true });
  const clip = () => draft.clips[selected];
  const scrub = () => {
    preview.motion = false; preview.paint();
    const ms = Number($('#motion-scrub').value) / 1000 * clip().duration, value = sampleMotion({ ...clip(), loop: false }, ms);
    $('#motion-time').textContent = `${Math.round(ms)} ms`;
    const record = preview.renderer.groups.get('motion-preview-button');
    if (draft.target === 'edge') { const layer = edgeMotionLayer(record, draft, scene.root.children[0], {width:100,height:80}); layer.style.transform = `rotate(${value.rotation}deg)`; layer.style.opacity = value.opacity; return; }
    removeEdgeMotion(record);
    for (const layer of draft.target === 'visual' ? [record.visual] : [record.visual, record.children]) { layer.style.transformBox = 'view-box'; layer.style.transformOrigin = '50px 40px'; layer.style.transform = `translate(${value.x}px,${value.y}px) rotate(${value.rotation}deg) scale(${value.scaleX},${value.scaleY})`; layer.style.opacity = value.opacity; }
  };
  const resetPreview = () => { const record = preview.renderer.groups.get('motion-preview-button'); removeEdgeMotion(record); for (const layer of [record.visual, record.children]) { layer.style.removeProperty('transform'); layer.style.removeProperty('opacity'); } };
  function render() {
    $('#motion-clip').innerHTML = Object.keys(draft.clips).map(name => `<option ${name === selected ? 'selected' : ''}>${esc(name)}</option>`).join('');
    $('#motion-clip-settings').innerHTML = `<div class="field"><label>时长 ms</label><input id="motion-duration" type="number" min="1" max="600000" value="${clip().duration}"></div>${selectField('缓动', clip().easing, '_motion-easing', MOTION_EASINGS.map(v => [v, ({ linear: '线性', easeIn: '渐入', easeOut: '渐出', easeInOut: '平滑进出', backOut: '回弹' })[v]]))}<label><input id="motion-loop" type="checkbox" ${clip().loop ? 'checked' : ''}>循环播放</label> <label><input id="motion-current" type="checkbox" ${clip().fromCurrent ? 'checked' : ''}>从当前外观平滑接续</label>`;
    $('#motion-clip-settings').insertAdjacentHTML('afterbegin', `<div class="field"><label>片段标识</label><input id="motion-clip-name" value="${esc(selected)}"></div>`);
    $('#motion-clip-name').onchange = e => { const name = e.target.value.trim(); if (!/^[a-zA-Z0-9_-]{1,80}$/.test(name) || (name !== selected && draft.clips[name])) return toast('片段标识需为唯一的字母、数字、下划线或短横线', true); draft.clips[name] = clip(); if (name !== selected) delete draft.clips[selected]; for (const event of Object.keys(draft.bindings)) if (draft.bindings[event] === selected) draft.bindings[event] = name; selected = name; render(); };
    $('#motion-frames').innerHTML = clip().keyframes.map((f, i) => `<tr data-frame="${i}">${['t', ...MOTION_CHANNELS].map(k => `<td><input aria-label="关键帧 ${i + 1} ${k}" data-channel="${k}" type="number" step="any" value="${k === 't' ? Math.round(f[k] * 10000) / 100 : f[k]}"></td>`).join('')}<td><button data-remove-frame="${i}" aria-label="删除关键帧 ${i + 1}">×</button></td></tr>`).join('');
    $('#motion-bindings').innerHTML = Object.entries(draft.bindings).map(([event, name]) => `<div class="field"><label>${esc(event)}</label><select data-motion-event="${esc(event)}"><option value="">无</option>${Object.keys(draft.clips).map(key => `<option value="${esc(key)}" ${name === key ? 'selected' : ''}>${esc(key)}</option>`).join('')}</select></div>`).join('');
    for (const row of $('#motion-bindings').children) { const label = row.querySelector('label'), event = row.querySelector('select').dataset.motionEvent; label.outerHTML = `<input aria-label="触发事件 ${esc(event)}" data-event-name="${esc(event)}" value="${esc(event)}" style="width:130px;flex:0 0 130px">`; }
    for (const input of $('#motion-bindings').querySelectorAll('[data-event-name]')) input.onchange = () => { const name = input.value.trim(), old = input.dataset.eventName; if (!/^[a-zA-Z0-9_>\-]{1,100}$/.test(name) || (name !== old && Object.hasOwn(draft.bindings, name))) return toast('事件标识无效或已存在', true); if (name !== old) { draft.bindings[name] = draft.bindings[old]; delete draft.bindings[old]; render(); } };
    $('#motion-duration').onchange = e => { clip().duration = Number(e.target.value); scrub(); };
    $('[data-field="_motion-easing"]').onchange = e => { clip().easing = e.target.value; scrub(); };
    $('#motion-loop').onchange = e => { clip().loop = e.target.checked; };
    $('#motion-current').onchange = e => { clip().fromCurrent = e.target.checked; };
    for (const input of $('#motion-frames').querySelectorAll('input')) input.onchange = () => { const k = input.dataset.channel; clip().keyframes[Number(input.closest('tr').dataset.frame)][k] = Number(input.value) / (k === 't' ? 100 : 1); const errors = validateMotionAsset(draft); if (errors.length) toast(errors[0], true); else scrub(); };
    for (const button of $('#motion-frames').querySelectorAll('[data-remove-frame]')) button.onclick = () => { if (clip().keyframes.length <= 2) return toast('至少保留两个关键帧', true); clip().keyframes.splice(Number(button.dataset.removeFrame), 1); render(); };
    for (const input of $('#motion-bindings').querySelectorAll('select')) input.onchange = () => { if (input.value) draft.bindings[input.dataset.motionEvent] = input.value; else delete draft.bindings[input.dataset.motionEvent]; };
    scrub();
  }
  $('#motion-clip').onchange = e => { selected = e.target.value; resetPreview(); render(); };
  $('#motion-scrub').oninput = scrub;
  $('#motion-play').onclick = () => {
    const errors = validateMotionAsset(draft); if (errors.length) return toast(errors[0], true);
    resetPreview(); preview.motion = true; scene.motions[draft.id] = { ...draft, bindings: { normal: selected } }; preview.renderer.groups.get('motion-preview-button').motionKey = null; preview.paint();
  };
  $('#motion-add-frame').onclick = () => { const t = Number($('#motion-scrub').value) / 1000; if (clip().keyframes.some(f => Math.abs(f.t - t) < .00001)) return toast('请先拖动时间滑块到新的时间点'); clip().keyframes.push({ t, ...sampleMotion({ ...clip(), loop: false }, t * clip().duration) }); clip().keyframes.sort((a, b) => a.t - b.t); render(); };
  $('#motion-add-clip').onclick = () => { let name = 'clip'; for (let n = 2; draft.clips[name]; n++) name = `clip${n}`; draft.clips[name] = { duration: 300, easing: 'easeInOut', loop: false, fromCurrent: false, keyframes: [motionFrame(0), motionFrame(1)] }; selected = name; render(); };
  $('#motion-remove-clip').onclick = () => { if (Object.keys(draft.clips).length <= 1) return toast('至少保留一个片段', true); delete draft.clips[selected]; for (const [event, name] of Object.entries(draft.bindings)) if (name === selected) delete draft.bindings[event]; selected = Object.keys(draft.clips)[0]; render(); };
  $('#motion-add-event').onclick = () => { const event = `event${Object.keys(draft.bindings).length + 1}`; draft.bindings[event] = selected; render(); };
  function save(copy = false) {
    draft.name = $('#motion-name').value.trim(); draft.target = $('[data-field="_motion-target"]').value; draft.folderId = $('[data-field="_motion-folder"]').value;
    const errors = validateMotionAsset(draft); if (errors.length) return toast(errors[0], true);
    if (copy) { draft.id = uid(); draft.name += ' 副本'; }
    app.store.transaction(copy ? '复制动效资产' : '保存动效资产', project => { project.motions ||= {}; project.motions[draft.id] = structuredClone(draft); }); $('#modal').close(); app.notify('动效资产已保存；所有引用会同步更新，导入 UE 时保留时间轴');
  }
  $('[data-field="_motion-target"]').onchange = e => { draft.target = e.target.value; if (draft.target === 'edge') draft.edge ||= {...edgeDefaults}; $('#motion-edge-settings').hidden = draft.target !== 'edge'; resetPreview(); scrub(); };
  for (const input of document.querySelectorAll('[data-edge-field]')) input.onchange = () => { draft.edge ||= {...edgeDefaults}; const key=input.dataset.edgeField; draft.edge[key]=key==='color'?input.value:Number(input.value); const errors=validateMotionAsset(draft); if(errors.length)toast(errors[0],true);else scrub(); };
  $('#motion-save').onclick = () => save();
  if (original) {
    $('#motion-duplicate').onclick = () => save(true);
    $('#motion-delete').onclick = () => { let refs = 0; const check = root => walk(root, n => { if (n.motion?.assetId === id || Object.values(n.overrides || {}).some(p => p.motion?.assetId === id)) refs++; }); check(app.store.document.root); Object.values(app.store.document.prefabs).forEach(p => check(p.root)); if (refs) return toast(`此动效被 ${refs} 处引用，请先解除引用`, true); app.store.transaction('删除动效资产', project => { delete project.motions[id]; }); $('#modal').close(); };
  }
  render();
}

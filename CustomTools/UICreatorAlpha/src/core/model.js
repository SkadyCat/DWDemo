import { MOTION_PRESETS, builtinMotions, validateMotionAsset } from './motion.js';
import { defaultAudio, validateSoundAsset, validateAudioBinding } from './audio.js';
import { builtinSounds } from '../assets/ui-sounds.js';
export const SCHEMA = 'uicreator-alpha';
export const TYPES = {
  CanvasPanel: ['画布面板', '▧', 'panel'], Overlay: ['叠加面板', '▱', 'panel'],
  VerticalBox: ['垂直排列', '☰', 'panel'], HorizontalBox: ['水平排列', '▥', 'panel'],
  SizeBox: ['尺寸盒', '□', 'single'], ScaleBox: ['缩放盒', '⤢', 'single'],
  ScrollBox: ['滚动区域', '↕', 'panel'], Border: ['边框', '▣', 'single'],
  Button: ['按钮', '▰', 'single'], TextBlock: ['文本', 'T', 'leaf'],
  Image: ['图片', '▧', 'leaf'], ProgressBar: ['进度条', '▬', 'leaf'],
  Svg: ['SVG 图形', '◇', 'leaf'],
  PrefabInstance: ['预制体实例', '⬡', 'instance'],
};
export const uid = () => globalThis.crypto.randomUUID();
export const OVERRIDE_FIELDS = ['text', 'style', 'layout', 'slot', 'svgAsset', 'brushes', 'motion', 'audio', 'visibility', 'interactable', 'value', 'name', 'locked', 'binding', 'action'];
export const clone = value => structuredClone(value);
export const insets = (n = 0) => ({ left: n, top: n, right: n, bottom: n });
export const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
export function createNode(type = 'CanvasPanel', props = {}) {
  const base = {
    id: uid(), name: type, type, visibility: 'visible', locked: false,
    slot: {
      anchors: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
      offsets: { left: 0, top: 0, right: 240, bottom: 120 },
      alignment: { x: 0, y: 0 }, autoSize: false, zOrder: 0,
      padding: insets(), horizontalAlignment: 'fill', verticalAlignment: 'fill',
      sizeRule: 'auto', fill: 1,
    },
    layout: { padding: insets(), gap: 12, width: 240, height: 120, stretch: 'fit', scale: 1, orientation: 'vertical', scrollOffset: 0 },
    style: { fill: ['Border', 'Button'].includes(type) ? '#202b3a' : 'transparent', stroke: 'transparent', strokeWidth: 0, radius: type === 'Button' ? 8 : 0, opacity: 1, color: '#e5edf6', fontSize: 18, fontWeight: 400, fontFamily: 'Segoe UI, Microsoft YaHei, sans-serif', textAlign: 'left', verticalAlign: 'center', textPadding: 0, wrap: true, objectFit: 'contain', clip: false },
    text: type === 'TextBlock' ? '文本内容' : '', src: '', svg: '', svgAsset: '', value: .65,
    brushes: { normal: '', hovered: '', pressed: '', disabled: '' },
    motion: { preset: 'auto', assetId: '' },
    audio: defaultAudio(type, props.binding),
    interactable: true, prefabId: '', overrides: {}, binding: '', action: null,
    children: [],
  };
  return merge(base, props);
}
export function merge(target, patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) continue;
    if (value && typeof value === 'object' && !Array.isArray(value) && target[key] && typeof target[key] === 'object') merge(target[key], value);
    else target[key] = clone(value);
  }
  return target;
}
export function createDocument(name = 'Untitled') {
  return { schema: SCHEMA, version: 1, id: uid(), name, viewport: { width: 1440, height: 900, background: '#0e1623' }, root: createNode('CanvasPanel', { name: 'Root' }), assets: {}, prefabs: {}, motions: builtinMotions(), sounds: builtinSounds(), folders: {}, provenance: null };
}
export function walk(root, visit, parent = null, depth = 0) {
  visit(root, parent, depth);
  for (const child of root.children || []) walk(child, visit, root, depth + 1);
}
export function indexTree(root) {
  const nodes = new Map(), parents = new Map();
  walk(root, (node, parent) => { nodes.set(node.id, node); parents.set(node.id, parent); });
  return { nodes, parents };
}
export function canContain(parent) { return parent && !['leaf', 'instance'].includes(TYPES[parent.type]?.[2]); }
export function canAdd(parent) { return canContain(parent) && (TYPES[parent.type]?.[2] !== 'single' || !parent.children.length); }
export function isAncestor(ancestor, node, parents) {
  for (let current = node; current; current = parents.get(current.id)) if (current.id === ancestor.id) return true;
  return false;
}
export function validateDocument(doc) {
  const errors = [];
  if (!doc || doc.schema !== SCHEMA || doc.version !== 1) return ['不支持的文档格式 / 版本'];
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(doc.id || '')) errors.push('文档 ID 无效');
  if (typeof doc.name !== 'string' || doc.name.length > 240) errors.push('文档名称无效');
  if (!doc.viewport || ![doc.viewport.width, doc.viewport.height].every(n => Number.isFinite(n) && n >= 16 && n <= 16384)) errors.push('画布尺寸必须为 16–16384');
  if (!doc.root || doc.root.type !== 'CanvasPanel') return [...errors, '根节点必须是 CanvasPanel'];
  const ids = new Set();
  let count = 0;
  const inspect = (n, depth) => {
    if (++count > 10000) { if (count === 10001) errors.push('节点数量超过 10000'); return; }
    if (depth > 64) { errors.push('层级深度超过 64'); return; }
    if (!n || typeof n !== 'object') { errors.push('无效节点'); return; }
    if (!/^[a-zA-Z0-9_-]{1,160}$/.test(n.id || '') || ids.has(n.id)) errors.push(`重复或无效 ID: ${n.id}`);
    ids.add(n.id);
    if (!TYPES[n.type]) errors.push(`不支持的类型: ${n.type}`);
    if (n.motion && (!MOTION_PRESETS.includes(n.motion.preset) || typeof n.motion !== 'object' || Array.isArray(n.motion))) errors.push(`${n.name}: 动效预设无效`);
    if (n.motion?.assetId && !doc.motions?.[n.motion.assetId]) errors.push(`${n.name}: 缺少动效资产 ${n.motion.assetId}`);
    if (n.motion?.enabled !== undefined && typeof n.motion.enabled !== 'boolean') errors.push(`${n.name}: 动效启用开关无效`);
    if (n.motion?.tint !== undefined && !/^#[0-9a-f]{6}$/i.test(n.motion.tint)) errors.push(`${n.name}: 动效颜色必须是 #RRGGBB`);
    errors.push(...validateAudioBinding(n.audio, doc.sounds, n.name));
    for (const patch of Object.values(n.overrides || {})) if (patch?.audio) errors.push(...validateAudioBinding(merge(clone(n.audio || defaultAudio(n.type)), patch.audio), doc.sounds, n.name));
    for (const patch of Object.values(n.overrides || {})) if (patch?.motion?.assetId && !doc.motions?.[patch.motion.assetId]) errors.push(`${n.name}: 实例覆盖缺少动效资产 ${patch.motion.assetId}`);
    if (!Array.isArray(n.children)) { errors.push('children 必须是数组'); return; }
    const kind = TYPES[n.type]?.[2];
    if (['leaf', 'instance'].includes(kind) && n.children.length) errors.push(`${n.name}: 叶节点 / 实例不能包含源子控件`);
    if (kind === 'single' && n.children.length > 1) errors.push(`${n.name}: 只允许一个子控件`);
    const s = n.slot;
    if (!s || !s.anchors || !s.offsets || !s.alignment) errors.push(`${n.name}: 缺少 Slot`);
    else {
      const a = s.anchors;
      if (![a.minX, a.minY, a.maxX, a.maxY].every(v => Number.isFinite(v) && v >= 0 && v <= 1) || a.minX > a.maxX || a.minY > a.maxY) errors.push(`${n.name}: 锚点无效`);
      if (!Object.values(s.offsets).every(Number.isFinite) || !Object.values(s.alignment).every(Number.isFinite)) errors.push(`${n.name}: Slot 数值无效`);
    }
    if (!n.style || !n.layout) errors.push(`${n.name}: 缺少布局 / 样式`);
    else {
      const box = value => value && ['left', 'top', 'right', 'bottom'].every(k => Number.isFinite(value[k]));
      if (!box(n.layout.padding) || !box(s?.padding)) errors.push(`${n.name}: Padding 无效`);
      if (![n.layout.width, n.layout.height, n.style.fontSize, n.style.opacity, n.style.strokeWidth].every(Number.isFinite) || n.style.fontSize <= 0 || n.style.opacity < 0 || n.style.opacity > 1 || n.style.strokeWidth < 0) errors.push(`${n.name}: 布局 / 样式数值无效`);
      if (!['visible', 'hidden', 'collapsed'].includes(n.visibility)) errors.push(`${n.name}: Visibility 无效`);
      if (n.type === 'PrefabInstance') {
        if (!n.overrides || typeof n.overrides !== 'object' || Array.isArray(n.overrides)) errors.push(`${n.name}: 实例覆盖无效`);
        else for (const [path, patch] of Object.entries(n.overrides)) if (!/^[a-zA-Z0-9_/-]+$/.test(path) || !patch || typeof patch !== 'object' || Object.keys(patch).some(k => !OVERRIDE_FIELDS.includes(k))) errors.push(`${n.name}: 非法实例覆盖 ${path}`);
      }
    }
    for (const child of n.children) inspect(child, depth + 1);
  };
  inspect(doc.root, 0);
  if (!doc.assets || !doc.prefabs) errors.push('缺少 SVG 资产库或预制体库');
  for (const [id, asset] of Object.entries(doc.assets || {})) {
    if (!asset || typeof asset !== 'object') { errors.push(`SVG 资产无效: ${id}`); continue; }
    if (asset.id !== id || !/^[a-zA-Z0-9_-]{1,160}$/.test(id) || typeof asset.source !== 'string' || asset.source.length > 1000000) errors.push(`SVG 资产无效: ${id}`);
    if (!['stretch', 'contain', 'nine-slice'].includes(asset.scaleMode)) errors.push(`SVG 缩放方式无效: ${id}`);
    if (!Array.isArray(asset.viewBox) || asset.viewBox.length !== 4 || !asset.viewBox.every(Number.isFinite) || asset.viewBox[2] <= 0 || asset.viewBox[3] <= 0) errors.push(`SVG viewBox 无效: ${id}`);
    if (asset.scaleMode === 'nine-slice' && (!asset.slice || Object.values(asset.slice).length !== 4 || !Object.values(asset.slice).every(v => Number.isFinite(v) && v >= 0) || asset.slice.left + asset.slice.right >= asset.viewBox?.[2] || asset.slice.top + asset.slice.bottom >= asset.viewBox?.[3])) errors.push(`SVG 九宫格边距无效: ${id}`);
  }
  for (const [id, prefab] of Object.entries(doc.prefabs || {})) {
    if (!prefab || typeof prefab !== 'object') { errors.push(`预制体无效: ${id}`); continue; }
    if (prefab.id !== id || !/^[a-zA-Z0-9_-]{1,160}$/.test(id) || !prefab.root) { errors.push(`预制体无效: ${id}`); continue; }
    if (![prefab.width, prefab.height].every(v => Number.isFinite(v) && v >= 16 && v <= 16384)) errors.push(`预制体尺寸无效: ${id}`);
    inspect(prefab.root, 0);
  }
  if (errors.length) return errors;
  // Prefabs form a DAG. Recursive references are authoring errors, not render fallbacks.
  const done = new Set(), active = new Set();
  const checkRefs = (root, depth = 0) => {
    if (depth > 64) { errors.push('预制体嵌套超过 64 层'); return; }
    const visit = node => {
      if (node.type === 'PrefabInstance') {
        const id = node.prefabId;
        if (!doc.prefabs?.[id]) errors.push(`丢失预制体: ${node.name} → ${id}`);
        else if (active.has(id)) errors.push(`预制体循环引用: ${id}`);
        else if (!done.has(id)) { active.add(id); checkRefs(doc.prefabs[id].root, depth + 1); active.delete(id); done.add(id); }
      }
      for (const ref of [node.svgAsset, ...Object.values(node.brushes || {})]) if (ref && !doc.assets?.[ref]) errors.push(`丢失 SVG 资产: ${node.name} → ${ref}`);
      for (const c of Array.isArray(node.children) ? node.children : []) if (c && typeof c === 'object') visit(c);
    };
    visit(root);
  };
  checkRefs(doc.root);
  for (const prefab of Object.values(doc.prefabs || {})) if (prefab?.root) { active.add(prefab.id); checkRefs(prefab.root); active.delete(prefab.id); }
  for (const [id, motion] of Object.entries(doc.motions || {})) errors.push(...validateMotionAsset(motion, id));
  for (const [id, sound] of Object.entries(doc.sounds || {})) errors.push(...validateSoundAsset(sound, id));
  const folders = doc.folders || {}, folderNames = new Set();
  for (const [id, folder] of Object.entries(folders)) {
    if (!folder || folder.id !== id || !/^[a-zA-Z0-9_-]{1,160}$/.test(id) || typeof folder.name !== 'string' || !folder.name.trim() || folder.name.length > 100 || !['svg', 'prefab', 'motion', 'sound'].includes(folder.kind)) { errors.push(`文件夹无效: ${id}`); continue; }
    const folderKey = `${folder.kind}/${folder.parentId || ''}/${folder.name}`;
    if (folderNames.has(folderKey)) errors.push(`同一目录存在同名文件夹: ${folder.name}`); folderNames.add(folderKey);
    const seen = new Set([id]); let parent = folder.parentId;
    while (parent) {
      if (!folders[parent] || folders[parent].kind !== folder.kind) { errors.push(`文件夹父级无效: ${id}`); break; }
      if (seen.has(parent)) { errors.push(`文件夹循环引用: ${id}`); break; }
      seen.add(parent); parent = folders[parent].parentId;
    }
  }
  for (const [kind, records] of [['svg', doc.assets], ['prefab', doc.prefabs], ['motion', doc.motions], ['sound', doc.sounds]]) for (const item of Object.values(records || {})) {
    if (item?.folderId && folders[item.folderId]?.kind !== kind) errors.push(`资源文件夹无效: ${item.name}`);
  }
  const screens=new Set();
  if(doc.interfaceCatalog!==undefined&&!Array.isArray(doc.interfaceCatalog))errors.push('界面目录必须是数组');
  for(const screen of Array.isArray(doc.interfaceCatalog)?doc.interfaceCatalog:[]){
    if(!screen||typeof screen.id!=='string'||screens.has(screen.id)||!doc.prefabs[screen.prefabId]||typeof screen.title!=='string')errors.push(`界面目录引用无效: ${screen?.id}`);
    screens.add(screen?.id);
  }
  return errors;
}

import { createDocument, createNode, clone, TYPES, finite, uid, walk, merge } from '../core/model.js';
import { motionAssetId, builtinMotions } from '../core/motion.js';
import { defaultAudio } from '../core/audio.js';
import { builtinSounds } from '../assets/ui-sounds.js';

const FRAME_TYPES = { container: 'CanvasPanel', overlay: 'Overlay', horizontal: 'HorizontalBox', vertical: 'VerticalBox', sizebox: 'SizeBox', scalebox: 'ScaleBox', scrollbox: 'ScrollBox', text: 'TextBlock', image: 'Image', button: 'Button', progressbar: 'ProgressBar' };
export function importTree(input) {
  if (input.schema === 'uicreator-alpha') {
    // Opening a file creates a fresh local identity; it cannot overwrite another saved project.
    const doc = clone(input); doc.id = uid(); return { document: doc, warnings: [] };
  }
  const doc = createDocument(input.name || input.assetName || 'Imported UI'), warnings = [];
  if (input.motions) doc.motions = clone(input.motions);
  if (input.sounds) doc.sounds = clone(input.sounds);
  const canvas = input.canvas || input.viewport || {};
  doc.viewport.width = finite(canvas.width, 1440); doc.viewport.height = finite(canvas.height, 900);
  doc.viewport.background = canvas.background || '#101925';
  const frame = Array.isArray(input.nodes);
  if (!frame && input.assets) {
    doc.assets = clone(input.assets); doc.folders = clone(input.folders || {});
    for (const a of Object.values(doc.assets)) if (a.folderId && !doc.folders[a.folderId]) a.folderId = '';
  }
  if (!frame && !input.root) throw new Error('需要 Alpha 工程、Frame nodes 或声明式 WBP root 树');
  const convert = source => {
    const type = frame ? FRAME_TYPES[source.type] : source.type;
    const node = createNode(TYPES[type] ? type : 'CanvasPanel', { name: source.name || source.type || 'Widget' });
    if (!TYPES[type]) warnings.push(`${source.name}: ${source.type} 暂以 CanvasPanel 保留层级；原始属性已记录`);
    node.source = { type: source.type, properties: clone(source) }; delete node.source.properties.children;
    if (frame) {
      node.slot.anchors = { ...node.slot.anchors, ...source.layout?.anchors };
      node.slot.alignment = { ...node.slot.alignment, ...source.layout?.alignment };
      node.slot.offsets = { left: finite(source.x), top: finite(source.y), right: finite(source.width, 240), bottom: finite(source.height, 120) };
      node.slot.autoSize = !!source.layout?.sizeToContent;
      node.slot.padding = { ...node.slot.padding, ...source.layout?.padding };
      node.slot.horizontalAlignment = source.layout?.horizontalAlignment || 'fill'; node.slot.verticalAlignment = source.layout?.verticalAlignment || 'fill';
      node.layout.padding = { ...node.layout.padding, ...source.panel?.innerPadding }; node.layout.gap = finite(source.panel?.gap, 0);
      const s = source.style || {};
      Object.assign(node.style, { fill: s.background || 'transparent', stroke: s.borderColor || 'transparent', strokeWidth: finite(s.borderWidth), radius: finite(s.borderRadius), fontSize: finite(s.fontSize, 18), fontFamily: s.fontFamily || node.style.fontFamily, fontWeight: finite(s.fontWeight, 400), color: s.color || node.style.color, opacity: finite(s.opacity, 100) / 100, textAlign: s.textAlign || 'left', clip: s.overflow === 'hidden' });
      node.slot.zOrder = finite(s.zIndex); node.visibility = source.visible === false ? 'collapsed' : 'visible'; node.locked = !!source.locked;
      node.text = String(source.content || ''); node.src = String(source.src || ''); node.value = finite(source.percent, .5);
    } else {
      const slot = source.slot || {}, p = source.props || source.properties || {};
      node.slot.anchors = { ...node.slot.anchors, ...slot.anchors };
      node.slot.offsets = slot.offsets ? { ...node.slot.offsets, ...slot.offsets } : { left: finite(slot.x), top: finite(slot.y), right: finite(slot.width, 240), bottom: finite(slot.height, 120) };
      node.slot.alignment = { x: finite(slot.alignX ?? slot.alignment?.x), y: finite(slot.alignY ?? slot.alignment?.y) };
      node.slot.zOrder = finite(slot.z ?? slot.zOrder); node.slot.autoSize = !!(slot.autoSize || slot.sizeToContent);
      for (const k of ['padding', 'horizontalAlignment', 'verticalAlignment', 'sizeRule', 'fill']) if (slot[k] != null) node.slot[k] = clone(slot[k]);
      node.text = String(p.text || ''); node.value = finite(p.percent, .5);
      Object.assign(node.style, { fill: p.backgroundColor || 'transparent', color: p.color || '#e5edf6', fontSize: finite(p.fontSize, 18), textAlign: p.align || 'left' });
      if (p.style) merge(node.style, p.style);
      if (source.layout) merge(node.layout, source.layout);
      if (p.svgAsset) node.svgAsset = p.svgAsset;
      if (p.brushes) merge(node.brushes, p.brushes);
        if (p.motion) merge(node.motion, p.motion);
      if (p.audio) merge(node.audio, p.audio);
      if (p.interactable != null) node.interactable = !!p.interactable;
      if (p.value != null) node.value = finite(p.value, .5);
      if (p.visibility === 'collapsed') node.visibility = 'collapsed';
      for (const k of ['widthOverride', 'heightOverride', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight']) if (p[k] != null) node.layout[k] = finite(p[k]);
      if (p.texture || p.brush) warnings.push(`${node.name}: UE Brush 引用已记录，需要在资产库绑定 SVG`);
    }
    node.layout.width = Math.max(0, node.slot.offsets.right); node.layout.height = Math.max(0, node.slot.offsets.bottom);
    node.children = (source.children || []).map(convert);
    if (TYPES[node.type][2] === 'leaf' && node.children.length) {
      warnings.push(`${node.name}: 含子节点，保留为 CanvasPanel`); node.type = 'CanvasPanel';
    }
    if (TYPES[node.type][2] === 'single' && node.children.length > 1) node.children = [createNode('Overlay', { name: `${node.name}_Content`, children: node.children })];
    return node;
  };
  const root = frame ? createNode('CanvasPanel', { name: 'Root', children: input.nodes.map(convert) }) : convert(input.root);
  doc.root = root.type === 'CanvasPanel' ? root : createNode('CanvasPanel', { name: 'Root', children: [root] });
  doc.provenance = { kind: frame ? 'legacy-frame' : 'declarative-wbp-tree', importedAt: new Date().toISOString(), warnings };
  return { document: doc, warnings };
}

export function exportWbpContract(project, expanded, layout) {
  const warnings = ['此文件是布局 / SVG / 动效资产契约；通过 SVG Canvas 插件导入 UE。不转换 Lua 业务或材质。'];
  const convert = node => {
    const entry = layout.entries.get(node.id);
    const result = {
      id: node.id, name: node.name, type: node.type === 'PrefabInstance' ? 'Overlay' : node.type === 'Svg' ? 'Image' : node.type,
      slot: clone(node.slot), layout: clone(node.layout), visibility: node.visibility,
        props: { text: node.text, style: clone(node.style), svgAsset: node.svgAsset, brushes: clone(node.brushes), motion: { ...clone(node.motion || { preset: 'auto' }), assetId: motionAssetId(node) }, audio: clone(node.audio || defaultAudio(node.type, node.binding)), interactable: node.interactable, value: node.value },
      resolved: entry ? { x: entry.x, y: entry.y, width: entry.width, height: entry.height, scale: entry.scale } : null,
      sourcePrefab: node.prefabId || undefined, children: node.children.map(convert),
    };
    return result;
  };
  return { schema: 'uicreator-alpha/wbp-layout', version: 1, name: project.name, viewport: project.viewport, assets: clone(project.assets), motions: { ...builtinMotions(), ...clone(project.motions || {}) }, sounds: { ...builtinSounds(), ...clone(project.sounds || {}) }, folders: clone(project.folders || {}), warnings, root: convert(expanded.root) };
}

export function allReferences(project, assetId) {
  const users = [];
  const find = (root, owner) => walk(root, node => {
    if (node.svgAsset === assetId || Object.values(node.brushes || {}).includes(assetId) || Object.values(node.overrides || {}).some(p => p.svgAsset === assetId || Object.values(p.brushes || {}).includes(assetId))) users.push(`${owner}/${node.name}`);
  });
  find(project.root, project.name);
  for (const p of Object.values(project.prefabs)) find(p.root, p.name);
  return users;
}

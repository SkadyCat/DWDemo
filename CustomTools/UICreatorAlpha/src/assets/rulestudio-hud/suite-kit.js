import { createNode, insets } from '../../core/model.js';

export const colors = { gold: '#edcf97', text: '#e6ebf3', muted: '#7f8aa1', faint: '#52667d', line: '#232c3d', cyan: '#56c8f5', bg: '#101722' };
export const art = name => `battle-svg-${name}`;
export const skin = family => Object.fromEntries(['normal', 'hovered', 'pressed', 'disabled'].map(s => [s, art(`${family}-${s}`)]));
export const node = (type, id, x, y, w, h, props = {}) => createNode(type, { id, name: id, slot: { offsets: { left: x, top: y, right: w, bottom: h } }, layout: { width: w, height: h }, ...props });
export const text = (id, value, x, y, w, h = 22, style = {}, props = {}) => node('TextBlock', id, x, y, w, h, { name: value, text: value, locked: true, style: { color: colors.text, fontSize: 12, wrap: false, textOverflow: 'ellipsis', textPadding: 0, textPaddingX:3,textPaddingY:style.verticalAlign==='top'?2:0,...style }, ...props });
export const graphic = (id, asset, x, y, w, h) => node('Svg', id, x, y, w, h, { name: asset, svgAsset: asset, locked: true });
export const canvas = (id, w, h, children = [], props = {}) => node('CanvasPanel', id, 0, 0, w, h, { children, ...props });
export const rect = (id, x, y, w, h, fill = colors.bg, stroke = 'transparent', radius = 0) => node('Border', id, x, y, w, h, { locked: true, style: { fill, stroke, strokeWidth: stroke === 'transparent' ? 0 : 1, radius } });
export const line = (id, x, y, w, h = 1) => rect(id, x, y, w, h, colors.line);
export const ui = (op, value, extra = {}) => ({ type: 'battle-ui', op, value, ...extra });
export function button(id, label, x, y, w, h, action, props = {}) {
  const result=node('Button', id, x, y, w, h, { name: label, action, brushes: skin('button'), layout:{minWidth:w,minHeight:h},style: { fill: 'transparent', radius: 4 }, children: [text(`${id}-label`, label, 7, 0, w - 14, h, { textAlign: 'center' })], ...props });
  if(result.children.length>1)result.children=[canvas(`${id}-content`,w,h,result.children)];
  return result;
}
export function field(id, placeholder, x, y, w, fieldName,h=29) {
  return button(id, placeholder, x, y, w, h, ui('input', fieldName), { binding: `field:${fieldName}`, brushes: skin('field'), children: [text(`${id}-value`, placeholder, 5, 0, w - 10, h, { fontSize: h===24?10:11, color: colors.muted }, { binding: `value:${fieldName}` })] });
}
export function scroll(id, x, y, w, h, children = [], gap = 0, props = {}) {
  return node('ScrollBox', id, x, y, w, h, { layout: { gap }, children, ...props });
}
export function instance(id, prefabId, x, y, w, h, overrides = {}, props = {}) { return node('PrefabInstance', id, x, y, w, h, { prefabId, overrides, ...props }); }
export function place(n, x, y) { n.slot.offsets.left = x; n.slot.offsets.top = y; return n; }
export function fill(n, margin = 0) { n.slot.anchors = { minX: 0, minY: 0, maxX: 1, maxY: 1 }; n.slot.offsets = { left: margin, top: margin, right: margin, bottom: margin }; return n; }
export function center(n) { n.slot.anchors = { minX: .5, maxX: .5, minY: .5, maxY: .5 }; n.slot.alignment = { x: .5, y: .5 }; return n; }
export function windowPanel(id, title, w, h, children, options = {}) {
  const {headerHeight=52,titleFont=15,...props}=options;
  return canvas(id, w, h, [graphic(`${id}-frame`, art('window'), 0, 0, w, h),graphic(`${id}-head`,art('window-header'),1,1,w-2,headerHeight-1),text(`${id}-title`, title, 12, 8, w - 80, headerHeight-16, { fontSize:titleFont,fontWeight: 600, color: colors.gold }), button(`${id}-close`, '×', w - 40, (headerHeight-26)/2, 26, 26, ui('back'),{brushes:skin('close'),children:[text(`${id}-close-symbol`,'×',0,0,26,26,{fontSize:18,fontFamily:'Arial, sans-serif',textAlign:'center',color:'#d8c39e',textOverflow:'shrink'})]}), ...children,
    fill(canvas(`${id}-overlay`, w, h, [], { binding: 'suite-overlays', locked: true }))
  ], { name: title, ...props });
}
export function title(id, value, x, y, w, caption = '') { return [...(caption ? [text(`${id}-caption`, caption, x, y, w, 16, { fontSize: 10, color: colors.muted })] : []), text(id, value, x, y + (caption ? 18 : 0), w, 24, { color: colors.gold, fontSize: 15, fontWeight: 600 })]; }
export function assetRecord(id, name, source, mode = 'contain', size = 96, folderId = 'battle-art-icons') { return { id, name, source, viewBox: [0, 0, size, size], scaleMode: mode, slice: insets(10), folderId }; }

import { uid } from '../core/model.js';

export const SVG_NS = 'http://www.w3.org/2000/svg';
export const svgElement = (tag, attributes = {}) => {
  const element = document.createElementNS(SVG_NS, tag);
  setAttributes(element, attributes); return element;
};
export function setAttributes(element, attributes) {
  for (const [key, value] of Object.entries(attributes)) {
    if (value == null) element.removeAttribute(key);
    else if (element.getAttribute(key) !== String(value)) element.setAttribute(key, String(value));
  }
}
export function safeImageUrl(url) {
  if (/^\/exports\/wbp-[a-zA-Z0-9_-]{1,90}\/source-assets\/[a-zA-Z0-9_-]+\.png$/.test(url || '')) return url;
  return /^(data:image\/(png|jpeg|webp|gif);base64,|blob:)/i.test(url || '') ? url : '';
}
// Imported vector assets remain vector. No foreignObject or executable markup.
export function parseSvg(source) {
  if (typeof source !== 'string' || source.length > 1000000) throw new Error('SVG 资产上限为 1 MB');
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('SVG 不支持外部实体');
  const parsed = new DOMParser().parseFromString(source, 'image/svg+xml');
  const root = parsed.documentElement;
  if (parsed.querySelector('parsererror') || root.localName !== 'svg') throw new Error('请输入有效的 SVG XML');
  // Resolve ordinary SVG class/inline styles into presentation attributes once.
  // A shared asset must never inject a stylesheet into the editor's document.
  const presentation = new Set('fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-dasharray stroke-dashoffset opacity color font-family font-size font-weight font-style text-anchor dominant-baseline clip-path mask filter display visibility stop-color stop-opacity'.split(' '));
  const declarations = (element, style) => {
    for (let i = 0; i < style.length; i++) { const property = style.item(i); if (presentation.has(property)) element.setAttribute(property, style.getPropertyValue(property).trim()); }
  };
  let styleWarnings = 0;
  for (const styleNode of [...root.querySelectorAll('style')]) {
    try {
      const sheet = new CSSStyleSheet(); sheet.replaceSync(styleNode.textContent.replace(/@import[^;]+;/gi, ''));
      for (const rule of sheet.cssRules) {
        if (!rule.selectorText || !rule.style) { styleWarnings++; continue; }
        for (const element of [root, ...root.querySelectorAll('*')]) if (element.matches(rule.selectorText)) declarations(element, rule.style);
      }
    } catch { styleWarnings++; }
    styleNode.remove();
  }
  for (const element of [root, ...root.querySelectorAll('[style]')]) if (element.hasAttribute('style')) {
    const style = document.createElement('span').style; style.cssText = element.getAttribute('style'); declarations(element, style); element.removeAttribute('style');
  }
  const allowed = new Set('svg g defs symbol use path rect circle ellipse line polyline polygon text tspan linearGradient radialGradient stop pattern clipPath mask filter feGaussianBlur feOffset feFlood feComposite feMerge feMergeNode feColorMatrix feBlend image title desc'.split(' '));
  let removed = styleWarnings;
  for (const element of [...root.querySelectorAll('*')]) {
    if (!allowed.has(element.localName)) { element.remove(); removed++; }
  }
  for (const element of [root, ...root.querySelectorAll('*')]) {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase(), value = attribute.value;
      const refs = [...value.matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/gi)];
      if (name.startsWith('on') || name === 'style' || /(?:javascript|vbscript):/i.test(value) || (['href', 'xlink:href'].includes(name) && !value.startsWith('#') && !safeImageUrl(value)) || refs.some(r => !r[1].startsWith('#'))) {
        element.removeAttribute(attribute.name); removed++;
      }
    }
  }
  let viewBox = (root.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
  if (viewBox.length !== 4 || !viewBox.every(Number.isFinite) || viewBox[2] <= 0 || viewBox[3] <= 0) {
    const w = parseFloat(root.getAttribute('width')), h = parseFloat(root.getAttribute('height'));
    if (!(w > 0 && h > 0)) throw new Error('SVG 需要有效的 viewBox 或宽高');
    viewBox = [0, 0, w, h]; root.setAttribute('viewBox', viewBox.join(' '));
  }
  root.setAttribute('xmlns', SVG_NS);
  return { root, source: new XMLSerializer().serializeToString(root), viewBox, removed };
}
export function makeSvgAsset(name, source, options = {}) {
  const parsed = parseSvg(source);
  return { id: uid(), name, source: parsed.source, viewBox: parsed.viewBox, scaleMode: 'stretch', slice: { left: 12, top: 12, right: 12, bottom: 12 }, ...options };
}
export function scopedSvgContent(asset, namespace = '') {
  const parsed = parseSvg(asset.source), root = parsed.root;
  const prefix = `a_${namespace}${asset.id}_`, identifiers = new Map();
  for (const el of root.querySelectorAll('[id]')) { identifiers.set(el.id, prefix + el.id); el.id = prefix + el.id; }
  for (const el of [root, ...root.querySelectorAll('*')]) for (const attr of [...el.attributes]) {
    let value = attr.value;
    value = value.replace(/url\(\s*['"]?#([^)'"\s]+)['"]?\s*\)/g, (_, id) => `url(#${identifiers.get(id) || prefix + id})`);
    if (['href', 'xlink:href'].includes(attr.name) && value.startsWith('#')) value = '#' + (identifiers.get(value.slice(1)) || prefix + value.slice(1));
    el.setAttribute(attr.name, value);
  }
  const group = svgElement('g', { id: `asset_${namespace}${asset.id}` });
  // Preserve root presentation attributes and transform as part of the asset.
  for (const attr of [...root.attributes]) if (!['xmlns', 'viewBox', 'width', 'height', 'id', 'preserveAspectRatio'].includes(attr.name)) group.setAttribute(attr.name, attr.value);
  while (root.firstChild) group.append(document.importNode(root.firstChild, true)), root.firstChild.remove();
  return { group, viewBox: parsed.viewBox };
}
// Shared boundaries must land on the final raster grid. Independent SVG
// viewport clips at 11.5px each cover half a pixel; source-over combines those
// halves into 75% alpha, leaving a visible seam even for a solid source.
// Snap the shared cuts, not the outer bounds, so translucent artwork is drawn
// exactly once and rounded outer edges retain their normal antialiasing.
export function nineSliceCuts(length, first, last, origin = 0, scale = 1) {
  scale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const snap = value => Math.max(0, Math.min(length, (Math.round(origin + value * scale) - origin) / scale));
  const a = snap(first), b = Math.max(a, snap(length - last));
  return [0, a, b, length];
}
export function assetGraphic(asset, width, height, namespace = '', rasterGrid = {}) {
  const [x, y, w, h] = asset.viewBox;
  const use = () => svgElement('use', { href: `#asset_${namespace}${asset.id}` });
  const group = svgElement('g', { 'pointer-events': 'none' });
  if (asset.scaleMode !== 'nine-slice') {
    const frame = svgElement('svg', { width, height, viewBox: `${x} ${y} ${w} ${h}`, preserveAspectRatio: asset.scaleMode === 'contain' ? 'xMidYMid meet' : 'none', overflow: 'hidden' });
    frame.append(use()); group.append(frame); return group;
  }
  const s = asset.slice;
  if (!s || Object.values(s).some(v => !Number.isFinite(v) || v < 0) || s.left + s.right >= w || s.top + s.bottom >= h) throw new Error(`${asset.name}: 九宫格边距无效`);
  // Downscale the corner bands uniformly only if the target cannot contain them.
  const k = Math.min(1, width / (s.left + s.right || 1), height / (s.top + s.bottom || 1));
  const xs = [x, x + s.left, x + w - s.right], ys = [y, y + s.top, y + h - s.bottom];
  const sw = [s.left, w - s.left - s.right, s.right], sh = [s.top, h - s.top - s.bottom, s.bottom];
  const dx = nineSliceCuts(width, s.left * k, s.right * k, rasterGrid.x || 0, rasterGrid.scale || 1);
  const dy = nineSliceCuts(height, s.top * k, s.bottom * k, rasterGrid.y || 0, rasterGrid.scale || 1);
  const dw = dx.slice(1).map((end, i) => end - dx[i]), dh = dy.slice(1).map((end, i) => end - dy[i]);
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
    if (!sw[col] || !sh[row] || !dw[col] || !dh[row]) continue;
    const part = svgElement('svg', { x: dx[col], y: dy[row], width: dw[col], height: dh[row], viewBox: `${xs[col]} ${ys[row]} ${sw[col]} ${sh[row]}`, preserveAspectRatio: 'none', overflow: 'hidden' });
    part.append(use()); group.append(part);
  }
  return group;
}

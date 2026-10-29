import { svgElement as el, setAttributes as attrs, scopedSvgContent, assetGraphic, safeImageUrl } from '../assets/svg.js';
import { animateVisual, stopVisual } from './motion.js';

const textCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
const context = textCanvas?.getContext('2d');
export function measureText(text, style) {
  context.font = `${style.fontWeight || 400} ${style.fontSize || 18}px ${style.fontFamily}`;
  return context.measureText(text).width;
}
export function buttonAsset(node, state = 'normal') {
  const actual = node.interactable === false ? 'disabled' : state;
  return node.brushes?.[actual] || node.brushes?.normal || node.svgAsset;
}
export class SvgRenderer {
  constructor(svg) {
    svg.style.userSelect = 'none';
    // A UI scene is a drawing surface, not a host page's stroked line icon.
    svg.setAttribute('data-ui-scene', '');
    svg.style.stroke = 'none';
    this.svg = svg; this.namespace = `r${crypto.randomUUID().replaceAll('-', '')}_`; this.groups = new Map(); this.assetCache = new Map(); this.textWarnings = [];
    this.defs = el('defs'); this.background = el('rect', { 'data-background': '', x: 0, y: 0, stroke: 'none' });
    this.scene = el('g', { 'data-scene': '' });
    svg.replaceChildren(this.defs, this.background, this.scene);
  }
  render(document, layout, { states = new Map(), forcedState = null, motion = false } = {}) {
    const live = new Set(), assetIds = new Set(Object.keys(document.assets));
    this.textWarnings = [];
    attrs(this.svg, { xmlns: 'http://www.w3.org/2000/svg', viewBox: `0 0 ${layout.width} ${layout.height}`, width: layout.width, height: layout.height });
    attrs(this.background, { width: layout.width, height: layout.height, fill: document.viewport.background });
    for (const [id, asset] of Object.entries(document.assets)) {
      const signature = asset.source, config = JSON.stringify([asset.viewBox, asset.scaleMode, asset.slice]);
      const previous = this.assetCache.get(id);
      if (previous?.signature === signature && previous.config === config) continue;
      previous?.group.remove();
      const { group } = scopedSvgContent(asset, this.namespace); this.defs.append(group);
      this.assetCache.set(id, { signature, config, group, stamp: (previous?.stamp || 0) + 1 });
    }
    for (const [id, cached] of this.assetCache) if (!assetIds.has(id)) { cached.group.remove(); this.assetCache.delete(id); }
    const paint = (entry, parentElement, index = 0, inButton = false, ownerState = 'normal') => {
      if (!entry) return;
      const node = entry.node; live.add(node.id);
      let record = this.groups.get(node.id);
      if (!record) {
        const group = el('g', { 'data-node-id': node.id, 'data-node-type': node.type });
        const visual = el('g', { 'pointer-events': 'none' }), children = el('g');
        const hit = el('rect', { fill: 'transparent', stroke: 'none', 'data-hit': '', 'pointer-events': 'all' });
        const clip = el('clipPath', { id: `clip_${this.namespace}${node.id.replaceAll(':', '_')}` }), clipRect = el('rect');
        clip.append(clipRect); this.defs.append(clip);
        group.append(visual, hit, children); record = { group, visual, children, hit, clip, clipRect, signature: '' }; this.groups.set(node.id, record);
      }
      const { group, hit, children, clip, clipRect } = record;
      if (parentElement.children[index] !== group) parentElement.insertBefore(group, parentElement.children[index] || null);
      attrs(group, { transform: `translate(${entry.x} ${entry.y})${entry.localScale ? ` scale(${entry.localScale})` : ''}`, display: entry.visible ? null : 'none', opacity: node.style.opacity, 'data-node-type': node.type, 'data-binding': node.binding || null });
      if (node.type === 'Button') attrs(group, { role: 'button', tabindex: node.interactable === false ? -1 : 0, 'aria-label': node.name, 'aria-disabled': node.interactable === false ? 'true' : 'false' });
      attrs(hit, { width: entry.width, height: entry.height, 'pointer-events': node.locked || (motion && inButton && node.type !== 'Button') ? 'none' : 'all' });
      attrs(clipRect, { width: entry.width, height: entry.height, rx: node.style.radius });
      attrs(group, { 'clip-path': node.style.clip || node.type === 'ScrollBox' ? `url(#${clip.id})` : null });
      const state = forcedState || states.get(node.id) || (node.motion?.dismissOnHover ? ownerState : 'normal');
      const rasterGrid = { x: entry.globalX, y: entry.globalY, scale: entry.scale || 1 };
      const signature = JSON.stringify([entry.width, entry.height, rasterGrid, node.style, node.text, node.src, node.svgAsset, node.value, node.brushes, state, node.interactable, ...[node.svgAsset, buttonAsset(node, state)].map(id => this.assetCache.get(id)?.stamp)]);
      if (record.signature !== signature) {
        const before = this.textWarnings.length;
        record.visual.replaceChildren(...this.paintNode(node, entry.width, entry.height, document.assets, state, rasterGrid)); record.signature = signature;
        record.textWarnings = this.textWarnings.slice(before);
      } else if (entry.visible) {
        this.textWarnings.push(...(record.textWarnings || []));
      }
      (entry.paintChildren || []).forEach((id, index) => paint(layout.entries.get(id), children, index, inButton || node.type === 'Button', node.type === 'Button' ? state : ownerState));
      animateVisual(record, node, state, motion, entry.visible, document.motions, entry);
      if(node.type==='ScrollBox'&&!record.scrollbar){record.scrollbar=el('g',{'data-scrollbar':node.id});record.track=el('rect',{width:5,fill:'#1b2733',rx:3});record.thumb=el('rect',{width:5,fill:'#526679',rx:3});record.scrollbar.append(record.track,record.thumb);group.append(record.scrollbar);}
      if(record.scrollbar){
      const extent=node.type==='ScrollBox'?Math.max(entry.height,...entry.paintChildren.map(id=>{const child=layout.entries.get(id);return child.y+child.height+(node.layout.scrollOffset||0);})):0;
      const scrollable=extent>entry.height+1,thumbHeight=Math.max(24,entry.height*entry.height/Math.max(1,extent));
      attrs(record.scrollbar,{display:scrollable?null:'none',transform:`translate(${Math.max(0,entry.width-6)} 0)`,'pointer-events':scrollable?'all':'none'});
      attrs(record.track,{height:entry.height});attrs(record.thumb,{height:thumbHeight,y:Math.max(0,Math.min(entry.height-thumbHeight,(node.layout.scrollOffset||0)/Math.max(1,extent-entry.height)*(entry.height-thumbHeight)))});
      }
    };
    paint(layout.entries.get(document.root.id), this.scene);
    for (const [id, record] of this.groups) if (!live.has(id)) { stopVisual(record); record.group.remove(); record.clip.remove(); this.groups.delete(id); }
    return this;
  }
  paintNode(node, w, h, assets, state, rasterGrid = {}) {
    const s = node.style, result = [];
    const text = node.type === 'TextBlock' || node.text ? this.paintText(node, w, h) : null;
    const fitBackground = node.type === 'TextBlock' && s.textBackgroundFit;
    const visibleText = !fitBackground || String(node.text).trim().length > 0;
    const padX = Number(s.textPaddingX ?? s.textPadding) || 0;
    const backgroundWidth = fitBackground ? Math.min(w, Math.ceil(Math.max(0, ...[...text.children].map(span => measureText(span.textContent, {...s,fontSize:Number(text.getAttribute('font-size'))})))) + padX * 2) : w;
    const backgroundX = fitBackground ? s.textAlign === 'right' ? w - backgroundWidth : s.textAlign === 'center' ? (w - backgroundWidth) / 2 : 0 : 0;
    const assetId = node.type === 'Button' ? buttonAsset(node, state) : node.svgAsset;
    if (assetId && assets[assetId]) result.push(assetGraphic(assets[assetId], w, h, this.namespace, rasterGrid));
    else if (visibleText && (s.fill !== 'transparent' || s.strokeWidth > 0)) result.push(el('rect', { x: backgroundX, width: backgroundWidth, height: h, rx: Math.min(s.radius, backgroundWidth / 2, h / 2), fill: s.fill, stroke: s.stroke, 'stroke-width': s.strokeWidth }));
    if (node.type === 'Image' && safeImageUrl(node.src)) result.push(el('image', { width: w, height: h, href: node.src, preserveAspectRatio: s.objectFit === 'fill' ? 'none' : s.objectFit === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet' }));
    if (node.type === 'ProgressBar') {
      const inset = Math.max(0, s.progressPadding ?? Math.min(s.strokeWidth + 3, Math.max(0, (h - 1) / 2))), innerW = Math.max(0, w - inset * 2), innerH = Math.max(0, h - inset * 2);
      result.push(el('rect', { x: inset, y: inset, width: innerW * Math.max(0, Math.min(1, node.value)), height: innerH, fill: s.color, rx: Math.min(s.radius, innerH / 2) }));
    }
    if (text) result.push(text);
    return result;
  }
  paintText(node, width, height) {
    const s = node.style, p = Number(s.textPadding) || 0, px=Number(s.textPaddingX??p)||0,py=Number(s.textPaddingY??p)||0,w = Math.max(0, width - 2 * px), h = Math.max(0, height - 2 * py);
    let size = s.fontSize, lines = [], lineHeight;
    const build = () => {
      lines = [];
      for (const paragraph of String(node.text).split('\n')) {
        if (!s.wrap) { lines.push(paragraph); continue; }
        let line = '';
        for (const char of paragraph) {
          if (line && measureText(line + char, { ...s, fontSize: size }) > w) { lines.push(line); line = char; }
          else line += char;
        }
        lines.push(line);
      }
      lineHeight = s.lineHeight ? s.lineHeight * size / s.fontSize : size * 1.4;
    };
    build();
    if (s.textOverflow === 'shrink') {
      while (size > 6 && (lines.length * lineHeight > h || lines.some(l => measureText(l, { ...s, fontSize: size }) > w))) { size -= .5; build(); }
    }
    if (s.textOverflow === 'ellipsis') {
      lines = lines.slice(0, Math.max(1, Math.floor(h / lineHeight)));
      lines = lines.map(line => { if (measureText(line, { ...s, fontSize: size }) <= w) return line; let chars = [...line]; while (chars.length && measureText(chars.join('') + '…', { ...s, fontSize: size }) > w) chars.pop(); return chars.join('') + '…'; });
    }
    if (lines.length * lineHeight > h + 1 || lines.some(l => measureText(l, { ...s, fontSize: size }) > w + 1)) this.textWarnings.push({ id: node.id, message: `${node.name}: 文字超出安全区域` });
    const x = s.textAlign === 'center' ? width / 2 : s.textAlign === 'right' ? width - px : px;
    const total = lines.length * lineHeight;
    const top = s.verticalAlign === 'top' ? py : s.verticalAlign === 'bottom' ? height - py - total : (height - total) / 2;
    const text = el('text', { x, fill: s.color, stroke: 'none', 'font-family': s.fontFamily, 'font-size': size, 'font-weight': s.fontWeight, 'letter-spacing': s.letterSpacing || null, 'text-anchor': s.textAlign === 'center' ? 'middle' : s.textAlign === 'right' ? 'end' : 'start', 'xml:space': 'preserve' });
    lines.forEach((line, i) => { const span = el('tspan', { x, y: top + i * lineHeight + size * 1.05 }); span.textContent = line; text.append(span); });
    return text;
  }
  exportSvg() {
    const copy = this.svg.cloneNode(true);
    copy.querySelectorAll('[data-editor-overlay],[data-motion-edge]').forEach(el => el.remove());
    copy.querySelectorAll('[data-hit]').forEach(el => el.remove());
    copy.removeAttribute('style'); copy.removeAttribute('class'); copy.removeAttribute('tabindex');
    return new XMLSerializer().serializeToString(copy);
  }
}

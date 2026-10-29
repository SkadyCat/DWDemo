import { finite as n, insets } from './model.js';

export function resolveCanvasSlot(slot, parentWidth, parentHeight, desired = { width: 0, height: 0 }) {
  const a = slot.anchors, o = slot.offsets, align = slot.alignment;
  const sx = a.maxX !== a.minX, sy = a.maxY !== a.minY;
  const width = Math.max(0, sx ? (a.maxX - a.minX) * parentWidth - o.left - o.right : slot.autoSize ? desired.width : o.right);
  const height = Math.max(0, sy ? (a.maxY - a.minY) * parentHeight - o.top - o.bottom : slot.autoSize ? desired.height : o.bottom);
  return { x: a.minX * parentWidth + o.left - (sx ? 0 : width * align.x), y: a.minY * parentHeight + o.top - (sy ? 0 : height * align.y), width, height };
}
// Inverse of resolveCanvasSlot. Used by dragging, resizing and anchor presets.
export function slotForRect(slot, rect, parentWidth, parentHeight) {
  const a = slot.anchors, align = slot.alignment;
  const sx = a.maxX !== a.minX, sy = a.maxY !== a.minY;
  const left = rect.x - a.minX * parentWidth + (sx ? 0 : rect.width * align.x);
  const top = rect.y - a.minY * parentHeight + (sy ? 0 : rect.height * align.y);
  return { left, top, right: sx ? (a.maxX - a.minX) * parentWidth - left - rect.width : rect.width, bottom: sy ? (a.maxY - a.minY) * parentHeight - top - rect.height : rect.height };
}

export function computeLayout(doc, { width = doc.viewport.width, height = doc.viewport.height, measureText } = {}) {
  const entries = new Map(), desiredCache = new Map(), warnings = [];
  const measure = node => {
    if (desiredCache.has(node.id)) return desiredCache.get(node.id);
    if (node.visibility === 'collapsed') return { width: 0, height: 0 };
    const p = node.layout.padding || insets(), children = node.children.filter(c => c.visibility !== 'collapsed');
    const sizes = children.map(c => { const d = measure(c), m = c.slot.padding; return { width: d.width + m.left + m.right, height: d.height + m.top + m.bottom }; });
    let w = n(node.layout.width, 240), h = n(node.layout.height, 120);
    if (node.type === 'TextBlock') {
      const lines = String(node.text).split('\n'), font = n(node.style.fontSize, 18);
      w = Math.max(0, ...lines.map(text => measureText ? measureText(text, node.style) : [...text].reduce((sum, c) => sum + (c.charCodeAt(0) > 255 ? font : font * .56), 0))) + 2 * n(node.style.textPaddingX??node.style.textPadding);
      h = lines.length * font * 1.4 + 2 * n(node.style.textPaddingY??node.style.textPadding);
    } else if (['HorizontalBox', 'VerticalBox', 'ScrollBox'].includes(node.type)) {
      const horizontal = node.type === 'HorizontalBox' || (node.type === 'ScrollBox' && node.layout.orientation === 'horizontal');
      const sum = key => sizes.reduce((s, d) => s + d[key], 0) + Math.max(0, sizes.length - 1) * n(node.layout.gap);
      const max = key => Math.max(0, ...sizes.map(d => d[key]));
      w = horizontal ? sum('width') : max('width'); h = horizontal ? max('height') : sum('height');
    } else if (['Overlay', 'Border', 'Button', 'SizeBox', 'ScaleBox'].includes(node.type)) {
      if (sizes.length) { w = Math.max(...sizes.map(d => d.width)); h = Math.max(...sizes.map(d => d.height)); }
    } else if (node.type === 'CanvasPanel' && children.length) {
      w = Math.max(0, ...children.map(c => c.slot.offsets.left + (c.slot.autoSize ? measure(c).width : c.slot.offsets.right)));
      h = Math.max(0, ...children.map(c => c.slot.offsets.top + (c.slot.autoSize ? measure(c).height : c.slot.offsets.bottom)));
    }
    w += p.left + p.right; h += p.top + p.bottom;
    if (node.type === 'SizeBox') { if (node.layout.widthOverride != null) w = n(node.layout.widthOverride); if (node.layout.heightOverride != null) h = n(node.layout.heightOverride); }
    w = Math.max(n(node.layout.minWidth), Math.min(n(node.layout.maxWidth, Infinity), w));
    h = Math.max(n(node.layout.minHeight), Math.min(n(node.layout.maxHeight, Infinity), h));
    const result = { width: Math.max(0, w), height: Math.max(0, h) }; desiredCache.set(node.id, result); return result;
  };
  const fit = (space, desired, alignment) => {
    const size = alignment === 'fill' ? space : Math.min(space, desired);
    return { size: Math.max(0, size), offset: alignment === 'center' ? (space - size) / 2 : alignment === 'right' || alignment === 'bottom' ? space - size : 0 };
  };
  const arrange = (node, rect, parent, inheritedVisible = true, scale = 1) => {
    const visible = inheritedVisible && node.visibility === 'visible';
    const entry = { node, parentId: parent?.node.id || null, ...rect, scale, globalX: (parent?.globalX || 0) + rect.x * (parent?.scale || 1), globalY: (parent?.globalY || 0) + rect.y * (parent?.scale || 1), visible };
    entry.globalWidth = rect.width * scale; entry.globalHeight = rect.height * scale;
    entries.set(node.id, entry);
    if (node.visibility === 'collapsed') return;
    if (rect.width < 0 || rect.height < 0) warnings.push({ id: node.id, message: '负尺寸' });
    const p = node.layout.padding || insets();
    const innerW = Math.max(0, rect.width - p.left - p.right), innerH = Math.max(0, rect.height - p.top - p.bottom);
    const children = node.children.filter(c => c.visibility !== 'collapsed');
    const ordered = children.map((c, i) => ({ c, i })).sort((a, b) => a.c.slot.zOrder - b.c.slot.zOrder || a.i - b.i).map(v => v.c);
    entry.paintChildren = ordered.map(c => c.id);
    const linear = ['HorizontalBox', 'VerticalBox', 'ScrollBox'].includes(node.type);
    const horizontal = node.type === 'HorizontalBox' || (node.type === 'ScrollBox' && node.layout.orientation === 'horizontal');
    let cursor = node.type === 'ScrollBox' ? -Math.max(0, n(node.layout.scrollOffset)) : 0;
    let remaining = horizontal ? innerW : innerH, totalFill = 0;
    if (linear) {
      remaining -= Math.max(0, children.length - 1) * n(node.layout.gap);
      for (const c of children) {
        const m = c.slot.padding, d = measure(c);
        remaining -= horizontal ? m.left + m.right : m.top + m.bottom;
        if (c.slot.sizeRule === 'fill' && node.type !== 'ScrollBox') totalFill += Math.max(0, n(c.slot.fill, 1));
        else remaining -= horizontal ? d.width : d.height;
      }
    }
    // Linear order belongs to the panel, independently of paint z-order.
    for (const child of children) {
      const s = child.slot, m = s.padding, d = measure(child);
      let r, childScale = scale;
      if (node.type === 'CanvasPanel') {
        r = resolveCanvasSlot(s, innerW, innerH, d); r.x += p.left; r.y += p.top;
      } else if (node.type === 'ScaleBox') {
        const availableW = Math.max(0, innerW - m.left - m.right), availableH = Math.max(0, innerH - m.top - m.bottom);
        let k = node.layout.stretch === 'fill' ? Math.max(availableW / (d.width || 1), availableH / (d.height || 1)) : Math.min(availableW / (d.width || 1), availableH / (d.height || 1));
        if (node.layout.stretch === 'user') k = n(node.layout.scale, 1);
        if (node.layout.stretch === 'down') k = Math.min(1, k);
        k = Math.max(.0001, k);
        const ax = s.horizontalAlignment, ay = s.verticalAlignment;
        const offset = (alignment, space, size) => alignment === 'left' || alignment === 'top' ? 0 : alignment === 'right' || alignment === 'bottom' ? space - size : (space - size) / 2;
        r = { x: p.left + m.left + offset(ax, availableW, d.width * k), y: p.top + m.top + offset(ay, availableH, d.height * k), width: d.width, height: d.height, localScale: k };
        childScale = scale * k;
      } else if (linear) {
        const main = s.sizeRule === 'fill' && totalFill > 0 && node.type !== 'ScrollBox' ? Math.max(0, remaining) * Math.max(0, n(s.fill, 1)) / totalFill : horizontal ? d.width : d.height;
        const cross = fit(Math.max(0, (horizontal ? innerH - m.top - m.bottom : innerW - m.left - m.right)), horizontal ? d.height : d.width, horizontal ? s.verticalAlignment : s.horizontalAlignment);
        r = horizontal ? { x: p.left + cursor + m.left, y: p.top + m.top + cross.offset, width: main, height: cross.size } : { x: p.left + m.left + cross.offset, y: p.top + cursor + m.top, width: cross.size, height: main };
        cursor += main + (horizontal ? m.left + m.right : m.top + m.bottom) + n(node.layout.gap);
      } else {
        const x = fit(Math.max(0, innerW - m.left - m.right), d.width, s.horizontalAlignment);
        const y = fit(Math.max(0, innerH - m.top - m.bottom), d.height, s.verticalAlignment);
        r = { x: p.left + m.left + x.offset, y: p.top + m.top + y.offset, width: x.size, height: y.size };
      }
      arrange(child, r, entry, visible, childScale);
    }
  };
  measure(doc.root);
  arrange(doc.root, { x: 0, y: 0, width, height }, null);
  return { entries, desired: desiredCache, warnings, width, height };
}

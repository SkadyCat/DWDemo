import { createDocument, createNode, insets } from '../core/model.js';
import { makeSvgAsset } from '../assets/svg.js';

const px = value => Number.parseFloat(value) || 0;
export async function importHtml(source, { name = 'HTML Reconstruction', width = 1440, height = 900 } = {}) {
  if (source.length > 4 * 1024 * 1024) throw new Error('HTML 上限为 4 MB');
  const parsed = new DOMParser().parseFromString(source, 'text/html'), warnings = [];
  if (parsed.querySelector('link[rel="stylesheet"]')) warnings.push('外部样式表未加载，请把 CSS 内联到 HTML 中');
  parsed.querySelectorAll('script,iframe,object,embed,link,base,meta[http-equiv],video,audio,form').forEach(e => e.remove());
  for (const element of parsed.querySelectorAll('*')) for (const attr of [...element.attributes]) if (/^on/i.test(attr.name) || ['srcdoc', 'action', 'formaction'].includes(attr.name)) element.removeAttribute(attr.name);
  const csp = parsed.createElement('meta'); csp.httpEquiv = 'Content-Security-Policy'; csp.content = "default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:;"; parsed.head.prepend(csp);
  const frame = document.createElement('iframe'); frame.setAttribute('sandbox', 'allow-same-origin'); frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, { position: 'fixed', left: '-30000px', top: '0', width: `${width}px`, height: `${height}px`, border: 'none', pointerEvents: 'none' });
  const loaded = new Promise((resolve, reject) => { frame.onload = resolve; frame.onerror = () => reject(new Error('HTML 测量窗口加载失败')); });
  frame.srcdoc = '<!DOCTYPE html>' + parsed.documentElement.outerHTML; document.body.append(frame);
  try {
    await loaded;
    await frame.contentDocument.fonts.ready;
    const inner = frame.contentDocument, win = frame.contentWindow;
    const project = createDocument(name); project.viewport = { width, height, background: win.getComputedStyle(inner.body).backgroundColor || 'transparent' };
    const nameOf = e => e.getAttribute('data-name') || e.id || e.getAttribute('aria-label') || `${e.localName}${e.classList.length ? '_' + [...e.classList].slice(0, 2).join('_') : ''}`;
    let count = 0;
    const convert = (element, parentRect) => {
      if (++count > 3000) throw new Error('HTML 超过 3000 个元素，请缩小导入范围');
      const style = win.getComputedStyle(element), r = element.getBoundingClientRect();
      if (style.display === 'none' || ['style', 'head', 'meta', 'title'].includes(element.localName)) return null;
      if (!r.width && !r.height) return null;
      const isSvg = element.localName === 'svg', isImage = element.localName === 'img', isButton = element.localName === 'button';
      const hasElements = element.children.length > 0;
      const type = isSvg ? 'Svg' : isImage ? 'Image' : isButton ? 'Button' : !hasElements && element.textContent.trim() ? 'TextBlock' : 'CanvasPanel';
      const node = createNode(type, { name: nameOf(element) });
      const x = r.left - parentRect.left, y = r.top - parentRect.top;
      node.slot.offsets = { left: x, top: y, right: r.width, bottom: r.height };
      node.layout.width = r.width; node.layout.height = r.height;
      Object.assign(node.style, { fill: style.backgroundColor, stroke: style.borderTopColor, strokeWidth: px(style.borderTopWidth), radius: px(style.borderTopLeftRadius), color: style.color, fontFamily: style.fontFamily, fontWeight: px(style.fontWeight), fontSize: px(style.fontSize), textAlign: ['left', 'center', 'right'].includes(style.textAlign) ? style.textAlign : 'left', opacity: px(style.opacity), wrap: style.whiteSpace !== 'nowrap', verticalAlign: 'top', clip: style.overflow === 'hidden', textPadding: 0 });
      node.visibility = style.visibility === 'hidden' ? 'hidden' : 'visible';
      if (style.transform !== 'none') warnings.push(`${node.name}: CSS transform 已测量为外接矩形，不保留旋转 / 倾斜`);
      if (style.boxShadow !== 'none' || style.filter !== 'none') warnings.push(`${node.name}: CSS 阴影 / filter 未转换`);
      if (!['none', ''].includes(style.backgroundImage)) warnings.push(`${node.name}: CSS 背景图 / 渐变需替换为 SVG 资产`);
      if (isSvg) {
        const asset = makeSvgAsset(node.name, element.outerHTML, { scaleMode: 'stretch' }); project.assets[asset.id] = asset; node.svgAsset = asset.id;
      } else if (isImage) {
        if (/^data:image\/(png|jpeg|webp|gif);base64,/i.test(element.getAttribute('src') || '')) node.src = element.getAttribute('src');
        else warnings.push(`${node.name}: 外部图片未加载，请导入内嵌图片或 SVG`);
      } else if (type === 'TextBlock') {
        node.text = element.textContent.trim();
        const left = px(style.paddingLeft), top = px(style.paddingTop), right = px(style.paddingRight), bottom = px(style.paddingBottom);
        node.style.textPadding = 0;
        // Explicit text child keeps background/border ownership separate from its safe region.
        if (left || top || right || bottom || node.style.fill !== 'rgba(0, 0, 0, 0)') {
          const label = createNode('TextBlock', { name: `${node.name}_Text`, text: node.text, style: { ...node.style, fill: 'transparent', strokeWidth: 0 }, slot: { offsets: { left, top, right: Math.max(0, r.width - left - right), bottom: Math.max(0, r.height - top - bottom) } } });
          node.type = 'CanvasPanel'; node.text = ''; node.children = [label];
        }
      } else {
        node.children = [...element.children].map(child => convert(child, r)).filter(Boolean);
        for (const child of element.childNodes) if (child.nodeType === 3 && child.textContent.trim()) {
          const range = inner.createRange(); range.selectNodeContents(child); const tr = range.getBoundingClientRect();
          if (tr.width && tr.height) node.children.push(createNode('TextBlock', { name: `${node.name}_Text`, text: child.textContent.trim(), style: { ...node.style, fill: 'transparent', strokeWidth: 0, wrap: true }, slot: { offsets: { left: tr.left - r.left, top: tr.top - r.top, right: tr.width, bottom: tr.height + 4 } } }));
        }
        if (isButton) {
          const content = createNode('CanvasPanel', { name: `${node.name}_Content`, children: node.children }); node.children = [content];
        }
      }
      node.source = { htmlTag: element.localName, htmlId: element.id, importMode: 'measured-snapshot' };
      return node;
    };
    const body = inner.body;
    const rect = { left: 0, top: 0, width, height };
    project.root.children = [...body.children].map(e => convert(e, rect)).filter(Boolean);
    project.root.name = name.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_');
    warnings.unshift('HTML 导入为当前视口的可编辑测量快照；响应式行为请在 Slot 中设置锚点 / 面板规则。');
    project.provenance = { kind: 'html-measured-snapshot', viewport: { width, height }, importedAt: new Date().toISOString(), warnings: [...new Set(warnings)] };
    return { document: project, warnings: project.provenance.warnings };
  } finally { frame.remove(); }
}

import { createDocument, createNode as node, uid, insets } from '../core/model.js';

const svg = body => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">${body}</svg>`;
const panelSvg = (fill, border, accent = '') => svg(`<defs><linearGradient id="bg" x2="0" y2="1"><stop stop-color="${fill}"/><stop offset="1" stop-color="#101d2b"/></linearGradient></defs><rect x="1" y="1" width="94" height="94" rx="12" fill="url(#bg)" stroke="${border}" stroke-width="2"/>${accent ? `<path d="M13 2h70" stroke="${accent}" stroke-width="2"/>` : ''}`);
const buttonSvg = (fill, stroke) => svg(`<rect x="1" y="1" width="94" height="94" rx="10" fill="${fill}" stroke="${stroke}" stroke-width="2"/><path d="M12 3h72" stroke="white" stroke-opacity=".12"/>`);
const iconSvg = (body, color) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><g fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;
function asset(name, source, options = {}) { return { id: uid(), name, source, viewBox: [0, 0, 96, 96], scaleMode: 'nine-slice', slice: insets(14), ...options }; }
function rect(n, x, y, w, h) { Object.assign(n.slot.offsets, { left: x, top: y, right: w, bottom: h }); return n; }
function text(name, content, x, y, w, h, props = {}) { return rect(node('TextBlock', { name, text: content, style: { fontSize: 18, wrap: false, textOverflow: 'shrink', ...props } }), x, y, w, h); }
function stretch(n, left, top, right, bottom) { Object.assign(n.slot.anchors, { minX: 0, minY: 0, maxX: 1, maxY: 1 }); Object.assign(n.slot.offsets, { left, top, right, bottom }); return n; }
function instance(prefab, name, x, y, w, h, overrides = {}) { return rect(node('PrefabInstance', { name, prefabId: prefab.id, overrides, layout: { width: w, height: h } }), x, y, w, h); }

export function starterProject() {
  const doc = createDocument('Expedition UI');
  const assets = [
    asset('Panel / Deep slate', panelSvg('#182a3b', '#304456')),
    asset('Card / Normal', panelSvg('#1b2c3c', '#34495b')),
    asset('Card / Hover', panelSvg('#233f50', '#65ccb2', '#8be4c5')),
    asset('Card / Pressed', panelSvg('#142e32', '#3db596')),
    asset('Button / Normal', buttonSvg('#387b68', '#70baa1')),
    asset('Button / Hover', buttonSvg('#478f78', '#a3e4c8')),
    asset('Button / Pressed', buttonSvg('#285e50', '#71baa1')),
    asset('Button / Disabled', buttonSvg('#25323c', '#3a4955')),
    asset('Tag / Jade', buttonSvg('#203b37', '#376357')),
    asset('Icon / Compass', iconSvg('<circle cx="32" cy="32" r="23"/><path d="m40 24-5 11-11 5 5-11Z"/><path d="M32 4v8m0 40v8M4 32h8m40 0h8"/>', '#87d9c2'), { scaleMode: 'contain', viewBox: [0, 0, 64, 64] }),
    asset('Icon / Lantern', iconSvg('<path d="M24 17h16l6 29H18l6-29ZM27 17V9h10v8M16 46h32M26 52h12M25 24l7 16 7-16"/><path d="M32 25v10"/>', '#e8c486'), { scaleMode: 'contain', viewBox: [0, 0, 64, 64] }),
    asset('Icon / Crystal', iconSvg('<path d="m32 6 18 17-7 28-11 7-11-7-7-28L32 6Z"/><path d="m32 6 7 21-7 31-7-31 7-21ZM14 23l11 4 14 0 11-4"/>', '#b9abec'), { scaleMode: 'contain', viewBox: [0, 0, 64, 64] }),
    asset('Icon / Flask', iconSvg('<path d="M25 8h14M27 8v17L15 46a7 7 0 0 0 6 10h22a7 7 0 0 0 6-10L37 25V8M23 38h18M25 46h4m7 3h2"/>', '#95c6e7'), { scaleMode: 'contain', viewBox: [0, 0, 64, 64] }),
  ];
  assets.forEach(a => { doc.assets[a.id] = a; });
  doc.folders = {
    'svg-panels': { id: 'svg-panels', name: '面板与卡片', kind: 'svg', parentId: '' },
    'svg-buttons': { id: 'svg-buttons', name: '按钮状态', kind: 'svg', parentId: '' },
    'svg-icons': { id: 'svg-icons', name: '图标', kind: 'svg', parentId: '' },
    'prefab-controls': { id: 'prefab-controls', name: '通用控件', kind: 'prefab', parentId: '' },
    'prefab-cards': { id: 'prefab-cards', name: '界面卡片', kind: 'prefab', parentId: '' },
  };
  assets.forEach((a, i) => { a.folderId = i < 4 ? 'svg-panels' : i < 9 ? 'svg-buttons' : 'svg-icons'; });
  const [panel, normal, hover, pressed, btn, btnH, btnP, btnD, tag, compass, lantern, crystal, flask] = assets;
  const brushes = { normal: btn.id, hovered: btnH.id, pressed: btnP.id, disabled: btnD.id };
  const label = text('Label', '开始远征', 0, 0, 240, 48, { fontSize: 17, fontWeight: 600, color: '#e7fff1', textAlign: 'center', textPadding: 12 });
  label.id = 'action-label'; label.slot.horizontalAlignment = 'fill'; label.slot.verticalAlignment = 'fill';
  const action = { id: 'prefab-action', name: 'ActionButton', width: 240, height: 48, root: node('Button', { name: 'ActionButton', brushes, children: [label], layout: { width: 240, height: 48 } }) };
  const rarityLabel = text('RarityLabel', '探索工具', 0, 0, 88, 24, { color: '#9ecfbc', fontSize: 11, textAlign: 'center', textPadding: 6 }); rarityLabel.id = 'tag-label';
  const rarity = { id: 'prefab-rarity', name: 'RarityTag', width: 88, height: 24, root: node('Border', { name: 'RarityTag', svgAsset: tag.id, children: [rarityLabel], layout: { width: 88, height: 24 } }) };
  const cardCanvas = node('CanvasPanel', { name: 'CardContent', children: [
    rect(node('Svg', { id: 'item-icon', name: 'Icon', svgAsset: compass.id }), 20, 18, 56, 56),
    text('Index', '01', 156, 20, 40, 24, { fontSize: 12, textAlign: 'right', color: '#688499' }),
    text('ItemName', '星图罗盘', 20, 88, 176, 28, { fontSize: 19, fontWeight: 600 }),
    text('ItemDescription', '在未知之地找到方向', 20, 121, 180, 24, { fontSize: 12, color: '#8fa8b9' }),
    instance(rarity, 'RarityTag', 20, 158, 88, 24),
  ] });
  cardCanvas.children[2].id = 'item-name'; cardCanvas.children[3].id = 'item-description'; cardCanvas.children[1].id = 'item-index';
  for (const label of [cardCanvas.children[2], cardCanvas.children[3]]) { label.slot.anchors.maxX = 1; label.slot.offsets.right = 20; }
  cardCanvas.children[1].slot.anchors.minX = cardCanvas.children[1].slot.anchors.maxX = 1; cardCanvas.children[1].slot.alignment.x = 1; cardCanvas.children[1].slot.offsets.left = -20;
  const item = { id: 'prefab-item', name: 'ItemCard', width: 220, height: 202, root: node('Button', { name: 'ItemCard', brushes: { normal: normal.id, hovered: hover.id, pressed: pressed.id, disabled: normal.id }, children: [cardCanvas], layout: { width: 220, height: 202 } }) };
  [action, rarity, item].forEach(p => { doc.prefabs[p.id] = p; });
  action.folderId = rarity.folderId = 'prefab-controls'; item.folderId = 'prefab-cards';
  const path = childId => `${item.root.id}/${cardCanvas.id}/${childId}`;
  const row = node('HorizontalBox', { name: 'EquipmentRow', layout: { gap: 16 }, children: [
    instance(item, 'CompassCard', 0, 0, 220, 202),
    instance(item, 'LanternCard', 0, 0, 220, 202, { [path('item-name')]: { text: '余烬提灯' }, [path('item-description')]: { text: '照亮下一段旅途' }, [path('item-icon')]: { svgAsset: lantern.id }, [path('item-index')]: { text: '02' } }),
    instance(item, 'CrystalCard', 0, 0, 220, 202, { [path('item-name')]: { text: '回响晶石' }, [path('item-description')]: { text: '收集遗迹中的回声' }, [path('item-icon')]: { svgAsset: crystal.id }, [path('item-index')]: { text: '03' } }),
  ] });
  row.children.forEach(c => { c.slot.sizeRule = 'fill'; });
  const content = node('CanvasPanel', { name: 'EquipmentCanvas', children: [
    text('SectionEyebrow', 'YOUR NEXT CHAPTER', 0, 0, 550, 24, { color: '#73b69e', fontSize: 11, fontWeight: 600 }),
    text('SectionTitle', '准备好，向未知出发。', 0, 34, 600, 48, { fontSize: 32, fontWeight: 600, color: '#edf3ed' }),
    text('SectionSubtitle', '每一次探索，都从一份精心准备的行囊开始。', 0, 94, 650, 26, { fontSize: 15, color: '#91a6b5' }),
    stretch(row, 0, 160, 0, 186),
    text('ProgressTitle', '远征准备', 0, 408, 300, 24, { fontSize: 14, color: '#adc0cc' }),
    stretch(node('ProgressBar', { name: 'Readiness', value: .72, style: { fill: '#152531', color: '#70bfa2', radius: 6 }, slot: { anchors: { minX: 0, minY: 0, maxX: 1, maxY: 0 }, offsets: { left: 0, top: 448, right: 0, bottom: 12 } } }), 0, 448, 0, 92),
  ] });
  // The progress bar uses a horizontal stretch and fixed height.
  content.children[3].slot.anchors.maxY = 0; content.children[3].slot.offsets.bottom = 202;
  content.children[4].slot.anchors.minY = content.children[4].slot.anchors.maxY = 1; content.children[4].slot.offsets.top = -64;
  content.children.at(-1).slot.anchors.minY = content.children.at(-1).slot.anchors.maxY = 1; content.children.at(-1).slot.offsets.top = -24; content.children.at(-1).slot.offsets.bottom = 12;
  const nav = node('VerticalBox', { name: 'Navigation', layout: { width: 168, gap: 14, padding: { left: 0, top: 4, right: 20, bottom: 0 } }, children: [
    node('TextBlock', { name: 'NavLabel', text: '工作区域', layout: { width: 140, height: 30 }, style: { color: '#688295', fontSize: 11, textPadding: 0 } }),
    instance(action, 'EquipmentNav', 0, 0, 148, 46, { [`${action.root.id}/action-label`]: { text: '远征行囊' } }),
    node('TextBlock', { name: 'ArchiveNav', text: '遗迹档案', style: { color: '#a3b3bf', fontSize: 15 }, layout: { width: 148, height: 32 } }),
    node('TextBlock', { name: 'JournalNav', text: '旅人手记', style: { color: '#a3b3bf', fontSize: 15 }, layout: { width: 148, height: 32 } }),
  ] });
  // Text desired height is based on font metrics; use a SizeBox for explicit nav rows.
  content.slot.sizeRule = 'fill'; content.slot.verticalAlignment = 'fill';
  const bodyLayout = node('HorizontalBox', { name: 'BodyLayout', layout: { padding: insets(32), gap: 28 }, children: [nav, content] });
  const body = stretch(node('Border', { name: 'MainPanel', svgAsset: panel.id, children: [bodyLayout] }), 48, 156, 48, 132);
  const header = node('CanvasPanel', { name: 'Header', children: [
    rect(node('Svg', { name: 'BrandMark', svgAsset: compass.id }), 0, 4, 40, 40),
    text('Brand', 'EXPEDITION', 56, 0, 400, 32, { fontSize: 24, fontWeight: 600, color: '#e5eee9' }),
    text('Subtitle', '远征者的工作台', 57, 36, 400, 22, { fontSize: 13, color: '#718d9d' }),
    rect(node('Border', { name: 'WorkspaceBadge', svgAsset: tag.id, slot: { anchors: { minX: 1, minY: 0, maxX: 1, maxY: 0 }, alignment: { x: 1, y: 0 } }, children: [node('TextBlock', { name: 'WorkspaceBadgeText', text: '北境 · 第 07 次远征', style: { fontSize: 12, color: '#add6c5', textAlign: 'center', textPadding: 10, wrap: false } })] }), 0, 10, 184, 36),
  ] });
  header.slot.anchors.maxX = 1; Object.assign(header.slot.offsets, { left: 48, top: 54, right: 48, bottom: 70 });
  const footer = rect(node('CanvasPanel', { name: 'Footer', slot: { anchors: { minX: 0, minY: 1, maxX: 1, maxY: 1 } }, children: [
    text('FooterNote', '行囊已同步 · 3 件探索工具已就绪', 0, 8, 700, 32, { fontSize: 13, color: '#7b98a7' }),
    instance(action, 'StartExpedition', 0, 0, 224, 48),
  ] }), 48, -88, 48, 48);
  footer.children[1].slot.anchors.minX = footer.children[1].slot.anchors.maxX = 1; footer.children[1].slot.alignment.x = 1;
  doc.root.name = 'WBP_Expedition'; doc.root.children = [header, body, footer];
  return doc;
}

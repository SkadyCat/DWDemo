import { createDocument, createNode, insets } from '../../core/model.js';

export const HUD_PROJECT_ID = 'hud-darksteel-20261024';
export const HUD_PREFABS = { slot: 'hud-prefab-ability', quick: 'hud-prefab-consumable', abilities: 'hud-prefab-ability-row', consumables: 'hud-prefab-consumable-row', bar: 'hud-prefab-hotbar', screen: 'hud-prefab-screen' };
const definition = (file, name, width, height, folder, scaleMode = 'stretch', slice = 14) => ({ id: `hud-svg-${file.replace(/\.svg$/, '')}`, file, name, viewBox: [0, 0, width, height], folderId: folder, scaleMode, slice: insets(slice) });
export const HUD_ASSETS = [
  definition('frame-left.svg', '底座 · 左侧折面', 184, 170, 'hud-svg-frame'),
  definition('frame-right.svg', '底座 · 右侧折面', 144, 170, 'hud-svg-frame'),
  definition('backplate.svg', '底座 · 内层暗板', 608, 106, 'hud-svg-frame'),
  definition('status-ring.svg', '装饰 · 半环', 28, 14, 'hud-svg-symbols'),
  definition('gold-pin.svg', '装饰 · 琥珀定位点', 10, 12, 'hud-svg-symbols'),
  definition('plus.svg', '空槽 · 加号', 12, 12, 'hud-svg-symbols'),
  definition('selection.svg', '选中 · 青色辉光描边', 90, 90, 'hud-svg-skills'),
  definition('flame-glyph.svg', '技能 · 烈字矢量图标', 32, 34, 'hud-svg-symbols', 'contain'),
  ...['skill-filled', 'skill-empty', 'consumable'].flatMap(family => ['normal', 'hovered', 'pressed', 'disabled'].map(state => definition(`${family}-${state}.svg`, `${({ 'skill-filled': '已装备技能槽', 'skill-empty': '空技能槽', consumable: '消耗品槽' })[family]} · ${({ normal: 'Normal', hovered: 'Hover', pressed: 'Pressed', disabled: 'Disabled' })[state]}`, family === 'consumable' ? 64 : 74, family === 'consumable' ? 64 : 74, family === 'consumable' ? 'hud-svg-quick' : 'hud-svg-skills', 'nine-slice'))),
];
const assetId = file => HUD_ASSETS.find(a => a.file === file).id;
const brushes = family => Object.fromEntries(['normal', 'hovered', 'pressed', 'disabled'].map(state => [state, assetId(`${family}-${state}.svg`)]));
function rect(type, id, name, x, y, width, height, options = {}) {
  return createNode(type, { id, name, slot: { offsets: { left: x, top: y, right: width, bottom: height } }, layout: { width, height }, ...options });
}
function label(id, name, content, x, y, w, h, style = {}) {
  return rect('TextBlock', id, name, x, y, w, h, { text: content, style: { fontFamily: 'Segoe UI, Microsoft YaHei, sans-serif', color: '#d6dbe4', fontSize: 10.5, wrap: false, textOverflow: 'shrink', ...style } });
}
function graphic(id, name, file, x, y, w, h, props = {}) { return rect('Svg', id, name, x, y, w, h, { svgAsset: assetId(file), locked: true, ...props }); }
function instance(id, name, prefabId, x, y, w, h, overrides = {}) { return rect('PrefabInstance', id, name, x, y, w, h, { prefabId, overrides }); }
function prefab(id, name, width, height, root, folderId) { return { id, name, width, height, root, folderId }; }

export function createHudProject(sources) {
  const project = createDocument('HUD · 暗钢快捷栏'); project.id = HUD_PROJECT_ID;
  project.viewport = { width: 1600, height: 900, background: '#090c12' };
  project.folders = {
    'hud-svg': { id: 'hud-svg', name: 'HUD · 暗钢快捷栏', kind: 'svg', parentId: '' },
    ...Object.fromEntries([['hud-svg-frame', '底座折面'], ['hud-svg-skills', '技能槽与状态'], ['hud-svg-quick', '快捷键槽与状态'], ['hud-svg-symbols', '图标与符号']].map(([id, name]) => [id, { id, name, kind: 'svg', parentId: 'hud-svg' }])),
    'hud-prefabs': { id: 'hud-prefabs', name: 'HUD · 暗钢快捷栏', kind: 'prefab', parentId: '' },
    'hud-prefab-controls': { id: 'hud-prefab-controls', name: '原子控件', kind: 'prefab', parentId: 'hud-prefabs' },
    'hud-prefab-groups': { id: 'hud-prefab-groups', name: '组合栏', kind: 'prefab', parentId: 'hud-prefabs' },
    'hud-prefab-screens': { id: 'hud-prefab-screens', name: '界面', kind: 'prefab', parentId: 'hud-prefabs' },
  };
  for (const { file, ...meta } of HUD_ASSETS) {
    if (!sources[file]) throw new Error(`Missing SVG source: ${file}`);
    project.assets[meta.id] = { ...meta, source: sources[file] };
  }
  const slotContent = rect('CanvasPanel', 'hud-ability-content', '技能槽内容', 0, 0, 74, 74, { children: [
    label('hud-ability-key', '快捷键', '1', 6, 2, 18, 16, { fontSize: 9.5, fontFamily: 'Consolas, monospace', color: '#91a0b5', verticalAlign: 'top', textPadding: 1 }),
    graphic('hud-ability-flame', '技能图标', 'flame-glyph.svg', 21, 9, 32, 34, { visibility: 'collapsed' }),
    graphic('hud-ability-plus', '空槽加号', 'plus.svg', 31, 20, 12, 12),
    label('hud-ability-name', '技能名称', '空槽', 6, 45, 62, 18, { textAlign: 'center', color: '#d1d7e2', fontWeight: 500 }),
    label('hud-ability-equipped', '已装备标记', '装备', 49, 6, 22, 14, { fontSize: 9, fontWeight: 700, color: '#ffc36b', textAlign: 'center', verticalAlign: 'center' }),
    graphic('hud-ability-selected', '独立选中描边', 'selection.svg', -8, -8, 90, 90, { visibility: 'collapsed', slot: { offsets: { left: -8, top: -8, right: 90, bottom: 90 }, zOrder: 10 } }),
  ] });
  slotContent.children[4].visibility = 'collapsed';
  const slotRoot = rect('Button', 'hud-ability-button', '技能槽按钮', 0, 0, 74, 74, { brushes: brushes('skill-empty'), style: { fill: 'transparent' }, children: [slotContent] });
  const quickRoot = rect('Button', 'hud-quick-button', '消耗品槽按钮', 0, 0, 64, 64, { brushes: brushes('consumable'), style: { fill: 'transparent' }, children: [rect('CanvasPanel', 'hud-quick-content', '快捷键槽内容', 0, 0, 64, 64, { children: [label('hud-quick-key', '快捷键', 'Q', 6, 2, 20, 16, { fontSize: 10, fontFamily: 'Consolas, monospace', color: '#909eb0', verticalAlign: 'top', textPadding: 1 })] })] });
  project.prefabs[HUD_PREFABS.slot] = prefab(HUD_PREFABS.slot, '技能槽 · 四态', 74, 74, slotRoot, 'hud-prefab-controls');
  project.prefabs[HUD_PREFABS.quick] = prefab(HUD_PREFABS.quick, '快捷键槽 · 四态', 64, 64, quickRoot, 'hud-prefab-controls');
  const slotPath = id => `hud-ability-button/hud-ability-content/${id}`;
  const skillRow = rect('CanvasPanel', 'hud-ability-row-root', '技能栏 1–4', 0, 0, 314, 74, { children: [1, 2, 3, 4].map((key, i) => {
    const overrides = { 'hud-ability-button': { name: `HUD_Ability_${key}` }, [slotPath('hud-ability-key')]: { text: String(key) } };
    if (key === 1) {
      overrides['hud-ability-button'].brushes = brushes('skill-filled');
      overrides[slotPath('hud-ability-flame')] = { visibility: 'visible' };
      overrides[slotPath('hud-ability-plus')] = { visibility: 'collapsed' };
      overrides[slotPath('hud-ability-name')] = { text: '烈焰爆发', style: { fontSize: 10.5, color: '#d6dce8' } };
      overrides[slotPath('hud-ability-equipped')] = { visibility: 'visible' };
    }
    if (key === 4) overrides[slotPath('hud-ability-selected')] = { visibility: 'visible' };
    return instance(`hud-ability-instance-${key}`, `技能槽 ${key}`, HUD_PREFABS.slot, i * 80, 0, 74, 74, overrides);
  }) });
  const quickRow = rect('CanvasPanel', 'hud-quick-row-root', '消耗品栏 Q E F G', 0, 0, 274, 64, { children: ['Q', 'E', 'F', 'G'].map((key, i) => instance(`hud-quick-instance-${key}`, `快捷键槽 ${key}`, HUD_PREFABS.quick, i * 70, 0, 64, 64, { 'hud-quick-button': { name: `HUD_Consumable_${key}` }, 'hud-quick-button/hud-quick-content/hud-quick-key': { text: key } })) });
  project.prefabs[HUD_PREFABS.abilities] = prefab(HUD_PREFABS.abilities, '技能栏 · 1–4', 314, 74, skillRow, 'hud-prefab-groups');
  project.prefabs[HUD_PREFABS.consumables] = prefab(HUD_PREFABS.consumables, '消耗品栏 · Q E F G', 274, 64, quickRow, 'hud-prefab-groups');
  const context = rect('CanvasPanel', 'hud-context', '参考折面与装饰 · 可独立隐藏', 0, 0, 688, 170, { children: [
    graphic('hud-left-facet', '左侧折面', 'frame-left.svg', 0, 0, 184, 170),
    graphic('hud-right-facet', '右侧折面', 'frame-right.svg', 544, 0, 144, 170),
    graphic('hud-ring', '左上半环', 'status-ring.svg', 0, 0, 28, 14),
    graphic('hud-pin-left', '左侧金色定位点', 'gold-pin.svg', 49, 0, 10, 12),
    graphic('hud-pin-right', '右侧金色定位点', 'gold-pin.svg', 672, 0, 10, 12),
  ] });
  const barRoot = rect('CanvasPanel', 'hud-bar-root', '暗钢快捷栏', 0, 0, 688, 170, { children: [
    graphic('hud-backplate', '内层暗色底板', 'backplate.svg', 80, 64, 608, 106),
    context,
    instance('hud-ability-row-instance', '技能栏', HUD_PREFABS.abilities, 42, 75, 314, 74),
    instance('hud-quick-row-instance', '消耗品栏', HUD_PREFABS.consumables, 374, 83, 274, 64),
    label('hud-control-guide', '操作提示', 'WASD 移动 · 鼠标瞄准 · 左键/空格施法 · 1–4 技能 · Q E F G 消耗品 · Shift 闪避 · V 键性能面板 · 滚轮缩放', 119, 154, 529, 16, { fontSize: 10, color: '#7e838b', fontWeight: 500, verticalAlign: 'center', textPadding: 1 }),
  ] });
  project.prefabs[HUD_PREFABS.bar] = prefab(HUD_PREFABS.bar, '暗钢快捷栏 · 参考尺寸', 688, 170, barRoot, 'hud-prefab-screens');
  const dock = rect('ScaleBox', 'hud-dock-scale', '底部中央 · 等比适应', 24, -20, 24, 340, { slot: { anchors: { minX: 0, maxX: 1, minY: 1, maxY: 1 }, alignment: { x: 0, y: 1 }, offsets: { left: 24, top: -20, right: 24, bottom: 340 } }, layout: { stretch: 'fit' }, children: [instance('hud-hotbar-instance', '暗钢快捷栏实例', HUD_PREFABS.bar, 0, 0, 688, 170)] });
  dock.children[0].slot.verticalAlignment = 'bottom'; dock.children[0].slot.horizontalAlignment = 'center';
  const screenRoot = rect('CanvasPanel', 'hud-screen-root', 'HUD', 0, 0, 1600, 900, { children: [dock] });
  project.prefabs[HUD_PREFABS.screen] = prefab(HUD_PREFABS.screen, 'HUD · 暗钢', 1600, 900, screenRoot, 'hud-prefab-screens');
  project.root = rect('CanvasPanel', 'hud-scene-root', 'HUD 场景', 0, 0, 1600, 900, { children: [instance('hud-screen-instance', 'HUD 实例', HUD_PREFABS.screen, 0, 0, 0, 0)] });
  project.root.children[0].slot.anchors.maxX = project.root.children[0].slot.anchors.maxY = 1;
  project.provenance = { kind: 'svg-reference-reconstruction', reference: '用户提供的 688×170 快捷栏截图', referenceSize: { width: 688, height: 170 }, source: 'src/assets/hud-darksteel/reference.png', backgroundPolicy: { owner: 'review-only', node: 'hud-context', independentlyHideable: true }, warnings: [] };
  return project;
}

export async function loadHudProject() {
  const sources = Object.fromEntries(await Promise.all(HUD_ASSETS.map(async meta => {
    const response = await fetch(`/src/assets/hud-darksteel/svg/${meta.file}`); if (!response.ok) throw new Error(`SVG 加载失败: ${meta.file}`); return [meta.file, await response.text()];
  })));
  return createHudProject(sources);
}

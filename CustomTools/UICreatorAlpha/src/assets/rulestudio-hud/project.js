import { createNode, insets, walk, merge } from '../../core/model.js';
import { HUD_PREFABS } from '../hud-darksteel/project.js';
import { BATTLE_FUNCTIONS, SAMPLE_SKILLS, REFERENCE_SKILL_IDS, SAMPLE_BDS } from './definition.js';
import { SKILL_CHOICE_PREFAB, skillChoicePrefab, skillPickerPrefab } from './skill-picker.js';
import { installBattleSuite } from './suite.js';
import { installMapCoreSelector } from './map-core-selector.js';
import { installCombatLayout } from './combat-layout.js';
import { installPlayerEffects } from './player-effects.js';
import { installInventoryNotices } from './inventory-notices.js';
import { installInventoryCompartments } from './inventory-compartments.js';

export const BATTLE_PREFABS = Object.fromEntries(['resources', 'objective', 'summons', 'builds', 'statistics', 'dps', 'map', 'function', 'rail', 'hotbar', 'picker', 'inventory', 'character', 'loadout', 'hunter', 'settings', 'shop', 'craft', 'tooltip', 'completion', 'death'].map(k => [k, `rs-prefab-${k}`]));
const gold = '#e3cb95', muted = '#8798ad', ink = '#cdd8e8';
const A = file => `rs-svg-${file.replace(/\.svg$/, '')}`;
const brushes = family => Object.fromEntries(['normal', 'hovered', 'pressed', 'disabled'].map(s => [s, A(`${family}-${s}.svg`)]));
const N = (type, id, name, x, y, w, h, props = {}) => createNode(type, { id, name, slot: { offsets: { left: x, top: y, right: w, bottom: h } }, layout: { width: w, height: h }, ...props });
const T = (id, text, x, y, w, h = 20, style = {}, props = {}) => N('TextBlock', id, text, x, y, w, h, { text, locked: true, style: { fontSize: 11, textPadding: 1, color: ink, wrap: false, textOverflow: 'shrink', ...style }, ...props });
const G = (id, file, x, y, w, h, props = {}) => N('Svg', id, file, x, y, w, h, { svgAsset: A(file), locked: true, ...props });
const C = (id, name, w, h, children = [], props = {}) => N('CanvasPanel', id, name, 0, 0, w, h, { children, ...props });
const P = (id, name, w, h, children = [], frame = 'panel.svg', props = {}) => C(id, name, w, h, [G(`${id}-bg`, frame, 0, 0, w, h), ...children], props);
const B = (id, text, x, y, w, h, action, props = {}) => N('Button', id, text, x, y, w, h, { action, brushes: brushes('button'), style: { fill: 'transparent' }, children: [T(`${id}-label`, text, 4, 0, w - 8, h, { textAlign: 'center' })], ...props });
const I = (id, name, prefabId, x, y, w, h, props = {}) => N('PrefabInstance', id, name, x, y, w, h, { prefabId, ...props });
function anchored(node, ax, ay, alignX = ax, alignY = ay) { node.slot.anchors = { minX: ax, maxX: ax, minY: ay, maxY: ay }; node.slot.alignment = { x: alignX, y: alignY }; return node; }
function fill(node, l = 0, t = 0, r = 0, b = 0) { node.slot.anchors = { minX: 0, maxX: 1, minY: 0, maxY: 1 }; node.slot.offsets = { left: l, top: t, right: r, bottom: b }; return node; }
const line = (id, y, w, x = 12) => N('Border', id, '分隔线', x, y, w, 1, { locked: true, style: { fill: '#293544', radius: 0 } });
const bar = (id, name, x, y, w, h, value, color) => N('ProgressBar', id, name, x, y, w, h, { value, binding: name, locked: true, style: { fill: '#1b2832', color, radius: h / 2, strokeWidth: 0, progressPadding: 0 } });
function scroll(id, x, y, w, h, children, itemGap = 5) {
  return N('ScrollBox', id, '滚动内容', x, y, w, h, { layout: { gap: itemGap }, children: children.map(n => { n.slot.horizontalAlignment = 'fill'; return n; }) });
}
function windowRoot(id, title, w, h, children) {
  return P(id, title, w, h, [T(`${id}-title`, title, 18, 10, w - 70, 28, { fontSize: 17, color: gold, fontWeight: 600 }), line(`${id}-head-line`, 52, w - 2, 1), B(`${id}-close`, '×', w - 42, 12, 28, 28, { type: 'close' }), ...children], 'window.svg');
}
function sectionTitle(id, text, x, y, w, sub = '') { return [T(id, text, x, y, w, 22, { color: gold, fontWeight: 600 }), ...(sub ? [T(`${id}-sub`, sub, x, y + 23, w, 20, { color: muted, fontSize: 10 })] : [])]; }

export function installBattleHud(document, sources) {
  document.name = 'HUD · RuleStudio 3D 战斗';
  document.viewport = { width: 1600, height: 900, background: '#090c12' };
  const folders = { 'rs-svg': ['战斗 HUD', 'svg', ''], 'rs-svg-panels': ['面板与状态', 'svg', 'rs-svg'], 'rs-svg-icons': ['功能与物品图标', 'svg', 'rs-svg'], 'rs-prefabs': ['战斗 HUD', 'prefab', ''], 'rs-prefab-parts': ['HUD 组件', 'prefab', 'rs-prefabs'], 'rs-prefab-windows': ['窗口与状态界面', 'prefab', 'rs-prefabs'] };
  for (const [id, [name, kind, parentId]] of Object.entries(folders)) document.folders[id] = { id, name, kind, parentId };
  for (const [file, source] of Object.entries(sources)) {
    const icon = /^(icon-|gem|map-room|portrait|frost|sentinel|potion|poison|currency|sword|selection-filled)/.test(file), size = file.startsWith('icon-') ? 24 : file === 'selection-filled.svg' ? 90 : 96;
    document.assets[A(file)] = { id: A(file), name: `战斗 / ${file.replace('.svg', '')}`, source, viewBox: [0, 0, size, size], scaleMode: icon ? 'contain' : 'nine-slice', slice: insets(12), folderId: icon ? 'rs-svg-icons' : 'rs-svg-panels' };
  }
  const save = (key, name, w, h, root, panel = false) => { const id = BATTLE_PREFABS[key]; document.prefabs[id] = { id, name, width: w, height: h, root, folderId: panel ? 'rs-prefab-windows' : 'rs-prefab-parts' }; return id; };
  save('resources', '玩家资源 · 气血 / 护盾 / 魔力', 236, 126, P('rs-resources', '玩家资源', 236, 126, [
    T('rs-health-title', '气血', 12, 9, 60, 20), T('rs-health-value', '1075 / 1075', 78, 9, 146, 20, { fontFamily: 'Consolas, monospace', textAlign: 'right', fontSize: 14, color: '#a6f5cc' }, { binding: 'health-text' }), bar('rs-health', 'health', 12, 39, 212, 8, 1, '#54df9d'),
    T('rs-shield-title', '护盾', 12, 55, 60, 18, { fontSize: 10 }), T('rs-shield-value', '107 / 107', 78, 55, 146, 18, { fontFamily: 'Consolas, monospace', textAlign: 'right', color: '#9fd8ff' }, { binding: 'shield-text' }), bar('rs-shield', 'shield', 12, 78, 212, 4, 1, '#69bafa'),
    T('rs-mana-title', '魔力', 12, 89, 60, 18, { fontSize: 10 }), T('rs-mana-value', '100 / 100', 78, 89, 146, 18, { fontFamily: 'Consolas, monospace', textAlign: 'right', color: '#b2a8ff' }, { binding: 'mana-text' }), bar('rs-mana', 'mana', 12, 114, 212, 4, 1, '#9584f7'),
  ]));
  save('objective', '爬塔目标与首领气血', 236, 32, C('rs-objective', '爬塔目标', 236, 32, [N('Border', 'rs-objective-bg', '目标底板', 0, 0, 236, 32, { locked: true, style: { fill: '#090d14cc', radius: 0 } }), N('Border', 'rs-objective-accent', '金色侧线', 0, 0, 2, 32, { locked: true, style: { fill: '#d7b270', radius: 0 } }), T('rs-floor', '第 1 层', 9, 4, 55, 24, { fontSize: 14, fontWeight: 700, color: '#f4d59b' }), T('rs-wave', '第 1/3 波 · 7 只 · 不限时', 64, 4, 165, 24, { fontSize: 10 }, { binding: 'objective' })]));
  save('summons', '召唤单位列表', 236, 64, P('rs-summons', '召唤单位列表', 236, 64, [T('rs-summon-title', '召唤单位', 10, 5, 130, 24, { fontWeight: 600 }), T('rs-summon-count', '0 / 1', 160, 5, 66, 24, { fontFamily: 'Consolas, monospace', color: '#92d8ee', textAlign: 'right' }, { binding: 'summon-count' }), line('rs-summon-line', 32, 234, 1), T('rs-summon-empty', '暂无召唤单位', 10, 38, 216, 20, { color: muted, fontSize: 10 })]));
  const bdRows = SAMPLE_BDS.map((name, i) => P(`rs-build-row-${i}`, name, 220, 48, [T(`rs-build-glyph-${i}`, name[0], 8, 6, 32, 34, { color: '#ffb777', fontSize: 20, textAlign: 'center' }), T(`rs-build-name-${i}`, name, 48, 4, 160, 22), T(`rs-build-sub-${i}`, '默认配装 · 点击查看', 48, 26, 160, 17, { fontSize: 9, color: muted }), B(`rs-build-open-${i}`, '›', 185, 9, 26, 29, { type: 'build', value: i })], 'cell.svg'));
  save('builds', '可用 BD · 可展开', 236, 34, P('rs-builds', '可用 BD', 236, 34, [B('rs-build-toggle', '可用 BD   14                           ▾', 1, 1, 234, 32, { type: 'bd' }), scroll('rs-build-scroll', 8, 40, 220, 314, bdRows, 4)], 'panel.svg'));
  document.prefabs[BATTLE_PREFABS.builds].root.children.at(-1).visibility = 'collapsed'; document.prefabs[BATTLE_PREFABS.builds].root.children.at(-1).binding = 'bd-content';
  save('statistics', '灵石与战斗统计', 540, 52, C('rs-statistics', '灵石与战斗统计', 540, 52, [G('rs-wallet-bg', 'panel.svg', 0, 0, 134, 52), G('rs-wallet-gem', 'gem.svg', 12, 14, 24, 24), T('rs-wallet-value', '996', 44, 8, 55, 34, { color: '#8fe6c8', fontSize: 20, fontWeight: 700, fontFamily: 'Consolas, monospace' }, { binding: 'wallet' }), T('rs-wallet-unit', '灵石', 101, 18, 28, 19, { color: muted, fontSize: 10 }), G('rs-stats-bg', 'panel.svg', 146, 0, 394, 40), T('rs-stats', '击杀 0   怪物 7   投射物 0   0:00   120 FPS', 158, 8, 370, 23, { color: '#a1afc0', fontSize: 10.5, fontFamily: 'Consolas, Microsoft YaHei, sans-serif' }, { binding: 'statistics' })]));
  save('dps', '单体秒伤', 206, 89, P('rs-dps', '平均单体秒伤', 206, 89, [T('rs-dps-label', '单体秒伤', 11, 6, 100, 21, { color: gold, fontWeight: 600 }), T('rs-dps-unit', '伤害 / 秒', 120, 7, 75, 20, { color: muted, fontSize: 9, textAlign: 'right' }), T('rs-dps-value', '0', 11, 29, 182, 34, { color: '#f2dcaa', fontSize: 25, fontWeight: 600, fontFamily: 'Consolas, monospace' }, { binding: 'dps' }), T('rs-dps-footer', '近 1 秒均值                  受击 0 个', 11, 66, 184, 17, { color: muted, fontSize: 9 })], 'panel-gold.svg'));
  const mapContent = C('rs-map-equipment', '装备词条', 188, 78, [T('rs-map-core', '地图核心', 0, 0, 180, 18, { color: muted, fontSize: 9 }), ...['怪物群 +0%', '地图召唤物气血 +0%', '地图召唤物伤害 +0%'].map((v, i) => T(`rs-map-affix-${i}`, v, 0, 20 + i * 17, 180, 17, { fontSize: 10 }))], { binding: 'map-equipment' }); mapContent.slot.offsets.left = 9; mapContent.slot.offsets.top = 66;
  const lineage = C('rs-map-lineages', '谱系信息', 188, 78, ['裂爪兽    存活 3', '寒霜术士    存活 2', '虚空术士    存活 2'].map((v, i) => T(`rs-lineage-${i}`, `▸ ${v}`, 0, i * 23, 180, 22, { fontSize: 10 })), { visibility: 'collapsed', binding: 'map-lineage' }); lineage.slot.offsets.left = 9; lineage.slot.offsets.top = 66;
  save('map', '小地图与地图信息', 206, 272, C('rs-map', '地图区域', 206, 272, [P('rs-minimap', '地牢小地图', 102, 114, [G('rs-minimap-room', 'map-room.svg', 7, 5, 88, 88), T('rs-minimap-caption', '单房间 · 三波怪物 → 首领', 3, 96, 96, 15, { fontSize: 7.5, color: muted, textAlign: 'center' })]), P('rs-map-panel', '地图信息', 206, 146, [T('rs-map-title', '【地图】', 9, 4, 110, 24, { color: gold, fontWeight: 600 }), T('rs-map-tier', 'T1 · 无敌', 132, 4, 66, 24, { color: '#97a99e', fontSize: 9, textAlign: 'right' }), line('rs-map-line', 32, 204, 1), B('rs-map-tab-equipment', '装备词条', 7, 38, 93, 23, { type: 'map-tab', value: 'equipment' }, { binding: 'tab-equipment' }), B('rs-map-tab-lineage', '谱系信息 3', 106, 38, 93, 23, { type: 'map-tab', value: 'lineage' }, { binding: 'tab-lineage' }), mapContent, lineage], 'panel-gold.svg')]));
  const mapRoot = document.prefabs[BATTLE_PREFABS.map].root; mapRoot.children[0].slot.offsets.left = 104; mapRoot.children[1].slot.offsets.top = 126;

  save('function', '功能图标按钮 · 四态', 36, 34, N('Button', 'rs-function-button', '功能按钮', 0, 0, 36, 34, { style: { fill: 'transparent' }, brushes: brushes('function'), children: [C('rs-function-content', '图标与快捷键', 36, 34, [G('rs-function-icon', 'icon-inventory.svg', 7, 5, 22, 22), T('rs-function-key', 'B', 25, 23, 9, 10, { fontSize: 8, color: '#b6c0d0', textAlign: 'right' })])] }));
  save('rail', '战斗功能栏 · 12 个入口', 48, 520, P('rs-rail', '战斗功能图标栏', 48, 520, BATTLE_FUNCTIONS.map((f, i) => I(`rs-function-${f.id}`, f.name, BATTLE_PREFABS.function, 6, 6 + i * 41 + (i >= 2 ? 8 : 0) + (i >= 6 ? 8 : 0) + (i >= 10 ? 8 : 0), 36, 34, { overrides: { 'rs-function-button': { name: f.name, action: { type: 'function', value: f.id }, binding: `function-${f.id}` }, 'rs-function-button/rs-function-content/rs-function-icon': { svgAsset: A(`icon-${f.id}.svg`) }, 'rs-function-button/rs-function-content/rs-function-key': { text: f.key } } })), 'rail.svg'));

  // Keep the screenshot reconstruction as an asset example. The actual HUD has no 3D floor facets.
  const skillTemplate = document.prefabs[HUD_PREFABS.slot].root; skillTemplate.binding = 'ability'; skillTemplate.action = { type: 'ability', value: 0 };
  walk(skillTemplate, n => {
    if (n.id === 'hud-ability-equipped') n.name = '装备授予标记';
    // Clip the artwork itself; the sibling selection glow must remain outside the slot.
    if (n.id === 'hud-ability-flame') Object.assign(n.style, { clip: true, radius: 11.5 });
  });
  const abilityRow = document.prefabs[HUD_PREFABS.abilities].root;
  abilityRow.children.forEach((n, i) => {
    merge(n.overrides['hud-ability-button'], { name: `主动技能 ${i + 1}`, action: { type: 'ability', value: i }, binding: 'ability' });
    n.overrides['hud-ability-button/hud-ability-content/hud-ability-selected'] = { visibility: i === 0 ? 'visible' : 'collapsed' };
    if (i === 0) {
      n.overrides['hud-ability-button/hud-ability-content/hud-ability-selected'].svgAsset = 'rs-svg-selection-filled';
      n.overrides['hud-ability-button/hud-ability-content/hud-ability-flame'] = { visibility: 'visible', svgAsset: 'rs-svg-poison', slot: { offsets: { left: 1, top: 1, right: 72, bottom: 72 } } };
      n.overrides['hud-ability-button/hud-ability-content/hud-ability-name'] = { text: '毒瓶', slot: { zOrder: 20 }, style: { fill: '#060a11b8', radius: 3 } };
      n.overrides['hud-ability-button/hud-ability-content/hud-ability-key'] = { text: '1', slot: { zOrder: 20 }, style: { fill: '#060a11b8', radius: 3 } };
      n.overrides['hud-ability-button/hud-ability-content/hud-ability-equipped'] = { visibility: 'visible', slot: { zOrder: 20 }, style: { fill: '#060a11b8', radius: 3 } };
    }
  });
  document.prefabs[HUD_PREFABS.quick].root.action = { type: 'belt', value: 0 };
  document.prefabs[HUD_PREFABS.consumables].root.children.forEach((n, i) => { merge(n.overrides['hud-quick-button'], { name: `消耗品 ${['Q', 'E', 'F', 'G'][i]}`, action: { type: 'belt', value: i }, binding: `belt-${i}` }); });
  save('hotbar', '战斗快捷栏 · 技能 / 消耗品', 606, 74, C('rs-hotbar', '战斗快捷栏', 606, 74, [I('rs-abilities', '主动技能 1–4', HUD_PREFABS.abilities, 0, 0, 314, 74), I('rs-consumables', '消耗品 Q E F G', HUD_PREFABS.consumables, 332, 10, 274, 64)]));
  document.prefabs[SKILL_CHOICE_PREFAB] = skillChoicePrefab();
  document.prefabs[BATTLE_PREFABS.picker] = skillPickerPrefab(SAMPLE_SKILLS.filter(s => REFERENCE_SKILL_IDS.includes(s.id)));

  const leftChildren = [I('rs-resources-instance', '玩家资源', BATTLE_PREFABS.resources, 0, 0, 236, 126), I('rs-objective-instance', '层数与波次', BATTLE_PREFABS.objective, 0, 0, 236, 32), P('rs-boss', '首领气血', 236, 40, [T('rs-boss-title', '第 1 层守卫     2400 / 3200', 8, 4, 220, 25, { color: gold, fontSize: 10 }), bar('rs-boss-bar', 'boss-health', 7, 32, 222, 4, .75, '#ed9868')], 'panel-gold.svg', { visibility: 'collapsed', binding: 'boss' }), I('rs-summons-instance', '召唤单位', BATTLE_PREFABS.summons, 0, 0, 236, 64), I('rs-builds-instance', '可用 BD', BATTLE_PREFABS.builds, 0, 0, 236, 34, { binding: 'bd-box' }), B('rs-reset', '重置', 0, 0, 76, 30, { type: 'restart' })];
  leftChildren.at(-1).slot.horizontalAlignment = 'left';
  const left = N('VerticalBox', 'rs-top-left', '左上 · 玩家状态', 14, 14, 236, 650, { layout: { gap: 8 }, children: leftChildren });
  const right = anchored(N('VerticalBox', 'rs-top-right', '右上 · 秒伤与地图', -74, 14, 206, 410, { layout: { gap: 12 }, children: [I('rs-dps-instance', '单体秒伤', BATTLE_PREFABS.dps, 0, 0, 206, 89), I('rs-map-instance', '地图', BATTLE_PREFABS.map, 0, 0, 206, 272)] }), 1, 0);
  const modal = C('rs-modal-layer', '窗口层 · 预览时动态显示', 1600, 900, [fill(B('rs-modal-dismiss', '', 0, 0, 1600, 900, { type: 'close' }, { brushes: { normal: '', hovered: '', pressed: '', disabled: '' }, style: { fill: '#03070bb3', radius: 0 } }))], { visibility: 'collapsed', binding: 'modal-layer' }); fill(modal); modal.slot.zOrder = 100;
  const pickerInstance = anchored(I('rs-picker-instance', '技能装配', BATTLE_PREFABS.picker, -146, -114, 314, document.prefabs[BATTLE_PREFABS.picker].height, { visibility: 'collapsed', binding: 'picker' }), .5, 1, .5, 1); pickerInstance.slot.zOrder = 80;
  const statsFit = N('ScaleBox', 'rs-statistics-fit', '顶部统计 · 窄屏等比适应', 262, 14, 292, 52, { slot: { anchors: { minX: 0, maxX: 1, minY: 0, maxY: 0 }, offsets: { left: 262, top: 14, right: 292, bottom: 52 } }, layout: { stretch: 'down' }, children: [I('rs-statistics-instance', '灵石与战斗统计', BATTLE_PREFABS.statistics, 0, 0, 540, 52)] });
  statsFit.children[0].slot.horizontalAlignment = 'left'; statsFit.children[0].slot.verticalAlignment = 'top';
  const screenRoot = C('hud-screen-root', '完整战斗 HUD', 1600, 900, [left, statsFit, right, anchored(I('rs-rail-instance', '功能图标栏', BATTLE_PREFABS.rail, -14, 14, 48, 520), 1, 0), anchored(I('rs-hotbar-instance', '技能与消耗品快捷栏', BATTLE_PREFABS.hotbar, 0, -28, 606, 74), .5, 1), anchored(T('rs-help', 'WASD 移动 · 鼠标瞄准 · 左键/空格施法 · 1–4 技能 · Q E F G 消耗品 · Shift 闪避 · 点击掉落拾取 · Z 显示掉落', 0, -6, 900, 16, { color: '#7e838b', fontSize: 10, textAlign: 'center' }), .5, 1), pickerInstance, modal]);
  document.prefabs[HUD_PREFABS.screen] = { id: HUD_PREFABS.screen, name: 'HUD · RuleStudio 完整战斗', width: 1600, height: 900, root: screenRoot, folderId: 'rs-prefab-parts' };
  // Scene owns the design resolution; the nested interface fills its canvas.
  document.root = C('hud-scene-root', 'RuleStudio · 完整战斗 HUD', 1600, 900, [fill(I('hud-screen-instance', '完整战斗 HUD 实例', HUD_PREFABS.screen, 0, 0, 1600, 900))]);
  document.presentation = { controller: 'rulestudio-battle-hud', version: 2, dataMode: 'preview', source: 'G:/DungeonWorldBeta/CustomTools/RuleStudio/public/battle3d.mjs', skills: SAMPLE_SKILLS, availableSkills: REFERENCE_SKILL_IDS, loadout: ['poison_flask', null, null, null], selected: 0 };
  document.provenance = { ...document.provenance, kind: 'rulestudio-svg-hud', sourceUi: 'RuleStudio / 3D 战斗', warnings: [], note: '完整 HUD 与窗口的 SVG 重建；数值为可替换预览数据，未连接战斗引擎。3D 世界不属于 HUD 资产。' };
  return installInventoryCompartments(installInventoryNotices(installPlayerEffects(installCombatLayout(installMapCoreSelector(installBattleSuite(document))))));
}

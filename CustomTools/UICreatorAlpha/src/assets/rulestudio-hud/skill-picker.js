import { createNode } from '../../core/model.js';

export const SKILL_CHOICE_PREFAB = 'rs-prefab-skill-choice';
const normal = 'rs-svg-choice-normal', hovered = 'rs-svg-choice-hovered', pressed = 'rs-svg-choice-pressed';
const node = (type, id, name, x, y, w, h, props = {}) => createNode(type, { id, name, slot: { offsets: { left: x, top: y, right: w, bottom: h } }, layout: { width: w, height: h }, ...props });
const text = (id, value, x, y, w, h, style = {}, props = {}) => node('TextBlock', id, value, x, y, w, h, { text: value, locked: true, style: { color: '#cdd8e8', fontSize: 11, wrap: false, textOverflow: 'shrink', textPadding: 1,textPaddingX:3, ...style }, ...props });
const button = (id, name, x, y, w, h, action, children, props = {}) => node('Button', id, name, x, y, w, h, { style: { fill: 'transparent' }, brushes: { normal, hovered, pressed, disabled: normal }, action, children, ...props });
function bottom(n, distance) { n.slot.anchors.minY = n.slot.anchors.maxY = 1; n.slot.offsets.top = -distance; return n; }

export function skillChoicePrefab() {
  return { id: SKILL_CHOICE_PREFAB, name: '技能装配条目 · 图标 / 来源 / 状态', width: 302, height: 55, folderId: 'rs-prefab-parts', root: button('rs-choice-button', '装配技能条目', 0, 0, 302, 55, { type: 'assign', value: 'poison_flask' }, [node('CanvasPanel', 'rs-choice-content', '技能条目内容', 0, 0, 302, 55, { children: [
    node('Svg', 'rs-choice-icon', '技能图标', 9, 11, 32, 32, { locked: true, svgAsset: 'rs-svg-poison', binding: 'choice-icon' }),
    text('rs-choice-name', '毒瓶', 49, 7, 164, 20, { fontSize: 12, fontWeight: 600 }, { binding: 'choice-name' }),
    text('rs-choice-source', '装备授予 · 当前槽位', 49, 30, 164, 17, { fontSize: 10, color: '#8b9fb6' }, { binding: 'choice-source' }),
    text('rs-choice-equipped', '已装配', 220, 18, 74, 20, { fontSize: 10, color: '#79c9db', textAlign: 'right' }, { binding: 'choice-equipped' }),
  ] })], { binding: 'skill-choice' }) };
}

export function skillChoiceInstance(skill, index, id = `rs-picker-choice-${index}`) {
  const path = key => `rs-choice-button/rs-choice-content/${key}`;
  return node('PrefabInstance', id, skill.name, 0, index * 55, 302, 55, { prefabId: SKILL_CHOICE_PREFAB, overrides: {
    'rs-choice-button': { name: `装配${skill.name}`, action: { type: 'assign', value: skill.id }, binding: 'skill-choice' },
    [path('rs-choice-icon')]: { svgAsset: skill.icon },
    [path('rs-choice-name')]: { text: skill.name },
    [path('rs-choice-source')]: { text: skill.granted ? '装备授予' : '已拥有' },
    [path('rs-choice-equipped')]: { visibility: 'collapsed' },
  } });
}

export function skillPickerPrefab(choices = []) {
  const h = skillPickerHeight(choices.length);
  const bg = node('Svg', 'rs-picker-bg', '装配面板背景', 0, 0, 0, 0, { locked: true, svgAsset: 'rs-svg-picker-panel', slot: { anchors: { minX: 0, minY: 0, maxX: 1, maxY: 1 }, offsets: { left: 0, top: 0, right: 0, bottom: 0 } } });
  const list = node('ScrollBox', 'rs-picker-list', '可装配技能列表', 6, 47, 302, h - 88, { binding: 'picker-list', layout: { gap: 0 }, slot: { anchors: { minX: 0, maxX: 0, minY: 0, maxY: 1 }, offsets: { left: 6, top: 47, right: 302, bottom: 41 } }, children: choices.map((s, i) => skillChoiceInstance(s, i)) });
  const line = bottom(node('Border', 'rs-picker-footer-line', '底部分隔线', 1, 0, 312, 1, { locked: true, style: { fill: '#29384b', radius: 0 } }), 35);
  const clear = bottom(button('rs-clear-skill', '清空此槽', 1, 0, 312, 34, { type: 'assign', value: null }, [text('rs-clear-skill-label', '清空此槽', 10, 0, 292, 34, { textAlign: 'center' })], { binding: 'picker-clear' }), 34);
  return { id: 'rs-prefab-picker', name: '主动技能装配面板 · 数据列表', width: 314, height: h, folderId: 'rs-prefab-windows', root: node('CanvasPanel', 'rs-picker', '主动技能装配面板', 0, 0, 314, h, { binding: 'picker-root', children: [bg,
    text('rs-picker-title', '装配技能', 10, 9, 65, 24, { fontSize: 12, fontWeight: 700 }),
    text('rs-picker-slot', '槽位 1', 78, 10, 130, 24, { fontSize: 10, color: '#8297af' }, { binding: 'picker-slot' }),
    button('rs-picker-close', '关闭技能选择', 280, 9, 24, 24, { type: 'close' }, [text('rs-picker-close-label', '×', 0, 0, 24, 24, { fontSize: 20, textAlign: 'center', color: '#95a6bb' })]),
    node('Border', 'rs-picker-head-line', '标题分隔线', 1, 41, 312, 1, { locked: true, style: { fill: '#29384b', radius: 0 } }), list,
    text('rs-picker-empty', '暂无可装配技能。装备提供技能的武器或在商店获得技能后，会显示在这里。', 12, 49, 290, 53, { wrap: true, fontSize: 11, color: '#91a0b5', verticalAlign: 'top' }, { visibility: choices.length ? 'collapsed' : 'visible', binding: 'picker-empty' }),
    line, clear,
  ] }) };
}
export function skillPickerHeight(count) { return 77 + Math.min(203, Math.max(1, count) * 55 + 12); }

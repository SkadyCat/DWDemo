import { createNode } from '../../core/model.js';
import { installStunCrust } from './stun-crust.js';

export const ENTITY_STATUSES = [
  ['chill', '冰缓', '缓', '#5ab8f0'], ['freeze', '冻结', '冻', '#d8f6ff'],
  ['shock', '感电', '电', '#ffe14d'], ['ignite', '点燃', '燃', '#ff7a2e'],
  ['bleed', '流血', '血', '#e0334a'], ['slow', '缓速', '慢', '#9a8fd8'],
  ['poison', '中毒', '毒', '#7ee36b'], ['erosion', '侵蚀', '蚀', '#c38bff'],
  ['stun', '眩晕', '晕', '#f7d046'],
  ['taunt', '嘲讽', '嘲', '#ff9c48'],
].map(([id, name, glyph, color]) => ({ id, name, glyph, color }));

const node = (type, id, x, y, width, height, props = {}) => createNode(type, {
  id, name: id, slot: { offsets: { left: x, top: y, right: width, bottom: height } },
  layout: { width, height }, ...props,
});
const text = (id, binding, value, x, y, width, height, size, color, maxChars) => node('TextBlock', id, x, y, width, height, {
  binding, text: value, locked: true,
  style: { color, fontSize: size, fontWeight: 700, fontFamily: 'Segoe UI, Microsoft YaHei, sans-serif', textAlign: 'center', wrap: false, textOverflow: 'shrink' },
  source: { safeRect: { x, y, width, height }, maxChars, overflow: 'shrink' },
});

export function installEntityOverlays(document) {
  const asset = (id, width, height, body) => {
    document.assets[id] = { id, name: id, viewBox: [0, 0, width, height], scaleMode: 'stretch', source: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${body}</svg>` };
    return id;
  };
  const graphic = (id, binding, x, y, width, height, body) => node('Svg', id, x, y, width, height, { binding, locked: true, svgAsset: asset('entity-svg-' + id, width, height, body) });
  const strip = (id, binding, x, y, width, height, top, bottom) => graphic(id, binding, x, y, width, height,
    `<defs><linearGradient id="fill" x2="0" y2="1"><stop stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs><rect width="${width}" height="${height}" rx="2" fill="url(#fill)"/>`);
  const marker = (id, binding, y) => node('CanvasPanel', id, 48, y, 0, 0, { binding, locked: true, name: '状态行底部锚点 · 仅布局' });
  const hero = node('CanvasPanel', 'hero', 80, 170, 96, 38, { name: '玩家头顶 · 气血 / 护盾', binding: 'template:hero', children: [
    graphic('hero-track', '', 13, 13, 70, 10, '<rect x=".5" y=".5" width="69" height="9" rx="3" fill="#0a0608" fill-opacity=".85" stroke="#000" stroke-opacity=".8"/>'),
    graphic('hero-lag', 'world-lag', 14, 14, 68, 8, '<rect width="68" height="8" rx="2" fill="#f5d38a" opacity=".7"/>'),
    strip('hero-fill', 'world-health', 14, 14, 68, 8, '#7dffb8', '#1fae66'),
    graphic('hero-shield-track', 'world-shield-track', 13, 4, 70, 7, '<rect x=".5" y=".5" width="69" height="6" rx="3" fill="#111f32" stroke="#050b14"/>'),
    strip('hero-shield', 'world-shield', 14, 5, 68, 5, '#c0edff', '#448fe8'),
    marker('hero-status-base', 'world-status-base', 16), marker('hero-status-shield', 'world-status-shield', 7),
  ] });
  const monster = document.root.children.find(n => n.id === 'monster');
  if (!monster) throw new Error('Existing monster template is missing');
  monster.children = monster.children.filter(n => !['monster-status-base', 'monster-status-shield'].includes(n.id));
  monster.children.push(marker('monster-status-base', 'world-status-base', 7), marker('monster-status-shield', 'world-status-shield', -1));
  document.root.children = document.root.children.filter(n => n.id !== 'hero' && !n.id.startsWith('status-'));
  document.root.children.push(hero);
  for (const [index, status] of ENTITY_STATUSES.entries()) {
    const id = 'status-' + status.id;
    document.root.children.push(node('CanvasPanel', id, 520 + index * 62, 75, 28, 36, { name: status.name + ' · ' + status.glyph, binding: 'template:' + id, children: [
      graphic(id + '-bg', '', .5, 9, 27, 27, `<defs><filter id="glow" x="-.5" y="-.5" width="2" height="2"><feGaussianBlur stdDeviation="1.7"/></filter></defs><rect x="4" y="4" width="19" height="19" rx="4" fill="${status.color}" opacity=".5" filter="url(#glow)"/><rect x="4" y="4" width="19" height="19" rx="4" fill="${status.color}" stroke="#000" stroke-opacity=".7"/>`),
      text(id + '-glyph', 'world-status-glyph', status.glyph, 4.5, 13, 19, 19, 11.5, '#0b0f18', 1),
      text(id + '-seconds', 'world-status-seconds', '', 0, 0, 28, 12, 8.5, '#ffffff', 3),
      text(id + '-stacks', 'world-status-stacks', '', 10, 24, 18, 12, 9, '#ffffff', 3),
      node('CanvasPanel', id + '-step', 0, 0, 21, 36, { binding: 'world-status-step', locked: true, name: '状态排列步长 · 21 px' }),
    ] }));
  }
  document.root.slot.offsets.right = document.root.layout.width = document.viewport.width;
  document.root.slot.offsets.bottom = document.root.layout.height = document.viewport.height;
  document.provenance ||= {};
  document.provenance.entityOverlays = { version: 1, reference: 'RuleStudio3D battle3d.mjs Overlay / play.css .hb-*', runtime: 'native DWRules pools and status getters; AS binding', statuses: ENTITY_STATUSES.map(s => s.id), textLayoutVersion: 1 };
  return installStunCrust(document);
}

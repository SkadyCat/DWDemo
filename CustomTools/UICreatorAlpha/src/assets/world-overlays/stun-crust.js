// UICreator owns the translucent remaining-stun overlay; gameplay owns its value.
import { createDocument, createNode } from '../../core/model.js';
export const STUN_YELLOW = '#f7d046';
export const STUN_OPACITY = .55;
export const stunOverlaySvg = (width = 68, height = 8) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><rect width="${width}" height="${height}" rx="2" fill="${STUN_YELLOW}" fill-opacity="${STUN_OPACITY}"/></svg>`;
export function createPlayerStunProject() {
  const document = createDocument('玩家晕眩 · 半透明黄色覆盖');
  document.id = 'opus-player-stun-overlay'; document.viewport = {width: 68, height: 16, background: 'transparent'};
  document.sounds = {}; document.motions = {};
  document.assets['entity-svg-hero-stun-fill'] = {id: 'entity-svg-hero-stun-fill', name: '当前晕眩值覆盖', viewBox: [0, 0, 68, 8], scaleMode: 'stretch', source: stunOverlaySvg()};
  document.root = createNode('CanvasPanel', {id: 'stun-overlay', locked: true, slot: {offsets: {left: 0, top: 0, right: 68, bottom: 16}}, layout: {width: 68, height: 16}, children: [
    createNode('Svg', {id: 'hero-stun-fill', binding: 'world-stun', svgAsset: 'entity-svg-hero-stun-fill', locked: true, interactable: false, motion: {preset: 'none'},
      slot: {offsets: {left: 0, top: 0, right: 68, bottom: 8}}, layout: {width: 68, height: 8}})
  ]});
  return document;
}
export function installStunCrust(document) {
  const hero = document.root.children.find(n => n.id === 'hero');
  if (!hero) throw new Error('Player overlay template is missing');
  hero.children = hero.children.filter(n => !n.id.startsWith('hero-stun-'));
  for (const id of Object.keys(document.assets)) if (id.startsWith('entity-svg-hero-stun-')) delete document.assets[id];
  const source = createPlayerStunProject(), fill = source.root.children[0];
  fill.slot.offsets.left = 14; fill.slot.offsets.top = 14;
  Object.assign(document.assets, source.assets); hero.children.push(fill);
  hero.name = '玩家头顶 · 气血 / 护盾 / 晕眩覆盖';
  document.provenance ||= {}; delete document.provenance.playerStunCrust;
  document.provenance.playerStunOverlay = {version: 4, color: STUN_YELLOW, opacity: STUN_OPACITY, binding: 'world-stun', progress: 'clamp(current remaining stun / maximum life, 0, 1)', ruleChanges: false};
  delete document.provenance.playerStunBar;
  return document;
}

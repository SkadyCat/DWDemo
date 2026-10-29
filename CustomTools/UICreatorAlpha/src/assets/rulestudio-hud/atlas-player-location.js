import { createDocument } from '../../core/model.js';
import { art, assetRecord, canvas, graphic, text } from './suite-kit.js';

export const ATLAS_PLAYER_ANCHOR = Object.freeze({ x: 88, y: 76, width: 176, height: 112 });
const pin = art('atlas-player-location');
export function atlasPlayerLocationDocument() {
  const doc = createDocument('世界地图 · 玩家当前位置');
  doc.id = 'opus-atlas-player-location';
  doc.viewport = { width: 176, height: 112, background: 'transparent' };
  doc.motions = {};
  doc.assets[pin] = assetRecord(pin, '玩家定位 · 青玉人像', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 176 94"><defs><radialGradient id="halo"><stop stop-color="#62dcb6" stop-opacity=".28"/><stop offset="1" stop-color="#62dcb6" stop-opacity="0"/></radialGradient></defs><circle cx="88" cy="76" r="25" fill="url(#halo)"/><circle cx="88" cy="76" r="14" fill="#102c29" stroke="#8de1c9" stroke-width="1.5"/><circle cx="88" cy="70" r="3.5" fill="#a2ead6"/><path d="M81.5 83v-2c0-6.5 13-6.5 13 0v2z" fill="#a2ead6"/></svg>`, 'stretch', 96, '');
  doc.assets[pin].viewBox = [0, 0, 176, 94];
  doc.root = canvas('atlas-player-location', 176, 112, [
    graphic('atlas-player-pin', pin, 0, 0, 176, 94),
    text('atlas-player-name', '初始界域', 0, 94, 176, 18, { fontSize: 11, color: '#d2e6db', textAlign: 'center', fill: '#0a1719dc', radius: 8, textBackgroundFit: true }),
  ], { name: '玩家当前位置 · 与目的地选中独立', source: { anchor: ATLAS_PLAYER_ANCHOR, purpose: 'actual-current-region' } });
  return doc;
}

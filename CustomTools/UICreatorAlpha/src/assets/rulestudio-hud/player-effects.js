import { canvas, graphic, text, node } from './suite-kit.js';
import { equipmentArt } from './equipment-art.js';
export const PLAYER_EFFECT_FRAME = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect x="1" y="1" width="46" height="46" rx="8" fill="#0b111b" fill-opacity=".96" stroke="#3d4858"/></svg>';
export const PLAYER_EFFECT_HOVER = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect x="1" y="1" width="46" height="46" rx="8" fill="#19293b" stroke="#f1d795" stroke-width="2"/></svg>';
export const PLAYER_EFFECT_PATH = 'M24 2H39A7 7 0 0 1 46 9V39A7 7 0 0 1 39 46H9A7 7 0 0 1 2 39V9A7 7 0 0 1 9 2Z';
const pictogram = (color, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><defs><radialGradient id="glow"><stop stop-color="${color}" stop-opacity=".32"/><stop offset="1" stop-color="#101722"/></radialGradient></defs><rect width="40" height="40" rx="5" fill="url(#glow)"/><g fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;
const snow = '<path d="M20 7v26M9 13l22 14M9 27l22-14M16 10l4 4 4-4M16 30l4-4 4 4M10 18l6-1-1-6M30 22l-6 1 1 6M10 22l6 1-1 6M30 18l-6-1 1-6"/>';
export const PLAYER_EFFECT_ICONS = {
  chill:pictogram('#70c8ff',snow), freeze:pictogram('#d8f6ff',snow+'<path d="M6 6h7M6 6v7M34 34h-7M34 34v-7"/>'),
  shock:pictogram('#ffe14d','<path d="M23 5 10 23h10l-3 12 14-20H21Z" fill="#ffe14d" fill-opacity=".25"/>'),
  ignite:pictogram('#ff944d','<path d="M21 5c3 8-1 9 3 13 1-3 4-4 4-7 8 11 5 23-7 23S6 25 11 17c0 6 3 7 5 6-2-7 4-10 5-18Z"/><path d="M21 22c-8 9-2 13 3 9 3-3-1-5-3-9Z" fill="#ffbc68"/>'),
  bleed:pictogram('#fa627a','<path d="M20 5C18 14 9 20 9 25a11 11 0 0 0 22 0c0-5-9-11-11-20Z" fill="#e0334a" fill-opacity=".4"/><path d="M14 25c0 4 2 6 5 6"/>'),
  poison:pictogram('#8aec75','<path d="M15 6h10M17 6v9L9 29q-2 5 4 5h14q6 0 4-5l-8-14V6M13 25h14"/><circle cx="17" cy="21" r="1"/><circle cx="23" cy="29" r="1"/>'),
  erosion:pictogram('#d79bff','<path d="M20 6 31 13v14l-11 7-11-7V13ZM20 6v10l-5 5 8 3-3 10M31 13l-7 7M9 27l6-6"/>'),
  slow:pictogram('#b4a5ed','<path d="M11 6h18M11 34h18M14 6v6l6 8-6 8v6M26 6v6l-6 8 6 8v6M17 29h6"/>'),
  stun:pictogram('#f7d046','<path d="m20 7 2 5 6 1-4 4 1 6-5-3-5 3 1-6-4-4 6-1Z" fill="#f7d046" fill-opacity=".25"/><path d="M29 20c7 3 5 8-5 10-10 2-19-1-17-5M11 24l-4 1 1 4M12 33l4-2M28 6l3-3"/>'),
  buff:pictogram('#7fe1bc','<path d="m20 5 3 10 11 5-11 4-3 11-4-11-10-4 10-5Z" fill="#7fe1bc" fill-opacity=".25"/><path d="M29 7v6M26 10h6"/>'),
};
export function installPlayerEffects(document) {
  const asset = (id,name,source,w=48,h=w) => { document.assets[id] = {id,name,source,viewBox:[0,0,w,h],scaleMode:'contain',folderId:'rs-svg'}; };
  asset('rs-svg-player-effect','临时状态 / 图标框',PLAYER_EFFECT_FRAME);
  asset('rs-svg-player-effect-hover','临时状态 / 悬停框',PLAYER_EFFECT_HOVER);
  asset('rs-svg-player-effect-ring','临时状态 / 外圈倒计时',`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><path d="${PLAYER_EFFECT_PATH}" fill="none" stroke="#e7c883" stroke-width="2" stroke-linecap="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="35"/></svg>`);
  asset('rs-svg-player-effect-skill','临时状态 / 来源技能示例',equipmentArt.poison,96);
  for (const [id,svg] of Object.entries(PLAYER_EFFECT_ICONS)) asset('rs-svg-status-'+id,'状态图标 / '+id,svg,40);
  const icon = graphic('rs-effect-icon','rs-svg-player-effect-skill',6,6,36,36); icon.binding='player-effect:icon';
  const ring = graphic('rs-effect-countdown','rs-svg-player-effect-ring',0,0,48,48); ring.binding='player-effect:progress';
  const root = canvas('rs-player-effect',48,48,[node('Button','rs-effect-hover',0,0,48,48,{
    binding:'player-effect:hover',brushes:{normal:'rs-svg-player-effect',hovered:'rs-svg-player-effect-hover',pressed:'rs-svg-player-effect-hover',disabled:'rs-svg-player-effect'},
    children:[canvas('rs-effect-content',48,48,[icon,ring,text('rs-effect-stacks','3',27,28,18,18,{fontSize:13,fontWeight:700,textAlign:'right',color:'#fff',fill:'#0b111be8',radius:3},{binding:'player-effect:stacks'})])]
  })]);
  document.prefabs['rs-prefab-player-effect'] = {id:'rs-prefab-player-effect',name:'玩家临时状态 / 图标与倒计时',width:48,height:48,folderId:'rs-prefab-parts',root};
  const hoverIcon=graphic('rs-effect-tip-icon','rs-svg-player-effect-skill',14,14,38,38);hoverIcon.binding='player-effect:icon';
  const tooltip=canvas('rs-effect-tooltip',280,166,[node('Border','rs-effect-tip-frame',0,0,280,166,{style:{fill:'#101a29',stroke:'#b69a60',strokeWidth:1,radius:8}}),hoverIcon,
    text('rs-effect-tip-name','毒瓶',62,13,204,22,{fontSize:13,fontWeight:600,color:'#edcf97'},{binding:'player-effect:name'}),
    text('rs-effect-tip-source','技能 · 毒瓶',62,36,204,18,{fontSize:10,color:'#96a7bd'},{binding:'player-effect:source'}),
    text('rs-effect-tip-stacks','当前层数    3 / 10',14,65,252,22,{fontSize:12},{binding:'player-effect:stack-details'}),
    text('rs-effect-tip-time','下次减层    4.9s',14,89,252,22,{fontSize:12,color:'#edcf97'},{binding:'player-effect:time'}),
    text('rs-effect-tip-description','停止补充后逐层衰减。',14,122,252,30,{fontSize:11,color:'#afbed0',wrap:true},{binding:'player-effect:description'})]);
  document.prefabs['rs-prefab-player-effect-tooltip']={id:'rs-prefab-player-effect-tooltip',name:'玩家临时状态 / 悬停详情',width:280,height:166,folderId:'rs-prefab-parts',root:tooltip};
  document.presentation.playerEffects = {version:2,prefabId:'rs-prefab-player-effect',tooltipPrefabId:'rs-prefab-player-effect-tooltip',location:'top',data:'read-only-runtime',
    icon:'originating skill icon; status pictogram otherwise',countdown:{shape:'rounded-square',direction:'clockwise',path:PLAYER_EFFECT_PATH,range:[0,1],clock:'simulation',binding:'player-effect:progress'},
    hover:{highlight:'rs-svg-player-effect-hover',details:['name','source','stacks','time','description'],viewportClamp:true},stackPosition:'bottom-right'};
  return document;
}

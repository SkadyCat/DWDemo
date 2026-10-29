import { equipmentArt } from './equipment-art.js';
import { art } from './suite-kit.js';

export const qualityColors = { common:'#9baabd', normal:'#9baabd', magic:'#7ca8e9', rare:'#cfb775', legendary:'#df9b6e', unique:'#b79ada', skill:'#70b5cd' };
export const qualityName = rarity => ({common:'普通',normal:'普通',magic:'魔法',rare:'稀有',legendary:'传奇',unique:'独特'}[rarity] || '普通');
export const qualityColor = rarity => qualityColors[rarity] || qualityColors.common;
const mix = (a,b,k) => '#'+[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*k+parseInt(b.slice(i,i+2),16)*(1-k)).toString(16).padStart(2,'0')).join('');
export const qualityBrushes = (family,rarity='common') => Object.fromEntries(['normal','hovered','pressed','disabled'].map(state=>[state,art(`equipment-${family}-${rarity}-${state}`)]));
export const dynamicQualityBrushes = family => Object.fromEntries([...Object.keys(qualityColors),'empty'].map(rarity=>[rarity,qualityBrushes(family,rarity)]));
export const equipmentIcon = icon => art(equipmentArt[icon] ? `equipment-art-${icon}` : icon);

export function equipmentSources() {
 const result={};
 for(const [name,source] of Object.entries(equipmentArt))result[`equipment-art-${name}`]={source,width:96,height:96,scaleMode:'contain'};
 for(const family of ['cell','row','icon'])for(const rarity of [...Object.keys(qualityColors),'empty'])for(const state of ['normal','hovered','pressed','disabled','selected']) {
  const color=qualityColor(rarity),row=family==='row',w=row?184:family==='icon'?40:52,h=row?50:w,r=row?9:family==='icon'?8:9;
  const active=['hovered','pressed','selected'].includes(state),empty=rarity==='empty';
  const border=empty?'#263344':mix(color,'#273444',active?.72:row?.24:.37);
  const glow=empty?0:row?.07:.19;
  const marker=`equipment-${family}-${rarity}-${state}`;
  result[marker]={width:w,height:h,scaleMode:'stretch',source:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="${marker}-base" x2=".7" y2="1"><stop stop-color="${active?'#202e3e':'#192432'}"/><stop offset=".65" stop-color="${row?'#141e2a':'#101923'}"/></linearGradient><radialGradient id="${marker}-glow" cx="${row?'0':'.5'}" cy="1.05" r=".9"><stop stop-color="${color}" stop-opacity="${glow*2}"/><stop offset=".76" stop-color="${color}" stop-opacity="0"/></radialGradient><clipPath id="${marker}-clip"><rect x=".5" y=".5" width="${w-1}" height="${h-1}" rx="${r}"/></clipPath></defs><g clip-path="url(#${marker}-clip)" opacity="${state==='disabled'?'.52':'1'}"><rect width="${w}" height="${h}" fill="url(#${marker}-base)"/><rect width="${w}" height="${h}" fill="url(#${marker}-glow)"/><path d="M${r} 1H${w-r}" stroke="#e9f3ff" stroke-opacity=".07"/><path d="M${r} ${h-1}H${w-r}" stroke="#000" stroke-opacity=".32"/></g><rect x=".5" y=".5" width="${w-1}" height="${h-1}" rx="${r}" fill="none" stroke="${border}"/></svg>`};
 }
 return result;
}

// Patch only equipment controls. Existing HUD states, actions and other pages remain owned by their authors.
export function installEquipmentStyle(document) {
 for(const [name,asset] of Object.entries(equipmentSources()))document.assets[art(name)]={id:art(name),name,source:asset.source,viewBox:[0,0,asset.width,asset.height],scaleMode:asset.scaleMode,slice:{top:9,right:9,bottom:9,left:9},folderId:name.startsWith('equipment-art-')?'battle-art-icons':'battle-art-skins'};
 const visit = (node, fn) => {fn(node);for(const child of node.children||[])visit(child,fn);};
 for(const prefab of Object.values(document.prefabs))visit(prefab.root,node=>{
  if(['battle-cell-mark','battle-cell-count'].includes(node.id))node.style={...node.style,textBackgroundFit:true,wrap:false};
  if(node.id==='battle-cell')Object.assign(node,{brushes:qualityBrushes('cell'),style:{...node.style,radius:9},source:{...node.source,dynamicBrushes:dynamicQualityBrushes('cell')}});
  if(node.id==='battle-cell-icon')Object.assign(node,{svgAsset:equipmentIcon('staff'),slot:{...node.slot,offsets:{left:3,top:3,right:46,bottom:46}},style:{...node.style,clip:true,radius:6,equipmentAlpha:true}});
  if(node.id==='battle-gear')Object.assign(node,{brushes:qualityBrushes('row'),style:{...node.style,radius:9},source:{...node.source,dynamicBrushes:dynamicQualityBrushes('row')}});
  if(node.id==='battle-gear-icon') {
   node.slot.offsets={left:8,top:6,right:38,bottom:38};node.svgAsset=equipmentIcon('staff');node.style={...node.style,clip:true,radius:7,equipmentAlpha:true};
  }
  if(node.id==='battle-gear-content'&&!node.children.some(n=>n.id==='battle-gear-icon-frame')) {
   const icon=structuredClone(node.children.find(n=>n.id==='battle-gear-icon'));
   icon.id='battle-gear-icon-frame';icon.name='装备品质底光';icon.svgAsset=art('equipment-icon-common-normal');icon.binding='equipment-icon-frame';icon.style={...icon.style,equipmentAlpha:false,clip:false};icon.slot.offsets={left:7,top:5,right:40,bottom:40};icon.source={dynamicBrushes:dynamicQualityBrushes('icon')};node.children.unshift(icon);
  }
  if(node.prefabId==='battle-prefab-item-cell') {
   const o=node.overrides||{},root=o['battle-cell'];
   if(root?.brushes)for(const [state,value] of Object.entries(root.brushes)){const m=value.match(/^battle-svg-item-(\w+)-(\w+)$/);if(m)root.brushes[state]=art(`equipment-cell-${m[1]}-${m[2]}`);}
   const key='battle-cell/battle-cell-content/battle-cell-icon',icon=o[key];
   if(icon){const name=icon.svgAsset?.replace(/^battle-svg-/,'');if(equipmentArt[name])icon.svgAsset=equipmentIcon(name);if(icon.slot?.offsets){const s=icon.slot.offsets;s.left=3;s.top=3;s.right=(node.slot.offsets.right||52)-6;s.bottom=(node.slot.offsets.bottom||52)-6;}icon.style={...icon.style,radius:6,clip:true,equipmentAlpha:true};}
  }
  if(node.prefabId==='battle-prefab-gear-row') {
   const o=node.overrides||{},name=o['battle-gear/battle-gear-content/battle-gear-name'];
   const type=o['battle-gear/battle-gear-content/battle-gear-type']?.text||'';
   const rarity=type.includes('传奇')?'legendary':type.includes('稀有')?'rare':type.includes('魔法')?'magic':'common';
   if(o['battle-gear'])o['battle-gear'].brushes=qualityBrushes('row',rarity);
   o['battle-gear/battle-gear-content/battle-gear-icon-frame']={svgAsset:art(`equipment-icon-${rarity}-normal`)};
   const icon=o['battle-gear/battle-gear-content/battle-gear-icon'];if(icon){const key=icon.svgAsset?.replace(/^battle-svg-/,'');if(equipmentArt[key])icon.svgAsset=equipmentIcon(key);}
   if(name&&name.text!=='未装备')name.style={...name.style,color:qualityColor(rarity)};
  }
 });
 document.presentation={...document.presentation,equipmentStyle:{version:1,colors:qualityColors,mask:'edge-connected-near-black-18-30',iconRadius:6,cellRadius:9}};
 return document;
}

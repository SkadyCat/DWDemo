import {createDocument} from '../../core/model.js';
import {art,assetRecord,button,canvas} from './suite-kit.js';

export const ATLAS_ENTRY_MOTION='motion-atlas-entry-ready';
export function atlasEntrySources(){
 const tones={normal:['#647cdb','#5064ba','#8da4f0'],hovered:['#7c94ed','#6178d0','#b4c5ff'],pressed:['#41569f','#344681','#92a8ed'],disabled:['#202b3a','#192330','#3b495b']};
 return Object.fromEntries(Object.entries(tones).map(([state,[top,bottom,edge]])=>{
  const id=art('atlas-entry-'+state),source=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 36"><defs><linearGradient id="face" x2="0" y2="1"><stop stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs><rect x=".5" y=".5" width="255" height="35" rx="7" fill="url(#face)" stroke="${edge}"/><path d="M9 1.5h238" stroke="#fff" stroke-opacity="${state==='disabled'?'.025':'.12'}"/></svg>`;
  return [id,{...assetRecord(id,'地图入场 · '+state,source,'stretch',96,''),viewBox:[0,0,256,36]}];
 }));
}
export function atlasEntryMotion(){return {id:ATLAS_ENTRY_MOTION,name:'地图入场 · 装配激活流光',version:1,folderId:'',target:'edge',edge:{width:1.7,radius:7,color:'#b9f2dd'},bindings:{normal:'orbit',hovered:'orbit',pressed:'orbit',disabled:'off'},clips:{orbit:{duration:2300,loop:true,fromCurrent:false,easing:'linear',keyframes:[{t:0,x:0,y:0,scaleX:1,scaleY:1,rotation:0,opacity:1},{t:1,x:0,y:0,scaleX:1,scaleY:1,rotation:360,opacity:1}]},off:{duration:1,loop:false,fromCurrent:false,easing:'linear',keyframes:[{t:0,x:0,y:0,scaleX:1,scaleY:1,rotation:0,opacity:0},{t:1,x:0,y:0,scaleX:1,scaleY:1,rotation:0,opacity:0}]}}};}
export function atlasEntryButton(id,x=0,y=0){
 const n=button(id,'请拖入地图',x,y,256,36,{type:'battle-ui',op:'region-enter'},{binding:'region-enter',interactable:false,brushes:Object.fromEntries(['normal','hovered','pressed','disabled'].map(s=>[s,art('atlas-entry-'+s)])),motion:{preset:'auto',assetId:ATLAS_ENTRY_MOTION,enabled:false}});
 n.children[0].binding='map-device-enter-label';n.children[0].style={...n.children[0].style,fontSize:12,fontWeight:600,color:'#e7edf9'};
 return n;
}
export function installAtlasEntry(doc){Object.assign(doc.assets,atlasEntrySources());doc.motions||={};doc.motions[ATLAS_ENTRY_MOTION]=atlasEntryMotion();return doc;}
export const atlasEntryDocument=installAtlasEntry(createDocument('世界地图 · 入场按钮四态与激活流光'));
atlasEntryDocument.id='studio-atlas-entry';atlasEntryDocument.viewport={width:256,height:36,background:'transparent'};
atlasEntryDocument.root=canvas('atlas-entry-root',256,36,[atlasEntryButton('atlas-entry')]);

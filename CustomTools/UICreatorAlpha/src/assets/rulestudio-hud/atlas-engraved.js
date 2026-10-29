import {art,node,graphic,canvas,rect,line,text,button,ui,windowPanel,assetRecord} from './suite-kit.js';
import {engravedAtlasArt as artwork} from './atlas-engraved.generated.js';
import {atlasEntryButton,atlasEntrySources} from './atlas-entry.js';
export const MAP_ATLAS={width:1120,height:720,map:{x:1,y:83,width:838,height:600}};
const label=(id,s,x,y,w,h=22,style={},props={})=>text(id,s,x,y,w,h,{fontSize:11,color:'#7f8aa1',textPaddingX:0,...style},props);
const svg=(w,h,b)=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${b}</svg>`;
export function engravedAtlasSources(){return {...atlasEntrySources(),...Object.fromEntries(Object.entries({
 'atlas-engraved-preview':artwork.preview,'atlas-engraved-vignette':artwork.vignette,
 'atlas-engraved-compass':svg(90,90,'<g fill="none" stroke="#98a48b" stroke-width=".7" opacity=".65"><circle cx="45" cy="45" r="29"/><circle cx="45" cy="45" r="26" stroke-dasharray="1 5"/><path d="m45 12 5 28 28 5-28 5-5 28-5-28-28-5 28-5z"/><path d="m45 20 0 25-6-6z" fill="#98a48b"/><g fill="#98a48b" stroke="none" font-family="Georgia,serif" font-size="7" text-anchor="middle"><text x="45" y="8">N</text><text x="45" y="89">S</text><text x="4" y="48">W</text><text x="86" y="48">E</text></g></g>'),
 'atlas-engraved-controls':svg(153,36,'<rect x=".5" y=".5" width="152" height="35" rx="6" fill="#101722ed" stroke="#344054"/>'),
 'atlas-engraved-locate':svg(24,24,'<g fill="none" stroke="#a9b8ce" stroke-width="1.2"><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="1.5"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/></g>'),
}).map(([key,source])=>[art(key),{...assetRecord(art(key),key,source,'stretch'),viewBox:key.endsWith('terrain')?[0,0,1536,1536]:key.endsWith('preview')||key.endsWith('vignette')?[0,0,838,600]:key.endsWith('compass')?[0,0,90,90]:key.endsWith('controls')?[0,0,153,36]:[0,0,24,24]}]))};}
export function buildEngravedAtlasPage(){
 const m=MAP_ATLAS.map;
 const surface=graphic('atlas-plot',art('atlas-engraved-preview'),0,0,m.width,m.height);
 surface.binding='atlas-plot';surface.source={plotSurface:{terrainResource:'atlas-terrain-resource',bounds:artwork.bounds,glyphs:artwork.glyphs,fogColor:'#020a0d',fogOpacity:.85,fontFamily:'Microsoft YaHei',fontSize:11,labelFill:'rgba(6,17,19,.87)',vignetteAsset:art('atlas-engraved-vignette')}};
 const noBrush={normal:null,hovered:null,pressed:null,disabled:null};
 const controls=[graphic('atlas-controls',art('atlas-engraved-controls'),12,m.height-48,153,36),button('battle-atlas-locate','定位',16,m.height-44,28,28,ui('atlas-center'),{brushes:noBrush,children:[graphic('atlas-locate-icon',art('atlas-engraved-locate'),5,5,18,18)]}),line('atlas-controls-divider',48,m.height-39,1,16),button('battle-atlas-zoom-out','−',56,m.height-44,28,28,ui('atlas-zoom',-1),{brushes:noBrush}),label('battle-atlas-zoom','48%',87,m.height-44,42,28,{fontSize:10,textAlign:'center'},{binding:'atlas-zoom'}),button('battle-atlas-zoom-in','+',132,m.height-44,28,28,ui('atlas-zoom',1),{brushes:noBrush})];
 const viewport=canvas('battle-atlas-map-viewport',m.width,m.height,[node('Image','atlas-terrain-preview',-431.3505448684096,-571.5489744637906,1728,1728,{src:artwork.terrainUri,locked:true}),surface,graphic('atlas-vignette',art('atlas-engraved-vignette'),0,0,m.width,m.height),label('atlas-caption','迷雾之外，群星相连',16,15,300,20,{fontSize:13,color:'#b7c9bc'}),label('atlas-caption-note','沿已连通的道路，探索下一片地域。',16,40,350,18,{fontSize:10,color:'#81998a'}),graphic('atlas-compass',art('atlas-engraved-compass'),m.width-65,14,51,51),...controls,label('atlas-coordinates','-28 · 16',m.width-130,m.height-48,116,18,{fontSize:10,color:'#8b9b8e',textAlign:'right'},{binding:'atlas-coordinates'}),label('atlas-coordinate-caption','已选区域坐标',m.width-130,m.height-29,116,16,{fontSize:9,color:'#647e6c',textAlign:'right'})],{binding:'atlas-viewport',style:{clip:true},slot:{offsets:{left:m.x,top:m.y,right:m.width,bottom:m.height}}});
 return windowPanel('battle-atlas','异界星图',1120,720,[
 rect('atlas-toolbar',1,48,1118,35,'#101722'),line('atlas-toolbar-rule',1,82,1118),label('battle-atlas-summary','0 已通关　|　1 可探索',12,51,400,28,{fontSize:11},{binding:'atlas-summary'}),label('atlas-toolbar-hint','战斗已暂停 · M / Esc 返回',812,51,294,28,{fontSize:10,textAlign:'right'}),viewport,
 rect('atlas-aside',839,83,280,600,'#101722'),line('battle-atlas-aside-line',839,83,1,600),label('battle-atlas-region-heading','区域详情',852,93,256,20,{color:'#a9b8ce',fontWeight:600}),
 label('battle-atlas-region-biome','遗迹',852,397,256,18,{fontSize:10},{binding:'region-biome'}),label('battle-atlas-region-name','初始界域',852,419,256,28,{fontSize:17,fontWeight:600,color:'#e6ebf3'},{binding:'region-name'}),label('battle-atlas-floor','第 1 层',852,451,256,22,{color:'#a9b8ce'},{binding:'region-floor'}),
 atlasEntryButton('battle-atlas-enter',852,612),
 label('battle-atlas-region-description','放入地图后进入区域',852,655,256,24,{fontSize:9,wrap:true,textAlign:'center',verticalAlign:'top'},{binding:'region-note'}),
 rect('atlas-footer',1,684,1118,35,'#101722'),line('atlas-footer-rule',1,683,1118),label('atlas-legend','○ 可探索　○ 挑战中　○ 已通关　○ 未连通　· 迷雾',12,688,560,24,{fontSize:10}),label('atlas-instructions','拖动平移　·　滚轮缩放　·　F 定位　·　Esc 返回',639,688,468,24,{fontSize:10,textAlign:'right'})
 ],{headerHeight:48});
}

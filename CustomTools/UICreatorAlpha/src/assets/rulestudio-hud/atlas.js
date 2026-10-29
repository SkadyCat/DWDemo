import { REGIONS } from './suite-data.js';
import { colors, art, skin, node, text, graphic, canvas, rect, line, ui, button, windowPanel } from './suite-kit.js';

export const ATLAS = { width:1040, height:660, map:{x:16,y:124,width:688,height:470} };
export const regionKind = region => region.status==='已通关'?'completed':region.status==='挑战失败'?'failed':region.status==='尚未连通'?'locked':'available';
export function regionNeighbors(region) {
 const [x,y]=region.id.split(':').map(Number);
 return REGIONS.filter(other=>{const [a,b]=other.id.split(':').map(Number);return Math.abs(x-a)+Math.abs(y-b)===1;});
}
export const regionPoint = region => ({x:(region.x+56)*ATLAS.map.width/970,y:(region.y+44)*ATLAS.map.height/716});
export function atlasBrushes(region,selected=false) {
 const kind=regionKind(region);
 return Object.fromEntries(['normal','hovered','pressed','disabled'].map(state=>[state,art(`atlas-node-${kind}-${selected?'selected':state==='disabled'?'normal':state}`)]));
}
const statusColor = kind => ({completed:'#84a795',available:'#d5b77f',failed:'#c08e7d',locked:'#738092'}[kind]);
const label=(id,value,x,y,w,h=24,style={},props={})=>text(id,value,x,y,w,h,{fontSize:11,color:colors.muted,textOverflow:'shrink',...style},props);

export function buildAtlasPage() {
 const m=ATLAS.map;
 const mapNodes=[graphic('battle-atlas-terrain',art('atlas-terrain'),0,0,m.width,m.height),...REGIONS.map((region,i)=>{
  const p=regionPoint(region),kind=regionKind(region);
  return button(`battle-atlas-node-${i}`,region.name,p.x-52,p.y-32,104,64,ui('region',i),{binding:`region:${i}`,brushes:atlasBrushes(region,i===1),children:[
   graphic(`battle-atlas-node-mark-${i}`,art(`atlas-marker-${kind}`),9,11,19,19),
   label(`battle-atlas-node-name-${i}`,region.name,31,7,67,26,{fontSize:11,color:kind==='locked'?'#8793a3':'#e6ebf3'}),
   label(`battle-atlas-node-state-${i}`,`T${region.floor} · ${region.status==='可以探索'?'可探索':region.status==='尚未连通'?'未连通':region.status}`,7,36,90,20,{fontSize:10,textAlign:'center',color:statusColor(kind)})
  ]});
 })];
 const world=canvas('battle-atlas-world',m.width,m.height,mapNodes,{locked:true});
 const camera=node('ScaleBox','battle-atlas-camera',0,0,m.width,m.height,{locked:true,binding:'atlas-camera',layout:{stretch:'user',scale:1},children:[world]});
 const viewport=canvas('battle-atlas-map-viewport',m.width,m.height,[camera],{binding:'atlas-viewport',style:{clip:true,radius:5},slot:{offsets:{left:m.x,top:m.y,right:m.width,bottom:m.height}}});
 return windowPanel('battle-atlas','异界星图',ATLAS.width,ATLAS.height,[
  label('battle-atlas-summary','1 已通关 · 3 可探索',744,13,240,27,{textAlign:'right',color:colors.muted},{binding:'atlas-summary'}),
  label('battle-atlas-caption','探索路线',16,69,240,25,{fontSize:14,fontWeight:600,color:colors.gold}),
  label('battle-atlas-note','完成相连区域，解锁下一片地域。',16,96,350,20,{fontSize:10}),
  ...[['completed','已通关'],['available','可探索'],['locked','未连通']].flatMap(([kind,value],i)=>[
   graphic(`battle-atlas-legend-mark-${i}`,art(`atlas-marker-${kind}`),439+i*90,76,12,12),
   label(`battle-atlas-legend-label-${i}`,value,454+i*90,70,66,24,{fontSize:10})
  ]),
  rect('battle-atlas-map-frame',m.x-1,m.y-1,m.width+2,m.height+2,'#0b121b','#2b3848',6),viewport,
  button('battle-atlas-locate','F · 复位',16,608,94,29,ui('atlas-center')),
  button('battle-atlas-zoom-out','−',118,608,30,29,ui('atlas-zoom',-1),{binding:'atlas-zoom-out'}),
  label('battle-atlas-zoom','100%',154,608,52,29,{fontSize:11,textAlign:'center',color:colors.text},{binding:'atlas-zoom'}),
  button('battle-atlas-zoom-in','+',214,608,30,29,ui('atlas-zoom',1),{binding:'atlas-zoom-in'}),
  label('battle-atlas-instructions','拖动平移 · 滚轮缩放 · 点击地域查看详情',258,608,446,29,{fontSize:10,textAlign:'right'}),
  line('battle-atlas-aside-line',720,52,1,607),
  label('battle-atlas-region-heading','当前地域',736,70,288,19,{fontSize:10}),
  label('battle-atlas-region-name','雾隐幽林',736,91,288,32,{fontSize:19,fontWeight:600,color:colors.gold},{binding:'region-name'}),
  label('battle-atlas-floor','第 2 层 · 幽林',736,129,288,23,{fontSize:11,color:colors.text},{binding:'region-floor'}),
  rect('battle-atlas-region-frame',736,163,288,150,'#14202b','#2b3b4a',5),
  graphic('battle-atlas-region-art',art('region'),737,164,286,148),
  label('battle-atlas-state-label','区域状态',736,329,118,29),
  label('battle-atlas-state','可以探索',858,329,166,29,{textAlign:'right',color:colors.gold},{binding:'region-status'}),
  label('battle-atlas-neighbors-label','相连地域',736,365,118,29),
  label('battle-atlas-neighbors','3 处',858,365,166,29,{textAlign:'right',color:colors.text},{binding:'region-neighbors'}),
  line('battle-atlas-region-rule',736,409,288),
  label('battle-atlas-region-description','道路已经显现。击败此地的首领，\n将揭开更远处的迷雾。',736,429,288,72,{fontSize:12,wrap:true,verticalAlign:'top'},{binding:'region-note'}),
  label('battle-atlas-region-hint','选择可探索的地域，继续挑战。',736,526,288,37,{fontSize:10,wrap:true}),
  button('battle-atlas-enter','进入区域 →',736,590,288,44,ui('region-enter'),{binding:'region-enter',brushes:skin('button')})
 ]);
}

const svg=body=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">${body}</svg>`;
export function atlasSources() {
 const assets={};
 for(const kind of ['completed','available','failed','locked']) {
  const color=statusColor(kind);
  for(const state of ['normal','hovered','pressed','selected']) {
   const active=state==='selected',fill=active?'#25292c':state==='pressed'?'#252a30':state==='hovered'?'#1c2937':'#131e29';
   assets[`atlas-node-${kind}-${state}`]=svg(`<rect x=".75" y=".75" width="94.5" height="94.5" rx="5" fill="${fill}" stroke="${active?'#d1b278':state==='normal'?'#354153':'#8c7958'}" stroke-width="${active?1.5:1}"/>`);
  }
  const shape=kind==='completed'?'<circle cx="48" cy="48" r="31"/><path d="m32 48 11 11 23-26" fill="none" stroke="#c9ded3" stroke-width="7"/>':kind==='locked'?'<path d="m48 14 34 34-34 34-34-34z"/><path d="M38 47v-7a10 10 0 0 1 20 0v7m-23 0h26v22H35z" fill="none" stroke="#a2afbf" stroke-width="5"/>':kind==='failed'?'<path d="m48 14 34 34-34 34-34-34z"/><path d="M48 30v23m0 9v4" fill="none" stroke="#e9c1ad" stroke-width="7"/>':'<path d="m48 10 36 38-36 38-36-38z"/><path d="m48 30 18 18-18 18-18-18z" fill="#ead4a5"/>';
  assets[`atlas-marker-${kind}`]=svg(`<g fill="${color}" fill-opacity=".3" stroke="${color}" stroke-width="4">${shape}</g>`);
 }
 let terrain='<rect width="96" height="96" fill="#0d1621"/><path d="M0 7q18 16 8 35T4 96H0ZM96 8q-16 9-11 30T72 96h24Z" fill="#101f2b"/>';
 for(let i=0;i<11;i++)terrain+=`<path d="M${-16+i*12} -4q-17 25 3 47t-2 57" fill="none" stroke="#2b3a48" stroke-width=".18" opacity=".55"/>`;
 for(let i=0;i<22;i++){const x=i*37%89+3,y=i*23%83+6;terrain+=`<path d="m${x} ${y} 1.4-2.6 1.7 3.3m-1.7-3.3 .3 1.9" fill="none" stroke="#52606d" stroke-width=".2" opacity=".45"/>`;}
 for(let i=0;i<REGIONS.length;i++)for(const other of regionNeighbors(REGIONS[i])){
  if(REGIONS.indexOf(other)<=i)continue;
  const a=regionPoint(REGIONS[i]),b=regionPoint(other),open=regionKind(REGIONS[i])!=='locked'&&regionKind(other)!=='locked';
  terrain+=`<path d="M${a.x/ATLAS.map.width*96} ${a.y/ATLAS.map.height*96}L${b.x/ATLAS.map.width*96} ${b.y/ATLAS.map.height*96}" fill="none" stroke="${open?'#9a845c':'#4b5865'}" stroke-width=".24"${open?'':' stroke-dasharray=".8 .65"'}/>`;
 }
 assets['atlas-terrain']=svg(terrain);
 assets.region=svg('<defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#243746"/><stop offset="1" stop-color="#14212d"/></linearGradient></defs><rect width="96" height="96" fill="url(#sky)"/><circle cx="74" cy="23" r="10" fill="#c7b58a" opacity=".2"/><path d="m0 64 18-30 18 21 17-34 23 37 20-16v54H0" fill="#344551"/><path d="m0 78 23-25 16 16 20-27 16 32 21-15v37H0" fill="#20353d"/><path d="M56 96q-15-15-3-28t-5-18" fill="none" stroke="#869795" stroke-width="1.5" opacity=".5"/><path d="m7 88 5-22 6 22h-4v8h-5v-8m58-5 6-25 7 25h-5v13h-4V83m10 2 4-18 5 18h-3v11h-3V85" fill="#14282c"/>');
 return assets;
}

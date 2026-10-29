import { createDocument, createNode } from '../../core/model.js';

export const LOOT_PROJECT='opus-rulestudio-loot-20261025';
export const LOOT_FAMILIES=[
 ['common','普通','#c5cbd6',''],['magic','魔法','#86b8ff',''],['rare','稀有','#f3d46d',''],['legendary','传奇','#f6a367',''],['unique','独特','#c59aff',''],
 ['currency-1','一阶通货','#d8c9a0','Ⅰ'],['currency-2','二阶通货','#81e2d3','Ⅱ'],['currency-3','三阶通货','#f4b4cf','Ⅲ'],['currency-special','特殊通货','#f2c178','◆'],['omen','征兆','#c5b7f4','✧'],
].map(([id,name,color,mark])=>({id,name,color,mark}));
const N=(type,id,x,y,w,h,props={})=>createNode(type,{id,name:id,slot:{offsets:{left:x,top:y,right:w,bottom:h}},layout:{width:w,height:h},...props});
const T=(id,text,x,y,w,h=22,size=12,color='#cdd8e8',props={})=>N('TextBlock',id,x,y,w,h,{...props,text,style:{fontSize:size,color,wrap:false,textOverflow:'shrink',textPadding:0,...props.style},source:{safeRect:{x,y,width:w,height:h},maxChars:48,overflow:'shrink',...props.source}});
export function createLootProject(){
 const p=createDocument('RuleStudio · 地面掉落与拾取');p.id=LOOT_PROJECT;p.viewport={width:1600,height:900,background:'#090c12'};
 p.root=N('CanvasPanel','loot-root',0,0,1600,900);
 const asset=(id,w,h,body)=>{p.assets[id]={id,name:id,viewBox:[0,0,w,h],source:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${body}</svg>`,scaleMode:'stretch'};return id;};
 const graphic=(id,x,y,w,h,a)=>N('Svg',id,x,y,w,h,{svgAsset:a,locked:true});
 const panel=asset('loot-panel',340,600,'<rect x=".5" y=".5" width="339" height="599" rx="7" fill="#0e1521" fill-opacity=".98" stroke="#425267"/><path d="M1 51H339" stroke="#293544"/>');
 const details=asset('loot-details-frame',320,340,'<rect x=".5" y=".5" width="319" height="339" rx="7" fill="#0e1521" fill-opacity=".98" stroke="#715734"/>');
 const buttonBrush={};
 for(const [state,fill,stroke] of [['normal','#172230','#3d5065'],['hovered','#233448','#8daac8'],['pressed','#111b29','#73c4e7'],['disabled','#10161f','#293442']])buttonBrush[state]=asset(`loot-button-${state}`,140,30,`<rect x=".5" y=".5" width="139" height="29" rx="4" fill="${fill}" stroke="${stroke}"/>`);
 const closeBrush=Object.fromEntries(Object.entries(buttonBrush).map(([state])=>[state,asset(`loot-close-${state}`,30,30,`<rect x=".5" y=".5" width="29" height="29" rx="4" fill="#172230" stroke="${state==='normal'?'#3d5065':'#8daac8'}"/>`)]));
 const sizedBrushes=new Map([[30,closeBrush],[140,buttonBrush]]);
 const brushFor=w=>{if(!sizedBrushes.has(w))sizedBrushes.set(w,Object.fromEntries(Object.keys(buttonBrush).map(state=>[state,asset(`loot-button-${w}-${state}`,w,30,`<rect x=".5" y=".5" width="${w-1}" height="29" rx="4" fill="#172230" stroke="${state==='normal'?'#3d5065':'#8daac8'}"/>`)])));return sizedBrushes.get(w);};
 const button=(id,label,x,y,op,value='',w=140)=>N('Button',id,x,y,w,30,{name:label,action:{type:'loot',op,value},brushes:brushFor(w),children:[T(id+'-text',label,7,0,w-14,30,11,'#cfdaea',{style:{textAlign:'center'}})]});
 // Text and grade marks remain separate runtime nodes, never baked into SVG.
 for(const f of LOOT_FAMILIES){
  const brushes={};
  for(const [state,opacity]of[['normal','.55'],['hovered','1'],['pressed','1'],['disabled','.2']])brushes[state]=asset(`loot-label-${f.id}-${state}`,260,26,`<rect x=".5" y=".5" width="259" height="25" rx="2" fill="${state==='normal'?'#080b12':'#141e2c'}" fill-opacity=".95" stroke="${f.color}" stroke-opacity="${opacity}"/>${f.mark?`<path d="M1 1V25" stroke="${f.color}" stroke-width="2"/>`:''}`);
  const children=[T(f.id+'-label-name','',f.mark?35:9,0,f.mark?215:242,26,11,f.color,{binding:'loot:name',style:{textOverflow:'ellipsis'}})];
  if(f.mark)children.push(T(f.id+'-label-grade',f.mark,6,0,21,26,10,f.color,{binding:'loot:grade',style:{textAlign:'center'},source:{maxChars:1}}));
  const label=N('Button',f.id+'-label',0,0,260,26,{name:'拾取掉落',brushes,binding:'loot:pick',action:{type:'loot',op:'pickup',value:'$key'},children:[N('CanvasPanel',f.id+'-label-content',0,0,260,26,{children})]});
  const id='loot-prefab-'+f.id;p.prefabs[id]={id,name:f.name+' · 地面标牌',width:260,height:26,root:N('CanvasPanel',f.id+'-template',0,0,260,26,{children:[label]})};
 }
 const hunterChildren=[graphic('hunter-bg',0,0,340,600,panel),T('hunter-title','掉落 Hunter',16,12,270,28,16,'#e3cb95'),button('hunter-close','×',294,10,'hunter-close','',30),
  button('hunter-enabled','启用过滤',16,64,'hunter-toggle'),T('hunter-count','',170,67,152,24,11,'#8d9fb6',{binding:'hunter:count'}),T('hunter-affix-heading','词条 Hunter',16,112,148,22,13,'#e3cb95'),T('hunter-and','装备 · 全部满足 AND',146,114,176,20,10,'#8798ad'),
  T('hunter-selection','尚未选择装备条件',16,144,308,30,11,'#98abc2',{binding:'hunter:selected',style:{wrap:true}}),button('hunter-search','搜索现有词条',16,180,'hunter-search','',308),button('hunter-clear','清空词条',16,220,'hunter-clear'),button('hunter-only','仅看已选',184,220,'hunter-only'),
  N('ScrollBox','hunter-affixes',16,262,308,126,{binding:'hunter:affixes',layout:{gap:4},children:[]}),button('hunter-prev','上一页',16,394,'hunter-page',-1,80),T('hunter-pages','',104,394,132,30,10,'#98abc2',{binding:'hunter:pages',style:{textAlign:'center'}}),button('hunter-next','下一页',244,394,'hunter-page',1,80),T('hunter-currency-heading','通货 Hunter',16,436,180,22,13,'#e3cb95'),
  N('ScrollBox','hunter-currencies',16,468,308,72,{binding:'hunter:currencies',layout:{gap:4},children:[]}),T('hunter-footer','装备匹配全部已选词条，通货按所选种类显示。关闭面板保留当前过滤设置。',16,550,308,38,10,'#8798ad',{style:{wrap:true}})];
 p.prefabs['loot-prefab-hunter']={id:'loot-prefab-hunter',name:'掉落 Hunter',width:340,height:600,root:N('CanvasPanel','hunter',0,0,340,600,{children:hunterChildren})};
 p.prefabs['loot-prefab-details']={id:'loot-prefab-details',name:'地面物品悬停详情',width:320,height:340,root:N('CanvasPanel','details',0,0,320,340,{children:[graphic('details-bg',0,0,320,340,details),T('details-name','',16,14,288,28,16,'#f3d46d',{binding:'details:name'}),T('details-type','',16,47,288,22,11,'#90a2bb',{binding:'details:type'}),T('details-description','',16,86,288,174,12,'#cdd8e8',{binding:'details:description',style:{wrap:true,verticalAlign:'top'},source:{maxChars:1200}}),T('details-hint','Ctrl 固定详情 · 点击地面标牌靠近拾取',16,272,288,22,10,'#899bb0'),button('details-pick','靠近并拾取',16,300,'pickup-detail'),button('details-close','关闭',164,300,'details-close')]})};
 const top=asset('loot-summary-frame',300,64,'<rect x=".5" y=".5" width="299" height="63" rx="7" fill="#0e1521" stroke="#344459"/>');
 p.root.children.push(graphic('summary-bg',20,18,300,64,top),T('summary-title','地面掉落',36,26,190,22,13,'#e3cb95'),T('summary-count','',36,51,268,20,11,'#93a8bd',{binding:'loot:summary'}),button('open-hunter','掉落 Hunter',342,34,'hunter-open'),button('toggle-loot','显示地面掉落 · Z',498,34,'toggle-loot'),T('pickup-feedback','',680,38,880,24,12,'#86dfc1',{binding:'loot:feedback'}));
 p.root.children.push(N('CanvasPanel','ground-labels',0,0,1600,900,{binding:'loot:labels'}));
 p.root.children.push(N('PrefabInstance','hunter-window',20,106,340,600,{prefabId:'loot-prefab-hunter',binding:'loot:hunter-window'}));
 p.root.children.push(N('PrefabInstance','details-window',1240,190,320,340,{prefabId:'loot-prefab-details',visibility:'collapsed',binding:'loot:details-window'}));
 p.root.children.push(T('loot-help','点击名称靠近拾取 · WASD 取消靠近 · Ctrl 固定详情 · Z 显示掉落',400,848,800,26,11,'#8d9fb6',{style:{textAlign:'center'}}));
 const scene=structuredClone(p.root);const prefix=n=>{n.id='scene-'+n.id;for(const c of n.children)prefix(c);};prefix(scene);
 p.prefabs['loot-prefab-scene']={id:'loot-prefab-scene',name:'地面掉落与拾取',width:1600,height:900,root:scene};
 p.interfaceCatalog=[{id:'ground',title:'地面掉落与拾取',prefabId:'loot-prefab-scene',group:'掉落',source:'RuleStudio ground-loot.mjs'},{id:'hunter',title:'掉落 Hunter',prefabId:'loot-prefab-hunter',group:'掉落',source:'RuleStudio battle-loot-hunter.mjs'},{id:'details',title:'地面物品详情',prefabId:'loot-prefab-details',group:'掉落',source:'RuleStudio item inspector'}];
 p.provenance={source:'RuleStudio floor-rewards / loot-hunter / loot-style / ground-loot',prototype:true,textLayoutVersion:1,runtime:'UICreator UIRuntime; original RuleStudio engine snapshot runs only in the authoring prototype',rules:['PICKUP_RADIUS=200','Hunter equipment=AND','inventory-origin drops bypass Hunter','nearest 96 labels','one claim per ground key']};
 return p;
}

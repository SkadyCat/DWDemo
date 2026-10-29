import {createDocument, createNode} from '../../core/model.js';

export const DROP_STUDIO = {width: 1120, height: 1890};
export const MAP_DROP_GRID = {columns: 12, rows: 3, size: 36};
const C = {text: '#e6edf5', dim: '#8698ad', line: '#263445', teal: '#79d6bd', gold: '#e6c36f', blue: '#71a7ff'};
const node = (type, id, x, y, w, h, props = {}) => { const n = createNode(type, {id, name: id, locked: type !== 'Button',
  slot: {offsets: {left: x, top: y, right: w, bottom: h}}, layout: {width: w, height: h},
  motion: {preset: 'none'}, ...props}); n.audio = {enabled: false, volume: 1, pitch: 1, events: {}}; return n; };
const text = (id, value, x, y, w, h = 24, size = 13, color = C.text, extra = {}) => node('TextBlock', id, x, y, w, h,
  {text: value, binding: id, style: {fontSize: size, color, wrap: false, textOverflow: 'ellipsis', ...extra}});
const box = (id, x, y, w, h, fill = '#111c29', stroke = C.line, radius = 10) => node('Border', id, x, y, w, h,
  {style: {fill, stroke, strokeWidth: stroke === 'transparent' ? 0 : 1, radius}});
const line = (id, x, y, w) => box(id, x, y, w, 1, C.line, 'transparent', 0);
function button(id, value, x, y, w, h, op, extra = {}) {
  return node('Button', id, x, y, w, h, {name: value, binding: id, action: {type: 'drop-studio', op},
    brushes: {normal: 'drop-btn', hovered: 'drop-hover', pressed: 'drop-active', disabled: 'drop-disabled'},
    children: [node('CanvasPanel', id + '-content', 0, 0, w, h, {children: [text(id + '-text', value, 8, 0, w - 16, h, 12, C.text, {textAlign: 'center'})]})], ...extra});
}
const bar = (id, x, y, w, h, color, value = .5) => node('ProgressBar', id, x, y, w, h,
  {value, binding: id, style: {fill: '#1d2a39', color, progressPadding: 0, radius: 3}});

export function createDropStudioProject() {
  const d = createDocument('掉落设计台 · 池配置与产出分析'); d.id = 'opus-drop-studio';
  d.viewport = {...DROP_STUDIO, background: '#0b111b'}; d.sounds = {}; d.motions = {};
  const a = [];
  a.push(text('ds-eyebrow', 'ECONOMY  /  LOOT SYSTEM', 24, 16, 600, 20, 10, C.teal, {letterSpacing: 2}),
    text('ds-title', '掉落设计台', 22, 39, 420, 44, 30, C.text, {fontWeight: 650}),
    text('ds-subtitle', '怪物分级、品质与特殊道具池，一处比较预期产出。', 24, 88, 740, 24, 13, C.dim),
    box('ds-status-bg', 852, 29, 244, 29, '#302a1d', '#635332', 14),
    text('ds-status', '设计草案 v0.1 · 未应用到游戏', 866, 31, 216, 25, 11, C.gold, {textAlign: 'center'}),
    button('ds-export', '↓ 导出完整 CSV', 928, 77, 168, 34, 'export'),
    box('ds-toolbar', 24, 134, 1072, 62, '#101b28'),
    button('ds-mode-draft', '建议草案', 36, 148, 100, 34, 'mode:draft'),
    button('ds-mode-current', '当前实现', 140, 148, 100, 34, 'mode:current'),
    text('ds-scenario-label', '怪物样本', 276, 153, 72, 24, 11, C.dim),
    button('ds-scenario-standard', '标准 100 怪', 348, 148, 116, 34, 'scenario:standard'),
    button('ds-scenario-elite', '精英密集', 470, 148, 100, 34, 'scenario:elite'),
    button('ds-scenario-boss', '单个首领', 576, 148, 100, 34, 'scenario:boss'),
    text('ds-tier-label', '地图层级', 777, 153, 70, 24, 11, C.dim),
    button('ds-tier-down', '−', 855, 148, 32, 34, 'tier:-1'),
    text('ds-tier', 'T10', 889, 149, 69, 32, 16, C.teal, {textAlign: 'center', fontWeight: 600}),
    button('ds-tier-up', '+', 960, 148, 32, 34, 'tier:1'),
    text('ds-tier-cap', '装备 ≤ T10', 1000, 151, 84, 28, 10, C.dim));
  const kpis = [['gear','装备总量','#e6edf5'], ['rare','稀有装备',C.gold], ['legend','传奇装备','#f49461'], ['currency','制作通货',C.teal]];
  kpis.forEach(([id, title, color], i) => {
    const x = 24 + i * 272;
    a.push(box('ds-kpi-' + id, x, 216, 256, 118), box('ds-kpi-' + id + '-accent', x + 16, 235, 3, 14, color, 'transparent', 1),
      text('ds-kpi-' + id + '-title', title, x + 28, 229, 188, 26, 12, C.dim),
      text('ds-kpi-' + id + '-value', '—', x + 16, 258, 222, 40, 32, color, {fontWeight: 600}),
      text('ds-kpi-' + id + '-compare', '当前实现 —', x + 18, 303, 220, 20, 11, C.dim));
  });
  a.push(text('ds-sample-note', '标准样本 · 80 普通 / 15 魔法 / 4 稀有 / 1 首领 · 长期期望值，非每局保底', 26, 343, 1068, 24, 11, C.dim),
    box('ds-monster-panel', 24, 384, 696, 320),
    text('ds-monster-title', '01  怪物奖励矩阵', 44, 399, 440, 30, 17, C.text, {fontWeight: 600}),
    text('ds-row-hint', '点击一行查看池内结构', 501, 402, 195, 24, 11, C.dim, {textAlign: 'right'}),
    ...[['来源',44,130], ['装备 / 击杀',184,98], ['稀有以上¹',295,100], ['通货池触发',412,100], ['预兆池触发',529,100]].map(([t,x,w],i) => text('ds-th-' + i,t,x,441,w,28,11,C.dim)),
    line('ds-matrix-line',44,475,650));
  ['common','magic','rare','boss'].forEach((id, i) => {
    const y = 485 + i * 45;
    a.push(button('ds-monster-' + id, ['普通怪','魔法怪','稀有怪','首领 Boss'][i], 38, y, 662, 41, 'monster:' + id,
      {children: [node('CanvasPanel', 'ds-row-' + id, 0, 0, 662, 41, {children: [
        box('ds-row-' + id + '-dot', 8, 17, 6, 6, ['#aab8ca',C.blue,C.gold,'#f49461'][i], 'transparent', 3),
        text('ds-row-' + id + '-name', ['普通怪','魔法怪','稀有怪','首领 Boss'][i], 24, 0, 108, 41, 13),
        text('ds-row-' + id + '-gear','—',146,0,98,41,14), text('ds-row-' + id + '-quality','—',257,0,100,41,13,C.gold),
        text('ds-row-' + id + '-currency','—',374,0,100,41,13,C.teal), text('ds-row-' + id + '-omen','—',491,0,100,41,13,'#b6a2df')
      ]})]}));
  });
  a.push(text('ds-matrix-foot', '¹ 已掉落装备中的稀有与传奇占比；含额外定向装备。',44,670,650,22,10,C.dim),
    box('ds-quality-panel',736,384,360,320),
    text('ds-quality-title','稀有怪 · 装备结构',756,400,310,30,17,C.text,{fontWeight:600}),
    text('ds-quality-note','1 件保底 + 25% 额外，独立抽取品质',756,433,310,24,11,C.dim));
  ['common','magic','rare','legendary'].forEach((id, i) => {
    const y = 472 + i * 35, color = ['#aab8ca',C.blue,C.gold,'#f49461'][i];
    a.push(text('ds-quality-' + id + '-name',['普通','魔法','稀有','传奇'][i],756,y,55,24,12,color),
      bar('ds-quality-' + id + '-bar',816,y+9,178,6,color),
      text('ds-quality-' + id + '-value','—',1006,y,68,24,12,color,{textAlign:'right'}));
  });
  a.push(line('ds-quality-line',756,623,320),text('ds-directed-label','Boss 额外定向池',756,640,194,24,12,C.dim),
    text('ds-directed-value','15%',950,638,124,28,20,'#f49461',{textAlign:'right'}));
  a.push(box('ds-items-panel',24,724,696,380), text('ds-items-title','02  特殊道具权重',44,740,360,30,17,C.text,{fontWeight:600}),
    text('ds-items-source','稀有怪 · 与装备品质独立抽取',375,744,321,24,11,C.dim,{textAlign:'right'}),
    button('ds-pool-currency','制作通货',44,784,104,31,'pool:currency'),button('ds-pool-omen','预兆',154,784,80,31,'pool:omen'),
    button('ds-pool-consumable','消耗品',240,784,92,31,'pool:consumable'),
    text('ds-pool-trigger','触发 75% · 数量 1–3',350,787,346,24,12,C.teal,{textAlign:'right'}),
    ...[['道具',44,210],['权重',288,72],['池内占比',396,110],['每百同类击杀',550,146]].map(([t,x,w],i)=>text('ds-item-th-'+i,t,x,827,w,26,11,C.dim)),
    line('ds-item-line',44,858,650));
  // Ten authored rows are enough for the largest pool (omens); its viewport owns scrolling.
  a.push(node('ScrollBox','ds-item-scroll',38,866,668,180,{locked:false,layout:{gap:0},style:{clip:true},children:Array.from({length:10},(_,i)=>node('CanvasPanel','ds-item-'+i,0,i*30,648,30,{children:[
    text('ds-item-'+i+'-name','—',6,0,225,30,12),text('ds-item-'+i+'-weight','—',250,0,80,30,12,C.dim),
    bar('ds-item-'+i+'-bar',358,13,74,4,C.teal),text('ds-item-'+i+'-share','—',440,0,72,30,11,C.dim),
    text('ds-item-'+i+'-expected','—',525,0,119,30,13,C.teal,{textAlign:'right'})
  ]}))}));
  a.push(text('ds-item-foot','占比以该子池成功触发为条件；预期数量包含堆叠。',44,1062,650,24,11,C.dim),
    box('ds-output-panel',736,724,360,380), text('ds-output-title','样本产出对比',756,741,310,30,17,C.text,{fontWeight:600}),
    box('ds-output-key-current',756,789,8,8,'#53667d','transparent',2),text('ds-output-key-current-text','当前',770,780,65,24,11,C.dim),
    box('ds-output-key-draft',845,789,8,8,C.teal,'transparent',2),text('ds-output-key-draft-text','草案',859,780,65,24,11,C.teal));
  ['currency','omen','consumable','maps'].forEach((id,i)=>{
    const y=822+i*63;
    a.push(text('ds-output-'+id+'-title',['制作通货','预兆','消耗品','地图续航'][i],756,y,130,22,12,C.dim),
      text('ds-output-'+id+'-values','—',890,y,184,22,12,C.text,{textAlign:'right'}),
      bar('ds-output-'+id+'-current',756,y+30,318,4,'#53667d'),bar('ds-output-'+id+'-draft',756,y+39,318,4,C.teal));
  });
  a.push(text('ds-output-foot','地图为独立续航草案，不代表全游戏地图总产出。',756,1076,320,18,9,C.dim),
    box('ds-bottom-panel',24,1124,1072,142),
    text('ds-bottom-title','03  层级与首领定向',44,1138,350,28,16,C.text,{fontWeight:600}),
    text('ds-tier-policy','装备 T 上限 10 · 草案集中最高三档',44,1172,490,24,12,C.dim));
  for(let i=0;i<10;i++)a.push(bar('ds-gear-tier-'+i,44+i*48,1215,37,7,C.teal),text('ds-gear-tier-'+i+'-label','T'+(i+1),44+i*48,1231,37,20,10,C.dim,{textAlign:'center'}));
  a.push(line('ds-bottom-divide',550,1165,0),text('ds-boss-a','万刃霜皇 → 万剑系列',580,1172,485,24,13,'#86c9ef'),
    text('ds-boss-b','焚界血炉 → 余烬回响系列',580,1200,485,24,13,'#f49461'),
    text('ds-boss-note','额外 15% · 每系列 5 个现有模板 · 原全局获取途径保留',580,1231,485,20,10,C.dim));
  // The map catalogue is a read-only grid. Existing analytical panels retain their layout.
  for (const n of a) if (n.slot.offsets.top >= 216) n.slot.offsets.top += 600;
  a.push(box('ds-map-panel',24,216,1072,580),
    text('ds-map-heading','每张地图的掉落池',44,229,420,30,18,C.text,{fontWeight:600}),
    text('ds-map-status','正在读取地图掉落池…',500,232,484,24,11,C.dim,{textAlign:'right'}),
    button('ds-map-refresh','刷新',1000,230,76,30,'map-refresh'));
  for(let i=0;i<10;i++) a.push(button('ds-map-'+i,'T'+(i+1),44+i*104,274,96,30,'map:'+i));
  a.push(text('ds-map-summary','',44,309,1032,24,12,C.dim));
  for(const [i,[id,label]] of [['all','全部'],['equipment','装备'],['currency','制作通货'],['omen','预兆'],['consumable','消耗品'],['material','材料']].entries())
    a.push(button('ds-map-filter-'+id,label,44+i*122,342,116,30,'map-filter:'+id));
  a.push(text('ds-map-count','',802,344,274,24,11,C.dim,{textAlign:'right'}));
  const cells=Array.from({length:MAP_DROP_GRID.size},(_,i)=>{
    const id='ds-map-cell-'+i;
    return button(id,'空格',i%MAP_DROP_GRID.columns*86,Math.floor(i/MAP_DROP_GRID.columns)*94,84,90,'map-item:'+i,
      {interactable:false,brushes:{normal:'drop-cell-common',hovered:'drop-cell-hover',pressed:'drop-cell-selected',disabled:'drop-cell-empty'},
        style:{fill:'transparent',stroke:'transparent',radius:0},children:[node('CanvasPanel',id+'-content',0,0,84,90,{children:[
          node('Image',id+'-icon',12,2,60,60,{binding:'map-candidate-icon'}),
          text(id+'-name','',0,67,84,20,10,C.text,{textAlign:'center'})
        ]})]});
  });
  a.push(node('CanvasPanel','ds-map-grid',44,386,1032,278,{children:cells}),
    text('ds-map-empty','',44,468,1032,50,14,C.dim,{textAlign:'center'}),
    text('ds-map-note','格子展示可能掉落的模板；实际数量、品质与词缀仍由掉落规则决定。',44,682,730,28,11,C.dim),
    button('ds-map-prev','‹',866,681,38,30,'map-page:-1'),
    text('ds-map-page','1 / 1',908,682,126,28,12,C.dim,{textAlign:'center'}),
    button('ds-map-next','›',1038,681,38,30,'map-page:1'),
    line('ds-map-detail-line',44,720,1032),
    text('ds-map-detail-name','选择一个格子查看物品',44,730,600,22,13,C.text,{fontWeight:600}),
    text('ds-map-detail-meta','',660,730,416,22,11,C.dim,{textAlign:'right'}),
    text('ds-map-detail-description','',44,757,1032,22,11,C.dim));
  for(const [id,color]of [['common','#637487'],['magic',C.blue],['rare',C.gold],['legendary','#f49461'],['hover',C.teal],['selected','#ffe0a0'],['empty','#263445']])
    d.assets['drop-cell-'+id]={id:'drop-cell-'+id,name:'物品格子 · '+id,viewBox:[0,0,84,90],scaleMode:'contain',
      source:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 84 90"><rect x="10.5" y=".5" width="63" height="63" rx="6" fill="${id==='selected'?'#2c2c25':'#0e1925'}" stroke="${color}" stroke-width="${id==='selected'?2:1}"/>${id==='selected'?'<path d="m59 8 4 4 7-7" fill="none" stroke="#ffe0a0" stroke-width="2"/>':''}</svg>`};
  d.root=node('CanvasPanel','ds-root',0,0,DROP_STUDIO.width,DROP_STUDIO.height,{children:a});
  for(const [id,fill,stroke]of [['drop-btn','#152130','#29394b'],['drop-hover','#203448','#69899c'],['drop-active','#1f3a3b','#70bda9'],['drop-disabled','#101924','#223040']])
    d.assets[id]={id,name:id,viewBox:[0,0,96,96],scaleMode:'nine-slice',slice:{left:12,top:12,right:12,bottom:12},
      source:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect x=".5" y=".5" width="95" height="95" rx="8" fill="${fill}" stroke="${stroke}"/></svg>`};
  d.presentation={purpose:'Design-tool analytics; no gameplay mutations',source:'assets/data/drop-design.v1.json',mapPools:'/api/drop-pools',defaultState:{mode:'draft',scenario:'standard',monster:'rare',pool:'currency',mapTier:10,mapId:'',mapCategory:'all',mapPage:0,mapSelected:''}};
  return d;
}

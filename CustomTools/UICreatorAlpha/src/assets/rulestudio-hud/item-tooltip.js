import { clone, walk } from '../../core/model.js';
import { GEAR, ITEMS } from './suite-data.js';
import { canvas, text, graphic, rect, line, button, skin, art, ui, fill } from './suite-kit.js';

export const ITEM_TOOLTIP_ID='battle-prefab-item-hover';
export const itemColor=item=>({normal:'#aab4c3',common:'#aab4c3',magic:'#5b9dff',rare:'#f7d046',legendary:'#ff8a3d',unique:'#c38bff',skill:'#56c8f5'}[item.rarity]||'#b7c1d3');
const label=(id,value,x,y,w,h,style={},props={})=>text(id,value,x,y,w,h,{fontSize:11,textPaddingX:0,textPaddingY:1,wrap:true,textOverflow:'shrink',...style},props);
const typeName=item=>item.kind==='equipment'?`${{normal:'普通',common:'普通',magic:'魔法',rare:'稀有',legendary:'传奇',unique:'独特'}[item.rarity]||'装备'} · ${GEAR.find(([id])=>id===item.slot)?.[1]||'装备'}`:item.category==='map'?`地图物品 · T${item.tier||1}`:item.kind==='skill'?'技能':item.category==='omen'||(item.catalogId||item.id).startsWith('omen')?'预兆':item.category==='consumable'||item.id==='potion'?'消耗品':'通货';
export function inspectorAffixRow(index=0) {
 const id=`battle-item-hover-affix-${index}`;
 return button(id,'词条说明 / 选定洗炼',0,0,332,34,ui('hover-affix',String(index)),{binding:'hover-affix',brushes:{normal:'',hovered:art('cell-hovered'),pressed:art('cell-pressed'),disabled:''},children:[
  rect(`${id}-eligible`,0,1,332,32,'#29434c66','#528d9b',3),
  label(`${id}-text`,'基础气血 +116',0,0,262,34,{fontWeight:600,color:'#dce4ed'}),
  label(`${id}-grade`,'',267,0,30,34,{fontSize:10,color:'#71c8ca',textAlign:'right'}),
  label(`${id}-tier`,'T10',302,0,30,34,{fontSize:9,color:'#7f8aa1',textAlign:'right'})
 ]});
}
export function inspectorMaterialCell(kind='currency',index=0) {
 const id=`battle-item-hover-${kind}-${index}`;
 return button(id,kind==='currency'?'激活通货':'激活预兆',index*50,24,44,44,ui(`hover-${kind}`,'sample'),{binding:`hover-${kind}`,brushes:skin('cell'),children:[
  graphic(`${id}-icon`,art(kind==='currency'?'stone-green':'omen-fire'),2,2,40,40),
  label(`${id}-grade`,kind==='currency'?'下':'',23,1,18,15,{fontSize:9,color:'#d8e9fa',textAlign:'right'}),
  label(`${id}-count`,'3',23,27,18,15,{fontSize:10,fontWeight:600,color:'#e6ebf3',textAlign:'right'}),
  rect(`${id}-active`,.5,.5,43,43,'#6be6ca12','#8ce1c7',4),
  label(`${id}-check`,'✓',2,26,16,16,{fontSize:12,color:'#84e2c2'})
 ]});
}
export function itemTooltipTemplate() {
 const root=canvas('battle-item-hover',360,760,[
  fill(rect('battle-item-hover-frame',0,0,360,760,'#101722fa','#a18c5e',8)),
  graphic('battle-item-hover-icon',art('helmet'),14,14,42,42),
  label('battle-item-hover-name','T10 · 风暴群·风壁衣',66,9,246,25,{fontSize:14,fontWeight:600,color:'#f7d046'},{binding:'hover-name'}),
  label('battle-item-hover-meta','稀有 · 胸甲 · 数量 1',66,36,278,20,{fontSize:10,color:'#7f8aa1'},{binding:'hover-meta'}),
  line('battle-item-hover-rule',1,63,358),
  label('battle-item-hover-hint','已固定 · 点击右上角 × 关闭',12,68,336,20,{fontSize:10,color:'#7f8aa1'},{binding:'hover-hint'}),
  canvas('battle-item-hover-content',332,350,[
   label('battle-item-hover-line-0','装备说明',0,0,332,26),
   label('battle-item-hover-base','基础护盾 +93',0,26,332,30,{color:'#ff923d',fontWeight:600}),
   label('battle-item-hover-line-1','6 条随机词条 · 洗炼词条 T1–T10',0,56,332,24,{fontSize:10,color:'#7f8aa1'}),
   label('battle-item-hover-targets','已选定洗炼 0/3 条',0,80,332,24,{fontSize:10,color:'#7f8aa1'}),
   label('battle-item-hover-reroll-hint','点击闪烁词条，用下品灵石选定或洗炼',0,104,332,24,{fontSize:10,color:'#83d6dd'}),
   (row=>{row.slot.offsets.top=136;return row;})(inspectorAffixRow(0))
  ],{locked:true,binding:'hover-content',slot:{offsets:{left:14,top:96,right:332,bottom:350}}}),
  canvas('battle-item-hover-crafting',332,236,[
   line('battle-item-hover-craft-rule',0,0,332),
   canvas('battle-item-hover-currencies',332,70,[label('battle-item-hover-currency-title','通货',0,0,60,20,{fontWeight:600}),label('battle-item-hover-currency-active','点击图标激活',68,0,264,20,{fontSize:10,color:'#7f8aa1',textAlign:'right'}),inspectorMaterialCell('currency')],{slot:{offsets:{left:0,top:10,right:332,bottom:70}}}),
   canvas('battle-item-hover-omens',332,70,[label('battle-item-hover-omen-title','预兆',0,0,60,20,{fontWeight:600}),label('battle-item-hover-omen-active','可选 · 点击图标激活',68,0,264,20,{fontSize:10,color:'#7f8aa1',textAlign:'right'}),inspectorMaterialCell('omen')],{slot:{offsets:{left:0,top:90,right:332,bottom:70}}}),
   label('battle-item-hover-craft-note','',0,166,332,0,{fontSize:10,color:'#7f8aa1'},{visibility:'collapsed'}),
   label('battle-item-hover-blocked','请选择并激活通货',0,230,332,22,{fontSize:10,color:'#7f8aa1'}),
   button('battle-item-hover-whole','重新随机生成 4 条词缀',0,256,332,30,ui('hover-whole'))
  ],{slot:{offsets:{left:14,top:450,right:332,bottom:290}}}),
  button('battle-item-hover-identify','鉴定装备',14,400,100,30,ui('hover-identify')),
  label('battle-item-hover-feedback','',14,700,332,30,{fontSize:10,color:'#7dd9bb'}),
  button('battle-item-hover-close','关闭物品详情',322,14,24,24,ui('hover-close'),{brushes:skin('close'),children:[label('battle-item-hover-close-text','×',0,0,24,24,{fontSize:17,fontFamily:'Arial, sans-serif',textAlign:'center'})]}),
  canvas('battle-item-hover-actions',332,42,[line('battle-item-hover-footer-rule',0,0,332),button('battle-item-hover-equip','卸下',0,10,60,28,ui('hover-equip'))],{locked:true,binding:'hover-actions',slot:{offsets:{left:14,top:710,right:332,bottom:42}}})
 ],{name:'RuleStudio3D 物品详情 · 原位加工',locked:true});
 return {id:ITEM_TOOLTIP_ID,name:'RuleStudio3D · 固定物品与原位加工',width:360,height:760,folderId:'battle-parts',root};
}
export function inspectorDetailTemplate() {
 return canvas('hover-detail',300,250,[
  fill(rect('inspector-detail-frame',0,0,300,250,'#101722fc','#736647',7)),
  graphic('inspector-detail-icon',art('stone-green'),14,14,34,34),
  label('inspector-detail-title','下品灵石',56,11,206,26,{fontSize:12,fontWeight:600,color:'#ead2a0'}),
  label('inspector-detail-meta','通货 · 持有 3',56,39,216,20,{fontSize:10,color:'#7f8aa1'}),
  line('inspector-detail-rule',14,66,272),
  label('inspector-detail-description','首次选定一条随机词条；之后使用对应品级灵石洗炼。每件装备最多选定 3 条。',14,76,272,100,{fontSize:11,color:'#c5d1df'}),
  label('inspector-detail-hint','点击图标激活 · Ctrl 固定说明',14,190,272,38,{fontSize:10,color:'#7f8aa1'}),
  button('inspector-detail-close','×',266,10,24,24,ui('detail-close'),{brushes:skin('close')})
 ],{name:'词条 / 通货 / 预兆说明'});
}
function lineCount(value,width,size,measure) {
 let lines=0;for(const paragraph of String(value).split('\n')){let current='';lines++;for(const ch of paragraph){if(current&&measure(current+ch,{fontSize:size,fontWeight:400,fontFamily:'Segoe UI, Microsoft YaHei, sans-serif'})>width){lines++;current=ch;}else current+=ch;}}return lines;
}
// This view projects owned data onto authored controls. Gameplay transactions
// remain in RuleStudio / DWRules; no saved prefab is rewritten by a hover.
export function itemTooltipView(project,item=ITEMS[3],pinned=false,measure=(value,{fontSize})=>[...value].reduce((n,c)=>n+fontSize*(c.charCodeAt(0)>255?1:.56),0),craft={}) {
 const prefab=project.prefabs[ITEM_TOOLTIP_ID]||itemTooltipTemplate(),root=clone(prefab.root),nodes=new Map();walk(root,n=>nodes.set(n.id,n));
 const width=360,body=nodes.get('battle-item-hover-content'),bodyWidth=332;let cursor=0;
 const pos=(n,x,y,w,h)=>{n.slot.offsets={left:x,top:y,right:w,bottom:h};n.layout.width=w;n.layout.height=h;return n;};
 const set=(id,value)=>{const n=nodes.get(id);if(n)n.text=String(value);};
 const show=(id,yes)=>{const n=nodes.get(id);if(n)n.visibility=yes?'visible':'collapsed';};
 const paragraph=(id,value,style={})=>{if(!value)return;const size=style.fontSize||11,h=Math.ceil(lineCount(value,bodyWidth,size,measure)*size*1.4)+10;body.children.push(label(id,value,0,cursor,bodyWidth,h,style));cursor+=h;};
 body.children=[];
 const map=item.category==='map',instance=item.kind==='equipment'&&!item.unidentified,affixes=item.affixes||[],targets=item.reforgeTargets||[],readOnly=!!craft.readOnly;
 if(item.unidentified){paragraph('battle-item-hover-line-0','未鉴定装备');paragraph('battle-item-hover-line-1','鉴定后生成基础属性、词条和具体数值。',{fontSize:10,color:'#7f8aa1'});}
 else {
  paragraph('battle-item-hover-line-0',item.description,{color:item.kind==='equipment'?'#ff923d':'#b7c1d3'});
  for(const [i,value] of (item.baseLines||[]).entries())paragraph(`battle-item-hover-base-${i}`,value,{color:'#ff923d'});
  for(const [i,value] of (item.fixedLines||[]).entries())paragraph(`battle-item-hover-fixed-${i}`,value,{color:'#edcf97'});
  for(const [i,value] of (item.traitLines||[]).entries())paragraph(`battle-item-hover-trait-${i}`,value);
  if(map){paragraph('battle-item-hover-map-count',`${affixes.length} 条地图专属词缀`,{fontSize:10,color:'#7f8aa1'});for(const [i,value] of affixes.entries())paragraph(`battle-item-hover-map-affix-${i}`,typeof value==='string'?value:value.text,{color:'#8cbcff'});}
  if(instance){
   if(pinned&&!readOnly)paragraph('battle-item-hover-targets',`已选定洗炼 ${targets.length}/3 条`,{fontSize:10,color:'#7f8aa1'});
   if(pinned&&craft.eligible?.length)paragraph('battle-item-hover-reroll-hint',`点击闪烁词条，用${craft.currencyName}选定或洗炼`,{fontSize:10,color:'#83d6dd'});
   for(const [i,value]of affixes.entries()){
    const row=inspectorAffixRow(i),h=Math.ceil(lineCount(typeof value==='string'?value:value.text||'',254,11,measure)*15.4)+16;pos(row,0,cursor,bodyWidth,h);
    walk(row,n=>{if(n.id.endsWith('-text')){n.text=typeof value==='string'?value:value.text;pos(n,0,0,262,h);}if(n.id.endsWith('-tier')){n.text=`T${typeof value==='object'&&value.tier||item.tier||1}`;pos(n,302,0,30,h);}if(n.id.endsWith('-grade')){n.text=['下品','中品','上品'][targets.indexOf(i)]||'';pos(n,267,0,30,h);}if(n.id.endsWith('-eligible')){n.visibility=pinned&&craft.eligible?.includes(i)?'visible':'collapsed';pos(n,0,1,332,h-2);}});
    body.children.push(row);cursor+=h;
   }
  }
 }
 pos(body,14,96,332,cursor);let end=96+cursor;
 const materials=kind=>{
  const group=nodes.get(kind==='currency'?'battle-item-hover-currencies':'battle-item-hover-omens'),choices=craft[kind==='currency'?'currencies':'omens']||[];
  group.children=group.children.slice(0,2);const active=craft[kind+'Id']||'';
  for(const [i,item]of choices.entries()){
   const cell=inspectorMaterialCell(kind,i);pos(cell,(i%6)*50,24+Math.floor(i/6)*50,44,44);cell.action.value=item.id;
   walk(cell,n=>{if(n.id.endsWith('-icon'))n.svgAsset=art(item.icon);if(n.id.endsWith('-count'))n.text=String(item.count);if(n.id.endsWith('-grade'))n.text=['下','中','上'][(item.grade||0)-1]||'';if(n.id.endsWith('-active')||n.id.endsWith('-check'))n.visibility=active===item.id?'visible':'collapsed';});
   group.children.push(cell);
  }
  if(!choices.length)group.children.push(label(`battle-item-hover-${kind}-empty`,`暂无持有的${kind==='currency'?'通货':'预兆'}`,0,24,332,24,{fontSize:10,color:'#7f8aa1'}));
  const height=choices.length?24+Math.ceil(choices.length/6)*50:50;group.layout.height=height;group.slot.offsets.bottom=height;return height;
 };
 const crafting=nodes.get('battle-item-hover-crafting');show('battle-item-hover-crafting',pinned&&instance&&!readOnly);
 if(pinned&&instance&&!readOnly){
  const ch=materials('currency'),oh=materials('omen');pos(nodes.get('battle-item-hover-currencies'),0,10,332,ch);pos(nodes.get('battle-item-hover-omens'),0,20+ch,332,oh);
  set('battle-item-hover-currency-active',craft.currencyName?craft.currencyName+' · 已激活':'点击图标激活');set('battle-item-hover-omen-active',craft.omenName?craft.omenName+' · 已激活':'可选 · 点击图标激活');
  const note=craft.currencyId?(craft.note||''):'',nh=note?Math.ceil(lineCount(note,332,10,measure)*14)+10:0;show('battle-item-hover-craft-note',!!note);set('battle-item-hover-craft-note',note);pos(nodes.get('battle-item-hover-craft-note'),0,30+ch+oh,332,nh);
  let cy=30+ch+oh+nh;
  set('battle-item-hover-blocked',craft.blocked||(!craft.currencyId?'请选择并激活通货':''));pos(nodes.get('battle-item-hover-blocked'),0,cy,332,26);cy+=craft.blocked||!craft.currencyId?29:0;
  const whole=['add_affixes','roll_affixes'].includes(craft.operation);show('battle-item-hover-whole',whole);set('battle-item-hover-whole-label',`${craft.operation==='add_affixes'?'随机增加':'重新随机生成'} ${craft.count||4} 条词缀`);pos(nodes.get('battle-item-hover-whole'),0,cy,332,30);if(whole)cy+=40;
  pos(crafting,14,end+10,332,cy);end+=cy+20;
 }
 show('battle-item-hover-identify',pinned&&!readOnly&&item.kind==='equipment'&&item.unidentified);pos(nodes.get('battle-item-hover-identify'),14,end+6,100,30);if(pinned&&item.unidentified&&!readOnly)end+=42;
 show('battle-item-hover-feedback',!!craft.message);set('battle-item-hover-feedback',craft.message||'');pos(nodes.get('battle-item-hover-feedback'),14,end,332,30);if(craft.message)end+=34;
 show('battle-item-hover-actions',pinned&&!readOnly&&(instance||map));pos(nodes.get('battle-item-hover-actions'),14,end+8,332,42);if(pinned&&!readOnly&&(instance||map))end+=58;
 if(map)nodes.get('battle-item-hover-equip').action=ui('hover-use-map',item.id);
 show('battle-item-hover-close',pinned);set('battle-item-hover-equip-label',map?'使用地图':item.equipped?'卸下':'装备');
 set('battle-item-hover-name',`${item.category!=='map'&&item.tier?'T'+item.tier+' · ':''}${item.name}`);nodes.get('battle-item-hover-name').style.color=itemColor(item);set('battle-item-hover-meta',`${typeName(item)} · 数量 ${item.count}`);set('battle-item-hover-hint',pinned?'已固定 · 点击右上角 × 关闭':'Ctrl 固定 · 移出物品关闭');nodes.get('battle-item-hover-frame').style.stroke=itemColor(item);nodes.get('battle-item-hover-icon').svgAsset=art(item.icon);
 const icon=nodes.get('battle-item-hover-icon');if(item.iconSrc){icon.type='Image';icon.src=item.iconSrc;icon.svgAsset='';}else if(item.svgAsset)icon.svgAsset=item.svgAsset;
 const height=end+14;root.layout.height=height;root.slot.offsets.bottom=height;
 const assets={},prefabs={};const collect=n=>{for(const id of [n.svgAsset,...Object.values(n.brushes||{})])if(id&&project.assets[id])assets[id]=project.assets[id];if(n.type==='PrefabInstance'&&!prefabs[n.prefabId]){const p=project.prefabs[n.prefabId];if(p){prefabs[p.id]=p;walk(p.root,collect);}}};walk(root,collect);
 return {...project,root,assets,prefabs,interfaceCatalog:[],presentation:{},viewport:{width,height,background:'transparent'}};
}

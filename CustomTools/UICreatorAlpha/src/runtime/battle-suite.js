import { walk } from '../core/model.js';
import { SUITE, itemGrid, itemBrushes, gearRows, traitCards, affixRows, offerCard, rarityColor } from '../assets/rulestudio-hud/suite-pages.js';
import { GEAR, BAG_GEOMETRY, MATERIALS, AFFIXES, ITEMS, REGIONS, TRAIT_SOURCES } from '../assets/rulestudio-hud/suite-data.js';
import { measureText } from '../render/svg-renderer.js';
import { canvas, node, fill, center, instance, text, graphic, rect, ui, place, button, art } from '../assets/rulestudio-hud/suite-kit.js';
import { BattleSuiteState } from './battle-suite-state.js';
import { atlasBrushes, regionNeighbors } from '../assets/rulestudio-hud/atlas.js';
import { ItemInspector } from './item-inspector.js';
import { MapDeviceController } from './map-device.js';
import { equippedBagGrid } from '../assets/rulestudio-hud/inventory-compartments.js';
import { CHARACTER_BAG_GRID } from '../assets/rulestudio-hud/character-bag-grid.js';

// Projection and transient interaction only. All edits stay outside the authored document.
export class BattleSuiteController {
 constructor(owner){
  this.owner=owner;this.runtime=owner.runtime;this.state=new BattleSuiteState();this.cache=new Map();this.serial=0;this.prefixes=new Map();this.overlaySignature='';this.mountedPanel='';this.events=new AbortController();
  this.standalone=this.runtime.project.presentation.interfaceId||'';
  this.inspector=new ItemInspector(this);
  this.runtime.svg.addEventListener('contextmenu',e=>{const n=this.itemAt(e.target);if(!n)return;e.preventDefault();this.inspector.close();this.state.select(n.action.value);this.state.overlays=['context'];owner.refresh();},{signal:this.events.signal});
  this.runtime.svg.addEventListener('wheel',e=>{if(!e.target.closest?.('[data-binding="atlas-viewport"]'))return;e.preventDefault();this.state.act('atlas-zoom',e.deltaY>0?-1:1);owner.refresh();},{signal:this.events.signal,passive:false});
  this.runtime.svg.addEventListener('pointerdown',e=>{const viewport=e.target.closest?.('[data-binding="atlas-viewport"]');if(e.button!==0||!viewport||e.target.closest?.('[data-node-type="Button"]'))return;this.pan={viewportId:viewport.getAttribute('data-node-id'),x:e.clientX,y:e.clientY,startX:this.state.panX,startY:this.state.panY};},{signal:this.events.signal});
  window.addEventListener('pointermove',e=>{if(!this.pan)return;const entry=this.runtime.layout.entries.get(this.pan.viewportId),bounds=this.runtime.renderer.groups.get(this.pan.viewportId)?.hit.getBoundingClientRect();if(!entry||!bounds?.width)return;const k=entry.width/bounds.width;this.state.panX=this.pan.startX+(e.clientX-this.pan.x)*k;this.state.panY=this.pan.startY+(e.clientY-this.pan.y)*k;owner.refresh();},{signal:this.events.signal});
  window.addEventListener('pointerup',()=>{this.pan=null;},{signal:this.events.signal});
  // Pointer drag uses runtime IDs, so nested prefab instances keep their own ownership.
  this.runtime.svg.addEventListener('pointerdown',e=>{const n=this.itemAt(e.target);if(n&&e.button===0)this.drag={id:n.action.value,x:e.clientX,y:e.clientY};},{signal:this.events.signal});
  window.addEventListener('pointerup',e=>{
   const drag=this.drag;this.drag=null;if(!drag||Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<10)return;
   const target=e.target.closest?.('[data-node-id]'),n=this.runtime.nodes.get(target?.getAttribute('data-node-id'));
   const item=this.state.items.find(i=>i.id===drag.id);if(!item)return;
   const slot=n?.action?.op==='gear-filter'?n.action.value:n?.action?.slot;
   if(slot&&item.slot===slot&&!item.unidentified){this.state.selected=item.id;if(!item.equipped)this.state.equip();this.runtime.pressedId=null;owner.refresh();}
   else if(e.target.closest?.('[data-binding="character-grid"],[data-binding="character-grid-zone"]')&&item.equipped){this.state.selected=item.id;this.state.equip();this.runtime.pressedId=null;owner.refresh();}
   else if(n?.binding==='item-cell'&&!this.state.fields.bagQuery){const a=this.state.items.findIndex(i=>i.id===item.id),z=this.state.items.findIndex(i=>i.id===n.action?.value);if(a>=0&&z>=0){[this.state.items[a],this.state.items[z]]=[this.state.items[z],this.state.items[a]];this.runtime.pressedId=null;owner.refresh();}}
  },{capture:true,signal:this.events.signal});
 }
 itemAt(target){const g=target.closest?.('[data-binding="item-cell"],[data-binding="gear-slot"]'),n=this.runtime.nodes.get(g?.getAttribute('data-node-id'));return this.state.items.some(i=>i.id===n?.action?.value)?n:null;}
 navigate(id){
  this.inspector.close();
  if(id==='craft'&&this.state.overlays.at(-1)==='item'&&this.state.item?.kind==='equipment')this.state.act('craft-select',this.state.selected);
  this.state.overlays=[];
  if(this.standalone){this.runtime.dispatchEvent(new CustomEvent('navigate',{detail:{id}}));return;}
  this.owner.state.panel=id;this.owner.state.picker=-1;
 }
 activate(action,n){
  const {op,value}=action;
  // Saved projects may still carry the old inspect action on inventory buttons.
  if(['inspect','select-item'].includes(op)&&['item-cell','gear-slot'].includes(n?.binding))return this.state.act('select-item',value);
  if(['inspect','inspect-selected','overlay','input','back'].includes(op))this.inspector.close();
  if(op==='input'){this.editField(value,n);return true;}
  if(op==='navigate'){this.navigate(value);return true;}
  if(op==='bag-craft'){if(this.state.item?.kind==='equipment'){if(this.state.item.unidentified)return this.state.act('inspect-selected');this.state.act('craft-select',this.state.selected);this.navigate('craft');return true;}return false;}
  if(op==='back'){if(this.state.overlays.length)this.state.overlays.pop();else if(this.standalone)this.navigate('normal');else this.owner.state.close();return true;}
  if(op==='filter-menu'){this.menu('装备筛选',[['all','全部装备'],...GEAR],v=>{this.state.gearFilter=v;});return true;}
  if(op==='monster-menu'){this.menu('怪物类型',[['按层数与权重混合生成','按层数与权重混合生成'],['裂爪兽（单种试战）','裂爪兽（单种试战）'],['寒霜术士（单种试战）','寒霜术士（单种试战）']],v=>{this.state.monster=v;});return true;}
  if(op==='menu-choice'){this.menuCallback?.(value);this.state.overlays.pop();return true;}
  if(op==='challenge'||op==='region-enter'){
   if(op==='challenge'){const floor=Number(this.state.fields.floor),count=Number(this.state.fields.monsterCount);if(!Number.isInteger(floor)||floor<1||!Number.isInteger(count)||count<20||count>300){this.state.message='挑战层数须为正整数，怪物总数须在 20–300 之间';return true;}}
   if(op==='region-enter'&&!['可以探索','挑战失败'].includes(REGIONS[this.state.region].status))return false;
   this.owner.state.phase='waves';this.owner.state.paused=false;this.owner.state.close();this.state.overlays=[];if(this.standalone)this.navigate('normal');this.state.message=op==='challenge'?'已开始所选层数的战斗预览':`进入 ${REGIONS[this.state.region].name}`;return true;
  }
  if(op==='progression'){this.state.items.forEach(i=>i.equipped=i.id==='gear-0');this.state.message='已切换为初始武器配装';return true;}
  if(op==='belt-equip'){const id=['health-potion','mana-potion','cleanse-potion'][value],slot=this.owner.state.belt.indexOf(id);if(slot>=0)this.owner.state.belt[slot]=null;else{const empty=this.owner.state.belt.indexOf(null);if(empty>=0)this.owner.state.belt[empty]=id;}return true;}
  if(op==='material-toggle'){const material=this.state.item?.kind==='item'?this.state.item:MATERIALS.find(m=>m.id===(this.state.omen||this.state.currency))||MATERIALS[4];return this.state.act(material.id.startsWith('omen')?'omen':'currency',material.id);}
  return this.state.act(op,value);
 }
 inspectAction(op,id){
  if(!this.state.items.some(item=>item.id===id))return;
  this.state.select(id);
  if(op==='hover-equip')this.state.equip();
  this.owner.refresh();
 }
 menu(title,choices,callback){this.menuTitle=title;this.menuChoices=choices;this.menuCallback=callback;this.state.overlays.push('menu');}
 editField(key,n){
  this.input?.remove();const box=this.runtime.renderer.groups.get(n.id)?.group.getBoundingClientRect();if(!box)return;
  const input=document.createElement('input');input.type=['floor','monsterCount','splitAmount','startingStones'].includes(key)||key.startsWith('price:')?'number':'search';input.value=this.state.fields[key]||'';input.setAttribute('aria-label',n.name);input.className='battle-live-input';
  Object.assign(input.style,{position:'fixed',left:`${box.left}px`,top:`${box.top}px`,width:`${box.width}px`,height:`${box.height}px`,boxSizing:'border-box',background:'#0e1924',color:'#d4e7ff',border:'1px solid #7acbdc',borderRadius:'4px',outline:'none',padding:'0 8px',zIndex:'2000',font:'12px Segoe UI, Microsoft YaHei, sans-serif'});
  input.addEventListener('input',()=>{this.state.setField(key,input.value);this.owner.refresh();});input.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Enter'||e.key==='Escape')input.blur();});input.addEventListener('blur',()=>{input.remove();this.input=null;});document.body.append(input);this.input=input;input.focus();input.select();
 }
 mount(host,key,children){
  if(this.cache.get(host.id)===key)return;
  this.runtime.setChildren(host.id,children);this.cache.set(host.id,key);this.owner.applied.clear();
 }
 prefix(host){if(!this.prefixes.has(host.id))this.prefixes.set(host.id,`battle_live_${++this.serial}`);return this.prefixes.get(host.id);}
 framed(prefix,id,overlay=false){
  const prefab=this.runtime.project.interfaceCatalog?.find(page=>page.id===id)?.prefabId||SUITE[id];
  const p=this.runtime.project.prefabs[prefab];if(!p)return [];
  const w=this.runtime.width||this.runtime.project.viewport.width,h=this.runtime.height||this.runtime.project.viewport.height;
  const fit=fill(node('ScaleBox',`${prefix}_fit`,0,0,w-32,h-32,{locked:true,layout:{stretch:'down'},children:[instance(`${prefix}_page`,p.id,0,0,p.width,p.height,{}, {binding:`window-${id}`})]}),16);
  const shade=fill(button(`${prefix}_shade`,'',0,0,w,h,ui('back'),{brushes:{normal:'',hovered:'',pressed:'',disabled:''},style:{fill:overlay?'#03080bbd':'transparent'}}));
  return overlay?[shade,fit]:[fit];
 }
 prepare(){
  const runtime=this.runtime,s=this.state;
  const modal=[...runtime.nodes.values()].find(n=>n.binding==='suite-modal-host');
  const panel=this.owner.state.panel;
  if(modal&&this.mountedPanel!==panel){if(panel==='craft')s.act('craft-select',s.craftItem);this.mount(modal,panel,this.framed('battle_live_modal',panel==='tooltip'?'skill-detail':panel));this.mountedPanel=panel;}
  const host=[...runtime.nodes.values()].find(n=>n.binding==='suite-overlays'&&!n.id.includes('battle_live_popup'));
  const top=s.overlays.at(-1)||'',signature=JSON.stringify([host?.id,top,top==='menu'?this.menuChoices:[]]);
  if(host&&signature!==this.overlaySignature){
   let children=top?this.framed('battle_live_popup',top,true):[];
   if(top==='menu')children=[fill(button('battle_live_popup_shade','',0,0,400,500,ui('back'),{brushes:{normal:'',hovered:'',pressed:'',disabled:''},style:{fill:'#03080bbd'}})),center(canvas('battle_live_popup_menu',320,48+this.menuChoices.length*35,[rect('battle_live_popup_menu_bg',0,0,320,48+this.menuChoices.length*35,'#121e2a','#718295',5),text('battle_live_popup_title',this.menuTitle,12,8,296,26,{fontSize:13,color:'#e3c486'}),...this.menuChoices.map(([id,name],i)=>button(`battle_live_popup_choice_${i}`,name,10,43+i*35,300,30,ui('menu-choice',id)))]))];
   this.mount(host,signature,children);this.overlaySignature=signature;
  }
  const device=[...runtime.nodes.values()].some(n=>n.binding==='map-device-bag');
  if(device&&!this.mapDevice)this.mapDevice=new MapDeviceController(runtime,{items:[
   {key:'preview-map-t01',name:'地图 T1 · 普通',kind:'item',category:'map',tier:1,rarity:'common',count:2},
   {key:'preview-map-t08',name:'地图 T8 · 魔法',kind:'item',category:'map',tier:8,rarity:'magic',count:1,affixes:['怪物群 +20%','地图召唤物气血 +30%']},
   {key:'preview-map-t16',name:'地图 T16 · 稀有',kind:'item',category:'map',tier:16,rarity:'rare',count:1,affixes:['怪物群 +24%','地图召唤物气血 +38%','地图召唤物伤害 +15%']},
   ...s.items.map(i=>({...i,key:i.id,svgAsset:art(i.icon)}))
  ],onAtlas:()=>{this.navigate('atlas');this.owner.refresh();}});
  if(!device&&this.mapDevice){this.mapDevice.destroy();this.mapDevice=null;}
  // Dynamic lists are built from the same shared prefabs as the editable pages.
  const lists=[...runtime.nodes.values()].filter(n=>['character-grid','gear-list','character-traits-list','bag-grid','equipped-bag-grid','hunter-list','hunter-selected','affix-book-list','shop-stock','craft-bag'].includes(n.binding));
  for(const host of lists){
   const prefix=this.prefix(host);let key,children;
   if(host.binding==='character-grid'){key=JSON.stringify(s.characterItems);children=itemGrid(prefix,s.characterItems,4,52,6,CHARACTER_BAG_GRID.rows,'select-item');}
   if(host.binding==='gear-list'){key=JSON.stringify(s.items.filter(i=>i.equipped));children=gearRows(prefix,s.items);}
   if(host.binding==='character-traits-list'){const sources=TRAIT_SOURCES.filter(source=>source.kind!=='装备'||s.items.some(i=>i.equipped&&i.name===source.name));key=JSON.stringify(sources);children=traitCards(prefix,sources);}
   if(host.binding==='bag-grid'){const q=BAG_GEOMETRY;key=JSON.stringify([s.bagItems,s.bagPage]);children=itemGrid(prefix,s.bagItems.slice(s.bagPage*72,s.bagPage*72+72),12,{width:q.cellWidth,height:q.cellHeight},4,6,'select-item');}
   if(host.binding==='equipped-bag-grid'){const items=s.items.filter(i=>i.kind==='equipment'&&i.equipped);key=JSON.stringify(items);children=equippedBagGrid(prefix,items);}
   if(host.binding==='hunter-list'){key=JSON.stringify([s.hunterRows,s.hunterPage,[...s.affixes]]);children=affixRows(prefix,s.hunterRows.slice(s.hunterPage*8,s.hunterPage*8+8),'hunter-affix',342,s.affixes);}
   if(host.binding==='hunter-selected'){key=JSON.stringify([...s.affixes]);children=s.affixes.size?affixRows(prefix,[...s.affixes],'hunter-affix',342,s.affixes):[text(`${prefix}_empty`,'尚未选择装备条件',8,0,326,32,{fontSize:11,color:'#8196af'})];}
   if(host.binding==='affix-book-list'){const values=AFFIXES.filter(v=>/火焰|点燃/.test(v)&&v.includes(s.fields.affixQuery));key=JSON.stringify(values);children=affixRows(prefix,values,'affix',402);}
   if(host.binding==='shop-stock'){
    let items=s.shopTab===0?ITEMS.filter(i=>i.slot==='weapon'):s.shopTab===1?ITEMS:MATERIALS.map(i=>({...i,kind:'item',rarity:'rare'}));items=s.query(items,'shopQuery').filter(()=>!s.affordable||s.wallet>=24);if(s.sort==='name')items=[...items].sort((a,b)=>a.name.localeCompare(b.name,'zh'));key=JSON.stringify([items,s.sort,s.shopTab]);children=[canvas(`${prefix}_offers`,886,Math.ceil(items.length/3)*240,items.map((item,i)=>place(offerCard(`${prefix}_offer_${i}`,item,i,284),i%3*299,Math.floor(i/3)*240)))];
   }
   if(host.binding==='craft-bag'){const items=s.query(s.items.filter(i=>i.kind==='equipment'),'craftQuery');key=JSON.stringify(items);children=items.map((item,i)=>button(`${prefix}_${i}`,item.name,0,0,264,48,ui('craft-select',item.id),{binding:`craft-item:${item.id}`,children:[graphic(`${prefix}_icon_${i}`,art(item.icon),6,5,38,38),text(`${prefix}_name_${i}`,item.name,53,0,202,48,{fontSize:11,color:rarityColor(item.rarity),wrap:true})]}));}
   if(!children.length)children=[text(`${prefix}_empty`,'没有匹配的内容',8,0,Math.max(200,host.layout.width-16),36,{fontSize:12,color:'#8196af'})];
   this.mount(host,key,children);
  }
 }
 project(role,patch){
  const device=!!this.mapDevice;
  const s=this.state;const label=(binding,value)=>{for(const n of role.get(binding)||[])patch(n.children[0],{text:value});};const set=(binding,p)=>{for(const n of role.get(binding)||[])patch(n,p);};
  for(const [field,value]of Object.entries(s.fields))for(const n of role.get(`value:${field}`)||[])patch(n,{text:value||n.name});
  set('character-capacity',{text:`${s.characterItems.length} / 32`});set('gear-count',{text:`${s.items.filter(i=>i.equipped).length} / 9`});label('character-filter',`${GEAR.find(v=>v[0]===s.gearFilter)?.[1]||'全部装备'}     ▾`);
  set('bag-count',{text:`${s.bagItems.length} 项`});set('bag-page',{text:`${s.bagPage+1} / ${Math.max(1,Math.ceil(s.bagItems.length/72))}`});
  set('equipped-bag-count',{text:`${s.items.filter(i=>i.kind==='equipment'&&i.equipped).length} / 9`});
  for(const [binding,enabled]of [['bag-prev',s.bagPage>0],['bag-next',(s.bagPage+1)*72<s.bagItems.length]]){set(binding,{interactable:enabled,style:{opacity:enabled?1:.25}});}
  const selected=s.item,footer=[['suite-bag-detail',selected?`${selected.tier?'T'+selected.tier+' · ':''}${selected.name}`:'选择物品以查看详情'],['bag-quantity',selected?`×${selected.count}`:''],['bag-affix-count',selected?.unidentified?'未鉴定':selected?.kind==='equipment'?`${selected.affixes?.length||0} 条随机词条`:'']];let cursor=12;
  for(const [binding,value]of footer){const style={fontSize:10,fontWeight:400,fontFamily:'Segoe UI, Microsoft YaHei, sans-serif',textPaddingX:1.5};const width=Math.ceil(measureText(value,style))+4;set(binding,{text:value,style,slot:{offsets:{left:cursor,right:width}}});cursor+=width+7;}
  set('bag-equip',{visibility:selected?.kind==='equipment'&&!selected.unidentified?'visible':'collapsed',slot:{offsets:{left:cursor,top:this.runtime.project.presentation?.inventoryCompartments?437:411,bottom:29}}});label('bag-equip',selected?.equipped?'卸下':'装备');
  set('bag-craft',{visibility:selected?.kind==='equipment'?'visible':'collapsed',slot:{offsets:{left:cursor+52,top:this.runtime.project.presentation?.inventoryCompartments?437:411,bottom:29}}});label('bag-craft',selected?.unidentified?'鉴定':'洗炼');
  set('hunter-pagination',{text:`${s.hunterPage+1} / ${Math.max(1,Math.ceil(s.hunterRows.length/8))} · ${s.hunterRows.length} 种`});label('hunter-only',s.selectedOnly?'查看全部':'仅看已选');
  set('suite-wallet',{text:`${s.wallet} 灵石`});set('craft-name',{text:`T${s.items.find(i=>i.id===s.craftItem)?.tier||1} · ${s.items.find(i=>i.id===s.craftItem)?.name||'请选择装备'}`});
  const item=s.item,craft=s.items.find(i=>i.id===s.craftItem);if(item){set('inspector-name',{text:`${item.tier?'T'+item.tier+' · ':''}${item.name}`});set('inspector-icon',{svgAsset:art(item.icon)});set('inspector-meta',{text:`${{normal:'普通',rare:'稀有',legendary:'传奇'}[item.rarity]||'道具'} · ${GEAR.find(v=>v[0]===item.slot)?.[1]||'通货'} · 数量 ${item.count}`});}
  if(item){set('inspector-base',{text:item.description||'没有额外基础属性'});set('inspector-random-count',{text:item.affixes?.length?`${item.affixes.length} 条随机词条${item.rarity==='legendary'?' + 1 条固定传奇词条':''}`:'普通装备，无随机词条'});set('inspector-targets',{text:`已选定洗炼 ${s.targets.size} / 3 条 · 词条 T1–T${item.tier||1}`});label('inspector-equip',item.equipped?'卸下':'装备');}
  set('context-name',{text:item?.name||'物品'});set('context-icon',{svgAsset:art(item?.icon||'helmet')});set('context-meta',{text:`${item?.equipped?'已装备 · ':''}${item?.kind==='item'?'道具':`装备 · T${item?.tier||1}`} · 数量 ${item?.count||0}`});set('context-split',{interactable:item?.count>1});set('split-name',{text:item?.name||'下品灵石'});set('split-icon',{svgAsset:art(item?.icon||'stone-green')});set('split-label',{text:`拆出数量（1–${Math.max(1,(item?.count||36)-1)}）`});
  if(craft){set('craft-icon',{svgAsset:art(craft.icon)});set('craft-meta',{text:`${GEAR.find(v=>v[0]===craft.slot)?.[1]||'装备'} · ${craft.unidentified?'未鉴定':{normal:'普通',rare:'稀有',legendary:'传奇'}[craft.rarity]} · 物品等级 ${craft.tier}`});set('craft-base',{text:craft.unidentified?'未鉴定':craft.description});set('craft-base-value',{text:''});label('craft-run-control',craft.unidentified?'鉴定装备':'激活通货后，点击词条选定 / 洗炼');}
  set('craft-targets',{text:`已选定洗炼 ${s.targets.size} / 3 条 · 保留基础属性与固定传奇词条`});set('craft-feedback',{text:s.message||'请选择词条进行加工'});set('craft-operation',{text:`通货：${MATERIALS.find(m=>m.id===s.currency)?.name||'未选择'} · 预兆：${MATERIALS.find(m=>m.id===s.omen)?.name||'不使用'}`});
  label('monster-choice',`${s.monster}  ▾`);label('shop-sort',s.sort==='name'?'按名称排序  ▾':'按价格排序  ▾');label('shop-affordable',`${s.affordable?'✓':'□'} 仅看买得起`);
  for(let i=0;i<3;i++)set(`shop-tab:${i}`,{brushes:{normal:art(i===s.shopTab?'cell-selected':'button-normal')}});
  for(let i=0;i<3;i++)set(`suite-belt-${i}`,{brushes:{normal:art(this.owner.state.belt.includes(['health-potion','mana-potion','cleanse-potion'][i])?'cell-selected':'button-normal')}});
  for(const m of MATERIALS){set(`material-choice:${m.id}`,{brushes:{normal:art(s.currency===m.id?'cell-selected':'button-normal')}});set(`omen-choice:${m.id}`,{brushes:{normal:art(s.omen===m.id?'cell-selected':'button-normal')}});set(`currency-filter:${m.id}`,{brushes:{normal:art(s.currencies.has(m.id)?'cell-selected':'button-normal')}});}
  for(const m of MATERIALS)for(const n of role.get(`material-count:${m.id}`)||[])patch(n,{text:`${n.id.includes('battle-craft-material-n-')?'持有 ':''}${s.items.find(i=>i.id===m.id)?.count||0}`});
  for(let i=0;i<6;i++)for(const n of role.get(`item-affix:${i}`)||[]){patch(n,{visibility:item?.affixes?.[i]&&!item.unidentified?'visible':'collapsed',brushes:{normal:art(s.targets.has(i)?'cell-selected':'button-normal')}});let label;walk(n,child=>{if(!label&&child.type==='TextBlock')label=child;});if(label)patch(label,{text:item?.affixes?.[i]||''});}
  const material=s.item?.kind==='item'?s.item:MATERIALS.find(m=>m.id===(s.omen||s.currency))||MATERIALS[4];set('material-title',{text:material.name});set('material-icon',{svgAsset:art(material.icon)});set('material-meta',{text:`${material.id.startsWith('omen')?'预兆':'通货'} · 持有 ${s.items.find(i=>i.id===material.id)?.count||0}`});set('material-description',{text:material.description});
  for(const [binding,nodes]of role)if(binding.startsWith('buy:'))for(const n of nodes){const id=binding.slice(4),bought=s.purchased.has(id),price=s.prices.get(id)??24;patch(n,{interactable:!bought&&s.wallet>=price});patch(n.children[0],{text:bought?'已售出':`${price} 灵石 · 购买`});}
  const total=s.item?.count||36,n=Number(s.fields.splitAmount)||0;set('split-total',{text:`当前数量 ${total}`});set('split-remaining',{text:`剩余 ${Math.max(0,total-n)}`});set('split-progress',{value:Math.min(1,n/Math.max(1,total))});set('split-confirm',{interactable:s.splitValid});
  const region=REGIONS[s.region],available=['可以探索','挑战失败'].includes(region.status);if(!device){set('region-name',{text:region.name});set('region-status',{text:region.status});set('region-floor',{text:`第 ${region.floor} 层 · ${region.biome}`});set('region-fact',{text:`区域状态          ${region.status}`});set('region-note',{text:available?'道路已经显现。击败此地的首领，\n将揭开更远处的迷雾。':region.status==='已通关'?'这片地域已被征服。\n选择相连的区域，继续你的征途。':'此地仍未连通。\n先完成与它相连的地域。'});set('region-enter',{interactable:available});label('region-enter',available?region.status==='挑战失败'?'重新挑战 →':'进入区域 →':region.status);set('atlas-zoom',{text:`${s.zoom}%`});
  for(let i=0;i<REGIONS.length;i++)set(`region:${i}`,{brushes:atlasBrushes(REGIONS[i],i===s.region)});
  set('region-neighbors',{text:`${regionNeighbors(region).length} 处`});set('atlas-summary',{text:`${REGIONS.filter(r=>r.status==='已通关').length} 已通关 · ${REGIONS.filter(r=>['可以探索','挑战失败'].includes(r.status)).length} 可探索`});
  set('atlas-zoom-out',{interactable:s.zoom>50});set('atlas-zoom-in',{interactable:s.zoom<200});}
  for(const n of this.runtime.nodes.values())if(n.binding?.startsWith('craft-item:'))patch(n,{brushes:{normal:art(n.binding.slice(11)===s.craftItem?'cell-selected':'button-normal')}});
  if(!device){set('region-biome',{text:region.biome});set('atlas-camera',{layout:{scale:s.zoom/100},slot:{offsets:{left:s.panX,top:s.panY}}});}
  for(let i=0;i<3;i++){set(`bd-grade:${i}`,{brushes:{normal:art(i===s.bdGrade?'cell-selected':'button-normal')}});label(`bd-grade:${i}`,`${['入门配装','成长配装','完整构筑'][i]} · ${i===s.bdGrade?'已应用':'一键应用'}`);}
  for(let i=0;i<6;i++)set(`bd-family:${i}`,{brushes:{normal:art(i===s.bdFamily?'cell-selected':'button-normal')}});
  set('bd-family-name',{text:['燎原攻守','余烬回响','万剑归宗','召唤万剑','自毒流','赤焰战犬'][s.bdFamily]});set('bd-feedback',{text:s.bdGrade<0?'尚未应用配装':`已应用 · ${['入门配装','成长配装','完整构筑'][s.bdGrade]}`});
  set('map-info-equipment',{visibility:s.mapTab==='equipment'?'visible':'collapsed'});set('map-info-lineage',{visibility:s.mapTab==='lineage'?'visible':'collapsed'});for(const tab of ['equipment','lineage'])set(`map-info-tab:${tab}`,{brushes:{normal:art(s.mapTab===tab?'cell-selected':'button-normal')}});
  for(let i=0;i<3;i++)for(const n of role.get(`lineage-detail:${i}`)||[])for(const child of n.children.slice(1))patch(child,{visibility:s.foldedLineages.has(i)?'collapsed':'visible'});
  for(const id of s.picked)set(`loot:${id}`,{visibility:'collapsed'});if(s.message==='战场准备完成')set('loading-status',{text:s.message});
  for(const n of role.get('item-cell')||[]){const item=s.items.find(i=>i.id===n.action?.value);patch(n,{brushes:itemBrushes(item,item?.id===s.selected)});}
  for(const n of role.get('gear-slot')||[]){const item=s.items.find(i=>i.id===n.action?.value);if(item)patch(n,{brushes:{normal:art(`equipment-row-${item.rarity||'common'}-${item.id===s.selected?'selected':'normal'}`)}});}
  if(s.message)this.owner.state.message=s.message;
 }
 destroy(){this.mapDevice?.destroy();this.inspector.destroy();this.events.abort();this.input?.remove();}
}

import { MapDeviceState, deviceRole, deviceSlotRole } from './map-device-state.js';
import { MAP_DEVICE_SLOTS, mapDeviceCell, emptyDeviceSocket } from '../assets/rulestudio-hud/map-device.js';
import { qualityBrushes, qualityColor } from '../assets/rulestudio-hud/equipment-style.js';
import { UIRuntime } from './runtime.js';
import { ItemInspector } from './item-inspector.js';

// Same authored controls in the UICreator preview and RuleStudio. No combat or reward logic.
function joinedViews(views) {
  return {
    project:views[0].project,
    get nodes(){return new Map(views.flatMap(v=>[...v.nodes]));},
    get layout(){return {entries:new Map(views.flatMap(v=>[...v.layout.entries]))};},
    get renderer(){return {groups:new Map(views.flatMap(v=>[...v.renderer.groups]))};},
    get audioPlayer(){return views[0].audioPlayer;},
    svg:{addEventListener:(...args)=>views.forEach(v=>v.svg.addEventListener(...args))},
    addEventListener:(...args)=>views.forEach(v=>v.addEventListener(...args)),
    set pressedId(value){for(const v of views)v.pressedId=value;},
    setChildren(id,children){views.find(v=>v.nodes.has(id))?.setChildren(id,children);},
    setMany(updates){for(const v of views){const own=updates.filter(([id])=>v.nodes.has(id));if(own.length)v.setMany(own);}}
  };
}
export class MapDeviceController {
  constructor(runtime, { items = [], slots = {}, peers = [], onChange = () => {}, onAtlas = () => {} } = {}) {
    runtime=joinedViews([runtime,...peers]);
    this.runtime=runtime;this.state=new MapDeviceState(items,slots);this.onChange=onChange;this.onAtlas=onAtlas;this.events=new AbortController();this.message='';this.cache='';
    const opts={signal:this.events.signal};
    runtime.svg.addEventListener('pointerdown',e=>{
      if(e.button!==0)return;const n=this.target(e.target),a=n?.action;
      const from=a?.op==='map-device-slot'?a.value:'',item=from?this.state.item(from):a?.op==='map-device-item'?this.state.items.find(i=>i.key===a.value):null;
      if(!item||!from&&this.state.available(item.key)<1)return;e.preventDefault();this.drag={key:item.key,from,x:e.clientX,y:e.clientY,pointerId:e.pointerId,active:false};
    },opts);
    window.addEventListener('pointermove',e=>{
      const d=this.drag;if(!d||d.pointerId!==e.pointerId)return;
      if(!d.active&&Math.hypot(e.clientX-d.x,e.clientY-d.y)>6){d.active=true;this.inspector?.close();this.makeGhost(this.state.items.find(i=>i.key===d.key));runtime.pressedId=null;}
      if(!d.active)return;e.preventDefault();this.ghost.style.left=`${e.clientX+13}px`;this.ghost.style.top=`${e.clientY+13}px`;
      const n=this.target(document.elementFromPoint(e.clientX,e.clientY)),slot=n?.action?.op==='map-device-slot'?n.action.value:'';
      this.highlight(slot&&deviceSlotRole(slot)===deviceRole(this.state.items.find(i=>i.key===d.key))?slot:'');
    },{...opts,passive:false,capture:true});
    window.addEventListener('pointerup',e=>{
      const d=this.drag;if(!d||d.pointerId!==e.pointerId)return;
      if(!d.active){this.drag=null;return;}
      const n=this.target(document.elementFromPoint(e.clientX,e.clientY));this.cancel();runtime.pressedId=null;
      let changed=false;
      if(n?.action?.op==='map-device-slot') {
        changed=this.state.place(d.key,n.action.value,d.from);
        this.message=changed?'已装入；拖回右侧背包可取下':deviceRole(this.state.items.find(i=>i.key===d.key))==='map'?'地图请放入中央地图槽':'此槽只接受对应的地图物品';
      } else if(d.from&&e.target.closest?.('[data-binding="map-device-bag"],[data-binding="map-device-library"]')) {changed=this.state.remove(d.from);this.message='已取回背包';}
      else this.message='已取消拖拽，物品位置未变';
      this.refresh();if(changed)this.onChange({...this.state.slots});
    },{...opts,capture:true});
    window.addEventListener('pointercancel',()=>this.cancel(),opts);window.addEventListener('blur',()=>this.cancel(),opts);
    window.addEventListener('keydown',e=>{if(e.key==='Escape'&&this.drag){e.preventDefault();e.stopImmediatePropagation();this.cancel();}else this.inspector?.handleKey(e);},{...opts,capture:true});
    runtime.addEventListener('activate',e=>{
      const a=e.detail.node.action;if(!a?.op?.startsWith('map-device-'))return;
      if(a.op==='map-device-atlas')return this.onAtlas();
      if(a.op==='map-device-filter'){this.state.filter=a.value;this.state.page=0;}
      if(a.op==='map-device-page')this.state.page+=a.value;
      if(a.op==='map-device-item'){this.selected=this.selected===a.value?'':a.value;this.message=this.selected?`${this.state.items.find(i=>i.key===a.value)?.name||'物品'} · 拖入对应槽位`:'';
      }else if(a.op==='map-device-slot'){
        if(this.selected&&this.state.place(this.selected,a.value)){this.onChange({...this.state.slots});this.selected='';this.message='已装入';}
        else this.message=this.state.item(a.value)?.name|| (a.value==='map'?'将背包中的地图拖入此处':'预留地图物品槽');
      }
      this.refresh();
    },opts);
    this.refresh();
    const device=this;
    this.inspector=new ItemInspector({
      owner:{runtime,state:{panel:'map-device'}},standalone:'map-device',
      state:{overlays:[],get items(){return device.inspectionItems();}},
      get drag(){return device.drag;},
      itemAt:target=>device.inspectorNode(device.target(target)?.id),
      inspectorNode:id=>device.inspectorNode(id),inspectAction:()=>{}
    },{readOnly:true});
  }
  target(element){const g=element?.closest?.('[data-node-type="Button"]');return this.runtime.nodes.get(g?.getAttribute('data-node-id'));}
  binding(value){return [...this.runtime.nodes.values()].find(n=>n.binding===value);}
  inspectorNode(id){
    const n=this.runtime.nodes.get(id),a=n?.action,key=a?.op==='map-device-slot'?this.state.slots[a.value]:a?.op==='map-device-item'?a.value:'';
    return key&&this.state.items.some(i=>i.key===key)?{...n,action:{...a,value:key}}:null;
  }
  inspectionItems(){
    const anchor=this.runtime.nodes.get(this.inspector?.anchorId),slot=anchor?.action?.op==='map-device-slot',library=anchor?.binding==='map-device-library-item';
    return this.state.items.map(item=>({...item,...item.inspection,svgAsset:item.svgAsset||(!item.iconSrc&&item.category==='map'?'battle-svg-map-device-glyph':''),id:item.key,catalogId:item.id,count:slot?1:library?item.count:this.state.available(item.key)}));
  }
  update(items,slots){this.state.update(items);if(slots){this.state.slots={...slots};this.state.update(items);}this.refresh();}
  makeGhost(item){
    this.ghost=document.createElementNS('http://www.w3.org/2000/svg','svg');Object.assign(this.ghost.style,{position:'fixed',width:'58px',height:'58px',pointerEvents:'none',zIndex:'30000',stroke:'none',strokeWidth:'1',fill:'none',filter:'drop-shadow(0 6px 12px #0009)'});this.ghost.setAttribute('aria-hidden','true');document.body.append(this.ghost);
    this.ghost.setAttribute('data-map-device-drag','');
    this.ghostRuntime=new UIRuntime(this.ghost,{...this.runtime.project,root:mapDeviceCell('map-device-drag', {...item,count:1},0,0,58),viewport:{width:58,height:58,background:'transparent'}},{sound:false,motion:false});
  }
  highlight(slot){if(this.over===slot)return;this.over=slot;this.runtime.setMany(MAP_DEVICE_SLOTS.flatMap(s=>{const n=this.binding(`map-device-slot:${s.id}`);return n?[[n.id,{brushes:slot===s.id?qualityBrushes('cell','rare'):qualityBrushes('cell',this.state.item(s.id)?.rarity||'empty')}]]:[];}));}
  cancel(){this.drag=null;this.ghostRuntime?.destroy();this.ghostRuntime=null;this.ghost?.remove();this.ghost=null;if(this.over)this.highlight('');this.runtime.pressedId=null;}
  refresh(){
    if(!this.binding('map-device-bag'))return;
    const grid=this.binding('map-device-bag').source?.grid||{columns:7,rows:5,cell:46,pitch:52},pageSize=grid.columns*grid.rows;
    const bag=this.state.bag,pages=Math.max(1,Math.ceil(bag.length/pageSize));this.state.page=Math.max(0,Math.min(pages-1,this.state.page));
    const signature=JSON.stringify([bag,this.state.slots,this.state.page]);
    if(signature!==this.cache){
      this.cache=signature;
      this.runtime.setChildren(this.binding('map-device-bag').id,Array.from({length:pageSize},(_,i)=>mapDeviceCell(`map-device-live-bag-${i}`,bag[this.state.page*pageSize+i],i%grid.columns*grid.pitch,Math.floor(i/grid.columns)*grid.pitch,grid.cell)));
      for(const slot of MAP_DEVICE_SLOTS){
        const item=this.state.item(slot.id),s=slot.size;
        const children=item?mapDeviceCell(`map-device-equipped-${slot.id}`,{...item,count:1},0,0,s).children:emptyDeviceSocket(slot,'map-device-live-empty');
        this.runtime.setChildren(this.binding(`map-device-content:${slot.id}`).id,children);
      }
    }
    const updates=[];const set=(binding,patch)=>{const n=this.binding(binding);if(n)updates.push([n.id,patch]);};
    const library=this.binding('map-device-library'),mapItems=this.state.mapItems;
    if(library){
      const grid=library.source.grid,rows=Math.max(grid.rows,Math.ceil(mapItems.length/grid.columns)),signature=JSON.stringify(mapItems);
      if(signature!==this.libraryCache){
        this.libraryCache=signature;
        this.runtime.setChildren(library.id,Array.from({length:rows*grid.columns},(_,i)=>mapDeviceCell(`map-device-live-library-${i}`,mapItems[i],i%grid.columns*grid.pitch,Math.floor(i/grid.columns)*grid.pitch,grid.cell,'map-device-library-item')));
        updates.push([library.id,{layout:{height:rows*grid.pitch-(grid.pitch-grid.cell)},slot:{offsets:{bottom:rows*grid.pitch-(grid.pitch-grid.cell)}}}]);
      }
      set('map-device-items-count',{text:`${mapItems.length} 种`});set('map-device-items-empty',{visibility:mapItems.length?'collapsed':'visible'});
    }
    for(const node of this.runtime.nodes.values())if(node.action?.op==='map-device-item'){
      const item=this.state.items.find(i=>i.key===node.action.value);if(item)updates.push([node.id,{brushes:{...qualityBrushes('cell',item.rarity||'common'),normal:`battle-svg-equipment-cell-${item.rarity||'common'}-${this.selected===item.key?'selected':'normal'}`}}]);
    }
    for(const slot of MAP_DEVICE_SLOTS)set(`map-device-slot:${slot.id}`,{brushes:qualityBrushes('cell',this.state.item(slot.id)?.rarity||'empty')});
    const map=this.state.item('map');set('map-device-selection',{text:map?map.name:'尚未放入地图',style:{color:map?qualityColor(map.rarity):'#cfb88c'}});
    set('map-device-feedback',{text:this.message||'地图 T 级决定层级 · 进入时消耗 1 张'});set('map-device-bag-count',{text:`${bag.length} 项`});set('map-device-bag-empty',{visibility:bag.length?'collapsed':'visible'});set('map-device-page',{text:`${this.state.page+1} / ${pages}`});
    for(const f of ['all','map','modifier'])set(`map-device-filter:${f}`,{brushes:qualityBrushes('row',f===this.state.filter?'rare':'empty')});
    this.runtime.setMany(updates);
  }
  destroy(){this.inspector?.destroy();this.cancel();this.events.abort();}
}

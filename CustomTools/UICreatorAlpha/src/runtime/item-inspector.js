import { UIRuntime } from './runtime.js';
import { measureText } from '../render/svg-renderer.js';
import { itemTooltipView } from '../assets/rulestudio-hud/item-tooltip.js';
import { InspectorCraftingPreview } from './inspector-crafting.js';

export function placeItemTooltip(anchor,width,height,bounds) {
 const margin=12,gap=10,scale=Math.min(1,(bounds.width-margin*2)/width,(bounds.height-margin*2)/height),w=width*scale,h=height*scale;
 let x=anchor.right+gap,y=anchor.top;
 if(x+w>bounds.right-margin){x=anchor.left-w-gap;if(x<bounds.left+margin){x=anchor.left;y=anchor.top-h-gap>=bounds.top+margin?anchor.top-h-gap:anchor.bottom+gap;}}
 return {x:Math.max(bounds.left+margin,Math.min(x,bounds.right-w-margin)),y:Math.max(bounds.top+margin,Math.min(y,bounds.bottom-h-margin)),scale};
}

// One transient SVG portal per view. It stays outside scroll clips and uses only
// the prefab's referenced assets, rather than duplicating the whole HUD library.
export class ItemInspector {
 constructor(suite,{readOnly=false}={}) {
  this.suite=suite;this.owner=suite.owner;this.source=this.owner.runtime;this.events=new AbortController();this.id=`item-hover-${crypto.randomUUID()}`;
  this.crafting=readOnly?{view:()=>({readOnly:true}),activate:()=>false,reset:()=>{}}:new InspectorCraftingPreview(suite);
  const options={signal:this.events.signal};
  this.source.svg.addEventListener('pointerover',e=>{const node=suite.itemAt(e.target),previous=suite.itemAt(e.relatedTarget||{});if(node&&node.id!==previous?.id)this.enter(node,e.ctrlKey);},options);
  this.source.svg.addEventListener('pointerout',e=>{const node=suite.itemAt(e.target),next=suite.itemAt(e.relatedTarget||{});if(node&&node.id!==next?.id)this.leave(node.action.value);},options);
  this.source.svg.addEventListener('focusin',e=>{const node=suite.itemAt(e.target);if(node&&!this.closing)this.enter(node);},options);
  this.source.svg.addEventListener('focusout',e=>{const node=suite.itemAt(e.target);if(node)this.leave(node.action.value);},options);
  this.source.svg.addEventListener('wheel',()=>this.closeHover(),{...options,passive:true});
  this.source.svg.addEventListener('pointermove',e=>{const drag=suite.drag;if(drag&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>=10){drag.active=true;this.closeHover();}},options);
  this.source.addEventListener('paint',()=>this.sync(),options);
  window.addEventListener('blur',()=>this.closeHover(),options);
  window.addEventListener('resize',()=>this.place(),options);
 }
 get context(){return `${this.suite.standalone}|${this.owner.state.panel}|${this.suite.state.overlays.join('/')}`;}
 enter(node,pin=false) {
  if(this.pinned||this.suite.drag?.active||this.suite.state.overlays.length)return;
  const item=this.suite.state.items.find(i=>i.id===node.action?.value),entry=this.source.layout.entries.get(node.id);
  if(!item||!entry?.visible)return;
  if(this.itemId===item.id&&this.anchorId===node.id){if(pin)this.pin();return;}
  this.close();this.itemId=item.id;this.anchorId=node.id;this.openContext=this.context;this.pinned=pin;this.render(item);
 }
 leave(id){if(!this.pinned&&this.itemId===id)this.close();}
 closeHover(){if(!this.pinned)this.close();}
 pin(){if(!this.itemId||this.pinned)return;this.pinned=true;this.signature='';this.sync();this.runtime?.renderer.groups.get('battle-item-hover-close')?.group.focus();}
 handleKey(e) {
  if(!this.itemId||e.repeat||e.target.closest?.('input,select,textarea,[contenteditable="true"]'))return false;
  if(['ControlLeft','ControlRight'].includes(e.code)){e.preventDefault();e.stopPropagation();this.pin();return true;}
  if(e.code==='Escape'){e.preventDefault();e.stopPropagation();this.close(true);return true;}
  return false;
 }
 contains(target){return this.host?.contains(target)||false;}
 sync() {
  if(!this.itemId)return;
  const item=this.suite.state.items.find(i=>i.id===this.itemId),node=this.suite.inspectorNode?this.suite.inspectorNode(this.anchorId):this.source.nodes.get(this.anchorId),entry=this.source.layout.entries.get(this.anchorId);
  if(!item||this.context!==this.openContext||!this.pinned&&(!entry?.visible||node?.action?.value!==this.itemId)){this.close();return;}
  if(this.signature!==JSON.stringify([item,!!this.pinned,this.crafting.view(item)]))this.render(item);else this.place();
 }
 render(item) {
  const crafting=this.crafting.view(item);this.signature=JSON.stringify([item,!!this.pinned,crafting]);
  this.runtime?.destroy();
  if(!this.host){this.host=document.createElement('div');this.host.id=this.id;this.host.dataset.uiItemTooltip='';Object.assign(this.host.style,{position:'fixed',zIndex:'1600',transformOrigin:'0 0',filter:'drop-shadow(0 12px 24px #0009)'});document.body.append(this.host);}
  const host=this.host;host.dataset.itemId=item.id;host.dataset.pinned=String(!!this.pinned);host.setAttribute('role',this.pinned?'dialog':'tooltip');host.setAttribute('aria-label',`${item.name}物品详情`);host.style.pointerEvents=this.pinned?'auto':'none';
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');host.replaceChildren(svg);
  const view=itemTooltipView(this.source.project,item,!!this.pinned,measureText,crafting);this.view=view;
  Object.assign(svg.style,{display:'block',width:`${view.viewport.width}px`,height:`${view.viewport.height}px`,maxWidth:'none',maxHeight:'none',overflow:'visible',stroke:'none',strokeWidth:'1'});
  this.runtime=new UIRuntime(svg,view,{motion:false,sound:!!this.source.audioPlayer,audioPlayer:this.source.audioPlayer});
  const tip=this.runtime;
  for(const n of tip.nodes.values())if(n.type==='Button'){const group=tip.renderer.groups.get(n.id)?.group;if(group)group.style.outline='none';}
  svg.addEventListener('focusin',e=>{const id=e.target.closest?.('[data-node-type="Button"]')?.getAttribute('data-node-id');if(id&&svg.isConnected&&this.runtime===tip){tip.states.set(id,'hovered');tip.paint();}});
  svg.addEventListener('focusout',e=>{const id=e.target.closest?.('[data-node-type="Button"]')?.getAttribute('data-node-id');if(id&&svg.isConnected&&this.runtime===tip){tip.states.delete(id);tip.paint();}});
  if(!this.pinned)svg.querySelectorAll('[data-hit]').forEach(hit=>hit.setAttribute('pointer-events','none'));
  this.runtime.addEventListener('activate',e=>{const action=e.detail.node.action||{},op=action.op;if(op==='hover-close')this.close(true);else if(this.pinned&&this.crafting.activate(action,item)){this.signature='';this.sync();}else if(op==='hover-equip')this.suite.inspectAction(op,this.itemId);});
  this.source.renderer.groups.get(this.anchorId)?.group.setAttribute('aria-describedby',this.id);
  this.place();
 }
 place() {
  if(!this.host||!this.view)return;
  const anchor=this.source.renderer.groups.get(this.anchorId)?.hit.getBoundingClientRect();if(anchor)this.anchor=anchor;
  if(!this.anchor){this.close();return;}
  const p=placeItemTooltip(this.anchor,this.view.viewport.width,this.view.viewport.height,{left:0,top:0,right:window.innerWidth,bottom:window.innerHeight,width:window.innerWidth,height:window.innerHeight});
  Object.assign(this.host.style,{left:`${p.x}px`,top:`${p.y}px`,width:`${this.view.viewport.width}px`,height:`${this.view.viewport.height}px`,transform:`scale(${p.scale})`});
 }
 close(restoreFocus=false) {
  const anchor=this.source.renderer.groups.get(this.anchorId)?.group;
  if(anchor?.getAttribute('aria-describedby')===this.id)anchor.removeAttribute('aria-describedby');
  this.itemId='';this.anchorId='';this.pinned=false;this.signature='';this.anchor=null;this.view=null;this.runtime?.destroy();this.runtime=null;this.host?.remove();this.host=null;
  this.crafting.reset();
  if(restoreFocus&&anchor){this.closing=true;anchor.focus({preventScroll:true});this.closing=false;}
 }
 destroy(){this.close();this.events.abort();}
}

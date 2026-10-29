import {ref,watch,nextTick,onMounted,onBeforeUnmount} from '/vendor/vue.esm-browser.prod.js';
import {UIRuntime} from '/uicreator/runtime/runtime.js';
import {createNode} from '/uicreator/core/model.js';
import {ItemInspector} from '/uicreator/runtime/item-inspector.js';
import {BattleWindow} from './battle-window.mjs';
import {store,notify} from './editors.mjs';
import {player} from './player.mjs';
import {iconSrc} from './game-icons.mjs';
import {affixText} from './affix-text.mjs';
import {outpostMerchantView,buyOutpostOffer} from './outpost-merchant-model.mjs';
import {merchantCardBrushes} from '/uicreator/assets/rulestudio-hud/merchant-selection.js';
import {BattleMerchantPurchaseMenu} from './battle-merchant-purchase-menu.mjs';

export const BattleOutpostMerchant={
  components:{BattleWindow,BattleMerchantPurchaseMenu},props:['info','open','worldSeed'],emits:['open','close','release','purchased'],
  setup(props,{emit}){
    const tag=ref(null),panel=ref(null),error=ref(''),purchaseMenu=ref(null);let project,tagUI,ui,inspector,timer,disposed=false,generation=0,offers=[],inspectionItems=[],period=-1,message='',selectedKey='';
    const icons=new Map(),paintedIcons=new Map(),requests=new AbortController();
    const now=()=>Date.now(),options=()=>({worldSeed:props.worldSeed,now:now()});
    const inspectionNode=node=>{const index=node?.action?.op==='buy'?Number(node.action.value):-1,offer=offers[index];return offer?{...node,action:{...node.action,value:offer.key}}:null;};
    const target=el=>ui?.nodes.get(el.closest?.('[data-node-type="Button"]')?.getAttribute('data-node-id'));
    async function icon(offer){const src=iconSrc(offer.kind,offer.item||store.collections.item.get(offer.id)?.doc||offer);if(!icons.has(src))icons.set(src,fetch(src,{signal:requests.signal}).then(r=>r.ok?r.blob():null).then(blob=>blob?URL.createObjectURL(blob):'').catch(()=>''));return icons.get(src);}
    function countdown(view){const seconds=Math.max(0,Math.ceil((view.nextRefreshAt-now())/1000));return `下次刷新 ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;}
    async function render(){
      if(!ui||!props.open||disposed)return;const current=++generation;
      try{
        const view=outpostMerchantView(player,store.collections,store.library,store.catalog,options()),nextOffers=view.offers;
        const urls=await Promise.all(nextOffers.map(icon));if(disposed||current!==generation||!ui)return;
        // The click handler always refers to the stock that has actually painted.
        // While a new batch loads, old offer keys are rejected by the transaction.
        offers=nextOffers;period=view.period;
        if(purchaseMenu.value&&!offers.some(offer=>offer.key===purchaseMenu.value.offer.key&&!offer.claimed))closePurchaseMenu();
        if(!offers.some(offer=>offer.key===selectedKey&&!offer.claimed))selectedKey='';
        const patches=[['shop-wallet',{text:`灵石 ${player.stones}`}],['shop-refresh',{text:countdown(view)}],['shop-message',{text:message||'左键选中 · 右键打开购买菜单'}]];
        inspectionItems=offers.map((offer,i)=>{const item=offer.item;return {...offer,...item,id:offer.key,catalogId:offer.id,iconSrc:urls[i],count:1,description:offer.description||'',baseLines:(item?.bases||[]).map(a=>affixText(a,store.library)),fixedLines:[...(item?.legendary?[item.legendary]:[]),...(item?.extraLegendary||[])].map(a=>affixText(a,store.library)),affixes:(item?.affixes||[]).map(a=>({text:affixText(a,store.library),tier:a.tier}))};});
        for(let i=0;i<9;i++){
          const offer=offers[i];patches.push([`stock-${i}`,{visibility:offer?'visible':'collapsed',interactable:!!offer&&!offer.claimed,name:offer?`${offer.key===selectedKey?'已选 · ':''}${offer.name} · ${offer.claimed?'已售出':'右键打开购买菜单'}`:'空商品',brushes:merchantCardBrushes(i>=3,offer?.key===selectedKey),style:{opacity:offer?.claimed?.45:1}}]);if(!offer)continue;
          if(paintedIcons.get(i)!==urls[i]){ui.setChildren(`stock-${i}-icon`,urls[i]?[createNode('Image',{id:`stock-${i}-picture`,src:urls[i],slot:{offsets:{left:0,top:0,right:62,bottom:62}}})]:[]);paintedIcons.set(i,urls[i]);}
          patches.push([`stock-${i}-name`,{text:offer.name}],[`stock-${i}-meta`,{text:offer.infinite?'无限供应':`传奇 · T${offer.tier} · 限量 1 件`}],[`stock-${i}-buy`,{text:offer.claimed?'已售出':`${offer.price} 灵石`,style:{color:offer.claimed?'#70818b':player.stones<offer.price?'#bc8d82':'#95d9c2'}}]);
        }
        ui.setMany(patches);inspector?.sync();error.value='';
      }catch(e){error.value=e.message;}
    }
    function offerFor(node){return node?.action?.op==='buy'?offers[Number(node.action.value)]:null;}
    function markSelection(){for(let i=0;i<offers.length;i++)ui?.renderer.groups.get(`stock-${i}`)?.group.setAttribute('aria-pressed',String(offers[i].key===selectedKey));}
    function selectOffer(node){
      const offer=offerFor(node);if(!offer||offer.claimed)return null;closePurchaseMenu();selectedKey=offer.key;
      ui.setMany(offers.map((row,i)=>[`stock-${i}`,{brushes:merchantCardBrushes(i>=3,row.key===selectedKey),name:`${row.key===selectedKey?'已选 · ':''}${row.name} · ${row.claimed?'已售出':'右键打开购买菜单'}`} ]));return offer;
    }
    function closePurchaseMenu(restoreFocus=false){
      const current=purchaseMenu.value;
      // Keep the inspector suppressed while keyboard focus returns to the selected card.
      if(restoreFocus&&current)ui?.renderer.groups.get(current.anchorId)?.group.focus({preventScroll:true});
      purchaseMenu.value=null;
    }
    function openPurchaseMenu(node,event){
      const offer=selectOffer(node);if(!offer)return;inspector?.close();
      const rect=ui.renderer.groups.get(node.id)?.hit.getBoundingClientRect();
      purchaseMenu.value={offer,iconSrc:inspectionItems.find(item=>item.id===offer.key)?.iconSrc||'',anchorId:node.id,x:event.clientX||rect?.left||8,y:event.clientY||rect?.bottom||8};
    }
    function purchase(key){
      const offer=offers.find(row=>row.key===key&&!row.claimed);if(!offer)return;
      closePurchaseMenu();inspector?.close();const result=buyOutpostOffer(player,store.collections,store.library,store.catalog,offer.key,options());
      message=result.error||`已购入 ${result.offer.name} · 放入背包`;if(result.error)notify(result.error,true);else emit('purchased');void render();
    }
    function destroyShop(){generation++;closePurchaseMenu();selectedKey='';paintedIcons.clear();inspector?.destroy();inspector=null;ui?.destroy();ui=null;}
    async function mountShop(){destroyShop();await nextTick();if(!project||!panel.value||!props.open||disposed)return;
      ui=new UIRuntime(panel.value,project,{sound:false,motion:false});
      const suite={owner:{runtime:ui,state:{panel:'outpost-merchant'}},standalone:'outpost-merchant',state:{get overlays(){return purchaseMenu.value?['purchase-menu']:[];},get items(){return inspectionItems;}},drag:null,itemAt:el=>inspectionNode(target(el)),inspectorNode:id=>inspectionNode(ui?.nodes.get(id)),inspectAction(){}};
      inspector=new class extends ItemInspector{render(item){super.render(item);if(this.host)this.host.style.zIndex='20010';}}(suite,{readOnly:true});
      ui.addEventListener('paint',markSelection,{signal:ui.events.signal});
      ui.addEventListener('activate',event=>selectOffer(event.detail.node),{signal:ui.events.signal});
      panel.value.addEventListener('focusin',event=>selectOffer(target(event.target)),{signal:ui.events.signal});
      panel.value.addEventListener('contextmenu',event=>{event.preventDefault();event.stopPropagation();openPurchaseMenu(target(event.target),event);},{signal:ui.events.signal});
      await render();
    }
    function key(event){
      if(!props.open)return;
      if(purchaseMenu.value&&event.code==='Escape'){event.preventDefault();event.stopPropagation();closePurchaseMenu(true);return;}
      if(event.code==='ContextMenu'||event.shiftKey&&event.code==='F10'){event.preventDefault();event.stopPropagation();openPurchaseMenu(target(event.target),event);return;}
      if(inspector?.handleKey(event))return;if(event.code==='Escape'){event.preventDefault();event.stopPropagation();emit('close');}
    }
    onMounted(async()=>{window.addEventListener('keydown',key,true);try{const r=await fetch('/ui/outpost-merchant.uialpha.json',{cache:'no-store'});if(!r.ok)throw Error('拓荒商人 UICreator 资产未发布');project=await r.json();if(disposed)return;
      tagUI=new UIRuntime(tag.value,project,{prefabId:'merchant-launcher',sound:false,motion:false});tagUI.addEventListener('activate',openMerchant);if(props.open)await mountShop();
      timer=setInterval(()=>{if(!ui||!props.open)return;try{const view=outpostMerchantView(player,store.collections,store.library,store.catalog,options());if(view.period!==period){message='特殊装备已刷新';closePurchaseMenu();inspector?.close();void render();}else ui.set('shop-refresh',{text:countdown(view)});}catch(e){error.value=e.message;}},1000);
    }catch(e){error.value=e.message;}});
    watch(()=>props.open,opened=>{message='';if(opened)void mountShop();else destroyShop();});
    watch(()=>player.stones,()=>{if(props.open)void render();});
    onBeforeUnmount(()=>{disposed=true;window.removeEventListener('keydown',key,true);clearInterval(timer);requests.abort();destroyShop();tagUI?.destroy();for(const value of icons.values())value.then(url=>{if(url)URL.revokeObjectURL(url);});});
    function openMerchant(){if(!props.open){emit('release');emit('open');}}
    function launcherFocus(active){if(!tagUI)return;if(active)tagUI.states.set('merchant-open','hovered');else tagUI.states.delete('merchant-open');tagUI.paint();}
    return {tag,panel,error,key,openMerchant,launcherFocus,purchaseMenu,closePurchaseMenu,purchase,projectForMenu:()=>project,player};
  },
  template:`<div v-show="info.visible && !open" class="b3-outpost-tag" :style="{left:Math.round(info.x)+'px',top:Math.round(info.y)+'px'}" @pointerenter="$emit('release')" @pointerdown.stop @pointermove.stop @click.stop="openMerchant" @focusin="launcherFocus(true)" @focusout="launcherFocus(false)"><svg ref="tag" xmlns="http://www.w3.org/2000/svg" aria-label="拓荒商人交互"></svg></div>
  <BattleWindow v-if="open" title="拓荒商人" kind="outpost-merchant" @close="$emit('close')"><div class="b3-outpost-stock" @keydown="key" @pointerdown.stop @pointermove.stop @wheel.stop><svg ref="panel" xmlns="http://www.w3.org/2000/svg" aria-label="拓荒商人商品"></svg><p v-if="error" role="alert">{{error}}</p></div></BattleWindow>
  <BattleMerchantPurchaseMenu v-if="purchaseMenu" :key="purchaseMenu.offer.key" :project="projectForMenu()" :offer="purchaseMenu.offer" :icon-src="purchaseMenu.iconSrc" :stones="player.stones" :x="purchaseMenu.x" :y="purchaseMenu.y" @buy="purchase" @close="closePurchaseMenu"/>`
};

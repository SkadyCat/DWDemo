import {ref,watch,onMounted,onBeforeUnmount} from '/vendor/vue.esm-browser.prod.js';
import {UIRuntime} from '/uicreator/runtime/runtime.js';
import {createNode} from '/uicreator/core/model.js';
import {MERCHANT_PURCHASE_MENU} from '/uicreator/assets/rulestudio-hud/merchant-purchase-menu.js';
import {contextMenuColor,contextMenuMix} from '/uicreator/assets/rulestudio-hud/context-menu-style.js';
import {EQUIPMENT_RARITY_NAMES} from '/engine/equipment.mjs';

export const BattleMerchantPurchaseMenu={
  props:['project','offer','iconSrc','stones','x','y'],emits:['buy','close'],
  setup(props,{emit}){
    const host=ref(null),svg=ref(null);let ui,events,paintedIcon;
    function paint(){
      if(!ui)return;const affordable=props.stones>=props.offer.price;
      const quality=props.offer.rarity==='normal'?'common':props.offer.rarity||'common',color=contextMenuColor(quality);
      const width=Math.max(70,Math.min(100,52+String(props.offer.price).length*7)),left=219-width;
      if(paintedIcon!==props.iconSrc){ui.setChildren('merchant-purchase-item-icon',props.iconSrc?[createNode('Image',{id:'merchant-purchase-item-picture',src:props.iconSrc,slot:{offsets:{left:0,top:0,right:32,bottom:32}},layout:{width:32,height:32}})]:[]);paintedIcon=props.iconSrc;}
      ui.setMany([
        ['merchant-purchase-background',{svgAsset:'merchant-purchase-frame-'+(ui.project.assets['merchant-purchase-frame-'+quality]?quality:'common')}],
        ['merchant-purchase-icon-frame',{style:{stroke:contextMenuMix(color,'#263247',.55)}}],
        ['merchant-purchase-item-name',{text:props.offer.name,style:{color}}],
        ['merchant-purchase-item-meta',{text:`${EQUIPMENT_RARITY_NAMES[quality]||'普通'} · T${props.offer.tier}`}],
        ['merchant-purchase-buy',{interactable:affordable,name:affordable?`购买，${props.offer.price} 灵石`:'灵石不足'}],
        ['merchant-purchase-label',{text:affordable?'购买':'灵石不足',style:{color:affordable?'#d4deed':'#bc8d82'}}],
        ['merchant-purchase-price-box',{slot:{offsets:{left,right:width}},style:{stroke:affordable?'#65c6a51c':'#bc8d8233'}}],
        ['merchant-purchase-stone-icon',{slot:{offsets:{left:left+7}}}],
        ['merchant-purchase-price',{text:`−${props.offer.price}`,slot:{offsets:{left:left+19,right:width-44}},style:{color:affordable?'#a1ecd0':'#bc8d82'}}],
        ['merchant-purchase-currency',{slot:{offsets:{left:left+width-25}}}]
      ]);
    }
    function place(){
      if(!host.value)return;const {width,height}=props.project.prefabs[MERCHANT_PURCHASE_MENU];
      host.value.style.left=`${Math.max(8,Math.min(props.x,window.innerWidth-width-8))}px`;
      host.value.style.top=`${Math.max(8,Math.min(props.y,window.innerHeight-height-8))}px`;
    }
    function key(event){
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();emit('close',true);}
      else if(event.key==='Tab')emit('close',false);
      else if(['ArrowUp','ArrowDown','Home','End'].includes(event.key)){event.preventDefault();ui?.renderer.groups.get('merchant-purchase-buy')?.group.focus({preventScroll:true});}
    }
    onMounted(()=>{
      events=new AbortController();const options={signal:events.signal};
      ui=new UIRuntime(svg.value,props.project,{prefabId:MERCHANT_PURCHASE_MENU,sound:false,motion:false});
      ui.addEventListener('paint',()=>ui.renderer.groups.get('merchant-purchase-buy')?.group.setAttribute('role','menuitem'),options);
      ui.addEventListener('activate',event=>{if(event.detail.node.action?.op==='purchase-confirm'&&props.stones>=props.offer.price)emit('buy',props.offer.key);},options);
      document.addEventListener('pointerdown',event=>{if(!host.value?.contains(event.target))emit('close',false);},{...options,capture:true});
      window.addEventListener('resize',()=>emit('close',false),options);
      window.addEventListener('scroll',()=>emit('close',false),{...options,capture:true});
      window.addEventListener('blur',()=>emit('close',false),options);
      paint();place();ui.renderer.groups.get('merchant-purchase-buy')?.group.focus({preventScroll:true});
    });
    watch(()=>[props.stones,props.iconSrc],paint);
    watch(()=>[props.x,props.y],place);
    onBeforeUnmount(()=>{events?.abort();ui?.destroy();});
    return {host,svg,key};
  },
  template:`<teleport to="body"><div ref="host" class="b3-outpost-purchase-menu" data-ui-merchant-purchase role="menu" :aria-label="offer.name+'购买菜单'" tabindex="-1" @pointerdown.stop @pointermove.stop @contextmenu.prevent.stop @keydown.stop="key"><svg ref="svg" xmlns="http://www.w3.org/2000/svg" aria-label="购买操作"></svg></div></teleport>`
};

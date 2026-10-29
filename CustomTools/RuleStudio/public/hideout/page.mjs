import { createApp, reactive, ref, computed, watch, nextTick, onBeforeUnmount } from '../vendor/vue.esm-browser.prod.js';
import { player, ensureStarted, equip } from '../player.mjs';
import { store, notify } from '../editors.mjs';
import { BattleWindow } from '../battle-window.mjs';
import { BattleItemPanel } from '../battle-item-panel.mjs';
import { inventoryPage, ItemInspector } from '../battle-panels.mjs';
import { INVENTORY_PAGE_SIZE, reconcileInventoryLayout, inventoryGrid, moveInventoryStack } from '../inventory-layout.mjs';
import { iconSrc } from '../game-icons.mjs';
import { ensureHideout, transferStoredItem, transferMerchantItem, hideoutInventoryEntries } from './model.mjs';
import { HideoutScene } from './scene.mjs';
import { isInventoryNew, seeInventoryItem } from '../inventory-notices.mjs';

const TEMPLATE = /* html */ `<div class="ho-page" v-if="store.library && store.catalog">
  <div class="ho-stage" ref="stage" tabindex="0" aria-label="藏身处场景">
    <header class="ho-heading"><span>HIDEOUT</span><h1>藏身处</h1><p>整理行装，再次启程</p></header>
    <div class="ho-wallet"><span class="stone-ico"></span><b>{{ player.stones }}</b><small>灵石</small></div>
    <button v-for="label in sceneHud.labels" :key="label.id" type="button" class="ho-station" :style="{left: label.left+'px', top: label.top+'px'}" :data-hideout-target="label.id" @click="interact(label.id)"><span class="ho-station-symbol">{{ label.id === 'stash' ? '▣' : '◈' }}</span><b>{{ label.name }}</b><small>点击打开</small></button>
    <div class="ho-controls"><span>点击仓库或商家商品，直接打开</span></div>
    <button type="button" class="ho-back" @click="goBattle">返回 3D 战斗 <span>↗</span></button>
  </div>
  <BattleWindow v-if="panel" :title="isMerchant ? '商家商品' : '仓库'" :kind="isMerchant ? 'hideout-merchant' : 'hideout-stash'" @close="closePanel">
    <div class="ho-storage-body" :class="{'ho-goods-body': isMerchant}" @wheel="inspector.closeHover()">
      <header class="ho-panel-intro"><div><span class="ho-panel-eyebrow">{{ isMerchant ? 'MERCHANT GOODS' : 'PERSONAL STORAGE' }}</span><p>{{ isMerchant ? '从背包拖入右侧格子上架，拖回背包即可下架。' : '拖动装备与道具，存入仓库或取回背包。' }}</p></div><input type="search" v-model="query" :placeholder="isMerchant ? '搜索背包和商品' : '搜索背包和仓库'" :aria-label="isMerchant ? '搜索背包和商品' : '搜索背包和仓库'"></header>
      <div class="ho-storage-panes">
        <section v-for="side in ['bag',storageSide]" :key="side" :aria-label="sideName(side)+'物品'">
          <header><h3>{{ sideName(side) }} <span v-if="side === 'goods'" class="ho-listed-label">已上架</span></h3><small>{{ counts[side] }} 件</small></header>
          <div class="ho-slots" :class="{'drop-ready': dragSide && dragSide !== side, 'drop-over': dragOverSide === side}" :data-storage-grid="side" @dragover="dragOver($event,side)" @dragleave="dragLeave($event,side)" @drop.prevent="dropItem($event,side)">
            <button v-for="(item,i) in grids[side].cells" :key="i" type="button" class="ho-slot" :class="[item && item.kind !== 'skill' ? 'r-'+item.rarity : 'empty', {'inventory-new': side === 'bag' && isInventoryNew(player, item), selected: selectedSide === side && selectedKey === item?.key, equipped: item?.equipped}]" :aria-label="item && item.kind !== 'skill' ? item.name + '，数量' + item.count : '空格'" :tabindex="item && item.kind !== 'skill' ? 0 : -1" :data-storage-side="side" :data-storage-id="item?.id" :data-storage-index="i" :draggable="canDrag(item)" @dragstart="startDrag($event,side,item)" @dragend="endDrag" @drop.prevent.stop="dropItem($event,side,i)" @pointerenter="inspectItem(side,item,$event)" @pointerleave="inspector.leave(side+':'+item?.key)" @focus="inspectItem(side,item,$event)" @blur="inspector.leave(side+':'+item?.key)" @click="selectItem(side,item)" @dblclick="if(item && item.kind !== 'skill'){selectItem(side,item); transfer()}"><template v-if="item && item.kind !== 'skill'"><img :src="iconSrc(item.kind, item)" :data-currency-grade="item.currencyGrade" alt="" draggable="false"><small v-if="item.tier">T{{ item.tier }}</small><b v-if="item.count > 1">{{ item.count }}</b><i v-if="item.equipped">{{ item.kind === 'equipment' ? '装' : '栏' }}</i><span v-if="side === 'bag' && isInventoryNew(player, item)" class="inventory-new-edge" aria-hidden="true"></span></template></button>
          </div>
          <p class="ho-grid-hint" v-if="side !== 'bag'">{{ side === 'goods' ? '拖入上架 · 拖回下架' : '拖入存放 · 拖回取出' }}</p>
          <footer class="ho-pagination"><button type="button" :disabled="grids[side].page <= 0" :aria-label="sideName(side)+'上一页'" @click="pages[side]--">‹</button><span>{{ grids[side].page+1 }} / {{ grids[side].pages }}</span><button type="button" :disabled="grids[side].page+1 >= grids[side].pages" :aria-label="sideName(side)+'下一页'" @click="pages[side]++">›</button></footer>
        </section>
      </div>
      <div class="ho-transfer-bar"><span>{{ selected ? selected.name : isMerchant ? '选择或拖动物品上架' : '选择物品，存入或取出' }}<small v-if="selected?.equipped && selected.kind === 'equipment'"> · 已装备，请先卸下</small></span><label>数量 <input type="number" v-model.number="amount" min="1" :max="selected?.count || 1" :disabled="!selected" aria-label="转移数量"></label><button type="button" class="btn primary" :disabled="!canTransfer" @click="transfer()">{{ selectedSide !== 'bag' ? isMerchant ? '下架至背包 ←' : '取回背包 ←' : isMerchant ? '上架商品 →' : '存入仓库 →' }}</button></div>
    </div>
  </BattleWindow>
  <BattleItemPanel v-if="panel && inspected" :item="inspected.item" :inventory="inspected.inventory" :read-only="inspected.side !== 'bag'" :pinned="inspector.pinned" :position="inspectorPosition" @close="inspector.close()" @equip="setEquip" @identified="identifiedItem" />
</div><div v-else class="ed-loading">{{ store.error || '正在准备藏身处…' }}</div>`;

export function mountHideout(el) {
  let api;
  const app=createApp({components:{BattleWindow,BattleItemPanel},template:TEMPLATE,setup(){
    const stage=ref(null),panel=ref(''),query=ref(''),pages=ref({bag:0,stash:0,goods:0}),selectedKey=ref(''),selectedSide=ref('bag'),amount=ref(1);
    const sceneHud=ref({labels:[]}),dragSide=ref(''),dragOverSide=ref('');let scene=null,active=false,dragged=null;
    const inspector=reactive(new ItemInspector());
    const isMerchant=computed(()=>panel.value==='merchant'),storageSide=computed(()=>isMerchant.value?'goods':'stash');
    const containers=computed(()=>({bag:player,stash:player.hideout?.stash,goods:player.hideout?.merchant?.inventory}));
    const entries=computed(()=>{store.version;return hideoutInventoryEntries(containers.value,store.collections);});
    const views=computed(()=>Object.fromEntries(Object.entries(containers.value).map(([side,state])=>[side,reconcileInventoryLayout(state?.bagLayout,entries.value[side])])));
    watch(()=>views.value,all=>{for(const [side,view] of Object.entries(all)){const state=containers.value[side];if(state&&JSON.stringify(state.bagLayout)!==JSON.stringify(view.layout))state.bagLayout=view.layout;}},{immediate:true});
    const grids=computed(()=>Object.fromEntries(Object.entries(views.value).map(([side,view])=>{const q=query.value.trim().toLowerCase();return[side,q?inventoryPage(view.entries.filter(i=>i.kind!=='skill'&&i.name.toLowerCase().includes(q)),pages.value[side]):inventoryGrid(view,pages.value[side])];})));
    const counts=computed(()=>Object.fromEntries(Object.entries(entries.value).map(([side,rows])=>[side,rows.filter(i=>i.kind!=='skill').length])));
    const selected=computed(()=>views.value[selectedSide.value].entries.find(i=>i.key===selectedKey.value)||null);
    const inspected=computed(()=>{const colon=inspector.key.indexOf(':'),side=inspector.key.slice(0,colon),key=inspector.key.slice(colon+1),item=views.value[side]?.entries.find(i=>i.key===key);return item?{side,item,inventory:containers.value[side]}:null;});
    const inspectorPosition=computed(()=>({left:inspector.x,top:inspector.y}));
    watch(inspected,item=>{if(!item)inspector.close();});
    watch(query,()=>inspector.closeHover());
    watch(pages,()=>inspector.closeHover(),{deep:true});
    const canDrag=item=>!!item&&['equipment','item'].includes(item.kind)&&!(item.kind==='equipment'&&item.equipped);
    const canTransfer=computed(()=>canDrag(selected.value)&&Number.isSafeInteger(amount.value)&&amount.value>0&&amount.value<=selected.value.count);
    const sideName=side=>({bag:'背包',stash:'仓库',goods:'商家商品'})[side];
    watch(panel,value=>scene?.setBlocked(!!value),{flush:'sync'});
    function selectItem(side,item){if(!item||item.kind==='skill')return;selectedSide.value=side;selectedKey.value=item.key;amount.value=item.count;}
    function inspectItem(side,item,event){if(!item||item.kind==='skill'){inspector.closeHover();return;}if(side==='bag')seeInventoryItem(player,item);inspector.enter(side+':'+item.key,event.currentTarget.getBoundingClientRect(),innerWidth,innerHeight);}
    function setEquip(slot,id){const error=equip(slot,id);if(error)notify(error,true);else ensureStarted(store.catalog,store.collections,store.library);}
    function identifiedItem(uid){inspector.key='bag:equipment:'+uid;}
    function transfer(targetIndex){
      if(!canTransfer.value)return;
      const i=selected.value,depositing=selectedSide.value==='bag',move=isMerchant.value?transferMerchantItem:transferStoredItem;
      const result=move(player,store.collections,{direction:depositing?'deposit':'withdraw',kind:i.kind,id:i.id,count:amount.value,stackKey:i.key,targetIndex});
      if(result.error){notify(result.error,true);return;}
      selectedKey.value='';inspector.close();
      notify(`${result.name}${result.count>1?' ×'+result.count:''}已${isMerchant.value?(depositing?'上架':'下架至背包'):(depositing?'存入仓库':'取回背包')}`);
    }
    function startDrag(event,side,item){
      if(!canDrag(item)||!event.dataTransfer){event.preventDefault();return;}
      inspector.close();dragged={panel:panel.value,side,key:item.key};dragSide.value=side;
      event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('application/x-hideout-item',JSON.stringify(dragged));
    }
    function dragOver(event,side){if(!dragged||dragged.panel!==panel.value)return;event.preventDefault();event.dataTransfer.dropEffect='move';dragOverSide.value=side;}
    function dragLeave(event,side){if(!event.currentTarget.contains(event.relatedTarget)&&dragOverSide.value===side)dragOverSide.value='';}
    function endDrag(){dragged=null;dragSide.value='';dragOverSide.value='';}
    function dropItem(event,side,index){
      const source=dragged;endDrag();
      if(!source||source.panel!==panel.value||![source.side,side].every(s=>s==='bag'||s===storageSide.value))return;
      const item=views.value[source.side].entries.find(i=>i.key===source.key);if(!canDrag(item))return;
      const targetIndex=Number.isInteger(index)&&!query.value.trim()?grids.value[side].page*INVENTORY_PAGE_SIZE+index:undefined;
      if(source.side===side){
        if(targetIndex===undefined)return;
        const state=containers.value[side],result=moveInventoryStack(state.bagLayout,entries.value[side],source.key,targetIndex);
        if(result.error)notify(result.error,true);else state.bagLayout=result.layout;
        return;
      }
      selectItem(source.side,item);transfer(targetIndex);
    }
    function closePanel(){endDrag();inspector.close();panel.value='';nextTick(()=>stage.value?.focus({preventScroll:true}));}
    function interact(id){scene?.interact(id);}
    function goBattle(){document.querySelector('#tabs [data-tab=battle]')?.click();}
    const keydown=e=>{if(!active||!panel.value)return;if(['ControlLeft','ControlRight'].includes(e.code)&&inspector.key&&!e.repeat){e.preventDefault();inspector.pin();return;}if(e.code==='Escape'){e.preventDefault();if(inspector.key){inspector.closeHover();return;}closePanel();}};window.addEventListener('keydown',keydown);
    function start(){if(!active||!store.library||!store.catalog)return;ensureStarted(store.catalog,store.collections,store.library);ensureHideout(player);nextTick(()=>{if(!active||!stage.value)return;if(!scene)scene=new HideoutScene(stage.value,{onInteract:id=>{panel.value=id;selectedKey.value='';selectedSide.value='bag';query.value='';},onHud:value=>{sceneHud.value=value;}});scene.show().catch(error=>notify(`藏身处场景加载失败：${error.message}`,true));stage.value.focus({preventScroll:true});});}
    watch(()=>store.version,()=>{if(active)start();});
    api={show(){active=true;start();},hide(){active=false;endDrag();inspector.close();panel.value='';scene?.hide();},get position(){const p=scene?.world.avatar.position;return p?{x:p.x,z:p.z}:null;}};
    onBeforeUnmount(()=>{active=false;scene?.dispose();window.removeEventListener('keydown',keydown);});
    return{stage,panel,query,pages,selectedKey,selectedSide,amount,sceneHud,dragSide,dragOverSide,store,player,isMerchant,storageSide,grids,counts,selected,inspector,inspected,inspectorPosition,canTransfer,sideName,canDrag,selectItem,inspectItem,setEquip,identifiedItem,transfer,startDrag,dragOver,dragLeave,dropItem,endDrag,closePanel,interact,goBattle,iconSrc,isInventoryNew};
  }});app.mount(el);return{show:()=>api.show(),hide:()=>api.hide(),get position(){return api.position;},dispose:()=>app.unmount()};
}

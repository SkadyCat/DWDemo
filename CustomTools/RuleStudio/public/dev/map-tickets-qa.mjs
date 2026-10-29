import { createApp, computed, ref } from '/vendor/vue.esm-browser.prod.js';
import { reloadStore, store } from '/editors.mjs';
import { player, ensureStarted } from '/player.mjs';
import { inventoryEntries } from '/battle-panels.mjs';
import { AtlasMap } from '/atlas-map.mjs';
import { AtlasSession, ATLAS_STORAGE_KEY } from '/atlas-session.mjs';
import { createAtlas, enterAtlasNode, completeAtlasNode } from '/atlas-state.mjs';
import { travelAtlas } from '/atlas-travel.mjs';
import { TowerRun } from '/sim/dungeon-battle.mjs';
import { buyOutpostOffer, outpostMerchantView } from '/outpost-merchant-model.mjs';
import { iconSrc } from '/game-icons.mjs';

if(location.hostname!=='127.0.0.1'||location.port!=='5348')throw Error('Isolated loopback fixture only');
await reloadStore();ensureStarted(store.catalog,store.collections,store.library);
// Explicit local fixture: the origin is already cleared, all following travel,
// ticket ownership, authored sockets and shop transactions use production code.
const data=new Map([[ATLAS_STORAGE_KEY,JSON.stringify(completeAtlasNode(enterAtlasNode(createAtlas(41),'0:0')))]]);
const session=new AtlasSession({getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)});
player.stones=200;player.owned.item={};player.mapDeviceSlots={};player.bagLayout=null;
createApp({components:{AtlasMap},setup(){
 const state=ref(session.state),message=ref('尚未进入地图');
 const items=computed(()=>inventoryEntries(player,store.collections).map(item=>({...item,tier:store.collections.item?.get(item.id)?.doc?.tier||0,iconSrc:iconSrc(item.kind,item)})));
 const sync=()=>state.value=session.state;
 function buy(){
  const options={worldSeed:41},view=outpostMerchantView(player,store.collections,store.library,store.catalog,options),offer=view.offers.find(o=>o.id==='map_t02_common');
  const result=buyOutpostOffer(player,store.collections,store.library,store.catalog,offer.key,options);message.value=result.error||'已购买 T2 地图';
 }
 function travel(id){try{
  travelAtlas(session,player,store.collections,id,prepared=>{
   const run=new TowerRun(store.files,{...prepared.options,regionId:prepared.id,collections:store.collections,monsterCount:20,monsterTypes:[...store.monsters.values()].map(e=>e.doc)});
   return run.battle;
  });sync();message.value=`已进入 ${id}，实际战斗 T${session.battle.floor}`;
 }catch(error){message.value=error.message;}}
 return {state,items,player,buy,travel,message,select(id){session.select(id);sync();}};
},template:`<div class="b3" style="height:100vh"><div id="qa-toolbar" style="position:fixed;left:5px;top:0;z-index:30010;background:#142d32;padding:8px;display:flex;gap:14px;font-size:13px"><b>本地地图票验证 · 预置起点通关</b><button @click="buy">商人购买 T2 地图（40灵石）</button><output>灵石 {{player.stones}} · T2票 {{player.owned.item.map_t02_common||0}} · {{message}}</output></div><AtlasMap :state="state" :current-node-id="state.currentNodeId" :active-node-id="state.activeNodeId" :device-items="items" :device-slots="player.mapDeviceSlots" @device-change="player.mapDeviceSlots=$event" @challenge="travel" @select="select" /></div>`}).mount('#battle-root');

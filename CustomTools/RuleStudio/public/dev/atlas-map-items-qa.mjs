// Isolated fixture: production atlas and inventory projection, using real map
// documents from the catalogue. These fixture counts never touch a player save.
import { createApp, ref } from '/vendor/vue.esm-browser.prod.js';
import { reloadStore, store } from '/editors.mjs';
import { AtlasMap } from '/atlas-map.mjs';
import { createAtlas, completeAtlasNode, enterAtlasNode, selectAtlasNode } from '/atlas-state.mjs';
import { inventoryEntries } from '/battle-panels.mjs';
import { iconSrc } from '/game-icons.mjs';
if(location.hostname!=='127.0.0.1'||location.port!=='5293')throw Error('Isolated loopback fixture only');
await reloadStore();
const maps=[...store.collections.item.values()].map(v=>v.doc).filter(doc=>doc.category==='map').sort((a,b)=>a.tier-b.tier||a.id.localeCompare(b.id)).slice(0,18);
const fixture={owned:{equipment:{},skill:{},item:Object.fromEntries(maps.map(doc=>[doc.id,1]))},instances:{},loadout:{equipment:{},skills:[],belt:[]}};
const entries=inventoryEntries(fixture,store.collections).map(item=>({...item,tier:store.collections.item.get(item.id).doc.tier,iconSrc:iconSrc(item.kind,item)}));
createApp({components:{AtlasMap},setup(){
  const state=ref(completeAtlasNode(enterAtlasNode(createAtlas(41),'0:0'))),slots=ref({map:entries[0].key});
  return{state,slots,entries,select(id){state.value=selectAtlasNode(state.value,id);}};
},template:`<div class="b3" style="height:100vh"><output id="qa-note">本地地图物品验证 · 18 种真实地图文档 · 测试数量不写入存档</output><AtlasMap :state="state" :current-node-id="state.currentNodeId" :device-items="entries" :device-slots="slots" @device-change="slots=$event" @select="select" /></div>`}).mount('#battle-root');

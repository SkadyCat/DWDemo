import { ref, nextTick, onMounted, onBeforeUnmount, watch } from '/vendor/vue.esm-browser.prod.js';
import { UIRuntime } from '/uicreator/runtime/runtime.js';
import { MapDeviceController } from '/uicreator/runtime/map-device.js';
import { buildMapDeviceItems } from '/uicreator/assets/rulestudio-hud/map-device.js';
import { store } from '/editors.mjs';
import { player } from '/player.mjs';
import { affixText, traitText } from '/affix-text.mjs';

export const BattleMapDevice = {
  props:{items:{type:Array,default:()=>[]},slots:{type:Object,default:()=>({})}},emits:['change','close'],
  setup(props,{emit}){
    const scene=ref(null),backpack=ref(null),collection=ref(null),bagTarget=ref(null),error=ref('');let runtime,bagRuntime,itemsRuntime,controller,disposed=false,generation=0;
    const icons=new Map(),requests=new AbortController();
    async function items(){return Promise.all(props.items.map(async item=>{
      const detail=item.instance?player.instances[item.id]:store.collections[item.kind]?.get(item.id)?.doc;
      const inspection={baseLines:(detail?.bases||[]).map(a=>affixText(a,store.library)),fixedLines:detail?.legendary?[affixText(detail.legendary,store.library)]:[],traitLines:item.instance?[]:(detail?.traits||[]).map(t=>traitText(t,store.library)),affixes:(detail?.affixes||item.affixes||[]).map(a=>typeof a==='string'?a:{text:affixText(a,store.library),tier:a.tier})};
      if(!item.iconSrc || !new URL(item.iconSrc,location.href).pathname.includes('/assets/icons/'))return {...item,inspection,iconSrc:''};
      if(!icons.has(item.iconSrc))icons.set(item.iconSrc,fetch(item.iconSrc,{signal:requests.signal}).then(async response=>response.ok?URL.createObjectURL(await response.blob()):'').catch(()=>''));
      return {...item,inspection,iconSrc:await icons.get(item.iconSrc)};
    }));}
    async function update(){const id=++generation,entries=await items();if(!disposed&&id===generation)controller?.update(entries,props.slots);}
    onMounted(async()=>{
      try{
        bagTarget.value=scene.value.closest('.b3-window-atlas');await nextTick();
        const response=await fetch('/ui/map-device.uialpha.json');if(!response.ok)throw Error('地图装置界面尚未发布');
        const project=await response.json();if(disposed)return;
        // Existing PWA clients may briefly retain the previous authored document.
        project.prefabs['battle-prefab-map-device-items'] ||= {id:'battle-prefab-map-device-items',width:256,height:128,root:buildMapDeviceItems()};
        runtime=new UIRuntime(scene.value,project,{prefabId:'battle-prefab-map-device-slots',sound:false});
        bagRuntime=new UIRuntime(backpack.value,project,{prefabId:'battle-prefab-map-device-backpack',sound:false});
        itemsRuntime=new UIRuntime(collection.value,project,{prefabId:'battle-prefab-map-device-items',sound:false});
        controller=new MapDeviceController(runtime,{peers:[bagRuntime,itemsRuntime],slots:props.slots,onChange:slots=>emit('change',slots)});
        bagRuntime.addEventListener('activate',e=>{if(e.detail.node.action?.op==='back')emit('close');});
        await update();
      }catch(e){error.value=e.message;}
    });
    watch(()=>[props.items,props.slots],()=>{if(controller)void update();},{deep:true});
    onBeforeUnmount(()=>{disposed=true;requests.abort();controller?.destroy();runtime?.destroy();bagRuntime?.destroy();itemsRuntime?.destroy();for(const value of icons.values())value.then(url=>{if(url)URL.revokeObjectURL(url);});});
    return {scene,backpack,collection,bagTarget,error};
  },
  template:`<div><div class="map-device-view atlas-device-slots" aria-label="区域详情地图装配" @pointerdown.stop @contextmenu.prevent><svg ref="scene" xmlns="http://www.w3.org/2000/svg" aria-label="中央地图与外圈五个地图物品槽"></svg></div><slot></slot><section class="map-device-view atlas-map-items" aria-label="全部地图物品" @pointerdown.stop @wheel.stop @contextmenu.prevent><svg ref="collection" xmlns="http://www.w3.org/2000/svg" aria-label="持有的全部地图与地图物品"></svg></section><p v-if="error" role="alert">{{error}}</p></div><teleport v-if="bagTarget" :to="bagTarget"><aside class="map-device-view atlas-external-bag" aria-label="星图右侧背包" @pointerdown.stop @wheel.stop @contextmenu.prevent><svg ref="backpack" xmlns="http://www.w3.org/2000/svg" aria-label="背包"></svg></aside></teleport>`
};

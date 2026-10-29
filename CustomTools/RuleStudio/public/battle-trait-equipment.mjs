import {ref,onMounted,onBeforeUnmount,nextTick} from '/vendor/vue.esm-browser.prod.js';
import {UIRuntime} from '/uicreator/runtime/runtime.js';
import {traitEquipmentRow} from '/uicreator/assets/rulestudio-hud/trait-equipment.js';
import {TRAIT_EQUIPMENT} from '/trait-equipment.mjs';

// All visible controls are authored in the saved UICreator document.
export const BattleTraitEquipment={
  emits:['close','drop'],
  setup(props,{emit}){
    const scene=ref(null),error=ref('');let ui,disposed=false;
    const request=new AbortController();
    function trap(event){
      const buttons=[...scene.value.querySelectorAll('[role="button"][tabindex="0"]')];
      if(!buttons.length){event.preventDefault();scene.value.focus();return;}
      const index=buttons.indexOf(document.activeElement);
      if(event.shiftKey&&index<=0){event.preventDefault();buttons.at(-1).focus();}
      else if(!event.shiftKey&&(index<0||index===buttons.length-1)){event.preventDefault();buttons[0].focus();}
    }
    onMounted(async()=>{
      try{
        const response=await fetch('/ui/trait-equipment.uialpha.json',{signal:request.signal});
        if(!response.ok)throw Error('特质装备界面加载失败');
        const project=await response.json();if(disposed)return;
        ui=new UIRuntime(scene.value,project,{sound:false,motion:false});
        ui.setChildren('equipment-list',TRAIT_EQUIPMENT.map((entry,index)=>traitEquipmentRow(project,entry,index)));
        ui.addEventListener('activate',event=>{
          const action=event.detail.node.action;
          if(action?.type!=='studio-equipment')return;
          if(action.op==='close')emit('close');
          else if(action.op==='drop')emit('drop',action.value);
        });
        await nextTick();if(!disposed)scene.value.querySelector('[data-node-id="trait-equipment-0-row"]')?.focus({preventScroll:true});
      }catch(cause){if(!disposed){error.value=cause.message;scene.value?.focus();}}
    });
    onBeforeUnmount(()=>{disposed=true;request.abort();ui?.destroy();});
    return{scene,error,trap};
  },
  template:`<teleport to="body"><div class="b3-trait-equipment-layer" @pointerdown.stop @pointermove.stop @wheel.stop @keydown.esc.prevent.stop="$emit('close')" @keydown.tab="trap"><section role="dialog" aria-modal="true" aria-label="特质装备" class="b3-trait-equipment-dialog"><svg ref="scene" xmlns="http://www.w3.org/2000/svg" tabindex="0" aria-label="特质装备列表"></svg><p v-if="error" role="alert">{{error}}</p></section></div></teleport>`,
};

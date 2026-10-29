import {ref,onMounted,onBeforeUnmount,watch} from '/vendor/vue.esm-browser.prod.js';
import {UIRuntime} from '/uicreator/runtime/runtime.js';
export const BattleExitPortal={
  props:['info'],emits:['activate','release'],
  setup(props,{emit}){
    const host=ref(null);let ui,disposed=false;
    const update=()=>{
      if(!ui)return;
      const mode=props.info.approaching?'travel':props.info.near?'ready':'normal';
      ui.setMany(ui.project.presentation.portalStates[mode]);
    };
    onMounted(async()=>{
      try{const r=await fetch('/ui/dungeon-exit.uialpha.json');if(!r.ok)throw Error('传送阵 UICreator 资产未加载');const project=await r.json();if(disposed)return;
        ui=new UIRuntime(host.value,project,{sound:false,motion:true});ui.addEventListener('activate',()=>emit('activate'));update();
      }catch(error){console.error(error);}
    });
    watch(()=>[props.info.near,props.info.approaching],update);
    onBeforeUnmount(()=>{disposed=true;ui?.destroy();});
    return{host};
  },
  template:`<div v-show="info.visible" class="b3-exit-portal" :style="{left:Math.round(info.x)+'px',top:Math.round(info.y)+'px'}" @pointerenter="$emit('release')" @pointerdown.stop @pointermove.stop @click.stop><svg ref="host" xmlns="http://www.w3.org/2000/svg" aria-label="地牢出口传送阵"></svg></div>`
};

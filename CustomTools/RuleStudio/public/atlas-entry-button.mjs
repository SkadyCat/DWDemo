import {ref,onMounted,onBeforeUnmount,watch} from '/vendor/vue.esm-browser.prod.js';
import {UIRuntime} from '/uicreator/runtime/runtime.js';
import {atlasEntryDocument} from '/uicreator/assets/rulestudio-hud/atlas-entry.js';

// The semantic HTML button supplies input; UICreator owns every visible state.
export const AtlasEntryButton={
 props:{enabled:Boolean,active:Boolean,label:String},emits:['activate'],
 setup(props){
  const scene=ref(null),interaction=ref('normal');let ui;
  function paint(){if(!ui)return;ui.set('atlas-entry',{interactable:props.enabled,motion:{enabled:props.enabled&&props.active}});ui.set('atlas-entry-label',{text:props.label,style:{color:props.enabled?'#e7edf9':'#8795a8'}});ui.states.set('atlas-entry',props.enabled?interaction.value:'disabled');ui.paint();}
  function state(value){interaction.value=value;paint();}
  onMounted(()=>{
   ui=new UIRuntime(scene.value,structuredClone(atlasEntryDocument),{sound:false});
   // The outer HTML button is the sole keyboard target; this SVG is decorative.
   ui.addEventListener('paint',()=>ui.renderer.groups.get('atlas-entry')?.group.removeAttribute('tabindex'));
   paint();
  });
  watch(()=>[props.enabled,props.active,props.label],paint);onBeforeUnmount(()=>ui?.destroy());
  return{scene,state};
 },
 template:`<button class="atlas-enter" type="button" :disabled="!enabled" :aria-label="label" :data-active="enabled&&active" @click="$emit('activate')" @pointerenter="state('hovered')" @pointerleave="state('normal')" @pointerdown="state('pressed')" @pointerup="state('hovered')" @pointercancel="state('normal')" @focus="state('hovered')" @blur="state('normal')" @keydown.enter="state('pressed')" @keydown.space="state('pressed')" @keyup="state('hovered')"><svg ref="scene" aria-hidden="true" focusable="false"></svg></button>`,
};

import {ref,watch,onMounted,onBeforeUnmount,nextTick} from '/vendor/vue.esm-browser.prod.js';
import {UIRuntime} from '/uicreator/runtime/runtime.js';
import {questTrackerView} from './tracker-view.mjs';
const KEY='rulestudio.quest-tracker.collapsed.v1';
export const QuestTracker={
 props:['quest','floor','phase','wave','wavesCompleted','completionMode','visitedRooms','totalRooms'],emits:['open','release'],
 setup(props,{emit}){
  const scene=ref(null),collapsed=ref(false),error=ref('');let runtime,project,disposed=false,mode='';
  try{collapsed.value=localStorage.getItem(KEY)==='true';}catch{}
  const node=id=>runtime?.nodes.get(id)||[...(runtime?.nodes.values()||[])].find(n=>n.binding===id);
  function aria(){const g=runtime?.renderer.groups.get(node('quest-toggle')?.id)?.group;if(g){g.setAttribute('aria-expanded',String(!collapsed.value&&!!props.quest));g.setAttribute('aria-label',collapsed.value||!props.quest?'展开任务追踪':'收起任务追踪');}}
  function update(){if(!project||disposed)return;const view=questTrackerView(props),compact=collapsed.value||view.empty,newMode=compact?'compact':'full';
   if(mode!==newMode){runtime?.destroy();runtime=new UIRuntime(scene.value,project,{prefabId:compact?'quest-collapsed':null,sound:false,motion:false});mode=newMode;runtime.addEventListener('paint',aria);runtime.addEventListener('activate',async e=>{emit('release');if(e.detail.node.action?.op==='toggle'){if(!props.quest)return emit('open');collapsed.value=!collapsed.value;try{localStorage.setItem(KEY,String(collapsed.value));}catch{}update();await nextTick();runtime.renderer.groups.get(node('quest-toggle')?.id)?.group.focus();}else emit('open');});}
   const updates=[];const set=(id,patch)=>{const n=node(id);if(n)updates.push([n.id,patch]);};const label=(id,text,color)=>set(id,{text,...(color?{style:{color}}:{})});
   label('quest-heading',compact?view.title:'任务追踪');label('quest-state',view.stage,view.reward?'#ecd086':'#93a3b0');label('quest-title-label',view.title);label('quest-objective',view.objective);label('quest-waves',view.waveLabel);label('quest-wave-count',view.countLabel||`${view.waves} / 3`);label('quest-wave-mark',view.waves===3?'✓':'○',view.waves===3?'#98cfb8':'#a59a7f');label('quest-boss-mark',view.bossDone?'✓':'○',view.bossDone?'#98cfb8':'#a59a7f');label('quest-boss-state',view.bossDone?'已完成':'未完成',view.bossDone?'#98cfb8':'#8e9eac');label('quest-hint',view.hint,view.reward?'#e4c783':'#92a1ae');label('quest-details-label',view.reward?'领取  J':'详情  J');
   for(let i=0;i<3;i++)set('quest-step-'+i,{style:{fill:i<view.waves?'#cdb67ed9':'#b7a16a33'}});
   runtime.setMany(updates);aria();
  }
  onMounted(async()=>{try{const response=await fetch('/ui/quest-tracker.uialpha.json');if(!response.ok)throw Error('任务追踪界面尚未发布');project=await response.json();update();}catch(e){error.value=e.message;}});
  watch(()=>[props.quest?.id,props.quest?.name,props.quest?.stage,props.floor,props.phase,props.wavesCompleted,props.completionMode,props.visitedRooms,props.totalRooms],update);
  onBeforeUnmount(()=>{disposed=true;runtime?.destroy();});
  function key(e){if(e.code==='KeyJ'){e.preventDefault();emit('open');}}
  return{scene,error,collapsed,key};
 },
 template:`<section class="b3-quest-tracker b3-quest-tracker-ui" aria-label="左侧任务追踪" @pointerenter="$emit('release')" @pointerdown.stop @pointermove.stop @wheel.stop @keydown.stop="key"><svg ref="scene" xmlns="http://www.w3.org/2000/svg" aria-label="任务追踪，支持收起和展开"></svg><p v-if="error" role="alert">{{error}}</p></section>`
};

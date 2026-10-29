import {createNode,walk} from '../../core/model.js';

// Authored UICreator states, shared by the saved project and Studio runtime.
export function updateMerchantLauncher(project){
  const prefab=project.prefabs['merchant-launcher'];
  if(!prefab)throw Error('缺少拓荒商人交互预制体');
  const before=JSON.stringify([prefab,project.assets]);
  const colors={normal:['#1b2b36','#101b25','#536575'],hovered:['#30404a','#182630','#cdb17a'],pressed:['#15232d','#101820','#ad8b52'],disabled:['#19222a','#111820','#374550']};
  for(const [state,[top,bottom,edge]]of Object.entries(colors)){
    const id=`merchant-tag-${state}`;
    project.assets[id]={id,name:`商人气泡 · ${state}`,viewBox:[0,0,226,60],scaleMode:'stretch',
      source:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 226 60"><defs><linearGradient id="body" x2="0" y2="1"><stop stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs><rect x=".75" y=".75" width="224.5" height="58.5" rx="9" fill="url(#body)" stroke="${edge}" stroke-width="1.5"/><rect x="2.5" y="2.5" width="221" height="55" rx="7.5" fill="none" stroke="#fff" stroke-opacity="${state==='hovered'?'.08':'.035'}"/></svg>`};
  }
  walk(prefab.root,node=>{
    if(node.type!=='Button')node.locked=true;
    if(node.id==='merchant-open'){
      node.name='打开拓荒商人商店';node.motion={preset:'none',assetId:''};
      node.style={...node.style,fill:'transparent',stroke:'transparent',strokeWidth:0,radius:9};
      node.brushes=Object.fromEntries(Object.keys(colors).map(state=>[state,`merchant-tag-${state}`]));
    }
    if(node.id==='merchant-tag-title'){node.style.fontWeight=600;node.slot.offsets.right=178;}
    if(node.id==='merchant-tag-note'){node.text='点击查看地图与装备';node.style.color='#a0b1bc';node.slot.offsets.right=178;}
    if(node.id==='merchant-open-content'&&!node.children.some(c=>c.id==='merchant-tag-arrow'))node.children.push(createNode('TextBlock',{
      id:'merchant-tag-arrow',text:'›',locked:true,slot:{offsets:{left:195,top:18,right:20,bottom:24}},style:{color:'#cdb17a',fontSize:24,textAlign:'center',wrap:false}}));
  });
  return before!==JSON.stringify([prefab,project.assets]);
}

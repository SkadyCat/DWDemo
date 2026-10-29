import {createDocument,createNode,walk} from '../../core/model.js';

const node=(type,id,x,y,w,h,props={})=>createNode(type,{id,name:id,slot:{offsets:{left:x,top:y,right:w,bottom:h}},layout:{width:w,height:h},...props});
const text=(id,value,x,y,w,h,color='#bac9da',size=13)=>node('TextBlock',id,x,y,w,h,{text:value,locked:true,style:{color,fontSize:size,wrap:false,textPadding:0}});
const canvas=(id,w,h,children)=>node('CanvasPanel',id,0,0,w,h,{children});
const border=(id,x,y,w,h,fill,stroke,radius)=>node('Border',id,x,y,w,h,{locked:true,style:{fill,stroke,strokeWidth:1,radius}});

// The same authored row prefab is cloned by the Studio controller for catalogue data.
export function traitEquipmentRow(project,entry,index=0) {
  const row=structuredClone(project.prefabs['trait-equipment-row'].root);
  walk(row,n=>{
    const role=n.binding;n.id=`trait-equipment-${index}-${n.id}`;
    if(role==='entry:name')n.text=entry.name;
    if(role==='entry:quality')n.text=`T${entry.tier} · 魔法 · 法杖`;
    if(role==='entry:skill')n.text=entry.skillName||'冰锥术';
    if(role==='entry:affix')n.text=entry.affixName||'消耗冰缓 → 冰霜爆破';
    if(role==='entry:description')n.text=entry.description;
  });
  row.name=`掉落${entry.name}`;row.action={type:'studio-equipment',op:'drop',value:entry.id};
  row.slot.offsets.top=0;
  return row;
}

export function createTraitEquipmentDocument(iconSrc='') {
  const project=createDocument('Studio · 特质装备');project.id='studio-trait-equipment';
  project.motions={};
  project.viewport={width:640,height:350,background:'transparent'};
  const rowBody=canvas('row-content',592,136,[
    border('row-accent',0,0,4,136,'#80aee8','#80aee8',2),
    border('icon-frame',20,25,76,76,'#18283d','#405b7d',12),
    node('Image','staff-icon',25,30,66,66,{src:iconSrc,locked:true,style:{objectFit:'contain'}}),
    {...text('entry-name','霜爆法杖',114,16,310,27,'#a9cdff',20),binding:'entry:name'},
    {...text('entry-quality','T1 · 魔法 · 法杖',114,44,300,22,'#7c91ac',12),binding:'entry:quality'},
    {...text('entry-skill','冰锥术',114,73,295,23,'#d9e8f5',14),binding:'entry:skill'},
    {...text('entry-affix','消耗冰缓 → 冰霜爆破',114,98,350,24,'#9ddde8',13),binding:'entry:affix'},
    border('drop-pill',470,45,100,38,'#23354b','#4b6382',8),
    text('drop-label','点击掉落',478,45,84,38,'#d9e5f4',13),
  ]);
  const row=node('Button','row',0,0,592,136,{name:'掉落霜爆法杖',style:{fill:'#141e2b',stroke:'#34475e',strokeWidth:1,radius:12},motion:{preset:'subtle'},action:{type:'studio-equipment',op:'drop',value:'frostburst_staff'},children:[rowBody]});
  // A preview row stays editable in UICreator; gameplay supplies the live list.
  project.prefabs['trait-equipment-row']={id:'trait-equipment-row',name:'特质装备 · 列表项',width:592,height:136,root:row};
  const close=node('Button','close',584,14,36,34,{name:'关闭特质装备',text:'',style:{fill:'#192331',stroke:'#46546a',strokeWidth:1,radius:7},action:{type:'studio-equipment',op:'close'},children:[text('close-label','×',0,0,36,34,'#bdcadd',22)]});
  close.children[0].style.textAlign='center';
  project.root=canvas('trait-equipment-root',640,350,[
    border('window-background',0,0,640,350,'#0f1722','#59616b',14),
    border('header',1,1,638,62,'#20282f','transparent',13),
    text('title','特质装备',24,14,450,34,'#edcf97',20),close,
    text('description','点击装备，将其丢到角色脚边。',24,77,592,27,'#91a5bd',13),
    node('ScrollBox','equipment-list',24,118,592,148,{layout:{orientation:'vertical',gap:12},style:{clip:true},children:[traitEquipmentRow(project,{id:'frostburst_staff',name:'霜爆法杖',tier:1})]}),
    text('footer','地面拾取后，在背包中装配。',24,300,592,28,'#70859e',12),
  ]);
  return project;
}

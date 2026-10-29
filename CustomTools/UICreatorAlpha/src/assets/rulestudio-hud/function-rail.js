import { walk } from '../../core/model.js';

const find=(root,id)=>{let result;walk(root,n=>{if(n.id===id)result=n;});return result;};
const size=(node,w,h)=>{Object.assign(node.layout,{width:w,height:h});Object.assign(node.slot.offsets,{right:w,bottom:h});};
export function installFunctionRail(document){
 const prefab=document.prefabs['rs-prefab-rail'],rail=prefab.root;
 const bd=find(rail,'rs-function-bd');if(!bd)throw Error('Missing authored BD rail button');
 let talents=find(rail,'rs-function-talents');if(!talents){talents=structuredClone(bd);talents.id='rs-function-talents';rail.children.push(talents);}
 document.assets['rs-svg-icon-talents']={...structuredClone(document.assets['rs-svg-icon-bd']),id:'rs-svg-icon-talents',name:'天赋星盘',source:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g fill="none" stroke="#d5b775" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z"/><circle cx="12" cy="12" r="2.3"/></g></svg>'};
 for(const [item,label,name,action] of [[bd,'BD','可用 BD · 流派列表',{type:'battle-ui',op:'navigate',value:'builds'}],[talents,'天赋','天赋星盘 · P',{type:'battle-ui',op:'talents'}]]){
  item.name=name;const o=item.overrides;
  o['rs-function-button']={...o['rs-function-button'],name,action,binding:item===bd?'function-bd':'function-talents'};
  const icon='rs-function-button/rs-function-content/rs-function-icon',key='rs-function-button/rs-function-content/rs-function-key';
  o[icon]={...o[icon],...(item===talents?{svgAsset:'rs-svg-icon-talents'}:{}),slot:{offsets:{left:9,top:2,right:18,bottom:18}}};
  o[key]={...o[key],text:label,slot:{offsets:{left:1,top:21,right:34,bottom:12}},style:{fontSize:9,lineHeight:12,textPadding:0,fontWeight:600,color:'#e3cb95',textAlign:'center',wrap:false}};
 }
 const order=['inventory','character','skills','equipment','belt','bd','talents','hunter','map','lineage','settings','shop','craft','restart'];
 const buttons=order.map(id=>find(rail,'rs-function-'+id));if(buttons.some(n=>!n))throw Error('Missing existing function rail entry');
 const extra=rail.children.filter(n=>n.id.startsWith('rs-function-')&&!buttons.includes(n));buttons.push(...extra);
 buttons.forEach((n,i)=>n.slot.offsets.top=6+i*41+(i>=2?8:0)+(i>=7?8:0)+(i>=11?8:0));
 rail.children=[...rail.children.filter(n=>!buttons.includes(n)),...buttons];
 const height=buttons.at(-1).slot.offsets.top+34+6;
 size(rail,48,height);size(find(rail,'rs-rail-bg'),48,height);prefab.height=height;prefab.name=`战斗功能栏 · ${buttons.length} 个入口`;
 size(find(document.prefabs['hud-prefab-screen'].root,'rs-rail-instance'),48,height);
 document.presentation.functionRail={version:1,entries:order,builds:'builds',talents:'talents',labels:['BD','天赋']};
 return document;
}

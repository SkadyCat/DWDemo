import fs from 'node:fs/promises';
import {isDeepStrictEqual} from 'node:util';
import {updateMerchantLauncher} from '../../UICreatorAlpha/src/assets/rulestudio-hud/merchant-launcher.js';
import {updateMerchantSelection} from '../../UICreatorAlpha/src/assets/rulestudio-hud/merchant-selection.js';
import {updateMerchantPurchaseMenu} from '../../UICreatorAlpha/src/assets/rulestudio-hud/merchant-purchase-menu.js';
import {createDocument,createNode,validateDocument,walk} from '../../UICreatorAlpha/src/core/model.js';
import {itemTooltipTemplate,ITEM_TOOLTIP_ID} from '../../UICreatorAlpha/src/assets/rulestudio-hud/item-tooltip.js';

const id='opus-outpost-merchant',url=`http://127.0.0.1:5190/api/projects/${id}`;
const previous=await fetch(url);let project,revision=0;
if(previous.ok){const record=await previous.json();revision=record.revision;project=record.document||record.project||record;}
else{
  if(previous.status!==404)throw Error(`UICreator: ${previous.status}`);
  const slot=(left,top,right,bottom)=>({offsets:{left,top,right,bottom}});
  const text=(id,text,x,y,w,h,size=13,color='#b7c8d6')=>createNode('TextBlock',{id,text,slot:slot(x,y,w,h),style:{fontSize:size,color,wrap:true}});
  const canvas=(id,w,h,children)=>createNode('CanvasPanel',{id,layout:{width:w,height:h},children});
  const button=(id,name,x,y,w,h,action,children)=>createNode('Button',{id,name,slot:slot(x,y,w,h),style:{fill:'#12212cf5',stroke:'#455767',strokeWidth:1,radius:7},action,children:[canvas(id+'-content',w,h,children)]});
  project=createDocument('Studio3D · 拓荒商人');project.id=id;project.viewport={width:920,height:552,background:'transparent'};project.motions={};
  const children=[text('shop-intro','常备地图',20,10,400,28,17,'#e3c88b'),text('shop-wallet','灵石 0',668,12,230,28,16,'#91dbc4')];
  for(let i=0;i<9;i++){
    const map=i<3,col=map?i:(i-3)%3,row=map?0:Math.floor((i-3)/3),x=20+col*296,y=map?54:240+row*122,w=280,h=106;
    children.push(button('stock-'+i,i<3?`购买 ${i+1} 级地图`:`购买特殊装备 ${i-2}`,x,y,w,h,{type:'ui',op:'buy',value:i},[
      createNode('CanvasPanel',{id:`stock-${i}-icon`,slot:slot(12,15,62,62)}),
      text(`stock-${i}-name`,map?`地图 T${i+1}`:'特殊装备',86,12,184,42,13,map?'#cbd5df':'#e5b87c'),
      text(`stock-${i}-meta`,map?'无限供应':'传奇 · T1',86,52,184,22,11,'#8195a7'),
      text(`stock-${i}-buy`,map?`${20*(i+1)} 灵石 · 购买`:'灵石 · 购买',86,77,184,23,12,'#95d9c2')
    ]));
  }
  children.push(text('shop-unlimited','1–3 级地图 · 数量无限',20,167,470,26,12,'#8da7ac'),text('shop-special-title','特殊装备',20,202,320,28,17,'#e3c88b'),text('shop-refresh','下次刷新 30:00',610,204,290,26,13,'#9caebb'),text('shop-message','悬停查看物品 · 点击商品购买',20,493,870,40,12,'#8ea4b7'));
  project.root=canvas('merchant-shop',920,552,children);
  project.prefabs['merchant-launcher']={id:'merchant-launcher',name:'拓荒商人 · 交互标签',width:230,height:64,root:canvas('merchant-tag',230,64,[button('merchant-open','拓荒商人 · 打开商店',2,2,226,60,{type:'ui',op:'open'},[text('merchant-tag-title','◈  拓荒商人',12,8,202,24,15,'#efd29b'),text('merchant-tag-note','地图补给 · 特殊装备',12,34,202,20,10,'#b3ad9b')])])};
  project.prefabs[ITEM_TOOLTIP_ID]={...itemTooltipTemplate(),folderId:''};
  const reference=JSON.parse(await fs.readFile(new URL('../public/ui/map-events.uialpha.json',import.meta.url),'utf8'));
  walk(project.prefabs[ITEM_TOOLTIP_ID].root,node=>{
    for(const key of [node.svgAsset,...Object.values(node.brushes||{})])if(key&&reference.assets[key])project.assets[key]={...reference.assets[key],folderId:''};
    if(node.svgAsset&&!project.assets[node.svgAsset])node.svgAsset='';
    if(node.brushes)node.brushes=Object.fromEntries(Object.entries(node.brushes).map(([state,key])=>[state,project.assets[key]?key:'']));
  });
  const errors=validateDocument(project);if(errors.length)throw Error(errors.join('\n'));
  const saved=await fetch(url,{method:'PUT',headers:{'Content-Type':'application/json','If-Match':'"0"'},body:JSON.stringify(project)});if(!saved.ok)throw Error(await saved.text());
  revision=(await saved.json()).revision;
}
let migrated=updateMerchantLauncher(project);
migrated=updateMerchantSelection(project)||migrated;
migrated=updateMerchantPurchaseMenu(project)||migrated;
walk(project.root,node=>{if(node.type==='Image'&&/^stock-\d+-icon$/.test(node.id)){node.type='CanvasPanel';node.children=[];migrated=true;}});
if(migrated){const saved=await fetch(url,{method:'PUT',headers:{'Content-Type':'application/json','If-Match':`"${revision}"`},body:JSON.stringify(project)});if(!saved.ok)throw Error(await saved.text());revision=(await saved.json()).revision;}
const checkResponse=await fetch(url);if(!checkResponse.ok)throw Error('无法回读已保存的商人 UI');
const checked=await checkResponse.json();if(checked.revision!==revision||!isDeepStrictEqual(checked.document,project))throw Error(`商人 UI 保存回读不一致：${revision} / ${checked.revision}`);
const sourceFolder=new URL('../../UICreatorAlpha/Screen/StudioOutpostMerchant/',import.meta.url);await fs.mkdir(sourceFolder,{recursive:true});
await fs.writeFile(new URL('outpost-merchant.uialpha.json',sourceFolder),JSON.stringify(project,null,2));
await fs.writeFile(new URL('../public/ui/outpost-merchant.uialpha.json',import.meta.url),JSON.stringify(project,null,2));
console.log(JSON.stringify({project:id,validated:validateDocument(project)}));

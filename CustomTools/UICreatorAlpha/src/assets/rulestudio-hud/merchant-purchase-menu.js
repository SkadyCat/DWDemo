import {createNode} from '../../core/model.js';
import {CONTEXT_MENU_COLORS,contextMenuColor,contextMenuMix,contextMenuFrame,CONTEXT_MENU_ACTIONS,CONTEXT_MENU_STONE} from './context-menu-style.js';

export const MERCHANT_PURCHASE_MENU='merchant-purchase-menu';
const slot=(left,top,right,bottom)=>({offsets:{left,top,right,bottom}});

// Same item header, quality frame and action geometry as the inventory context menu.
export function updateMerchantPurchaseMenu(project){
 const before=JSON.stringify([project.prefabs[MERCHANT_PURCHASE_MENU],project.assets,project.presentation]);
 const width=240,height=108;
 const asset=(id,w,h,body)=>{project.assets[id]={id,name:id,viewBox:[0,0,w,h],scaleMode:'stretch',source:`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none" stroke="none">${body}</svg>`};};
 for(const quality of Object.keys(CONTEXT_MENU_COLORS))asset('merchant-purchase-frame-'+quality,width,height,contextMenuFrame(quality,height));
 delete project.assets['merchant-purchase-frame'];
 for(const [state,[fill,stroke]]of Object.entries(CONTEXT_MENU_ACTIONS))asset('merchant-purchase-'+state,228,36,`<rect x=".5" y=".5" width="227" height="35" rx="5" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`);
 asset('merchant-purchase-stone',14,14,CONTEXT_MENU_STONE);
 asset('merchant-purchase-cart',24,24,'<g fill="none" stroke="#8495ad" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h2l2 11h12l2-8H6M9 18h9"/><circle cx="9" cy="21" r="1"/><circle cx="18" cy="21" r="1"/></g>');
 const node=(type,id,x,y,w,h,more={})=>createNode(type,{id,slot:slot(x,y,w,h),layout:{width:w,height:h},...more});
 const text=(id,value,x,y,w,h,size=12,color='#d4deed',more={})=>node('TextBlock',id,x,y,w,h,{text:value,locked:true,style:{fontSize:size,color,wrap:false,textOverflow:'ellipsis',...more}});
 project.prefabs[MERCHANT_PURCHASE_MENU]={id:MERCHANT_PURCHASE_MENU,name:'商人 · 物品右键购买菜单',width,height,root:node('CanvasPanel','merchant-purchase-root',0,0,width,height,{children:[
  node('Image','merchant-purchase-background',0,0,width,height,{locked:true,svgAsset:'merchant-purchase-frame-common'}),
  node('Border','merchant-purchase-icon-frame',12,11,36,36,{locked:true,style:{fill:'#080e17',stroke:contextMenuMix(contextMenuColor('common'),'#263247',.55),strokeWidth:1,radius:5}}),
  node('CanvasPanel','merchant-purchase-item-icon',14,13,32,32,{locked:true}),
  text('merchant-purchase-item-name','物品名称',58,11,168,19,12,contextMenuColor('common'),{fontWeight:600}),
  text('merchant-purchase-item-meta','普通 · T1',58,32,168,16,10,'#8e9cb0'),
  node('Button','merchant-purchase-buy',6,63,228,36,{name:'购买',motion:{preset:'none',assetId:''},style:{fill:'transparent',stroke:'transparent',strokeWidth:0,radius:5},brushes:Object.fromEntries(Object.keys(CONTEXT_MENU_ACTIONS).map(state=>[state,'merchant-purchase-'+state])),action:{type:'ui',op:'purchase-confirm'},children:[node('CanvasPanel','merchant-purchase-content',0,0,228,36,{children:[
   node('Image','merchant-purchase-action-icon',9,10,16,16,{locked:true,svgAsset:'merchant-purchase-cart'}),
   text('merchant-purchase-label','购买',34,0,86,36),
   node('Border','merchant-purchase-price-box',149,8,70,20,{locked:true,style:{fill:'#3ddc970a',stroke:'#65c6a51c',strokeWidth:1,radius:4}}),
   node('Image','merchant-purchase-stone-icon',156,14,9,9,{locked:true,svgAsset:'merchant-purchase-stone'}),
   text('merchant-purchase-price','−20',168,8,26,20,11,'#a1ecd0',{fontWeight:600,fontFamily:'Consolas, monospace',textOverflow:'shrink'}),
   text('merchant-purchase-currency','灵石',194,8,22,20,10,'#85b4a3')
  ]})]})
 ]})};
 project.presentation={...project.presentation,merchantInput:{primary:'select',secondary:'purchase-menu',confirm:'purchase-confirm'},merchantPurchaseMenu:{prefabId:MERCHANT_PURCHASE_MENU,style:'inventory-item-context',textLayoutVersion:2,textSafeRects:[{id:'merchant-purchase-item-name',x:58,y:11,width:168,height:19,fontSize:12,maxChars:14,overflow:'ellipsis'},{id:'merchant-purchase-label',x:40,y:63,width:86,height:36,fontSize:12,maxChars:5,overflow:'ellipsis'},{id:'merchant-purchase-price',x:174,y:71,width:26,height:20,fontSize:11,maxChars:4,overflow:'shrink'}]}};
 return before!==JSON.stringify([project.prefabs[MERCHANT_PURCHASE_MENU],project.assets,project.presentation]);
}

import {qualityBrushes} from './equipment-style.js';

// Instantiate the actual inventory prefab, including its icon mask, labels and four skins.
// Live views supply item data; the saved UICreator prefab remains the visual owner.
export function equipmentCell(project,id,item,x,y,size=60,action=null){
 const prefab=project.prefabs['battle-prefab-item-cell'];
 if(!prefab)throw Error('Missing shared inventory item-cell prefab');
 const root=structuredClone(prefab.root),ratio=size/prefab.width;
 const visit=n=>{
  const sourceId=n.id;n.id=id+'-'+sourceId;
  for(const key of ['left','top','right','bottom'])n.slot.offsets[key]*=ratio;
  for(const key of ['width','height'])if(typeof n.layout[key]==='number')n.layout[key]*=ratio;
  if(sourceId==='battle-cell-icon'){
   n.type='Image';n.src=item?.iconSrc||'';n.svgAsset='';n.visibility=item?'visible':'collapsed';
   n.slot.offsets={left:3,top:3,right:size-6,bottom:size-6};n.layout.width=n.layout.height=size-6;
  }
  if(sourceId==='battle-cell-tier'){n.text=item?.tier?'T'+item.tier:'';n.visibility=n.text?'visible':'collapsed';n.style.textBackgroundFit=true;n.style.wrap=false;}
  if(sourceId==='battle-cell-mark'){n.text=item?.mark||'';n.visibility=n.text?'visible':'collapsed';n.slot.offsets.top=size-17;n.slot.offsets.right=size-6;}
  if(sourceId==='battle-cell-count'){n.text=item?.count>1?String(item.count):'';n.visibility=n.text?'visible':'collapsed';}
  if(n.motion?.assetId==='motion-edge-orbit')n.motion.enabled=!!item?.isNew;
  for(const child of n.children||[])visit(child);
 };
 visit(root);root.id=id;root.slot.offsets={left:x,top:y,right:size,bottom:size};root.layout.width=root.layout.height=size;
 root.name=item?.name||'空装备格';root.binding=id;root.action=action;root.interactable=!!item;
 root.brushes=qualityBrushes('cell',item?.rarity||'empty');
 root.source={...root.source,reusedPrefab:'battle-prefab-item-cell',itemKey:item?.uid||''};
 return root;
}

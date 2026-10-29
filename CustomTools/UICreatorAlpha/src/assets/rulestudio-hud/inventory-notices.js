import { createNode, walk } from '../../core/model.js';
import { createEdgeMotionAsset } from '../../core/motion.js';
import { qualityColor } from './equipment-style.js';

export function installInventoryNotices(document) {
  const asset=createEdgeMotionAsset();document.motions ||= {};document.motions[asset.id] ||= asset;
  const prefab=document.prefabs['battle-prefab-item-cell'];
  if(!prefab)throw Error('物品格预制体缺失');
  const content=prefab.root.children.find(n=>n.id==='battle-cell-content');if(!content)throw Error('物品格内容层缺失');
  if(!content.children.some(n=>n.binding==='row:new'))content.children.push(createNode('CanvasPanel',{
    id:'battle-cell-new-edge',name:'新获得 · 边缘流光',binding:'row:new',locked:true,interactable:false,
    slot:{anchors:{minX:0,minY:0,maxX:1,maxY:1},offsets:{left:0,top:0,right:0,bottom:0},zOrder:90},
    layout:{width:52,height:52},motion:{preset:'auto',assetId:asset.id,enabled:false,dismissOnHover:true,tint:qualityColor('common')},
  }));
  // Rarity and the unread switch are instance data; the shared frame is never replaced.
  for(const template of Object.values(document.prefabs))walk(template.root,node=>{
    if(node.prefabId!=='battle-prefab-item-cell')return;
    const root=node.overrides?.['battle-cell'],brush=root?.brushes?.normal||'';
    const rarity=brush.match(/(?:equipment-cell|item)-(common|normal|magic|rare|legendary|unique)-/)?.[1]||'common';
    node.overrides ||= {};const path='battle-cell/battle-cell-content/battle-cell-new-edge';
    node.overrides[path] ||= {motion:{enabled:false,tint:qualityColor(rarity)}};
  });
  document.presentation={...document.presentation,inventoryNotices:{version:1,binding:'row:new',motion:asset.id,source:'ownership increases; hover consumes; UI state only'}};
  return document;
}

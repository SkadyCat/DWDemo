import { walk } from '../../core/model.js';
import { canvas, text, line } from './suite-kit.js';
import { itemGrid } from './suite-pages.js';
import { GEAR, BAG_ITEMS } from './suite-data.js';

export const SPLIT_BAG = { width: 962, height: 474, ordinaryWidth: 650, equipmentX: 662, gridX: 680, gridY: 144, cell: 64, gap: 28 };
export function equippedBagGrid(prefix, items) {
  return itemGrid(prefix, GEAR.map(([slot]) => items.find(item => item.kind === 'equipment' && item.equipped && item.slot === slot)), 3, 64, 28, 3, 'select-item');
}
export function installInventoryCompartments(document) {
  if (document.presentation?.inventoryCompartments?.version === 1) return document;
  const prefab = document.prefabs['battle-prefab-inventory'];
  if (!prefab) throw Error('Missing inventory prefab');
  const root = prefab.root, q = SPLIT_BAG;
  const resize = (n,w,h) => { n.layout.width=w;n.layout.height=h;n.slot.offsets.right=w;n.slot.offsets.bottom=h; };
  for (const child of root.children) {
    if (child.id === 'battle-inventory-frame' || child.id === 'battle-inventory-overlay') resize(child,q.width,q.height);
    else if (child.id === 'battle-inventory-head') resize(child,q.width-2,46);
    else if (child.id === 'battle-inventory-close') child.slot.offsets.left=q.width-40;
    else if (child.id === 'battle-inventory-title') resize(child,q.width-242,31);
    else if (child.id === 'battle-bag-wallet-gem') child.slot.offsets.left=q.width-218;
    else if (child.id === 'battle-bag-wallet') child.slot.offsets.left=q.width-194;
    else child.slot.offsets.top += 26;
  }
  const bag = root.children.find(n=>n.binding==='bag-grid');
  bag.children=itemGrid('battle-bag-item',BAG_ITEMS.filter(i=>i.kind!=='equipment'||!i.equipped),12,{width:580/12,height:292/6},4,6,'select-item');
  const equipped = canvas('battle-equipped-bag-grid',248,248,equippedBagGrid('battle-equipped-bag',BAG_ITEMS),{
    binding:'equipped-bag-grid',source:{grid:{columns:3,rows:3}},slot:{offsets:{left:q.gridX,top:q.gridY,right:248,bottom:248}},
  });
  root.children.push(text('battle-ordinary-bag-title','普通背包',12,56,400,24,{fontSize:13,color:'#e2cb9b',fontWeight:600}),
    line('battle-bag-separator',650,58,1,400),
    text('battle-equipped-bag-title','装备背包',q.equipmentX,56,180,24,{fontSize:13,color:'#e2cb9b',fontWeight:600}),
    text('battle-equipped-bag-count','4 / 9',850,56,94,24,{fontSize:11,color:'#92d8cf',textAlign:'right'},{binding:'equipped-bag-count'}),
    text('battle-equipped-bag-caption','当前穿戴 · 卸下后返回普通背包',q.equipmentX,86,282,24,{fontSize:10,color:'#8fa2b8'}),equipped,
    text('battle-equipped-bag-help','右键操作 · 拖至槽位装备\n拖回普通背包卸下',q.equipmentX,416,280,36,{fontSize:10,color:'#8fa2b8',wrap:true}));
  GEAR.forEach(([,name],i)=>root.children.push(text('battle-equipped-slot-label-'+i,name,q.gridX+i%3*92,124+Math.floor(i/3)*92,64,18,{fontSize:10,color:'#8fa2b8',textAlign:'center'})));
  resize(root,q.width,q.height);prefab.width=q.width;prefab.height=q.height;prefab.name='普通背包与装备背包';
  for(const container of [document.root,...Object.values(document.prefabs).map(p=>p.root)])walk(container,n=>{if(n.prefabId===prefab.id)resize(n,q.width,q.height);});
  const page=document.interfaceCatalog?.find(p=>p.id==='inventory');if(page){page.name=prefab.name;page.width=q.width;page.height=q.height;}
  document.presentation={...document.presentation,inventoryCompartments:{version:1,ordinary:'bag-grid',equipped:'equipped-bag-grid',rule:'equipped gear moves out of ordinary inventory; unequip returns it'}};
  return document;
}

import { colors, art, node, text, graphic, canvas, ui, button, scroll, windowPanel, assetRecord } from './suite-kit.js';
import { qualityBrushes } from './equipment-style.js';
import { MAP_ATLAS as ATLAS, buildEngravedAtlasPage, engravedAtlasSources } from './atlas-engraved.js';
import {installAtlasEntry} from './atlas-entry.js';

export const MAP_DEVICE = { width: ATLAS.width + 404, height: ATLAS.height, columns: 7, rows: 5, cell: 46, gap: 6, bag: { x: ATLAS.width+12, y: ATLAS.height-410, width: 392, height: 410 }, sockets: { width:256, height:264 } };
// Five sockets form a pentagon around the larger map socket. Coordinates belong to UICreator.
export const MAP_DEVICE_SLOTS = [
  { id: 'map', x: 100, y: 100, size: 56, label: '地图', role: 'map' },
  { id: 'modifier-0', x: 106, y: 12, size: 44, label: '地图物品', role: 'modifier' },
  { id: 'modifier-1', x: 192, y: 77, size: 44, label: '地图物品', role: 'modifier' },
  { id: 'modifier-2', x: 158, y: 180, size: 44, label: '地图物品', role: 'modifier' },
  { id: 'modifier-3', x: 54, y: 180, size: 44, label: '地图物品', role: 'modifier' },
  { id: 'modifier-4', x: 20, y: 77, size: 44, label: '地图物品', role: 'modifier' },
];
const label = (id, value, x, y, w, h, style = {}, props = {}) => text(id, value, x, y, w, h, { fontSize: 11, color: colors.muted, ...style }, props);

export function mapDeviceSources() {
  const wrap = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${body}</svg>`;
  const ring = wrap(680, 510, '<defs><radialGradient id="device-halo"><stop stop-color="#477a80" stop-opacity=".12"/><stop offset=".62" stop-color="#477a80" stop-opacity=".035"/><stop offset="1" stop-color="#477a80" stop-opacity="0"/></radialGradient></defs><ellipse cx="340" cy="255" rx="318" ry="248" fill="url(#device-halo)"/><g fill="none" stroke="#a18b60"><circle cx="340" cy="255" r="191" opacity=".24"/><circle cx="340" cy="255" r="178" opacity=".08"/><circle cx="340" cy="255" r="78" opacity=".22"/><path d="M340 64V177m182 19-108 35m38 178-66-91m-159 91 66-91M158 196l108 35" opacity=".17"/><path d="M326 55h28m-28 400h28M140 241v28m400-28v28" opacity=".38"/></g><g fill="#b69b69" opacity=".55"><path d="m340 91 3 5-3 5-3-5z"/><path d="m493 207 3 5-3 5-3-5z"/><path d="m435 387 3 5-3 5-3-5z"/><path d="m245 387 3 5-3 5-3-5z"/><path d="m187 207 3 5-3 5-3-5z"/></g>');
  const glyph = wrap(96, 96, '<g fill="none" stroke="#b4a079" stroke-linecap="round" stroke-linejoin="round"><path d="m16 24 21-8 22 8 21-8v56l-21 8-22-8-21 8z" stroke-width="2"/><path d="M37 16v56m22-48v56" opacity=".6"/><path d="m43 47 8-7 10 9-7 7-11-9z" stroke-width="1.5"/><circle cx="51" cy="48" r="2"/></g>');
  const plus = wrap(48, 48, '<path d="M24 15v18m-9-9h18" stroke="#75838e" stroke-width="1.5" stroke-linecap="round"/><circle cx="24" cy="24" r="20" fill="none" stroke="#596573" stroke-opacity=".22"/>');
  return Object.fromEntries([['map-device-ring',ring,680,510],['map-device-glyph',glyph,96,96],['map-device-plus',plus,48,48]].map(([name, source, w, h]) => [art(name), { ...assetRecord(art(name), name, source, 'stretch'), viewBox: [0,0,w,h] }]));
}

export function mapDeviceCell(id, item, x, y, size = 50, binding = 'map-device-item') {
  const icon = item?.iconSrc ? node('Image', `${id}-icon`, 4, 4, size-8, size-8, { src: item.iconSrc, locked: true }) : graphic(`${id}-icon`, item?.svgAsset || art('map-device-glyph'), 6, 6, size-12, size-12);
  return button(id, item?.name || '空格', x, y, size, size, item ? ui('map-device-item', item.key || item.id) : null, {
    binding, brushes: qualityBrushes('cell', item?.rarity || 'empty'),
    source: { itemKey: item?.key || item?.id || '' }, children: item ? [icon,
      ...(item.tier ? [label(`${id}-tier`, `T${item.tier}`, 2, 0, 30, 14, { fontSize: 9, color: '#e7d5ae', fill: '#0a1018cf', radius: 3, textBackgroundFit:true, wrap:false })] : []),
      ...(item.count > 1 ? [label(`${id}-count`, String(item.count), size-29, size-15, 25, 13, { fontSize: 9, color: colors.text, textAlign: 'right', fill: '#0a1018cf', radius: 3, textBackgroundFit:true, wrap:false })] : []),
      ...(item.reserved ? [label(`${id}-reserved`, '已装入', 2, size-13, 34, 12, {fontSize:8,color:'#91ddc9',fill:'#0a1018df',textBackgroundFit:true,wrap:false})] : [])
    ] : [], style: { fill: 'transparent', radius: 9 }
  });
}

export function emptyDeviceSocket(slot, prefix='map-device-empty') {
  const s=slot.size, icon=slot.role==='map'?34:24;
  return [graphic(`${prefix}-${slot.id}`,art(slot.role==='map'?'map-device-glyph':'map-device-plus'),(s-icon)/2,5,icon,icon),label(`${prefix}-label-${slot.id}`,slot.label,0,s-18,s,16,{fontSize:slot.role==='map'?9:8,textAlign:'center',color:slot.role==='map'?'#c8b68e':'#75838e'})];
}
export function buildMapDeviceSlots() {
  return canvas('map-device-sockets',256,264,[
    graphic('map-device-ring',art('map-device-ring'),5,6,246,230),
    ...MAP_DEVICE_SLOTS.map(slot=>button(`map-device-slot-${slot.id}`,slot.label,slot.x,slot.y,slot.size,slot.size,ui('map-device-slot',slot.id),{
      binding:`map-device-slot:${slot.id}`,brushes:qualityBrushes('cell','empty'),source:{role:slot.role},children:[canvas(`map-device-content-${slot.id}`,slot.size,slot.size,emptyDeviceSocket(slot),{binding:`map-device-content:${slot.id}`})]
    })),
    label('map-device-selection','尚未放入地图',0,236,256,22,{fontSize:10,textAlign:'center',color:colors.gold},{binding:'map-device-selection'})
  ],{source:{mapDevice:{version:2,mapSlots:1,modifierSlots:5,consumeOnPlace:false,effects:'deferred'}}});
}
export function buildMapDeviceBackpack() {
  const grid={columns:7,rows:5,cell:46,pitch:52};
  return windowPanel('map-device-backpack','背包',392,410,[
    label('map-device-bag-count','0 项',276,11,62,22,{textAlign:'right'},{binding:'map-device-bag-count'}),
    ...[['all','全部'],['map','地图'],['modifier','地图物品']].map(([id,name],i)=>button(`map-device-filter-${id}`,name,16+i*122,54,116,28,ui('map-device-filter',id),{binding:`map-device-filter:${id}`})),
    canvas('map-device-bag',358,254,Array.from({length:35},(_,i)=>mapDeviceCell(`map-device-bag-${i}`,null,i%7*52,Math.floor(i/7)*52,46)),{binding:'map-device-bag',source:{grid},slot:{offsets:{left:16,top:96,right:358,bottom:254}}}),
    label('map-device-bag-empty','背包里还没有可用物品',27,196,338,42,{fontSize:11,textAlign:'center',fill:'#101722ed',radius:6},{binding:'map-device-bag-empty'}),
    button('map-device-page-prev','‹',16,366,28,27,ui('map-device-page',-1)),
    label('map-device-page','1 / 1',50,366,292,27,{textAlign:'center'},{binding:'map-device-page'}),
    button('map-device-page-next','›',348,366,28,27,ui('map-device-page',1)),
    label('map-device-feedback','地图 T 级决定层级 · 进入时消耗 1 张',16,396,360,11,{fontSize:8,textAlign:'center'},{binding:'map-device-feedback'})
  ],{headerHeight:42});
}
export function buildMapDeviceItems() {
  const grid={columns:5,rows:2,cell:44,pitch:50};
  return canvas('map-device-items',256,128,[
    label('map-device-items-title','地图物品',0,0,170,20,{color:colors.text}),
    label('map-device-items-count','0 种',174,0,78,20,{textAlign:'right'},{binding:'map-device-items-count'}),
    scroll('map-device-items-scroll',0,24,256,94,[canvas('map-device-library',250,94,
      Array.from({length:10},(_,i)=>mapDeviceCell(`map-device-library-${i}`,null,i%5*50,Math.floor(i/5)*50,44,'map-device-library-item')),
      {binding:'map-device-library',source:{grid}})],0),
    label('map-device-items-empty','暂无地图物品',0,57,250,26,{textAlign:'center',fill:'#101722ed'},{binding:'map-device-items-empty'})
  ],{name:'区域详情 · 全部地图物品',source:{mapItems:{scope:'owned maps and modifiers, including reserved items',scroll:true}}});
}
export function buildMapDevicePage() {
  const main=buildEngravedAtlasPage();
  const sockets=buildMapDeviceSlots();sockets.slot.offsets.left=852;sockets.slot.offsets.top=124;main.children.push(sockets);
  const items=buildMapDeviceItems();items.slot.offsets.left=852;items.slot.offsets.top=478;main.children.push(items);
  const bag=buildMapDeviceBackpack();bag.slot.offsets.left=MAP_DEVICE.bag.x;bag.slot.offsets.top=MAP_DEVICE.bag.y;
  const prefix=n=>{n.id=`map-device-preview-${n.id}`;for(const child of n.children||[])prefix(child);};prefix(main);prefix(bag);
  return canvas('battle-map-device',MAP_DEVICE.width,MAP_DEVICE.height,[main,bag],{name:'异界星图 · 区域详情装配 / 右侧背包',source:{backdrop:'#03070d73',mapDevice:{version:3,mapSlots:1,modifierSlots:5,consumeOnPlace:false,effects:'deferred',layout:'atlas-details-and-external-backpack',reference:'RuleStudio/atlas-map.mjs'}}});
}

export function installMapDevice(document) {
  installAtlasEntry(document);
  Object.assign(document.assets, mapDeviceSources(), engravedAtlasSources());
  document.prefabs['battle-prefab-map-device'] = { id:'battle-prefab-map-device', name:'地图装置 · 地图 / 五个地图物品 / 背包', width:MAP_DEVICE.width, height:MAP_DEVICE.height, folderId:'battle-pages', root:buildMapDevicePage() };
  document.prefabs['battle-prefab-map-device-slots']={id:'battle-prefab-map-device-slots',name:'区域详情 · 六槽装配',width:256,height:264,folderId:'battle-parts',root:buildMapDeviceSlots()};
  document.prefabs['battle-prefab-map-device-backpack']={id:'battle-prefab-map-device-backpack',name:'星图外侧 · 背包',width:392,height:410,folderId:'battle-parts',root:buildMapDeviceBackpack()};
  document.prefabs['battle-prefab-map-device-items']={id:'battle-prefab-map-device-items',name:'区域详情 · 全部地图物品',width:256,height:128,folderId:'battle-parts',root:buildMapDeviceItems()};
  document.interfaceCatalog ||= [];
  if (!document.interfaceCatalog.some(v=>v.id==='map-device')) document.interfaceCatalog.push({id:'map-device',title:'星图 · 区域详情装配 / 右侧背包',prefabId:'battle-prefab-map-device',group:'探索与结算',source:'map-device.js'});
  const page=document.interfaceCatalog.find(v=>v.id==='map-device');page.title='星图 · 区域详情装配 / 右侧背包';
  return document;
}

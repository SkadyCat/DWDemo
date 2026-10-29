import fs from 'node:fs/promises';
import {createDocument,createNode,validateDocument} from '../../UICreatorAlpha/src/core/model.js';
import {equipmentSources,qualityBrushes} from '../../UICreatorAlpha/src/assets/rulestudio-hud/equipment-style.js';
import {mapDeviceSources} from '../../UICreatorAlpha/src/assets/rulestudio-hud/map-device.js';
import {ProjectRepository} from '../../UICreatorAlpha/server/project-repository.mjs';
import {equipmentCell} from '../../UICreatorAlpha/src/assets/rulestudio-hud/equipment-cell.js';
const d=createDocument('Studio3D · 祭坛与奇遇');d.id='opus-studio3d-map-events';d.viewport={width:1280,height:660,background:'transparent'};d.root.id='encounters';
const repo=new ProjectRepository(new URL('../../UICreatorAlpha/data/projects',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
const inventory=await repo.read('hud-darksteel-20261024');
d.prefabs['battle-prefab-item-cell']=structuredClone(inventory.document.prefabs['battle-prefab-item-cell']);
delete d.prefabs['battle-prefab-item-cell'].folderId;
Object.assign(d.motions,inventory.document.motions);
for(const motion of Object.values(d.motions))delete motion.folderId;
const definitions=JSON.parse(await fs.readFile(new URL('../../../Content/MapEvents/events.json',import.meta.url),'utf8')).definitions;
d.root.source={altarCurrencies:definitions.find(e=>e.kind==='altar').currencies};
for(const [key,a]of Object.entries(equipmentSources())) d.assets['battle-svg-'+key]={id:'battle-svg-'+key,name:key,source:a.source,viewBox:[0,0,a.width,a.height],scaleMode:a.scaleMode,slice:{top:9,right:9,bottom:9,left:9}};
Object.assign(d.assets,mapDeviceSources());
for(const asset of Object.values(d.assets))delete asset.folderId;
function n(type,id,x,y,w,h,p={}){return createNode(type,{id,name:id,binding:id,slot:{offsets:{left:x,top:y,right:w,bottom:h}},layout:{width:w,height:h},...p});}
const t=(id,x,y,w,h,text,size=13,color='#9baab8')=>n('TextBlock',id,x,y,w,h,{text,style:{fontSize:size,color,wrap:true}});
const c=(id,x,y,w,h,children=[])=>n('CanvasPanel',id,x,y,w,h,{children});
const b=(id,x,y,w,h,label,op,value='',brush='row')=>n('Button',id,x,y,w,h,{name:label||id,brushes:qualityBrushes(brush,'rare'),action:{type:'ui',op,value},children:[c(id+'-content',0,0,w,h,[t(id+'-label',8,0,w-16,h,label,13,'#e2cca1')])]});
const p=n('Border','event-panel',640,0,640,660,{style:{fill:'#0b1119f0',stroke:'#78613d',strokeWidth:1,radius:10},children:[c('event-content',0,0,640,660)]});const ui=p.children[0].children;
ui.push(t('event-title',28,16,530,32,'万相合成祭坛',22,'#e6c487'),t('event-description',28,52,584,28,'将两件同部位装备放入上方格子。',12),b('event-close',582,16,30,30,'×','close'));
for(let i=0;i<2;i++){
 const x=196+i*172;
 ui.push(n('Border','input-frame-'+i,x-5,104,86,86,{style:{fill:'transparent',stroke:'#2c3b4b',strokeWidth:1,radius:9}}));
 ui.push(t('side-title-'+i,x-42,80,160,20,i?'右件 · 贡献词条':'左件 · 保留底材',12,i?'#8bbccf':'#cfb47b'));
 const cell=b('input-'+i,x,109,76,76,'＋','slot',i,'cell');cell.name=i?'右件装备投入格':'左件装备投入格';cell.brushes=qualityBrushes('cell','empty');cell.children[0].binding='slot-content-'+i;ui.push(cell);
 const name=t('item-name-'+i,x-74,198,224,34,'未放入装备',12,'#d7c5a0');name.style.textAlign='center';ui.push(name);
 ui.push(t('item-meta-'+i,x-64,230,204,20,'',10),n('ScrollBox','affixes-'+i,0,0,400,150,{visibility:'collapsed',children:[]}));
}
ui.push(t('join-symbol',299,122,34,46,'⟡',26,'#d5b779'));
ui.push(t('event-status',28,255,584,32,'从左侧背包放入两件装备',12,'#92cbbd'));
const target=b('event-affix-target',28,296,208,24,'选择洗炼词条','next-affix');target.visibility='collapsed';ui.push(target);
const bagPanel=n('Border','event-backpack',0,76,620,330,{style:{fill:'#0b1119f0',stroke:'#304155',strokeWidth:1,radius:8},children:[c('event-backpack-content',0,0,620,330)]});
const bagUI=bagPanel.children[0].children;
bagUI.push(t('bag-title',16,12,360,22,'装备背包',13,'#c4cfdc'),t('bag-meta',384,12,220,22,'',10));
const bag=c('event-bag',16,46,576,196);bag.source={grid:{columns:8,rows:3,cell:60,pitchX:72,pitchY:68},reusedPrefab:'battle-prefab-item-cell'};
bag.children=Array.from({length:24},(_,i)=>equipmentCell(d,'authored-bag-'+i,null,i%8*72,Math.floor(i/8)*68));bagUI.push(bag);
bagUI.push(b('bag-prev',16,258,30,26,'‹','page',-1),t('bag-page',56,258,72,26,'1 / 1',11),b('bag-next',132,258,30,26,'›','page',1),b('event-samples',180,258,248,26,'补充两件原型测试装备','samples'),t('bag-drag-help',16,298,576,18,'拖拽装备到右侧放入格 · 未锁定时可拖回背包',11));
ui.push(b('event-secondary',254,582,142,40,'祭坛辅助操作','secondary'),b('event-primary',410,582,198,40,'确认祭坛操作','primary'),t('event-warning',32,632,576,20,'固定传奇也参与抽取；悬停装备查看词条。',10,'#9b8b70'));
for(const label of ui.filter(n=>n.id.startsWith('side-title-')||n.id.startsWith('item-meta-')||n.id.startsWith('item-name-'))){label.style.textAlign='center';label.style.wrap=false;label.style.textOverflow='shrink';}
d.root.children.push(bagPanel,p);
// All encounter actions live in the authored right-column card.
const launcher=n('Border','event-launcher',0,0,206,224,{style:{fill:'#0b1119e8',stroke:'#78613d',strokeWidth:1,radius:8},children:[c('event-launcher-content',0,0,206,224,[t('launcher-title',12,10,182,24,'祭坛与奇遇',13,'#dfc58e'),...['合成祭坛','百炼法坛','遗珍神龛 · 传奇三选一','封印宝库 · 稀有三选一'].map((name,i)=>b('launch-'+i,12,44+i*44,182,36,name,'open',['fusion','altar','choice','vault'][i]))])]});
d.prefabs['event-launcher']={id:'event-launcher',name:'Studio3D 右侧祭坛入口',width:206,height:224,root:launcher};
const errors=validateDocument(d);if(errors.length)throw Error(errors.join('\n'));
await fs.writeFile(new URL('../public/ui/map-events.uialpha.json',import.meta.url),JSON.stringify(d,null,2));
const old=await repo.pointer(d.id);await repo.write(d,old?.revision||0);
console.log(JSON.stringify({project:d.id,errors,slots:2,webOnly:true}));

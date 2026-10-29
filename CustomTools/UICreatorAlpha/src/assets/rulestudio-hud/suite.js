import { walk } from '../../core/model.js';
import { art, assetRecord, canvas, fill, instance, button, ui } from './suite-kit.js';
import { SUITE, buildSuitePrefabs } from './suite-pages.js';
import { battleSuiteSources } from './suite-art.js';
import { installEquipmentStyle } from './equipment-style.js';
import { installMapDevice } from './map-device.js';

const sources = {
 character:'battle-character-panel.mjs', inventory:'battle3d.mjs', loadout:'battle3d.mjs', belt:'battle3d.mjs', settings:'battle3d.mjs', hunter:'battle-loot-hunter.mjs', item:'battle-item-panel.mjs', unidentified:'battle-item-panel.mjs', context:'battle-equipment-menu.mjs', split:'battle-stack-split.mjs', 'skill-detail':'battle-skill-tooltip.mjs', affix:'battle-item-panel.mjs', material:'battle-item-panel.mjs', 'affix-book':'battle-affix-book.mjs', 'bd-detail':'battle3d.mjs', completion:'battle-completion.mjs', 'completion-empty':'battle-completion.mjs', death:'battle3d.mjs', timeout:'battle3d.mjs', atlas:'atlas-map.mjs', shop:'shop.mjs', pricing:'shop.mjs', craft:'craft.mjs', loot:'battle3d.mjs'
};
export function installBattleSuite(document) {
 for(const [id,name,kind,parentId] of [['battle-art','3D 战斗界面','svg',''],['battle-art-icons','装备 / 通货 / 技能','svg','battle-art'],['battle-art-skins','窗口 / 控件状态','svg','battle-art'],['battle-ui','3D 战斗界面','prefab',''],['battle-pages','独立界面','prefab','battle-ui'],['battle-parts','共享控件','prefab','battle-ui']]) document.folders[id]={id,name,kind,parentId};
 for(const [name,source] of Object.entries(battleSuiteSources())){
  const frame=/^(window|card|(button|field|cell|close|item|atlas-node)-)/.test(name);
  document.assets[art(name)]=assetRecord(art(name),name,source,frame?'nine-slice':['atlas-terrain','region'].includes(name)?'stretch':'contain',96,frame?'battle-art-skins':'battle-art-icons');
 }
 for(const [id,icon]of [['rs-svg-poison','poison'],['rs-svg-frost','ice'],['rs-svg-sentinel','sentinel']])if(document.assets[id])document.assets[id].source=document.assets[art(icon)].source;
 const pages=buildSuitePrefabs(document);
 for(const id of ['rs-prefab-picker','rs-prefab-skill-choice'])walk(document.prefabs[id].root,n=>{if(n.type==='TextBlock')n.style.textPaddingX=3;});
 // Existing prefab IDs remain usable by older saved instances; their content is now shared.
 for(const key of ['inventory','character','loadout','hunter','settings','shop','craft','completion','death','tooltip']){
  const replacement=document.prefabs[SUITE[key==='tooltip'?'skill-detail':key]],id=`rs-prefab-${key}`;
  document.prefabs[id]={...replacement,id,root:canvas(`battle-compat-${key}`,replacement.width,replacement.height,[fill(instance(`battle-compat-ref-${key}`,replacement.id,0,0,replacement.width,replacement.height))])};
 }
 walk(document.prefabs['hud-prefab-screen'].root,n=>{
  if(n.binding==='modal-layer')n.children=[n.children[0],fill(canvas('battle-modal-host',1600,900,[],{binding:'suite-modal-host',locked:true}))];
 });
 const left=document.prefabs['hud-prefab-screen'].root.children.find(n=>n.id==='rs-top-left');
 if(left&&!left.children.some(n=>n.id==='battle-hud-atlas'))left.children.splice(2,0,button('battle-hud-atlas','✧  异界星图                    M',0,0,236,34,ui('navigate','atlas')));
 document.interfaceCatalog=[{id:'normal',title:'战斗 HUD',prefabId:'hud-prefab-screen',group:'战斗',source:'battle3d.mjs'}, {id:'boss',title:'首领阶段',prefabId:'hud-prefab-screen',group:'战斗',source:'battle3d.mjs'}, {id:'skills',title:'技能装配',prefabId:'rs-prefab-picker',group:'战斗',source:'battle3d.mjs'}, ...pages.map(p=>({...p,group:['shop','pricing','craft'].includes(p.id)?'成长':['item','unidentified','context','split','skill-detail','affix','material','affix-book'].includes(p.id)?'详情与操作':['completion','completion-empty','death','timeout','atlas','loot'].includes(p.id)?'探索与结算':'角色与配置',source:sources[p.id]|| (p.id==='summons'?'battle-summon-units.mjs':'battle3d.mjs')}))];
 document.presentation={...document.presentation,version:3,suiteVersion:1};
 document.provenance={...document.provenance,note:'按 RuleStudio 3D 战斗组件拆分的 SVG 界面与共享预制体。使用隔离预览数据；未连接战斗引擎。装备与地形图形为原生矢量重绘。'};
 return installMapDevice(installEquipmentStyle(document));
}

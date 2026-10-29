import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readRuleFiles} from '../scripts/rule-files.mjs';
import {checkRuleSet,createProgression,progressionLoadout} from '../engine/index.mjs';
import {registerEquipmentDropLibrary} from '../public/equipment-generation.mjs';
import {generateDungeon} from '../public/sim/dungeon.mjs';
import {DungeonBattle} from '../public/sim/dungeon-battle.mjs';
import {MERCHANT_REFRESH_MS,outpostMerchantLocation,outpostMerchantView,buyOutpostOffer} from '../public/outpost-merchant-model.mjs';
import {validateDocument} from '../../UICreatorAlpha/src/core/model.js';

const files=readRuleFiles(),check=checkRuleSet(files);assert.ok(check.ok,check.error);
const {collections,library,catalog}=check;registerEquipmentDropLibrary(files,library,check.affixCategories);
const fresh=()=>({...createProgression(collections,library),stones:100000});
const options={worldSeed:41,now:MERCHANT_REFRESH_MS*100+12345};
const view=p=>outpostMerchantView(p,collections,library,catalog,options);
const buy=(p,key,opts=options)=>buyOutpostOffer(p,collections,library,catalog,key,opts);

test('商人：只在第一张地图入口房间出现，500种布局均有安全放置位置',()=>{
 for(let seed=0;seed<500;seed++){
  const map=generateDungeon(seed),npc=outpostMerchantLocation(map,'0:0'),at=map.tileOf(npc.x,npc.y);
  assert.equal(map.roomTile(at.x,at.y),map.entryRoom);assert.ok(map.sweep(npc.x,npc.y,npc.x,npc.y,190)<0);
  assert.ok(Math.hypot(npc.x-map.entry.x,npc.y-map.entry.y)>=300);assert.equal(outpostMerchantLocation(map,'1:0'),null);
 }
 const opts={collections,monsterTypes:[...check.monsters.values()].map(row=>row.doc),seed:41};
 assert.ok(new DungeonBattle(files,{...opts,regionId:'0:0'}).outpostMerchant);
 assert.equal(new DungeonBattle(files,{...opts,regionId:'1:0'}).outpostMerchant,null);
});

test('商人：T1–T3地图无限供应，重复购买扣真实灵石并进入真实背包',()=>{
 const p=fresh(),before=progressionLoadout(p,collections);const maps=view(p).offers.filter(o=>o.infinite);
 assert.deepEqual(maps.map(o=>o.tier),[1,2,3]);assert.deepEqual(maps.map(o=>o.price),[20,40,60]);
 for(const offer of maps)for(let i=0;i<4;i++){assert.equal(buy(p,offer.key).error,'');assert.equal(offer.claimed,false);}
 assert.equal(p.stones,100000-480);assert.equal(p.stats.spent,480);
 for(const offer of maps)assert.equal(p.owned.item[offer.id],4);
 assert.deepEqual(progressionLoadout(p,collections),before,'buying never equips items or changes combat aggregation');
});

test('商人：特殊装备实际生成六件传奇，T1–T3，购买取得悬停显示的同一实例',()=>{
 const p=fresh(),special=view(p).offers.filter(o=>!o.infinite);
 assert.equal(special.length,6);assert.equal(new Set(special.map(o=>o.item.baseId)).size,6);
 for(const offer of special){assert.ok(offer.tier>=1&&offer.tier<=3);assert.equal(offer.rarity,'legendary');assert.ok(offer.item.legendary);assert.equal(offer.item.identified,true);}
 const offer=special[0],exact=structuredClone(offer.item),wallet=p.stones;
 assert.equal(buy(p,offer.key).error,'');assert.deepEqual(p.instances[exact.uid],exact);assert.equal(p.stones,wallet-offer.price);
 const after=structuredClone(p);assert.ok(buy(p,offer.key).error);assert.deepEqual(p,after);
});

test('商人：不足支付、背包数量上限和过期货号均不扣钱、不赠装备',()=>{
 const p=fresh(),offers=view(p).offers;p.stones=0;let before=structuredClone(p);
 assert.ok(buy(p,offers[0].key).error);assert.deepEqual(p,before);
 p.stones=100000;p.owned.item[offers[0].id]=9999;before=structuredClone(p);
 assert.ok(buy(p,offers[0].key).error);assert.deepEqual(p,before);
 assert.ok(buy(p,'unknown').error);assert.deepEqual(p,before);
});

test('商人：重开、刷新、存档恢复不重抽、不补已售货品，不读取战斗随机数',()=>{
 const p=fresh(),first=view(p);buy(p,first.offers[3].key);const stock=JSON.stringify(p.outpostMerchant);
 assert.equal(JSON.stringify(view(p).offers.slice(3)),JSON.stringify(p.outpostMerchant.stock));
 const restored=JSON.parse(JSON.stringify(p));view(restored);assert.equal(JSON.stringify(restored.outpostMerchant),stock);
 assert.equal(restored.outpostMerchant.stock[0].claimed,true);assert.equal(view(fresh()).offers[3].key,first.offers[3].key);
});

test('商人：半小时整点刷新，旧货号不可买，已购物品保留，时钟回拨不补货',()=>{
 const p=fresh(),first=view(p),old=first.offers[3];buy(p,old.key);const item=structuredClone(p.instances[old.item.uid]);
 const edge={...options,now:MERCHANT_REFRESH_MS*101};
 assert.equal(outpostMerchantView(p,collections,library,catalog,{...edge,now:edge.now-1}).period,100);
 const next=outpostMerchantView(p,collections,library,catalog,edge);assert.equal(next.period,101);assert.ok(next.offers.slice(3).every(o=>!o.claimed));
 assert.notEqual(next.offers[3].key,old.key);assert.ok(buy(p,old.key,edge).error);assert.deepEqual(p.instances[item.uid],item);
 buy(p,next.offers[3].key,edge);const snapshot=structuredClone(p.outpostMerchant);
 outpostMerchantView(p,collections,library,catalog,options);assert.deepEqual(p.outpostMerchant,snapshot);
});

test('商人UI：UICreator包含九件商品和独立购买菜单，右键与确认动作分开',()=>{
 const project=JSON.parse(fs.readFileSync(new URL('../public/ui/outpost-merchant.uialpha.json',import.meta.url),'utf8'));
 assert.equal(project.id,'opus-outpost-merchant');assert.deepEqual(validateDocument(project),[]);
 const actions=[];const walk=n=>{if(n.action?.op==='buy')actions.push(n.action.value);for(const c of n.children||[])walk(c);};walk(project.root);
 assert.deepEqual(actions,[0,1,2,3,4,5,6,7,8]);assert.ok(project.prefabs['merchant-launcher']);assert.ok(project.prefabs['battle-prefab-item-hover']);
 const menu=project.prefabs['merchant-purchase-menu'];assert.ok(menu);assert.equal(menu.width,240);assert.equal(menu.height,108);
 const menuActions=[];const visit=n=>{if(n.action)menuActions.push(n.action.op);for(const c of n.children||[])visit(c);};visit(menu.root);
 assert.deepEqual(menuActions,['purchase-confirm']);assert.deepEqual(project.presentation.merchantInput,{primary:'select',secondary:'purchase-menu',confirm:'purchase-confirm'});
});

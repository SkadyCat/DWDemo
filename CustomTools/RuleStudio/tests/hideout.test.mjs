import test from 'node:test';
import assert from 'node:assert/strict';
import { readRuleFiles } from '../scripts/rule-files.mjs';
import { checkRuleSet, createProgression, equipmentRandom, progressionLoadout } from '../engine/index.mjs';
import { rollEquipment, registerEquipmentDropLibrary } from '../public/equipment-generation.mjs';
import { inventoryEntries } from '../public/battle-panels.mjs';
import { reconcileInventoryLayout, splitInventoryStack } from '../public/inventory-layout.mjs';
import { freshHideout, ensureHideout, transferStoredItem, transferMerchantItem } from '../public/hideout/model.mjs';
import { createHideoutWorld, canWalk, HIDEOUT_TARGETS, HideoutScene } from '../public/hideout/scene.mjs';

const files=readRuleFiles(),check=checkRuleSet(files);assert.ok(check.ok,check.error);
const {collections,library,catalog}=check;registerEquipmentDropLibrary(files,library,check.affixCategories);
const fresh=()=>({...createProgression(collections,library),hideout:freshHideout()});
const spare=(p,uid='spare')=>(p.instances[uid]=rollEquipment(collections.equipment.get('frostthorn_staff').doc,library,{rarity:'rare',tier:7,uid,random:equipmentRandom(18)}));
const transfer=(p,direction,id,extra={})=>transferStoredItem(p,collections,{direction,id,kind:'equipment',...extra});

test('藏身处：初始化只补空仓库与空商品格，不改变装备、钱包、技能、任务或天赋',()=>{
  const p=fresh();p.quests={value:'kept'};p.talents={value:'kept'};const before=structuredClone(p);delete before.hideout;
  ensureHideout(p,collections,library,catalog,{seed:42});const after=structuredClone(p);delete after.hideout;
  assert.deepEqual(after,before);assert.deepEqual(p.hideout.stash.instances,{});assert.deepEqual(p.hideout.merchant.inventory.instances,{});assert.ok(!p.hideout.merchant.stock);
});

test('仓库：装备完整存取保留UID、T阶、词条和洗炼选择，不给背包或战斗复制增益',()=>{
  const p=fresh(),item=spare(p);item.reforgeTargets=[1,2];const exact=structuredClone(item),before=progressionLoadout(p,collections);
  assert.equal(transfer(p,'deposit',item.uid).error,'');assert.ok(!p.instances[item.uid]);assert.deepEqual(p.hideout.stash.instances[item.uid],exact);
  assert.deepEqual(progressionLoadout(p,collections),before);
  const restored=JSON.parse(JSON.stringify(p));assert.equal(transfer(restored,'withdraw',item.uid).error,'');assert.deepEqual(restored.instances[item.uid],exact);
  assert.ok(!restored.hideout.stash.instances[item.uid]);assert.equal(Object.keys(restored.instances).length,2);
  assert.ok(transfer(restored,'withdraw',item.uid).error);
});

test('仓库：已装备物品、固定装备、错误数量与不存在的物品不能转移，失败不改存档',()=>{
  for(const request of [{id:'starter_weapon'},{id:'missing'},{id:'spare',count:2},{id:'spare',count:-1},{id:'spare',count:1.5},{id:'spare',kind:'skill'}]){
    const p=fresh();spare(p);const before=structuredClone(p);assert.ok(transfer(p,'deposit',request.id,request).error);assert.deepEqual(p,before);
  }
});

test('仓库：堆叠道具部分或全部转移守恒，全部存入才解除快捷栏配置',()=>{
  const p=fresh(),id='frost_tonic';p.owned.item[id]=7;p.loadout.belt=[id];
  assert.equal(transfer(p,'deposit',id,{kind:'item',count:3}).error,'');assert.equal(p.owned.item[id],4);assert.equal(p.hideout.stash.owned.item[id],3);assert.deepEqual(p.loadout.belt,[id]);
  assert.equal(transfer(p,'deposit',id,{kind:'item',count:4}).error,'');assert.ok(!p.owned.item[id]);assert.deepEqual(p.loadout.belt,[]);
  assert.equal(transfer(p,'withdraw',id,{kind:'item',count:7}).error,'');assert.equal(p.owned.item[id],7);assert.ok(!p.hideout.stash.owned.item[id]);
  p.hideout.stash.owned.item[id]=9999;const before=structuredClone(p);assert.ok(transfer(p,'deposit',id,{kind:'item',count:1}).error);assert.deepEqual(p,before);
});

test('仓库：存入点击的拆分物品堆，不改另一堆的数量和位置',()=>{
  const p=fresh(),id='frost_tonic';p.owned.item[id]=9;const entries=inventoryEntries(p,collections);
  p.bagLayout=reconcileInventoryLayout(null,entries).layout;
  const split=splitInventoryStack(p.bagLayout,entries,'item:'+id,4);p.bagLayout=split.layout;
  const other=structuredClone(p.bagLayout.slots.find(s=>s?.key==='item:'+id));
  assert.equal(transfer(p,'deposit',id,{kind:'item',count:4,stackKey:split.key}).error,'');
  assert.deepEqual(p.bagLayout.slots.find(s=>s?.key===other.key),other);assert.equal(p.owned.item[id],5);assert.equal(p.hideout.stash.owned.item[id],4);
});

test('商家商品：迁移旧货单不清空仓库、不回收已经买到的装备',()=>{
  const p=fresh(),item=spare(p);transfer(p,'deposit',item.uid);
  p.hideout.version=1;p.hideout.merchant={name:'流浪商人',stock:[{id:'npc_stock',claimed:false}]};
  const stash=structuredClone(p.hideout.stash),bag=structuredClone(p.instances);
  ensureHideout(p);assert.deepEqual(p.hideout.stash,stash);assert.deepEqual(p.instances,bag);
  assert.deepEqual(p.hideout.merchant,freshHideout().merchant);assert.equal(p.hideout.version,2);
});

test('商家商品：上架真实装备，刷新不重造、不加钱；下架保留UID、词条、T阶与洗炼选择',()=>{
  const p=fresh(),item=spare(p);item.reforgeTargets=[1,3];const exact=structuredClone(item),loadout=progressionLoadout(p,collections),stats=structuredClone(p.stats);
  const request={direction:'deposit',kind:'equipment',id:item.uid,targetIndex:23};
  assert.equal(transferMerchantItem(p,collections,request).error,'');assert.ok(!p.instances[item.uid]);assert.equal(p.hideout.merchant.inventory.instances[item.uid],item);
  assert.deepEqual(progressionLoadout(p,collections),loadout);assert.equal(p.stones,0);assert.deepEqual(p.stats,stats);
  assert.equal(p.hideout.merchant.inventory.bagLayout.slots[23].ref,'equipment:'+item.uid);
  const restored=JSON.parse(JSON.stringify(p)),before=structuredClone(restored);ensureHideout(restored);assert.deepEqual(restored,before);
  assert.ok(transferMerchantItem(restored,collections,request).error);assert.deepEqual(restored,before);
  assert.equal(transferMerchantItem(restored,collections,{...request,direction:'withdraw',targetIndex:10}).error,'');
  assert.deepEqual(restored.instances[item.uid],exact);assert.ok(!restored.hideout.merchant.inventory.instances[item.uid]);assert.equal(restored.bagLayout.slots[10].ref,'equipment:'+item.uid);
});

test('商家商品：堆叠道具与拆分位置守恒，指定格子上架、同类合堆、下架可逆',()=>{
  const p=fresh(),id='frost_tonic';p.owned.item[id]=9;p.loadout.belt=[id];const entries=inventoryEntries(p,collections);
  p.bagLayout=reconcileInventoryLayout(null,entries).layout;const split=splitInventoryStack(p.bagLayout,entries,'item:'+id,4);p.bagLayout=split.layout;
  const other=structuredClone(p.bagLayout.slots.find(s=>s?.key==='item:'+id));
  const request={direction:'deposit',kind:'item',id,count:4,stackKey:split.key,targetIndex:12};
  assert.equal(transferMerchantItem(p,collections,request).error,'');assert.equal(p.owned.item[id],5);assert.equal(p.hideout.merchant.inventory.owned.item[id],4);
  assert.deepEqual(p.bagLayout.slots.find(s=>s?.key===other.key),other);assert.equal(p.hideout.merchant.inventory.bagLayout.slots[12].count,4);assert.deepEqual(p.loadout.belt,[id]);
  assert.equal(transferMerchantItem(p,collections,{...request,count:5,stackKey:other.key}).error,'');assert.ok(!p.owned.item[id]);assert.deepEqual(p.loadout.belt,[]);
  assert.equal(p.hideout.merchant.inventory.bagLayout.slots[12].count,9);
  assert.equal(transferMerchantItem(p,collections,{...request,direction:'withdraw',count:9,stackKey:'item:'+id,targetIndex:20}).error,'');assert.equal(p.owned.item[id],9);assert.ok(!p.hideout.merchant.inventory.owned.item[id]);
});

test('商家商品：已装备、固定装备、错误堆、错误数量和已占位置均原子拒绝',()=>{
  const invalid=[{id:'starter_weapon'},{id:'missing'},{id:'spare',count:2},{id:'spare',count:-1},{id:'spare',count:1.5},{id:'spare',kind:'skill'},
    {id:'spare',stackKey:'stale'},{id:'spare',targetIndex:72},{id:'spare',targetIndex:-1},{id:'spare',targetIndex:1.5},{id:'spare',targetIndex:5}];
  for(const request of invalid){
    const p=fresh();spare(p);const stored=spare(p,'other');assert.equal(transferMerchantItem(p,collections,{direction:'deposit',kind:'equipment',id:stored.uid,targetIndex:5}).error,'');
    const before=structuredClone(p);assert.ok(transferMerchantItem(p,collections,{direction:'deposit',kind:'equipment',...request}).error);assert.deepEqual(p,before);
  }
});

test('藏身处：点击站点立即打开且不读取角色距离；面板内和未知目标不触发',()=>{
  const opened=[],fake={blocked:false,release(){this.released=true;},onInteract:id=>opened.push(id),get world(){throw Error('点击不应读角色位置');}};
  for(const target of HIDEOUT_TARGETS){HideoutScene.prototype.interact.call(fake,target.id);assert.equal(fake.released,true);}
  assert.deepEqual(opened,['stash','merchant']);fake.blocked=true;HideoutScene.prototype.interact.call(fake,'stash');
  fake.blocked=false;HideoutScene.prototype.interact.call(fake,'missing');assert.deepEqual(opened,['stash','merchant']);
});

test('藏身处场景：仅两个可交互站点，行走边界与站点阻挡有效，重复静态网格合批且资源可释放',()=>{
  const world=createHideoutWorld();assert.deepEqual(HIDEOUT_TARGETS.map(t=>t.id),['stash','merchant']);assert.equal(world.stations.length,2);
  for(const t of HIDEOUT_TARGETS)assert.ok(canWalk(t.x,t.z));assert.ok(canWalk(0,3.5));assert.ok(!canWalk(-4.2,-1.2));assert.ok(!canWalk(4,-1));assert.ok(!canWalk(50,0));
  let meshes=0,instances=0;world.group.traverse(o=>{if(o.isMesh)meshes++;if(o.isInstancedMesh)instances+=o.count;});assert.ok(meshes<110,meshes);assert.ok(instances>=192);
  world.dispose();assert.equal(world.group.parent,null);
});

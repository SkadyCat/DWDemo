import test from 'node:test';
import assert from 'node:assert/strict';
import { AtlasSession } from '../public/atlas-session.mjs';
import { mapTicketAccess, quoteMapTicket, travelAtlas, atlasRegionTier } from '../public/atlas-travel.mjs';

const docs = new Map([0,1,2,3,16,17].flatMap(tier => ['common','rare'].map(rarity => {
  const id = `map_t0${tier}_${rarity}`;
  return [id, {doc:{id,category:'map',tier}}];
})).concat([['potion',{doc:{id:'potion',category:'potion',tier:2}}]]));
const collections = {item:docs};
const player = (count=0, id='map_t02_common') => ({owned:{item:count?{[id]:count}:{}},mapDeviceSlots:{map:`item:${id}`,'modifier-0':'reserved'},bagLayout:{nextKey:8,slots:count?[
  {key:'other',ref:'item:potion',count:3},
  {key:'pile-a',ref:`item:${id}`,count:1},
  ...(count>1?[{key:'pile-b',ref:`item:${id}`,count:count-1}]:[])
]:[]}});
const create = prepared => ({floor:prepared.options.floor,phase:'ready',hero:{dead:false}});
function fixture(){
 const data=new Map(),storage={getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)};
 const session=new AtlasSession(storage,{seed:41}),p=player();
 const first=travelAtlas(session,p,collections,'0:0',create);first.battle.phase='cleared';session.observe(first.battle);
 return {session,p,storage,node:session.state.nodes.find(n=>n.status==='available')};
}

test('地图票：无票、未装槽、过期槽、假类别及非法等级均在创建战斗前拦截',()=>{
 for(const p of [player(),{...player(1),mapDeviceSlots:{}},player(1,'map_t00_common'),player(1,'map_t017_common'),player(1,'potion'),player(1,'missing')]){
  const {session,node}=fixture(),before=JSON.stringify(session.state);let calls=0;
  assert.throws(()=>travelAtlas(session,p,collections,node.id,()=>{calls++;return create({options:{floor:2}});}));
  assert.equal(calls,0);assert.equal(JSON.stringify(session.state),before);assert.equal(session.battle,null);
 }
});
test('地图票：进入成功只扣一张，清空中央槽并保留其它物品、另一张票和修饰槽',()=>{
 const {session,node,storage}=fixture(),p=player(2);
 travelAtlas(session,p,collections,node.id,create);
 assert.equal(p.owned.item.map_t02_common,1);assert.equal(p.bagLayout.slots[1],null);
 assert.deepEqual(p.bagLayout.slots[2],{key:'pile-b',ref:'item:map_t02_common',count:1});
 assert.equal(p.bagLayout.slots[0].count,3);assert.deepEqual(p.mapDeviceSlots,{'modifier-0':'reserved'});
 const restored=JSON.parse(JSON.stringify(p));assert.equal(restored.owned.item.map_t02_common,1);
 assert.equal(session.state.currentNodeId,node.id);assert.ok([...storage.getItem('dw-battle-atlas-v1')].length);
 assert.throws(()=>travelAtlas(session,p,collections,node.id,create));assert.equal(p.owned.item.map_t02_common,1);
});
test('地图票：最后一张移除真实所有权；稀有地图同样可以作为入场票',()=>{
 const {session,node}=fixture(),p=player(1,'map_t02_rare');
 travelAtlas(session,p,collections,node.id,create);
 assert.equal(Object.hasOwn(p.owned.item,'map_t02_rare'),false);assert.equal(p.bagLayout.slots.length,1);
 assert.equal(p.mapDeviceSlots.map,undefined);
});
test('地图票：构建失败或返回错误战斗不扣票、不增加次数、不变更当前位置',()=>{
 for(const createBattle of [()=>{throw Error('build failed');},()=>null,()=>({floor:3})]){
  const {session,node}=fixture(),p=player(1),before=JSON.stringify({p,state:session.state});
  assert.throws(()=>travelAtlas(session,p,collections,node.id,createBattle));
  assert.equal(JSON.stringify({p,state:session.state}),before);assert.equal(session.battle,null);
 }
});
test('地图票：重置正在挑战的付费地图也需票，失败时保留原战斗和次数',()=>{
 const {session,node}=fixture(),p=player(2),first=travelAtlas(session,p,collections,node.id,create),before=JSON.stringify(session.state);
 assert.throws(()=>travelAtlas(session,p,collections,node.id,create,{retry:true}));
 assert.equal(session.battle,first.battle);assert.equal(JSON.stringify(session.state),before);
 p.mapDeviceSlots.map='item:map_t02_common';
 assert.throws(()=>travelAtlas(session,p,collections,node.id,()=>{throw Error('construction failed');},{retry:true}));
 assert.equal(session.battle,first.battle);assert.equal(JSON.stringify(session.state),before);assert.equal(p.owned.item.map_t02_common,1);
 travelAtlas(session,p,collections,node.id,create,{retry:true});assert.equal(p.owned.item.map_t02_common,undefined);
 assert.equal(session.state.attempts[node.id],2);
});
test('地图票：战败后重新挑战需新票，连点和重入不会重复传送或重复扣费',()=>{
 const {session,node}=fixture(),p=player(2),first=travelAtlas(session,p,collections,node.id,prepared=>{
  assert.throws(()=>travelAtlas(session,p,collections,node.id,create),/正在进入/);return create(prepared);
 });
 first.battle.hero.dead=true;session.observe(first.battle);
 assert.throws(()=>travelAtlas(session,p,collections,node.id,create));
 p.mapDeviceSlots.map='item:map_t02_common';travelAtlas(session,p,collections,node.id,create);
 assert.equal(p.owned.item.map_t02_common,undefined);
});
test('地图票：UI 与真实库存校验一致，查看、选图、无票起始地图都不消耗',()=>{
 const {session,node}=fixture(),p=player(1),before=JSON.stringify(p);
 session.select(node.id);quoteMapTicket(p,collections,node);assert.equal(JSON.stringify(p),before);
 const doc=docs.get('map_t02_common').doc,items=[{...doc,kind:'item',key:'item:'+doc.id,count:1}];
 assert.equal(mapTicketAccess(node,items,p.mapDeviceSlots).ok,true);
 assert.match(mapTicketAccess(node,[],p.mapDeviceSlots).error,/放入地图/);
 assert.equal(mapTicketAccess({id:'0:0',floor:1},[],{}).free,true);
});

test('地图层级：T1、T3、T16 均由实际装入的地图决定，清槽与重载保留本次层级',()=>{
 for(const tier of [1,3,16]){
  const {session,node,storage}=fixture(),id=`map_t0${tier}_common`,p=player(1,id);
  const item={...docs.get(id).doc,kind:'item',key:'item:'+id,count:1};
  assert.equal(atlasRegionTier(session.state,node,[item],p.mapDeviceSlots),tier);
  const result=travelAtlas(session,p,collections,node.id,prepared=>{
   assert.equal(prepared.options.floor,tier);return create(prepared);
  });
  assert.equal(result.battle.floor,tier);assert.equal(p.mapDeviceSlots.map,undefined);
  const active=session.state.nodes.find(n=>n.id===node.id);
  assert.equal(active.floor,tier);assert.equal(atlasRegionTier(session.state,active,[],{}),tier);
  // Mounting the next map cannot change the current live battle's tier.
  assert.equal(atlasRegionTier(session.state,active,[{...item,tier:2}],{map:item.key}),tier);
  const reloaded=new AtlasSession(storage);
  assert.equal(reloaded.state.nodes.find(n=>n.id===node.id).floor,tier);
  assert.equal(reloaded.state.mapTiers[node.id],tier);
 }
});

test('地图层级：未进入区域不伪造层级，起点无票 T1；主动提供地图则按其层级消费',()=>{
 const {session,node}=fixture();
 assert.equal(atlasRegionTier(session.state,node,[],{}),null);
 const fresh=new AtlasSession(null,{seed:41}),p=player(1,'map_t03_common');
 const result=travelAtlas(fresh,p,collections,'0:0',create);
 assert.equal(result.battle.floor,3);assert.equal(result.ticket.free,false);
 assert.equal(p.owned.item.map_t03_common,undefined);
});

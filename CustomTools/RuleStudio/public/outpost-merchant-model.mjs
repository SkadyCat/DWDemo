// Acquisition and saved merchant stock only; combat rules and RNG are untouched.
import {equipmentRandom,rollEquipmentDrop,equipmentDocument,fixedEquipmentAffix} from '../engine/equipment.mjs';
import {listings,defaultPrice} from '../engine/shop.mjs';
import {grantLoot} from '../engine/floor-rewards.mjs';
import {rollEquipment} from './equipment-generation.mjs';

export const MERCHANT_REFRESH_MS=30*60*1000;
export const MERCHANT_SPECIAL_COUNT=6;
export const MERCHANT_MAP_PRICES=Object.freeze({1:20,2:40,3:60});
const copy=value=>JSON.parse(JSON.stringify(value));
const periodAt=now=>{
  if(!Number.isFinite(now)||now<0)throw Error('商人刷新时间无效');
  return Math.floor(now/MERCHANT_REFRESH_MS);
};

export function outpostMerchantLocation(dungeon,regionId){
  if(regionId!=='0:0')return null;
  const candidates=dungeon.tiles.filter(t=>t.room===dungeon.entryRoom).map(t=>dungeon.tileCenter(t.x,t.y))
    .filter(p=>Math.hypot(p.x-dungeon.entry.x,p.y-dungeon.entry.y)>=300&&dungeon.sweep(p.x,p.y,p.x,p.y,190)<0)
    .sort((a,b)=>Math.hypot(a.x-dungeon.entry.x-350,a.y-dungeon.entry.y-100)-Math.hypot(b.x-dungeon.entry.x-350,b.y-dungeon.entry.y-100));
  if(!candidates.length)throw Error('入口房间缺少商人位置');
  return {id:'outpost-merchant',name:'拓荒商人',...candidates[0],radius:200};
}

export function merchantMaps(collections){
  return [1,2,3].map(tier=>{
    const doc=[...collections.item.values()].map(row=>row.doc).find(doc=>doc?.category==='map'&&doc.tier===tier&&doc.rarity==='common');
    if(!doc)throw Error(`缺少 ${tier} 级地图`);
    return {key:`map:${doc.id}`,kind:'item',id:doc.id,name:doc.name,category:'map',rarity:doc.rarity,tier,count:1,price:MERCHANT_MAP_PRICES[tier],infinite:true,description:doc.description,claimed:false};
  });
}

export function ensureOutpostMerchant(player,collections,library,catalog,{worldSeed=1,now=Date.now()}={}){
  if(!Number.isSafeInteger(worldSeed)||worldSeed<0||worldSeed>0xffffffff)throw Error('商人世界种子无效');
  const saved=player.outpostMerchant,clockPeriod=periodAt(now);
  const sameWorld=saved?.version===1&&saved.worldSeed===worldSeed&&Number.isSafeInteger(saved.period)&&saved.period>=0;
  // Reloads, retries and clock rollback cannot replenish a bought offer.
  const period=sameWorld?Math.max(clockPeriod,saved.period):clockPeriod;
  if(sameWorld&&saved.period===period&&Array.isArray(saved.stock))return saved;
  const random=equipmentRandom((worldSeed^Math.imul(period,0x45d9f3b)^0x4d455243)>>>0);
  const pool=listings(collections,catalog).filter(row=>row.kind==='equipment'&&fixedEquipmentAffix(row.doc,library));
  const stock=[];
  for(let i=0;i<MERCHANT_SPECIAL_COUNT&&pool.length;i++){
    const listing=pool.splice(Math.floor(random()*pool.length),1)[0],tier=1+Math.floor(random()*3);
    const key=`special:${worldSeed}:${period}:${i}`;
    const item=rollEquipmentDrop({equipment:new Map([[listing.id,{doc:listing.doc}]])},library,{random,chance:1,rarity:'legendary',tier,maxTier:3,identified:true,uid:`outpost_${worldSeed}_${period}_${i}`,createEquipment:rollEquipment});
    const price=listing.custom?listing.price:defaultPrice('equipment',equipmentDocument(item,collections));
    stock.push({key,kind:'equipment',id:item.uid,name:item.name,rarity:item.rarity,tier:item.tier,item,count:1,price,claimed:false,infinite:false});
  }
  const next={version:1,worldSeed,period,stock};
  player.outpostMerchant=next;
  return next;
}

export function outpostMerchantView(player,collections,library,catalog,options={}){
  const state=ensureOutpostMerchant(player,collections,library,catalog,options);
  return {offers:[...merchantMaps(collections),...state.stock],period:state.period,nextRefreshAt:(state.period+1)*MERCHANT_REFRESH_MS};
}

export function buyOutpostOffer(player,collections,library,catalog,key,options={}){
  const view=outpostMerchantView(player,collections,library,catalog,options),offer=view.offers.find(row=>row.key===key);
  if(!offer||offer.claimed)return {error:'商品已售出或已刷新'};
  if(offer.kind==='equipment'&&!collections.equipment.get(offer.item?.baseId)?.doc)return {error:'该装备当前不可购买'};
  if(!Number.isSafeInteger(offer.price)||offer.price<0)return {error:'商品价格无效'};
  if(!Number.isSafeInteger(player.stones)||player.stones<offer.price)return {error:`灵石不足（需要 ${offer.price}）`};
  if(!Number.isSafeInteger(player.stats?.spent)||!Number.isSafeInteger(player.stats.spent+offer.price))return {error:'消费记录无效'};
  const purchased=copy(offer),error=grantLoot(player,purchased);
  if(error)return {error};
  player.stones-=offer.price;player.stats.spent+=offer.price;
  if(!offer.infinite)offer.claimed=true;
  return {error:'',offer:purchased};
}

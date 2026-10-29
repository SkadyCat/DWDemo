// Authoring-only adapter. Reward generation, validation and mutation are the
// frozen original RuleStudio modules, not a second reward implementation.
import { checkRuleSet, createProgression, FloorRewards, emptyHunter, hunterAllows, equipmentAffixPool, hunterCurrencyPool } from '../assets/loot-prototype/reference/engine/index.js';
import { lootStyle } from '../assets/loot-prototype/reference/public/prefabs/loot-style.js';
import { seedOf, trajectory } from '../assets/loot-prototype/reference/public/prefabs/loot-markers.js';
export { lootStyle };
export const lootName=d=>`${d.tier?'T'+d.tier+' · ':''}${d.name}${d.item?.identified===false?' · 未鉴定':''}${d.count>1?' ×'+d.count:''}`;
export function visibleDrops(drops,hero,hunter){return drops.filter(d=>!d.claimed&&(d.origin==='inventory'||hunterAllows(d,hunter))).sort((a,b)=>Math.hypot(a.x-hero.x,a.y-hero.y)-Math.hypot(b.x-hero.x,b.y-hero.y)).slice(0,96);}
// ground-loot.mjs packing contract, in the same 1600×900 authored coordinates.
export function packLoot(drops,project,measure,width=1600,height=900){
 const placed=[];
 for(const drop of drops){
  const at=project(drop);if(!at)continue;const w=Math.min(260,Math.max(70,measure(lootName(drop))+(lootStyle(drop).family?46:20))),h=26;
  const ax=Math.max(4,Math.min(width-w-4,at.x-w/2)),ay=Math.max(4,Math.min(height-h-4,at.y));
  for(let n=0;n<100;n++){
   const row=n%20,col=Math.floor(n/20),x=ax+Math.ceil(col/2)*(col%2?-1:1)*(w+4),y=ay+Math.ceil(row/2)*(row%2?-1:1)*(h+3);
   if(x<4||y<4||x+w>width-4||y+h>height-4)continue;
   if(placed.some(r=>x<r.x+r.w+3&&x+w+3>r.x&&y<r.y+r.h+3&&y+h+3>r.y))continue;
   placed.push({key:drop.key,x,y,w,h,drop});break;
  }
 }
 return placed;
}
export class LootPrototypeSession {
 constructor(files,samples,{reviewAll=true}={}){
  const checked=checkRuleSet(files);if(!checked.ok)throw new Error(checked.error);Object.assign(this,checked);
  this.samples=structuredClone(samples);this.affixPool=equipmentAffixPool(this.library);this.currencyPool=hunterCurrencyPool(this.collections);this.reset(reviewAll);
 }
 reset(reviewAll=true){
  this.state=createProgression(this.collections,this.library);this.rewards=new FloorRewards(this.collections,this.library,this.catalog,{seed:7919,maxTier:1});
  this.rewards.ground=structuredClone(this.samples);
  // The review samples retain real RuleStudio UIDs. Continue above every sample
  // key/instance counter so new kills cannot collide with a reviewed item.
  this.rewards.nextId=1+Math.max(0,...this.samples.flatMap(d=>[d.key,d.id]).map(id=>Number(/_(\d+)(?:_unidentified)?$/.exec(id||'')?.[1]||0)));
  this.hero={x:0,y:0,dead:false};this.hunter=emptyHunter();
  // Explicit visual-review preset. emptyHunter() itself keeps RuleStudio's enabled=true default.
  if(reviewAll)this.hunter.enabled=false;
  this.showLoot=true;this.target='';this.feedback='';this.claims=[];this.kills=0;
  this.time=0;this.births=new Map(this.samples.map(d=>[d.key,-2]));
 }
 get visible(){return this.showLoot?visibleDrops(this.rewards.ground,this.hero,this.hunter):[];}
 get remaining(){return this.rewards.remaining;}
 get animating(){return this.remaining.some(d=>this.time-(this.births.get(d.key)??-2)<1.4);}
 presentation(drop){const seed=seedOf(drop.key),age=this.time-(this.births.get(drop.key)??-2);return trajectory({sourceX:(drop.sourceX??drop.x)*.01,sourceZ:-(drop.sourceY??drop.y)*.01,x:drop.x*.01,z:-drop.y*.01},age,seed,.68+seed*.18);}
 requestPickup(key){if(this.hero.dead)return false;const d=this.remaining.find(d=>d.key===key);if(!d)return false;this.target=key;this.feedback='正在靠近 '+d.name;return true;}
 pickup(key){const result=this.rewards.pickup(key,this.state,this.hero);this.feedback=result.error||'已拾取 '+result.drop.name;this.target='';if(result.drop)this.claims.push(structuredClone(result.drop));return result;}
 step(dt,move={x:0,y:0}){
  dt=Math.max(0,Math.min(.05,dt));this.time+=dt;if(this.hero.dead){this.target='';return;}let length=Math.hypot(move.x,move.y);
  if(length)this.target='';
  else if(this.target){const drop=this.remaining.find(d=>d.key===this.target);if(!drop){this.target='';return;}const x=drop.x-this.hero.x,y=drop.y-this.hero.y;length=Math.hypot(x,y);if(length<=200){this.pickup(drop.key);return;}move={x,y};}
  if(length){this.hero.x+=move.x/length*620*dt;this.hero.y+=move.y/length*620*dt;}
 }
 kill(boss=false){this.kills++;const before=this.remaining.length;this.rewards.onKill({x:this.hero.x+210,y:this.hero.y+180,boss});for(const d of this.remaining)if(!this.births.has(d.key))this.births.set(d.key,this.time);this.feedback=`${boss?'首领':'普通怪物'}掉落 ${this.remaining.length-before} 件`;return this.remaining.length-before;}
 toggleTarget(id){const at=this.hunter.targets.indexOf(id);if(at<0)this.hunter.targets.push(id);else this.hunter.targets.splice(at,1);}
 toggleCurrency(id){const at=this.hunter.currencies.indexOf(id);if(at<0)this.hunter.currencies.push(id);else this.hunter.currencies.splice(at,1);}
}

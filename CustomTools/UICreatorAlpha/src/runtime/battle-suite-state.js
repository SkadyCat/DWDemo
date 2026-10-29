import { BAG_ITEMS, ITEMS, AFFIXES, MATERIALS, REGIONS } from '../assets/rulestudio-hud/suite-data.js';
export class BattleSuiteState {
 constructor(){
  this.items=structuredClone(BAG_ITEMS);this.selected='gear-18';this.craftItem='gear-3';this.wallet=996;this.overlays=[];
  this.fields={characterQuery:'',bagQuery:'',hunterQuery:'',affixQuery:'',shopQuery:'',craftQuery:'',splitAmount:'2',floor:'1',monsterCount:'20',startingStones:'996'};
  this.gearFilter='all';this.bagPage=0;this.hunterPage=0;this.selectedOnly=false;this.affixes=new Set();this.currencies=new Set();this.currency='stone-low';this.omen=null;this.targets=new Set();this.targetByItem=new Map();this.rolls=0;this.shopTab=1;this.sort='price';this.affordable=false;this.purchased=new Set();this.picked=new Set();this.prices=new Map();this.region=1;this.zoom=100;this.panX=0;this.panY=0;this.bdFamily=0;this.bdGrade=-1;this.mapTab='equipment';this.foldedLineages=new Set();this.affix='范围技能重复次数 +1';this.message='';this.monster='按层数与权重混合生成';
 }
 get item(){return this.items.find(i=>i.id===this.selected);}
 select(id){this.selected=id;this.targets=this.targetByItem.get(id)||new Set();this.targetByItem.set(id,this.targets);}
 query(items,key){const q=this.fields[key].trim().toLocaleLowerCase();return items.filter(i=>!q||`${i.name} ${i.description||''} ${(i.affixes||[]).join(' ')}`.toLocaleLowerCase().includes(q));}
 get characterItems(){return this.query(this.items.filter(i=>i.kind==='equipment'&&!i.equipped&&(this.gearFilter==='all'||i.slot===this.gearFilter)), 'characterQuery');}
 get bagItems(){return this.query(this.items.filter(i=>i.kind!=='equipment'||!i.equipped),'bagQuery');}
 get hunterRows(){const q=this.fields.hunterQuery.trim();return AFFIXES.filter(v=>(!q||v.includes(q))&&(!this.selectedOnly||this.affixes.has(v)));}
 setField(key,value){if(!(key in this.fields)&&!key.startsWith('price:'))return false;this.fields[key]=String(value).slice(0,120);if(key==='bagQuery')this.bagPage=0;if(key==='hunterQuery')this.hunterPage=0;return true;}
 toggle(set,value){if(set.has(value))set.delete(value);else set.add(value);}
 equip(){const item=this.item;if(item?.kind!=='equipment'||item.unidentified)return false;const equipped=item.equipped;for(const i of this.items)if(i.slot===item.slot)i.equipped=false;item.equipped=!equipped;this.message=`${equipped?'已卸下':'已装备'} ${item.name}`;return true;}
 split(){const item=this.item,n=Number(this.fields.splitAmount);if(!item||!Number.isInteger(n)||n<1||n>=item.count)return false;item.count-=n;this.items.push({...structuredClone(item),id:`${item.id}-split-${this.items.length}`,count:n,equipped:false});this.message=`已拆出 ${n} 个${item.name}`;this.overlays.pop();return true;}
 get splitValid(){const n=Number(this.fields.splitAmount);return Number.isInteger(n)&&n>0&&n<this.item?.count;}
 act(op,value){
  if(op==='select-item'){if(!this.items.some(i=>i.id===value))return false;this.select(this.selected===value?'':value);return true;}
  if(op==='inspect'){this.select(value);this.overlays.push(this.item?.kind==='item'?'material':this.item?.unidentified?'unidentified':'item');return true;}
  if(op==='inspect-selected'){if(!this.item)return false;this.select(this.selected);this.overlays.push(this.item.kind==='item'?'material':this.item.unidentified?'unidentified':'item');return true;}
  if(op==='overlay'){if(value==='split'){if(this.item?.count<=1)return false;this.fields.splitAmount=String(Math.max(1,Math.floor(this.item.count/2)));}this.overlays.push(value);return true;}
  if(op==='back'){this.overlays.pop();return true;}
  if(op==='equip')return this.equip();
  if(op==='gear-filter'){this.gearFilter=value;return true;}
  if(op==='sort'){this.items.sort((a,b)=>a.kind.localeCompare(b.kind)||a.name.localeCompare(b.name,'zh'));this.message='已整理全部背包，按类别与名称排序';return true;}
  if(op==='bag-page'){this.bagPage=Math.max(0,Math.min(Math.ceil(this.bagItems.length/72)-1,this.bagPage+value));return true;}
  if(op==='hunter-affix'){this.toggle(this.affixes,value);return true;}
  if(op==='hunter-only'){this.selectedOnly=!this.selectedOnly;this.hunterPage=0;return true;}
  if(op==='hunter-clear'){this.affixes.clear();this.hunterPage=0;return true;}
  if(op==='hunter-page'){this.hunterPage=Math.max(0,Math.min(Math.ceil(this.hunterRows.length/8)-1,this.hunterPage+value));return true;}
  if(op==='hunter-currency'){this.toggle(this.currencies,value);return true;}
  if(op==='currency-clear'){this.currencies.clear();return true;}
  if(op==='currency'){this.currency=this.currency===value?null:value;return true;}
  if(op==='omen'){this.omen=this.omen===value?null:value;return true;}
  if(op==='item-affix'){
   if(!this.item?.affixes?.[value])return false;
   this.targetByItem.set(this.selected,this.targets);
   if(!this.currency){this.overlays.push('affix');return true;}
   const m=this.items.find(i=>i.id===this.currency);if(!m?.count){this.message='通货不足';return true;}
   if(!this.targets.has(value)){if(this.targets.size>=3){this.message='每件装备最多选定 3 条';return true;}this.targets.add(value);this.message=`已选定第 ${value+1} 条词条`;}
   else{this.rolls++;if(this.item?.affixes?.[value])this.item.affixes[value]=this.item.affixes[value].replace(/([+-]?)(\d+)/,(_,sign,n)=>`${sign}${Math.max(1,Number(n)+(this.rolls%2?1:-1))}`);this.message=`第 ${value+1} 条词条已洗炼 · 第 ${this.rolls} 次`;}
   m.count--;return true;
  }
  if(op==='split-step'){this.fields.splitAmount=String(Math.max(1,Math.min((this.item?.count||2)-1,(Number(this.fields.splitAmount)||1)+value)));return true;}
  if(op==='split-half'){this.fields.splitAmount=String(Math.floor(this.item.count/2));return true;}
  if(op==='split-confirm')return this.split();
  if(op==='identify'){const item=this.item;if(item)item.unidentified=false;this.overlays.pop();this.overlays.push('item');this.message='已鉴定装备';return true;}
  if(op==='sell'){const item=this.item;if(item){this.items=this.items.filter(i=>i!==item);this.wallet+=24;this.message=`已出售 ${item.name}`;this.selected=this.items[0]?.id;}this.overlays=[];return true;}
  if(op==='buy'){const price=this.prices.get(value)??24;if(this.wallet>=price&&!this.purchased.has(value)){this.wallet-=price;this.purchased.add(value);const source=BAG_ITEMS.find(i=>i.id===value);if(source)this.items.push({...structuredClone(source),id:`bought-${value}`,equipped:false});this.message='已购买，物品进入预览背包';}return true;}
  if(op==='craft-select'){this.craftItem=value;this.select(value);return true;}
  if(op==='craft-run'){const item=this.items.find(i=>i.id===this.craftItem);if(item?.unidentified){item.unidentified=false;this.message='装备已鉴定';return true;}if(!this.currency){this.message='请选择通货';return true;}return this.act('item-affix',0);}
  if(op==='discard'){this.items=this.items.filter(i=>i.id!==this.craftItem);this.craftItem=this.items.find(i=>i.kind==='equipment')?.id;this.selected=this.craftItem;this.message='已丢弃装备';return true;}
  if(op==='shop-tab'){this.shopTab=value;return true;}
  if(op==='shop-sort'){this.sort=this.sort==='price'?'name':'price';return true;}
  if(op==='affordable'){this.affordable=!this.affordable;return true;}
  if(op==='region'){this.region=value;return true;}
  if(op==='atlas-zoom'){this.zoom=Math.max(50,Math.min(200,this.zoom+value*25));return true;}
  if(op==='atlas-center'){this.zoom=100;this.panX=0;this.panY=0;return true;}
  if(op==='region-enter'){this.message=`进入${REGIONS[this.region].name}`;return true;}
  if(op==='reset-bag'){this.items=structuredClone(BAG_ITEMS);this.wallet=996;this.purchased.clear();return true;}
  if(op==='pricing-save'){for(const [key,n]of Object.entries(this.fields))if(key.startsWith('price:')&&Number.isFinite(Number(n))&&Number(n)>=0)this.prices.set(key.slice(6),Number(n));this.message='价格设置已保存在本次预览中';return true;}
  if(op==='pickup'){if(this.picked.has(value))return false;const item=ITEMS.find(i=>i.id===value);if(item)this.items.push({...structuredClone(item),id:`picked-${value}`,equipped:false});this.picked.add(value);this.message=`已拾取 ${item?.name||'物品'}`;return true;}
  if(op==='affix'){this.affix=value;this.overlays.push('affix');return true;}
  if(op==='bd-family'){this.bdFamily=value;this.bdGrade=-1;return true;}
  if(op==='bd-apply'){this.bdGrade=value;const equipped=new Set([this.bdFamily===4?'gear-6':'gear-0','gear-3','gear-4','gear-18']);for(const item of this.items)item.equipped=equipped.has(item.id);this.message=`已应用第 ${value+1} 档配装`;return true;}
  if(op==='map-info-tab'){this.mapTab=value;return true;}
  if(op==='lineage-toggle'){this.toggle(this.foldedLineages,value);return true;}
  if(op==='loading-retry'){this.message='战场准备完成';return true;}
  return false;
 }
}

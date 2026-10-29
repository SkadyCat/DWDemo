// Authoring fixture controller only. UE uses the native DWRules transaction.
// No combat, inventory RNG, or production item values are implemented here.
export class InspectorCraftingPreview {
 constructor(suite){this.suite=suite;this.currencyId='';this.omenId='';this.message='';}
 choices(category){return this.suite.state.items.filter(item=>item.count>0&&(item.category===category||(category==='omen'?item.id.startsWith('omen'):item.id.startsWith('stone-')||item.id==='meteor'))).map(item=>({...item,grade:item.currencyGrade||({'stone-low':1,'stone-mid':2,'stone-high':3}[item.id]||0)})).sort((a,b)=>(a.grade||4)-(b.grade||4));}
 view(item){
  const currencies=this.choices('currency'),omens=this.choices('omen');
  if(!currencies.some(v=>v.id===this.currencyId))this.currencyId='';if(!omens.some(v=>v.id===this.omenId))this.omenId='';
  const currency=currencies.find(v=>v.id===this.currencyId),omen=omens.find(v=>v.id===this.omenId),targets=item.reforgeTargets||[];
  const operation=currency?.craftOp||(currency?.id==='meteor'?'roll_affixes':currency?'reroll':''),count=currency?.craftCount||4;
  let blocked=!currency?'请选择并激活通货':item.unidentified?'请先鉴定装备':'';const eligible=[];
  if(!blocked&&operation==='reroll')for(const [index]of(item.affixes||[]).entries()){const bound=targets.indexOf(index);if(bound>=0?bound+1===currency.grade:targets.length<3&&targets.length+1===currency.grade)eligible.push(index);}
  if(currency&&operation==='reroll'&&!eligible.length)blocked='须按下、中、上品依次选定词条；绑定后使用对应品级';
  const note=!currency?'':operation==='roll_affixes'?`每次消耗 1 个${currency.name}${omen?'和 1 个'+omen.name:''}，重新随机生成 ${count} 条词缀，并清除洗炼选定记录；保留基础属性及固定传奇词条。`:`每次消耗 1 个${currency.name}${omen?'和 1 个'+omen.name:''}。首次选定后，该条只用对应品级灵石洗炼；每件装备最多选定3条。`;
  return {currencies,omens,currencyId:this.currencyId,omenId:this.omenId,currencyName:currency?.name,omenName:omen?.name,eligible,operation,count,blocked,note,poolCount:205,message:this.message};
 }
 activate(action,item){
  if(action.op==='hover-currency'){this.currencyId=this.currencyId===action.value?'':action.value;this.message='';return true;}
  if(action.op==='hover-omen'){this.omenId=this.omenId===action.value?'':action.value;this.message='';return true;}
  if(action.op==='hover-identify'){item.unidentified=false;this.message='已鉴定装备';return true;}
  if(!['hover-affix','hover-whole'].includes(action.op))return false;
  const view=this.view(item),index=Number(action.value);if(view.blocked||action.op==='hover-affix'&&!view.eligible.includes(index))return true;
  // Simulate only the author's interaction receipt; values remain fixture data.
  const currency=this.suite.state.items.find(v=>v.id===this.currencyId),omen=this.suite.state.items.find(v=>v.id===this.omenId);currency.count--;if(omen)omen.count--;
  if(action.op==='hover-affix'){item.reforgeTargets??=[];if(!item.reforgeTargets.includes(index))item.reforgeTargets.push(index);this.message=`第 ${index+1} 条词条已洗炼，消耗 1 ${currency.name}${omen?'和 1 个'+omen.name:''}`;}
  else {item.affixes=(item.affixes||[]).slice(0,view.count);item.reforgeTargets=[];this.message=`已重新随机生成 ${view.count} 条词缀，消耗 1 ${currency.name}`;}
  return true;
 }
 reset(){this.currencyId='';this.omenId='';this.message='';}
}

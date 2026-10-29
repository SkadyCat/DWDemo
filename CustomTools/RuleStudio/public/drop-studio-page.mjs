import {UIRuntime} from '/uicreator/runtime/runtime.js';
import {createDropStudioProject} from '/uicreator/assets/rulestudio-hud/drop-studio.js';
import {expectedLoot, sourceStats, poolEntries, tierDistribution, normalized, designCsv, validateDesign} from './drop-studio-model.mjs';
import {assetUrl} from './asset-url.mjs';
import {mountMapDropPools} from './map-drop-pool-view.mjs';

const NS='http://www.w3.org/2000/svg';
const fmt=(n,d=2)=>{const p=10**d,rounded=Math.round((n+Number.EPSILON*Math.max(1,Math.abs(n)))*p)/p;return rounded.toLocaleString('zh-CN',{maximumFractionDigits:d,minimumFractionDigits:0});};
const pct=(n)=>fmt(n*100,2)+'%';
export async function mountDropStudio(root) {
  if(root.dataset.mounted)return; root.dataset.mounted='loading';
  const pending=document.createElement('p');pending.className='drop-loading';pending.textContent='正在读取掉落设计表…';root.replaceChildren(pending);
  try {
    const response=await fetch(assetUrl('/assets/data/drop-design.v1.json'),{cache:'no-cache'});if(!response.ok)throw Error(`数据表 HTTP ${response.status}`);
    const data=validateDesign(await response.json()), project=createDropStudioProject(), state={...project.presentation.defaultState};
    const svg=document.createElementNS(NS,'svg');svg.classList.add('drop-studio-ui');svg.setAttribute('role','group');svg.setAttribute('aria-label','掉落设计台');
    const frame=document.createElement('div');frame.className='drop-studio-frame';frame.append(svg);
    const foot=document.createElement('footer');foot.className='drop-studio-foot';
    const note=document.createElement('p');note.textContent='数据口径：默认实现快照 / 2026-10-26。面板仅展示与试算；不会写入角色存档、掉落服务或规则引擎。钱包灵石不计入。';foot.append(note);
    const principles=document.createElement('details');const summary=document.createElement('summary');summary.textContent='设计原则与数据来源';principles.append(summary);
    for(const principle of data.principles){const p=document.createElement('p');p.textContent=principle;principles.append(p);}
    for(const source of data.sources){const p=document.createElement('p');p.textContent=`${source.meaning} · ${source.file}`;principles.append(p);}
    for(const ref of data.references){const a=document.createElement('a');a.href=ref.url;a.target='_blank';a.rel='noopener';a.textContent=ref.title;principles.append(a);}
    const disclaimer=document.createElement('p');disclaimer.textContent='借鉴 GGG 历史设计原则；本表草案概率为本项目建议值，不是流放之路当前掉率。';principles.append(disclaimer);
    foot.append(principles);root.replaceChildren(frame,foot);
    const ui=new UIRuntime(svg,project,{sound:false,motion:false});svg.querySelector('defs')?.setAttribute('aria-hidden','true');
    const mapPools=mountMapDropPools(ui,svg,state);
    const scroller=ui.renderer.groups.get('ds-item-scroll').group;
    scroller.setAttribute('tabindex','0');scroller.setAttribute('role','region');scroller.setAttribute('aria-label','特殊道具列表，可用方向键滚动');
    scroller.addEventListener('keydown',event=>{
      if(!['ArrowDown','ArrowUp','PageDown','PageUp','Home','End'].includes(event.key))return;
      event.preventDefault();event.stopPropagation();
      const entry=ui.layout.entries.get('ds-item-scroll'),offset=entry.node.layout.scrollOffset||0;
      const max=Math.max(0,...entry.paintChildren.map(id=>{const child=ui.layout.entries.get(id);return child.y+child.height+offset-entry.height;}));
      const next=event.key==='Home'?0:event.key==='End'?max:offset+({ArrowDown:30,ArrowUp:-30,PageDown:180,PageUp:-180})[event.key];
      ui.set('ds-item-scroll',{layout:{scrollOffset:Math.max(0,Math.min(max,next))}});
    });
    function update(){
      const patches=[],set=(id,text)=>patches.push([id,{text:String(text)}]),patch=(id,value)=>patches.push([id,value]);
      const current=expectedLoot(data,'current',state.scenario),draft=expectedLoot(data,'draft',state.scenario),active=state.mode==='draft'?draft:current;
      const scenario=data.scenarios.find(s=>s.id===state.scenario), monster=data.monsters.find(m=>m.id===state.monster);
      const focused=sourceStats(data,state.mode,state.monster),items=poolEntries(data,state.mode,state.monster,state.pool);
      set('ds-status',state.mode==='draft'?'设计草案 v0.1 · 未应用到游戏':'当前实现快照 · 默认配置');
      patch('ds-status-bg',{style:{fill:state.mode==='draft'?'#302a1d':'#18302d',stroke:state.mode==='draft'?'#635332':'#375c53'}});
      set('ds-tier','T'+state.mapTier);set('ds-tier-cap','装备 ≤ T'+Math.min(10,state.mapTier));
      patch('ds-tier-down',{interactable:state.mapTier>1});patch('ds-tier-up',{interactable:state.mapTier<16});
      const select=(id,on)=>patch(id,{brushes:{normal:on?'drop-active':'drop-btn'},style:{strokeWidth:0}});
      for(const mode of ['draft','current'])select('ds-mode-'+mode,state.mode===mode);
      for(const s of data.scenarios)select('ds-scenario-'+s.id,state.scenario===s.id);
      for(const m of data.monsters)select('ds-monster-'+m.id,state.monster===m.id);
      for(const p of ['currency','omen','consumable'])select('ds-pool-'+p,state.pool===p);
      const metrics=[['gear',active.equipment,current.equipment],['rare',active.quality[2],current.quality[2]],['legend',active.quality[3],current.quality[3]],['currency',active.currency,current.currency]];
      for(const [id,value,base]of metrics){set('ds-kpi-'+id+'-value',fmt(value));set('ds-kpi-'+id+'-compare',state.mode==='draft'?`当前 ${fmt(base)} · ${value>=base?'+':''}${fmt(value-base)}`:'现行默认参数 · '+active.monsters+' 次击杀');}
      set('ds-sample-note',`${scenario.name} · ${data.monsters.map(m=>`${scenario.counts[m.id]||0} ${m.short}`).join(' / ')} · 长期期望值，非每局保底`);
      for(const m of data.monsters){const s=sourceStats(data,state.mode,m.id);set('ds-row-'+m.id+'-gear',fmt(s.equipment,3));set('ds-row-'+m.id+'-quality',pct((s.quality[2]+s.quality[3])/s.equipment));set('ds-row-'+m.id+'-currency',pct(s.pools.currency.chance));set('ds-row-'+m.id+'-omen',pct(s.pools.omen.chance));}
      set('ds-quality-title',monster.name+' · 装备结构');
      set('ds-quality-note',state.mode==='current'?'基础池品质分布；Boss 与普通怪一致':({common:'6% 触发装备池；成功后抽取品质',magic:'20% 触发装备池；成功后抽取品质',rare:'1 件保底 + 25% 额外，独立抽取品质',boss:'2 件保底，其中 1 件至少稀有；图为基础池'})[state.monster]);
      const fractions=normalized(focused.ordinaryQuality);
      data.qualities.forEach((q,i)=>{patch('ds-quality-'+q.id+'-bar',{value:fractions[i]});set('ds-quality-'+q.id+'-value',pct(fractions[i]));});
      set('ds-directed-label','额外定向池');set('ds-directed-value',focused.directed?pct(focused.directed):'无');
      set('ds-items-source',monster.name+' · '+(state.mode==='draft'?'独立奖励池':'共用一次物品抽取'));
      set('ds-pool-trigger',`触发 ${pct(items.chance)} · 数量 ${items.count[0]===items.count[1]?items.count[0]:items.count.join('–')}`);
      for(let i=0;i<10;i++){
        const item=items.entries[i];patch('ds-item-'+i,{visibility:item?'visible':'collapsed'});if(!item)continue;
        set('ds-item-'+i+'-name',item.name);set('ds-item-'+i+'-weight',item.weight);set('ds-item-'+i+'-share',pct(item.conditional));
        set('ds-item-'+i+'-expected',fmt(item.expected*100,3));patch('ds-item-'+i+'-bar',{value:item.conditional});
      }
      set('ds-item-foot',state.pool==='omen'?'10 项预兆 · 滚轮或方向键滚动；表中产出为每百次同类击杀。':state.mode==='draft'?'池内占比 × 独立池触发 × 平均堆叠 = 每击杀预期数量':'当前 20 条目共用一次抽取；子类之间互斥，表中概率为边际概率。');
      for(const id of ['currency','omen','consumable','maps']){const max=Math.max(current[id],draft[id],1);set('ds-output-'+id+'-values',fmt(current[id])+' → '+fmt(draft[id]));patch('ds-output-'+id+'-current',{value:current[id]/max});patch('ds-output-'+id+'-draft',{value:draft[id]/max});}
      const dist=tierDistribution(state.mapTier,state.mode),cap=Math.min(10,state.mapTier);
      set('ds-tier-policy',`装备上限 T${cap} · ${state.mode==='draft'?dist.filter(v=>v.probability).map(v=>'T'+v.tier+' '+pct(v.probability)).join(' / '):'T1 至 T'+cap+' 等概率 '+pct(1/cap)}`);
      dist.forEach((v,i)=>{patch('ds-gear-tier-'+i,{value:v.probability});patch('ds-gear-tier-'+i+'-label',{text:'T'+v.tier,style:{color:v.probability?'#b9dbcf':'#4f6277'}});});
      set('ds-boss-note',state.mode==='draft'?'额外 15% · 每系列 5 个现有模板 · 原全局途径保留':'当前无 Boss 专属定向池；系列装备保留全局抽取');
      ui.setMany(patches);
      svg.dataset.mode=state.mode;svg.dataset.scenario=state.scenario;svg.dataset.monster=state.monster;svg.dataset.pool=state.pool;svg.dataset.mapTier=state.mapTier;
      root.dataset.mounted='ready';root.dataset.version=data.version;
    }
    ui.addEventListener('activate',e=>{
      const op=e.detail.node.action?.op;if(!op)return;
      if(mapPools.activate(op))return;
      if(op==='export'){
        const blob=new Blob([designCsv(data)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
        a.href=url;a.download='爬塔掉落池-当前与草案-v0.1.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;
      }
      const [kind,value]=op.split(':');
      if(kind==='tier')state.mapTier=Math.max(1,Math.min(16,state.mapTier+Number(value)));
      else if(['mode','scenario','monster','pool'].includes(kind)){state[kind]=value;if(kind==='pool'||kind==='monster')ui.set('ds-item-scroll',{layout:{scrollOffset:0}});}
      update();
    });
    update();
    void mapPools.refresh();
    return {ui,state,data,mapPools};
  }catch(error){root.dataset.mounted='error';pending.textContent='掉落设计表加载失败：'+error.message;root.replaceChildren(pending);throw error;}
}

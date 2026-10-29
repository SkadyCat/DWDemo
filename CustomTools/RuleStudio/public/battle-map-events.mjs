import {ref,onMounted,onBeforeUnmount,watch,nextTick} from '/vendor/vue.esm-browser.prod.js';
import {UIRuntime} from '/uicreator/runtime/runtime.js';
import {ItemInspector} from '/uicreator/runtime/item-inspector.js';
import {createNode} from '/uicreator/core/model.js';
import {equipmentCell} from '/uicreator/assets/rulestudio-hud/equipment-cell.js';
import {qualityBrushes,qualityColor} from '/uicreator/assets/rulestudio-hud/equipment-style.js';
import {store} from '/editors.mjs';
import {player} from '/player.mjs';
import {iconSrc} from '/game-icons.mjs';
import {affixText} from '/affix-text.mjs';
import {rollEquipment} from '/equipment-generation.mjs';
import {craftEquipment} from '/equipment-crafting.mjs';
import {currencyCraft} from '/engine/crafting.mjs';
import {isFixedEquipmentSlot} from '/engine/equipment-slots.mjs';
import {fusionError,fuseEquipment,fusionLines,freeAltarCraft,setEventLocks,eventLocked} from '/map-events-model.mjs';

const names={fusion:'万相合成祭坛',altar:'百炼法坛',choice:'遗珍神龛 · 传奇三选一',vault:'封印宝库'};
const clone=value=>JSON.parse(JSON.stringify(value));
export const BattleMapEvents={
  props:{runKey:Number,tier:Number,menu:Boolean},emits:['open','close','changed','menu-close','status'],
  setup(props,{emit}){
    const launcher=ref(null),scene=ref(null),opened=ref(false),error=ref(''),menuStyle=ref({});
    let project,entry,ui,inspector,inspectionItems=[],kind='fusion',records={},side=0,page=0,message='',drag=null,ghost=null,ghostUI=null,dropTarget=-1,disposed=false,drawId=0;
    const blobs=new Map(),events=new AbortController();
    const state=()=>records[kind]||=(kind==='fusion'?{left:'',right:'',phase:'select'}:kind==='altar'?{uid:'',locked:false,count:0,index:0}:{});
    const rewardMode=()=>kind==='choice'||kind==='vault';
    const altarCurrencies=()=> (project?.root?.source?.altarCurrencies||[]).map(id=>store.collections.item.get(id)?.doc).filter(doc=>doc?.category==='currency');
    function currency(doc){const s=state();s.currencyId=doc.id;s.currencyName=doc.name;s.currencyOp=currencyCraft(doc).op;s.index=0;}
    function boundAffix(item){const grade=currencyCraft(store.collections.item.get(state().currencyId)?.doc).grade??1;return item?.reforgeTargets?.[grade-1];}
    function selectedAffix(item){return boundAffix(item)??Math.min(state().index,Math.max(0,(item?.affixes?.length||0)-1));}
    const node=id=>ui?.nodes.get(id);
        // UIRuntime batches changes via setMany; no generated HTML controls.
    function patch(id,value){if(node(id))ui.setMany([[id,value]]);}
    function label(id,text,color){patch(id,{text,...(color?{style:{color}}:{})});}
    function action(id,text,enabled=true){label(id+'-label',text);patch(id,{interactable:enabled,style:{opacity:enabled?1:.42}});}
    function unlock(){setEventLocks(player,[]);}
    function locks(){const ids=[];for(const [key,r]of Object.entries(records)){if(key==='fusion'&&r.phase==='locked')ids.push(r.left,r.right);if(key==='altar'&&r.locked&&!r.spent)ids.push(r.uid);}setEventLocks(player,ids);}
    async function icon(item,kind='equipment'){const src=iconSrc(kind,item);if(!blobs.has(src))blobs.set(src,fetch(src,{signal:events.signal}).then(r=>r.ok?r.blob():null).then(blob=>blob?URL.createObjectURL(blob):'').catch(()=>''));return blobs.get(src);}
    async function cell(id,item,x,y,size,op,value){const result=equipmentCell(project,id,item?{...item,iconSrc:await icon(item)}:null,x,y,size,{type:'ui',op,value});result.name=item?`T${item.tier} ${item.name}`:'空装备格';return result;}
    function textNode(id,text,y,height,color='#b7c8d6',op=null){return createNode(op?'Button':'TextBlock',{id,name:text,text:op?'':text,action:op,slot:{offsets:{left:0,top:y,right:410,bottom:height}},layout:{width:410,height},style:{fontSize:12,color,wrap:true,fill:op?'#162431':'transparent',radius:4},children:op?[createNode('TextBlock',{id:id+'-text',text,style:{fontSize:12,color,wrap:true}})]:[]});}
    function lines(item,index){
      const s=state();let y=0;
      const list=item?fusionLines(item):[];
      const rows=list.map((line,i)=>{const height=Math.max(34,Math.ceil(affixText(line.affix,store.library).length/29)*18+14);const row=textNode('live-line-'+index+'-'+i,(line.fixed?'◆ 传奇 · ':'')+affixText(line.affix,store.library),y,height,line.fixed?'#e4b071':'#b1c8dc',kind==='altar'&&s.currencyOp==='reroll'&&!line.fixed&&s.locked?{type:'ui',op:'affix',value:i-list.filter(l=>l.fixed).length}:null);y+=height+4;return row;});
      if(!rows.length)rows.push(textNode('live-line-empty-'+index,item?'无随机词条':'放入装备后，在这里查看参与抽取的词条',0,70,'#677d90'));
      ui.setChildren('affixes-'+index,[createNode('CanvasPanel',{id:'live-lines-'+index,layout:{width:410,height:Math.max(140,y)},children:rows})]);
    }
    async function render(){
      if(!ui||!opened.value)return;const generation=++drawId,s=state(),fusion=kind==='fusion',altar=kind==='altar',rewards=!fusion&&!altar;
      const result=s.result,items=fusion?[result||player.instances[s.left],result?null:player.instances[s.right]]:altar?[player.instances[s.uid],null]:[s.offers?.[s.selected??0],null];
      label('event-title',names[kind]);
      label('event-description',fusion?'投入两件同部位装备；保留左件底材与 T 阶，随机合并左右词条。':altar?'锁定一件装备后可免费反复制作；锁定前点击右格切换通货。':kind==='choice'?'从三件随机传奇中选择一件领取。关闭界面不会刷新候选。':'开启宝库后，从三件珍藏装备中选择一件。');
      const children=await Promise.all(items.map((item,i)=>cell('live-input-'+i,item,0,0,76,'slot',i)));
      const currencyIcon=altar?await icon(store.collections.item.get(s.currencyId)?.doc,'item'):'';
      if(disposed||generation!==drawId)return;
      for(let i=0;i<2;i++){
        const item=items[i];ui.setChildren('input-'+i+'-content',item?children[i].children:[createNode('TextBlock',{id:'empty-plus-'+i,text:'＋',locked:true,slot:{offsets:{left:0,top:0,right:76,bottom:76}},style:{fontSize:28,color:'#8298ae',textAlign:'center'}})]);
        patch('input-frame-'+i,{style:{stroke:s.phase==='locked'?'#79ab9b':fusion&&side===i?'#8d7549':'#2c3b4b'}});
        patch('input-'+i,{brushes:qualityBrushes('cell',item?.rarity||'empty')});
        label('side-title-'+i,fusion?(result?(i?'抽取记录':'合成结果'):(i?'右件 · 贡献词条':'左件 · 保留底材')):altar?(i?'指定通货 · 无限使用':'绑定装备'):(i?'领取规则':'当前珍藏'));
        label('item-name-'+i,item?`T${item.tier} · ${item.name}`:i&&!fusion?(altar?s.currencyName:'三选一 · 只领一件'):'点击装备格放入',item?qualityColor(item.rarity):'#8195a6');
        label('item-meta-'+i,item?`${fusionLines(item).length} 条词条 · 悬停查看`:fusion?(s.phase==='locked'?'已锁定':'点击或拖入装备'):altar?(i?'通货无法带走':'锁定后不能换装'):'只可领取一件');
        lines(item,i);
      }
      if(fusion&&result){label('item-name-1',`左 ${s.fromLeft} 条 ＋ 右 ${s.fromRight} 条`);label('item-meta-1',`${s.fixed} 条传奇 · 原件已消耗`);ui.setChildren('affixes-1',[textNode('result-note','合成结果已加入背包。关闭界面也不会丢失。\n底材、基础属性、技能和 T 阶均沿用左件；抽中的词条保留原数值。',0,140)]);}
      if(!fusion){patch('input-0',{interactable:(altar||rewards)&&!s.locked&&!s.spent});patch('input-1',{interactable:altar&&!s.locked&&!s.spent});ui.setChildren('input-1-content',currencyIcon?[createNode('Image',{id:'altar-currency-icon',src:currencyIcon,slot:{offsets:{left:5,top:5,right:66,bottom:66}}})]:[]);}
      if(altar)label('item-meta-1',s.locked?'通货已固定 · 不消耗背包材料':'点击右格切换通货');
      if(rewards)ui.setChildren('affixes-1',[textNode('reward-notice',s.spent?'已领取一件珍藏，本地图不能再次领取。':'三件候选只生成一次。点击下方卡片查看词条，再确认领取；其余两件会被放弃。',0,140)]);
      if(altar){ui.setChildren('affixes-1',[textNode('currency-help',`指定通货：${s.currencyName}\n本地图已制作 ${s.count} 次\n${s.currencyOp==='reroll'?'点击左侧随机词条，选定需要洗炼的一条。':s.currencyOp==='remove_affixes'?'随机移除随机词缀，保留基础属性与固定传奇。':s.currencyOp==='add_affixes'?'保留已有词条，随机增加新的词缀。':'每次重新生成整件装备的随机词条。'}\n领取装备后，本法坛结束。`,0,140)]);}
      const list=rewards?(s.offers||[]):Object.values(player.instances).filter(item=>item.identified!==false&&!isFixedEquipmentSlot(item.slot));
      const pages=Math.max(1,Math.ceil(list.length/24));page=Math.max(0,Math.min(page,pages-1));
      const grid=node('event-bag').source.grid;
      const bag=await Promise.all(Array.from({length:24},(_,i)=>{const item=list[page*24+i];const used=rewards?page*24+i===(s.selected??0):fusion?[s.left,s.right].includes(item?.uid):s.uid===item?.uid,equipped=item&&Object.values(player.loadout.equipment).includes(item.uid);return cell('event-bag-'+i,item?{...item,mark:used?(rewards?'已选中':'已放入'):equipped?'已穿戴':''}:null,i%grid.columns*grid.pitchX,Math.floor(i/grid.columns)*grid.pitchY,grid.cell,rewards?'offer':'bag',rewards?page*24+i:item?.uid||'');}));
      inspectionItems=await Promise.all([...new Map([...items,...list.slice(page*24,page*24+24)].filter(Boolean).map(item=>[item.uid,item])).values()].map(async item=>({...item,id:item.uid,kind:'equipment',count:1,iconSrc:await icon(item),baseLines:(item.bases||[]).map(a=>affixText(a,store.library)),fixedLines:fusionLines(item).filter(l=>l.fixed).map(l=>affixText(l.affix,store.library)),affixes:(item.affixes||[]).map(a=>({text:affixText(a,store.library),tier:a.tier}))})));
      if(disposed||generation!==drawId)return;
      ui.setChildren('event-bag',bag);
      label('bag-title',rewards?'珍藏候选 · 点击或拖入查看，确认领取':`装备背包 · 当前放入${side?'右':'左'}格`);label('bag-meta',rewards?'候选已固定，关闭不会重抽':`${list.length} 件 · 未穿戴装备可投入`);label('bag-page',`${page+1} / ${pages}`);
      label('bag-drag-help',rewards?'按住候选装备拖到右侧「当前珍藏」格 · 点击领取后才收入背包':'拖拽装备到右侧放入格 · 未锁定时可拖回背包');
      const selectAffix=altar&&s.currencyOp==='reroll'&&!!items[0]&&!s.spent,affix=selectedAffix(items[0]),fixed=boundAffix(items[0]);
      patch('event-affix-target',{visibility:selectAffix?'visible':'collapsed',interactable:selectAffix&&fixed===undefined&&(items[0]?.affixes?.length||0)>1});
      patch('bag-meta',{visibility:'visible'});
      label('event-affix-target-label',items[0]?.affixes?.length?`第 ${affix+1} 条 · ${fixed===undefined?'点击切换':'已绑定'}`:'没有随机词条');
      patch('event-samples',{visibility:rewards||s.result?'collapsed':'visible',interactable:!s.spent&&s.phase!=='locked'&&!s.locked});
      patch('bag-prev',{interactable:page>0});patch('bag-next',{interactable:page+1<pages});
      let primary='',enabled=true,secondary='取回装备',secondEnabled=true;
      if(fusion){primary=result?'本次合成已完成':s.phase==='locked'?'确认合成 · 消耗两件':'锁定两件装备';enabled=!result&&!fusionError(player,s.left,s.right);secondary=s.phase==='locked'?'解除锁定':'清空投入';secondEnabled=!result;}
      else if(altar){primary=s.spent?'法坛已结束':s.locked?'免费制作 · '+s.currencyName:'锁定这件装备';enabled=!!s.uid&&!s.spent;secondary='领取并结束法坛';secondEnabled=s.locked&&!s.spent;}
      else {primary=s.spent?'已经领取':kind==='vault'&&!s.offers?'开启宝库':'领取选中装备';enabled=!s.spent;secondary='';secondEnabled=false;}
      action('event-primary',primary,enabled);action('event-secondary',secondary,secondEnabled);patch('event-secondary',{visibility:rewards?'collapsed':'visible'});
      label('event-status',message||(fusion?(result?'合成完成 · 新装备已放回背包':fusionError(player,s.left,s.right)||(s.phase==='locked'?'两件装备已锁定，确认后消耗':'已就绪，先锁定两件装备')):altar?(s.spent?'已领取装备，本地图法坛已结束':`法坛指定：${s.currencyName} · 已制作 ${s.count} 次 · 免费使用`):s.spent?'已领取一件珍藏，本地图不能再次领取':kind==='vault'&&!s.offers?'先开启宝库，再选择一件珍藏':'请选择想要的装备'));
      label('event-warning',fusion?'左右各随机抽取 0～全部词条；固定传奇参与抽取，可保留多条传奇。':altar?'锁定后本地图不能换装；离开地图保留当前结果。':'三件选一件；候选和词条只生成一次。');
      locks();
    }
    function offers(rarity){const templates=[...store.collections.equipment.values()].map(e=>e.doc).filter(d=>d.rarity===rarity&&!isFixedEquipmentSlot(d.slot));return Array.from({length:3},()=>{const template=templates[Math.floor(Math.random()*templates.length)];if(!template)throw Error('没有可用的装备底材');return rollEquipment(template,store.library,{rarity,tier:Math.min(props.tier||1,template.tier||props.tier||1)});});}
    function prepare(){const s=state();if(kind==='choice'&&!s.offers)s.offers=offers('legendary');if(kind==='altar'&&!s.currencyId){const all=altarCurrencies(),doc=all.find(d=>d.craft?.op==='roll_affixes')||all[0];if(!doc)throw Error('没有可用的法坛通货');currency(doc);}}
    function positionMenu(){const button=document.querySelector('[data-battle-function="events"]');if(!button)return;const rect=button.getBoundingClientRect();menuStyle.value={left:Math.max(8,rect.left-216)+'px',top:Math.max(8,Math.min(innerHeight-232,rect.top))+'px'};}
    function closeMenu(focus=false){emit('menu-close');if(focus)document.querySelector('[data-battle-function="events"]')?.focus({preventScroll:true});}
    async function open(value){try{if(!project)throw Error('奇遇界面正在加载，请稍后重试');kind=value;prepare();message='';page=0;side=0;closeMenu();opened.value=true;emit('open');await nextTick();if(!ui){ui=new UIRuntime(scene.value,clone(project),{sound:false,motion:false});bind(ui);}await render();scene.value?.focus();}catch(e){error.value=e.message;}}
    function close(){cancelDrag();inspector?.destroy();inspector=null;opened.value=false;ui?.destroy();ui=null;drawId++;emit('close');document.querySelector('[data-battle-function="events"]')?.focus({preventScroll:true});}
    function trap(event){const controls=[...scene.value.querySelectorAll('[role="button"][tabindex="0"]')].filter(el=>el.getAttribute('aria-disabled')!=='true');const first=controls[0],last=controls.at(-1);if(!first){event.preventDefault();return;}if(event.shiftKey&&(document.activeElement===first||document.activeElement===scene.value)){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
    function place(uid,index=side){const s=state(),item=player.instances[uid];if(!item)return;if(s.phase==='locked'||s.result||s.locked||s.spent){message='装备已经锁定';return;}if(eventLocked(player,uid)){message='这件装备已被另一个祭坛锁定';return;}if(Object.values(player.loadout.equipment).includes(uid)){message='请先卸下正在穿戴的装备';return;}if(kind==='fusion'){const other=index?s.left:s.right;if(other===uid){message='同一件装备不能重复放入';return;}if(other&&player.instances[other]?.slot!==item.slot){message='只能投入同部位的两件装备';return;}s[index?'right':'left']=uid;side=index?0:1;message=`${index?'右':'左'}件已放入：${item.name}`;}else if(kind==='altar'){s.uid=uid;message='已放入，锁定后才能免费制作';}}
    async function activate(a){const s=state();message='';
      try{
        if(a.op==='open')return open(a.value);
        if(a.op==='close')return close();
        if(a.op==='slot'){
          if(rewardMode()){message='点击左侧候选，或将候选拖到当前珍藏格；确认后领取';}
          else if(kind==='altar'&&Number(a.value)===1){if(!s.locked&&!s.spent){const all=altarCurrencies(),index=all.findIndex(doc=>doc.id===s.currencyId);currency(all[(index+1)%all.length]);message=`已选择${s.currencyName}，锁定装备后可免费使用`;}}
          else {side=Number(a.value);message=`选择左侧背包中的装备放入${side?'右':'左'}格`;}
        }
        if(a.op==='next-affix'&&kind==='altar'){const item=player.instances[s.uid];if(boundAffix(item)===undefined&&item?.affixes?.length){s.index=(s.index+1)%item.affixes.length;message=`已选定第 ${s.index+1} 条随机词条；首次制作后固定`;}}
        if(a.op==='bag')place(a.value);
        if(a.op==='page')page+=Number(a.value);
        if(a.op==='offer'&&!s.spent&&s.offers?.[a.value])s.selected=Number(a.value);
        if(a.op==='affix'){s.index=Number(a.value);message=`已选定第 ${s.index+1} 条随机词条`;}
        if(a.op==='samples'&&!s.locked&&s.phase!=='locked'&&!s.spent){const all=[...store.collections.equipment.values()].map(e=>e.doc).filter(d=>d.rarity==='legendary'&&d.slot==='weapon');const templates=[all.find(d=>d.id==='embers_echo_1_weapon')||all[0],all.find(d=>d.id==='myriad_swords_t1_weapon')||all.at(-1)];for(const t of templates){const item=rollEquipment(t,store.library,{tier:t.tier||1});player.instances[item.uid]=item;}message='已补充两件同部位传奇测试装备';emit('changed');}
        if(a.op==='secondary'){if(kind==='fusion'){if(s.phase==='locked')s.phase='select';else{s.left='';s.right='';side=0;}message='装备保留在背包中';}else if(kind==='altar'&&s.locked){s.spent=true;message='已领取装备，本地图法坛已结束';}}
        if(a.op==='primary'){
          if(kind==='fusion'&&!s.result){const error=fusionError(player,s.left,s.right);if(error)message=error;else if(s.phase!=='locked'){s.phase='locked';message='两件装备已锁定 · 再次确认将消耗两件原装备';}else{const result=fuseEquipment(player,s.left,s.right);if(result.error)message=result.error;else{Object.assign(s,result,{phase:'done'});emit('changed');}}}
          else if(kind==='altar'&&!s.spent){if(!s.uid)message='先放入一件装备';else if(!s.locked){s.locked=true;message='本地图已绑定此装备，可免费反复制作';}else{const result=freeAltarCraft(player,s.uid,s.currencyId,craftEquipment,store.collections,store.library,store.tags,{index:s.currencyOp==='reroll'?selectedAffix(player.instances[s.uid]):null});if(result.error)message=result.error;else{s.count++;message=`第 ${s.count} 次制作完成 · 未消耗背包通货`;emit('changed');}}}
          else if(!s.spent){if(kind==='vault'&&!s.offers){s.offers=offers('rare');message='宝库已开启，选择一件珍藏';}else{const item=s.offers?.[s.selected??0];if(item){player.instances[item.uid]=clone(item);s.spent=true;message=`已领取 ${item.name}，其余候选已放弃`;emit('changed');}}}
        }
      }catch(e){message=e.message;}
      emit('status',Object.entries(records).map(([kind,s])=>({kind,completed:!!s.spent||s.phase==='done'})));
      await render();
    }
    function target(el){const g=el?.closest?.('[data-node-type="Button"]');return g&&scene.value?.contains(g)?ui?.nodes.get(g.getAttribute('data-node-id')):null;}
    function markDrop(index){if(index===dropTarget)return;if(dropTarget>=0)ui?.renderer.groups.get('input-frame-'+dropTarget)?.group.removeAttribute('data-drop-target');dropTarget=index;if(index>=0)ui?.renderer.groups.get('input-frame-'+index)?.group.setAttribute('data-drop-target','');}
    function cancelDrag(){const nodeId=drag?.nodeId;drag=null;markDrop(-1);ghostUI?.destroy();ghostUI=null;ghost?.remove();ghost=null;if(ui){ui.pressedId=null;if(nodeId)ui.states.delete(nodeId);ui.paint();}}
    function inputUid(index){const s=state();return kind==='fusion'?(index?s.right:s.result?'':s.left):kind==='altar'&&index===0?s.uid:'';}
    function dropIndex(el){const a=target(el)?.action;if(a?.op!=='slot'||state().spent)return -1;const index=Number(a.value);return kind==='fusion'||(kind==='altar'||rewardMode())&&index===0?index:-1;}
    function startGhost(){
      if(ghost||!drag)return;inspector?.close();ui.pressedId=null;
      ghost=document.createElementNS('http://www.w3.org/2000/svg','svg');ghost.classList.add('event-drag-ghost');ghost.setAttribute('aria-hidden','true');document.body.append(ghost);
      const source=ui.nodes.get(drag.nodeId),root=clone(source);root.slot.offsets.left=root.slot.offsets.top=0;
      ghostUI=new UIRuntime(ghost,{...project,root,viewport:{width:root.layout.width,height:root.layout.height,background:'transparent'}},{width:root.layout.width,height:root.layout.height,motion:false,sound:false});
    }
    function inspectionNode(n){if(!n)return null;const a=n.action||{},s=state();let uid=a.op==='bag'?a.value:a.op==='offer'?s.offers?.[a.value]?.uid:a.op==='slot'?(kind==='fusion'?(Number(a.value)===0?s.result?.uid||s.left:s.result?'':s.right):kind==='altar'&&!Number(a.value)?s.uid:s.offers?.[s.selected??0]?.uid):'';return inspectionItems.some(item=>item.uid===uid)?{...n,action:{...a,value:uid}}:null;}
    function bind(runtime){runtime.addEventListener('activate',e=>{if(drag?.active)return;inspector?.close();void activate(e.detail.node.action||{});});if(runtime!==ui)return;const suite={owner:{runtime,state:{panel:'map-events'}},standalone:'map-events',state:{overlays:[],get items(){return inspectionItems;}},get drag(){return drag;},itemAt:el=>inspectionNode(target(el)),inspectorNode:id=>inspectionNode(ui?.nodes.get(id)),inspectAction:()=>{}};inspector=new class extends ItemInspector{render(item){super.render(item);if(this.host)this.host.style.zIndex='20010';}}(suite,{readOnly:true});}
    onMounted(async()=>{try{project=await fetch('/ui/map-events.uialpha.json').then(r=>r.json());if(disposed)return;entry=new UIRuntime(launcher.value,clone(project),{prefabId:'event-launcher',sound:false,motion:false});bind(entry);if(new URLSearchParams(location.search).get('prototype')==='map-events'&&props.runKey>0)await open('fusion');}catch(e){error.value=e.message;}
      const opts={signal:events.signal};
      window.addEventListener('pointerdown',e=>{if(props.menu&&!e.target.closest?.('.b3-event-entry,[data-battle-function="events"]'))closeMenu();},{...opts,capture:true});
      window.addEventListener('resize',()=>{if(props.menu)positionMenu();},opts);
      // Window listeners own the gesture, including release outside the SVG. Keep simple clicks uncaptured.
      window.addEventListener('pointerdown',e=>{
        const n=target(e.target),a=n?.action,s=state();
        if(e.button!==0||!opened.value||s.locked||s.phase==='locked'||s.spent||s.result)return;
        const reward=rewardMode(),offerIndex=reward?(a?.op==='offer'?Number(a.value):a?.op==='slot'&&Number(a.value)===0?s.selected??0:-1):-1;
        const uid=reward?s.offers?.[offerIndex]?.uid:a?.op==='bag'?a.value:a?.op==='slot'?inputUid(Number(a.value)):'';
        const item=reward?s.offers?.[offerIndex]:player.instances[uid];
        if(!item||item.identified===false||!reward&&(Object.values(player.loadout.equipment).includes(uid)||eventLocked(player,uid)))return;
        e.preventDefault();inspector?.close();
        drag={uid,nodeId:n.id,action:{...a},reward,offerIndex,from:a.op==='slot'?Number(a.value):-1,x:e.clientX,y:e.clientY,id:e.pointerId};
      },{...opts,capture:true});
      // Capture before the inspector can mark a drag active. Ghost creation is idempotent.
      window.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>6)drag.active=true;if(!drag.active)return;startGhost();ghost.style.left=e.clientX+12+'px';ghost.style.top=e.clientY+12+'px';markDrop(dropIndex(document.elementFromPoint(e.clientX,e.clientY)));},{...opts,capture:true});
      window.addEventListener('pointerup',e=>{
        if(!drag||drag.id!==e.pointerId)return;
        if(!drag.active){const d=drag;cancelDrag();void activate(d.action);e.stopImmediatePropagation();return;}
        const d=drag,el=document.elementFromPoint(e.clientX,e.clientY),index=dropIndex(el),s=state();ui.pressedId=null;
        if(d.reward){
          if(index===0&&!s.spent&&s.offers?.[d.offerIndex]?.uid===d.uid){s.selected=d.offerIndex;message='已选定珍藏，点击领取后收入背包';}
          else message='已取消拖拽，当前选择不变';
        }else if(index>=0){
          if(d.from===index)message='装备仍在原放入格';
          else if(d.from>=0&&kind==='fusion'){const from=d.from?'right':'left',to=index?'right':'left';[s[from],s[to]]=[s[to],s[from]];message='已移动投入装备';}
          else place(d.uid,index);
        }else if(d.from>=0&&el?.closest?.('[data-node-id="event-backpack"]')){
          if(kind==='altar')s.uid='';else s[d.from?'right':'left']='';message='已取回装备';
        }else message='已取消拖拽，装备未变';
        cancelDrag();e.stopImmediatePropagation();void render();
      },{...opts,capture:true});
      window.addEventListener('pointercancel',cancelDrag,opts);window.addEventListener('blur',cancelDrag,opts);
      window.addEventListener('keydown',e=>{if(props.menu&&e.code==='Escape'){e.preventDefault();e.stopImmediatePropagation();closeMenu(true);return;}if(opened.value&&inspector?.handleKey(e)){e.stopImmediatePropagation();return;}if(opened.value&&e.code==='Escape'){e.preventDefault();e.stopImmediatePropagation();if(drag)cancelDrag();else close();}},{...opts,capture:true});
    });
    watch(()=>props.menu,async visible=>{if(visible){positionMenu();await nextTick();launcher.value?.querySelector('[data-node-id="launch-0"]')?.focus({preventScroll:true});}});
    watch(()=>props.runKey,()=>{unlock();records={};message='';if(opened.value)close();if(project&&new URLSearchParams(location.search).get('prototype')==='map-events')void open('fusion');});
    onBeforeUnmount(()=>{disposed=true;events.abort();cancelDrag();unlock();inspector?.destroy();ui?.destroy();entry?.destroy();for(const value of blobs.values())value.then(url=>url&&URL.revokeObjectURL(url));});
    return{launcher,scene,opened,error,trap,menuStyle,open};
  },
  template:`<section v-show="menu" id="battle-event-menu" class="b3-event-entry" :style="menuStyle" aria-label="地图奇遇入口" @pointerdown.stop @pointermove.stop @wheel.stop @keydown.stop><svg ref="launcher" xmlns="http://www.w3.org/2000/svg" aria-label="祭坛与奇遇入口"></svg><p v-if="error" role="alert">{{error}}</p></section><teleport to="body"><div v-if="opened" class="b3-event-layer" role="dialog" aria-modal="true" aria-label="地图奇遇" @keydown.tab="trap" @pointerdown.stop @wheel.stop><svg ref="scene" xmlns="http://www.w3.org/2000/svg" tabindex="0" aria-label="祭坛：两个装备投入格与装备背包"></svg></div></teleport>`
};

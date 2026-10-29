import {mapPoolEntries} from './drop-studio-model.mjs';
import {iconSrc} from './game-icons.mjs';

const categories = {all:'全部', equipment:'装备', currency:'制作通货', omen:'预兆', consumable:'消耗品', material:'材料'};
const rarities = {common:'普通', magic:'魔法', rare:'稀有', legendary:'传奇'};
const slots = {weapon:'武器', offhand:'副手', helmet:'头盔', chest:'胸甲', gloves:'手套', boots:'鞋子', belt:'腰带', ring:'戒指', amulet:'护符'};
function walk(node, visit) { visit(node); for (const child of node.children || []) walk(child, visit); }

// Hydrate the authored UICreator cells with catalogue data. Geometry stays in the project.
export function mountMapDropPools(ui, svg, state) {
  const templates = structuredClone(ui.nodes.get('ds-map-grid').children), pageSize = templates.length;
  const iconCache=new Map();
  let snapshot = null, visible = [], loading = false, error = '', request = 0, images=new Map();
  async function resolveIcon(entry) {
    const source=iconSrc(entry.kind,entry);
    if(!iconCache.has(source))iconCache.set(source,(async()=>{
      const response=await fetch(source);
      if(!response.ok)throw Error('物品图标读取失败：'+entry.name);
      // UICreator Image controls accept locally owned blob resources, not external URLs.
      const blob=await response.blob();if(!/^image\/(png|jpeg|webp|gif)$/.test(blob.type))throw Error('物品图标格式无效：'+entry.name);
      return URL.createObjectURL(blob);
    })().catch(error=>{iconCache.delete(source);throw error;}));
    return iconCache.get(source);
  }
  function annotate() {
    for (let i = 0; i < templates.length; i++) {
      const group = ui.renderer.groups.get(templates[i].id)?.group, entry = visible[i];
      if (!group) continue;
      if (entry) {
        group.dataset.candidateId = entry.id; group.dataset.candidateKind = entry.kind;
        group.setAttribute('aria-pressed',String(entry.id===state.mapSelected));
        let title = group.querySelector(':scope > title');
        if (!title) { title = document.createElementNS('http://www.w3.org/2000/svg','title'); group.append(title); }
        title.textContent = `${entry.name}\n${entry.id}${entry.description ? '\n' + entry.description : ''}`;
      } else { delete group.dataset.candidateId; delete group.dataset.candidateKind; group.removeAttribute('aria-pressed');group.querySelector(':scope > title')?.remove(); }
    }
    for (let i = 0; i < 10; i++) {
      const group = ui.renderer.groups.get('ds-map-' + i)?.group, map = snapshot?.maps[i];
      if (group) { if (map) {group.dataset.mapId = map.id;group.setAttribute('aria-pressed',String(map.id===state.mapId));} else {delete group.dataset.mapId;group.removeAttribute('aria-pressed');} }
    }
    for(const id of Object.keys(categories))ui.renderer.groups.get('ds-map-filter-'+id)?.group.setAttribute('aria-pressed',String(state.mapCategory===id));
  }
  ui.addEventListener('paint', annotate);
  function update() {
    const map = snapshot?.maps.find(map => map.id === state.mapId);
    const entries = map ? mapPoolEntries(snapshot, map.id, state.mapCategory) : [];
    const pages = Math.max(1, Math.ceil(entries.length / pageSize));
    state.mapPage = Math.max(0, Math.min(pages - 1, state.mapPage));
    visible = entries.slice(state.mapPage * pageSize, (state.mapPage + 1) * pageSize);
    const selected = entries.find(entry => entry.id === state.mapSelected);
    const patches = [], text = (id,value) => patches.push([id,{text:String(value)}]);
    const choose = (id,active) => patches.push([id,{brushes:{normal:active?'drop-active':'drop-btn'}}]);
    for (let i = 0; i < 10; i++) {
      const choice = snapshot?.maps[i];
      patches.push(['ds-map-' + i,{visibility:choice?'visible':'collapsed',interactable:!!choice&&!loading,name:choice?.name||''}]);
      text('ds-map-'+i+'-text',choice ? '地图 T' + choice.maxTier : '');
      choose('ds-map-'+i,choice?.id === state.mapId);
    }
    for (const [id,label] of Object.entries(categories)) {
      const count = map ? mapPoolEntries(snapshot,map.id,id).length : 0;
      text('ds-map-filter-'+id+'-text',label+' '+count);
      patches.push(['ds-map-filter-'+id,{interactable:!!map&&!loading}]);
      choose('ds-map-filter-'+id,state.mapCategory===id);
    }
    text('ds-map-status',loading?'正在读取地图掉落池…':error?'读取失败':map?`当前配置 · ${map.customized?'地图专属池':'默认公共池'}`:'暂无地图配置');
    text('ds-map-summary',map?`${map.name} · ${map.equipmentIds.length} 件装备 / ${map.itemIds.length} 种道具 · 装备最高 T${map.maxTier}`:'');
    text('ds-map-count',entries.length?`${state.mapPage*pageSize+1}–${state.mapPage*pageSize+visible.length} / ${entries.length} 项`:'0 项');
    text('ds-map-page',(state.mapPage+1)+' / '+pages);
    text('ds-map-empty',loading?'正在读取地图掉落池…':error?error:!map?'尚未配置地图':!entries.length?'这张地图的此类掉落池为空':'');
    patches.push(['ds-map-empty',{visibility:loading||error||!entries.length?'visible':'collapsed'}],
      ['ds-map-refresh',{interactable:!loading}],['ds-map-prev',{interactable:!loading&&state.mapPage>0}],['ds-map-next',{interactable:!loading&&state.mapPage<pages-1}]);
    text('ds-map-detail-name',selected?.name||'选择一个格子查看物品');
    text('ds-map-detail-meta',selected?[rarities[selected.rarity],selected.kind==='equipment'?slots[selected.slot]||'装备':categories[selected.category]||'道具',selected.id].filter(Boolean).join(' · '):'');
    text('ds-map-detail-description',selected?.description||'');
    const cells = templates.map((template,i) => {
      const cell=structuredClone(template),entry=visible[i],selected=entry?.id===state.mapSelected;
      cell.interactable=!!entry&&!loading;cell.name=entry?.name||'空格';
      const tone=entry&&rarities[entry.rarity]?entry.rarity:'common';
      cell.brushes={normal:selected?'drop-cell-selected':'drop-cell-'+tone,hovered:selected?'drop-cell-selected':'drop-cell-hover',pressed:'drop-cell-selected',disabled:'drop-cell-empty'};
      walk(cell,node=>{if(node.type==='Image')node.src=entry?images.get(entry.id)||'':'';if(node.id===template.id+'-name')node.text=entry?.name||'';});
      return cell;
    });
    ui.setChildren('ds-map-grid',cells);ui.setMany(patches);
    svg.dataset.mapCore=state.mapId;svg.dataset.mapCategory=state.mapCategory;svg.dataset.mapPage=state.mapPage;
    svg.dataset.mapPoolState=loading?'loading':error?'error':'ready';
  }
  async function refresh() {
    const ticket=++request;loading=true;error='';update();
    try {
      const response=await fetch(ui.project.presentation.mapPools,{cache:'no-store'});
      if(!response.ok)throw Error(`地图掉落池 HTTP ${response.status}`);
      const next=await response.json();
      if(next.schemaVersion!==1||!Array.isArray(next.maps)||!Array.isArray(next.entries))throw Error('地图掉落池格式无效');
      for(const map of next.maps)mapPoolEntries(next,map.id);
      const nextImages=new Map(await Promise.all(next.entries.map(async entry=>[entry.id,await resolveIcon(entry)])));
      if(ticket!==request)return;
      snapshot=next;images=nextImages;if(!next.maps.some(map=>map.id===state.mapId))state.mapId=next.maps[0]?.id||'';
    } catch(e) { if(ticket!==request)return;snapshot=null;error=e.message; }
    loading=false;update();
  }
  function activate(op) {
    if(op==='map-refresh'){void refresh();return true;}
    if(!op.startsWith('map'))return false;
    if(loading)return true;
    const [kind,value]=op.split(':');
    if(kind==='map'&&snapshot?.maps[Number(value)]){state.mapId=snapshot.maps[Number(value)].id;state.mapPage=0;state.mapSelected='';}
    else if(kind==='map-filter'&&categories[value]){state.mapCategory=value;state.mapPage=0;state.mapSelected='';}
    else if(kind==='map-page')state.mapPage+=Number(value);
    else if(kind==='map-item'&&visible[Number(value)])state.mapSelected=visible[Number(value)].id;
    update();return true;
  }
  function dispose(){++request;ui.removeEventListener('paint',annotate);for(const resource of iconCache.values())void resource.then(url=>URL.revokeObjectURL(url),()=>{});iconCache.clear();}
  return {activate,refresh,dispose,get snapshot(){return snapshot;}};
}

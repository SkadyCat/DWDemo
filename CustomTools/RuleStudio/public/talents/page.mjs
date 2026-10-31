import { createApp, ref, reactive, computed, watch, nextTick, onBeforeUnmount } from '/vendor/vue.esm-browser.prod.js';
import { store } from '/editors.mjs';
import { player, ensureStarted } from '/player.mjs';
import { talentBudget } from '/progression/journey.mjs';
import { aggregate } from '/engine/collections.mjs';
import { compileBuild } from '/engine/compiler.mjs';
import { computeSheet } from '/engine/character.mjs';
import { traitText } from '/affix-text.mjs';
import { talentStore } from './state.mjs';
import { constellationEdgePath } from './layout.mjs';
import { placeNodeCard } from './node-card.mjs';
import { AttributeIcon } from './attribute-icons.mjs';
import { LegendaryIcon } from './legendary-icons.mjs';
import { freshAllocation, validateTree, validateAllocation, allocateNode, refundNode, chooseNodeAttribute, adjacency, spentPoints, attributeTotals, talentParts, upgradeAllocation } from './model.mjs';

const DRAFT_KEY = 'rulestudio.talents.draft.v1';
const LEGACY_KEY = 'rulestudio.talents.previous-plan';
const CATEGORIES = [{ id: 'all', name: '全部' }, { id: 'attack', name: '攻击' }, { id: 'defense', name: '防御' }, { id: 'special', name: '特殊' }];
const copy = value => JSON.parse(JSON.stringify(value));
const TEMPLATE = /*html*/`
<div ref="pageElement" class="stc-page" :class="{'stc-in-battle':inBattle}" v-if="tree && store.library">
  <header class="stc-header">
    <div><span class="stc-eyebrow">OPUS · TALENT CONSTELLATION</span><h1>{{ tree.name }}<small>1000 节点 / 100 传奇特性</small></h1></div>
    <div class="stc-header-actions"><label :title="inBattle ? '天赋点随角色等级获得：每级 2 点，另有任务奖励' : ''">{{ inBattle ? '等级天赋点' : '规划点数' }} <input aria-label="规划点数" :disabled="inBattle" type="number" min="0" :max="tree.nodes.length-1" v-model="budgetInput" @change="setBudget($event)" @keydown.enter.prevent="setBudget($event); $event.target.blur()"></label>
      <div class="stc-budget"><b>{{ spent }}</b><span>/ {{ draft.budget }}</span><small>已用</small></div>
      <span v-if="inBattle" class="stc-live-badge">战斗暂停 · 天赋实时生效</span><button v-else class="stc-apply" :disabled="!!catalogError || !!preview.error || applied" @click="apply">{{ applied ? '已应用到 3D 战斗' : '应用到 3D 战斗' }}</button></div>
  </header>
  <div ref="workspace" class="stc-workspace">
    <div class="stc-atlas">
      <div class="stc-toolbar">
        <div class="stc-search"><span>⌕</span><input v-model="query" aria-label="搜索星盘" placeholder="搜索传奇、机制、来源 BD…"><button v-if="query" aria-label="清空搜索" @click="query=''">×</button></div>
        <div class="stc-categories"><button v-for="c in categories" :class="{on: category===c.id}" @click="category=c.id">{{ c.name }}<small>{{ categoryCount(c.id) }}</small></button></div>
        <select class="stc-sector-jump" aria-label="定位星群" @change="jumpToSector"><option value="">定位星群…</option><option v-for="s in tree.sectors" :value="s.id">{{ s.name }}</option></select>
      </div>
      <div class="stc-results" v-if="query.trim() || category!=='all'">
        <b>{{ results.length }} 个关键特性</b><div><button v-for="n in results" :key="n.id" @click="focusNode(n)"><span :style="{background: sectorOf(n).color}"></span>{{ n.name }}<small>{{ sectorOf(n).name }}</small></button><p v-if="!results.length">没有匹配的特性</p></div>
      </div>
      <svg ref="svg" class="stc-map" :viewBox="viewBox" aria-label="天赋星盘，滚轮缩放，拖动平移" @wheel.prevent="wheel" @pointerdown="panStart" @pointermove="panMove" @pointerup="panEnd" @pointercancel="panEnd">
        <defs><radialGradient id="stc-halo"><stop stop-color="#889fc8" stop-opacity=".08"/><stop offset="1" stop-color="#889fc8" stop-opacity="0"/></radialGradient></defs>
        <circle cx="0" cy="0" r="2150" fill="url(#stc-halo)"/>
        <g class="stc-edges"><path v-for="e in visibleEdges" :key="e.key" :data-edge="e.key" :d="e.path" :class="{lit: isOn(e.a.id)&&isOn(e.b.id), route: routeEdges.has(e.key)}"/></g>
        <g v-for="n in visibleNodes" :key="n.id" :transform="'translate('+n.x+','+n.y+')'" :class="['stc-node',n.kind,{lit:isOn(n.id),selected:selectedId===n.id,route:routeIds.has(n.id),available:availableIds.has(n.id),dim:!nodeMatches(n)}]" :style="{'--node-color': nodeColor(n)}" :data-node="n.id" role="button" :tabindex="selectedId===n.id||availableIds.has(n.id)?0:-1" :aria-label="nodeLabel(n)" :aria-haspopup="canReach(n) ? 'dialog' : undefined" :aria-expanded="popupOpen && selectedId===n.id" :aria-describedby="hovered?.id===n.id ? 'stc-node-tip' : undefined" @pointerenter="queueTip(n)" @pointerleave="leaveTip" @focus="showTip(n)" @blur="leaveTip" @click.stop="openNode(n,$event)" @keydown.enter.prevent.stop="openNode(n,$event)" @keydown.space.prevent.stop="openNode(n,$event)">
          <circle :r="nodeRadius(n)+6" class="stc-hit"/><circle :r="nodeRadius(n)+4" class="stc-node-ring"/><circle :r="nodeRadius(n)" class="stc-node-core"/>
          <template v-if="n.kind==='legendary'"><LegendaryIcon :node="n" x="-17" y="-17" width="34" height="34"/><text v-if="detailed && selectedId===n.id" class="stc-legend-name" y="46" style="font-size:16px">{{ n.name }}</text><path d="M-4 -31 0 -36 4 -31 0 -26Z"/></template>
          <template v-else-if="n.kind==='origin'"><path class="stc-origin-star" d="M0 -19 6 -6 19 0 6 6 0 19 -6 6 -19 0 -6 -6Z"/></template>
          <template v-else><AttributeIcon v-if="isOn(n.id)" :attribute="attributeOf(n).id" :data-attribute="attributeOf(n).id" class="stc-node-attribute-icon" x="-7.5" y="-7.5" width="15" height="15"/><circle v-else-if="detailed" class="stc-attribute-empty" r="1.2"/></template>
        </g>
      </svg>
      <div class="stc-map-hint">点击节点 · 选择属性图标即可点亮<span>滚轮缩放 · 拖动平移<span v-if="inBattle"> · P / Esc 返回战斗</span></span></div>
      <div class="stc-map-controls"><button aria-label="缩小星盘" @click="zoomBy(.8)">−</button><span>{{ Math.round(camera.zoom*100) }}%</span><button aria-label="放大星盘" @click="zoomBy(1.25)">＋</button><button @click="overview">全览</button></div>
    </div>
    <aside class="stc-inspector">
      <div class="stc-inspector-heading"><span>星盘构筑</span><small>{{ legendsOn.length }} 个传奇已点亮</small></div>
      <div class="stc-inspector-scroll">
        <section class="stc-guide"><span class="stc-eyebrow">构筑规划</span><h2>从一颗星，连成你的流派</h2><p>沿连线逐点点亮。属性节点点击图标即可分配，悬停查看特性。</p><div class="stc-plan-meter"><span :style="{width:(draft.budget ? spent/draft.budget*100 : 0)+'%'}"></span></div><div class="stc-plan-count"><span>已分配 {{ spent }} 点</span><b>可用 {{ remaining }} 点</b></div></section>
        <section class="stc-summary"><h3>属性合计 <span>{{ spent - legendsOn.length }} 个过渡点</span></h3><div class="stc-totals"><div v-for="a in totals"><span class="stc-total-label" :style="{color:a.color}"><AttributeIcon :attribute="a.id" width="14" height="14"/>{{ a.name }}</span><b>+{{ a.total }}</b></div></div>
          <div v-if="inBattle && liveAttributes.length" class="stc-runtime-attributes" aria-label="当前角色基础属性"><h3>当前角色 <span>战斗实时值</span></h3><div class="stc-totals"><div v-for="a in liveAttributes"><span>{{ a.name }}</span><b>{{ a.value }}</b></div></div></div>
        </section>
        <section class="stc-selected-list"><h3>已点亮传奇</h3><p v-if="!legendsOn.length" class="stc-note">选择一个星群，开始连接你的第一个核心。</p><button v-for="n in legendsOn" @click="focusNode(n)"><LegendaryIcon :node="n"/><span>{{ n.name }}</span><small>{{ categoryName(n.category) }}</small></button></section>
        <section class="stc-preview"><h3>规则聚合验证</h3><label>预览技能<select aria-label="预览技能" v-model="previewSkill"><option v-for="b in playerBuilds" :value="b.id">{{ b.displayName || b.id }}</option></select></label><p :class="{error:preview.error}">{{ preview.error || ('编译通过 · '+preview.contributions+' 个来源 · '+preview.rules+' 条规则 · '+preview.triggers+' 个触发') }}</p><small>只编译当前星盘与所选技能。完整战斗还会聚合角色装备。</small></section>
      </div>
      <footer class="stc-plan-actions"><button @click="clearPlan">清空方案</button><button @click="exportPlan">导出</button><button @click="$refs.importFile.click()">导入</button><button v-if="legacyPlan" @click="exportLegacyPlan">导出旧方案</button><input ref="importFile" type="file" accept="application/json,.json" hidden @change="importPlan"></footer>
    </aside>
  </div>

  <aside v-if="hovered && !popupOpen" ref="tipCard" id="stc-node-tip" class="stc-node-tip" :class="{'stc-notice-tip':nodeNotice,'stc-attribute-tip':!nodeNotice && hovered.kind==='attribute'}" role="tooltip" :style="tipStyle" @pointerenter="keepTip" @pointerleave="leaveTip">
    <template v-if="nodeNotice"><span class="stc-notice-symbol">⊘</span><b role="status">{{ nodeNotice }}</b></template>
    <template v-else-if="hovered.kind==='attribute'">
      <header class="stc-attribute-tip-heading"><b>{{ isOn(hovered.id) ? attributeOf(hovered).name+' +'+attributeOf(hovered).value : '自由属性 +'+tree.attributes[0].value }}</b><span>{{ isOn(hovered.id) ? '已点亮' : '1 点' }}</span></header>
      <div class="stc-tip-attributes"><span v-for="a in tree.attributes" :style="{color:a.color}"><AttributeIcon :attribute="a.id" width="16" height="16"/>{{ a.name }}</span></div>
      <footer class="stc-tip-footer"><span>{{ canReach(hovered) ? isOn(hovered.id) ? '点击更换属性' : '点击选择属性' : '无法到达' }}</span><span>{{ isOn(hovered.id) ? '免费更换' : '任选其一' }}</span></footer>
    </template>
    <template v-else>
    <header class="stc-card-heading"><LegendaryIcon v-if="hovered.kind==='legendary'" :node="hovered"/><span v-else class="stc-card-symbol" :style="{color:nodeColor(hovered)}"><span v-if="hovered.kind==='origin'">✧</span><AttributeIcon v-else :attribute="attributeOf(hovered).id"/></span><div><span class="stc-card-type" :style="{color:nodeColor(hovered)}">{{ kindLabel(hovered) }}</span><h2>{{ hovered.name }}</h2></div><span class="stc-card-state" :class="{on:isOn(hovered.id)}">{{ isOn(hovered.id) ? '已点亮' : '未点亮' }}</span></header>
    <div class="stc-tip-content">
      <template v-if="hovered.kind==='legendary'"><p>{{ hovered.description }}</p><div class="stc-tip-effects"><div v-for="(entry,i) in effectRows(hovered.traits).slice(0,4)" :key="i" :class="{child:entry.depth>0}">{{ entry.depth ? '↳' : '◇' }} {{ entry.text }}</div><small v-if="effectRows(hovered.traits).length>4">另有 {{ effectRows(hovered.traits).length-4 }} 条效果，点击查看完整说明</small></div><p class="stc-tip-requirement"><b>构筑条件</b>{{ hovered.requirement }}</p></template>
      <template v-else><p>启明星连接所有构筑方向。沿自由属性点，寻找改变战斗方式的传奇特性。</p><p class="stc-note">起点自动点亮，不消耗规划点。</p></template>
    </div>
    <footer class="stc-tip-footer"><span>{{ hovered.kind==='origin' ? '起始节点' : isOn(hovered.id) ? '已点亮' : canReach(hovered) ? '点亮需要 1 点' : '无法到达' }}</span><span>{{ canReach(hovered) ? '点击选择 ↗' : '先点亮相邻节点' }}</span></footer>
    </template>
  </aside>
  <section v-if="popupOpen && selected" ref="dialogCard" class="stc-node-dialog" :class="{'stc-attribute-menu':selected.kind==='attribute'}" :style="dialogStyle" role="dialog" aria-modal="false" aria-labelledby="stc-node-dialog-title" tabindex="-1" @pointerdown.stop @wheel.stop>
    <template v-if="selected.kind==='attribute'">
      <header class="stc-attribute-menu-head"><h2 id="stc-node-dialog-title">选择属性 <small>+{{ tree.attributes[0].value }}</small></h2><button class="stc-dialog-close" aria-label="关闭节点详情" @click="closeNode(true)">×</button></header>
      <div class="stc-attribute-icons"><button v-for="a in tree.attributes" :key="a.id" :aria-label="a.name+' +'+a.value" :title="a.name+' +'+a.value" :aria-pressed="isOn(selected.id) && attributeOf(selected).id===a.id" :class="{on:isOn(selected.id) && attributeOf(selected).id===a.id}" :style="{'--attribute-color':a.color}" @click="chooseAttribute(a.id)"><AttributeIcon :attribute="a.id"/></button></div>
      <footer class="stc-attribute-menu-foot"><span>{{ isOn(selected.id) ? '免费更换' : '消耗 1 点' }}</span><button v-if="isOn(selected.id)" class="stc-refund-icon" aria-label="退还此节点" title="退还此节点" @click="refund">↶</button></footer>
      <p v-if="messageBad && message" class="stc-compact-error" role="status">{{ message }}</p>
    </template>
    <template v-else>
    <header class="stc-dialog-heading"><div class="stc-kind" :style="{color:nodeColor(selected)}">{{ kindLabel(selected) }}<span class="stc-card-state" :class="{on:isOn(selected.id)}">{{ isOn(selected.id) ? '已点亮' : '未点亮' }}</span></div><div class="stc-title"><LegendaryIcon v-if="selected.kind==='legendary'" :node="selected"/><span v-else class="stc-card-symbol" :style="{color:nodeColor(selected)}">{{ selected.kind==='origin' ? '✧' : attributeOf(selected).glyph }}</span><div><h2 id="stc-node-dialog-title">{{ selected.name }}</h2><small>{{ sectorOf(selected).name }} · {{ selected.kind==='origin' ? '不消耗点数' : '节点消耗 1 点' }}</small></div></div><button class="stc-dialog-close" aria-label="关闭节点详情" @click="closeNode(true)">×</button></header>
    <div class="stc-dialog-scroll stc-detail">
          <template v-if="selected.kind==='legendary'">
            <p class="stc-loop">{{ selected.description }}</p>
            <div class="stc-requirement"><b>构筑条件</b><p>{{ selected.requirement }}</p></div>
            <div class="stc-effects"><h3>实际特性</h3><div v-for="(entry,i) in effectRows(selected.traits)" :key="i" :class="{child:entry.depth>0}"><span>{{ entry.depth ? '↳' : '◇' }}</span>{{ entry.text }}</div></div>
            <a v-if="selected.sourceBuild" class="stc-source" :href="'/?bd='+selected.sourceBuild.id" target="_blank" rel="noopener">来源 BD · {{ selected.sourceBuild.name }} ↗</a>
            <div class="stc-source" v-else>来源 · 现有规则特性 / 原默认参数</div>
            <details class="stc-source-files"><summary>查看特性来源</summary><div v-for="s in selected.sources">{{ s.path || ('Presets/'+s.preset+'.json · '+s.slot+' / '+s.affix) }}<span v-if="s.mounted"> · 挂载技能</span></div></details>
            <div class="stc-synergies"><h3>同星群可联动</h3><button v-for="id in sectorOf(selected).legends.filter(id=>id!==selected.id)" @click="focusNode(nodeMap.get(id))">{{ nodeMap.get(id).name }}<span>↗</span></button></div>
          </template>
          <template v-else><p>从启明星向外连接自由属性点，找到改变构筑方式的传奇特性。所有分区均可进入。</p><p class="stc-note">总计 1000 节点：100 传奇、899 自由属性、1 起点。规划预算可调整，尚未绑定角色成长点数。</p></template>

    </div>
    <footer class="stc-dialog-footer">
      <div class="stc-dialog-budget"><span>{{ isOn(selected.id) ? '已点亮' : '节点消耗 1 点' }}</span><span>可用 <b>{{ remaining }}</b> 点</span></div>
      <div class="stc-node-actions" v-if="selected.kind!=='origin'">
        <template v-if="!isOn(selected.id)"><button class="stc-primary" :disabled="!!catalogError || !canReach(selected) || remaining<1" @click="allocate">点亮节点 · 1 点</button><small v-if="remaining<1" class="error">规划点数不足</small></template>
        <button v-else @click="refund">退还此节点 · 1 点</button>
      </div>
      <p v-if="message" class="stc-dialog-feedback" :class="{error:messageBad}" role="status">{{ message }}</p><div class="stc-dialog-keyhint"><span>{{ inBattle ? '修改实时生效 · 方案自动保存' : '方案自动保存 · 应用后生效' }}</span><span><kbd>Esc</kbd> 关闭详情</span></div>
    </footer>
    </template>
  </section>
  <footer class="stc-footer"><span :class="{error:messageBad}" role="status">{{ catalogError || message || (inBattle ? '点亮、换属性与退点均实时更新当前角色。' : '方案自动保存；应用后进入 RuleStudio 3D 战斗。') }}</span><span>剩余 <b>{{ remaining }}</b> 点 · 攻击 40 / 防御 30 / 特殊 30</span></footer>
</div>
<div class="stc-loading" v-else>{{ talentStore.error || store.error || '正在加载星盘与规则…' }}</div>`;

export const TalentConstellation = {
  components: { AttributeIcon, LegendaryIcon },
  props: { inBattle: Boolean, runtimeAttributes: {type:Array,default:()=>[]} }, emits: ['changed'], template: TEMPLATE, setup(props,{emit}) {
    const tree = computed(() => talentStore.tree), draft = ref(null), svg = ref(null), selectedId = ref('origin');
    const pageElement=ref(null), workspace=ref(null), tipCard=ref(null), dialogCard=ref(null);
    const popupOpen=ref(false), hoverId=ref(''), nodeNotice=ref(''), tipStyle=ref({visibility:'hidden'}), dialogStyle=ref({visibility:'hidden'});
    const query = ref(''), category = ref('all'), defaultAttribute = ref('intelligence'), previewSkill = ref('frost_lance'), budgetInput=ref('');
    const message = ref(''), messageBad = ref(false), legacyPlan=ref(null), camera = reactive({ x: 0, y: 0, zoom: 1, aspect: 1.3 });
    try { legacyPlan.value=JSON.parse(localStorage.getItem(LEGACY_KEY)||'null'); } catch {}
    const liveAttributes=computed(()=>props.runtimeAttributes);
    let resizeObserver, overlayObserver, pan, messageTimer, hoverTimer, leaveTimer, noticeTimer, returnFocus, restoringFocus=false, handledEscape=false;
    function tell(text, bad = false) { message.value = text; messageBad.value = bad; clearTimeout(messageTimer); messageTimer = setTimeout(() => message.value = '', 6000); }
    watch(tree, value => {
      if (!value) return;
      overview();
      if (props.inBattle) {
        const result=upgradeAllocation(value,player.talents);draft.value=result.state;
        if(result.legacy){legacyPlan.value=result.legacy;try{localStorage.setItem(LEGACY_KEY,JSON.stringify(result.legacy));}catch{}tell('星盘连接已更新，旧方案已保留，可导出后重新规划。');}
        if(player.talents?.treeId===value.id && player.talents.revision!==value.revision)player.talents=copy(result.state);
        return;
      }
      try { const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');const result=upgradeAllocation(value,saved);draft.value=result.state;if(result.legacy){legacyPlan.value=result.legacy;localStorage.setItem(LEGACY_KEY,JSON.stringify(result.legacy));} }
      catch { draft.value = freshAllocation(value); }
    }, { immediate: true });
    // In battle the budget is earned (level + quest rewards); the free planner keeps its editable budget.
    const levelBudget = computed(() => props.inBattle ? talentBudget(player) : null);
    watch([levelBudget, draft], ([budget]) => {
      if (budget === null || !draft.value || draft.value.budget === budget) return;
      const next = { ...copy(draft.value), budget };
      if ((next.allocated || []).length > budget) { next.allocated = []; next.choices = {}; }
      draft.value = next;
    }, { immediate: true });
    watch(() => props.inBattle && JSON.stringify(player.talents), text => {
      if (!text || !tree.value || text === JSON.stringify(draft.value)) return;
      if (!validateAllocation(tree.value, player.talents)) draft.value = copy(player.talents);
    });
    watch(()=>draft.value?.budget,budget=>{if(budget!==undefined)budgetInput.value=String(budget);},{immediate:true});
    watch(draft, value => { if (value) try { localStorage.setItem(DRAFT_KEY, JSON.stringify(value)); } catch { tell('本地保存失败，请导出方案保存。', true); } }, { deep: true });
    const nodeMap = computed(() => new Map((tree.value?.nodes || []).map(n => [n.id, n])));
    const sectorMap = computed(() => new Map((tree.value?.sectors || []).map(s => [s.id, s])));
    const graph = computed(() => tree.value ? adjacency(tree.value) : new Map());
    const legends = computed(() => (tree.value?.nodes || []).filter(n => n.kind === 'legendary'));
    const selected = computed(() => nodeMap.value.get(selectedId.value));
    const hovered = computed(() => nodeMap.value.get(hoverId.value));
    const onIds = computed(() => new Set([tree.value?.root, ...(draft.value?.allocated || [])]));
    const isOn = id => onIds.value.has(id);
    const spent = computed(() => tree.value && draft.value ? spentPoints(tree.value, draft.value) : 0);
    const remaining = computed(() => (draft.value?.budget || 0) - spent.value);
    const totals = computed(() => tree.value && draft.value ? attributeTotals(tree.value, draft.value) : []);
    const legendsOn = computed(() => legends.value.filter(n => isOn(n.id)));
    const catalogError = computed(() => tree.value && store.library ? validateTree(tree.value, store.library) : '');
    const route = computed(() => { const target=!popupOpen.value && hovered.value ? hovered.value : selected.value;return target && availableIds.value.has(target.id) ? [target.id] : []; });
    const routeIds = computed(() => new Set(route.value));
    const edgeKey = (a, b) => [a, b].sort().join(':');
    const routeEdges = computed(() => {
      const out = new Set(), path = route.value;
      for (let i = 0; i < path.length; i++) {
        const from = i ? path[i - 1] : graph.value.get(path[0])?.find(id => isOn(id));
        if (from) out.add(edgeKey(from, path[i]));
      }
      return out;
    });
    const availableIds = computed(() => new Set([...onIds.value].flatMap(id => graph.value.get(id) || []).filter(id => !isOn(id))));
    const canReach = node => node?.kind==='origin' || isOn(node?.id) || availableIds.value.has(node?.id);
    const kindLabel = node => node.kind==='legendary' ? categoryName(node.category)+' · 传奇特性' : node.kind==='attribute' ? '过渡节点 · 自由属性' : '星盘起点';
    const categoryName = id => CATEGORIES.find(c => c.id === id)?.name || '特殊';
    const categoryCount = id => id === 'all' ? legends.value.length : legends.value.filter(n => n.category === id).length;
    const sectorOf = node => sectorMap.value.get(node?.sector) || { name: '启明星', color: '#d3bb83', legends: [] };
    const attributeOf = node => tree.value.attributes.find(a => a.id === draft.value.choices[node.id]) || tree.value.attributes.find(a => a.id === defaultAttribute.value);
    const nodeColor = node => node.kind === 'attribute' && isOn(node.id) ? attributeOf(node).color : sectorOf(node).color;
    const nodeLabel = node => `${node.kind === 'attribute' ? (isOn(node.id) ? attributeOf(node).name+' +'+attributeOf(node).value : '自由属性') : node.name} · ${isOn(node.id) ? '已点亮' : '未点亮'}`;
    const matches = node => (category.value === 'all' || node.category === category.value) && (!query.value.trim() || `${node.name} ${node.description} ${node.loop} ${node.sourceBuild?.name || ''} ${node.id} ${node.traits.map(t => t.id).join(' ')} ${sectorOf(node).name}`.toLowerCase().includes(query.value.trim().toLowerCase()));
    const results = computed(() => legends.value.filter(matches));
    const matchedIds = computed(() => new Set(results.value.map(n => n.id)));
    const sectorMatches = sector => sector.legends.some(id => matchedIds.value.has(id));
    const nodeMatches = node => node.kind === 'origin' || (node.kind === 'legendary' ? matchedIds.value.has(node.id) : sectorMatches(sectorOf(node)));
    const detailed = computed(() => camera.zoom >= 2.5);
    const orbitMap = computed(() => new Map((tree.value?.layout?.orbits || []).map(o=>[o.id,o])));
    const connectionRoutes = computed(() => new Map(Object.entries(tree.value?.layout?.edgeRoutes || {})));
    const extent = computed(() => { const b=tree.value?.layout?.bounds || {minX:-2100,maxX:2100,minY:-2100,maxY:2100}; const h=Math.max((b.maxX-b.minX)/camera.aspect,b.maxY-b.minY)*1.1/camera.zoom,w=h*camera.aspect; return { x: camera.x - w / 2, y: camera.y - h / 2, w, h }; });
    const viewBox = computed(() => { const e = extent.value; return `${e.x} ${e.y} ${e.w} ${e.h}`; });
    const inView = (n, pad = 60) => { const e = extent.value; return n.x >= e.x-pad && n.x <= e.x+e.w+pad && n.y >= e.y-pad && n.y <= e.y+e.h+pad; };
    const visibleNodes = computed(() => (tree.value?.nodes || []).filter(n => inView(n)));
    const visibleEdges = computed(() => (tree.value?.edges || []).flatMap(([a, b]) => {
      const na = nodeMap.value.get(a), nb = nodeMap.value.get(b);
      const e = extent.value;
      const points=connectionRoutes.value.get(edgeKey(a,b))?.points || [na,nb];
      if (Math.max(...points.map(p=>p.x)) < e.x-80 || Math.min(...points.map(p=>p.x)) > e.x+e.w+80 || Math.max(...points.map(p=>p.y)) < e.y-80 || Math.min(...points.map(p=>p.y)) > e.y+e.h+80) return [];
      return [{ a: na, b: nb, key: edgeKey(a,b), path:constellationEdgePath(na,nb,orbitMap.value,connectionRoutes.value) }];
    }));
    const nodeRadius = n => n.kind === 'origin' ? 31 : n.kind === 'legendary' ? (n.sourceBuild?26:22) : 9.5;
    const allocatedIn = s => tree.value.nodes.filter(n => n.sector === s.id && isOn(n.id) && !/_route_|_bridge_/.test(n.id)).length;
    function hideTip() { clearTimeout(hoverTimer);clearTimeout(leaveTimer);clearTimeout(noticeTimer);hoverId.value='';nodeNotice.value=''; }
    function keepTip() { clearTimeout(leaveTimer); }
    function leaveTip() { clearTimeout(hoverTimer);clearTimeout(leaveTimer);if(!nodeNotice.value)leaveTimer=setTimeout(hideTip,130); }
    function showTip(n) { clearTimeout(hoverTimer);clearTimeout(leaveTimer);if(popupOpen.value || pan || restoringFocus)return;clearTimeout(noticeTimer);nodeNotice.value='';hoverId.value=n.id;tipStyle.value={visibility:'hidden'};nextTick(positionCards); }
    function queueTip(n) { clearTimeout(hoverTimer);clearTimeout(leaveTimer);if(nodeNotice.value && hoverId.value===n.id)return;if(hoverId.value && hoverId.value!==n.id)hideTip();if(popupOpen.value || pan)return;hoverTimer=setTimeout(()=>showTip(n),160); }
    function positionCards() {
      if(!pageElement.value || !workspace.value || !svg.value)return;
      const page=pageElement.value.getBoundingClientRect(),bounds=workspace.value.getBoundingClientRect();
      for(const [node,element,target,width] of [[hovered.value,tipCard.value,tipStyle,nodeNotice.value?160:hovered.value?.kind==='attribute'?256:344],[popupOpen.value?selected.value:null,dialogCard.value,dialogStyle,selected.value?.kind==='attribute'?256:424]]) {
        if(!node || !element)continue;
        const anchor=svg.value.querySelector('[data-node="'+node.id+'"] .stc-node-core')?.getBoundingClientRect();
        if(!anchor)continue;
        const limit=element===tipCard.value?440:740;
        const placed=placeNodeCard(bounds,anchor,{width,height:Math.min(limit,element.getBoundingClientRect().height)});
        target.value={left:(placed.left-page.left)+'px',top:(placed.top-page.top)+'px',width:placed.width+'px',maxHeight:Math.min(limit,placed.maxHeight)+'px'};
      }
    }
    function showNodeNotice(n,text) {
      hideTip();hoverId.value=n.id;nodeNotice.value=text;tipStyle.value={visibility:'hidden'};
      nextTick(positionCards);noticeTimer=setTimeout(hideTip,2000);
    }
    async function openNode(n,event) {
      if(!n)return;
      if(!canReach(n)) { closeNode();selectedId.value=n.id;showNodeNotice(n,'无法到达');return; }
      if(!isOn(n.id) && remaining.value<1) { closeNode();showNodeNotice(n,'规划点数不足');return; }
      hideTip();selectedId.value=n.id;message.value='';popupOpen.value=true;
      returnFocus=event?.currentTarget || svg.value?.querySelector('[data-node="'+n.id+'"]');
      dialogStyle.value={visibility:'hidden'};
      await nextTick();positionCards();await nextTick();
      if(popupOpen.value && selectedId.value===n.id) {
        if(!returnFocus?.isConnected)returnFocus=svg.value?.querySelector('[data-node="'+n.id+'"]');
        dialogCard.value?.focus({preventScroll:true});
      }
    }
    function closeNode(restore=false) { popupOpen.value=false;hideTip();if(restore && returnFocus?.isConnected){restoringFocus=true;returnFocus.focus({preventScroll:true});nextTick(()=>{restoringFocus=false;});} }
    function dismissOutside(event) { if(!event.target.closest('.stc-node-dialog,[data-node],.stc-node-tip')){hideTip();if(popupOpen.value)closeNode();} }
    function overlayKey(event) { if(event.key!=='Escape' || (!popupOpen.value && !handledEscape))return;event.preventDefault();event.stopPropagation();if(!event.repeat && popupOpen.value){handledEscape=true;closeNode(true);} }
    function overlayKeyUp(event) { if(event.key==='Escape')handledEscape=false; }
    document.addEventListener('pointerdown',dismissOutside,true);
    document.addEventListener('keydown',overlayKey,true);
    document.addEventListener('keyup',overlayKeyUp,true);
    function focusNode(n) { if (!n) return; query.value='';category.value='all';camera.x=n.x;camera.y=n.y;camera.zoom=4.2;openNode(n); }
    function focusSector(s) {
      closeNode();
      const members=tree.value.nodes.filter(n=>n.sector===s.id),xs=members.map(n=>n.x),ys=members.map(n=>n.y);
      camera.x=(Math.min(...xs)+Math.max(...xs))/2;camera.y=(Math.min(...ys)+Math.max(...ys))/2;
      const b=tree.value.layout.bounds,base=Math.max((b.maxX-b.minX)/camera.aspect,b.maxY-b.minY)*1.1;
      camera.zoom=Math.min(4,Math.max(1.3,base/Math.max((Math.max(...xs)-Math.min(...xs)+180)/camera.aspect,Math.max(...ys)-Math.min(...ys)+180)));
      selectedId.value=s.legends[0];
    }
    function jumpToSector(event) { const s=sectorMap.value.get(event.target.value);if(s)focusSector(s);event.target.value=''; }
    function overview() { closeNode();const b=tree.value.layout?.bounds;camera.x=b?(b.minX+b.maxX)/2:0;camera.y=b?(b.minY+b.maxY)/2:0;camera.zoom=1; }
    function zoomBy(factor) { closeNode();camera.zoom = Math.max(.7, Math.min(14, camera.zoom * factor)); }
    function worldAt(event) { const point = svg.value.createSVGPoint(); point.x = event.clientX; point.y = event.clientY; return point.matrixTransform(svg.value.getScreenCTM().inverse()); }
    function wheel(event) { const before = worldAt(event), oldZoom=camera.zoom; zoomBy(Math.exp(-Math.max(-150,Math.min(150,event.deltaY))*.0018)); const ratio=oldZoom/camera.zoom; camera.x=before.x+(camera.x-before.x)*ratio; camera.y=before.y+(camera.y-before.y)*ratio; }
    function panStart(event) { if (event.button !== 0 || event.target.closest('[data-node],.stc-clusters')) return; closeNode();pan = { x: event.clientX, y: event.clientY, cx: camera.x, cy: camera.y }; svg.value.setPointerCapture(event.pointerId); }
    function panMove(event) { if (!pan) return; const rect = svg.value.getBoundingClientRect(); camera.x = pan.cx-(event.clientX-pan.x)*extent.value.w/rect.width; camera.y = pan.cy-(event.clientY-pan.y)*extent.value.h/rect.height; }
    function panEnd() { pan = null; }
    function transact(result) { if(result.error){tell(result.error,true);return false;}draft.value=result.state;if(props.inBattle)apply();else tell('方案已更新并自动保存');return true; }
    function allocate() { transact(allocateNode(tree.value,draft.value,selectedId.value,attributeOf(selected.value)?.id || defaultAttribute.value,false)); }
    function chooseAttribute(id) { if(transact(chooseNodeAttribute(tree.value,draft.value,selectedId.value,id)))closeNode(true); }
    function refund() { transact(refundNode(tree.value,draft.value,selectedId.value)); }
    function setBudget(event) { const next = {...draft.value,budget:Number(event.target.value)}, error = validateAllocation(tree.value,next); if (error) { budgetInput.value=String(draft.value.budget);event.target.value=draft.value.budget;tell(error,true); } else if(next.budget!==draft.value.budget) {draft.value=next;if(props.inBattle)apply();} }
    function clearPlan() { const next=freshAllocation(tree.value);next.budget=draft.value.budget;draft.value=next;if(props.inBattle)apply();else tell('已清空草稿；点击应用可同步清空战斗天赋。'); }
    const applied = computed(() => JSON.stringify(player.talents) === JSON.stringify(draft.value));
    function apply() {
      const error = catalogError.value || validateAllocation(tree.value,draft.value) || preview.value.error;
      if (error) return tell(error,true);
      ensureStarted(store.catalog,store.collections,store.library);
      player.talents=copy(draft.value);emit('changed');tell(props.inBattle?'天赋已生效，当前角色已更新。':'当前星盘已应用到 RuleStudio 3D 战斗，装备与库存保持原有状态。');
    }
    function exportPlan() { const blob=new Blob([JSON.stringify(draft.value,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a'); a.href=url;a.download='opus-constellation.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); }
    function exportLegacyPlan() { if(!legacyPlan.value)return;const blob=new Blob([JSON.stringify(legacyPlan.value,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='opus-constellation-previous.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); }
    async function importPlan(event) { const file=event.target.files[0];if(!file)return;try{const state=JSON.parse(await file.text()),error=validateAllocation(tree.value,state);if(error)throw Error(error);draft.value=state;if(props.inBattle)apply();else tell('方案已导入；点击应用后用于战斗。');}catch(error){tell('导入失败：'+error.message,true);}event.target.value=''; }
    const playerBuilds = computed(() => [...(store.library?.builds.values() || [])].filter(b => !b.id.startsWith('monster_')));
    const preview = computed(() => {
      if (!tree.value || !draft.value || !store.library) return {error:'等待规则加载'};
      const parts=talentParts(tree.value,draft.value);if(parts.error)return {error:parts.error};
      const agg=aggregate(store.library,previewSkill.value,parts.parts,Infinity);if(agg.error)return {error:agg.error};
      if(agg.warnings.length)return {error:agg.warnings.join('；')};
      const compiled=compileBuild(agg.source);if(compiled.error)return {error:compiled.error};
      const enabled=new Set(compiled.plan.traitIds),sheet=computeSheet(agg.source.traits.filter(source=>enabled.has(source.id)).map(source=>({source})));
      return {error:'',contributions:parts.parts.length,rules:compiled.plan.rules.length,triggers:sheet.triggers.length};
    });
    function effectRows(entries,depth=0) { return entries.flatMap(entry=>[{text:traitText(entry,store.library),depth},...effectRows(entry.with || [],depth+1)]); }
    watch(svg, element => { resizeObserver?.disconnect(); if (!element) return; resizeObserver=new ResizeObserver(([entry])=>{if(entry.contentRect.width>0&&entry.contentRect.height>0)camera.aspect=entry.contentRect.width/entry.contentRect.height;});resizeObserver.observe(element); });
    watch([pageElement,workspace,tipCard,dialogCard],()=>{overlayObserver?.disconnect();overlayObserver=new ResizeObserver(positionCards);for(const element of [pageElement.value,workspace.value,tipCard.value,dialogCard.value])if(element)overlayObserver.observe(element);nextTick(positionCards);},{flush:'post'});
    onBeforeUnmount(()=>{resizeObserver?.disconnect();overlayObserver?.disconnect();clearTimeout(messageTimer);clearTimeout(hoverTimer);clearTimeout(leaveTimer);clearTimeout(noticeTimer);document.removeEventListener('pointerdown',dismissOutside,true);document.removeEventListener('keydown',overlayKey,true);document.removeEventListener('keyup',overlayKeyUp,true);});
    return {store,talentStore,inBattle:props.inBattle,liveAttributes,tree,draft,svg,pageElement,workspace,tipCard,dialogCard,popupOpen,hovered,nodeNotice,canReach,tipStyle,dialogStyle,queueTip,showTip,leaveTip,keepTip,openNode,closeNode,kindLabel,budgetInput,query,category,categories:CATEGORIES,defaultAttribute,previewSkill,message,messageBad,legacyPlan,camera,nodeMap,selected,selectedId,spent,remaining,totals,legendsOn,catalogError,route,routeIds,routeEdges,availableIds,isOn,categoryName,categoryCount,sectorOf,attributeOf,nodeColor,nodeLabel,results,sectorMatches,nodeMatches,detailed,viewBox,inView,visibleNodes,visibleEdges,nodeRadius,allocatedIn,focusNode,focusSector,jumpToSector,overview,zoomBy,wheel,panStart,panMove,panEnd,allocate,chooseAttribute,refund,setBudget,clearPlan,applied,apply,exportPlan,exportLegacyPlan,importPlan,playerBuilds,preview,effectRows};
  }
};
export function mountTalents(root) {
  return createApp(TalentConstellation).mount(root);
}

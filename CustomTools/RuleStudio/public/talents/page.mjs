// 六域星盘：passive tree view. Allocation rules live in model.mjs; this file is presentation.
import { createApp, ref, reactive, computed, watch, nextTick, onBeforeUnmount } from '/vendor/vue.esm-browser.prod.js';
import { store } from '/editors.mjs';
import { player, ensureStarted } from '/player.mjs';
import { talentBudget } from '/progression/journey.mjs';
import { traitText } from '/affix-text.mjs';
import { talentStore } from './state.mjs';
import { freshAllocation, validateTree, validateAllocation, allocateNode, refundNode, adjacency, spentPoints, attributeTotals, upgradeAllocation, pathTo } from './model.mjs';

const DRAFT_KEY = 'rulestudio.talents.draft.v2';
const copy = value => JSON.parse(JSON.stringify(value));
// Drawbacks are authored as negative values; read them naturally (「提高 -30%」 → 「降低 30%」).
const readable = text => text.replace(/(提高|增加|\+)\s*-\s*/g, (m, w) => w === '+' ? '-' : '降低 ').replace(/额外降低 降低/g, '额外降低');
const KIND_NAME = { origin: '起点', small: '小天赋', notable: '核心天赋', keystone: '基石天赋', attribute: '属性', legendary: '传奇' };
const ATTR_GLYPH = { 力量: '力', 敏捷: '敏', 智力: '智', 体质: '体' };
const RADIUS = { origin: 26, small: 9, notable: 17, keystone: 25, attribute: 9, legendary: 22 };

const TEMPLATE = /*html*/`
<div class="tt-page" :class="{'tt-in-battle': inBattle}" v-if="tree && store.library">
  <div class="tt-map-wrap" ref="mapWrap">
    <svg ref="svg" class="tt-map" :viewBox="viewBox" aria-label="六域星盘，滚轮缩放，拖动平移" @wheel.prevent="wheel" @pointerdown="panStart" @pointermove="panMove" @pointerup="panEnd" @pointercancel="panEnd" @contextmenu.prevent>
      <defs>
        <radialGradient id="tt-core"><stop offset="0" stop-color="#3a3220" stop-opacity=".55"/><stop offset="1" stop-color="#3a3220" stop-opacity="0"/></radialGradient>
        <filter id="tt-glow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <g class="tt-glows"><circle v-for="s in domainArcs" :key="s.id" :cx="s.center.x" :cy="s.center.y" r="760" :fill="'url(#tt-glow-' + s.id + ')'" class="tt-glow" :class="{hot: hoverSector === s.id}"/></g>
      <defs><radialGradient v-for="s in domainArcs" :key="'g' + s.id" :id="'tt-glow-' + s.id"><stop offset="0" :stop-color="s.color" stop-opacity=".16"/><stop offset=".55" :stop-color="s.color" stop-opacity=".05"/><stop offset="1" :stop-color="s.color" stop-opacity="0"/></radialGradient></defs>
      <circle r="330" fill="url(#tt-core)"/>
      <g class="tt-start-ornament"><circle r="248"/><circle r="262" class="thin"/><circle r="132" class="thin"/></g>
      <g class="tt-labels"><text v-for="s in domainArcs" :key="'l' + s.id" :x="s.center.x" :y="s.center.y + 14" :fill="s.color" class="tt-domain-label" @click.stop="focusSector(s)">{{ s.name }}</text></g>
      <g class="tt-edges"><path v-for="e in edges" :key="e.key" :d="e.d" :class="{lit: isOn(e.a.id) && isOn(e.b.id), route: routeEdges.has(e.key)}"/></g>
      <g v-for="n in tree.nodes" :key="n.id" :transform="'translate(' + n.x + ',' + n.y + ')'" class="tt-node" :class="[n.kind, {lit: isOn(n.id), route: routeIds.has(n.id), reach: availableIds.has(n.id), match: matchIds.has(n.id), dim: query && !matchIds.has(n.id)}]" :style="{'--c': colorOf(n)}" :data-node="n.id" role="button" :aria-label="n.name + ' · ' + (isOn(n.id) ? '已点亮' : '未点亮')" @pointerenter="hover(n, $event)" @pointerleave="unhover(n)" @click.stop="clickNode(n)" @contextmenu.prevent.stop="refundAt(n)">
        <circle :r="radius(n) + 8" class="tt-hit"/>
        <template v-if="n.kind === 'keystone'"><path class="tt-shape" :d="hexPath(radius(n))"/><path class="tt-inner" :d="hexPath(radius(n) - 6)"/><text v-if="!iconOf(n)" class="tt-glyph" y="6">{{ sectorOf(n).glyph || '◆' }}</text></template>
        <template v-else-if="n.kind === 'notable'"><circle class="tt-shape" :r="radius(n)"/><circle class="tt-inner" :r="radius(n) - 5"/><text v-if="zoom > 1.6" class="tt-name" :y="radius(n) + 16">{{ n.name }}</text></template>
        <template v-else-if="n.kind === 'origin'"><circle class="tt-shape" :r="radius(n)"/><path class="tt-star" d="M0 -16 5 -5 16 0 5 5 0 16 -5 5 -16 0 -5 -5Z"/></template>
        <template v-else><circle class="tt-shape" :r="radius(n)"/><text v-if="zoom > 2.2 && ATTR_GLYPH[n.name] && !iconOf(n)" class="tt-attr" y="4">{{ ATTR_GLYPH[n.name] }}</text></template>
        <svg v-if="iconOf(n)" class="tt-icon" :x="-iconSize(n) / 2" :y="-iconSize(n) / 2" :width="iconSize(n)" :height="iconSize(n)" :viewBox="iconOf(n).box"><image :href="iconOf(n).href" :width="iconOf(n).w" :height="iconOf(n).w" preserveAspectRatio="none"/></svg>
        <text v-if="n.kind === 'keystone' && zoom > 1.1" class="tt-name key" :y="radius(n) + 18">{{ n.name }}</text>
      </g>
    </svg>
    <div class="tt-toolbar" @pointerdown.stop>
      <div class="tt-search"><span>⌕</span><input v-model="query" placeholder="搜索天赋：冻结、召唤、气血…" aria-label="搜索天赋"><button v-if="query" @click="query = ''" aria-label="清空">×</button></div>
      <span class="tt-search-count" v-if="query">{{ matchIds.size }} 个匹配</span>
    </div>
    <div class="tt-zoom" @pointerdown.stop><button @click="zoomBy(0.8)" aria-label="缩小">−</button><span>{{ Math.round(zoom * 100) }}%</span><button @click="zoomBy(1.25)" aria-label="放大">＋</button><button @click="overview">全览</button></div>
    <div class="tt-hint">左键点亮（可直接点亮远处节点，自动沿最短路线）· 右键退点 · 滚轮缩放 · 拖动平移<template v-if="inBattle"> · P / Esc 返回战斗</template></div>
    <aside v-if="tip" class="tt-tip" :style="tipStyle" role="tooltip">
      <header><span class="tt-tip-kind" :style="{color: colorOf(tip.node)}">{{ KIND_NAME[tip.node.kind] }} · {{ sectorOf(tip.node).name }}</span><h3>{{ tip.node.name }}</h3></header>
      <p v-if="tip.node.description" class="tt-tip-desc">{{ tip.node.description }}</p>
      <ul v-if="tip.node.traits?.length"><li v-for="(line, i) in effectLines(tip.node)" :key="i" :class="{bad: line.bad}">{{ line.text }}</li></ul>
      <p v-if="tip.node.kind === 'origin'" class="tt-tip-desc">所有道路的起点。六条大道通往六个领域。</p>
      <footer :class="tip.state">{{ tip.status }}</footer>
    </aside>
  </div>
  <aside class="tt-side">
    <section class="tt-points">
      <div class="tt-points-big"><b>{{ remaining }}</b><span>可用天赋点</span></div>
      <div class="tt-points-meter"><i :style="{width: (draft.budget ? 100 * spent / draft.budget : 0) + '%'}"></i></div>
      <small>已用 {{ spent }} / {{ draft.budget }}<template v-if="inBattle"> · 每级 2 点，任务额外奖励</template></small>
      <label v-if="!inBattle" class="tt-budget">规划点数 <input type="number" min="0" :max="tree.nodes.length - 1" :value="draft.budget" @change="setBudget($event)"></label>
    </section>
    <section class="tt-domains">
      <h4>六域</h4>
      <button v-for="s in domainArcs" :key="s.id" class="tt-domain" :style="{'--c': s.color}" @click="focusSector(s)" @pointerenter="hoverSector = s.id" @pointerleave="hoverSector = ''">
        <b>{{ s.glyph }}</b><span><strong>{{ s.name }}</strong><small>{{ s.description }}</small></span><em>{{ countIn(s.id) }}</em>
      </button>
    </section>
    <section class="tt-picked" v-if="pickedMajor.length">
      <h4>已点亮的核心与基石</h4>
      <button v-for="n in pickedMajor" :key="n.id" :class="n.kind" :style="{'--c': colorOf(n)}" @click="focusNode(n)"><i></i>{{ n.name }}<small>{{ KIND_NAME[n.kind] }}</small></button>
    </section>
    <section class="tt-totals">
      <h4>天赋合计 <small>{{ totalLines.length }} 项</small></h4>
      <p v-if="!totalLines.length" class="tt-empty">从中心的启明出发，点亮相邻的节点。</p>
      <ul><li v-for="(line, i) in totalLines" :key="i" :class="{bad: line.bad}">{{ line.text }}</li></ul>
    </section>
    <footer class="tt-actions">
      <button @click="clearPlan">全部重置</button><button @click="exportPlan">导出</button><button @click="$refs.importFile.click()">导入</button>
      <button v-if="!inBattle" class="tt-apply" :disabled="applied || !!catalogError" @click="apply">{{ applied ? '已应用' : '应用到战斗' }}</button>
      <input ref="importFile" type="file" accept="application/json,.json" hidden @change="importPlan">
    </footer>
    <p v-if="message || catalogError" class="tt-message" :class="{bad: messageBad || catalogError}" role="status">{{ catalogError || message }}</p>
  </aside>
</div>
<div class="tt-loading" v-else>{{ talentStore.error || store.error || '正在加载星盘…' }}</div>`;

export const TalentConstellation = {
  props: { inBattle: Boolean, runtimeAttributes: { type: Array, default: () => [] } }, emits: ['changed'], template: TEMPLATE,
  setup(props, { emit }) {
    const tree = computed(() => talentStore.tree), draft = ref(null), svg = ref(null), mapWrap = ref(null);
    const query = ref(''), hoverSector = ref(''), message = ref(''), messageBad = ref(false), tip = ref(null), tipStyle = ref({});
    const camera = reactive({ x: 0, y: 0, zoom: 1, aspect: 1.4 });
    let pan = null, moved = false, messageTimer, resizeObserver;
    function tell(text, bad = false) { message.value = text; messageBad.value = bad; clearTimeout(messageTimer); messageTimer = setTimeout(() => message.value = '', 5000); }

    watch(tree, value => {
      if (!value) return;
      overview();
      if (props.inBattle) { draft.value = upgradeAllocation(value, player.talents).state; return; }
      try { draft.value = upgradeAllocation(value, JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null')).state; } catch { draft.value = freshAllocation(value); }
    }, { immediate: true });
    // In battle the budget is earned; the stand-alone planner keeps an editable budget.
    const levelBudget = computed(() => props.inBattle ? talentBudget(player) : null);
    watch([levelBudget, draft], ([budget]) => {
      if (budget === null || !draft.value || draft.value.budget === budget) return;
      const next = { ...copy(draft.value), budget };
      if (next.allocated.length > budget) { next.allocated = []; next.choices = {}; }
      draft.value = next;
    }, { immediate: true });
    watch(() => props.inBattle && JSON.stringify(player.talents), text => {
      if (!text || !tree.value || text === JSON.stringify(draft.value)) return;
      if (!validateAllocation(tree.value, player.talents)) draft.value = copy(player.talents);
    });
    watch(draft, value => { if (value && !props.inBattle) try { localStorage.setItem(DRAFT_KEY, JSON.stringify(value)); } catch {} }, { deep: true });

    const nodeMap = computed(() => new Map((tree.value?.nodes || []).map(n => [n.id, n])));
    const sectorMap = computed(() => new Map((tree.value?.sectors || []).map(s => [s.id, s])));
    const graph = computed(() => tree.value ? adjacency(tree.value) : new Map());
    const onIds = computed(() => new Set([tree.value?.root, ...(draft.value?.allocated || [])]));
    const isOn = id => onIds.value.has(id);
    const spent = computed(() => tree.value && draft.value ? spentPoints(tree.value, draft.value) : 0);
    const remaining = computed(() => Math.max(0, (draft.value?.budget || 0) - spent.value));
    const availableIds = computed(() => new Set([...onIds.value].flatMap(id => graph.value.get(id) || []).filter(id => !isOn(id))));
    const catalogError = computed(() => tree.value && store.library ? validateTree(tree.value, store.library) : '');
    const sectorOf = node => sectorMap.value.get(node?.sector) || { name: '启明', color: '#e2c98b', glyph: '✧' };
    const colorOf = node => sectorOf(node).color;
    const radius = n => RADIUS[n.kind] || 9;
    const hexPath = r => Array.from({ length: 6 }, (_, i) => { const a = Math.PI / 3 * i - Math.PI / 2; return `${i ? 'L' : 'M'}${(r * Math.cos(a)).toFixed(1)} ${(r * Math.sin(a)).toFixed(1)}`; }).join(' ') + 'Z';
    const edgeKey = (a, b) => [a, b].sort().join(':');
    // Links between nodes on the same orbit are drawn as arcs around the group centre.
    const edges = computed(() => (tree.value?.edges || []).map(([a, b]) => {
      const na = nodeMap.value.get(a), nb = nodeMap.value.get(b), key = edgeKey(a, b), arc = tree.value.layout?.arcs?.[key];
      let d = `M${na.x} ${na.y}L${nb.x} ${nb.y}`;
      if (arc) { const cross = (na.x - arc.cx) * (nb.y - arc.cy) - (na.y - arc.cy) * (nb.x - arc.cx); d = `M${na.x} ${na.y}A${arc.r} ${arc.r} 0 0 ${cross > 0 ? 1 : 0} ${nb.x} ${nb.y}`; }
      return { a: na, b: nb, key, d };
    }));

    // Icons: 3×3 atlases listed in the icon plan; each sheet shows up as soon as its PNG exists.
    const iconCells = reactive({});
    (async () => {
      try {
        const plan = await (await fetch('/talents/icons/six-domains/imagegen-plan.json', { cache: 'no-store' })).json();
        for (const [key, href] of Object.entries(plan.attributes || {})) iconCells[key] = { href, box: '0 0 100 100', w: 100 };
        for (const sheet of plan.sheets || []) {
          const href = `${plan.folder}/${sheet.file}`, img = new Image();
          img.onload = () => { for (const e of sheet.entries) iconCells[e.key] = { href, box: `${e.column * 100} ${e.row * 100} 100 100`, w: 300 }; };
          img.src = href;
        }
      } catch { /* icons are optional */ }
    })();
    const iconOf = n => n?.icon ? iconCells[n.icon] || null : null;
    const ICON_SIZE = { keystone: 36, notable: 26, small: 15, attribute: 15 };
    const iconSize = n => ICON_SIZE[n.kind] || 15;

    // Hover route: the shortest unlit path the click would buy.
    const hoverId = ref('');
    const route = computed(() => {
      const n = nodeMap.value.get(hoverId.value);
      if (!n || isOn(n.id) || !tree.value || !draft.value) return [];
      return pathTo(tree.value, draft.value, n.id);
    });
    const routeIds = computed(() => new Set(route.value));
    const routeEdges = computed(() => {
      const out = new Set(), path = route.value;
      for (let i = 0; i < path.length; i++) { const from = i ? path[i - 1] : (graph.value.get(path[0]) || []).find(isOn); if (from) out.add(edgeKey(from, path[i])); }
      return out;
    });

    // Effect text with drawbacks marked.
    const effectLines = node => (node.traits || []).map(entry => ({ text: readable(traitText(entry, store.library)), bad: Object.values(entry.params || {}).some(v => v < 0) || ['cost_from_life'].includes(entry.id) }));
    function hover(n, event) {
      hoverId.value = n.id;
      const box = mapWrap.value?.getBoundingClientRect(), r = event.currentTarget.getBoundingClientRect();
      const cost = route.value.length;
      const status = n.kind === 'origin' ? '起点' : isOn(n.id) ? '已点亮 · 右键退点' : !cost ? '无法到达' : cost > remaining.value ? `需要 ${cost} 点（不足）` : cost === 1 ? '点击点亮 · 1 点' : `点击点亮路线 · ${cost} 点`;
      const state = isOn(n.id) ? 'on' : cost && cost <= remaining.value ? 'ok' : 'no';
      tip.value = { node: n, status, state };
      if (box) {
        const left = r.left - box.left + r.width + 14, flip = left + 300 > box.width;
        tipStyle.value = { left: (flip ? r.left - box.left - 314 : left) + 'px', top: Math.max(10, Math.min(box.height - 260, r.top - box.top - 10)) + 'px' };
      }
    }
    function unhover(n) { if (hoverId.value === n.id) { hoverId.value = ''; tip.value = null; } }

    function commit(next, text) {
      draft.value = next;
      if (props.inBattle) { ensureStarted(store.catalog, store.collections, store.library); player.talents = copy(next); emit('changed'); }
      if (text) tell(text);
    }
    function clickNode(n) {
      if (moved || n.kind === 'origin' || isOn(n.id)) return;
      const path = pathTo(tree.value, draft.value, n.id);
      if (!path.length) return tell('无法到达：路线被基石阻断，请从别的方向连接', true);
      if (path.length > remaining.value) return tell(`天赋点不足：这条路线需要 ${path.length} 点`, true);
      const result = allocateNode(tree.value, draft.value, n.id, 'intelligence', true);
      if (result.error) return tell(result.error, true);
      commit(result.state, path.length > 1 ? `点亮 ${path.length} 个节点，抵达「${n.name}」` : '');
      hover(n, { currentTarget: svg.value.querySelector(`[data-node="${n.id}"]`) });
    }
    function refundAt(n) {
      if (!isOn(n.id) || n.kind === 'origin') return;
      const result = refundNode(tree.value, draft.value, n.id);
      if (result.error) return tell(result.error, true);
      commit(result.state, `已退还「${n.name}」`);
    }

    // Search
    const matchIds = computed(() => {
      const q = query.value.trim().toLowerCase(); if (!q || !tree.value) return new Set();
      return new Set(tree.value.nodes.filter(n => `${n.name} ${n.description || ''} ${effectLines(n).map(l => l.text).join(' ')} ${sectorOf(n).name}`.toLowerCase().includes(q)).map(n => n.id));
    });

    // Side panel
    const domainArcs = computed(() => (tree.value?.sectors || []).filter(s => s.domain && s.center));
    const countIn = id => (draft.value?.allocated || []).filter(n => nodeMap.value.get(n)?.sector === id).length;
    const pickedMajor = computed(() => (draft.value?.allocated || []).map(id => nodeMap.value.get(id)).filter(n => n && ['notable', 'keystone'].includes(n.kind)).sort((a, b) => (a.kind === 'keystone' ? 0 : 1) - (b.kind === 'keystone' ? 0 : 1)));
    const totalLines = computed(() => {
      if (!draft.value || !store.library) return [];
      const sums = new Map(), flags = [];
      for (const id of draft.value.allocated) for (const entry of nodeMap.value.get(id)?.traits || []) {
        const keys = Object.keys(entry.params || {});
        if (keys.length === 1 && keys[0] !== 'per') {
          const k = entry.id + ':' + keys[0], row = sums.get(k) || { id: entry.id, key: keys[0], value: 0 };
          row.value += entry.params[keys[0]]; sums.set(k, row);
        } else flags.push(entry);
      }
      const lines = [...sums.values()].map(r => ({ text: readable(traitText({ id: r.id, params: { [r.key]: +r.value.toFixed(2) } }, store.library)), bad: r.value < 0 }));
      for (const entry of flags) { const text = readable(traitText(entry, store.library)); if (!lines.some(l => l.text === text)) lines.push({ text, bad: false }); }
      return lines;
    });

    // Camera
    const zoom = computed(() => camera.zoom);
    const extent = computed(() => {
      const b = tree.value?.layout?.bounds || { minX: -1800, maxX: 1800, minY: -1800, maxY: 1800 };
      const h = Math.max((b.maxX - b.minX) / camera.aspect, b.maxY - b.minY) * 1.0 / camera.zoom, w = h * camera.aspect;
      return { x: camera.x - w / 2, y: camera.y - h / 2, w, h };
    });
    const viewBox = computed(() => { const e = extent.value; return `${e.x} ${e.y} ${e.w} ${e.h}`; });
    function overview() { camera.x = 0; camera.y = 0; camera.zoom = 1; }
    function zoomBy(f) { camera.zoom = Math.max(0.8, Math.min(6, camera.zoom * f)); }
    function worldAt(e) { const p = svg.value.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(svg.value.getScreenCTM().inverse()); }
    function wheel(e) { const before = worldAt(e), old = camera.zoom; zoomBy(Math.exp(-Math.max(-150, Math.min(150, e.deltaY)) * 0.0018)); const k = old / camera.zoom; camera.x = before.x + (camera.x - before.x) * k; camera.y = before.y + (camera.y - before.y) * k; }
    function panStart(e) { if (e.button !== 0) return; moved = false; pan = { x: e.clientX, y: e.clientY, cx: camera.x, cy: camera.y }; }
    function panMove(e) {
      if (!pan) return;
      if (!moved && Math.hypot(e.clientX - pan.x, e.clientY - pan.y) < 5) return;
      if (!moved) { moved = true; svg.value.setPointerCapture(e.pointerId); tip.value = null; }
      const rect = svg.value.getBoundingClientRect();
      camera.x = pan.cx - (e.clientX - pan.x) * extent.value.w / rect.width; camera.y = pan.cy - (e.clientY - pan.y) * extent.value.h / rect.height;
    }
    function panEnd() { pan = null; setTimeout(() => { moved = false; }, 0); }
    function focusNode(n) { camera.x = n.x; camera.y = n.y; camera.zoom = Math.max(camera.zoom, 2.4); }
    function focusSector(s) { camera.x = s.center.x; camera.y = s.center.y; camera.zoom = 2.2; }

    // Plan actions
    function setBudget(e) { const next = { ...draft.value, budget: Math.max(0, Math.trunc(+e.target.value) || 0) }; const error = validateAllocation(tree.value, next); if (error) { e.target.value = draft.value.budget; return tell(error, true); } draft.value = next; }
    function clearPlan() { const next = freshAllocation(tree.value); next.budget = draft.value.budget; commit(next, '已重置全部天赋'); }
    const applied = computed(() => JSON.stringify(player.talents) === JSON.stringify(draft.value));
    function apply() { const error = catalogError.value || validateAllocation(tree.value, draft.value); if (error) return tell(error, true); ensureStarted(store.catalog, store.collections, store.library); player.talents = copy(draft.value); emit('changed'); tell('已应用到 3D 战斗'); }
    function exportPlan() { const url = URL.createObjectURL(new Blob([JSON.stringify(draft.value, null, 2) + '\n'], { type: 'application/json' })), a = document.createElement('a'); a.href = url; a.download = 'six-domains-plan.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    async function importPlan(e) {
      const file = e.target.files[0]; if (!file) return;
      try { const state = JSON.parse(await file.text()), error = validateAllocation(tree.value, state); if (error) throw Error(error); if (state.allocated.length > draft.value.budget) throw Error('方案点数超过可用天赋点'); commit({ ...state, budget: draft.value.budget }, '方案已导入'); }
      catch (error) { tell('导入失败：' + error.message, true); }
      e.target.value = '';
    }

    watch(svg, el => { resizeObserver?.disconnect(); if (!el) return; resizeObserver = new ResizeObserver(([entry]) => { if (entry.contentRect.width > 0 && entry.contentRect.height > 0) camera.aspect = entry.contentRect.width / entry.contentRect.height; }); resizeObserver.observe(el); });
    onBeforeUnmount(() => { resizeObserver?.disconnect(); clearTimeout(messageTimer); });

    return { ATTR_GLYPH, iconOf, iconSize, store, talentStore, inBattle: props.inBattle, tree, draft, svg, mapWrap, query, hoverSector, message, messageBad, tip, tipStyle, KIND_NAME,
      isOn, spent, remaining, availableIds, catalogError, sectorOf, colorOf, radius, hexPath, edges, routeIds, routeEdges, effectLines, hover, unhover,
      clickNode, refundAt, matchIds, domainArcs, countIn, pickedMajor, totalLines, zoom, viewBox, overview, zoomBy, wheel, panStart, panMove, panEnd,
      focusNode, focusSector, setBudget, clearPlan, applied, apply, exportPlan, importPlan };
  },
};
export function mountTalents(root) { return createApp(TalentConstellation).mount(root); }

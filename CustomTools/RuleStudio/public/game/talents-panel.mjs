// 天赋盘窗口：星盘（SVG，可拖动、滚轮缩放、搜索高亮）+ 左侧汇总。点亮必须与已点亮的点相连；
// 取消时其余点仍须与起点相连。效果就是普通词条，点亮后立即进入战斗（gearChanged 重建英雄）。
import { reactive, computed, ref, onMounted, onBeforeUnmount } from '../vendor/vue.esm-browser.prod.js';
import { TALENT_TREE, talentLines, talentName, canAllocate, canRefund } from '../../core/content/talents.mjs';
import { family, LAYERS } from '../../core/content/families.mjs';

const T = TALENT_TREE;
const KIND_NAME = { start: '起点', small: '天赋', notable: '大天赋', trait: '特性', keystone: '基石' };

export const TalentBoard = {
  props: { save: Object, points: Number },
  emits: ['changed', 'close'],
  setup(props, { emit }) {
    const el = ref(null), size = reactive({ w: innerWidth, h: innerHeight });
    const cam = reactive({ x: -260, y: -40, k: .62 }), drag = reactive({ on: false, moved: false, sx: 0, sy: 0, cx: 0, cy: 0 });
    const hover = ref(null), mouse = reactive({ x: 0, y: 0 }), q = ref(''), msg = ref('');
    const alloc = computed(() => new Set(props.save.talents.allocated));
    const used = computed(() => props.save.talents.allocated.length);
    const left = computed(() => props.points - used.value);
    const box = computed(() => { const w = size.w / cam.k, h = size.h / cam.k; return `${(cam.x - w / 2).toFixed(1)} ${(cam.y - h / 2).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`; });
    const term = computed(() => q.value.trim());
    const match = n => term.value && [talentName(n), ...talentLines(n)].some(s => s.includes(term.value));
    const state = id => id === T.start ? 'on' : alloc.value.has(id) ? 'on' : canAllocate(alloc.value, id) ? 'open' : 'off';
    const nodes = computed(() => T.nodes.map(n => ({ ...n, st: state(n.id), hit: match(n), layer: n.kind === 'trait' ? family(n.lines[0].id).layer : null })));
    const edges = computed(() => T.links.map(([a, b]) => {
      const sa = state(a), sb = state(b);
      return { k: a + '-' + b, x1: T.nodes[a].x, y1: T.nodes[a].y, x2: T.nodes[b].x, y2: T.nodes[b].y, cls: sa === 'on' && sb === 'on' ? 'on' : sa === 'on' || sb === 'on' ? 'open' : '' };
    }));
    const domains = T.domains.map(d => ({ ...d, x: Math.cos(d.angle) * 1150, y: Math.sin(d.angle) * 1150 }));
    // Summary: keystones and traits taken, numbers added up per stat.
    const summary = computed(() => {
      const special = [], sums = new Map();
      for (const id of props.save.talents.allocated) {
        const n = T.nodes[id]; if (!n) continue;
        if (n.kind === 'keystone' || n.kind === 'trait') special.push({ kind: n.kind, text: talentLines(n)[0] });
        else for (const l of n.lines) { const f = family(l.id), v = f.values[l.tier - 1]; sums.set(l.id, (sums.get(l.id) ?? 0) + v); }
      }
      const stats = [...sums].map(([id, v]) => family(id).name.replace('{v}', String(+v.toFixed(1))));
      return { special, stats };
    });
    const hoverInfo = computed(() => {
      const n = hover.value; if (!n) return null;
      const st = state(n.id);
      const hint = n.id === T.start ? '你从这里出发' : st === 'on' ? (canRefund(props.save.talents.allocated, n.id) ? '点击取消，返还 1 点' : '其他天赋依赖它，不能单独取消') : st === 'open' ? (left.value > 0 ? '点击点亮，消耗 1 点' : '没有剩余天赋点') : '还没连通：先点亮与它相连的天赋';
      const layer = n.kind === 'trait' ? LAYERS[family(n.lines[0].id).layer].name + '特性' : KIND_NAME[n.kind];
      const name = talentName(n);
      return { name, layer, lines: talentLines(n).filter(l => l !== name), hint, st, x: Math.min(mouse.x + 18, size.w - 340), y: Math.min(mouse.y + 18, size.h - 180) };
    });

    function click(n) {
      if (drag.moved || n.id === T.start) return;
      const list = props.save.talents.allocated, st = state(n.id);
      if (st === 'on') { if (!canRefund(list, n.id)) { msg.value = '其他天赋依赖它，不能单独取消'; return; } list.splice(list.indexOf(n.id), 1); }
      else if (st === 'open') { if (left.value <= 0) { msg.value = '天赋点不够：打通更多图集节点获得天赋点'; return; } list.push(n.id); }
      else { msg.value = '还没连通'; return; }
      msg.value = ''; emit('changed');
    }
    function reset() { props.save.talents.allocated.splice(0); emit('changed'); }
    const down = e => { if (e.button !== 0) return; Object.assign(drag, { on: true, moved: false, sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y }); };
    const move = e => {
      mouse.x = e.clientX; mouse.y = e.clientY;
      if (!drag.on) return;
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (!drag.moved && Math.hypot(dx, dy) > 5) drag.moved = true;
      if (drag.moved) { cam.x = drag.cx - dx / cam.k; cam.y = drag.cy - dy / cam.k; }
    };
    const up = () => { drag.on = false; setTimeout(() => { drag.moved = false; }, 0); };
    const wheel = e => {
      const k = Math.max(.3, Math.min(2.2, cam.k * Math.exp(-e.deltaY * .0015))), mx = e.clientX - size.w / 2, my = e.clientY - size.h / 2;
      const wx = cam.x + mx / cam.k, wy = cam.y + my / cam.k; cam.k = k; cam.x = wx - mx / k; cam.y = wy - my / k;
    };
    const rs = () => { size.w = innerWidth; size.h = innerHeight; };
    onMounted(() => addEventListener('resize', rs)); onBeforeUnmount(() => removeEventListener('resize', rs));
    return { el, cam, drag, box, nodes, edges, domains, hover, hoverInfo, q, msg, used, left, summary, click, reset, down, move, up, wheel, far: computed(() => cam.k < .5) };
  },
  template: /* html */ `
  <section class="tal-win" aria-label="天赋盘">
    <header class="atlas-top"><h2>天 赋</h2><span>剩余 <b>{{ left }}</b> 点 · 已用 {{ used }}</span><button class="x" @click="$emit('close')" aria-label="关闭">×</button></header>
    <div class="tal-board" ref="el" :class="{ dragging: drag.moved, far }" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" @pointerleave="hover = null" @wheel.prevent="wheel">
      <svg :viewBox="box" preserveAspectRatio="xMidYMid slice">
        <defs><radialGradient v-for="d in domains" :key="'g' + d.id" :id="'tg-' + d.id"><stop offset="0" :stop-color="d.hue" stop-opacity=".16"/><stop offset="1" :stop-color="d.hue" stop-opacity="0"/></radialGradient></defs>
        <circle v-for="d in domains" :key="'b' + d.id" :cx="d.x * .62" :cy="d.y * .62" r="520" :fill="'url(#tg-' + d.id + ')'"/>
        <text v-for="d in domains" :key="'n' + d.id" class="tal-domain" :x="d.x" :y="d.y" :fill="d.hue">{{ d.name.split('').join(' ') }}</text>
        <g class="tal-edges"><line v-for="e in edges" :key="e.k" :class="e.cls" :x1="e.x1" :y1="e.y1" :x2="e.x2" :y2="e.y2"/></g>
        <g v-for="n in nodes" :key="n.id" class="tn" :class="['k-' + n.kind, 's-' + n.st, n.layer ? 'ly-' + n.layer : '', { hit: n.hit }]" :transform="'translate(' + n.x + ' ' + n.y + ')'"
           @click="click(n)" @pointerenter="hover = n" @pointerleave="hover = null">
          <circle v-if="n.hit" class="halo" r="34"/>
          <circle v-if="n.kind === 'small'" r="11"/>
          <template v-else-if="n.kind === 'notable'"><circle class="outer" r="21"/><circle r="15"/></template>
          <template v-else-if="n.kind === 'trait'"><polygon points="0,-20 17,-10 17,10 0,20 -17,10 -17,-10"/><text dy=".36em">{{ n.layer === 'form' ? '形' : '联' }}</text></template>
          <template v-else-if="n.kind === 'keystone'"><circle class="outer" r="32"/><circle r="24"/><path class="star" d="M0 -14 L4 -4 L14 0 L4 4 L0 14 L-4 4 L-14 0 L-4 -4Z"/></template>
          <template v-else><circle class="outer" r="30"/><circle r="22"/></template>
        </g>
      </svg>
    </div>
    <aside class="tal-side panel">
      <h3 class="ttl">星 盘</h3>
      <p class="tal-points"><b>{{ left }}</b> 点可用 <small>每打通一个图集节点 +1（首领要塞 +2）</small></p>
      <input class="tal-search" v-model="q" placeholder="搜索：如 点燃、投射物、生命" aria-label="搜索天赋">
      <div class="tal-sum">
        <h4 class="sub">基石与特性 <small>{{ summary.special.length }}</small></h4>
        <p v-for="(s, i) in summary.special" :key="'s' + i" :class="'sp-' + s.kind">{{ s.text }}</p>
        <p v-if="!summary.special.length" class="hint">沿着某一域的主干往外走：特性点（六边形）把装备上的特性固定在盘上，外缘的基石改写规则。</p>
        <h4 class="sub">数值</h4>
        <p v-for="(s, i) in summary.stats" :key="'v' + i" class="st">{{ s }}</p>
      </div>
      <p class="tal-msg" v-if="msg">{{ msg }}</p>
      <button class="orn-btn danger sm" @click="reset" :disabled="!used">全部重置</button>
    </aside>
    <div class="tal-tip" v-if="hoverInfo" :style="{ left: hoverInfo.x + 'px', top: hoverInfo.y + 'px' }" :class="'s-' + hoverInfo.st">
      <h4>{{ hoverInfo.name }}<small>{{ hoverInfo.layer }}</small></h4>
      <p v-for="(l, i) in hoverInfo.lines" :key="i">{{ l }}</p>
      <em>{{ hoverInfo.hint }}</em>
    </div>
  </section>`,
};

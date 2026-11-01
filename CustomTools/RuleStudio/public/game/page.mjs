// 游戏页 · 鎏金夜阙：营地（地图装置）+ 地图战斗（3D、血魔、技能、小地图、首领、连杀与清屏），
// 角色 / 背包 并排打开，洗炼 / 流派 / 传奇图鉴 居中打开；地图里也能随时打开。
// 交互：悬停看物品说明（Floating UI 定位）、拖到装备位或右键装备、右键装备位卸下；动效 GSAP；图标 game-icons.net。
import { createApp, reactive, computed, ref, watch, onMounted, onBeforeUnmount, markRaw, nextTick } from '../vendor/vue.esm-browser.prod.js';
import { SLOTS, LAYERS, family, lineTierFor } from '../../core/content/families.mjs';
import { CURRENCIES, SLOT_NAMES, rarityOf, itemName, lineText, baseOf, baseDefence, rollLegendary } from '../../core/content/items.mjs';
import { LEGENDARIES, legendary } from '../../core/content/legendaries.mjs';
import { ARCHETYPES } from '../../core/content/archetypes.mjs';
import { STAGES, collectionList } from '../../core/content/builds.mjs';
import { mapProfile, mapRequirements, MAP_FAMILIES, MAP_TIERS, ELITE_MODS } from '../../core/content/maps.mjs';
import { gameContent } from '../../core/content/game.mjs';
import { defenceReport, roleReport } from '../../core/analysis.mjs';
import { loadSave, writeSave, buildOf, equip, unequip, salvage, craft, applyArchetype, grantedSkills, syncSkillBar, SKILL_BAR } from './save.mjs';
import { equippedTraits, ladderStatus, detectArchetype } from './traits.mjs';
import { MapRun } from './run.mjs';
import { Scene3D, Overlay } from './scene.mjs';
import { dungeonRandom } from './dungeon.mjs';
import { runSelfUpdate } from '../self-update.mjs';
import { waystoneName, starterWaystones, FREE_TIER } from './waystones.mjs';
import { generateAtlas, newAtlasState, atlasView, completeNode, nodeMods, NODE_KINDS, NODE_MODS, FAMILY_HUE, REGION_NAME } from './atlas.mjs';
import { GI, BASE_ICON, SLOT_ICON, SKILL_ICON, CURRENCY_ICON, PANEL_ICON, FAMILY_ICON, LAYER_ICON, BUFF_ICON, probeIcons } from './icons.mjs';

const content = gameContent();
const ELEMENT_NAME = { physical: '物理', fire: '火焰', cold: '冰霜', lightning: '闪电', chaos: '混沌' };
const ELEMENT_HUE = { physical: '#d8c6a4', fire: '#ff8a3d', cold: '#8fd8ff', lightning: '#ffe066', chaos: '#c39bff' };
const EL_CLASS = { physical: 'phys', fire: 'fire', cold: 'cold', lightning: 'light', chaos: 'chaos' };
const SLOT_GLYPH = { weapon: '兵', offhand: '副', helmet: '盔', chest: '甲', gloves: '手', boots: '靴', belt: '带', amulet: '坠', ring1: '戒', ring2: '戒' };
const PANELS = [
  { id: 'atlas', name: '地图', key: 'M' }, { id: 'char', name: '角色', key: 'C' }, { id: 'bag', name: '背包', key: 'I' },
  { id: 'craft', name: '洗炼', key: 'K' }, { id: 'bd', name: '流派', key: 'B' }, { id: 'codex', name: '传奇', key: 'L' },
];
const TIER_ROMAN = ['', 'Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅷ', 'Ⅸ', 'Ⅹ', 'Ⅺ', 'Ⅻ', 'XIII', 'XIV', 'XV', 'XVI'];

function skillElement(id) {
  const d = content.skills.get(id)?.damage ?? {};
  let best = 'physical', v = -1;
  for (const [k, x] of Object.entries(d)) if (typeof x === 'number' && x > v) { v = x; best = k; }
  return best;
}
const skillTags = id => (content.skills.get(id)?.tags ?? []).filter(t => ['spell', 'attack', 'melee', 'projectile', 'area', 'channel', 'minion', 'totem', 'movement'].includes(t))
  .map(t => ({ spell: '法术', attack: '攻击', melee: '近战', projectile: '投射物', area: '范围', channel: '引导', minion: '召唤', totem: '图腾', movement: '位移' })[t]);
const skillName = id => content.skills.get(id)?.name ?? id;
const itemIcon = it => BASE_ICON[it.base] ?? SLOT_ICON[it.slot];

// ------------------------------------------------------------------ small components
const Gi = {
  props: { n: String, c: { type: String, default: '' }, g: { type: String, default: '' } },
  setup(p) { return { url: computed(() => GI(p.n)) }; },
  template: `<i class="gi" :class="c" :style="{ '--i': url }" :data-g="g"></i>`,
};

const ItemTip = {
  components: { Gi },
  props: { item: Object, compare: Object, selected: { type: Object, default: null }, selectable: Boolean, inline: Boolean },
  emits: ['line'],
  setup() { return { rarityOf, itemName, lineText, family, LAYERS, SLOT_NAMES, SLOT_GLYPH, baseOf, baseDefence, skillName, skillTags, legendary, itemIcon, LAYER_ICON, SKILL_ICON }; },
  template: /* html */ `
  <article class="itip" :class="['r-' + rarityOf(item).id, { inline }]">
    <header class="itip-head">
      <div class="itip-icon"><Gi :n="itemIcon(item)" :c="'r-' + rarityOf(item).id" :g="SLOT_GLYPH[item.slot]"/></div>
      <h3>{{ itemName(item) }}</h3>
      <p>{{ rarityOf(item).name }}{{ SLOT_NAMES[item.slot] }} · {{ baseOf(item.slot, item.base)?.name }} · 物品 T{{ item.tier }}</p>
      <p v-if="item.preset" class="itip-preset">流派配装 · {{ item.preset }}</p>
    </header>
    <p v-if="baseDefence(item).length" class="itip-base">{{ baseDefence(item).map(d => '+' + d.value + ' ' + d.name).join(' · ') }}</p>
    <p v-if="item.legend" class="itip-legend"><b>传奇特性</b>{{ legendary(item.legend).legend.text }}</p>
    <ul class="itip-traits">
      <li v-if="item.skill" class="itip-skill"><Gi :n="SKILL_ICON[item.skill] ?? 'magic-swirl'" c="el-gold"/><span>主动技能 · {{ skillName(item.skill) }}</span><em>{{ skillTags(item.skill).join(' · ') }}</em></li>
      <li v-for="(l, i) in item.traits" :key="'t' + i" :class="['l-' + family(l.id).layer, { on: selected?.kind === 'trait' && selected.index === i, sealed: l.sealed, pick: selectable }]" @click="selectable && $emit('line', { kind: 'trait', index: i })">
        <Gi :n="LAYER_ICON[family(l.id).layer]" :c="'ly-' + family(l.id).layer"/><span>{{ lineText(l) }}</span><em>{{ LAYERS[family(l.id).layer].name }} T{{ l.tier }}<b v-if="l.sealed"> · 封</b></em></li>
    </ul>
    <ul class="itip-lines" v-if="item.lines.length">
      <li v-for="(l, i) in item.lines" :key="i" :class="{ on: selected?.kind === 'line' && selected.index === i, sealed: l.sealed, pick: selectable }" @click="selectable && $emit('line', { kind: 'line', index: i })">
        <span>{{ lineText(l) }}</span><em>T{{ l.tier }}<b v-if="l.sealed"> · 封</b></em></li>
    </ul>
    <p v-if="item.legend" class="itip-flavor">{{ legendary(item.legend).flavor }}</p>
    <footer v-if="compare && compare !== item" class="itip-cmp">
      <h4>身上 · {{ itemName(compare) }}</h4>
      <p v-for="(l, i) in [...compare.traits, ...compare.lines].slice(0, 6)" :key="i">{{ lineText(l) }}</p>
    </footer>
  </article>`,
};

const Minimap = {
  props: { run: Object, tick: Number },
  setup(props) {
    const el = ref(null);
    let base = null, layout = null;
    function draw() {
      const c = el.value, r = props.run; if (!c || !r) return;
      const d = r.dungeon, size = d.size, scale = c.width / size * 2.2, ctx = c.getContext('2d');
      if (layout !== d) {
        layout = d; base = document.createElement('canvas'); base.width = base.height = Math.ceil(size * scale);
        const b = base.getContext('2d');
        for (const t of d.tiles) { b.fillStyle = d.rooms[t.room]?.kind === 'boss' ? '#5a2a26' : t.room < 0 ? '#28324a' : '#3a4866'; b.fillRect(t.x * scale, t.y * scale, scale + .5, scale + .5); }
      }
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.save(); ctx.beginPath(); ctx.arc(c.width / 2, c.height / 2, c.width / 2, 0, 7); ctx.clip();
      const toMap = (x, y) => [(x + d.half) / d.tile * scale, (y + d.half) / d.tile * scale];
      const [hx, hy] = toMap(r.hero.x, r.hero.y);
      ctx.translate(c.width / 2 - hx, c.height / 2 - hy); ctx.globalAlpha = .9; ctx.drawImage(base, 0, 0); ctx.globalAlpha = 1;
      for (const m of r.monsters) { const [x, y] = toMap(m.x, m.y); ctx.fillStyle = m.boss ? '#ff6a4a' : m.kind === 'elite' ? '#ffd27a' : '#c8504a'; const s = m.boss ? 7 : m.kind === 'elite' ? 4 : 2.5; ctx.fillRect(x - s / 2, y - s / 2, s, s); }
      for (const l of r.loot) { const [x, y] = toMap(l.x, l.y); ctx.fillStyle = l.drop.item?.legend ? '#ffad5a' : '#fbe7b0'; ctx.fillRect(x - 1.5, y - 1.5, 3, 3); }
      ctx.restore();
      ctx.fillStyle = '#7fe0c8'; ctx.beginPath(); ctx.arc(c.width / 2, c.height / 2, 4, 0, 7); ctx.fill();
      ctx.strokeStyle = '#7fe0c8'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(c.width / 2, c.height / 2); ctx.lineTo(c.width / 2 + r.hero.aim.x * 12, c.height / 2 + r.hero.aim.y * 12); ctx.stroke();
    }
    watch(() => props.tick, draw); onMounted(draw);
    return { el };
  },
  template: `<div class="minimap"><canvas ref="el" width="200" height="200" aria-label="小地图"></canvas></div>`,
};

// ------------------------------------------------------------------ page
const TEMPLATE = /* html */ `
<div class="g" :class="{ 'in-run': run }">
  <div class="stage" ref="stage" tabindex="0" @contextmenu.prevent><div class="overlay" ref="overlay"></div></div>
  <div class="camp-bg" v-if="!run"><i class="mist m1"></i><i class="mist m2"></i><i class="glow"></i></div>

  <!-- =================== RUN HUD =================== -->
  <template v-if="run">
    <section class="plate panel">
      <div class="plate-tier"><small>T</small>{{ run.tier }}</div>
      <div class="plate-body">
        <h2>{{ familyName(run.profile.family) }}</h2>
        <div class="plate-bar"><i :style="{ width: pct(hud.kills, hud.total) }"></i></div>
        <p><span>{{ hud.time }}</span><span>击杀 {{ hud.kills }} / {{ hud.total }}</span><span v-if="run.profile.resistPenalty" class="warn">全抗 −{{ run.profile.resistPenalty }}%</span></p>
      </div>
      <button class="plate-leave" @click="leaveRun">{{ run.phase === 'running' ? '撤离' : '离开' }}</button>
    </section>
    <minimap :run="run" :tick="hud.tick"></minimap>

    <section class="bossbar" v-if="hud.bossShow" :class="{ enraged: hud.bossEnraged }">
      <h3>{{ hud.bossName }}<small v-for="m in hud.bossMods" :key="m">{{ m }}</small><em v-if="hud.bossEnraged">狂暴</em></h3>
      <div class="bossbar-track"><i class="ghost" :style="{ width: hud.bossLife }"></i><i class="life" :style="{ width: hud.bossLife }"></i><i class="es" :style="{ width: hud.bossEs }"></i></div>
    </section>

    <div class="combo" v-show="hud.combo >= 5" ref="comboEl" :class="{ hot: hud.combo >= 40 }"><b>{{ hud.combo }}</b><span>连杀</span><small v-if="hud.cascadePct">连锁 {{ hud.cascadePct }}%</small></div>
    <p class="clearflash" ref="flashEl">清 屏<small>{{ hud.flashN }} 杀 / 秒</small></p>

    <!-- Elden Ring-like: vitals and the skill cross in the bottom-left corner, nothing in the middle -->
    <section class="er-left">
      <div class="buffs">
        <span v-for="r in hud.resources" :key="r.id" class="buff res"><Gi :n="buffIcon(r.id)" c="el-gold"/><sub>{{ r.value }}</sub></span>
        <span v-for="s in hud.buffs" :key="s.id" class="buff" :style="{ '--c': s.color }" :title="s.name">{{ s.name }}<sub v-if="s.stacks > 1">{{ s.stacks }}</sub></span>
      </div>
      <div class="er-bars">
        <div class="er-bar life" :class="{ low: hud.life < hud.lifeMax * 0.3 }" :style="{ width: barLen(hud.lifeMax + hud.esMax, 3000, 230, 420) }" :title="'生命 ' + hud.life + ' / ' + hud.lifeMax">
          <i class="ghost" :style="{ width: pct(hud.life, hud.lifeMax) }"></i><i class="fill" :style="{ width: pct(hud.life, hud.lifeMax) }"></i>
          <i class="es" v-if="hud.esMax" :style="{ width: pct(hud.es, hud.esMax) }"></i>
        </div>
        <span class="er-num">{{ hud.life }}<template v-if="hud.esMax"> · <em>{{ hud.es }}</em></template></span>
        <div class="er-bar mana" :style="{ width: barLen(hud.manaMax, 260, 150, 300) }" :title="'魔力 ' + hud.mana + ' / ' + hud.manaMax">
          <i class="fill" :style="{ width: pct(hud.mana, hud.manaMax) }"></i>
        </div>
        <span class="er-num">{{ hud.mana }}</span>
      </div>
      <div class="er-cross">
        <button v-for="i in 4" :key="i" class="skill" :class="['pos-' + i, hud.skills[i - 1] ? ['el-' + hud.skills[i - 1].el, { on: i - 1 === hud.selected, channel: hud.skills[i - 1].channel }] : 'empty']" @click="selectSkill(i - 1)" :title="hud.skills[i - 1] ? hud.skills[i - 1].name + '（按 ' + i + ' 选择，按住左键施放）' : '空技能位'">
          <template v-if="hud.skills[i - 1]">
            <Gi :n="hud.skills[i - 1].icon" :c="'el-' + hud.skills[i - 1].el" :g="hud.skills[i - 1].name.slice(0, 1)"/>
            <i class="cd" v-if="hud.skills[i - 1].cd > 0" :style="{ '--p': hud.skills[i - 1].cdPct }"></i>
          </template>
          <kbd>{{ i }}</kbd>
        </button>
        <p class="er-skill-name">{{ hud.skills[hud.selected]?.name }}</p>
      </div>
    </section>
    <section class="er-right"><b>{{ hud.kills }}</b><small>/ {{ hud.total }} 击杀</small><small class="er-hint">点掉落名拾取 · 按住 Alt 显示全部</small></section>

    <div class="toasts"><p v-for="t in toasts" :key="t.id" :class="t.cls"><Gi v-if="t.icon" :n="t.icon" :c="t.ic || ''"/>{{ t.text }}</p></div>
    <div class="legend-drop" v-if="legendBanner" :key="legendBanner.id"><small>传奇掉落</small><b>{{ legendBanner.name }}</b></div>

    <section class="result panel" v-if="run.phase !== 'running'" :class="run.phase">
      <h2>{{ run.phase === 'cleared' ? '地 图 完 成' : '你 倒 下 了' }}</h2>
      <dl>
        <div><dt>用时</dt><dd>{{ hud.time }}</dd></div><div><dt>击杀</dt><dd>{{ hud.kills }}</dd></div>
        <div><dt>最高连杀</dt><dd>{{ run.bestCombo }}</dd></div><div><dt>连锁击杀</dt><dd>{{ pctNum(run.cascadeKills, hud.kills) }}%</dd></div>
      </dl>
      <p v-if="run.phase === 'cleared'">带回 {{ resultLoot.items }} 件装备、{{ resultLoot.currencies }} 个通货、{{ resultLoot.stones }} 块路石<template v-if="resultLoot.legend">，其中 {{ resultLoot.legend }} 件传奇</template><template v-if="resultLoot.opened">；新开放 {{ resultLoot.opened }} 个节点</template></p>
      <p v-else>只带回已经拾取的东西。回营地看看「本图要求」哪一项没达标。</p>
      <button class="orn-btn primary" @click="leaveRun">回到营地</button>
    </section>
  </template>

  <!-- =================== CAMP =================== -->
  <template v-else>
    <header class="topbar">
      <div class="crest"><Gi :n="skillIcon(primarySkill)" :c="'el-' + skillEl(primarySkill)"/></div>
      <div class="who"><h1>营 地</h1><p>{{ currentBd }}</p></div>
      <div class="facts"><span><b>T{{ save.unlocked }}</b>最高</span><span><b>{{ save.atlas.done.length }}</b>已打通</span><span><b>{{ save.stats.maps }}</b>通关</span><span><b>{{ save.stats.kills }}</b>击杀</span></div>
      <a class="orn-btn ghost sm" href="/editor/" target="_blank" rel="noopener">内容编辑器</a>
      <button class="orn-btn ghost sm" @click="update">{{ updateText || '更新到最新' }}</button>
    </header>

    <!-- the map device: waystones in the stash; the atlas itself opens from the rail (M) -->
    <main class="hub panel">
      <h2 class="ttl">地图装置</h2>
      <p class="hub-lead">每张地图要放入一块路石才能开启：路石 T 阶不低于节点，开图时消耗。打倒首领必掉路石，精英偶尔掉落。营地旁的 T1 节点不需要路石。</p>
      <div class="ws-grid">
        <button v-for="w in stash" :key="w.uid" class="ws" :class="'w-' + w.rarity" :title="waystoneTip(w)" @click="openAtlasFor(w)"><Gi n="stone-tablet" :c="'w-' + w.rarity"/><b>{{ w.tier }}</b></button>
        <p v-if="!stash.length" class="hint">还没有路石。去 T1 节点打首领拿第一块。</p>
      </div>
      <p class="hub-count"><b>{{ save.waystones.length }}</b> 块路石 · 已打通 <b>{{ save.atlas.done.length }}</b> / {{ atlas.nodes.length }} 节点 · 可进入 <b>{{ atlasOpenCount }}</b></p>
      <button class="orn-btn primary big" @click="toggle('atlas')">打开图集 · M</button>
    </main>
  </template>

  <!-- =================== ATLAS (rail · M) =================== -->
  <section class="atlas-win" v-if="atlasOpen" aria-label="地图图集">
    <header class="atlas-top"><h2>图 集</h2><span>{{ save.waystones.length }} 块路石</span><button class="x" @click="toggle('atlas')" aria-label="关闭">×</button></header>
    <!-- PoE2-like atlas: a seeded star map; clear a node to open the roads around it -->
    <div class="atlas" ref="atlasEl" :class="{ dragging: atlasDrag.moved, far: atlasFar }" @pointerdown="atlasDown" @pointermove="atlasMove" @pointerup="atlasUp" @pointercancel="atlasUp" @wheel.prevent="atlasWheel">
      <svg class="atlas-svg" :viewBox="atlasBox" preserveAspectRatio="xMidYMid slice" aria-label="地图图集">
        <defs>
          <radialGradient v-for="r in atlasRegions" :key="'g' + r.id" :id="'rg-' + r.id"><stop offset="0" :stop-color="r.hue" stop-opacity=".28"/><stop offset="1" :stop-color="r.hue" stop-opacity="0"/></radialGradient>
          <filter id="fog-blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="46"/></filter>
          <mask id="fog-mask" maskUnits="userSpaceOnUse" :x="-atlas.radius * 2" :y="-atlas.radius * 2" :width="atlas.radius * 4" :height="atlas.radius * 4">
            <rect :x="-atlas.radius * 2" :y="-atlas.radius * 2" :width="atlas.radius * 4" :height="atlas.radius * 4" fill="#fff"/>
            <g filter="url(#fog-blur)"><circle v-for="n in atlasLit" :key="'f' + n.id" :cx="n.x" :cy="n.y" :r="n.fog" fill="#000"/></g>
          </mask>
        </defs>
        <circle v-for="r in atlasRegions" :key="'b' + r.id" :cx="r.x" :cy="r.y" :r="atlas.radius * .62" :fill="'url(#rg-' + r.id + ')'"/>
        <g class="rings"><g v-for="ring in atlasRings" :key="ring.t"><circle :r="ring.r"/><text :y="-ring.r - 10">T{{ ring.t }}</text></g></g>
        <rect class="fog" :x="-atlas.radius * 2" :y="-atlas.radius * 2" :width="atlas.radius * 4" :height="atlas.radius * 4" mask="url(#fog-mask)"/>
        <g class="stars"><circle v-for="n in atlasStars" :key="'s' + n.id" :cx="n.x" :cy="n.y" :r="n.r" :fill="n.hue"/></g>
        <text v-for="r in atlasRegions" :key="'n' + r.id" class="region-name" :x="r.lx" :y="r.ly" :fill="r.hue">{{ r.name }}</text>
        <g class="roads"><line v-for="e in atlasRoads" :key="e.k" :class="e.cls" :x1="e.x1" :y1="e.y1" :x2="e.x2" :y2="e.y2"/></g>
        <g v-for="n in atlasLandmarks" :key="'l' + n.id" class="landmark" :transform="'translate(' + n.x + ' ' + n.y + ')'"><image :href="kindIconUrl('boss', '#7a6a8a')" x="-14" y="-14" width="28" height="28"/></g>
        <g v-for="n in atlasShown" :key="n.id" class="node" :class="['st-' + n.st, 'k-' + n.kind, { sel: n.id === atlasSel, here: n.id === save.atlas.at }]" :style="{ '--hue': n.hue }" :transform="'translate(' + n.x + ' ' + n.y + ')'" @click="selectNode(n.id)">
          <circle class="halo" :r="n.kind === 'boss' ? 30 : 22"/>
          <circle class="ring" :r="n.kind === 'boss' ? 19 : n.kind === 'normal' ? 12 : 15"/>
          <image v-if="n.kind !== 'normal'" :href="kindIconUrl(n.kind, n.st === 'done' ? '#2a1a06' : '#fbe7b0')" :x="n.kind === 'boss' ? -12 : -9" :y="n.kind === 'boss' ? -12 : -9" :width="n.kind === 'boss' ? 24 : 18" :height="n.kind === 'boss' ? 24 : 18"/>
          <text v-else class="tier" dy=".35em">{{ n.st === 'seen' ? '?' : n.tier }}</text>
          <text v-if="n.kind !== 'normal'" class="tier-sm" :y="n.kind === 'boss' ? 33 : 28">T{{ n.tier }}</text>
          <text v-if="n.label" class="name" :y="n.kind === 'boss' ? -30 : -22">{{ n.name }}</text>
          <path v-if="n.id === save.atlas.at" class="here-mark" d="M0 -9 L6 0 L0 9 L-6 0Z" :transform="'translate(0 ' + (n.kind === 'boss' ? 44 : 36) + ')'"/>
        </g>
      </svg>
    </div>

    <section class="atlas-card panel" v-if="selNode">
      <header class="ac-head">
        <div class="ac-icon" :style="{ '--hue': selNode.hue }"><Gi v-if="selNode.kind !== 'normal'" :n="kinds[selNode.kind].icon" c="el-gold"/><b v-else>{{ selNode.tier }}</b></div>
        <div><h2>{{ selNode.name }}</h2><p>T{{ runTier }} · {{ regionName(selNode.family) }} · <span :class="'st-' + selNode.st">{{ statusName(selNode.st) }}</span></p></div>
      </header>
      <div class="ac-body">
        <p class="ac-kind" v-if="selNode.kind !== 'normal'"><b>{{ kinds[selNode.kind].name }}</b>{{ kinds[selNode.kind].text }}</p>
        <ul class="ac-mods" v-if="selNode.mods.length"><li v-for="m in selNode.mods" :key="m">{{ nodeModText(m) }}</li></ul>
        <p class="ac-loot"><span>物品数量 <b>{{ Math.round(selMods.quantity * 100) }}%</b></span><span>传奇几率 <b>×{{ +selMods.legend.toFixed(1) }}</b></span><span>怪群 <b>×{{ +selMods.pack.toFixed(1) }}</b></span></p>
        <dl class="pressure">
          <div><dt>杂兵生命</dt><dd>{{ fmt(profile.monsterLife * selMods.life) }}</dd></div>
          <div><dt>单次伤害</dt><dd>{{ fmt(profile.monsterDamage * selMods.damage) }}</dd></div>
          <div><dt>每个房间</dt><dd>约 {{ Math.round(profile.packSize * selMods.pack) }} 只</dd></div>
          <div><dt>精英</dt><dd>{{ Math.round(profile.eliteChance * selMods.elite * 100) }}% · {{ profile.eliteMods }} 词缀</dd></div>
          <div><dt>首领</dt><dd>{{ fmt(profile.bossLife * selMods.bossLife * selMods.life) }}</dd></div>
          <div><dt>全抗惩罚</dt><dd :class="{ warn: profile.resistPenalty }">−{{ profile.resistPenalty }}%</dd></div>
        </dl>
        <h4 class="sub">本图要求</h4>
        <ul class="req">
          <li v-for="r in requirements" :key="r.name" :class="r.ok ? 'ok' : 'bad'"><i></i><span>{{ r.name }}</span><b>{{ r.have }}</b><em>{{ r.need }}</em></li>
        </ul>
        <div class="roles">
          <button class="orn-btn sm" @click="evaluate" :disabled="evaluating">{{ evaluating ? '评估中…' : '评估输出' }}</button>
          <template v-if="roles">
            <div class="role"><span>攻坚</span><div class="meter"><i :style="{ width: Math.min(100, roles.bossing * 50) + '%' }"></i></div><b>{{ roles.bossing.toFixed(2) }}</b><small>首领 {{ roles.ttk === Infinity ? '打不动' : '约 ' + roles.ttk.toFixed(0) + ' 秒' }}</small></div>
            <div class="role"><span>速刷</span><div class="meter"><i :style="{ width: Math.min(100, roles.clearing * 50) + '%' }"></i></div><b>{{ roles.clearing.toFixed(2) }}</b><small>每秒击杀 {{ roles.kps.toFixed(1) }}</small></div>
          </template>
        </div>
      </div>
      <div class="ac-stone">
        <h4 class="sub">路石 <small>{{ freeNode ? 'T1 节点不需要路石' : '需要 T' + selNode.tier + ' 及以上，开图时消耗' }}</small></h4>
        <div class="ws-row" v-if="!freeNode">
          <button v-for="w in usable" :key="w.uid" class="ws" :class="['w-' + w.rarity, { on: w.uid === wsSel }]" :title="waystoneTip(w)" @click="wsSel = w.uid"><Gi n="stone-tablet" :c="'w-' + w.rarity"/><b>{{ w.tier }}</b></button>
          <p v-if="!usable.length" class="ws-none">没有 T{{ selNode.tier }}+ 路石</p>
        </div>
        <ul class="ac-mods ws-mods" v-if="stone && stone.mods.length"><li v-for="m in stone.mods" :key="m">{{ nodeModText(m) }}</li></ul>
        <p class="ws-tier" v-if="stone && stone.tier > selNode.tier">路石 T{{ stone.tier }} 高于节点：本次按 T{{ stone.tier }} 打</p>
      </div>
      <footer class="ac-foot">
        <button class="orn-btn primary big" :disabled="!canStart" @click="startRun">{{ startText }}</button>
      </footer>
    </section>

    <section class="atlas-foot">
      <p><b>{{ save.atlas.done.length }}</b> / {{ atlas.nodes.length }} 已打通 · 可进入 <b>{{ atlasOpenCount }}</b></p>
      <ul><li v-for="(k, id) in kinds" :key="id" v-show="id !== 'normal'"><Gi :n="k.icon" c="el-gold"/>{{ k.name }}</li></ul>
      <button class="orn-btn ghost sm" @click="centerAtlas()">回到当前位置</button>
    </section>
  </section>

  <!-- =================== RAIL =================== -->
  <nav class="rail" aria-label="功能">
    <button v-for="p in panels" :key="p.id" :class="{ on: isOpen(p.id) }" @click="toggle(p.id)" :title="p.name + '（' + p.key + '）'">
      <Gi :n="panelIcon(p.id)" c="el-gold" :g="p.name.slice(0, 1)"/><b>{{ p.name }}</b><kbd>{{ p.key }}</kbd></button>
  </nav>

  <!-- =================== CHARACTER =================== -->
  <section class="win panel win-left" v-if="open.char" aria-label="角色">
    <header class="win-head"><h2>角 色</h2><button class="x" @click="open.char = false" aria-label="关闭">×</button></header>
    <div class="win-body">
      <div class="hero-card">
        <div class="portrait"><Gi :n="skillIcon(primarySkill)" :c="'el-' + skillEl(primarySkill)"/></div>
        <div><h3>{{ ladder ? ladder.archetype.name : '无名旅人' }}</h3><p>{{ currentBd }}</p></div>
      </div>
      <div class="doll">
        <button v-for="s in slots" :key="s" class="slot" :class="['s-' + s, slotClass(s), { drop: dropSlot === s }]" @click="pick(save.equipped[s])" @contextmenu.prevent="doUnequip(s)"
          @mouseenter="hoverOn($event, save.equipped[s])" @mouseleave="hoverOff" @dragover.prevent="dropSlot = s" @dragleave="dropSlot = null" @drop.prevent="dropOn(s)">
          <Gi v-if="save.equipped[s]" :n="itemIcon(save.equipped[s])" :c="'r-' + rarity(save.equipped[s]).id" :g="glyph[s]"/>
          <Gi v-else :n="slotIcon(s)" c="ghost" :g="glyph[s]"/>
          <small>{{ slotNames[s] }}</small>
        </button>
      </div>
      <p class="hint center">右键卸下 · 从背包拖到这里装备</p>
      <dl class="stats"><div v-for="r in statRows" :key="r[0]"><dt>{{ r[0] }}</dt><dd>{{ r[1] }}</dd></div></dl>
      <h4 class="sub">技能栏 <small>技能来自装备第 1 条基底</small></h4>
      <div class="barpick">
        <label v-for="i in skillBar" :key="i" class="barslot"><kbd>{{ i }}</kbd>
          <span class="barico"><Gi v-if="save.skills[i - 1]" :n="skillIcon(save.skills[i - 1])" :c="'el-' + skillEl(save.skills[i - 1])"/></span>
          <select v-model="save.skills[i - 1]" @change="gearChanged" :aria-label="'技能栏 ' + i">
            <option :value="null">（空）</option>
            <option v-for="id in granted" :key="id" :value="id">{{ skillName(id) }}</option>
          </select></label>
      </div>
      <template v-if="ladder">
        <h4 class="sub">质变 <small>{{ ladder.archetype.name }} · {{ ladder.reached >= 0 ? '已到「' + ladder.stages[ladder.reached].title + '」' : '尚未成型' }}</small></h4>
        <ol class="ladder">
          <li v-for="st in ladder.stages" :key="st.index" :class="{ done: st.lit, now: st.index === ladder.reached, next: st.index === ladder.reached + 1 }" :title="st.text + '\\n' + st.keys.map(k => (k.on ? '✓ ' : '· ') + k.name).join('\\n')">
            <i></i><span>{{ st.title }}</span><small>{{ st.got }}/{{ st.keys.length }}</small></li>
        </ol>
        <p class="ladder-now" v-if="ladderFocus">{{ ladderFocus.text }}</p>
      </template>
      <h4 class="sub">特性 <small>{{ traits.all.length }} 条 · {{ traits.distinct }} 种</small></h4>
      <div class="traits">
        <article v-for="(t, i) in traits.all" :key="i" class="trait" :class="'l-' + t.layer"><Gi :n="layerIcon(t.layer)" :c="'ly-' + t.layer"/><p>{{ t.text }}</p><em>{{ glyph[t.slot] }}·T{{ t.tier }}</em></article>
        <p v-if="!traits.all.length" class="hint">还没有特性。每件装备的基底都带特性。</p>
      </div>
    </div>
  </section>

  <!-- =================== BAG =================== -->
  <section class="win panel win-right" v-if="open.bag" aria-label="背包">
    <header class="win-head"><h2>行 囊</h2><span class="count">{{ save.inventory.length }} 件</span><button class="x" @click="open.bag = false" aria-label="关闭">×</button></header>
    <div class="win-body">
      <div class="grid">
        <button v-for="(it, i) in bagCells" :key="it ? it.uid : 'e' + i" class="cell" :class="it ? ['r-' + rarity(it).id, { on: picked === it }] : 'empty'" :draggable="!!it"
          @dragstart="it && dragStart(it)" @dragend="dragItem = null; dropSlot = null" @click="it && pick(it)" @dblclick="it && doEquip(it.uid)" @contextmenu.prevent="it && doEquip(it.uid)"
          @mouseenter="it && hoverOn($event, it)" @mouseleave="hoverOff">
          <template v-if="it"><Gi :n="itemIcon(it)" :c="'r-' + rarity(it).id" :g="glyph[it.slot]"/><b>{{ it.tier }}</b><i v-if="it.skill" class="cell-skill" title="带主动技能"></i></template>
        </button>
      </div>
      <div class="bag-actions" v-if="picked && save.inventory.includes(picked)">
        <span class="sel">{{ itemNameOf(picked) }}</span>
        <button class="orn-btn primary sm" @click="doEquip(picked.uid)">装备</button><button class="orn-btn sm" @click="openCenter('craft')">洗炼</button><button class="orn-btn danger sm" @click="doSalvage(picked.uid)">分解</button>
      </div>
      <p v-else class="hint center">双击或右键装备 · 拖到角色装备位 · 点选后可洗炼或分解</p>
      <div class="wallet"><span v-for="(c, id) in currencies" :key="id" :title="c.name + '：' + c.desc"><Gi :n="curIcon(id)" c="r-currency"/><b>{{ save.currencies[id] || 0 }}</b></span></div>
      <p class="hint center" v-if="craftMsg">{{ craftMsg }}</p>
    </div>
  </section>

  <!-- =================== CENTER: CRAFT / BD / CODEX =================== -->
  <section class="win panel win-center" v-if="center" :class="'c-' + center" :aria-label="centerName">
    <header class="win-head"><h2>{{ centerTitle }}</h2><button class="x" @click="center = null" aria-label="关闭">×</button></header>
    <div class="win-body">
      <div v-if="center === 'craft'" class="craft">
        <div class="craft-item">
          <item-tip v-if="picked" :item="picked" inline selectable :selected="pickedLine" @line="sel => pickedLine = sel"></item-tip>
          <p v-else class="hint">先在角色或背包里点一件装备。</p>
        </div>
        <div class="craft-side">
          <div class="anvil"><Gi n="anvil" c="el-gold"/></div>
          <p class="craft-sel" v-if="picked">{{ pickedLine ? '已选：' + (pickedLine.kind === 'trait' ? '基底特性' : '随机词条') + ' 第 ' + (pickedLine.index + 1) + ' 条' : '点选一条特性或词条（封印、淬火、精华作用于选中的那条）' }}</p>
          <div class="orbs">
            <button v-for="(c, id) in currencies" :key="id" class="orb-cur" :disabled="!picked || !(save.currencies[id] > 0)" @click="doCraft(id)" :title="c.desc">
              <Gi :n="curIcon(id)" c="r-currency"/><b>{{ c.name }}</b><em>{{ save.currencies[id] || 0 }}</em><small>{{ c.desc }}</small></button>
          </div>
          <p class="craftlog" v-if="craftMsg" :key="craftMsg">{{ craftMsg }}</p>
        </div>
      </div>

      <div v-if="center === 'bd'" class="bd">
        <ul class="bd-list">
          <li v-for="a in archetypes" :key="a.id"><button :class="{ on: bdSel === a.id, current: save.archetype === a.id }" @click="bdSel = a.id">
            <Gi :n="skillIcon(a.skills[0])" :c="'el-' + skillEl(a.skills[0])"/><b>{{ a.name }}</b><small>{{ a.style }}</small></button></li>
        </ul>
        <div class="bd-detail" v-if="bdArch">
          <h3>{{ bdArch.name }} <small>{{ bdArch.style }} · {{ skillName(bdArch.skills[0]) }}</small></h3>
          <p class="bd-summary">{{ bdArch.summary }}</p>
          <ol class="bd-stages">
            <li v-for="(s, i) in bdStages" :key="i" :class="{ current: save.archetype === bdArch.id && save.bdStage === i }">
              <div class="st-num"><b>{{ s.name }}</b><small>T{{ s.maps[0] }}–{{ s.maps[1] }}</small></div>
              <div class="st-body">
                <h4>{{ s.ladder.title }} <small>装备 T{{ s.itemTier }} · {{ s.traitCount }} 特性 · {{ s.total - s.traitCount }} 数值</small></h4>
                <p>{{ s.ladder.text }}</p>
                <p class="st-keys" v-if="s.newKeys.length"><em>本阶段拿到</em>{{ s.newKeys.join('；') }}</p>
              </div>
              <button class="orn-btn primary sm" @click="applyBd(bdArch.id, i)">{{ save.archetype === bdArch.id && save.bdStage === i ? '重新应用' : '一键应用' }}</button>
            </li>
          </ol>
          <p class="hint">应用后当前装备放回背包（之前一键应用的流派装备直接替换），技能栏换成该流派技能。地图里也能换，立即生效。</p>
        </div>
      </div>

      <div v-if="center === 'codex'" class="codex">
        <p class="hint">25 件传奇，每件一条改写玩法的传奇特性；基底其余特性和随机词条照常随机。首领约三分之一几率掉落，精英偶尔掉落。「试玩」直接放一件进背包。</p>
        <div class="codex-grid">
          <article v-for="L in legendaries" :key="L.id" class="lcard" :class="'th-' + L.theme">
            <div class="lcard-icon"><Gi :n="baseIcon(L.base)" c="r-legendary"/></div>
            <h4>{{ L.name }}</h4><p class="lcard-slot">{{ slotNames[L.slot] }}<template v-if="L.skill"> · {{ skillName(L.skill) }}</template></p>
            <p class="lcard-text">{{ L.legend.text }}</p>
            <p class="lcard-flavor">{{ L.flavor }}</p>
            <button class="orn-btn sm" @click="grantLegendary(L.id)">试玩</button>
          </article>
        </div>
      </div>
    </div>
  </section>

  <div class="tipwrap" ref="tipEl" v-show="hover"><item-tip v-if="hover" :item="hover.item" :compare="hover.compare"></item-tip></div>
  <p class="credit">图标 game-icons.net（CC BY 3.0）</p>
</div>`;

export function mountGame(el) {
  const app = createApp({
    components: { ItemTip, Minimap, Gi },
    template: TEMPLATE,
    setup() {
      const save = reactive(loadSave());
      const persist = () => writeSave(save);
      const stage = ref(null), overlay = ref(null), tipEl = ref(null), comboEl = ref(null), flashEl = ref(null);
      const open = reactive({ char: false, bag: false }), center = ref(null);
      const mapTier = ref(Math.min(save.unlocked, MAP_TIERS)), mapFamily = ref('ruin');
      const picked = ref(null), pickedLine = ref(null), craftMsg = ref(''), roles = ref(null), evaluating = ref(false), updateText = ref('');
      const hover = ref(null), bdSel = ref(save.archetype ?? ARCHETYPES[0].id), toasts = ref([]), legendBanner = ref(null);
      const dragItem = ref(null), dropSlot = ref(null);
      const run = ref(null), resultLoot = reactive({ items: 0, currencies: 0, stones: 0, legend: 0, opened: 0, done: false });
      const hud = reactive({ combo: 0, cascadePct: 0, flashN: 0, tick: 0, time: '0:00', kills: 0, total: 0, life: 0, lifeMax: 1, es: 0, esMax: 0, mana: 0, manaMax: 1, skills: [], selected: 0, resources: [], buffs: [],
        bossShow: false, bossName: '', bossMods: [], bossLife: '100%', bossEs: '0%', bossEnraged: false });
      const rng = dungeonRandom(Date.now() >>> 0);
      let scene = null, ov = null, raf = 0, last = 0, acc = 0, toastId = 0, seenPicked = 0, seenClear = -1, gsap = null, floating = null, seenLoot = new Set();
      const keys = new Set(), mouse = { x: 0, y: 0, down: false };

      // Proven libraries from the CDN; the UI still works (plainer) without them.
      import('https://cdn.jsdelivr.net/npm/gsap@3.12.5/+esm').then(m => { gsap = m.gsap; }).catch(() => {});
      import('https://cdn.jsdelivr.net/npm/@floating-ui/dom@1.6.10/+esm').then(m => { floating = m; }).catch(() => {});

      // ---- atlas ---------------------------------------------------------------------------------
      if (!save.atlas?.done) save.atlas = newAtlasState((Date.now() ^ (Math.random() * 1e9)) >>> 0, save.unlocked);
      const atlas = markRaw(generateAtlas(save.atlas.seed));
      const atlasEl = ref(null), viewSize = reactive({ w: innerWidth, h: innerHeight });
      const view = computed(() => { void save.atlas.done.length; return atlasView(atlas, save.atlas); });
      const firstOpen = () => [...view.value.open].map(id => atlas.nodes[id]).sort((a, b) => a.tier - b.tier)[0]?.id ?? save.atlas.at;
      const atlasSel = ref(firstOpen());
      const cam = reactive({ x: 0, y: 0, k: 1.1 });
      const atlasDrag = reactive({ on: false, moved: false, sx: 0, sy: 0, cx: 0, cy: 0 });
      const decorate = n => ({ ...n, st: view.value.status(n.id), hue: FAMILY_HUE[n.family] });
      const selNode = computed(() => decorate(atlas.nodes[atlasSel.value]));
      // ---- waystones ------------------------------------------------------------------------------
      const atlasOpen = ref(false), wsSel = ref(null);
      if (!Array.isArray(save.waystones)) {
        const tiers = [...new Set([...atlasView(atlas, save.atlas).open].map(id => atlas.nodes[id].tier).filter(t => t > FREE_TIER))].sort((a, b) => a - b).slice(0, 4);
        save.waystones = starterWaystones(tiers, rng);
      }
      const RANK = { rare: 0, magic: 1, normal: 2 };
      const stash = computed(() => [...save.waystones].sort((a, b) => a.tier - b.tier || RANK[a.rarity] - RANK[b.rarity]));
      const freeNode = computed(() => atlas.nodes[atlasSel.value].tier <= FREE_TIER);
      const usable = computed(() => stash.value.filter(w => w.tier >= atlas.nodes[atlasSel.value].tier));
      const stone = computed(() => freeNode.value ? null : usable.value.find(w => w.uid === wsSel.value) ?? null);
      watch([atlasSel, () => save.waystones.length], () => { if (!usable.value.some(w => w.uid === wsSel.value)) wsSel.value = usable.value[0]?.uid ?? null; }, { immediate: true });
      const runTier = computed(() => Math.max(atlas.nodes[atlasSel.value].tier, stone.value?.tier ?? 0));
      const reachable = computed(() => ['done', 'open'].includes(view.value.status(atlasSel.value)));
      const canStart = computed(() => !run.value && reachable.value && (freeNode.value || !!stone.value));
      const startText = computed(() => run.value ? '地图中无法开启' : !reachable.value ? '尚未连通' : !freeNode.value && !stone.value ? '需要路石' : view.value.status(atlasSel.value) === 'done' ? '再次进入' : '开启地图');
      const waystoneTip = w => [waystoneName(w), ...w.mods.map(m => '· ' + NODE_MODS[m].text)].join('\n');
      function openAtlasFor(w) {
        const near = [...view.value.open, ...view.value.done].map(id => atlas.nodes[id]).filter(n => n.tier <= w.tier).sort((a, b) => b.tier - a.tier || (view.value.status(a.id) === 'open' ? -1 : 1))[0];
        if (near) { atlasSel.value = near.id; nextTick(() => { wsSel.value = w.uid; }); }
        if (!atlasOpen.value) toggle('atlas');
      }
      const selMods = computed(() => { const n = atlas.nodes[atlasSel.value]; return nodeMods({ kind: n.kind, mods: [...n.mods, ...(stone.value?.mods ?? [])] }); });
      const atlasShown = computed(() => atlas.nodes.map(decorate).filter(n => n.st !== 'hidden')
        .map(n => ({ ...n, label: n.id === atlasSel.value || n.st === 'open' || (n.kind === 'boss' && n.st !== 'seen') })));
      const atlasLit = computed(() => atlas.nodes.filter(n => view.value.status(n.id) !== 'hidden').map(n => ({ id: n.id, x: n.x, y: n.y, fog: { done: 210, open: 170, seen: 110 }[view.value.status(n.id)] })));
      // Unknown maps still glint through the fog, so the whole star map reads at a glance.
      const atlasStars = computed(() => atlas.nodes.filter(n => view.value.status(n.id) === 'hidden' && n.kind !== 'boss').map(n => ({ id: n.id, x: n.x, y: n.y, hue: FAMILY_HUE[n.family], r: 2 + (n.id * 7 % 5) * 0.5 })));
      const atlasLandmarks = computed(() => atlas.nodes.filter(n => n.kind === 'boss' && view.value.status(n.id) === 'hidden'));
      const atlasRoads = computed(() => atlas.edges.map(([a, b]) => {
        const sa = view.value.status(a), sb = view.value.status(b);
        if (sa === 'hidden' || sb === 'hidden') return null;
        const cls = sa === 'done' && sb === 'done' ? 'done' : (sa === 'done' || sb === 'done') ? 'open' : 'seen';
        return { k: a + '-' + b, cls, x1: atlas.nodes[a].x, y1: atlas.nodes[a].y, x2: atlas.nodes[b].x, y2: atlas.nodes[b].y };
      }).filter(Boolean));
      const atlasRegions = Object.keys(REGION_NAME).map(id => {
        const ns = atlas.nodes.filter(n => n.family === id && n.id), x = ns.reduce((s, n) => s + n.x, 0) / ns.length, y = ns.reduce((s, n) => s + n.y, 0) / ns.length;
        const l = Math.hypot(x, y) || 1;
        return { id, hue: FAMILY_HUE[id], name: REGION_NAME[id].split('').join(' '), x, y, lx: x / l * atlas.radius * 1.08, ly: y / l * atlas.radius * 1.08 };
      });
      const atlasRings = [4, 8, 12, 16].map(t => ({ t, r: Math.max(...atlas.nodes.filter(n => n.tier <= t).map(n => Math.hypot(n.x, n.y))) + 40 }));
      const atlasBox = computed(() => { const w = viewSize.w / cam.k, h = viewSize.h / cam.k; return `${(cam.x - w / 2).toFixed(1)} ${(cam.y - h / 2).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`; });
      const atlasFar = computed(() => cam.k < 0.7);
      const atlasOpenCount = computed(() => view.value.open.size);
      // The card covers the left ~430px, so "centre" means the middle of what is left of the screen.
      function centerAtlas(id = atlasSel.value) { const n = atlas.nodes[id]; cam.x = n.x - 200 / cam.k; cam.y = n.y; }
      function selectNode(id) { if (atlasDrag.moved) return; atlasSel.value = id; }
      function atlasDown(e) { if (e.button !== 0) return; Object.assign(atlasDrag, { on: true, moved: false, sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y }); }
      function atlasMove(e) {
        if (!atlasDrag.on) return;
        const dx = e.clientX - atlasDrag.sx, dy = e.clientY - atlasDrag.sy;
        if (!atlasDrag.moved && Math.hypot(dx, dy) > 5) { atlasDrag.moved = true; atlasEl.value?.setPointerCapture?.(e.pointerId); }
        if (atlasDrag.moved) { cam.x = atlasDrag.cx - dx / cam.k; cam.y = atlasDrag.cy - dy / cam.k; }
      }
      function atlasUp() { atlasDrag.on = false; setTimeout(() => { atlasDrag.moved = false; }, 0); }
      function atlasWheel(e) {
        const k = Math.max(0.35, Math.min(2.4, cam.k * Math.exp(-e.deltaY * 0.0015)));
        const mx = e.clientX - viewSize.w / 2, my = e.clientY - viewSize.h / 2;
        const wx = cam.x + mx / cam.k, wy = cam.y + my / cam.k;
        cam.k = k; cam.x = wx - mx / k; cam.y = wy - my / k;
      }
      watch([atlasSel, runTier], ([id, t]) => { const n = atlas.nodes[id]; mapTier.value = t; mapFamily.value = n.family; roles.value = null; }, { immediate: true });
      centerAtlas();

      const profile = computed(() => mapProfile(mapTier.value, mapFamily.value));
      const build = () => buildOf(save);
      const gearKey = ref(0);
      const report = computed(() => { void gearKey.value; return defenceReport(content, build(), mapTier.value, mapFamily.value); });
      const requirements = computed(() => {
        const d = report.value, req = mapRequirements(profile.value), r = e => `${Math.round(d.resists[e])}%`;
        return [
          { name: '火焰抗性', need: '需 75%', have: r('fire'), ok: d.resists.fire >= 75 },
          { name: '冰霜抗性', need: '需 75%', have: r('cold'), ok: d.resists.cold >= 75 },
          { name: '闪电抗性', need: '需 75%', have: r('lightning'), ok: d.resists.lightning >= 75 },
          { name: '混沌抗性', need: '需 0% 以上', have: r('chaos'), ok: d.resists.chaos >= 0 },
          { name: '首领重击', need: `一击约 ${d.bigHit}`, have: `生命池 ${Math.round(d.pool)}`, ok: d.bigHitOk },
          { name: '冰冻防护', need: req.freezeImmune ? '需异常免疫 40%' : '本阶不要求', have: `${Math.round(d.avoidAilment)}%`, ok: d.freezeOk },
        ];
      });
      const statRows = computed(() => {
        const d = report.value;
        return [['生命 + 护盾', Math.round(d.pool)], ['护甲', Math.round(d.armour)], ['闪避', Math.round(d.evasion)], ['格挡', `${Math.round(d.block)}%`],
          ['火 / 冰 / 电', `${Math.round(d.resists.fire)} / ${Math.round(d.resists.cold)} / ${Math.round(d.resists.lightning)}%`], ['混沌抗性', `${Math.round(d.resists.chaos)}%`],
          ['生命回复', `${Math.round(d.regen)}/秒`], ['异常免疫', `${Math.round(d.avoidAilment)}%`]];
      });
      const bdArch = computed(() => ARCHETYPES.find(a => a.id === bdSel.value));
      const keyName = (fid, itemTier) => { const t = lineTierFor(fid, itemTier); return t ? lineText({ id: fid, tier: t }) : family(fid).name; };
      const bdStages = computed(() => bdArch.value ? STAGES.map((s, i) => { const c = collectionList(bdArch.value, i); return { ...s, total: c.total, traitCount: c.traitCount, ladder: bdArch.value.ladder[i], newKeys: c.newKeys.map(f => keyName(f, s.itemTier)) }; }) : []);
      const traits = computed(() => { void gearKey.value; return equippedTraits(save); });
      const granted = computed(() => { void gearKey.value; return grantedSkills(save); });
      const ladder = computed(() => { void gearKey.value; const a = ARCHETYPES.find(x => x.id === save.archetype); return a ? ladderStatus(a, save) : detectArchetype(save); });
      const ladderFocus = computed(() => { const l = ladder.value; if (!l) return null; return l.stages[Math.max(0, l.reached)]; });
      const currentBd = computed(() => { const a = ARCHETYPES.find(x => x.id === save.archetype); return a ? `${a.name} · ${STAGES[save.bdStage ?? 0]?.name ?? ''}` : '自由搭配'; });
      const primarySkill = computed(() => { void gearKey.value; return save.skills.find(Boolean) ?? 'fireball'; });
      const bagCells = computed(() => { const n = Math.max(48, Math.ceil((save.inventory.length + 1) / 8) * 8); return Array.from({ length: n }, (_, i) => save.inventory[i] ?? null); });
      const centerName = computed(() => PANELS.find(p => p.id === center.value)?.name ?? '');
      const centerTitle = computed(() => ({ craft: '洗 炼', bd: '流 派', codex: '传 奇 图 鉴' })[center.value] ?? '');

      function toast(text, cls = '', icon = null, ic = '') { const id = ++toastId; toasts.value.push({ id, text, cls, icon, ic }); if (toasts.value.length > 6) toasts.value.shift(); setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id); }, 3200); }
      function gearChanged() { syncSkillBar(save); gearKey.value++; roles.value = null; persist(); if (run.value) run.value.rebuildHero(build()); }
      function pick(it) { picked.value = it ?? null; pickedLine.value = null; craftMsg.value = ''; }
      function equippedFor(it) { if (!it) return null; if (it.slot.startsWith('ring')) return save.equipped.ring1 ?? save.equipped.ring2; return save.equipped[it.slot]; }
      async function hoverOn(e, it, ground = false) {
        if (!it) { hover.value = null; return; }
        const anchor = e.currentTarget;
        hover.value = { item: it, compare: ground || save.inventory.includes(it) ? equippedFor(it) : null };
        await nextTick();
        const tip = tipEl.value; if (!tip || !anchor) return;
        if (floating) {
          const { x, y } = await floating.computePosition(anchor, tip, { placement: 'right-start', strategy: 'fixed', middleware: [floating.offset(12), floating.flip({ fallbackPlacements: ['left-start', 'top', 'bottom'] }), floating.shift({ padding: 10 })] });
          Object.assign(tip.style, { left: `${x}px`, top: `${y}px` });
        } else {
          const r = anchor.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
          Object.assign(tip.style, { left: `${r.right + 12 + w > innerWidth ? r.left - w - 12 : r.right + 12}px`, top: `${Math.max(10, Math.min(innerHeight - h - 10, r.top))}px` });
        }
        gsap?.fromTo(tip, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: .16, ease: 'power2.out' });
      }
      const hoverOff = () => { hover.value = null; };
      function doEquip(uid, slot = null) { if (equip(save, uid, slot)) { picked.value = null; hover.value = null; gearChanged(); } }
      function doUnequip(s) { if (!save.equipped[s]) return; unequip(save, s); picked.value = null; hover.value = null; gearChanged(); }
      function dragStart(it) { dragItem.value = it; hover.value = null; }
      function dropOn(s) { const it = dragItem.value; dropSlot.value = null; dragItem.value = null; if (it) doEquip(it.uid, s); }
      function doSalvage(uid) { const g = salvage(save, uid, rng); if (picked.value?.uid === uid) picked.value = null; hover.value = null; craftMsg.value = g ? `分解得到 ${CURRENCIES[g].name}` : '已分解'; persist(); }
      function doCraft(id) {
        const r = craft(save, picked.value, id, rng, pickedLine.value);
        craftMsg.value = r.message; if (!r.ok) return;
        if (Object.values(save.equipped).includes(picked.value)) gearChanged(); else persist();
        nextTick(() => gsap?.fromTo('.craft .itip', { scale: 1.03, filter: 'brightness(1.6)' }, { scale: 1, filter: 'brightness(1)', duration: .45, ease: 'power2.out' }));
      }
      function applyBd(id, i) {
        applyArchetype(save, id, i); save.bdStage = i;
        picked.value = null; hover.value = null;
        gearChanged();
        toast(`已换上 ${ARCHETYPES.find(x => x.id === id).name} · ${STAGES[i].name}`, 'good');
      }
      function grantLegendary(id) {
        const tier = Math.max(3, Math.min(10, Math.round(save.unlocked * 10 / 16) + 1));
        const it = rollLegendary(id, tier, rng); save.inventory.unshift(it); persist();
        toast(`传奇 · ${legendary(id).name} 已放入背包`, 'r-legendary', BASE_ICON[legendary(id).base], 'r-legendary');
        open.bag = true; pick(it);
      }
      async function evaluate() {
        evaluating.value = true; await nextTick(); await new Promise(r => setTimeout(r, 30));
        try { roles.value = roleReport(content, build(), mapTier.value); } finally { evaluating.value = false; }
      }
      async function update() { await runSelfUpdate(t => { updateText.value = t; }); }
      const isOpen = id => id === 'atlas' ? atlasOpen.value : id === 'char' || id === 'bag' ? open[id] : center.value === id;
      function toggle(id) {
        hover.value = null;
        if (id === 'atlas') { atlasOpen.value = !atlasOpen.value; if (atlasOpen.value) { center.value = null; open.char = open.bag = false; nextTick(() => { centerAtlas(); gsap?.fromTo('.atlas-win', { opacity: 0 }, { opacity: 1, duration: .35, ease: 'power2.out' }); }); } return; }
        if (id === 'char' || id === 'bag') { open[id] = !open[id]; if (open[id]) atlasOpen.value = false; } else { center.value = center.value === id ? null : id; if (center.value) atlasOpen.value = false; }
        nextTick(() => { const sel = id === 'char' ? '.win-left' : id === 'bag' ? '.win-right' : '.win-center'; if (isOpen(id)) gsap?.fromTo(sel, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: .28, ease: 'power3.out', clearProps: 'transform' }); });
      }
      function openCenter(id) { if (center.value !== id) toggle(id); }

      // ---- run lifecycle ----------------------------------------------------------------------
      function startRun() {
        if (!buildOf(save).skills.length) { open.char = true; toast('技能栏是空的：装备一件带主动技能的装备（武器都带）', 'bad'); return; }
        const node = atlas.nodes[atlasSel.value], st = view.value.status(node.id);
        if (st !== 'done' && st !== 'open') { toast('这个节点还没连通：先打通与它相连的地图', 'bad'); return; }
        if (!freeNode.value && !stone.value) { toast(`需要一块 T${node.tier} 及以上的路石`, 'bad'); return; }
        const used = stone.value, tier = runTier.value, mods = selMods.value;
        if (used) save.waystones.splice(save.waystones.findIndex(w => w.uid === used.uid), 1);
        persist(); atlasOpen.value = false;
        const r = new MapRun(build(), { tier, family: node.family, mods, seed: (Date.now() ^ (Math.random() * 1e9)) >>> 0 });
        r.node = node.id;
        run.value = markRaw(r); open.char = open.bag = false; center.value = null; seenPicked = 0; seenClear = -1; seenLoot = new Set();
        Object.assign(resultLoot, { items: 0, currencies: 0, stones: 0, legend: 0, opened: 0, done: false });
        nextTick(() => {
          if (!scene) { scene = new Scene3D(stage.value); ov = new Overlay(overlay.value); bindLabels(overlay.value); }
          stage.value.focus();
          last = performance.now(); acc = 0;
          cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
          gsap?.from('.dock, .plate, .minimap', { opacity: 0, y: 20, duration: .5, stagger: .06, ease: 'power3.out', clearProps: 'transform,opacity' });
        });
      }
      function leaveRun() {
        const r = run.value; if (!r) return;
        const loot = r.phase === 'failed' ? r.pickedUp : r.collectAll();
        for (const d of loot) { if (d.type === 'item') save.inventory.unshift(d.item); else if (d.type === 'waystone') save.waystones.push(d.stone); else save.currencies[d.id] = (save.currencies[d.id] || 0) + d.count; }
        if (r.phase === 'cleared') { save.unlocked = Math.min(MAP_TIERS, Math.max(save.unlocked, r.tier + 1)); save.stats.maps++; }
        save.stats.kills += r.kills;
        persist();
        cancelAnimationFrame(raf); ov?.clearLoot(); hover.value = null;
        run.value = null; roles.value = null; gearKey.value++;
        if (r.phase === 'cleared') atlasSel.value = firstNear(r.node);
      }
      function frame(now) {
        const r = run.value; if (!r) return;
        const dt = Math.min(0.1, (now - last) / 1000); last = now; acc += dt;
        const mx = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0), my = (keys.has('w') ? 1 : 0) - (keys.has('s') ? 1 : 0);
        r.setMove(mx, my);
        const at = scene.pick(mouse.x, mouse.y); if (at) r.setAim(at.x, at.y);
        r.setCasting(mouse.down && r.phase === 'running');
        while (acc >= 1 / 60) { r.step(1 / 60); acc -= 1 / 60; }
        for (const l of r.loot) {
          if (seenLoot.has(l.key)) continue;
          seenLoot.add(l.key);
          if (l.drop.item?.legend) { legendBanner.value = { id: l.key, name: itemName(l.drop.item) }; setTimeout(() => { if (legendBanner.value?.id === l.key) legendBanner.value = null; }, 2600); }
        }
        for (; seenPicked < r.pickedUp.length; ++seenPicked) {
          const d = r.pickedUp[seenPicked];
          if (d.type === 'item') {
            const rr = rarityOf(d.item);
            toast(`${rr.name} · ${itemName(d.item)}`, 'r-' + rr.id, itemIcon(d.item), 'r-' + rr.id);
          } else if (d.type === 'waystone') toast(waystoneName(d.stone), 'w-' + d.stone.rarity, 'stone-tablet', 'w-' + d.stone.rarity);
          else toast(CURRENCIES[d.id].name, 'cur', CURRENCY_ICON[d.id], 'r-currency');
        }
        if (r.phase !== 'running' && !resultLoot.done) {
          resultLoot.done = true;
          const loot = r.phase === 'cleared' ? [...r.pickedUp, ...r.loot.map(l => l.drop)] : r.pickedUp;
          resultLoot.items = loot.filter(d => d.type === 'item').length; resultLoot.currencies = loot.filter(d => d.type === 'currency').length; resultLoot.stones = loot.filter(d => d.type === 'waystone').length;
          resultLoot.legend = loot.filter(d => d.item?.legend).length;
          if (r.phase === 'cleared' && r.node != null) { resultLoot.opened = completeNode(atlas, save.atlas, r.node); persist(); }
          nextTick(() => gsap?.from('.result', { opacity: 0, scale: .92, duration: .5, ease: 'back.out(1.6)', clearProps: 'transform,opacity' }));
        }
        scene.update(r, now / 1000); ov.update(scene, r);
        syncHud(r);
        raf = requestAnimationFrame(frame);
      }
      function syncHud(r) {
        const h = r.hero, s = Math.floor(r.endedAt ?? r.clearedAt ?? r.elapsed), b = r.boss;
        const bossNear = b?.alive && Math.hypot(b.x - h.x, b.y - h.y) < 1400;
        const comboLive = r.elapsed - r.lastKillAt < 1.5 ? r.combo : 0;
        if (comboLive > hud.combo && comboLive >= 5 && comboEl.value) gsap?.fromTo(comboEl.value.querySelector('b'), { scale: 1.35 }, { scale: 1, duration: .25, ease: 'back.out(3)', overwrite: true });
        const recent = r.recentKills.filter(k => r.elapsed - k.t <= 1);
        const sc = r.screenClears[r.screenClears.length - 1];
        if (sc && sc.t !== seenClear) {
          seenClear = sc.t; hud.flashN = sc.n;
          const f = flashEl.value;
          if (f && gsap) gsap.timeline().set(f, { display: 'block' }).fromTo(f, { opacity: 0, scale: 1.5, letterSpacing: '1.6em' }, { opacity: 1, scale: 1, letterSpacing: '.9em', duration: .35, ease: 'expo.out' }).to(f, { opacity: 0, duration: .8, delay: .55 }).set(f, { display: 'none' });
          else if (f) { f.style.display = 'block'; setTimeout(() => { f.style.display = 'none'; }, 1400); }
        }
        Object.assign(hud, { combo: comboLive, cascadePct: recent.length ? Math.round(100 * recent.filter(k => k.cascade).length / recent.length) : hud.cascadePct,
          tick: hud.tick + 1, time: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, kills: r.kills, total: r.total,
          life: Math.max(0, Math.round(h.life)), lifeMax: Math.round(h.max.life), es: Math.round(h.es), esMax: Math.round(h.max.es), mana: Math.round(h.mana), manaMax: Math.round(h.max.mana),
          selected: r.selected,
          skills: r.skills.map(sk => { const cd = Math.max(0, sk.readyAt - r.world.time); return { name: sk.def.name, icon: SKILL_ICON[sk.def.id] ?? 'magic-swirl', el: EL_CLASS[skillElement(sk.def.id)], cd, cdPct: cd > 0 && sk.def.cooldown ? Math.min(1, cd / Math.max(cd, sk.def.cooldown)) : 0, channel: h.channeling === sk }; }),
          resources: [['power', '能量'], ['frenzy', '狂怒'], ['endurance', '耐力'], ['burst', '迸发'], ['rage', '杀意']].map(([id, name]) => ({ id, name, value: Math.round(h.resource(id)) })).filter(x => x.value > 0),
          buffs: r.statuses(h),
          bossShow: !!bossNear, bossName: b?.name ?? '', bossMods: (b?.eliteMods ?? []).map(k => ELITE_MODS[k].name),
          bossLife: b ? pct(b.life, b.max.life) : '0%', bossEs: b && b.max.es ? pct(b.es, b.max.es) : '0%', bossEnraged: !!b?.hasStatus?.('enraged') });
      }
      function selectSkill(i) { run.value?.select(i); }
      /** After a clear, suggest the next map: the lowest-tier open node next to the one just done. */
      function firstNear(id) {
        const near = atlas.links[id].filter(b => view.value.status(b) === 'open').map(b => atlas.nodes[b]).sort((a, b) => a.tier - b.tier);
        return near[0]?.id ?? firstOpen();
      }
      /** Ground labels live outside Vue (the overlay), so their mouse events are delegated here. */
      function bindLabels(root) {
        const dropOf = el => run.value?.loot.find(l => l.key === el.dataset.key)?.drop;
        root.addEventListener('mousedown', e => {
          const el = e.target.closest('.lt'); if (!el || e.button !== 0) return;
          e.stopPropagation(); e.preventDefault();
          run.value?.walkToLoot(el.dataset.key); hover.value = null;
        });
        root.addEventListener('mouseover', e => {
          const el = e.target.closest('.lt'); if (!el) return;
          const d = dropOf(el); if (d?.type === 'item') hoverOn({ currentTarget: el }, d.item, true);
        });
        root.addEventListener('mouseout', e => { if (e.target.closest('.lt') && !e.relatedTarget?.closest?.('.lt')) hoverOff(); });
      }

      const onKey = (e, down) => {
        if (e.target.closest?.('select, input')) return;
        const k = e.key.toLowerCase();
        if (k === 'alt') { if (ov) ov.showAll = down; e.preventDefault(); return; }
        if (['w', 'a', 's', 'd'].includes(k)) { if (down) keys.add(k); else keys.delete(k); e.preventDefault(); return; }
        if (!down) return;
        if (/^[1-4]$/.test(k)) selectSkill(+k - 1);
        const p = PANELS.find(p => p.key.toLowerCase() === k); if (p) toggle(p.id);
        if (k === 'escape') {
          if (atlasOpen.value || open.char || open.bag || center.value) { atlasOpen.value = false; open.char = open.bag = false; center.value = null; hover.value = null; }
          else if (run.value && run.value.phase !== 'running') leaveRun();
        }
      };
      const kd = e => onKey(e, true), ku = e => onKey(e, false);
      const mm = e => { const rect = stage.value?.getBoundingClientRect(); if (rect) { mouse.x = e.clientX - rect.left; mouse.y = e.clientY - rect.top; } };
      const md = e => { if (e.button === 0 && run.value && e.target.closest('.stage')) mouse.down = true; };
      const mu = e => { if (e.button === 0) mouse.down = false; };
      const rs = () => { scene?.resize(); viewSize.w = innerWidth; viewSize.h = innerHeight; };
      onMounted(() => { probeIcons(document.documentElement); addEventListener('keydown', kd); addEventListener('keyup', ku); addEventListener('mousemove', mm); addEventListener('mousedown', md); addEventListener('mouseup', mu); addEventListener('resize', rs); });
      onBeforeUnmount(() => { cancelAnimationFrame(raf); removeEventListener('keydown', kd); removeEventListener('keyup', ku); removeEventListener('mousemove', mm); removeEventListener('mousedown', md); removeEventListener('mouseup', mu); removeEventListener('resize', rs); scene?.dispose(); });

      const pct = (a, b) => `${Math.max(0, Math.min(100, 100 * a / Math.max(1, b)))}%`;
      const bandIndex = t => STAGES.findIndex(s => t >= s.maps[0] && t <= s.maps[1]);
      return {
        atlasOpen, wsSel, stash, freeNode, usable, stone, runTier, canStart, startText, waystoneTip, openAtlasFor,
        atlas, atlasEl, atlasSel, atlasDrag, selNode, selMods, atlasShown, atlasLit, atlasLandmarks, atlasStars, atlasRoads, atlasRegions, atlasRings, atlasBox, atlasOpenCount, atlasFar,
        centerAtlas, selectNode, atlasDown, atlasMove, atlasUp, atlasWheel, kinds: NODE_KINDS,
        kindIconUrl: (kind, color) => `https://api.iconify.design/game-icons/${NODE_KINDS[kind].icon}.svg?color=${encodeURIComponent(color)}`,
        regionName: id => REGION_NAME[id], statusName: st => ({ done: '已打通', open: '可进入', seen: '尚未连通', hidden: '未知' })[st], nodeModText: id => NODE_MODS[id].text,
        save, stage, overlay, tipEl, comboEl, flashEl, open, center, mapTier, mapFamily, picked, pickedLine, craftMsg, roles, evaluating, updateText, hover, bdSel, toasts, legendBanner,
        dragItem, dropSlot, run, resultLoot, hud,
        profile, requirements, statRows, bdArch, bdStages, currentBd, centerName, centerTitle, traits, granted, ladder, ladderFocus, primarySkill, bagCells,
        pick, equippedFor, hoverOn, hoverOff, doEquip, doUnequip, dragStart, dropOn, doSalvage, doCraft, applyBd, grantLegendary, evaluate, update, toggle, isOpen, openCenter, startRun, leaveRun, selectSkill, gearChanged,
        panels: PANELS, tierList: Array.from({ length: MAP_TIERS }, (_, i) => i + 1), families: MAP_FAMILIES, slots: SLOTS, slotNames: SLOT_NAMES, currencies: CURRENCIES,
        archetypes: ARCHETYPES, legendaries: LEGENDARIES, skillBar: SKILL_BAR, glyph: SLOT_GLYPH,
        rarity: rarityOf, itemNameOf: itemName, skillName, skillTags, itemIcon, skillEl: id => EL_CLASS[skillElement(id)],
        skillIcon: id => SKILL_ICON[id] ?? 'magic-swirl', slotIcon: s => SLOT_ICON[s], curIcon: id => CURRENCY_ICON[id], panelIcon: id => PANEL_ICON[id], famIcon: id => FAMILY_ICON[id],
        layerIcon: l => LAYER_ICON[l], buffIcon: id => BUFF_ICON[id] ?? 'sparkles', baseIcon: b => BASE_ICON[b],
        hue: el => ELEMENT_HUE[el] ?? '#ccc', elementName: el => ELEMENT_NAME[el] ?? el, familyName: id => MAP_FAMILIES[id]?.name ?? id,
        bandIndex, bandName: t => STAGES[bandIndex(t)]?.name ?? '', roman: t => TIER_ROMAN[t] ?? t,
        slotClass: s => save.equipped[s] ? 'r-' + rarityOf(save.equipped[s]).id : 'empty',
        fmt: v => v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e4 ? `${Math.round(v / 1e3)}k` : Math.round(v),
        barLen: (v, ref, base, cap) => `${Math.round(Math.min(cap, base + Math.sqrt(Math.max(0, v) / ref) * base * 0.45))}px`,
        pct, pctNum: (a, b) => Math.round(100 * a / Math.max(1, b)),
      };
    },
  });
  const vm = app.mount(el);
  // Debug/automation hook (tests drive the run through it).
  globalThis.__dw = { get run() { return vm.run; }, get save() { return vm.save; }, vm };
  return app;
}

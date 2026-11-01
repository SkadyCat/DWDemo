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
import { GI, BASE_ICON, SLOT_ICON, SKILL_ICON, CURRENCY_ICON, PANEL_ICON, FAMILY_ICON, LAYER_ICON, BUFF_ICON, probeIcons } from './icons.mjs';

const content = gameContent();
const ELEMENT_NAME = { physical: '物理', fire: '火焰', cold: '冰霜', lightning: '闪电', chaos: '混沌' };
const ELEMENT_HUE = { physical: '#d8c6a4', fire: '#ff8a3d', cold: '#8fd8ff', lightning: '#ffe066', chaos: '#c39bff' };
const EL_CLASS = { physical: 'phys', fire: 'fire', cold: 'cold', lightning: 'light', chaos: 'chaos' };
const SLOT_GLYPH = { weapon: '兵', offhand: '副', helmet: '盔', chest: '甲', gloves: '手', boots: '靴', belt: '带', amulet: '坠', ring1: '戒', ring2: '戒' };
const PANELS = [
  { id: 'char', name: '角色', key: 'C' }, { id: 'bag', name: '背包', key: 'I' },
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
      <h3>{{ hud.bossName }}</h3>
      <p class="boss-mods"><span v-for="m in hud.bossMods" :key="m">{{ m }}</span></p>
      <div class="bossbar-track"><i class="es" :style="{ width: hud.bossEs }"></i><i class="life" :style="{ width: hud.bossLife }"></i></div>
      <p v-if="hud.bossEnraged" class="boss-rage">狂暴 · 伤害 +200% · 速度 +50%</p>
    </section>

    <div class="combo" v-show="hud.combo >= 5" ref="comboEl" :class="{ hot: hud.combo >= 40 }"><b>{{ hud.combo }}</b><span>连杀</span><small v-if="hud.cascadePct">连锁 {{ hud.cascadePct }}%</small></div>
    <p class="clearflash" ref="flashEl">清 屏<small>{{ hud.flashN }} 杀 / 秒</small></p>

    <section class="dock">
      <div class="orb life" :title="'生命 ' + hud.life + ' / ' + hud.lifeMax">
        <div class="orb-fill" :style="{ height: pct(hud.life, hud.lifeMax) }"></div>
        <div class="orb-es" v-if="hud.esMax" :style="{ '--p': hud.es / Math.max(1, hud.esMax) }"></div><div class="orb-glass"></div>
        <span>{{ hud.life }}<small v-if="hud.esMax">+{{ hud.es }}</small></span>
      </div>
      <div class="dock-mid">
        <div class="buffs">
          <span v-for="r in hud.resources" :key="r.id" class="buff res"><Gi :n="buffIcon(r.id)" c="el-gold"/>{{ r.name }}<sub>{{ r.value }}</sub></span>
          <span v-for="s in hud.buffs" :key="s.id" class="buff" :style="{ '--c': s.color }">{{ s.name }}<sub v-if="s.stacks > 1">{{ s.stacks }}</sub></span>
        </div>
        <div class="xp" :title="'地图进度 ' + pct(hud.kills, hud.total)"><i :style="{ width: pct(hud.kills, hud.total) }"></i></div>
        <div class="skills">
          <button v-for="(s, i) in hud.skills" :key="i" class="skill" :class="['el-' + s.el, { on: i === hud.selected, channel: s.channel }]" @click="selectSkill(i)" :title="s.name + '（按 ' + (i + 1) + ' 选择，按住左键施放）'">
            <Gi :n="s.icon" :c="'el-' + s.el" :g="s.name.slice(0, 1)"/>
            <i class="cd" v-if="s.cd > 0" :style="{ '--p': s.cdPct }"></i>
            <kbd>{{ i + 1 }}</kbd><span class="sname">{{ s.name }}</span>
          </button>
        </div>
      </div>
      <div class="orb mana" :title="'魔力 ' + hud.mana + ' / ' + hud.manaMax">
        <div class="orb-fill" :style="{ height: pct(hud.mana, hud.manaMax) }"></div><div class="orb-glass"></div>
        <span>{{ hud.mana }}</span>
      </div>
    </section>

    <div class="toasts"><p v-for="t in toasts" :key="t.id" :class="t.cls"><Gi v-if="t.icon" :n="t.icon" :c="t.ic || ''"/>{{ t.text }}</p></div>
    <div class="legend-drop" v-if="legendBanner" :key="legendBanner.id"><small>传奇掉落</small><b>{{ legendBanner.name }}</b></div>

    <section class="result panel" v-if="run.phase !== 'running'" :class="run.phase">
      <h2>{{ run.phase === 'cleared' ? '地 图 完 成' : '你 倒 下 了' }}</h2>
      <dl>
        <div><dt>用时</dt><dd>{{ hud.time }}</dd></div><div><dt>击杀</dt><dd>{{ hud.kills }}</dd></div>
        <div><dt>最高连杀</dt><dd>{{ run.bestCombo }}</dd></div><div><dt>连锁击杀</dt><dd>{{ pctNum(run.cascadeKills, hud.kills) }}%</dd></div>
      </dl>
      <p v-if="run.phase === 'cleared'">带回 {{ resultLoot.items }} 件装备、{{ resultLoot.currencies }} 个通货<template v-if="resultLoot.legend">，其中 {{ resultLoot.legend }} 件传奇</template><template v-if="resultLoot.unlocked">；解锁 T{{ resultLoot.unlocked }}</template></p>
      <p v-else>只带回已经拾取的东西。回营地看看「本图要求」哪一项没达标。</p>
      <button class="orn-btn primary" @click="leaveRun">回到营地</button>
    </section>
  </template>

  <!-- =================== CAMP =================== -->
  <template v-else>
    <header class="topbar">
      <div class="crest"><Gi :n="skillIcon(primarySkill)" :c="'el-' + skillEl(primarySkill)"/></div>
      <div class="who"><h1>营 地</h1><p>{{ currentBd }}</p></div>
      <div class="facts"><span><b>T{{ save.unlocked }}</b>已解锁</span><span><b>{{ save.stats.maps }}</b>通关</span><span><b>{{ save.stats.kills }}</b>击杀</span></div>
      <button class="orn-btn ghost sm" @click="update">{{ updateText || '更新到最新' }}</button>
    </header>

    <main class="device">
      <section class="device-core panel">
        <h2 class="ttl">地图装置</h2>
        <div class="tiers" role="radiogroup" aria-label="地图 T 阶">
          <button v-for="t in tierList" :key="t" role="radio" :aria-checked="t === mapTier" :disabled="t > save.unlocked + 1" :class="['band-' + bandIndex(t), { on: t === mapTier }]" @click="mapTier = t">
            <b>{{ roman(t) }}</b><small>{{ bandName(t) }}</small></button>
        </div>
        <div class="fams" role="radiogroup" aria-label="地图类型">
          <button v-for="(f, id) in families" :key="id" role="radio" :aria-checked="id === mapFamily" :class="{ on: id === mapFamily }" @click="mapFamily = id">
            <Gi :n="famIcon(id)" c="el-gold"/><b>{{ f.name }}</b>
            <span class="mix"><i v-for="(w, el) in f.mix" :key="el" :style="{ flex: w, background: hue(el) }" :title="elementName(el) + ' ' + Math.round(w * 100) + '%'"></i></span></button>
        </div>
        <dl class="pressure">
          <div><dt>杂兵生命</dt><dd>{{ fmt(profile.monsterLife) }}</dd></div>
          <div><dt>单次伤害</dt><dd>{{ fmt(profile.monsterDamage) }}</dd></div>
          <div><dt>每个房间</dt><dd>约 {{ profile.packSize }} 只</dd></div>
          <div><dt>精英</dt><dd>{{ Math.round(profile.eliteChance * 100) }}% · {{ profile.eliteMods }} 词缀</dd></div>
          <div><dt>首领</dt><dd>{{ fmt(profile.bossLife) }} · 60 秒狂暴</dd></div>
          <div><dt>全抗惩罚</dt><dd :class="{ warn: profile.resistPenalty }">−{{ profile.resistPenalty }}%</dd></div>
        </dl>
        <button class="orn-btn primary big" @click="startRun">开启 · {{ familyName(mapFamily) }} T{{ mapTier }}</button>
      </section>
      <section class="device-req panel">
        <h2 class="ttl">本图要求</h2>
        <ul class="req">
          <li v-for="r in requirements" :key="r.name" :class="r.ok ? 'ok' : 'bad'"><i></i><span>{{ r.name }}</span><b>{{ r.have }}</b><em>{{ r.need }}</em></li>
        </ul>
        <div class="roles">
          <button class="orn-btn" @click="evaluate" :disabled="evaluating">{{ evaluating ? '评估中…' : '评估输出' }}</button>
          <template v-if="roles">
            <div class="role"><span>攻坚</span><div class="meter"><i :style="{ width: Math.min(100, roles.bossing * 50) + '%' }"></i></div><b>{{ roles.bossing.toFixed(2) }}</b><small>首领 {{ roles.ttk === Infinity ? '打不动' : '约 ' + roles.ttk.toFixed(0) + ' 秒' }}</small></div>
            <div class="role"><span>速刷</span><div class="meter"><i :style="{ width: Math.min(100, roles.clearing * 50) + '%' }"></i></div><b>{{ roles.clearing.toFixed(2) }}</b><small>每秒击杀 {{ roles.kps.toFixed(1) }}</small></div>
            <p class="role-lean">倾向：{{ roles.lean }}。1.00 = 刚好达标。</p>
          </template>
          <p v-else class="hint">用当前装备在本图跑一次单体和清图测试。</p>
        </div>
      </section>
    </main>
  </template>

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
      const run = ref(null), resultLoot = reactive({ items: 0, currencies: 0, legend: 0, unlocked: 0, done: false });
      const hud = reactive({ combo: 0, cascadePct: 0, flashN: 0, tick: 0, time: '0:00', kills: 0, total: 0, life: 0, lifeMax: 1, es: 0, esMax: 0, mana: 0, manaMax: 1, skills: [], selected: 0, resources: [], buffs: [],
        bossShow: false, bossName: '', bossMods: [], bossLife: '100%', bossEs: '0%', bossEnraged: false });
      const rng = dungeonRandom(Date.now() >>> 0);
      let scene = null, ov = null, raf = 0, last = 0, acc = 0, toastId = 0, seenPicked = 0, seenClear = -1, gsap = null, floating = null;
      const keys = new Set(), mouse = { x: 0, y: 0, down: false };

      // Proven libraries from the CDN; the UI still works (plainer) without them.
      import('https://cdn.jsdelivr.net/npm/gsap@3.12.5/+esm').then(m => { gsap = m.gsap; }).catch(() => {});
      import('https://cdn.jsdelivr.net/npm/@floating-ui/dom@1.6.10/+esm').then(m => { floating = m; }).catch(() => {});

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
      async function hoverOn(e, it) {
        if (!it) { hover.value = null; return; }
        const anchor = e.currentTarget;
        hover.value = { item: it, compare: save.inventory.includes(it) ? equippedFor(it) : null };
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
        if (!run.value) mapTier.value = Math.max(1, Math.min(STAGES[i].maps[0], save.unlocked));
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
      const isOpen = id => id === 'char' || id === 'bag' ? open[id] : center.value === id;
      function toggle(id) {
        hover.value = null;
        if (id === 'char' || id === 'bag') open[id] = !open[id]; else center.value = center.value === id ? null : id;
        nextTick(() => { const sel = id === 'char' ? '.win-left' : id === 'bag' ? '.win-right' : '.win-center'; if (isOpen(id)) gsap?.fromTo(sel, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: .28, ease: 'power3.out', clearProps: 'transform' }); });
      }
      function openCenter(id) { if (center.value !== id) toggle(id); }

      // ---- run lifecycle ----------------------------------------------------------------------
      function startRun() {
        if (!buildOf(save).skills.length) { open.char = true; toast('技能栏是空的：装备一件带主动技能的装备（武器都带）', 'bad'); return; }
        const r = new MapRun(build(), { tier: mapTier.value, family: mapFamily.value, seed: (Date.now() ^ (Math.random() * 1e9)) >>> 0 });
        run.value = markRaw(r); open.char = open.bag = false; center.value = null; seenPicked = 0; seenClear = -1;
        Object.assign(resultLoot, { items: 0, currencies: 0, legend: 0, unlocked: 0, done: false });
        nextTick(() => {
          if (!scene) { scene = new Scene3D(stage.value); ov = new Overlay(overlay.value); }
          stage.value.focus();
          last = performance.now(); acc = 0;
          cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
          gsap?.from('.dock, .plate, .minimap', { opacity: 0, y: 20, duration: .5, stagger: .06, ease: 'power3.out', clearProps: 'transform,opacity' });
        });
      }
      function leaveRun() {
        const r = run.value; if (!r) return;
        const loot = r.phase === 'failed' ? r.pickedUp : r.collectAll();
        for (const d of loot) { if (d.type === 'item') save.inventory.unshift(d.item); else save.currencies[d.id] = (save.currencies[d.id] || 0) + d.count; }
        if (r.phase === 'cleared') { save.unlocked = Math.min(MAP_TIERS, Math.max(save.unlocked, r.tier + 1)); save.stats.maps++; }
        save.stats.kills += r.kills;
        persist();
        cancelAnimationFrame(raf);
        run.value = null; roles.value = null; gearKey.value++;
        mapTier.value = Math.min(save.unlocked, Math.max(mapTier.value, 1));
      }
      function frame(now) {
        const r = run.value; if (!r) return;
        const dt = Math.min(0.1, (now - last) / 1000); last = now; acc += dt;
        const mx = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0), my = (keys.has('w') ? 1 : 0) - (keys.has('s') ? 1 : 0);
        r.setMove(mx, my);
        const at = scene.pick(mouse.x, mouse.y); if (at) r.setAim(at.x, at.y);
        r.setCasting(mouse.down && r.phase === 'running');
        while (acc >= 1 / 60) { r.step(1 / 60); acc -= 1 / 60; }
        for (; seenPicked < r.pickedUp.length; ++seenPicked) {
          const d = r.pickedUp[seenPicked];
          if (d.type === 'item') {
            const rr = rarityOf(d.item);
            toast(`${rr.name} · ${itemName(d.item)}`, 'r-' + rr.id, itemIcon(d.item), 'r-' + rr.id);
            if (d.item.legend) { legendBanner.value = { id: d.item.uid, name: itemName(d.item) }; setTimeout(() => { legendBanner.value = null; }, 2600); }
          } else toast(CURRENCIES[d.id].name, 'cur', CURRENCY_ICON[d.id], 'r-currency');
        }
        if (r.phase !== 'running' && !resultLoot.done) {
          resultLoot.done = true;
          const loot = r.phase === 'cleared' ? [...r.pickedUp, ...r.loot.map(l => l.drop)] : r.pickedUp;
          resultLoot.items = loot.filter(d => d.type === 'item').length; resultLoot.currencies = loot.filter(d => d.type === 'currency').length;
          resultLoot.legend = loot.filter(d => d.item?.legend).length;
          resultLoot.unlocked = r.phase === 'cleared' && r.tier + 1 > save.unlocked && r.tier < MAP_TIERS ? r.tier + 1 : 0;
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

      const onKey = (e, down) => {
        if (e.target.closest?.('select, input')) return;
        const k = e.key.toLowerCase();
        if (['w', 'a', 's', 'd'].includes(k)) { if (down) keys.add(k); else keys.delete(k); e.preventDefault(); return; }
        if (!down) return;
        if (/^[1-4]$/.test(k)) selectSkill(+k - 1);
        const p = PANELS.find(p => p.key.toLowerCase() === k); if (p) toggle(p.id);
        if (k === 'escape') {
          if (open.char || open.bag || center.value) { open.char = open.bag = false; center.value = null; hover.value = null; }
          else if (run.value && run.value.phase !== 'running') leaveRun();
        }
      };
      const kd = e => onKey(e, true), ku = e => onKey(e, false);
      const mm = e => { const rect = stage.value?.getBoundingClientRect(); if (rect) { mouse.x = e.clientX - rect.left; mouse.y = e.clientY - rect.top; } };
      const md = e => { if (e.button === 0 && run.value && e.target.closest('.stage')) mouse.down = true; };
      const mu = e => { if (e.button === 0) mouse.down = false; };
      const rs = () => scene?.resize();
      onMounted(() => { probeIcons(document.documentElement); addEventListener('keydown', kd); addEventListener('keyup', ku); addEventListener('mousemove', mm); addEventListener('mousedown', md); addEventListener('mouseup', mu); addEventListener('resize', rs); });
      onBeforeUnmount(() => { cancelAnimationFrame(raf); removeEventListener('keydown', kd); removeEventListener('keyup', ku); removeEventListener('mousemove', mm); removeEventListener('mousedown', md); removeEventListener('mouseup', mu); removeEventListener('resize', rs); scene?.dispose(); });

      const pct = (a, b) => `${Math.max(0, Math.min(100, 100 * a / Math.max(1, b)))}%`;
      const bandIndex = t => STAGES.findIndex(s => t >= s.maps[0] && t <= s.maps[1]);
      return {
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
        pct, pctNum: (a, b) => Math.round(100 * a / Math.max(1, b)),
      };
    },
  });
  const vm = app.mount(el);
  // Debug/automation hook (tests drive the run through it).
  globalThis.__dw = { get run() { return vm.run; }, get save() { return vm.save; }, vm };
  return app;
}

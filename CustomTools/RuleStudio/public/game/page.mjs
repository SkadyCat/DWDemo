// 游戏页：营地（地图装置、本图要求）+ 地图战斗（3D、球形血魔、技能栏、小地图、首领条），
// 角色 / 背包 / 洗炼 / 流派 四个抽屉在营地和地图里都能打开；流派可以随时一键换上任意阶段。
import { createApp, reactive, computed, ref, watch, onMounted, onBeforeUnmount, markRaw, nextTick } from '../vendor/vue.esm-browser.prod.js';
import { SLOTS, LAYERS, family, lineTierFor } from '../../core/content/families.mjs';
import { CURRENCIES, SLOT_NAMES, rarityOf, itemName, lineText, baseOf } from '../../core/content/items.mjs';
import { ARCHETYPES } from '../../core/content/archetypes.mjs';
import { STAGES, collectionList } from '../../core/content/builds.mjs';
import { mapProfile, mapRequirements, MAP_FAMILIES, MAP_TIERS, ELITE_MODS } from '../../core/content/maps.mjs';
import { gameContent } from '../../core/content/game.mjs';
import { defenceReport, roleReport } from '../../core/analysis.mjs';
import { loadSave, writeSave, buildOf, equip, unequip, salvage, craft, applyArchetype, PLAYABLE_SKILLS, SKILL_BAR } from './save.mjs';
import { MapRun } from './run.mjs';
import { Scene3D, Overlay } from './scene.mjs';
import { dungeonRandom } from './dungeon.mjs';
import { runSelfUpdate } from '../self-update.mjs';

const content = gameContent();
const ELEMENT_NAME = { physical: '物理', fire: '火焰', cold: '冰霜', lightning: '闪电', chaos: '混沌' };
const ELEMENT_HUE = { physical: '#c9b79a', fire: '#ff8a3d', cold: '#7fd0ff', lightning: '#ffe066', chaos: '#b98cff' };
const SLOT_GLYPH = { weapon: '兵', offhand: '副', helmet: '盔', chest: '甲', gloves: '手', boots: '靴', belt: '带', amulet: '坠', ring1: '戒', ring2: '戒' };
const CURRENCY_GLYPH = { augment: '晶', chaos: '混', upgrade: '灵', annul: '无', seal: '封', essence_form: '形', essence_link: '联', essence_core: '核' };
const PANELS = [
  { id: 'char', name: '角色', key: 'C' }, { id: 'bag', name: '背包', key: 'I' }, { id: 'craft', name: '洗炼', key: 'K' }, { id: 'bd', name: '流派', key: 'B' },
];

function skillElement(id) {
  const d = content.skills.get(id)?.damage ?? {};
  let best = 'physical', v = -1;
  for (const [k, x] of Object.entries(d)) if (typeof x === 'number' && x > v) { v = x; best = k; }
  return best;
}
const skillTags = id => (content.skills.get(id)?.tags ?? []).filter(t => ['spell', 'attack', 'melee', 'projectile', 'area', 'channel', 'minion', 'totem', 'movement'].includes(t))
  .map(t => ({ spell: '法术', attack: '攻击', melee: '近战', projectile: '投射物', area: '范围', channel: '引导', minion: '召唤', totem: '图腾', movement: '位移' })[t]);

// ------------------------------------------------------------------ item card (tooltip & detail)
const ItemCard = {
  props: { item: Object, compare: Object, selectedLine: { type: Number, default: -1 }, selectable: Boolean },
  emits: ['line'],
  setup() { return { rarityOf, itemName, lineText, family, LAYERS, SLOT_NAMES, baseOf }; },
  template: /* html */ `
  <article class="card" :class="'r-' + rarityOf(item).id">
    <header class="card-head">
      <h4>{{ baseOf(item.slot, item.base)?.name ?? item.base }}</h4>
      <p>{{ rarityOf(item).name }}{{ SLOT_NAMES[item.slot] }} · 物品 T{{ item.tier }}</p>
    </header>
    <p v-if="item.preset" class="card-preset">流派配装 · {{ item.preset }}</p>
    <ul class="card-lines base">
      <li v-for="(l, i) in item.implicit" :key="'i' + i"><span>{{ lineText(l) }}</span><em>T{{ l.tier }}</em></li>
    </ul>
    <ul class="card-lines" v-if="item.lines.length">
      <li v-for="(l, i) in item.lines" :key="i" :class="['layer-' + family(l.id).layer, { on: i === selectedLine, sealed: l.sealed, pick: selectable }]" @click="selectable && $emit('line', i)">
        <span>{{ lineText(l) }}</span><em>{{ LAYERS[family(l.id).layer].name }} T{{ l.tier }}<b v-if="l.sealed"> 封</b></em></li>
    </ul>
    <p v-else class="card-empty">没有随机词条</p>
    <footer v-if="compare && compare !== item" class="card-compare">
      <h5>身上：{{ itemName(compare) }}</h5>
      <ul class="card-lines dim"><li v-for="(l, i) in [...compare.implicit, ...compare.lines]" :key="i"><span>{{ lineText(l) }}</span></li></ul>
    </footer>
  </article>`,
};

// ------------------------------------------------------------------ minimap (canvas)
const Minimap = {
  props: { run: Object, tick: Number },
  setup(props) {
    const el = ref(null);
    let base = null, layout = null;
    function draw() {
      const c = el.value, r = props.run; if (!c || !r) return;
      const d = r.dungeon, size = d.size, scale = c.width / size, ctx = c.getContext('2d');
      if (layout !== d) {
        layout = d; base = document.createElement('canvas'); base.width = base.height = c.width;
        const b = base.getContext('2d');
        for (const t of d.tiles) { b.fillStyle = d.rooms[t.room]?.kind === 'boss' ? '#4a2020' : t.room < 0 ? '#2a3140' : '#34405a'; b.fillRect(t.x * scale, t.y * scale, scale + .5, scale + .5); }
      }
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.globalAlpha = .92; ctx.drawImage(base, 0, 0); ctx.globalAlpha = 1;
      const toMap = (x, y) => [(x + d.half) / d.tile * scale, (y + d.half) / d.tile * scale];
      for (const m of r.monsters) {
        const [x, y] = toMap(m.x, m.y);
        ctx.fillStyle = m.boss ? '#ff4b3a' : m.kind === 'elite' ? '#ffcf5a' : '#c44a3a';
        const s = m.boss ? 5 : m.kind === 'elite' ? 3 : 2; ctx.fillRect(x - s / 2, y - s / 2, s, s);
      }
      for (const l of r.loot) { const [x, y] = toMap(l.x, l.y); ctx.fillStyle = '#e8d6a0'; ctx.fillRect(x - 1, y - 1, 2, 2); }
      const [hx, hy] = toMap(r.hero.x, r.hero.y);
      ctx.fillStyle = '#7fe0ff'; ctx.beginPath(); ctx.arc(hx, hy, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#7fe0ff'; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + r.hero.aim.x * 9, hy + r.hero.aim.y * 9); ctx.stroke();
    }
    watch(() => props.tick, draw);
    onMounted(draw);
    return { el };
  },
  template: `<canvas ref="el" class="minimap" width="180" height="180" aria-label="小地图"></canvas>`,
};

// ------------------------------------------------------------------ page
const TEMPLATE = /* html */ `
<div class="g" :class="{ 'in-run': run, 'drawer-open': panel }">
  <div class="stage" ref="stage" tabindex="0" @contextmenu.prevent><div class="overlay" ref="overlay"></div></div>

  <!-- ===== RUN HUD ===== -->
  <template v-if="run">
    <section class="plate" aria-label="当前地图">
      <div class="plate-tier">T{{ run.tier }}</div>
      <div class="plate-body">
        <h2>{{ familyName(run.profile.family) }}</h2>
        <div class="plate-progress" :title="'击杀 ' + hud.kills + ' / ' + hud.total"><i :style="{ width: pct(hud.kills, hud.total) }"></i></div>
        <p><span>{{ hud.time }}</span><span>击杀 {{ hud.kills }}/{{ hud.total }}</span><span v-if="run.profile.resistPenalty">全抗 −{{ run.profile.resistPenalty }}%</span></p>
      </div>
      <button class="plate-leave" @click="leaveRun">{{ run.phase === 'running' ? '放弃' : '离开' }}</button>
    </section>
    <minimap :run="run" :tick="hud.tick"></minimap>

    <section class="bossbar" v-if="hud.bossShow" :class="{ enraged: hud.bossEnraged }">
      <h3>{{ hud.bossName }}<small v-for="m in hud.bossMods" :key="m">{{ m }}</small></h3>
      <div class="bossbar-track"><i class="es" :style="{ width: hud.bossEs }"></i><i class="life" :style="{ width: hud.bossLife }"></i></div>
      <p v-if="hud.bossEnraged">狂暴：伤害 +200%、速度 +50%</p>
    </section>

    <section class="dock">
      <div class="globe life" :title="'生命 ' + hud.life + '/' + hud.lifeMax">
        <i class="globe-fill" :style="{ height: pct(hud.life, hud.lifeMax) }"></i>
        <svg v-if="hud.esMax > 0" class="globe-ring" viewBox="0 0 100 100"><circle cx="50" cy="50" r="47" :style="{ strokeDasharray: ring(hud.es, hud.esMax) }"/></svg>
        <span>{{ hud.life }}<small v-if="hud.esMax > 0">+{{ hud.es }}</small></span>
      </div>
      <div class="dock-center">
        <div class="buffs">
          <span v-for="r in hud.resources" :key="r.id" class="pip" :class="'pip-' + r.id"><b v-for="n in r.value" :key="n"></b><em>{{ r.name }}</em></span>
          <span v-for="s in hud.buffs" :key="s.id" class="buff" :style="{ '--c': s.color }">{{ s.name }}<sub v-if="s.stacks > 1">{{ s.stacks }}</sub></span>
        </div>
        <div class="skillbar">
          <button v-for="(s, i) in hud.skills" :key="i" class="skill" :class="{ on: i === hud.selected, cd: s.cd > 0, channel: s.channel }" :style="{ '--el': s.hue }" @click="selectSkill(i)" :title="s.name + '（按 ' + (i + 1) + ' 选择，按住左键施放）'">
            <span class="skill-glyph">{{ s.name.slice(0, 1) }}</span>
            <span class="skill-name">{{ s.name }}</span>
            <i class="skill-cd" v-if="s.cd > 0" :style="{ '--p': s.cdPct }"></i>
            <kbd>{{ i + 1 }}</kbd>
          </button>
        </div>
      </div>
      <div class="globe mana" :title="'魔力 ' + hud.mana + '/' + hud.manaMax">
        <i class="globe-fill" :style="{ height: pct(hud.mana, hud.manaMax) }"></i>
        <span>{{ hud.mana }}</span>
      </div>
    </section>

    <div class="toasts"><p v-for="t in toasts" :key="t.id" :class="t.cls">{{ t.text }}</p></div>

    <section class="result" v-if="run.phase !== 'running'" :class="run.phase">
      <h2>{{ run.phase === 'cleared' ? '地图完成' : '你倒下了' }}</h2>
      <p>{{ familyName(run.profile.family) }} T{{ run.tier }} · {{ hud.time }} · 击杀 {{ hud.kills }}</p>
      <p v-if="run.phase === 'cleared'">带回 {{ resultLoot.items }} 件装备、{{ resultLoot.currencies }} 个通货<template v-if="resultLoot.unlocked">，解锁 T{{ resultLoot.unlocked }}</template></p>
      <p v-else>只带回已经拾取的东西。看看「本图要求」里哪一项没达标。</p>
      <button class="btn primary" @click="leaveRun">回到营地</button>
    </section>
  </template>

  <!-- ===== CAMP ===== -->
  <main class="camp" v-else>
    <header class="camp-head">
      <h1>营地</h1>
      <p>已解锁 T{{ save.unlocked }} · 通关 {{ save.stats.maps }} 张图 · 当前流派：{{ currentBd }}</p>
      <button class="btn ghost" @click="update">{{ updateText || '更新到最新' }}</button>
    </header>
    <section class="device">
      <div class="device-pick">
        <h2>地图装置</h2>
        <div class="tiers" role="radiogroup" aria-label="地图 T 阶">
          <button v-for="t in tierList" :key="t" role="radio" :aria-checked="t === mapTier" :disabled="t > save.unlocked + 1" :class="{ on: t === mapTier, band: bandOf(t) }" @click="mapTier = t">
            <b>{{ t }}</b><small>{{ bandName(t) }}</small></button>
        </div>
        <div class="fams" role="radiogroup" aria-label="地图类型">
          <button v-for="(f, id) in families" :key="id" role="radio" :aria-checked="id === mapFamily" :class="{ on: id === mapFamily }" @click="mapFamily = id">
            <b>{{ f.name }}</b><span class="mix"><i v-for="(w, el) in f.mix" :key="el" :style="{ flex: w, background: hue(el) }" :title="elementName(el) + ' ' + Math.round(w * 100) + '%'"></i></span></button>
        </div>
        <dl class="pressure">
          <div><dt>怪物生命</dt><dd>{{ Math.round(profile.monsterLife) }}</dd></div>
          <div><dt>单次伤害</dt><dd>{{ Math.round(profile.monsterDamage) }}</dd></div>
          <div><dt>同屏怪物</dt><dd>{{ profile.density }}</dd></div>
          <div><dt>精英几率</dt><dd>{{ Math.round(profile.eliteChance * 100) }}% · {{ profile.eliteMods }} 词缀</dd></div>
          <div><dt>首领生命</dt><dd>{{ Math.round(profile.bossLife / 1000) }}k · 60 秒狂暴</dd></div>
          <div><dt>全抗惩罚</dt><dd>−{{ profile.resistPenalty }}%</dd></div>
        </dl>
        <button class="btn primary big" @click="startRun">进入 {{ familyName(mapFamily) }} T{{ mapTier }}</button>
      </div>
      <div class="device-req">
        <h2>本图要求</h2>
        <ul class="req">
          <li v-for="r in requirements" :key="r.name" :class="r.ok ? 'ok' : 'bad'"><span>{{ r.name }}</span><b>{{ r.have }}</b><em>{{ r.need }}</em></li>
        </ul>
        <div class="roles">
          <button class="btn" @click="evaluate" :disabled="evaluating">{{ evaluating ? '评估中…' : '评估输出' }}</button>
          <template v-if="roles">
            <div class="role"><span>攻坚</span><meter min="0" max="2" :value="Math.min(2, roles.bossing)"></meter><b>{{ roles.bossing.toFixed(2) }}</b><small>首领 {{ roles.ttk === Infinity ? '打不动' : '约 ' + roles.ttk.toFixed(0) + ' 秒' }}</small></div>
            <div class="role"><span>速刷</span><meter min="0" max="2" :value="Math.min(2, roles.clearing)"></meter><b>{{ roles.clearing.toFixed(2) }}</b><small>每秒击杀 {{ roles.kps.toFixed(1) }}</small></div>
            <p class="role-lean">倾向：{{ roles.lean }}。1.00 = 刚好达标（首领狂暴前击杀 / 拿到清图奖励）。</p>
          </template>
          <p v-else class="hint">评估会用你当前的装备在本图跑一次单体和清图测试。</p>
        </div>
      </div>
    </section>
  </main>

  <!-- ===== RAIL & DRAWERS (camp and map) ===== -->
  <nav class="rail" aria-label="功能">
    <button v-for="p in panels" :key="p.id" :class="{ on: panel === p.id }" @click="toggle(p.id)" :title="p.name + '（' + p.key + '）'"><b>{{ p.name }}</b><kbd>{{ p.key }}</kbd></button>
  </nav>

  <aside class="drawer" v-if="panel" :aria-label="panelName">
    <header class="drawer-head"><h2>{{ panelName }}</h2><button class="x" @click="panel = null" aria-label="关闭">×</button></header>

    <!-- character -->
    <div v-if="panel === 'char'" class="drawer-body char">
      <div class="doll">
        <button v-for="s in slots" :key="s" class="slot" :style="{ gridArea: s }" :class="slotClass(s)" @click="pick(save.equipped[s])" @mouseenter="hoverItem($event, save.equipped[s])" @mouseleave="hover = null">
          <i>{{ glyph[s] }}</i><small>{{ slotNames[s] }}</small><b v-if="save.equipped[s]">T{{ save.equipped[s].tier }}</b>
        </button>
      </div>
      <div class="char-side">
        <h3>属性 <small>按 T{{ mapTier }} 惩罚</small></h3>
        <dl class="stats"><div v-for="r in statRows" :key="r[0]"><dt>{{ r[0] }}</dt><dd>{{ r[1] }}</dd></div></dl>
        <h3>技能栏</h3>
        <div class="skillpick">
          <label v-for="i in skillBar" :key="i"><kbd>{{ i }}</kbd>
            <select v-model="save.skills[i - 1]" @change="gearChanged">
              <option :value="null">（空）</option>
              <option v-for="id in playable" :key="id" :value="id">{{ skillName(id) }} · {{ skillTags(id).join('/') }}</option>
            </select></label>
        </div>
        <div v-if="picked" class="picked">
          <item-card :item="picked"></item-card>
          <div class="actions"><button class="btn" @click="doUnequip(picked.slot)">卸下</button><button class="btn" @click="toggle('craft')">去洗炼</button></div>
        </div>
      </div>
    </div>

    <!-- bag -->
    <div v-if="panel === 'bag'" class="drawer-body bag">
      <div class="bag-grid">
        <button v-for="it in save.inventory" :key="it.uid" class="tile" :class="['r-' + rarity(it).id, { on: picked === it }]" @click="pick(it)" @mouseenter="hoverItem($event, it)" @mouseleave="hover = null">
          <i>{{ glyph[it.slot] }}</i><b>T{{ it.tier }}</b><small>{{ it.lines.length }}</small>
        </button>
        <p v-if="!save.inventory.length" class="hint">背包是空的。地图里打倒的怪物会掉装备，走过去就能拾取。</p>
      </div>
      <div class="bag-side">
        <div class="wallet"><span v-for="(c, id) in currencies" :key="id" :title="c.name + '：' + c.desc"><i>{{ curGlyph[id] }}</i>{{ save.currencies[id] || 0 }}</span></div>
        <template v-if="picked && save.inventory.includes(picked)">
          <item-card :item="picked" :compare="equippedFor(picked)"></item-card>
          <div class="actions"><button class="btn primary" @click="doEquip(picked.uid)">装备</button><button class="btn" @click="toggle('craft')">洗炼</button><button class="btn danger" @click="doSalvage(picked.uid)">分解</button></div>
        </template>
        <p v-else class="hint">点一件装备查看，悬停可以快速对比。</p>
      </div>
    </div>

    <!-- craft -->
    <div v-if="panel === 'craft'" class="drawer-body craft">
      <p v-if="!picked" class="hint">先在「角色」或「背包」里点一件装备。</p>
      <template v-else>
        <item-card :item="picked" :selected-line="pickedLine" selectable @line="i => pickedLine = i"></item-card>
        <div class="orbs">
          <button v-for="(c, id) in currencies" :key="id" class="orb" :class="'orb-' + id" :disabled="!(save.currencies[id] > 0)" @click="doCraft(id)">
            <i>{{ curGlyph[id] }}</i><b>{{ c.name }}</b><small>{{ c.desc }}</small><em>{{ save.currencies[id] || 0 }}</em></button>
        </div>
        <p class="craftlog" v-if="craftMsg">{{ craftMsg }}</p>
        <p class="hint">封印符作用于选中的词条（在上面点一条）。</p>
      </template>
    </div>

    <!-- builds -->
    <div v-if="panel === 'bd'" class="drawer-body bd">
      <ul class="bd-list">
        <li v-for="a in archetypes" :key="a.id"><button :class="{ on: bdSel === a.id, current: save.archetype === a.id }" @click="bdSel = a.id" :style="{ '--el': hue(skillElement(a.skills[0])) }">
          <b>{{ a.name }}</b><small>{{ a.style }}</small></button></li>
      </ul>
      <div class="bd-detail" v-if="bdArch">
        <h3>{{ bdArch.name }} <small>{{ bdArch.style }} · 技能：{{ skillName(bdArch.skills[0]) }}</small></h3>
        <p class="bd-summary">{{ bdArch.summary }}</p>
        <ol class="bd-stages">
          <li v-for="(s, i) in bdStages" :key="i" :class="{ current: save.archetype === bdArch.id && save.bdStage === i }">
            <div class="bd-stage-head"><b>{{ s.name }}</b><span>地图 T{{ s.maps[0] }}–{{ s.maps[1] }} · 装备 T{{ s.itemTier }} · {{ s.total }} 条词条</span>
              <button class="btn primary sm" @click="applyBd(bdArch.id, i)">{{ save.archetype === bdArch.id && save.bdStage === i ? '重新应用' : '一键应用' }}</button></div>
            <p v-if="s.newKeys.length"><em>新增关键：</em>{{ s.newKeys.join('；') }}</p>
          </li>
        </ol>
        <p class="hint">应用后当前装备放回背包（之前一键应用的流派装备直接替换），技能栏换成该流派的技能。地图里也可以随时换，立即生效。</p>
      </div>
    </div>
  </aside>

  <item-card v-if="hover" class="float" :item="hover.item" :compare="hover.compare" :style="{ left: hover.x + 'px', top: hover.y + 'px' }"></item-card>
</div>`;

export function mountGame(el) {
  const app = createApp({
    components: { ItemCard, Minimap },
    template: TEMPLATE,
    setup() {
      const save = reactive(loadSave());
      const persist = () => writeSave(save);
      const stage = ref(null), overlay = ref(null);
      const panel = ref(null), mapTier = ref(Math.min(save.unlocked, MAP_TIERS)), mapFamily = ref('ruin');
      const picked = ref(null), pickedLine = ref(-1), craftMsg = ref(''), roles = ref(null), evaluating = ref(false), updateText = ref('');
      const hover = ref(null), bdSel = ref(save.archetype ?? ARCHETYPES[0].id), toasts = ref([]);
      const run = ref(null), resultLoot = reactive({ items: 0, currencies: 0, unlocked: 0, done: false });
      const hud = reactive({ tick: 0, time: '0:00', kills: 0, total: 0, life: 0, lifeMax: 1, es: 0, esMax: 0, mana: 0, manaMax: 1, skills: [], selected: 0, resources: [], buffs: [],
        bossShow: false, bossName: '', bossMods: [], bossLife: '100%', bossEs: '0%', bossEnraged: false });
      const rng = dungeonRandom(Date.now() >>> 0);
      let scene = null, ov = null, raf = 0, last = 0, acc = 0, toastId = 0, seenPicked = 0;
      const keys = new Set(), mouse = { x: 0, y: 0, down: false };

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
          ['生命回复', `${Math.round(d.regen)}/秒`], ['生命偷取', `${d.leech.toFixed(1)}%`], ['异常免疫', `${Math.round(d.avoidAilment)}%`], ['承受首领重击', `${Math.round(d.bigHitRatio * 100)}% 生命池`]];
      });
      const bdArch = computed(() => ARCHETYPES.find(a => a.id === bdSel.value));
      const keyName = (fid, itemTier) => { const t = lineTierFor(fid, itemTier); return t ? lineText({ id: fid, tier: t }) : family(fid).name; };
      const bdStages = computed(() => bdArch.value ? STAGES.map((s, i) => { const c = collectionList(bdArch.value, i); return { ...s, total: c.total, newKeys: c.newKeys.map(f => keyName(f, s.itemTier)) }; }) : []);
      const currentBd = computed(() => { const a = ARCHETYPES.find(x => x.id === save.archetype); return a ? `${a.name} · ${STAGES[save.bdStage ?? 0]?.name ?? ''}` : '自由搭配'; });
      const panelName = computed(() => PANELS.find(p => p.id === panel.value)?.name ?? '');

      function toast(text, cls = '') { const id = ++toastId; toasts.value.push({ id, text, cls }); if (toasts.value.length > 5) toasts.value.shift(); setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id); }, 2600); }
      function gearChanged() { gearKey.value++; roles.value = null; persist(); if (run.value) run.value.rebuildHero(build()); }
      function pick(it) { picked.value = it ?? null; pickedLine.value = -1; craftMsg.value = ''; }
      function equippedFor(it) { if (!it) return null; if (it.slot.startsWith('ring')) return save.equipped.ring1 ?? save.equipped.ring2; return save.equipped[it.slot]; }
      function hoverItem(e, it) {
        if (!it) { hover.value = null; return; }
        const r = e.currentTarget.getBoundingClientRect(), w = 340;
        const x = r.left - w - 12 > 8 ? r.left - w - 12 : Math.min(innerWidth - w - 8, r.right + 12);
        hover.value = { item: it, compare: save.inventory.includes(it) ? equippedFor(it) : null, x, y: Math.max(8, Math.min(innerHeight - 420, r.top - 20)) };
      }
      function doEquip(uid) { equip(save, uid); picked.value = null; hover.value = null; gearChanged(); }
      function doUnequip(s) { unequip(save, s); picked.value = null; gearChanged(); }
      function doSalvage(uid) { const g = salvage(save, uid, rng); if (picked.value?.uid === uid) picked.value = null; hover.value = null; craftMsg.value = g ? `分解得到 ${CURRENCIES[g].name}` : '已分解'; persist(); }
      function doCraft(id) {
        const r = craft(save, picked.value, id, rng, pickedLine.value);
        craftMsg.value = r.message; if (!r.ok) return;
        if (Object.values(save.equipped).includes(picked.value)) gearChanged(); else persist();
      }
      function applyBd(id, i) {
        applyArchetype(save, id, i); save.bdStage = i;
        picked.value = null; hover.value = null;
        if (!run.value) mapTier.value = Math.max(1, Math.min(STAGES[i].maps[0], save.unlocked));
        gearChanged();
        const a = ARCHETYPES.find(x => x.id === id);
        toast(`已换上 ${a.name} · ${STAGES[i].name}`, 'good');
      }
      async function evaluate() {
        evaluating.value = true; await nextTick(); await new Promise(r => setTimeout(r, 30));
        try { roles.value = roleReport(content, build(), mapTier.value); } finally { evaluating.value = false; }
      }
      async function update() { await runSelfUpdate(t => { updateText.value = t; }); }
      function toggle(id) { panel.value = panel.value === id ? null : id; hover.value = null; }

      // ---- run lifecycle ----------------------------------------------------------------------
      function startRun() {
        if (!save.skills.some(Boolean)) { panel.value = 'char'; toast('先在角色面板放一个技能', 'bad'); return; }
        const r = new MapRun(build(), { tier: mapTier.value, family: mapFamily.value, seed: (Date.now() ^ (Math.random() * 1e9)) >>> 0 });
        run.value = markRaw(r); panel.value = null; seenPicked = 0;
        Object.assign(resultLoot, { items: 0, currencies: 0, unlocked: 0, done: false });
        nextTick(() => {
          if (!scene) { scene = new Scene3D(stage.value); ov = new Overlay(overlay.value); }
          stage.value.focus();
          last = performance.now(); acc = 0;
          cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
        });
      }
      function leaveRun() {
        const r = run.value; if (!r) return;
        const loot = r.phase === 'failed' ? r.pickedUp : r.collectAll();
        for (const d of loot) { if (d.type === 'item') save.inventory.push(d.item); else save.currencies[d.id] = (save.currencies[d.id] || 0) + d.count; }
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
          if (d.type === 'item') { const rr = rarityOf(d.item); toast(`拾取 ${rr.name} ${itemName(d.item)}`, 'r-' + rr.id); } else toast(`拾取 ${CURRENCIES[d.id].name}`, 'cur');
        }
        if (r.phase !== 'running' && !resultLoot.done) {
          resultLoot.done = true;
          const loot = r.phase === 'cleared' ? [...r.pickedUp, ...r.loot.map(l => l.drop)] : r.pickedUp;
          resultLoot.items = loot.filter(d => d.type === 'item').length; resultLoot.currencies = loot.filter(d => d.type === 'currency').length;
          resultLoot.unlocked = r.phase === 'cleared' && r.tier + 1 > save.unlocked && r.tier < MAP_TIERS ? r.tier + 1 : 0;
        }
        scene.update(r, now / 1000); ov.update(scene, r);
        syncHud(r);
        raf = requestAnimationFrame(frame);
      }
      function syncHud(r) {
        const h = r.hero, s = Math.floor(r.endedAt ?? r.clearedAt ?? r.elapsed), b = r.boss;
        const bossNear = b?.alive && Math.hypot(b.x - h.x, b.y - h.y) < 1400;
        Object.assign(hud, { tick: hud.tick + 1, time: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, kills: r.kills, total: r.total,
          life: Math.max(0, Math.round(h.life)), lifeMax: Math.round(h.max.life), es: Math.round(h.es), esMax: Math.round(h.max.es), mana: Math.round(h.mana), manaMax: Math.round(h.max.mana),
          selected: r.selected,
          skills: r.skills.map(sk => { const cd = Math.max(0, sk.readyAt - r.world.time), total = Math.max(0.01, sk.cdTotal ?? sk.def.cooldown ?? 0); return { name: sk.def.name, cd, cdPct: cd > 0 && sk.def.cooldown ? `${Math.min(100, 100 * cd / Math.max(cd, sk.def.cooldown))}%` : '0%', hue: ELEMENT_HUE[skillElement(sk.def.id)], channel: h.channeling === sk }; }),
          resources: [['power', '能量'], ['frenzy', '狂怒'], ['endurance', '耐力'], ['burst', '迸发'], ['instruction', '指令']].map(([id, name]) => ({ id, name, value: Math.round(h.resource(id)) })).filter(x => x.value > 0),
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
        if (k === 'escape') { if (panel.value) panel.value = null; else if (run.value && run.value.phase !== 'running') leaveRun(); }
      };
      const kd = e => onKey(e, true), ku = e => onKey(e, false);
      const mm = e => { const rect = stage.value?.getBoundingClientRect(); if (rect) { mouse.x = e.clientX - rect.left; mouse.y = e.clientY - rect.top; } };
      const md = e => { if (e.button === 0 && run.value && e.target.closest('.stage')) mouse.down = true; };
      const mu = e => { if (e.button === 0) mouse.down = false; };
      const rs = () => scene?.resize();
      onMounted(() => { addEventListener('keydown', kd); addEventListener('keyup', ku); addEventListener('mousemove', mm); addEventListener('mousedown', md); addEventListener('mouseup', mu); addEventListener('resize', rs); });
      onBeforeUnmount(() => { cancelAnimationFrame(raf); removeEventListener('keydown', kd); removeEventListener('keyup', ku); removeEventListener('mousemove', mm); removeEventListener('mousedown', md); removeEventListener('mouseup', mu); removeEventListener('resize', rs); scene?.dispose(); });

      const pct = (a, b) => `${Math.max(0, Math.min(100, 100 * a / Math.max(1, b)))}%`;
      const bands = STAGES.map(s => s.maps);
      return {
        save, stage, overlay, panel, mapTier, mapFamily, picked, pickedLine, craftMsg, roles, evaluating, updateText, hover, bdSel, toasts, run, resultLoot, hud,
        profile, requirements, statRows, bdArch, bdStages, currentBd, panelName,
        pick, equippedFor, hoverItem, doEquip, doUnequip, doSalvage, doCraft, applyBd, evaluate, update, toggle, startRun, leaveRun, selectSkill, gearChanged,
        panels: PANELS, tierList: Array.from({ length: MAP_TIERS }, (_, i) => i + 1), families: MAP_FAMILIES, slots: SLOTS, slotNames: SLOT_NAMES, currencies: CURRENCIES,
        archetypes: ARCHETYPES, playable: PLAYABLE_SKILLS, skillBar: SKILL_BAR, glyph: SLOT_GLYPH, curGlyph: CURRENCY_GLYPH,
        rarity: rarityOf, skillName: id => content.skills.get(id)?.name ?? id, skillTags, skillElement,
        hue: el => ELEMENT_HUE[el] ?? '#ccc', elementName: el => ELEMENT_NAME[el] ?? el, familyName: id => MAP_FAMILIES[id]?.name ?? id,
        bandOf: t => STAGES.findIndex(s => t >= s.maps[0] && t <= s.maps[1]) % 2 === 1,
        bandName: t => STAGES.find(s => t >= s.maps[0] && t <= s.maps[1])?.name ?? '',
        slotClass: s => save.equipped[s] ? 'r-' + rarityOf(save.equipped[s]).id : 'empty',
        pct, ring: (a, b) => `${(Math.max(0, Math.min(1, a / Math.max(1, b))) * 295.3).toFixed(1)} 295.3`,
      };
    },
  });
  const vm = app.mount(el);
  // Debug/automation hook (tests drive the run through it).
  globalThis.__dw = { get run() { return vm.run; }, get save() { return vm.save; }, vm };
  return app;
}

// 游戏页 · 鎏金夜阙：营地（地图装置）+ 地图战斗（3D、血魔、技能、小地图、首领、连杀与清屏），
// 角色 / 背包 并排打开，洗炼 / 流派 / 传奇图鉴 居中打开；地图里也能随时打开。
// 交互：悬停看物品说明（Floating UI 定位）、拖到装备位或右键装备、右键装备位卸下；动效 GSAP；图标 game-icons.net。
import { createApp, reactive, computed, ref, shallowRef, watch, onMounted, onBeforeUnmount, markRaw, nextTick } from '../vendor/vue.esm-browser.prod.js';
import { SLOTS, LAYERS, family, lineTierFor } from '../../core/content/families.mjs';
import { CURRENCIES, SLOT_NAMES, rarityOf, itemName, lineText, baseOf, baseDefence, rollLegendary, baseLinesOf } from '../../core/content/items.mjs';
import { LEGENDARIES, legendary } from '../../core/content/legendaries.mjs';
import { ARCHETYPES } from '../../core/content/archetypes.mjs';
import { STAGES, collectionList } from '../../core/content/builds.mjs';
import { mapProfile, mapRequirements, MAP_FAMILIES, MAP_TIERS, ELITE_MODS } from '../../core/content/maps.mjs';
import { gameContent } from '../../core/content/game.mjs';
import { defenceReport, roleReport } from '../../core/analysis.mjs';
import { loadSave, writeSave, buildOf, equip, unequip, salvage, craft, applyArchetype, clearArchetype, grantedSkills, syncSkillBar, SKILL_BAR,
  STACK, BAG_SIZE, PAGE_SIZE, PAGES, LEGEND_CAP, currencyStacks, placeBag, placeGrid, moveInBag, bagUsed, bagFree, bagFits, deposit, withdraw, stoneToBag, stoneToDevice, depositCurrency, withdrawCurrency, curHave, toBag, xpToNext, killXp, gainXp, MAX_LEVEL } from './save.mjs';
import { equippedTraits, ladderStatus, detectArchetype } from './traits.mjs';
import { MapRun } from './run.mjs';
import { TalentBoard } from './talents-panel.mjs';
import { switchAccount } from './accounts.mjs';
import { sfx, setLoop, audio } from './audio.mjs';
import { CHAPTERS, newQuestState, questView, questEvent, questTick, claimChapter } from './quests.mjs';
import { talentPoints } from '../../core/content/talents.mjs';
import { Scene3D, Overlay } from './scene.mjs';
import { loadSettings, saveSettings, DEFAULTS as SETTING_DEFAULTS, QUALITY, KEYBINDS } from './settings.mjs';
import { dungeonRandom } from './dungeon.mjs';
import { runSelfUpdate } from '../self-update.mjs';
import { waystoneName, starterWaystones, FREE_TIER, WAYSTONE_RARITY } from './waystones.mjs';
import { SCARAB_SLOTS, SCARAB_IDS, scarabName, scarabText, scarabColor, applyScarabs, parseScarab, SCARAB_TIERS } from './scarabs.mjs';
import { generateAtlas, newAtlasState, atlasView, completeNode, nodeMods, NODE_KINDS, NODE_MODS, FAMILY_HUE, REGION_NAME } from './atlas.mjs';
import { GI, iconInfo, STATUS_ICON, BASE_ICON, SLOT_ICON, SKILL_ICON, CURRENCY_ICON, PANEL_ICON, FAMILY_ICON, LAYER_ICON, BUFF_ICON, probeIcons } from './icons.mjs';

const content = gameContent();
const ELEMENT_NAME = { physical: '物理', fire: '火焰', cold: '冰霜', lightning: '闪电', chaos: '混沌' };
const ELEMENT_HUE = { physical: '#d8c6a4', fire: '#ff8a3d', cold: '#8fd8ff', lightning: '#ffe066', chaos: '#c39bff' };
const EL_CLASS = { physical: 'phys', fire: 'fire', cold: 'cold', lightning: 'light', chaos: 'chaos' };
const SLOT_GLYPH = { weapon: '兵', offhand: '副', helmet: '盔', chest: '甲', gloves: '手', boots: '靴', belt: '带', amulet: '坠', ring1: '戒', ring2: '戒' };
const PANELS = [
  { id: 'atlas', name: '地图', key: 'M' }, { id: 'talents', name: '天赋', key: 'P' }, { id: 'char', name: '角色', key: 'C' }, { id: 'bag', name: '背包', key: 'I' },
  { id: 'quest', name: '任务', key: 'J' }, { id: 'craft', name: '洗炼', key: 'K' }, { id: 'bd', name: '流派', key: 'B' }, { id: 'codex', name: '传奇', key: 'L' },
  { id: 'vault', name: '仓库', key: 'H' }, { id: 'settings', name: '设置', key: 'O' },
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
const SKILL_DESC = {
  fireball: '射出一颗火球，命中第一个敌人时爆开。', ice_nova: '以自身为中心爆发一圈寒冰，冻伤周围所有敌人。',
  arc: '一道电弧打中目标后跳向附近的敌人。', frost_bolt: '射出一枚缓慢的寒冰弹，能穿透一个敌人。',
  spark: '一次放出三道电花，扇形飞出。', tornado: '召出一股龙卷风，朝瞄准方向移动、自己追敌，每秒对卷入的敌人打 4 次。',
  flame_wall: '在瞄准处点起一片火墙，持续灼烧站在里面的敌人。', summon_blades: '召唤两把灵刃替你作战，最多 6 把。',
  storm_totem_place: '在脚下立起一座风暴图腾，自动向附近敌人放电。', heavy_strike: '对面前的敌人重重一击。',
  cleave: '向前方挥出 120° 的弧形斩击。', cyclone: '按住持续旋转，不停斩击身边的敌人。',
  falling_thunder: '向前砸地，扇形范围伤害；每消耗 1 个暴击球，额外伤害提高并射出两道雷电。', flicker_strike: '闪到附近的敌人身边并攻击它。',
  viper_knives: '扔出三把带毒的飞刃。',
  storm_step: '闪到瞄准的地方，落地炸开一圈雷。', frost_dash: '突进到附近的敌人身边斩下一刀（冰霜）。',
  phantom_step: '在原地留下一个残影再闪走；残影消散或被打死时炸开火焰。怪会先去打残影。', star_step: '瞬移到附近的敌人身边斩下一刀。',
  void_leap: '跃到附近的敌人身边，炸开一圈混沌。', aegis_nova: '引爆当前一半的能量护盾，炸开一圈：消耗的护盾越多伤害越高。护盾会照常重新充能。',
  shield_bash: '用盾猛击面前的敌人，最大能量护盾越高打得越痛。',
  raise_skeletons: '在瞄准处拉起一批骷髅战士，9 秒后消散。', summon_golem: '召唤一只又肉又痛的熔火魔像，重击周围（冷却 4 秒，再召唤会替换旧的）。',
  summon_archers: '召唤两名幽魂射手，站在后面放箭。', summon_spiders: '在瞄准处撒下一窝毒蛛，咬出剧毒。',
  summon_wisps: '放出三只霜灵，撞上敌人就自爆冻住周围。', summon_wolves: '召唤两只影狼扑向敌人。',
  blood_pact: '付出 6% 最大生命，召唤一只血魔。',
  fire_trap: '扔出一颗爆燃陷阱，布好后怪一踩就炸开火焰。', frost_trap: '扔出一颗霜冻陷阱，踩中时冻伤一大圈。',
  blade_trap: '扔出一颗刃轮陷阱，踩响后原地转起刀轮持续切割。', snare_shot: '射出一支箭，箭停下的地方埋下捕兽夹。',
  gate_of_treasures: '在身后打开一排金色的门，门里一件接一件射出兵器，射向点的位置附近的敌人。',
  fuse_bolt: '射出引信弹：命中的怪被点上引信，约 1 秒后原地炸开。', sow_seed: '在点的位置种下一棵荆棘树，自己朝附近的怪射荆棘。', singularity: '在点的位置撕开一个奇点，把周围的怪往中心吸、持续磨伤。',
  dominion_lash: '向前方抽出一鞭（物理 + 混沌）；流派词条让抽死的怪站起来为你作战。', call_storm: '在点的位置召出一朵雷云，自己去找怪落雷。', rime_lance: '射出一支穿透的霜矛。',
  turret_trap: '扔出一颗机关陷阱，踩响时弹起一座会自己射箭的弩塔。', shock_trap: '扔出一颗电击陷阱，踩中时放出一圈闪电。', soul_reap: '向前方挥出一大片镰刀（物理 + 混沌）。', aegis_shards: '削下当前 10% 的能量护盾化成三把冰刃射出，伤害随消耗量提高。',
};
/** Currencies that act on one chosen line: 'trait' = base traits only, 'any' = a trait or a random line. */
const CURRENCY_TARGET = { seal: 'any', temper: 'trait', essence_form: 'trait', essence_link: 'trait', essence_core: 'trait' };
export { STACK };
/** The currency page, laid out like PoE's: fixed slots in groups. */
const CURRENCY_PAGE = [
  { name: '基础', ids: ['augment', 'chaos', 'upgrade', 'annul'] },
  { name: '定向', ids: ['seal', 'temper'] },
  { name: '技能', ids: ['skill_gem'] },
  { name: '精华', ids: ['essence_form', 'essence_link', 'essence_core'] },
];
const EL_NAME = { physical: '物理', fire: '火焰', cold: '冰霜', lightning: '闪电', chaos: '混沌' };
/** What the skill tooltip shows: base numbers straight from the skill definition. */
function skillInfo(id) {
  const d = content.skills.get(id); if (!d) return null;
  const dmg = Object.entries(d.damage ?? {}).map(([k, v]) => `${v} ${EL_NAME[k] ?? k}`).join(' + ');
  const rows = [];
  if (dmg) rows.push(['基础伤害', dmg]);
  if (d.channel) rows.push(['引导', `每 ${d.channel} 秒一次`]); else if (d.time) rows.push(['施放时间', `${d.time} 秒`]);
  if (d.cooldown) rows.push(['冷却', `${d.cooldown} 秒`]);
  if (d.cost) rows.push(['魔力消耗', `${d.cost}`]);
  if (d.crit) rows.push(['暴击率', `${d.crit}%`]);
  if (d.range) rows.push(['距离', `${d.range}`]);
  return { name: d.name, tags: skillTags(id), desc: SKILL_DESC[id] ?? '', rows };
}
const itemIcon = it => (it.legend ? 'legendary/' + it.legend : null) ?? BASE_ICON[it.base] ?? SLOT_ICON[it.slot];

// ------------------------------------------------------------------ small components
const Gi = {
  props: { n: String, c: { type: String, default: '' }, g: { type: String, default: '' } },
  setup(p) { return { f: computed(() => iconInfo(p.n)) }; },
  // own painted icons are pictures; everything else is a mask filled with the theme gradient
  template: `<i class="gi" :class="[c, { 'gi-img': f.painted, 'gi-own': f.own }]" :style="f.painted ? { '--img': f.url } : { '--i': f.url }" :data-g="g"></i>`,
};

const ItemTip = {
  components: { Gi },
  props: { item: Object, compare: Object, selected: { type: Object, default: null }, selectable: Boolean, inline: Boolean,
    stacks: { type: Array, default: null }, pinned: Boolean, active: { type: String, default: null }, activeIdx: { type: Number, default: -1 }, msg: { type: String, default: '' }, have: { type: Object, default: null } },
  emits: ['line', 'activate', 'apply', 'unpin'],
  setup(props, { emit }) {
    // Pinned with an active currency: lines it can act on light up; a click on one applies it.
    const need = computed(() => CURRENCY_TARGET[props.active] ?? null);
    const canPick = kind => props.pinned && need.value && (need.value === 'any' || need.value === kind);
    const lineClick = (kind, index) => { if (canPick(kind)) emit('apply', { kind, index }); else if (props.selectable) emit('line', { kind, index }); };
    // Hovering a currency cell shows what it does in a small panel above the grid.
    const peek = ref(null);
    const peekOn = (e, st) => { const el = e.currentTarget, w = el.parentElement.offsetWidth; peek.value = { id: st.id, x: Math.max(110, Math.min(w - 110, el.offsetLeft + el.offsetWidth / 2)), y: el.offsetTop }; };
    return { peek, peekOn, need, canPick, lineClick, CURRENCIES, CURRENCY_ICON, CURRENCY_TARGET, baseLinesOf, rarityOf, itemName, lineText, family, LAYERS, SLOT_NAMES, SLOT_GLYPH, baseOf, baseDefence, skillName, skillTags, legendary, itemIcon, LAYER_ICON, SKILL_ICON }; },
  template: /* html */ `
  <article class="itip" :class="['r-' + rarityOf(item).id, { inline }]">
    <header class="itip-head">
      <div class="itip-icon"><Gi :n="itemIcon(item)" :c="'r-' + rarityOf(item).id" :g="SLOT_GLYPH[item.slot]"/></div>
      <h3>{{ itemName(item) }}</h3>
      <p>{{ rarityOf(item).name }}{{ SLOT_NAMES[item.slot] }} · {{ baseOf(item.slot, item.base)?.name }} · 物品 T{{ item.tier }}</p>
      <p class="itip-bl" :class="'b' + baseLinesOf(item)" :title="'基底词条 ' + baseLinesOf(item) + ' / 3：主动技能和特性占用基底词条'">基底词条 <i v-for="k in 3" :key="k" :class="{ on: k <= baseLinesOf(item) }">◆</i></p>
      <p v-if="item.preset" class="itip-preset">流派配装 · {{ item.preset }}</p>
    </header>
    <p v-if="baseDefence(item).length" class="itip-base">{{ baseDefence(item).map(d => '+' + d.value + ' ' + d.name).join(' · ') }}</p>
    <p v-if="item.legend" class="itip-legend"><b>传奇特性</b>{{ legendary(item.legend).legend.text }}</p>
    <ul class="itip-traits">
      <li v-if="item.skill" class="itip-skill"><Gi :n="SKILL_ICON[item.skill] ?? 'magic-swirl'" c="el-gold"/><span>主动技能 · {{ skillName(item.skill) }}</span><em>{{ skillTags(item.skill).join(' · ') }}</em></li>
      <li v-for="(l, i) in item.traits" :key="'t' + i" :class="['l-' + family(l.id).layer, { on: selected?.kind === 'trait' && selected.index === i, sealed: l.sealed, pick: selectable || canPick('trait'), target: canPick('trait') }]" @click="lineClick('trait', i)">
        <Gi :n="LAYER_ICON[family(l.id).layer]" :c="'ly-' + family(l.id).layer"/><span>{{ lineText(l) }}</span><em>{{ LAYERS[family(l.id).layer].name }} T{{ l.tier }}<b v-if="l.sealed"> · 封</b></em></li>
    </ul>
    <ul class="itip-lines" v-if="item.lines.length">
      <li v-for="(l, i) in item.lines" :key="i" :class="{ on: selected?.kind === 'line' && selected.index === i, sealed: l.sealed, pick: selectable || canPick('line'), target: canPick('line') }" @click="lineClick('line', i)">
        <span>{{ lineText(l) }}</span><em>T{{ l.tier }}<b v-if="l.sealed"> · 封</b></em></li>
    </ul>
    <p v-if="item.legend" class="itip-flavor">{{ legendary(item.legend).flavor }}</p>
    <section v-if="stacks" class="itip-cur" :class="{ pinned }">
      <header><b>通货</b><small v-if="!pinned">按 Ctrl 钉住这个提示，在这里洗炼</small><small v-else-if="!active">左键点一种通货激活</small>
        <small v-else-if="need">{{ CURRENCIES[active].name }}：点一条{{ need === 'trait' ? '特性' : '特性或词条' }}使用 · 右键取消</small>
        <small v-else>{{ CURRENCIES[active].name }}：点「使用」作用在这件装备上</small>
        <button v-if="pinned" class="x" @click="$emit('unpin')" aria-label="取消钉住">×</button></header>
      <div class="cur-grid">
        <button v-for="(st, i) in stacks" :key="st.id + i" class="cur-cell" :class="{ on: active === st.id && activeIdx === i }"
          @mouseenter="peekOn($event, st)" @mouseleave="peek = null"
          @click="pinned && $emit('activate', active === st.id && activeIdx === i ? null : { id: st.id, i })" @contextmenu.prevent="pinned && $emit('activate', null)">
          <Gi :n="CURRENCY_ICON[st.id]" c="r-currency"/><b>{{ st.n }}</b></button>
        <p v-if="!stacks.length" class="hint">背包里没有通货。</p>
        <div class="cur-peek" v-if="peek" :style="{ left: peek.x + 'px', top: peek.y + 'px' }">
          <b>{{ CURRENCIES[peek.id].name }}</b><small v-if="have">共 {{ have[peek.id] || 0 }} 个</small>
          <p>{{ CURRENCIES[peek.id].desc }}</p>
          <em>{{ CURRENCY_TARGET[peek.id] ? (CURRENCY_TARGET[peek.id] === 'trait' ? '激活后点一条特性使用' : '激活后点一条特性或词条使用') : '激活后点「使用」作用在整件装备上' }}</em>
        </div>
      </div>
      <div class="cur-act" v-if="pinned && active && !need"><button class="orn-btn primary sm" @click="$emit('apply', null)">使用 {{ CURRENCIES[active].name }}</button></div>
      <p class="cur-msg" v-if="pinned && msg">{{ msg }}</p>
    </section>
    <footer v-if="compare && compare !== item" class="itip-cmp">
      <h4>身上 · {{ itemName(compare) }}</h4>
      <p v-for="(l, i) in [...compare.traits, ...compare.lines].slice(0, 6)" :key="i">{{ lineText(l) }}</p>
    </footer>
  </article>`,
};

/** The same tooltip frame for everything that is not equipment: waystones, currency, skills. */
const ThingTip = {
  components: { Gi },
  props: { kind: String, data: Object },
  setup(props) {
    const pctText = v => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`;
    const stoneLoot = w => { const m = nodeMods({ kind: 'normal', mods: w.mods }); return [['物品数量', pctText(m.quantity - 1)], ['怪群规模', '×' + +m.pack.toFixed(2)], ['传奇几率', '×' + +m.legend.toFixed(1)], ['怪物生命', '×' + +m.life.toFixed(2)], ['怪物伤害', '×' + +m.damage.toFixed(2)]].filter(r => !['+0%', '×1'].includes(r[1])); };
    return { props, waystoneName, WAYSTONE_RARITY, NODE_MODS, stoneLoot, CURRENCIES, CURRENCY_ICON, SKILL_ICON, scarabName, scarabText, scarabColor, SCARAB_TIERS, parseScarab };
  },
  template: /* html */ `
  <article class="itip thing" :class="kind === 'waystone' ? 'w-' + data.stone.rarity : kind === 'currency' || kind === 'scarab' ? 'r-currency' : 'el-' + data.el">
    <template v-if="kind === 'scarab'">
      <header class="itip-head">
        <div class="itip-icon" :style="{ '--sc': scarabColor(data.id) }"><Gi n="star-formation" c="scarab" g="契"/></div>
        <h3>{{ scarabName(data.id) }}</h3>
        <p>星契 · {{ SCARAB_TIERS[parseScarab(data.id).tier] }}<template v-if="data.have != null"> · 持有 {{ data.have }}</template></p>
      </header>
      <ul class="itip-lines"><li><span>{{ scarabText(data.id) }}</span></li></ul>
      <p class="thing-desc">从背包拖进地图仪法阵外圈的槽里，开图时消耗，这一张图生效。</p>
      <p class="thing-note" v-if="data.note">{{ data.note }}</p>
    </template>
    <template v-else-if="kind === 'waystone'">
      <header class="itip-head">
        <div class="itip-icon"><Gi n="stone-tablet" :c="'w-' + data.stone.rarity"/></div>
        <h3>{{ waystoneName(data.stone) }}</h3>
        <p>{{ WAYSTONE_RARITY[data.stone.rarity].name }}路石 · T{{ data.stone.tier }} · 地图词缀 {{ data.stone.mods.length }} 条</p>
      </header>
      <ul class="itip-lines" v-if="data.stone.mods.length"><li v-for="m in data.stone.mods" :key="m"><span>{{ NODE_MODS[m].text }}</span></li></ul>
      <p v-else class="thing-desc">没有地图词缀。</p>
      <dl class="thing-rows" v-if="stoneLoot(data.stone).length"><div v-for="r in stoneLoot(data.stone)" :key="r[0]"><dt>{{ r[0] }}</dt><dd>{{ r[1] }}</dd></div></dl>
      <p class="thing-desc">可以放进任意节点，开图时消耗；这张图按路石的阶 T{{ data.stone.tier }} 打。</p>
      <p v-if="data.note" class="thing-note">{{ data.note }}</p>
    </template>
    <template v-else-if="kind === 'currency'">
      <header class="itip-head">
        <div class="itip-icon"><Gi :n="CURRENCY_ICON[data.id]" c="r-currency"/></div>
        <h3>{{ CURRENCIES[data.id].name }}</h3>
        <p>通货<template v-if="data.have != null"> · 持有 {{ data.have }}</template><template v-if="data.count > 1"> · 这一堆 {{ data.count }} 个</template></p>
      </header>
      <p class="thing-desc">{{ CURRENCIES[data.id].desc }}</p>
      <p class="thing-note" v-if="data.note">{{ data.note }}</p>
    </template>
    <template v-else-if="kind === 'skill'">
      <header class="itip-head">
        <div class="itip-icon"><Gi :n="SKILL_ICON[data.id] ?? 'magic-swirl'" :c="'el-' + data.el" :g="data.info.name.slice(0, 1)"/></div>
        <h3>{{ data.info.name }}</h3>
        <p>主动技能 · {{ data.info.tags.join(' · ') }}<template v-if="data.key"> · 技能栏 {{ data.key }}</template></p>
      </header>
      <p class="thing-desc" v-if="data.info.desc">{{ data.info.desc }}</p>
      <dl class="thing-rows"><div v-for="r in data.info.rows" :key="r[0]"><dt>{{ r[0] }}</dt><dd>{{ r[1] }}</dd></div></dl>
      <p class="thing-note" v-if="data.from">来自{{ data.from }}</p>
    </template>
  </article>`,
};

const Minimap = {
  props: { run: Object, tick: Number, zoom: { type: Number, default: 1 } },
  emits: ['open'],
  setup(props) {
    const el = ref(null);
    let base = null, layout = null;
    function draw() {
      const c = el.value, r = props.run; if (!c || !r) return;
      const d = r.dungeon, size = d.size, scale = c.width / size * 2.2 * props.zoom, ctx = c.getContext('2d');
      if (layout !== d || base.width !== Math.ceil(size * scale)) {
        layout = d; base = document.createElement('canvas'); base.width = base.height = Math.ceil(size * scale);
        const b = base.getContext('2d');
        for (const t of d.tiles) { b.fillStyle = d.rooms[t.room]?.kind === 'boss' ? '#5a2a26' : t.room < 0 ? '#28324a' : '#3a4866'; b.fillRect(t.x * scale, t.y * scale, scale + .5, scale + .5); }
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height);
      // World +y is "up" on screen (the camera looks north): flip the canvas so the map turns the way the game does.
      ctx.setTransform(1, 0, 0, -1, 0, c.height);
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
  template: `<button class="minimap" @click="$emit('open')" title="打开大地图（Tab）"><canvas ref="el" width="200" height="200" aria-label="小地图"></canvas><small>Tab</small></button>`,
};
/** The whole map in the middle of the screen (Diablo's Tab map): rooms, the boss room, monsters, loot, the portal, you. */
const BigMap = {
  props: { run: Object, tick: Number },
  emits: ['close'],
  setup(props) {
    const el = ref(null);
    let base = null, layout = null;
    function draw() {
      const c = el.value, r = props.run; if (!c || !r) return;
      const d = r.dungeon, ctx = c.getContext('2d');
      // fit the explored footprint (all tiles) into the canvas
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const t of d.tiles) { x0 = Math.min(x0, t.x); y0 = Math.min(y0, t.y); x1 = Math.max(x1, t.x + 1); y1 = Math.max(y1, t.y + 1); }
      const pad = 2, scale = Math.min(c.width / (x1 - x0 + pad * 2), c.height / (y1 - y0 + pad * 2));
      const ox = (c.width - (x1 - x0) * scale) / 2 - x0 * scale, oy = (c.height - (y1 - y0) * scale) / 2 - y0 * scale;
      if (layout !== d) {
        layout = d; base = document.createElement('canvas'); base.width = c.width; base.height = c.height;
        const b = base.getContext('2d');
        for (const t of d.tiles) { b.fillStyle = d.rooms[t.room]?.kind === 'boss' ? 'rgba(150,60,52,.75)' : t.room < 0 ? 'rgba(70,90,130,.55)' : 'rgba(96,120,170,.6)'; b.fillRect(ox + t.x * scale, oy + t.y * scale, scale + .6, scale + .6); }
        // outline the rooms' edges a little brighter
        b.strokeStyle = 'rgba(216,180,106,.35)'; b.lineWidth = 1;
        const has = new Set(d.tiles.map(t => t.x + ',' + t.y));
        for (const t of d.tiles) for (const [dx, dy, ax, ay, bx, by] of [[1, 0, 1, 0, 1, 1], [-1, 0, 0, 0, 0, 1], [0, 1, 0, 1, 1, 1], [0, -1, 0, 0, 1, 0]]) if (!has.has((t.x + dx) + ',' + (t.y + dy))) { b.beginPath(); b.moveTo(ox + (t.x + ax) * scale, oy + (t.y + ay) * scale); b.lineTo(ox + (t.x + bx) * scale, oy + (t.y + by) * scale); b.stroke(); }
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height);
      ctx.setTransform(1, 0, 0, -1, 0, c.height);   // world +y is up on screen
      ctx.drawImage(base, 0, 0);
      const toMap = (x, y) => [ox + (x + d.half) / d.tile * scale, oy + (y + d.half) / d.tile * scale];
      for (const m of r.monsters) { const [x, y] = toMap(m.x, m.y); ctx.fillStyle = m.boss ? '#ff6a4a' : m.kind === 'elite' ? '#ffd27a' : '#d0584f'; const s = m.boss ? 10 : m.kind === 'elite' ? 6 : 3.5; ctx.fillRect(x - s / 2, y - s / 2, s, s); }
      for (const l of r.loot) { const [x, y] = toMap(l.x, l.y); ctx.fillStyle = l.drop.item?.legend ? '#ffad5a' : l.drop.type === 'waystone' ? '#9fd8ff' : '#fbe7b0'; ctx.beginPath(); ctx.arc(x, y, 2.6, 0, 7); ctx.fill(); }
      for (const m of r.minions ?? []) { const [x, y] = toMap(m.x, m.y); ctx.fillStyle = '#7fe0c8'; ctx.fillRect(x - 1.5, y - 1.5, 3, 3); }
      if (r.portal) { const [x, y] = toMap(r.portal.x, r.portal.y); ctx.strokeStyle = '#8fb8ff'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, 8, 0, 7); ctx.stroke(); }
      const [hx, hy] = toMap(r.hero.x, r.hero.y), a = Math.atan2(r.hero.aim.y, r.hero.aim.x);
      ctx.fillStyle = '#7fe0c8'; ctx.strokeStyle = '#04110e'; ctx.lineWidth = 1.5; ctx.beginPath();
      ctx.moveTo(hx + Math.cos(a) * 11, hy + Math.sin(a) * 11); ctx.lineTo(hx + Math.cos(a + 2.5) * 7, hy + Math.sin(a + 2.5) * 7); ctx.lineTo(hx + Math.cos(a - 2.5) * 7, hy + Math.sin(a - 2.5) * 7); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    watch(() => props.tick, draw); onMounted(draw);
    return { el };
  },
  template: `<section class="bigmap" @click="$emit('close')" aria-label="大地图">
    <canvas ref="el" width="900" height="900"></canvas>
    <footer><span><i class="d-you"></i>你</span><span><i class="d-mob"></i>怪物</span><span><i class="d-elite"></i>精英</span><span><i class="d-boss"></i>首领</span><span><i class="d-loot"></i>掉落</span><span><i class="d-portal"></i>传送阵</span><em>Tab 或点击关闭</em></footer>
  </section>`,
};

// ------------------------------------------------------------------ page
const TEMPLATE = /* html */ `
<div class="g" :class="{ 'in-run': run }">
  <div class="stage" ref="stage" tabindex="0" @contextmenu.prevent><div class="overlay" ref="overlay"></div></div>
  <div class="camp-bg" v-if="!run && !hub"><i class="mist m1"></i><i class="mist m2"></i><i class="glow"></i></div>

  <!-- =================== RUN HUD =================== -->
  <template v-if="run">
    <section class="plate panel">
      <div class="plate-tier"><small>T</small>{{ run.tier }}</div>
      <div class="plate-body">
        <h2>{{ familyName(run.profile.family) }}</h2>
        <div class="plate-bar"><i :style="{ width: pct(hud.kills, hud.total) }"></i></div>
        <p><span>{{ hud.time }}</span><span>击杀 {{ hud.kills }} / {{ hud.total }}</span><span v-if="run.profile.resistPenalty" class="warn">全抗 −{{ run.profile.resistPenalty }}%</span></p>
      </div>
      <button class="plate-leave" @click="leaveRun">{{ run.phase === 'running' ? '撤离' : '回家' }}</button>
    </section>
    <minimap v-if="opts.minimap" :run="run" :tick="hud.tick" :zoom="opts.minimapZoom" @open="mapOpen = !mapOpen"></minimap>
    <big-map v-if="mapOpen" :run="run" :tick="hud.tick" @close="mapOpen = false"></big-map>

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
        <button v-for="i in 4" :key="i" class="skill" @dragover.prevent="dropBar = i - 1" @dragleave="dropBar = null" @drop.prevent="skillDrop(i - 1)" :class="[{ drop: dropBar === i - 1 }, 'pos-' + i, hud.skills[i - 1] ? ['el-' + hud.skills[i - 1].el, { on: i - 1 === hud.selected, channel: hud.skills[i - 1].channel }] : 'empty']" @click="selectSkill(i - 1)" @mouseenter="save.skills[i - 1] && hoverThing($event, 'skill', { id: save.skills[i - 1], key: i })" @mouseleave="hoverOff">
          <template v-if="hud.skills[i - 1]">
            <Gi :n="hud.skills[i - 1].icon" :c="'el-' + hud.skills[i - 1].el" :g="hud.skills[i - 1].name.slice(0, 1)"/>
            <i class="cd" v-if="hud.skills[i - 1].cd > 0" :style="{ '--p': hud.skills[i - 1].cdPct }"></i>
          </template>
          <kbd>{{ i }}</kbd>
        </button>
        <p class="er-skill-name">{{ hud.skills[hud.selected]?.name }}</p>
        <button class="tp-btn" @click="portalHome" :disabled="run.phase === 'failed'" title="传送回家（T）：地图保持开启，从家里的传送门回来"><Gi n="magic-portal" c="el-gold" g="传"/><kbd>T</kbd><small>{{ run.phase === 'cleared' ? '回家' : '传送' }}</small></button>
      </div>
    </section>
    <section class="er-right"><b>{{ hud.kills }}</b><small>/ {{ hud.total }} 击杀</small><small class="er-hint">点掉落名拾取 · 按住 Alt 显示全部</small></section>

    <div class="legend-drop" v-if="legendBanner" :key="legendBanner.id"><small>传奇掉落</small><b>{{ legendBanner.name }}</b></div>

    <section class="cleared-banner" v-if="run.phase === 'cleared' && clearedBanner" :key="'cb' + run.clearedAt">
      <h2>地 图 完 成</h2>
      <p>{{ hud.time }} · 击杀 {{ hud.kills }}<template v-if="resultLoot.opened"> · 新开放 {{ resultLoot.opened }} 个节点</template></p>
      <small>首领留下了传送阵：捡完东西后点它打开图集，选下一张图。装备也可以先换。</small>
    </section>
    <section class="result panel" v-if="run.phase === 'failed'" :class="run.phase">
      <h2>你 倒 下 了</h2>
      <dl>
        <div><dt>用时</dt><dd>{{ hud.time }}</dd></div><div><dt>击杀</dt><dd>{{ hud.kills }}</dd></div>
        <div><dt>最高连杀</dt><dd>{{ run.bestCombo }}</dd></div><div><dt>连锁击杀</dt><dd>{{ pctNum(run.cascadeKills, hud.kills) }}%</dd></div>
      </dl>
      <p>只带回已经拾取的东西。回家整理一下装备再来。</p>
      <button class="orn-btn primary" @click="leaveRun">回到家</button>
    </section>
  </template>

  <!-- =================== CAMP =================== -->
  <template v-else>
    <header class="topbar">
      <button class="orn-btn ghost sm" @click="openCenter('settings')" title="设置（O）">设置</button>
      <button class="orn-btn ghost sm" @click="leaveAccount" :title="'当前账号：' + accountName">账号 · {{ accountName }}</button>
      <a class="orn-btn ghost sm" href="/editor/index.html" target="_blank" rel="noopener">内容编辑器</a>
      <button class="orn-btn ghost sm" @click="update">{{ updateText || '更新到最新' }}</button>
    </header>

    <!-- the map device: waystones in the stash; the atlas itself opens from the rail (M) -->
    <minimap v-if="opts.minimap && hub" :run="hub" :tick="hubTick" :zoom="opts.minimapZoom" @open="mapOpen = !mapOpen"></minimap>
    <big-map v-if="mapOpen && hub" :run="hub" :tick="hubTick" @close="mapOpen = false"></big-map>
    <p class="hub-hint" v-if="hub && !atlasOpen && !center && !open.vault && !open.char">家 · 安全区　点 NPC、仓库或北面的地图仪走过去 · WASD 或点地面移动</p>
    <!-- home: level, experience and the portal back into an open map, bottom-left -->
    <section class="home-left">
      <div class="facts"><span><b>T{{ save.unlocked }}</b>最高</span><span><b>{{ save.atlas.done.length }}</b>已打通</span><span><b>{{ save.stats.maps }}</b>通关</span><span><b>{{ save.stats.kills }}</b>击杀</span></div>
      <button class="tp-btn big" v-if="portalRun" @click="portalBack" title="回到还开着的地图（T）"><Gi n="magic-portal" c="el-gold" g="传"/><kbd>T</kbd><small>回到 T{{ portalRun.tier }} {{ familyName(portalRun.profile.family) }}</small></button>
    </section>
  </template>

  <section class="xpbar" :title="save.level >= maxLevel ? '已满级' : '经验 ' + fmtN(save.xp) + ' / ' + fmtN(xpNext)">
    <b>{{ save.level }}</b><small>级</small>
    <div class="xp-track"><i :style="{ width: save.level >= maxLevel ? '100%' : pct(save.xp, xpNext) }"></i><span v-for="k in 9" :key="k" :style="{ left: k * 10 + '%' }"></span></div>
    <em>{{ save.level >= maxLevel ? '满级' : pctNum(save.xp, xpNext) + '%' }}</em>
  </section>
  <div class="toasts" :class="{ camp: !run }"><p v-for="t in toasts" :key="t.id" :class="t.cls"><Gi v-if="t.icon" :n="t.icon" :c="t.ic || ''"/>{{ t.text }}</p></div>

  <!-- =================== QUEST TRACKER + STORY =================== -->
  <aside class="qtrack" v-if="opts.showQuest && quest && !atlasOpen && !talentOpen && !open.char && !open.vault && !center" :class="{ inrun: !!run }" @click="openCenter('quest')" title="打开任务（J）">
    <header><small>第 {{ chapterNo(quest.index) }} 章 · {{ quest.chapter.sub }}</small><b>{{ quest.chapter.title }}</b></header>
    <ul><li v-for="(st, i) in quest.steps" :key="i" :class="{ done: st.done }"><i></i><span>{{ st.text }}</span><em v-if="st.need > 1 && !st.done && st.goal.type !== 'tier'">{{ fmtN(st.have) }}/{{ fmtN(st.need) }}</em></li></ul>
    <p v-if="quest.complete" class="qready">本章完成 · 点这里领取奖励</p>
  </aside>
  <div class="story" v-if="story" @click.self="null">
    <section class="story-card panel">
      <small class="story-ch">第 {{ chapterNo(story.index) }} 章 · {{ chapters[story.index].sub }} · {{ chapters[story.index].tiers }}</small>
      <h2>{{ chapters[story.index].title }}</h2>
      <div class="story-text"><p v-for="(t, i) in story.mode === 'intro' ? chapters[story.index].intro : chapters[story.index].outro" :key="i">{{ t }}</p></div>
      <template v-if="story.mode === 'intro'">
        <h4 class="sub">本章目标</h4>
        <ul class="story-goals"><li v-for="(st, i) in chapters[story.index].steps" :key="i">{{ st.text }}</li></ul>
        <button class="orn-btn primary big" @click="closeStory">启 程</button>
      </template>
      <template v-else>
        <h4 class="sub">奖励</h4>
        <p class="story-reward">{{ rewardText(chapters[story.index].reward) }}</p>
        <button class="orn-btn primary big" @click="claimStory">{{ story.index + 1 < chapters.length ? '领取奖励 · 继续' : '领取奖励' }}</button>
      </template>
    </section>
  </div>

  <!-- =================== TALENTS (rail · P) =================== -->
  <talent-board v-if="talentOpen" :save="save" :points="talentPts" @changed="gearChanged" @close="toggle('talents')"></talent-board>

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
        <g v-for="n in atlasShown" :key="n.id" class="node" :class="['st-' + n.st, 'k-' + n.kind, { sel: n.id === atlasSel, here: n.id === save.atlas.at, quest: n.quest }]" :style="{ '--hue': n.hue }" :transform="'translate(' + n.x + ' ' + n.y + ')'" @click="selectNode(n.id)">
          <circle class="halo" :r="n.kind === 'boss' ? 30 : 22"/>
          <g v-if="n.quest" class="qmark" :transform="'translate(' + (n.kind === 'boss' ? 20 : 15) + ' ' + (n.kind === 'boss' ? -22 : -17) + ')'"><circle r="8"/><text dy=".36em">!</text></g>
          <circle class="ring" :r="n.kind === 'boss' ? 19 : n.kind === 'normal' ? 12 : 15"/>
          <image v-if="n.kind !== 'normal'" :href="kindIconUrl(n.kind, n.st === 'done' ? '#2a1a06' : '#fbe7b0')" :x="n.kind === 'boss' ? -12 : -9" :y="n.kind === 'boss' ? -12 : -9" :width="n.kind === 'boss' ? 24 : 18" :height="n.kind === 'boss' ? 24 : 18"/>
          <text v-else-if="n.st === 'seen'" class="tier" dy=".35em">?</text>
          <circle v-else class="core" r="3.2"/>
          <text v-if="n.label" class="name" :y="n.kind === 'boss' ? -30 : -22">{{ n.name }}</text>
          <path v-if="n.id === save.atlas.at" class="here-mark" d="M0 -9 L6 0 L0 9 L-6 0Z" :transform="'translate(0 ' + (n.kind === 'boss' ? 44 : 36) + ')'"/>
        </g>
      </svg>
    </div>

    <section class="atlas-card panel" v-if="selNode">
      <header class="ac-head">
        <div class="ac-icon" :style="{ '--hue': selNode.hue }"><Gi v-if="selNode.kind !== 'normal'" :n="kinds[selNode.kind].icon" c="el-gold"/><b v-else>{{ runTier }}</b></div>
        <div><h2>{{ selNode.name }}</h2><p>T{{ runTier }} · {{ regionName(selNode.family) }} · <span :class="'st-' + selNode.st">{{ statusName(selNode.st) }}</span></p></div>
      </header>
      <div class="ac-body">
        <!-- the map device: a rune circle with the waystone in the middle and five fixed sigil slots -->
        <section class="ac-device">
          <h4 class="ac-h">地图仪 <small>路石放进法阵中心 · 从背包把星契拖到外圈的槽</small></h4>
          <div class="sigil" :class="[stone ? 'lit w-' + stone.rarity : freeNode ? 'lit free' : 'dark', { drop: dropDev === 'core' }]">
            <svg class="sigil-art" viewBox="0 0 300 300" aria-hidden="true">
              <defs>
                <radialGradient id="sg-glow"><stop offset="0" stop-color="var(--sg-c)" stop-opacity=".55"/><stop offset=".55" stop-color="var(--sg-c)" stop-opacity=".12"/><stop offset="1" stop-color="var(--sg-c)" stop-opacity="0"/></radialGradient>
                <path id="sg-text" d="M150,150 m-112,0 a112,112 0 1,1 224,0 a112,112 0 1,1 -224,0"/>
              </defs>
              <circle cx="150" cy="150" r="146" fill="url(#sg-glow)"/>
              <g class="ring r1"><circle cx="150" cy="150" r="138" class="ln"/><circle cx="150" cy="150" r="131" class="ln thin"/>
                <line v-for="k in 60" :key="'t' + k" x1="150" y1="14" x2="150" :y2="k % 5 ? 20 : 26" class="tick" :transform="'rotate(' + k * 6 + ' 150 150)'"/></g>
              <g class="ring r2"><text class="runes"><textPath href="#sg-text">ᚠᚢᚦᚨᚱᚲ ✦ ᚷᚹᚺᚾᛁᛃ ✦ ᛇᛈᛉᛊᛏᛒ ✦ ᛖᛗᛚᛜᛞᛟ ✦ 星环之契 ✦</textPath></text></g>
              <g class="ring r3"><circle cx="150" cy="150" r="96" class="ln"/>
                <polygon class="ln star" points="150,58 237,213 63,213"/><polygon class="ln star" points="150,242 63,87 237,87"/>
                <circle cx="150" cy="150" r="58" class="ln thin"/></g>
              <g class="ring r4"><polygon class="ln penta" :points="pentaPoints"/><circle v-for="k in 5" :key="'n' + k" class="node" :cx="slotPos(k - 1).x" :cy="slotPos(k - 1).y" r="4"/></g>
            </svg>
            <button class="sigil-core" @click="stone && pickStone(stone)" :draggable="!!stone" @dragstart="dragAnyStart($event, { kind: 'core' })" @dragend="dragAnyEnd"
              @dragover.prevent="dropDev = 'core'" @dragleave="dropDev = null" @drop.prevent.stop="dropOnCore"
              @mouseenter="stone && hoverThing($event, 'waystone', { stone, note: '点一下或拖回下面取下' })" @mouseleave="hoverOff">
              <template v-if="stone"><Gi n="stone-tablet" :c="'w-' + stone.rarity"/><b>T{{ stone.tier }}</b></template>
              <small v-else>{{ freeNode ? '免费节点' : '放入路石' }}</small>
            </button>
            <button v-for="(id, i) in deviceSlots" :key="i" class="sigil-slot" :class="{ empty: !id, drop: dropDev === i }" :style="{ left: slotPos(i).x / 3 + '%', top: slotPos(i).y / 3 + '%', '--sc': id ? scarabColor(id) : 'transparent' }"
              :draggable="!!id" @dragstart="dragAnyStart($event, { kind: 'slot', i })" @dragend="dragAnyEnd"
              @dragover.prevent="dropDev = i" @dragleave="dropDev = null" @drop.prevent.stop="dropOnSlot(i)" @click="id && unslotScarab(i)"
              @mouseenter="id && hoverThing($event, 'scarab', { id, note: '点一下放回背包' })" @mouseleave="hoverOff">
              <Gi v-if="id" n="star-formation" c="scarab" g="契"/><i v-else>{{ i + 1 }}</i></button>
          </div>
        </section>
        <!-- usable waystones -->
        <section class="ac-stones">
          <h4 class="ac-h">路石背包 <small>{{ save.waystones.length }} 块 · 点一下或拖进法阵 · 双击退回背包</small></h4>
          <div class="ws-grid" @dragover.prevent @drop.prevent="dropOnStones">
            <button v-for="(w, i) in stoneCells" :key="w ? w.uid : 'e' + i" class="ws" :disabled="!w"
              :draggable="!!w" @dragstart="w && dragAnyStart($event, { kind: 'stone', w })" @dragend="dragAnyEnd" @dragover.prevent @drop.prevent.stop="dropOnStoneCell(i)"
              :class="w ? ['w-' + w.rarity, { on: w.uid === wsSel }] : 'empty'"
               @mouseenter="w && hoverThing($event, 'waystone', { stone: w, note: (w.uid === wsSel ? '已放进法阵' + (freeNode ? '：再点一下取下' : '') : '点一下放进法阵，本次按 T' + w.tier + ' 打') + ' · 双击退回背包' })" @mouseleave="hoverOff" @click="w && pickStone(w)" @dblclick="w && stoneOut(w)">
              <template v-if="w"><Gi n="stone-tablet" :c="'w-' + w.rarity"/><b>{{ w.tier }}</b></template></button>
          </div>
          <p v-if="!save.waystones.length" class="ws-none">还没有路石：打倒首领必掉。</p>
        </section>
      </div>
      <footer class="ac-foot">
        <button class="orn-btn primary big" :disabled="!canStart" @click="startRun">{{ startText }}</button>
      </footer>
    </section>

    <!-- this map's affixes: the part that grows, beside the device card -->
    <section class="atlas-affix panel" v-if="selNode">
        <!-- everything this map will have, all spelled out -->
      <section class="ac-affix">
          <h4 class="ac-h">本图词条 <small>{{ affixRows.length ? '共 ' + affixRows.length + ' 条' : '' }}</small></h4>
          <ul class="affix-list">
            <li v-for="(r, i) in affixRows" :key="i" :class="'src-' + r.src" :style="r.color ? { '--sc': r.color } : null"><em>{{ r.tag }}</em><span>{{ r.text }}</span></li>
            <li v-if="!affixRows.length" class="src-none"><em>普通</em><span>这张图没有额外词条。放一块带词缀的路石或几枚星契来加强它。</span></li>
          </ul>
          <dl class="ac-totals">
            <div v-for="t in totals" :key="t[0]" :class="{ up: t[2] }"><dt>{{ t[0] }}</dt><dd>{{ t[1] }}</dd></div>
          </dl>
      </section>
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

  <!-- =================== SKILLS (beside the character panel) =================== -->
  <section class="win panel win-skills" v-if="open.char" aria-label="可用技能">
    <header class="win-head"><h2>技 能</h2><span class="count">{{ skillCards.length }} 个可用</span></header>
    <div class="win-body">
      <p class="hint">装备基底带的主动技能。拖到技能栏，或双击放进第一个空位；悬停看详情。</p>
      <div class="skill-grid">
        <div v-for="(c, i) in skillGrid" :key="c ? c.id : 'e' + i" class="skill-cell" :class="c ? ['el-' + c.el, { on: c.key }] : 'empty'" :draggable="!!c"
          @dragstart="c && skillDragStart($event, c.id, null)" @dragend="skillDragEnd" @dblclick="c && quickBar(c.id)" @mouseenter="c && hoverThing($event, 'skill', { id: c.id })" @mouseleave="hoverOff">
          <template v-if="c"><Gi :n="skillIcon(c.id)" :c="'el-' + c.el" :g="c.name.slice(0, 1)"/><kbd v-if="c.key">{{ c.key }}</kbd></template>
        </div>
      </div>
      <p v-if="!skillCards.length" class="hint">还没有技能：装备一件带主动技能的装备（武器都带）。</p>
    </div>
  </section>

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
          :draggable="!!save.equipped[s]" @dragstart="save.equipped[s] && dragAnyStart($event, { kind: 'equipped', slot: s })" @dragend="dragAnyEnd"
          @mouseenter="hoverOn($event, save.equipped[s])" @mouseleave="hoverOff" @dragover.prevent="dropSlot = s" @dragleave="dropSlot = null" @drop.prevent="dropOn(s)">
          <Gi v-if="save.equipped[s]" :n="itemIcon(save.equipped[s])" :c="'r-' + rarity(save.equipped[s]).id" :g="glyph[s]"/>
          <Gi v-else :n="slotIcon(s)" c="ghost" :g="glyph[s]"/>
          <small>{{ slotNames[s] }}</small>
        </button>
      </div>
      <p class="hint center">右键卸下 · 从背包拖到这里装备</p>
      <dl class="stats"><div v-for="r in statRows" :key="r[0]"><dt>{{ r[0] }}</dt><dd>{{ r[1] }}</dd></div></dl>
      <h4 class="sub">技能栏 <small>从右边拖技能进来 · 格子之间拖动换位 · 右键清空</small></h4>
      <div class="barpick">
        <div v-for="i in skillBar" :key="i" class="bar-cell" :class="[{ drop: dropBar === i - 1, filled: save.skills[i - 1] }, save.skills[i - 1] ? 'el-' + skillEl(save.skills[i - 1]) : '']"
          :draggable="!!save.skills[i - 1]" @dragstart="skillDragStart($event, save.skills[i - 1], i - 1)" @dragend="skillDragEnd"
          @dragover.prevent="dropBar = i - 1" @dragleave="dropBar = null" @drop.prevent="skillDrop(i - 1)" @contextmenu.prevent="setBar(i - 1, null)"
          @mouseenter="save.skills[i - 1] && hoverThing($event, 'skill', { id: save.skills[i - 1], key: i })" @mouseleave="hoverOff">
          <Gi v-if="save.skills[i - 1]" :n="skillIcon(save.skills[i - 1])" :c="'el-' + skillEl(save.skills[i - 1])" :g="skillName(save.skills[i - 1]).slice(0, 1)"/>
          <kbd>{{ i }}</kbd><small>{{ save.skills[i - 1] ? skillName(save.skills[i - 1]) : '空' }}</small></div>
      </div>
    </div>
  </section>

  <!-- =================== STASH (home only) =================== -->
  <section class="win panel win-left win-vault" v-if="open.vault" aria-label="仓库">
    <header class="win-head"><h2>仓 库</h2><button class="x" @click="open.vault = false" aria-label="关闭">×</button></header>
    <nav class="vtabs">
      <button :class="{ on: vaultTab === 'currency' }" @click="vaultTab = 'currency'">通货</button>
      <button :class="{ on: vaultTab === 'legend' }" @click="vaultTab = 'legend'">传奇</button>
      <button v-for="k in pages" :key="k" :class="{ on: vaultTab === k - 1, drop: dropTab === k - 1 }" @click="vaultTab = k - 1"
        @dragover.prevent="dropTab = k - 1" @dragleave="dropTab = null" @drop.prevent="dropTab = null; dropToPage(k - 1)">{{ k }}<small>{{ save.stash.pages[k - 1].length }}</small></button>
    </nav>
    <div class="win-body">
      <!-- currency page: every currency has its own fixed slot -->
      <template v-if="vaultTab === 'currency'">
        <div class="vcur" @dragover.prevent @drop.prevent="dropOnCurrencyPage">
          <section v-for="g in currencyPage" :key="g.name" class="vcur-group">
            <h4>{{ g.name }}</h4>
            <div class="vcur-row">
              <button v-for="id in g.ids" :key="id" class="vcur-slot" :class="{ none: !save.stash.currency[id] }" @click="takeCurrency(id, $event.shiftKey ? 1e9 : 20)"
                :draggable="!!save.stash.currency[id]" @dragstart="dragAnyStart($event, { kind: 'stashCur', id })" @dragend="dragAnyEnd" @contextmenu.prevent="takeCurrency(id, 1e9)"
                @mouseenter="hoverThing($event, 'currency', { id, have: save.stash.currency[id] || 0, note: '点一下取出一堆（20 个）· 右键或 Shift 取出能放下的全部' })" @mouseleave="hoverOff">
                <Gi :n="curIcon(id)" c="r-currency"/><em>{{ fmtN(save.stash.currency[id] || 0) }}</em><small>{{ currencies[id].name }}</small></button>
            </div>
          </section>
        </div>
        <footer class="vfoot"><button class="orn-btn primary sm" @click="moveCurrency(null)" :disabled="!curStacks.length">存入背包里全部通货</button><span class="hint">在家洗炼时，背包不够会直接从这页扣。</span></footer>
      </template>
      <!-- legendary page: one slot per legendary, up to 10 copies each -->
      <template v-else-if="vaultTab === 'legend'">
        <div class="vleg" @dragover.prevent @drop.prevent="dropOnLegendPage">
          <button v-for="L in legendaries" :key="L.id" class="vleg-slot" :class="['th-' + L.theme, { none: !legendCount(L.id), on: legendSel === L.id }]" @click="legendSel = legendSel === L.id ? null : L.id"
            @mouseenter="legendCount(L.id) && hoverOn($event, save.stash.legend[L.id][0])" @mouseleave="hoverOff">
            <Gi :n="baseIcon(L.base)" c="r-legendary"/><small>{{ L.name }}</small><em>{{ legendCount(L.id) }}/{{ legendCap }}</em></button>
        </div>
        <section class="vleg-open" v-if="legendSel">
          <h4>{{ legendary(legendSel).name }} <small>{{ legendCount(legendSel) }} / {{ legendCap }} · 右键取回背包</small></h4>
          <div class="grid g10">
            <button v-for="i in legendCap" :key="i" class="cell" :class="legendCells[i - 1] ? 'r-legendary' : 'empty'"
              :draggable="!!legendCells[i - 1]" @dragstart="dragAnyStart($event, { kind: 'legend', it: legendCells[i - 1], legend: legendSel })" @dragend="dragAnyEnd"
              @dragover.prevent @drop.prevent.stop="dropOnLegendPage"
              @contextmenu.prevent="legendCells[i - 1] && fromVault(legendCells[i - 1], { legend: legendSel })"
              @dblclick="legendCells[i - 1] && fromVault(legendCells[i - 1], { legend: legendSel })"
              @mouseenter="legendCells[i - 1] && hoverOn($event, legendCells[i - 1])" @mouseleave="hoverOff">
              <template v-if="legendCells[i - 1]"><Gi :n="itemIcon(legendCells[i - 1])" c="r-legendary"/><b>{{ legendCells[i - 1].tier }}</b></template>
            </button>
          </div>
        </section>
        <p v-else class="hint center">右键背包里的传奇就会放进它自己的格子（每种最多 {{ legendCap }} 件）。点格子看里面的。</p>
      </template>
      <!-- regular pages: 12 x 12 -->
      <template v-else>
        <div class="grid g12" @dragover.prevent @drop.prevent="dropToPage(vaultTab)">
          <button v-for="(it, i) in pageCells" :key="it ? it.uid : 'e' + i" class="cell" :class="it ? ['r-' + rarity(it).id, { on: picked === it }] : 'empty'" :draggable="!!it"
            @dragstart="it && vaultDragStart(it)" @dragend="dragFrom = null" @dragover.prevent @drop.prevent.stop="dropPageCell(i)" @click.exact="it && pick(it)" @click.ctrl.exact="it && fromVault(it, { page: vaultTab })" @click.meta.exact="it && fromVault(it, { page: vaultTab })" @contextmenu.prevent="it && fromVault(it, { page: vaultTab })" @dblclick="it && fromVault(it, { page: vaultTab })"
            @mouseenter="it && hoverOn($event, it)" @mouseleave="hoverOff">
            <template v-if="it"><Gi :n="itemIcon(it)" :c="'r-' + rarity(it).id" :g="glyph[it.slot]"/><b>{{ it.tier }}</b><i v-if="it.skill" class="cell-skill"></i></template>
          </button>
        </div>
        <p class="hint center">常规 {{ vaultTab + 1 }} · {{ save.stash.pages[vaultTab].length }} / {{ pageSize }} · 右键或双击取回背包 · 拖到上面的页签换页</p>
      </template>
    </div>
  </section>

  <!-- right-click menu on bag items -->
  <div class="ctxmenu" v-if="menu" :style="{ left: menu.x + 'px', top: menu.y + 'px' }" @contextmenu.prevent>
    <header>{{ menu.items.length > 1 ? '已选 ' + menu.items.length + ' 件' : itemNameOf(menu.items[0]) }}</header>
    <button v-if="menu.items.length === 1" @click="menuDo('equip')">装备</button>
    <button v-if="open.vault" @click="menuDo('stash')">存入仓库</button>
    <button v-if="menu.items.length === 1" @click="menuDo('craft')">洗炼</button>
    <button v-if="!menu.confirm" class="danger" @click="menuDo('drop')">丢弃{{ menu.items.length > 1 ? '（' + menu.items.length + ' 件）' : '' }}</button>
    <button v-else class="danger sure" @click="menuDo('drop')">确定丢弃？里面有稀有或传奇</button>
  </div>

  <!-- =================== BAG =================== -->
  <section class="win panel win-right" v-if="open.bag" aria-label="背包">
    <header class="win-head"><h2>行 囊</h2><span class="count" :class="{ full: bagLeft <= 0 }">{{ bagSize - bagLeft }} / {{ bagSize }} 格</span><button class="x" @click="open.bag = false" aria-label="关闭">×</button></header>
    <div class="win-body">
      <div class="grid g12" :class="{ dropzone: dragFrom }" @dragover.prevent @drop.prevent="dropToBag">
        <button v-for="(c, i) in bagCells" :key="c ? (c.cur ? 'c' + c.id + i : c.uid) : 'e' + i" class="cell" :class="!c ? 'empty' : c.bagStone ? 'ws-cell w-' + c.rarity : c.cur ? 'cur' : ['r-' + rarity(c).id, { on: picked === c, sel: selected.has(c.uid) }]" :draggable="!!c"
          @dragstart="c && (c.bagStone ? dragAnyStart($event, { kind: 'bagStone', w: c }) : c.sigil ? dragAnyStart($event, { kind: 'bagSigil', id: c.id }) : c.cur ? dragAnyStart($event, { kind: 'bagCur', id: c.id }) : dragStart(c))" @dragend="dragItem = null; dropSlot = null; dragFrom = null; dragAnyEnd()" @dragover.prevent @drop.prevent.stop="dropBagCell(i)"
          @click.exact="c && (c.bagStone ? null : c.sigil ? (atlasOpen && slotScarab(c.id)) : c.cur ? (open.vault && moveCurrency(c.id)) : (selected.clear(), pick(c)))" @click.ctrl.exact="c && ctrlClick(c)" @click.meta.exact="c && ctrlClick(c)"
          @dblclick="c && (c.bagStone ? backToDevice(c) : !c.cur && doEquip(c.uid))" @contextmenu.prevent="c && (c.bagStone ? backToDevice(c) : $event.ctrlKey && $event.button === 0 ? ctrlClick(c) : c.sigil ? (atlasOpen && slotScarab(c.id)) : c.cur ? open.vault && moveCurrency(c.id) : openMenu($event, c))"
          @mouseenter="c && (c.bagStone ? hoverThing($event, 'waystone', { stone: c, note: '双击或右键放回路石背包（地图仪）' }) : c.sigil ? hoverThing($event, 'scarab', { id: c.id, have: save.scarabs[c.id], note: atlasOpen ? '拖到地图仪的槽里，或点一下放进第一个空槽' : '打开图集后拖到地图仪的槽里' }) : c.cur ? hoverThing($event, 'currency', { id: c.id, count: c.n, note: open.vault ? '点一下：这种通货全部存进仓库' : '每格最多 20 个 · 悬停装备按 Ctrl 钉住提示即可在提示里使用' }) : hoverOn($event, c))" @mouseleave="hoverOff">
          <template v-if="c && c.bagStone"><Gi n="stone-tablet" :c="'w-' + c.rarity"/><b>{{ c.tier }}</b></template>
          <template v-else-if="c && c.sigil"><Gi n="star-formation" c="scarab" g="契" :style="{ '--sc': scarabColor(c.id) }"/><em>{{ c.n }}</em></template>
          <template v-else-if="c && c.cur"><Gi :n="curIcon(c.id)" c="r-currency"/><em>{{ c.n }}</em></template>
          <template v-else-if="c"><Gi :n="itemIcon(c)" :c="'r-' + rarity(c).id" :g="glyph[c.slot]"/><b>{{ c.tier }}</b><i v-if="c.skill" class="cell-skill" title="带主动技能"></i></template>
        </button>
      </div>
      <div class="bag-actions" v-if="picked && save.inventory.includes(picked)">
        <span class="sel">{{ itemNameOf(picked) }}</span>
        <button class="orn-btn primary sm" @click="doEquip(picked.uid)">装备</button><button class="orn-btn sm" @click="openCenter('craft')">洗炼</button><button class="orn-btn danger sm" @click="doSalvage(picked.uid)">分解</button>
      </div>
      <p v-else-if="selected.size" class="hint center">已选 {{ selected.size }} 件 · 右键：一起丢弃{{ open.vault ? ' / 存入仓库' : '' }} · Ctrl + 点击：加选 / 取消 · 点空白处取消</p>
      <p v-else-if="open.vault" class="hint center">Ctrl + 点击：快速存进仓库（传奇自动进传奇页）· 右键：菜单 · 点通货：整种存入 · 也可以拖过去</p>
      <p v-else class="hint center">双击装备 · 右键：装备 / 丢弃 · Ctrl + 点击：多选 · 拖到角色装备位 · 悬停按 Ctrl 钉住提示洗炼</p>
      <p class="hint center" v-if="craftMsg">{{ craftMsg }}</p>
    </div>
  </section>

  <!-- =================== CENTER: CRAFT / BD / CODEX =================== -->
  <section class="win panel win-center" v-if="center" :class="'c-' + center" :aria-label="centerName">
    <header class="win-head"><h2>{{ centerTitle }}</h2><button class="x" @click="center = null" aria-label="关闭">×</button></header>
    <div class="win-body">
      <div v-if="center === 'craft'" class="craft" @dragover.prevent @drop.prevent="dropOnCraft">
        <div class="craft-item">
          <item-tip v-if="picked" :item="picked" inline selectable :selected="pickedLine" @line="sel => pickedLine = sel"></item-tip>
          <p v-else class="hint">先在角色或背包里点一件装备。</p>
        </div>
        <div class="craft-side">
          <div class="anvil"><Gi n="anvil" c="el-gold"/></div>
          <p class="craft-sel" v-if="picked">{{ pickedLine ? '已选：' + (pickedLine.kind === 'trait' ? '基底特性' : '随机词条') + ' 第 ' + (pickedLine.index + 1) + ' 条' : '点选一条特性或词条（封印、淬火、精华作用于选中的那条）' }}</p>
          <div class="orbs">
            <button v-for="(c, id) in currencies" :key="id" class="orb-cur" :disabled="!picked || !(save.currencies[id] > 0)" @click="doCraft(id)" @mouseenter="hoverThing($event, 'currency', { id, note: picked ? '点一下用在选中的装备上' : '先在左边选一件装备' })" @mouseleave="hoverOff">
              <Gi :n="curIcon(id)" c="r-currency"/><b>{{ c.name }}</b><em>{{ save.currencies[id] || 0 }}</em><small>{{ c.desc }}</small></button>
          </div>
          <p class="craftlog" v-if="craftMsg" :key="craftMsg">{{ craftMsg }}</p>
        </div>
      </div>

      <div v-if="center === 'bd'" class="bd">
        <ul class="bd-list">
          <li><button :class="{ on: bdSel === 'blank', current: !save.archetype }" @click="bdSel = 'blank'">
            <Gi n="cancel" c="el-gold" g="空"/><b>空白流派</b><small>从零开始自由搭配</small></button></li>
          <li v-for="a in archetypes" :key="a.id"><button :class="{ on: bdSel === a.id, current: save.archetype === a.id }" @click="bdSel = a.id">
            <Gi :n="skillIcon(a.skills[0])" :c="'el-' + skillEl(a.skills[0])"/><b>{{ a.name }}</b><small>{{ a.style }}</small></button></li>
        </ul>
        <div class="bd-detail" v-if="bdSel === 'blank'">
          <h3>空白流派 <small>自由搭配</small></h3>
          <p class="bd-summary">卸下全部装备：你自己的装备放回背包，一键应用的流派装备直接移除；换上一把只有火球的初始法杖，技能栏清空。天赋不受影响（天赋盘里有「全部重置」）。</p>
          <button class="orn-btn primary" @click="clearBd">清空，换成空白流派</button>
        </div>
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

      <div v-if="center === 'quest'" class="questlog">
        <ol class="ql-list">
          <li v-for="(c, i) in chapters" :key="c.id"><button :class="{ on: questSel === i, done: questIndex > i, now: questIndex === i, locked: questIndex < i }" :disabled="questIndex < i" @click="questSel = i">
            <small>第 {{ chapterNo(i) }} 章</small><b>{{ questIndex < i ? '？？？' : c.title }}</b><em>{{ c.tiers }}</em></button></li>
        </ol>
        <article class="ql-body" v-if="chapters[questSel]">
          <small class="story-ch">第 {{ chapterNo(questSel) }} 章 · {{ chapters[questSel].sub }} · {{ chapters[questSel].tiers }}</small>
          <h3>{{ chapters[questSel].title }}</h3>
          <div class="story-text"><p v-for="(t, i) in chapters[questSel].intro" :key="i">{{ t }}</p></div>
          <h4 class="sub">目标</h4>
          <ul class="ql-steps">
            <li v-for="(st, i) in (questSel === questIndex && quest ? quest.steps : chapters[questSel].steps)" :key="i" :class="{ done: questSel < questIndex || st.done }">
              <i></i><span>{{ st.text }}</span><em v-if="questSel === questIndex && st.need > 1 && st.goal.type !== 'tier'">{{ fmtN(st.have) }}/{{ fmtN(st.need) }}</em></li>
          </ul>
          <h4 class="sub">奖励</h4><p class="story-reward">{{ rewardText(chapters[questSel].reward) }}</p>
          <template v-if="questSel < questIndex"><h4 class="sub">后来</h4><div class="story-text"><p v-for="(t, i) in chapters[questSel].outro" :key="i">{{ t }}</p></div></template>
          <button v-if="questSel === questIndex && quest?.complete" class="orn-btn primary" @click="story = { mode: 'outro', index: questIndex }">领取本章奖励</button>
        </article>
        <p v-if="!quest" class="ql-end">星烬纪已经完结。图集还在，继续往外走吧。</p>
      </div>

      <div v-if="center === 'settings'" class="settings">
        <nav class="stabs"><button v-for="t in settingTabs" :key="t[0]" :class="{ on: settingTab === t[0] }" @click="settingTab = t[0]">{{ t[1] }}</button></nav>
        <div class="srows" v-if="settingTab === 'audio'">
          <label class="srow"><span>主音量</span><input type="range" min="0" max="1" step="0.05" v-model.number="opts.master"><b>{{ Math.round(opts.master * 100) }}%</b></label>
          <label class="srow"><span>音效</span><input type="range" min="0" max="1" step="0.05" v-model.number="opts.sfx"><b>{{ Math.round(opts.sfx * 100) }}%</b></label>
          <label class="srow"><span>环境音<small>地图里的低鸣、龙卷风声</small></span><input type="range" min="0" max="1" step="0.05" v-model.number="opts.ambience"><b>{{ Math.round(opts.ambience * 100) }}%</b></label>
          <label class="srow"><span>切到别的窗口时静音</span><input type="checkbox" v-model="opts.muteUnfocused"><b></b></label>
        </div>
        <div class="srows" v-if="settingTab === 'video'">
          <div class="srow"><span>画质预设</span><div class="seg"><button v-for="q in [['low', '低'], ['medium', '中'], ['high', '高']]" :key="q[0]" :class="{ on: opts.quality === q[0] }" @click="setQuality(q[0])">{{ q[1] }}</button></div><b></b></div>
          <label class="srow"><span>渲染分辨率<small>越低越流畅</small></span><input type="range" min="0.5" max="1" step="0.05" v-model.number="opts.resScale"><b>{{ Math.round(opts.resScale * 100) }}%</b></label>
          <label class="srow"><span>阴影</span><input type="checkbox" v-model="opts.shadows"><b></b></label>
          <label class="srow"><span>泛光强度</span><input type="range" min="0" max="1.5" step="0.05" v-model.number="opts.bloom"><b>{{ Math.round(opts.bloom * 100) }}%</b></label>
          <label class="srow"><span>镜头震动</span><input type="range" min="0" max="1.5" step="0.05" v-model.number="opts.shake"><b>{{ Math.round(opts.shake * 100) }}%</b></label>
          <label class="srow"><span>闪屏与色散<small>大爆炸时的白闪、画面边缘的色散</small></span><input type="checkbox" v-model="opts.flashes"><b></b></label>
          <label class="srow"><span>镜头距离</span><input type="range" min="0.75" max="1.35" step="0.05" v-model.number="opts.cameraZoom"><b>{{ Math.round(opts.cameraZoom * 100) }}%</b></label>
        </div>
        <div class="srows" v-if="settingTab === 'game'">
          <label class="srow"><span>伤害数字</span><input type="checkbox" v-model="opts.damageNumbers"><b></b></label>
          <div class="srow"><span>怪物血条</span><div class="seg"><button v-for="q in [['all', '全部'], ['elite', '只看精英和首领'], ['off', '关']]" :key="q[0]" :class="{ on: opts.healthBars === q[0] }" @click="opts.healthBars = q[0]">{{ q[1] }}</button></div><b></b></div>
          <div class="srow"><span>掉落过滤<small>按住 Alt 总是显示全部</small></span><div class="seg"><button v-for="q in [['all', '全部'], ['default', '隐藏普通'], ['rare', '只看稀有以上']]" :key="q[0]" :class="{ on: opts.lootFilter === q[0] }" @click="opts.lootFilter = q[0]">{{ q[1] }}</button></div><b></b></div>
          <label class="srow"><span>走过通货自动拾取</span><input type="checkbox" v-model="opts.autoCurrency"><b></b></label>
          <label class="srow"><span>小地图</span><input type="checkbox" v-model="opts.minimap"><b></b></label>
          <label class="srow"><span>小地图缩放</span><input type="range" min="0.6" max="2" step="0.1" v-model.number="opts.minimapZoom"><b>{{ opts.minimapZoom.toFixed(1) }}×</b></label>
        </div>
        <div class="srows" v-if="settingTab === 'ui'">
          <label class="srow"><span>界面缩放</span><input type="range" min="0.8" max="1.3" step="0.05" v-model.number="opts.uiScale"><b>{{ Math.round(opts.uiScale * 100) }}%</b></label>
          <label class="srow"><span>任务追踪</span><input type="checkbox" v-model="opts.showQuest"><b></b></label>
          <label class="srow"><span>悬停提示</span><input type="checkbox" v-model="opts.showTips"><b></b></label>
        </div>
        <div class="srows keys" v-if="settingTab === 'keys'">
          <div class="srow" v-for="k in keybinds" :key="k[0]"><span>{{ k[0] }}</span><kbd>{{ k[1] }}</kbd><b></b></div>
        </div>
        <footer class="sfoot"><button class="orn-btn ghost sm" @click="resetSettings">恢复默认</button><span class="hint">设置只存在这台电脑的浏览器里，换账号也保留。</span></footer>
      </div>

      <div v-if="center === 'codex'" class="codex">
        <p class="hint">{{ legendaries.length }} 件传奇，每件一条改写玩法的传奇特性；基底其余特性和随机词条照常随机。首领约三分之一几率掉落，精英偶尔掉落。「试玩」直接放一件进背包。</p>
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

  <div class="tipwrap" ref="tipEl" v-show="hover" :class="{ pinned: tipPinned }"><item-tip v-if="hover?.item" :item="hover.item" :compare="hover.compare"
    :stacks="hover.owned ? tipStacks : null" :have="wallet" :pinned="tipPinned" :active="activeCur" :active-idx="activeIdx" :msg="craftMsg" @activate="pickCur" @apply="sel => tipCraft(sel)" @unpin="unpinTip"></item-tip><thing-tip v-else-if="hover" :kind="hover.kind" :data="hover.data"></thing-tip></div>
  <p class="credit">图标 game-icons.net（CC BY 3.0）</p>
</div>`;

export function mountGame(el) {
  const app = createApp({
    components: { ItemTip, ThingTip, Minimap, BigMap, Gi, TalentBoard },
    template: TEMPLATE,
    setup() {
      const save = reactive(loadSave());
      if (!save.quests) save.quests = newQuestState();
      const questKey = ref(0);
      const quest = computed(() => { void questKey.value; void gearKey.value; return questView(save); });
      const questIndex = computed(() => { void questKey.value; return save.quests.chapter; });
      const questSel = ref(Math.min(save.quests.chapter, CHAPTERS.length - 1));
      const story = ref(null), pendingOutro = ref(false);
      const CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
      const chapterNo = i => CN[i] ?? i + 1;
      const fmtN = n => n >= 1000 ? (n / 1000).toFixed(n % 1000 ? 1 : 0) + 'k' : n;
      const rewardText = r => [...Object.entries(r.currencies ?? {}).map(([id, n]) => `${CURRENCIES[id].name} ×${n}`), ...(r.waystones ?? []).map(([t, rar]) => `${{ normal: '普通', magic: '魔法', rare: '稀有' }[rar]}路石 T${t}`)].join('　');
      // Quest notices: a toast per finished step; a finished chapter opens its ending (once the fight is over).
      function questNotes(list) {
        if (!list?.length) return;
        questKey.value++;
        for (const n of list) {
          if (n.type === 'step') { sfx('quest'); toast(`任务完成 · ${n.text}`, 'quest', 'scroll-unfurled', 'el-gold'); }
          else { sfx('chapter'); toast(`第 ${chapterNo(n.index)} 章「${CHAPTERS[n.index].title}」完成`, 'quest big', 'laurel-crown', 'el-gold'); pendingOutro.value = true; }
        }
        showPendingStory();
      }
      function showPendingStory() {
        if (story.value || run.value) return;   // never in a map: chapter endings wait until you are back in camp
        const q = save.quests;
        if (pendingOutro.value && questView(save)?.complete) { story.value = { mode: 'outro', index: q.chapter }; pendingOutro.value = false; sfx('story'); }
        else if (q.chapter < CHAPTERS.length && q.introSeen < q.chapter) { story.value = { mode: 'intro', index: q.chapter }; sfx('story'); }
      }
      function closeStory() { if (story.value?.mode === 'intro') save.quests.introSeen = story.value.index; story.value = null; writeSave(save); questKey.value++; }
      function claimStory() {
        const got = claimChapter(save, rng); story.value = null; questKey.value++;
        if (got) { toast(`得到 ${Object.entries(got.currencies).map(([id, n]) => CURRENCIES[id].name + '×' + n).join('、')}，${got.waystones.length} 块路石`, 'quest', 'locked-chest', 'el-gold'); questSel.value = Math.min(save.quests.chapter, CHAPTERS.length - 1); }
        writeSave(save); nextTick(showPendingStory);
      }
      // ---- settings -------------------------------------------------------------------------------
      const opts = reactive(loadSettings()), settingTab = ref('audio'), mapOpen = ref(false);
      const settingTabs = [['audio', '音频'], ['video', '画面'], ['game', '游戏'], ['ui', '界面'], ['keys', '按键']];
      let focused = true;
      function applySettings() {
        audio.setVolume(opts.muteUnfocused && !focused ? 0 : opts.master); audio.setSfx(opts.sfx); audio.setAmbience(opts.ambience);
        scene?.applySettings({ resScale: opts.resScale, shadows: opts.shadows, bloom: opts.bloom, shake: opts.shake, zoom: 1 / opts.cameraZoom, flashes: opts.flashes });
        if (ov) Object.assign(ov.opts, { damageNumbers: opts.damageNumbers, healthBars: opts.healthBars, lootFilter: opts.lootFilter });
        if (run.value) run.value.autoCurrency = opts.autoCurrency;
        document.documentElement.style.setProperty('--ui', String(opts.uiScale));
      }
      watch(opts, () => { saveSettings({ ...opts }); applySettings(); }, { deep: true });
      onMounted(applySettings);
      const onFocus = v => { focused = v; if (opts.muteUnfocused) applySettings(); };
      const blurF = () => onFocus(false), focusF = () => onFocus(true);
      onMounted(() => { addEventListener('blur', blurF); addEventListener('focus', focusF); }); onBeforeUnmount(() => { removeEventListener('blur', blurF); removeEventListener('focus', focusF); });
      function setQuality(q) { opts.quality = q; Object.assign(opts, QUALITY[q]); }
      function resetSettings() { Object.assign(opts, SETTING_DEFAULTS); }
      const volume = ref(audio.volume);
      function cycleVolume() { const steps = [0, .3, .6, 1], i = steps.findIndex(v => Math.abs(v - volume.value) < .05); audio.setVolume(steps[(i + 1) % steps.length]); volume.value = audio.volume; sfx('click'); }
      const persist = () => { writeSave(save); const n = questTick(save); if (n.length) { questNotes(n); writeSave(save); } };
      const questFire = ev => { questNotes(questEvent(save, ev)); writeSave(save); };
      onMounted(() => setTimeout(showPendingStory, 400));
      const stage = ref(null), overlay = ref(null), tipEl = ref(null), comboEl = ref(null), flashEl = ref(null);
      const open = reactive({ char: false, bag: false, vault: false }), center = ref(null);
      const vaultTab = ref('currency'), legendSel = ref(null), dropTab = ref(null), dragFrom = ref(null), portalRun = shallowRef(null);
      const mapTier = ref(Math.min(save.unlocked, MAP_TIERS)), mapFamily = ref('ruin');
      const picked = ref(null), pickedLine = ref(null), craftMsg = ref(''), roles = ref(null), evaluating = ref(false), updateText = ref('');
      const hover = ref(null), bdSel = ref(save.archetype ?? ARCHETYPES[0].id), toasts = ref([]), legendBanner = ref(null);
      const dragItem = ref(null), dropSlot = ref(null);
      const clearedBanner = ref(false);
      const run = ref(null), resultLoot = reactive({ items: 0, currencies: 0, stones: 0, legend: 0, opened: 0, done: false });
      const hud = reactive({ combo: 0, cascadePct: 0, flashN: 0, tick: 0, time: '0:00', kills: 0, total: 0, life: 0, lifeMax: 1, es: 0, esMax: 0, mana: 0, manaMax: 1, skills: [], selected: 0, resources: [], buffs: [],
        bossShow: false, bossName: '', bossMods: [], bossLife: '100%', bossEs: '0%', bossEnraged: false });
      const rng = dungeonRandom(Date.now() >>> 0);
      let ctrlUsed = false, scene = null, ov = null, raf = 0, last = 0, acc = 0, toastId = 0, seenPicked = 0, seenKills = 0, seenFull = -9, bossXp = false, overflow = 0, seenPortal = 0, seenClear = -1, gsap = null, floating = null, seenLoot = new Set();
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
      const atlasOpen = ref(false), talentOpen = ref(false), wsSel = ref(null);
      if (!save.talents?.allocated) save.talents = { allocated: [] };
      const talentPts = computed(() => talentPoints(save.atlas.done.map(id => atlas.nodes[id])));
      if (!Array.isArray(save.waystones)) {
        const tiers = [...new Set([...atlasView(atlas, save.atlas).open].map(id => atlas.nodes[id].tier).filter(t => t > FREE_TIER))].sort((a, b) => a - b).slice(0, 4);
        save.waystones = starterWaystones(tiers, rng);
      }
      const RANK = { rare: 0, magic: 1, normal: 2 };
      // the waystone bag keeps every stone where it was put (no auto-sort), like every other storage
      const stash = computed(() => save.waystones);
      const freeNode = computed(() => atlas.nodes[atlasSel.value].tier <= FREE_TIER);
      // Any waystone fits any node: the stone's tier is the run's tier.
      const usable = computed(() => stash.value);
      const nearestStone = t => { const up = stash.value.find(w => w.tier >= t); return up ?? stash.value[stash.value.length - 1] ?? null; };
      const stone = computed(() => usable.value.find(w => w.uid === wsSel.value) ?? null);
      // Nodes that need a stone pick the lowest fitting one; free nodes start without one (a stone only raises the tier).
      watch([atlasSel, () => save.waystones.length], () => { if (!usable.value.some(w => w.uid === wsSel.value)) wsSel.value = freeNode.value ? null : nearestStone(atlas.nodes[atlasSel.value].tier)?.uid ?? null; }, { immediate: true });
      const stoneCells = computed(() => { const n = save.waystones.length; return placeGrid(save.waystones, Math.max(12, Math.ceil((n + 1) / 6) * 6)).map(x => x ?? null); });
      function pickStone(w) { wsSel.value = wsSel.value === w.uid && freeNode.value ? null : w.uid; }
      const runTier = computed(() => stone.value ? stone.value.tier : atlas.nodes[atlasSel.value].tier);
      const reachable = computed(() => ['done', 'open'].includes(view.value.status(atlasSel.value)));
      const canStart = computed(() => (!run.value || run.value.phase === 'cleared') && reachable.value && (freeNode.value || !!stone.value));
      const startText = computed(() => run.value && run.value.phase !== 'cleared' ? '先打倒首领或撤离' : !reachable.value ? '尚未连通' : !freeNode.value && !stone.value ? '需要路石' : view.value.status(atlasSel.value) === 'done' ? '再次进入' : '开启地图');
      const waystoneTip = w => [waystoneName(w), ...w.mods.map(m => '· ' + NODE_MODS[m].text)].join('\n');
      function openAtlasFor(w) {
        const near = [...view.value.open, ...view.value.done].map(id => atlas.nodes[id]).sort((a, b) => (view.value.status(a.id) === 'open' ? 0 : 1) - (view.value.status(b.id) === 'open' ? 0 : 1) || Math.abs(a.tier - w.tier) - Math.abs(b.tier - w.tier))[0];
        if (near) { atlasSel.value = near.id; nextTick(() => { wsSel.value = w.uid; }); }
        if (!atlasOpen.value) toggle('atlas');
      }
      // ---- map device: the waystone in the middle, five scarab slots around it ----
      // The five slots are fixed and kept in the save; a sigil moves out of the bag into a slot, and back.
      if (!Array.isArray(save.deviceSlots)) save.deviceSlots = Array(SCARAB_SLOTS).fill(null);
      const deviceSlots = save.deviceSlots;
      const scarabsLeft = computed(() => SCARAB_IDS.map(id => ({ id, n: save.scarabs?.[id] ?? 0 })).filter(x => x.n > 0));
      function slotScarab(id, i = deviceSlots.indexOf(null)) {
        if (!(save.scarabs[id] > 0)) return;
        if (i < 0) { toast('5 个槽都满了：先点一个槽放回背包', 'bad'); return; }
        const old = deviceSlots[i]; save.scarabs[id]--; deviceSlots[i] = id; if (old) save.scarabs[old] = (save.scarabs[old] ?? 0) + 1;
        sfx('click'); hover.value = null; persist();
      }
      function unslotScarab(i) {
        const id = deviceSlots[i]; if (!id) return;
        if (!bagFits(save, { type: 'scarab', id })) { toast('背包满了：先腾出一格', 'bad'); return; }
        save.scarabs[id] = (save.scarabs[id] ?? 0) + 1; deviceSlots[i] = null; sfx('click'); hover.value = null; persist();
      }
      // pentagon positions of the five slots on the 300 × 300 rune circle
      const slotPos = i => { const a = -Math.PI / 2 + i * Math.PI * 2 / 5; return { x: 150 + Math.cos(a) * 124, y: 150 + Math.sin(a) * 124 }; };
      const pentaPoints = [0, 2, 4, 1, 3].map(i => { const p = slotPos(i); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(' ');
      const affixRows = computed(() => {
        const n = selNode.value, rows = [];
        if (n.kind !== 'normal') rows.push({ src: 'kind', tag: NODE_KINDS[n.kind].name, text: NODE_KINDS[n.kind].text });
        for (const m of n.mods) rows.push({ src: 'node', tag: '节点', text: NODE_MODS[m].text });
        for (const m of stone.value?.mods ?? []) rows.push({ src: 'stone', tag: '路石', text: NODE_MODS[m].text });
        for (const id of deviceSlots) if (id) rows.push({ src: 'sigil', tag: '星契', text: scarabText(id), color: scarabColor(id) });
        return rows;
      });
      const totals = computed(() => { const m = selMods.value, x = v => '×' + +v.toFixed(2);
        return [['物品数量', Math.round(m.quantity * 100) + '%', m.quantity !== 1], ['传奇几率', x(m.legend), m.legend !== 1], ['怪群规模', x(m.pack), m.pack !== 1], ['精英', x(m.elite), m.elite !== 1],
          ['通货掉落', x(m.currency), m.currency !== 1], ['路石掉落', x(m.stones), m.stones !== 1], ['星契掉落', x(m.scarabs), m.scarabs !== 1], ['怪物强度', x(m.life * m.damage), m.life * m.damage !== 1]]; });
      const selMods = computed(() => { const n = atlas.nodes[atlasSel.value]; return applyScarabs(nodeMods({ kind: n.kind, mods: [...n.mods, ...(stone.value?.mods ?? [])] }), deviceSlots); });
      // Atlas nodes that move an unfinished "clear" goal of the current chapter forward get a quest mark.
      const questNodes = computed(() => {
        const v = quest.value, out = new Set(); if (!v) return out;
        const goals = v.steps.filter(st => !st.done && st.goal.type === 'clear' && (st.goal.family || st.goal.kind || st.goal.minTier)).map(st => st.goal);
        for (const n of atlas.nodes) { const st = view.value.status(n.id); if (st !== 'open' && st !== 'done') continue;
          if (goals.some(g => (!g.family || g.family === n.family) && (!g.kind || g.kind === n.kind) && (!g.minTier || n.tier >= g.minTier))) out.add(n.id); }
        return out;
      });
      const atlasShown = computed(() => atlas.nodes.map(decorate).filter(n => n.st !== 'hidden')
        .map(n => ({ ...n, quest: questNodes.value.has(n.id), label: n.id === atlasSel.value || n.st === 'open' || questNodes.value.has(n.id) || (n.kind === 'boss' && n.st !== 'seen') })));
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
      // The bag: currency stacks first, then the items, 5 × 12 cells in all.
      // The bag keeps every thing where it was put (no auto-sort): see placeBag.
      const bagCells = computed(() => placeBag(save));
      const bagLeft = computed(() => bagFree(save));
      const pageCells = computed(() => placeGrid(save.stash.pages[vaultTab.value] ?? [], PAGE_SIZE));
      const legendCount = id => save.stash.legend[id]?.length ?? 0;
      const legendCells = computed(() => legendSel.value ? placeGrid(save.stash.legend[legendSel.value] ?? [], LEGEND_CAP) : []);
      const vaultCounts = computed(() => ({ currency: fmtN(Object.values(save.stash.currency).reduce((a, b) => a + b, 0)), legend: Object.values(save.stash.legend).reduce((a, l) => a + l.length, 0), items: save.stash.pages.reduce((a, p) => a + p.length, 0) }));
      /** Currency on hand for crafting: the bag, plus the currency page while at home. */
      const wallet = computed(() => Object.fromEntries(Object.keys(CURRENCIES).map(id => [id, curHave(save, id, !run.value)])));
      const xpNext = computed(() => xpToNext(save.level));
      const centerName = computed(() => PANELS.find(p => p.id === center.value)?.name ?? '');
      const centerTitle = computed(() => ({ quest: '星 烬 纪', craft: '洗 炼', bd: '流 派', codex: '传 奇 图 鉴', settings: '设 置' })[center.value] ?? '');

      function toast(text, cls = '', icon = null, ic = '') { const id = ++toastId; toasts.value.push({ id, text, cls, icon, ic }); if (toasts.value.length > 6) toasts.value.shift(); setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id); }, 3200); }
      // ---- skill bar drag & drop ----
      const dragSkill = ref(null), dropBar = ref(null);
      const skillCards = computed(() => { void gearKey.value; return granted.value.map(id => {
        const slot = SLOTS.find(sl => save.equipped[sl]?.skill === id), k = save.skills.indexOf(id);
        return { id, name: skillName(id), el: EL_CLASS[skillElement(id)], tags: skillTags(id), from: slot ? ' ' + SLOT_NAMES[slot] + ' · ' + itemName(save.equipped[slot]) : '', key: k >= 0 ? k + 1 : null };
      }); });
      const skillGrid = computed(() => { const n = Math.max(10, Math.ceil(skillCards.value.length / 5) * 5); return Array.from({ length: n }, (_, i) => skillCards.value[i] ?? null); });
      function setBar(i, id) {
        const from = id ? save.skills.indexOf(id) : -1;
        if (from >= 0 && from !== i) save.skills[from] = save.skills[i];   // already on the bar: swap places
        save.skills[i] = id;
        gearKey.value++; persist(); if (run.value) run.value.rebuildHero(build());
      }
      function skillDragStart(e, id, fromBar) { if (!id) return; hover.value = null; dragSkill.value = { id, fromBar }; try { e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'move'; } catch {} }
      function skillDragEnd() { dragSkill.value = null; dropBar.value = null; }
      function skillDrop(i) { const d = dragSkill.value; dropBar.value = null; if (d) setBar(i, d.id); }
      function quickBar(id) { if (save.skills.includes(id)) return; const i = save.skills.indexOf(null); setBar(i >= 0 ? i : SKILL_BAR - 1, id); }
      function gearChanged() { syncSkillBar(save); gearKey.value++; roles.value = null; persist(); if (run.value) run.value.rebuildHero(build()); else if (hub.value) hub.value.rebuildHero(build()); }
      function pick(it) { picked.value = it ?? null; pickedLine.value = null; craftMsg.value = ''; }
      function equippedFor(it) { if (!it) return null; if (it.slot.startsWith('ring')) return save.equipped.ring1 ?? save.equipped.ring2; return save.equipped[it.slot]; }
      async function hoverOn(e, it, ground = false) {
        if (!it) { hover.value = null; return; }
        const owned = !ground && (save.inventory.includes(it) || Object.values(save.equipped).includes(it) || (!run.value && inVault(it)));
        return placeTip(e.currentTarget, { item: it, owned, compare: ground || save.inventory.includes(it) ? equippedFor(it) : null });
      }
      /** Non-equipment tooltips: kind 'waystone' { stone, note } · 'currency' { id, have, count } · 'skill' { id }. */
      function hoverThing(e, kind, data) {
        if (!data || dragSkill.value) return;
        if (kind === 'skill') { const card = skillCards.value.find(c => c.id === data.id); data = { ...data, el: EL_CLASS[skillElement(data.id)], info: skillInfo(data.id), key: card?.key ?? data.key ?? null, from: card?.from ?? '' }; }
        if (kind === 'currency' && data.have === undefined) data = { ...data, have: wallet.value[data.id] || 0 };
        return placeTip(e.currentTarget, { kind, data });
      }
      let lastAnchor = null;
      async function placeTip(anchor, value) {
        lastAnchor = anchor;
        if (!opts.showTips && !value?.item) return;   // 悬停提示关掉时，装备提示照常（换装、洗炼要用）
        if (tipPinned.value) return;          // a pinned tooltip stays until it is closed
        hover.value = value;
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
      const hoverOff = () => { if (!tipPinned.value) hover.value = null; };
      // ---- pinned item tooltip: Ctrl pins it, then currency is used right there ----
      const tipPinned = ref(false), activeCur = ref(null), activeIdx = ref(-1);
      function pickCur(a) { activeCur.value = a?.id ?? null; activeIdx.value = a?.i ?? -1; }
      const curStacks = computed(() => currencyStacks(save));
      const tipStacks = computed(() => run.value ? curStacks.value : currencyStacks({ currencies: wallet.value }));
      function pinTip() { if (hover.value?.item && hover.value.owned) { tipPinned.value = true; pickCur(null); craftMsg.value = ''; } }
      function unpinTip() { tipPinned.value = false; pickCur(null); hover.value = null; }
      function tipCraft(sel) {
        const it = hover.value?.item, id = activeCur.value; if (!it || !id) return;
        const r = craft(save, it, id, rng, sel, !run.value);
        craftMsg.value = r.message;
        sfx(r.ok ? 'craft' : 'craftFail', { kind: id });
        if (r.ok) {
          questFire({ type: 'craft' });
          if (Object.values(save.equipped).includes(it)) gearChanged(); else persist();
          // keep the highlight on one cell: the same slot if it is still this currency, else its last stack
          if (!(wallet.value[id] > 0)) pickCur(null);
          else if (tipStacks.value[activeIdx.value]?.id !== id) activeIdx.value = tipStacks.value.map(st => st.id).lastIndexOf(id);
          nextTick(() => gsap?.fromTo('.tipwrap .itip', { filter: 'brightness(1.7)' }, { filter: 'brightness(1)', duration: .45, ease: 'power2.out' }));
        }
      }
      function doEquip(uid, slot = null) {
        const at = save.inventory.findIndex(it => it.uid === uid), anchor = lastAnchor, n = save.inventory.length;
        if (!equip(save, uid, slot)) return;
        const swapped = save.inventory.length === n;
        hover.value = null; sfx('equip'); questFire({ type: 'equip' }); gearChanged();
        // The old piece now sits in the same cell: select it and show its tooltip there, so it can be swapped straight back.
        const back = save.inventory[at];
        picked.value = swapped && at >= 0 ? back : null;
        if (picked.value && anchor?.isConnected) nextTick(() => hoverOn({ currentTarget: anchor }, picked.value));
      }
      function doUnequip(s) { if (!save.equipped[s]) return; if (!unequip(save, s)) { toast('背包满了：先腾出一格', 'bad'); return; } sfx('unequip'); picked.value = null; hover.value = null; gearChanged(); }
      // ---- bag: multi-select (Ctrl + click), quick move to the stash, right-click menu ----
      const selected = reactive(new Set()), menu = ref(null);
      const bagItem = uid => save.inventory.find(it => it.uid === uid);
      function ctrlClick(c) {
        hover.value = null; if (tipPinned.value) unpinTip(); ctrlUsed = true;
        if (c.cur) { if (open.vault) moveCurrency(c.id); return; }
        if (open.vault) {
          // with the stash open, Ctrl + click moves it (and everything selected with it) straight in
          const list = selected.has(c.uid) ? [...selected].map(bagItem).filter(Boolean) : [c];
          selected.clear(); for (const it of list) toVault(it);
          return;
        }
        if (selected.has(c.uid)) selected.delete(c.uid); else selected.add(c.uid);
        if (picked.value === c) picked.value = null;
      }
      function openMenu(e, c) {
        hover.value = null; if (tipPinned.value) unpinTip();
        const items = selected.has(c.uid) && selected.size > 1 ? [...selected].map(bagItem).filter(Boolean) : [c];
        if (!selected.has(c.uid)) selected.clear();
        menu.value = { x: Math.min(e.clientX, innerWidth - 190), y: Math.min(e.clientY, innerHeight - 200), items, confirm: false };
      }
      function menuDo(what) {
        const m = menu.value; if (!m) return;
        if (what === 'equip') { menu.value = null; doEquip(m.items[0].uid); return; }
        if (what === 'craft') { menu.value = null; pick(m.items[0]); openCenter('craft'); return; }
        if (what === 'stash') { menu.value = null; selected.clear(); for (const it of m.items) toVault(it); return; }
        if (what === 'drop') {
          const precious = m.items.some(it => it.legend || ['rare', 'exalted', 'legendary'].includes(rarityOf(it).id));
          if (precious && !m.confirm) { m.confirm = true; return; }
          for (const it of m.items) { const i = save.inventory.indexOf(it); if (i >= 0) save.inventory.splice(i, 1); if (picked.value === it) picked.value = null; }
          selected.clear(); menu.value = null; hover.value = null; sfx('unequip'); persist();
          toast(`丢弃了 ${m.items.length} 件`, '');
        }
      }
      const closeMenu = e => { if (menu.value && !e.target.closest?.('.ctxmenu')) menu.value = null; if (selected.size && e.button === 0 && !e.ctrlKey && !e.metaKey && !e.target.closest?.('.cell, .ctxmenu')) selected.clear(); };
      onMounted(() => addEventListener('mousedown', closeMenu, true)); onBeforeUnmount(() => removeEventListener('mousedown', closeMenu, true));
      watch(() => open.bag, v => { if (!v) { selected.clear(); menu.value = null; } });
      // ---- stash ----
      const inVault = it => save.stash.pages.some(p => p.includes(it)) || Object.values(save.stash.legend).some(l => l.includes(it));
      function toVault(it, page = typeof vaultTab.value === 'number' ? vaultTab.value : 0) {
        if (picked.value === it) picked.value = null;
        let got = deposit(save, it.uid, page);
        // the chosen page is full: try the others
        for (let k = 0; !got && k < PAGES; ++k) got = deposit(save, it.uid, k);
        if (!got) { toast('仓库的常规页都满了', 'bad'); return; }
        hover.value = null; sfx('unequip'); persist();
        if (got === 'legend' && vaultTab.value === 'legend') legendSel.value = it.legend;
      }
      function fromVault(it, where) {
        if (!withdraw(save, it.uid, where)) { toast('背包满了：先腾出一格', 'bad'); return; }
        if (picked.value === it) picked.value = null;
        hover.value = null; sfx('pickup', { rarity: rarityOf(it).id }); persist();
      }
      function moveCurrency(id) { const n = depositCurrency(save, id); if (n) { hover.value = null; sfx('coin'); persist(); toast(`存入 ${n} 个通货`, 'cur', 'locked-chest', 'r-currency'); } }
      function takeCurrency(id, n) { const got = withdrawCurrency(save, id, n); if (!got) { toast(save.stash.currency[id] ? '背包满了：先腾出一格' : `仓库里没有${CURRENCIES[id].name}`, 'bad'); return; } sfx('coin'); persist(); }
      function vaultDragStart(it) { dragFrom.value = { it, page: vaultTab.value }; hover.value = null; }
      // ---- drag & drop beyond bag items: equipped gear, currency, legendaries, waystones, scarabs ----
      const dragAny = ref(null), dropDev = ref(null);
      function dragAnyStart(e, d) { dragAny.value = d; hover.value = null; if (tipPinned.value) unpinTip(); try { e.dataTransfer.setData('text/plain', d.kind); e.dataTransfer.effectAllowed = 'move'; } catch { /* old browsers */ } }
      function dragAnyEnd() { dragAny.value = null; dropDev.value = null; }
      const takeAny = () => { const d = dragAny.value; dragAny.value = null; dropDev.value = null; return d; };
      /** Something dragged onto the bag (cell i, or anywhere when i is null). */
      function dropAnyOnBag(d, i = null) {
        if (!d) return false;
        if (d.kind === 'equipped') {
          if (!save.equipped[d.slot]) return true;
          if (i !== null && bagCells.value[i] && !bagCells.value[i].cur) { doEquip(bagCells.value[i].uid, d.slot); return true; }   // onto an item: swap
          const it = save.equipped[d.slot]; doUnequip(d.slot); if (i !== null && save.inventory.includes(it) && !bagCells.value[i]) { it.cell = i; persist(); }
          return true;
        }
        if (d.kind === 'slot') { unslotScarab(d.i); return true; }
        if (d.kind === 'stone') { stoneOut(d.w, i !== null && !bagCells.value[i] ? i : null); return true; }
        if (d.kind === 'core') { if (stone.value) stoneOut(stone.value, i !== null && !bagCells.value[i] ? i : null); return true; }
        if (d.kind === 'bagStone') { if (i !== null && moveInBag(save, d.w, i)) persist(); return true; }
        if (d.kind === 'bagSigil') return true;
        if (d.kind === 'stashCur') { takeCurrency(d.id, 20); return true; }
        if (d.kind === 'legend') { fromVault(d.it, { legend: d.legend }); if (i !== null && save.inventory.includes(d.it) && !bagCells.value[i]) { d.it.cell = i; persist(); } return true; }
        return d.kind === 'bagCur';
      }
      function dropOnCurrencyPage() {
        const d = takeAny(), it = dragItem.value; dragItem.value = null;
        if (d?.kind === 'bagCur') moveCurrency(d.id);
        else if (it && save.inventory.includes(it)) toVault(it, 0);
      }
      function dropOnLegendPage() {
        const it = dragItem.value; dragItem.value = null; takeAny();
        if (!it || !save.inventory.includes(it)) return;
        if (!it.legend) { toast('传奇页只放传奇', 'bad'); return; }
        toVault(it); legendSel.value = it.legend;
      }
      function stoneOut(w, cell = null) {
        if (!stoneToBag(save, w.uid, cell)) { toast('背包满了：先腾出一格', 'bad'); return; }
        if (wsSel.value === w.uid) wsSel.value = null;
        hover.value = null; sfx('stoneDrop'); persist();
      }
      function backToDevice(w) { if (stoneToDevice(save, w.uid)) { hover.value = null; sfx('stoneDrop'); persist(); } }
      function dropOnCore() {
        const d = takeAny(); if (!d) return;
        if (d.kind === 'bagStone') { backToDevice(d.w); if (d.w.uid !== wsSel.value) pickStone(d.w); }
        else if (d.kind === 'stone' && d.w.uid !== wsSel.value) pickStone(d.w);
      }
      function dropOnStoneCell(i) {
        const d = takeAny(); if (!d) return;
        if (d.kind === 'stone') { const there = stoneCells.value[i]; if (there === d.w) return; if (there) there.cell = d.w.cell; d.w.cell = i; persist(); }
        else if (d.kind === 'bagStone') { backToDevice(d.w); if (!stoneCells.value[i]) { d.w.cell = i; persist(); } }
        else if (d.kind === 'core' && stone.value) pickStone(stone.value);
      }
      function dropOnStones() { const d = takeAny(); if (d?.kind === 'core' && stone.value) pickStone(stone.value); else if (d?.kind === 'bagStone') backToDevice(d.w); }
      function dropOnSlot(i) {
        const d = takeAny(); if (!d) return;
        if (d.kind === 'scarab' || d.kind === 'bagSigil') slotScarab(d.id, i);
        else if (d.kind === 'slot' && d.i !== i) { const t = deviceSlots[i]; deviceSlots[i] = deviceSlots[d.i]; deviceSlots[d.i] = t; sfx('click'); }
      }
      function dropOnScarabs() { const d = takeAny(); if (d?.kind === 'slot') unslotScarab(d.i); }
      function dropOnCraft() {
        const it = dragItem.value ?? (dragAny.value?.kind === 'equipped' ? save.equipped[dragAny.value.slot] : null); dragItem.value = null; takeAny();
        if (it) { pick(it); craftMsg.value = ''; }
      }
      function dropBagCell(i) {
        if (dropAnyOnBag(takeAny(), i)) return;
        const it = dragItem.value, d = dragFrom.value; dragItem.value = null; dragFrom.value = null;
        if (it && moveInBag(save, it, i)) { persist(); return; }
        if (d && !bagCells.value[i]) { fromVault(d.it, { page: d.page }); d.it.cell = i; persist(); }
        else if (d) fromVault(d.it, { page: d.page });
      }
      function dropPageCell(i) {
        const d = dragFrom.value; if (!d || d.page !== vaultTab.value || dragItem.value) return dropToPage(vaultTab.value);
        dragFrom.value = null; const there = pageCells.value[i];
        if (there === d.it) return;
        if (there) there.cell = d.it.cell; d.it.cell = i; persist();
      }
      function dropToBag() { if (dropAnyOnBag(takeAny())) return; const d = dragFrom.value; dragFrom.value = null; if (d) fromVault(d.it, { page: d.page }); }
      function dropToPage(k) {
        const it = dragItem.value, d = dragFrom.value; dragItem.value = null; dragFrom.value = null;
        if (it && save.inventory.includes(it)) toVault(it, k);
        else if (d && d.page !== k && save.stash.pages[k].length < PAGE_SIZE) { const pg = save.stash.pages[d.page]; pg.splice(pg.indexOf(d.it), 1); save.stash.pages[k].push(d.it); persist(); }
      }
      // ---- home: a safe little dungeon with NPCs, the stash and the map device ----
      const hub = shallowRef(null), hubTick = ref(0);
      let seenArrivals = 0, seenHubPortal = 0, hubLoop = false;
      function ensureScene() { if (!scene) { scene = new Scene3D(stage.value); ov = new Overlay(overlay.value); bindLabels(overlay.value); globalThis.__dw.scene = scene; } applySettings(); }
      function enterHub(fresh = false) {
        if (!hub.value || fresh) { hub.value = markRaw(new MapRun(build(), { hub: true, seed: 20261104 })); seenArrivals = 0; seenHubPortal = 0; }
        else { hub.value.rebuildHero(build()); const d = hub.value.dungeon, c = d.tileCenter(Math.floor(d.rooms[1].centerX), Math.floor(d.rooms[1].centerY) - 2); hub.value.hero.x = c.x; hub.value.hero.y = c.y; hub.value.walkTo = null; }
        nextTick(() => { if (!stage.value) return; ensureScene(); ov?.clearLoot(); last = performance.now(); acc = 0; cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); });
      }
      onMounted(() => { if (!run.value) enterHub(true); });
      /** Arrived at an NPC / the stash: say something, open their panel. */
      function openStation(st) {
        if (st.kind === 'npc') { const line = st.lines[Math.floor(Math.random() * st.lines.length)]; toast(`${st.title}·${st.name}：${line}`, 'quest', null); sfx('open'); }
        const p = st.panel;
        if (p === 'vault') { if (!open.vault) toggle('vault'); }
        else if (p === 'talents' || p === 'atlas') { if (!isOpen(p)) toggle(p); }
        else openCenter(p);
      }
      function hubFrame(r, now) {
        const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = Math.max(last, now); acc += dt;
        const mx = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0), my = (keys.has('w') ? 1 : 0) - (keys.has('s') ? 1 : 0);
        if (mx || my) r.walkTo = null;
        r.setMove(mx, my);
        const at = scene.pick(mouse.x, mouse.y); if (at) r.setAim(at.x, at.y);
        r.setCasting(false);
        while (acc >= 1 / 60) { r.step(1 / 60); acc -= 1 / 60; }
        if (r.portalReached > seenHubPortal) { seenHubPortal = r.portalReached; if (!atlasOpen.value) toggle('atlas'); }
        if (r.arrivals > seenArrivals) { seenArrivals = r.arrivals; openStation(r.arrived); }
        scene.update(r, now / 1000); ov.update(scene, r);
        if (Math.round(now / 100) % 2 === 0) hubTick.value++;
        raf = requestAnimationFrame(frame);
      }
      // ---- town portal: the map stays open while you are home ----
      function portalHome() {
        const r = run.value; if (!r || r.phase === 'failed') return;
        if (r.phase === 'cleared') { leaveRun(); return; }
        for (; seenPicked < r.pickedUp.length; ++seenPicked) bank(r.pickedUp[seenPicked]);
        persist(); sfx('portal');
        cancelAnimationFrame(raf); hover.value = null; mouse.down = false; keys.clear(); setLoop('drone', 0); setLoop('wind', 0);
        portalRun.value = r; run.value = null; gearKey.value++; enterHub();
        toast('回到家了：地图还开着，左下角的传送门（T）带你回去', 'good', 'magic-portal', 'el-gold');
        nextTick(showPendingStory);
      }
      function portalBack() {
        const r = portalRun.value; if (!r) return;
        portalRun.value = null; open.vault = false; atlasOpen.value = talentOpen.value = false; center.value = null; hover.value = null;
        r.rebuildHero(build()); sfx('portal');
        run.value = r;
        nextTick(() => { stage.value.focus(); last = performance.now(); acc = 0; cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); });
      }
      function dragStart(it) { dragItem.value = it; hover.value = null; }
      function dropOn(s) {
        const it = dragItem.value, d = dragAny.value, f = dragFrom.value; dropSlot.value = null; dragItem.value = null; dragFrom.value = null; takeAny();
        if (it) { doEquip(it.uid, s); return; }
        const ring = x => x === 'ring1' || x === 'ring2';
        if (d?.kind === 'equipped' && d.slot !== s && ring(d.slot) && ring(s)) { const t = save.equipped[s]; save.equipped[s] = save.equipped[d.slot] && { ...save.equipped[d.slot], slot: s }; save.equipped[d.slot] = t && { ...t, slot: d.slot }; gearChanged(); return; }
        // from the stash or the legendary page: take it out, then put it on
        const from = f ? { it: f.it, where: { page: f.page } } : d?.kind === 'legend' ? { it: d.it, where: { legend: d.legend } } : null;
        if (from && withdraw(save, from.it.uid, from.where)) doEquip(from.it.uid, s);
        else if (from) toast('背包满了：先腾出一格', 'bad');
      }
      function doSalvage(uid) { const g = salvage(save, uid, rng); if (picked.value?.uid === uid) picked.value = null; hover.value = null; craftMsg.value = g ? `分解得到 ${CURRENCIES[g].name}` : '已分解'; persist(); }
      function doCraft(id) {
        const r = craft(save, picked.value, id, rng, pickedLine.value, !run.value);
        craftMsg.value = r.message; sfx(r.ok ? 'craft' : 'craftFail', { kind: id }); if (!r.ok) return;
        questFire({ type: 'craft' });
        if (Object.values(save.equipped).includes(picked.value)) gearChanged(); else persist();
        nextTick(() => gsap?.fromTo('.craft .itip', { scale: 1.03, filter: 'brightness(1.6)' }, { scale: 1, filter: 'brightness(1)', duration: .45, ease: 'power2.out' }));
      }
      function applyBd(id, i) {
        applyArchetype(save, id, i); save.bdStage = i;
        picked.value = null; hover.value = null;
        gearChanged();
        toast(`已换上 ${ARCHETYPES.find(x => x.id === id).name} · ${STAGES[i].name}`, 'good');
      }
      const accountName = globalThis.__account?.name ?? '本机';
      function leaveAccount() { persist(); switchAccount(); }
      function clearBd() {
        clearArchetype(save); picked.value = null; hover.value = null; gearChanged();
        toast('已换成空白流派：装备已卸下，从零开始', 'good');
      }
      function grantLegendary(id) {
        const tier = Math.max(3, Math.min(10, Math.round(save.unlocked * 10 / 16) + 1));
        const it = rollLegendary(id, tier, rng); save.inventory.push(it); persist();
        toast(`传奇 · ${legendary(id).name} 已放入背包`, 'r-legendary', BASE_ICON[legendary(id).base], 'r-legendary');
        open.bag = true; pick(it);
      }
      async function evaluate() {
        evaluating.value = true; await nextTick(); await new Promise(r => setTimeout(r, 30));
        try { roles.value = roleReport(content, build(), mapTier.value); } finally { evaluating.value = false; }
      }
      async function update() { await runSelfUpdate(t => { updateText.value = t; }); }
      const isOpen = id => id === 'talents' ? talentOpen.value : id === 'atlas' ? atlasOpen.value : id === 'char' || id === 'bag' || id === 'vault' ? open[id] : center.value === id;
      function toggle(id) {
        sfx(isOpen(id) ? 'close' : 'open');
        hover.value = null;
        if (id === 'talents') { talentOpen.value = !talentOpen.value; if (talentOpen.value) { atlasOpen.value = false; center.value = null; open.char = open.bag = false; } return; }
        if (id === 'atlas') { atlasOpen.value = !atlasOpen.value; if (atlasOpen.value) { talentOpen.value = false; center.value = null; open.char = false; open.vault = false; open.bag = true; nextTick(() => { centerAtlas(); gsap?.fromTo('.atlas-win', { opacity: 0 }, { opacity: 1, duration: .35, ease: 'power2.out' }); }); } return; }
        if (id === 'vault') {
          if (run.value && !open.vault) { toast('仓库在家里：按 T 传送回家', 'bad'); return; }
          open.vault = !open.vault; if (open.vault) { open.char = false; open.bag = true; atlasOpen.value = talentOpen.value = false; center.value = null; }
        } else if (id === 'char' || id === 'bag') { open[id] = !open[id]; if (open[id]) { talentOpen.value = false; if (id === 'char') atlasOpen.value = false; } if (id === 'char' && open.char) open.vault = false; } else { center.value = center.value === id ? null : id; if (center.value) atlasOpen.value = talentOpen.value = false; }
        nextTick(() => { const sel = id === 'char' || id === 'vault' ? '.win-left' : id === 'bag' ? '.win-right' : '.win-center'; if (isOpen(id)) gsap?.fromTo(sel, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: .28, ease: 'power3.out', clearProps: 'transform' }); });
      }
      function openCenter(id) { if (center.value !== id) toggle(id); }

      // ---- run lifecycle ----------------------------------------------------------------------
      function startRun() {
        if (portalRun.value) { run.value = portalRun.value; portalRun.value = null; leaveRun(); }
        if (!buildOf(save).skills.length) { open.char = true; toast('技能栏是空的：装备一件带主动技能的装备（武器都带）', 'bad'); return; }
        if (run.value) {
          // Leaving through the boss portal: bank the finished map, keep the node the player just picked.
          if (run.value.phase !== 'cleared') { toast('先打倒首领，或者撤离当前地图', 'bad'); return; }
          const sel = atlasSel.value; leaveRun(); atlasSel.value = sel;
        }
        const node = atlas.nodes[atlasSel.value], st = view.value.status(node.id);
        if (st !== 'done' && st !== 'open') { toast('这个节点还没连通：先打通与它相连的地图', 'bad'); return; }
        if (!freeNode.value && !stone.value) { toast('需要一块路石（任意阶都行）', 'bad'); return; }
        const used = stone.value, tier = runTier.value, mods = selMods.value;
        if (used) save.waystones.splice(save.waystones.findIndex(w => w.uid === used.uid), 1);
        // the slotted scarabs are used up with the map
        for (let i = 0; i < deviceSlots.length; ++i) deviceSlots[i] = null;
        persist(); atlasOpen.value = false; talentOpen.value = false;
        const r = new MapRun(build(), { tier, family: node.family, mods, seed: (Date.now() ^ (Math.random() * 1e9)) >>> 0 });
        r.node = node.id; r.canTake = d => bagFits(save, d); r.autoCurrency = opts.autoCurrency; mapOpen.value = false;
        run.value = markRaw(r); open.char = open.bag = open.vault = false; seenKills = 0; seenFull = -9; bossXp = false; center.value = null; seenPicked = 0; seenClear = -1; seenLoot = new Set(); seenPortal = 0; clearedBanner.value = false;
        Object.assign(resultLoot, { items: 0, currencies: 0, stones: 0, legend: 0, opened: 0, done: false });
        ov?.clearLoot();
        nextTick(() => {
          ensureScene();
          stage.value.focus();
          last = performance.now(); acc = 0;
          cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
          gsap?.from('.dock, .plate, .minimap', { opacity: 0, y: 20, duration: .5, stagger: .06, ease: 'power3.out', clearProps: 'transform,opacity' });
        });
      }
      function leaveRun() {
        const r = run.value; if (!r) return;
        // Picked-up loot is already in the bag (see frame()); a cleared map also hands over what is still on the floor.
        if (r.phase !== 'failed') r.collectAll();
        overflow = 0;
        for (; seenPicked < r.pickedUp.length; ++seenPicked) bank(r.pickedUp[seenPicked]);
        if (overflow) toast(`背包满了：${overflow} 件战利品直接送进了仓库`, 'good', 'locked-chest', 'el-gold');
        save.stats.kills += r.kills;
        questFire({ type: 'kills', n: r.kills });
        persist();
        cancelAnimationFrame(raf); ov?.clearLoot(); hover.value = null; setLoop('drone', 0); setLoop('wind', 0);
        run.value = null; roles.value = null; gearKey.value++; nextTick(showPendingStory);
        if (r.phase === 'cleared') atlasSel.value = firstNear(r.node);
        enterHub();
      }
      // Everything picked up goes straight into the save, so the bag shows it during the run too.
      function bank(d) {
        sfx(d.type === 'item' ? 'pickup' : d.type === 'waystone' || d.type === 'scarab' ? 'stoneDrop' : 'coin', d.type === 'item' ? { rarity: rarityOf(d.item).id } : {});
        if (d.type === 'item') questFire({ type: 'pickup', item: d.item });
        // Loot handed over at the end of a map can overflow a full bag: it goes to the stash instead.
        if (d.type === 'item') { if (bagFree(save) > 0) save.inventory.push(d.item); else { toBag(save, d.item); overflow++; } }
        else if (d.type === 'waystone') save.waystones.push(d.stone);
        else if (d.type === 'scarab') save.scarabs[d.id] = (save.scarabs[d.id] ?? 0) + 1;
        else if (bagFits(save, d)) save.currencies[d.id] = (save.currencies[d.id] || 0) + d.count;
        else { save.stash.currency[d.id] = (save.stash.currency[d.id] || 0) + d.count; overflow++; } }
      function frame(now) {
        if (!run.value && hub.value && scene) { hubFrame(hub.value, now); return; }
        const r = run.value; if (!r) return;
        // A frame queued before the run started can carry an older timestamp: never step backwards.
        const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = Math.max(last, now); acc += dt;
        const mx = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0), my = (keys.has('w') ? 1 : 0) - (keys.has('s') ? 1 : 0);
        r.setMove(mx, my);
        const at = scene.pick(mouse.x, mouse.y); if (at) r.setAim(at.x, at.y);
        r.setCasting(mouse.down && r.phase === 'running');
        while (acc >= 1 / 60) { r.step(1 / 60); acc -= 1 / 60; }
        if (r.portalReached > seenPortal) {
          seenPortal = r.portalReached;
          if (!atlasOpen.value) { atlasSel.value = firstNear(r.node); toggle('atlas'); }
        }
        for (const l of r.loot) {
          if (seenLoot.has(l.key)) continue;
          seenLoot.add(l.key);
          { const d = l.drop, h = r.hero, at = { pan: Math.max(-.8, Math.min(.8, (l.x - h.x) / 900)) };
            if (d.type === 'waystone') sfx('stoneDrop', at);
            else if (d.type === 'item') { const rid = rarityOf(d.item).id, bl = baseLinesOf(d.item); sfx('drop', { ...at, tier: d.item.legend || rid === 'exalted' || bl >= 3 ? 4 : rid === 'rare' ? 3 : rid === 'magic' || bl === 2 ? 2 : 1 }); }
            else if (d.id === 'chaos' || d.id === 'seal' || d.id.startsWith('essence') || d.id === 'skill_gem') sfx('drop', { ...at, tier: 2 }); }
          if (l.drop.item?.legend) { legendBanner.value = { id: l.key, name: itemName(l.drop.item) }; setTimeout(() => { if (legendBanner.value?.id === l.key) legendBanner.value = null; }, 2600); }
        }
        if (r.kills > seenKills || (!bossXp && r.boss && !r.boss.alive)) {
          let xp = killXp(r.tier) * (r.kills - seenKills); seenKills = r.kills;
          if (!bossXp && r.boss && !r.boss.alive) { bossXp = true; xp += killXp(r.tier, 'boss'); }
          const up = gainXp(save, xp);
          if (up) { sfx('chapter'); toast(`升到 ${save.level} 级`, 'quest big', 'laurel-crown', 'el-gold'); persist(); }
        }
        if (r.fullAt > seenFull) { seenFull = r.fullAt; toast('背包满了：回家（T）把东西存进仓库', 'bad'); sfx('craftFail'); }
        if (seenPicked < r.pickedUp.length) queueMicrotask(persist);
        for (; seenPicked < r.pickedUp.length; ++seenPicked) {
          const d = r.pickedUp[seenPicked]; bank(d);
          if (d.type === 'item') {
            const rr = rarityOf(d.item);
            const bl = baseLinesOf(d.item);
            toast(`${bl > 1 ? '◆'.repeat(bl) + ' ' : ''}${rr.name} · ${itemName(d.item)}`, `r-${rr.id} b${bl}`, itemIcon(d.item), 'r-' + rr.id);
          } else if (d.type === 'waystone') toast(waystoneName(d.stone), 'w-' + d.stone.rarity, 'stone-tablet', 'w-' + d.stone.rarity);
          else if (d.type === 'scarab') toast(scarabName(d.id), 'cur', 'star-formation', 'r-currency');
          else toast(CURRENCIES[d.id].name, 'cur', CURRENCY_ICON[d.id], 'r-currency');
        }
        if (r.phase !== 'running' && !resultLoot.done) {
          resultLoot.done = true;
          const loot = r.phase === 'cleared' ? [...r.pickedUp, ...r.loot.map(l => l.drop)] : r.pickedUp;
          resultLoot.items = loot.filter(d => d.type === 'item').length; resultLoot.currencies = loot.filter(d => d.type === 'currency').length; resultLoot.stones = loot.filter(d => d.type === 'waystone').length;
          resultLoot.legend = loot.filter(d => d.item?.legend).length;
          if (r.phase === 'cleared') {
            save.unlocked = Math.min(MAP_TIERS, Math.max(save.unlocked, r.tier + 1)); save.stats.maps++;
            if (r.node != null) resultLoot.opened = completeNode(atlas, save.atlas, r.node);
            const qn = atlas.nodes[r.node] ?? {};
            questFire({ type: 'clear', tier: r.tier, family: qn.family, kind: qn.kind });
            persist();
            setTimeout(() => sfx('portal'), 900);
            clearedBanner.value = true; setTimeout(() => { if (run.value === r) clearedBanner.value = false; }, 7000);
          }
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
        root.addEventListener('mousedown', e => {
          const el = e.target.closest('.lt'); if (!el || e.button !== 0) return;
          e.stopPropagation(); e.preventDefault();
          const w = run.value ?? hub.value;
          if (el.classList.contains('lt-station')) hub.value?.walkToStation(el.dataset.station);
          else if (el.classList.contains('lt-portal')) w?.walkToPortal(); else w?.walkToLoot(el.dataset.key);
          hover.value = null;
        });
      }

      const onKey = (e, down) => {
        if (e.target.closest?.('select, input')) return;
        const k = e.key.toLowerCase();
        if (k === 'alt') { if (ov) ov.showAll = down; e.preventDefault(); return; }
        // Ctrl pins the item tooltip when it is let go without a click in between (Ctrl + click is quick move / multi-select)
        if (k === 'control' || k === 'meta') { if (down && !e.repeat) ctrlUsed = false; else if (!down && !ctrlUsed) { if (tipPinned.value) unpinTip(); else pinTip(); } return; }
        if (k === 'escape' && down && tipPinned.value) { unpinTip(); return; }
        if (k === 'escape' && down && (menu.value || selected.size)) { menu.value = null; selected.clear(); return; }
        if (['w', 'a', 's', 'd'].includes(k)) { if (down) keys.add(k); else keys.delete(k); e.preventDefault(); return; }
        if (!down) return;
        if (/^[1-4]$/.test(k)) selectSkill(+k - 1);
        if (k === 't') { if (run.value) portalHome(); else portalBack(); }
        if (k === 'tab') { e.preventDefault(); if (run.value || hub.value) mapOpen.value = !mapOpen.value; return; }
        const p = PANELS.find(p => p.key.toLowerCase() === k); if (p) toggle(p.id);
        if (k === 'escape') {
          if (mapOpen.value) { mapOpen.value = false; return; }
          if (talentOpen.value || atlasOpen.value || open.char || open.bag || open.vault || center.value) { talentOpen.value = false; atlasOpen.value = false; open.char = open.bag = open.vault = false; center.value = null; hover.value = null; }
          else if (run.value && run.value.phase === 'failed') leaveRun();
          else openCenter('settings');   // nothing open: Esc is the game menu
        }
      };
      const kd = e => onKey(e, true), ku = e => onKey(e, false);
      const mm = e => { const rect = stage.value?.getBoundingClientRect(); if (rect) { mouse.x = e.clientX - rect.left; mouse.y = e.clientY - rect.top; } };
      const md = e => {
        if (e.button === 0 && !run.value && hub.value && scene && e.target.closest('.stage')) {
          // Home: click an NPC / the stash / the map device to walk there and use it; anywhere else to walk.
          const h = hub.value, at = scene.pick(mouse.x, mouse.y); if (!at) return;
          const st = h.stations.find(s => Math.hypot(at.x - s.x, at.y - s.y) < (s.id === 'device' ? 160 : 110));
          if (st) h.walkToStation(st.id); else h.walkToPoint(at.x, at.y);
          return;
        }
        if (e.button !== 0 || !run.value || !e.target.closest('.stage')) return;
        // A click on the portal walks there instead of casting.
        const r = run.value, at = r.portal && scene?.pick(mouse.x, mouse.y);
        if (at && Math.hypot(at.x - r.portal.x, at.y - r.portal.y) < 120) { r.walkToPortal(); return; }
        mouse.down = true;
      };
      const mu = e => { if (e.button === 0) mouse.down = false; };
      const rs = () => { scene?.resize(); viewSize.w = innerWidth; viewSize.h = innerHeight; };
      // A click anywhere outside a pinned tooltip closes it.
      const uiClick = e => { if (e.button === 0 && e.target.closest?.('.orn-btn:not(:disabled), .ws, .skill-cell, .bar-cell, .cur-cell, .ql-list button')) sfx('click'); };
      onMounted(() => addEventListener('click', uiClick, true)); onBeforeUnmount(() => removeEventListener('click', uiClick, true));
      const outside = e => { if (tipPinned.value && !e.target.closest?.('.tipwrap')) unpinTip(); };
      onMounted(() => { addEventListener('mousedown', outside, true); });
      onBeforeUnmount(() => removeEventListener('mousedown', outside, true));
      onMounted(() => { probeIcons(document.documentElement); addEventListener('keydown', kd); addEventListener('keyup', ku); addEventListener('mousemove', mm); addEventListener('mousedown', md); addEventListener('mouseup', mu); addEventListener('resize', rs); });
      onBeforeUnmount(() => { cancelAnimationFrame(raf); removeEventListener('keydown', kd); removeEventListener('keyup', ku); removeEventListener('mousemove', mm); removeEventListener('mousedown', md); removeEventListener('mouseup', mu); removeEventListener('resize', rs); scene?.dispose(); });

      const pct = (a, b) => `${Math.max(0, Math.min(100, 100 * a / Math.max(1, b)))}%`;
      const bandIndex = t => STAGES.findIndex(s => t >= s.maps[0] && t <= s.maps[1]);
      return {
        talentOpen, talentPts, atlasOpen, wsSel, stash, stoneCells, pickStone, freeNode, usable, stone, runTier, canStart, startText, waystoneTip, waystoneName, openAtlasFor,
        atlas, atlasEl, atlasSel, atlasDrag, selNode, selMods, atlasShown, atlasLit, atlasLandmarks, atlasStars, atlasRoads, atlasRegions, atlasRings, atlasBox, atlasOpenCount, atlasFar,
        centerAtlas, selectNode, atlasDown, atlasMove, atlasUp, atlasWheel, kinds: NODE_KINDS,
        kindIconUrl: (kind, color) => `https://api.iconify.design/game-icons/${NODE_KINDS[kind].icon}.svg?color=${encodeURIComponent(color)}`,
        regionName: id => REGION_NAME[id], statusName: st => ({ done: '已打通', open: '可进入', seen: '尚未连通', hidden: '未知' })[st], nodeModText: id => NODE_MODS[id].text,
        save, stage, overlay, tipEl, comboEl, flashEl, open, center, mapTier, mapFamily, picked, pickedLine, craftMsg, roles, evaluating, updateText, hover, bdSel, toasts, legendBanner,
        volume, cycleVolume, quest, questIndex, questSel, story, chapters: CHAPTERS, chapterNo, fmtN, rewardText, closeStory, claimStory, dragItem, dropSlot, dropBar, skillCards, skillGrid, hoverThing, tipPinned, activeCur, activeIdx, pickCur, curStacks, unpinTip, tipCraft, setBar, skillDragStart, skillDragEnd, skillDrop, quickBar, run, resultLoot, clearedBanner, hud,
        profile, requirements, statRows, bdArch, bdStages, currentBd, centerName, centerTitle, traits, granted, ladder, ladderFocus, primarySkill, bagCells,
        legendCells, bagLeft, bagSize: BAG_SIZE, pageCells, pageSize: PAGE_SIZE, pages: PAGES, legendCap: LEGEND_CAP, currencyPage: CURRENCY_PAGE, vaultTab, legendSel, dropTab, dragFrom, legendCount, vaultCounts, wallet, tipStacks,
        hub, hubTick, opts, settingTab, settingTabs, keybinds: KEYBINDS, setQuality, resetSettings, mapOpen,
        stoneOut, backToDevice, dropOnStoneCell, selected, menu, ctrlClick, openMenu, menuDo, affixRows, totals, slotPos, pentaPoints, dragAnyStart, dragAnyEnd, dropOnCurrencyPage, dropOnLegendPage, dropOnCore, dropOnStones, dropOnSlot, dropOnScarabs, dropOnCraft, dropDev, deviceSlots, scarabsLeft, slotScarab, unslotScarab, scarabName, scarabText, scarabColor, parseScarab, legendary, dropBagCell, dropPageCell, toVault, fromVault, moveCurrency, takeCurrency, vaultDragStart, dropToBag, dropToPage, portalRun, portalHome, portalBack, xpNext, maxLevel: MAX_LEVEL,
        pick, equippedFor, hoverOn, hoverOff, doEquip, doUnequip, dragStart, dropOn, doSalvage, doCraft, applyBd, clearBd, accountName, leaveAccount, grantLegendary, evaluate, update, toggle, isOpen, openCenter, startRun, leaveRun, selectSkill, gearChanged,
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

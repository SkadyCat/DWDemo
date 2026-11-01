// 内容编辑器：把装备基底、传奇、特性与词条、通货、地图词缀、技能、召唤物、状态、怪物、精英词缀、地图类型
// 全部摊成数据卡片；点卡片在右侧改字段，保存写进 data/overrides.json，游戏刷新后生效（见 core/content/overrides.mjs）。
import { createApp, reactive, computed, ref, watch, onMounted } from '../vendor/vue.esm-browser.prod.js';
import { OVERRIDES, baseline, plain } from '../../core/content/overrides.mjs';
import { gameContent } from '../../core/content/game.mjs';
import { SLOT_NAMES, ITEM_SKILLS } from '../../core/content/items.mjs';
import { LAYERS } from '../../core/content/families.mjs';
import { mapProfile, MAP_TIERS } from '../../core/content/maps.mjs';
import '../../core/content/legendaries.mjs';
import '../game/atlas.mjs';
import { GI, BASE_ICON, SLOT_ICON, SKILL_ICON, CURRENCY_ICON, FAMILY_ICON, LAYER_ICON, probeIcons } from '../game/icons.mjs';

gameContent();
const BASE = baseline();

// ------------------------------------------------------------------ words
const EL = { physical: '物理', fire: '火焰', cold: '冰霜', lightning: '闪电', chaos: '混沌' };
const EL_CLASS = { physical: 'phys', fire: 'fire', cold: 'cold', lightning: 'light', chaos: 'chaos' };
const TAG = { spell: '法术', attack: '攻击', melee: '近战', projectile: '投射物', area: '范围', channel: '引导', minion: '召唤', totem: '图腾', movement: '位移', duration: '持续',
  defence: '防御', offence: '进攻', life: '生命', es: '护盾', armour: '护甲', evasion: '闪避', resist: '抗性', block: '格挡', sustain: '回复', crit: '暴击', speed: '速度',
  mana: '魔力', utility: '功能', core: '核心', charge: '充能', conversion: '转化', trigger: '触发', elemental: '元素', legendary: '传奇', cascade: '连锁反应',
  chaining: '连锁', nova: '新星', strike: '打击', slam: '猛击', triggered_only: '仅触发', monster: '怪物', telegraph: '预警', buff: '增益', dot: '持续伤害', ailment: '异常', reaction: '反应',
  ...EL };
const OP = { base: '+', inc: '提高 ', more: '更多 ', flag: '' };
const MOB_SKILL_NAME = { mob_strike: '扑咬', mob_bolt: '投弹', boss_slam: '重砸（预警）', boss_nova: '首领新星' };
const MONSTER_ICON = { melee: 'wolf-head', ranged: 'bowman', elite: 'daemon-skull', boss: 'crowned-skull' };
const DEF_NAME = { armour: '护甲', evasion: '闪避', es: '能量护盾', life: '生命' };
const tagText = tags => (tags ?? []).map(t => TAG[t] ?? t);
const modText = m => `${m.stat}${m.op === 'flag' ? '' : ' ' + (OP[m.op ?? 'base'] ?? m.op) + m.value}${m.op === 'inc' || m.op === 'more' ? '%' : ''}${m.tags ? ' [' + tagText(m.tags).join('/') + ']' : ''}`;
const mainElement = dmg => { let best = 'physical', v = -1; for (const [k, x] of Object.entries(dmg ?? {})) if (typeof x === 'number' && x > v) { v = x; best = k; } return best; };
const actionText = acts => (acts ?? []).map(a => ({ projectile: '投射', area: '范围', strike: '打击', zone: '地面', summon: '召唤', blink: '闪现', consume: '消耗', more: '增伤', if: '条件', cast: '施放', repeat: '重复' })[a.do] ?? a.do).join(' → ');
const fmt = v => v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e4 ? `${Math.round(v / 1e3)}k` : Math.round(v);
const roman = n => ['', 'Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ'][n] ?? n;

// ------------------------------------------------------------------ categories
const SLOT_ORDER = Object.keys(BASE).filter(k => k.startsWith('bases.'));
const allBases = () => SLOT_ORDER.flatMap(cat => Object.keys(BASE[cat]).map(id => ({ cat, id })));
/** Each section: which stored categories it shows, a filter row, and how to draw one card. */
const SECTIONS = [
  { group: '装备', id: 'bases', name: '装备基底', icon: 'chest-armor', entries: allBases,
    filters: () => SLOT_ORDER.map(c => ({ id: c, name: SLOT_NAMES[c.slice(6)] })), filterOf: e => e.cat,
    card: (d, e) => ({ title: d.name, sub: `${SLOT_NAMES[e.cat.slice(6)]}${d.def ? ' · ' + DEF_NAME[d.def] + '底' : ''}`, icon: BASE_ICON[e.id] ?? SLOT_ICON[e.cat.slice(6)], cls: 'r-rare',
      stats: [['技能池', `${(d.skills ?? []).length} 个`]], chips: (d.skills ?? []).map(s => skillName(s)) }) },
  { group: '装备', id: 'legendaries', name: '传奇装备', icon: 'laurel-crown', entries: () => list('legendaries'),
    filters: () => [...new Set(Object.values(BASE.legendaries).map(l => l.slot))].map(s => ({ id: s, name: SLOT_NAMES[s] })), filterOf: (e, d) => d.slot,
    card: d => ({ title: d.name, sub: `${SLOT_NAMES[d.slot] ?? d.slot}${d.skill ? ' · ' + skillName(d.skill) : ''}`, icon: BASE_ICON[d.base] ?? SLOT_ICON[d.slot], cls: 'r-legendary', tone: 'legendary',
      text: d.legend?.text, flavor: d.flavor }) },
  { group: '词条', id: 'families', name: '特性与词条', icon: 'scroll-unfurled', entries: () => list('families'),
    filters: () => Object.entries(LAYERS).map(([id, l]) => ({ id, name: l.name })), filterOf: (e, d) => d.layer ?? 'stat',
    card: d => { const layer = d.layer ?? 'stat', L = LAYERS[layer];
      const vals = d.values ? d.values.join(' / ') : `${d.from} → ${d.to}`;
      return { title: (d.name ?? d.id).replace('{v}', d.values ? d.values[d.values.length - 1] : d.to), sub: `${L.name} · ${d.values?.length ?? d.levels ?? L.tiers} 阶`, icon: LAYER_ICON[layer] ?? 'rune-stone', cls: layer === 'stat' ? 'el-gold' : 'ly-' + layer, tone: layer,
        stats: [['数值', vals]], chips: tagText(d.tags).slice(0, 5) }; } },
  { group: '道具', id: 'currencies', name: '通货', icon: 'crystal-cluster', entries: () => list('currencies'),
    card: (d, e) => ({ title: d.name, sub: `掉落权重 ${d.weight}（约 ${dropShare(d.weight)}%）`, icon: CURRENCY_ICON[e.id] ?? 'gems', cls: 'r-currency', text: d.desc }) },
  { group: '道具', id: 'nodeMods', name: '地图词缀', icon: 'stone-tablet', note: '路石与图集节点共用这一套词缀。',
    entries: () => list('nodeMods'),
    card: d => ({ title: d.text, sub: '路石 / 节点词缀', icon: 'stone-tablet', cls: 'r-magic',
      stats: Object.entries(d).filter(([k, v]) => typeof v === 'number').map(([k, v]) => [{ quantity: '物品数量', pack: '怪群', elite: '精英', life: '怪物生命', damage: '怪物伤害', legend: '传奇几率' }[k] ?? k, k === 'quantity' ? `+${Math.round(v * 100)}%` : `×${v}`]) }) },
  { group: '技能', id: 'skills', name: '主动技能', icon: 'fireball', entries: () => list('skills'),
    filters: () => [{ id: 'item', name: '装备技能' }, { id: 'triggered', name: '仅触发' }, { id: 'other', name: '其他' }],
    filterOf: (e, d) => ITEM_SKILLS.includes(e.id) ? 'item' : (d.tags ?? []).includes('triggered_only') ? 'triggered' : 'other',
    card: (d, e) => { const el = mainElement(d.damage);
      return { title: d.name ?? e.id, sub: tagText(d.tags).join(' · '), icon: SKILL_ICON[e.id] ?? 'magic-swirl', cls: 'el-' + EL_CLASS[el], tone: el,
        stats: [['伤害', Object.entries(d.damage ?? {}).map(([k, v]) => `${EL[k] ?? k} ${v}`).join(' + ') || '—'], [d.channel ? '引导间隔' : '施放', `${d.channel ?? d.time ?? '—'} 秒`],
          ['消耗', d.cost ?? 0], ['暴击', `${d.crit ?? 0}%`], ...(d.cooldown ? [['冷却', `${d.cooldown} 秒`]] : []), ['距离', d.range ?? '—']], text: actionText(d.actions) }; } },
  { group: '技能', id: 'minions', name: '召唤物', icon: 'spinning-sword', entries: () => list('minions'),
    card: d => ({ title: d.name, sub: d.brain === 'turret' ? '图腾（原地）' : '随从', icon: d.brain === 'turret' ? 'stone-tower' : 'spinning-sword', cls: 'el-gold',
      stats: [['生命', d.life], ['体型', d.radius], ['持续', d.duration ? d.duration + ' 秒' : '永久']], chips: (d.skills ?? []).map(skillName) }) },
  { group: '技能', id: 'statuses', name: '状态', icon: 'sparkles', entries: () => list('statuses'),
    card: d => ({ title: d.name, sub: [d.debuff ? '减益' : (d.tags ?? []).includes('buff') ? '增益' : '状态', d.stacking ? { stack: '叠层', strongest: '取最强', instances: '独立实例' }[d.stacking] : ''].filter(Boolean).join(' · '),
      icon: 'sparkles', cls: d.debuff ? 'el-chaos' : 'el-gold', stats: [['持续', d.duration >= 1e6 ? '永久' : `${d.duration} 秒`], ...(d.max ? [['上限', d.max]] : [])], text: (d.mods ?? []).map(modText).join('；') }) },
  { group: '怪物', id: 'monsters', name: '怪物类型', icon: 'wolf-head', note: '生命与伤害按地图 T 阶曲线计算，这里是倍率；卡片按上方「预览 T」显示实际数值。', entries: () => list('monsters'),
    card: (d, e) => { const p = mapProfile(state.tier, 'ruin');
      const life = (e.id === 'boss' ? p.bossLife : e.id === 'elite' ? p.eliteLife : p.monsterLife) * (d.life ?? 1);
      return { title: d.name, sub: d.role, icon: MONSTER_ICON[e.id] ?? 'wolf-head', cls: e.id === 'boss' ? 'r-legendary' : e.id === 'elite' ? 'r-rare' : 'el-phys', tone: e.id === 'boss' ? 'legendary' : '',
        stats: [[`T${state.tier} 生命`, fmt(life)], [`T${state.tier} 单次伤害`, fmt(p.monsterDamage * (d.damage ?? 1))], ['体型', d.radius], ...(d.share != null ? [['占比', `${Math.round(d.share * 100)}%`]] : []), ...(d.keepDistance ? [['保持距离', d.keepDistance]] : [])],
        chips: (d.skills ?? []).map(s => MOB_SKILL_NAME[s] ?? s) }; } },
  { group: '怪物', id: 'monsterSkills', name: '怪物技能', icon: 'claw-slashes', entries: () => list('monsterSkills'),
    card: (d, e) => ({ title: d.name ?? MOB_SKILL_NAME[e.id] ?? e.id, sub: tagText(d.tags).join(' · '), icon: e.id.startsWith('boss') ? 'crowned-skull' : 'claw-slashes', cls: e.id.startsWith('boss') ? 'r-legendary' : 'el-phys',
      stats: [['施放', `${d.time} 秒`], ...(d.cooldown ? [['冷却', `${d.cooldown} 秒`]] : []), ['距离', d.range], ...(d.actions?.[0]?.mult ? [['倍率', `${d.actions[0].mult}%`]] : [])], text: actionText(d.actions) }) },
  { group: '怪物', id: 'elites', name: '精英词缀', icon: 'daemon-skull', entries: () => list('elites'),
    card: d => ({ title: d.name, sub: '精英 / 首领词缀', icon: 'daemon-skull', cls: 'r-rare', text: (d.mods ?? []).map(modText).join('；') }) },
  { group: '怪物', id: 'mapFamilies', name: '地图类型', icon: 'dungeon-gate', entries: () => list('mapFamilies'),
    card: (d, e) => ({ title: d.name, sub: '怪物伤害构成', icon: FAMILY_ICON[e.id] ?? 'dungeon-gate', cls: 'el-gold', mix: d.mix,
      stats: Object.entries(d.mix ?? {}).map(([k, v]) => [EL[k] ?? k, `${Math.round(v * 100)}%`]) }) },
];
const GROUPS = [...new Set(SECTIONS.map(s => s.group))];
const list = cat => Object.keys({ ...BASE[cat], ...(state.ov[cat] ?? {}) }).map(id => ({ cat, id }));
const skillName = id => current('skills', id)?.name ?? MOB_SKILL_NAME[id] ?? id;
const dropShare = w => { const all = Object.keys({ ...BASE.currencies, ...(state.ov.currencies ?? {}) }).reduce((s, id) => s + (current('currencies', id).weight ?? 0), 0); return +(100 * w / Math.max(1e-9, all)).toFixed(1); };

// ------------------------------------------------------------------ editing state
const state = reactive({ ov: plain(OVERRIDES) ?? {}, tier: 8 });
function current(cat, id) { const b = BASE[cat]?.[id], o = state.ov[cat]?.[id]; return b || o ? { ...(b ?? {}), ...(o ?? {}) } : null; }
const isModified = (cat, id) => !!state.ov[cat]?.[id];
const isNew = (cat, id) => !BASE[cat]?.[id];

/** Options for fields that pick from a fixed set. */
function choices(cat, key, d) {
  if (key === 'def') return ['', 'armour', 'evasion', 'es', 'life'];
  if (key === 'stacking') return ['', 'stack', 'strongest', 'instances'];
  if (key === 'skill') return ['', ...ITEM_SKILLS];
  if (key === 'brain') return ['', 'turret'];
  if (key === 'theme') return ['fire', 'cold', 'lightning', 'phys', 'chaos', 'minion', 'defence', 'speed'];
  if (cat === 'legendaries' && key === 'base') return (BASE[`bases.${d.slot === 'ring2' ? 'ring1' : d.slot}`] ? Object.keys(BASE[`bases.${d.slot === 'ring2' ? 'ring1' : d.slot}`]) : []);
  return null;
}
const READONLY = new Set(['id', 'layer', 'slot']);
const LABEL = { name: '名称', text: '描述', desc: '说明', flavor: '传说文字', role: '定位', weight: '掉落权重', tags: '标签', time: '施放时间（秒）', cost: '魔力消耗', crit: '基础暴击 %', cooldown: '冷却（秒）',
  range: '距离', damage: '基础伤害', actions: '动作（JSON）', channel: '引导间隔（秒）', life: '生命', radius: '体型', duration: '持续（秒）', skills: '技能', brain: '行为', max: '层数上限',
  stacking: '叠加方式', mods: '修正（JSON）', debuff: '减益', def: '基底防御', slot: '部位', base: '基底', skill: '主动技能', theme: '主题', legend: '传奇特性（JSON）', layer: '层级',
  from: '最低值', to: '最高值', step: '步长', values: '各阶数值', levels: '阶数', slots: '可出现部位', curve: '曲线', maxPerBuild: '每个流派上限', unique: '不可叠加',
  share: '杂兵占比', damage_: '伤害倍率', aggro: '索敌距离', keepDistance: '保持距离', mix: '伤害构成', quantity: '物品数量', pack: '怪群倍率', elite: '精英倍率', legend_: '传奇倍率',
  effectiveness: '效能', esFromLife: '护盾（生命倍数）', rules: '规则（JSON）', grants: '赋予（JSON）' };
const label = (cat, key) => (cat === 'monsters' && key === 'damage' ? '伤害倍率' : cat === 'monsters' && key === 'life' ? '生命倍率' : cat === 'nodeMods' && key === 'legend' ? '传奇倍率' : LABEL[key] ?? key);

function kindOf(v, key) {
  if (key === 'name' || key === 'text' || key === 'desc' || key === 'flavor' || key === 'role') return (v ?? '').length > 30 || key === 'flavor' || key === 'desc' ? 'textarea' : 'text';
  if (typeof v === 'string') return 'text';
  if (typeof v === 'number') return 'number';
  if (typeof v === 'boolean') return 'bool';
  if (Array.isArray(v) && v.every(x => typeof x === 'string')) return 'words';
  if (Array.isArray(v) && v.every(x => typeof x === 'number')) return 'numbers';
  if (v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every(x => typeof x === 'number')) return 'nummap';
  return 'json';
}

const TEMPLATE = /* html */ `
<div class="ed" :class="{ drawer: !!sel }">
  <header class="ed-top">
    <h1>内 容 编 辑 器</h1>
    <input class="ed-search" v-model="q" placeholder="搜索名称、id、描述…" aria-label="搜索">
    <label class="ed-tier">预览 T<input type="range" min="1" :max="MAP_TIERS" v-model.number="state.tier"><b>{{ state.tier }}</b></label>
    <label class="ed-only"><input type="checkbox" v-model="onlyModified">只看已修改 <b>{{ modifiedCount }}</b></label>
    <button class="orn-btn sm" @click="exportJson">导出 JSON</button>
    <a class="orn-btn ghost sm" href="/">返回游戏</a>
  </header>

  <nav class="ed-nav" aria-label="分类">
    <template v-for="g in groups" :key="g">
      <h3>{{ g }}</h3>
      <button v-for="s in sections.filter(x => x.group === g)" :key="s.id" :class="{ on: s.id === sec }" @click="go(s.id)">
        <i class="gi el-gold" :style="{ '--i': gi(s.icon) }"></i><span>{{ s.name }}</span><em>{{ countOf(s) }}</em></button>
    </template>
  </nav>

  <main class="ed-main">
    <div class="ed-head">
      <h2>{{ section.name }}</h2><span>{{ cards.length }} 张</span>
      <div class="ed-filters" v-if="section.filters">
        <button :class="{ on: !filter }" @click="filter = null">全部</button>
        <button v-for="f in section.filters()" :key="f.id" :class="{ on: filter === f.id }" @click="filter = f.id">{{ f.name }}</button>
      </div>
      <p class="ed-note" v-if="section.note">{{ section.note }}</p>
    </div>
    <div class="ed-grid">
      <article v-for="c in cards" :key="c.cat + ':' + c.id" class="dc" :class="['t-' + (c.v.tone || 'none'), { on: sel && sel.cat === c.cat && sel.id === c.id, mod: c.mod }]" @click="open(c)" tabindex="0" @keydown.enter="open(c)">
        <header>
          <div class="dc-icon"><i class="gi" :class="c.v.cls" :style="{ '--i': gi(c.v.icon) }"></i></div>
          <div class="dc-t"><h4>{{ c.v.title }}</h4><p>{{ c.v.sub }}</p></div>
          <span class="dc-mod" v-if="c.mod">{{ c.fresh ? '新增' : '已改' }}</span>
        </header>
        <div class="dc-mix" v-if="c.v.mix"><i v-for="(w, k) in c.v.mix" :key="k" :class="'mx-' + k" :style="{ flex: w }"></i></div>
        <dl v-if="c.v.stats && c.v.stats.length"><div v-for="s in c.v.stats" :key="s[0]"><dt>{{ s[0] }}</dt><dd>{{ s[1] }}</dd></div></dl>
        <p class="dc-text" v-if="c.v.text">{{ c.v.text }}</p>
        <p class="dc-flavor" v-if="c.v.flavor">{{ c.v.flavor }}</p>
        <ul class="dc-chips" v-if="c.v.chips && c.v.chips.length"><li v-for="t in c.v.chips" :key="t">{{ t }}</li></ul>
        <footer><code>{{ c.id }}</code></footer>
      </article>
      <p v-if="!cards.length" class="ed-empty">没有符合条件的卡片。</p>
    </div>
  </main>

  <aside class="ed-drawer panel" v-if="sel && draft">
    <header class="dr-head">
      <div class="dc-icon"><i class="gi" :class="selCard.cls" :style="{ '--i': gi(selCard.icon) }"></i></div>
      <div><h3>{{ selCard.title }}</h3><p><code>{{ sel.cat }} / {{ sel.id }}</code><span v-if="isModified(sel.cat, sel.id)" class="dc-mod">{{ isNew(sel.cat, sel.id) ? '新增' : '已改' }}</span></p></div>
      <button class="x" @click="sel = null" aria-label="关闭">×</button>
    </header>
    <div class="dr-body">
      <div v-for="k in fields" :key="k" class="fld" :class="['k-' + kinds[k], { changed: changed(k) }]">
        <label :for="'f-' + k">{{ label(sel.cat, k) }}<small v-if="changed(k)">已改 · <button @click="resetField(k)">还原此项</button></small></label>
        <input v-if="READONLY.has(k)" :id="'f-' + k" :value="fmtVal(draft[k])" disabled>
        <select v-else-if="choices(sel.cat, k, draft)" :id="'f-' + k" v-model="draft[k]"><option v-for="o in choices(sel.cat, k, draft)" :key="o" :value="o">{{ o || '（无）' }}</option></select>
        <input v-else-if="kinds[k] === 'text'" :id="'f-' + k" v-model="draft[k]">
        <textarea v-else-if="kinds[k] === 'textarea'" :id="'f-' + k" v-model="draft[k]" rows="3"></textarea>
        <input v-else-if="kinds[k] === 'number'" :id="'f-' + k" type="number" step="any" v-model.number="draft[k]">
        <input v-else-if="kinds[k] === 'bool'" :id="'f-' + k" type="checkbox" v-model="draft[k]">
        <input v-else-if="kinds[k] === 'words'" :id="'f-' + k" :value="(draft[k] || []).join(', ')" @change="draft[k] = $event.target.value.split(/[,，\\s]+/).filter(Boolean)" :list="k === 'skills' ? 'skill-ids' : null">
        <input v-else-if="kinds[k] === 'numbers'" :id="'f-' + k" :value="(draft[k] || []).join(', ')" @change="draft[k] = $event.target.value.split(/[,，\\s]+/).filter(Boolean).map(Number)">
        <div v-else-if="kinds[k] === 'nummap'" class="nummap">
          <label v-for="(v, kk) in draft[k]" :key="kk"><span>{{ EL[kk] || kk }}</span><input type="number" step="any" v-model.number="draft[k][kk]"></label>
        </div>
        <template v-else>
          <textarea :id="'f-' + k" class="json" :class="{ bad: jsonErr[k] }" :value="jsonText[k]" @input="onJson(k, $event.target.value)" rows="6" spellcheck="false"></textarea>
          <p class="err" v-if="jsonErr[k]">{{ jsonErr[k] }}</p>
        </template>
      </div>
      <p class="hint" v-if="sel.cat === 'families'">这一族的效果逻辑写在代码里（make 函数）；这里能改名称、数值、可出现部位和标签。</p>
      <datalist id="skill-ids"><option v-for="s in skillIds" :key="s" :value="s"></option></datalist>
      <div class="dr-new" v-if="canClone">
        <input v-model="newId" placeholder="新条目 id（英文）"><button class="orn-btn sm" :disabled="!validNewId" @click="cloneEntry">复制为新条目</button>
      </div>
    </div>
    <footer class="dr-foot">
      <button class="orn-btn danger sm" :disabled="!isModified(sel.cat, sel.id)" @click="revert">{{ isNew(sel.cat, sel.id) ? '删除新增' : '全部还原' }}</button>
      <span class="dr-msg">{{ msg }}</span>
      <button class="orn-btn primary" :disabled="!dirty || hasJsonErr" @click="saveEntry">保 存</button>
    </footer>
  </aside>
</div>`;

export function mountEditor(el) {
  createApp({
    template: TEMPLATE,
    setup() {
      const sec = ref(location.hash.slice(1) || 'skills'), filter = ref(null), q = ref(''), onlyModified = ref(false);
      const sel = ref(null), draft = ref(null), jsonText = reactive({}), jsonErr = reactive({}), msg = ref(''), newId = ref('');
      const section = computed(() => SECTIONS.find(s => s.id === sec.value) ?? SECTIONS[0]);
      const entriesOf = s => s.entries();
      const cards = computed(() => {
        void state.tier; void JSON.stringify(state.ov);
        const s = section.value, term = q.value.trim().toLowerCase();
        return entriesOf(s).map(e => { const d = current(e.cat, e.id); return { ...e, d, v: s.card(d, e), mod: isModified(e.cat, e.id), fresh: isNew(e.cat, e.id) }; })
          .filter(c => !filter.value || !s.filterOf || s.filterOf(c, c.d) === filter.value)
          .filter(c => !onlyModified.value || c.mod)
          .filter(c => !term || [c.id, c.v.title, c.v.sub, c.v.text, ...(c.v.chips ?? [])].some(x => String(x ?? '').toLowerCase().includes(term)));
      });
      const countOf = s => entriesOf(s).length;
      const modifiedCount = computed(() => Object.values(state.ov).reduce((n, m) => n + Object.keys(m ?? {}).length, 0));
      const selCard = computed(() => { if (!sel.value) return null; const s = SECTIONS.find(x => x.entries().some(e => e.cat === sel.value.cat)); return s.card({ ...current(sel.value.cat, sel.value.id), ...(draft.value ?? {}) }, sel.value); });
      const fields = computed(() => draft.value ? Object.keys(draft.value).filter(k => draft.value[k] !== undefined) : []);
      const kinds = computed(() => Object.fromEntries(fields.value.map(k => [k, kindOf(BASE[sel.value.cat]?.[sel.value.id]?.[k] ?? draft.value[k], k)])));
      const baseOfSel = () => BASE[sel.value.cat]?.[sel.value.id] ?? {};
      const changed = k => JSON.stringify(draft.value?.[k]) !== JSON.stringify(baseOfSel()[k]);
      const diff = () => { const out = {}; for (const k of fields.value) if (k !== 'id' && changed(k)) out[k] = plain(draft.value[k]); return out; };
      const dirty = computed(() => { void JSON.stringify(draft.value); if (!sel.value) return false; return JSON.stringify(diff()) !== JSON.stringify(state.ov[sel.value.cat]?.[sel.value.id] ?? {}) || (isNew(sel.value.cat, sel.value.id) && !isModified(sel.value.cat, sel.value.id)); });
      const hasJsonErr = computed(() => Object.values(jsonErr).some(Boolean));
      const canClone = computed(() => sel.value && sel.value.cat !== 'families');
      const validNewId = computed(() => /^[a-z][a-z0-9_]{1,40}$/.test(newId.value) && !current(sel.value?.cat, newId.value));
      const skillIds = [...Object.keys(BASE.skills), ...Object.keys(BASE.monsterSkills)];

      function open(c) {
        sel.value = { cat: c.cat, id: c.id };
        const d = current(c.cat, c.id); delete d.id;
        draft.value = reactive(plain(d)); msg.value = ''; newId.value = '';
        for (const k of Object.keys(jsonText)) delete jsonText[k];
        for (const k of Object.keys(jsonErr)) delete jsonErr[k];
        for (const k of Object.keys(draft.value)) if (kindOf(d[k], k) === 'json') jsonText[k] = JSON.stringify(d[k], null, 2);
      }
      function onJson(k, text) {
        jsonText[k] = text;
        try { draft.value[k] = JSON.parse(text); jsonErr[k] = ''; } catch (e) { jsonErr[k] = 'JSON 格式不对：' + e.message; }
      }
      function resetField(k) {
        const b = baseOfSel()[k]; draft.value[k] = plain(b);
        if (k in jsonText) { jsonText[k] = JSON.stringify(b, null, 2); jsonErr[k] = ''; }
      }
      async function persist(text) {
        try {
          const r = await fetch('/api/overrides', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state.ov) });
          if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? r.status);
          msg.value = text;
        } catch (e) { msg.value = `保存失败：${e.message}（需要重启本地服务以启用编辑器接口）`; }
      }
      function saveEntry() {
        const { cat, id } = sel.value, d = isNew(cat, id) ? plain(draft.value) : diff();
        state.ov[cat] ??= {};
        if (Object.keys(d).length) state.ov[cat][id] = d; else delete state.ov[cat][id];
        if (!Object.keys(state.ov[cat]).length) delete state.ov[cat];
        persist('已保存 · 刷新游戏后生效');
      }
      function revert() {
        const { cat, id } = sel.value;
        if (state.ov[cat]) { delete state.ov[cat][id]; if (!Object.keys(state.ov[cat]).length) delete state.ov[cat]; }
        persist(isNew(cat, id) ? '已删除新增条目' : '已还原为原始数据');
        if (isNew(cat, id)) { sel.value = null; draft.value = null; } else open({ cat, id });
      }
      function cloneEntry() {
        const { cat } = sel.value, id = newId.value;
        state.ov[cat] ??= {}; state.ov[cat][id] = plain({ ...draft.value, name: (draft.value.name ?? id) + '（新）' });
        persist('已新增 · 刷新游戏后生效'); open({ cat, id });
      }
      function exportJson() {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(state.ov, null, 2)], { type: 'application/json' }));
        a.download = 'overrides.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }
      function go(id) { sec.value = id; filter.value = null; location.hash = id; }
      watch(sec, () => { sel.value = null; });
      onMounted(() => probeIcons(document.documentElement));
      return { state, sections: SECTIONS, groups: GROUPS, sec, section, filter, q, onlyModified, cards, countOf, modifiedCount, sel, selCard, draft, fields, kinds, jsonText, jsonErr, msg, newId,
        dirty, hasJsonErr, canClone, validNewId, skillIds, open, onJson, resetField, saveEntry, revert, cloneEntry, exportJson, go, changed, choices, label, isModified, isNew,
        READONLY, EL, MAP_TIERS, gi: GI, fmtVal: v => (Array.isArray(v) ? v.join(', ') : v) };
    },
  }).mount(el);
}

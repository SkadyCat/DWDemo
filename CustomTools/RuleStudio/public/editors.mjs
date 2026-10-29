// Skill / equipment / item editors (Vue 3). Each collection is a named set of traits; the preview
// folds the collection (plus an optional test skill and other equipped collections) through the
// same engine compile + combat path as the rest of the site.
import { createApp, reactive, computed, ref, watch, markRaw, onMounted, onBeforeUnmount, provide, inject } from '/vendor/vue.esm-browser.prod.js';
import {
  checkRuleSet, readCollections, parseCollection, validateCollection, serializeCollection, emptyCollection, describeTrait,
  aggregate, markEnabled, timedBoundaries, MAX_DURATION, defaultCatalog, compileBuild, referencesTo, RARITIES, SLOTS, ITEM_CATEGORIES, COLLECTION_KINDS, TRAIT_KIND_NAMES, ID_PATTERN,
  MaxStitchDepth, sourceFromEntry, simulateCharacter, traitTierProfile, createTraitValueEntry, validateTraitValueEntry, TRAIT_TIER_COUNT,
} from '/engine/index.mjs';
import { describePlan } from '/plan-view.mjs';
import { runCombat } from '/combat.mjs';
import { iconSrc } from '/game-icons.mjs';
import { registerEquipmentDropLibrary } from '/equipment-generation.mjs';

const lower = s => String(s).toLowerCase();
const clone = value => JSON.parse(JSON.stringify(value));
const fmt = (v, d = 2) => (Number.isInteger(v) ? String(v) : Number(v.toFixed(d)).toString());
const byId = (list, id) => list.find(entry => entry.id === id);

// Game Lua casts these builds by id; deleting them breaks the playable slice.
const GAME_BUILDS = new Set(['frost_lance', 'player_slash', 'monster_claw', 'monster_bolt', 'monster_nova', 'monster_strike']);

export const store = reactive({ files: [], library: null, collections: null, catalog: null, monsters: new Map(), tags: null, affixCategories: null, error: '', root: '', version: 0, toast: null });

export async function reloadStore() {
  const response = await fetch('/api/rules', { cache: 'no-store' });
  const data = await response.json();
  const check = checkRuleSet(data.files);
  store.files = markRaw(data.files);
  store.root = data.root;
  store.error = check.ok ? '' : check.error;
  if (check.library) store.library = markRaw(check.library);
  store.collections = markRaw(check.collections || readCollections(data.files));
  store.catalog = markRaw(check.catalog || defaultCatalog());
  store.monsters = markRaw(check.monsters || new Map());
  store.tags = check.tags ? markRaw(check.tags) : null;
  store.affixCategories = check.affixCategories ? markRaw(check.affixCategories) : null;
  if (check.ok) registerEquipmentDropLibrary(data.files, check.library, check.affixCategories);
  store.version++;
}

export function notify(text, bad = false) {
  store.toast = { text, bad, at: Date.now() };
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => { store.toast = null; }, 3800);
}

const KIND_UI = {
  skill: { title: '技能', subtitle: '主动特性 + 辅助特性 · Builds 共享技能 / WebBuilds 网页技能', newLabel: '新建技能' },
  equipment: { title: '装备', subtitle: '部位 · 稀有度 · 授予技能 · 特性词条 · Content/Rules/Equipment', newLabel: '新建装备' },
  item: { title: '物品', subtitle: '消耗品 · 通货 · 预兆 · 地图物品 · Content/Rules/Items', newLabel: '新建物品' },
};

const ELEMENT_COLORS = { fire: '#ff8a3d', frost: '#8fdcff', lightning: '#ffe066', physical: '#c9c9c9', poison: '#8cff6b', void: '#c07bff' };
const ELEMENT_CN = { fire: '火焰', frost: '冰霜', lightning: '闪电', physical: '物理', poison: '中毒', void: '虚空' };

const TEMPLATE = /* html */ `
<div class="ed" v-if="store.library">
  <!-- ======================= list ======================= -->
  <aside class="ed-list card">
    <div class="ed-list-head">
      <div>
        <h2>{{ ui.title }}<span class="count">{{ entries.length }}</span></h2>
        <p class="sub">{{ ui.subtitle }}</p>
      </div>
      <button class="btn primary sm" @click="createNew"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>{{ ui.newLabel }}</button>
    </div>
    <div class="search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input v-model="query" placeholder="搜索名称、id、特性…"></div>
    <div class="seg wrap" v-if="groupOptions.length">
      <button :class="{on: group==='all'}" @click="group='all'">全部</button>
      <button v-for="g in groupOptions" :key="g.id" :class="{on: group===g.id}" @click="group=g.id">{{ g.name }}</button>
    </div>
    <div class="ed-items">
      <div v-for="e in filtered" :key="e.key" class="ed-item" :class="['r-' + (e.doc?.rarity || 'skill'), {on: e.key === selectedKey, bad: !e.doc}]" @click="select(e.key)">
        <div class="tile" :class="'r-' + (e.doc?.rarity || 'skill')"><img class="game-icon" :src="iconSrc(kind, e.doc)" alt="" draggable="false"></div>
        <div class="meta">
          <b>{{ e.doc?.name || e.doc?.id || e.key }}</b>
          <span class="mono">{{ e.doc?.id || e.path }}</span>
          <span v-if="!e.doc" class="err-line">{{ e.error }}</span>
        </div>
        <div class="right">
          <span class="pill" v-if="e.doc">{{ groupName(e.doc) }}</span>
          <span class="dim">{{ e.doc?.category === 'map' ? 'T' + e.doc.tier + ' · ' + mapAffixLabel(e.doc.rarity) : e.doc ? e.doc.traits.length + ' 特性' : '' }}</span>
        </div>
      </div>
      <div v-if="!filtered.length" class="empty">没有匹配的{{ ui.title }}</div>
    </div>
  </aside>

  <!-- ======================= form ======================= -->
  <section class="ed-form card" v-if="draft">
    <div class="hero" :style="kind==='item' && draft.category==='map' ? {flexWrap: 'wrap'} : {}" :class="'r-' + (draft.rarity || 'skill')">
      <div class="tile xl" :class="'r-' + (draft.rarity || 'skill')"><img class="game-icon" :src="iconSrc(kind, draft)" alt="" draggable="false"></div>
      <div class="hero-main" :style="kind==='item' && draft.category==='map' ? {minWidth: '210px'} : {}">
        <input class="title-input" v-model="draft.name" :placeholder="ui.title + '名称'">
        <div class="hero-sub">
          <label class="id-field" :class="{locked: !isNew}"><span>id</span><input class="mono" v-model.trim="draft.id" :readonly="!isNew" placeholder="lower_snake_case"></label>
          <span class="pill" v-if="kind==='equipment'">{{ nameOf(SLOTS, draft.slot) }} · Lv {{ draft.level }}</span>
          <span class="pill" v-if="kind==='item'">{{ nameOf(ITEM_CATEGORIES, draft.category) }} · 堆叠 {{ draft.stack }}</span>
          <span class="pill accent" v-if="kind==='skill'">主动：{{ traitName(draft.active) }}</span>
          <span class="pill warn" v-if="dirty">未保存</span>
        </div>
      </div>
      <div class="hero-actions">
        <button class="btn ghost sm" @click="duplicate" :title="'复制为新' + ui.title">复制</button>
        <button class="btn ghost sm" :disabled="!dirty" @click="revert">还原</button>
        <button class="btn danger sm" v-if="!isNew" @click="remove">删除</button>
        <button class="btn primary" :disabled="!!check.error || saving || (!dirty && !isNew)" @click="save">{{ saving ? '保存中…' : '保存' }} <kbd>Ctrl S</kbd></button>
      </div>
    </div>

    <div class="banner bad" v-if="check.error"><b>无法保存</b>{{ check.error }}</div>
    <div class="banner warn" v-for="w in check.warnings" :key="w">{{ w }}</div>

    <div class="ed-scroll">
      <div class="block">
        <h3>基础信息</h3>
        <div class="form-grid">
          <template v-if="kind!=='skill'">
            <label class="field"><span>稀有度</span>
              <div class="seg rarity">
                <button v-for="r in availableRarities" :key="r.id" :class="['r-' + r.id, {on: draft.rarity===r.id}]" @click="draft.rarity=r.id">{{ r.name }}</button>
              </div>
            </label>
          </template>
          <template v-if="kind==='equipment'">
            <label class="field"><span>部位</span>
              <select v-model="draft.slot"><option v-for="s in SLOTS" :key="s.id" :value="s.id">{{ s.name }}</option></select>
            </label>
            <label class="field"><span>物品等级 <b>{{ draft.level }}</b></span>
              <div class="range-row"><input type="range" min="1" max="100" v-model.number="draft.level"><input type="number" min="1" max="100" v-model.number="draft.level"></div>
            </label>
            <label class="field"><span>装备 T 阶（鉴定词条上限）</span><input type="number" min="1" max="10" :value="draft.tier ?? ''" @input="draft.tier = $event.target.value ? Number($event.target.value) : undefined" placeholder="未配置时 T1"></label>
          </template>
          <template v-if="kind==='item'">
            <label class="field"><span>类别</span>
              <select v-model="draft.category"><option v-for="c in ITEM_CATEGORIES" :key="c.id" :value="c.id">{{ c.name }}</option></select>
            </label>
            <label class="field"><span>最大堆叠</span><input type="number" min="1" max="9999" v-model.number="draft.stack"></label>
            <label class="field" v-if="draft.category==='map'"><span>地图层级</span><select v-model.number="draft.tier" aria-label="地图层级"><option v-for="tier in 16" :key="tier" :value="tier">T{{ tier }} · 第 {{ tier }} 层</option></select></label>
            <label class="field" v-if="draft.category==='map'"><span>随机词缀</span><b>{{ mapAffixLabel(draft.rarity) }}</b><small class="dim">从地图专属词缀池中生成，不重复。</small></label>
            <label class="field" v-if="['add_affixes', 'roll_affixes', 'remove_affixes'].includes(draft.craft?.op)"><span>随机词缀数量</span><input type="number" min="1" step="1" v-model.number="draft.craft.count" aria-label="随机词缀数量"></label>
            <label class="field" v-if="draft.craft?.op === 'reroll'"><span>洗炼灵石品级</span><input type="number" min="1" max="3" step="1" v-model.number="draft.craft.grade" aria-label="洗炼灵石品级"></label>
            <label class="field" v-if="draft.category!=='map'"><span>使用时施放</span>
              <select v-model="draft.skill"><option value="">（无）</option><option v-for="b in builds" :key="b.id" :value="b.id">{{ b.name }} · {{ b.id }}</option></select>
            </label>
          </template>
          <template v-if="kind==='skill'">
            <label class="field"><span>主动特性 <i class="dim">施法时触发 cast 规则的特性</i></span>
              <select v-model="draft.active"><option v-for="t in draft.traits" :key="t.id" :value="t.id">{{ traitName(t.id) }} · {{ t.id }}</option></select>
            </label>
          </template>
          <label class="field span2"><span>描述</span><textarea v-model="draft.description" rows="2" placeholder="写给策划和玩家看的说明"></textarea></label>
          <label class="field span2" v-if="kind!=='skill'"><span>标签</span>
            <div class="tag-input">
              <span class="chip" v-for="(t, i) in draft.tags" :key="t">{{ t }}<i @click="draft.tags.splice(i, 1)">×</i></span>
              <input v-model="tagText" @keydown.enter.prevent="addTag" @keydown.backspace="tagBackspace" placeholder="输入后回车">
            </div>
          </label>
          <div class="field span2" v-if="kind==='equipment'"><span>授予技能 <i class="dim">{{ draft.slot === 'weapon' ? '武器只绑定一个玩家技能' : '装备后可施放' }}</i></span>
            <div class="chips">
              <span v-for="b in builds.filter(b => draft.slot !== 'weapon' || !b.id.startsWith('monster_'))" :key="b.id" class="chip toggle" :class="{on: draft.skills.includes(b.id)}" @click="toggleSkill(b.id)">{{ b.name }}</span>
            </div>
          </div>
          <label class="field span2" v-if="kind==='equipment' && draft.legendary"><span>传奇品质固定词条</span><b>{{ traitName(draft.legendary.id) }}</b><small class="dim">只在生成传奇品质装备时生效，不是普通底材自带词条。</small></label>
          <div class="field span2" v-if="kind==='equipment' && draft.rarity==='legendary' && draft.bases?.length">
            <span>固定基底词缀 · {{ draft.bases.length }} 条（不占品质词缀）</span>
            <b v-for="base in draft.bases" :key="base.id">{{ traitName(base.id) }}</b>
            <small class="dim">由底材配置固定机制；鉴定只随机数值，洗炼保留全部基底词缀。</small>
          </div>
          <label class="field span2" v-else-if="kind==='equipment' && ['weapon','helmet','chest','gloves','boots','belt','offhand'].includes(draft.slot)">
            <span>基础属性 · 2 条（不占品质词条）</span>
            <select :value="draft.bases?.[0]?.id || ''" @change="setBase($event.target.value)" aria-label="底材固定基础属性">
              <option value="">未配置基础类型</option><option v-for="id in baseOptions" :key="id" :value="id">{{ traitName(id) }}</option>
            </select>
            <small class="dim">第一条锁定底材类型，第二条在生成时随机{{ draft.slot === 'weapon' ? '数值属性' : '防御属性' }}。普通洗炼保留基础属性。</small>
          </label>
        </div>
      </div>

      <div class="block" v-if="kind==='item' && draft.category==='map'" aria-label="地图物品规则">
        <h3>地图物品</h3><p>使用时消耗 1 张，进入 T{{ draft.tier }}（第 {{ draft.tier }} 层）。</p>
        <p class="hint">普通 0 条 · 魔法 1–2 条 · 稀有 3–6 条。每张地图的词缀与数值在生成时确定。</p>
        <div class="chips"><span class="chip">怪物规模</span><span class="chip">怪物气血</span><span class="chip">怪物伤害</span><span class="chip">基础气血</span><span class="chip">额外气血</span><span class="chip">额外伤害</span></div>
      </div>
      <div class="block" v-else>
        <div class="block-head">
          <h3>{{ kind==='equipment' ? '底材附加特性' : '特性' }} <span class="count">{{ draft.traits.length }}</span></h3>
          <p v-if="kind==='equipment'" class="dim">成品品质词条：普通 0、魔法 1–2、稀有 3–6、传奇 6（1 固定传奇 + 5 随机）。基础属性另算；这里是底材直接配置的特性。</p>
          <button class="btn sm" @click="openPicker()"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>添加特性</button>
        </div>
        <p class="hint" v-if="kind==='skill'">技能集合只引用特性；参数在特性文件里调整。第一个主动特性决定施法行为，其余特性按父子关系启用。网页专用主动动作保存在 WebBuilds 集合。</p>
        <p class="hint" v-else>参数留空使用特性默认值；填写后只对这件{{ ui.title }}生效。持续时间留空为永久生效，填写秒数则只在使用后的这段时间内生效（药剂、临时增益/减益都是这样配置）。“附带持续时间”类特性可以缝合任意特性：触发时（施法、命中、暴击、击杀）让自己或目标在 duration 秒内获得缝合的特性，缝合的特性还能再缝合。同一属性特性在多件装备上会叠加，规则特性只触发一次（后者覆盖参数）。</p>
        <p class="hint" v-if="kind!=='skill'">有数值的特性可选 1–10 阶，选阶时创建并保存实际参数；无数值特性不分阶。旧值保留，手动超出该阶范围时转为自定义。</p>
        <div class="trait-cards">
          <div v-for="(entry, i) in draft.traits" :key="i + ':' + entry.id" class="trait-card" :class="['k-' + traitInfo(entry.id).kind, {missing: !traitInfo(entry.id).exists, wide: traitInfo(entry.id).stitchable && kind!=='skill'}]">
            <div class="tc-head">
              <span class="kind-badge" :class="'k-' + traitInfo(entry.id).kind">{{ TRAIT_KIND_NAMES[traitInfo(entry.id).kind] || '?' }}</span>
              <div class="tc-title"><b>{{ traitInfo(entry.id).name }}</b><span class="mono dim">{{ entry.id }}</span></div>
              <span class="pill accent" v-if="kind==='skill' && draft.active===entry.id">主动</span>
              <div class="tc-tools">
                <button class="icon" :disabled="i===0" @click="move(i, -1)" title="上移"><svg viewBox="0 0 24 24"><path d="m6 15 6-6 6 6"/></svg></button>
                <button class="icon" :disabled="i===draft.traits.length-1" @click="move(i, 1)" title="下移"><svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg></button>
                <button class="icon bad" @click="removeTrait(i)" title="移除"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
              </div>
            </div>
            <p class="tc-desc" v-if="traitInfo(entry.id).description">{{ traitInfo(entry.id).description }}</p>
            <div class="tc-meta">
              <span v-for="ev in traitInfo(entry.id).events" :key="ev" class="mini">on {{ ev }}</span>
              <span class="mini" v-if="traitInfo(entry.id).modifiers">{{ traitInfo(entry.id).modifiers }} 个修饰</span>
              <span class="mini warn" v-if="traitInfo(entry.id).parent">依赖 {{ traitName(traitInfo(entry.id).parent) }}</span>
            </div>
            <trait-tier v-if="kind!=='skill'" :entry="entry"></trait-tier>
            <div class="params" v-if="Object.keys(traitInfo(entry.id).params).length">
              <label v-for="(def, key) in traitInfo(entry.id).params" :key="key" class="param" :class="{over: entry.params[key] !== undefined}">
                <span>{{ key }}</span>
                <input type="number" step="any" :readonly="kind==='skill'" :placeholder="fmt(def)" :value="entry.params[key] ?? ''" @input="setParam(entry, key, $event.target.value)">
                <i v-if="entry.params[key] !== undefined" @click="setParam(entry, key, '')" title="恢复默认">默认 {{ fmt(def) }}</i>
              </label>
            </div>
            <div class="stitch" v-if="traitInfo(entry.id).stitchable && kind!=='skill'">
              <div class="stitch-head">
                <svg viewBox="0 0 24 24"><path d="M4 12h4l3-7 4 14 3-7h2"/></svg>
                <span>缝合的特性 <i>{{ stitchHint(entry) }}</i></span>
                <button class="btn sm" @click="openPicker(entry, 1)"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>缝合特性</button>
              </div>
              <stitch-list :entries="entry.with" :depth="1"></stitch-list>
            </div>
            <div class="duration-row" v-if="kind!=='skill'" :class="{on: entry.duration > 0}">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/></svg>
              <span>持续时间</span>
              <input type="number" min="0" step="0.5" placeholder="永久" :value="entry.duration > 0 ? entry.duration : ''" @input="setDuration(entry, $event.target.value)">
              <em>{{ entry.duration > 0 ? '秒 · 使用后限时生效' : '永久（装备期间一直生效）' }}</em>
            </div>
          </div>
          <button class="trait-add" @click="openPicker()"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>添加特性</button>
        </div>
      </div>

      <details class="block json">
        <summary>文件预览 <span class="mono dim">{{ collectionDirectory }}/{{ draft.id || '…' }}.json</span></summary>
        <pre class="mono">{{ draftText }}</pre>
      </details>
    </div>
  </section>
  <section class="ed-form card empty-state" v-else>
    <div><b>选择左侧的{{ ui.title }}</b><p>或者新建一个，把多个特性组合成{{ ui.title }}。</p><button class="btn primary" @click="createNew">{{ ui.newLabel }}</button></div>
  </section>

  <!-- ======================= preview ======================= -->
  <aside class="ed-preview card" v-if="draft && kind==='item' && draft.category==='map'">
    <h3>地图物品</h3>
    <div class="kpis" style="grid-template-columns: repeat(2, minmax(0, 1fr))"><div><span>目标层级</span><b>T{{ draft.tier }}</b></div><div><span>随机词缀</span><b>{{ mapAffixLabel(draft.rarity) }}</b></div></div>
    <p class="note">获得时生成独立地图物品，保留实际随机词缀。使用消耗 1 张，进入第 {{ draft.tier }} 层，准备就绪后手动开始挑战。</p>
    <h4>地图专属词缀池</h4>
    <p v-for="id in ['map_monster_packs','map_monster_life','map_monster_damage','map_monster_base_life','map_monster_more_life','map_monster_more_damage']" :key="id">{{ traitName(id) }}</p>
  </aside>
  <aside class="ed-preview card" v-else-if="draft">
    <h3>聚合预览</h3>
    <div class="field" v-if="kind!=='skill'"><span>测试技能</span>
      <select v-model="testSkill"><option v-for="b in builds" :key="b.id" :value="b.id">{{ b.name }} · {{ b.id }}</option></select>
    </div>
    <div class="field"><span>同时装备 <i class="dim">与其他集合叠加</i></span>
      <div class="chips small">
        <span v-for="o in loadoutOptions" :key="o.key" class="chip toggle" :class="['r-' + o.rarity, {on: loadout.includes(o.key)}]" @click="toggleLoadout(o.key)">{{ o.name }}</span>
      </div>
    </div>

    <div class="banner bad" v-if="preview.error">{{ preview.error }}</div>
    <template v-else>
      <div class="field timeline" v-if="timedMax > 0"><span>使用后第 <b>{{ fmt(at, 1) }}</b> 秒 <i class="dim">拖动查看限时特性生效与过期</i></span>
        <input type="range" min="0" :max="timedMax + 1" step="0.5" v-model.number="at">
        <div class="ticks"><span v-for="b in timedBounds" :key="b" :style="{left: (b / (timedMax + 1) * 100) + '%'}">{{ b }}s</span></div>
      </div>
      <div class="kpis">
        <div><span>启用特性</span><b>{{ preview.enabled }}</b><i>/ {{ preview.contributions.length }}</i></div>
        <div><span>规则</span><b>{{ preview.d.counts.rules }}</b></div>
        <div><span>动作</span><b>{{ preview.d.counts.actions }}</b></div>
        <div><span>计划</span><b class="mono sm">{{ preview.d.hash.slice(0, 8) }}</b></div>
      </div>

      <h4>特性来源</h4>
      <div class="contrib">
        <div v-for="(c, i) in preview.contributions" :key="i" class="contrib-row" :class="c.status">
          <span class="dot"></span>
          <span class="name">{{ traitName(c.traitId) }}<i v-if="c.sourceId !== c.traitId" class="mono dim"> {{ c.sourceId }}</i><i v-if="c.duration > 0 && c.status !== 'expired'" class="timed-tag">{{ c.duration }}s</i></span>
          <span class="from">{{ c.from }}</span>
          <span class="note stitched-note" v-if="c.stitched && c.stitched.length">缝合：{{ stitchText(c.stitched) }}</span>
          <span class="note" v-if="c.note">{{ c.note }}</span>
        </div>
      </div>

      <template v-if="sheetPreview">
        <h4>角色 <small>{{ sheetPreview.count }} 条角色词条 · 不含限时条目</small></h4>
        <table class="stat-table">
          <tr v-for="r in sheetPreview.panel" :key="r.name"><td>{{ r.name }}</td><td></td><td><b>{{ r.value }}</b></td></tr>
        </table>
        <p class="hint">20 秒推演：每 0.5 秒受到 40 点轮换元素命中，每秒施法 2 次、每次 2 段命中，每 1.5 秒击杀一个敌人。</p>
        <div class="sheet-curve" title="绿色 = 气血，蓝色 = 护盾">
          <div v-for="s in sheetPreview.curve" :key="s.t" class="sc-bar"><i class="life" :style="{height: s.life + '%'}"></i><i class="shield" :style="{height: s.shield + '%'}"></i></div>
        </div>
        <div class="kpis">
          <div><span>存活</span><b>{{ sheetPreview.run.diedAt === null ? '20s+' : fmt(sheetPreview.run.diedAt, 1) + 's' }}</b><i>无词条 {{ sheetPreview.base.diedAt === null ? '20s+' : fmt(sheetPreview.base.diedAt, 1) + 's' }}</i></div>
          <div><span>恢复气血</span><b>{{ fmt(sheetPreview.run.totals.lifeRecovered, 0) }}</b></div>
          <div><span>恢复护盾</span><b>{{ fmt(sheetPreview.run.totals.shieldRecovered, 0) }}</b></div>
          <div><span>伤害系数</span><b>{{ sheetPreview.damageDelta >= 0 ? '+' : '' }}{{ fmt(sheetPreview.damageDelta, 0) }}%</b></div>
        </div>
        <p class="hint" v-if="sheetPreview.run.castsFailed">资源不足未能施法 {{ sheetPreview.run.castsFailed }} 次。</p>
        <p class="hint" v-if="sheetPreview.run.totals.triggers">触发 {{ sheetPreview.run.totals.triggers }} 次：{{ sheetPreview.run.events.slice(0, 3).join('；') }}</p>
      </template>

      <h4>属性 <small>(set|base + Σadd) × (1+Σinc%) × Πmore</small></h4>
      <table class="stat-table">
        <tr v-for="s in preview.d.stats" :key="s.name"><td>{{ s.name }}</td><td class="dim">{{ breakdown(s) }}</td><td><b>{{ fmt(s.value, 3) }}</b></td></tr>
        <tr v-if="!preview.d.stats.length"><td colspan="3" class="dim">没有属性修饰</td></tr>
      </table>

      <h4>事件 → 规则</h4>
      <div class="events">
        <div v-for="e in preview.d.events" :key="e.event" class="event-row"><span class="ev">{{ e.event }}</span><span v-for="r in e.rules" :key="r.trait + r.id" class="mini">{{ traitName(r.trait.split('~')[0]) }}</span></div>
      </div>

      <div class="block-head"><h4>试打 <small>15 个目标 · 3 次施法</small></h4><button class="btn sm primary" @click="runTest">运行</button></div>
      <div v-if="test">
        <div class="banner bad" v-if="test.error">{{ test.error }}</div>
        <template v-else>
          <div class="kpis">
            <div><span>总伤害</span><b>{{ fmt(test.total.damage, 0) }}</b><i v-if="test.delta !== null" :class="test.delta >= 0 ? 'up' : 'down'">{{ test.delta >= 0 ? '+' : '' }}{{ fmt(test.delta, 0) }}%</i></div>
            <div><span>命中</span><b>{{ test.total.hits }}</b></div>
            <div><span>暴击</span><b>{{ test.total.crits }}</b></div>
            <div><span>击杀</span><b>{{ test.total.kills }}</b><i>/ 15</i></div>
          </div>
          <div class="elem-bars">
            <div v-for="e in test.elements" :key="e.name" class="elem"><span>{{ e.cn }}</span><div class="bar"><i :style="{width: e.pct + '%', background: e.color}"></i></div><b>{{ fmt(e.damage, 0) }}</b></div>
          </div>
          <p class="hint" v-if="test.delta !== null">对比基线：只有测试技能「{{ builds.find(b => b.id === testSkill)?.name }}」时总伤害 {{ fmt(test.baseline, 0) }}。</p>
          <template v-if="test.grants.length">
            <h4>持续时间触发 <small>{{ test.grantCount }} 次</small></h4>
            <div class="grant-log">
              <div v-for="(g, i) in test.grants" :key="i" class="grant-row" :class="{refresh: g.refreshed}">
                <span class="mono">{{ fmt(g.frame / 60, 2) }}s</span>
                <span>{{ g.target === 'self' ? '自身' : '目标 #' + g.target }}</span>
                <b>{{ g.traits.map(traitName).join('、') }}</b>
                <i>{{ g.refreshed ? '刷新' : '获得' }} {{ fmt(g.duration, 1) }}s</i>
              </div>
            </div>
          </template>
          <template v-if="test.timeline">
            <h4>时间线 <small>每秒施放一次 · 每秒伤害</small></h4>
            <div class="timeline-chart">
              <div v-for="b in test.timeline" :key="b.t" class="tl-bar" :class="{held: b.held}" :title="b.t + 's：' + fmt(b.damage, 0)">
                <i :style="{height: b.pct + '%'}"></i><span>{{ b.t }}</span>
              </div>
            </div>
            <p class="hint">亮色柱为限时特性生效期间；生效期平均 {{ fmt(test.heldAvg, 0) }}/秒，过期后平均 {{ fmt(test.expiredAvg, 0) }}/秒。</p>
          </template>
        </template>
      </div>
    </template>
  </aside>

  <!-- ======================= trait picker ======================= -->
  <div class="modal-mask" v-if="picker.open" @click.self="picker.open=false">
    <div class="modal">
      <div class="modal-head">
        <h3>{{ picker.target ? '缝合到「' + traitName(picker.target.id) + '」' : '添加特性' }}</h3>
        <div class="search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input v-model="picker.query" placeholder="搜索特性名、id、描述…" ref="pickerInput"></div>
        <div class="seg">
          <button :class="{on: picker.kind==='all'}" @click="picker.kind='all'">全部</button>
          <button v-for="(n, k) in TRAIT_KIND_NAMES" :key="k" :class="{on: picker.kind===k}" @click="picker.kind=k">{{ n }}</button>
        </div>
        <button class="icon" @click="picker.open=false"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      </div>
      <div class="picker-grid">
        <div v-for="t in pickerTraits" :key="t.id" class="pick" :class="['k-' + t.kind, {taken: has(t.id)}]" @click="addTrait(t.id)">
          <div class="tc-head"><span class="kind-badge" :class="'k-' + t.kind">{{ TRAIT_KIND_NAMES[t.kind] }}</span><div class="tc-title"><b>{{ t.name }}</b><span class="mono dim">{{ t.id }}</span></div><span class="pill" v-if="has(t.id)">已{{ picker.target ? '缝合' : '添加' }}</span></div>
          <p class="tc-desc">{{ t.description || '（无描述）' }}</p>
          <div class="tc-meta">
            <span v-for="ev in t.events" :key="ev" class="mini">on {{ ev }}</span>
            <span class="mini" v-if="t.modifiers">{{ t.modifiers }} 个修饰</span>
            <span class="mini warn" v-if="t.parent">依赖 {{ traitName(t.parent) }}</span>
            <span class="mini" v-for="(v, k) in t.params" :key="k">{{ k }}={{ fmt(v) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
<div class="ed-loading" v-else>{{ store.error || '加载规则库…' }}</div>
`;

const TraitTier = {
  props: { entry: { type: Object, required: true } },
  setup(props) {
    const profile = computed(() => { store.version; return store.library ? traitTierProfile(store.library, props.entry.id) : null; });
    const choose = value => {
      if (value === '') { delete props.entry.tier; return; }
      const created = createTraitValueEntry(store.library, props.entry.id, { tier: Number(value) });
      props.entry.tier = created.tier;
      props.entry.params = created.params;
    };
    return { profile, choose, tiers: Array.from({ length: TRAIT_TIER_COUNT }, (_, i) => i + 1), fmt };
  },
  template: /* html */ `
    <div class="trait-tier" v-if="profile">
      <div class="trait-tier-pick">
        <label><span>数值阶级</span><select :aria-label="'特性阶级 ' + entry.id" :value="entry.tier ?? ''" @change="choose($event.target.value)">
          <option value="">原数值 / 自定义</option><option v-for="t in tiers" :key="t" :value="t">{{ t }} 阶</option>
        </select></label>
        <button type="button" class="btn ghost sm" :disabled="!entry.tier" @click="choose(entry.tier)">重新生成数值</button>
      </div>
      <details class="trait-tier-ranges"><summary>查看 10 阶数值区间</summary><table><thead><tr><th>阶</th><th v-for="(_, name) in profile.params" :key="name">{{ name }}</th></tr></thead>
        <tbody><tr v-for="t in tiers" :key="t" :class="{on:entry.tier===t}"><td>{{ t }}</td><td v-for="(p, name) in profile.params" :key="name">{{ fmt(p.tiers[t-1][0]) }}–{{ fmt(p.tiers[t-1][1]) }}</td></tr></tbody>
      </table></details>
    </div>`,
};

// Traits stitched into a "附带持续时间" wrapper; recursive for wrappers inside wrappers.
const StitchList = {
  name: 'stitch-list',
  props: { entries: { type: Array, required: true }, depth: { type: Number, default: 1 } },
  setup() { return { ...inject('stitch') }; },
  template: /* html */ `
  <div class="stitch-list">
    <div v-for="(child, i) in entries" :key="i + ':' + child.id" class="stitch-item" :class="['k-' + traitInfo(child.id).kind, {missing: !traitInfo(child.id).exists}]">
      <div class="tc-head">
        <span class="kind-badge" :class="'k-' + traitInfo(child.id).kind">{{ TRAIT_KIND_NAMES[traitInfo(child.id).kind] || '?' }}</span>
        <div class="tc-title"><b>{{ traitInfo(child.id).name }}</b><span class="mono dim">{{ child.id }}</span></div>
        <span class="mini warn" v-if="traitInfo(child.id).parent">依赖 {{ traitName(traitInfo(child.id).parent) }}</span>
        <button class="icon bad" @click="entries.splice(i, 1)" title="移除"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      </div>
      <trait-tier :entry="child"></trait-tier>
      <div class="params" v-if="Object.keys(traitInfo(child.id).params).length">
        <label v-for="(def, key) in traitInfo(child.id).params" :key="key" class="param" :class="{over: child.params[key] !== undefined}">
          <span>{{ key }}</span>
          <input type="number" step="any" :placeholder="fmt(def)" :value="child.params[key] ?? ''" @input="setParam(child, key, $event.target.value)">
          <i v-if="child.params[key] !== undefined" @click="setParam(child, key, '')" title="恢复默认">默认 {{ fmt(def) }}</i>
        </label>
      </div>
      <div class="stitch nested" v-if="traitInfo(child.id).stitchable">
        <div class="stitch-head">
          <svg viewBox="0 0 24 24"><path d="M4 12h4l3-7 4 14 3-7h2"/></svg>
          <span>缝合的特性 <i>{{ stitchHint(child) }}</i></span>
          <button class="btn sm" v-if="depth < MaxStitchDepth" @click="openPicker(child, depth + 1)"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>缝合特性</button>
        </div>
        <stitch-list :entries="child.with" :depth="depth + 1"></stitch-list>
      </div>
    </div>
    <div class="stitch-empty" v-if="!entries.length">还没有缝合特性。点“缝合特性”，属性、触发、主动、甚至另一个“附带持续时间”都可以缝进来。</div>
  </div>`,
};

function editorComponent(kind) {
  return {
    template: TEMPLATE,
    setup() {
      const ui = KIND_UI[kind];
      const query = ref('');
      const group = ref('all');
      const selectedKey = ref(null);
      const draft = ref(null);
      const originalText = ref('');
      const isNew = ref(false);
      const saving = ref(false);
      const tagText = ref('');
      const picker = reactive({ open: false, query: '', kind: 'all', target: null, depth: 0 });
      const pickerInput = ref(null);
      const testSkill = ref('frost_lance');
      const loadout = ref([]);
      const test = ref(null);

      const library = () => store.library;
      const availableRarities = computed(() => kind === 'item' && draft.value?.category === 'map' ? RARITIES.filter(r => ['common','magic','rare'].includes(r.id)) : RARITIES);
      const mapAffixLabel = rarity => ({common:'0 条词缀',magic:'1–2 条词缀',rare:'3–6 条词缀'}[rarity] || '');
      watch(() => draft.value?.category, category => {
        if (kind !== 'item' || !draft.value) return;
        if (category === 'map') { draft.value.tier ??= 1; draft.value.skill = ''; if (!['common','magic','rare'].includes(draft.value.rarity)) draft.value.rarity = 'common'; }
        else delete draft.value.tier;
      });
      const collectionDirectory = computed(() => kind === 'skill' && library()?.trait(draft.value?.active)?.webOnly ? 'WebBuilds' : COLLECTION_KINDS[kind].dir);
      const entries = computed(() => {
        store.version; // dependency
        if (!store.collections) return [];
        return [...store.collections[kind].entries()].map(([key, e]) => ({ key, ...e }))
          .sort((a, b) => a.doc?.category === 'map' && b.doc?.category === 'map' ? a.doc.tier - b.doc.tier || ['common','magic','rare'].indexOf(a.doc.rarity) - ['common','magic','rare'].indexOf(b.doc.rarity) : String(a.doc?.name || a.key).localeCompare(String(b.doc?.name || b.key), 'zh'));
      });
      const groupOptions = computed(() => (kind === 'equipment' ? SLOTS : kind === 'item' ? ITEM_CATEGORIES : [{ id: 'player', name: '玩家' }, { id: 'monster', name: '怪物' }])
        .filter(g => entries.value.some(e => e.doc && groupId(e.doc) === g.id)));
      const groupId = doc => (kind === 'equipment' ? doc.slot : kind === 'item' ? doc.category : /^monster_/.test(doc.id) ? 'monster' : 'player');
      const groupName = doc => (kind === 'equipment' ? nameOf(SLOTS, doc.slot) : kind === 'item' ? nameOf(ITEM_CATEGORIES, doc.category) : `${doc.traits.length > 1 ? '组合' : '单特性'}`);
      const filtered = computed(() => {
        const q = query.value.trim().toLowerCase();
        return entries.value.filter(e => {
          if (group.value !== 'all' && (!e.doc || groupId(e.doc) !== group.value)) return false;
          if (!q) return true;
          const hay = [e.key, e.doc?.name, e.doc?.description, ...(e.doc?.tags || []), ...(e.doc?.traits || []).map(t => `${t.id} ${traitName(t.id)}`)].join(' ').toLowerCase();
          return hay.includes(q);
        });
      });

      const allTraits = computed(() => { store.version; return library() ? [...library().traits.values()].map(describeTrait) : []; });
      const baseOptions = computed(() => draft.value?.slot === 'weapon'
        ? ['flat_physical', 'flat_frost', 'flat_fire', 'flat_lightning', 'flat_void', 'flat_poison'].filter(id => library()?.trait(id))
        : ['armour', 'evasion', 'shield_base']);
      const setBase = id => { if (id) draft.value.bases = [{ id, params: {}, duration: 0, with: [] }]; else delete draft.value.bases; };
      const builds = computed(() => { store.version; return library() ? [...library().builds.values()].map(b => ({ id: b.id, name: b.displayName || b.id })) : []; });
      const traitInfo = id => {
        const t = allTraits.value.find(x => lower(x.id) === lower(id));
        return t ? { ...t, exists: true } : { id, name: id, description: '特性不存在', params: {}, events: [], modifiers: 0, kind: 'missing', parent: '', exists: false };
      };
      const traitName = id => (library()?.trait(id) ? library().traitDisplayName(id) : id);
      const nameOf = (list, id) => byId(list, id)?.name || id;

      const draftText = computed(() => (draft.value ? serializeCollection(kind, draft.value) : ''));
      const dirty = computed(() => draft.value && draftText.value !== originalText.value);
      const check = computed(() => {
        if (!draft.value || !library()) return { error: '', warnings: [] };
        const { doc, error } = parseCollection(kind, draftText.value);
        if (!doc) return { error, warnings: [] };
        if (isNew.value && store.collections[kind].has(lower(doc.id))) return { error: `id ${doc.id} 已存在`, warnings: [] };
        return validateCollection(kind, doc, library());
      });

      function load(key) {
        const entry = store.collections[kind].get(key);
        selectedKey.value = key;
        isNew.value = false;
        test.value = null;
        if (!entry?.doc) { draft.value = null; return; }
        draft.value = clone(entry.doc);
        originalText.value = serializeCollection(kind, entry.doc);
        if (kind === 'equipment' && draft.value.skills[0]) testSkill.value = draft.value.skills[0];
        if (kind === 'item' && draft.value.skill) testSkill.value = draft.value.skill;
      }
      const confirmDiscard = () => !dirty.value || window.confirm('当前修改还没保存，确定放弃？');
      function select(key) { if (key !== selectedKey.value && confirmDiscard()) load(key); }
      function createNew() {
        if (!confirmDiscard()) return;
        let n = 1;
        while (store.collections[kind].has(`new_${kind}_${n}`)) ++n;
        draft.value = emptyCollection(kind, `new_${kind}_${n}`);
        if (kind === 'item' && group.value === 'map') Object.assign(draft.value,{category:'map',tier:1,rarity:'common',stack:1});
        draft.value.name = `新${ui.title}`;
        if (kind === 'skill') { draft.value.traits = [{ id: 'create_ice_lance', params: {}, duration: 0 }]; draft.value.active = 'create_ice_lance'; }
        originalText.value = '';
        isNew.value = true;
        selectedKey.value = null;
        test.value = null;
      }
      function duplicate() {
        if (!draft.value) return;
        const copy = clone(draft.value);
        let id = `${copy.id}_copy`, n = 2;
        while (store.collections[kind].has(id)) id = `${copy.id}_copy${n++}`;
        copy.id = id;
        copy.name = `${copy.name}（副本）`;
        draft.value = copy;
        originalText.value = '';
        isNew.value = true;
        selectedKey.value = null;
      }
      function revert() { if (isNew.value) { draft.value = null; isNew.value = false; } else load(selectedKey.value); }

      async function save() {
        if (check.value.error || saving.value) return;
        saving.value = true;
        try {
          const directory = collectionDirectory.value;
          const path = `${directory}/${draft.value.id}.json`;
          const response = await fetch(`/api/rules/${path}`, { method: 'PUT', body: draftText.value });
          const result = await response.json();
          if (!response.ok) { notify(`保存失败：${result.error}`, true); return; }
          const key = lower(draft.value.id);
          await reloadStore();
          load(key);
          notify(`已保存 ${path}${kind === 'skill' ? directory === 'WebBuilds' ? '（网页技能）' : '（UE 下次加载规则库时生效）' : ''}`);
          window.dispatchEvent(new CustomEvent('rulestudio:changed'));
        } finally { saving.value = false; }
      }
      async function remove() {
        const id = draft.value.id;
        const users = referencesTo(store.collections, id).filter(r => kind === 'skill' ? r.as === 'skill' : false);
        if (users.length) { notify(`不能删除：${users.map(u => u.name || u.id).join('、')} 仍在使用`, true); return; }
        const extra = kind === 'skill' && GAME_BUILDS.has(id) ? '\n\n注意：游戏脚本直接按 id 使用这个技能，删除后游戏里会施法失败。' : '';
        if (!window.confirm(`删除 ${ui.title}「${draft.value.name || id}」？${extra}`)) return;
        const path = store.collections[kind].get(id)?.path || `${COLLECTION_KINDS[kind].dir}/${id}.json`;
        const response = await fetch(`/api/rules/${path}`, { method: 'DELETE' });
        const result = await response.json();
        if (!response.ok) { notify(`删除失败：${result.error}`, true); return; }
        await reloadStore();
        draft.value = null;
        selectedKey.value = null;
        notify(`已删除 ${path}`);
        window.dispatchEvent(new CustomEvent('rulestudio:changed'));
      }

      const has = id => {
        const list = picker.target ? picker.target.with : draft.value?.traits;
        // Wrappers can be added again (each one is its own triggered effect).
        return !!list?.some(t => lower(t.id) === lower(id)) && !traitInfo(id).stitchable;
      };
      // target: null = the collection itself, or a wrapper entry to stitch traits into (depth = nesting level).
      function openPicker(target = null, depth = 0) {
        picker.target = target;
        picker.depth = depth;
        picker.open = true;
        picker.query = '';
        setTimeout(() => pickerInput.value?.focus(), 30);
      }
      const KIND_ORDER = ['active', 'timed', 'affix', 'rule', 'stat', 'monster'];
      const pickerTraits = computed(() => {
        const q = picker.query.trim().toLowerCase();
        return allTraits.value.filter(t => (picker.kind === 'all' || t.kind === picker.kind) && (!q || `${t.id} ${t.name} ${t.description}`.toLowerCase().includes(q)))
          .filter(t => !(kind === 'skill' && t.webOnly) && !(t.stitchable && picker.depth >= MaxStitchDepth))
          .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
      });
      function addTrait(id) {
        if (has(id)) return;
        const entry = kind !== 'skill' && traitTierProfile(library(), id)
          ? createTraitValueEntry(library(), id, { tier: 1 }) : { id, params: {}, duration: 0, with: [] };
        const list = picker.target ? picker.target.with : draft.value.traits;
        list.push(entry);
        if (kind === 'skill' && !draft.value.active) draft.value.active = id;
        // A new wrapper: continue straight into choosing what to stitch into it.
        if (traitInfo(id).stitchable && kind !== 'skill') { picker.target = list[list.length - 1]; picker.depth += 1; picker.query = ''; picker.kind = 'all'; }
      }
      const grantTargetText = id => (traitInfo(id).stitchTarget === 'self' ? '自身' : '命中的目标');
      const stitchHint = entry => {
        const info = traitInfo(entry.id);
        if (info.stitchTarget === 'cast') return '触发时作为辅助技能施放（需要一个主动特性）';
        return `触发后${grantTargetText(entry.id)}获得，持续 ${fmt(entry.params.duration ?? info.params.duration ?? 0)} 秒`;
      };
      const stitchText = list => list.map(s => (s.with?.length ? `${s.name}（${stitchText(s.with)}）` : s.name)).join('、');
      provide('stitch', { traitInfo, traitName, fmt, setParam, openPicker, grantTargetText, stitchHint, TRAIT_KIND_NAMES, MaxStitchDepth });
      function removeTrait(i) {
        const [removed] = draft.value.traits.splice(i, 1);
        if (kind === 'skill' && removed.id === draft.value.active) draft.value.active = draft.value.traits.find(t => traitInfo(t.id).kind === 'active')?.id || draft.value.traits[0]?.id || '';
      }
      function move(i, d) { const list = draft.value.traits; [list[i], list[i + d]] = [list[i + d], list[i]]; }
      function setParam(entry, key, text) {
        if (text === '' || text === null) { delete entry.params[key]; delete entry.tier; return; }
        const value = Number(text);
        if (Number.isFinite(value)) {
          entry.params[key] = value;
          if (entry.tier !== undefined && validateTraitValueEntry(library(), entry)) delete entry.tier;
        }
      }
      function setDuration(entry, text) {
        const value = Number(text);
        entry.duration = text === '' || !(value > 0) ? 0 : Math.min(MAX_DURATION, value);
      }
      function addTag() { const t = tagText.value.trim(); if (t && !draft.value.tags.includes(t)) draft.value.tags.push(t); tagText.value = ''; }
      function tagBackspace() { if (!tagText.value && draft.value.tags.length) draft.value.tags.pop(); }
      function toggleSkill(id) {
        const s = draft.value.skills;
        if (draft.value.slot === 'weapon') { draft.value.skills = s.includes(id) ? [] : [id]; return; }
        const i = s.indexOf(id); if (i >= 0) s.splice(i, 1); else s.push(id);
      }

      const loadoutOptions = computed(() => {
        store.version;
        const out = [];
        for (const k of ['equipment', 'item']) {
          for (const [key, e] of store.collections?.[k] || []) {
            if (!e.doc || e.doc.category === 'map' || (k === kind && key === selectedKey.value)) continue;
            out.push({ key: `${k}:${key}`, name: e.doc.name || e.doc.id, rarity: e.doc.rarity });
          }
        }
        return out;
      });
      function toggleLoadout(key) { const i = loadout.value.indexOf(key); if (i >= 0) loadout.value.splice(i, 1); else loadout.value.push(key); test.value = null; }
      const loadoutParts = () => loadout.value.map(key => {
        const [k, id] = key.split(':');
        const e = store.collections[k]?.get(id);
        return e?.doc ? { kind: k, doc: e.doc, label: e.doc.name || e.doc.id } : null;
      }).filter(Boolean);

      const partsFor = includeSelf => [...(includeSelf && kind !== 'skill' ? [{ kind, doc: draft.value, label: draft.value.name || draft.value.id }] : []), ...loadoutParts()];
      function aggregateFor(includeSelf, time = 0) {
        const parts = partsFor(includeSelf);
        if (kind === 'skill') return aggregate(library(), includeSelf ? draft.value : null, parts, time);
        return aggregate(library(), testSkill.value, parts, time);
      }
      // Timed entries: preview at "seconds since use" (slider), timeline in the test.
      const at = ref(0);
      const timedBounds = computed(() => { draftText.value; loadout.value.length; return draft.value ? timedBoundaries(partsFor(true)) : []; });
      const timedMax = computed(() => (timedBounds.value.length ? timedBounds.value[timedBounds.value.length - 1] : 0));
      watch(timedMax, max => { if (at.value > max + 1) at.value = 0; });

      const preview = computed(() => {
        if (!draft.value || !library()) return { error: '加载中', contributions: [] };
        const parsed = parseCollection(kind, draftText.value);
        if (!parsed.doc) return { error: parsed.error, contributions: [] };
        const agg = aggregateFor(true, at.value);
        if (!agg.source) return { error: agg.error, contributions: agg.contributions };
        const compiled = compileBuild(agg.source);
        if (!compiled.plan) return { error: `编译失败：${compiled.error}`, contributions: agg.contributions };
        const contributions = markEnabled(agg.contributions, compiled.plan, library());
        return { error: '', d: describePlan(compiled.plan), contributions, enabled: contributions.filter(c => c.status === 'on').length, source: markRaw(agg.source) };
      });
      watch(draftText, () => { test.value = null; });
      // Character affixes (sheet) of this collection + equipped ones: panel and a 20s headless fight.
      const sheetPreview = computed(() => {
        if (!draft.value || !library() || preview.value.error) return null;
        const lib = library();
        const entries = [];
        const collect = (doc, kindOf) => {
          for (const entry of doc.traits) {
            if (entry.duration > 0) continue;
            const source = sourceFromEntry(lib, entry);
            if (source?.sheet) entries.push({ source, equipment: kindOf === 'equipment', label: lib.traitDisplayName(entry.id) });
          }
        };
        if (kind !== 'skill') collect(draft.value, kind);
        for (const part of loadoutParts()) collect(part.doc, part.kind);
        if (!entries.length) return null;
        const opts = { seconds: 20 };
        const run = simulateCharacter(entries, opts);
        const base = simulateCharacter([], opts);
        const max = Math.max(run.maxLife + run.shieldCap, 1);
        const curve = run.samples.filter((_, i) => i % 2 === 0).map(s => ({ t: s.t, life: (s.life / max) * 100, shield: (s.shield / max) * 100 }));
        return {
          panel: run.panel, curve, run, base, count: entries.length,
          damageDelta: (run.averageDamageFactor / Math.max(1e-6, base.averageDamageFactor) - 1) * 100,
        };
      });
      watch(testSkill, () => { test.value = null; });
      watch(() => draft.value?.id, () => { at.value = 0; });

      function combatOf(source) {
        return runCombat([], { source, library: library(), statusDefs: library().statusDefs(), layout: 'pack', count: 15, health: 80, casts: 3, castInterval: 30, frames: 600, seed: 11 });
      }
      function runTest() {
        const p = preview.value;
        if (p.error) return;
        const result = combatOf(aggregateFor(true, 0).source || p.source);
        if (result.error) { test.value = { error: result.error }; return; }
        let baseline = null;
        if (kind !== 'skill') {
          const base = aggregate(library(), testSkill.value, []);
          const r = base.source ? combatOf(base.source) : null;
          baseline = r && !r.error ? r.total.damage : null;
        }
        const sums = {};
        for (const row of result.rows) sums[row.element] = (sums[row.element] || 0) + row.amount;
        const max = Math.max(1, ...Object.values(sums));
        let timeline = null, heldAvg = 0, expiredAvg = 0;
        if (timedMax.value > 0) {
          // One cast per second against sturdy targets; the build follows the timed entries over time.
          const seconds = Math.ceil(timedMax.value) + 4;
          const run = runCombat([], { sourceAt: t => aggregateFor(true, t).source, library: library(), statusDefs: library().statusDefs(), layout: 'pack', count: 15, health: 1e7, casts: seconds, castInterval: 60, frames: seconds * 60 + 90, seed: 11 });
          if (!run.error) {
            const buckets = Array.from({ length: seconds }, (_, t) => ({ t, damage: 0, held: t < timedMax.value }));
            for (const row of run.rows) buckets[Math.min(seconds - 1, Math.floor(row.frame / 60))].damage += row.amount;
            const top = Math.max(1, ...buckets.map(b => b.damage));
            timeline = buckets.map(b => ({ ...b, pct: (b.damage / top) * 100 }));
            const avg = list => (list.length ? list.reduce((n, b) => n + b.damage, 0) / list.length : 0);
            heldAvg = avg(timeline.filter(b => b.held));
            expiredAvg = avg(timeline.filter(b => !b.held));
          }
        }
        test.value = {
          timeline, heldAvg, expiredAvg,
          grants: result.grants.slice(0, 8), grantCount: result.grants.length,
          total: result.total, baseline,
          delta: baseline ? (result.total.damage / baseline - 1) * 100 : null,
          elements: Object.entries(sums).sort((a, b) => b[1] - a[1]).map(([name, damage]) => ({ name, cn: ELEMENT_CN[name] || name, damage, pct: (damage / max) * 100, color: ELEMENT_COLORS[name] || '#9fb0c6' })),
        };
      }

      const breakdown = s => [s.set !== null ? `= ${fmt(s.set, 3)}` : `基础 ${fmt(s.default, 3)}`, s.add ? `${s.add > 0 ? '+' : ''}${fmt(s.add, 3)}` : '', s.increased ? `+${fmt(s.increased)}%` : '', s.more !== 1 ? `×${fmt(s.more, 3)}` : ''].filter(Boolean).join('  ');

      const onKey = e => {
        if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 's') return;
        if (!root.value || !root.value.offsetParent) return;
        e.preventDefault();
        save();
      };
      const root = ref(null);
      onMounted(() => { window.addEventListener('keydown', onKey); });
      onBeforeUnmount(() => window.removeEventListener('keydown', onKey));

      // Select the first entry once data arrives; keep selection after reloads.
      watch(() => store.version, () => {
        if (!draft.value && !isNew.value && entries.value.length) load(entries.value[0].key);
      }, { immediate: true });

      return {
        store, ui, kind, query, group, groupOptions, groupName, filtered, entries, selectedKey, draft, isNew, saving, dirty, check, draftText, tagText,
        picker, pickerInput, at, timedBounds, timedMax, setDuration, pickerTraits, testSkill, loadout, loadoutOptions, test, preview, builds, root,
        RARITIES, availableRarities, mapAffixLabel, SLOTS, ITEM_CATEGORIES, COLLECTION_KINDS, TRAIT_KIND_NAMES, collectionDirectory,
        traitInfo, traitName, nameOf, iconSrc, fmt, breakdown, has, grantTargetText, stitchHint, stitchText, sheetPreview, baseOptions, setBase,
        select, createNew, duplicate, revert, save, remove, openPicker, addTrait, removeTrait, move, setParam, addTag, tagBackspace, toggleSkill, toggleLoadout, runTest,
      };
    },
    mounted() { this.root = this.$el.parentElement; },
  };
}

export function mountEditors() {
  for (const kind of ['skill', 'equipment', 'item']) {
    const el = document.getElementById(`editor-${kind}`);
    if (el) createApp(editorComponent(kind)).component('stitch-list', StitchList).component('trait-tier', TraitTier).mount(el);
  }
  const toastHost = document.getElementById('vtoast');
  if (toastHost) {
    createApp({ template: '<transition name="toast"><div v-if="store.toast" class="vtoast" :class="{bad: store.toast.bad}">{{ store.toast.text }}</div></transition>', setup: () => ({ store }) }).mount(toastHost);
  }
  return reloadStore();
}

export { ID_PATTERN };

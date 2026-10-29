// Editor for the existing tag -> family -> reroll-pool index. No separate membership model.
import { createApp, computed, ref, watch, onMounted, onBeforeUnmount } from '/vendor/vue.esm-browser.prod.js';
import { store, reloadStore, notify } from '/editors.mjs';
import { DEFAULT_TAG_FILE, parseTagFile, buildTagIndex, checkTagIndex, deriveTraitTags, rerollPool, affixFamilies, omenFamily } from '/engine/index.mjs';
import { AffixCategories } from '/affix-categories.mjs';

const lower = value => String(value).toLowerCase();
const serialize = value => JSON.stringify(value, null, 2) + '\n';
const sourceFile = files => files.find(file => lower(file.path) === lower(DEFAULT_TAG_FILE));

const TEMPLATE = /* html */ `
<div class="family-editor" ref="root" v-if="draft && store.library">
  <nav class="family-page-tabs seg" role="tablist" aria-label="特性族页面"><button type="button" role="tab" :aria-selected="pageView === 'families'" :class="{on: pageView === 'families'}" @click="pageView = 'families'">特性族管理</button><button type="button" role="tab" :aria-selected="pageView === 'categories'" :class="{on: pageView === 'categories'}" @click="pageView = 'categories'">词缀分类</button></nav>
  <header class="family-toolbar" v-show="pageView === 'families'">
    <div><h2>特性族 <small>{{ draft.families.length }} 族 · {{ allTraits.length }} 特性</small></h2>
      <p>标签决定族归属；一个特性可以属于多个族。预兆按族限定洗炼词条池。</p></div>
    <div class="row gap"><span class="family-unsaved" v-if="dirty">未保存</span>
      <button class="btn" :disabled="!dirty || saving" @click="restore">还原</button>
      <button class="btn primary" :disabled="!dirty || !!validation || saving" @click="save">{{ saving ? '保存中…' : '保存全部' }} <kbd>Ctrl S</kbd></button></div>
  </header>
  <div class="family-error" role="alert" v-if="pageView === 'families' && (error || validation)">{{ error || validation }}</div>
  <div class="family-columns" v-show="pageView === 'families'">
    <aside class="family-sidebar card">
      <div class="row between"><h3>族</h3><button class="btn sm" @click="addFamily">新增族</button></div>
      <input aria-label="搜索特性族" v-model="familyQuery" placeholder="搜索族名称、id…">
      <div class="family-list">
        <button v-for="f in filteredFamilies" :key="f.id" class="family-entry" :class="{on: f.id === selectedId}" @click="selectFamily(f.id)">
          <span class="family-symbol">{{ f.name.charAt(0) }}</span><span class="grow"><b>{{ f.name }}族</b><small>{{ f.id }}</small><small>{{ f.members }} 特性 · {{ f.pool }} 词条</small></span>
        </button>
        <div class="empty" v-if="!filteredFamilies.length">没有匹配的族</div>
      </div>
      <p class="family-note">每个标签只属于一个族。修改标签归属后，所有使用该标签的特性和词条池一起更新。</p>
    </aside>

    <section class="family-main card" v-if="family">
      <div class="family-main-scroll">
        <div class="family-title"><h2>{{ family.name }}族</h2><button class="btn danger sm" :disabled="!canRemoveFamily" :title="canRemoveFamily ? '移除空族' : '只能移除没有标签、成员和预兆引用的族'" @click="removeFamily">移除空族</button></div>
        <div class="family-fields">
          <label><span>名称</span><input aria-label="族名称" v-model.trim="family.name"></label>
          <label><span>标识 id</span><input aria-label="族标识" class="mono" :value="family.id" :readonly="savedIds.has(selectedId) || familyTags.length > 0 || members.length > 0" @input="followId"></label>
        </div>
        <label class="family-description"><span>说明</span><textarea aria-label="族说明" v-model="family.description" rows="2"></textarea></label>
        <div class="family-metrics"><span><b>{{ members.length }}</b> 族内特性</span><span><b>{{ familyTags.length }}</b> 标签</span><span><b>{{ pool.length }}</b> 洗炼词条</span><span><b>{{ omens.length }}</b> 关联预兆</span></div>

        <details class="family-tag-editor" open>
          <summary>标签归属 <small>调整归属会影响对应特性</small></summary>
          <div class="family-tag-table">
            <div class="family-tag-row" v-for="t in familyTags" :key="t.id">
              <span><code>{{ t.id }}</code><small>{{ tagUsers(t.id) }} 特性</small></span>
              <input :aria-label="'标签名称 ' + t.id" v-model.trim="draft.tags[t.id].name">
              <select :aria-label="'标签归属 ' + t.id" v-model="draft.tags[t.id].family"><option v-for="f in draft.families" :key="f.id" :value="f.id">{{ f.name }}族</option></select>
            </div>
            <p class="family-note" v-if="!familyTags.length">此族还没有标签，可以在其他族中调整标签归属，或在下面新增。</p>
          </div>
          <form class="family-add-tag" @submit.prevent="addTag">
            <input aria-label="新标签标识" v-model.trim="newTag.id" placeholder="tag_id">
            <input aria-label="新标签名称" v-model.trim="newTag.name" placeholder="标签名称">
            <button class="btn sm" :disabled="!newTag.id || !newTag.name">新增标签</button>
          </form>
        </details>

        <div class="family-tabs seg"><button :class="{on: view === 'traits'}" @click="view = 'traits'">族内特性 {{ members.length }}</button><button :class="{on: view === 'pool'}" @click="view = 'pool'">洗炼词条 {{ pool.length }}</button></div>
        <div class="family-member-search"><input aria-label="搜索族内特性" v-model="traitQuery" :placeholder="view === 'traits' ? '搜索特性、标签、id…' : '搜索词条名称、id…'"><label v-if="view === 'traits'"><input type="checkbox" v-model="showAll">查看全部特性</label></div>
        <template v-if="view === 'traits'">
          <button class="family-member" v-for="t in visibleTraits" :key="t.id" :class="{on: t.id === traitId}" @click="traitId = t.id">
            <span class="grow"><b>{{ t.name }}</b><small>{{ t.id }}</small><span class="family-chips"><span v-for="tag in t.tags" :key="tag" :class="{hit: tagFamily(tag) === selectedId}">{{ tagName(tag) }}</span></span></span>
            <span class="family-member-kind">{{ t.path.split('/')[0] }}</span>
          </button>
          <p class="empty" v-if="!visibleTraits.length">没有匹配的特性。勾选“查看全部特性”可为其他特性追加归属。</p>
        </template>
        <template v-else>
          <p class="family-note">这是洗炼实际使用的词条池。主动技能、怪物专用与需要缝合的特性由现有规则排除；复合词条按全部组成特性归族。</p>
          <button class="family-member" v-for="a in visiblePool" :key="a.id" @click="inspectAffix(a)">
            <span class="grow"><b>{{ a.name }}</b><small>{{ a.traits.map(t => traitName(t.id)).join(' + ') }}</small><span class="family-chips"><span v-for="id in affixFamilyIds(a)" :key="id" :class="{hit: id === selectedId}">{{ familyName(id) }}</span></span></span>
          </button>
          <p class="empty" v-if="!visiblePool.length">没有匹配的洗炼词条</p>
        </template>
      </div>
    </section>

    <aside class="family-detail card">
      <template v-if="trait">
        <h3>特性归属</h3><h2>{{ trait.name }}</h2><p class="mono dim family-path">{{ trait.path }}</p><p class="family-trait-description">{{ trait.description || '此特性暂无说明。' }}</p>
        <div class="family-chips family-memberships"><button v-for="id in trait.families" :key="id" @click="selectFamily(id)">{{ familyName(id) }}</button><span v-if="!trait.families.length">尚未归族</span></div>
        <h4>自动推导的标签</h4>
        <div class="family-chips"><span v-for="tag in derivedTags" :key="tag" :title="tag + ' → ' + familyName(tagFamily(tag))">{{ tagName(tag) }}</span><span v-if="!derivedTags.length">无</span></div>
        <p class="family-note">来自元素、伤害、投射物、异常、角色属性等实际规则，随特性内容自动更新。</p>
        <h4>手动追加标签 / 族</h4>
        <div class="family-chips"><button v-for="tag in extraTags" :key="tag" :aria-label="'移除追加标签 ' + tag" @click="removeExtra(tag)">{{ tagName(tag) }} ×</button><span v-if="!extraTags.length">未追加</span></div>
        <div class="family-extra-add"><select aria-label="追加特性标签或族" v-model="extraId"><option value="">选择标签或族…</option><optgroup label="直接归族"><option v-for="f in draft.families" :key="f.id" :value="f.id">{{ f.name }}族</option></optgroup><optgroup label="标签"><option v-for="t in availableExtraTags" :key="t.id" :value="t.id">{{ t.name }} · {{ familyName(t.family) }}</option></optgroup></select><button class="btn sm" :disabled="!extraId" @click="addExtra">追加</button></div>
        <p class="family-note">追加归属与自动标签取并集；移除追加项后，自动推导的归属仍然保留。</p>
      </template>
      <h4>当前族的预兆</h4>
      <div v-for="o in omens" :key="o.id" class="family-omen"><b>{{ o.name }}</b><small>{{ o.id }}</small><span>{{ pool.length }} 种可洗炼词条</span></div>
      <p class="dim" v-if="!omens.length">此族暂无预兆物品</p>
      <details class="family-logic"><summary>归属逻辑</summary><p>特性效果 → 自动标签 + 手动标签 → 标签所属族 → 洗炼词条池。</p><p>族是洗炼分类。技能父子依赖仍由特性自身的 parent 控制。</p><code>Tags/families.json</code><p class="dim">保存后更新洗炼界面与预兆筛选。</p></details>
    </aside>
  </div>
  <AffixCategories v-show="pageView === 'categories'" />
</div>
<div class="ed-loading" v-else>{{ store.error || '未找到 Tags/families.json' }}</div>`;

export function mountFamilies(el) {
  createApp({
    components: { AffixCategories },
    template: TEMPLATE,
    setup() {
      const draft = ref(null), baseline = ref(''), original = ref(''), selectedId = ref(''), traitId = ref('death_lightning');
      const familyQuery = ref(''), traitQuery = ref(''), showAll = ref(false), view = ref('traits');
      const pageView = ref(new URLSearchParams(location.search).get('view') === 'affix-categories' ? 'categories' : 'families');
      const saving = ref(false), error = ref(''), root = ref(null), extraId = ref('');
      const newTag = ref({ id: '', name: '' });
      const text = computed(() => draft.value ? serialize(draft.value) : '');
      const dirty = computed(() => !!draft.value && text.value !== baseline.value);
      const savedIds = ref(new Set());
      const family = computed(() => draft.value?.families.find(f => f.id === selectedId.value));
      const parsed = computed(() => draft.value ? parseTagFile(text.value) : { doc: null, error: '' });
      const index = computed(() => parsed.value.doc && store.library ? buildTagIndex(store.library, parsed.value.doc) : null);
      const validation = computed(() => {
        if (parsed.value.error) return parsed.value.error;
        if (!index.value) return '';
        const err = checkTagIndex(index.value);
        if (err) return err;
        for (const { doc } of store.collections?.item?.values() || []) {
          if (doc?.category === 'omen' && !omenFamily(index.value, doc)) return `预兆「${doc.name || doc.id}」需要恰好一个族，请保留其标签对应的族名称或 id。`;
        }
        return '';
      });
      const tagName = id => index.value?.tag(id)?.name || id;
      const tagFamily = id => index.value?.tag(id)?.family || '';
      const familyName = id => index.value?.familyName(id) || id;
      const traitName = id => store.library?.traitDisplayName(id) || id;
      const allTraits = computed(() => [...(store.library?.traits.values() || [])].map(entry => ({
        id: lower(entry.source.id), name: entry.displayName || entry.source.id, description: entry.description,
        path: entry.path, tags: index.value?.tagsOf(entry.source.id) || [], families: index.value?.familiesOf(entry.source.id) || [],
      })).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')));
      const members = computed(() => allTraits.value.filter(t => t.families.includes(selectedId.value)));
      const fullPool = computed(() => store.library && index.value ? rerollPool(store.library, index.value) : []);
      const affixFamilyIds = affix => index.value ? affixFamilies(index.value, affix) : [];
      const pool = computed(() => fullPool.value.filter(a => affixFamilyIds(a).includes(selectedId.value)));
      const familyRows = computed(() => (draft.value?.families || []).map(f => ({ ...f,
        members: allTraits.value.filter(t => t.families.includes(f.id)).length,
        pool: fullPool.value.filter(a => affixFamilyIds(a).includes(f.id)).length,
      })));
      const filteredFamilies = computed(() => familyRows.value.filter(f => lower(`${f.name} ${f.id} ${f.description}`).includes(lower(familyQuery.value.trim()))));
      const familyTags = computed(() => Object.entries(draft.value?.tags || {}).filter(([, t]) => t.family === selectedId.value).map(([id, t]) => ({ id, ...t })));
      const matches = t => lower(`${t.id} ${t.name} ${t.tags?.map(tagName).join(' ') || ''}`).includes(lower(traitQuery.value.trim()));
      const visibleTraits = computed(() => (showAll.value ? allTraits.value : members.value).filter(matches));
      const visiblePool = computed(() => pool.value.filter(a => matches(a) || a.traits.some(t => lower(traitName(t.id)).includes(lower(traitQuery.value.trim())))));
      const trait = computed(() => allTraits.value.find(t => t.id === traitId.value));
      const derivedTags = computed(() => { const source = store.library?.trait(traitId.value)?.source; return source ? deriveTraitTags(source) : []; });
      const extraTags = computed(() => draft.value?.traits?.[traitId.value] || []);
      const availableExtraTags = computed(() => Object.entries(draft.value?.tags || {}).filter(([id]) => !extraTags.value.includes(id) && !derivedTags.value.includes(id)).map(([id, t]) => ({ id, ...t })));
      const omens = computed(() => [...(store.collections?.item?.values() || [])].map(e => e.doc).filter(d => d?.category === 'omen' && index.value && omenFamily(index.value, d) === selectedId.value));
      const canRemoveFamily = computed(() => draft.value?.families.length > 1 && !familyTags.value.length && !members.value.length && !omens.value.length);
      const tagUsers = id => allTraits.value.filter(t => t.tags.includes(id)).length;

      function restore() {
        const file = sourceFile(store.files);
        if (!file) return;
        try {
          draft.value = JSON.parse(file.text.replace(/^\uFEFF/, ''));
          draft.value.traits ||= {};
          original.value = file.text;
          baseline.value = text.value;
          savedIds.value = new Set(draft.value.families.map(f => f.id));
          if (!draft.value.families.some(f => f.id === selectedId.value)) selectedId.value = draft.value.families[0]?.id || '';
          error.value = '';
        } catch (e) { error.value = e.message; }
      }
      function selectFamily(id) {
        selectedId.value = id; traitQuery.value = ''; extraId.value = '';
        if (!members.value.some(t => t.id === traitId.value)) traitId.value = members.value[0]?.id || '';
      }
      function followId(event) {
        if (!family.value || savedIds.value.has(selectedId.value) || familyTags.value.length || members.value.length) return;
        const id = event.target.value.trim();
        family.value.id = id; selectedId.value = id;
      }
      function addFamily() {
        let n = 1; while (draft.value.families.some(f => f.id === `new_family_${n}`) || draft.value.tags[`new_family_${n}`]) n++;
        const f = { id: `new_family_${n}`, name: '新', description: '' };
        draft.value.families.push(f); selectFamily(f.id);
      }
      function removeFamily() {
        if (!canRemoveFamily.value) return;
        draft.value.families.splice(draft.value.families.findIndex(f => f.id === selectedId.value), 1);
        selectFamily(draft.value.families[0].id);
      }
      function addTag() {
        const { id, name } = newTag.value;
        if (!/^[a-z0-9_]+$/.test(id)) return notify('标签 id 只能包含小写字母、数字和下划线', true);
        if (Object.hasOwn(draft.value.tags, id) || draft.value.families.some(f => f.id === id)) return notify('这个标签或族 id 已存在', true);
        draft.value.tags[id] = { name, family: selectedId.value };
        newTag.value = { id: '', name: '' };
      }
      function addExtra() {
        if (!trait.value || !extraId.value || extraTags.value.includes(extraId.value)) return;
        draft.value.traits[traitId.value] = [...extraTags.value, extraId.value]; extraId.value = '';
      }
      function removeExtra(id) {
        const next = extraTags.value.filter(tag => tag !== id);
        if (next.length) draft.value.traits[traitId.value] = next; else delete draft.value.traits[traitId.value];
      }
      function inspectAffix(affix) { traitId.value = affix.traits.find(t => index.value.familiesOf(t.id).includes(selectedId.value))?.id || affix.traits[0]?.id || ''; }
      async function save() {
        if (!dirty.value || validation.value || saving.value) return;
        saving.value = true; error.value = '';
        try {
          const latest = await (await fetch('/api/rules', { cache: 'no-store' })).json();
          if (sourceFile(latest.files)?.text !== original.value) throw new Error('特性族配置已在其他页面更新。请先复制需要保留的修改，再点“还原”载入最新配置。');
          const response = await fetch(`/api/rules/${DEFAULT_TAG_FILE}`, { method: 'PUT', body: text.value });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || '保存失败');
          await reloadStore(); restore();
          window.dispatchEvent(new Event('rulestudio:changed'));
          notify('特性族已保存，洗炼词条池已更新');
        } catch (e) { error.value = e.message; }
        finally { saving.value = false; }
      }
      const onKey = event => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && pageView.value === 'families' && root.value?.offsetParent) { event.preventDefault(); save(); }
      };
      onMounted(() => window.addEventListener('keydown', onKey));
      onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
      watch(() => store.version, () => { if (!dirty.value) restore(); }, { immediate: true });
      watch(traitId, () => { extraId.value = ''; });
      watch(text, () => { if (!saving.value) error.value = ''; });
      return { store, draft, root, family, selectedId, traitId, familyQuery, traitQuery, showAll, view, pageView, dirty, saving, error, validation, savedIds,
        filteredFamilies, members, familyTags, pool, omens, allTraits, visibleTraits, visiblePool, trait, derivedTags, extraTags, availableExtraTags, extraId, newTag, canRemoveFamily,
        tagName, tagFamily, familyName, traitName, tagUsers, affixFamilyIds, restore, selectFamily, followId, addFamily, removeFamily, addTag, addExtra, removeExtra, inspectAffix, save };
    },
  }).mount(el);
}

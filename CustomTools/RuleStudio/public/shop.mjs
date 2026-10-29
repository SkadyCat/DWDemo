// GM shop: every authored skill, equipment and item is free to acquire here.
import { createApp, reactive, computed, ref, watch } from '/vendor/vue.esm-browser.prod.js';
import { store, reloadStore, notify } from '/editors.mjs';
import { player, owns, ownedCount, buy, ensureStarted, resetPlayer, autoEquip } from '/player.mjs';
import { listings, SHOP_TABS, SLOTS, ITEM_CATEGORIES, RARITIES, serializeCatalog, defaultPrice } from '/engine/index.mjs';
import { traitText } from '/affix-text.mjs';
import { iconSrc } from '/game-icons.mjs';
import { buildSkillType } from '/engine/skill-types.mjs';

const nameOf = (list, id) => list.find(x => x.id === id)?.name || id;

const TEMPLATE = /* html */ `
<div class="shop" v-if="store.library && store.catalog">
  <section class="shop-main card">
    <header class="shop-head">
      <div>
        <h2>GM 商店</h2>
        <p class="sub">所有技能、装备和物品都会自动上架 · 商品价格统一为 0 {{ store.catalog.currency.name }}</p>
      </div>
      <div class="wallet-big"><span class="stone-ico lg"></span><b>{{ player.stones }}</b><small>{{ store.catalog.currency.name }}</small></div>
    </header>
    <div class="shop-bar">
      <div class="seg">
        <button v-for="t in SHOP_TABS" :key="t.id" :class="{on: tab === t.id}" @click="tab = t.id">{{ t.name }} <i class="count">{{ countOf(t.id) }}</i></button>
      </div>
      <div class="search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input v-model="query" placeholder="搜索名称、特性…"></div>
      <select v-model="sort"><option value="price">价格从低到高</option><option value="-price">价格从高到低</option><option value="rarity">稀有度</option><option value="name">名称</option></select>
      <label class="check"><input type="checkbox" v-model="affordable"> 只看买得起</label>
      <label class="check pricing"><input type="checkbox" v-model="pricing"> 定价模式</label>
    </div>
    <div class="shop-grid">
      <article v-for="l in shown" :key="l.key" class="ware" :class="['r-' + l.rarity, {owned: l.kind === 'skill' && owns('skill', l.id), poor: player.stones < l.price}]">
        <div class="ware-head">
          <div class="tile lg" :class="'r-' + l.rarity"><img class="game-icon" :src="iconSrc(l.kind, l.doc)" :data-currency-grade="l.doc.craft?.grade" alt="" draggable="false"></div>
          <div class="ware-title">
            <b>{{ l.name }}</b>
            <span class="dim">{{ subtitle(l) }}</span>
          </div>
        </div>
        <p class="ware-desc">{{ l.description || '（无描述）' }}</p>
        <div class="ware-traits">
          <span v-if="l.doc.rarity === 'legendary' && l.doc.legendary" class="mini skill">固定传奇 · {{ traitText(l.doc.legendary, store.library) }}</span>
          <span v-for="t in l.doc.traits.filter(t => !(l.doc.rarity === 'legendary' && l.doc.legendary?.id === t.id))" :key="t.id" class="mini" :class="{timed: t.duration > 0}" :title="paramText(t)">{{ traitName(t.id) }}<em v-if="t.duration > 0"> {{ t.duration }}s</em></span>
          <span v-for="s in (l.doc.skills || [])" :key="'s' + s" class="mini skill">授予 {{ skillName(s) }}</span>
          <span v-if="l.doc.skill" class="mini skill">施放 {{ skillName(l.doc.skill) }}</span>
        </div>
        <footer class="ware-foot">
          <template v-if="pricing">
            <label class="price-edit"><span class="stone-ico"></span><input type="number" min="0" step="5" :value="draftPrice(l)" @input="setDraft(l, $event.target.value)"><i v-if="l.custom || drafts[l.key] !== undefined" @click="setDraft(l, '')" title="恢复默认价">默认 {{ defaultPrice(l.kind, l.doc) }}</i></label>
          </template>
          <template v-else>
            <div class="price"><span class="stone-ico"></span><b>{{ l.price }}</b></div>
            <span class="have" v-if="l.kind !== 'skill' && ownedCount(l.kind, l.id)">持有 {{ ownedCount(l.kind, l.id) }}</span>
            <button v-if="l.kind === 'skill' && owns('skill', l.id)" class="btn sm" disabled>已拥有</button>
            <button v-else class="btn sm primary" :disabled="player.stones < l.price" @click="purchase(l)">购买</button>
          </template>
        </footer>
      </article>
      <div v-if="!shown.length" class="empty">没有符合条件的商品</div>
    </div>
  </section>

  <aside class="shop-side card">
    <template v-if="pricing">
      <h3>定价 <small>Content/Rules/Shop/catalog.json</small></h3>
      <label class="field"><span>新存档初始灵石</span><input type="number" min="0" step="10" v-model.number="catalogDraft.startingStones"></label>
      <p class="hint">未单独定价的商品按稀有度、等级和特性数量自动定价。修改 {{ Object.keys(drafts).length }} 项。</p>
      <div class="row gap"><button class="btn primary" @click="saveCatalog" :disabled="saving">{{ saving ? '保存中…' : '保存定价' }}</button><button class="btn" @click="drafts = {}">放弃修改</button></div>
    </template>
    <template v-else>
      <h3>背包</h3>
      <div class="bag-stats mono">
        <span>累计获得 <b>{{ player.stats.earned }}</b></span><span>累计花费 <b>{{ player.stats.spent }}</b></span><span>击杀 <b>{{ player.stats.kills }}</b></span>
      </div>
      <h4>技能 <small>{{ bag.skill.length }}</small></h4>
      <div class="bag-list"><span v-for="b in bag.skill" :key="b.id" class="chip">{{ b.name }}</span><i class="dim" v-if="!bag.skill.length">无</i></div>
      <h4>装备 <small>{{ bag.equipment.length }}</small></h4>
      <div class="bag-list"><span v-for="b in bag.equipment" :key="b.id" class="chip" :class="'r-' + b.rarity">{{ b.name }}<em v-if="b.count > 1"> ×{{ b.count }}</em></span><i class="dim" v-if="!bag.equipment.length">无</i></div>
      <h4>物品 <small>{{ bag.item.length }}</small></h4>
      <div class="bag-list"><span v-for="b in bag.item" :key="b.id" class="chip" :class="'r-' + b.rarity">{{ b.name }}<em> ×{{ b.count }}</em></span><i class="dim" v-if="!bag.item.length">无</i></div>
      <p class="hint">在“3D 战斗”页击杀怪物获得灵石；买到的技能、装备和消耗品可以在战斗页右侧配装。</p>
      <div class="row gap">
        <button class="btn" @click="goBattle">去战斗</button>
        <button class="btn danger sm" @click="reset">重置存档</button>
      </div>
    </template>
  </aside>
</div>
<div class="ed-loading" v-else>{{ store.error || '加载商店…' }}</div>`;

export function mountShop(el) {
  createApp({
    template: TEMPLATE,
    setup() {
      const tab = ref('skill');
      const query = ref('');
      const sort = ref('price');
      const affordable = ref(false);
      const pricing = ref(false);
      const drafts = ref({});
      const saving = ref(false);
      const catalogDraft = reactive({ startingStones: 0 });

      watch(() => store.version, () => {
        if (!store.catalog) return;
        ensureStarted(store.catalog, store.collections, store.library);
        catalogDraft.startingStones = store.catalog.startingStones;
      }, { immediate: true });

      const all = computed(() => { store.version; return store.catalog ? listings(store.collections, store.catalog).map(l => ({ ...l, price: 0 })) : []; });
      const countOf = kind => all.value.filter(l => l.kind === kind).length;
      const rarityRank = r => (r === 'skill' ? -1 : RARITIES.findIndex(x => x.id === r));
      const traitName = id => store.library?.traitDisplayName(id) || id;
      const skillName = id => store.library?.buildDisplayName(id) || id;
      const shown = computed(() => {
        const q = query.value.trim().toLowerCase();
        const list = all.value.filter(l => l.kind === tab.value
          && (!affordable.value || l.price <= player.stones)
          && (!q || `${l.id} ${l.name} ${l.description} ${l.doc.traits.map(t => `${t.id} ${traitName(t.id)}`).join(' ')}`.toLowerCase().includes(q)));
        const by = { price: (a, b) => a.price - b.price, '-price': (a, b) => b.price - a.price, rarity: (a, b) => rarityRank(b.rarity) - rarityRank(a.rarity) || a.price - b.price, name: (a, b) => a.name.localeCompare(b.name, 'zh') }[sort.value];
        return [...list].sort(by);
      });
      const subtitle = l => {
        if (l.kind === 'skill') return `${{ aura: '光环 · 装配Q/E/F/G切换', trigger: '触发技能 · 挂载到触发词条', active: '主动技能' }[buildSkillType(store.library, l.id)]} · ${l.doc.traits.length} 个特性`;
        if (l.kind === 'equipment') return `${nameOf(SLOTS, l.doc.slot)} · ${nameOf(RARITIES, l.doc.rarity)} · Lv ${l.doc.level}`;
        return `${nameOf(ITEM_CATEGORIES, l.doc.category)} · ${nameOf(RARITIES, l.doc.rarity)} · 最多 ${l.doc.stack}`;
      };
      const paramText = t => Object.entries(t.params || {}).map(([k, v]) => `${k}=${v}`).join(' ') || '默认参数';

      function purchase(l) {
        const error = buy({ ...l, price: 0 }, l.kind === 'item' ? l.doc.stack : 9999, { collections: store.collections, library: store.library });
        if (error) { notify(error, true); return; }
        if (l.kind !== 'equipment') autoEquip(l.kind, l.id, store.collections);
        notify(l.kind === 'equipment' ? `获得了 ${l.name}（0 灵石）` : `购买了 ${l.name}（0 灵石）`);
      }

      const bag = computed(() => {
        store.version;
        const doc = (kind, id) => store.collections?.[kind]?.get(id)?.doc;
        return {
          skill: Object.keys(player.owned.skill).map(id => ({ id, name: skillName(id) })),
          equipment: [...Object.entries(player.owned.equipment).map(([id, count]) => ({ id, count, name: doc('equipment', id)?.name || id, rarity: doc('equipment', id)?.rarity })),
            ...Object.values(player.instances).map(item => ({ id: item.uid, count: 1, name: item.name + (item.identified === false ? '（未鉴定）' : ''), rarity: item.rarity }))],
          item: Object.entries(player.owned.item).map(([id, count]) => ({ id, count, name: doc('item', id)?.name || id, rarity: doc('item', id)?.rarity })),
        };
      });

      const draftPrice = l => (drafts.value[l.key] !== undefined ? drafts.value[l.key] : l.price);
      function setDraft(l, text) {
        const next = { ...drafts.value };
        if (text === '') next[l.key] = null; // back to default
        else { const v = Math.max(0, Math.round(Number(text))); if (Number.isFinite(v)) next[l.key] = v; }
        drafts.value = next;
      }
      async function saveCatalog() {
        const catalog = { ...store.catalog, prices: { ...store.catalog.prices }, startingStones: Math.max(0, Math.round(catalogDraft.startingStones || 0)) };
        for (const [key, value] of Object.entries(drafts.value)) {
          if (value === null) delete catalog.prices[key]; else catalog.prices[key] = value;
        }
        saving.value = true;
        try {
          const response = await fetch('/api/rules/Shop/catalog.json', { method: 'PUT', body: serializeCatalog(catalog) });
          const result = await response.json();
          if (!response.ok) { notify(`保存失败：${result.error}`, true); return; }
          drafts.value = {};
          await reloadStore();
          notify('定价已保存到 Shop/catalog.json');
        } finally { saving.value = false; }
      }
      function reset() {
        if (!window.confirm(`重置存档？背包与仓库清空，灵石恢复为 ${store.catalog.startingStones}，并发放初始物品。`)) return;
        resetPlayer(store.catalog, store.collections, store.library);
        notify('存档已重置');
      }
      const goBattle = () => document.querySelector('[data-tab=battle]')?.click();

      return {
        store, player, SHOP_TABS, tab, query, sort, affordable, pricing, drafts, saving, catalogDraft, shown, bag,
        owns, ownedCount, countOf, subtitle, paramText, traitName, skillName, defaultPrice, traitText, iconSrc,
        purchase, draftPrice, setDraft, saveCatalog, reset, goBattle,
      };
    },
  }).mount(el);
}

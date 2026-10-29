// Read-only view of the same slot / omen intersection used by equipment crafting.
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from '/vendor/vue.esm-browser.prod.js';
import { store } from '/editors.mjs';
import { omenFamily, SLOTS } from '/engine/index.mjs';
import { equipmentCraftAffixPool } from '/equipment-crafting.mjs';

export const BattleAffixBook = {
  props: ['omen', 'tier', 'slot', 'anchor', 'ownerPosition'],
  emits: ['close'],
  template: /* html */ `<section ref="panel" class="b3-affix-book" :style="position" role="dialog" :aria-label="omen.name + '可刷词缀'" @pointerdown.stop @keydown.stop @wheel.stop>
    <header><div><span class="b3-affix-book-caption">词缀图鉴</span><h3>{{ omen.name }}</h3><p>{{ slotName }} · {{ familyName }} · {{ pool.length }} 种词缀</p></div><button type="button" class="btn ghost sm" aria-label="关闭词缀图鉴" @click="$emit('close')">×</button></header>
    <div class="b3-affix-book-search"><input ref="search" v-model="query" type="search" aria-label="搜索可刷词缀" placeholder="搜索词缀名称" autocomplete="off"><span role="status">{{ rows.length }} / {{ pool.length }}</span></div>
    <div class="b3-affix-book-content">
      <ul v-if="rows.length"><li v-for="affix in rows" :key="affix.id" :data-affix-id="affix.id">{{ affix.name }}</li></ul>
      <p v-else class="dim">{{ query.trim() ? '没有匹配的词缀' : '该部位与预兆没有可用词缀' }}</p>
    </div>
    <footer>数值词缀按装备 T1–T{{ tier }} 生成，n 表示随机数值。<br>加工时按现有规则排除重复和冲突词缀。</footer>
  </section>`,
  setup(props) {
    const panel = ref(null), search = ref(null), query = ref(''), position = ref({ visibility: 'hidden' });
    const family = computed(() => omenFamily(store.tags, props.omen));
    const familyName = computed(() => family.value ? store.tags.familyName(family.value) : '未配置词缀族');
    const slotName = computed(() => SLOTS.find(slot => slot.id === props.slot)?.name || '全部部位');
    const pool = computed(() => family.value && store.library ? equipmentCraftAffixPool(store.library, store.tags, props.slot, family.value) : []);
    const rows = computed(() => {
      const text = query.value.trim().toLocaleLowerCase();
      return pool.value.filter(affix => !text || `${affix.name} ${affix.id}`.toLocaleLowerCase().includes(text))
        .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN') || a.id.localeCompare(b.id));
    });
    async function place() {
      await nextTick();
      if (!panel.value) return;
      const popup = panel.value.getBoundingClientRect(), anchor = props.anchor?.getBoundingClientRect();
      const margin = 12, gap = 10;
      const left = anchor ? anchor.right - popup.width : (window.innerWidth - popup.width) / 2;
      const top = anchor ? (anchor.top - popup.height - gap >= margin ? anchor.top - popup.height - gap : anchor.top) : (window.innerHeight - popup.height) / 2;
      position.value = {
        left: Math.max(margin, Math.min(left, window.innerWidth - popup.width - margin)) + 'px',
        top: Math.max(margin, Math.min(top, window.innerHeight - popup.height - margin)) + 'px', visibility: 'visible',
      };
    }
    watch(rows, place);
    watch(() => props.ownerPosition, place, { deep: true });
    watch(() => props.omen.id, () => { query.value = ''; });
    onMounted(async () => { window.addEventListener('resize', place); await place(); search.value?.focus({ preventScroll: true }); });
    onBeforeUnmount(() => window.removeEventListener('resize', place));
    return { panel, search, query, position, slotName, familyName, pool, rows };
  },
};

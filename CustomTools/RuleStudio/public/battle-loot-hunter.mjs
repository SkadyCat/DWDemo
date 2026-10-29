import { computed, ref, watch } from '/vendor/vue.esm-browser.prod.js';
import { iconSrc } from '/game-icons.mjs';

export const BattleLootHunter = {
  props: ['hunter', 'pool', 'currencies', 'shown', 'total'],
  emits: ['close', 'enable', 'target', 'currency', 'clear', 'clear-currencies', 'release'],
  template: /* html */ `<section class="b3-loot-hunter" aria-label="掉落 Hunter" @pointerenter="$emit('release')" @pointerdown.stop @pointermove.stop @keydown.stop @wheel.stop>
    <header><b>掉落 Hunter</b><button type="button" aria-label="关闭 Hunter 面板" @click="$emit('close')">×</button></header>
    <label class="b3-hunter-enabled"><input type="checkbox" :checked="hunter.enabled" @change="$emit('enable', $event.target.checked)">启用过滤 <small>{{ hunter.enabled ? '已开启' : '显示全部道具与装备' }}</small></label>
    <p class="b3-hunter-count" aria-live="polite">显示 {{ shown }} / {{ total }} 件掉落</p>
    <section class="b3-hunter-affixes" aria-label="词条 Hunter">
      <h4>词条 Hunter <small>装备 · 全部满足 AND</small></h4>
      <div class="b3-hunter-targets" aria-label="全部已选装备条件">
        <button v-for="affix in selectedAffixes" :key="affix.id" type="button" :data-hunter-remove="affix.id" :title="'取消条件：' + affix.name" @click="$emit('target', affix.id, false)">{{ affix.name }}<span aria-hidden="true">×</span></button>
        <p v-if="!selectedAffixes.length">尚未选择装备条件</p>
      </div>
      <input v-model="query" type="search" placeholder="搜索现有词条" aria-label="搜索 Hunter 词条" autocomplete="off">
      <div class="b3-hunter-toolbar"><button type="button" :aria-pressed="selectedOnly" @click="selectedOnly = !selectedOnly; page = 0">{{ selectedOnly ? '查看全部' : '仅看已选' }}</button><button type="button" @click="$emit('clear')">清空词条</button><span>已选 {{ hunter.targets.length }} · AND</span></div>
      <div class="b3-hunter-list"><button v-for="affix in rows" :key="affix.id" type="button" :data-hunter-affix="affix.id" :aria-pressed="hunter.targets.includes(affix.id)" @click="$emit('target', affix.id, !hunter.targets.includes(affix.id))"><span>{{ hunter.targets.includes(affix.id) ? '✓' : '' }}</span>{{ affix.name }}</button><p v-if="!rows.length">{{ selectedOnly ? '没有符合搜索的已选词条' : '没有匹配词条' }}</p></div>
      <div class="b3-hunter-pages"><button type="button" :disabled="currentPage === 0" @click="page = currentPage - 1">上一页</button><span>{{ currentPage + 1 }} / {{ pages }} · {{ filtered.length }} 种</span><button type="button" :disabled="currentPage + 1 >= pages" @click="page = currentPage + 1">下一页</button></div>
    </section>
    <section class="b3-hunter-currencies" aria-label="通货 Hunter">
      <h4>通货 Hunter <small>选中的种类均显示</small><button type="button" @click="$emit('clear-currencies')">清空</button></h4>
      <div class="b3-hunter-currency-list"><button v-for="currency in currencies" :key="currency.id" type="button" :data-hunter-currency="currency.id" :aria-pressed="hunter.currencies.includes(currency.id)" :title="currency.description" @click="$emit('currency', currency.id, !hunter.currencies.includes(currency.id))"><span>{{ hunter.currencies.includes(currency.id) ? '✓' : '' }}</span><img :src="iconSrc('item', currency.id)" alt="">{{ currency.name }}</button></div>
    </section>
    <footer>{{ hunter.enabled ? '地图始终显示；装备按全部已选词条匹配，通货按选中种类显示；其他未选类型不显示。' : '过滤已关闭，显示全部道具和装备。' }}关闭面板保留当前过滤设置。</footer>
  </section>`,
  setup(props) {
    const query = ref(''), selectedOnly = ref(false), page = ref(0);
    watch(query, () => { page.value = 0; });
    const filtered = computed(() => {
      const text = query.value.trim().toLocaleLowerCase();
      return props.pool.filter(a => (!selectedOnly.value || props.hunter.targets.includes(a.id)) &&
        (!text || `${a.name} ${a.id}`.toLocaleLowerCase().includes(text))).sort((a,b) => Number(b.id === text) - Number(a.id === text) || a.name.localeCompare(b.name, 'zh-CN') || a.id.localeCompare(b.id));
    });
    const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / 12)));
    const currentPage = computed(() => Math.min(page.value, pages.value - 1));
    const rows = computed(() => filtered.value.slice(currentPage.value * 12, (currentPage.value + 1) * 12));
    const selectedAffixes = computed(() => props.hunter.targets.map(id => props.pool.find(a => a.id === id) || { id, name: id }));
    return { query, selectedOnly, page, filtered, pages, currentPage, rows, selectedAffixes, iconSrc };
  },
};

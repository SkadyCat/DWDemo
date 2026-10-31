// In-game crafting bench: pick an owned piece of equipment, then craft it in the
// shared item panel (same transaction as the inventory). Presentation only.
import { computed } from '/vendor/vue.esm-browser.prod.js';
import { iconSrc } from '../game-icons.mjs';
import { EQUIPMENT_RARITY_NAMES } from '../../engine/equipment.mjs';

const GUIDE = Object.freeze([
  { id: 'chaos_orb', how: '选定 1 条随机词条，之后可反复洗炼它（最多绑定 1 条）。' },
  { id: 'spirit_stone_mid', how: '绑定第 2 条可洗炼词条。' },
  { id: 'spirit_stone_high', how: '绑定第 3 条可洗炼词条。' },
  { id: 'quad_affix_orb', how: '重新生成 4 条随机词条并清除绑定。' },
  { id: 'annulment_crystal', how: '随机移除 1 条词条。' },
  { id: 'wish_crystal', how: '为装备增加新的随机词条。' },
]);

export const CraftBench = {
  props: ['entries', 'selected', 'collections', 'counts'], emits: ['select'],
  setup(props) {
    const gear = computed(() => (props.entries || []).filter(e => e.kind === 'equipment').sort((a, b) => (b.equipped - a.equipped) || ((b.tier || 0) - (a.tier || 0))));
    const guide = computed(() => GUIDE.map(g => ({ ...g, name: props.collections?.item?.get(g.id)?.doc?.name || g.id, count: props.counts?.[g.id] || 0 })));
    const omens = computed(() => Object.entries(props.counts || {}).filter(([id, n]) => n > 0 && props.collections?.item?.get(id)?.doc?.category === 'omen').map(([id, n]) => ({ id, n, name: props.collections.item.get(id).doc.name })));
    return { gear, guide, omens, iconSrc, rarityName: EQUIPMENT_RARITY_NAMES };
  },
  template: /* html */ `<div class="cb">
    <div class="cb-left">
      <section class="cb-list" aria-label="选择要打造的装备">
        <h3>选择装备 <small>{{ gear.length }} 件</small></h3>
        <p v-if="!gear.length" class="dim">背包里还没有装备。击杀怪物和守卫会掉落装备。</p>
        <div class="cb-grid">
          <button v-for="e in gear" :key="e.key" type="button" class="cb-item" :class="['r-' + (e.rarity || 'common'), {on: e.key === selected}]" @click="$emit('select', e.key, $event)">
            <img :src="iconSrc('equipment', e.detail || e)" alt="" draggable="false">
            <span><b>{{ e.name }}</b><small>{{ e.unidentified ? '未鉴定' : (rarityName[e.rarity] || '') + (e.tier ? ' · T' + e.tier : '') }}{{ e.equipped ? ' · 已装备' : '' }}</small></span>
          </button>
        </div>
      </section>
      <section class="cb-guide">
        <h3>洗炼通货</h3>
        <ul><li v-for="g in guide" :key="g.id" :class="{none: !g.count}"><img :src="iconSrc('item', g.id)" alt="" draggable="false"><div><b>{{ g.name }} <em class="mono">×{{ g.count }}</em></b><span>{{ g.how }}</span></div></li></ul>
        <template v-if="omens.length"><h3>预兆 <small>洗炼时限定词条族</small></h3><div class="cb-omens"><span v-for="o in omens" :key="o.id">{{ o.name }} ×{{ o.n }}</span></div></template>
      </section>
    </div>
    <aside class="cb-stage" aria-hidden="true"><div><b>⚒</b><p>{{ selected ? '在详情面板中选择通货，再点击闪烁的词条' : '从左侧选择一件装备' }}</p><small>未鉴定的装备先点「鉴定装备」。通货来自掉落、任务与商人。</small></div></aside>
  </div>`,
};

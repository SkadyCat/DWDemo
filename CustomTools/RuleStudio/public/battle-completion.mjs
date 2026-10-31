// Post-floor controls. Transactions remain in FloorRewards; this component only emits intent.
import { ref } from '/vendor/vue.esm-browser.prod.js';
import { affixText } from '/affix-text.mjs';
import { iconSrc } from '/game-icons.mjs';
export const BattleCompletion = {
  props: ['floor', 'maxFloor', 'merchant', 'wallet', 'unclaimed', 'library', 'atlas', 'portal', 'summary'],
  emits: ['challenge', 'buy', 'release', 'explore'],
  setup(props) { return { open: ref(!props.portal), target: ref(props.floor), affixText, iconSrc }; },
  template: /* html */ `<section class="b3-completion" :class="{collapsed: !open}" aria-label="通关与商人" @pointerenter="$emit('release')" @pointerdown.stop @pointermove.stop @wheel.stop @keydown.stop>
    <button v-if="!open" type="button" class="btn" @click="open = true">首领已击败 · {{ merchant ? '查看商人' : '查看通关奖励' }}</button>
    <template v-else>
      <header><div><small>挑战完成</small><h3>第 {{ floor }} 层通关</h3></div><button type="button" class="btn ghost sm" @click="open = false" aria-label="返回地面拾取">返回拾取</button></header>
      <div v-if="summary" class="run-summary" aria-label="本层战绩"><div><small>击杀</small><b class="mono">{{ summary.kills }}</b></div><div><small>获得经验</small><b class="mono">{{ summary.xp }}</b></div><div><small>升级</small><b class="mono">{{ summary.levels ? '+' + summary.levels : '—' }}</b></div><div><small>用时</small><b class="mono">{{ summary.time }}</b></div><div v-if="summary.first" class="first">首次通关第 {{ floor }} 层 · {{ summary.first }}</div></div>
      <p class="dim" v-if="unclaimed">地面还有 {{ unclaimed }} 件掉落，可先返回拾取。</p>
      <button v-if="atlas" type="button" class="btn primary b3-atlas-next" @click="$emit('explore')">前往传送阵 · 打开世界地图</button>
      <div v-else class="b3-floor-select"><label>挑战层数<input type="number" v-model.number="target" min="1" :max="maxFloor" step="1" aria-label="通关后挑战层数"></label><button class="btn primary sm" :disabled="!Number.isInteger(target) || target < 1 || target > maxFloor" @click="$emit('challenge', target)">挑战此层</button></div>
      <section v-if="merchant" class="b3-merchant" aria-label="流浪商人">
        <div class="row between"><h4>{{ merchant.name }}</h4><span class="mono">{{ wallet }} 灵石</span></div>
        <p>固定携带 2 件传奇装备和 4 种道具，每件限购一次。</p>
        <div class="b3-merchant-stock">
          <article v-for="offer in merchant.stock" :key="offer.key" :class="['r-' + offer.rarity, {sold: offer.claimed}]">
            <img class="game-icon b3-offer-icon" :src="iconSrc(offer.kind, offer.item || offer.id)" alt="" draggable="false">
            <small>{{ offer.kind === 'equipment' ? '传奇装备 · T' + offer.tier : '道具' }}</small><b>{{ offer.name }}<template v-if="offer.count > 1"> ×{{ offer.count }}</template></b>
            <div v-if="offer.item" class="b3-offer-affixes"><span v-if="offer.item.legendary" class="fixed">固定 · {{ affixText(offer.item.legendary, library) }}</span><span v-for="(a,i) in offer.item.affixes" :key="i">{{ affixText(a, library) }}</span><span v-if="!offer.item.affixes.length && !offer.item.legendary" class="dim">普通装备，无随机词条</span></div>
            <p v-else>{{ offer.description }}</p>
            <button type="button" class="btn sm" :aria-label="'购买' + offer.name" :disabled="offer.claimed || wallet < offer.price" @click="$emit('buy', offer.key)">{{ offer.claimed ? '已售出' : offer.price + ' 灵石 · 购买' }}</button>
          </article>
        </div>
      </section>
      <p v-else class="b3-no-merchant">这次没有遇到商人。可以继续拾取，或{{ atlas ? '沿星图路线继续探索。' : '选择任意层重新挑战。' }}</p>
    </template>
  </section>`,
};

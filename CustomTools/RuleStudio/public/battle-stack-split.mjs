import { ref, computed, watch, nextTick, onMounted } from '/vendor/vue.esm-browser.prod.js';
import { iconSrc } from '/game-icons.mjs';

export const BattleStackSplit = {
  props: ['item'], emits: ['close', 'split'],
  setup(props, { emit }) {
    const input = ref(null), amount = ref(Math.max(1, Math.floor(props.item.count / 2)));
    const valid = computed(() => Number.isSafeInteger(amount.value) && amount.value > 0 && amount.value < props.item.count);
    watch(() => props.item.count, count => {
      if (count < 2) emit('close');
      else if (amount.value >= count) amount.value = count - 1;
    });
    onMounted(async () => { await nextTick(); input.value?.focus(); input.value?.select(); });
    return { input, amount, valid, iconSrc };
  },
  template: /* html */ `<teleport to="body"><div class="b3-split-layer" @pointerdown.self="$emit('close')" @keydown.stop @keyup.stop>
    <form class="b3-split-dialog card" role="dialog" aria-modal="true" :aria-label="'拆分' + item.name" @pointerdown.stop @submit.prevent="valid && $emit('split', amount)" @keydown.esc.prevent="$emit('close')">
      <header><img class="game-icon" :src="iconSrc(item.kind, item)" alt="" draggable="false"><div><h3>拆分 {{ item.name }}</h3><span class="dim">当前数量 {{ item.count }}</span></div></header>
      <label>拆出数量<input ref="input" type="number" min="1" :max="item.count - 1" step="1" v-model.number="amount" aria-label="拆分数量"></label>
      <div class="b3-split-amount"><input type="range" min="1" :max="item.count - 1" step="1" v-model.number="amount" aria-label="调整拆分数量"><button type="button" class="btn sm" @click="amount = Math.floor(item.count / 2)">一半</button></div>
      <p class="dim">拆出 {{ valid ? amount : '—' }}，原堆剩余 {{ valid ? item.count - amount : '—' }}</p>
      <footer><button type="button" class="btn" @click="$emit('close')">取消</button><button type="submit" class="btn primary" :disabled="!valid">确认拆分</button></footer>
    </form>
  </div></teleport>`,
};

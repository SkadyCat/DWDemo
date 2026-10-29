// Presentation shell for existing battle panels; combat keeps its current time and rules.
import { ref, onMounted, onBeforeUnmount } from '/vendor/vue.esm-browser.prod.js';
export const BattleWindow = {
  props: { title: String, kind: String }, emits: ['close', 'ground-dragover', 'ground-drop'],
  setup() {
    const dialog = ref(null); let previousFocus = null;
    onMounted(() => { previousFocus = document.activeElement; dialog.value?.focus({ preventScroll: true }); });
    onBeforeUnmount(() => { if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }); });
    function trapFocus(event) {
      const controls = [...dialog.value.querySelectorAll('button:not(:disabled), input, select, textarea, a[href], [tabindex="0"]')].filter(el => el.getClientRects().length);
      if (!controls.length) { event.preventDefault(); return; }
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && [first, dialog.value].includes(document.activeElement)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && [last, dialog.value].includes(document.activeElement)) { event.preventDefault(); first.focus(); }
    }
    return { dialog, trapFocus };
  },
  template: /* html */ `<teleport to="body"><div class="b3-window-layer" @pointerdown.self="$emit('close')" @dragover.self="$emit('ground-dragover', $event)" @drop.self="$emit('ground-drop', $event)">
    <section ref="dialog" class="b3-window" :class="'b3-window-' + kind" role="dialog" aria-modal="true" :aria-label="title" tabindex="-1" @pointerdown.stop @wheel.stop @keydown.tab="trapFocus">
      <header class="b3-window-head"><h2>{{ title }}</h2><button type="button" :aria-label="'关闭' + title" @click="$emit('close')">×</button></header>
      <div class="b3-window-content"><slot></slot></div>
    </section></div></teleport>`,
};

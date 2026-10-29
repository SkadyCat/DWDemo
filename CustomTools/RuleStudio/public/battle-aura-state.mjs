import {ref, onMounted, onBeforeUnmount} from '/vendor/vue.esm-browser.prod.js';
import {UIRuntime} from '/uicreator/runtime/runtime.js';
import {auraStateDocument} from '/uicreator/assets/rulestudio-hud/aura-state.js';

// Mount only while the rule runtime reports an enabled aura; destroy cancels its timeline.
export const BattleAuraState = {
  setup() {
    const scene = ref(null); let ui;
    onMounted(() => { ui = new UIRuntime(scene.value, structuredClone(auraStateDocument), {sound: false}); });
    onBeforeUnmount(() => ui?.destroy());
    return {scene};
  },
  template: '<svg ref="scene" class="b3-aura-state" aria-hidden="true" focusable="false"></svg>',
};

import { ref, computed, nextTick, onMounted, onBeforeUnmount } from '/vendor/vue.esm-browser.prod.js';

// Layout and atomic SVG resources are authored in UICreator's map-core-selector project.
export const BattleMapCores = {
  props: { map: Object, choices: Array }, emits: ['choose', 'release'],
  setup(props, { emit }) {
    const open = ref(false), anchor = ref(null), dialog = ref(null), position = ref({});
    const equipped = computed(() => props.map?.equipment.find(item => item.slot === 'map'));
    function place() {
      if (!anchor.value || !open.value) return;
      const rect = anchor.value.getBoundingClientRect(), width = Math.min(292, innerWidth - 24);
      const height = Math.min(dialog.value?.offsetHeight || 540, innerHeight - 24);
      const left = Math.max(12, Math.min(rect.left - width - 12, innerWidth - width - 12));
      position.value = { left: `${left}px`, top: `${Math.max(12, Math.min(rect.top - 6, innerHeight - height - 12))}px`, width: `${width}px` };
    }
    function close(restore = true) { open.value = false; if (restore) anchor.value?.focus({ preventScroll: true }); }
    async function toggle() {
      emit('release'); open.value = !open.value;
      if (open.value) { place(); await nextTick(); place(); dialog.value?.querySelector('[aria-pressed="true"], [data-map-core-id]')?.focus({ preventScroll: true }); }
    }
    function choose(id) { emit('choose', id); close(); }
    function dismiss(event) { if (open.value && !anchor.value?.contains(event.target) && !dialog.value?.contains(event.target)) close(false); }
    function keys(event) {
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      const controls = [...dialog.value.querySelectorAll('button:not(:disabled)')];
      const at = controls.indexOf(document.activeElement);
      if (event.key === 'Tab') { event.preventDefault(); controls[(at + (event.shiftKey ? -1 : 1) + controls.length) % controls.length]?.focus(); }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); controls[(at + (event.key === 'ArrowUp' ? -1 : 1) + controls.length) % controls.length]?.focus(); }
    }
    onMounted(() => { document.addEventListener('pointerdown', dismiss, true); window.addEventListener('resize', place); window.addEventListener('scroll', place, true); });
    onBeforeUnmount(() => { document.removeEventListener('pointerdown', dismiss, true); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); });
    return { open, anchor, dialog, position, equipped, toggle, close, choose, keys };
  },
  template: /* html */ `<div class="b3-map-core-content">
    <button ref="anchor" type="button" class="b3-map-core-equipped" aria-label="选择地图核心" aria-haspopup="dialog" :aria-expanded="open" aria-controls="map-core-selector" @click="toggle" @pointerenter="$emit('release')" @pointerdown.stop @keydown.enter.stop @keydown.space.stop>
      <span class="b3-map-core-icon" aria-hidden="true"><img src="/uicreator/map-cores/core.svg" alt=""><em v-if="equipped">T{{ equipped.tier }}</em></span>
      <span><b>{{ equipped?.name || '未装配地图核心' }}</b><small>{{ equipped ? '已装配 · 点击更换' : '点击选择核心' }}</small></span><i aria-hidden="true">‹</i>
    </button>
    <article v-for="item in map.equipment" :key="item.slot">
      <b v-if="item.slot !== 'map'">{{ item.name }}</b>
      <ul v-if="item.affixes.length"><li v-for="(affix, i) in item.affixes" :key="i" :class="{inactive: !affix.active}" :title="affix.note">{{ affix.text }}<small v-if="!affix.active"> · 未生效</small></li></ul>
      <p v-else>暂无词条</p>
    </article>
    <teleport to="body"><section v-if="open" ref="dialog" id="map-core-selector" class="b3-map-core-picker" role="dialog" aria-modal="false" aria-label="装配地图核心" :style="position" @pointerenter="$emit('release')" @pointerdown.stop @pointermove.stop @wheel.stop @keydown.stop="keys" @keyup.stop>
      <header><b>装配地图核心</b><button type="button" aria-label="关闭地图核心选择" @click="close()">×</button></header>
      <p>选择后直接装配，后续波次使用新规模。</p>
      <div class="b3-map-core-choices"><button v-for="core in choices" :key="core.id" type="button" :data-map-core-id="core.id" :aria-label="'装配' + core.name + '，怪物群 +' + core.packs + '%'" :aria-pressed="equipped?.id === core.id" @click="choose(core.id)">
        <span class="b3-map-core-icon" aria-hidden="true"><img src="/uicreator/map-cores/core.svg" alt=""><em>T{{ core.tier }}</em></span>
        <span><b>{{ core.name }}</b><small>怪物群 +{{ core.packs }}%</small></span><em v-if="equipped?.id === core.id">已装配</em>
      </button></div>
      <p v-if="!choices.length">暂无可配置的地图核心</p>
    </section></teleport>
  </div>`,
};

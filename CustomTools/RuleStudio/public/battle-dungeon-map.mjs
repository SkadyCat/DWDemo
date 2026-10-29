import {ref, watch, onMounted, onBeforeUnmount, nextTick} from '/vendor/vue.esm-browser.prod.js';
import {DungeonMapView} from '/dungeon-map-view.mjs';

export const BattleDungeonMap = {
  props: {layout: Object, state: Object, expanded: Boolean}, emits: ['open', 'close', 'release'],
  setup(props, {emit}) {
    const scene = ref(null), dialog = ref(null), dragging = ref(false);
    let view, previousFocus, drag = null;
    function update() { view?.update(props.layout, props.state); }
    function wheel(event) {
      finishDrag();
      emit('release'); const point = view?.point(event);
      if (point && view.inside(point)) view.zoomBy(event.deltaY < 0 ? 1.15 : 1 / 1.15, point);
    }
    function down(event) {
      if (!props.expanded || drag || event.button !== 0 || event.target.closest('[role="button"]')) return;
      const point = view?.point(event); if (!point || !view.inside(point)) return;
      event.preventDefault(); emit('release'); scene.value.setPointerCapture(event.pointerId);
      drag = {id: event.pointerId, point}; dragging.value = true; view.beginDrag();
    }
    function move(event) {
      if (drag?.id !== event.pointerId) return;
      const point = view.point(event); view.dragBy(point.x - drag.point.x, point.y - drag.point.y); drag.point = point;
    }
    function up(event) {
      if (drag?.id !== event.pointerId) return;
      finishDrag();
    }
    function finishDrag() {
      if (!drag) return;
      const id = drag.id; drag = null; dragging.value = false;
      if (scene.value?.hasPointerCapture(id)) scene.value.releasePointerCapture(id);
      view?.endDrag();
    }
    function key(event) {
      if (!props.expanded) return;
      finishDrag();
      if (event.code === 'Escape') { event.preventDefault(); emit('close'); return; }
      if (event.code === 'Tab') {
        const buttons = [...dialog.value.querySelectorAll('[role="button"][tabindex="0"]')].filter(e => e.getClientRects().length);
        const first = buttons[0], last = buttons.at(-1);
        if (event.shiftKey && [first, dialog.value].includes(document.activeElement)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && [last, dialog.value].includes(document.activeElement)) { event.preventDefault(); first?.focus(); }
        return;
      }
      if (event.code === 'KeyF') { event.preventDefault(); view?.locate(); }
      else if (['Equal','NumpadAdd'].includes(event.code)) { event.preventDefault(); view?.zoomBy(1.25); }
      else if (['Minus','NumpadSubtract'].includes(event.code)) { event.preventDefault(); view?.zoomBy(1 / 1.25); }
      else if (['Digit0','Numpad0'].includes(event.code)) { event.preventDefault(); view?.fit(); }
      else {
        const directions = {ArrowLeft: [40, 0], ArrowRight: [-40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40]};
        if (directions[event.code]) { event.preventDefault(); view?.pan(...directions[event.code]); }
      }
    }
    onMounted(async () => {
      previousFocus = document.activeElement;
      view = new DungeonMapView(scene.value, {mini: !props.expanded, onAction: action => {
        emit('release'); if (action === 'open') emit('open'); else if (action === 'close') emit('close');
      }});
      update();
      window.addEventListener('blur', finishDrag);
      if (props.expanded) { await nextTick(); dialog.value?.focus({preventScroll: true}); }
    });
    watch(() => [props.layout, props.state], update);
    onBeforeUnmount(() => {
      window.removeEventListener('blur', finishDrag); drag = null; view?.destroy();
      if (props.expanded && previousFocus?.isConnected) previousFocus.focus({preventScroll: true});
    });
    return {scene, dialog, dragging, wheel, down, move, up, key};
  },
  template: `<Teleport to="body" :disabled="!expanded">
    <div v-if="expanded" class="b3-local-map-layer" @pointerdown.self="$emit('close')">
      <section ref="dialog" class="b3-local-map-dialog" :class="{dragging}" role="dialog" aria-modal="true" aria-label="地牢地图" tabindex="-1" @pointerdown.stop @pointermove.stop @wheel.prevent.stop="wheel" @keydown.stop="key" @keyup.stop @contextmenu.prevent>
        <svg ref="scene" class="b3-dungeon-map-ui" aria-label="本层地牢地图，可拖动和缩放" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" @lostpointercapture="up"></svg>
      </section>
    </div>
    <section v-else class="b3-minimap b3-minimap-round" aria-label="地牢小地图" @pointerenter="$emit('release')" @pointerdown.stop @pointermove.stop @wheel.prevent.stop="wheel" @keydown.stop @keyup.stop @contextmenu.prevent>
      <svg ref="scene" class="b3-dungeon-map-ui" aria-label="圆形小地图，滚轮缩放，点击展开"></svg>
    </section>
  </Teleport>`,
};

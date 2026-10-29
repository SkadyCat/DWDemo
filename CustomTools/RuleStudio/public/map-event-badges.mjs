import {ref, onMounted, onBeforeUnmount, watch} from '/vendor/vue.esm-browser.prod.js';
import {UIRuntime} from '/uicreator/runtime/runtime.js';
import {createMapEventMarkerProject, MAP_EVENT_INFO} from '/uicreator/assets/rulestudio-hud/map-event-markers.js';

export const MapEventBadges = {
  props: {events: {type: Array, default: () => []}},
  setup(props) {
    const scene = ref(null); let ui;
    function render() { ui?.destroy(); ui = new UIRuntime(scene.value, createMapEventMarkerProject(props.events), {sound: false, motion: false}); }
    onMounted(render);
    watch(() => props.events.map(event => `${event.kind}:${!!event.completed}`).join('|'), render);
    onBeforeUnmount(() => ui?.destroy());
    return {scene, label: event => (event.name || MAP_EVENT_INFO[event.kind]?.name || '') + (event.completed ? '（已完成）' : '')};
  },
  template: `<svg ref="scene" class="map-event-badges" role="img" :aria-label="events.map(label).join('、')" :style="{width:Math.max(26,events.length*26)+'px',height:'26px',display:'block',fill:'none',stroke:'none',flex:'none'}"><title>{{events.map(label).join('、')}}</title></svg>`,
};

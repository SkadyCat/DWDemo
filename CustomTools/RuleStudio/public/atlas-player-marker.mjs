import { ref, onMounted, onBeforeUnmount, watch } from '/vendor/vue.esm-browser.prod.js';
import { UIRuntime } from '/uicreator/runtime/runtime.js';
import { atlasPlayerLocationDocument, ATLAS_PLAYER_ANCHOR } from '/uicreator/assets/rulestudio-hud/atlas-player-location.js';

export const AtlasPlayerMarker = {
  props: { name: String, nodeId: String, x: Number, y: Number, visible: Boolean },
  setup(props) {
    const scene = ref(null); let ui;
    function update() { ui?.set('atlas-player-name', { text: props.name || '当前位置' }); }
    onMounted(() => { ui = new UIRuntime(scene.value, atlasPlayerLocationDocument(), { sound: false, motion: false }); update(); });
    watch(() => props.name, update);
    onBeforeUnmount(() => ui?.destroy());
    return { scene, anchor: ATLAS_PLAYER_ANCHOR };
  },
  template: `<div v-show="visible" class="atlas-player-marker" role="img" :aria-label="'玩家当前位置：'+name" :data-player-node="nodeId" :style="{position:'absolute',left:(x-anchor.x)+'px',top:(y-anchor.y)+'px',width:anchor.width+'px',height:anchor.height+'px',pointerEvents:'none',zIndex:2}"><svg ref="scene" aria-hidden="true" focusable="false" style="display:block;width:100%;height:100%;fill:none;stroke:none;overflow:visible"></svg></div>`,
};

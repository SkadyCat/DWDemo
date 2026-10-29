import { ref, onMounted, onBeforeUnmount, watch } from '/vendor/vue.esm-browser.prod.js';
import { UIRuntime } from '/uicreator/runtime/runtime.js';

// Reuse the UICreator interaction bubble with its authored hover and pressed brushes.
let launcherProject;
const project = () => launcherProject ||= fetch('/ui/outpost-merchant.uialpha.json').then(r => {
  if (!r.ok) throw Error('奇遇交互 UICreator 资产未加载'); return r.json();
}).catch(error => { launcherProject = null; throw error; });
export const BattleMapEventTag = {
  props: ['info'], emits: ['activate', 'release'],
  setup(props, { emit }) {
    const host = ref(null); let ui, disposed = false;
    const update = () => ui?.setMany([
      ['merchant-open', { name: '打开' + props.info.name }],
      ['merchant-tag-title', { text: '◇  ' + props.info.name }],
      ['merchant-tag-note', { text: props.info.completed ? '已完成 · 点击查看' : '点击交互' }],
    ]);
    onMounted(async () => {
      try {
        const doc = await project(); if (disposed) return;
        ui = new UIRuntime(host.value, structuredClone(doc), { prefabId: 'merchant-launcher', sound: false, motion: false });
        ui.addEventListener('activate', () => emit('activate', props.info.id)); update();
      } catch (error) { console.error(error); }
    });
    watch(() => [props.info.name, props.info.completed], update);
    onBeforeUnmount(() => { disposed = true; ui?.destroy(); }); return { host };
  },
  template: `<div class="b3-outpost-tag b3-map-event-tag" :data-world-event="info.id" :style="{left:Math.round(info.x)+'px',top:Math.round(info.y)+'px'}" @pointerenter="$emit('release')" @pointerdown.stop @pointermove.stop @click.stop><svg ref="host" xmlns="http://www.w3.org/2000/svg" :aria-label="info.name+'交互'"></svg></div>`,
};

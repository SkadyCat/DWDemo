import { createApp, ref } from '/vendor/vue.esm-browser.prod.js';
import { reloadStore } from '/editors.mjs';
import { AtlasMap } from '/atlas-map.mjs';
import { createAtlas, enterAtlasNode, completeAtlasNode, selectAtlasNode } from '/atlas-state.mjs';
if (location.hostname !== '127.0.0.1' || location.port !== '5402') throw Error('Isolated loopback fixture only');
await reloadStore();
let initial = completeAtlasNode(enterAtlasNode(createAtlas(41), '0:0'));
for (let step = 0; step < 3; step++) {
  const next = initial.nodes.find(node => node.status === 'available' && node.id !== '0:0');
  initial = completeAtlasNode(enterAtlasNode(initial, next.id));
}
const entry = initial.nodes.find(node => node.status === 'available');
initial = enterAtlasNode(initial, entry.id);
createApp({ components: { AtlasMap }, setup() {
  const state = ref(initial);
  return { state, select(id) { state.value = selectAtlasNode(state.value, id); } };
}, template: `<div class="b3" style="height:100vh"><output style="position:fixed;top:0;right:0;z-index:30010;padding:5px;background:#12252b;color:#bdd9c9;font-size:11px">本地定位验证 · 预置已探索地域 · 点击其它节点后按 F 定位</output><AtlasMap :state="state" :current-node-id="state.currentNodeId" :active-node-id="state.activeNodeId" @select="select" /></div>` }).mount('#battle-root');

import {createApp, ref, computed} from '/vendor/vue.esm-browser.prod.js';
import {reloadStore} from '/editors.mjs';
import {AtlasMap} from '/atlas-map.mjs';
import {BattleDungeonMap} from '/battle-dungeon-map.mjs';
import {createAtlas, atlasBattleOptions, selectAtlasNode} from '/atlas-state.mjs';
import {generateDungeon} from '/sim/dungeon.mjs';
import {dungeonMapEvents} from '/map-event-locations.mjs';
if (location.hostname !== '127.0.0.1' || location.port !== '5354') throw Error('Map-event QA requires isolated loopback origin 5354');
await reloadStore();
createApp({components: {AtlasMap, BattleDungeonMap}, setup() {
  const state = ref(selectAtlasNode(createAtlas(41), '0:1')), mode = ref('atlas'), completed = ref(false);
  const dungeon = computed(() => { const options = atlasBattleOptions(state.value, state.value.selectedId); return generateDungeon(options.seed, options.floor); });
  const events = computed(() => dungeonMapEvents(dungeon.value, state.value.selectedId).map(event => ({...event, completed: event.kind !== 'shop' && completed.value})));
  const hud = computed(() => { const map = dungeon.value; return {floor: map.floor, phase: 'boss', visitedRooms: 1, totalRooms: map.rooms.length,
    rooms: map.rooms.map(room => ({visited: room.id === map.entryRoom})), heroX: map.rooms[map.entryRoom].centerX,
    heroY: map.rooms[map.entryRoom].centerY, events: events.value}; });
  return {state, mode, completed, dungeon, hud, select(id) {if (id === state.value.selectedId) return; state.value = selectAtlasNode(state.value, id); completed.value = false;}};
}, template: `<div class="b3" style="height:100vh;background:#09131a">
  <div class="qa-map-controls"><button @click="mode='atlas'">世界地图</button><button @click="mode='local'">地牢地图</button><button @click="completed=!completed">切换完成状态</button><output>独立验证 · 实际事件规划与 UICreator 控件 · 不写入正式存档</output></div>
  <AtlasMap v-if="mode==='atlas'" :state="state" :current-node-id="state.selectedId" :current-events="hud.events" @select="select" @close="mode='local'" />
  <template v-else><BattleDungeonMap expanded :layout="dungeon" :state="hud" @close="mode='atlas'" /><div class="qa-mini"><BattleDungeonMap :layout="dungeon" :state="hud" /></div></template>
</div>`}).mount('#battle-root');

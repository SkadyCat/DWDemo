// Game-style HUD actions; no text menu or search UI.
export const BATTLE_FUNCTIONS = [
  { id: 'character', name: '角色', items: [
    { id: 'inventory', name: '背包', key: 'B', path: 'M7 8V6a5 5 0 0 1 10 0v2M5 8h14l2 13H3L5 8Zm3 5h8v5H8z' },
    { id: 'character', name: '属性与特性', key: 'C', path: 'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM4 21v-3a8 8 0 0 1 16 0v3H4Z' },
    { id: 'talents', name: '天赋星盘', key: 'P', path: 'm12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2ZM4 3v3m-1-1h3m12 13v3m-1-1h3' },
  ] },
  { id: 'build', name: '配装', items: [
    { id: 'skills', name: '技能装配', path: 'M3 4h7l2 2 2-2h7v16h-7l-2 2-2-2H3V4Zm12 2v16M6 8h3M6 12h3m6-4h3m-3 4h3' },
    { id: 'equipment', name: '装备配置', path: 'm8 3-5 4 3 5 3-2v11h6V10l3 2 3-5-5-4-4 3-4-3Z' },
    { id: 'trait-equipment', name: '特质装备', path: 'm4 21 11-11m-2-7 8 8M15 2l7 7-5 5-7-7 5-5ZM3 13v4m-2-2h4M9 2v4M7 4h4' },
    { id: 'belt', name: '光环与消耗品', path: 'M9 2h6v4l-1 2 5 6a5 5 0 0 1-4 8H9a5 5 0 0 1-4-8l5-6-1-2V2Zm-2 13h10M9 5h6' },
    { id: 'bd', name: '可用 BD', path: 'm12 2 10 6-10 6L2 8l10-6ZM2 12l10 6 10-6M2 16l10 6 10-6' },
  ] },
  { id: 'dungeon', name: '战场', items: [
    { id: 'quests', name: '任务', key: 'J', path: 'M6 3h12v18l-3-2-3 2-3-2-3 2V3Zm3 5h6m-6 4h6m-6 4h3' },
    { id: 'hunter', name: '掉落 Hunter', path: 'M12 2v4m0 12v4M2 12h4m12 0h4M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm0 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z' },
    { id: 'map', name: '地图装备', path: 'm3 5 6-3 6 3 6-3v17l-6 3-6-3-6 3V5Zm6-3v17m6-14v17' },
    { id: 'lineage', name: '怪物谱系', path: 'm5 8-2-5 6 3h6l6-3-2 5v8l-7 6-7-6V8Zm3 3h2m4 0h2m-7 5 3 2 3-2' },
    { id: 'atlas', name: '异界星图', key: 'M', path: 'M12 2 15 9l7 3-7 3-3 7-3-7-7-3 7-3 3-7Z' },
    { id: 'dungeon-map', name: '地牢地图', path: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 4 4 11-4-3-4 3 4-11Z' },
    { id: 'events', name: '地图奇遇', path: 'M3 21h18M5 18h14M7 18v-5h10v5M4 10h16l-3 3H7l-3-3Zm8-8 2 3-2 3-2-3 2-3Z' },
    { id: 'settings', name: '战场设置', path: 'M12 3v3m0 12v3M3 12h3m12 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2M12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12Zm0 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z' },
  ] },
  { id: 'tools', name: '交易', items: [
    { id: 'shop', name: '商店', path: 'M3 9h18L19 3H5L3 9Zm1 0v12h16V9M8 21v-7h8v7M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0' },
    { id: 'craft', name: '工匠台 · 洗炼', path: 'm3 5 4-3 7 7-4 4-7-8Zm8 7 8 9 3-3-9-8M2 22h8M5 18v4' },
    { id: 'restart', name: '重置当前层', path: 'M4 10a8 8 0 1 1 1.8 7.2M4 4v6h6' },
  ] },
];
export const BattleFunctions = {
  props: { ready: { type: Boolean, default: true }, mapReady: Boolean, active: String, hunterActive: Boolean, hidden: { type: Array, default: () => [] } }, emits: ['activate', 'release'],
  computed: { groups() { return BATTLE_FUNCTIONS.map(g => ({ ...g, items: g.items.filter(i => !this.hidden.includes(i.id)) })).filter(g => g.items.length); } },
  template: /* html */ `<nav class="b3-functions" aria-label="战斗功能图标栏" @pointerenter="$emit('release')" @pointerdown.stop @pointermove.stop @wheel.stop>
    <div v-for="group in groups" :key="group.id" class="b3-function-group" role="group" :aria-label="group.name">
      <button v-for="item in group.items" :key="item.id" type="button" :data-battle-function="item.id" :aria-label="item.name" :title="item.name + (item.id === 'hunter' ? (hunterActive ? '（过滤已开启）' : '（显示全部）') : item.key ? ' [' + item.key + ']' : '')" :aria-pressed="active === item.id" :aria-expanded="item.id === 'events' ? active === item.id : undefined" :aria-controls="item.id === 'events' ? 'battle-event-menu' : undefined" :disabled="item.id === 'restart' && !ready || !mapReady && ['map','lineage'].includes(item.id)" @click="$emit('activate', item.id)">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="item.path" /></svg><span v-if="item.id === 'hunter' && hunterActive" class="b3-hunter-active-dot" aria-hidden="true"></span><kbd v-if="item.key" aria-hidden="true">{{ item.key }}</kbd>
      </button>
    </div>
  </nav>`,
};

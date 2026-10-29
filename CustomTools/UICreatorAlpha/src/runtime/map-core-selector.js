import { MAP_CORE_ART } from '../assets/rulestudio-hud/map-core-selector.js';

// Presentation state only. Values are supplied by the project's map-core catalog.
export function projectMapCores(runtime, state, role, patch) {
  const core = state.mapCore; if (!core) return;
  role('map-core-equipped:name', { text: core.name });
  role('map-core-equipped:tier', { text: `T${core.tier}` });
  role('map-core-equipped:packs', { text: '已装配 · 点击更换' });
  role('map-core-map-tier', { text: `T${core.tier} · 无敌` });
  [`怪物群 +${core.packs}%`, `地图召唤物气血 +${core.life}%`, `地图召唤物伤害 +${core.damage}%`].forEach((text, index) => role(`map-core-affix:${index}`, { text }));
  const top = Math.max(14, Math.min(301, (runtime.height || runtime.project.viewport.height) - 580));
  role('map-core-picker', { visibility: state.mapPicker ? 'visible' : 'collapsed', slot: { offsets: { top } } });
  state.mapCores.forEach((choice, index) => {
    const binding = `map-core-choice-${index}`, selected = choice.id === core.id;
    role(`${binding}:name`, { text: choice.name }); role(`${binding}:packs`, { text: `怪物群 +${choice.packs}%` });
    role(`${binding}:tier`, { text: `T${choice.tier}` }); role(`${binding}:selected`, { text: selected ? '已装配' : '' });
    role(binding, { brushes: { normal: MAP_CORE_ART(selected ? 'card-selected' : 'card-normal') } });
  });
}

export function decorateMapCores(runtime, state) {
  for (const node of runtime.nodes.values()) {
    const group = runtime.renderer.groups.get(node.id)?.group; if (!group) continue;
    if (node.binding === 'map-core-equipped') {
      group.setAttribute('aria-label', `选择地图核心：${state.mapCore?.name || '未装配'}`);
      group.setAttribute('aria-expanded', String(state.mapPicker)); group.setAttribute('aria-haspopup', 'dialog');
    } else if (node.binding === 'map-core-picker') {
      group.setAttribute('role', 'dialog'); group.setAttribute('aria-label', '装配地图核心');
    } else if (node.action?.type === 'map-core' && node.action.op === 'close') {
      group.setAttribute('aria-label', '关闭地图核心选择');
    } else if (/^map-core-choice-\d+$/.test(node.binding)) {
      const core = state.mapCores.find(core => core.id === node.action?.value);
      group.setAttribute('aria-label', `装配${core?.name || ''}，怪物群 +${core?.packs || 0}%`);
      group.setAttribute('aria-pressed', String(node.action?.value === state.mapCoreId));
    }
  }
}

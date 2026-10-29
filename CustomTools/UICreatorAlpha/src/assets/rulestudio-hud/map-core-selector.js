import { createNode, walk } from '../../core/model.js';
import { MAP_CORE_CONTROLS, MAP_CORE_CATALOG } from './map-core-controls.js';
import { builtinSounds } from '../ui-sounds.js';

export { MAP_CORE_CATALOG };
export const MAP_CORE_ART = id => `rs-map-core-art-${id}`;
export const MAP_CORE_PICKER_PREFAB = 'rs-prefab-map-core-picker';

function copied(source, audio) {
  const root = structuredClone(source);
  walk(root, node => {
    node.id = `rs-${node.id}`;
    if (node.type === 'Button' && audio) node.audio = structuredClone(audio);
    if (node.svgAsset) node.svgAsset = MAP_CORE_ART(node.svgAsset);
    for (const key of Object.keys(node.brushes || {})) if (node.brushes[key]) node.brushes[key] = MAP_CORE_ART(node.brushes[key]);
  });
  return root;
}
function size(node, height) { node.layout.height = height; node.slot.offsets.bottom = height; }

// Reconcile only the map component and its new popover; keep all other HUD edits.
export function installMapCoreSelector(document) {
  const map = document.prefabs['rs-prefab-map'];
  const screen = document.prefabs['hud-prefab-screen'];
  if (!map || !screen) throw new Error('The RuleStudio3D HUD map and screen prefabs are required');
  document.sounds = { ...builtinSounds(), ...document.sounds };
  const cores = document.presentation?.mapCores?.length ? document.presentation.mapCores : MAP_CORE_CATALOG;
  const current = cores.find(core => core.id === document.presentation?.mapCore) || cores[0];
  document.folders['rs-map-core-art'] = { id: 'rs-map-core-art', name: '地图核心装配', kind: 'svg', parentId: 'rs-svg' };
  for (const asset of Object.values(MAP_CORE_CONTROLS.assets)) {
    const id = MAP_CORE_ART(asset.id);
    document.assets[id] = { ...structuredClone(asset), id, name: `地图核心 / ${asset.name}`, folderId: 'rs-map-core-art' };
  }
  const equipment = map.root.children.find(node => node.id === 'rs-map-panel').children.find(node => node.id === 'rs-map-equipment');
  const audio = map.root.children.find(node => node.id === 'rs-map-panel').children.find(node => node.id === 'rs-map-tab-equipment').audio;
  equipment.children = equipment.children.filter(node => !['rs-map-core', 'rs-map-core-equipped'].includes(node.id));
  const equipped = copied(MAP_CORE_CONTROLS.equipped, audio);
  equipped.slot.offsets.left = equipped.slot.offsets.top = 0;
  walk(equipped, node => {
    if (node.binding === 'map-core-equipped:name') { node.text = current.name; node.slot.offsets.right = 121; }
    if (node.binding === 'map-core-equipped:packs') { node.text = '已装配 · 点击更换'; node.slot.offsets.right = 121; }
    if (node.binding === 'map-core-equipped:tier') node.text = `T${current.tier}`;
    if (node.binding === 'map-core-equipped:selected') node.visibility = 'collapsed';
  });
  equipment.children.unshift(equipped); size(equipment, 106);
  for (let index = 0; index < 3; index++) {
    const node = equipment.children.find(node => node.id === `rs-map-affix-${index}`);
    node.slot.offsets.top = 48 + index * 17;
    node.binding = `map-core-affix:${index}`;
    node.text = [`怪物群 +${current.packs}%`, `地图召唤物气血 +${current.life}%`, `地图召唤物伤害 +${current.damage}%`][index];
  }
  const panel = map.root.children.find(node => node.id === 'rs-map-panel'); size(panel, 176);
  size(panel.children.find(node => node.id === 'rs-map-panel-bg'), 176);
  const tier = panel.children.find(node => node.id === 'rs-map-tier'); tier.binding = 'map-core-map-tier'; tier.text = `T${current.tier} · 无敌`;
  map.height = 302; size(map.root, 302);
  walk(screen.root, node => { if (node.prefabId === map.id) size(node, 302); });

  const picker = copied(MAP_CORE_CONTROLS.picker, audio);
  picker.slot.offsets.left = picker.slot.offsets.top = 0;
  walk(picker, node => {
    const match = /^map-core-choice-(\d+)$/.exec(node.binding);
    if (!match) return;
    const core = cores[Number(match[1])];
    if (!core) { node.visibility = 'collapsed'; return; }
    node.action = { type: 'map-core', op: 'equip', value: core.id };
    node.brushes.normal = MAP_CORE_ART(core.id === current.id ? 'card-selected' : 'card-normal');
    walk(node, child => {
      if (child.binding === `${node.binding}:name`) child.text = core.name;
      if (child.binding === `${node.binding}:packs`) child.text = `怪物群 +${core.packs}%`;
      if (child.binding === `${node.binding}:tier`) child.text = `T${core.tier}`;
      if (child.binding === `${node.binding}:selected`) child.text = core.id === current.id ? '已装配' : '';
    });
  });
  document.prefabs[MAP_CORE_PICKER_PREFAB] = { id: MAP_CORE_PICKER_PREFAB, name: '地图核心装配 · 10 个选项', width: 292, height: 566, root: picker, folderId: 'rs-prefab-parts' };
  screen.root.children = screen.root.children.filter(node => node.id !== 'rs-map-core-picker-instance');
  screen.root.children.push(createNode('PrefabInstance', { id: 'rs-map-core-picker-instance', name: '地图核心选择 · 位于地图栏左侧', prefabId: MAP_CORE_PICKER_PREFAB, binding: 'map-core-picker', visibility: 'collapsed', slot: { anchors: { minX: 1, maxX: 1, minY: 0, maxY: 0 }, alignment: { x: 1, y: 0 }, offsets: { left: -292, top: 301, right: 292, bottom: 566 }, zOrder: 90 } }));
  document.presentation = { ...document.presentation, mapCores: structuredClone(cores), mapCore: current.id, mapCoreSelectorVersion: 1 };
  return document;
}

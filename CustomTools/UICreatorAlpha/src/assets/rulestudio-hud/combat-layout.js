import { walk } from '../../core/model.js';
import { text, graphic, ui, colors, line } from './suite-kit.js';
import { installFunctionRail } from './function-rail.js';

const find = (root, id) => { let found; walk(root, n => { if (n.id === id) found = n; }); return found; };
function size(n, width, height) {
  Object.assign(n.layout, { width, height });
  Object.assign(n.slot.offsets, { right: width, bottom: height });
}

// Reconcile the current UICreator document, preserving independently edited
// resources, map cores, equipment, tooltips and their runtime contracts.
export function installCombatLayout(document) {
  const screen = document.prefabs['hud-prefab-screen'].root;
  const left = find(screen, 'rs-top-left');
  left.children = left.children.filter(n => !['battle-hud-atlas', 'rs-builds-instance', 'rs-reset'].includes(n.id));
  const right = find(screen, 'rs-top-right');
  right.children = right.children.filter(n => n.id !== 'rs-dps-instance');
  size(right, 206, 302);

  const stats = document.prefabs['rs-prefab-statistics'];
  stats.width = 640; stats.height = 40; size(stats.root, 640, 40);
  stats.name = '战斗统计与单体秒伤';
  stats.root.children = [
    graphic('rs-stats-bg', 'rs-svg-panel', 0, 0, 640, 40),
    text('rs-stats', '击杀 0 · 怪物 7 · 投射物 0 · 0s', 12, 8, 414, 24,
      { fontSize: 11, color: '#aab8c8', textOverflow: 'shrink' }, { binding: 'statistics' }),
    line('rs-stats-divider', 438, 11, 1, 18),
    text('rs-stats-dps-label', '单体秒伤', 450, 8, 64, 24, { fontSize: 11, color: colors.gold }),
    text('rs-stats-dps', '0', 516, 7, 110, 26,
      { fontSize: 18, fontWeight: 600, color: colors.gold, textAlign: 'right', textOverflow: 'shrink' }, { binding: 'dps' }),
  ];
  const fit = find(screen, 'rs-statistics-fit');
  fit.slot.offsets.bottom = 40;
  const statsInstance = find(screen, 'rs-statistics-instance');
  size(statsInstance, 640, 40); statsInstance.name = stats.name;
  const picker = find(screen, 'rs-map-core-picker-instance');
  if (picker) picker.slot.offsets.top = 200;

  const inventory = document.prefabs['battle-prefab-inventory'];
  const bag = inventory.root;
  bag.children = bag.children.filter(n => !['battle-bag-wallet-gem', 'battle-bag-wallet'].includes(n.id));
  bag.children.push(
    graphic('battle-bag-wallet-gem', 'rs-svg-gem', inventory.width - 218, 12, 20, 20),
    text('battle-bag-wallet', '996 灵石', inventory.width - 194, 8, 142, 28,
      { fontSize: 13, fontWeight: 600, color: '#85e6c2', textAlign: 'right', textOverflow: 'shrink' }, { binding: 'suite-wallet' }),
  );
  const bagTitle = find(bag, 'battle-bag-title');
  if (bagTitle) size(bagTitle, inventory.width - 242, bagTitle.slot.offsets.bottom);

  const rail = document.prefabs['rs-prefab-rail'].root;
  const tool = find(rail, 'rs-function-craft');
  tool.name = '装备洗炼';
  Object.assign(tool.overrides['rs-function-button'], {
    name: tool.name, action: { type: 'function', value: 'craft' }, binding: 'function-craft',
  });
  const settings = find(rail, 'rs-function-settings');
  settings.name = '异界星图 · M';
  settings.overrides['rs-function-button'].name = settings.name;
  const builds = find(rail, 'rs-function-bd');
  builds.overrides['rs-function-button'].action = ui('navigate', 'builds');
  document.prefabs['battle-prefab-settings'].root.children.find(n => n.id === 'battle-settings-title').text = '异界星图 · 战场设置';

  const reset = structuredClone(tool);
  reset.id = 'rs-function-restart'; reset.name = '重置并开始当前层';
  reset.slot.offsets.top = tool.slot.offsets.top + 41;
  Object.assign(reset.overrides['rs-function-button'], { name: reset.name, action: { type: 'restart' }, binding: 'function-restart' });
  reset.overrides['rs-function-button/rs-function-content/rs-function-icon'].svgAsset = 'rs-svg-icon-restart';
  rail.children = rail.children.filter(n => n.id !== reset.id);
  rail.children.push(reset);
  const railHeight = reset.slot.offsets.top + reset.slot.offsets.bottom + 6;
  size(rail, 48, railHeight); document.prefabs['rs-prefab-rail'].height = railHeight;
  size(find(rail, 'rs-rail-bg'), 48, railHeight);
  size(find(screen, 'rs-rail-instance'), 48, railHeight);
  document.assets['rs-svg-icon-restart'] = { ...structuredClone(document.assets['rs-svg-icon-craft']), id: 'rs-svg-icon-restart', name: '重置当前局', source: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g fill="none" stroke="#d5b775" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10a8 8 0 1 1 1.8 7.2M4 4v6h6"/></g></svg>' };
  delete document.prefabs['battle-prefab-combat-tools'];
  document.interfaceCatalog = document.interfaceCatalog.filter(p => p.id !== 'combat-tools');
  const help = find(screen, 'rs-help');
  if (help) help.text = help.text.replace('Q E F G', 'Q E T G');
  const thirdItem = find(document.prefabs['hud-prefab-consumable-row'].root, 'hud-quick-instance-F');
  thirdItem.overrides['hud-quick-button'].name = '消耗品 T';
  thirdItem.overrides['hud-quick-button/hud-quick-content/hud-quick-key'].text = 'T';
  document.presentation.combatLayout = { version: 2, atlasEntry: 'settings', resetEntry: 'right-rail', wallet: 'inventory', dps: 'statistics' };
  return installFunctionRail(document);
}

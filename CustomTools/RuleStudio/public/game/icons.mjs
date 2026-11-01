// 图标：game-icons.net（CC BY 3.0，作者 Lorc、Delapouite 等）经 Iconify 提供。
// 每个图标是一张遮罩，由主题渐变上色（稀有度、元素各一套）。离线时退回文字字形。
export const GI = name => `url(https://api.iconify.design/game-icons/${name}.svg)`;

export const BASE_ICON = {
  war_staff: 'wizard-staff', wand: 'crystal-wand', maul: 'flat-hammer', dagger: 'plain-dagger',
  tower_shield: 'round-shield', focus: 'crystal-ball', quiver: 'thrown-daggers',
  iron_helm: 'barbute', silk_hood: 'hood', leather_cap: 'light-helm',
  plate: 'chest-armor', robe: 'robe', leather: 'leather-vest',
  gauntlets: 'mailed-fist', silk_gloves: 'gloves', wraps: 'fist',
  greaves: 'leg-armor', slippers: 'boots', treads: 'leather-boot',
  heavy_belt: 'belt-armor', chain_belt: 'belt',
  jade_amulet: 'gem-necklace', onyx_amulet: 'gem-pendant',
  ruby_ring: 'ring', sapphire_ring: 'diamond-ring', topaz_ring: 'ring-mould',
};
export const SLOT_ICON = { weapon: 'wizard-staff', offhand: 'round-shield', helmet: 'barbute', chest: 'chest-armor', gloves: 'gloves', boots: 'leather-boot', belt: 'belt', amulet: 'gem-pendant', ring1: 'ring', ring2: 'ring' };
export const SKILL_ICON = {
  fireball: 'fireball', ice_nova: 'snowflake-1', arc: 'lightning-arc', spark: 'spark-spirit', frost_bolt: 'ice-bolt', flame_wall: 'flame',
  heavy_strike: 'hammer-drop', cleave: 'crossed-swords', cyclone: 'whirlwind', falling_thunder: 'thor-hammer', flicker_strike: 'teleport',
  viper_knives: 'thrown-daggers', summon_blades: 'spinning-sword', storm_totem_place: 'stone-tower',
  glacial_burst: 'frozen-orb', tornado: 'tornado', thunder_fall: 'lightning-branches', ice_spike_burst: 'ice-spear', flame_burst: 'fluffy-flame', blade_ring: 'spinning-blades', ground_slam: 'heavy-fall',
};
export const CURRENCY_ICON = {
  augment: 'crystal-cluster', chaos: 'vortex', upgrade: 'upgrade', annul: 'broken-shield', seal: 'rune-stone', temper: 'anvil-impact',
  essence_form: 'fire-gem', essence_link: 'emerald', essence_core: 'diamond-hard', skill_gem: 'gems',
};
export const PANEL_ICON = { atlas: 'treasure-map', char: 'person', bag: 'knapsack', craft: 'anvil', bd: 'scroll-unfurled', codex: 'laurel-crown' };
export const FAMILY_ICON = { ember: 'campfire', frost: 'ice-cube', storm: 'lightning-storm', blight: 'poison-bottle', ruin: 'dungeon-gate' };
export const LAYER_ICON = { form: 'magic-swirl', link: 'orbit', core: 'sun' };
export const BUFF_ICON = { power: 'sparkles', frenzy: 'flaming-claw', endurance: 'checked-shield', burst: 'bolt-spell-cast', rage: 'skull-crossed-bones',
  onslaught: 'run', fortify: 'shield-reflect', thunder_ready: 'lightning-helix', superconduct: 'electric' };

/** One icon as HTML: a gradient-filled mask, with a text glyph underneath for when icons cannot load. */
export const icon = (name, cls = '', glyph = '') => `<i class="gi ${cls}" style="--i:${GI(name)}" data-g="${glyph}"></i>`;

/** Check once whether the icon service answers; without it the UI shows glyphs. */
export async function probeIcons(root) {
  try {
    const ctrl = new AbortController(); setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch('https://api.iconify.design/game-icons/fireball.svg', { signal: ctrl.signal });
    if (!r.ok) throw new Error();
  } catch { root.classList.add('no-icons'); }
}

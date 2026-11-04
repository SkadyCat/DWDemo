// 图标：自己的一套（design/icons 生成，scripts/build-icons.py 转到 public/assets/icons/<分类>/<id>.*）。
//   painted（技能、装备、通货、传奇、杂项）直接贴图；emblem（功能栏、装备位、地图、增益、状态…）是白色剪影，当遮罩用主题渐变上色。
// 名字里带 '/' 的是自己的图标（'skill/fireball'）；其余仍是 game-icons.net（CC BY 3.0）经 Iconify 提供的遮罩，没有自己的图时用。
import { assetUrl } from '../asset-url.mjs';
import { ICON_INDEX } from './icon-index.mjs';
const PAINTED = new Set(['skill', 'base', 'currency', 'legendary', 'misc']);
/** A few game-icons names used straight in templates / other modules, and the own icon that replaces each. */
const LITERAL = { 'stone-tablet': 'misc/waystone', 'magic-portal': 'misc/town_portal', 'locked-chest': 'misc/stash_chest', 'crowned-skull': 'node/boss', 'evil-moon': 'node/corrupt', 'crossed-swords': 'node/trial',
  'scroll-unfurled': 'panel/bd', 'laurel-crown': 'panel/codex', 'cog': 'panel/settings', 'quill-ink': 'panel/quest', 'anvil': 'panel/craft', 'treasure-map': 'panel/atlas' };
export const ownIcon = name => { const n = LITERAL[name] ?? name; return n && n.includes('/') ? n : null; };
/** { url, painted } for a name: own icons first. */
export function iconInfo(name) {
  const own = ownIcon(name);
  if (own) { const cat = own.split('/')[0], painted = PAINTED.has(cat); return { url: `url(${assetUrl(`/assets/icons/${own}.${painted ? 'webp' : 'png'}`)})`, painted, own: true }; }
  return { url: `url(https://api.iconify.design/game-icons/${name}.svg)`, painted: false, own: false };
}
const has = own => { const [cat, id] = own.split('/'); return !!ICON_INDEX[cat]?.[id]; };
/** 路石：按阶段（T1–4 / 5–8 / 9–12 / 13–16）× 稀有度各一张；还没生成就用通用路石。 */
export const waystoneIcon = w => { const own = `waystone/t${Math.min(3, Math.floor((Math.max(1, w?.tier ?? 1) - 1) / 4)) * 4 + 1}_${w?.rarity ?? 'normal'}`; return has(own) ? own : 'misc/waystone'; };
/** 星契：每种一张（id 形如 bounty_2），三阶共用；还没生成就用星形。 */
export const sigilIcon = id => { const kind = String(id ?? '').replace(/_\d+$/, ''), own = `sigil/${kind}`; return has(own) ? own : 'star-formation'; };
export const GI = name => iconInfo(name).url;

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
  storm_step: 'lightning-trio', frost_dash: 'ice-spear', phantom_step: 'shadow-follower', star_step: 'star-swirl', void_leap: 'portal',
  aegis_nova: 'shield-impact', shield_bash: 'shield-bash', aegis_shards: 'shield-reflect',
  raise_skeletons: 'raise-skeleton', summon_golem: 'golem-head', summon_archers: 'bowman', summon_spiders: 'spider-alt', summon_wisps: 'ice-spell-cast',
  fire_trap: 'land-mine', frost_trap: 'frozen-orb', blade_trap: 'circular-saw', snare_shot: 'wolf-trap', turret_trap: 'ballista', shock_trap: 'electrical-crescent',
  gate_of_treasures: 'portal', treasure_shot: 'thrown-spear', treasure_fall: 'sword-in-stone', sundering_star: 'sun-spear',
  fuse_bolt: 'unlit-bomb', sow_seed: 'sprout', singularity: 'vortex', dominion_lash: 'whip', call_storm: 'lightning-storm', rime_lance: 'ice-spear',
  fuse_blast: 'explosion-rays', thorn_volley: 'thorn-helix', thorn_ring: 'thorny-vine', collapse: 'black-hole-bolas', cloud_bolt: 'lightning-branches', cloud_arc: 'lightning-arc', echo_nova: 'ice-spell-cast',
  summon_wolves: 'wolf-howl', blood_pact: 'bleeding-heart', soul_reap: 'scythe',
  frost_trail: 'ice-spell-cast', step_arc: 'lightning-arc', void_rift: 'vortex', shield_shatter: 'shield-disabled', shield_pulse: 'electric',
};
export const CURRENCY_ICON = {
  augment: 'crystal-cluster', chaos: 'vortex', upgrade: 'upgrade', annul: 'broken-shield', seal: 'rune-stone', temper: 'anvil-impact',
  essence_form: 'fire-gem', essence_link: 'emerald', essence_core: 'diamond-hard', skill_gem: 'gems',
};
export const PANEL_ICON = { quest: 'quill-ink', atlas: 'treasure-map', talents: 'skills', char: 'person', bag: 'knapsack', craft: 'anvil', bd: 'scroll-unfurled', codex: 'laurel-crown', vault: 'locked-chest', settings: 'cog' };
export const FAMILY_ICON = { ember: 'campfire', frost: 'ice-cube', storm: 'lightning-storm', blight: 'poison-bottle', ruin: 'dungeon-gate' };
export const LAYER_ICON = { form: 'magic-swirl', link: 'orbit', core: 'sun' };
export const BUFF_ICON = { power: 'sparkles', frenzy: 'flaming-claw', endurance: 'checked-shield', burst: 'bolt-spell-cast', rage: 'skull-crossed-bones',
  onslaught: 'run', fortify: 'shield-reflect', thunder_ready: 'lightning-helix', superconduct: 'electric' };

/** One icon as HTML: a painted image, or a gradient-filled mask with a text glyph for when icons cannot load. */
export const icon = (name, cls = '', glyph = '') => { const f = iconInfo(name); return f.painted ? `<i class="gi gi-img gi-own ${cls}" style="--img:${f.url}"></i>` : `<i class="gi ${f.own ? 'gi-own' : ''} ${cls}" style="--i:${f.url}" data-g="${glyph}"></i>`; };
/** Keep the game-icons names for the prompt document; the live maps point at own icons. */
export const GAME_ICONS = {};
for (const [cat, map] of [['skill', SKILL_ICON], ['base', BASE_ICON], ['currency', CURRENCY_ICON], ['panel', PANEL_ICON], ['family', FAMILY_ICON], ['layer', LAYER_ICON], ['buff', BUFF_ICON], ['slot', SLOT_ICON]]) {
  GAME_ICONS[cat] = { ...map };
  for (const id of Object.keys(map)) map[id] = `${cat}/${cat === 'slot' && id === 'ring2' ? 'ring1' : id}`;
}
export const STATUS_ICON = id => `status/${id}`;

/** Check once whether the icon service answers; without it the UI shows glyphs. */
export async function probeIcons(root) {
  try {
    const ctrl = new AbortController(); setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch('https://api.iconify.design/game-icons/fireball.svg', { signal: ctrl.signal });
    if (!r.ok) throw new Error();
  } catch { root.classList.add('no-icons'); }
}

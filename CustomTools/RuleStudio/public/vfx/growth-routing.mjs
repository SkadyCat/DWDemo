// Which dedicated effect each growth-build rule shows. Keyed by the rule id carried on the area
// trace (`rule`), so the stages of one skill (strike, burst, 觉醒, 极境) each read differently.
// Entries: [prefab id, style, radius scale, extra].
const S = (prefab, style, k = 1) => [prefab, style, k];
export const GROWTH_AREA_FX = Object.freeze({
  rage_cleave_cast: [S('gs-crescent', 'cleave')],
  rage_cleave_feed: [S('gs-nova', 'cleave'), S('gs-crescent', 'whirl', .8)],
  rage_cleave_awaken_1: [S('gs-crescent', 'flame')],
  rage_cleave_ultimate_1: [S('gs-crescent', 'whirl'), S('gs-nova', 'flame', .7)],

  thunder_strike_cast: [S('gs-crescent', 'thunder')],
  thunder_strike_combo: [S('death-lightning', null, .55), S('gs-nova', 'thunder')],
  thunder_strike_feed: [S('death-lightning', null, .7), S('gs-nova', 'storm')],
  thunder_strike_awaken_1: [S('death-lightning', null, .4)],
  thunder_strike_ultimate_1: [S('death-lightning', null, .8), S('gs-nova', 'storm')],

  ground_slam_cast: [S('gs-quake', null)],
  ground_slam_feed: [S('gs-quake', null), S('gs-nova', 'quake')],
  ground_slam_ultimate_1: [S('gs-nova', 'quake')],

  shield_slam_cast: [S('gs-crescent', 'bulwark')],
  shield_slam_feed: [S('gs-nova', 'bulwark')],
  shield_slam_awaken_1: [S('gs-nova', 'bulwark')],
  shield_slam_ultimate_1: [S('gs-nova', 'bulwark', .9)],

  meteor_cast: [S('gs-meteor', null)],
  meteor_ultimate_1: [S('gs-nova', 'meteor')],

  frost_ring_cast: [S('gs-nova', 'frost')],
  frost_ring_feed: [S('gs-nova', 'frost'), S('gs-nova', 'frost', .55)],
  frost_ring_ultimate_1: [S('gs-nova', 'frost')],

  viper_knives_awaken_1: [S('gs-nova', 'viper')],

  soul_reap_cast: [S('gs-crescent', 'reap')],
  soul_reap_feed: [S('gs-nova', 'reap')],
  soul_reap_ultimate_1: [S('gs-crescent', 'reap'), S('gs-nova', 'reap', .6)],

  ball_lightning_awaken_1: [S('death-lightning', null, .35)],

  flicker_strike_cast: [S('gs-crescent', 'flicker')],
  flicker_strike_feed: [S('gs-nova', 'flicker')],
  flicker_strike_awaken_1: [S('gs-nova', 'flicker', .8)],
  flicker_strike_ultimate_1: [S('gs-crescent', 'flicker', 1.1), S('gs-nova', 'flicker')],
});

/** Projectile kinds with their own batch. */
export const GROWTH_PROJECTILES = Object.freeze({ ball_lightning: 'projectile-ball-lightning', viper_knife: 'projectile-viper-knife', dance_blade: 'projectile-dance-blade', fissure: 'projectile-fissure' });

/** Hero aura palette per growth skill. */
export const GROWTH_AURA_STYLE = Object.freeze({ rage_cleave: 'cleave', thunder_strike: 'thunder', ground_slam: 'quake', blade_dance: 'blade', shield_slam: 'bulwark',
  meteor: 'meteor', frost_ring: 'frost', viper_knives: 'viper', soul_reap: 'reap', ball_lightning: 'storm', flicker_strike: 'flicker' });

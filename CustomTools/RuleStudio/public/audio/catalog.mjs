// Curated CC0 recordings, not synthesized placeholders. Attribution and exact source hashes:
// /audio/LICENSES.md and /audio/sources.json. Several events deliberately share one recording.
import { assetUrl } from '../asset-url.mjs';
const sound = (files, volume, cooldown) => Object.freeze({
  variants: Object.freeze(files.map(file => assetUrl(`/audio/assets/${file}`))), volume, cooldown,
});

// cooldown is in seconds. Gains leave room for overlapping ARPG effects; the mixer owns limits.
export const SOUND_CATALOG = Object.freeze({
  ui_click: sound(['ui-click.ogg'], .35, .045),
  ui_open: sound(['ui-open.ogg'], .18, .08),
  ui_close: sound(['ui-close.ogg'], .18, .08),
  ui_confirm: sound(['ui-confirm.ogg'], .22, .12),
  ui_error: sound(['ui-error.ogg'], .25, .2),

  cast_frost: sound(['ice-cast.wav'], .48, .12),
  cast_fire: sound(['fire-cast.ogg'], .95, .12),
  cast_lightning: sound(['magic-03.ogg'], .22, .16),
  cast_poison: sound(['water-bubble.ogg'], .36, .12),
  cast_physical: sound(['blade-whoosh-01.ogg', 'blade-whoosh-02.ogg'], .36, .08),
  cast_void: sound(['magic-01.ogg'], .48, .16),
  cast_summon: sound(['magic-04.ogg'], .65, .24),

  hit_frost: sound(['ice-cast.wav'], .19, .12),
  hit_fire: sound(['fire-impact.ogg'], .7, .1),
  hit_lightning: sound(['magic-03.ogg'], .1, .2),
  hit_poison: sound(['slime-impact.ogg'], .34, .09),
  hit_physical: sound(['impact-punch-01.ogg', 'impact-punch-02.ogg'], .2, .075),
  hit_void: sound(['magic-01.ogg'], .2, .18),

  explosion_frost: sound(['ice-burst.wav'], .62, .2),
  explosion_fire: sound(['fire-cast.ogg'], 1, .18),
  explosion_lightning: sound(['magic-03.ogg'], .3, .22),
  explosion_poison: sound(['water-splash.ogg'], .48, .16),
  explosion_physical: sound(['impact-punch-02.ogg'], .34, .14),
  explosion_void: sound(['magic-04.ogg'], .7, .24),

  pickup: sound(['pickup-coins.ogg'], .48, .07),
  equip_pickup: sound(['pickup-gem.ogg'], .4, .09),
  consume: sound(['water-bubble.ogg'], .48, .16),
  dodge: sound(['blade-whoosh-02.ogg'], .28, .15),
  player_hurt: sound(['creature-hurt.ogg'], .38, .28),
  victory: sound(['ui-victory.ogg'], .42, 1),
  defeat: sound(['creature-die.ogg'], .4, 1),
});

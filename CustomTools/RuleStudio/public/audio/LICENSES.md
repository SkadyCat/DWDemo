# Curated battle audio

The 24 files in `assets/` are selected, unmodified CC0 recordings from the six original sources below. Only filenames changed; no transcoding, synthesis or time cropping was applied. Catalog event names describe their use in this game: multiple elements and actions intentionally share recordings. They are not 31 independent original effects.

Source pages and licenses were checked and downloaded on 2026-10-25. The original archives, downloaded stand-alone files, full source-page snapshots and archive SHA-256 records are retained in `G:/DungeonWorldBeta/Saved/Audio/` (not shipped as source assets). Exact source filenames, source/archive/asset hashes, sizes and decode measurements are in [sources.json](./sources.json).

## Original authors and licenses

- **kenney-interface** — Kenney. [Original source](https://kenney.nl/assets/interface-sounds); [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
- **kenney-impact** — Kenney. [Original source](https://kenney.nl/assets/impact-sounds); [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
- **oga-rpg** — rubberduck. [Original source](https://opengameart.org/content/80-cc0-rpg-sfx); [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
- **oga-ice** — bart; original pdsounds source credited to Stephan on the original page. [Original source](https://opengameart.org/content/ice-spells); [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
- **oga-magic** — JaggedStone. [Original source](https://opengameart.org/content/magic-spell-sfx); [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
- **oga-water** — rubberduck. [Original source](https://opengameart.org/content/40-cc0-water-splash-slime-sfx); [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).

The Ice spells page credits bart for the effects and Stephan / pdsounds.org for the source recording. That original credit is retained here even though the page distributes the sounds as CC0.

Kenney archive license files are retained verbatim in [Interface Sounds license](./licenses/kenney-interface-License.txt) and [Impact Sounds license](./licenses/kenney-impact-License.txt). The OGA archives contain audio files without separate license text; their original submission pages explicitly mark the submissions as CC0. The canonical legal code is retained in [CC0-1.0.txt](./licenses/CC0-1.0.txt).

## Selected original files

| Shipped file | Original package | Original file |
| --- | --- | --- |
| `ui-click.ogg` | kenney-interface | `Audio/click_001.ogg` |
| `ui-open.ogg` | kenney-interface | `Audio/open_001.ogg` |
| `ui-close.ogg` | kenney-interface | `Audio/close_001.ogg` |
| `ui-confirm.ogg` | kenney-interface | `Audio/confirmation_001.ogg` |
| `ui-error.ogg` | kenney-interface | `Audio/error_001.ogg` |
| `ui-victory.ogg` | kenney-interface | `Audio/confirmation_002.ogg` |
| `impact-punch-01.ogg` | kenney-impact | `Audio/impactPunch_medium_000.ogg` |
| `impact-punch-02.ogg` | kenney-impact | `Audio/impactPunch_heavy_000.ogg` |
| `fire-cast.ogg` | oga-rpg | `spell_fire_06.ogg` |
| `fire-impact.ogg` | oga-rpg | `spell_fire_07.ogg` |
| `blade-whoosh-01.ogg` | oga-rpg | `blade_01.ogg` |
| `blade-whoosh-02.ogg` | oga-rpg | `blade_02.ogg` |
| `pickup-coins.ogg` | oga-rpg | `item_coins_01.ogg` |
| `pickup-gem.ogg` | oga-rpg | `item_gem_01.ogg` |
| `creature-hurt.ogg` | oga-rpg | `creature_hurt_01.ogg` |
| `creature-die.ogg` | oga-rpg | `creature_die_01.ogg` |
| `ice-cast.wav` | oga-ice | `ice.wav` |
| `ice-burst.wav` | oga-ice | `coldsnap.wav` |
| `magic-01.ogg` | oga-magic | `magical_1_0.ogg` |
| `magic-03.ogg` | oga-magic | `magical_3.ogg` |
| `magic-04.ogg` | oga-magic | `magical_4.ogg` |
| `slime-impact.ogg` | oga-water | `slime_02.ogg` |
| `water-splash.ogg` | oga-water | `splash_08.ogg` |
| `water-bubble.ogg` | oga-water | `bubble_01.ogg` |

## Verification

Every shipped file was fully decoded with FFmpeg, rather than validated by extension alone. Audio duration and non-silent peak/RMS information are recorded in `sources.json`. Browser Web Audio decode is checked separately by the integration verification. No microphone samples or externally generated game assets are included.

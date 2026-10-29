// Shared constants of the combat runtime (kept apart from runtime.mjs to avoid import cycles).
import { statusKey } from '../types.mjs';

export const E = Object.freeze({ fire: 0, frost: 1, lightning: 2, physical: 3, poison: 4, void: 5 });
export const ELEMENTAL = new Set([E.fire, E.frost, E.lightning]);
export const POWER = 30;
export const KEYS = Object.freeze(Object.fromEntries(['poison', 'shock', 'chill', 'freeze', 'ignite', 'erosion', 'bleed', 'stun'].map(k => [k, statusKey(k)])));
export const MINION_BASE = 0x30000000;

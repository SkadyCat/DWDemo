// Shared presentation lookup. No rule fields, save migration or runtime registration.
import { ICON_ENTRIES, ICON_ROOT } from './icon-catalog.mjs';
import { assetUrl } from './asset-url.mjs';

const icons = new Map(ICON_ENTRIES.map(icon => [`${icon.kind}:${icon.id}`, assetUrl(icon.src)]));
const weapons = { royal_treasury: 'royal_key', whirlwind: 'gale_spindle', frost_lance: 'frostthorn_staff', flame_burst: 'emberheart_staff', earth_wave: 'sundering_maul',
  player_slash: 'crescent_saber', poison_flask: 'venomglass_flask', sentinel: 'sentinel_scepter', spirit_servant: 'spiritcall_bell', iron_guard:'iron_guard_sigil', ember_hound:'emberfang_talisman', fire_turret:'cinder_turret_staff', storm_totem:'stormcall_rod', lightning_nova:'thunderheart_scepter' };
const slots = { helmet: 'cinder_guard_helmet', chest: 'aegis_of_recharge', gloves: 'bloodthirst_gauntlets', boots: 'warden_boots',
  belt: 'cinder_guard_belt', amulet: 'ember_amulet', ring: 'stormband', offhand: 'cinder_guard_offhand' };

export function iconSrc(kind, value) {
  const doc = typeof value === 'string' ? { id: value } : value || {};
  const direct = icons.get(`${kind}:${doc.id}`) || icons.get(`${kind}:${doc.baseId}`);
  if (direct) return direct;
  if (kind === 'item' && doc.category === 'map') return icons.get('item:map');
  if (kind === 'equipment') {
    const id = doc.slot === 'weapon' ? weapons[doc.skill || doc.skills?.[0]] : slots[doc.slot];
    if (id) return icons.get(`equipment:${id}`);
  }
  return assetUrl(`${ICON_ROOT}/fallback/${['equipment', 'skill'].includes(kind) ? kind : 'item'}.png`);
}

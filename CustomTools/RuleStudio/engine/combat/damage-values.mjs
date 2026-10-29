// Pure outgoing hit values shared by resolution and read-only skill previews.
import { f } from '../types.mjs';
import { EStat, elementStatId, EElementStat } from '../stats.mjs';

export function rawHitDamage(stats, amount, element, mod = null, criticalFactor = 1, dealtBonus = 0) {
  const flat = f(stats.get(elementStatId(element, EElementStat.DamageFlat)) + (mod ? mod.flat : 0));
  const increased = f(stats.get(elementStatId(element, EElementStat.DamagePercent)) + (mod ? mod.increased : 0));
  let raw = f(f(f(f(amount) + flat) * Math.max(0, f(1 + f(increased / 100)))) * criticalFactor);
  raw = f(raw * stats.get(EStat.OwnerDamageMultiplier));
  if (mod && mod.more !== 1) raw = f(raw * Math.max(0, mod.more));
  if (dealtBonus !== 0) raw = f(raw * Math.max(0, f(1 + f(dealtBonus / 100))));
  return raw;
}

export function applyDeliveryDamage(mod, stat, { projectile = false, area = false, triggered = false } = {}) {
  if (projectile) { mod.increased += stat('proj.damage'); mod.more *= stat('proj.more'); mod.critScale += stat('proj.crit') / 100; mod.critMulti += stat('proj.crit_multi'); }
  if (area) { mod.increased += stat('area.damage'); mod.more *= stat('area.more'); mod.critScale += stat('area.crit') / 100; mod.critMulti += stat('area.crit_multi'); }
  if (triggered) { mod.increased += stat('trigger.damage'); mod.more *= stat('trigger.more') * (1 + stat('trigger.no_manual') / 100); }
  return mod;
}

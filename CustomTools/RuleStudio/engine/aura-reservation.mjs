// Aura metadata shared by acquisition, sheet aggregation and resource accounting.
export const DEFAULT_AURA_RESERVATION = 50;
export function auraReservationPercent(source) {
  const params = source?.params;
  const entries = params instanceof Map ? [...params] : Object.entries(params || {});
  const value = entries.find(([key]) => key.toLowerCase() === 'reservation_percent')?.[1];
  return value === undefined ? DEFAULT_AURA_RESERVATION : Number(value);
}

export function selectAuraBudget(ids, percentOf) {
  let percent = 0;
  return [...new Set(ids)].filter(id => {
    const cost = percentOf(id);
    if (!Number.isFinite(cost) || cost <= 0 || cost > 100 || percent + cost > 100 + 1e-9) return false;
    percent += cost;
    return true;
  });
}

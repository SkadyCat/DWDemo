// 佣兵：在冒险者公会（半盏灯酒馆）登记的镇民。雇下来以后可以给他装备，派他去图集上打通过的节点。
// 出征按你打的图数计时（不是现实时间，免得变成挂机），成功带回那片地区的物资和星银、升一级；
// 失败可能会死——死了的人，以后可能在地图里以潮水仿制品的样子出现。最顶级的东西（星尘）佣兵拿不到。
import { FOLK } from './townsfolk.mjs';
import { ARCHETYPES } from '../../core/content/archetypes.mjs';
import { mapIncome, gradeOfTier, REGION_MATERIAL } from './economy.mjs';

export const RANKS = Object.freeze([{ name: '铜牌', lv: [1, 4], hire: 150 }, { name: '银牌', lv: [6, 10], hire: 1800 }, { name: '金牌', lv: [12, 16], hire: 14000 }]);
const SUR = ['陈', '林', '霍', '苏', '韩', '罗', '许', '温', '方', '姜', '白', '陆', '沈', '顾', '叶', '秦', '贺', '梁'];
const GIVEN = ['石头', '阿青', '小满', '铁柱', '寒生', '二丫', '老七', '安', '默', '远', '桑', '禾', '岚', '川', '野', '归', '迟', '烁'];
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; ++i) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const LINES = {
  hire: ['钱给够，哪儿都去。', '我会回来的。大概。', '别让我一个人打首领就行。', '上回那队就剩我一个，这回我挑人。'],
  ok: ['回来了。东西都在这儿。', '那边比你说的难打。钱照给吧？', '走了一趟，腿还在。'],
  hurt: ['没打下来。歇一趟再去。', '差一点。真的就差一点。'],
};

/** The people who will work for money: townsfolk who are not anybody's story (no name of their own), not kids. */
export function mercRoster() {
  const folk = FOLK.filter(f => !f.name && !f.kid);
  return folk.slice(0, 14).map((f, i) => {
    const h = k => hash(f.id + ':' + k), rank = i < 7 ? 0 : i < 11 ? 1 : 2, [lo, hi] = RANKS[rank].lv;
    return { id: f.id, name: SUR[h('s') % SUR.length] + GIVEN[h('g') % GIVEN.length], rank, level: lo + h('l') % (hi - lo + 1),
      bd: ARCHETYPES[h('b') % ARCHETYPES.length].id, female: f.female, race: f.race };
  });
}
export const archetypeName = id => ARCHETYPES.find(a => a.id === id)?.name ?? id;
export const mercLine = (kind, seed = 0) => LINES[kind][seed % LINES[kind].length];

/** How strong a hired merc is: their level and the best gear you handed them. */
export const mercPower = m => m.level + Math.max(0, ...Object.values(m.gear ?? {}).map(it => it?.tier ?? 0)) * 0.5;
/** Chance an expedition to a node of this tier comes back with the goods. */
export const successChance = (m, tier) => Math.max(0.1, Math.min(0.96, 0.62 + 0.09 * (mercPower(m) - tier)));
/** Silver to send someone out (a share of what the map pays), and how many of your maps it takes. */
export const expeditionFee = (tier, mult = 1) => Math.round(mapIncome(tier) * 0.35 * mult);
export const expeditionMaps = tier => tier <= 5 ? 2 : tier <= 10 ? 3 : 4;

export function hire(save, roster, id, maxRank) {
  const r = roster.find(x => x.id === id);
  if (!r || save.mercs?.some(m => m.id === id) || (save.fallen ?? []).some(m => m.id === id) || r.rank > maxRank - 1 || (save.silver ?? 0) < RANKS[r.rank].hire) return null;
  save.silver -= RANKS[r.rank].hire;
  const m = { ...r, xp: 0, gear: {}, trip: null, wins: 0 };
  (save.mercs ??= []).push(m);
  return m;
}
/** Hand a merc a piece from the bag (weapon or armour; the old one comes back). */
export function giveGear(save, mercId, item) {
  const m = save.mercs?.find(x => x.id === mercId); if (!m || m.trip) return false;
  const slot = item.slot === 'weapon' || item.slot === 'offhand' ? 'weapon' : 'armour';
  const i = save.inventory.indexOf(item); if (i < 0) return false;
  save.inventory.splice(i, 1);
  if (m.gear[slot]) save.inventory.push(m.gear[slot]);
  m.gear[slot] = item;
  return true;
}
/** Send them out to an atlas node you have reached. */
export function sendOut(save, mercId, node, feeMult = 1) {
  const m = save.mercs?.find(x => x.id === mercId);
  if (!m || m.trip || m.restUntil > (save.stats?.maps ?? 0)) return null;
  const fee = expeditionFee(node.tier, feeMult);
  if ((save.silver ?? 0) < fee) return null;
  save.silver -= fee;
  m.trip = { node: node.id, tier: node.tier, family: node.family, name: node.name, back: (save.stats?.maps ?? 0) + expeditionMaps(node.tier), chance: successChance(m, node.tier) };
  return m.trip;
}
/**
 * After each of your maps: anyone whose trip is over comes back. rng decides how it went.
 * Returns [{ merc, ok, died, loot: { silver, materials } }].
 */
export function mercTick(save, rng = Math.random, matBonus = 0) {
  const out = [], now = save.stats?.maps ?? 0;
  for (const m of [...(save.mercs ?? [])]) {
    const t = m.trip; if (!t || now < t.back) continue;
    m.trip = null;
    if (rng() < t.chance) {
      const mat = `${REGION_MATERIAL[t.family] ? t.family : 'ruin'}_${gradeOfTier(t.tier)}`, n = Math.round((4 + Math.floor(t.tier / 3)) * (1 + matBonus));
      const loot = { silver: Math.round(mapIncome(t.tier) * 0.9), materials: { [mat]: n, sand: 1 + (rng() < 0.5 ? 1 : 0) } };
      save.silver = (save.silver ?? 0) + loot.silver;
      for (const [id, k] of Object.entries(loot.materials)) save.materials[id] = (save.materials[id] ?? 0) + k;
      m.wins++; if (m.level < 20) m.level++;
      out.push({ merc: m, ok: true, loot, trip: t });
    } else if (rng() < 0.45) {
      save.mercs.splice(save.mercs.indexOf(m), 1);
      (save.fallen ??= []).push({ id: m.id, name: m.name, at: t.name, tier: t.tier, family: t.family });
      out.push({ merc: m, ok: false, died: true, trip: t });
    } else { m.restUntil = now + 1; out.push({ merc: m, ok: false, trip: t }); }
  }
  return out;
}

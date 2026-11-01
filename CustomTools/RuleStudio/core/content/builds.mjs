// 配装生成：把「流派的分阶段收集清单」铺到 10 件装备 × 9 条词条上。
// 每个阶段给出：该凑齐的关键词条（BD 形态）、放大用的数值词条、防守需求；生成器按槽位规则摆放，
// 同一件装备同一族只出现一次。生成结果就是玩家在这个阶段「应该」拿到的装备。
import { SLOTS, family, affixLine, lineTierFor } from './families.mjs';
import { resistPenalty } from './maps.mjs';

export const STAGES = Object.freeze([
  { id: 'start', name: '起步', itemTier: 2, maps: [1, 3], linesPerItem: 3 },
  { id: 'formed', name: '成型', itemTier: 4, maps: [4, 6], linesPerItem: 5 },
  { id: 'wall', name: '卡关', itemTier: 6, maps: [7, 10], linesPerItem: 7 },
  { id: 'break', name: '突破', itemTier: 8, maps: [11, 13], linesPerItem: 8 },
  { id: 'final', name: '毕业', itemTier: 10, maps: [14, 16], linesPerItem: 9 },
]);

/**
 * archetype: {
 *   id, name, skills, keepDistance,
 *   key: [[familyId, fromStage, slot?], ...]   lines that define the build, in the order the player finds them
 *   amp: [familyId, ...]                       offence numbers, priority order
 *   defence: [familyId, ...]                   defence priority order (resists first, then pools, layers, sustain)
 * }
 * Returns { items: { slot: [{ id, tier, layer, role }] }, affixes, skills, lines, roles }.
 */
export function stageBuild(archetype, stageIndex) {
  const stage = STAGES[stageIndex];
  const items = Object.fromEntries(SLOTS.map(s => [s, []]));
  const cap = stage.linesPerItem;
  // Resistances are only worth stacking up to the cap of the hardest map this stage targets.
  const resTarget = 75 + resistPenalty(stage.maps[1]) + 5;
  const resSum = { fire: 0, cold: 0, lightning: 0, chaos: 0 };
  const resOf = (fid, tier) => {
    const v = family(fid).values[tier - 1];
    if (fid === 'res_all') return { fire: v, cold: v, lightning: v };
    const m = /^res_(fire|cold|lightning|chaos)$/.exec(fid);
    return m ? { [m[1]]: v } : null;
  };
  const place = (fid, role, prefer) => {
    const f = family(fid);
    const tier = lineTierFor(fid, stage.itemTier);
    if (!tier) return false;
    const res = role === 'defence' ? resOf(fid, tier) : null;
    if (res && Object.keys(res).every(e => resSum[e] >= (e === 'chaos' ? resTarget - 75 : resTarget))) return false;
    if (f.maxPerBuild && SLOTS.reduce((n, s) => n + items[s].filter(l => l.id === fid).length, 0) >= f.maxPerBuild) return false;
    const slots = prefer ? [prefer, ...f.slots.filter(s => s !== prefer)] : [...f.slots].sort((a, b) => items[a].length - items[b].length);
    for (const s of slots) {
      if (!f.slots.includes(s) || items[s].length >= cap || items[s].some(l => l.id === fid)) continue;
      items[s].push({ id: fid, tier, layer: f.layer, role });
      if (res) for (const e in res) resSum[e] += res[e];
      return true;
    }
    return false;
  };
  for (const [fid, from, slot] of archetype.key) if (from <= stageIndex) place(fid, 'key', slot);
  // Defence and offence interleave so both sides grow together. The priority lists are walked
  // round after round (a family may sit on several items) until a full round places nothing.
  const share = archetype.defenceShare ?? 0.5;
  const lists = { defence: archetype.defence, offence: archetype.amp };
  const cursor = { defence: 0, offence: 0 }, placed = { defence: 0, offence: 0 }, stuck = { defence: 0, offence: 0 };
  const full = () => SLOTS.every(s => items[s].length >= cap);
  while (!full() && (stuck.defence < lists.defence.length || stuck.offence < lists.offence.length)) {
    let role = placed.defence <= (placed.defence + placed.offence) * share ? 'defence' : 'offence';
    if (stuck[role] >= lists[role].length) role = role === 'defence' ? 'offence' : 'defence';
    const list = lists[role], fid = list[cursor[role]++ % list.length];
    if (place(fid, role)) { placed[role]++; stuck[role] = 0; } else stuck[role]++;
  }
  const affixes = [], lines = [];
  for (const s of SLOTS) for (const l of items[s]) { affixes.push(affixLine(l.id, l.tier)); lines.push({ slot: s, ...l }); }
  return { stage, items, affixes, skills: archetype.skills, keepDistance: archetype.keepDistance ?? 0, lines };
}

/** Readable collection list for one stage: what to chase, grouped by role. */
export function collectionList(archetype, stageIndex) {
  const b = stageBuild(archetype, stageIndex);
  const by = role => b.lines.filter(l => l.role === role).map(l => `${affixLine(l.id, l.tier).name}（${l.slot}）`);
  const newKeys = archetype.key.filter(([, from]) => from === stageIndex).map(([fid]) => fid);
  return { stage: b.stage.name, maps: b.stage.maps, newKeys, key: by('key'), offence: by('offence'), defence: by('defence'), total: b.lines.length };
}

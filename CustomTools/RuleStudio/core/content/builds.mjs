// 配装生成：把「流派的分阶段收集清单」铺到 10 件装备上：每件 3 条基底（武器第 1 条是主动技能，其余是特性）+ 随机数值词条。
// 每个阶段给出：该凑齐的关键词条（BD 形态）、放大用的数值词条、防守需求；生成器按槽位规则摆放，
// 同一件装备同一族只出现一次。生成结果就是玩家在这个阶段「应该」拿到的装备。
import { SLOTS, family, affixLine, lineTierFor } from './families.mjs';
import { BASE_LINES, isTrait, presetBase, itemAffixes } from './items.mjs';
import { resistPenalty } from './maps.mjs';

export const STAGES = Object.freeze([
  { id: 'start', name: '起步', itemTier: 2, maps: [1, 3], randomLines: 2 },
  { id: 'formed', name: '成型', itemTier: 4, maps: [4, 6], randomLines: 3 },
  { id: 'wall', name: '卡关', itemTier: 6, maps: [7, 10], randomLines: 4 },
  { id: 'break', name: '突破', itemTier: 8, maps: [11, 13], randomLines: 5 },
  { id: 'final', name: '毕业', itemTier: 10, maps: [14, 16], randomLines: 6 },
]);

// Mods-only traits stack across items (two +projectile traits = more projectiles); triggers and cores do not.
const stackable = fid => family(fid).layer !== 'core' && !family(fid).unique && !family(fid).tags.includes('conversion') && !(affixLine(fid, 1).rules?.length);

/**
 * archetype: {
 *   id, name, skills, keepDistance,
 *   key: [[familyId, fromStage, slot?], ...]   lines that define the build, in the order the player finds them
 *   traits: [familyId, ...]                    further traits the build wants (generic, priority order)
 *   amp: [familyId, ...]                       offence numbers, priority order
 *   defence: [familyId, ...]                   defence priority order (resists first, then pools, layers, sustain)
 * }
 * Every item: base line 1 = the build's skill on the weapon (other items: a trait), base lines 2–3 =
 * traits (form/link/core); random lines = stat lines only. Returns
 * { items: { slot: { skill, traits:[line], lines:[line] } }, affixes, skills, lines, traits }.
 */
export function stageBuild(archetype, stageIndex) {
  const stage = STAGES[stageIndex];
  const items = Object.fromEntries(SLOTS.map(s => [s, { skill: s === 'weapon' ? archetype.skills[0] : null, traits: [], lines: [] }]));
  const traitCap = s => BASE_LINES - (items[s].skill ? 1 : 0);
  const cap = stage.randomLines;
  const used = s => [...items[s].traits, ...items[s].lines].map(l => l.id);
  // Resistances are only worth stacking up to the cap of the hardest map this stage targets.
  const resTarget = 75 + resistPenalty(stage.maps[1]) + 5;
  const resSum = { fire: 0, cold: 0, lightning: 0, chaos: 0 };
  const resOf = (fid, tier) => {
    const v = family(fid).values[tier - 1];
    if (fid === 'res_all') return { fire: v, cold: v, lightning: v };
    const m = /^res_(fire|cold|lightning|chaos)$/.exec(fid);
    return m ? { [m[1]]: v } : null;
  };
  const count = fid => SLOTS.reduce((n, s) => n + used(s).filter(id => id === fid).length, 0);
  const place = (fid, role, prefer) => {
    const f = family(fid), trait = isTrait(fid);
    const tier = lineTierFor(fid, stage.itemTier);
    if (!tier) return false;
    const res = role === 'defence' ? resOf(fid, tier) : null;
    if (res && Object.keys(res).every(e => resSum[e] >= (e === 'chaos' ? resTarget - 75 : resTarget))) return false;
    if (f.maxPerBuild && count(fid) >= f.maxPerBuild) return false;
    if (trait && count(fid) >= (stackable(fid) ? 2 : 1)) return false;
    const room = s => trait ? items[s].traits.length < traitCap(s) : items[s].lines.length < cap;
    const slots = prefer ? [prefer, ...f.slots.filter(s => s !== prefer)] : [...f.slots].sort((a, b) => (trait ? items[a].traits.length - items[b].traits.length : items[a].lines.length - items[b].lines.length));
    for (const s of slots) {
      if (!f.slots.includes(s) || !room(s) || used(s).includes(fid)) continue;
      (trait ? items[s].traits : items[s].lines).push({ id: fid, tier, layer: f.layer, role });
      if (res) for (const e in res) resSum[e] += res[e];
      return true;
    }
    return false;
  };
  for (const [fid, from, slot] of archetype.key) if (from <= stageIndex) place(fid, 'key', slot);
  // Further traits: the build's own list, then a second pass that stacks the mods-only ones.
  // A later stage's 质变 must not sneak in early as a filler trait.
  const later = new Set(archetype.key.filter(([, from]) => from > stageIndex).map(([fid]) => fid));
  const ok = fid => !later.has(fid);
  const traitList = [...(archetype.traits ?? []), ...DEFENCE_TRAITS].filter(ok);
  for (const fid of traitList) place(fid, 'trait');
  const owned = archetype.key.filter(([, from]) => from <= stageIndex).map(([fid]) => fid);
  for (let round = 0; round < 3; ++round) for (const fid of [...owned, ...traitList]) if (isTrait(fid) && stackable(fid)) place(fid, 'trait');
  // Every item has three base lines: whatever is still open gets a generic trait.
  for (let round = 0; round < 3; ++round) for (const fid of FALLBACK_TRAITS.filter(ok)) place(fid, 'trait');
  // Random lines: defence and offence interleave so both sides grow together. Stat layer only.
  const share = archetype.defenceShare ?? 0.5;
  const statOnly = list => list.filter(fid => !isTrait(fid));
  // Resistances first: they are a hard requirement of every map.
  const budget = Math.floor((cap * SLOTS.length - SLOTS.reduce((n, s) => n + items[s].lines.length, 0)) * share * 0.5);
  let resPlaced = 0;
  for (let round = 0; round < 12 && resPlaced < budget; ++round) {
    let any = false;
    for (const e of ['fire', 'cold', 'lightning']) {
      if (resPlaced >= budget || resSum[e] >= resTarget) continue;
      if (place(`res_${e}`, 'defence')) { resPlaced++; any = true; }
    }
    if (!any) break;
  }
  const lists = { defence: statOnly(archetype.defence), offence: statOnly(archetype.amp) };
  const cursor = { defence: 0, offence: 0 }, placed = { defence: 0, offence: 0 }, stuck = { defence: 0, offence: 0 };
  const full = () => SLOTS.every(s => items[s].lines.length >= cap);
  while (!full() && (stuck.defence < lists.defence.length || stuck.offence < lists.offence.length)) {
    let role = placed.defence <= (placed.defence + placed.offence) * share ? 'defence' : 'offence';
    if (stuck[role] >= lists[role].length) role = role === 'defence' ? 'offence' : 'defence';
    const list = lists[role], fid = list[cursor[role]++ % list.length];
    if (place(fid, role)) { placed[role]++; stuck[role] = 0; } else stuck[role]++;
  }
  // Bases: the weapon fits the skill; armour pieces match the build's defence (armour / evasion / energy shield).
  const defKind = ['es', 'armour', 'evasion'].find(k => archetype.defence.includes(k)) ?? 'armour';
  for (const s of SLOTS) items[s].base = presetBase(s, items[s].skill, defKind).id;
  const affixes = [], lines = [];
  for (const s of SLOTS) {
    affixes.push(...itemAffixes({ slot: s, base: items[s].base, tier: stage.itemTier, traits: [], lines: [] }));
    for (const [kind, list] of [['trait', items[s].traits], ['random', items[s].lines]])
      for (const l of list) { affixes.push(affixLine(l.id, l.tier)); lines.push({ slot: s, kind, ...l }); }
  }
  const skills = [...new Set(SLOTS.map(s => items[s].skill).filter(Boolean))];
  return { stage, items, affixes, skills, keepDistance: archetype.keepDistance ?? 0, lines, traits: lines.filter(l => l.kind === 'trait') };
}

/** Traits every build can use to survive (they still change how a fight plays). */
export const DEFENCE_TRAITS = Object.freeze(['res_max', 'struck_nova', 'struck_endurance', 'per_endurance']);
const FALLBACK_TRAITS = Object.freeze(['per_endurance', 'res_max', 'kill_onslaught', 'kill_minion', 'hit_fortify', 'area_more', 'kill_frenzy', 'minion_count', 'move_trigger', 'struck_nova', 'struck_endurance', 'proj_count', 'proj_pierce', 'proj_chain', 'strike_targets', 'multistrike']);

/** Readable collection list for one stage: what to chase, grouped by role. */
export function collectionList(archetype, stageIndex) {
  const b = stageBuild(archetype, stageIndex);
  const by = pred => b.lines.filter(pred).map(l => `${affixLine(l.id, l.tier).name}（${l.slot}）`);
  const newKeys = archetype.key.filter(([, from]) => from === stageIndex).map(([fid]) => fid);
  return { stage: b.stage.name, maps: b.stage.maps, newKeys, ladder: archetype.ladder?.[stageIndex] ?? null,
    key: by(l => l.role === 'key'), traits: by(l => l.kind === 'trait'), offence: by(l => l.role === 'offence'), defence: by(l => l.role === 'defence'),
    traitCount: b.traits.length, total: b.lines.length };
}

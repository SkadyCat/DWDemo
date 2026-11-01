// 特性视图：身上 20 多条特性按层分组；流派的五级质变阶梯哪些已经点亮（只看词条族，不看 T 阶）。
import { SLOTS, family, LAYERS, affixLine } from '../../core/content/families.mjs';
import { lineText } from '../../core/content/items.mjs';
import { ARCHETYPES } from '../../core/content/archetypes.mjs';

/** Every equipped trait: { slot, id, tier, layer, text }, grouped by layer (core, link, form). */
export function equippedTraits(save) {
  const out = [];
  for (const s of SLOTS) for (const l of save.equipped[s]?.traits ?? []) out.push({ slot: s, id: l.id, tier: l.tier, layer: family(l.id).layer, text: lineText(l) });
  const order = { core: 0, link: 1, form: 2 };
  out.sort((a, b) => order[a.layer] - order[b.layer]);
  const groups = ['core', 'link', 'form'].map(layer => ({ layer, name: LAYERS[layer].name, items: out.filter(t => t.layer === layer) })).filter(g => g.items.length);
  return { all: out, groups, distinct: new Set(out.map(t => t.id)).size };
}

/** family id → the strongest equipped line of it. */
function familiesOn(save) {
  const m = new Map();
  for (const s of SLOTS) for (const l of save.equipped[s] ? [...save.equipped[s].traits, ...save.equipped[s].lines] : []) if (!m.has(l.id) || m.get(l.id).tier < l.tier) m.set(l.id, l);
  return m;
}

/** The archetype's ladder against what is equipped: each stage lit when all its key families are on. */
export function ladderStatus(archetype, save) {
  const have = familiesOn(save);
  let reached = -1, broken = false;
  const stages = archetype.ladder.map((st, i) => {
    const keys = st.keys.map(([fid]) => { const l = have.get(fid); return { id: fid, name: l ? lineText(l) : affixLine(fid, 1).name, on: !!l }; });
    const lit = keys.every(k => k.on);
    if (lit && !broken) reached = i; else broken = true;
    return { ...st, index: i, keys, lit, got: keys.filter(k => k.on).length };
  });
  return { archetype, stages, reached };
}

/** The archetype whose ladder the gear follows furthest (the applied one wins ties). */
export function detectArchetype(save) {
  let best = null;
  for (const a of ARCHETYPES) {
    const st = ladderStatus(a, save), score = st.stages.reduce((n, s) => n + s.got, 0) + (a.id === save.archetype ? 0.5 : 0);
    if (!best || score > best.score) best = { ...st, score };
  }
  return best && best.score >= 2 ? best : null;
}

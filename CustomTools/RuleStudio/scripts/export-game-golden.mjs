// UE 游戏层金样：网页版游戏层（图集生成、掉落、洗炼、路石、天赋、一张地图的完整挑战）在固定种子下的结果，
// UE 版（Plugins/DWGame/Source/DWGameCore）必须逐项复现。
//
//   node scripts/export-game-golden.mjs [输出目录]     默认 export/game-golden
//
// 物品的 uid 带时间戳，不参与比较。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateAtlas, newAtlasState, atlasView, completeNode, nodeMods } from '../public/game/atlas.mjs';
import { dungeonRandom } from '../public/game/dungeon.mjs';
import { rollDrops, rollItem, rollLegendary, applyCurrency, rarityOf, itemName, CURRENCIES, LEGENDARIES, baseDefence, itemAffixes } from '../core/content/items.mjs';
import { rollWaystoneDrops, rollWaystone, starterWaystones } from '../public/game/waystones.mjs';
import { TALENT_TREE, canAllocate, canRefund, talentPoints } from '../core/content/talents.mjs';
import { newSave, buildOf, equip, applyArchetype, salvage, craft } from '../public/game/save.mjs';
import { ARCHETYPES } from '../core/content/archetypes.mjs';
import { MapRun } from '../public/game/run.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(process.argv[2] ?? path.join(here, '..', 'export/game-golden'));
const ROUND = v => Math.round(v * 1e6) / 1e6;
const strip = item => item && { slot: item.slot, base: item.base, tier: item.tier, baseLines: item.baseLines ?? null, skill: item.skill ?? null, legend: item.legend ?? null,
  traits: item.traits.map(l => ({ id: l.id, tier: l.tier, sealed: !!l.sealed })), lines: item.lines.map(l => ({ id: l.id, tier: l.tier, sealed: !!l.sealed })),
  rarity: rarityOf(item).id, name: itemName(item), affixes: itemAffixes(item).map(a => a.id) };
const drop = d => d.type === 'item' ? { type: 'item', item: strip(d.item) } : d.type === 'currency' ? { type: 'currency', id: d.id, count: d.count } : { type: 'waystone', stone: stone(d.stone) };
const stone = s => ({ tier: s.tier, rarity: s.rarity, mods: [...s.mods] });

const files = {};

// ---- atlas -------------------------------------------------------------------------------------
files.atlas = [1, 7, 4242, 987654321].map(seed => {
  const a = generateAtlas(seed);
  const st = newAtlasState(seed, 1), steps = [];
  // Clear a few open nodes in id order and record what opens.
  for (let k = 0; k < 6; ++k) {
    const v = atlasView(a, st), open = [...v.open].sort((x, y) => x - y);
    if (!open.length) break;
    const id = open[0], opened = completeNode(a, st, id);
    steps.push({ cleared: id, opened, done: [...st.done], mods: nodeMods(a.nodes[id]) });
  }
  return { seed, nodes: a.nodes.map(n => ({ ...n, mods: [...n.mods] })), edges: a.edges, steps,
    oldSave: newAtlasState(seed, 5).done.length };
});

// ---- drops, items, crafting, waystones ----------------------------------------------------------
files.drops = [3, 99].map(seed => {
  const rng = dungeonRandom(seed), kills = [];
  for (const [tier, kind, quantity, legend] of [[1, 'monster', 1, 1], [5, 'elite', 1.3, 2], [9, 'boss', 1.5, 1], [16, 'boss', 2, 3], [12, 'monster', 1, 1], [3, 'elite', 1, 1]]) {
    for (let i = 0; i < (kind === 'monster' ? 40 : 4); ++i) kills.push({ tier, kind, drops: rollDrops(tier, kind, rng, { quantity, legend }).map(drop) });
  }
  const stones = [];
  for (const [tier, kind, q] of [[1, 'boss', 1], [8, 'elite', 1], [16, 'boss', 1.5], [4, 'monster', 1]]) for (let i = 0; i < 30; ++i) stones.push(rollWaystoneDrops(tier, kind, rng, q).map(stone));
  return { seed, kills, stones, starter: [starterWaystones([], rng).map(stone), starterWaystones([3, 4], rng).map(stone)], next: rng() };
});

files.crafting = [5, 31].map(seed => {
  const rng = dungeonRandom(seed), runs = [];
  const ids = Object.keys(CURRENCIES);
  for (let k = 0; k < 24; ++k) {
    const item = k % 6 === 5 ? rollLegendary(LEGENDARIES[k % LEGENDARIES.length].id, 1 + (k % 10), rng) : rollItem(1 + (k % 10), rng);
    const steps = [];
    for (let s = 0; s < 14; ++s) {
      const currency = ids[(k * 7 + s * 3) % ids.length];
      const sel = s % 3 === 0 ? { kind: 'trait', index: s % 3 } : s % 3 === 1 ? { kind: 'line', index: s % 4 } : null;
      const r = applyCurrency(item, currency, rng, sel);
      steps.push({ currency, sel, ok: r.ok, message: r.message, item: strip(item) });
    }
    runs.push({ start: steps.length ? undefined : null, steps, defence: baseDefence(item) });
  }
  return { seed, runs, next: rng() };
});

// ---- talents --------------------------------------------------------------------------------------
{
  const rng = dungeonRandom(77), alloc = [], log = [];
  for (let k = 0; k < 400 && alloc.length < 60; ++k) {
    const id = Math.floor(rng() * TALENT_TREE.nodes.length);
    if (canAllocate(alloc, id)) { alloc.push(id); log.push({ op: 'take', id }); }
    else if (alloc.includes(id)) { const ok = canRefund(alloc, id); log.push({ op: 'refund', id, ok }); if (ok) alloc.splice(alloc.indexOf(id), 1); }
  }
  files.talents = { log, final: [...alloc], points: talentPoints([{ id: 0, kind: 'normal' }, { id: 3, kind: 'boss' }, { id: 4, kind: 'vault' }]) };
}

// ---- saves: one-click builds, equip, salvage --------------------------------------------------------
files.saves = ARCHETYPES.flatMap(a => [0, 4].map(stage => {
  const save = newSave();
  applyArchetype(save, a.id, stage);
  const b = buildOf(save);
  return { archetype: a.id, stage, skills: b.skills, keepDistance: b.keepDistance, affixes: b.affixes.map(x => x.id), unlocked: save.unlocked,
    equipped: Object.fromEntries(Object.entries(save.equipped).map(([s, it]) => [s, strip(it)])) };
}));

// ---- map runs: a scripted fight on a real map --------------------------------------------------------
function scriptedRun({ name, archetype, stage, tier, family, seed, mods, seconds }) {
  const save = newSave();
  if (archetype) applyArchetype(save, archetype, stage);
  const run = new MapRun(buildOf(save), { tier, family, seed, mods });
  const monsters = run.monsters.map(m => ({ id: m.id, kind: m.kind, name: m.name, x: ROUND(m.x), y: ROUND(m.y), life: ROUND(m.max.life), es: ROUND(m.max.es), element: m.element, elite: m.eliteMods, radius: m.radius }));
  const frames = [], dt = 1 / 30;
  for (let f = 0; f < seconds * 30; ++f) {
    const h = run.hero, t = f * dt;
    // Walk toward the nearest monster when far, stop and cast when near; sweep the aim with it.
    let best = null, bd = Infinity;
    for (const m of run.monsters) { const d = (m.x - h.x) ** 2 + (m.y - h.y) ** 2; if (d < bd || (d === bd && best && m.id < best.id)) { bd = d; best = m; } }
    if (best) {
      run.setAim(best.x, best.y);
      const far = bd > 520 * 520;
      run.setMove(far ? Math.sign(Math.round(best.x - h.x)) : 0, far ? Math.sign(Math.round(best.y - h.y)) : 0);
      run.setCasting(!far);
    } else { run.setMove(0, 0); run.setCasting(false); }
    if (f % 150 === 149 && run.skills.length > 1) run.select((run.selected + 1) % run.skills.length);
    // Click the first equipment label on the ground now and then.
    if (f % 90 === 45) { const l = run.loot.find(x => x.drop.type !== 'currency'); if (l) run.walkToLoot(l.key); }
    run.step(dt);
    if (f % 15 === 14 || run.phase === 'failed') frames.push({ f, phase: run.phase, x: ROUND(h.x), y: ROUND(h.y), life: ROUND(h.life), mana: ROUND(h.mana), kills: run.kills, combo: run.combo,
      best: run.bestCombo, cascade: run.cascadeKills, clears: run.screenClears.length, loot: run.loot.length, picked: run.pickedUp.length, alive: run.monsters.length, selected: run.selected });
    if (run.phase === 'failed') break;
  }
  const collected = run.collectAll();
  return { name, archetype, stage, tier, family, seed, mods, total: run.total, boss: run.boss.id, entry: run.dungeon.entry, monsters, frames,
    picked: collected.map(drop), screenClears: run.screenClears.map(c => ({ t: ROUND(c.t), n: c.n })) };
}
files.runs = [
  { name: 'fresh_t1', archetype: null, stage: 0, tier: 1, family: 'ruin', seed: 11, mods: {}, seconds: 40 },
  { name: 'inferno_t6', archetype: 'inferno', stage: 1, tier: 6, family: 'ember', seed: 23, mods: { pack: 1.4, quantity: 1.15 }, seconds: 40 },
  { name: 'storm_t12', archetype: 'storm', stage: 3, tier: 12, family: 'storm', seed: 31, mods: { elite: 1.6, legend: 2 }, seconds: 40 },
  { name: 'tempest_t16', archetype: 'tempest', stage: 4, tier: 16, family: 'frost', seed: 47, mods: { life: 1.35, damage: 1.3 }, seconds: 40 },
].map(scriptedRun);

fs.mkdirSync(outDir, { recursive: true });
for (const [k, v] of Object.entries(files)) fs.writeFileSync(path.join(outDir, `${k}.json`), JSON.stringify(v) + '\n');
console.log(`游戏金样 → ${path.relative(process.cwd(), outDir)}：${Object.keys(files).join(' · ')}`);
for (const r of files.runs) console.log(`  ${r.name.padEnd(14)} ${r.monsters.length} 怪 · 击杀 ${r.frames.at(-1).kills} · ${r.frames.at(-1).phase} · 拾取 ${r.picked.length}`);

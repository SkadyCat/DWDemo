// UE 游戏数据导出：游戏层（营地、地图、掉落、洗炼、路石、图集、天赋、流派）在网页版里用到的全部常量与表，
// 展开成纯 JSON，供 UE 版游戏层（Plugins/DWGame/Source/DWGameCore）读取。规则内容（技能、词条…）在
// export-ue-content.mjs；这里只放规则引擎之外、游戏玩法自己的数据。
//
//   node scripts/export-ue-game.mjs [输出文件]          默认 export/dw-game.json
//
// 同一提交下两次导出逐字节相同。
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SLOTS, LAYERS, families, family, affixLine, lineTierFor } from '../core/content/families.mjs';
import { SLOT_NAMES, RARITY, MAX_LINES, BASE_LINES, BASE_LINE_ODDS, TRAIT_LAYERS, ITEM_SKILLS, SKILL_CHANCE, BASE_DEF, BIG_SLOT, BASES, CURRENCIES } from '../core/content/items.mjs';
import { LEGENDARIES } from '../core/content/legendaries.mjs';
import { ARCHETYPES } from '../core/content/archetypes.mjs';
import { STAGES, stageBuild } from '../core/content/builds.mjs';
import { MAP_TIERS, TRASH_LIFE, MAP_FAMILIES, ELITE_MODS, MONSTER_TYPES, mapProfile, mapRequirements } from '../core/content/maps.mjs';
import { HERO_BASE } from '../core/sim.mjs';
import { TALENT_TREE, TALENT_TIERS, talentLines, talentName } from '../core/content/talents.mjs';
import { STATUS_LOOK } from '../public/game/run.mjs';
import { WAYSTONE_RARITY, FREE_TIER } from '../public/game/waystones.mjs';
import { ATLAS_RADIUS, FAMILY_ORDER, FAMILY_HUE, REGION_NAME, NODE_KINDS, NODE_MODS, KIND_MODS, PREFIX, SUFFIX } from '../public/game/atlas.mjs';
import { BASE_ICON, SLOT_ICON, SKILL_ICON, CURRENCY_ICON, PANEL_ICON, FAMILY_ICON, LAYER_ICON, BUFF_ICON } from '../public/game/icons.mjs';
import { SKILL_BAR } from '../public/game/save.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const out = path.resolve(process.argv[2] ?? path.join(root, 'export/dw-game.json'));
const plain = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
function commit() {
  if (process.env.DW_COMMIT) return process.env.DW_COMMIT;
  try { return execSync('git rev-parse HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return 'unknown'; }
}

export function buildGameExport() {
  const fams = families();
  return {
    format: 'dw-game/1',
    generatedFrom: commit(),
    heroBase: plain(HERO_BASE),
    skillBar: SKILL_BAR,
    slots: [...SLOTS],
    slotNames: plain(SLOT_NAMES),
    layers: plain(LAYERS),
    traitLayers: [...TRAIT_LAYERS],
    // Family metadata the item rules need (effects live in the content pack as affixes `<id>#T<n>`).
    families: fams.map(f => plain({ id: f.id, name: f.name, layer: f.layer, levels: f.levels, values: f.values, slots: f.slots, tags: f.tags,
      noDrop: !!f.noDrop, unique: !!f.unique, maxPerBuild: f.maxPerBuild ?? 0,
      // lineTierFor(id, itemTier) for item tiers 1..10 (index 0 = tier 1).
      lineTier: Array.from({ length: 10 }, (_, i) => lineTierFor(f.id, i + 1)),
      lineNames: Array.from({ length: f.levels }, (_, i) => affixLine(f.id, i + 1).name) })),
    items: {
      // 0.72 ** k, the line-tier roll weights (rollLineTier).
      linePow: Array.from({ length: 11 }, (_, k) => 0.72 ** k),
      rarity: plain(RARITY), maxLines: MAX_LINES, baseLines: BASE_LINES, baseLineOdds: [...BASE_LINE_ODDS], skills: [...ITEM_SKILLS],
      skillChance: plain(SKILL_CHANCE), baseDef: plain(BASE_DEF), bigSlot: plain(BIG_SLOT),
      bases: plain(BASES), currencies: plain(CURRENCIES),
    },
    legendaries: LEGENDARIES.map(L => plain({ id: L.id, name: L.name, slot: L.slot, base: L.base, skill: L.skill ?? null, theme: L.theme ?? null, text: L.legend?.text ?? '', flavor: L.flavor ?? '' })),
    maps: { tiers: MAP_TIERS, trashLife: TRASH_LIFE, families: plain(MAP_FAMILIES), elites: plain(ELITE_MODS), monsterTypes: plain(MONSTER_TYPES),
      // mapProfile(tier, family) for every family and tier (numbers exactly as the web computes them).
      profiles: Object.fromEntries(Object.keys(MAP_FAMILIES).map(fam => [fam, Array.from({ length: MAP_TIERS }, (_, i) => { const p = mapProfile(i + 1, fam); return plain({ ...p, requirements: mapRequirements(p) }); })])) },
    statusLook: plain(STATUS_LOOK),
    waystones: { rarity: plain(WAYSTONE_RARITY), freeTier: FREE_TIER },
    atlas: { radius: ATLAS_RADIUS, familyOrder: [...FAMILY_ORDER], familyHue: plain(FAMILY_HUE), regionName: plain(REGION_NAME),
      nodeKinds: plain(NODE_KINDS), nodeMods: plain(NODE_MODS), kindMods: plain(KIND_MODS), prefix: plain(PREFIX), suffix: [...SUFFIX] },
    talents: {
      tiers: plain(TALENT_TIERS), start: TALENT_TREE.start, domains: plain(TALENT_TREE.domains), links: plain(TALENT_TREE.links),
      nodes: TALENT_TREE.nodes.map(n => plain({ id: n.id, kind: n.kind, name: n.name ?? null, domain: n.domain ?? null, x: n.x, y: n.y, lines: n.lines,
        title: n.kind === 'start' ? '起点' : talentName(n), text: n.lines.length ? talentLines(n) : [] })),
    },
    stages: plain(STAGES),
    archetypes: ARCHETYPES.map(a => plain({ id: a.id, name: a.name, style: a.style, skills: a.skills, keepDistance: a.keepDistance ?? 0, summary: a.summary, ladder: a.ladder,
      builds: STAGES.map((_, i) => {
        const b = stageBuild(a, i);
        return Object.fromEntries(SLOTS.map(s => [s, { base: b.items[s].base, skill: b.items[s].skill ?? null,
          traits: b.items[s].traits.map(l => ({ id: l.id, tier: l.tier })), lines: b.items[s].lines.map(l => ({ id: l.id, tier: l.tier })) }]));
      }) })),
    icons: { base: plain(BASE_ICON), slot: plain(SLOT_ICON), skill: plain(SKILL_ICON), currency: plain(CURRENCY_ICON), panel: plain(PANEL_ICON),
      family: plain(FAMILY_ICON), layer: plain(LAYER_ICON), buff: plain(BUFF_ICON) },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const text = JSON.stringify(buildGameExport(), null, 1) + '\n';
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, text);
  const d = JSON.parse(text);
  console.log(`游戏数据 → ${path.relative(process.cwd(), out)}：${d.families.length} 词条族 · ${d.talents.nodes.length} 天赋点 · ${d.archetypes.length} 流派 · ${(text.length / 1024).toFixed(0)} KiB`);
}

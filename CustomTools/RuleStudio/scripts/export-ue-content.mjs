// UE 内容包导出：把网页版内容（基础规则、技能、地图包、全部词条族 × T 阶、传奇、底材）展开成纯 JSON，
// 供 UE 版规则引擎（Plugins/DWRules/Source/DWRulesCore）导入。网页版是基准，UE 只吃这里导出的数据。
//
//   node scripts/export-ue-content.mjs [输出文件]          默认 export/dw-content.json
//   DW_OVERRIDES=1 node scripts/export-ue-content.mjs      带上内容编辑器（/editor/）里的改动
//
// 导出后会在 Node 里用 compileContent 把导出的 JSON 重新编译一遍，保证导出物自身合法。
// 同一提交、同一改动下两次导出逐字节相同（不写时间戳，键顺序固定）。
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { compileContent } from '../core/content.mjs';
import { BASE } from '../core/content/base.mjs';
import { GAME_SKILLS } from '../core/content/skills.mjs';
import { MAP_PACK, MAP_TIERS, MAP_FAMILIES, ELITE_MODS, MONSTER_TYPES, mapProfile, mapRequirements } from '../core/content/maps.mjs';
import { families, affixLine, LAYERS, SLOTS } from '../core/content/families.mjs';
import { LEGENDARIES, legendAffix } from '../core/content/legendaries.mjs';
import { BASES, CURRENCIES, itemAffixes, ITEM_SKILLS, RARITY, MAX_LINES, BASE_LINES } from '../core/content/items.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const out = path.resolve(process.argv[2] ?? path.join(root, 'export/dw-content.json'));

/** JSON-safe deep copy: functions drop out, frozen objects become plain ones. */
export const plain = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

function commit() {
  if (process.env.DW_COMMIT) return process.env.DW_COMMIT;
  try { return execSync('git rev-parse HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return 'unknown'; }
}

/** Compiled affixes are valid raw input again (compileAffix keeps every field compileMod/compileRule accept). */
const affixData = a => plain({ id: a.id, name: a.name, tags: a.tags, mods: a.mods, rules: a.rules, grants: a.grants });

export function buildContentExport() {
  const packs = [BASE, GAME_SKILLS, MAP_PACK];
  const pick = k => packs.flatMap(p => plain(p[k] ?? []));
  const affixes = [];
  const seen = new Set();
  const add = a => { if (a && !seen.has(a.id)) { seen.add(a.id); affixes.push(affixData(a)); } };
  // Affixes the packs define themselves (MAP_PACK mob_instinct: every map monster carries it).
  for (const a of pick('affixes')) add(a);
  for (const f of families()) for (let t = 1; t <= f.levels; ++t) add(affixLine(f.id, t));
  // Base-defence lines of every base at every item tier (items equip them as `base:<stat><value>…`).
  for (const slot of Object.keys(BASES)) for (const b of BASES[slot]) for (let tier = 1; tier <= 10; ++tier)
    for (const a of itemAffixes({ slot, base: b.id, tier, traits: [], lines: [] })) add(a);
  const legendaries = LEGENDARIES.map(L => ({ ...plain({ ...L, legend: undefined }), affix: affixData(legendAffix(L.id)) }));
  return {
    format: 'dw-content/1',
    generatedFrom: commit(),
    overrides: !!process.env.DW_OVERRIDES,
    stats: pick('stats'),
    resources: pick('resources'),
    statuses: pick('statuses'),
    ailments: pick('ailments'),
    skills: pick('skills'),
    supports: pick('supports'),
    minions: pick('minions'),
    baseMods: pick('baseMods'),
    affixes,
    legendaries,
    families: families().map(f => plain({ id: f.id, name: f.name, layer: f.layer, levels: f.levels, values: f.values, slots: f.slots, tags: f.tags, unique: f.unique, maxPerBuild: f.maxPerBuild })),
    layers: plain(LAYERS),
    slots: [...SLOTS],
    items: { skills: [...ITEM_SKILLS], rarity: plain(RARITY), maxLines: MAX_LINES, baseLines: BASE_LINES },
    bases: plain(BASES),
    currencies: plain(CURRENCIES),
    maps: {
      tiers: MAP_TIERS,
      families: plain(MAP_FAMILIES),
      elites: plain(ELITE_MODS),
      monsterTypes: plain(MONSTER_TYPES),
      profiles: Object.keys(MAP_FAMILIES).flatMap(fam => Array.from({ length: MAP_TIERS }, (_, i) => {
        const p = mapProfile(i + 1, fam);
        return plain({ ...p, requirements: mapRequirements(p) });
      })),
    },
  };
}

/** The pack slice compileContent understands. */
export const enginePack = c => ({ stats: c.stats, resources: c.resources, statuses: c.statuses, ailments: c.ailments, skills: c.skills, supports: c.supports, minions: c.minions, affixes: [...c.affixes, ...c.legendaries.map(l => l.affix)], baseMods: c.baseMods });

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const data = buildContentExport();
  const text = JSON.stringify(data, null, 1) + '\n';
  // Self-check: the exported JSON compiles on its own.
  const reparsed = JSON.parse(text);
  const content = compileContent(enginePack(reparsed));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, text);
  console.log(`内容包 → ${path.relative(process.cwd(), out)}：${reparsed.skills.length} 技能 · ${reparsed.statuses.length} 状态 · ${content.affixes.size} 词条 · ${reparsed.legendaries.length} 传奇 · ${(text.length / 1024).toFixed(0)} KiB`);
}

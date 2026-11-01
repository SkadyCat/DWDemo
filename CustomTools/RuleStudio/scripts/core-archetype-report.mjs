// 生成十一个流派的分阶段收集清单与验证数字（docs/core-archetypes.md）。
import fs from 'node:fs';
import { gameContent } from '../core/content/game.mjs';
import { ARCHETYPES } from '../core/content/archetypes.mjs';
import { stageBuild, collectionList, STAGES } from '../core/content/builds.mjs';
import { affixLine, family, families, lineCount, LAYERS } from '../core/content/families.mjs';
import { runMap } from '../core/sim.mjs';
import { lineUsefulness, hordeProbe } from '../core/analysis.mjs';
const content = gameContent();
const out = [];
const by = {}; for (const f of families()) by[f.layer] = (by[f.layer] || 0) + 1;
out.push('# 十个示范流派：分阶段收集清单', '', `词条族 ${families().length} 个（${Object.entries(by).map(([k, v]) => `${LAYERS[k].name} ${v}`).join('、')}），共 ${lineCount()} 条不同词条（族 × T 阶）。`, '',
  '每件装备 = 3 条基底（武器第 1 条是主动技能，其余是特性：形态/联动/核心）+ 随机数值词条（各阶段每件 2/3/4/5/6 条）。',
  '每个阶段的配装由 `core/content/builds.mjs` 按质变阶梯自动铺到 10 件装备上。清怪/首领来自 `core/sim.mjs`（12 秒 + 首领战，种子 3）；怪潮来自 `hordeProbe`（200 只怪铺满半径 1300）。', '');
const json = [];
for (const a of ARCHETYPES) {
  out.push(`## ${a.name}（${a.style}）`, '', `技能：${content.skills.get(a.skills[0]).name}。${a.summary}`, '');
  out.push('| 阶段 | 质变 | 地图 | 新拿到 | 怪潮（用时 · 峰值/秒 · 连锁） | 首领用时 | 特性/数值 |', '| --- | --- | --- | --- | --- | --- | --- |');
  const row = { id: a.id, name: a.name, style: a.style, skill: content.skills.get(a.skills[0]).name, summary: a.summary, stages: [] };
  for (let s = 0; s < STAGES.length; ++s) {
    const b = stageBuild(a, s), list = collectionList(a, s), [lo, hi] = STAGES[s].maps;
    const r = runMap(content, b, { tier: hi, seconds: 12, seed: 3, boss: true });
    const keys = a.key.filter(([, from]) => from === s).map(([fid]) => affixLine(fid, b.lines.find(l => l.id === fid)?.tier ?? 1).name);
    const bossT = r.bossTime === Infinity ? '打不过' : `${r.bossTime.toFixed(0)} 秒`;
    const h = hordeProbe(content, b, hi);
    out.push(`| ${STAGES[s].name} | **${a.ladder[s].title}**：${a.ladder[s].text} | T${lo}–${hi} | ${keys.join('；') || '—'} | ${h.time.toFixed(1)} 秒 · ${h.peak} · ${Math.round(h.cascade * 100)}% | ${bossT}（T${hi}） | ${b.traits.length}/${b.lines.length - b.traits.length} |`);
    row.stages.push({ stage: STAGES[s].name, maps: [lo, hi], newKeys: keys, kps: +r.kps.toFixed(2), boss: r.bossTime === Infinity ? null : +r.bossTime.toFixed(1), lines: b.lines.length,
      offence: list.offence.length, defence: list.defence.length, key: list.key.length });
  }
  const u = lineUsefulness(content, stageBuild(a, 4), 16, { seconds: 3, seeds: [2, 3] });
  row.useful = [u.useful, u.total];
  out.push('', `毕业配装在 T16：${u.useful}/${u.total} 条词条在起作用（${(u.ratio * 100).toFixed(0)}%）。冗余：${u.lines.filter(l => !l.useful).map(l => l.line).join('、') || '无'}。`, '');
  json.push(row);
}
fs.writeFileSync(new URL('../docs/core-archetypes.md', import.meta.url), out.join('\n') + '\n');
console.log('ok');

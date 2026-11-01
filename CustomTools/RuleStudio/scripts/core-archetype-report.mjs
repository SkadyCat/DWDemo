// 生成十个流派的分阶段收集清单与验证数字（docs/core-archetypes.md）。
import fs from 'node:fs';
import { gameContent } from '../core/content/game.mjs';
import { ARCHETYPES } from '../core/content/archetypes.mjs';
import { stageBuild, collectionList, STAGES } from '../core/content/builds.mjs';
import { affixLine, family, families, lineCount, LAYERS } from '../core/content/families.mjs';
import { runMap } from '../core/sim.mjs';
import { lineUsefulness } from '../core/analysis.mjs';
const content = gameContent();
const out = [];
const by = {}; for (const f of families()) by[f.layer] = (by[f.layer] || 0) + 1;
out.push('# 十个示范流派：分阶段收集清单', '', `词条族 ${families().length} 个（${Object.entries(by).map(([k, v]) => `${LAYERS[k].name} ${v}`).join('、')}），共 ${lineCount()} 条不同词条（族 × T 阶）。`, '',
  '每个阶段的配装由 `core/content/builds.mjs` 按收集清单自动铺到 10 件装备上（每件 3/5/7/8/9 条）。数字来自 `core/sim.mjs`：12 秒清图 + 首领战，种子 3。', '');
const json = [];
for (const a of ARCHETYPES) {
  out.push(`## ${a.name}（${a.style}）`, '', `技能：${content.skills.get(a.skills[0]).name}。${a.summary}`, '');
  out.push('| 阶段 | 地图 | 新增关键词条 | 清怪/秒 | 首领用时 | 词条数 |', '| --- | --- | --- | --- | --- | --- |');
  const row = { id: a.id, name: a.name, style: a.style, skill: content.skills.get(a.skills[0]).name, summary: a.summary, stages: [] };
  for (let s = 0; s < STAGES.length; ++s) {
    const b = stageBuild(a, s), list = collectionList(a, s), [lo, hi] = STAGES[s].maps;
    const r = runMap(content, b, { tier: hi, seconds: 12, seed: 3, boss: true });
    const keys = a.key.filter(([, from]) => from === s).map(([fid]) => affixLine(fid, b.lines.find(l => l.id === fid)?.tier ?? 1).name);
    const bossT = r.bossTime === Infinity ? '打不过' : `${r.bossTime.toFixed(0)} 秒`;
    out.push(`| ${STAGES[s].name} | T${lo}–${hi} | ${keys.join('；') || '—'} | ${r.kps.toFixed(1)}（T${hi}） | ${bossT}（T${hi}） | ${b.lines.length} |`);
    row.stages.push({ stage: STAGES[s].name, maps: [lo, hi], newKeys: keys, kps: +r.kps.toFixed(2), boss: r.bossTime === Infinity ? null : +r.bossTime.toFixed(1), lines: b.lines.length,
      offence: list.offence.length, defence: list.defence.length, key: list.key.length });
  }
  const u = lineUsefulness(content, stageBuild(a, 4), 16, { seconds: 4 });
  row.useful = [u.useful, u.total];
  out.push('', `毕业配装在 T16：${u.useful}/${u.total} 条词条在起作用（${(u.ratio * 100).toFixed(0)}%）。冗余：${u.lines.filter(l => !l.useful).map(l => l.line).join('、') || '无'}。`, '');
  json.push(row);
}
fs.writeFileSync(new URL('../docs/core-archetypes.md', import.meta.url), out.join('\n') + '\n');
fs.writeFileSync('/tmp/claude-0/archetypes.json', JSON.stringify(json, null, 1));
console.log('ok');

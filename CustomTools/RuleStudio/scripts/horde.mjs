// 怪潮报告：每个流派每个阶段在本阶段最低图里清一大片怪的手感。
import { gameContent } from '../core/content/game.mjs';
import { ARCHETYPES } from '../core/content/archetypes.mjs';
import { stageBuild, STAGES } from '../core/content/builds.mjs';
import { hordeProbe } from '../core/analysis.mjs';
const only = process.argv[2];
const c = gameContent();
for (const a of ARCHETYPES) {
  if (only && a.id !== only) continue;
  const row = [];
  for (let s = 0; s < STAGES.length; ++s) {
    const b = stageBuild(a, s), r = hordeProbe(c, b, STAGES[s].maps[+(process.env.HI ?? 0)]);
    row.push(`${STAGES[s].name} ${r.time.toFixed(1)}s 峰${r.peak} 爆${r.burst} 联${Math.round(r.cascade * 100)}%`);
  }
  console.log(a.name.padEnd(6, '　'), row.join(' | '));
}

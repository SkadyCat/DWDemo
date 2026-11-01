// 十个流派的攻坚 / 速刷评估：每个阶段在本档最高 T 阶测。node scripts/core-roles.mjs [archetype]
import { gameContent } from '../core/content/game.mjs';
import { ARCHETYPES } from '../core/content/archetypes.mjs';
import { stageBuild, STAGES } from '../core/content/builds.mjs';
import { roleReport } from '../core/analysis.mjs';
const only = process.argv[2], content = gameContent(), rows = [];
for (const a of ARCHETYPES) {
  if (only && only !== a.id) continue;
  const row = { id: a.id, name: a.name, stages: [] };
  for (let s = 0; s < STAGES.length; ++s) {
    const tier = STAGES[s].maps[1];
    const r = roleReport(content, stageBuild(a, s), tier);
    row.stages.push({ tier, ...r });
  }
  rows.push(row);
  console.log(`${a.name}\t` + row.stages.map(s => `T${s.tier} 攻坚${s.bossing.toFixed(2)}(${s.ttk === Infinity ? '∞' : s.ttk.toFixed(0)}s) 速刷${s.clearing.toFixed(2)}(${s.clearTime.toFixed(0)}s) ${s.lean}`).join(' | '));
}
if (process.argv[3]) (await import('node:fs')).writeFileSync(process.argv[3], JSON.stringify(rows));

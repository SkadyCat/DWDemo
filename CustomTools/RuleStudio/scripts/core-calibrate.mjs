// 流派 × 阶段 × 地图 T 阶的模拟结果表。node scripts/core-calibrate.mjs [archetype] [seconds]
import { gameContent } from '../core/content/game.mjs';
import { ARCHETYPES } from '../core/content/archetypes.mjs';
import { stageBuild, STAGES } from '../core/content/builds.mjs';
import { runMap } from '../core/sim.mjs';
const only = process.argv[2], seconds = +(process.argv[3] ?? 20);
const content = gameContent();
for (const a of ARCHETYPES) {
  if (only && only !== a.id) continue;
  console.log(`\n== ${a.name}`);
  for (let s = 0; s < STAGES.length; ++s) {
    const b = stageBuild(a, s);
    const row = [];
    for (const tier of [STAGES[s].maps[0], STAGES[s].maps[1], Math.min(16, STAGES[s].maps[1] + 3)]) {
      const r = runMap(content, b, { tier, seconds, seed: 3, boss: true });
      row.push(`T${tier}: ${r.kps.toFixed(2)}k/s d${r.mapDeaths}/${r.bossDeaths} hit${Math.round(r.maxHit)}/${Math.round(r.hero.max.life + r.hero.max.es)} boss${r.bossTime === Infinity ? '∞' : r.bossTime.toFixed(0)}`);
    }
    console.log(`${STAGES[s].name} (${b.lines.length}行) ${row.join(' | ')}`);
  }
}

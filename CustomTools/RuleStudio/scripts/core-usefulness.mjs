// 毕业配装的词条有效率：逐条移除，看输出或防守是否变差。node scripts/core-usefulness.mjs [archetype] [stage] [tier]
import { gameContent } from '../core/content/game.mjs';
import { ARCHETYPES } from '../core/content/archetypes.mjs';
import { stageBuild } from '../core/content/builds.mjs';
import { lineUsefulness } from '../core/analysis.mjs';
const [only, st = '4', tier = '16'] = process.argv.slice(2);
for (const a of ARCHETYPES) {
  if (only && only !== a.id) continue;
  const b = stageBuild(a, +st);
  const r = lineUsefulness(gameContent(), b, +tier, { seconds: 5 });
  console.log(`${a.name}: ${r.useful}/${r.total} 有效（${(r.ratio * 100).toFixed(0)}%）`);
  if (only) for (const l of r.lines.filter(l => !l.useful)) console.log('  冗余：', l.line);
}

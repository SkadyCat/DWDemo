// 毕业配装的词条有效率：20 多条特性 + 60 条数值，逐条拿掉看输出或防守是否下降。约九成在起作用。
import test from 'node:test';
import assert from 'node:assert/strict';
import { gameContent } from '../core/content/game.mjs';
import { ARCHETYPES } from '../core/content/archetypes.mjs';
import { stageBuild } from '../core/content/builds.mjs';
import { lineUsefulness, defenceReport } from '../core/analysis.mjs';

const content = gameContent();

test('毕业配装：抗性在 T16 惩罚后补满，大约九成词条在起作用（冗余约一成）', () => {
  let useful = 0, total = 0;
  for (const a of ARCHETYPES) {
    const b = stageBuild(a, 4);
    const d = defenceReport(content, b, 16);
    assert.ok(d.resistOk, `${a.name} 抗性 ${JSON.stringify(d.resists)}`);
    const u = lineUsefulness(content, b, 16, { seconds: 3, seeds: [2, 3] });
    assert.ok(u.ratio >= 0.75, `${a.name} 有效率 ${(u.ratio * 100).toFixed(0)}%`);
    useful += u.useful; total += u.total;
  }
  assert.ok(useful / total >= 0.85 && useful / total <= 0.97, `平均有效率 ${(useful / total * 100).toFixed(0)}%`);
});

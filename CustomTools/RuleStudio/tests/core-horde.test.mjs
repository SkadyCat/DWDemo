// 怪潮（清屏手感）：200 只怪铺满一大片。每个阶段比上一阶段清得快；毕业配装靠连锁清屏。
import test from 'node:test';
import assert from 'node:assert/strict';
import { gameContent } from '../core/content/game.mjs';
import { ARCHETYPES } from '../core/content/archetypes.mjs';
import { stageBuild, STAGES } from '../core/content/builds.mjs';
import { hordeProbe } from '../core/analysis.mjs';

const content = gameContent();

for (const a of ARCHETYPES) {
  test(`${a.name}：每一阶段在本阶段的图里清怪潮都比上一阶段快；毕业靠连锁清屏`, () => {
    const rows = [];
    for (let s = 0; s < STAGES.length; ++s) {
      const tier = STAGES[s].maps[1];
      const now = hordeProbe(content, stageBuild(a, s), tier);
      rows.push(`${STAGES[s].name} ${now.time.toFixed(1)}s 峰${now.peak} 联${Math.round(now.cascade * 100)}%`);
      if (s > 0) {
        const before = hordeProbe(content, stageBuild(a, s - 1), tier);
        // 质变要看得见：清完明显更快，或者一秒内倒下的怪明显更多（清屏更猛）。
        assert.ok(now.time < before.time * 0.9 || now.peak >= before.peak * 1.2, `${STAGES[s].name}「${a.ladder[s].title}」在 T${tier} 没有明显变化：${now.time.toFixed(1)}s/峰${now.peak} vs ${before.time.toFixed(1)}s/峰${before.peak}（${rows.join(' | ')}）`);
      }
      if (s === STAGES.length - 1) {
        assert.ok(now.time <= 15, `毕业清 200 只怪要 ${now.time.toFixed(1)}s`);
        assert.ok(now.peak >= 60, `毕业峰值每秒击杀 ${now.peak}`);
        assert.ok(now.cascade >= 0.6, `毕业连锁击杀占比 ${(now.cascade * 100).toFixed(0)}%`);
      }
    }
  });
}

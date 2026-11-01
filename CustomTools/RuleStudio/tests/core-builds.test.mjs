// 十个示范流派：分阶段配装、地图压力、进度与词条有效率。
// 全部数字来自模拟器（同一种子可复现）。判定刻意留了余量：验证的是「形状」——
// 本阶段的地图能稳定通过，往上三阶就明显吃力，下一阶段的配装在同一张图上更快，毕业配装约九成词条在起作用。
import test from 'node:test';
import assert from 'node:assert/strict';
import { gameContent } from '../core/content/game.mjs';
import { ARCHETYPES } from '../core/content/archetypes.mjs';
import { stageBuild, collectionList, STAGES } from '../core/content/builds.mjs';
import { families, affixLine, lineCount, SLOTS } from '../core/content/families.mjs';
import { isTrait } from '../core/content/items.mjs';
import { runMap } from '../core/sim.mjs';


const content = gameContent();
const SECONDS = 12;
// Pure single-target check: the boss without random elite modifiers (those are tested by the pressure check).
const boss = (b, tier) => Math.min(...[3, 5].map(seed => runMap(content, b, { tier, seconds: 1, seed, boss: true, bossMods: [] }).bossTime));

test('词条族：四层稀有度齐全，全部能编译成可装备词条', () => {
  const by = {};
  for (const f of families()) { by[f.layer] = (by[f.layer] || 0) + 1; for (let t = 1; t <= f.levels; ++t) assert.ok(affixLine(f.id, t).name.length > 0); }
  assert.ok(by.stat >= 60 && by.form >= 20 && by.link >= 25 && by.core >= 6, JSON.stringify(by));
  assert.ok(lineCount() >= 1000);
});

test('十一个流派覆盖纯元素、元素反应、近战、触发、持续区域，且技能各不相同', () => {
  assert.equal(ARCHETYPES.length, 11);
  const styles = ARCHETYPES.map(a => a.style).join(' ');
  for (const k of ['纯元素·火', '纯元素·冰', '纯元素·电', '元素反应', '近战', '触发', '持续区域']) assert.ok(styles.includes(k), k);
  assert.equal(new Set(ARCHETYPES.map(a => a.skills[0])).size, 11);
});

for (const a of ARCHETYPES) {
  test(`${a.name}：五个阶段的收集清单，词条逐阶段变多、关键词条逐阶段解锁`, () => {
    let prev = 0;
    for (let s = 0; s < STAGES.length; ++s) {
      const b = stageBuild(a, s), list = collectionList(a, s);
      const expected = STAGES[s].randomLines * SLOTS.length;
      assert.ok(b.lines.length - b.traits.length >= expected * 0.95, `${STAGES[s].name}: 随机词条 ${b.lines.length - b.traits.length}/${expected}`);
      assert.ok(b.traits.every(l => isTrait(l.id)) && b.lines.filter(l => l.kind === 'random').every(l => !isTrait(l.id)), '基底只放特性、随机词条只放数值');
      assert.ok(b.lines.length > prev); prev = b.lines.length;
      for (const [fid, from] of a.key) if (from <= s) assert.ok(b.lines.some(l => l.id === fid && l.role === 'key'), `${a.name}: ${fid} 在${STAGES[s].name}阶段放不上（层级或槽位不允许）`);
      if (s > 0) assert.ok(list.newKeys.length >= 1, `${STAGES[s].name} 没有新关键词条`);
      assert.ok(a.ladder[s].title && a.ladder[s].text, '每个阶段都有质变说明');
      for (const it of Object.values(b.items)) { const ids = [...it.traits, ...it.lines].map(l => l.id); assert.equal(new Set(ids).size, ids.length, '同一件装备同族只出现一次'); assert.ok(it.traits.length + (it.skill ? 1 : 0) <= 3); }
    }
  });

  test(`${a.name}：本阶段地图稳定通过，往上三阶明显吃力，下一阶段在同一张图上更快`, () => {
    for (let s = 0; s < STAGES.length; ++s) {
      const b = stageBuild(a, s), [lo] = STAGES[s].maps;
      const r = runMap(content, b, { tier: lo, seconds: SECONDS, seed: 3 });
      assert.ok(r.mapDeaths <= 1, `${STAGES[s].name} T${lo} 死亡 ${r.mapDeaths}`);
      assert.ok(boss(b, lo) < 120, `${STAGES[s].name} T${lo} 首领打不过`);
      if (s < STAGES.length - 1) {
        const over = Math.min(16, STAGES[s].maps[1] + 3);
        const o = runMap(content, b, { tier: over, seconds: SECONDS, seed: 3, boss: true });
        assert.ok(o.mapDeaths + o.bossDeaths >= 3 || o.bossTime === Infinity || o.bossTime > 60, `${STAGES[s].name} 在 T${over} 没有压力：死亡 ${o.mapDeaths}/${o.bossDeaths} 首领 ${o.bossTime}`);
      }
      if (s > 0) {
        // Two seeds: a single 12-second map is too noisy to rank two good builds.
        const kps = bb => [3, 4].reduce((n, seed) => n + runMap(content, bb, { tier: lo, seconds: SECONDS, seed }).kps, 0) / 2;
        const prev = stageBuild(a, s - 1), before = runMap(content, prev, { tier: lo, seconds: SECONDS, seed: 3 });
        const now = kps(b), then = kps(prev);
        assert.ok(now >= then * 0.95 || r.mapDeaths < before.mapDeaths, `${STAGES[s].name} 在 T${lo} 不比上一阶段快：${now.toFixed(1)} vs ${then.toFixed(1)}`);
      }
    }
  });
}


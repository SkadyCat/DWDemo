# 新规则引擎（core/）

网页版专用的规则引擎，从零重写，不兼容旧引擎（`engine/`）。设计目标只有一个：**任何流派都只靠词条组合实现，不写专用代码**。

```js
import { compileContent, createWorld, BASE } from './core/index.mjs';
const content = compileContent(BASE, myPack);       // validate + freeze all data
const world = createWorld(content, { seed: 7 });    // deterministic
const hero = world.spawnActor({ kind: 'hero', team: 0, mods: [...], affixes: ['cast_on_crit'], skills: ['fireball'] });
world.step(1 / 60);
```

## 移植到 Unreal

要做 UE 版，先读 `docs/ue-rule-engine-port.md`：架构、逐模块对照、求值与伤害顺序、确定性要求、金样测试和里程碑都在里面。

## 文件

| 文件 | 内容 |
| --- | --- |
| `registry.mjs` | 属性注册表。所有属性必须登记，未知属性在编译时报错 |
| `expr.mjs` | 度量、条件、缩放的小语法（命中时求值） |
| `mods.mjs` | 修正：属性 · 运算 · 数值 · 标签 · 作用范围 · 条件 · 缩放 |
| `status.mjs` | 状态实例：refresh / stack / instances / strongest |
| `actor.mjs` | 对称单位：英雄、怪物、召唤物、图腾都一样 |
| `world.mjs` | 时间、随机数、属性求值、资源、状态、事件队列（分波 + 预算 + 深度上限） |
| `grid.mjs` | 按队伍分桶的空间网格 |
| `damage.mjs` | 伤害管线：附加 → 转化/额外 → 血统标签放大 → 暴击 → 闪避/格挡 → 护甲/抗性/穿透/曝露/承伤 → 护盾/生命 → 偷取 → 异常 |
| `actions.mjs` | 动作：area / strike / projectile / zone / status / consume / cast / castGroup / summon / detonate / spread / repeat / if / more … |
| `carriers.mjs` | 投射物（穿透 → 分叉 → 连锁 → 分裂 → 回旋）与地面区域 |
| `rules.mjs` | 触发器：事件 + 角色 + 过滤 + 积累（instant/chance/count/meter/periodic）+ 限流 + 动作 |
| `skills.mjs` | 技能、辅助链接、施放、引导、预留型技能、重复 |
| `content.mjs` | 内容包编译与交叉引用检查 |
| `content/base.mjs` | 基础规则：十种异常、怒气、所有单位共有的修正 |

## 数据格式速查

**修正** `{ stat:'damage', op:'more', value:40, tags:['fire'], notTags:['dot'], scope:'self'|'minion'|'skill', when:{...}, per:{..., step, max} }`

**度量**（条件和缩放共用）`{res}` `{status}` `{statusTag}` `{stat}` `{pct}` `{missing}` `{pool}` `{nearby, radius}` `{since}` `{moving}` `{tag}` `{event}` `{var}` `{div:[a,b]}` `{const}`，加 `of:'self'|'target'|'owner'`；条件再加 `gte/gt/lte/lt/eq`，或用 `all/any/not` 组合。

**规则** `{ on, role, filter:{tags, anyTags, notTags, key, skill, cond}, accumulate:{kind,...}, limit:{cooldown, perSecond}, chain, at:'target'|'self'|'event'|'nearest', do:[actions] }`

**动作里的数字** 可以是常数，也可以是 `{var:'n', mul:3, add:1}` 或任意度量。

**技能** `{ id, tags, time, cost, cooldown, crit, damage:{type:n}, channel, reserve, status, mods, rules, actions }`

**词条** `{ id, mods, rules, grants:{ skills:[{ skill, supports, groups }] } }`

## 验收

`tests/core-archetypes.test.mjs` 用纯数据拼出设计文档里的 16 个流派（冰电捷、崩雷鸣、无限球、CoC、CWC、法术投掷、Winter Orb、毒叠层、点燃扩散、召唤、图腾/地雷、烙印、Blade Fall、多重打击/法术迸发、火炬自走），逐个验证机制链。`tests/core-engine.test.mjs` 是底层积木的单元测试。

## 内容层（core/content/）

| 文件 | 内容 |
| --- | --- |
| `skills.mjs` | 朴素技能、状态、资源、召唤物模板（词条规则要引用的「名词」） |
| `families.mjs` | 词条族：四层稀有度（数值 / 形态 / 联动 / 核心），`affixLine(族, T)` 生成具体词条 |
| `maps.mjs` | 地图压力：T 阶 → 怪物生命与伤害、元素构成、全抗惩罚、致命一击、精英词缀、首领狂暴 |
| `archetypes.mjs` | 十一个示范流派：技能 + 关键词条时间线 + 数值优先级 + 防守优先级 |
| `builds.mjs` | 把收集清单铺到 10 件 × 9 条：五个阶段（起步/成型/卡关/突破/毕业） |
| `game.mjs` | 完整内容包 |

`core/sim.mjs` 把配装放进 T 阶地图跑（清怪/秒、死亡、最大单次受伤、首领用时）；`core/analysis.mjs` 给出「本图要求」达标情况和逐条词条的有效性（冗余率）。

脚本：`scripts/core-calibrate-all.sh`（全部流派 × 阶段 × 地图）、`scripts/core-usefulness.mjs`（毕业有效率）、`scripts/core-archetype-report.mjs`（生成 `docs/core-archetypes.md`）。

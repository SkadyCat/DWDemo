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

**闪现与护盾相关的积木**
- `blink` 飞向一点时不超出 `range`；落地后发 `blinkLand`（`x/y` 落点、`fromX/fromY` 起点、`amount` 距离）。规则在 `blinkLand` 上做落点 / 路径 / 起点效果。
- 位置 `at:'eventFrom'` = 事件的起点（闪现起跳处）；`shape:'line'` 的区域从中心指向瞄准点，长度用 `radius`（可以是 `{event:'amount'}`）。
- `spendPool {pool:'es'|'mana'|'life', pct, pctMax, keep, as}`：把一部分资源当燃料，消耗量写进变量并发 `poolSpent`；不打断护盾充能。
- 事件 `shieldBreak`（能量护盾被打空，`target` 是打破它的人）、`shieldFull`（充能充满，只在有规则监听时发）。
- 召唤物的 `death` 事件带 `key` = 召唤物模板 id（到时消散的还带 `expired`），规则可以 `filter:{ key:'phantom' }`。属性 `summon.count` 给召唤动作加数量。
- 索敌：追击型（chase）单位注意范围内最近、看得见的敌人（墙挡视线；贴近到范围的 30% 以内隔墙也能「听到」），发现时发 `aggro` 事件；追上以后对方跑出范围的 1.6 倍才放弃。范围 = `actor.aggro` × 属性 `aggro`（百分比，默认 100），所以词条、状态、地图节点都能扩大它。动作 `provoke` 让单位立刻盯上某个目标（被打、嘲讽）。地图怪物都带「怪物本能」（`mob_instinct`）：被击中时盯上攻击者，并让自己和 450 内的同伴「警觉」（索敌 ×2.5，6 秒）；首领狂暴时索敌 ×4。
- 陷阱是第三种载体（`carriers.mjs`）：动作 `trap` 在一点布下陷阱（`count` + 属性 `trap.count` 个，多出的围成一圈），布设 `arm` 秒后第一个踩进 `trigger` 范围的敌人让它触发、执行 `onTrigger`（踩的人是目标），发 `trapTrigger` 事件（`key` = 陷阱种类）。`trap.uses` 让一颗陷阱响好几次（每次之后重新布设），`trap.limit` 是同时存在的上限（顶掉最老的），`trap.armSpeed` / `trap.trigger` 是布设速度和触发范围。`springTraps` 远程引爆附近已布好的陷阱（链式殉爆，深度 +1），`eachTrap` 对附近每颗陷阱各执行一遍动作（从事件点指向陷阱，变量 `dist` 是距离，用来在陷阱之间拉线）。区域结束的 `zoneEnd` 事件带 `key` = 区域种类。
- 召唤物自己的 `die`（自爆）只发 `death`（带 `selfDestruct`），不算击杀，击杀类规则不会被它触发。召唤流派靠主人身上 `scope:'minion'` 的修正和 `role:'minion'/'owned'` 的规则把增益与连锁交给召唤物；主人的资源可以用 `per:{ res, of:'owner' }` 让召唤物按它变强（狼群的「嚎」）。

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
| `archetypes.mjs` | 三十五个示范流派：技能 + 关键词条时间线 + 数值优先级 + 防守优先级 |
| `builds.mjs` | 把收集清单铺到 10 件 × 9 条：五个阶段（起步/成型/卡关/突破/毕业） |
| `game.mjs` | 完整内容包 |

`core/sim.mjs` 把配装放进 T 阶地图跑（清怪/秒、死亡、最大单次受伤、首领用时）；`core/analysis.mjs` 给出「本图要求」达标情况和逐条词条的有效性（冗余率）。

脚本：`scripts/core-calibrate-all.sh`（全部流派 × 阶段 × 地图）、`scripts/core-usefulness.mjs`（毕业有效率）、`scripts/core-archetype-report.mjs`（生成 `docs/core-archetypes.md`）。

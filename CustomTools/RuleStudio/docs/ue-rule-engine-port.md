# 规则引擎 UE 版移植指南

> 写给接手这项工作的 Claude session（或工程师）。读完这一篇，再读 `core/README.md` 和 `core/*.mjs`，就能开工。
> 目标：在 Unreal Engine 5 里做一个**与网页版 `core/` 行为一致**的规则引擎。网页版仍是内容编辑工具和行为基准。

---

## 0. 一句话结论

**不要用 GAS 重写，也不要逐行把 JS 翻成 Blueprint。** 做一个纯 C++ 的确定性内核（`DWRulesCore`），按 `core/*.mjs` 一一对应地移植；内容由网页版导出成 JSON 包给 UE 读；用「同一种子 → 同一事件流」的金样（golden trace）测试证明两边一致；最后用一层很薄的 UE 桥接（Subsystem + Component + 表现层）把内核接到关卡、输入和 Niagara 上。

为什么不用 GAS：本引擎的核心是**命中时按上下文求值的修正**——一个属性的值取决于此刻的技能标签、伤害血统标签、目标状态、`when`/`per` 条件、召唤链、链接的辅助。GAS 的 Attribute/GameplayEffect 是「先算好再存」的模型，标签过滤只到 Effect 级别，「更多」（独立相乘）、转化血统、按目标状态缩放都得写自定义 Execution/MMC，最后等于在 GAS 里再造一遍这个引擎，还多了一层复制和预测的包袱。GAS 以后可以作为**外壳**接入（例如用 GameplayTag 显示状态），但不进内核。

---

## 1. 先读什么

| 顺序 | 文件 | 读它是为了 |
| --- | --- | --- |
| 1 | `core/README.md` | 数据格式速查：修正、度量、规则、技能、词条 |
| 2 | `core/registry.mjs` | 全部属性名、默认值、上下限、`flag`/`number` 两种 |
| 3 | `core/mods.mjs` `core/expr.mjs` | 修正的合并公式；度量 / 条件 / 缩放的小语法 |
| 4 | `core/world.mjs` | 时间、随机数流、属性求值顺序、事件队列（分波、预算、深度上限） |
| 5 | `core/damage.mjs` | 伤害管线（顺序和公式必须逐条照搬） |
| 6 | `core/actions.mjs` `core/carriers.mjs` | 全部动作；投射物与地面区域的模拟 |
| 7 | `core/rules.mjs` `core/skills.mjs` `core/status.mjs` `core/vitals.mjs` | 触发、施放、状态叠加、回复与持续伤害 |
| 8 | `core/index.mjs` | `createWorld`：系统的注册顺序、AI（brain）、引导、召唤物模板 |
| 9 | `core/content.mjs` | 内容包编译与交叉引用检查（UE 的导入校验照它写） |
| 10 | `tests/core-engine.test.mjs` `tests/core-archetypes.test.mjs` | 12 个积木测试 + 16 个流派机制链（UE 里要全部重写成自动化测试） |

网页版大约 2300 行 JS（`core/` 下 16 个文件）。C++ 版预计 6000–9000 行。

---

## 2. 总体架构

```
DWRules (UE 插件)
├── DWRulesCore      Runtime 模块。纯 C++，只依赖 Core / Json。不碰 UObject、不碰 UWorld。
│                    FDWWorld · FDWActor · FDWStatRegistry · FDWMod · FDWExpr · FDWDamage
│                    FDWActions · FDWCarriers · FDWRules · FDWSkills · FDWStatus · FDWVitals · FDWGrid
│                    FDWContent（从 JSON 编译、校验、冻结）
├── DWRulesGame      Runtime 模块。UE 桥接：
│                    UDWRulesSubsystem (UWorldSubsystem)：持有 FDWWorld，固定 60Hz 步进
│                    UDWRulesComponent：把一个 AActor/Pawn 绑定到内核里的一个单位
│                    UDWContentBundle (UPrimaryDataAsset)：导入后的内容包
│                    UDWFxTable：事件 → Niagara/音效 的映射表
│                    事件委托（Blueprint 可绑定）：OnHit / OnKill / OnCast / OnStatusApplied …
└── DWRulesEditor    Editor 模块。导入 / 重新导入内容 JSON、校验报错、金样测试的命令行入口
```

原则：

- **内核不知道 UE 存在。** 可以单独编进一个命令行程序跑金样测试，也能放到服务器上跑。
- **桥接层不改规则。** 它只做三件事：把输入交给内核、按固定步长调用 `Step`、把事件翻译成表现。
- **表现不反馈规则。** 投射物、区域、伤害数字都由内核模拟，UE 只画；不要用 UE 的 Projectile Actor 或物理碰撞决定命中。

---

## 3. 第 0 阶段：在这个仓库里补两个导出脚本

UE 那边需要两样东西，都应该由**网页版**生成（网页版是基准）。这两件事在本仓库里做，提交到 `CustomTools/RuleStudio/scripts/`。

### 3.1 内容包导出 `scripts/export-ue-content.mjs`

网页版的内容有一部分是代码（`families.mjs` 里每族词条的 `make(v)` 函数、`legendaries.mjs` 的 `trig()` 帮手）。UE 不该重写这些函数，而是吃**展开后的纯数据**：

```jsonc
{
  "format": "dw-content/1",
  "generatedFrom": "<git commit>",
  "stats":     [ { "key": "stage.max", "kind": "number", "base": 10, "min": 0, "max": 1e9 } ],   // 内容自定义属性
  "resources": [ ... ], "statuses": [ ... ], "ailments": [ ... ],
  "skills":    [ ... ], "supports": [ ... ], "minions":  [ ... ],
  "baseMods":  [ ... ],
  "affixes":   [ { "id": "proj_count#T2", "name": "+1 投射物数量", "tags": [...], "mods": [...], "rules": [...], "grants": {...} } ],
  "legendaries": [ { "id": "pyre_staff", "affix": { ...同上... }, "slot": "weapon", "base": "war_staff", "skill": "fireball", ... } ],
  "families":  [ { "id": "proj_count", "layer": "form", "levels": 6, "values": [...], "slots": [...], "tags": [...] } ],
  "bases": { "weapon": [ ... ], ... }, "currencies": { ... },
  "maps": { "tiers": 16, "families": { ... }, "elites": { ... }, "monsterTypes": { ... }, "profiles": [ /* mapProfile(1..16) 每阶算好的数 */ ] }
}
```

要点：

- 用 `gameContent()` 的输入（`BASE`、`GAME_SKILLS`、`MAP_PACK`）导出原始数据，**不是**编译后的对象（编译后有 `Map`、`ModIndex`，不是 JSON）。
- 词条：对每个族、每个 T 阶调用 `affixLine(id, t)` 的**原料**（`f.make(f.values[t-1])` + 名称），展开成一条条 `affixes`。传奇用 `legendAffix(id)` 的原料。
- 设 `DW_OVERRIDES=1` 运行，导出会带上编辑器（`/editor/`）里的改动；不设则是原始数据。
- 导出后在 Node 里**再用 `compileContent` 编译一遍导出的 JSON**，确保导出物自身合法。

### 3.2 金样导出 `scripts/export-golden-traces.mjs`

一组固定场景，每个场景跑 N 步，把**全部事件**按顺序写下来：

```jsonc
{ "scenario": "fireball_vs_pack", "seed": 7, "dt": 0.016666666666666666, "steps": 600,
  "setup": { /* 生成哪些单位：kind/team/x/y/mods/affixes/skills/brain，按生成顺序 */ },
  "inputs": [ { "step": 0, "actor": 1, "cast": "fireball", "aim": [800, 0] } ],
  "events": [ { "step": 12, "t": 0.2, "type": "hit", "source": 1, "target": 3, "skill": "fireball",
                "amount": 41.27, "crit": false, "depth": 0, "tags": ["fire","hit","projectile","spell"] } ],
  "final": { "actors": [ { "id": 3, "alive": false, "life": 0 } ], "stats": { "events": 1234, "dropped": 0 } } }
```

场景清单（至少）：

1. 每个 `tests/core-engine.test.mjs` 的用例对应一个最小场景。
2. `tests/core-archetypes.test.mjs` 的 16 个流派机制链。
3. `docs/core-archetypes.md` 里 10 个示范流派 × 5 个阶段，各打一次 200 只怪的群（`analysis.mjs` 的 `hordeProbe`，`count=200, seed=11`），只记前 30 秒。
4. 一个首领场景（`boss_slam` 的延迟落点、`enraged` 狂暴）。

事件里的 actor 用 id（数字）表示；浮点数原样输出（JSON 的 double），比较时 UE 那边用相对误差 1e-9（见 §6）。标签数组排序后输出，避免集合顺序造成假差异。

---

## 4. 第 1 阶段：内核（DWRulesCore）

### 4.1 JS → C++ 对照

| JS | C++ | 说明 |
| --- | --- | --- |
| `registry.mjs` | `FDWStatRegistry`，`FDWStatId`（uint16） | 启动时登记全部属性（含通配族 `res.*`、`conv.a.b` 等展开）；内容可追加。名字 → id 用 `TMap<FName, uint16>`，热路径只用 id |
| 标签（字符串集合） | `FDWTagId`（uint16）+ `FDWTagSet`（固定大小位集，例如 `TBitArray` 或 `uint64[4]`） | 全部标签在内容导入时驻留；`tags`/`notTags` 判定变成位运算。**不要**在热路径用 `TSet<FName>` |
| `compileMod` | `FDWMod { Stat, Op, Value, Tags, NotTags, Scope, When*, Per* }` | `when`/`per` 编译成表达式树（见 4.3） |
| `ModIndex` | `FDWModIndex`：`TArray<TArray<FDWMod>>` 按 StatId 下标 | |
| `Actor` | `FDWActor`（普通 struct，存在 `TArray`/池里），用 `int32 Id` 互相引用 | 不要用裸指针跨帧保存（单位会被移除）；需要时用 id 查 |
| `World` | `FDWWorld` | 拥有一切；`Step(double Dt)` |
| `Invocation` | `FDWInvocation`（按值传递的小 struct + 共享的变量表） | 注意 `fork()` 是**复制**，但 `vars` 在 `fork` 时也复制（`{...vars}`）；地面区域脉冲时把 `vars` 指回同一份（`inv.vars = z.inv.vars`） |
| `defineAction(name, fn)` | `TMap<FName, FDWActionFn>` 或枚举 + switch | 动作表见 4.6 |
| `Carriers` | `FDWCarriers`（投射物、区域两个 `TArray`） | 上限 `MAX_PROJECTILES = 450` |
| `rng()` mulberry32 | `FDWRng`（uint32 状态） | 必须逐位一致，见 4.2 |

数值一律用 `double`。JS 的 number 就是 double，用 `float` 会立刻让金样对不上。

### 4.2 随机数（逐位一致）

```cpp
// mulberry32，与 world.mjs 的 rng() 完全一致
struct FDWRng {
    uint32 A;
    double Next() {
        A += 0x6D2B79F5u;
        uint32 T = A;
        T = (T ^ (T >> 15)) * (T | 1u);
        T ^= T + (T ^ (T >> 7)) * (T | 61u);
        return double(T ^ (T >> 14)) / 4294967296.0;
    }
};
```

`world.roll(purpose)`：每个用途一条独立的流，种子 = `seed` 依次与 purpose 的每个 **UTF-16 码元**做 `h = (h ^ c) * 2654435761`（uint32 乘法溢出取模）。用到的 purpose 有 `crit` `evade` `block` `repeat` `action` `keep` `cascade` `castFrom` `rule:<规则 id>`、每个异常 id（`ignite` `shock`…）。规则 id 来自词条 id（`proj_count#T2#0` 这类），都是 ASCII，但仍按 UTF-16 码元算（用 `StringCast<UTF16CHAR>`）。

`world.random` 是主流（`seed` 直接初始化），内核里目前没人用它，但保留。

### 4.3 属性求值（最重要的一段）

`world.scaled(actor, key, base, tags, ctx)` 的顺序，**一步都不能换**：

1. 累加器 `{ base = 属性默认值（或传入的 base）, inc = 0, more = 1, set = null, flag = 0 }`
2. 单位自身的修正（`actor.sheet`），跳过 `scope: 'minion'` 的
3. 每个状态实例的修正（同样跳过 `minion` 范围），乘以 `magnitude × stacks`；`stacking: 'strongest'` 的状态只算当前最强的那个实例（`dps × magnitude` 最大者，平局取先出现的）
4. 沿 owner 链向上，每一层的 `scope: 'minion'` 修正
5. 若上下文带技能：该技能实例（技能自身 + 链接的辅助）的 `scope: 'skill'` 修正
6. 结算：`flag` 属性 → `flag || base > 0`；数值属性 → `set ?? base × max(0, 1 + inc/100) × more`，再夹到 `[min, max]`

每条修正生效的前提依次是：作用范围匹配 → `tags` 全部在上下文里 → `notTags` 都不在 → `when` 为真 → `per` 缩放系数非 0。`more` 是 `more *= max(0, 1 + v/100)`。

`world.quick(actor, key)`：如果没有任何修正能碰到这个属性（且它不在 `baseMods` 里），直接返回默认值——这是优化，但**结果必须与 `stat()` 相同**。

上下文复用规则（影响 `{stat:…}` 度量）：如果传入的 `ctx.self === actor` 且 `ctx.tags` 就是这次的 tags，直接用它；否则新建 `{ world, self: actor, target: ctx?.target, tags, skill: ctx?.skill, event: ctx?.event }`。

### 4.4 度量与条件（`expr.mjs`）

在内容导入时把 JSON 编译成小表达式树（`FDWMeasure` 带一个枚举 `Kind` + 参数），不要每次命中解析 JSON。语义：

- 来源：`res` `status` `statusTag` `stat` `pct` `missing` `pool` `nearby` `since` `moving` `tag` `event` `var` `div` `const`，加 `of: self|target|owner`（owner = 根主人）。
- 数字：`evalNum = measure × (mul ?? 1) + (add ?? 0)`；动作参数里的数字可以是常数或度量。
- 条件：一个比较符（`gte gt lte lt eq`，没有则为 `> 0`），或 `all/any/not`。`eq` 是严格相等（double 比较）。
- 缩放 `per`：`floor(value / (step || 1))`，有 `max` 再取小。注意 `step || 1`：0 也按 1 处理。
- `since`：从没发生过时返回 `1e9`。
- `event`：`Number(event[field]) || 0`——字段不存在或非数字都是 0。

### 4.5 伤害管线（`damage.mjs`，按顺序）

1. 效能 `eff = scaled(source, 'effectiveness', spec.effectiveness ?? 100) / 100`
2. 基础伤害：每种类型 `spec.base[t] + added.t × eff`（`unscaled` 的命中不加附加伤害）
3. 攻击才判定命中：`chance = clamp(1.25 × acc / (acc + (eva × 0.2)^0.9), 0.05, 1)`；`roll('evade') >= chance` 则闪避（发 `evade` 事件，结束）
4. 格挡：`min(block.max, block)`，`roll('block') × 100 < block` 则格挡（发 `block`，结束）
5. 暴击：目标没有 `cannotBeCrit` 时，`chance = scaled(crit.chance, 技能基础暴击) + target.crit.taken`；`lucky.crit` 掷两次取小；倍率 `1 + crit.bonus/100`。命中标签加 `hit`，暴击再加 `crit`
6. 转化（`convert`）：顺序 `physical → lightning → cold → fire → chaos`，只能往后转；同一来源的转化总和超过 100% 时按比例压到 100%；「额外获得」(`extra.a.b`) 从**转化前**的量计算且不再继续转化。每块伤害记住自己的**血统**（经过的所有类型）
7. 每块伤害用「技能标签 + 命中标签 + 血统标签（含 `elemental`）」求 `damage` 属性放大，再乘暴击倍率和 `mult`；同时累计 `raw['~类型']`（按血统，供异常判定）
8. 减伤：物理（仅命中）护甲 `A / (A + 5D)`，上限 90%；元素/混沌：`res = min(res.max, res) - exposure`，减去攻击方穿透（仅命中），系数 `1 - max(-200, res - pen)/100`；最后乘 `damageTaken` 和 `damageTaken.hit`（或 `.dot`），都以 100 为基数
9. 吸收：先扣能量护盾（混沌在 `chaosBypassEs` 时绕过），然后 `mindOverMatter` 比例扣魔力，剩下扣生命；`immortal` 保底 1 血；受伤刷新护盾回充延迟
10. 回复：偷取（单次上限 `leech.max% × 最大生命`）+ `life.onHit`；法力偷取
11. 事件：`hit` → （暴击时）`crit`（`hit` 的副本）→ `struck`（以被击者为 source）
12. 异常（除非 `noAilments`）：对每个异常，`eligible = Σ raw['~来源类型']`；`chance = chance.<id> − 目标 avoid.ailment`，`roll(<异常 id>) × 100 < chance` 才生效。持续伤害型：`dps = eligible × pct/100 × effect × ailmentDamage/100`，叠 `ailmentStacks` 次；软异常：`magnitude = min(cap, scale × (eligible/(最大生命+最大护盾))^0.4) × effect`，低于 `min` 不施加；`fixed` 的（冰冻、电击）强度固定为 1，时长按 `max(0.25, min(1, magnitude/cap))` 缩放。之后发 `ailment` 事件
13. 生命 ≤ 0：`kill` → （目标冰冻中）`shatter` → `death`（以死者为 source）

持续伤害（`dotDamage`，每步由 vitals 调用）：`dps × dotDamage/100`（来源方），按非命中减伤，吸收；每 0.5 秒发一次 `dotTick`（累计量）；致死同样走 `kill`。

### 4.6 动作（`actions.mjs`）

逐个移植，字段名与 JSON 一致：

`area`（circle/cone/line，`delay` 先发 `telegraph`，`area.cascade` 余震只给技能自己的区域）· `strike`（近战取最近 N 个，`strike.splash` 溅射 50%）· `damage` · `status` · `removeStatus` · `consumeStatus` · `gain` · `consume`（`consumeKeep` 几率保留）· `set` · `more` · `tag` · `if` · `die` · `heal` · `emit` · `repeat`（小数部分是几率）· `cast`（`$event` / `$primary` / `from:'event'` 远程施放）· `castGroup` · `blink` · `explode` · `summon` · `projectile` · `zone` · `detonate` · `spread` · `proliferate`

通用：每个动作先看 `when`、`chance`；动作带 `tags` 时（`tag`、`explode` 除外）用 fork 出来的、加了这些标签的调用执行。施放者死了就停（`afterDeath` 例外）。

半径：`areaRadius = radius × sqrt(area/100)`；以施放者为中心的区域再加施放者半径（远程施放除外）。

### 4.7 载体（`carriers.mjs`）

- 投射物按线段扫描找**第一个**碰到的敌人（同距离取 id 小的），命中后顺序是：`projectileHit` 事件 → 命中伤害与 `onHit` → `proj.explode` 爆炸（35% 伤害）→ 返程中的投射物到此为止 → 穿透 → 分叉（复制一枚转 +30°，自己转 −30°）→ 连锁（找最近的未命中敌人）→ 分裂（子弹不再连锁/分叉）→ 结束；有回旋次数就折返（返程清空已命中列表，可再次命中）。
- 撞墙（地形扫描返回比例）就结束。
- 环形齐射（`ring` 或 `proj.nova`）第一枚对准目标。
- 地面区域按 `interval` 脉冲，`follow` 跟随施放者或目标。

### 4.8 规则（`rules.mjs`）

- 分发器挂在 `*` 上；对每个事件，**先复制**该事件类型的规则列表再遍历（触发过程中新挂的规则这一次不参与）。
- 跳过：持有者已死（`on:'death'` 除外）、事件 `depth > 0` 且规则没有 `chain`、事件 `capped`。
- 角色、过滤、积累（`instant/chance/count/meter/periodic`）、限流（`cooldown`、`perSecond` 滚动一秒窗口）、目标 `at`（`target/self/event/nearest`）与 `rules.mjs` 一致。`meter` 一次事件最多触发 `maxPerEvent ?? 5` 次。
- 每次触发先发 `trigger` 事件，再执行动作，调用深度 = 事件深度 + 1。
- `tick` 事件：每步给每个挂了 `tick` 规则的活单位发一个（带 `dt`）。

### 4.9 世界步进（顺序决定一切）

```
Step(dt):
  time += dt
  到期的定时器：先全部取出，按到期时间**稳定排序**后依次执行
  系统，按注册顺序：
    1. tick 系统（installRules 注册的，最先）
    2. 网格重建
    3. brains：过期召唤物 → 引导 → AI 思考或按 vx/vy 移动 → move 事件
    4. 网格重建
    5. 载体：先移动全部投射物，再跑全部区域，最后清理死掉的
    6. vitals：持续伤害与光环脉冲（每 0.25 秒）→ 状态计时/过期 → 回复 → 护盾回充 → 充能球过期 → 资源衰减；最后移除死亡单位（以及主人已死且主人不是英雄的召唤物）
  事件冲刷 flush()
```

事件队列：`emit` 时补上 `root`、`depth`（默认 0）、`time`；`depth > maxDepth(14)` 的事件丢弃，但 `kill`/`death` 标记 `capped` 后照样进入队列（只给监听者，不再触发规则）。`flush` 按**波**处理（处理当前一波时新产生的事件进下一波），总预算 `eventBudget = 20000`，超了整波丢弃并计数。每个事件依次交给：该类型的处理器 → `*` 处理器（规则分发器在这里）→ 外部监听者。处理前记录 `source.lastEvent[type] = time`（资源增减事件除外）。

### 4.10 迭代顺序（金样对不上的头号原因）

JS 的 `Map` 按插入顺序迭代。凡是 JS 里 `for … of map` 的地方，C++ 里都要保证同样的顺序：

- `world.actors`：按 id 递增（生成顺序）。删除时用**保序删除**，不要用 `RemoveAtSwap`；不要用 `TMap` 迭代（删除后顺序不保证）。
- 网格：队伍桶按**首次出现**顺序；格子内按插入顺序；查询按 `cx` 外层、`cy` 内层遍历。
- `ruleIndex`：每个事件类型下按挂载顺序。
- 状态数组：按施加顺序；`instances` 超上限时删「剩余时间最短」的（平局取先出现的）。
- `world.streams`：无所谓（按 purpose 查找）。

### 4.11 JS 与 C++ 的语义陷阱

| JS | 注意 |
| --- | --- |
| `Math.round(x)` | 是「向 +∞ 的四舍五入」：`Math.round(-2.5) === -2`。C++ 的 `round(-2.5) == -3`。统一写 `FMath::FloorToDouble(x + 0.5)` |
| `a ?? b` 与 `a \|\| b` | `??` 只在 null/undefined 时取 b；`\|\|` 在 0、空串、false、NaN 时也取 b。源码里两种都有（例如 `spec.base?.[t] \|\| 0`、`per.step \|\| 1`），逐处照搬 |
| `num(v, inv, fallback)` | `undefined`/`null` 才用默认值，0 就是 0 |
| `Math.max(0, NaN)` | 结果是 NaN；C++ 的 `FMath::Max` 不一样。导入时就拒绝 NaN，运行时尽量不产生 |
| `Array.prototype.sort` | 稳定排序。C++ 用 `Algo::StableSort` / `TArray::StableSort` |
| `{...p}` 复制投射物 | 浅复制：共享同一个 `inv`，`hitIds` 另建 |
| `Math.pow` `Math.acos` `Math.hypot` | 不同 libm 可能差最后一位。金样比较用相对误差（§6），不要求逐位相等 |
| 事件对象 | `crit` 事件是 `hit` 事件的副本；`struck` 的 source/target 与 `hit` 相反 |

---

## 5. 第 2 阶段：测试（先于桥接层）

- 用 UE 自动化测试（`IMPLEMENT_SIMPLE_AUTOMATION_TEST` 或 Automation Spec），分组名 `DWRules.Core.*` 和 `DWRules.Golden.*`。命令行运行：
  `UnrealEditor-Cmd <Project>.uproject -ExecCmds="Automation RunTests DWRules; Quit" -unattended -nopause -nullrhi`
- 先移植 `tests/core-engine.test.mjs`（12 个积木）和 `tests/core-archetypes.test.mjs`（16 条机制链），断言与 JS 一致。
- 金样测试：读取 `export-golden-traces.mjs` 产出的 JSON，在 C++ 里用同样的 setup、种子、输入跑同样步数，逐个事件比较：`type`、`source`、`target`、`skill`、`depth`、标签集合必须完全相等；数值用相对误差 `|a-b| <= 1e-9 × max(1, |a|, |b|)`。**第一个**不一致的事件要连同前后 5 个事件一起打印出来。
- 性能基准：200 / 1000 / 3000 只怪的群，固定 60Hz，记录每步耗时（目标：3000 只时单步 < 4ms，Development 构建）。

金样全部通过之前，不要开始桥接层的表现工作。

---

## 6. 第 3 阶段：UE 桥接（DWRulesGame）

### 6.1 坐标与单位

内核坐标是 2D 平面，单位与 UE 的厘米一致（网页版画面就是按 1 单位 = 1 厘米画的：`scene.mjs` 里 `M = 0.01` 米）。映射：内核 `(x, y)` → UE `FVector(x, y, 地面高度)`。网页版的 three.js 场景用了 `z = -y`（右手系），UE 不需要这个翻转。

### 6.2 步进

`UDWRulesSubsystem::Tick` 用累加器以固定 `1/60` 秒步进内核（与网页版 `page.mjs` 的 `frame()` 相同），表现层用剩余时间插值。不要把可变的 `DeltaTime` 直接传给内核。

### 6.3 单位

- 英雄、首领、精英：一个 `AActor`/`APawn` + `UDWRulesComponent`（存内核单位 id）。组件每帧把内核里的位置、朝向、生命同步到 Actor。
- 成群的杂兵：**不要**每只一个 Actor。用 `UInstancedStaticMeshComponent`（或 Mass）按内核单位列表批量画，和网页版用 `InstancedMesh` 的做法一样。
- 投射物与地面区域：内核模拟，表现层按 `carrier` id 创建/更新/销毁 Niagara 粒子或实例。

### 6.4 输入

英雄的 `brain` 是 `none`：桥接层把 WASD 写进 `vx/vy`，把鼠标地面点写进瞄准点，按住施放时每步调用 `Cast`（参考 `public/game/run.mjs` 的 `step()`：忙碌时间 `busyUntil`、引导技能、预留型技能自动开启）。

### 6.5 地形

内核的地形接口（`world.mjs` 注释里列着）是：`move(actor, x, y)`（贴墙滑动）、`sweep(sx, sy, ex, ey, r)`（返回首次碰撞比例或 -1）、`flow(x, y)`（到目标格的距离场）、`tileOf`、`tileCenter`、`size`。网页版用格子地牢实现（`public/game/dungeon.mjs`）。

UE 里两种做法：

1. **格子碰撞（推荐先做）**：关卡导出一张 2D 可走格子图给内核，规则层完全确定，金样可复现。墙体美术随便做，但碰撞以格子图为准。
2. NavMesh + 射线检测：更自然，但物理查询跨平台不保证确定，只适合不要求复现的单机体验。

### 6.6 事件 → 表现

订阅内核的事件监听者（等价于 `world.listeners`），按事件类型和 `fx`/`kind` 字段查 `UDWFxTable`（DataAsset）播放 Niagara/音效。网页版的对照在 `public/game/effects.mjs`。需要表现的事件：`area`（`fx`）、`strike`、`telegraph`、`projectileSpawn/Hit/Return/End`（`kind`）、`zoneSpawn/End`、`hit`/`crit`（伤害数字）、`kill`/`shatter`、`blink`、`summon`、`statusApplied/Expired`、`channelStart/End`。

同时暴露 Blueprint 委托（`OnHit`、`OnKill`、`OnCast`…），参数用 USTRUCT 封装，不把内核指针交给 Blueprint。

### 6.7 内容导入

`UDWContentBundle` 存导入的 JSON 文本和版本号；加载时编译成 `FDWContent`（不可变，可在多个世界之间共享）。编辑器模块提供「重新导入」按钮和校验报告（错误信息照 `content.mjs` 的格式：哪个条目、哪个字段、引用了什么不存在的东西）。

内容的**编辑**仍在网页版（`/editor/`）：改完 → 导出 JSON → UE 重新导入。以后若要在 UE 里编辑，再做一个 Editor Utility Widget，但数据格式不变。

---

## 7. 第 4 阶段：游戏层（可选，视需要移植）

`public/game/` 是网页版的游戏层，不属于规则引擎，但 UE 版大概也要：

| 网页版 | 内容 |
| --- | --- |
| `run.mjs` | 一次地图：生成地牢、按地图压力生成怪、掉落、拾取、连杀与清屏统计 |
| `dungeon.mjs` | 格子地牢生成与地形接口 |
| `atlas.mjs` `waystones.mjs` | 图集星图与路石 |
| `save.mjs` | 存档、装备、技能栏 |
| `core/content/items.mjs` `maps.mjs` | 物品生成、洗炼通货、地图曲线 |

这些都是纯逻辑，也可以照同样的方式移植；但先保证规则内核金样全过。

---

## 8. 里程碑与验收

| 里程碑 | 验收 |
| --- | --- |
| M0 导出脚本 | 两个脚本提交到本仓库；导出的内容包能被 `compileContent` 重新编译；金样文件可重复生成（同一提交两次导出逐字节相同） |
| M1 内核骨架 | 属性注册表、修正、度量、世界、事件队列、随机数；`core-engine` 前 6 个用例通过 |
| M2 战斗 | 伤害、状态、动作、载体、规则、技能、vitals；`core-engine` 12 个 + `core-archetypes` 16 个全部通过 |
| M3 金样 | 全部金样场景逐事件一致；性能基准达标 |
| M4 桥接 | 一个 UE 关卡里：英雄 + 200 只怪的群，WASD + 鼠标施放，伤害数字、击杀、投射物、区域都有表现；与网页版同种子同输入时击杀数一致 |
| M5 内容管线 | 网页编辑器改一个数值 → 导出 → UE 重新导入 → 关卡里生效 |

---

## 9. 不要做的事

- 不要在内核里用 `UObject`、`AActor`、`UWorld`、`FTimerManager`、物理、`FRandomStream`（不是同一个算法）。
- 不要用 `float`。
- 不要「顺手优化」求值顺序或改公式——任何行为变化先改网页版、补测试、重新导出金样，再改 UE 版。两边的基准永远是网页版的 `core/`。
- 不要每只怪一个 Actor。
- 不要把规则写进 Blueprint。Blueprint 只负责表现和关卡流程。

---

## 10. 遇到分歧怎么办

1. 先在网页版里用同样的种子复现，确认 JS 的行为（`node` 里直接 `createWorld` 跑最快）。
2. 用金样的「第一个不一致事件」定位到具体模块，对照本文 §4 的顺序表和 §4.10–4.11 的陷阱。
3. 如果发现网页版本身有 bug：在网页版修、加测试、重新导出金样，并在提交说明里写清楚「改变了行为」。两边同时改。

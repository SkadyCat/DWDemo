# 特性制作规范

适用于 `Content/Rules/Traits/`（UE 与网页共用）和 `Content/Rules/Timed/`（仅网页）下的特性文件。规范依据的是当前读取器、编译器和运行时（`engine/reader.mjs`、`compiler.mjs`、`world.mjs` 及其 C++ 镜像）的实际行为。凡标“必须”的条目，违反后会读取失败、编译失败，或运行结果与预期不符；标“应”的条目是约定，用来避免数值失控和互相干扰。

---

## 1. 文件与目录

| 目录 | 内容 | UE 加载 | 说明 |
| --- | --- | --- | --- |
| `Traits/` | 特性 | 是 | 不能使用 `grant_traits` |
| `Timed/` | 只在网页生效的特性 | 否 | 目前仅“附带持续时间”包装特性；技能和状态不能引用 |
| `Statuses/` | 状态（异常、减益、增益） | 是 | `apply_status` 的 `key` 指向这里 |
| `Builds/` | 技能 | 是 | 只能列特性 id，不能覆盖参数 |
| `Affixes/` | 角色词条、技能授予声明 | 否 | `sheet` 定义角色属性、触发器或 `grant_skill` |
| `WebTraits/` | 网页专用主动动作 | 否 | 例如依赖控制单位气血状态的 `sacrifice`；遵守同一读取、编译与事件规则 |
| `WebStatuses/` | 网页专用临时状态 | 否 | 与 Statuses 同一格式，可引用 WebTraits，例如回响状态授予 echo_once |
| `WebBuilds/` | 网页专用技能集合 | 否 | 与 Builds 相同结构，可引用 WebTraits；不能塞进 UE 共享 Builds |
| `Tags/families.json` | tag 与族 | 否 | 特性推导出的每个 tag 都必须分配到一个族 |
| `Tags/affix_categories.json` | 用途分类标签 | 否 | 攻击型、防御型、特殊型；独立于族与预兆词条池，不进入战斗规则 |

- 文件名必须等于 `id`，即 `Traits/<id>.json`。
- `id` 只用小写字母、数字和下划线（snake_case），全库唯一，不区分大小写。
- 文件编码为 UTF-8 无 BOM。缩进 2 空格，结尾保留换行。
- 不要往基础技能（`Builds/*.json`）里加测试用特性。试组合请用装备、宝石或测试集合。UE 会加载 `Builds/`，加进去就会直接改变游戏里的技能。

## 2. 顶层字段

字段是封闭集合，写了未知字段就会读取失败。

| 字段 | 必填 | 类型 | 说明 |
| --- | --- | --- | --- |
| `id` | 是 | string | 见上文 |
| `name` | 应 | string | 中文显示名，2–8 字 |
| `description` | 应 | string | 见第 3 节 |
| `parent` | 否 | string | 父特性 id。只有父特性在当前构筑中生效时，本特性才生效（例如 `pierce` 依赖发射冰锥的特性） |
| `params` | 否 | `{name: number}` | 只能写数字，见第 4 节 |
| `modifiers` | 否 | array | 属性修饰，见第 5 节 |
| `rules` | 否 | array | 事件规则，见第 6–9 节 |
| `sheet` | 否 | array | 角色面板条目，仅网页使用（`engine/character.mjs`） |

网页光环通过主动特性上的 `sheet: [{"trigger":"aura_skill"}]` 声明。`params.reservation_percent` 是启用后封印总魔力上限的百分比，缺省50，必须大于0且不超过100；默认十阶都保持50，不随T阶降低。收益继续写现有 `sheet` 或 `modifiers`，不在UI硬编码伤害、闪避或抗性。装备授予光环后在Q/E/F/G绑定并开启；各光环封印相加，超过100%拒绝开启，旧存档超额列表保留前面能容纳的光环。角色保留总 `maxMana`，另有 `reservedMana` 和可用上限 `manaCap`，后者限制所有回复与返还；封印、解除封印不产生资源流事件，不直接回蓝。最大魔力衍生属性仍读取总上限。光环主动特性不能独立进入随机词条池，否则可绕过装配开关；通用标记检查对未来新增光环同样生效。

在编辑器中，特性按以下顺序自动归类（不需要手写）：怪物（`monster_` 前缀）→ 附带持续时间（含 `grant_traits "stitched"`）→ 主动（有 `cast` 规则）→ 触发（有其他规则）→ 属性（只有 modifiers）。

词缀另有用途标签：攻击型（伤害、暴击、输出速度、数量、范围、异常伤害）、防御型（血盾、抗性、减伤、格挡、闪避与生存回复）、特殊型（触发装配、技能授予、资源/状态转换、控制、行为变化与攻防混合）。每个特性与复合词条恰好一类，按最终效果判断：暴击回血归防御，护盾附加伤害归攻击，挂载触发和塔层级攻防混合归特殊。分类及依据保存在 `Tags/affix_categories.json`；特性族 →「词缀分类」查看。`node scripts/classify-affixes.mjs` 补齐新条目并保留已有人工分类；新条目未持久化时页面会标明建议分类。不得把用途标签写成伤害事件 tag。

网站在上层维护独立的部位映射表 `CustomTools/RuleStudio/public/data/equipment-drop-categories.json`：胸甲（衣服）、鞋子、腰带仅防御型；武器、手套为攻击型或特殊型；戒指、护符（项链）仅特殊型。头盔与副手沿用完整池。`public/equipment-generation.mjs` 读取表与已保存的用途分类，取词缀池交集，再交给通用装备生成器生成数值；表和部位判断不进入编译器、VM、特性或战斗结算。网站的普通掉落、商店、层末商人及未鉴定装备的首次鉴定共用这个上层入口，显式传入的候选池也要取交集。`public/equipment-crafting.mjs` 在上层为三档灵石单条洗炼、陨星石整件重置与增缀筛选同一部位池；使用预兆时再与指定族取交集，不允许回退完整池。洗炼台计数与战斗预兆图鉴显示相同交集；重复/冲突排除仍由通用装备抽取负责，候选不足时不扣通货或预兆、不改装备。固定基底与传奇词条保留设计内容；已有装备不自动重洗，单条加工不影响未选择的旧词条。通用装备与库存事务只接收候选池，本身不认识部位用途政策；原有离线创作样品保持原样。

前缀/后缀是另一个独立的上层归属，保存于 `CustomTools/RuleStudio/public/data/affix-positions.json`，与攻击/防御/特殊三种用途交叉使用。每条特性、命名复合词条恰好一个前后缀归属和一条划分依据；全量目录与实际可洗炼池均按接近各半整理。前缀侧重**能力来源与数值收益**：基础属性、血盾与魔力容量、伤害/暴击/速度/数量/范围、按资源与条件增长的数值、直接回复量、技能授予，以及命中/暴击/击杀/状态变化等直接事件触发入口。后缀侧重**运行方式与效率**：累计次数、资源或时间门槛的触发、触发顺序/频率/装配、回复速度/效率/偷取流程、资源支付、控制、弹道/索敌/召唤行为变化。复合词条包含主要攻击、召唤或直接触发入口时整体归前缀；以控制和行为机制为主时归后缀。示例：基础冰霜伤害、护甲、投射物数量、暴击回血的回复量、护盾附加闪电伤害、消耗异常触发新星归前缀；回复速度、触发重复/冷却、累计命中触发、冻结控制和投射物阵型归后缀。此表只用于上层归属与浏览，不进入特性文件、聚合计划或装备数值，也不隐含“最多3前3后”等装备数量约束；均衡是目录整理目标，运行时不自动迁移或凑数。`node scripts/classify-affix-positions.mjs` 补齐新增条目并保留已有人工划分；未补表时页面明确显示建议归属。

## 3. description 写法

- 第一句写清楚：什么时候触发、对谁生效、产生什么效果。
- 每个参数都要说明含义和单位，例如：“`radius` 为索敌半径（米），`duration` 为持续秒数”。
- 写明叠加或刷新行为，例如“再次触发刷新时间，不叠加”。
- 写明上限，例如“上限 50%”。
- 描述必须和实际规则一致。修改规则时，同步修改描述和 README。

## 4. params

- 规则里所有可调的数值都必须放进 `params`，用 `{ "param": "name" }` 引用，不要在规则里写死。这样装备、宝石覆盖参数和洗炼才能作用到这些数值。
- 引用不存在的参数会编译失败（`unbound parameter`）。参数名匹配不区分大小写，但应统一用小写 snake_case。
- 洗炼的取值范围是默认值的 50%–200%。名字含 `chance`、`percent`、`slow` 的参数上限为 100；默认值是整数的参数，洗出来仍是整数；默认值为 0 的参数不会变。所以默认值决定了洗炼区间，不要设成 0 或极端值。

推荐参数名和单位：

| 名称 | 单位 | 用途 |
| --- | --- | --- |
| `amount` | 点 | 附加或范围伤害、状态强度 |
| `damage` | 点 | 投射物基础伤害 |
| `duration` | 秒 | 持续时间 |
| `interval` | 秒 | 间隔，不小于 0.05 |
| `radius` / `range` / `impact_radius` | 米 | 范围、索敌距离、落点半径 |
| `chance` | % (0–100) | 触发概率 |
| `slow`、`*_percent` | % | 百分比效果 |
| `count` | 个 | 数量（整数） |
| `ratio` | 倍率 | 伤害转化比例 |

## 5. modifiers（属性修饰）

```json
{ "target": "projectile", "stat": "speed", "op": "multiply_percent", "value": 20 }
{ "target": "element", "element": "frost", "stat": "resistance", "op": "add", "value": { "param": "resistance" } }
```

- `value` 必须是常量，可以是数字、参数，或由它们组成的算式。不能引用 `event` 或 `state`。
- 修饰作用于整个构筑（技能加上所有装备、宝石的特性），不是只作用于本特性的动作。

计算公式：

```
最终值 = (set 或 默认值 + Σadd) × max(0, 1 + (Σmultiply_percent − Σreduce_percent)/100) × Πmultiply
结果再限制在 [硬下限与 min 的较大者, 硬上限与 max 的较小者] 之间
```

| op | 含义 |
| --- | --- |
| `add` | 加固定值 |
| `multiply_percent` / `reduce_percent` | 提高 / 降低 N%，同一属性的提高和降低相加后再乘 |
| `multiply` | 独立乘区，写倍数，例如 1.3 |
| `set` | 替换基础值（多个 set 时最后一个生效） |
| `min` | **下限**：最终值至少为 value |
| `max` | **上限**：最终值至多为 value |

可用属性：

- `owner.`：`max_life`、`max_mana`、`critical_chance`、`critical_multiplier`、`hit_chance_bonus`、`mana_cost`、`damage_multiplier`（默认 1；所有命中伤害的独立倍率，包含固定伤害、投射物与次级伤害；持续伤害仍按状态自身强度结算）
- `cast.`：`speed_percent`、`extra_cost_percent`
- `projectile.`：`count`、`spread`、`speed`、`lifetime`、`damage`、`radius`、`capacity`、`pierce`、`ricochet_count`、`ricochet_radius`、`reflection_count`、`return_count`、`refraction_count`、`refraction_angle`
- `area.radius`、`explosion.radius`、`explosion.damage_percent`
- `element.<fire|frost|lightning|poison>.<damage_flat|damage_percent|resistance|max_resistance|penetration>`
- `element.<physical|void>.<damage_flat|damage_percent>`：这两种元素没有抗性类属性

约定：

- 本技能专属的投射物外形（速度、寿命、半径）应写在 `emit` 动作的字段里，不要用 `set` 修饰。修饰作用于整个构筑，会改掉同一构筑里其他特性发射的投射物。写在动作字段里的值会作为基础值，其他特性的百分比加成仍然能叠上去。
- 投射物的射程约等于 `speed × lifetime`，应和描述中的距离一致。

## 6. rules

网页投射物行为 `proj_roam` 可与 `emit` 聚合：`range` 为距生成点的活动半径（米），`interval` 为随机转向间隔基准（秒，实际75%至125%），飞行速度与寿命始终读取真实载体。宿主轨迹钩子可返回本步终点和地形碰撞半径（游走中心最大0.5米）；世界仍对起点到终点执行连续扫掠碰撞并产生标准投射物命中事件，单位碰撞使用载体完整半径。游走不因命中消失，逐目标最短间隔为0.5秒，受 `proj.rehit_interval` 缩短；使用到期队列仅释放已过间隔的目标排除记录（包括溢出目标），不清空整批命中预算。返回与环绕优先于游走，游走优先于普通曲线/波浪/追踪，抛物线不切换为平面游走。复制/分裂/折射载体拥有自己的游走状态；速度、数量、存在时间、半径与增伤仍走既有投射物聚合。

网页范围行为 `area_roam` 将主范围变为持续游走的区域。`speed` 为米/秒，`range` 为距生成点的活动半径（米），`interval` 为转向间隔基准（秒，实际75%至125%），`duration` 为基础秒数。初始沿施放方向前进，此后随机转向；碰到房间墙壁或活动边界折返，复用宿主几何碰撞。速度受 `area.move_speed`、时间受既有范围持续时间词条影响。同类多条的速度、范围、时间取最大值，转向间隔取最小值；游走优先于跟随和单向移动。每个区域使用独立的有种子随机序列，延迟不移动、结束不再推进、不重置命中次数。特效只显示实际位置，不参与运动或伤害。

```json
{ "id": "shock_on_lightning_hit", "event": "hit", "chain": { "maxDepth": 4 },
  "conditions": [ ... ], "actions": [ ... ] }
```

| 字段 | 说明 |
| --- | --- |
| `id` | 特性内唯一，写法为 `<效果>_on_<事件>` |
| `event` | 内置事件或自定义事件名（见第 7 节） |
| `chain.maxDepth` | 事件代数上限，**默认 2**，范围 0–32 |
| `chain.channel` | 独立的链路通道，一个构筑最多 4 个。设置后深度按通道单独计数 |
| `chain.maxEvents` | 同一次施法中，本规则最多触发的次数（默认 16384） |
| `conditions` | 全部满足才执行 |
| `actions` | 必填 |

### 事件代数（generation）

- 施法事件是第 0 代。`emit` 发射的投射物、`damage_*` 产生的命中、`emit_event` 产生的事件，都比触发它们的事件多 1 代。召唤物每次开火、雷暴每次落雷都从第 0 代重新开始。
- 事件代数大于规则的 `maxDepth` 时，规则会被**静默跳过**，不报错，只计入 `DepthBlocked` 统计。
- 约定：
  - 响应 `hit`、`kill`、`critical`，而且希望“任何来源都能触发”的规则（异常、击杀奖励、附带持续时间等），应写 `"chain": { "maxDepth": 4 }`。
  - 只想响应主投射物的规则，保持默认值 2，或者用 `generation` 条件明确限制。
  - 会触发自身的递归链（例如碎裂、连锁爆炸）必须设置独立 `channel` 和较小的 `maxDepth`，参考 `shatter`。

## 7. 事件

| 事件 | 何时触发 | 位置 / 目标 | `event.amount` / `event.damage` |
| --- | --- | --- | --- |
| `cast` | 施法 | 施法位置 | 技能威力 |
| `spawn` | 投射物生成 | 生成点，带来源投射物 | — |
| `hit` | 投射物命中，或未指定 `event` 的伤害动作命中 | 命中目标 | 实际伤害 / 请求伤害 |
| `critical` | 任何命中暴击 | 同上 | 同上 |
| `kill` | 任何命中致死，包括自定义命中事件 | 被击杀目标的位置 | 同上 |
| `projectile_end` | 投射物结束 | 结束点 | — |
| 自定义 | `emit_event`、伤害动作的 `emitEvent`、召唤物或雷暴的 `event` | 见对应动作 | — |

**次级伤害必须使用自定义命中事件。** 附加伤害、范围爆炸、落雷等由规则产生的伤害，应写 `"emitEvent": "<特性>_hit"`，不要使用默认的 `hit`。原因是：如果用默认的 `hit`，每次次级命中都会再触发所有“命中时”特性（附加伤害、异常、附带持续时间……），伤害会成倍增长，而且很难平衡。`fire_damage`、`lightning_damage`、`brittle`、`player_slash` 都是这样写的。需要让异常响应次级伤害时，在异常特性里显式监听这个事件，例如 `shock` 监听 `lightning_damage_hit`。

自定义事件命名：`<特性或效果>_<动作>`，例如 `death_lightning_strike`、`sentinel_attack`、`fire_damage_hit`。

## 8. conditions

| op | 字段 | 判断 |
| --- | --- | --- |
| `tag` | `tag` | 事件带有该 tag（可写多个条件，表示同时具备） |
| `status` | `key`，可选 `compare` / `value` | 事件**目标**身上的状态；只写 `key` 表示“有这个状态” |
| `chance` | `probability` | 百分比概率，确定性随机（同一种子结果相同） |
| `state` | `key`，`scope`，可选 `channel`、`compare` / `value` | 读取计数器或累计值 |
| `active` | `key`，可选 `compare` | **网页条件**：当前编译集合的 activeId 是否等于 key；eq/ne 用于筛选或排除主动动作 |
| `generation` | `value` | 事件代数 ≤ value |
| `entity_count` | 可选 `kind`，`compare` / `value` | 施法者存活的投射物数（指定 `kind` 时只数这一类） |

`compare` 可选 `eq`、`ne`、`gt`、`gte`（默认）、`lt`、`lte`。

`kill` 事件上的 `status` 条件检查的是被击杀的目标，可以正常使用（死亡闪电依赖这一点）。

## 9. actions

通用字段：

- `element`：`fire`、`frost`、`lightning`、`physical`、`poison`、`void`。`cold` 是 `frost` 的别名，新内容统一写 `frost`。
- `tags`：附加到产生的事件上。
- `origin`：`event`（默认）、`owner`、`target`、`source`。作用分两种情况：
  - 对 `apply_status`、`consume_status` 和 `grant_traits`，`owner` 表示作用于施法者自己。
  - 对其他动作，`origin` 决定产生的位置。
- `inheritance`：默认继承构筑属性。写 `"explicit"` 时只使用动作自身的数值。
- `emit.offset`：网页专用发射位置偏移，格式为 `{"forward":表达式,"left":表达式,"up":表达式}`，单位米，未写的分量为0。在选定 `origin` 后，按本次施法方向的前方、左方和世界上方移动**真实发射起点**；负 forward 即后方。先偏移再按环形/扇形布局发射，抛物线也使用偏移后的真实起点。仅允许用于 `emit`，含此字段的特性放在 WebTraits/Affixes，不能进入 UE 共享 Traits。编译器缓存与计划查看器保留偏移配置。
- `emit.scatter`：网页专用，结构和单位同 offset，但每枚投射物独立计算。用于法阵不同位置出射等场景，移动的也是实际载体。origin 为 owner 时，offset/scatter 的局部前方取角色朝向，索敌方向不会把法阵挪到角色侧面。`emit.aim: "target"` 让每枚直线投射物从自己的真实起点瞄准事件目标的三维位置；缺少目标时沿事件方向。法阵位置与出射方向分别计算。
- `emit.scatter: {"shape":"hemisphere","radius":表达式,"distribution":"even"或"random"}`：另一种网页发射位置分布，与 forward/left/up 写法互斥。以 offset 后的位置为球心，在世界上方的半球**表面**生成本次聚合后的全部投射物；半径单位米，每次 emit 求值一次。默认 even 用等面积分层、黄金角及每事件种子旋转；random 对每枚独立采样高度和方位，单枚连续出射也不会卡在同一高度圈。两种分布都修改真实三维起点，可与环形/扇形发射和 `aim:"target"` 组合，没有技能专用判断。头顶宝库使用球心高度2米、半径1.8米、random，表现仅读取实际起点和速度。
- 网页表达式 `{"random":[下界,上界]}` 取均匀实数，`{"random_int":[下界,上界]}` 取含两端的整数；必须两个参数，可嵌套参数、状态和算式。采样由根种子、事件序号与表达式位置决定，scatter 中每枚独立取样，同种子可复现；它们是动态表达式，不能放进静态 modifiers。其他共享规则不受影响。
- `then`：子动作，最多嵌套 12 层。

| op | 必填 | 可选 | 行为 |
| --- | --- | --- | --- |
| `emit` | `kind` | `count`、`spread`、`speed`、`lifetime`、`damage`、`radius`、`pierce`、`layout`(fan/radial/point)、`endEvent` | 发射投射物，自动带 `projectile` tag；未填的数值使用构筑属性 |
| `copy` | — | `count`、`spread` | 复制来源投射物（事件里必须带有来源投射物） |
| `damage_area` | `radius`、`amount` | `emitEvent` | 以事件位置为圆心造成伤害；半径受 `area.radius` 影响；自动带 `area` tag |
| `damage_target` | `amount` | `emitEvent` | 对事件目标造成伤害 |
| `apply_status` | `key`、`value`、`duration` | `cap`、`origin` | 施加 `Statuses/<key>.json` 定义的状态 |
| `counter` / `accumulate` | `key`、`value`（counter 默认 1） | `cap`、`threshold`、`scope`、`channel`、`then` | 累加；每达到一次 `threshold` 执行一次 `then`（每次最多 64 次），执行时 `event.stored_value` 等于 threshold |
| `maintain_emitter` | `key`、`event`、`value`、`cap`、`duration`、`decay_interval`，`interval` / `rate` 二选一 | `channel`、`radius`、`targeting` | **网页动作**：维护施法者的层数，上限 cap；刷新最后输入时刻，不重启发射时钟。interval 保留固定间隔事件；rate 为每秒期望事件数，使用种子化泊松时钟，随机间隔且允许短时疏密，不能与 interval 同写。rate 表达式每步求值，其中 event.amount / event.stored_value 是当前层数、event.damage 是原施法威力；0 暂停，不积攒补射。层数或速率变化保留尚未用完的随机等待量，重施法不重抽；速率技术上限1024次/秒，每控制器每子步最多64次，超限计入容量丢弃。任意层数闲置 duration 秒后减第一层，此后每 decay_interval 秒减一层；归零停止并归还持有根。与 consume/counter 共用 owner 状态。targeting 为 nearest/random/aim，radius 为索敌半径（默认24米）。每次事件独立根与命中批次，不产生新手动施法、资源支付或冷却；后续 emit 的多重等修饰正常生效 |
| `consume` | `key`、`value` 或 `"all"` | `then` | 消耗本特性的计数器；不足时中止同一列表中剩余动作，不读取真实状态 |
| `multiply_damage` | `value` | — | **网页动作**：将本次施法根的伤害倍率乘以 value，可使用 consume 的 event.stored_value 快照；覆盖该根的投射物、附加点伤和后续命中，其他技能和既有根不受影响。倍率在抗性和承伤结算前应用，非负且最多1000000；本次根释放后归零重置。不要再把同一倍率写入 emit.damage 以免重复放大 |
| `consume_status` | `key`、`value` 或 `"all"` | `origin`、`then` | **网页动作**：消耗真实状态层数。owner 作用于自己，其他 origin 作用于事件目标；value 是正整数层数，all 全部消耗。不足不扣且中止当前动作列表。then 内 event.stored_value 为实际消耗层数；同步异常运行时层数，清零立即移除状态授予的特性 |
| `repeat_skill` | — | — | **网页动作**：仅在 cast 事件中重新执行同一完整聚合技能一次，保留落点、方向和计划。复施不算手动输入、不再支付资源或冷却，也不能递归复施 |
| `spawn_monster` | `kind`、`count`、`duration`、`radius` | `origin`、`invulnerable` | **网页动作**：kind 引用 Monsters 中的真实怪物定义（允许停用自然生成的定义），创建敌对临时单位。count 为只数（单次上限32），duration 为秒（0.05–60），radius 为出现环半径米（0–50），invulnerable 为布尔值。角色同时最多128只临时敌人。沿用怪物装备、技能计划和AI；到期移除不产生击杀或掉落。无敌对命中、异常持续伤害与地面持续伤害均生效 |
| `emit_event` | `event` | `amount` | 产生自定义事件，代数加 1 |
| `redirect` | `mode`(ricochet/reflect/return) | `radius` | 改变来源投射物的方向；要求构筑中对应的次数属性大于 0 |
| `summon` | `kind`、`event`、`duration`、`interval`、`radius` | `cap`、`origin`、`tags` | 召唤固定位置的召唤物，每隔 interval 秒向 radius 内最近的敌人触发 event |
| `storm` | 同 `summon` | 同上 | 跟随施法者；触发的 event 位于目标位置；再次施放时保留开火节奏 |
| `grant_traits` | `traits`、`duration` | `origin` | **只能用在 `Timed/`**。见第 12 节 |
| `sacrifice` | — | `count`、`kind` | **网页动作**：献祭施法者最早的存活控制单位；默认 1 只，count 限制为 0–32，kind 可限制种类。雷暴不属于控制单位。每只实际献祭单位响应既有主动牺牲词条；无单位不产生献祭事件或回复 |

状态值 `state` 的作用域（`scope`）：

- `owner`：施法者，跨施法保留。
- `target`：每个目标各自一份。
- `cast`：只在本次施法内有效。

不写 `channel` 时，状态值只在本特性内部可见；写了同名 `channel` 的特性之间共享。

### 表达式

数值字段可以是数字，也可以是以下表达式：

```json
{ "param": "amount" }
{ "event": "amount" | "damage" | "stored_value" | "generation" | "sequence" }
{ "stat": "projectile.damage" }
{ "state": "stacks", "scope": "target" }
{ "mul": [a, b] }  { "add": [...] }  { "div": [a, b] }  { "min": [...] }  { "max": [...] }
{ "pow": [base, exponent] }
```

- 除数为 0 时结果为 0。表达式栈最大 32 层。
- `pow` 必须恰好两个参数，计算 base 的 exponent 次幂；参数及每步结果按 float32，溢出限制为 float32 最大有限值，无实数结果时为 0。可用于常量修饰，也可用于动作中的动态表达式。属性最终仍受各自的硬上下限约束。
- `stat` 在编译时折算为常量。

## 10. 元素与 tag

- 冰霜伤害统一写 `"element": "frost"` 和 `"tags": ["frost", "cold"]`。`chill`、`brittle`、`freeze` 判断的是 `cold` tag，只写其中一个会漏掉一部分联动。
- 其他元素写同名 tag，例如 `"element": "lightning", "tags": ["lightning"]`。`shock` 判断的是 `lightning` tag。
- 一个构筑里 tag 总数上限 64 个，其中内置 16 个，所以自定义 tag 最多 48 个。不要为每个特性都新建 tag，只在其他特性需要据此判断时才新建（例如 `death_lightning`）。
- 内置 tag 由引擎自动打上，不要手写：`manual`、`root`、`direct`、`first_hit`、`critical`、`owner_hit`、`owner_kill`、`projectile`、`area`、`refraction`、`ricochet`、`reflect`、`return`、`end_expired`、`end_impact`、`end_capacity`。
- 新特性推导出的 tag（元素、`spell`、`melee`、`area`、`kill` 等）必须在 `Tags/families.json` 里有族，否则整个规则集校验失败。需要额外标注时，写在 `families.json` 的 `traits` 中。

## 11. 状态（Statuses/）

网页异常地面触发与接触染色见 [abnormal-grounds.md](abnormal-grounds.md)：`hit_burning_ground`、`hit_chilled_ground`、`hit_shocked_ground`、`hit_poison_ground` 使用已有 sheet 触发装配，参数均须注明概率/米/秒/强度并生成十阶；`proj_ground_tint` 是无数值机制特性。地面每0.5秒按已有持续伤害或状态入口结算，不产生递归命中。染色读取真实地面接触数据，只写单个投射物的外观状态；预制体不得生成地面、修改元素或追加伤害。

```json
{ "id": "shock", "name": "感电", "description": "...", "category": "ailment",
  "stacking": "strongest", "cap": 50,
  "effects": [ { "type": "damage_taken", "scale": 1 } ] }
```

- `category`：`ailment`、`debuff`、`buff`。
- `stacking`：
  - `strongest`：取最高强度和最长时间。
  - `refresh`：刷新持续时间。
  - `stack`：叠层，配合 `maxStacks`（≤100）使用。
- `effects.type`：`damage_taken`、`damage_dealt`、`critical_chance`、`damage_over_time`（需要 `element` 和 `interval`，interval ≥ 0.05）、`move_speed`、`action_speed`、`control`（`freeze` 或 `stun`）。
- 强度上限写在状态的 `cap`，或 `apply_status` 的 `cap` 中。
- 持续伤害不会暴击，也不会触发命中或击杀规则。
- 新异常的写法：一个状态文件，加上一个用 `apply_status` 施加它的特性（参考 `chill`、`shock`、`ignite`）。

## 12. 召唤物与雷暴（summon / storm）

- 同一施法者、同一 `kind` 最多保留 `cap` 个（1–32，默认 1）。超出时替换最早的那个。全场合计最多 128 个。
- `duration` 最多 60 秒，`interval` 至少 0.05 秒，`radius` 最多 1000 米。没有存活敌人时不开火，等待下一次。
- 召唤物的开火事件从第 0 代开始，所以开火规则使用默认深度即可。
- 召唤物存活期间，原施法根不会释放。
- `kind` 同时也是表现层的 key。网页和 UE 都需要为它配置表现：
  - 网页：`public/prefabs/<kind>.mjs`
  - UE：`DWRuleVisualHost` 的 `Visuals` 配置。没有配置时会显示占位网格。
- **重复施法**：超过 `cap` 时替换最早的实例，新实例沿用它的开火节奏，所以连续施法不会加快开火。
- **可插拔攻击**：召唤物只负责定位和节奏，攻击内容写成 `parent` 指向召唤特性、监听其 `event` 的子特性，这样宝石和装备都能往里面加攻击方式。范例是召唤哨卫：`summon_sentinel` 加上 `sentinel_*`。召唤物发起的攻击属于主攻击，可以使用默认的 `hit` 命中事件，让感电、冰缓等“命中时”特性正常触发。

## 13. 附带持续时间（Timed/，仅网页）

```json
{ "op": "grant_traits", "origin": "owner", "traits": "stitched", "duration": { "param": "duration" } }
```

- `traits: "stitched"` 表示授予在装备或物品里通过 `with` 缝进来的特性。也可以写成固定列表 `[ "id" | {"id","params"} ]`。
- 同一个包装特性、同样的缝合内容、同一个持有者，再次触发时只刷新时间。
- 缝合最多嵌套 3 层。缝合的特性跟随外层的持续时间，不能自带 `duration`。
- 不写 `origin` 时，特性授予命中的目标。目标身上只有属性部分（抗性等）生效。
- 文件必须放在 `Timed/`，技能和状态不能引用。

## 14. 装备授予技能与上限

### 装备词条授予主动技能（网页）

在 `Affixes/` 声明 `"sheet": [{ "grant_skill": "sacrifice" }]`。技能 id 必须存在且为玩家技能；授予词条本身不写 cast 规则，避免把新主动技能混进每一次普通施法。装备的直接永久词条（含基底、固定传奇词条和随机词条）提供装配资格；背包、未鉴定装备、限时条目与触发器缝合载荷不提供资格。相同技能的多份授予去重，仍占用普通四个主动技能槽之一，不写入永久所有权。卸装、出售或洗掉最后一个授予来源后，相应槽位失效。

献祭技能的组合为 `WebBuilds/sacrifice.json → WebTraits/sacrifice_minion.json → cast / sacrifice`。它沿用普通施法消耗、施法节奏与主动特性的 cooldown 参数；无可献祭单位时仍支付普通施法成本，但不凭空执行献祭收益。输入层只负责选择技能和施法，没有额外献祭快捷键，也不按 BD 名字调用战斗效果。

 | 项 | 上限 |
| --- | --- |
| 每个构筑的 tag | 64（含内置 16） |
| 每个构筑的链路通道 | 4 |
| 动作嵌套 | 12 层 |
| 表达式栈 | 32 |
| 事件代数 | 64（规则默认只响应 ≤2 代） |
| 每次 threshold 触发 | 64 次 |
| 召唤物 | 每 kind 32 个，全场 128 个 |
| 状态叠层 | 100 |
| 缝合嵌套 | 3 层 |

## 15. 验证流程

1. 在 RuleStudio 的“特性”页编辑。保存时会校验整个规则集（读取、编译、引用、tag 族）。
2. 用装备、宝石或测试集合，把特性挂到目标技能上，用“试打”检查以下几项：
   - 伤害；
   - 触发次数；
   - 时间线；
   - 是否出现 `DepthBlocked` 或 `CapacityDrops`。
3. 有新机制（新动作组合、召唤、刷新逻辑）的特性，必须写测试 `tests/<id>.test.mjs`，并加进 `package.json` 的 `test` 脚本。测试应覆盖：
   - 触发；
   - 不触发的条件；
   - 刷新或叠加；
   - 上限；
   - 参数覆盖。
4. 运行 `npm test`，全部通过。用到 UE 也支持的动作时，还要通过一致性（parity）检查。
5. 同步更新 README 中的对应段落。

## 16. 提交前检查清单

- [ ] 文件名等于 `id`，`id` 用 snake_case，`name` 和 `description` 是中文，每个参数都有说明和单位
- [ ] 所有数值都放在 `params` 里，默认值不是 0，洗炼到 50%–200% 时仍然合理
- [ ] 响应 `hit`、`kill`、`critical` 的规则已经考虑 `maxDepth`（任意来源都要触发时写 4）
- [ ] 次级伤害使用了 `emitEvent: "<x>_hit"`，没有回到通用的 `hit`
- [ ] 冰霜伤害同时带 `frost` 和 `cold` tag，`element` 写的是 `frost`
- [ ] 技能专属的投射物外形写在 `emit` 字段里，没有用 `set` 修饰
- [ ] 会自我触发的链路设置了 `channel` 和深度，有明确的终止条件
- [ ] 召唤或雷暴已经评估过重复施法的情况，`kind` 在网页和 UE 都配置了表现
- [ ] 新 tag 已在 `Tags/families.json` 中分配了族
- [ ] 没有为了测试修改 `Builds/` 下的基础技能
- [ ] 测试、README、试打结果都已检查

## 17. 模板

属性特性：

```json
{
  "id": "frost_resistance",
  "name": "冰霜抗性",
  "description": "冰霜抗性提高 resistance%。",
  "params": { "resistance": 30 },
  "modifiers": [ { "target": "element", "element": "frost", "stat": "resistance", "op": "add", "value": { "param": "resistance" } } ]
}
```

命中附加伤害（次级伤害使用独立事件）：

```json
{
  "id": "lightning_damage",
  "name": "闪电伤害",
  "description": "命中时额外造成 amount 点闪电伤害。",
  "params": { "amount": 10 },
  "rules": [ {
    "id": "lightning_damage_on_hit", "event": "hit",
    "actions": [ { "op": "damage_target", "element": "lightning", "tags": ["lightning"], "emitEvent": "lightning_damage_hit", "amount": { "param": "amount" } } ]
  } ]
}
```

击杀触发（任何来源都能触发）：

```json
{
  "id": "example_on_kill",
  "rules": [ {
    "id": "example_on_kill", "event": "kill", "chain": { "maxDepth": 4 },
    "conditions": [ { "op": "chance", "probability": { "param": "chance" } } ],
    "actions": [ ... ]
  } ]
}
```

召唤物（外形写在动作字段里）：

```json
{ "op": "emit", "kind": "ice_lance", "element": "frost", "tags": ["frost", "cold", "spell"],
  "count": 1, "speed": 24, "lifetime": 0.45, "radius": 0.22, "damage": { "param": "damage" } }
```

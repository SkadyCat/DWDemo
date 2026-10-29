# BD Hunter 词缀优先级分析

入口：[BD Hunter 独立分析页](http://127.0.0.1:5290/bdhunter.html)，网站侧栏的「运行与验证」也有入口。默认分析霜雷交响的真实装备实例。

BD Hunter 在战斗外读取规则和预设，使用原有 Battle 模拟。不会修改规则、装备、掉落或玩家存档。网页使用独立 Worker 计算，可取消；命令行使用同一分析模块。

## 场景与口径

默认每组 30 秒、三个固定种子 18、67、193，持续施放第一技能。

| 场景 | 设置 | 用途 |
| --- | --- | --- |
| 单体 | 一个静止高生命目标，元素抗性 20% | 单体输出、触发和资源 |
| 密集群体 | 12 个静止高生命目标，元素抗性 20% | 穿透、覆盖与多目标循环 |
| 高抗单体 | 一个静止高生命目标，元素抗性 60% | 穿透的有效区间 |
| 标准压力 | 单体输出加每秒一次 300 点原始伤害 | 防御、回复、输出与存活 |

目标无护盾、不主动攻击、不会在窗口内死亡。标准压力轮换物理、火、冰、雷、毒，使用现有规则动作在内存中创建测试攻击，经过规则世界的抗性，再走角色原有护甲、格挡、护盾与气血结算。没有跳过防御构筑直接扣血。该压力不受敌人冻结和减速影响，不能表示控制的全部防御价值。

不开启无敌，不注入魔力或生命。正常施法、触发冷却、费用、回复与异常消费均由实际运行时处理。起手后松手与定期献祭可以通过操作选项设置，不按 BD ID 自动代按技能。

总 DPS = 实际造成的伤害 / 完整测试时长；死亡不会缩短分母。平均单体 DPS 再除以实际受击目标数。报告同时保留最后三分之一时段 DPS、实际触发和消费计数、元素构成、最低魔力、最低生命、存活时间及峰值队列。

## 移除实验与优先级

对已装备实例的每一条随机词缀分别移除一次，其他数值、基底、固定传奇和技能保持不变，并使用相同种子。

```text
移除变化 = (移除后的 DPS − 基准 DPS) / 基准 DPS
```

负数表示有收益；触发次数下降至少 90% 时标为「核心触发」。最高输出损失达到 10% 的标为「输出优先」；压力下存活减少、最低生命降低或承伤增加的单独标为「防御续航」；其余按测得收益分组。阈值只服务报告。

移除是诊断性对照，不能累加单项贡献。并行的两条触发路径可能互为备用，单独移除都不会断链；判断这类依赖需要同时拔除或组合对照。行内保留各随机种子的变化范围。

## 合法同槽替换

候选来自当前 equipmentAffixPool，按现有十阶表创建，默认取合法 T10 中位值且不超过装备阶级；复合词缀保留完整挂载。每次只替换一条，维持相同词缀总数。

自动参照选择依据是输出损失、最低生命损失、承伤增加和存活损失中的较大值；并列时优先选择可测试候选更多的部位。报告明确显示被替换的词缀；命令行可以指定其他参照。同件装备重复或特性冲突的候选跳过。

默认候选由 DEFAULT_CANDIDATES 列明，覆盖冰雷点伤、感电、元素乘区、触发、范围和投射。这是有限清单的局部对照，不是全部组合的全局最优。一个当前低收益词缀可能是另一个升级的前置条件，不能把多个收益直接相加。

木桩没有击杀，不能推导击杀、掉落、转场收益和爬塔极限；固定位置不能完整评价走位与覆盖。规则数据与预设保存 SHA256 指纹，分析器带版本号。来源变化时网页把已有报告标为历史报告；修改参数后需要重新计算。

霜雷交响的结论与组合依赖见 [专项分析](bd-hunter-rime-thunder.md)。组合检查是工具配置，保存在 profiles 下，不参与战斗规则。

## 命令行

在 CustomTools/RuleStudio 中运行：

```powershell
node scripts/bd-hunter.mjs
node scripts/bd-hunter.mjs --preset synergy_rime_thunder --seconds 30 --seeds 18,67,193
node scripts/bd-hunter.mjs --replacement gloves:3 --candidates shock_max_stacks,trigger_repeat,more_lightning
node scripts/bd-hunter.mjs --candidates all --out G:/DungeonWorldBeta/Saved/BDHunter/full-scan
node scripts/bd-hunter.mjs --reuse ../../Saved/BDHunter/synergy_rime_thunder.json --groups public/bdhunter/profiles/synergy_rime_thunder.json
```

默认输出 Saved/BDHunter/预设ID.json 和同名 Markdown。JSON 保留逐种子数据，Markdown 用于阅读。`--cast-for 3` 表示起手三秒后松手，`--sacrifice-every 1` 表示每秒尝试一次既有献祭操作。全池扫描比默认清单耗时更长。

## 实现与验证

- `public/bdhunter/analyzer.mjs`：只读实验、合法候选、指标和报告。
- `public/bdhunter/worker.mjs`：网页后台计算。
- `public/bdhunter.html`、`public/bdhunter/app.mjs`、`style.css`：独立分析页。
- `scripts/bd-hunter.mjs`：命令行和 Markdown 报告。
- `tests/bd-hunter.test.mjs`：真实断链、确定性、合法阶级、非变更、正常防御与压力死亡。

专项验证：`node --test tests/bd-hunter.test.mjs tests/synergy-bds.test.mjs tests/damage-meter.test.mjs`。现有 npm test 使用测试文件通配符，会包含新测试。

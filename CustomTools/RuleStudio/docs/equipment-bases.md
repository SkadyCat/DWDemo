# 装备两条基础属性

网站与 UE 共用 `Content/Rules/Equipment` 的底材配置。基础属性是普通已有特性的数值实例，仍通过 collection 聚合进入真实战斗，不增加战斗 VM 动作。

## 数量与生成

- 武器、防具各两条：第一条类型由底材固定，第二条生成时随机，两条类型不重复。
- 武器第一条为绑定技能对应元素的点伤。防具第一条明确指定护甲、闪避或护盾，第二条从已有防御数值属性抽取。
- 品质词条另算：普通 0、魔法 1–2、稀有 3–6、传奇 6（1 固定传奇 + 5 随机）。因此传奇武器或防具通常为两条基础属性加六条品质词条。
- 每条基础属性独立抽取 `1..装备 T 阶`，再使用现有十阶表生成实际参数。基础属性数值生成后保存，施法和换装不重抽。
- 单洗、全洗和四重增缀只处理品质词条，保留两条基础属性及其数值。
- 首饰、怪物谱系、稀有度、塔地图和角色等固定槽不自动新增基础属性。

## 底材类型

| 武器 | 固定点伤特性 |
| --- | --- |
| 霜棘法杖 `frostthorn_staff` | `flat_frost` |
| 焰心法杖 `emberheart_staff` | `flat_fire` |
| 断岳重锤 `sundering_maul` | `flat_physical` |
| 弦月军刀 `crescent_saber` | `flat_physical` |
| 岗哨权杖 `sentinel_scepter` | `flat_frost` |
| 引魂铃 `spiritcall_bell` | `flat_physical` |
| 蚀骨琉璃瓶 `venomglass_flask` | `flat_poison` |
| 万剑·霜锋法杖 `myriad_swords_t1_weapon` | `flat_frost` |

`flat_poison` 使用原有的 `damage.flat.poison` 面板字段，沿用其他元素点伤的参数和十阶结构。

| 防具底材 | 锁定类型 |
| --- | --- |
| `bloodthirst_gauntlets` | 护甲 `armour` |
| `cinder_guard_belt` | 护甲 `armour` |
| `cinder_guard_boots` | 闪避 `evasion` |
| `cinder_guard_chest` | 护盾 `shield_base` |
| `cinder_guard_gloves` | 护甲 `armour` |
| `cinder_guard_helmet` | 护盾 `shield_base` |
| `cinder_guard_offhand` | 护甲 `armour` |
| `cinder_surge_belt` | 护甲 `armour` |
| `cinder_surge_crown` | 护盾 `shield_base` |
| `cinder_surge_grips` | 护甲 `armour` |
| `cinder_surge_robe` | 护盾 `shield_base` |
| `cinder_surge_steps` | 闪避 `evasion` |
| `rending_gauntlets` | 护甲 `armour` |
| `warden_boots` | 闪避 `evasion` |
| `myriad_swords_t1_helmet` | 护盾 `shield_base` |
| `myriad_swords_t1_chest` | 护盾 `shield_base` |
| `myriad_swords_t1_gloves` | 护甲 `armour` |
| `myriad_swords_t1_boots` | 闪避 `evasion` |

这些配置逐个写入文件；生成逻辑不按中文名、装备标签或技能名字猜防御类型。

## 配置和实例

底材 `bases` 只声明第一条，恰好一个普通特性条目：

```json
"bases": ["armour"]
```

也支持现有的 `id/params/tier` 条目格式。不得配置持续时间、缝合项、规则特性或面板触发动作。装备编辑器提供固定类型选择。

成品实例 `bases` 保存两条与普通词条相同结构的数据（`id/name/tier/traits`）；`affixes`、`legendary` 继续单独保存。聚合时将它们转换为普通特性条目。底材 `traits` 仍表示手工直接配置的额外特性，编辑器显示的数量不是成品品质词条数量。

随机池从现有数值属性中筛选。防具只接受防御、护甲、闪避、护盾、生命、抗性、格挡、回复等防御面板项，以及既有生命/魔力上限、元素抗性修饰；排除伤害、暴击、攻速、施法速度和面板触发动作。网页与原生使用相同 ID 排序和随机流。

旧实例没有基础属性时，使用 `bases:<uid>` 的哈希作为独立种子补齐一次，结果随实例保存。已有品质词条、固定传奇词条、背包材料和装备 T 阶不重掷。

## 验证入口

- `npm run test:equipment-bases`：26 种底材、各品质与 T 阶、固定防御类型、洗炼/增缀保留、旧实例补齐，以及真实 Battle 点伤、护甲、闪避、护盾和卸装。
- UE 自动化 `DWRules.Equipment.Bases`：原生生成、洗炼、角色真实防御及存档导入。
- `node scripts/make-native-economy-parity.mjs` 生成对照输入；运行 UE `DWRules.Migration.EconomyParity` 后，加 `--compare` 比对，包括两条基础属性。
- 界面实测与日志位于 `Saved/EquipmentBases/`。

2026-10-24 验证结果：网页基础属性 6 项与集合 6 项通过；UE `DWRules.Equipment.Bases`、`DWRules.Migration.EconomyParity` 均成功退出。对比 784 份数值档、865 组特性标签及 146 组装备生成/洗炼数据全部一致，包含两条基础属性。洗炼页实测显示固定基础、随机基础和可洗品质词条，控制台无错误。此前全量网页测试中的两项“飞返连焰”既有失败仍保留记录，未在本次基础属性修改中修复。

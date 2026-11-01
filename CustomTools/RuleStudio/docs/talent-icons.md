# 六域星盘图标：提示词与使用办法

共 103 个图标，分为 13 张 3×3 透明图集：基石 2 张、核心 5 张、小天赋 6 张。4 个属性图标沿用现有的 `public/talents/icons/strength.png` 等文件。

本文件由 `node scripts/talent-icons.mjs` 生成，请勿手改；画面描述在脚本的 `MOTIFS` 表里。

## 使用办法

1. **生成：** 每张图集一次生成。把下面对应的提示词整段交给图像生成工具（与原传奇图标相同，使用内置 Image Gen），要求输出带透明通道的正方形 PNG，建议 1024 像素以上。
2. **命名：** 按图集编号保存为 `CustomTools/RuleStudio/public/talents/icons/six-domains/<编号>.png`，例如 `ks-01.png`。
3. **查看：** 刷新游戏后按 P 打开天赋盘。已放入的图集会自动显示在对应节点上；还没生成的节点保持原来的圆点外观。可以一张一张地补。
4. **检查：** 运行 `node scripts/talent-icons.mjs --status`，列出哪些图集已到位。
5. **单张重画：** 某个图标不满意时，复制它所在图集的整段提示词重新生成整张，替换同名文件即可。不要单独裁剪或移动格子，界面按「行、列」定位。
6. **改设计后：** 新增或改名了天赋，就在 `scripts/talent-icons.mjs` 的 `MOTIFS` 里补一条描述，再运行脚本，图集划分和提示词会自动更新。注意已生成的图集可能需要重画，因为格子位置会移动；脚本输出的 `imagegen-plan.json` 记录了每个格子对应哪个图标。

图标编号的规则：
- `ks-领域-序号`：基石
- `nt-主题-序号`：核心
- `sm-名称`：同名小天赋共用一个图标
- `attr-属性`：属性

编号由天赋内容决定，与布局种子无关，所以换布局不用重画图标。

## ks-01.png

| 位置 | 编号 | 天赋 | 画面 |
| --- | --- | --- | --- |
| 1 行 1 列 | `ks-blight-1` | 瘟疫之主 | a jade green poison flask with three stacked drops rising above it |
| 1 行 2 列 | `ks-blight-2` | 虚无吞噬 | a violet void spiral swallowing a jagged jade crack |
| 1 行 3 列 | `ks-flame-1` | 燎原 | a wide orange wildfire spreading over three small flames in a row |
| 2 行 1 列 | `ks-flame-2` | 以血为薪 | a crimson blood drop burning with a tall orange flame on top |
| 2 行 2 列 | `ks-frost-1` | 永冬之心 | a frozen heart-shaped crystal of ice blue locked inside a thick frost ring |
| 2 行 3 列 | `ks-frost-2` | 冰魄碎裂 | an ice blue crystal shattering into three sharp shards |
| 3 行 1 列 | `ks-iron-1` | 不灭之躯 | a crimson heart standing behind a thick iron shield |
| 3 行 2 列 | `ks-iron-2` | 狂战 | two crossed iron axes over a cracked crimson heart |
| 3 行 3 列 | `ks-spirit-1` | 统御 | a teal crown floating above three small teal spirit wisps |

提示词：

```text
Use case: stylized-concept. Asset type: production game UI icon atlas. Draw exactly a 3 by 3 regular grid on one square canvas with 9 separate dark-fantasy keystone talent icons. Transparent background with real alpha. No visible grid lines, no dividers, no tiles, no frames, no lettering, no labels, no numbers, no watermark. Every cell occupies exactly one third of canvas width and height; centers at 1/6, 3/6 and 5/6 of canvas. Each icon stays fully inside its own cell and fills about 64% of cell width or height, leaving generous transparent gutters. Never move an icon into another cell and never merge cells. Preserve the full square canvas even when some cells are empty.
Style: very simple hand-painted game emblems, bold clear silhouettes, only two or three large forms per icon, broad flat color facets, subtle bevel on one edge. Readable at 32 pixels. Reduce detail strongly: no tiny decorations, no complex scene, no characters, no lighting effects, no particles, no outer glow, no backdrop or cast shadows. Use warm gold accents with orange for fire, ice blue for frost, gold for lightning, jade for poison, crimson for life, teal for summons, blue silver for shields and violet for void. Consistent visual weight and edge treatment across the nine icons. Each motif below is a separate icon; do not draw these descriptions as text.
Row 1, column 1: a jade green poison flask with three stacked drops rising above it.
Row 1, column 2: a violet void spiral swallowing a jagged jade crack.
Row 1, column 3: a wide orange wildfire spreading over three small flames in a row.
Row 2, column 1: a crimson blood drop burning with a tall orange flame on top.
Row 2, column 2: a frozen heart-shaped crystal of ice blue locked inside a thick frost ring.
Row 2, column 3: an ice blue crystal shattering into three sharp shards.
Row 3, column 1: a crimson heart standing behind a thick iron shield.
Row 3, column 2: two crossed iron axes over a cracked crimson heart.
Row 3, column 3: a teal crown floating above three small teal spirit wisps.
```

## ks-02.png

| 位置 | 编号 | 天赋 | 画面 |
| --- | --- | --- | --- |
| 1 行 1 列 | `ks-spirit-2` | 血契 | a teal spirit wisp chained to a crimson blood drop |
| 1 行 2 列 | `ks-storm-1` | 过载 | a golden lightning bolt bursting out of a cracked crimson blood drop |
| 1 行 3 列 | `ks-storm-2` | 雷暴连锁 | a golden lightning bolt zigzagging through three linked rings |

提示词：

```text
Use case: stylized-concept. Asset type: production game UI icon atlas. Draw exactly a 3 by 3 regular grid on one square canvas with 9 separate dark-fantasy keystone talent icons. Transparent background with real alpha. No visible grid lines, no dividers, no tiles, no frames, no lettering, no labels, no numbers, no watermark. Every cell occupies exactly one third of canvas width and height; centers at 1/6, 3/6 and 5/6 of canvas. Each icon stays fully inside its own cell and fills about 64% of cell width or height, leaving generous transparent gutters. Never move an icon into another cell and never merge cells. Preserve the full square canvas even when some cells are empty.
Style: very simple hand-painted game emblems, bold clear silhouettes, only two or three large forms per icon, broad flat color facets, subtle bevel on one edge. Readable at 32 pixels. Reduce detail strongly: no tiny decorations, no complex scene, no characters, no lighting effects, no particles, no outer glow, no backdrop or cast shadows. Use warm gold accents with orange for fire, ice blue for frost, gold for lightning, jade for poison, crimson for life, teal for summons, blue silver for shields and violet for void. Consistent visual weight and edge treatment across the nine icons. Each motif below is a separate icon; do not draw these descriptions as text.
Row 1, column 1: a teal spirit wisp chained to a crimson blood drop.
Row 1, column 2: a golden lightning bolt bursting out of a cracked crimson blood drop.
Row 1, column 3: a golden lightning bolt zigzagging through three linked rings.
Row 2, column 1: leave this cell completely empty and transparent.
Row 2, column 2: leave this cell completely empty and transparent.
Row 2, column 3: leave this cell completely empty and transparent.
Row 3, column 1: leave this cell completely empty and transparent.
Row 3, column 2: leave this cell completely empty and transparent.
Row 3, column 3: leave this cell completely empty and transparent.
```

## nt-01.png

| 位置 | 编号 | 天赋 | 画面 |
| --- | --- | --- | --- |
| 1 行 1 列 | `nt-aegis-1` | 灵能护盾 | a round blue silver energy shield |
| 1 行 2 列 | `nt-aegis-2` | 护盾充能 | a blue silver shield with an upward curved arrow |
| 1 行 3 列 | `nt-barrage-1` | 弹幕 | three golden arrows spread in a fan |
| 2 行 1 列 | `nt-barrage-2` | 穿心 | one golden arrow piercing through two thin discs |
| 2 行 2 列 | `nt-blight-1` | 腐毒 | a jade green drop dripping from a dagger tip |
| 2 行 3 列 | `nt-blight-2` | 瘴气 | a jade green toxic cloud with two round bubbles |
| 3 行 1 列 | `nt-blight-3` | 侵蚀 | a violet crack eating into a round stone disc |
| 3 行 2 列 | `nt-blight-4` | 百毒不侵 | a jade green shield turning away a falling poison drop |
| 3 行 3 列 | `nt-blight-5` | 致命剂量 | a narrow-necked jade green vial with one drop at its lip |

提示词：

```text
Use case: stylized-concept. Asset type: production game UI icon atlas. Draw exactly a 3 by 3 regular grid on one square canvas with 9 separate dark-fantasy notable talent icons. Transparent background with real alpha. No visible grid lines, no dividers, no tiles, no frames, no lettering, no labels, no numbers, no watermark. Every cell occupies exactly one third of canvas width and height; centers at 1/6, 3/6 and 5/6 of canvas. Each icon stays fully inside its own cell and fills about 64% of cell width or height, leaving generous transparent gutters. Never move an icon into another cell and never merge cells. Preserve the full square canvas even when some cells are empty.
Style: very simple hand-painted game emblems, bold clear silhouettes, only two or three large forms per icon, broad flat color facets, subtle bevel on one edge. Readable at 32 pixels. Reduce detail strongly: no tiny decorations, no complex scene, no characters, no lighting effects, no particles, no outer glow, no backdrop or cast shadows. Use warm gold accents with orange for fire, ice blue for frost, gold for lightning, jade for poison, crimson for life, teal for summons, blue silver for shields and violet for void. Consistent visual weight and edge treatment across the nine icons. Each motif below is a separate icon; do not draw these descriptions as text.
Row 1, column 1: a round blue silver energy shield.
Row 1, column 2: a blue silver shield with an upward curved arrow.
Row 1, column 3: three golden arrows spread in a fan.
Row 2, column 1: one golden arrow piercing through two thin discs.
Row 2, column 2: a jade green drop dripping from a dagger tip.
Row 2, column 3: a jade green toxic cloud with two round bubbles.
Row 3, column 1: a violet crack eating into a round stone disc.
Row 3, column 2: a jade green shield turning away a falling poison drop.
Row 3, column 3: a narrow-necked jade green vial with one drop at its lip.
```

## nt-02.png

| 位置 | 编号 | 天赋 | 画面 |
| --- | --- | --- | --- |
| 1 行 1 列 | `nt-core-1` | 体魄 | a crimson heart with a golden band across it |
| 1 行 2 列 | `nt-core-2` | 心智 | a blue mana crystal resting on a blue silver shield |
| 1 行 3 列 | `nt-domain-1` | 法域 | a large golden rune circle |
| 2 行 1 列 | `nt-domain-2` | 余波 | three concentric golden ripples spreading outward |
| 2 行 2 列 | `nt-elements-1` | 元素调和 | three small orbs, orange, ice blue and gold, in a triangle |
| 2 行 3 列 | `nt-elements-2` | 元素穿透 | a spear tip passing through a three-coloured orb |
| 3 行 1 列 | `nt-flame-1` | 烈焰 | one tall broad orange flame |
| 3 行 2 列 | `nt-flame-2` | 余烬 | three glowing orange embers resting on a dark coal |
| 3 行 3 列 | `nt-flame-3` | 火葬 | an orange flame bursting out of a cracked urn |

提示词：

```text
Use case: stylized-concept. Asset type: production game UI icon atlas. Draw exactly a 3 by 3 regular grid on one square canvas with 9 separate dark-fantasy notable talent icons. Transparent background with real alpha. No visible grid lines, no dividers, no tiles, no frames, no lettering, no labels, no numbers, no watermark. Every cell occupies exactly one third of canvas width and height; centers at 1/6, 3/6 and 5/6 of canvas. Each icon stays fully inside its own cell and fills about 64% of cell width or height, leaving generous transparent gutters. Never move an icon into another cell and never merge cells. Preserve the full square canvas even when some cells are empty.
Style: very simple hand-painted game emblems, bold clear silhouettes, only two or three large forms per icon, broad flat color facets, subtle bevel on one edge. Readable at 32 pixels. Reduce detail strongly: no tiny decorations, no complex scene, no characters, no lighting effects, no particles, no outer glow, no backdrop or cast shadows. Use warm gold accents with orange for fire, ice blue for frost, gold for lightning, jade for poison, crimson for life, teal for summons, blue silver for shields and violet for void. Consistent visual weight and edge treatment across the nine icons. Each motif below is a separate icon; do not draw these descriptions as text.
Row 1, column 1: a crimson heart with a golden band across it.
Row 1, column 2: a blue mana crystal resting on a blue silver shield.
Row 1, column 3: a large golden rune circle.
Row 2, column 1: three concentric golden ripples spreading outward.
Row 2, column 2: three small orbs, orange, ice blue and gold, in a triangle.
Row 2, column 3: a spear tip passing through a three-coloured orb.
Row 3, column 1: one tall broad orange flame.
Row 3, column 2: three glowing orange embers resting on a dark coal.
Row 3, column 3: an orange flame bursting out of a cracked urn.
```

## nt-03.png

| 位置 | 编号 | 天赋 | 画面 |
| --- | --- | --- | --- |
| 1 行 1 列 | `nt-flame-4` | 熔心 | a molten orange core inside a crimson heart |
| 1 行 2 列 | `nt-flame-5` | 焚身 | an orange flame wrapped around a short sword blade |
| 1 行 3 列 | `nt-frost-1` | 霜寒刺骨 | an ice blue spike piercing a snowflake |
| 2 行 1 列 | `nt-frost-2` | 冰封千里 | a broad ice block with a frozen spiral inside |
| 2 行 2 列 | `nt-frost-3` | 寒潮 | an ice blue wave curling over itself |
| 2 行 3 列 | `nt-frost-4` | 凛冬护甲 | a blue silver shield coated with ice blue frost |
| 3 行 1 列 | `nt-frost-5` | 冰川之触 | an ice blue gauntlet palm with frost crystals on the fingertips |
| 3 行 2 列 | `nt-iron-1` | 巨力 | a heavy iron war hammer |
| 3 行 3 列 | `nt-iron-2` | 铁壁 | a tall iron tower shield |

提示词：

```text
Use case: stylized-concept. Asset type: production game UI icon atlas. Draw exactly a 3 by 3 regular grid on one square canvas with 9 separate dark-fantasy notable talent icons. Transparent background with real alpha. No visible grid lines, no dividers, no tiles, no frames, no lettering, no labels, no numbers, no watermark. Every cell occupies exactly one third of canvas width and height; centers at 1/6, 3/6 and 5/6 of canvas. Each icon stays fully inside its own cell and fills about 64% of cell width or height, leaving generous transparent gutters. Never move an icon into another cell and never merge cells. Preserve the full square canvas even when some cells are empty.
Style: very simple hand-painted game emblems, bold clear silhouettes, only two or three large forms per icon, broad flat color facets, subtle bevel on one edge. Readable at 32 pixels. Reduce detail strongly: no tiny decorations, no complex scene, no characters, no lighting effects, no particles, no outer glow, no backdrop or cast shadows. Use warm gold accents with orange for fire, ice blue for frost, gold for lightning, jade for poison, crimson for life, teal for summons, blue silver for shields and violet for void. Consistent visual weight and edge treatment across the nine icons. Each motif below is a separate icon; do not draw these descriptions as text.
Row 1, column 1: a molten orange core inside a crimson heart.
Row 1, column 2: an orange flame wrapped around a short sword blade.
Row 1, column 3: an ice blue spike piercing a snowflake.
Row 2, column 1: a broad ice block with a frozen spiral inside.
Row 2, column 2: an ice blue wave curling over itself.
Row 2, column 3: a blue silver shield coated with ice blue frost.
Row 3, column 1: an ice blue gauntlet palm with frost crystals on the fingertips.
Row 3, column 2: a heavy iron war hammer.
Row 3, column 3: a tall iron tower shield.
```

## nt-04.png

| 位置 | 编号 | 天赋 | 画面 |
| --- | --- | --- | --- |
| 1 行 1 列 | `nt-iron-3` | 鲜血之誓 | a crimson blood drop sealed inside a golden ring |
| 1 行 2 列 | `nt-iron-4` | 坚韧 | a crimson heart bound with two iron bands |
| 1 行 3 列 | `nt-iron-5` | 战吼 | an iron war horn blowing two crimson sound waves |
| 2 行 1 列 | `nt-shadow-1` | 迅影 | a silver winged boot |
| 2 行 2 列 | `nt-shadow-2` | 幻步 | two overlapping faded silver footprints |
| 2 行 3 列 | `nt-spirit-1` | 军团 | three teal spectral swords arranged in a fan |
| 3 行 1 列 | `nt-spirit-2` | 爆裂仆从 | a teal spirit wisp bursting into an orange explosion |
| 3 行 2 列 | `nt-spirit-3` | 不朽仆从 | a teal spirit wisp inside a blue silver ring |
| 3 行 3 列 | `nt-spirit-4` | 群体指挥 | a teal banner on a tall staff |

提示词：

```text
Use case: stylized-concept. Asset type: production game UI icon atlas. Draw exactly a 3 by 3 regular grid on one square canvas with 9 separate dark-fantasy notable talent icons. Transparent background with real alpha. No visible grid lines, no dividers, no tiles, no frames, no lettering, no labels, no numbers, no watermark. Every cell occupies exactly one third of canvas width and height; centers at 1/6, 3/6 and 5/6 of canvas. Each icon stays fully inside its own cell and fills about 64% of cell width or height, leaving generous transparent gutters. Never move an icon into another cell and never merge cells. Preserve the full square canvas even when some cells are empty.
Style: very simple hand-painted game emblems, bold clear silhouettes, only two or three large forms per icon, broad flat color facets, subtle bevel on one edge. Readable at 32 pixels. Reduce detail strongly: no tiny decorations, no complex scene, no characters, no lighting effects, no particles, no outer glow, no backdrop or cast shadows. Use warm gold accents with orange for fire, ice blue for frost, gold for lightning, jade for poison, crimson for life, teal for summons, blue silver for shields and violet for void. Consistent visual weight and edge treatment across the nine icons. Each motif below is a separate icon; do not draw these descriptions as text.
Row 1, column 1: a crimson blood drop sealed inside a golden ring.
Row 1, column 2: a crimson heart bound with two iron bands.
Row 1, column 3: an iron war horn blowing two crimson sound waves.
Row 2, column 1: a silver winged boot.
Row 2, column 2: two overlapping faded silver footprints.
Row 2, column 3: three teal spectral swords arranged in a fan.
Row 3, column 1: a teal spirit wisp bursting into an orange explosion.
Row 3, column 2: a teal spirit wisp inside a blue silver ring.
Row 3, column 3: a teal banner on a tall staff.
```

## nt-05.png

| 位置 | 编号 | 天赋 | 画面 |
| --- | --- | --- | --- |
| 1 行 1 列 | `nt-spirit-5` | 灵魂纽带 | two teal wisps linked by a thin chain |
| 1 行 2 列 | `nt-storm-1` | 雷霆万钧 | a heavy golden lightning bolt striking straight down |
| 1 行 3 列 | `nt-storm-2` | 电弧 | a golden arc of lightning jumping between two small orbs |
| 2 行 1 列 | `nt-storm-3` | 疾雷 | a golden lightning bolt shaped like a swept wing |
| 2 行 2 列 | `nt-storm-4` | 静电屏障 | a blue silver shield crackling with one golden spark |
| 2 行 3 列 | `nt-storm-5` | 风暴之眼 | a golden storm spiral with a bright eye in the centre |
| 3 行 1 列 | `nt-thirst-1` | 嗜血 | a crimson fang dripping one blood drop |
| 3 行 2 列 | `nt-thirst-2` | 生生不息 | a green sprout growing out of a crimson heart |

提示词：

```text
Use case: stylized-concept. Asset type: production game UI icon atlas. Draw exactly a 3 by 3 regular grid on one square canvas with 9 separate dark-fantasy notable talent icons. Transparent background with real alpha. No visible grid lines, no dividers, no tiles, no frames, no lettering, no labels, no numbers, no watermark. Every cell occupies exactly one third of canvas width and height; centers at 1/6, 3/6 and 5/6 of canvas. Each icon stays fully inside its own cell and fills about 64% of cell width or height, leaving generous transparent gutters. Never move an icon into another cell and never merge cells. Preserve the full square canvas even when some cells are empty.
Style: very simple hand-painted game emblems, bold clear silhouettes, only two or three large forms per icon, broad flat color facets, subtle bevel on one edge. Readable at 32 pixels. Reduce detail strongly: no tiny decorations, no complex scene, no characters, no lighting effects, no particles, no outer glow, no backdrop or cast shadows. Use warm gold accents with orange for fire, ice blue for frost, gold for lightning, jade for poison, crimson for life, teal for summons, blue silver for shields and violet for void. Consistent visual weight and edge treatment across the nine icons. Each motif below is a separate icon; do not draw these descriptions as text.
Row 1, column 1: two teal wisps linked by a thin chain.
Row 1, column 2: a heavy golden lightning bolt striking straight down.
Row 1, column 3: a golden arc of lightning jumping between two small orbs.
Row 2, column 1: a golden lightning bolt shaped like a swept wing.
Row 2, column 2: a blue silver shield crackling with one golden spark.
Row 2, column 3: a golden storm spiral with a bright eye in the centre.
Row 3, column 1: a crimson fang dripping one blood drop.
Row 3, column 2: a green sprout growing out of a crimson heart.
Row 3, column 3: leave this cell completely empty and transparent.
```

## sm-01.png

| 位置 | 编号 | 天赋 | 画面 |
| --- | --- | --- | --- |
| 1 行 1 列 | `sm-冰缓持续` | 冰缓持续 | an ice blue hourglass |
| 1 行 2 列 | `sm-冰缓效果` | 冰缓效果 | an ice blue snowflake above a downward chevron |
| 1 行 3 列 | `sm-冰霜抗性` | 冰霜抗性 | a small shield with an ice blue snowflake |
| 2 行 1 列 | `sm-冰霜伤害` | 冰霜伤害 | a single ice blue shard |
| 2 行 2 列 | `sm-穿透概率` | 穿透概率 | a golden arrow through a thin disc |
| 2 行 3 列 | `sm-次级范围伤害` | 次级范围伤害 | two overlapping golden rings |
| 3 行 1 列 | `sm-点燃概率` | 点燃概率 | one orange spark |
| 3 行 2 列 | `sm-点燃伤害` | 点燃伤害 | an orange flame with a bright hot core |
| 3 行 3 列 | `sm-冻结积累` | 冻结积累 | an ice cube half filled with blue frost |

提示词：

```text
Use case: stylized-concept. Asset type: production game UI icon atlas. Draw exactly a 3 by 3 regular grid on one square canvas with 9 separate dark-fantasy minor passive talent icons. Transparent background with real alpha. No visible grid lines, no dividers, no tiles, no frames, no lettering, no labels, no numbers, no watermark. Every cell occupies exactly one third of canvas width and height; centers at 1/6, 3/6 and 5/6 of canvas. Each icon stays fully inside its own cell and fills about 64% of cell width or height, leaving generous transparent gutters. Never move an icon into another cell and never merge cells. Preserve the full square canvas even when some cells are empty.
Style: very simple hand-painted game emblems, bold clear silhouettes, only two or three large forms per icon, broad flat color facets, subtle bevel on one edge. Readable at 32 pixels. Reduce detail strongly: no tiny decorations, no complex scene, no characters, no lighting effects, no particles, no outer glow, no backdrop or cast shadows. Use warm gold accents with orange for fire, ice blue for frost, gold for lightning, jade for poison, crimson for life, teal for summons, blue silver for shields and violet for void. Consistent visual weight and edge treatment across the nine icons. Each motif below is a separate icon; do not draw these descriptions as text.
Row 1, column 1: an ice blue hourglass.
Row 1, column 2: an ice blue snowflake above a downward chevron.
Row 1, column 3: a small shield with an ice blue snowflake.
Row 2, column 1: a single ice blue shard.
Row 2, column 2: a golden arrow through a thin disc.
Row 2, column 3: two overlapping golden rings.
Row 3, column 1: one orange spark.
Row 3, column 2: an orange flame with a bright hot core.
Row 3, column 3: an ice cube half filled with blue frost.
```

## sm-02.png

| 位置 | 编号 | 天赋 | 画面 |
| --- | --- | --- | --- |
| 1 行 1 列 | `sm-毒素抗性` | 毒素抗性 | a small shield with a jade drop |
| 1 行 2 列 | `sm-对燃烧敌人` | 对燃烧敌人 | an orange flame over a simple target ring |
| 1 行 3 列 | `sm-范围面积` | 范围面积 | a widening golden ring |
| 2 行 1 列 | `sm-范围伤害` | 范围伤害 | a golden circular burst |
| 2 行 2 列 | `sm-感电概率` | 感电概率 | one golden spark |
| 2 行 3 列 | `sm-感电效果` | 感电效果 | a golden bolt inside a ring |
| 3 行 1 列 | `sm-格挡率` | 格挡率 | a round iron buckler |
| 3 行 2 列 | `sm-护盾回充` | 护盾回充 | a blue silver shield with a circular arrow |
| 3 行 3 列 | `sm-护盾上限` | 护盾上限 | a blue silver shield |

提示词：

```text
Use case: stylized-concept. Asset type: production game UI icon atlas. Draw exactly a 3 by 3 regular grid on one square canvas with 9 separate dark-fantasy minor passive talent icons. Transparent background with real alpha. No visible grid lines, no dividers, no tiles, no frames, no lettering, no labels, no numbers, no watermark. Every cell occupies exactly one third of canvas width and height; centers at 1/6, 3/6 and 5/6 of canvas. Each icon stays fully inside its own cell and fills about 64% of cell width or height, leaving generous transparent gutters. Never move an icon into another cell and never merge cells. Preserve the full square canvas even when some cells are empty.
Style: very simple hand-painted game emblems, bold clear silhouettes, only two or three large forms per icon, broad flat color facets, subtle bevel on one edge. Readable at 32 pixels. Reduce detail strongly: no tiny decorations, no complex scene, no characters, no lighting effects, no particles, no outer glow, no backdrop or cast shadows. Use warm gold accents with orange for fire, ice blue for frost, gold for lightning, jade for poison, crimson for life, teal for summons, blue silver for shields and violet for void. Consistent visual weight and edge treatment across the nine icons. Each motif below is a separate icon; do not draw these descriptions as text.
Row 1, column 1: a small shield with a jade drop.
Row 1, column 2: an orange flame over a simple target ring.
Row 1, column 3: a widening golden ring.
Row 2, column 1: a golden circular burst.
Row 2, column 2: one golden spark.
Row 2, column 3: a golden bolt inside a ring.
Row 3, column 1: a round iron buckler.
Row 3, column 2: a blue silver shield with a circular arrow.
Row 3, column 3: a blue silver shield.
```

## sm-03.png

| 位置 | 编号 | 天赋 | 画面 |
| --- | --- | --- | --- |
| 1 行 1 列 | `sm-护甲` | 护甲 | an iron breastplate |
| 1 行 2 列 | `sm-火焰抗性` | 火焰抗性 | a small shield with an orange flame |
| 1 行 3 列 | `sm-火焰伤害` | 火焰伤害 | a single orange flame |
| 2 行 1 列 | `sm-击杀回血` | 击杀回血 | a crimson drop above a broken blade |
| 2 行 2 列 | `sm-基础护盾` | 基础护盾 | a blue silver hexagonal plate |
| 2 行 3 列 | `sm-基础气血` | 基础气血 | a small crimson heart |
| 3 行 1 列 | `sm-基础闪避` | 基础闪避 | a silver cloak swirl |
| 3 行 2 列 | `sm-命中回血` | 命中回血 | a crimson drop on a sword tip |
| 3 行 3 列 | `sm-魔力上限` | 魔力上限 | a blue mana crystal |

提示词：

```text
Use case: stylized-concept. Asset type: production game UI icon atlas. Draw exactly a 3 by 3 regular grid on one square canvas with 9 separate dark-fantasy minor passive talent icons. Transparent background with real alpha. No visible grid lines, no dividers, no tiles, no frames, no lettering, no labels, no numbers, no watermark. Every cell occupies exactly one third of canvas width and height; centers at 1/6, 3/6 and 5/6 of canvas. Each icon stays fully inside its own cell and fills about 64% of cell width or height, leaving generous transparent gutters. Never move an icon into another cell and never merge cells. Preserve the full square canvas even when some cells are empty.
Style: very simple hand-painted game emblems, bold clear silhouettes, only two or three large forms per icon, broad flat color facets, subtle bevel on one edge. Readable at 32 pixels. Reduce detail strongly: no tiny decorations, no complex scene, no characters, no lighting effects, no particles, no outer glow, no backdrop or cast shadows. Use warm gold accents with orange for fire, ice blue for frost, gold for lightning, jade for poison, crimson for life, teal for summons, blue silver for shields and violet for void. Consistent visual weight and edge treatment across the nine icons. Each motif below is a separate icon; do not draw these descriptions as text.
Row 1, column 1: an iron breastplate.
Row 1, column 2: a small shield with an orange flame.
Row 1, column 3: a single orange flame.
Row 2, column 1: a crimson drop above a broken blade.
Row 2, column 2: a blue silver hexagonal plate.
Row 2, column 3: a small crimson heart.
Row 3, column 1: a silver cloak swirl.
Row 3, column 2: a crimson drop on a sword tip.
Row 3, column 3: a blue mana crystal.
```

## sm-04.png

| 位置 | 编号 | 天赋 | 画面 |
| --- | --- | --- | --- |
| 1 行 1 列 | `sm-气血上限` | 气血上限 | a large crimson heart |
| 1 行 2 列 | `sm-气血再生` | 气血再生 | a crimson drop with a small green leaf |
| 1 行 3 列 | `sm-侵蚀概率` | 侵蚀概率 | a short violet crack |
| 2 行 1 列 | `sm-闪避回血` | 闪避回血 | a silver feather with a crimson drop |
| 2 行 2 列 | `sm-闪避值` | 闪避值 | a silver feather |
| 2 行 3 列 | `sm-闪电抗性` | 闪电抗性 | a small shield with a golden bolt |
| 3 行 1 列 | `sm-闪电伤害` | 闪电伤害 | a single golden lightning bolt |
| 3 行 2 列 | `sm-闪电施法速度` | 闪电施法速度 | a golden bolt with two motion streaks |
| 3 行 3 列 | `sm-投射物伤害` | 投射物伤害 | a single golden arrowhead |

提示词：

```text
Use case: stylized-concept. Asset type: production game UI icon atlas. Draw exactly a 3 by 3 regular grid on one square canvas with 9 separate dark-fantasy minor passive talent icons. Transparent background with real alpha. No visible grid lines, no dividers, no tiles, no frames, no lettering, no labels, no numbers, no watermark. Every cell occupies exactly one third of canvas width and height; centers at 1/6, 3/6 and 5/6 of canvas. Each icon stays fully inside its own cell and fills about 64% of cell width or height, leaving generous transparent gutters. Never move an icon into another cell and never merge cells. Preserve the full square canvas even when some cells are empty.
Style: very simple hand-painted game emblems, bold clear silhouettes, only two or three large forms per icon, broad flat color facets, subtle bevel on one edge. Readable at 32 pixels. Reduce detail strongly: no tiny decorations, no complex scene, no characters, no lighting effects, no particles, no outer glow, no backdrop or cast shadows. Use warm gold accents with orange for fire, ice blue for frost, gold for lightning, jade for poison, crimson for life, teal for summons, blue silver for shields and violet for void. Consistent visual weight and edge treatment across the nine icons. Each motif below is a separate icon; do not draw these descriptions as text.
Row 1, column 1: a large crimson heart.
Row 1, column 2: a crimson drop with a small green leaf.
Row 1, column 3: a short violet crack.
Row 2, column 1: a silver feather with a crimson drop.
Row 2, column 2: a silver feather.
Row 2, column 3: a small shield with a golden bolt.
Row 3, column 1: a single golden lightning bolt.
Row 3, column 2: a golden bolt with two motion streaks.
Row 3, column 3: a single golden arrowhead.
```

## sm-05.png

| 位置 | 编号 | 天赋 | 画面 |
| --- | --- | --- | --- |
| 1 行 1 列 | `sm-投射物速度` | 投射物速度 | a golden arrow with speed streaks |
| 1 行 2 列 | `sm-物理伤害` | 物理伤害 | a short iron sword |
| 1 行 3 列 | `sm-虚空伤害` | 虚空伤害 | a small violet orb |
| 2 行 1 列 | `sm-元素伤害` | 元素伤害 | a small three-coloured orb |
| 2 行 2 列 | `sm-召唤物攻速` | 召唤物攻速 | a teal wisp with two motion streaks |
| 2 行 3 列 | `sm-召唤物抗性` | 召唤物抗性 | a small shield with a teal wisp |
| 3 行 1 列 | `sm-召唤物气血` | 召唤物气血 | a teal wisp with a crimson core |
| 3 行 2 列 | `sm-召唤物伤害` | 召唤物伤害 | a single teal spectral sword |
| 3 行 3 列 | `sm-召唤物施法速度` | 召唤物施法速度 | a teal wisp inside a small rune ring |

提示词：

```text
Use case: stylized-concept. Asset type: production game UI icon atlas. Draw exactly a 3 by 3 regular grid on one square canvas with 9 separate dark-fantasy minor passive talent icons. Transparent background with real alpha. No visible grid lines, no dividers, no tiles, no frames, no lettering, no labels, no numbers, no watermark. Every cell occupies exactly one third of canvas width and height; centers at 1/6, 3/6 and 5/6 of canvas. Each icon stays fully inside its own cell and fills about 64% of cell width or height, leaving generous transparent gutters. Never move an icon into another cell and never merge cells. Preserve the full square canvas even when some cells are empty.
Style: very simple hand-painted game emblems, bold clear silhouettes, only two or three large forms per icon, broad flat color facets, subtle bevel on one edge. Readable at 32 pixels. Reduce detail strongly: no tiny decorations, no complex scene, no characters, no lighting effects, no particles, no outer glow, no backdrop or cast shadows. Use warm gold accents with orange for fire, ice blue for frost, gold for lightning, jade for poison, crimson for life, teal for summons, blue silver for shields and violet for void. Consistent visual weight and edge treatment across the nine icons. Each motif below is a separate icon; do not draw these descriptions as text.
Row 1, column 1: a golden arrow with speed streaks.
Row 1, column 2: a short iron sword.
Row 1, column 3: a small violet orb.
Row 2, column 1: a small three-coloured orb.
Row 2, column 2: a teal wisp with two motion streaks.
Row 2, column 3: a small shield with a teal wisp.
Row 3, column 1: a teal wisp with a crimson core.
Row 3, column 2: a single teal spectral sword.
Row 3, column 3: a teal wisp inside a small rune ring.
```

## sm-06.png

| 位置 | 编号 | 天赋 | 画面 |
| --- | --- | --- | --- |
| 1 行 1 列 | `sm-中毒概率` | 中毒概率 | one jade green bubble |
| 1 行 2 列 | `sm-中毒伤害` | 中毒伤害 | a single jade green drop |

提示词：

```text
Use case: stylized-concept. Asset type: production game UI icon atlas. Draw exactly a 3 by 3 regular grid on one square canvas with 9 separate dark-fantasy minor passive talent icons. Transparent background with real alpha. No visible grid lines, no dividers, no tiles, no frames, no lettering, no labels, no numbers, no watermark. Every cell occupies exactly one third of canvas width and height; centers at 1/6, 3/6 and 5/6 of canvas. Each icon stays fully inside its own cell and fills about 64% of cell width or height, leaving generous transparent gutters. Never move an icon into another cell and never merge cells. Preserve the full square canvas even when some cells are empty.
Style: very simple hand-painted game emblems, bold clear silhouettes, only two or three large forms per icon, broad flat color facets, subtle bevel on one edge. Readable at 32 pixels. Reduce detail strongly: no tiny decorations, no complex scene, no characters, no lighting effects, no particles, no outer glow, no backdrop or cast shadows. Use warm gold accents with orange for fire, ice blue for frost, gold for lightning, jade for poison, crimson for life, teal for summons, blue silver for shields and violet for void. Consistent visual weight and edge treatment across the nine icons. Each motif below is a separate icon; do not draw these descriptions as text.
Row 1, column 1: one jade green bubble.
Row 1, column 2: a single jade green drop.
Row 1, column 3: leave this cell completely empty and transparent.
Row 2, column 1: leave this cell completely empty and transparent.
Row 2, column 2: leave this cell completely empty and transparent.
Row 2, column 3: leave this cell completely empty and transparent.
Row 3, column 1: leave this cell completely empty and transparent.
Row 3, column 2: leave this cell completely empty and transparent.
Row 3, column 3: leave this cell completely empty and transparent.
```

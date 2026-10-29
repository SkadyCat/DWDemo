# 道具与技能图标

使用内置 imagegen 生成原创魔兽风手绘图标：减少细节，粗轮廓、大色块、深色背景，无文字或品质边框。完整提示词见 [game-icons-prompts.md](game-icons-prompts.md)。

本批 63 个独立图标：16 种道具、33 件可用装备、11 个技能（7 个玩家技能及 4 个怪物技能），另有装备、道具、技能各 1 个备用图标。地图、谱系等内部固定装备不作为可拾取道具绘制。

资源目录：`public/assets/icons/warcraft-v1/`。

2026-10-26 补齐批次：新增 32 张原创图（27 个原先借图的技能、中品/上品灵石、无效/祈愿结晶、地图底图）。追加 4 张 768×768 九宫格，末张未使用的 4 格留空并在清单标记，不计作图标。48 种地图共用专用地图底图，T 阶与品质由 UI 标注。既有嘲讽画作只将交付尺寸从 128 统一为 256；其他已有专属图保留。完整原画路径、逐张提示词和 SHA256 保存在 [本批历史记录](game-icons-completion-20261026.json)。

本批同时接入 Opus Studio（5291）、Beta Studio（5290）和 UE 的 `Content/OpusIcons`。跨 Studio 同步使用 `Tools/Icons/Sync-Completion-ToStudio.mjs`，按 ID 合并目录，保留目标工程已有图标及历史；中、上品灵石使用原画颜色，不再叠加旧版色相滤镜。Web 发布仍走 `npm run build:web`，已打开的旧页面刷新后读取新资源。

- `item/`、`equipment/`、`skill/`、`fallback/`：独立的 256 × 256 PNG。
- `sheets/a.png` 至 `sheets/g.png`：严格等格的 3 × 3 图集，每张 768 × 768，每格 256 × 256。
- `source/a.png` 至 `source/g.png`：原始生成图，保留无损源文件。
- `manifest.json`：名称、类型、ID、独立文件路径、图集和格子位置。

`public/icon-catalog.mjs` 是图集与名称映射的唯一维护入口。`public/game-icons.mjs` 是无状态的图片查找函数；生成装备按 `baseId` 读取底材图标，旧自定义武器可按绑定技能查找，其他旧实例按装备部位使用现有图片。查找不修改规则、装备实例、品质、属性或玩家存档。

已接入背包、技能快捷栏、技能装配选择、消耗品栏、内容编辑器、商店、流浪商人、物品详情和洗炼台。图片不包含名称、数量或 T 阶，这些文字仍由原 UI 显示，品质沿用现有边框。

打开 `/icons.html` 查看完整九宫格预览，包含 32px 实际尺寸样例；点击任意图标可查看独立 PNG。

验证：`npm run test:icons` 检查当前所有道具、装备和技能的覆盖情况、图片尺寸、图集规格、清单一致性以及生成实例的图片查找。

重新切分时，先由 Node 导出 `icon-catalog.mjs` 中的 `ICON_SHEETS`、`ICON_ENTRIES` 为 `{sheets, icons}` JSON，再运行：

```powershell
python scripts/pack-game-icons.py work/icon-catalog.json public/assets/icons/warcraft-v1/source public/assets/icons/warcraft-v1
```

切分脚本只按已记录的边界裁切和排版，不重新绘制、变形或修改图标内容。

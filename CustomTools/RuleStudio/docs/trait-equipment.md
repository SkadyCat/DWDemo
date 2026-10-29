# Studio 特质装备

3D 战斗右侧功能栏的「特质装备」入口打开 UICreator 列表。点击装备卡片会关闭列表，在角色附近生成真实地面掉落；点击掉落拾取后，可在背包装配。打开列表时暂停战斗，关闭后恢复原有暂停状态。手动生成的装备不会被 Hunter 过滤隐藏。

首个配方为 **T1 魔法·霜爆法杖**：沿用霜棘法杖底材，绑定冰锥术，固定一条「消耗冰缓·冰霜爆破」。数值来自现有 T1 词缀表与规则，没有创建另一套战斗逻辑。冰霜命中仍按原有规则施加冰缓，因此消耗后也可能重新出现冰缓。

- 配方数据：`public/data/trait-equipment.json`。新增条目必须引用已有底材、绑定技能和词缀。
- 实例及掉落：`public/trait-equipment.mjs`。每次点击分配独立 UID，不修改底材模板，不推进战斗、击杀掉落或商人随机流；通过 FloorRewards 原有拾取事务入包。
- UI 源工程：UICreator 项目 `studio-trait-equipment`，可编辑快照在 `../UICreatorAlpha/Screen/StudioTraitEquipment/trait-equipment.uialpha.json`。
- 列表项预制体：UICreator 的 `trait-equipment-row`。Studio 只克隆预制体并绑定文本、点击行为。
- 同步界面：在 UICreatorAlpha 目录运行 `node scripts/publish-trait-equipment.mjs`。默认服务端口 5190，可用 `UICREATOR_URL` 指定。使用版本校验保存，再重新读取后导出 Studio 文档；已有版本会备份到项目 Saved。
- 验证：在 RuleStudio 目录运行 `node --test tests/trait-equipment.test.mjs`。

本次仅用于 Studio 网页，未导出 UE 控件或修改 UE 装备数据。

# Studio3D 左侧任务追踪

入口：`/?view=battle&prototype=quests`，暂停战斗以便检查 UI。

- UICreator 项目：`opus-studio3d-quest-tracker`；来源：`scripts/author-quest-tracker.mjs`。
- 左侧半透明渐变底色、金色任务标记，保留场景可见性。
- 展开显示任务名称、目标、真实怪潮完成数、守卫状态及详情/领取入口。
- 收起后保留任务名称与状态，点击右侧箭头展开；偏好保存在当前浏览器。
- 任务完成时只更新追踪状态和提示，不自动弹出任务窗口；点击任务名称、详情按钮或按 J 查看任务与领取奖励。
- 任务完成和奖励生成仍由现有 `quests/model.mjs` 处理；本轮没有修改任务达成条件和掉落数值。

验证：`node --test tests/quest-tracker.test.mjs tests/map-events.test.mjs`：8 项通过。
完整任务回归另有 1 项既有断言失败：旧测试要求可用技能仅包含冰锥术，而当前配置还提供嘲讽；新手武器、已装配技能、任务进度和奖励检查通过。记录见 `Saved/Verification/Studio3DMapEvents/compact-and-quests-tests.log`。

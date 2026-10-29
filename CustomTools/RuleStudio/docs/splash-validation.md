# 溅射验证记录

2026-10-23。共享定义：`Content/Rules/Traits/splash.json`。没有修改 VM、基础技能、装备获取或伤害公式。

- `npm run test:splash`：8 项专项测试通过，包含六元素、主目标与邻居、友方与范围外、无投射命中、多重叠穿透、过量击杀、独立命中事件、参数覆盖、十阶与真实 3D 装备聚合。范围命中的反例确实造成主范围伤害后，核对没有溅射。
- `DWB.Rules.WebParity` 加 `node parity/compare.mjs`：18 个场景，新增的六个分别验证普通冰锥、多重与穿透、虚空飞弹、哨卫、参数覆盖、纯范围不触发。纯范围在敌人位置施放，虚空飞弹传入非零威力，避免空测。
- 全量 `npm test`：237 项中 235 项通过。余下两项为既有“飞返连焰”自动施法用例。用只在内存移除 `splash` 及其数值条目的原测试副本复跑，同样失败；基线日志为 `Saved/RuleTower/splash-baseline-tests.log`。没有修改该 BD 或放宽其断言。
- 原成长账本测试的隐式种子 18 在词条池新增后不再产生换装事件；改为显式种子 17，仍从实际击杀取得装备并经过真实换装、洗炼。所有持有权、费用、固定词条及成长账本断言保持不变。

另外尝试的毒瓶场景只产生了落地破裂，未实际触发溅射，未将它计入有效的溅射一致性场景。该额外检查暴露了已有抛物线计划哈希差异：JS `compiler.mjs` 的 `sourceText` 追加 `parabolic` 内容，C++ `TraitSourceKey` 未追加；伤害记录与世界状态哈希一致。此次未扩大修改到该缓存键问题，初次对照记录保留在 `Saved/RuleTower/splash-parity-compare-first.log`。

最终日志：`Saved/RuleTower/splash-web-tests-final.log`、`splash-native-parity-final.log`、`splash-parity-compare-final.log`。

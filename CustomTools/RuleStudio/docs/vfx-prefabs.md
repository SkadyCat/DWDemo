# 网站技能特效

独立预览：`http://127.0.0.1:5290/vfx.html`。网站侧栏「特效预览」打开同一页面。

29 个预制体、39 个预设：六元素爆炸与命中，冰锥、虚空飞弹、毒瓶，死亡落雷、连锁电弧，哨卫、灵仆，四种范围与三种近战，以及九种状态和三种持续地面。元素爆炸分别表现火焰喷涌、冰晶迸裂、放射电弧、尘土冲击、毒雾气泡和虚空收缩。

## 预制体接口

每个 `public/prefabs/*.mjs` 都是纯表现模块。新预制体不导入规则引擎、战斗、Vue、玩家存档或全局 Three.js；调用方注入 Three.js。现有毒瓶投射与碎裂工厂由纯表现注册表组合使用。

```js
import { createEffect } from './prefabs/element-explosion.mjs';
const fx = createEffect(THREE, { element: 'frost' });
scene.add(fx.group);
fx.group.position.set(x, 0, z);
fx.group.scale.set(radius, 1, radius);
fx.update(ageInSeconds); // 调用方负责时钟与回收
fx.dispose();
```

- 单次效果：`meta`、`createEffect(THREE, options)` → `{ group, update(age, data), dispose() }`。
- 连续批量效果另有 `createBatch(THREE, capacity)` → `{ group, update(rows, time), dispose() }`。
- 坐标使用 Three.js 米制。批量行的 `x/y/z` 是位置，`radius/height` 是表现尺寸，`element` 为实际元素编号。投射物的 `dx/dy/dz` 是三维速度。
- 范围预制体直接读取 `radius/inner/angle/length/width`；外部 group 控制位置和朝向。扇形和直线默认沿本地 +X。
- 持续状态由实际状态列表决定；持续地面由实际场列表决定；召唤物跟随实际实例。预览页的参照物与循环不进入游戏。

## 战斗接入

`public/vfx/catalog.mjs` 只注册表现工厂与预设；`public/vfx/battle-effects.mjs` 是唯一读取战斗数据的适配层，负责厘米/米、平面坐标/Three.js 坐标转换和真实事件映射。它观察原有 trace 并转发给原消费者，切换战斗或销毁时恢复。表现异常不阻断 trace 原消费者。

一次性特效池最多 96 个，队列最多 128 条；投射物、状态、地面使用有上限的 InstancedMesh。持续范围最多 48 个。离场、换层和关闭页面时回收资源。

`glow-renderer.mjs` 在三分之一分辨率渲染特效辉光并合成，保留现有场景、角色、相机和规则。效果材质与几何不依赖外部纹理、CDN 或新 npm 包。

不创建伤害、索敌、弹道、施法或新的技能。死亡落雷使用实际伤害落点与伤害半径；索敌半径不作为爆炸范围。连锁电弧观察实际连续命中，不添加额外目标。

## 验证

`npm run test:vfx` 检查全部预制体、有限几何、批量容量、资源只释放一次、trace 恢复、实际范围转换，并比较相同种子战斗在开启/关闭表现后的伤害、击杀、状态与投射物数据。`npm test` 运行原有规则与网站测试。

预览支持重播、暂停、时间定位、速度、半径、参照物、辉光开关及视角旋转缩放。

视觉参考：[Three.js 选择性辉光](https://threejs.org/examples/webgl_postprocessing_unreal_bloom_selective.html)、[Three.js 粒子示例](https://threejs.org/examples/webgpu_particles.html)。本项目继续使用现有 WebGLRenderer。

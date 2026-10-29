# 王之宝库表现预制体

每枚真实投射物各自出现一个法阵，朝向该投射物的实际目标。0.035秒撑开，0.32秒内收束；不在表现中创建投射物、伤害或技能逻辑。

| 宝物 | 法阵 | 主色 | 纹理 |
| --- | --- | --- | --- |
| 剑 | 六角星芒剑阵 | 冰蓝 | [portal-sword.png](assets/imagegen-colors-v1/portal-sword.png) |
| 弓 | 椭圆月弧弦阵 | 翠绿 | [portal-bow.png](assets/imagegen-colors-v1/portal-bow.png) |
| 斧 | 八棱斧刃轮 | 赤橙 | [portal-axe.png](assets/imagegen-colors-v1/portal-axe.png) |

颜色表示宝物类型，不赋予冰、毒、火等元素。法阵与飞出的兵器通过 `treasuryVariant` 使用同一类型判定。

三张纹理由内置 `image_gen.imagegen` 生成和配色，1254×1254 RGBA，保留原始透明通道，未进行裁切、重绘或离线变色。生成提示词见 [prompts.json](assets/imagegen-colors-v1/prompts.json)。

`gate.mjs` 通过注入的THREE渲染。三种法阵使用一份实例网格、一个绘制调用；纹理在活动批次间共享，最后一个批次释放时销毁。异步加载完成信号为 `batch.ready`；无DOM的模拟环境使用透明占位纹理，不依赖浏览器图像API。原图边缘通过UV留白保持完整。

`projectiles.mjs` 显示宝物与穿出裁切，`weapons.mjs` 保存三种兵器结构及共用类型判定。真实战斗和特效预览共用这些模块。

普通兵器拖尾使用两张交叉的窄光带，片元透明度同时沿宽度和长度衰减，四周均透明；不再使用四侧实心圆锥。UE 通过离线导出得到对应原生网格、材质和动画资源，运行时不读取或执行这些 mjs 文件。剑、弓、斧的 3 种外形及其变体共用同一份拖尾网格和材质。原生顶视及侧视对照可运行 `Tools/WebVFX/Verify-TreasuryTrail.ps1`，截图与回执保存在 `Saved/Verification/TreasuryTrail`。

`ea.mjs` 是天地乖离剑的独立表现：头顶巨大赤金法阵、巨剑穿出和轰击。实例化批次只读取真实载体与发射快照，法阵固定在真实起点，剑身在穿出阵面前裁剪；复用剑阵纹理与爆炸模块，不管理层数或伤害。预览：`http://127.0.0.1:5291/vfx.html#projectile-treasury-ea`。

预览：`http://127.0.0.1:5291/vfx.html#royal-treasury-gate`；战斗：`http://127.0.0.1:5291/?bd=royal_treasury`。

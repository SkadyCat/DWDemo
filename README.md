# DWDemo

网页版 ARPG：3D 地牢 + 词条驱动的构筑。全部玩法跑在新规则引擎 `CustomTools/RuleStudio/core/` 上，任何流派都只靠词条组合实现。

## 启动

需要 Node.js 22 或更新版本。

- macOS：双击根目录的 `Start-Game.command`。
- 命令行：`npm start`，然后打开 http://127.0.0.1:5291/ 。

游戏里左上角「更新到最新」会拉取最新提交并刷新。

## 玩法

- **营地**：选地图 T 阶（T1–T16）和地图类型，看「本图要求」是否达标；换装、洗炼、选技能；「流派」页可以一键换上十个示范流派任意阶段的整套装备。
- **地图**：WASD 移动，鼠标瞄准，按住左键施放当前技能，1–4 切换技能。打倒首领即通关，解锁下一阶，掉落自动收进背包。
- **装备**：10 个部位，每件 3 条基础词条 + 至多 6 条随机词条；词条分数值、形态、联动、核心四层，越往后越稀有。
- **洗炼**：魔晶（加一条）、混沌石（重洗）、灵石（升 T）、无效石（删一条）、封印符（保留一条）、三种精华（加指定层的词条）。

## 目录

- `CustomTools/RuleStudio/core/`：规则引擎（见其中 README）与内容（词条族、技能、地图压力、十个流派、装备）。
- `CustomTools/RuleStudio/public/game/`：游戏页、3D 画面、特效桥、存档。
- `CustomTools/RuleStudio/public/prefabs/`、`public/vfx/`：特效预制体。
- `CustomTools/RuleStudio/tests/`：引擎单元测试、16 个验收流派、十个流派的分阶段验证。
- `CustomTools/RuleStudio/scripts/`：校准与报告脚本（`core-calibrate-all.sh`、`core-roles.mjs`、`core-usefulness.mjs`、`core-archetype-report.mjs`）。

## 测试

```sh
npm test
```

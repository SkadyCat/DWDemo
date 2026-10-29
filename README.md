# DWDemo · RuleStudio

DungeonWorld 的技能与规则编辑网站，包含技能、装备、词缀、地图物品、天赋编辑和 3D 爬塔试玩。

## 启动

需要 Node.js 22 或更新版本。在仓库根目录运行：

```sh
npm run setup
npm run build
npm start
```

打开 http://127.0.0.1:5291/，3D 战斗入口为 http://127.0.0.1:5291/?view=battle。
Windows 也可以双击根目录的 `Start-RuleStudio.bat`。
如果端口已被其他 Studio 占用，可以运行 `node CustomTools/RuleStudio/server.mjs 5391`。

`npm run build` 会生成带版本号的压缩资源，输出在自动创建的 `Saved/RuleStudioWeb/`。
完成 `setup` 后也可直接启动，服务会自动构建资源。Vue、Three.js 和网站美术资源已随源码提供。
设置环境变量 `RULESTUDIO_WEB_SOURCE=1` 可使用源码模式。

## 目录

- `CustomTools/RuleStudio/`：网页、Node 服务、JavaScript 规则解释器、测试和工具。
- `Content/Rules/`：网站规则、技能、装备、地图和天赋数据。
- `Content/RulesTower/`：掉落池查询所用的数据目录。
- `Content/MapEvents/`：地图事件定义。
- `Content/OpusIcons/`：与网页图标一致的 PNG，供图标一致性检查使用。
- `CustomTools/UICreatorAlpha/`：网站使用的共享 UI 运行时、控件源和项目读写依赖。
- `CustomTools/TradeBackend/config/drop-pools.json`：地图掉落池配置。

浏览器保存游玩进度，修改规则通过本地服务写入 JSON。服务默认只监听本机。
COS 上传为可选功能，参见 `CustomTools/RuleStudio/docs/cos-delivery.md`；本地配置和凭据不提交。

## 检查

```sh
npm test
```

具体玩法、功能清单和工具命令见 `CustomTools/RuleStudio/README.md`。

2026-10-29 导入快照已通过生产构建及浏览器 3D 战斗启动检查。全量测试为 688 项通过、79 项失败，保留当前源站的玩法与分类数据，未为上传修改规则。具体结果见 `Docs/website-snapshot-20261029.json`。

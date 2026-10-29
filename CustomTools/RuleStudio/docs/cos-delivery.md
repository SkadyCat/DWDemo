# Studio3D 静态资源与 COS

目标为 Opus RuleStudio（默认端口 5291）。规则解释器、玩法、UI 内容与画质不变。

## 本地加速

执行 `npm ci`、`npm run build:web`，随后按原方式运行 `node --watch server.mjs 5291`。
构建输出在 `G:/DungeonWorldOpus/Saved/RuleStudioWeb/releases/<内容版本>/`，当前版本记录在相邻的 `current.json`。

- 204 个模块经 esbuild 合并、压缩，HTML 里的样式合并为一个文件。
- 构建时生成 Brotli/gzip，避免首个访问者等待压缩。版本目录使用一年不可变缓存。
- 源文件使用 ETag 重新验证；修改源文件后自动返回源文件模式，再次构建即可恢复加速包。`RULESTUDIO_WEB_SOURCE=1` 可显式使用源文件。
- 启动时编辑器和战斗共用一次规则加载与校验。`/api/rules` 仍然实时读取且禁止缓存，但传输使用压缩。
- 27 个 BD 预设只在打开 BD 面板/攻略时加载，保留手动刷新。

## COS 发布

1. 将 `deploy/cos.example.json` 复制为 `deploy/cos.local.json`，填写桶名、地域、HTTPS 资源域名和实际页面来源 `origins`。该本地配置已忽略提交。
2. 资源域名的路径前缀对应桶中的同名目录。例如 `https://assets.example.com/rulestudio` 对应 `rulestudio/_release/<版本>/`。
3. 在发布进程环境中配置 `COS_SECRET_ID`、`COS_SECRET_KEY`，临时凭据另设 `COS_SECURITY_TOKEN`。密钥不进入浏览器或构建产物。
4. 执行 `npm run publish:cos -- --dry-run` 检查范围，再执行 `npm run publish:cos`。

发布器只上传构建后的脚本、样式、图标、遮罩、音频和法阵纹理，不上传规则文件、编辑接口、存档或配置密钥。原始美术源图不上传。脚本、样式上传时设置正确 MIME、gzip 和不可变缓存。脚本会检查域名访问、脚本 MIME、解压和各页面来源的 CORS，通过后才写入已启用的版本，刷新页面即生效。

COS/CDN 须已有适合该网站的访问配置：允许页面来源的 GET/HEAD 跨域读取，资源域名能够读取上述目录。发布器不修改桶 ACL、CORS 或 CDN 权限。CORS 参见 [腾讯云文档](https://cloud.tencent.cn/document/product/436/13318)，对象缓存与编码参见 [对象 Headers](https://cloud.tencent.cn/document/product/436/13361)。

本地构建更新但尚未发布的新版本自动使用本地资源；不会把不存在的新版本指向 COS。发布失败保留当前服务。将本地配置中的 `enabled` 改为 `false` 即回到本地加速包。源模式和独立图标/VFX 工具继续可用。

## 验证

`npm run test:web-delivery` 检查压缩内容、304、实时编辑失效、HEAD、不可变缓存和 COS HTML 路径。发布前还需在浏览器验证战斗、地图装配、背包图标及 BD 面板。

本轮本地测量记录在 `Saved/RuleStudioWeb/verification.json`；其中网络字节数不是公网实际加载耗时。COS 未配置时不视为已完成云端部署。

现有扩展测试另有独立失败：图标全目录检查要求地图物品专属图标且目录与 manifest 同步；音效集成测试预期旧样品通关，但当前样品结果为失败。本轮相关 HTTP 测试、图标回退和法阵共享资源测试通过，浏览器实际战斗、地图及背包另行验收。

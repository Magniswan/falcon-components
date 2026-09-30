# GitHub 更新源

默认来源是公开仓库 `Magniswan/falcon-components` 的 `main` 分支：

```text
https://raw.githubusercontent.com/Magniswan/falcon-components/main/catalog/index.json
```

设备不需要 GitHub 登录或令牌。更新源可配置其他公开仓库与简单分支、标签或提交 SHA。演示默认跟随 main；部署时可固定已经验证的提交或标签。没有内置镜像或自动更换下载源；GitHub 不可达时提示重试，已安装组件继续离线使用。

## 目录

```text
catalog/index.json
catalog/components/<id>/<version>/manifest.json
catalog/components/<id>/<version>/<入口与资源>
```

索引 `schemaVersion: 1` 的 `components` 数组包含 `{ id, version, manifest }`。版本为精确三段版本号，本版不支持 latest、范围、预发布版本或组件间运行时依赖。

清单示例见 [Hello manifest](../catalog/components/hello/0.1.0/manifest.json)，包含接口/运行时要求、入口和每个文件的 `path`、`size`、`sha256`。最多 128 个文件、每文件 16 MiB、总计 64 MiB；当前实现逐文件获取 Uint8Array，不能将此限制理解为已验证的词典笔内存预算。

SHA-256 用于检查下载与清单一致；来源信任由所配置的仓库和 ref 决定。包目录按版本固定，已发布版本不可原地修改。后续若使用 GitHub Release assets，需增加对应 source 实现，当前源读取仓库内的普通文件。

0.1.1 增加已签名的 GitHub Actions / Release 分发包，详见 [签名发布指南](signing.md)。签名在打包阶段生成，不改写源码仓库 catalog；本页描述的 raw-file loader 尚未消费签名，也不会因为配置了仓库 Secret 而自动获得验签能力。

## 新增组件

1. 使用安全 ID（小写字母、数字、连字符）和独立版本建立目录。
2. 模块导出 `apiVersion = 1`、`createComponent(context)`，实例提供 `dispose()`。
3. 添加清单和索引记录；路径均为相对路径，不允许 `..`、绝对路径或保留的 `manifest.json` 文件记录。
4. 首次发布前运行 `node scripts/check-catalog.mjs --write` 写入真实文件大小和哈希。
5. 运行 `npm test`、`npm run check`，再提交并推送。已发布版本变更需建立新版本目录，不对旧清单运行覆盖更新。

## 安装与更新行为

使用本地版本不连接更新源。缺失版本先由前台确认，再取索引、清单和文件；每个文件校验后写入 `.staging`，全部完成才原子发布到 `<id>/<version>`。

`manager.checkUpdate({ id, version })` 是明确触发的在线目录查询，只报告目录中是否有更高版本，不下载、不切换版本，也不保证较新版本适配当前设备。安装新版本应由应用选择精确版本并重新走前台流程，旧会话与旧版本保持可用。

本地文件损坏会报 `CORRUPT_INSTALL`，不会运行损坏内容或静默覆盖版本。此版没有自动修复/卸载管理界面；维护者确认没有使用中的会话后移走损坏目录，再由用户下载。

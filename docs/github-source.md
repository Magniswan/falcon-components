# GitHub 签名更新源

0.2.0 默认读取公开 GitHub Release 的签名附件，设备无需登录或令牌：

```text
https://github.com/Magniswan/falcon-components/releases/latest/download/component-catalog.sig.json
```

设置 release: 'v0.2.0' 可固定某次发布；默认 latest 便于显式检查更新。源的仓库与可信公钥均由宿主配置，不能从下载内容自动更换。GitHub 不可达时提示重试，已安装签名组件可离线使用。0.1 的 ref/catalogPath 普通文件源参数不再接受。

## 目录与清单

源码中的 catalog/index.json 仍是组件发布输入；Actions 仅在打包副本中补充签名，不改写源码或旧组件文件。分发目录的签名 payload 为：

```json
{
  "schemaVersion": 1,
  "repository": "Magniswan/falcon-components",
  "ref": "完整的已签名源码 commit SHA",
  "components": [
    {
      "id": "hello",
      "version": "0.1.0",
      "manifest": "catalog/components/hello/0.1.0/manifest.json",
      "manifestSha256": "原始组件清单的 SHA-256",
      "signature": { "原始清单签名 envelope": "见 signing.md" }
    }
  ]
}
```

这是示意数据，实际目录由发布脚本生成。catalog 验签成功后，框架验证仓库、commit、记录、精确版本及清单 SHA-256，再验证对应组件清单。每条记录内含原始清单签名，设备只需下载一个小型目录附件，不必下载或解压整个组件库。

组件文件地址固定到目录签署的 commit：

```text
https://raw.githubusercontent.com/<repository>/<signed-commit>/<组件目录>/<file.path>
```

修改 main、标签或 Release 附件不会让新内容绕过固定公钥的验签。发布方的有效旧签名仍允许使用，本项目不实施防回滚或过期策略。

清单格式见 [Hello manifest](../catalog/components/hello/0.1.0/manifest.json)。组件采用精确三段版本号，最多 128 文件、每文件 16 MiB、总计 64 MiB；目录最多 4096 条记录，但包含内嵌清单的完整签名 payload 同时限制为 256 KiB，不能将记录数上限理解为保证能装下 4096 份清单。网络 envelope 上限 384 KiB；设备内存预算仍需真机验证。

## 新增与发布组件

1. 建立 catalog/components/<id>/<version>/，模块提供 apiVersion = 1、createComponent(context) 和实例 dispose()。
2. 添加清单与输入目录记录；路径安全，manifest.json 与 manifest.json.sig.json 及其子路径保留。
3. 首次发布新组件版本前运行 node scripts/check-catalog.mjs --write 写入真实大小与 SHA-256；不覆盖已发布版本。
4. 测试、仓库检查、提交并推送源码；更新根框架发布版本和 CHANGELOG，推送对应 vX.Y.Z 标签。
5. Actions 使用 GitHub Secret 签署清单、目录、完整分发包，验签及宿主 smoke check 成功后发布四个附件。操作见 [签名发布指南](signing.md)。

## 安装与更新

本地完整签名版本不连接更新源。缺失时先前台确认，再获取签名目录和清单；管理器独立验签后，在安装锁内逐文件校验并写入 .staging，保存原始清单字节和签名，全部完成才原子发布版本目录。load 在模块导入前再次复核。

checkUpdate 只报告可信目录中的较高组件版本，不下载或自动切换；旧版本和现有会话保持可用。无签名、错误签名、未知发布公钥和损坏本地文件均拒绝加载；不会自动覆盖目录或提供“仍然安装”。旧无签名安装的迁移见 [接入指南](getting-started.md)。

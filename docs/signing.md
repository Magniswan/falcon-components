# GitHub Actions 签名发布

0.2.0 完成发布端 Ed25519 签名，以及宿主框架在下载、安装和离线加载时的强制验签。加载器、可信公钥和验签逻辑属于宿主应用，不能从设备公共组件目录获取信任依据。通用框架/Node 流程已实现；Falcon 原生密码能力和实际包外加载仍需目标设备验证。

## 密钥与 Secret

- 仓库 Secret：`FALCON_COMPONENTS_SIGNING_PRIVATE_KEY`，值为 Ed25519 PKCS#8 PEM 私钥全文，保留换行。
- 公钥：[trust/release-public-key.json](../trust/release-public-key.json)，使用 SPKI PEM；keyId 是 SPKI DER 字节的 SHA-256。
- 宿主构建时固定公钥；来自下载包的公钥仅供展示，不能据此建立信任。
- 官方签名器与其他项目的密钥独立。私钥、备份及 GitHub 登录令牌不进入仓库、组件包、日志或设备。
- Actions 只在签名步骤把 Secret 注入进程环境；测试及发布 job 没有这个私钥环境变量。仓库中有写权限的维护者仍能修改工作流使用 Secret，因此这些维护者属于可信发布范围。

首次官方配置使用 GitHub Secrets REST API：读取仓库的 Secrets 加密公钥，通过 LibSodium sealed box 加密私钥后提交；API 只返回 Secret 名称及更新时间，不能读回明文。参考 [GitHub 官方 Secret 加密说明](https://docs.github.com/en/rest/guides/encrypting-secrets-for-the-rest-api)。

官方私钥的本机备份放在仓库外的用户目录 `.falcon-components-signer/release-private-key.pem`。本次 Windows 配置移除了目录继承权限，仅允许当前用户和 SYSTEM；迁移电脑时应通过自己的安全备份流程保存密钥。GitHub Secret 不能作为可导出备份。

其他维护者 fork 项目后，应生成自己的密钥、公钥配置和 Secret，并调整 build 脚本中的仓库身份及 workflow 的仓库限制；不会共享官方私钥。

## 密钥轮换

轮换需要宿主发布者主动更新应用内的公钥，组件不能发起信任变更。先生成独立新密钥并妥善备份，将新公钥加入宿主 trustedKeys（可暂时同时保留旧公钥）；宿主更新后，再更新发布端公钥文件与 GitHub Secret，用新私钥发布组件。

若仍有应用只固定旧公钥，它会拒绝新密钥签名，不会自动从 GitHub 接受替代公钥。旧密钥泄露时应更新宿主、移除其信任并处理旧安装；本版不自动下发吊销、公钥委托或防回滚状态。GitHub Secret 更新与正式密钥轮换是维护者显式执行的操作。

## 签名格式

签名 sidecar 使用 JSON：

```json
{
  "schemaVersion": 1,
  "algorithm": "Ed25519",
  "keyId": "SPKI DER 的 SHA-256",
  "purpose": "component-manifest",
  "payload": "原始 UTF-8 文件字节的标准 Base64",
  "signature": "64 字节 Ed25519 签名的标准 Base64"
}
```

签名消息是 UTF-8 `falcon-components:<purpose>:v1`，紧接一个零字节，再接 payload 的原始字节。purpose 仅允许 catalog、component-manifest、release。先验证签名，再解析 payload；不要对 JSON 重新序列化后验签。验签时也必须检查 schema、算法、可信 keyId、用途和编码/大小。

产物内的绑定关系：

1. 每个 `manifest.json.sig.json` 签署原始组件清单，清单包含组件 ID、版本、入口、运行时、资源大小及 SHA-256。
2. `catalog/index.json` 在打包时增加 repository、完整源码 commit ref，以及每条记录的 manifestSha256 和原始清单 signature。目录签名是 `catalog/index.json.sig.json`，另外作为 Release 附件 component-catalog.sig.json 发布；设备按签署 commit 获取文件，防止替换版本记录或拼接不同清单。
3. `release-manifest.json` 绑定仓库身份、根版本、Git commit 和全部分发文件的大小/哈希；其 sidecar 签署整个文件。
4. `falcon-components-vX.Y.Z.tar.gz.sig.json` 签署归档的名称、大小与 SHA-256，并绑定版本、仓库和 commit。下载后先校验归档，再解压。

公钥验签证明发布者与完整性，不提供代码保密，也不证明组件业务逻辑安全。按本项目决定，没有防回滚、最高版本记忆、递增目录序号或过期检查；旧的有效签名版本可以使用。

## Actions 流程

[Framework checks](../.github/workflows/check.yml) 在 main push 和普通 pull_request 上运行，不引用签名 Secret。[Signed component release](../.github/workflows/release.yml) 只接受本仓库的版本标签或 main 上的手动运行，不接受 PR 代码执行。

流程为：固定 SHA 的官方 Actions → Node 18.20.8 → npm ci（禁用安装脚本）→ 行为测试与仓库检查 → 确认提交属于 main → Git archive 提取当前已提交源码 → 校验密钥与公钥匹配 → 校验 catalog → 签名 → 独立公钥验签 → 强制验签宿主下载/离线加载 smoke check → 上传 artifact。

- 手动运行：Actions 页面选择 Signed component release，选择 main，再 Run workflow。只生成 artifact，便于验证 Secret 和打包流程。
- 正式发布：更新根 package.json/package-lock.json 和 CHANGELOG，提交并推送 main；推送对应 `vX.Y.Z` 标签。标签必须匹配根版本。随后自动生成 GitHub Release 和四个附件：归档、归档签名、SHA256SUMS、component-catalog.sig.json。
- 发布 job 只获得 contents:write / actions:read，用 runner 自带 GitHub CLI 下载已验证 artifact 并发布，不读取私钥。
- 发布不覆盖现有 Release；重复标签、版本不一致、签名或测试失败会停止。需要修复时发布新的版本。
- 不发布 npm，不分发 Falcon SDK/AMR，不部署 CloudBrowser 或操作词典笔。

## 本地打包与消费者验证

本地打包需要干净的已提交 checkout，私钥文件必须位于仓库外：

```sh
FALCON_COMPONENTS_SIGNING_KEY_FILE=/your/private/location/release-private-key.pem npm run release:build
```

PowerShell：

```powershell
$env:FALCON_COMPONENTS_SIGNING_KEY_FILE = 'C:\your-private-location\release-private-key.pem'
npm run release:build
Remove-Item Env:FALCON_COMPONENTS_SIGNING_KEY_FILE
```

输出位于忽略的 artifacts/release-<commit前12位>/，包含 bundle 目录、归档和签名。已经存在的输出目录不会被覆盖，重新构建可先人工移走确认不再需要的旧产物。

消费者使用自己预先信任的宿主公钥文件，先验证归档，成功后再解压检查全部文件：

```sh
node scripts/verify-archive.mjs ./downloads/falcon-components-v0.2.0.tar.gz ./host-trust/release-public-key.json
mkdir -p ./verified-bundle
tar -xzf ./downloads/falcon-components-v0.2.0.tar.gz -C ./verified-bundle
node scripts/verify-release.mjs ./verified-bundle ./host-trust/release-public-key.json
```

未指定公钥参数时，工具使用当前验证工具 checkout 内的公钥，不会使用待验证目录里的公钥。校验失败时进程返回非零；不要继续解压、安装或执行。

## 宿主强制验签

宿主通过 createSignatureVerifier({ trustedKeys, crypto }) 固定自己的公钥；同一 trust 传入 source 和 manager。source 传递 catalogSignature/manifestSignature；manager 自行验证目录与清单绑定，不信任源返回的已归一化 manifest。安装保存原始 manifest.json 字节及 manifest.json.sig.json；inspect/load 重新验签并检查文件，完全离线也必须验证。

前台仍为“缺失 → 确认下载”；缺签名、格式错误、未知公钥、用途不符、签名无效都转为错误并拒绝加载，没有 unsigned fallback。旧安装迁移与完整接入代码见 [接入指南](getting-started.md)。

核心不实现密码算法，crypto.verifyEd25519 接收 32 字节原始公钥、完整消息和 64 字节签名；具体平台契约见 [宿主适配](host-adapters.md)。Node 使用 node:crypto。Falcon 模板固定公钥但仍需要真实原生密码库能力，未提供无证据的通用设备二进制。

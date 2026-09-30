# GitHub Actions 签名发布

0.1.1 提供发布端 Ed25519 签名、归档与公开验签工具。加载器、可信公钥和验签逻辑属于宿主应用，不能从设备公共组件目录获取信任依据。当前 runtime loader 尚未接入强制验签；配置 Secret、生成签名包与词典笔实际拒绝篡改是不同的验证层。

## 密钥与 Secret

- 仓库 Secret：`FALCON_COMPONENTS_SIGNING_PRIVATE_KEY`，值为 Ed25519 PKCS#8 PEM 私钥全文，保留换行。
- 公钥：[trust/release-public-key.json](../trust/release-public-key.json)，使用 SPKI PEM；keyId 是 SPKI DER 字节的 SHA-256。
- 宿主构建时固定公钥；来自下载包的公钥仅供展示，不能据此建立信任。
- 官方签名器与其他项目的密钥独立。私钥、备份及 GitHub 登录令牌不进入仓库、组件包、日志或设备。
- Actions 只在签名步骤把 Secret 注入进程环境；测试及发布 job 没有这个私钥环境变量。仓库中有写权限的维护者仍能修改工作流使用 Secret，因此这些维护者属于可信发布范围。

首次官方配置使用 GitHub Secrets REST API：读取仓库的 Secrets 加密公钥，通过 LibSodium sealed box 加密私钥后提交；API 只返回 Secret 名称及更新时间，不能读回明文。参考 [GitHub 官方 Secret 加密说明](https://docs.github.com/en/rest/guides/encrypting-secrets-for-the-rest-api)。

官方私钥的本机备份放在仓库外的用户目录 `.falcon-components-signer/release-private-key.pem`。本次 Windows 配置移除了目录继承权限，仅允许当前用户和 SYSTEM；迁移电脑时应通过自己的安全备份流程保存密钥。GitHub Secret 不能作为可导出备份。

其他维护者 fork 项目后，应生成自己的密钥、公钥配置和 Secret，并调整 build 脚本中的仓库身份及 workflow 的仓库限制；不会共享官方私钥。

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
2. `catalog/index.json` 在打包时增加每条记录的 manifestSha256，目录签名是 `catalog/index.json.sig.json`，防止替换版本记录或拼接不同清单。
3. `release-manifest.json` 绑定仓库身份、根版本、Git commit 和全部分发文件的大小/哈希；其 sidecar 签署整个文件。
4. `falcon-components-vX.Y.Z.tar.gz.sig.json` 签署归档的名称、大小与 SHA-256，并绑定版本、仓库和 commit。下载后先校验归档，再解压。

公钥验签证明发布者与完整性，不提供代码保密，也不证明组件业务逻辑安全。按本项目决定，没有防回滚、最高版本记忆、递增目录序号或过期检查；旧的有效签名版本可以使用。

## Actions 流程

[Framework checks](../.github/workflows/check.yml) 在 main push 和普通 pull_request 上运行，不引用签名 Secret。[Signed component release](../.github/workflows/release.yml) 只接受本仓库的版本标签或 main 上的手动运行，不接受 PR 代码执行。

流程为：固定 SHA 的官方 Actions → Node 18.20.8 → npm ci（禁用安装脚本）→ 行为测试与仓库检查 → 确认提交属于 main → Git archive 提取当前已提交源码 → 校验密钥与公钥匹配 → 校验 catalog → 签名 → 独立公钥验签 → 上传 artifact。

- 手动运行：Actions 页面选择 Signed component release，选择 main，再 Run workflow。只生成 artifact，便于验证 Secret 和打包流程。
- 正式发布：更新根 package.json/package-lock.json 和 CHANGELOG，提交并推送 main；推送对应 `vX.Y.Z` 标签。标签必须匹配根版本。随后自动生成 GitHub Release 和三个附件：归档、归档签名、SHA256SUMS。
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
node scripts/verify-archive.mjs ./downloads/falcon-components-v0.1.1.tar.gz ./host-trust/release-public-key.json
mkdir -p ./verified-bundle
tar -xzf ./downloads/falcon-components-v0.1.1.tar.gz -C ./verified-bundle
node scripts/verify-release.mjs ./verified-bundle ./host-trust/release-public-key.json
```

未指定公钥参数时，工具使用当前验证工具 checkout 内的公钥，不会使用待验证目录里的公钥。校验失败时进程返回非零；不要继续解压、安装或执行。

## 接入宿主加载器的下一步

宿主新增 verifyEd25519 平台接口；source 传递原始签名和 payload；安装保存签名；inspect/load 在导入模块前重新验签与检查文件。前台提示保留“缺失 → 确认下载”，验签失败显示错误且拒绝加载。

Node 验签工具使用 node:crypto。Falcon/QuickJS 不等于 Node，需要接入已验证的原生密码库能力，再做真机下载、篡改拒绝、离线加载和多应用验证。现有 raw-file 示例只证明 SHA-256 校验，不构成签名加载的验收。

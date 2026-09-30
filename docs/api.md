# API 0.2.0

## core

`ComponentError` 提供稳定 `code` 和可选 `cause`。`createCancellationToken()` 提供取消状态、订阅和检查。`validateRequirement`、`validateManifest`、`assertCompatible` 和 `compareVersions` 供接入者及发布工具复用。

`createSignatureVerifier({ trustedKeys, crypto })` 创建宿主验签器。trustedKeys 是宿主预先固定的公钥记录数组（最多 16 个），不是下载内容；记录格式见 [公钥](../trust/release-public-key.json)。crypto 提供 sha256 和 verifyEd25519，见 [宿主适配](host-adapters.md)。

`trust.verify(envelope, { purpose, token? })` 异步返回 `{ value, bytes, envelope }`：原始签名 payload 验证通过后才解析 JSON，bytes 是原始字节，envelope 是字段快照。purpose 是 catalog、component-manifest 或 release。`trust.sha256(bytes)` 用于目录对清单的绑定。没有公钥或密码能力就拒绝创建，没有跳过验签选项。

签名 payload 上限 256 KiB，传输 envelope 上限 384 KiB。清单的 Base64、UTF-8 和签名编码均严格校验，核心无需 Node Buffer、浏览器 TextEncoder/TextDecoder 或 WebCrypto。

常见错误：DOWNLOAD_REQUIRED、CANCELLED、COMPONENT_NOT_FOUND、NETWORK_ERROR、INCOMPATIBLE_RUNTIME、HASH_MISMATCH、SIZE_MISMATCH、CORRUPT_INSTALL、STORAGE_ERROR、LOCK_TIMEOUT、LOAD_ERROR。前台展示使用 `errorMessage(error)`，日志可记录 error.code，避免展示堆栈或实现细节。

签名错误：SIGNATURE_REQUIRED（缺少签名）、SIGNATURE_INVALID（验签不通过）、INVALID_SIGNATURE（格式/用途/编码错误）、UNTRUSTED_KEY（宿主未固定该发布公钥）、INVALID_TRUST（宿主信任配置错误）、CRYPTO_ERROR（宿主密码接口异常）。这些错误均阻止安装或加载。

## loader

`createGitHubSource({ transport, trust, repository?, release? })` 返回 `{ repository, release, catalog, resolve, latest }`。默认仓库 Magniswan/falcon-components，release 默认 latest，也可固定 v0.2.0 等标签。0.1 的 ref/catalogPath 参数会报 INVALID_SOURCE，不能回到无签名普通文件源。

`catalog(token?)` 返回已验证的 catalog envelope。`resolve(requirement, token?)` 返回 `{ manifest, catalogSignature, manifestSignature, download(file, { token, onProgress }) }`；文件地址来自签名目录的仓库与完整 commit SHA。`latest(id, token?)` 返回可信目录里的最高组件版本。

自定义更新源必须提供 resolve 与 catalog；提供的目录和清单也必须被宿主固定的密钥签署。manager 独立验签，不信任 source 预先计算的 manifest 或 latest 字符串。

`createComponentManager({ root, storage, source, runtime, trust })` 返回：

| 方法 | 行为 |
| --- | --- |
| `inspect(requirement, token?)` | 验证本地清单签名、原始字节一致性、兼容性和所有文件哈希；缺失返回 null，不连接源 |
| `ensure(requirement, options?)` | 保证指定版本安装；缺失且没有前台 callback 时抛 DOWNLOAD_REQUIRED |
| `load(requirement, options?)` | ensure 后加载并创建新实例，返回 handle |
| `checkUpdate(requirement, { token }?)` | 查询源中更高版本，不修改安装 |

requirement 是 `{ id, version, name? }`。options 包含 `requestDownload(requirement)`（仅严格返回 true 才下载）、`onProgress({ id, version, name, received, total, file })`、`token`；load 另接受 context。

handle 是 `{ directory, manifest, instance, dispose() }`，dispose 只调用实例释放一次。每次 load 创建独立实例，宿主可以缓存代码模块。ensure 后直接返回安装信息不创建实例。

安装保存原始 manifest.json 字节和 manifest.json.sig.json；这两个路径及其子路径保留，不能作为组件资源。load 在 ensure 后再次检查磁盘，再调用宿主 importModule。验签器不读取组件目录中的公钥，也不从签名内容建立新信任。checkUpdate 从独立验签的目录计算版本；无防回滚状态。

取消发生在原子发布完成之后时，完整组件可能已留在磁盘，但不会继续创建/返回已取消会话的实例。未发布的临时目录会清理；清理失败附加在原错误 `cleanupError` 上。

## ui

`createComponentSession({ manager, requirement, context? })` 包装前台流程。`state` 返回快照，`component` 是已创建实例或 null。

- `subscribe(callback)`：立即收到状态，并返回 off。
- `start()` / `retry()`：返回 handle 或 null；错误转入 state.errorCode/message，取消返回 null。同一会话的重复 start 共享正在进行的任务。
- `acceptDownload()`：确认当前提示；其他状态不会触发下载。
- `cancel()`：取消正在进行的请求或关闭已经结束的错误提示；ready 实例不受影响。
- `dispose()`：停止通知、取消未完成操作、释放实例；不能再 start。

状态：idle → checking → prompt → downloading → ready；失败为 error，取消为 cancelled。本地已有版本直接 checking → ready。

`ComponentDownloadPrompt.vue` 的 props 是 `{ state, width, height }`，事件为 download、cancel、retry。宿主负责订阅、绑定和页面生命周期转发。

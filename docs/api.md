# API 0.1.0

## core

`ComponentError` 提供稳定 `code` 和可选 `cause`。`createCancellationToken()` 提供取消状态、订阅和检查。`validateRequirement`、`validateManifest`、`assertCompatible` 和 `compareVersions` 供接入者及发布工具复用。

常见错误：DOWNLOAD_REQUIRED、CANCELLED、COMPONENT_NOT_FOUND、NETWORK_ERROR、INCOMPATIBLE_RUNTIME、HASH_MISMATCH、SIZE_MISMATCH、CORRUPT_INSTALL、STORAGE_ERROR、LOCK_TIMEOUT、LOAD_ERROR。前台展示使用 `errorMessage(error)`，日志可记录 error.code，避免展示堆栈或实现细节。

## loader

`createGitHubSource({ transport, repository, ref, catalogPath })` 返回 `{ resolve, latest }` 更新源。自定义源可实现相同接口：resolve 返回 `{ manifest, download(file, { token, onProgress }) }`，latest 返回版本号。

`createComponentManager({ root, storage, source, runtime })` 返回：

| 方法 | 行为 |
| --- | --- |
| `inspect(requirement, token?)` | 检查本地清单、兼容性和所有文件哈希；缺失返回 null，不连接源 |
| `ensure(requirement, options?)` | 保证指定版本安装；缺失且没有前台 callback 时抛 DOWNLOAD_REQUIRED |
| `load(requirement, options?)` | ensure 后加载并创建新实例，返回 handle |
| `checkUpdate(requirement, { token }?)` | 查询源中更高版本，不修改安装 |

requirement 是 `{ id, version, name? }`。options 包含 `requestDownload(requirement)`（仅严格返回 true 才下载）、`onProgress({ id, version, name, received, total, file })`、`token`；load 另接受 context。

handle 是 `{ directory, manifest, instance, dispose() }`，dispose 只调用实例释放一次。每次 load 创建独立实例，宿主可以缓存代码模块。ensure 后直接返回安装信息不创建实例。

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

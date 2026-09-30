# 宿主适配契约 v1

`core`、`loader` 和 UI 会话不使用 Node、浏览器 DOM、fetch、AbortController 或全局文件 API。以下接口由宿主注入；当前提供 [Node 参考实现](../packages/node-adapter/src/index.js)，Falcon 项目应使用目标设备已验证的 JSAPI 或 native 桥接实现。

## storage

路径都位于传入的公共根目录。所有接口允许返回 Promise。

| 接口 | 契约 |
| --- | --- |
| `readJson(path)` | 返回对象；仅文件不存在时返回 null，权限、I/O 或损坏 JSON 不能当作不存在 |
| `readBytes(path)` | 返回 Uint8Array；不存在时返回 null |
| `mkdir(path)` | 递归创建目录 |
| `writeBytes(path, bytes)` | 写入新文件，不能覆盖已有文件；创建其父目录 |
| `writeJson(path, value)` | 写入新 JSON 文件，不能覆盖已有文件 |
| `sha256(bytes)` | 返回小写 64 字符 SHA-256 |
| `rename(stage, target)` | 同文件系统原子发布完整目录，拒绝覆盖已存在的版本 |
| `removeTree(path)` | 只能清理受控的单个临时安装目录或锁目录，不能删除根目录和已安装版本 |
| `withLock(key, task, { token })` | 获取跨应用/跨进程互斥锁，在锁内 await task()；finally 释放，等待有时限且可取消 |

仅使用 JavaScript Map 不满足跨应用锁契约。Node 参考实现使用原子 mkdir 锁；设备桥接可使用进程退出自动释放的文件锁。目录锁在进程崩溃后可能残留，应核对 owner 和存活进程后清理，不能看到锁就自动删除。

拒绝越过根目录、符号链接重定向和覆盖已安装版本。持久化介质需要断电可靠性时，在发布前同步文件与目录；当前 Node 演示只验证进程内原子可见性，不宣称断电持久化。

## transport

```js
transport.getText(url, { token, maxBytes });
transport.getBytes(url, { token, maxBytes, onProgress });
```

`getText` 返回字符串，`getBytes` 返回 Uint8Array。必须检查 HTTP 成功状态，限制接收大小，支持 GitHub HTTPS 和其重定向，提供有限的超时。`onProgress(received)` 是当前文件已接收字节数。

下载实现应订阅 token 并尽快中断底层请求。即使底层无法立即中断，框架也会拒绝安装或加载过期结果，但 `dispose()` 仍需等待该请求结束，所以网络适配必须有超时。

取消接口：`token.cancelled`、`token.throwIfCancelled()`、`token.onCancel(handler)`，后者返回解除订阅函数；不依赖设备存在 AbortController。

## runtime

```js
const runtime = {
  formats: ['esm'],
  async importModule(absoluteEntryPath, { manifest, token }) {
    // 目标设备已经验证的加载方式
    return loadedModule;
  },
};
```

支持字节码时还声明 `quickjsVersion` 和 `bigNum`，必须与清单一致。模块提供 `apiVersion = 1` 和 `createComponent(context)`；返回实例必须有 `dispose()`，其余方法由组件定义。

组件创建失败时自行释放部分创建资源。框架在取消晚到的实例时调用 dispose；宿主缓存模块时不能缓存输入等实例状态。模块缓存不会因为 dispose 自动卸载。

`context.component` 由框架提供，包含 `directory` 和已验证 `manifest`。组件据此定位资源，其余 context 由宿主明确注入。需要 Vue UI 的组件必须使用宿主的渲染环境，不携带另一份 Vue；具体编译产物和样式注册需另外验证。

## Falcon 接入检查单

先用 Hello 的普通 ESM 路径测试包外加载。若目标运行时只接受字节码，应生成该 profile 的独立组件/版本及匹配清单，不能仅修改扩展名。当前 Hello 源码示例没有字节码分发产物。

记录型号、固件、Falcon、QuickJS、逻辑屏幕尺寸、文件路径、HTTPS/重定向结果、模块加载日志、前后台和重复进入退出行为。框架入口与下载提示随 AMR 打包，远程组件按版本装到公共目录。

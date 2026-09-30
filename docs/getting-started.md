# 接入指南

本版先提供组件管理框架、GitHub 更新源和前台下载提示，不实现键盘。可运行的参考示例使用 Hello 组件。

## 先运行完整示例

使用 Node 18（推荐 18.20.8）：

```sh
git clone https://github.com/Magniswan/falcon-components.git
cd falcon-components
npm ci
npm test
npm run check
npm run demo
```

首次打开时终端提示是否下载，输入 `y` 才连接 GitHub；取消不会发出更新源请求。宿主固定公钥验证 Release 目录及原始组件清单的 Ed25519 签名，再检查文件大小/SHA-256 后安装并显示问候语。再次运行仍验证本地签名和文件，完全离线。

```sh
# 自动演示仍要求显式选择下载，默认不会下载
node examples/node-host/main.mjs --accept-download
# 禁止网络访问，检查第二次能否从本地加载
node examples/node-host/main.mjs --offline
```

演示安装到 gitignored 的 `.demo-device/signed-components/hello/0.1.0/`。`--root <目录>` 可指定单独的实验目录，`--release v0.2.0` 可固定 GitHub Release；默认 latest。Hello 自身版本仍为 0.1.0，组件源码没有因框架升级而改写。

## 从 0.1 迁移

源码包更新到 0.2.0；source 的 ref/catalogPath 改为 release，并将同一个宿主 trust 传给 source 与 manager。旧安装没有 manifest.json.sig.json，会报 SIGNATURE_REQUIRED，不会自动覆盖或直接加载。

演示使用新目录保留旧测试数据。正式宿主可切换到新的共享根目录，或确认没有活跃会话后由自己的安装管理流程移走旧版本目录，再前台下载已签名版本。不要为旧文件补一个空签名或绕过验签。

## 接入 Falcon 项目

宿主先准备目标设备真实的存储、网络、SHA-256、Ed25519 验签、安装锁和模块加载接口，契约见 [宿主适配](host-adapters.md)。Node 参考适配器不可在词典笔中运行。

可以从克隆的组件库引入源码包。以下命令从宿主项目根目录运行；请将路径替换为自己的组件库位置。包尚未发布到 npm，不能直接从 npm 安装同名版本。

```sh
npm install ../falcon-components/packages/core ../falcon-components/packages/loader ../falcon-components/packages/ui
```

保留 `@falcon-components/core`、`@falcon-components/loader`、`@falcon-components/ui` 三个包的解析。若使用源码拷贝或 aiot alias，则显式把这些名称映射到各包 `src/index.js`，避免误解析成设备内置模块。

创建管理器：

```js
import { createComponentManager, createGitHubSource } from '@falcon-components/loader';
import { createComponentSession } from '@falcon-components/ui';
import { createSignatureVerifier } from '@falcon-components/core';
import releasePublicKey from './host-trust/release-public-key.json'; // 构建时固定，来自你信任的发布者

const trust = createSignatureVerifier({ trustedKeys: [releasePublicKey], crypto: host.crypto });

const manager = createComponentManager({
  root: '/userdisk/components/falcon-components', // 宿主配置，不是库内硬编码
  storage: host.storage,
  runtime: host.runtime,
  trust,
  source: createGitHubSource({
    transport: host.transport,
    trust,
    repository: 'Magniswan/falcon-components',
    release: 'latest', // 或固定 'v0.2.0'
  }),
});
const session = createComponentSession({
  manager,
  requirement: { id: 'hello', version: '0.1.0', name: 'Hello 示例组件' },
  context: { name: 'Falcon 使用者' },
});
const off = session.subscribe((state) => { page.downloadState = state; });
const handle = await session.start(); // 需要下载时，等待页面按钮作出选择
if (handle) page.message = handle.instance.getMessage();
```

## 前台界面

将 `ComponentDownloadPrompt.vue` 引入页面顶层，它和框架入口随宿主应用构建，不依赖远程下载，否则会无法显示“缺失组件”提示。

```vue
<component-download-prompt
  :state="downloadState"
  :width="profile.logicalWidth"
  :height="profile.logicalHeight"
  @download="session.acceptDownload()"
  @cancel="session.cancel()"
  @retry="session.retry()"
/>
```

脚本中注册 `ComponentDownloadPrompt`。完整子组件示例见 [ComponentDemo.vue](../examples/falcon-host/ComponentDemo.vue)；宿主构造见 [component-host.js](../examples/falcon-host/component-host.js)。

框架的 `checking` 只检查本地。不存在时进入 `prompt`；点击下载进入 `downloading`，成功为 `ready`，失败为 `error`，取消为 `cancelled`。错误提示可重试或关闭。

## 页面生命周期

`ComponentDemo.vue` 是可嵌入子组件，子组件不会自动收到 Falcon 根页面的所有生命周期。根页面须转发 `onHide/onUnload`：

```js
methods: {
  onHide() { if (this.$refs.demo) this.$refs.demo.onHide(); },
  onUnload() { if (this.$refs.demo) this.$refs.demo.release(); },
}
```

自定义页面退出时执行 `off()` 和 `await session.dispose()`。只关闭下载提示可以调用 `session.cancel()`；它不会销毁已经 ready 的组件。切到后台时取消未完成安装，返回后由用户重新打开。

## 当前设备边界

框架及 Node 示例可运行；Falcon 提示和示例提供源码并可进行编译检查。真实设备的包外模块加载、文件读写/锁、样式注册、触控和视频叠加需由设备适配验证。不能把 Node 演示或编译通过当成词典笔运行通过。

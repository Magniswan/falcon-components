# falcon-components

面向 Falcon/Vue 词典笔应用的开源组件框架。先提供共享组件管理和 GitHub 更新源，后续可增加键盘、日历、图表等独立组件。

**0.2.0：签名发布、下载和离线加载的强制验签已接入。公钥随宿主应用构建，GitHub Release 提供签名目录，文件按已签名提交下载。键盘未实现；Falcon 原生密码接口和包外加载仍需目标设备验证。**

## 目标

- 组件与业务解耦，通过属性、事件和小型宿主适配接口接入。
- 支持不同词典笔型号，由宿主传入逻辑尺寸和平台能力。
- 组件可独立维护版本，安装一个组件无需引入整个库。
- 同时规划源码随应用构建、设备公共目录按需加载两条接入路径。
- 文档、纯逻辑验证、构建验证和真机证据分别记录。

## 仓库结构

```text
packages/
  core/                 清单校验、接口兼容、错误码与取消
  loader/               GitHub 源、本地检查、下载校验和原子安装
  ui/                   前台会话与 Falcon/Vue 下载提示
  node-adapter/         电脑上的文件/网络/加载参考实现
  keyboard/             设计占位，本轮不实施
catalog/                GitHub 更新目录与 Hello 示例组件
examples/
  node-host/            可运行的完整参考示例
  falcon-host/          Falcon 页面与宿主接入模板
docs/
  getting-started.md     从下载到接入
  host-adapters.md       设备平台接口契约
  github-source.md       更新目录与组件发布
  api.md                框架 API
scripts/
  check-repository.mjs   结构、JSON、代码语法与文档链接检查
  check-catalog.mjs      组件目录、大小与哈希检查
  check-falcon-build.mjs 本地 Falcon 工具链编译检查
test/                   行为测试
```

## 缺失组件的前台流程

应用指定组件 ID 和精确版本 → 检查本地签名和文件 → 缺失时前台提示“下载 / 取消” → 确认后连接 GitHub → 验证目录及清单签名 → 校验文件并原子安装 → 加载前复核。失败可重试，取消不加载晚到结果。已有完整签名版本直接离线使用。

框架入口与提示随应用构建，远程组件按需安装。参见 [快速接入](docs/getting-started.md)、[API](docs/api.md) 和 [示例](examples/README.md)。键盘仅保留 [设计文档](packages/keyboard/README.md)。

## 自动签名发布

私钥配置在仓库 Actions Secret `FALCON_COMPONENTS_SIGNING_PRIVATE_KEY`，可信公钥见 [公钥文件](trust/release-public-key.json)。Actions 手动运行生成已签名测试产物；推送与根 package.json 版本一致的 `vX.Y.Z` 标签后，自动测试、打包、签名并创建 GitHub Release。

组件清单、目录和完整源码包分别签名，校验使用宿主预先固定的公钥。Release 另提供 component-catalog.sig.json，内含签署的源提交与各组件原始清单签名。按项目决定不做防回滚、过期检查或最高版本记录。发布、校验命令及密钥保管详见 [签名发布指南](docs/signing.md)。未签名的旧安装会被拒绝，迁移见 [接入指南](docs/getting-started.md)。

## 设备公共目录

示例目录为 `/userdisk/components/falcon-components/<组件>/<版本>/`，实际根目录由宿主配置。共享代码和资源，各应用分别维护运行时状态。

按版本保存代码与资源，各应用创建自己的实例；下载使用跨应用锁和临时目录。Node 示例验证完整流程；root 文件权限按已满足处理，Falcon 包外模块、样式和硬件兼容仍需验证。详见 [公共目录方案](docs/shared-components.md) 与 [宿主适配](docs/host-adapters.md)。

## 本地检查

使用 Node 18，推荐 18.20.8。npm ci 只连接仓库内的 workspace 包，没有外部运行时依赖：

```sh
npm ci
npm test
npm run check
npm run demo
```

首次 demo 输入 y 才从公开 GitHub Release 签名源下载 Hello；第二次可运行 `node examples/node-host/main.mjs --offline`。文件保存在 `.demo-device/signed-components/`，不会提交。demo 使用宿主 checkout 中的固定公钥，下载目录不能提供新公钥。

本地工具链可运行 `npm run check:falcon`，先配置 FALCON_CLI_PATH 指向自己的 aiot-vue-cli/src/cli.js；可选 FALCON_UI_PATH 指向 falcon-ui。编译输出位于忽略的 artifacts/，只用于源码/生产字节码检查，不是可运行 AMR 或真机证据。

## 开源与贡献

原创代码与文档采用 [MIT License](LICENSE)。项目不包含 Falcon SDK、固件、设备身份、私钥或第三方词库。引入外部引擎、字体和词库时，逐项记录来源与许可证，详见 [贡献指南](CONTRIBUTING.md) 和 [第三方资源说明](THIRD_PARTY_NOTICES.md)。

包目前保持 private，未发布 npm；使用 GitHub 克隆和本地源码包接入。参见 [实施路线](docs/roadmap.md) 和 [验证记录](docs/verification.md)。

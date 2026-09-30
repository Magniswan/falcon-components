# 示例

1. [node-host/main.mjs](node-host/main.mjs)：可直接运行的参考宿主。固定宿主公钥，首次前台确认下载、验证 GitHub Release 签名目录及组件清单、按签名 commit 安装 Hello，再次离线验签加载。使用 `npm run demo`。
2. [falcon-host/ComponentDemo.vue](falcon-host/ComponentDemo.vue)：嵌入现有 Falcon 页面的完整下载提示接线示例，逻辑屏幕尺寸和平台服务由宿主提供。
3. [falcon-host/component-host.js](falcon-host/component-host.js)：将公开公钥随宿主构建，构造验签器及管理器，并接入目标设备的密码、存储、网络和模块加载适配。
4. [keyboard-demo](keyboard-demo/README.md)：源码随 AMR 构建的独立键盘示例，已在 RK3562 上完成两种拼音布局、混合输入、触控容错和悬浮验收；提供本地构建与设备测试脚本。

接入步骤见 [getting-started.md](../docs/getting-started.md)。Falcon 示例是子组件和宿主工厂，需接入已有应用及真实平台接口；不是可以直接安装的 AMR。根页面必须转发生命周期，详见指南。

两个独立 AppID 的设备端验证仍待完成；当前行为测试覆盖两个管理器共享目录安装及实例状态隔离。新增应用示例时由开发者配置自己的 AppID、规范启动页和 SDK，避免复制生产身份或凭据。

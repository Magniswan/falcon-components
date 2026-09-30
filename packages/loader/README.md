# loader 0.2.0

提供 `createGitHubSource` 与 `createComponentManager`：本地检查、前台确认、GitHub 获取、大小/SHA-256 校验、安装锁、临时目录原子发布和组件实例创建。

source 和 manager 必须接收宿主 trust。默认使用 GitHub Release 签名目录，按签署的 commit 下载；manager 独立验证签名，保存原始清单与签名，离线 load 再次复核。无签名、未知公钥、签名错误均拒绝，旧普通 raw-file 参数不再支持。不做防回滚。

底层模块加载、文件读取和渲染由经过验证的宿主适配提供。不能把 Node fs、浏览器 fetch、Worker、WASM 或包外 import 当成所有 Falcon 固件的默认能力。

宿主可以按路径/版本缓存代码模块；每次 load 创建独立实例。输入等会话状态不放在共享模块缓存中。关闭界面不会自动卸载已加载模块。

实现入口为 `src/index.js`。契约见 [API](../../docs/api.md)、[宿主适配](../../docs/host-adapters.md) 和 [公共目录方案](../../docs/shared-components.md)。Falcon 真实设备的包外模块加载适配尚未验证。

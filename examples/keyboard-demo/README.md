# 可安装的独立键盘示例

[KeyboardDemo.vue](KeyboardDemo.vue) 展示宿主确认/取消、重复打开、底部覆盖和悬浮。逻辑尺寸通过 profile 传入。文本诊断默认关闭；只有测试构建显式设置 FALCON_DEMO_DIAGNOSTICS=1 时输出测试文本与状态。

## 引入已有应用

将 `KeyboardDemo.vue` 作为子组件，传入 `{ width, height }`。组件内部 import 使用仓库相对路径，可改为 keyboard 包 exports 对应的构建 alias。根 Page 的 onHide/onUnload 必须转发到 Vue 根页面，再由宿主调用键盘 cancel/dispose；参考下面的构建脚本生成的独立 App/Page。

## 构建独立 AMR

使用 Node 18.20.8 和开发者自己的 aiot-vue-cli 1.0.32 / falcon-ui。仓库不包含 SDK、工具链、字节码或 AMR。PowerShell 示例：

```powershell
$env:FALCON_CLI_PATH = '<你的 aiot-vue-cli/src/cli.js>'
$env:FALCON_UI_PATH = '<你的 falcon-ui 目录>'
$env:FALCON_DEMO_APPID = '<自己的未占用 16 位数字 AppID>'
$env:FALCON_LOGICAL_WIDTH = '<宿主逻辑宽度>'
$env:FALCON_LOGICAL_HEIGHT = '<宿主逻辑高度>'
& '<Node 18.20.8/node.exe>' scripts/build-keyboard-demo.mjs
```

输出在忽略的 `artifacts/keyboard-demo/`。构建脚本生成两个页面并关闭 single-js-bundle，以避免这个 CLI 单页面自动合包与目标固件的路径差异。生成的 blank 页用于保证普通多页面产物，应用默认进入 index。

## 安装及验收

ADB 鉴权由设备所有者完成，不需要重启设备。选择真实设备，先确认测试 AppID 未占用：

```powershell
& $env:ADB_PATH -s $env:ADB_SERIAL push '<生成的 AMR>' /tmp/falcon-keyboard-demo.amr
& $env:ADB_PATH -s $env:ADB_SERIAL shell 'miniapp_cli install /tmp/falcon-keyboard-demo.amr'
& $env:ADB_PATH -s $env:ADB_SERIAL shell "miniapp_cli start $env:FALCON_DEMO_APPID index"
```

这版固件的实际启动语法是 `start AppID index`，不要传 `--page index` 或 `--index`。install/start 返回 0 还不够，需要看到界面并完成输入/确认/取消。

已验证的 960 × 266 RK3562 profile 可运行 [设备行为验收脚本](../../scripts/test-keyboard-device.mjs)。测试构建需 FALCON_DEMO_DIAGNOSTICS=1，环境另需 FALCON_LOG_PATH 和实测触控偏移 FALCON_TOUCH_X_OFFSET。脚本只读取已知日志，使用 send_event 模拟触屏，并将结果保存在忽略的 artifacts/。脚本有固定验收坐标，其他设备需重新校准，不是通用触控驱动。

普通 miniapp capture 在该 profile 上出现条纹。可用目标 sysroot 编译 [device-probe.c](../../scripts/device-probe.c)，推入 `/tmp/falcon-component-device-probe` 后运行 [DRM 截图脚本](../../scripts/capture-keyboard-device.mjs)；截图脚本会读取当前 miniapp framebuffer ID，不复用双缓冲的旧 ID。它需要配置 PYTHON_PATH（含 Pillow）和 FALCON_DRM_CROP_Y，截图只做读映射，不修改 DRM 显示配置。

实机结果、已验证映射和未验证项见 [验收记录](../../docs/keyboard-device-acceptance.md)。下载签名框架仍是另一条独立接入路径，此示例不冒充已实现的设备公共目录加载器。

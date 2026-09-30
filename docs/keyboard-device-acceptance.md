# keyboard 0.1.0 实机验收

日期：2026-10-01（Asia/Shanghai）。目标为已连接的真实 RK3562 / AArch64 / 1GB 词典笔，Buildroot 2021.11、Linux 5.10.160。没有使用 Android 模拟器，也没有重启词典笔。记录省略设备序列号、账号和私有业务配置。

## 构建与安装

- Node 18.20.8；外部提供的 aiot-vue-cli 1.0.32、falcon-ui；QuickJS 20200705 / bigNum=false。
- 独立示例 AppID 由环境输入，并先检查安装目录；没有安装到 CloudBrowser 的 AppID。
- 组件逻辑、Panel 和字词数据随测试 AMR 编译。包内 app.js.bin/index.js.bin/blank.js.bin 由官方构建工具产生；install/start 实际返回 ret:0。
- 单页面 CLI 自动合包曾导致页面路径兼容问题，最终生成两个页面、关闭 single-js-bundle。固件实际接受 `miniapp_cli start AppID index`；带 --page/--index 会被当作页面名，不能使用。
- AMR、字节码、工具链和 SDK 只放忽略的 artifacts 或外部目录，不提交。

## 实际输入与生命周期

通过设备 send_event 向 hyn_ts 输入事件，再由 Falcon Vue touch/click 事件进入键盘；测试读取示例状态日志并核对结果，而非直接调用 keyboard.press。

| 场景 | 实际结果 |
| --- | --- |
| 九宫格 | 输入 64426，候选出现“你好”；点按候选写入草稿 |
| 26 键 | 输入 zhongguo，候选出现“中国”；点按后草稿为“你好中国” |
| 混合输入 | 继续输入 abc、123 和中文逗号，确认结果为“你好中国abc123，” |
| 换行/删除 | 换行写入 \n；删除移除该换行；确认是独立功能键 |
| 取消 | 重新打开后输入 x 再取消，返回先前确认的原文 |
| 字母边缘容错 | 点按 q/w 之间间隙，产生 q；数字间隙不产生数字 |
| 移动取消 | 从 a 移动到邻键区域后松开，草稿不变 |
| 长按删除 | 850ms 按住删除产生多次删除；松开后再等 500ms，文本不继续变化 |
| 重复开关 | 连续五次取消/打开，最后仍可用且组合状态重新初始化 |
| 悬浮 | 宿主矩形 x=90,y=40,width=780,height=226 内显示；矩形外的宿主按钮能切回底部布局 |

通过 [test-keyboard-device.mjs](../scripts/test-keyboard-device.mjs) 复现。事件采样证实 root touchstart/end 的 screenX/screenY 是宿主逻辑坐标；Panel 对 floating 的 bounds 偏移进行减法后命中按键。touchcancel/候选异步冻结/多实例隔离还包含纯逻辑测试，不将纯逻辑结果当作物理手指验收。

## 本机 profile 映射与截图

Falcon 逻辑尺寸 960 × 266，direction/tp_direction=270，tp_xoffset=113，tp_yoffset=0。实际发送 raw=(258,120) 收到 logical=(839,145)，raw=(234,838) 收到 logical=(121,121)，从实测得出该 profile 的映射：

```text
rawX = logicalY + 113
rawY = 959 - logicalX
```

该方向与旧测试工具的经验公式不同；其他固件必须重新采样，不能照搬。映射在测试工具中，组件只处理宿主归一化坐标。

普通 miniapp_cli capture 虽返回 0，却产生条纹；captureFB 返回 -1。最终读取当前 miniapp AR24 DRM framebuffer，按 480 × 960、pitch=1920 解释 BGRA，旋转 270° 后裁剪 y=107..373。双缓冲 framebuffer ID 会变化，必须读取当前 ID。截图工具只读取现有图层，不 modeset、不改变图层配置。

验收截图见 [九宫格](evidence/keyboard-t9.png)、[26 键](evidence/keyboard-qwerty.png) 和 [悬浮](evidence/keyboard-floating.png)。这些只展示独立测试应用。

## 性能与证据边界

早期全量 TSV 拆分初始化约 8.4 秒；改为构建时排序、运行时 JSON.parse 后，词库初始化样本为 1276ms。首次九宫格单键候选查询样本为 73ms，长组合查询更短；这是 CPU 路径的一次程序计时，不是端到端触控延迟或稳定 P95 指标。

普通打开复用该实例的词库；关闭只清输入会话，卸载 dispose 释放词库引用。未做持续功耗、长时间峰值内存或正式泄漏统计；miniapp 全局 QuickJS/RSS 包含其他应用，不能当作单键盘占用。

全部 64 项行为测试通过，其中 11 项键盘测试覆盖编辑边界、候选查询、晚到结果、按下冻结、候选移动取消、定时器释放、观察者异常和会话隔离。仓库检查与 git diff --check 在提交前执行。

## 已完成与仍未验证

已完成的接入方式是 **源码随宿主 AMR 构建**，键盘不依赖系统输入法。现有签名框架与固定宿主公钥没有改动，也没有加入绕过验签的远程加载路径。

公共目录 Falcon 原生验签、文件/锁/网络适配、包外 Vue 模板与样式加载、两个 AppID 复用、KMS/视频硬件叠加、其他屏幕 profile 和 NPU 候选模型尚未验证。键盘暂不加入 GitHub catalog；这些边界不能由本次可见 UI 和输入通过推导为已支持。

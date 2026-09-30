# RK3562 设备探测与键盘规划证据

日期：2026-09-30（Asia/Shanghai）。通过 ADB 探测已连接的真实词典笔。以下是本次设备的配置与运行快照，不代表所有 RK3562 固件。没有安装或启动新 mini-app，没有修改屏幕配置、替换系统运行库或重启设备；设备序列号与私有身份不记录。

## 设备与显示

| 项目 | 本次读取结果 |
| --- | --- |
| SoC / 架构 | device-tree 声明 rockchip,rk3562；uname -m 为 aarch64 |
| 系统 | Buildroot 2021.11；Linux 5.10.160 |
| 内存 | MemTotal 1016288 KiB，约 992.5 MiB；系统配置约 512 MiB swap |
| 物理显示模式 | DRM DSI 报告 480×960 |
| Falcon 配置的逻辑画布 | 960×266；direction / tp_direction 均为 270 |
| Falcon 配置的偏移 | screen xoffset=0、yoffset=107；tp_xoffset=113、tp_yoffset=0 |
| 触摸设备 | hyn_ts；声明 ABS_MT_SLOT、TOUCH_MAJOR、WIDTH_MAJOR、POSITION_X/Y、TRACKING_ID |
| 公共存储 | /userdisk 本次可用约 8.6 GiB |

显示参数来自设备配置与 DRM 状态，尚未通过独立键盘页面的触摸采样验证映射。宿主应传入逻辑尺寸和已经归一化的坐标，键盘不能重复旋转或把本表数值作为通用默认值。Linux 输入设备声明接触面积能力，不证明 Falcon 会将它提供给 Vue 事件。

## NPU 实际推理

| 项目 | 证据 |
| --- | --- |
| 内核驱动 | renderD129 绑定 RKNPU；debugfs 报告 driver v0.9.1 |
| 板载 Runtime | librknnrt 1.5.1b18，构建标识 3aa716819；librknn_api.so 指向它 |
| 测试工具 | 固件自带 /usr/bin/rknn_common_test；参数为 model_path、input_path、可选 loop_count |
| 板载模型首次测试 | RK356X/mobilenet_v1.rknn 加载失败；提示模型为 RK3566，当前平台为 RK3562；rknn_init 返回 -6 |
| 对照模型 | Rockchip 官方 v1.6.0 仓库中的 RK3562/mobilenet_v1.rknn；固定提交 b25dadacc24b88eb7dfcaa47c9c525ecca89b319 |
| 模型完整性 | 4484726 字节；Git blob e00058caf0c8c6f6bf72f136fbb34b28ce469649；SHA-256 6a619867a76f6032e56fb143a99dfa71eede8e8df910fb903af1e8125ecb35bd，本机与设备一致 |
| 成功结果 | 固件自带 dog_224x224.jpg；loop_count=1、15 秒超时；初始化与推理成功并输出 Top5；工具报告该次 Elapse Time=15.49ms |
| 临时文件清理 | 模型只放入新建 /tmp 测试目录；之后删除模型与空目录，并确认目录不存在 |

模型见 [固定提交中的官方 RK3562 模型](https://github.com/airockchip/rknn-toolkit2/blob/b25dadacc24b88eb7dfcaa47c9c525ecca89b319/rknpu2/examples/rknn_common_test/model/RK3562/mobilenet_v1.rknn)，调用方式见 [官方测试说明](https://github.com/airockchip/rknn-toolkit2/blob/v1.6.0/rknpu2/examples/rknn_common_test/README_CN.md)。原生示例不是本仓库的组件加载器，没有验证 Falcon 原生推理桥接或组件签名加载。

15.49ms 仅是单次 MobileNet 的程序计时，不包含键盘处理与渲染，不能作为拼音模型的延迟、持续吞吐、峰值内存或功耗证据。此次证明现有驱动与 Runtime 能执行一个匹配平台的公开模型；不能推导其他新 SDK 模型都兼容旧 Runtime。

## 内存采样边界

首次 MemAvailable 为 194332 KiB，约 189.8 MiB。系统 miniapp_cli memoryApp 名称看似查询，实际输出 before/after trim，触发了空闲堆整理；发现后不再调用。后续只读取 /proc 和进程 RSS，MemAvailable 约 296 MiB。BusyBox ps 的 miniapp RSS 从约 694 MiB 变化至约 587 MiB；RSS 含共享页，不能视为单个组件的私有占用。

这不是干净冷启动基线，也没有测到测试进程的峰值内存。后续应记录采样时刻与当前运行状态，避免用带 GC/trim 副作用的诊断命令制造内存预算。

## 对键盘设计的影响

- 第一版规划九宫格与 26 键拼音、英文、数字和符号；UI、编辑核心与引擎分离，见 [键盘设计](../packages/keyboard/README.md)。
- 先用 CPU 实现几何命中、边缘容错和点击/拖动/取消状态处理。保留落点及相邻键信息，再生成拼音纠错候选；数字、密码和功能键使用明确的命中规则。
- 按下反馈与基础候选不等待 AI。AI 是可选排序后端；拒绝旧会话结果，候选按下期间冻结列表，避免异步重排造成选错。
- 模型、词库和缓存上限应由实际可用内存确定。任务模型的权重、训练数据许可和量化准确率尚未选定或验证。
- 模型与词库资源纳入现有组件清单与签名；推理能力由宿主提供异步接口，其他设备使用自己的后端或基础拼音路径。

## 仍需验证

1. 独立 Falcon 示例的 touchstart/move/end/cancel、坐标范围、旋转与悬浮区域偏移；能力声明不能代替 Vue 事件采样。
2. 公共目录中的 Vue 组件、模板和样式加载，以及关闭、再次打开与卸载后的资源释放；此次没有执行包外 UI 加载。
3. Falcon 原生验签、文件、锁、资源读取和推理桥接；此次未完成这些适配器。
4. 拼音引擎与可分发词库的选型、九宫格消歧和候选质量；此次未引入第三方键盘代码或词库。
5. 任务模型转换、CPU/NPU 对照、完整输入延迟、内存峰值、功耗及与其他功能并行运行。

键盘仍处于规划阶段。本记录更新硬件证据，不改变 [实施路线](roadmap.md) 中尚未通过的宿主接入与组件验收条件。

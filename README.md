# falcon-components

面向 Falcon/Vue 词典笔应用的开源组件库。键盘是第一个规划中的组件，后续可增加弹层、日历、图表等组件。

**当前状态：仓库结构和设计文档已经建立，尚未实现可运行的键盘或共享目录加载器。请勿将设计接口当作已发布 API。**

## 目标

- 组件与业务解耦，通过属性、事件和小型宿主适配接口接入。
- 支持不同词典笔型号，由宿主传入逻辑尺寸和平台能力。
- 组件可独立维护版本，安装一个组件无需引入整个库。
- 同时规划源码随应用构建、设备公共目录按需加载两条接入路径。
- 文档、纯逻辑验证、构建验证和真机证据分别记录。

## 仓库结构

```text
packages/
  core/                 公共接口和组件描述约定
  loader/               共享目录加载适配，待实现
  keyboard/             键盘组件、编辑核心和拼音引擎，待实现
examples/
  README.md             示例应用规划
docs/
  architecture.md       多组件结构和宿主边界
  shared-components.md  设备公共目录与兼容性约定
  roadmap.md            实施顺序和验证条件
scripts/
  check-repository.mjs   仓库结构、清单和文档链接检查
```

## 第一个组件：键盘

规划支持离线全拼、常用字词候选、英文、数字、符号、长按删除、确认和取消。显示模式包含底部覆盖、悬浮和宿主布局避让；键盘外区域可选择继续操作、阻止操作或点击关闭。

详见 [键盘设计](packages/keyboard/README.md)。

## 设备公共目录

示例目录为 `/userdisk/components/falcon-components/<组件>/<版本>/`，实际根目录由宿主配置。共享代码和资源，各应用分别维护运行时状态。

当前尚未验证 Falcon 对包外绝对路径模块的加载、QuickJS 字节码兼容和外部组件样式注册。root 文件访问权限按已满足处理，运行时加载仍需验证。详见 [公共目录方案](docs/shared-components.md)。

## 本地检查

使用 Node 18，推荐 18.20.8。当前检查不依赖第三方包，无需先安装依赖：

```sh
node scripts/check-repository.mjs
```

也可运行 `npm run check`。这些检查只验证仓库骨架，不构成 UI、动态加载或设备兼容性证明。

## 开源与贡献

原创代码与文档采用 [MIT License](LICENSE)。项目不包含 Falcon SDK、固件、设备身份、私钥或第三方词库。引入外部引擎、字体和词库时，逐项记录来源与许可证，详见 [贡献指南](CONTRIBUTING.md) 和 [第三方资源说明](THIRD_PARTY_NOTICES.md)。

参见 [实施路线](docs/roadmap.md)。

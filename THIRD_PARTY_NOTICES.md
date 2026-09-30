# 第三方资源说明

拼音引擎与 workspace 代码为本仓库原创 MIT 代码，没有外部运行时依赖；Node 参考适配使用 Node 内置模块。keyboard 离线词库单独采用 Apache-2.0。

| 资源 | 来源与版本 | 许可与分发内容 |
| --- | --- | --- |
| rime-pinyin-simp 字词数据 | https://github.com/rime/rime-pinyin-simp ，提交 0c6861ef7420ee780270ca6d993d18d4101049d0 | Apache-2.0；上游 AUTHORS 记录源自 Android Pinyin IME。保留 YAML、LICENSE、AUTHORS，并生成全拼/T9 索引数据；未包含 Rime 引擎代码 |

原始许可、来源哈希、生成方法见 [keyboard/data](packages/keyboard/data/README.md)。MIT 根许可不覆盖该词库数据的原始许可。

Falcon 编译检查使用开发者本地提供的 aiot-vue-cli 和 falcon-ui，不将这些工具或 SDK 随仓库分发。

后续引入资源时，在此记录名称、来源 URL、锁定版本或提交、许可证及分发所需声明。输入引擎和词库分别记录，不能仅依据引擎的许可证判断词库的分发条件。

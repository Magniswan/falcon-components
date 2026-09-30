# 验证记录

## 0.1.0 框架

日期：2026-09-30。框架代码提交：`f8d4d69`。环境：Windows、Node 18.20.8；Falcon 编译工具为本地 aiot-vue-cli 1.0.32，检查产物使用 QuickJS 20200705 / bigNum=false。

| 证据层 | 结果 |
| --- | --- |
| 行为测试 | 32 项通过；覆盖前台确认前零更新源请求、取消、重试、损坏内容拒绝、两个管理器串行安装、实例隔离、目录边界、安装锁与释放错误 |
| 仓库检查 | 包入口、文档链接、JSON、JS 语法、目录文件大小和 SHA-256 通过 |
| Git 内容一致性 | 暂存区实际 Git blob 的字节数和 SHA-256 与 Hello 清单匹配，避免 Windows 换行转换导致线上校验失败 |
| GitHub 实际下载 | 新目录运行 Node 示例，前台明确接受下载后，从公开 main 源获取目录、清单与 Hello，校验安装并显示问候语 |
| 本地离线复用 | 再次运行 --offline；网络接口明确禁止请求，仍从已安装版本加载成功 |
| 独立接入 | 从公开 GitHub 新克隆执行 npm ci 和仓库检查；另建独立消费者项目，通过本地包依赖安装并导入 core、loader、ui 成功 |
| Falcon 编译 | 下载提示、示例页面、宿主工厂和框架被本地工具链编译为生产 QuickJS 字节码；产物仅用于编译检查 |
| 词典笔运行 | 本轮未安装或运行设备应用；实际平台适配、包外模块加载、UI 触控、样式注册和 KMS 叠加尚未验证 |

复现命令见 [接入指南](getting-started.md)。Falcon 编译入口是 `scripts/check-falcon-build.mjs`，需要本地工具链；仓库不分发 SDK 或字节码。

本记录覆盖原创框架和 Hello 示例，不覆盖键盘、npm 发布、GitHub Release assets、断电可靠性或所有固件兼容性。

## 0.1.1 签名发布链路

日期：2026-09-30。工具提交：`290c087966156040b8bdbfdbf4dff1ea21c9ad1f`。根版本 0.1.1，运行时 workspace 包仍为 0.1.0；键盘占位仍为 0.0.0。

| 证据层 | 结果 |
| --- | --- |
| 密钥配置 | 生成独立 Ed25519 密钥；本机私钥在仓库外，目录 ACL 只保留当前用户和 SYSTEM；仓库与产物均没有私钥 |
| GitHub Secret | REST API 创建 FALCON_COMPONENTS_SIGNING_PRIVATE_KEY，返回 201；只读取名称和更新时间元数据，Edge 设置页确认存在；没有触发 2FA |
| 可信公钥 | SPKI DER SHA-256 / keyId 为 c3973877c8490a7faa03d99dd6bf70367b00d767bc88ef5fc6f9d7f4ca252955；已提交公钥 JSON |
| 本地行为测试 | 37 项通过，其中 5 项签名行为测试覆盖原始字节/用途绑定、错误密钥、错误编码、超限、路径逃逸、篡改、额外未列出的文件和归档验证 |
| 仓库与工作流检查 | 文档链接、代码语法、catalog 哈希、git diff --check 通过；两个 workflow 的 YAML 解析、重复键检查和 Actions 完整 SHA 固定检查通过 |
| 本地真实打包 | 使用仓库外正式私钥，从干净 Git commit 构建；归档及解压后 62 个文件通过固定公钥验签 |
| GitHub Actions CI | [Framework checks](https://github.com/Magniswan/falcon-components/actions/runs/36697233914) 成功 |
| GitHub Actions 签名 | [Signed component release 手动运行](https://github.com/Magniswan/falcon-components/actions/runs/36697277544) 成功；执行测试、读取 Secret 签名、公钥验签并上传 signed-release artifact |
| 线上产物独立复核 | 下载 Actions ZIP，SHA-256 与 GitHub artifact digest 一致：ea50c8fb307ed17811404fd7a3c8d5a622a735dee8e617ec478b8b77d3e98289；本机使用宿主 checkout 的公钥验证归档，再解压验证 62 个文件成功 |
| 正式 GitHub Release | 已配置版本标签触发发布 job；本次手动运行按设计跳过 publish，未创建正式版本标签或 GitHub Release |
| 宿主/设备安全 | 现有 loader 尚未消费签名；Falcon 原生验签、加载前复核、离线复核和真机篡改拒绝尚未实现或验证 |

按用户选定范围不做防回滚或过期策略；上述签名证明产物来源和完整性，不能当作设备强制验签已完成的证据。操作与消费者校验示例见 [签名发布指南](signing.md)。

## 0.2.0 强制验签与公开发布

日期：2026-09-30。正式源码与注释标签 v0.2.0 指向 `235345cfdabf28e291bcc9e1466bfaf8057bc34a`。core、loader、ui、node-adapter 均为 0.2.0；Hello 的原始 0.1.0 文件未改写，keyboard 保持占位。

| 证据层 | 结果 |
| --- | --- |
| 本地行为测试 | 53 项通过，包括 16 项宿主强制验签测试；覆盖改写代码与清单哈希、替换签名 payload、未知密钥、植入公钥、旧无签名安装、移除签名、目录/清单混用、仓库身份、原始字节、UTF-8/Base64、密码接口异常与取消 |
| 无防回滚 | 测试确认接受有效旧签名目录，不保存最高版本、目录序号、过期时间或设备绑定状态 |
| 仓库/工作流检查 | 文档链接、语法、目录哈希、git diff --check 和两个 workflow 的 YAML/完整 SHA 固定检查通过 |
| Falcon 编译 | 使用本地 aiot-vue-cli 1.0.32、Node 18.20.8，宿主内公钥 JSON、portable 签名协议、加载器和 Vue 示例编译为生产 QuickJS 20200705 / bigNum=false 字节码；未安装设备或生成可分发 AMR |
| 本地正式签名产物 | 干净已提交源码构建；归档、全部 67 个分发文件及宿主“确认下载 → 验签安装 → 离线复用” smoke check 通过 |
| GitHub CI | [Framework checks](https://github.com/Magniswan/falcon-components/actions/runs/36702437969) 通过 |
| GitHub 手动签名检查 | [Signed component release 手动运行](https://github.com/Magniswan/falcon-components/actions/runs/36702439167) 成功，包含强制验签宿主 smoke check |
| 正式标签发布 | [标签触发的签名及发布流程](https://github.com/Magniswan/falcon-components/actions/runs/36702597326) 的 build 与 publish 均成功；[v0.2.0 Release](https://github.com/Magniswan/falcon-components/releases/tag/v0.2.0) 公开提供四个预期附件 |
| 实际公开源安装 | Node 示例在新目录前台明确确认后，获取 v0.2.0 的公开签名目录，并按签署 commit 下载、验签安装 Hello；显示问候语成功 |
| 实际离线加载 | 随后 --offline 禁止所有网络方法，仍验证本地清单签名与文件并成功加载 |
| 实际篡改拒绝 | 对上述真实下载的安装同时改写 hello.mjs、清单里的大小/哈希和 signature.payload，保留旧签名；离线示例返回退出码 1，显示“组件签名校验失败，已拒绝加载”；恢复原始字节后离线加载再次成功 |
| 公开附件独立复核 | 不使用 GitHub 登录下载四个 Release 附件，本机用宿主 checkout 公钥验证归档并解压检查全部 67 个文件成功；源码 commit 与标签一致 |
| 设备原生/硬件 | 尚未实现具体固件的密码/文件/锁/包外加载桥接，未做词典笔安装与真机篡改测试；这属于设备宿主适配阶段，不等于通用框架验签未接入 |

公开归档 SHA-256：`422368615fb6ea7489e3e03881b3ce7168beaf95e516ede1d1a523d0a1ee6c98`。
公开签名目录 SHA-256：`0cf74263e0cef837e14bbea45e975e9bfa540ddc3aae1c72f5725542fc544715`。

公开签名目录为 1842 字节；设备下载单个组件无需解压完整库。可信 keyId 仍为 0.1.1 的固定公钥，未轮换私钥或公钥。归档压缩字节会因构建平台的 tar 元数据而与本机包不同，均验证其各自签名；不能用本机 tar.gz 的摘要替代正式附件摘要。

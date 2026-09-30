# node-adapter 0.2.0

Node 18 参考宿主适配器，用于在电脑上运行完整下载、安装和加载示例。包含受控目录读写、SHA-256、跨进程目录锁、有限大小与超时的 fetch 网络适配，以及普通 ESM 加载。

createNodeCrypto 提供原始公钥/消息/签名的 Ed25519 校验；createNodeSignatureVerifier({ trustedKeys }) 创建宿主验签器，密码运算使用 node:crypto。可信公钥由宿主配置，不读设备组件目录中的公钥。

此包使用 Node API，不可加入词典笔应用。设备契约见 [host-adapters.md](../../docs/host-adapters.md)。

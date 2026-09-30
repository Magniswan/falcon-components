# core 0.2.0

提供组件 ID、精确版本、清单、接口/运行时兼容性、路径和文件大小校验，以及可移植的取消 token 与稳定错误码。

createSignatureVerifier 固定宿主公钥，通过注入的成熟密码实现验证 Ed25519 签名；严格解析 Base64 与 UTF-8，不依赖浏览器或 Node 全局 API。

组件代码依赖宿主的 Vue/Falcon 渲染环境，不为每个组件携带另一份 Vue。公共核心不引入键盘、图表或业务服务；仅使用某个组件时，不加载整个组件库。

实现入口为 `src/index.js`，无 Node 或浏览器依赖。详见 [API](../../docs/api.md) 与 [整体架构](../../docs/architecture.md)。

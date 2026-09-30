# ui 0.2.0

提供可移植的 `createComponentSession` 和 Falcon/Vue 2 的 `ComponentDownloadPrompt.vue`。

缺失组件时前台显示下载/取消，确认后显示进度，失败可重试或关闭。提示源码随宿主应用构建；不把提示本身设为需要下载的组件。小屏提示使用有尺寸的 scroller，操作区可滚动到。

签名错误显示拒绝加载原因，不提供“仍然安装”。会话成功进入 ready 前，管理器必须完成验签与文件校验。

接口见 [API](../../docs/api.md)，生命周期和页面示例见 [接入指南](../../docs/getting-started.md)。编译通过不等于真机触控或 KMS 叠加通过。

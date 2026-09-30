# keyboard（待实现）

## 第一版范围

离线全拼、常用字词候选与翻页、英文大小写、数字和符号、光标移动、删除与长按删除、确认和取消。整句输入、模糊音、纠错和个性化学习属于后续能力。

## 结构

- Vue UI：按键、候选栏、编辑区和显示布局。
- 编辑核心：草稿、光标、选择范围、字符边界和长度限制。
- 可替换拼音引擎：组合、拼音切分、候选查询和选择。
- 词库：基础词库与可选扩展词库，分别维护来源和版本。

宿主提供逻辑尺寸、资源读取和可选的用户词频存储。组件不处理浏览器导航、网络认证或业务提交。原型先评估轻量 JavaScript 引擎；必要时另行评估原生引擎适配。

## 建议接口（尚未实现）

```js
const keyboard = await host.loadComponent('keyboard', { version: '1.0.0' });
const result = await keyboard.open({
  value: initialText,
  mode: 'pinyin',
  presentation: 'bottom-overlay',
  bounds: { x, y, width, height },
  outsideAction: 'interact',
});
if (result.confirmed) saveText(result.text);
```

取消、关闭、切页和卸载需有清晰语义；取消不修改原值。草稿和未选词拼音分别维护；旧查询不写入新会话。长按删除在 touchcancel、关闭和卸载时停止。

## 显示

- bottom-overlay：覆盖底部，不自动改变宿主布局。
- floating：在宿主指定矩形内显示，拖动可后续增加。
- inset：向宿主报告占用区域，由宿主让输入框避让。

键盘外触控可选择 interact、block 或 dismiss。透明容器不保证触摸穿透，命中范围需独立验证。小屏高度不足时选择紧凑或全屏布局，不将全键盘机械缩小。

## 验证

纯逻辑验证文本/拼音状态、Unicode 删除边界、候选顺序和会话取消；真机测首次打开、按键延迟、候选查询、内存和重复开关。叠加硬件视频时实测 hole/KMS 图层和触控，不用 CSS z-index 或模拟器代替硬件证据。

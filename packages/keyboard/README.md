# keyboard 0.1.0

离线九宫格和 26 键全拼键盘，支持 65,125 条字词、候选翻页、英文大小写、数字符号、光标移动、删除/长按删除、换行、确认和取消。源码随宿主 AMR 构建路径已在 RK3562/Falcon 真机上验证，详见 [实机验收](../../docs/keyboard-device-acceptance.md)。包保持 private，尚未发布 npm 或加入远程组件 catalog。

## 接入

```js
import { createOfflineKeyboard } from '@falcon-components/keyboard/offline';
import KeyboardPanel from '@falcon-components/keyboard/panel';

const keyboard = createOfflineKeyboard();
// Vue: components: { KeyboardPanel }, template: <keyboard-panel :keyboard="keyboard" />
const result = await keyboard.open({
  value: initialText,
  mode: 'pinyin',
  layout: 't9', // qwerty 也支持
  presentation: 'bottom-overlay', // floating 或 inset
  bounds: hostKeyboardBounds, // { x, y, width, height }，宿主逻辑坐标
  multiline: true,
});
if (result.confirmed) saveText(result.text);
// 隐藏/切页时 keyboard.cancel()；卸载时 keyboard.dispose()。
```

接入 Falcon 构建工具时，可以直接使用相对源码路径，或配置 alias 指向上述入口。宿主需提供足够的矩形区域（至少 240 × 190 逻辑像素；较窄屏幕建议九宫格），并把 Panel 放入覆盖目标区域的父容器。组件不读取全局屏幕、不选择 AppID，也不调用系统输入法。

完整示例及独立 AMR 构建方法见 [keyboard-demo](../../examples/keyboard-demo/README.md)。

## API

`createKeyboard({ engine, timers?, onInset? })` 可注入其他词库/查询引擎。`engine.query(composition, { layout, limit })` 返回候选数组或 Promise，候选包含 `{ id, text, consumed }`。晚到结果不会更新新会话。`createPinyinEngine(lexicon)` 是默认离线引擎，`createOfflineKeyboard()` 已包含引擎及其释放。

| 方法 | 行为 |
| --- | --- |
| open(options) | 返回 Promise<{ confirmed, text }>；打开新会话先取消旧会话 |
| cancel / dispose | 取消返回原文；dispose 清订阅、定时器并禁止重新打开 |
| snapshot / subscribe | 返回状态快照；subscribe 立即通知并返回 off |
| press(value) | 逻辑输入或功能键；Panel 已连接触控 |
| setMode(mode) | pinyin / english / number / symbol；清空未选词组合 |
| setLayout(layout) | t9 / qwerty；布局变更清空组合 |
| select(index) / page(direction, count) | 选候选/翻页；Panel 自动按宽度显示 3 或 6 个 |
| touchStart / touchMove / touchEnd / touchCancel | 注入归一化、相对 Panel 的 { x, y, id } |
| outside() | 宿主在键盘外调用，返回 interact / block / dismiss，dismiss 取消 |

open 还接受 `maxLength`（默认 4096 个受支持的字符簇）、`outsideAction`（默认 interact）。确认有组合时采用首候选；没有匹配时保留原始组合。长度已满时插入不生效。普通单行模式的换行键不插入换行；确认键始终独立。

默认编辑器处理代理对、常见组合音标、emoji 修饰符、ZWJ 和旗帜；不宣称实现完整 UAX #29 语言分段。

## 显示与触控

- bottom-overlay/floating 都使用宿主矩形内的 Falcon Vue UI；floating 第一版不支持拖动。
- inset 通过 onInset(bounds/null) 报告占用区域，由宿主调整其他内容。
- Panel 只占用指定矩形；外部 block/dismiss 策略由宿主接线，不能依靠透明全屏容器穿透触控。
- 几何容错覆盖字母和拼音键间的 4px 间隙；移动超过 18px、触控取消或越界松开不会输入。数字、符号及功能键不使用间隙修正。
- 候选按下期间保持原选择；移动取消选择。长按删除 450ms 后开始，每 90ms 重复，松开/隐藏/卸载清理。

第一版尚无模糊音、整句输入、语言纠错、个人落点学习或 NPU 排序。词库许可见 [数据说明](data/README.md)。

## 接入边界

当前实机通过的是源码随 AMR 构建的组件。公共目录的签名加载由宿主框架与适配器负责，Falcon 原生适配及包外 Vue 样式加载仍待验证；不能据此把这个键盘称为已支持设备公共目录热更新。普通 Vue 悬浮已验证，KMS/视频硬件图层叠加未验证。

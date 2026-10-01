<template>
  <div class="demo" :style="pageStyle">
    <text class="title">Falcon 键盘 · 独立组件</text>
    <text class="result" :style="resultStyle">{{ message }}</text>
    <div class="open" @click="open()"><text class="open-text">打开键盘</text></div>
    <div class="floating" @click="float"><text class="open-text">悬浮</text></div>
    <keyboard-panel :keyboard="keyboard" @touch-diagnostic="diagnostic" />
  </div>
</template>
<script>
import { createKeyboard } from '../../packages/keyboard/src/index.js';
import { createPinyinEngine } from '../../packages/keyboard/src/pinyin.js';
import lexicon from '../../packages/keyboard/data/lexicon.js';
import KeyboardPanel from '../../packages/keyboard/src/KeyboardPanel.vue';

export default {
  components: { KeyboardPanel },
  props: { profile: { type: Object, required: true }, diagnostics: { type: Boolean, default: false } },
  data() {
    const start = Date.now();
    const engine = createPinyinEngine(lexicon);
    console.warn('[keyboard-demo] lexicon init ms=' + (Date.now() - start));
    const diagnostics = this.diagnostics;
    return { keyboard: createKeyboard({ engine: { query(input, options) { const began = Date.now(); const result = engine.query(input, options); if (diagnostics) console.warn('[keyboard-demo] query length=' + input.length + ' ms=' + (Date.now() - began)); return result; } } }), engine, message: '九宫格 / 26 键 · 中文、英文、数字、符号', value: '', released: false };
  },
  computed: {
    pageStyle() { return { width: `${this.profile.width}px`, height: `${this.profile.height}px` }; },
    resultStyle() { return { width: `${this.profile.width - 240}px` }; },
  },
  mounted() {
    console.warn('[keyboard-demo] ready ' + JSON.stringify(this.profile));
    if (this.diagnostics) this.unsubscribe = this.keyboard.subscribe((state) => {
      console.warn('[keyboard-demo] state ' + JSON.stringify({ visible: state.visible, mode: state.mode, layout: state.layout, text: state.text, composition: state.composition, bounds: state.bounds, keys: state.keys, candidates: state.candidates.slice(0, 4).map((item) => item.text) }));
    });
    this.open();
  },
  beforeDestroy() { this.release(); },
  methods: {
    diagnostic(value) { if (this.diagnostics) console.warn('[keyboard-demo] touch ' + JSON.stringify(value)); },
    async open(presentation = 'bottom-overlay') {
      if (this.released) return;
      const floating = presentation === 'floating';
      const width = Math.min(this.profile.width, 560);
      const height = Math.min(this.profile.height, 178);
      const bounds = { x: Math.round((this.profile.width - width) / 2), y: Math.max(0, this.profile.height - height - (floating ? 12 : 0)), width, height };
      console.warn('[keyboard-demo] open ' + presentation);
      const result = await this.keyboard.open({ value: this.value, mode: 'pinyin', layout: 't9', presentation, bounds, multiline: true });
      if (this.released) return;
      if (result.confirmed) this.value = result.text;
      this.message = result.confirmed ? '已确认：' + result.text : '已取消；原文本保持不变';
      if (this.diagnostics) console.warn('[keyboard-demo] result ' + JSON.stringify(result));
    },
    float() { this.open('floating'); },
    onHide() { this.keyboard.cancel(); },
    onUnload() { this.release(); },
    release() { if (this.released) return; this.released = true; if (this.unsubscribe) this.unsubscribe(); this.keyboard.dispose(); this.engine.dispose(); },
  },
};
</script>
<style>
.demo { background-color: #f9faf7; }
.title { position: absolute; top: 6px; left: 10px; font-size: 19px; color: #313b35; }
.result { position: absolute; top: 42px; left: 10px; font-size: 18px; color: #768178; }
.open { position: absolute; right: 12px; top: 4px; width: 110px; height: 30px; background-color: #47785a; border-radius: 5px; align-items: center; justify-content: center; }
.floating { position: absolute; right: 130px; top: 4px; width: 70px; height: 30px; background-color: #768178; border-radius: 5px; align-items: center; justify-content: center; }
.open-text { font-size: 16px; color: #ffffff; }
</style>

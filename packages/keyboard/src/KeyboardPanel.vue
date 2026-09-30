<template>
  <div v-if="state.visible" class="keyboard-panel" :style="panelStyle" @touchstart="start" @touchmove="move" @touchend="end" @touchcancel="cancelTouch">
    <div class="draft-row" :style="headerStyle">
      <text class="draft-text" :style="draftStyle">{{ state.displayText }}</text>
      <div class="cancel-button" @click="keyboard.cancel()"><text class="cancel-text">取消</text></div>
    </div>
    <div class="candidate-row" :style="candidateRowStyle">
      <text class="composition" :style="compositionStyle">{{ state.composition || '拼音 / English' }}</text>
      <div v-for="(candidate, index) in visibleCandidates" :key="candidate.id" class="candidate" :style="candidateStyle(index)" @touchstart="hold(index, $event)" @touchmove="moveCandidate" @touchend="choose" @touchcancel="cancelCandidate">
        <text class="candidate-text">{{ candidate.text }}</text>
      </div>
      <div class="candidate-prev" @click="keyboard.page(-1, candidateCount)"><text class="pager-text">‹</text></div>
      <div class="candidate-next" @click="keyboard.page(1, candidateCount)"><text class="pager-text">›</text></div>
    </div>
    <div class="toolbar" :style="toolbarStyle">
      <div class="mode-tab" :style="tabStyle" @click="keyboard.setMode('pinyin')"><text :class="state.mode === 'pinyin' ? 'tab-active' : 'tab-text'">拼音</text></div>
      <div class="mode-tab" :style="tabStyle" @click="keyboard.setMode('english')"><text :class="state.mode === 'english' ? 'tab-active' : 'tab-text'">EN</text></div>
      <div class="mode-tab" :style="tabStyle" @click="keyboard.setMode('number')"><text :class="state.mode === 'number' ? 'tab-active' : 'tab-text'">123</text></div>
      <div class="mode-tab" :style="tabStyle" @click="keyboard.setMode('symbol')"><text :class="state.mode === 'symbol' ? 'tab-active' : 'tab-text'">符号</text></div>
      <div class="layout-tab" @click="changeLayout"><text class="tab-active">{{ state.layout === 't9' ? '九宫格 ⇄' : '26 键 ⇄' }}</text></div>
    </div>
    <div v-for="key in state.keys" :key="key.id" :class="key.value === '确定' ? 'key confirm-key' : 'key'" :style="keyStyle(key)">
      <text :class="key.value === '确定' ? 'confirm-text' : 'key-text'" :style="keyTextStyle">{{ key.label }}</text>
    </div>
  </div>
</template>

<script>
export default {
  name: 'FalconKeyboardPanel',
  props: { keyboard: { type: Object, required: true } },
  data() { return { state: { visible: false, keys: [], candidates: [], bounds: { x: 0, y: 0, width: 0, height: 0 } }, unsubscribe: null }; },
  computed: {
    panelStyle() { const b = this.state.bounds; return { left: `${b.x}px`, top: `${b.y}px`, width: `${b.width}px`, height: `${b.height}px` }; },
    headerStyle() { return { height: `${this.state.header}px`, width: `${this.state.bounds.width}px` }; },
    draftStyle() { return { width: `${this.state.bounds.width - 64}px`, height: `${this.state.header}px` }; },
    candidateRowStyle() { return { top: `${this.state.header}px`, height: `${this.state.candidateHeight}px`, width: `${this.state.bounds.width}px` }; },
    compositionStyle() { return { width: `${this.compositionWidth}px`, height: `${this.state.candidateHeight}px` }; },
    compositionWidth() { return this.state.bounds.width > 500 ? 128 : 62; },
    candidateCount() { return this.state.bounds.width > 500 ? 6 : 3; },
    visibleCandidates() { return this.state.candidates.slice(this.state.page * this.candidateCount, (this.state.page + 1) * this.candidateCount); },
    candidateWidth() { return (this.state.bounds.width - this.compositionWidth - 52) / this.candidateCount; },
    toolbarStyle() { return { top: `${this.state.header + this.state.candidateHeight}px`, height: `${this.state.toolbarHeight}px`, width: `${this.state.bounds.width}px` }; },
    tabStyle() { return { width: `${Math.min(48, (this.state.bounds.width - 100) / 4)}px` }; },
    keyTextStyle() { return { fontSize: `${Math.max(15, Math.min(23, this.state.rowHeight * 0.55))}px` }; },
  },
  mounted() { this.unsubscribe = this.keyboard.subscribe((state) => { if (state.visible) this.state = state; else this.state = { ...this.state, visible: false }; }); },
  beforeDestroy() { if (this.unsubscribe) this.unsubscribe(); this.keyboard.touchCancel(); },
  methods: {
    keyStyle(key) { return { left: `${key.x}px`, top: `${key.y}px`, width: `${key.width}px`, height: `${key.height}px` }; },
    candidateStyle(index) { return { left: `${this.compositionWidth + index * this.candidateWidth}px`, width: `${this.candidateWidth}px`, height: `${this.state.candidateHeight}px` }; },
    point(event) {
      const touches = event.touches || event.changedTouches;
      const p = touches && touches.length ? touches[0] : event;
      return { x: Number(p.screenX !== undefined ? p.screenX - this.state.bounds.x : p.pageX), y: Number(p.screenY !== undefined ? p.screenY - this.state.bounds.y : p.pageY), id: p.identifier === undefined ? 0 : p.identifier };
    },
    start(event) { this.$emit('touch-diagnostic', { phase: 'start', point: this.point(event) }); this.keyboard.touchStart(this.point(event)); },
    move(event) { this.keyboard.touchMove(this.point(event)); },
    end(event) { this.$emit('touch-diagnostic', { phase: 'end', point: this.point(event) }); this.keyboard.touchEnd(this.point(event)); },
    cancelTouch() { this.keyboard.touchCancel(); },
    hold(index, event) { this.keyboard.holdCandidate(this.state.page * this.candidateCount + index, this.point(event)); },
    moveCandidate(event) { this.keyboard.moveCandidate(this.point(event)); },
    choose() { this.keyboard.releaseCandidate(); },
    cancelCandidate() { this.keyboard.releaseCandidate(true); },
    changeLayout() { this.keyboard.setLayout(this.state.layout === 't9' ? 'qwerty' : 't9'); },
  },
};
</script>

<style>
.keyboard-panel { position: absolute; background-color: #e4ebf0; border-radius: 8px; }
.draft-row { position: absolute; top: 0px; left: 0px; flex-direction: row; background-color: #ffffff; border-radius: 8px; }
.draft-text { font-size: 18px; color: #172c42; padding-left: 8px; }
.cancel-button { width: 60px; align-items: center; justify-content: center; }
.cancel-text { color: #52677b; font-size: 16px; }
.candidate-row { position: absolute; left: 0px; background-color: #d9e5ee; }
.composition { position: absolute; left: 6px; font-size: 15px; color: #376781; }
.candidate { position: absolute; top: 0px; align-items: center; justify-content: center; }
.candidate-text { font-size: 20px; color: #123950; }
.candidate-prev { position: absolute; right: 26px; width: 26px; height: 30px; align-items: center; justify-content: center; }
.candidate-next { position: absolute; right: 0px; width: 26px; height: 30px; align-items: center; justify-content: center; }
.pager-text { font-size: 24px; color: #376781; }
.toolbar { position: absolute; left: 0px; flex-direction: row; align-items: center; }
.mode-tab { width: 48px; height: 26px; align-items: center; justify-content: center; }
.layout-tab { width: 100px; height: 26px; align-items: center; justify-content: center; }
.tab-text { font-size: 14px; color: #52677b; }
.tab-active { font-size: 14px; color: #076f88; }
.key { position: absolute; border-radius: 6px; background-color: #ffffff; align-items: center; justify-content: center; }
.key-text { color: #172c42; }
.confirm-key { background-color: #087c91; }
.confirm-text { color: #ffffff; }
</style>

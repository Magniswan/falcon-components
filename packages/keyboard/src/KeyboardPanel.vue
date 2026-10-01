<template>
  <div v-if="state.visible" class="keyboard-panel" :style="panelStyle" @touchstart="start" @touchmove="move" @touchend="end" @touchcancel="cancelTouch">
    <div class="draft-row" :style="headerStyle">
      <text class="draft-text" :style="draftStyle">{{ state.displayText }}</text>
      <div v-for="(mode, index) in modes" :key="mode.value" :class="state.mode === mode.value ? 'mode-active' : 'mode-tab'" :style="modeStyle(index)" @click="keyboard.setMode(mode.value)"><text :class="state.mode === mode.value ? 'tab-active' : 'tab-text'">{{ mode.label }}</text></div>
      <div class="layout-tab" @click="changeLayout"><text class="tab-text">{{ state.layout === 't9' ? '26键' : '九键' }}</text></div>
      <div class="cancel-button" @click="keyboard.cancel()"><text class="cancel-text">收起</text></div>
    </div>
    <div class="candidate-row" :style="candidateRowStyle">
      <text class="composition" :style="compositionStyle">{{ state.composition || (state.mode === 'pinyin' ? '拼音' : '直接输入') }}</text>
      <div v-for="(candidate, index) in visibleCandidates" :key="candidate.id" class="candidate" :style="candidateStyle(index)" @touchstart="hold(index, $event)" @touchmove="moveCandidate" @touchend="choose" @touchcancel="cancelCandidate">
        <text class="candidate-text">{{ candidate.text }}</text>
      </div>
      <div class="candidate-prev" @click="keyboard.page(-1, candidateCount)"><text class="pager-text">‹</text></div>
      <div class="candidate-next" @click="keyboard.page(1, candidateCount)"><text class="pager-text">›</text></div>
    </div>
    <div v-for="key in state.keys" :key="key.id" :class="key.value === '确定' ? 'confirm-key' : key.control ? 'control-key' : 'key'" :style="keyStyle(key)">
      <text :class="key.value === '确定' ? 'confirm-text' : 'key-text'" :style="keyTextStyle">{{ key.label }}</text>
    </div>
  </div>
</template>

<script>
export default {
  name: 'FalconKeyboardPanel',
  props: { keyboard: { type: Object, required: true } },
  data() { return { modes: [{ value: 'pinyin', label: '中' }, { value: 'english', label: 'EN' }, { value: 'number', label: '123' }, { value: 'symbol', label: '#+=' }], state: { visible: false, keys: [], candidates: [], bounds: { x: 0, y: 0, width: 0, height: 0 } }, unsubscribe: null }; },
  computed: {
    panelStyle() { const b = this.state.bounds; return { left: `${b.x}px`, top: `${b.y}px`, width: `${b.width}px`, height: `${b.height}px` }; },
    headerStyle() { return { height: `${this.state.header}px`, width: `${this.state.bounds.width}px` }; },
    draftStyle() { return { width: `${this.state.bounds.width - 232}px`, height: `${this.state.header}px` }; },
    candidateRowStyle() { return { top: `${this.state.header}px`, height: `${this.state.candidateHeight}px`, width: `${this.state.bounds.width}px` }; },
    compositionStyle() { return { width: `${this.compositionWidth}px`, height: `${this.state.candidateHeight}px` }; },
    compositionWidth() { return this.state.bounds.width > 500 ? 76 : 62; },
    candidateCount() { return this.state.bounds.width > 500 ? 4 : 2; },
    visibleCandidates() { return this.state.candidates.slice(this.state.page * this.candidateCount, (this.state.page + 1) * this.candidateCount); },
    candidateWidth() { return (this.state.bounds.width - this.compositionWidth - 52) / this.candidateCount; },
    keyTextStyle() { return { fontSize: `${Math.max(15, Math.min(19, this.state.rowHeight * 0.6))}px` }; },
  },
  mounted() { this.unsubscribe = this.keyboard.subscribe((state) => { if (state.visible) this.state = state; else this.state = { ...this.state, visible: false }; }); },
  beforeDestroy() { if (this.unsubscribe) this.unsubscribe(); this.keyboard.touchCancel(); },
  methods: {
    modeStyle(index) { return { left: `${this.state.bounds.width - 224 + index * 34}px` }; },
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
.keyboard-panel { position: absolute; background-color: #e8ece9; border-radius: 6px; }
.draft-row { position: absolute; top: 0px; left: 0px; background-color: #f6f7f5; border-radius: 6px; }
.draft-text { position: absolute; left: 8px; top: 0px; font-size: 16px; color: #303a34; }
.cancel-button { position: absolute; right: 0px; width: 40px; height: 26px; align-items: center; justify-content: center; }
.cancel-text { color: #6c766f; font-size: 13px; }
.candidate-row { position: absolute; left: 0px; background-color: #f6f7f5; }
.composition { position: absolute; left: 8px; font-size: 13px; color: #687c6e; }
.candidate { position: absolute; top: 0px; align-items: center; justify-content: center; }
.candidate-text { font-size: 18px; color: #263d2f; }
.candidate-prev { position: absolute; right: 26px; width: 26px; height: 28px; align-items: center; justify-content: center; }
.candidate-next { position: absolute; right: 0px; width: 26px; height: 28px; align-items: center; justify-content: center; }
.pager-text { font-size: 22px; color: #718078; }
.mode-tab { position: absolute; top: 0px; width: 34px; height: 26px; align-items: center; justify-content: center; }
.mode-active { position: absolute; top: 0px; width: 34px; height: 26px; background-color: #dbe7dd; border-radius: 4px; align-items: center; justify-content: center; }
.layout-tab { position: absolute; right: 40px; top: 0px; width: 48px; height: 26px; align-items: center; justify-content: center; }
.tab-text { font-size: 12px; color: #6c766f; }
.tab-active { font-size: 12px; color: #376247; }
.key { position: absolute; border-radius: 4px; background-color: #ffffff; align-items: center; justify-content: center; }
.control-key { position: absolute; border-radius: 4px; background-color: #dce2dd; align-items: center; justify-content: center; }
.key-text { color: #313b35; }
.confirm-key { position: absolute; border-radius: 4px; background-color: #47785a; align-items: center; justify-content: center; }
.confirm-text { color: #ffffff; }
</style>

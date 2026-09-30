<template>
  <div v-if="visible" class="fc-overlay" :style="overlayStyle">
    <scroller class="fc-scroll" :style="panelStyle" scroll-direction="vertical">
    <div class="fc-card" :style="cardStyle">
      <text class="fc-title">{{ title }}</text>
      <text class="fc-description">{{ description }}</text>
      <text v-if="state.status === 'downloading'" class="fc-progress">{{ progressText }}</text>
      <div class="fc-actions">
        <div class="fc-button" @click="$emit('cancel')"><text class="fc-button-text">{{ cancelText }}</text></div>
        <div v-if="state.status === 'prompt'" class="fc-primary" @click="$emit('download')"><text class="fc-primary-text">下载</text></div>
        <div v-if="state.status === 'error'" class="fc-primary" @click="$emit('retry')"><text class="fc-primary-text">重试</text></div>
      </div>
    </div>
    </scroller>
  </div>
</template>

<script>
export default {
  name: 'ComponentDownloadPrompt',
  props: {
    state: { type: Object, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
  },
  computed: {
    visible() { return ['prompt', 'downloading', 'error'].indexOf(this.state.status) >= 0; },
    title() { return this.state.status === 'error' ? '组件暂时不可用' : this.state.status === 'downloading' ? '正在下载' : '下载所需组件'; },
    description() { return this.state.message || this.state.name || '正在准备组件'; },
    cancelText() { return this.state.status === 'error' ? '关闭' : '取消'; },
    progressText() {
      if (!this.state.total) return '正在准备…';
      return `${Math.min(100, Math.round(this.state.received * 100 / this.state.total))}%`;
    },
    overlayStyle() { return { width: `${this.width}px`, height: `${this.height}px` }; },
    panelStyle() { return { width: `${Math.max(1, Math.min(400, this.width - 16))}px`, height: `${Math.max(1, Math.min(210, this.height - 12))}px` }; },
    cardStyle() { return { width: `${Math.max(1, Math.min(400, this.width - 16))}px`, height: '210px' }; },
  },
};
</script>

<style>
.fc-overlay { position: absolute; left: 0px; top: 0px; z-index: 100; background-color: rgba(0, 0, 0, 0.6); flex-direction: column; align-items: center; justify-content: center; }
.fc-card { padding: 12px; box-sizing: border-box; background-color: #ffffff; border-radius: 12px; flex-direction: column; }
.fc-title { font-size: 19px; color: #172a35; height: 28px; }
.fc-description { font-size: 14px; color: #425866; flex: 1; }
.fc-progress { font-size: 15px; color: #176a59; height: 24px; }
.fc-actions { height: 40px; flex-direction: row; justify-content: flex-end; }
.fc-button { width: 72px; height: 36px; align-items: center; justify-content: center; }
.fc-button-text { font-size: 16px; color: #425866; }
.fc-primary { width: 84px; height: 36px; border-radius: 8px; background-color: #176a59; align-items: center; justify-content: center; }
.fc-primary-text { font-size: 16px; color: #ffffff; }
</style>

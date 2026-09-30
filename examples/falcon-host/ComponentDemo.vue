<template>
  <div class="demo-page" :style="pageStyle">
    <text class="demo-title">共享组件示例</text>
    <text class="demo-message">{{ message }}</text>
    <div class="demo-button" @click="openComponent"><text class="demo-button-text">打开 Hello 组件</text></div>
    <component-download-prompt :state="downloadState" :width="profile.logicalWidth" :height="profile.logicalHeight" @download="acceptDownload" @cancel="cancelDownload" @retry="retryDownload" />
  </div>
</template>

<script>
import { createComponentSession } from '@falcon-components/ui';
import ComponentDownloadPrompt from '../../packages/ui/src/ComponentDownloadPrompt.vue';

export default {
  name: 'SharedComponentDemo',
  components: { ComponentDownloadPrompt },
  props: { host: { type: Object, required: true } },
  data() {
    return { downloadState: { status: 'idle' }, message: '点击按钮；缺少组件时会先提示下载。', session: null, unsubscribe: null, released: false };
  },
  computed: {
    profile() { return this.host.profile; },
    pageStyle() { return { width: `${this.profile.logicalWidth}px`, height: `${this.profile.logicalHeight}px` }; },
  },
  mounted() {
    this.session = createComponentSession({ manager: this.host.manager, requirement: { id: 'hello', version: '0.1.0', name: 'Hello 示例组件' }, context: { name: 'Falcon 使用者' } });
    this.unsubscribe = this.session.subscribe((state) => { if (!this.released) this.downloadState = state; });
  },
  beforeDestroy() { this.release(); },
  methods: {
    async openComponent() {
      if (this.released || !this.session) return;
      const handle = await this.session.start();
      if (this.released) return;
      this.message = handle ? handle.instance.getMessage() : this.downloadState.message;
    },
    acceptDownload() { if (this.session) this.session.acceptDownload(); },
    cancelDownload() { if (this.session) this.session.cancel(); },
    retryDownload() { this.openComponent(); },
    onHide() { this.cancelDownload(); },
    onUnload() { this.release(); },
    release() {
      if (this.released) return;
      this.released = true;
      if (this.unsubscribe) this.unsubscribe();
      this.unsubscribe = null;
      if (this.session) this.session.dispose().catch((error) => console.warn('[component-demo] dispose failed: ' + error));
    },
  },
};
</script>

<style>
.demo-page { flex-direction: column; padding: 16px; box-sizing: border-box; background-color: #eef4f3; }
.demo-title { font-size: 21px; height: 36px; color: #172a35; }
.demo-message { font-size: 15px; flex: 1; color: #425866; }
.demo-button { height: 40px; border-radius: 8px; background-color: #176a59; align-items: center; justify-content: center; }
.demo-button-text { color: #ffffff; font-size: 16px; }
</style>

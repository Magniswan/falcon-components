export const apiVersion = 1;

export function createComponent({ name = 'Falcon', component }) {
  let disposed = false;
  return {
    getMessage() {
      if (disposed) throw new Error('Hello component has been disposed');
      return `你好，${String(name)}！共享组件已加载（${component.manifest.version}）。`;
    },
    dispose() { disposed = true; },
  };
}

import { createComponentManager, createGitHubSource } from '@falcon-components/loader';

/** Supply the device's real filesystem, network, SHA-256 and module-loading adapter. */
export function createFalconComponentHost(services) {
  if (!services || !services.profile) throw new Error('请先配置目标设备的组件宿主适配器');
  const { root, storage, transport, runtime, profile } = services;
  const manager = createComponentManager({
    root, storage, runtime,
    source: createGitHubSource({ transport, repository: 'Magniswan/falcon-components', ref: 'main' }),
  });
  return { manager, profile };
}

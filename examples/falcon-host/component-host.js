import { createComponentManager, createGitHubSource } from '@falcon-components/loader';
import { createSignatureVerifier } from '@falcon-components/core';
import releasePublicKey from '../../trust/release-public-key.json';

/** The host supplies native crypto, filesystem, network and module-loading adapters. */
export function createFalconComponentHost(services) {
  if (!services || !services.profile) throw new Error('请先配置目标设备的组件宿主适配器');
  const { root, storage, transport, runtime, profile, crypto } = services;
  // This key is compiled into the app. Do not replace it with a downloaded key.
  const trust = createSignatureVerifier({ trustedKeys: [releasePublicKey], crypto });
  const manager = createComponentManager({
    root, storage, runtime, trust,
    source: createGitHubSource({ transport, trust, repository: 'Magniswan/falcon-components', release: 'latest' }),
  });
  return { manager, profile };
}

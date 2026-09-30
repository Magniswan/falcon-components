import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNodeStorage, createNodeRuntime, createNodeSignatureVerifier } from '@falcon-components/node-adapter';
import { createGitHubSource, createComponentManager } from '@falcon-components/loader';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bundle = resolve(process.argv[2]);
const trustedKey = JSON.parse(await readFile(resolve(project, 'trust/release-public-key.json'), 'utf8'));
const trust = createNodeSignatureVerifier({ trustedKeys: [trustedKey] });
const index = JSON.parse(await readFile(resolve(bundle, 'catalog/index.json'), 'utf8'));
const root = await mkdtemp(resolve(tmpdir(), 'falcon-signed-host-'));
let requests = 0;
const transport = {
  async getText(url) {
    requests += 1;
    if (!url.endsWith('/component-catalog.sig.json')) throw new Error('Unexpected catalog URL');
    return readFile(resolve(bundle, 'catalog/index.json.sig.json'), 'utf8');
  },
  async getBytes(url, { token, onProgress }) {
    requests += 1;
    token.throwIfCancelled();
    const prefix = `https://raw.githubusercontent.com/Magniswan/falcon-components/${index.ref}/`;
    if (!url.startsWith(prefix)) throw new Error('Component request is not pinned to the signed commit');
    const path = decodeURIComponent(url.slice(prefix.length));
    const bytes = new Uint8Array(await readFile(resolve(bundle, path)));
    onProgress(bytes.length);
    return bytes;
  },
};
try {
  const storage = createNodeStorage({ root });
  const manager = createComponentManager({ root: storage.root, storage, trust, source: createGitHubSource({ transport, trust }), runtime: createNodeRuntime() });
  const requirement = { id: 'hello', version: '0.1.0' };
  let prompted = false;
  const handle = await manager.load(requirement, { requestDownload() {
    if (requests) throw new Error('Network request happened before consent');
    prompted = true;
    return true;
  } });
  if (!prompted || !handle.instance.getMessage()) throw new Error('Signed component was not loaded');
  await handle.dispose();
  const count = requests;
  const offline = await manager.load(requirement);
  if (count !== requests) throw new Error('Offline load accessed the source');
  await offline.dispose();
  console.log('Signed host integration passed: consent, pinned download, mandatory verification and offline reuse.');
} finally { await rm(root, { recursive: true, force: true }); }

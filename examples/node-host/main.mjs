import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createComponentManager, createGitHubSource } from '@falcon-components/loader';
import { createComponentSession } from '@falcon-components/ui';
import { createNodeStorage, createNodeTransport, createNodeRuntime, createNodeSignatureVerifier } from '@falcon-components/node-adapter';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const argument = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
// Trust belongs to this host checkout, never to the shared component directory.
const trustedKey = JSON.parse(await readFile(resolve(project, 'trust/release-public-key.json'), 'utf8'));
const trust = createNodeSignatureVerifier({ trustedKeys: [trustedKey] });
const storage = createNodeStorage({ root: argument('--root', resolve(project, '.demo-device/signed-components')) });
const transport = process.argv.includes('--offline')
  ? { async getText() { throw new Error('Offline demo blocks network access'); }, async getBytes() { throw new Error('Offline demo blocks network access'); } }
  : createNodeTransport();
const manager = createComponentManager({
  root: storage.root, storage, trust,
  source: createGitHubSource({ transport, trust, release: argument('--release', 'latest') }),
  runtime: createNodeRuntime(),
});
const session = createComponentSession({ manager, requirement: { id: 'hello', version: '0.1.0', name: 'Hello 示例组件' }, context: { name: '开源组件使用者' } });
const terminal = createInterface({ input: stdin, output: stdout });
let answering = false;
const off = session.subscribe((state) => {
  if (state.status === 'prompt' && !answering) {
    answering = true;
    console.log(`缺少 ${state.name}。下载后可离线使用。`);
    if (process.argv.includes('--accept-download')) {
      console.log('已通过命令行显式选择下载。');
      session.acceptDownload();
    } else {
      terminal.question('现在下载？[y/N] ').then((answer) => {
        if (answer.trim().toLowerCase() === 'y') session.acceptDownload();
        else session.cancel();
      }).catch(() => session.cancel());
    }
  }
  if (state.status === 'downloading' && state.total) console.log(`下载进度 ${Math.round(state.received * 100 / state.total)}%`);
  if (state.status === 'error' || state.status === 'cancelled') console.log(state.message);
});
try {
  const handle = await session.start();
  if (handle) {
    console.log(handle.instance.getMessage());
    console.log(`组件目录：${handle.directory}`);
  } else process.exitCode = session.state.status === 'cancelled' ? 0 : 1;
} finally { off(); terminal.close(); await session.dispose(); }

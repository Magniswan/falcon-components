import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createComponentManager, createGitHubSource } from '@falcon-components/loader';
import { createNodeStorage, createNodeRuntime } from '@falcon-components/node-adapter';

export const project = fileURLToPath(new URL('../', import.meta.url));
export const requirement = { id: 'hello', version: '0.1.0', name: 'Hello 示例组件' };
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export async function createFixture(t, options = {}) {
  const parent = resolve(tmpdir());
  const root = await mkdtemp(join(parent, 'falcon-components-test-'));
  t.after(async () => {
    const inside = relative(parent, resolve(root));
    if (isAbsolute(inside) || inside.startsWith('..') || !inside.startsWith('falcon-components-test-')) throw new Error('Unsafe test cleanup target');
    await rm(root, { recursive: true, force: true });
  });
  const manifest = JSON.parse(await readFile(resolve(project, 'catalog/components/hello/0.1.0/manifest.json'), 'utf8'));
  const bytes = new Uint8Array(await readFile(resolve(project, 'catalog/components/hello/0.1.0/hello.mjs')));
  const calls = [];
  const transport = {
    async getText(url, { token }) {
      token.throwIfCancelled();
      calls.push(url);
      if (url.endsWith('/catalog/index.json')) {
        return JSON.stringify({ schemaVersion: 1, components: [{ ...requirement, manifest: 'catalog/components/hello/0.1.0/manifest.json' }, ...(options.extraVersions || [])] });
      }
      if (url.endsWith('/manifest.json')) return JSON.stringify(options.manifest || manifest);
      throw new Error('Unexpected fixture URL');
    },
    async getBytes(url, request) {
      calls.push(url);
      if (options.download) return options.download(bytes, request);
      request.token.throwIfCancelled();
      request.onProgress(bytes.length);
      return bytes;
    },
  };
  const storage = createNodeStorage({ root, lockTimeoutMs: options.lockTimeoutMs || 1000 });
  const source = createGitHubSource({ transport });
  const runtime = options.runtime || createNodeRuntime();
  const manager = createComponentManager({ root: storage.root, storage, source, runtime });
  return { root, manifest, bytes, calls, storage, source, runtime, manager };
}

export async function stageEntries(root) {
  try { return await readdir(resolve(root, '.staging')); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}

export async function waitFor(predicate) {
  const deadline = Date.now() + 2000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Condition did not become true');
    await new Promise((accept) => setTimeout(accept, 5));
  }
}

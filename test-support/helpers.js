import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { createComponentManager, createGitHubSource } from '@falcon-components/loader';
import { createNodeStorage, createNodeRuntime, createNodeSignatureVerifier } from '@falcon-components/node-adapter';
import { signPayload } from '../scripts/lib/release-signatures.mjs';

export const project = fileURLToPath(new URL('../', import.meta.url));
export const requirement = { id: 'hello', version: '0.1.0', name: 'Hello 示例组件' };
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function createTestSigner() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const trustedKey = { schemaVersion: 1, algorithm: 'Ed25519', keyId: sha256(publicKey.export({ type: 'spki', format: 'der' })), publicKey: publicKey.export({ type: 'spki', format: 'pem' }) };
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  return {
    trustedKey, trust: createNodeSignatureVerifier({ trustedKeys: [trustedKey] }),
    sign(value, purpose) { return signPayload(Buffer.from(`${JSON.stringify(value)}\n`), { privateKeyPem, trustedKey, purpose }); },
  };
}
export function testCatalog(signer, manifest, extras = []) {
  const signature = signer.sign(manifest, 'component-manifest');
  const record = { id: manifest.id, version: manifest.version, manifest: `catalog/components/${manifest.id}/${manifest.version}/manifest.json`, manifestSha256: sha256(Buffer.from(signature.payload, 'base64')), signature };
  return { schemaVersion: 1, repository: 'Magniswan/falcon-components', ref: 'a'.repeat(40), components: [record, ...extras.map((item) => ({ ...record, ...item }))] };
}

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
  const signer = createTestSigner();
  const index = testCatalog(signer, options.manifest || manifest, options.extraVersions || []);
  const catalogSignature = signer.sign(index, 'catalog');
  const transport = {
    async getText(url, { token }) {
      token.throwIfCancelled();
      calls.push(url);
      if (url.endsWith('/component-catalog.sig.json')) {
        return JSON.stringify(options.catalogSignature || catalogSignature);
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
  const trust = signer.trust;
  const source = createGitHubSource({ transport, trust });
  const runtime = options.runtime || createNodeRuntime();
  const manager = createComponentManager({ root: storage.root, storage, source, runtime, trust });
  return { root, manifest, bytes, calls, storage, source, runtime, manager, trust, signer, index, catalogSignature };
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

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { signPayload, verifyPayload, sha256, validateReleasePath } from '../scripts/lib/release-signatures.mjs';

function keys() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    trustedKey: { schemaVersion: 1, algorithm: 'Ed25519', keyId: sha256(publicKey.export({ type: 'spki', format: 'der' })), publicKey: publicKey.export({ type: 'spki', format: 'pem' }) },
  };
}
test('signatures bind exact payload bytes and their purpose', () => {
  const key = keys();
  const bytes = Buffer.from('{"value":1}\n');
  const envelope = signPayload(bytes, { ...key, purpose: 'catalog' });
  assert.deepEqual(verifyPayload(envelope, { ...key, purpose: 'catalog' }), bytes);
  assert.throws(() => verifyPayload(envelope, { ...key, purpose: 'component-manifest' }));
  const forged = { ...envelope, payload: Buffer.from('{"value":2}\n').toString('base64') };
  assert.throws(() => verifyPayload(forged, { ...key, purpose: 'catalog' }), /verification failed/);
  // Changing the claimed purpose also cannot repurpose an otherwise valid signature.
  assert.throws(() => verifyPayload({ ...envelope, purpose: 'release' }, { ...key, purpose: 'release' }), /verification failed/);
});
test('rejects unknown keys, wrong private keys, invalid encodings and oversized payloads', () => {
  const key = keys();
  const other = keys();
  const envelope = signPayload(Buffer.from('payload'), { ...key, purpose: 'release' });
  assert.throws(() => verifyPayload(envelope, { trustedKey: other.trustedKey, purpose: 'release' }));
  assert.throws(() => signPayload(Buffer.from('payload'), { ...key, privateKeyPem: other.privateKeyPem, purpose: 'release' }));
  assert.throws(() => verifyPayload({ ...envelope, signature: `${envelope.signature}\n` }, { ...key, purpose: 'release' }));
  assert.throws(() => verifyPayload({ ...envelope, signature: 'AAAA' }, { ...key, purpose: 'release' }));
  assert.throws(() => signPayload(Buffer.alloc(256 * 1024 + 1), { ...key, purpose: 'release' }));
  assert.throws(() => verifyPayload(envelope, { trustedKey: { ...key.trustedKey, keyId: '0'.repeat(64) }, purpose: 'release' }));
});
test('release paths allow source dotfiles and reject escaping the bundle', () => {
  assert.equal(validateReleasePath('.github/workflows/release.yml'), '.github/workflows/release.yml');
  for (const path of ['../key.pem', 'catalog/../key', '/root/key', 'C:/key', 'catalog\\key', '.git/config']) assert.throws(() => validateReleasePath(path));
});
test('release verifier uses the host key and rejects modified files and manifests', async (t) => {
  const temporary = await mkdtemp(resolve(tmpdir(), 'falcon-signature-test-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const bundle = resolve(temporary, 'bundle');
  await mkdir(bundle);
  const key = keys();
  const trustFile = resolve(temporary, 'host-key.json');
  await writeFile(trustFile, JSON.stringify(key.trustedKey));
  async function put(path, bytes) {
    await mkdir(dirname(resolve(bundle, path)), { recursive: true });
    await writeFile(resolve(bundle, path), bytes);
  }
  async function signed(path, value, purpose) {
    const bytes = Buffer.from(`${JSON.stringify(value)}\n`);
    await put(path, bytes);
    await put(`${path}.sig.json`, JSON.stringify(signPayload(bytes, { ...key, purpose })));
    return bytes;
  }
  const codePath = 'catalog/components/hello/0.1.0/hello.mjs';
  const manifestPath = 'catalog/components/hello/0.1.0/manifest.json';
  const code = Buffer.from('export const apiVersion = 1;\n');
  await put(codePath, code);
  const manifest = { schemaVersion: 1, id: 'hello', version: '0.1.0', runtime: { apiVersion: 1, format: 'esm' }, entry: 'hello.mjs', files: [{ path: 'hello.mjs', size: code.length, sha256: sha256(code) }] };
  const manifestBytes = await signed(manifestPath, manifest, 'component-manifest');
  await signed('catalog/index.json', { schemaVersion: 1, components: [{ id: 'hello', version: '0.1.0', manifest: manifestPath, manifestSha256: sha256(manifestBytes) }] }, 'catalog');
  const paths = [codePath, manifestPath, `${manifestPath}.sig.json`, 'catalog/index.json', 'catalog/index.json.sig.json'];
  const files = [];
  for (const path of paths) {
    const bytes = await readFile(resolve(bundle, path));
    files.push({ path, size: bytes.length, sha256: sha256(bytes) });
  }
  await signed('release-manifest.json', { schemaVersion: 1, repository: 'Magniswan/falcon-components', version: '0.1.1', commit: 'a'.repeat(40), files }, 'release');
  const verify = () => spawnSync(process.execPath, ['scripts/verify-release.mjs', bundle, trustFile], { encoding: 'utf8', windowsHide: true });
  assert.equal(verify().status, 0);
  await put('extra.mjs', Buffer.from('unlisted code'));
  assert.notEqual(verify().status, 0);
  await rm(resolve(bundle, 'extra.mjs'));
  await put(codePath, Buffer.from('tampered'));
  assert.notEqual(verify().status, 0);
  await put(codePath, code);
  await put(manifestPath, Buffer.from(JSON.stringify({ ...manifest, entry: 'other.mjs' })));
  assert.notEqual(verify().status, 0);
  await put(manifestPath, manifestBytes);
  await writeFile(trustFile, JSON.stringify(keys().trustedKey));
  assert.notEqual(verify().status, 0);
});
test('archive verifier rejects tampering before extraction using the fixed host key', async (t) => {
  const temporary = await mkdtemp(resolve(tmpdir(), 'falcon-archive-test-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const key = keys();
  const trustFile = resolve(temporary, 'host-key.json');
  const archivePath = resolve(temporary, 'falcon-components-v0.1.1.tar.gz');
  const bytes = Buffer.from('opaque archive bytes');
  await writeFile(trustFile, JSON.stringify(key.trustedKey));
  await writeFile(archivePath, bytes);
  const metadata = { schemaVersion: 1, repository: 'Magniswan/falcon-components', version: '0.1.1', commit: 'b'.repeat(40), archive: { path: 'falcon-components-v0.1.1.tar.gz', size: bytes.length, sha256: sha256(bytes) } };
  await writeFile(`${archivePath}.sig.json`, JSON.stringify(signPayload(Buffer.from(JSON.stringify(metadata)), { ...key, purpose: 'release' })));
  const verify = () => spawnSync(process.execPath, ['scripts/verify-archive.mjs', archivePath, trustFile], { encoding: 'utf8', windowsHide: true });
  assert.equal(verify().status, 0);
  await writeFile(archivePath, Buffer.alloc(bytes.length, 0));
  assert.notEqual(verify().status, 0);
  await writeFile(archivePath, bytes);
  await writeFile(trustFile, JSON.stringify(keys().trustedKey));
  assert.notEqual(verify().status, 0);
});

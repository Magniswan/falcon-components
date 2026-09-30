import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createComponentManager, createGitHubSource } from '@falcon-components/loader';
import { createSignatureVerifier, createCancellationToken, decodeBase64, decodeUtf8 } from '@falcon-components/core';
import { createNodeCrypto } from '@falcon-components/node-adapter';
import { createComponentSession } from '@falcon-components/ui';
import { createFixture, createTestSigner, requirement, sha256, stageEntries } from '../test-support/helpers.js';

test('managers and GitHub sources fail closed when the host has no trust configuration', async (t) => {
  const fixture = await createFixture(t);
  assert.throws(() => createComponentManager({ root: fixture.root, storage: fixture.storage, source: fixture.source, runtime: fixture.runtime }), { code: 'INVALID_TRUST' });
  assert.throws(() => createGitHubSource({ transport: { getText() {}, getBytes() {} } }), { code: 'INVALID_TRUST' });
  assert.throws(() => createSignatureVerifier({ trustedKeys: [fixture.signer.trustedKey], crypto: { sha256() {} } }), { code: 'INVALID_ADAPTER' });
});
test('portable protocol verifies non-ASCII JSON and rejects noncanonical Base64 and invalid UTF-8', async () => {
  const signer = createTestSigner();
  const value = { message: '中文拼音 😀', newline: '\n', zero: '\0' };
  assert.deepEqual((await signer.trust.verify(signer.sign(value, 'catalog'), { purpose: 'catalog' })).value, value);
  assert.deepEqual(decodeBase64('AAECA/8='), new Uint8Array([0, 1, 2, 3, 255]));
  for (const encoded of ['AB==', 'AAB=', 'AA==\n', 'AA-', 'AAAA=']) assert.throws(() => decodeBase64(encoded), { code: 'INVALID_SIGNATURE' });
  for (const bytes of [[0xc0, 0x80], [0xe0, 0x80, 0x80], [0xed, 0xa0, 0x80], [0xf4, 0x90, 0x80, 0x80], [0xe2, 0x82]]) {
    assert.throws(() => decodeUtf8(new Uint8Array(bytes)), { code: 'INVALID_SIGNATURE' });
  }
});
test('the verifier snapshots host keys and refuses keys offered by signed content', async () => {
  const signer = createTestSigner();
  const other = createTestSigner();
  const record = { ...signer.trustedKey };
  const trust = createSignatureVerifier({ trustedKeys: [record], crypto: createNodeCrypto() });
  Object.assign(record, other.trustedKey);
  assert.equal((await trust.verify(signer.sign({ value: 1 }, 'catalog'), { purpose: 'catalog' })).value.value, 1);
  const forged = { ...other.sign({ publicKey: other.trustedKey, value: 2 }, 'catalog'), publicKey: other.trustedKey.publicKey };
  await assert.rejects(trust.verify(forged, { purpose: 'catalog' }), { code: 'UNTRUSTED_KEY' });
});
test('rejects a catalog altered together with its hashes before requesting any component file', async (t) => {
  const fixture = await createFixture(t);
  const forged = { ...fixture.catalogSignature, payload: Buffer.from(JSON.stringify({ ...fixture.index, ref: 'b'.repeat(40), components: [] })).toString('base64') };
  fixture.source.catalog = async () => forged;
  await assert.rejects(fixture.manager.checkUpdate(requirement), { code: 'SIGNATURE_INVALID' });
  const source = createGitHubSource({ trust: fixture.trust, transport: { async getText() { return JSON.stringify(forged); }, async getBytes() { assert.fail('Must not download'); } } });
  const manager = createComponentManager({ root: fixture.root, storage: fixture.storage, runtime: fixture.runtime, source, trust: fixture.trust });
  await assert.rejects(manager.load(requirement, { requestDownload: () => true }), { code: 'SIGNATURE_INVALID' });
  assert.deepEqual(await stageEntries(fixture.root), []);
});
test('the manager rejects an unsigned custom source instead of trusting its manifest', async (t) => {
  const fixture = await createFixture(t);
  fixture.source.resolve = async () => ({ manifest: fixture.manifest, async download() { assert.fail('Must not download'); } });
  await assert.rejects(fixture.manager.load(requirement, { requestDownload: () => true }), { code: 'SIGNATURE_REQUIRED' });
  assert.equal(await fixture.manager.inspect(requirement), null);
});
test('a valid manifest signature cannot be mixed into a different signed catalog', async (t) => {
  const fixture = await createFixture(t);
  const resolveOriginal = fixture.source.resolve;
  fixture.source.resolve = async (...args) => {
    const resolved = await resolveOriginal(...args);
    return { ...resolved, manifestSignature: fixture.signer.sign({ ...fixture.manifest, name: 'different signed release' }, 'component-manifest') };
  };
  await assert.rejects(fixture.manager.ensure(requirement, { requestDownload: () => true }), { code: 'MANIFEST_MISMATCH' });
  assert.equal(fixture.calls.filter((url) => url.endsWith('hello.mjs')).length, 0);
});
test('local loading refuses replacing both code and the manifest hash', async (t) => {
  const fixture = await createFixture(t);
  const handle = await fixture.manager.load(requirement, { requestDownload: () => true });
  await handle.dispose();
  const code = Buffer.from('export const apiVersion = 1; // altered');
  const changed = { ...fixture.manifest, files: [{ ...fixture.manifest.files[0], size: code.length, sha256: sha256(code) }] };
  await writeFile(resolve(handle.directory, 'hello.mjs'), code);
  await writeFile(resolve(handle.directory, 'manifest.json'), JSON.stringify(changed));
  const signaturePath = resolve(handle.directory, 'manifest.json.sig.json');
  const envelope = JSON.parse(await readFile(signaturePath, 'utf8'));
  envelope.payload = Buffer.from(JSON.stringify(changed)).toString('base64');
  await writeFile(signaturePath, JSON.stringify(envelope));
  const requests = fixture.calls.length;
  await assert.rejects(fixture.manager.load(requirement), { code: 'SIGNATURE_INVALID' });
  assert.equal(fixture.calls.length, requests);
});
test('unsigned legacy installs and removed signatures are refused without contacting the source', async (t) => {
  const fixture = await createFixture(t);
  const directory = resolve(fixture.root, 'hello/0.1.0');
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, 'manifest.json'), JSON.stringify(fixture.manifest));
  await writeFile(resolve(directory, 'hello.mjs'), fixture.bytes);
  await assert.rejects(fixture.manager.load(requirement), { code: 'SIGNATURE_REQUIRED' });
  assert.equal(fixture.calls.length, 0);
  const installed = await createFixture(t);
  const handle = await installed.manager.load(requirement, { requestDownload: () => true });
  await handle.dispose();
  await rm(resolve(handle.directory, 'manifest.json.sig.json'));
  const requests = installed.calls.length;
  await assert.rejects(installed.manager.load(requirement), { code: 'SIGNATURE_REQUIRED' });
  assert.equal(installed.calls.length, requests);
});
test('another host key cannot accept an installed component even when a public key is planted beside it', async (t) => {
  const fixture = await createFixture(t);
  const handle = await fixture.manager.load(requirement, { requestDownload: () => true });
  await handle.dispose();
  const other = createTestSigner();
  await writeFile(resolve(handle.directory, 'public-key.json'), JSON.stringify(fixture.signer.trustedKey));
  const manager = createComponentManager({ root: fixture.root, storage: fixture.storage, source: fixture.source, runtime: fixture.runtime, trust: other.trust });
  await assert.rejects(manager.load(requirement), { code: 'UNTRUSTED_KEY' });
});
test('a modified raw manifest is refused even when its original signature is intact', async (t) => {
  const fixture = await createFixture(t);
  const handle = await fixture.manager.load(requirement, { requestDownload: () => true });
  await handle.dispose();
  const file = resolve(handle.directory, 'manifest.json');
  await writeFile(file, `${await readFile(file, 'utf8')} `);
  await assert.rejects(fixture.manager.inspect(requirement), { code: 'CORRUPT_INSTALL' });
});
test('load rechecks published files before calling the runtime', async (t) => {
  let imports = 0;
  const fixture = await createFixture(t, { runtime: { formats: ['esm'], importModule() { imports += 1; } } });
  const rename = fixture.storage.rename;
  fixture.storage.rename = async (from, to) => {
    await rename(from, to);
    await writeFile(resolve(to, 'hello.mjs'), 'changed after publish');
  };
  await assert.rejects(fixture.manager.load(requirement, { requestDownload: () => true }), { code: 'CORRUPT_INSTALL' });
  assert.equal(imports, 0);
});
test('cancellation during crypto verification does not accept a late valid result', async () => {
  const signer = createTestSigner();
  const token = createCancellationToken();
  const crypto = createNodeCrypto();
  const trust = createSignatureVerifier({ trustedKeys: [signer.trustedKey], crypto: { ...crypto, async verifyEd25519(...args) {
    const valid = await crypto.verifyEd25519(...args);
    token.cancel();
    return valid;
  } } });
  await assert.rejects(trust.verify(signer.sign({ value: 1 }, 'catalog'), { purpose: 'catalog', token }), { code: 'CANCELLED' });
});
test('crypto adapter exceptions and truthy nonboolean results fail closed', async () => {
  const signer = createTestSigner();
  const crypto = createNodeCrypto();
  const envelope = signer.sign({ value: 1 }, 'catalog');
  const failed = createSignatureVerifier({ trustedKeys: [signer.trustedKey], crypto: { ...crypto, verifyEd25519() { throw new Error('native crypto unavailable'); } } });
  await assert.rejects(failed.verify(envelope, { purpose: 'catalog' }), { code: 'CRYPTO_ERROR' });
  const truthy = createSignatureVerifier({ trustedKeys: [signer.trustedKey], crypto: { ...crypto, verifyEd25519() { return 1; } } });
  await assert.rejects(truthy.verify(envelope, { purpose: 'catalog' }), { code: 'SIGNATURE_INVALID' });
});
test('a signed catalog from a different repository is rejected', async (t) => {
  const fixture = await createFixture(t);
  const signature = fixture.signer.sign({ ...fixture.index, repository: 'another/project' }, 'catalog');
  const source = createGitHubSource({ trust: fixture.trust, transport: { async getText() { return JSON.stringify(signature); }, getBytes() {} } });
  await assert.rejects(source.resolve(requirement), { code: 'MANIFEST_MISMATCH' });
});
test('older valid signed catalogs remain accepted without anti-rollback state', async (t) => {
  const fixture = await createFixture(t, { extraVersions: [{ id: 'hello', version: '0.2.0' }] });
  assert.equal((await fixture.manager.checkUpdate(requirement)).latest, '0.2.0');
  const older = { ...fixture.index, components: fixture.index.components.slice(0, 1) };
  fixture.source.catalog = async () => fixture.signer.sign(older, 'catalog');
  assert.deepEqual(await fixture.manager.checkUpdate(requirement), { id: 'hello', current: '0.1.0', latest: '0.1.0', available: false });
});
test('foreground signature failures show a refusal and never create a ready component', async (t) => {
  const other = createTestSigner();
  const fixture = await createFixture(t, { catalogSignature: other.sign({ value: 1 }, 'catalog') });
  const session = createComponentSession({ manager: fixture.manager, requirement });
  const off = session.subscribe((state) => { if (state.status === 'prompt') session.acceptDownload(); });
  assert.equal(await session.start(), null);
  assert.equal(session.state.status, 'error');
  assert.equal(session.state.errorCode, 'UNTRUSTED_KEY');
  assert.match(session.state.message, /不受信任.*拒绝加载/);
  assert.equal(session.component, null);
  assert.equal(await fixture.manager.inspect(requirement), null);
  off();
  await session.dispose();
});

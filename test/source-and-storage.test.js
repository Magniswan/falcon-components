import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readdir, symlink, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import { createGitHubSource } from '@falcon-components/loader';
import { createCancellationToken } from '@falcon-components/core';
import { createNodeTransport } from '@falcon-components/node-adapter';
import { createFixture, requirement, createTestSigner } from '../test-support/helpers.js';

test('GitHub source verifies a Release catalog and pins component files to its signed commit', async (t) => {
  const fixture = await createFixture(t);
  await fixture.source.resolve(requirement, createCancellationToken());
  const resolved = await fixture.source.resolve(requirement, createCancellationToken());
  await resolved.download(resolved.manifest.files[0], { token: createCancellationToken(), onProgress() {} });
  assert.ok(fixture.calls[0].includes('/releases/latest/download/component-catalog.sig.json'));
  assert.ok(fixture.calls.at(-1).startsWith(`https://raw.githubusercontent.com/Magniswan/falcon-components/${'a'.repeat(40)}/`));
  for (const options of [{ repository: '../x' }, { ref: '../main' }, { catalogPath: '/catalog.json' }, { release: '../v1' }]) {
    assert.throws(() => createGitHubSource({ transport: { getText() {}, getBytes() {} }, trust: fixture.trust, ...options }));
  }
});

test('GitHub source rejects a duplicate signed catalog and a missing exact version', async () => {
  const signer = createTestSigner();
  const index = { schemaVersion: 1, repository: 'Magniswan/falcon-components', ref: 'a'.repeat(40), components: [] };
  const source = createGitHubSource({ trust: signer.trust, transport: { async getText() { return JSON.stringify(signer.sign(index, 'catalog')); }, async getBytes() {} } });
  await assert.rejects(source.resolve(requirement, createCancellationToken()), { code: 'COMPONENT_NOT_FOUND' });
  const item = { id: 'hello', version: '0.1.0', manifest: 'catalog/manifest.json', manifestSha256: 'b'.repeat(64) };
  const duplicate = createGitHubSource({ trust: signer.trust, transport: { async getText() { return JSON.stringify(signer.sign({ ...index, components: [item, item] }, 'catalog')); }, async getBytes() {} } });
  await assert.rejects(duplicate.latest('hello', createCancellationToken()), { code: 'INVALID_MANIFEST' });
});

test('storage refuses outside writes, deletion of its root and overwriting an installed version', async (t) => {
  const fixture = await createFixture(t);
  await assert.rejects(fixture.storage.writeBytes(resolve(fixture.root, '../outside.txt'), new Uint8Array()), { code: 'INVALID_PATH' });
  await assert.rejects(fixture.storage.removeTree(fixture.root), { code: 'INVALID_PATH' });
  await mkdir(resolve(fixture.root, '.staging/source'), { recursive: true });
  await mkdir(resolve(fixture.root, 'hello/0.1.0'), { recursive: true });
  await assert.rejects(fixture.storage.rename(resolve(fixture.root, '.staging/source'), resolve(fixture.root, 'hello/0.1.0')), { code: 'STORAGE_ERROR' });
});

test('storage refuses following a directory symlink outside its root', async (t) => {
  const fixture = await createFixture(t);
  const outside = resolve(fixture.root, 'target');
  await mkdir(outside);
  await symlink(outside, resolve(fixture.root, 'redirect'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(fixture.storage.writeBytes(resolve(fixture.root, 'redirect/file'), new Uint8Array()), { code: 'INVALID_PATH' });
  assert.deepEqual(await readdir(outside), []);
});

test('an existing installation lock times out without deleting another owner lock', async (t) => {
  const fixture = await createFixture(t, { lockTimeoutMs: 35 });
  const lock = resolve(fixture.root, '.locks/hello@0.1.0');
  await mkdir(lock, { recursive: true });
  await writeFile(resolve(lock, 'owner.json'), 'existing');
  await assert.rejects(fixture.manager.ensure(requirement, { requestDownload: async () => true }), { code: 'LOCK_TIMEOUT' });
  assert.equal(await readFile(resolve(lock, 'owner.json'), 'utf8'), 'existing');
});

test('network adapter caps streamed payloads and honours cancellation', async (t) => {
  const server = createServer((request, response) => {
    if (request.url === '/slow') { response.writeHead(200); response.write('x'); return; }
    response.writeHead(200, { 'content-type': 'text/plain' });
    response.end('too much content');
  });
  await new Promise((accept) => server.listen(0, '127.0.0.1', accept));
  t.after(async () => { server.closeAllConnections(); await new Promise((accept) => server.close(accept)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const transport = createNodeTransport({ timeoutMs: 2000 });
  await assert.rejects(transport.getBytes(`${base}/large`, { token: createCancellationToken(), maxBytes: 2 }), { code: 'SIZE_MISMATCH' });
  const token = createCancellationToken();
  const pending = transport.getBytes(`${base}/slow`, { token, maxBytes: 100, onProgress() { token.cancel(); } });
  await assert.rejects(pending, { code: 'CANCELLED' });
});

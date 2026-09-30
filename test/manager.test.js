import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createCancellationToken } from '@falcon-components/core';
import { createComponentManager } from '@falcon-components/loader';
import { createFixture, requirement, stageEntries } from '../test-support/helpers.js';

test('requires foreground approval before making any source request', async (t) => {
  const fixture = await createFixture(t);
  await assert.rejects(fixture.manager.load(requirement), { code: 'DOWNLOAD_REQUIRED' });
  assert.equal(fixture.calls.length, 0);
  await assert.rejects(fixture.manager.load(requirement, { requestDownload: async () => false }), { code: 'CANCELLED' });
  assert.equal(fixture.calls.length, 0);
  assert.equal(await fixture.manager.inspect(requirement), null);
});

test('downloads once, validates files, atomically installs and then works offline', async (t) => {
  const fixture = await createFixture(t);
  const progress = [];
  const first = await fixture.manager.load(requirement, { requestDownload: async () => true, onProgress: (value) => progress.push(value), context: { name: '测试者' } });
  assert.match(first.instance.getMessage(), /测试者/);
  assert.equal(progress.at(-1).received, fixture.bytes.length);
  assert.equal(progress.at(-1).total, fixture.bytes.length);
  const requests = fixture.calls.length;
  const second = await fixture.manager.load(requirement, { requestDownload: () => { throw new Error('Installed component should not prompt'); } });
  assert.equal(fixture.calls.length, requests);
  assert.notEqual(first.instance, second.instance);
  assert.deepEqual(await stageEntries(fixture.root), []);
  assert.deepEqual(await readdir(resolve(fixture.root, '.locks')), []);
  await first.dispose();
  await first.dispose();
  assert.throws(() => first.instance.getMessage(), /disposed/);
  assert.match(second.instance.getMessage(), /Falcon/);
  await second.dispose();
});

test('two application managers serialize installation and reuse the same version', async (t) => {
  const fixture = await createFixture(t, { download: async (bytes) => { await new Promise((accept) => setTimeout(accept, 40)); return bytes; } });
  const second = createComponentManager({ root: fixture.storage.root, storage: fixture.storage, source: fixture.source, runtime: fixture.runtime });
  const handles = await Promise.all([fixture.manager.load(requirement, { requestDownload: async () => true }), second.load(requirement, { requestDownload: async () => true })]);
  assert.equal(fixture.calls.filter((url) => url.endsWith('/hello.mjs')).length, 1);
  assert.equal(handles[0].directory, handles[1].directory);
  await Promise.all(handles.map((handle) => handle.dispose()));
});

test('a network failure leaves no installed version and retry succeeds', async (t) => {
  let attempts = 0;
  const fixture = await createFixture(t, { download: async (bytes) => { attempts += 1; if (attempts === 1) throw new Error('offline'); return bytes; } });
  await assert.rejects(fixture.manager.load(requirement, { requestDownload: async () => true }), { code: 'NETWORK_ERROR' });
  assert.equal(await fixture.manager.inspect(requirement), null);
  assert.deepEqual(await stageEntries(fixture.root), []);
  const retry = await fixture.manager.load(requirement, { requestDownload: async () => true });
  await retry.dispose();
});

test('rejects altered content and removes the incomplete install', async (t) => {
  const fixture = await createFixture(t, { download: async (bytes) => { const altered = bytes.slice(); altered[0] ^= 1; return altered; } });
  await assert.rejects(fixture.manager.load(requirement, { requestDownload: async () => true }), { code: 'HASH_MISMATCH' });
  assert.equal(await fixture.manager.inspect(requirement), null);
  assert.deepEqual(await stageEntries(fixture.root), []);
});

test('rejects incomplete downloads without publishing a manifest', async (t) => {
  const fixture = await createFixture(t, { download: async (bytes) => bytes.slice(1) });
  await assert.rejects(fixture.manager.load(requirement, { requestDownload: async () => true }), { code: 'SIZE_MISMATCH' });
  assert.equal(await fixture.manager.inspect(requirement), null);
});

test('cancelling during download never installs or loads a late result', async (t) => {
  const token = createCancellationToken();
  let imported = false;
  const fixture = await createFixture(t, { download: async (bytes) => { token.cancel(); return bytes; }, runtime: { formats: ['esm'], async importModule() { imported = true; } } });
  await assert.rejects(fixture.manager.load(requirement, { token, requestDownload: async () => true }), { code: 'CANCELLED' });
  assert.equal(imported, false);
  assert.equal(await fixture.manager.inspect(requirement), null);
  assert.deepEqual(await stageEntries(fixture.root), []);
});

test('cancelling while a factory completes disposes the late instance', async (t) => {
  const token = createCancellationToken();
  let disposed = 0;
  const fixture = await createFixture(t, { runtime: { formats: ['esm'], async importModule() { return { apiVersion: 1, createComponent() { token.cancel(); return { dispose() { disposed += 1; } }; } }; } } });
  await assert.rejects(fixture.manager.load(requirement, { token, requestDownload: async () => true }), { code: 'CANCELLED' });
  assert.equal(disposed, 1);
  assert.ok(await fixture.manager.inspect(requirement));
});

test('detects damaged installed files before passing them to the runtime', async (t) => {
  const fixture = await createFixture(t);
  const handle = await fixture.manager.load(requirement, { requestDownload: async () => true });
  await handle.dispose();
  await writeFile(resolve(handle.directory, 'hello.mjs'), 'altered');
  const requests = fixture.calls.length;
  await assert.rejects(fixture.manager.load(requirement), { code: 'CORRUPT_INSTALL' });
  assert.equal(fixture.calls.length, requests);
});

test('rejects modules without the public factory interface', async (t) => {
  const fixture = await createFixture(t, { runtime: { formats: ['esm'], async importModule() { return { apiVersion: 1 }; } } });
  await assert.rejects(fixture.manager.load(requirement, { requestDownload: async () => true }), { code: 'LOAD_ERROR' });
});

test('preserves cancellation when a late instance also fails to dispose', async (t) => {
  const token = createCancellationToken();
  const fixture = await createFixture(t, { runtime: { formats: ['esm'], async importModule() { return { apiVersion: 1, createComponent() { token.cancel(); return { dispose() { throw new Error('cleanup failure'); } }; } }; } } });
  await assert.rejects(fixture.manager.load(requirement, { token, requestDownload: async () => true }), (error) => error.code === 'CANCELLED' && error.cleanupError.message === 'cleanup failure');
});

test('preserves the download error when installation-lock cleanup also fails', async (t) => {
  const fixture = await createFixture(t, { download: async () => { throw new Error('offline'); } });
  const originalRemove = fixture.storage.removeTree;
  fixture.storage.removeTree = async (path) => {
    if (path.includes('.locks')) throw new Error('lock cleanup failure');
    return originalRemove(path);
  };
  await assert.rejects(fixture.manager.load(requirement, { requestDownload: async () => true }), (error) => error.code === 'NETWORK_ERROR' && error.cleanupError.message === 'lock cleanup failure');
});

test('rejects runtime incompatibility before downloading payloads', async (t) => {
  const fixture = await createFixture(t, { runtime: { formats: ['quickjs-bytecode'], async importModule() { throw new Error('should not load'); } } });
  await assert.rejects(fixture.manager.load(requirement, { requestDownload: async () => true }), { code: 'INCOMPATIBLE_RUNTIME' });
  assert.equal(fixture.calls.filter((url) => url.endsWith('hello.mjs')).length, 0);
});

test('checking an update reports it without downloading or changing installed files', async (t) => {
  const fixture = await createFixture(t, { extraVersions: [{ id: 'hello', version: '0.2.0', manifest: 'catalog/components/hello/0.2.0/manifest.json' }] });
  const handle = await fixture.manager.load(requirement, { requestDownload: async () => true });
  const before = await readFile(resolve(handle.directory, 'manifest.json'), 'utf8');
  const downloaded = fixture.calls.filter((url) => url.endsWith('hello.mjs')).length;
  assert.deepEqual(await fixture.manager.checkUpdate(requirement), { id: 'hello', current: '0.1.0', latest: '0.2.0', available: true });
  assert.equal(fixture.calls.filter((url) => url.endsWith('hello.mjs')).length, downloaded);
  assert.equal(await readFile(resolve(handle.directory, 'manifest.json'), 'utf8'), before);
  await handle.dispose();
});

test('does not hold an installation lock while the user is deciding', async (t) => {
  const fixture = await createFixture(t);
  await assert.rejects(fixture.manager.load(requirement, { requestDownload: async () => {
    await mkdir(resolve(fixture.root, '.locks'), { recursive: true });
    assert.deepEqual(await readdir(resolve(fixture.root, '.locks')), []);
    return false;
  } }), { code: 'CANCELLED' });
});

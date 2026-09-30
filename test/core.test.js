import test from 'node:test';
import assert from 'node:assert/strict';
import { validateManifest, validateRequirement, validateRelativePath, assertCompatible, compareVersions, createCancellationToken } from '@falcon-components/core';
import { readFile } from 'node:fs/promises';

const valid = JSON.parse(await readFile(new URL('../catalog/components/hello/0.1.0/manifest.json', import.meta.url), 'utf8'));

test('rejects traversal, absolute paths and reserved manifest files', () => {
  for (const path of ['../x', '/x', 'C:/x', 'x\\y', 'x/../y', '.locks/x', 'x/%2e%2e', 'x\0y']) {
    assert.throws(() => validateRelativePath(path), { code: 'INVALID_PATH' });
  }
  assert.throws(() => validateManifest({ ...valid, files: [{ ...valid.files[0], path: 'manifest.json' }] }), { code: 'INVALID_MANIFEST' });
});

test('requires an exact stable version and sorts versions numerically', () => {
  for (const version of ['latest', '^0.1.0', '../x', '01.1.0', '0.1.0-beta', '9007199254740992.0.0']) {
    assert.throws(() => validateRequirement({ id: 'hello', version }), { code: 'INVALID_VERSION' });
  }
  assert.equal(compareVersions('0.10.0', '0.2.0'), 1);
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
});

test('rejects mismatched IDs, duplicate paths and file/directory collisions', () => {
  assert.throws(() => validateManifest(valid, { id: 'other', version: valid.version }), { code: 'MANIFEST_MISMATCH' });
  assert.throws(() => validateManifest({ ...valid, files: [...valid.files, ...valid.files] }), { code: 'INVALID_MANIFEST' });
  assert.throws(() => validateManifest({ ...valid, files: [...valid.files, { ...valid.files[0], path: 'hello.mjs/child' }] }), { code: 'INVALID_MANIFEST' });
});

test('checks bytecode configuration before accepting a component', () => {
  const bytecode = validateManifest({ ...valid, runtime: { format: 'quickjs-bytecode', apiVersion: 1, quickjsVersion: '20200705', bigNum: false } });
  assert.throws(() => assertCompatible(bytecode, { formats: ['quickjs-bytecode'], quickjsVersion: '20200906', bigNum: false }), { code: 'INCOMPATIBLE_RUNTIME' });
  assert.throws(() => assertCompatible(bytecode, { formats: ['quickjs-bytecode'], quickjsVersion: '20200705', bigNum: true }), { code: 'INCOMPATIBLE_RUNTIME' });
  assert.doesNotThrow(() => assertCompatible(bytecode, { formats: ['quickjs-bytecode'], quickjsVersion: '20200705', bigNum: false }));
});

test('cancellation is idempotent and one failing observer does not prevent another', () => {
  const token = createCancellationToken();
  let count = 0;
  token.onCancel(() => { throw new Error('observer'); });
  token.onCancel(() => { count += 1; });
  token.cancel();
  token.cancel();
  token.onCancel(() => { count += 1; });
  assert.equal(count, 2);
  assert.throws(() => token.throwIfCancelled(), { code: 'CANCELLED' });
});

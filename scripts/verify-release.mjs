import { readFile, lstat, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRelativePath, validateManifest } from '../packages/core/src/index.js';
import { verifyPayload, sha256, validateReleasePath } from './lib/release-signatures.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = resolve(process.argv[2] || 'artifacts/release');
// This key comes from the verifying host checkout, never from the downloaded bundle.
const trustedKey = JSON.parse(await readFile(resolve(process.argv[3] || resolve(root, 'trust/release-public-key.json')), 'utf8'));
async function regularBytes(path, maximum = 64 * 1024 * 1024) {
  validateReleasePath(path);
  let current = directory;
  for (const part of path.split('/')) {
    current = resolve(current, part);
    const stat = await lstat(current);
    if (stat.isSymbolicLink()) throw new Error('Symlink in signed release');
  }
  const stat = await lstat(current);
  if (!stat.isFile() || stat.size > maximum) throw new Error('Invalid signed release file');
  return readFile(current);
}
async function signedFile(path, purpose) {
  const envelope = JSON.parse((await regularBytes(`${path}.sig.json`, 512 * 1024)).toString('utf8'));
  const bytes = verifyPayload(envelope, { trustedKey, purpose });
  const file = await regularBytes(path, 256 * 1024);
  if (!file.equals(bytes)) throw new Error('Signed payload differs from release file');
  return JSON.parse(bytes.toString('utf8'));
}
const metadata = await signedFile('release-manifest.json', 'release');
if (metadata.schemaVersion !== 1 || metadata.repository !== 'Magniswan/falcon-components'
  || !/^[a-f0-9]{40}$/.test(metadata.commit) || !Array.isArray(metadata.files) || metadata.files.length > 4096) {
  throw new Error('Invalid release metadata');
}
const seen = new Set();
for (const file of metadata.files) {
  validateReleasePath(file.path);
  if (seen.has(file.path) || !Number.isSafeInteger(file.size) || file.size < 0 || file.size > 64 * 1024 * 1024
    || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error('Invalid release file record');
  seen.add(file.path);
  const bytes = await regularBytes(file.path);
  if (bytes.length !== file.size || sha256(bytes) !== file.sha256) throw new Error(`Release file mismatch: ${file.path}`);
}
async function checkContents(prefix = '') {
  for (const item of await readdir(resolve(directory, prefix), { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    validateReleasePath(path);
    if (item.isSymbolicLink()) throw new Error('Symlink in signed release');
    if (item.isDirectory()) await checkContents(path);
    else if (!item.isFile() || (!seen.has(path) && path !== 'release-manifest.json' && path !== 'release-manifest.json.sig.json')) {
      throw new Error(`Unlisted release file: ${path}`);
    }
  }
}
await checkContents();
for (const path of ['catalog/index.json', 'catalog/index.json.sig.json']) {
  if (!seen.has(path)) throw new Error('Release metadata does not bind the catalog');
}
const catalog = await signedFile('catalog/index.json', 'catalog');
if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.components) || catalog.components.length > 4096) throw new Error('Invalid signed catalog');
for (const item of catalog.components) {
  validateRelativePath(item.manifest);
  if (!seen.has(item.manifest) || !seen.has(`${item.manifest}.sig.json`)) throw new Error('Release metadata does not bind the component manifest');
  const bytes = await regularBytes(item.manifest, 256 * 1024);
  if (sha256(bytes) !== item.manifestSha256) throw new Error('Catalog manifest hash mismatch');
  const manifest = validateManifest(await signedFile(item.manifest, 'component-manifest'), item);
  for (const file of manifest.files) {
    const path = `${item.manifest.slice(0, item.manifest.lastIndexOf('/') + 1)}${file.path}`;
    const bytes = await regularBytes(path);
    if (bytes.length !== file.size || sha256(bytes) !== file.sha256) throw new Error('Signed component hash mismatch');
  }
}
console.log(`Signed release verified: ${metadata.version}, commit ${metadata.commit}, ${metadata.files.length} files.`);

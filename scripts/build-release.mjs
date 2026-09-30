import { readFile, writeFile, mkdir, lstat, readdir, realpath } from 'node:fs/promises';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { validateManifest, validateRelativePath } from '../packages/core/src/index.js';
import { sha256, signPayload, validateReleasePath } from './lib/release-signatures.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(`Release command failed: ${command}`);
  return result.stdout.trim();
}
function jsonBytes(value) { return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8'); }
async function walk(directory, base = directory) {
  const files = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, item.name);
    if (item.isSymbolicLink()) throw new Error('Release contains a symbolic link');
    if (item.isDirectory()) files.push(...await walk(path, base));
    else if (item.isFile()) files.push(relative(base, path).replaceAll('\\', '/'));
    else throw new Error('Release contains a special file');
  }
  return files.sort();
}

if (run('git', ['status', '--porcelain'])) throw new Error('Release requires a clean committed checkout');
const commit = run('git', ['rev-parse', 'HEAD']);
if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Invalid release commit');
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const tag = `v${pkg.version}`;
if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME !== tag) throw new Error('Tag does not match package version');
const trustedKey = JSON.parse(await readFile(resolve(root, 'trust/release-public-key.json'), 'utf8'));
let privateKeyPem = process.env.FALCON_COMPONENTS_SIGNING_PRIVATE_KEY;
if (!privateKeyPem && process.env.FALCON_COMPONENTS_SIGNING_KEY_FILE) {
  const keyPath = await realpath(process.env.FALCON_COMPONENTS_SIGNING_KEY_FILE);
  const rootPath = await realpath(root);
  const fromRoot = relative(rootPath, keyPath);
  if (fromRoot !== '..' && !fromRoot.startsWith(`..\\`) && !fromRoot.startsWith('../') && !isAbsolute(fromRoot)) throw new Error('Private signing key must stay outside the repository');
  privateKeyPem = await readFile(keyPath, 'utf8');
}
if (!privateKeyPem) throw new Error('Signing private key is not configured');
// Fail before creating any release output if the key and host trust anchor differ.
signPayload(Buffer.from('release-key-check'), { privateKeyPem, trustedKey, purpose: 'release' });
const output = resolve(root, 'artifacts', `release-${commit.slice(0, 12)}`);
try { await lstat(output); throw new Error('Release output already exists; use a fresh ignored artifacts directory'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
await mkdir(output, { recursive: true });
const bundle = resolve(output, 'bundle');
await mkdir(bundle);
const archive = resolve(output, 'source.tar');
run('git', ['-c', 'core.autocrlf=false', 'archive', '--format=tar', `--output=${archive}`, commit]);
run('tar', ['-xf', archive, '-C', bundle]);
for (const path of await walk(bundle)) {
  validateReleasePath(path);
  const bytes = await readFile(resolve(bundle, path));
  if (/-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/.test(bytes.toString('utf8'))) throw new Error('Private key material found in release source');
}
async function signFile(path, purpose) {
  const bytes = await readFile(resolve(bundle, path));
  const envelope = signPayload(bytes, { privateKeyPem, trustedKey, purpose });
  await writeFile(resolve(bundle, `${path}.sig.json`), jsonBytes(envelope), { flag: 'wx' });
  return sha256(bytes);
}
const catalogPath = resolve(bundle, 'catalog/index.json');
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.components)) throw new Error('Invalid release catalog');
for (const item of catalog.components) {
  validateRelativePath(item.manifest);
  const manifestPath = resolve(bundle, item.manifest);
  const manifest = validateManifest(JSON.parse(await readFile(manifestPath, 'utf8')), item);
  for (const file of manifest.files) {
    const bytes = await readFile(resolve(dirname(manifestPath), file.path));
    if (bytes.length !== file.size || sha256(bytes) !== file.sha256) throw new Error('Release component hash mismatch');
  }
  item.manifestSha256 = await signFile(item.manifest, 'component-manifest');
}
await writeFile(catalogPath, jsonBytes(catalog));
await signFile('catalog/index.json', 'catalog');
const files = [];
for (const path of await walk(bundle)) {
  const bytes = await readFile(resolve(bundle, path));
  files.push({ path, size: bytes.length, sha256: sha256(bytes) });
}
const metadata = { schemaVersion: 1, repository: 'Magniswan/falcon-components', version: pkg.version, commit, files };
await writeFile(resolve(bundle, 'release-manifest.json'), jsonBytes(metadata), { flag: 'wx' });
await signFile('release-manifest.json', 'release');
const archiveName = `falcon-components-${tag}.tar.gz`;
run('tar', ['-czf', resolve(output, archiveName), '-C', bundle, '.']);
const archiveBytes = await readFile(resolve(output, archiveName));
await writeFile(resolve(output, `${archiveName}.sig.json`), jsonBytes(signPayload(jsonBytes({
  schemaVersion: 1, repository: metadata.repository, version: pkg.version, commit,
  archive: { path: archiveName, size: archiveBytes.length, sha256: sha256(archiveBytes) },
}), { privateKeyPem, trustedKey, purpose: 'release' })), { flag: 'wx' });
await writeFile(resolve(output, 'SHA256SUMS'), `${sha256(archiveBytes)}  ${archiveName}\n`);
if (process.env.GITHUB_OUTPUT) await writeFile(process.env.GITHUB_OUTPUT, `directory=${output}\narchive=${archiveName}\nversion=${pkg.version}\n`, { flag: 'a' });
console.log(`Signed release built: ${tag}, commit ${commit}, key ${trustedKey.keyId}`);
console.log(`Output: ${output}`);

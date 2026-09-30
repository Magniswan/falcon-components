import { readFile, lstat } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyPayload, sha256, validateReleasePath } from './lib/release-signatures.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (!process.argv[2]) throw new Error('Usage: node scripts/verify-archive.mjs <archive> [host-public-key.json]');
const archivePath = resolve(process.argv[2]);
const keyPath = resolve(process.argv[3] || resolve(root, 'trust/release-public-key.json'));
const trustedKey = JSON.parse(await readFile(keyPath, 'utf8'));
const signaturePath = `${archivePath}.sig.json`;
if ((await lstat(signaturePath)).size > 512 * 1024) throw new Error('Oversized signature envelope');
const envelope = JSON.parse(await readFile(signaturePath, 'utf8'));
const metadata = JSON.parse(verifyPayload(envelope, { trustedKey, purpose: 'release' }).toString('utf8'));
if (metadata.schemaVersion !== 1 || metadata.repository !== 'Magniswan/falcon-components'
  || !/^[a-f0-9]{40}$/.test(metadata.commit) || !metadata.archive) throw new Error('Invalid signed archive metadata');
const file = metadata.archive;
validateReleasePath(file.path);
if (file.path !== basename(archivePath) || !Number.isSafeInteger(file.size) || file.size < 0
  || file.size > 128 * 1024 * 1024 || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error('Invalid signed archive record');
const stat = await lstat(archivePath);
if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== file.size) throw new Error('Signed archive size mismatch');
if (sha256(await readFile(archivePath)) !== file.sha256) throw new Error('Signed archive hash mismatch');
console.log(`Signed archive verified: ${metadata.version}, commit ${metadata.commit}, key ${trustedKey.keyId}`);
